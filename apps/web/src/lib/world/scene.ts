/**
 * The 3D world (Role 1): a low-poly terrain mesh with vertex colors, a water
 * plane, an orbit camera, a sculpting brush, cell picking, overlays, and
 * instanced animals. No sim or model logic lives here: the renderer draws the
 * heightmap, cover/confidence/OOD arrays and animal positions it is given.
 *
 * Performance notes (target: 30+ fps on a weak laptop):
 * - one vertex per cell (128 x 128 = 16k vertices, 32k triangles);
 * - flat shading computes normals in the fragment shader, so sculpting never
 *   recomputes normals; only the touched rows of the position and color
 *   buffers are re-uploaded (BufferAttribute.addUpdateRange);
 * - frames are rendered on demand (after a change or while the camera moves),
 *   except in auto-rotate mode;
 * - device pixel ratio is capped.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { DirtyRectBatcher } from './batcher.ts'
import { hexToRgb01, writeColors } from './colors.ts'
import type { OverlayMode, Rgb } from './colors.ts'
import { cellToWorldX, cellToWorldZ, heightToWorldY, nearestCell, worldToCellF } from './coords.ts'
import type { Frame } from './coords.ts'
import { applyBrush, padRect, sampleHeight } from './terrain.ts'
import type { BrushMode, DirtyRect } from './terrain.ts'

export type WorldTool = 'select' | BrushMode

export interface TerrainData {
  /** Heights in meters, row-major. The brush edits THIS array in place. */
  readonly heightmap: Float32Array
  readonly size: number
  readonly cellSizeM: number
  readonly waterLevelM: number
  /** Brush results are clamped to this range (the elevation training range). */
  readonly elevation: { readonly min: number; readonly max: number }
}

export interface OverlayData {
  readonly mode: OverlayMode
  readonly cover: Uint8Array | null
  readonly confidence: Float32Array | null
  readonly ood: Uint8Array | null
  readonly showOod: boolean
  /** '#rrggbb' per class index. */
  readonly classColors: readonly string[]
}

export interface BrushSettings {
  readonly tool: WorldTool
  /** Radius in cells. */
  readonly radius: number
  /** raise/lower: meters per second at the center; flatten: blend per second (0..1+). */
  readonly strength: number
}

export interface WorldRendererOptions {
  /** Pointer input (orbit, brush, picking). False for the decorative backdrop. */
  readonly interactive: boolean
  /** Slowly orbit the camera (backdrop). Ignored when `reducedMotion` is true. */
  readonly autoRotate?: boolean
  readonly reducedMotion?: boolean
  readonly maxPixelRatio?: number
  /** Called with the clicked cell (select tool). */
  readonly onPick?: (x: number, y: number) => void
  /** Debounced: the union of cells whose raw inputs may have changed. */
  readonly onHeightmapChange?: (rect: DirtyRect) => void
  /** Debounce for onHeightmapChange, ms. Default 250 (same as the app's batch debounce). */
  readonly changeDebounceMs?: number
}

/** Thrown when the browser cannot create a WebGL2 context. */
export class WorldUnavailableError extends Error {
  constructor(message = 'WebGL is not available in this browser.') {
    super(message)
    this.name = 'WorldUnavailableError'
  }
}

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = { antialias: true, alpha: false, powerPreference: 'low-power' }

/**
 * Create a canvas with a WebGL2 context (three r163+ requires WebGL2), or
 * null. The renderer reuses this context, so no throwaway probe context is
 * created (and three never logs its own "could not create context" error).
 */
function createContext(): { canvas: HTMLCanvasElement; context: WebGL2RenderingContext } | null {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES)
    return context ? { canvas, context } : null
  } catch {
    return null
  }
}

const HERBIVORE_HEX = '#e3e5e8'
const PREDATOR_HEX = '#c4a27f'
const CLICK_SLOP_PX = 5

export class WorldRenderer {
  readonly #host: HTMLElement
  readonly #opts: WorldRendererOptions
  readonly #renderer: THREE.WebGLRenderer
  readonly #scene = new THREE.Scene()
  readonly #camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000)
  readonly #controls: OrbitControls | null = null
  readonly #resize: ResizeObserver
  readonly #raycaster = new THREE.Raycaster()
  readonly #batcher: DirtyRectBatcher
  readonly #disposables: { dispose(): void }[] = []

  #terrain: TerrainData | null = null
  #frame: Frame | null = null
  #mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> | null = null
  #colors: Float32Array | null = null
  #water: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>
  #cursor: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>
  #selection: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>
  #selected: { x: number; y: number } | null = null
  #herbivores: THREE.InstancedMesh
  #predators: THREE.InstancedMesh
  #animalData: { herbivores: Float32Array | null; predators: Float32Array | null } = { herbivores: null, predators: null }
  #overlay: OverlayData = { mode: 'terrain', cover: null, confidence: null, ood: null, showOod: false, classColors: [] }
  #classRgb: Rgb[] = []
  #classColorHex: string[] = []
  #band = { min: 0, max: 1 }
  #unbindPointer: (() => void) | null = null
  #brush: BrushSettings = { tool: 'select', radius: 6, strength: 40 }

  #raf = 0
  #needsRender = true
  #lastTime = 0
  #angle = Math.PI * 0.15
  #destroyed = false

  // Pointer state
  #pointer = new THREE.Vector2()
  #pointerInside = false
  #down: { x: number; y: number; brushing: boolean; flattenTarget: number } | null = null

  constructor(host: HTMLElement, opts: WorldRendererOptions) {
    this.#host = host
    this.#opts = opts
    const gl = createContext()
    if (!gl) throw new WorldUnavailableError()
    try {
      this.#renderer = new THREE.WebGLRenderer({ ...CONTEXT_ATTRIBUTES, canvas: gl.canvas, context: gl.context })
    } catch (err) {
      throw new WorldUnavailableError(err instanceof Error ? err.message : undefined)
    }
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio ?? 1.5))
    this.#renderer.setClearColor(0x0d1013)
    host.appendChild(this.#renderer.domElement)

    this.#scene.fog = new THREE.Fog(0x0d1013, 180, 420)
    this.#scene.add(new THREE.HemisphereLight(0xdfe8ef, 0x2a2f2a, 1.4))
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2)
    sun.position.set(60, 120, 90) // from the south-east, high
    this.#scene.add(sun)

    // Water plane (sized/positioned in setTerrain).
    this.#water = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x2d5f73, transparent: true, opacity: 0.72, depthWrite: false }),
    )
    this.#water.renderOrder = 1
    this.#scene.add(this.#water)

    // Brush cursor and selection outline: draped line loops.
    this.#cursor = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf4f1e8, depthTest: false, transparent: true, opacity: 0.9 }))
    this.#cursor.renderOrder = 3
    this.#cursor.visible = false
    this.#selection = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }))
    this.#selection.renderOrder = 3
    this.#selection.visible = false
    this.#scene.add(this.#cursor, this.#selection)

    // Animals: instanced, capacity grows on demand.
    this.#herbivores = this.#makeAnimals(new THREE.BoxGeometry(0.7, 0.7, 0.7).translate(0, 0.35, 0), HERBIVORE_HEX, 64)
    this.#predators = this.#makeAnimals(new THREE.ConeGeometry(0.5, 1.4, 6).translate(0, 0.7, 0), PREDATOR_HEX, 16)

    this.#camera.position.set(0, 95, 125)
    if (opts.interactive) {
      const controls = new OrbitControls(this.#camera, this.#renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.12
      controls.minDistance = 20
      controls.maxDistance = 320
      controls.maxPolarAngle = Math.PI * 0.47
      controls.addEventListener('change', () => this.requestRender())
      this.#controls = controls
      this.#bindPointer()
    }

    this.#batcher = new DirtyRectBatcher(opts.changeDebounceMs ?? 250, (r) => opts.onHeightmapChange?.(r))

    this.#resize = new ResizeObserver(() => this.#onResize())
    this.#resize.observe(host)
    this.#onResize()
    this.#raf = requestAnimationFrame(this.#tick)
  }

  // ---- Public API -----------------------------------------------------------

  /** Replace the whole terrain (new seed, new size). Rebuilds the mesh. */
  setTerrain(t: TerrainData): void {
    if (t.heightmap.length !== t.size * t.size) throw new Error(`Heightmap has ${t.heightmap.length} cells; expected ${t.size * t.size}.`)
    this.#batcher.cancel()
    const rebuild = !this.#terrain || this.#terrain.size !== t.size
    this.#terrain = t
    let lo = Infinity
    let hi = -Infinity
    for (const h of t.heightmap) {
      if (h < lo) lo = h
      if (h > hi) hi = h
    }
    // Recenter only on rebuild/new terrain so sculpting never shifts the frame.
    this.#frame = { size: t.size, cellSizeM: t.cellSizeM, baseM: (lo + hi) / 2 }
    this.#band = { min: lo, max: hi }
    if (rebuild) this.#buildMesh(t.size)
    this.#refresh({ x0: 0, y0: 0, x1: t.size - 1, y1: t.size - 1 })
    this.#water.scale.set(t.size - 1, 1, t.size - 1) // exactly the mesh footprint
    this.setWaterLevel(t.waterLevelM)
    const d = t.size * 1.05
    if (rebuild) {
      this.#camera.position.set(0, d * 0.8, d)
      this.#camera.lookAt(0, 0, 0)
      this.#controls?.target.set(0, 0, 0)
      this.#controls?.update()
    }
    this.#placeAnimals()
    this.#placeSelection()
  }

  /** Call after the heightmap was changed outside the renderer. */
  refreshRegion(rect: DirtyRect): void {
    if (this.#terrain) this.#refresh(rect)
  }

  setWaterLevel(m: number): void {
    if (!this.#terrain || !this.#frame) return
    const changed = m !== this.#terrain.waterLevelM
    this.#terrain = { ...this.#terrain, waterLevelM: m }
    this.#water.position.y = heightToWorldY(m, this.#frame)
    this.#water.visible = m > this.#band.min
    // Underwater cells are tinted as riverbed: recolor everything.
    if (changed) this.#recolor({ x0: 0, y0: 0, x1: this.#terrain.size - 1, y1: this.#terrain.size - 1 })
    this.requestRender()
  }

  setOverlay(o: OverlayData): void {
    this.#overlay = o
    if (o.classColors.length !== this.#classRgb.length || o.classColors.some((c, i) => this.#classColorHex[i] !== c)) {
      this.#classColorHex = [...o.classColors]
      this.#classRgb = o.classColors.map(hexToRgb01)
    }
    if (this.#terrain) this.#recolor({ x0: 0, y0: 0, x1: this.#terrain.size - 1, y1: this.#terrain.size - 1 })
  }

  setSelection(cell: { x: number; y: number } | null): void {
    this.#selected = cell
    this.#placeSelection()
  }

  /** Interleaved [x0, y0, x1, y1, ...] in cell coordinates (getPositions). */
  setAnimals(herbivores: Float32Array | null, predators: Float32Array | null): void {
    this.#animalData = { herbivores, predators }
    this.#placeAnimals()
  }

  setBrush(b: BrushSettings): void {
    this.#brush = b
    this.#renderer.domElement.style.cursor = b.tool === 'select' ? 'pointer' : 'crosshair'
    this.#updateCursor()
  }

  requestRender(): void {
    this.#needsRender = true
  }

  /** Flush a pending onHeightmapChange immediately. */
  flushChanges(): void {
    this.#batcher.flush()
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    cancelAnimationFrame(this.#raf)
    this.#batcher.cancel()
    this.#resize.disconnect()
    this.#unbindPointer?.()
    this.#controls?.dispose()
    this.#scene.traverse((o) => {
      const m = o as Partial<THREE.Mesh>
      m.geometry?.dispose()
      const mat = m.material
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
    for (const d of this.#disposables) d.dispose()
    this.#renderer.dispose()
    this.#renderer.domElement.remove()
  }

  // ---- Internals --------------------------------------------------------------

  #makeAnimals(geo: THREE.BufferGeometry, hex: string, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: hex, flatShading: true }), capacity)
    mesh.count = 0
    mesh.frustumCulled = false
    this.#scene.add(mesh)
    return mesh
  }

  #buildMesh(size: number): void {
    if (this.#mesh) {
      this.#scene.remove(this.#mesh)
      this.#mesh.geometry.dispose()
      this.#mesh.material.dispose()
    }
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(size * size * 3)
    this.#colors = new Float32Array(size * size * 3)
    const index = new Uint32Array((size - 1) * (size - 1) * 6)
    let k = 0
    for (let y = 0; y < size - 1; y++)
      for (let x = 0; x < size - 1; x++) {
        const a = y * size + x
        const b = a + 1
        const c = a + size
        const d = c + 1
        index[k++] = a
        index[k++] = c
        index[k++] = b
        index[k++] = b
        index[k++] = c
        index[k++] = d
      }
    geo.setIndex(new THREE.BufferAttribute(index, 1))
    const posAttr = new THREE.BufferAttribute(pos, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    const colAttr = new THREE.BufferAttribute(this.#colors, 3)
    colAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', posAttr)
    geo.setAttribute('color', colAttr)
    this.#mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
    this.#scene.add(this.#mesh)
  }

  /** Update positions and colors in `rect` (plus a 1-cell border for colors). */
  #refresh(rect: DirtyRect): void {
    const t = this.#terrain
    const f = this.#frame
    const mesh = this.#mesh
    if (!t || !f || !mesh) return
    const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const pos = attr.array as Float32Array
    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const i = y * t.size + x
        pos[i * 3] = cellToWorldX(x, f)
        pos[i * 3 + 1] = heightToWorldY(t.heightmap[i], f)
        pos[i * 3 + 2] = cellToWorldZ(y, f)
      }
      attr.addUpdateRange((y * t.size + rect.x0) * 3, (rect.x1 - rect.x0 + 1) * 3)
    }
    attr.needsUpdate = true
    mesh.geometry.computeBoundingSphere()
    mesh.geometry.computeBoundingBox()
    // Terrain colors depend on the neighbour gradient: recolor one cell wider.
    this.#recolor(padRect(rect, 1, t.size))
  }

  #recolor(rect: DirtyRect): void {
    const t = this.#terrain
    const mesh = this.#mesh
    if (!t || !mesh || !this.#colors) return
    const o = this.#overlay
    writeColors(
      this.#colors,
      {
        size: t.size,
        heightmap: t.heightmap,
        waterLevelM: t.waterLevelM,
        band: this.#band,
        mode: o.mode,
        cover: o.cover && o.cover.length === t.size * t.size ? o.cover : null,
        confidence: o.confidence && o.confidence.length === t.size * t.size ? o.confidence : null,
        ood: o.ood && o.ood.length === t.size * t.size ? o.ood : null,
        showOod: o.showOod,
        classRgb: this.#classRgb,
      },
      rect,
    )
    const attr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    for (let y = rect.y0; y <= rect.y1; y++) attr.addUpdateRange((y * t.size + rect.x0) * 3, (rect.x1 - rect.x0 + 1) * 3)
    attr.needsUpdate = true
    this.requestRender()
  }

  #worldY(cx: number, cy: number): number {
    const t = this.#terrain!
    return heightToWorldY(sampleHeight(t.heightmap, t.size, cx, cy), this.#frame!)
  }

  #placeAnimals(): void {
    const t = this.#terrain
    const f = this.#frame
    if (!t || !f) return
    const m = new THREE.Matrix4()
    const place = (mesh: THREE.InstancedMesh, pts: Float32Array | null): THREE.InstancedMesh => {
      const n = pts ? pts.length >> 1 : 0
      if (n > mesh.instanceMatrix.count) {
        // Grow capacity (double) by replacing the mesh; geometry/material are reused.
        const bigger = new THREE.InstancedMesh(mesh.geometry, mesh.material, Math.max(n, mesh.instanceMatrix.count * 2))
        bigger.frustumCulled = false
        this.#scene.remove(mesh)
        mesh.dispose()
        this.#scene.add(bigger)
        mesh = bigger
      }
      for (let k = 0; k < n; k++) {
        const cx = pts![k * 2]
        const cy = pts![k * 2 + 1]
        m.makeTranslation(cellToWorldX(cx, f), Math.max(this.#worldY(cx, cy), heightToWorldY(t.waterLevelM, f)), cellToWorldZ(cy, f))
        mesh.setMatrixAt(k, m)
      }
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      return mesh
    }
    this.#herbivores = place(this.#herbivores, this.#animalData.herbivores)
    this.#predators = place(this.#predators, this.#animalData.predators)
    this.requestRender()
  }

  /** Fill a LineLoop with points draped over the terrain. */
  #drape(line: THREE.LineLoop, pts: [number, number][], lift: number): void {
    const f = this.#frame!
    const arr = new Float32Array(pts.length * 3)
    pts.forEach(([cx, cy], k) => {
      arr[k * 3] = cellToWorldX(cx, f)
      arr[k * 3 + 1] = Math.max(this.#worldY(cx, cy), heightToWorldY(this.#terrain!.waterLevelM, f)) + lift
      arr[k * 3 + 2] = cellToWorldZ(cy, f)
    })
    line.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    line.geometry.computeBoundingSphere()
  }

  #placeSelection(): void {
    const s = this.#selected
    if (!s || !this.#terrain) {
      this.#selection.visible = false
      this.requestRender()
      return
    }
    // Square around the cell, 4 points per side so it follows the slope.
    const pts: [number, number][] = []
    const r = 0.6
    for (let k = 0; k < 4; k++) pts.push([s.x - r + (2 * r * k) / 4, s.y - r])
    for (let k = 0; k < 4; k++) pts.push([s.x + r, s.y - r + (2 * r * k) / 4])
    for (let k = 0; k < 4; k++) pts.push([s.x + r - (2 * r * k) / 4, s.y + r])
    for (let k = 0; k < 4; k++) pts.push([s.x - r, s.y + r - (2 * r * k) / 4])
    this.#drape(this.#selection, pts, 0.15)
    this.#selection.visible = true
    this.requestRender()
  }

  #updateCursor(): void {
    const hit = this.#pointerInside && this.#brush.tool !== 'select' ? this.#hitCell() : null
    if (!hit) {
      if (this.#cursor.visible) {
        this.#cursor.visible = false
        this.requestRender()
      }
      return
    }
    const pts: [number, number][] = []
    const N = 48
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2
      pts.push([hit.x + Math.cos(a) * this.#brush.radius, hit.y + Math.sin(a) * this.#brush.radius])
    }
    this.#drape(this.#cursor, pts, 0.2)
    this.#cursor.visible = true
    this.requestRender()
  }

  /** Fractional cell under the pointer, or null. */
  #hitCell(): { x: number; y: number } | null {
    if (!this.#mesh || !this.#frame) return null
    this.#raycaster.setFromCamera(this.#pointer, this.#camera)
    const hit = this.#raycaster.intersectObject(this.#mesh, false)[0]
    if (!hit) return null
    return worldToCellF(hit.point.x, hit.point.z, this.#frame)
  }

  #bindPointer(): void {
    const el = this.#renderer.domElement
    el.style.touchAction = 'none'
    const setPointer = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      this.#pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    // Capture phase: runs before OrbitControls' own listener, so a brush
    // stroke can disable orbiting for this drag (right/middle still orbit/pan).
    const down = (e: PointerEvent) => {
      setPointer(e)
      const brushing = e.button === 0 && this.#brush.tool !== 'select'
      const hit = brushing ? this.#hitCell() : null
      if (brushing && hit && this.#controls) this.#controls.enabled = false
      const t = this.#terrain
      this.#down = {
        x: e.clientX,
        y: e.clientY,
        brushing: brushing && !!hit,
        flattenTarget: hit && t ? sampleHeight(t.heightmap, t.size, hit.x, hit.y) : 0,
      }
      if (this.#down.brushing) {
        try {
          el.setPointerCapture(e.pointerId) // keep sculpting when the drag leaves the canvas
        } catch {
          // Synthetic or already-released pointer: sculpting still works inside the canvas.
        }
      }
    }
    const move = (e: PointerEvent) => {
      setPointer(e)
      this.#pointerInside = true
      this.#updateCursor()
    }
    const up = (e: PointerEvent) => {
      const d = this.#down
      this.#down = null
      if (this.#controls) this.#controls.enabled = true
      if (!d) return
      if (d.brushing) {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
        return
      }
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y)
      if (e.button === 0 && moved < CLICK_SLOP_PX && this.#brush.tool === 'select' && this.#frame) {
        setPointer(e)
        const c = this.#hitCell()
        const cell = c ? nearestCell(c.x, c.y, this.#frame.size) : null
        if (cell) this.#opts.onPick?.(cell.x, cell.y)
      }
    }
    const leave = () => {
      this.#pointerInside = false
      this.#updateCursor()
    }
    el.addEventListener('pointerdown', down, { capture: true })
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', leave)
    this.#unbindPointer = () => {
      el.removeEventListener('pointerdown', down, { capture: true })
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', leave)
    }
  }

  /** One brush dab per frame while the button is held; strength is per second. */
  #sculpt(dt: number): void {
    const d = this.#down
    const t = this.#terrain
    if (!d?.brushing || !t) return
    const hit = this.#hitCell()
    if (!hit) return
    const b = this.#brush
    if (b.tool === 'select') return
    const rect = applyBrush(t.heightmap, t.size, {
      mode: b.tool,
      x: hit.x,
      y: hit.y,
      radius: b.radius,
      strength: b.tool === 'flatten' ? Math.min(1, b.strength * dt) : b.strength * dt,
      target: d.flattenTarget,
      min: t.elevation.min,
      max: t.elevation.max,
    })
    if (!rect) return
    this.#refresh(rect)
    // Raw inputs use central differences: neighbours of edited cells change too.
    this.#batcher.add(padRect(rect, 1, t.size))
    this.#updateCursor()
    this.#placeAnimals()
    this.#placeSelection()
  }

  #onResize(): void {
    const w = this.#host.clientWidth || 1
    const h = this.#host.clientHeight || 1
    this.#renderer.setSize(w, h, false)
    this.#camera.aspect = w / h
    this.#camera.updateProjectionMatrix()
    this.requestRender()
  }

  #tick = (now: number): void => {
    if (this.#destroyed) return
    this.#raf = requestAnimationFrame(this.#tick)
    const dt = this.#lastTime ? Math.min(0.1, (now - this.#lastTime) / 1000) : 0
    this.#lastTime = now
    this.#sculpt(dt)
    if (this.#opts.autoRotate && !this.#opts.reducedMotion && this.#terrain) {
      this.#angle += dt * 0.03
      const d = this.#terrain.size * 0.85
      this.#camera.position.set(Math.sin(this.#angle) * d, d * 0.55, Math.cos(this.#angle) * d)
      this.#camera.lookAt(0, 0, 0)
      this.#needsRender = true
    }
    if (this.#controls?.update()) this.#needsRender = true
    if (!this.#needsRender) return
    this.#needsRender = false
    this.#renderer.render(this.#scene, this.#camera)
  }
}
