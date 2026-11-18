/**
 * The 3D world (Role 1): a low-poly terrain mesh with vertex colors, water,
 * sky, vegetation and instanced animals, seen from an orbit camera (sculpt,
 * pick, overlays) or on foot in walk mode. No sim or model logic lives here:
 * the renderer draws the heightmap, cover/confidence/OOD arrays and animal
 * positions it is given. Both views read the SAME live arrays, so a brush
 * edit made in orbit view is what you walk on, with no reload.
 *
 * The pieces live in their own files; this class wires them together:
 *   palette.ts          every color
 *   terrainMaterial.ts  slope rock/dirt and shoreline blending
 *   water.ts, sky.ts    animated water, sky dome (sun, moon, stars, clouds)
 *   daynight.ts         cosmetic time of day (NOT the model's hillshade)
 *   vegetation.ts       seeded placement by cover class;  flora.ts  the meshes
 *   fauna.ts            animal meshes
 *   walk.ts             walk physics (getGroundHeight, speed, slope, water)
 *   quality.ts          presets and the frame-rate guard
 *   ambient.ts          the backdrop: vantage, continuous turn, idle cost, who draws
 *   pace.ts             animal pace on foot, and the measured speed
 *
 * One class, two uses. The Sandbox's `WorldView` makes an interactive one
 * (orbit view and walk mode). The page background makes an `ambient` one: the
 * walk look from a seeded vantage, slowly and endlessly turning, no input. Only
 * one of the two draws at a time (D14): `setActive(false)` stops a renderer's
 * frame loop and frees its plants and shadow map, and it keeps showing the
 * last frame it drew.
 *
 * Performance notes (target: 30+ fps on a weak laptop):
 * - one vertex per cell (128 x 128 = 16k vertices, 32k triangles);
 * - flat shading computes normals in the fragment shader, so sculpting only
 *   re-uploads the touched rows of the position, normal and color buffers;
 * - orbit view renders on demand (after a change or while the camera moves);
 *   walk mode and the day/night cycle render every frame; the ambient
 *   backdrop renders at most `fpsCap` frames a second;
 * - the shadow map is redrawn only when the sun, the terrain, the vegetation
 *   or the walker's neighbourhood changes, not every frame;
 * - vegetation is chunked: far chunks are hidden, the rest are frustum-culled;
 * - the device pixel ratio is capped by the quality preset.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

import { AMBIENT_PITCH, ambientYaw, findVantage, isDry, stepAmbientClock } from './ambient.ts'
import type { Vantage } from './ambient.ts'
import { DirtyRectBatcher } from './batcher.ts'
import { hexToRgb01, writeColors } from './colors.ts'
import type { OverlayMode, Rgb } from './colors.ts'
import { cellToWorldX, cellToWorldZ, heightToWorldY, nearestCell, VERTICAL_EXAGGERATION, worldToCellF } from './coords.ts'
import type { Frame } from './coords.ts'
import { advanceHour, dayState, wrapHour } from './daynight.ts'
import type { DayState } from './daynight.ts'
import { Fauna, ORBIT_ANIMAL_SCALE, WALK_ANIMAL_SCALE } from './fauna.ts'
import { Flora } from './flora.ts'
import { PaceMeter } from './pace.ts'
import { PALETTE } from './palette.ts'
import { DEFAULT_QUALITY, FpsGuard, QUALITY, TARGET_FPS } from './quality.ts'
import type { QualityPreset } from './quality.ts'
import { SkyDome } from './sky.ts'
import { applyBrush, padRect, sampleHeight } from './terrain.ts'
import type { BrushMode, DirtyRect } from './terrain.ts'
import { createTerrainMaterial } from './terrainMaterial.ts'
import type { TerrainUniforms } from './terrainMaterial.ts'
import { GRASS_RADIUS, placeGrass, placeVegetation } from './vegetation.ts'
import { DEFAULT_LOOK, eyeY, findSpawn, getGroundHeight, LOOK_SENSITIVITY_RANGE, settleWalker, stepWalk, WADE_DEPTH_M, WALK_FOV_DEFAULT, WALK_FOV_RANGE, yawToBearing } from './walk.ts'
import type { Blocked, ExitReason, LookSettings, WalkTerrain } from './walk.ts'

export { DEFAULT_LOOK, LOOK_SENSITIVITY_RANGE, WALK_FOV_DEFAULT, WALK_FOV_RANGE } from './walk.ts'
export type { ExitReason, LookSettings } from './walk.ts'
import { WaterSurface } from './water.ts'

export type WorldTool = 'select' | BrushMode
export type ViewMode = 'orbit' | 'walk'

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

/** Mouse-look state in walk mode. */
export type LookState =
  /** Pointer lock is available but not active: show "click to look". */
  | 'prompt'
  | 'locked'
  /** The browser refused the lock: arrow keys and dragging still look around. */
  | 'failed'
  /** No Pointer Lock API (for example a phone): touch drag and arrow keys. */
  | 'unsupported'

/** What the walk HUD needs. Emitted when it changes, at most about 10 times a second. */
export interface WalkStatus {
  /** True once the camera has arrived at eye level and input is live. */
  readonly active: boolean
  /** Cell under the walker (nearest cell center). */
  readonly cellX: number
  readonly cellY: number
  /** Exact position in fractional cell coordinates (for the minimap). */
  readonly x: number
  readonly y: number
  /** Compass bearing in degrees: 0 north, 90 east. */
  readonly bearing: number
  readonly wading: boolean
  readonly blocked: Blocked
  readonly look: LookState
}

export interface WorldStats {
  readonly fps: number
  readonly drawCalls: number
  readonly triangles: number
  readonly geometries: number
  readonly textures: number
  readonly programs: number
  readonly plants: number
  readonly visiblePlants: number
  readonly plantBatches: number
  readonly visiblePlantBatches: number
  readonly grassTufts: number
  readonly animals: number
  readonly pixelRatio: number
  readonly quality: QualityPreset
  readonly mode: ViewMode
  /** Median speed of the animals that moved since the last reading, cells per second (D16). */
  readonly animalSpeed: number
  /** False while this renderer is not the one drawing (D14). */
  readonly active: boolean
}

export interface WorldRendererOptions {
  /** Pointer input (orbit, brush, picking, walking). False for the backdrop. */
  readonly interactive: boolean
  /**
   * The page background (D14): the walk look from a seeded vantage on dry
   * land, at eye height, turning slowly and without end, with no travel. There is no
   * orbit view and no input in this mode.
   */
  readonly ambient?: boolean
  readonly reducedMotion?: boolean
  readonly maxPixelRatio?: number
  /** Draw at most this many frames a second (the backdrop: 30). */
  readonly fpsCap?: number
  /** Frame rate the guard reports under. Default `TARGET_FPS`. */
  readonly lowFpsTarget?: number
  /**
   * Sky, day/night, shadows, vegetation and the natural water. Defaults to
   * true for an interactive or ambient renderer.
   */
  readonly scenery?: boolean
  /** Called with the clicked cell (select tool) or the cell underfoot (walk mode, E). */
  readonly onPick?: (x: number, y: number) => void
  /** Debounced: the union of cells whose raw inputs may have changed. */
  readonly onHeightmapChange?: (rect: DirtyRect) => void
  /** Debounce for onHeightmapChange, ms. Default 250 (same as the app's batch debounce). */
  readonly changeDebounceMs?: number
  /** Walk mode wants to leave (Esc, or the pointer lock was released). */
  readonly onViewModeRequest?: (mode: ViewMode, reason: ExitReason) => void
  readonly onWalkStatus?: (status: WalkStatus) => void
  /** The frame rate stayed under TARGET_FPS for LOW_FPS_SECONDS while animating. */
  readonly onLowFps?: (fps: number) => void
  /** The auto-cycle moved the clock (reported every quarter hour of scene time). */
  readonly onHourChange?: (hour: number) => void
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

/**
 * PointerLockControls (three r187: it extends `Controls`, the camera is
 * `controls.object`), with one change: a refused lock is reported through
 * `onLockError` instead of an unhandled promise rejection, so walk mode can
 * fall back to the keyboard without a console error.
 */
class LookControls extends PointerLockControls {
  onLockError: (() => void) | null = null

  override lock(): void {
    const el = this.domElement as HTMLElement | null
    if (!el || typeof el.requestPointerLock !== 'function') {
      this.onLockError?.()
      return
    }
    try {
      const result = el.requestPointerLock() as unknown
      if (result instanceof Promise) result.catch(() => this.onLockError?.())
    } catch {
      this.onLockError?.()
    }
  }
}

const CLICK_SLOP_PX = 5
const ORBIT_FOV = 45
/** Mouse look under pointer lock, radians per pixel at sensitivity 1 (three's PointerLockControls default). */
const LOCKED_LOOK_SPEED = 0.002
const ORBIT_NEAR = 0.5
const WALK_NEAR = 0.05
/** Seconds for the camera to travel between the orbit view and eye level. */
const TRANSITION_S = 1.1
/** Arrow-key turn speed, radians per second. */
const KEY_TURN_SPEED = 1.9
/** Touch / unlocked-mouse look sensitivity, radians per pixel. */
const DRAG_LOOK_SPEED = 0.005
const MAX_PITCH = 1.45
/** Distance of the directional light from what it lights (world units). */
const LIGHT_DISTANCE = 260
/** The walk-mode shadow box is re-centered after the walker moves this far. */
const SHADOW_RECENTER = 6
const WALK_SHADOW_RADIUS = 52
/** Scene hours between shadow redraws while the day/night cycle runs. */
const SHADOW_HOUR_STEP = 0.03
/** Hours between `onHourChange` reports while the cycle runs. */
const HOUR_REPORT_STEP = 0.25
/** Ambient light floor while a data overlay is shown, so its colors stay readable at night. */
const OVERLAY_AMBIENT_FLOOR = 1.05

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

interface Pose {
  readonly pos: THREE.Vector3
  readonly quat: THREE.Quaternion
  readonly fov: number
}

interface Transition {
  t: number
  readonly dur: number
  readonly from: Pose
  readonly to: Pose
  /** Fog blend at the start and end: 0 = orbit distances, 1 = walk distances. */
  readonly fogFrom: number
  readonly fogTo: number
  readonly then: () => void
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
}

export class WorldRenderer {
  readonly #host: HTMLElement
  readonly #opts: WorldRendererOptions
  readonly #scenery: boolean
  readonly #renderer: THREE.WebGLRenderer
  readonly #scene = new THREE.Scene()
  readonly #camera = new THREE.PerspectiveCamera(ORBIT_FOV, 1, ORBIT_NEAR, 2000)
  readonly #controls: OrbitControls | null = null
  readonly #resize: ResizeObserver
  readonly #raycaster = new THREE.Raycaster()
  readonly #batcher: DirtyRectBatcher
  readonly #fog: THREE.Fog
  readonly #hemi: THREE.HemisphereLight
  readonly #sun: THREE.DirectionalLight
  readonly #water: WaterSurface
  readonly #sky: SkyDome | null = null
  readonly #flora: Flora
  readonly #fauna: Fauna
  readonly #terrainMaterial: THREE.MeshLambertMaterial
  readonly #terrainUniforms: TerrainUniforms
  readonly #guard: FpsGuard
  readonly #ambient: boolean
  readonly #pace = new PaceMeter()
  readonly #disposeTerrainMaterial: () => void
  readonly #scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ')

  #terrain: TerrainData | null = null
  #frame: Frame | null = null
  #mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> | null = null
  #colors: Float32Array | null = null
  #cursor: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>
  #selection: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>
  #selected: { x: number; y: number } | null = null
  #animalData: { herbivores: Float32Array | null; predators: Float32Array | null; stride: number } = { herbivores: null, predators: null, stride: 2 }
  #overlay: OverlayData = { mode: 'terrain', cover: null, confidence: null, ood: null, showOod: false, classColors: [] }
  #classRgb: Rgb[] = []
  #classColorHex: string[] = []
  #band = { min: 0, max: 1 }
  #unbindPointer: (() => void) | null = null
  #brush: BrushSettings = { tool: 'select', radius: 6, strength: 40 }

  // Environment
  #quality: QualityPreset = DEFAULT_QUALITY
  #hour = 10
  #autoCycle = false
  #day: DayState = dayState(10)
  #lastShadowHour = 10
  #lastReportedHour = 10
  #reducedMotion: boolean
  #seed = 0
  #floraDirty = true
  #shadowsDirty = true
  #shadowCenter = new THREE.Vector3()
  #time = 0

  // View mode
  #wantMode: ViewMode = 'orbit'
  #mode: ViewMode = 'orbit'
  #transition: Transition | null = null
  #fogBlend = 0
  #orbitPose: Pose | null = null
  #player: { x: number; z: number } | null = null
  #walkReady = false
  #eyeY = 0
  #keys = new Set<string>()
  #joystick = { strafe: 0, forward: 0 }
  #lookControls: LookControls | null = null
  #lookState: LookState = 'unsupported'
  #unbindWalk: (() => void) | null = null
  #lastStatus = ''
  #statusAt = 0
  #grassCenter: { x: number; y: number } | null = null
  #cullCenter: { x: number; y: number } | null = null

  #raf = 0
  #needsRender = true
  #lastTime = 0
  #destroyed = false

  // Who draws (D14)
  #active = true
  /** True while `renderStill()` draws its one frame. */
  #still = false
  #hasFrame = false
  #resizePending = false
  #unbindVisibility: (() => void) | null = null

  // Ambient backdrop (D14)
  #vantage: Vantage | null = null
  #ambientT = 0

  // Walk settings and what survives an exit (D15)
  #look: LookSettings = DEFAULT_LOOK
  #walkYaw: number | null = null

  // Pointer state (orbit view)
  #pointer = new THREE.Vector2()
  #pointerInside = false
  #down: { x: number; y: number; brushing: boolean; flattenTarget: number } | null = null

  constructor(host: HTMLElement, opts: WorldRendererOptions) {
    this.#host = host
    this.#opts = opts
    this.#ambient = !!opts.ambient
    this.#scenery = opts.scenery ?? (opts.interactive || this.#ambient)
    this.#reducedMotion = !!opts.reducedMotion
    this.#guard = new FpsGuard(opts.lowFpsTarget ?? TARGET_FPS)
    // The ambient view is a walk view nobody steers: natural ground, plants culled by distance, animals at ground scale.
    if (this.#ambient) this.#mode = 'walk'
    const gl = createContext()
    if (!gl) throw new WorldUnavailableError()
    try {
      this.#renderer = new THREE.WebGLRenderer({ ...CONTEXT_ATTRIBUTES, canvas: gl.canvas, context: gl.context })
    } catch (err) {
      throw new WorldUnavailableError(err instanceof Error ? err.message : undefined)
    }
    this.#renderer.setClearColor(PALETTE.backdrop.clear)
    // The shadow map is redrawn on request only (see #shadowsDirty).
    this.#renderer.shadowMap.enabled = this.#scenery
    this.#renderer.shadowMap.type = THREE.PCFShadowMap // soft (PCFSoftShadowMap was folded into it in r186)
    this.#renderer.shadowMap.autoUpdate = false
    host.appendChild(this.#renderer.domElement)

    this.#fog = new THREE.Fog(PALETTE.backdrop.fog, 180, 420)
    this.#scene.fog = this.#fog
    this.#hemi = new THREE.HemisphereLight(PALETTE.backdrop.ambientSky, PALETTE.backdrop.ambientGround, 1.4)
    this.#sun = new THREE.DirectionalLight(PALETTE.backdrop.light, 2.2)
    this.#sun.position.set(60, 120, 90) // from the south-east, high
    this.#scene.add(this.#hemi, this.#sun, this.#sun.target)

    const terrain = createTerrainMaterial()
    this.#terrainMaterial = terrain.material
    this.#terrainUniforms = terrain.uniforms
    this.#disposeTerrainMaterial = terrain.dispose

    this.#water = new WaterSurface()
    this.#water.applyFlat(PALETTE.backdrop.water)
    this.#scene.add(this.#water.mesh)

    if (this.#scenery) {
      this.#sky = new SkyDome()
      this.#scene.add(this.#sky.mesh)
    }
    this.#flora = new Flora(this.#scene)
    this.#fauna = new Fauna(this.#scene)

    // Brush cursor and selection outline: draped line loops.
    this.#cursor = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PALETTE.ui.brushCursor, depthTest: false, transparent: true, opacity: 0.9, fog: false }))
    this.#cursor.renderOrder = 3
    this.#cursor.visible = false
    this.#selection = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PALETTE.ui.selection, depthTest: false, fog: false }))
    this.#selection.renderOrder = 3
    this.#selection.visible = false
    this.#scene.add(this.#cursor, this.#selection)

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

    this.#batcher = new DirtyRectBatcher(opts.changeDebounceMs ?? 250, (r) => {
      // The ground moved: plants and shadows follow once the stroke pauses.
      this.#floraDirty = true
      this.#syncFlora()
      opts.onHeightmapChange?.(r)
    })

    if (this.#ambient) {
      this.#camera.near = WALK_NEAR
      this.#camera.fov = WALK_FOV_DEFAULT
      this.#fogBlend = 1
    }
    this.#flora.setSway(!this.#reducedMotion)
    this.#fauna.setSwing(!this.#reducedMotion)
    this.#applyQuality()
    this.#applyDay()
    this.#resize = new ResizeObserver(() => this.#onResize())
    this.#resize.observe(host)
    this.#onResize()

    // A hidden tab draws nothing (rAF already pauses there; this also resets the frame-rate guard).
    const doc = host.ownerDocument
    const onVisibility = () => {
      if (doc.hidden) this.#stopLoop()
      else this.#startLoop()
    }
    doc.addEventListener('visibilitychange', onVisibility)
    this.#unbindVisibility = () => doc.removeEventListener('visibilitychange', onVisibility)
    this.#startLoop()
  }

  // ---- Public API -----------------------------------------------------------

  /** Replace the whole terrain (new seed, new size). Rebuilds the mesh if the size changed. */
  setTerrain(t: TerrainData): void {
    if (t.heightmap.length !== t.size * t.size) throw new Error(`Heightmap has ${t.heightmap.length} cells; expected ${t.size * t.size}.`)
    this.#batcher.cancel()
    const rebuild = !this.#terrain || this.#terrain.size !== t.size
    const newGround = !this.#terrain || this.#terrain.heightmap !== t.heightmap
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
    this.setWaterLevel(t.waterLevelM)
    const d = t.size * 1.05
    if (rebuild) {
      this.#camera.position.set(0, d * 0.8, d)
      this.#camera.lookAt(0, 0, 0)
      this.#controls?.target.set(0, 0, 0)
      this.#controls?.update()
    }
    if (this.#ambient) {
      // A different world gets a new vantage; the same one keeps it while it stays dry.
      this.#standAmbient(newGround)
    } else if (newGround && this.#player) {
      // A different world (re-seed, opened world): the walker keeps their spot
      // if it is still a place to stand, else moves to the nearest dry cell (D15).
      const settled = settleWalker(this.#player.x, this.#player.z, this.#walkTerrain())
      this.#player = { x: settled.x, z: settled.z }
      if (this.#mode === 'walk') this.#placeWalker(true)
    }
    this.#floraDirty = true
    this.#syncFlora()
    this.#placeAnimals()
    this.#placeSelection()
    this.#applyMode()
  }

  /** Call after the heightmap was changed outside the renderer. */
  refreshRegion(rect: DirtyRect): void {
    if (!this.#terrain) return
    this.#refresh(rect)
    if (this.#ambient) this.#standAmbient(false)
    this.#floraDirty = true
    this.#syncFlora()
    this.#placeAnimals()
  }

  setWaterLevel(m: number): void {
    if (!this.#terrain || !this.#frame) return
    const changed = m !== this.#terrain.waterLevelM
    this.#terrain = { ...this.#terrain, waterLevelM: m }
    const y = heightToWorldY(m, this.#frame)
    this.#water.mesh.position.y = y
    this.#water.mesh.visible = m > this.#band.min
    this.#water.setDepths(this.#terrain.heightmap, this.#terrain.size, m)
    this.#terrainUniforms.uWaterY.value = this.#water.mesh.visible ? y : -1e6
    if (changed) {
      // Underwater cells are tinted as riverbed, and plants leave flooded cells.
      this.#recolor({ x0: 0, y0: 0, x1: this.#terrain.size - 1, y1: this.#terrain.size - 1 })
      if (this.#ambient) this.#standAmbient(false)
      this.#floraDirty = true
      this.#syncFlora()
      this.#placeAnimals()
    }
    this.requestRender()
  }

  setOverlay(o: OverlayData): void {
    const plantsChanged = o.cover !== this.#overlay.cover || o.ood !== this.#overlay.ood
    this.#overlay = o
    if (o.classColors.length !== this.#classRgb.length || o.classColors.some((c, i) => this.#classColorHex[i] !== c)) {
      this.#classColorHex = [...o.classColors]
      this.#classRgb = o.classColors.map(hexToRgb01)
    }
    if (this.#terrain) this.#recolor({ x0: 0, y0: 0, x1: this.#terrain.size - 1, y1: this.#terrain.size - 1 })
    if (plantsChanged) {
      this.#floraDirty = true
      this.#grassCenter = null
    }
    this.#syncFlora()
    this.#applyDay() // the ambient floor depends on the overlay
  }

  setSelection(cell: { x: number; y: number } | null): void {
    this.#selected = cell
    this.#placeSelection()
  }

  /**
   * Animal positions from the sim, in cell coordinates. `stride` 2 is
   * interleaved [x0, y0, x1, y1, ...]; 3 adds a heading per animal
   * ([x, y, heading, ...], `POSE_STRIDE` in packages/sim/herd).
   */
  setAnimals(herbivores: Float32Array | null, predators: Float32Array | null, stride = 2): void {
    this.#animalData = { herbivores, predators, stride: stride >= 3 ? 3 : 2 }
    this.#pace.sample(herbivores, predators, this.#animalData.stride, performance.now() / 1000)
    this.#placeAnimals()
  }

  setBrush(b: BrushSettings): void {
    this.#brush = b
    if (this.#mode === 'orbit') this.#renderer.domElement.style.cursor = b.tool === 'select' ? 'pointer' : 'crosshair'
    this.#updateCursor()
  }

  /** Orbit view or first-person walk mode (D8). The camera glides between them. */
  setMode(mode: ViewMode): void {
    this.#wantMode = mode
    this.#applyMode()
  }

  get mode(): ViewMode {
    return this.#mode
  }

  /** Quality preset (D12): vegetation density, shadows, draw distance, pixel-ratio cap. */
  setQuality(q: QualityPreset): void {
    if (q === this.#quality) return
    this.#quality = q
    this.#applyQuality()
  }

  /** Hour of day, 0..24 (D10). Cosmetic: lighting and colors only, never a model input. */
  setTimeOfDay(hour: number): void {
    const h = wrapHour(Number.isFinite(hour) ? hour : 10)
    // The cycle reports its own clock back; ignore the echo of that report.
    if (Math.abs(h - this.#lastReportedHour) < 1e-6 && this.#autoCycle) return
    this.#hour = h
    this.#lastReportedHour = h
    this.#applyDay()
  }

  /** Let the clock run by itself (one day per DAY_LENGTH_S). */
  setAutoCycle(on: boolean): void {
    if (on === this.#autoCycle) return
    this.#autoCycle = on
    this.#guard.reset()
    if (!on) this.#reportHour(true)
    this.requestRender()
  }

  get hour(): number {
    return this.#hour
  }

  setReducedMotion(on: boolean): void {
    this.#reducedMotion = on
    this.#flora.setSway(!on)
    this.#fauna.setSwing(!on)
    this.requestRender()
  }

  /** Mouse sensitivity, inverted look and field of view in walk mode (D15). Takes effect at once. */
  setLook(look: LookSettings): void {
    const clamp = (v: number, lo: number, hi: number, fallback: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)
    this.#look = {
      sensitivity: clamp(look.sensitivity, LOOK_SENSITIVITY_RANGE.min, LOOK_SENSITIVITY_RANGE.max, DEFAULT_LOOK.sensitivity),
      invertY: !!look.invertY,
      fov: clamp(look.fov, WALK_FOV_RANGE.min, WALK_FOV_RANGE.max, DEFAULT_LOOK.fov),
    }
    // On foot and not mid-glide: the view changes now. Otherwise the next glide ends on it.
    if (!this.#ambient && this.#mode === 'walk' && !this.#transition) {
      this.#camera.fov = this.#look.fov
      this.#camera.updateProjectionMatrix()
      this.requestRender()
    }
  }

  /**
   * Whether this renderer is the one drawing (D14). Only one draws at a time.
   * Inactive: the frame loop stops, the plants, the grass and the shadow map
   * are freed, and the canvas keeps showing the last frame. Active again: they
   * are rebuilt and the loop restarts.
   */
  setActive(on: boolean): void {
    if (on === this.#active || this.#destroyed) return
    this.#active = on
    if (on) {
      if (this.#resizePending) this.#applyResize()
      this.#floraDirty = true
      this.#grassCenter = null
      this.#cullCenter = null
      this.#syncFlora()
      this.#cullFlora()
      if (this.#mode === 'walk' && this.#walkReady) this.#syncGrass(true)
      this.#shadowsDirty = true
      this.#guard.reset()
      this.requestRender()
      this.#startLoop()
    } else {
      this.#stopLoop()
      this.#batcher.flush()
      this.#freeScenery()
    }
  }

  get active(): boolean {
    return this.#active
  }

  /**
   * Draw ONE frame while inactive, so the still this renderer shows matches
   * the world (new terrain, a new cover map, another time of day). The plants
   * are built for that frame and freed again straight after it.
   */
  renderStill(): void {
    if (this.#destroyed || this.#active || !this.#terrain) return
    if (this.#resizePending) this.#applyResize()
    this.#still = true
    try {
      this.#floraDirty = true
      this.#cullCenter = null
      this.#syncFlora()
      this.#cullFlora()
      this.#placeAnimals()
      this.#shadowsDirty = true
      this.#render()
    } finally {
      this.#still = false
      this.#freeScenery()
    }
  }

  /** World seed for vegetation placement: the same seed and cover map give the same forest. */
  setSeed(seed: number): void {
    const s = Number.isFinite(seed) ? Math.trunc(seed) | 0 : 0
    if (s === this.#seed) return
    this.#seed = s
    if (this.#ambient) this.#standAmbient(true)
    this.#floraDirty = true
    this.#grassCenter = null
    this.#syncFlora()
  }

  /** On-screen joystick (touch): -1..1 each. Added to the WASD keys. */
  setMoveInput(strafe: number, forward: number): void {
    this.#joystick = { strafe: Number.isFinite(strafe) ? strafe : 0, forward: Number.isFinite(forward) ? forward : 0 }
  }

  /** Walk mode: open the Site Probe for the cell underfoot (same event as an orbit click). */
  probeUnderfoot(): void {
    const c = this.#walkerCell()
    if (c) this.#opts.onPick?.(c.x, c.y)
  }

  requestRender(): void {
    this.#needsRender = true
  }

  /** Flush a pending onHeightmapChange immediately. */
  flushChanges(): void {
    this.#batcher.flush()
  }

  /** Counts for the performance readout (D12). Draw calls and triangles are for the last frame drawn. */
  stats(): WorldStats {
    const info = this.#renderer.info
    const f = this.#flora.stats()
    return {
      fps: this.#guard.fps,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      plants: f.plants,
      visiblePlants: f.visiblePlants,
      plantBatches: f.batches,
      visiblePlantBatches: f.visibleBatches,
      grassTufts: f.grassTufts,
      animals: this.#fauna.count,
      pixelRatio: this.#renderer.getPixelRatio(),
      quality: this.#quality,
      mode: this.#mode,
      animalSpeed: this.#pace.read(),
      active: this.#active,
    }
  }

  /** Draw a frame now and return it as a PNG data URL (photo mode, tests). */
  capture(): string {
    this.#render()
    return this.#renderer.domElement.toDataURL('image/png')
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#stopLoop()
    this.#unbindVisibility?.()
    this.#batcher.cancel()
    this.#resize.disconnect()
    this.#unbindPointer?.()
    this.#leaveWalkInput()
    this.#controls?.dispose()
    this.#flora.dispose()
    this.#fauna.dispose()
    this.#water.dispose()
    this.#sky?.dispose()
    this.#sun.shadow.map?.dispose()
    this.#mesh?.geometry.dispose()
    this.#disposeTerrainMaterial() // the material and its ground detail texture
    for (const line of [this.#cursor, this.#selection]) {
      line.geometry.dispose()
      line.material.dispose()
    }
    this.#scene.clear()
    this.#renderer.dispose()
    this.#renderer.domElement.remove()
  }

  // ---- Environment: quality, time of day, shadows --------------------------------

  #applyQuality(): void {
    const q = QUALITY[this.#quality]
    const ratio = Math.min(window.devicePixelRatio || 1, this.#opts.maxPixelRatio ?? Infinity, this.#scenery ? q.pixelRatioCap : 1.5)
    if (ratio !== this.#renderer.getPixelRatio()) {
      this.#renderer.setPixelRatio(ratio)
      this.#onResize()
    }
    this.#sky?.setClouds(q.clouds)
    const shadows = this.#scenery && q.shadowMapSize > 0
    this.#sun.castShadow = shadows
    if (shadows && this.#sun.shadow.mapSize.x !== q.shadowMapSize) {
      this.#sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize)
      this.#sun.shadow.map?.dispose()
      this.#sun.shadow.map = null
    }
    if (this.#mesh) {
      this.#mesh.castShadow = shadows
      this.#mesh.receiveShadow = shadows
    }
    this.#flora.setCastShadow(shadows)
    this.#applyFog()
    this.#floraDirty = true
    this.#grassCenter = null
    this.#cullCenter = null
    this.#syncFlora()
    this.#shadowsDirty = true
    this.#guard.reset()
    this.requestRender()
  }

  /** Light and color the scene for the current hour. */
  #applyDay(): void {
    if (!this.#scenery) return
    const s = dayState(this.#hour)
    this.#day = s
    this.#hemi.color.setRGB(...s.ambientSky)
    this.#hemi.groundColor.setRGB(...s.ambientGround)
    // A data overlay must stay readable at night: its colors are the legend.
    const dataOverlay = !this.#naturalView() && this.#overlay.mode !== 'terrain'
    this.#hemi.intensity = dataOverlay ? Math.max(s.ambientIntensity, OVERLAY_AMBIENT_FLOOR) : s.ambientIntensity
    this.#sun.color.setRGB(...s.lightColor)
    this.#sun.intensity = s.lightIntensity
    this.#fog.color.setRGB(...s.fog)
    this.#renderer.setClearColor(this.#fog.color)
    this.#sky?.apply(s)
    this.#water.apply(s)
    this.#shadowsDirty = true
    this.#lastShadowHour = this.#hour
    this.requestRender()
  }

  /** Fog distances: far and thin in orbit view, tied to the draw distance on foot. */
  #applyFog(): void {
    if (!this.#scenery) return
    const size = this.#terrain?.size ?? 128
    const draw = QUALITY[this.#quality].drawDistance
    const k = this.#fogBlend
    this.#fog.near = size * 2 * (1 - k) + draw * 0.45 * k
    this.#fog.far = size * 7 * (1 - k) + draw * 1.05 * k
  }

  /** Fit the shadow box: the whole map in orbit view, the walker's surroundings on foot. */
  #updateShadows(): void {
    const sun = this.#sun
    const size = this.#terrain?.size ?? 128
    const walking = this.#mode === 'walk' && this.#player
    const radius = walking ? Math.min(WALK_SHADOW_RADIUS, QUALITY[this.#quality].drawDistance) : size * 0.74
    if (walking) this.#shadowCenter.set(Math.round(this.#player!.x / 2) * 2, 0, Math.round(this.#player!.z / 2) * 2)
    else this.#shadowCenter.set(0, 0, 0)
    const [dx, dy, dz] = this.#scenery ? this.#day.lightDir : [0.37, 0.74, 0.56]
    sun.target.position.copy(this.#shadowCenter)
    sun.position.set(this.#shadowCenter.x + dx * LIGHT_DISTANCE, dy * LIGHT_DISTANCE, this.#shadowCenter.z + dz * LIGHT_DISTANCE)
    sun.target.updateMatrixWorld()
    if (!sun.castShadow) return
    const cam = sun.shadow.camera
    cam.left = -radius
    cam.right = radius
    cam.top = radius
    cam.bottom = -radius
    // Depth range: everything within `radius` of the center plus the relief.
    const reach = radius * 1.6 + 30
    cam.near = Math.max(1, LIGHT_DISTANCE - reach)
    cam.far = LIGHT_DISTANCE + reach
    cam.updateProjectionMatrix()
    const texel = (2 * radius) / sun.shadow.mapSize.x
    sun.shadow.normalBias = texel * 2.2
    sun.shadow.bias = -0.0004
    this.#renderer.shadowMap.needsUpdate = true
  }

  #reportHour(force: boolean): void {
    const moved = Math.abs(this.#hour - this.#lastReportedHour)
    if (!force && Math.min(moved, 24 - moved) < HOUR_REPORT_STEP) return
    this.#lastReportedHour = this.#hour
    this.#opts.onHourChange?.(this.#hour)
  }

  #stepCycle(dt: number): void {
    if (!this.#autoCycle || !this.#scenery || dt <= 0) return
    // Behind the pages, reduced motion freezes the clock at its current value (D14).
    if (this.#ambient && this.#reducedMotion) return
    this.#hour = advanceHour(this.#hour, dt)
    // Colors follow every frame; the shadow map is redrawn in small steps.
    const wasDirty = this.#shadowsDirty
    const shadowHour = this.#lastShadowHour
    const moved = Math.abs(this.#hour - shadowHour)
    this.#applyDay()
    if (Math.min(moved, 24 - moved) < SHADOW_HOUR_STEP) {
      this.#shadowsDirty = wasDirty
      this.#lastShadowHour = shadowHour
    }
    this.#reportHour(false)
  }

  // ---- Vegetation -------------------------------------------------------------

  /** Walk mode (and the camera's trip to and from it) always shows the natural landscape. */
  #naturalView(): boolean {
    return this.#scenery && (this.#mode === 'walk' || this.#transition !== null)
  }

  #cover(): Uint8Array | null {
    const t = this.#terrain
    const c = this.#overlay.cover
    return t && c && c.length === t.size * t.size ? c : null
  }

  /** Plants are drawn on foot, and in orbit view under the natural "Terrain" overlay. */
  #floraWanted(): boolean {
    // An inactive renderer holds no plants (D14), except for the one frame of a still.
    if (!this.#active && !this.#still) return false
    return this.#scenery && !!this.#terrain && !!this.#cover() && (this.#naturalView() || this.#overlay.mode === 'terrain')
  }

  /** Free what an inactive renderer must not hold: plants, grass and the shadow map (D14). */
  #freeScenery(): void {
    this.#flora.dispose()
    this.#floraDirty = true
    this.#grassCenter = null
    this.#cullCenter = null
    this.#sun.shadow.map?.dispose()
    this.#sun.shadow.map = null
  }

  #syncFlora(): void {
    const t = this.#terrain
    const f = this.#frame
    if (!t || !f) return
    if (!this.#floraWanted()) {
      // Not shown: free the meshes instead of keeping them hidden (D12).
      if (this.#flora.hasPlants) {
        this.#flora.dispose()
        this.#shadowsDirty = true
        this.requestRender()
      }
      this.#floraDirty = true
      return
    }
    if (!this.#floraDirty && this.#flora.hasPlants) return
    this.#floraDirty = false
    const batches = placeVegetation({
      size: t.size,
      cellSizeM: t.cellSizeM,
      heightmap: t.heightmap,
      waterLevelM: t.waterLevelM,
      cover: this.#cover()!,
      ood: this.#overlay.ood,
      seed: this.#seed,
      density: QUALITY[this.#quality].vegetationDensity,
    })
    this.#flora.setPlants(batches, t.heightmap, f)
    this.#flora.setCastShadow(this.#sun.castShadow)
    this.#cullCenter = null
    this.#cullFlora()
    this.#shadowsDirty = true
    this.requestRender()
  }

  /** Distance culling: on foot, chunks beyond the draw distance are dropped. */
  #cullFlora(): void {
    const f = this.#frame
    if (!f) return
    if (this.#mode !== 'walk' || !this.#player) {
      this.#flora.cull(null, 0)
      this.#cullCenter = null
      return
    }
    const c = worldToCellF(this.#player.x, this.#player.z, f)
    if (this.#cullCenter && Math.hypot(c.x - this.#cullCenter.x, c.y - this.#cullCenter.y) < 1) return
    this.#cullCenter = c
    this.#flora.cull(c, QUALITY[this.#quality].drawDistance)
  }

  /** Grass tufts around the walker, re-placed as they move. */
  #syncGrass(force: boolean): void {
    const t = this.#terrain
    const f = this.#frame
    const p = this.#player
    // No grass in the ambient view (its preset has none) or while inactive.
    if (!t || !f || !p || this.#mode !== 'walk' || this.#ambient || !this.#active) return
    const c = worldToCellF(p.x, p.z, f)
    if (!force && this.#grassCenter && Math.hypot(c.x - this.#grassCenter.x, c.y - this.#grassCenter.y) < GRASS_RADIUS * 0.2) return
    this.#grassCenter = c
    const tufts = placeGrass({
      size: t.size,
      cellSizeM: t.cellSizeM,
      heightmap: t.heightmap,
      waterLevelM: t.waterLevelM,
      cover: this.#cover(),
      ood: this.#overlay.ood,
      seed: this.#seed,
      perCell: QUALITY[this.#quality].grassPerCell,
      centerX: c.x,
      centerY: c.y,
    })
    this.#flora.setGrass(tufts, t.heightmap, f)
  }

  // ---- View modes (D8) -----------------------------------------------------------

  #walkTerrain(): WalkTerrain {
    const t = this.#terrain!
    return { heightmap: t.heightmap, size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM }
  }

  #waterY(): number {
    return this.#water.mesh.visible ? this.#water.mesh.position.y : -1e6
  }

  #walkerCell(): { x: number; y: number } | null {
    if (!this.#player || !this.#frame) return null
    const c = worldToCellF(this.#player.x, this.#player.z, this.#frame)
    const size = this.#frame.size
    return { x: Math.min(size - 1, Math.max(0, Math.round(c.x))), y: Math.min(size - 1, Math.max(0, Math.round(c.y))) }
  }

  /** Put the walker on valid ground. `snap` also moves the camera there at once. */
  #placeWalker(snap: boolean): void {
    const f = this.#frame
    if (!f) return
    const wt = this.#walkTerrain()
    if (!this.#player) {
      const want = this.#controls?.target ?? new THREE.Vector3()
      this.#player = findSpawn(want.x, want.z, wt)
    } else {
      // The ground or the water may have changed since they last stood here (D15):
      // never start in deep water, never outside the map.
      const settled = settleWalker(this.#player.x, this.#player.z, wt)
      this.#player = { x: settled.x, z: settled.z }
    }
    const step = stepWalk(this.#player.x, this.#player.z, { forward: 0, strafe: 0, run: false, yaw: 0 }, 0, wt)
    this.#player = { x: step.x, z: step.z }
    this.#eyeY = eyeY(heightToWorldY(step.groundM, f), this.#waterY())
    if (snap) this.#camera.position.set(step.x, this.#eyeY, step.z)
    this.#grassCenter = null
    this.#cullCenter = null
    this.#shadowsDirty = true
  }

  /**
   * Ambient backdrop (D14): stand the camera on its vantage, at eye height on
   * the live ground. `recompute` picks a new vantage (a new world or seed);
   * otherwise the vantage is kept unless the water reached it.
   */
  #standAmbient(recompute: boolean): void {
    const f = this.#frame
    if (!f || !this.#terrain) return
    const wt = this.#walkTerrain()
    if (recompute || !this.#vantage || !isDry(this.#vantage.x, this.#vantage.z, wt)) this.#vantage = findVantage(wt, this.#seed)
    const v = this.#vantage
    this.#player = { x: v.x, z: v.z }
    this.#eyeY = eyeY(heightToWorldY(getGroundHeight(v.x, v.z, wt), f), this.#waterY())
    this.#camera.position.set(v.x, this.#eyeY, v.z)
    this.#aimAmbient()
    this.#applyFog()
    this.#cullCenter = null
    this.#cullFlora()
    this.#shadowsDirty = true
    this.requestRender()
  }

  /** The slow, continuous turn (D19): only the heading moves. Frozen with reduced motion. */
  #aimAmbient(): void {
    if (!this.#vantage) return
    this.#scratchEuler.set(AMBIENT_PITCH, ambientYaw(this.#vantage.yaw, this.#ambientT), 0, 'YXZ')
    this.#camera.quaternion.setFromEuler(this.#scratchEuler)
  }

  #applyMode(): void {
    if (!this.#opts.interactive || !this.#terrain || !this.#frame || this.#wantMode === this.#mode) return
    if (this.#wantMode === 'walk') this.#enterWalk()
    else this.#exitWalk()
  }

  #pose(): Pose {
    return { pos: this.#camera.position.clone(), quat: this.#camera.quaternion.clone(), fov: this.#camera.fov }
  }

  #startTransition(to: Pose, fogTo: number, then: () => void): void {
    const dur = this.#reducedMotion ? 0 : TRANSITION_S
    this.#transition = { t: 0, dur, from: this.#pose(), to, fogFrom: this.#fogBlend, fogTo, then }
    if (dur === 0) this.#stepTransition(0)
    this.requestRender()
  }

  #stepTransition(dt: number): void {
    const tr = this.#transition
    if (!tr) return
    tr.t = tr.dur > 0 ? Math.min(1, tr.t + dt / tr.dur) : 1
    const k = tr.t * tr.t * (3 - 2 * tr.t)
    this.#camera.position.lerpVectors(tr.from.pos, tr.to.pos, k)
    this.#camera.quaternion.slerpQuaternions(tr.from.quat, tr.to.quat, k)
    this.#camera.fov = tr.from.fov + (tr.to.fov - tr.from.fov) * k
    this.#camera.updateProjectionMatrix()
    this.#fogBlend = tr.fogFrom + (tr.fogTo - tr.fogFrom) * k
    this.#applyFog()
    this.#needsRender = true
    if (tr.t >= 1) {
      this.#transition = null
      tr.then()
    }
  }

  #enterWalk(): void {
    // Remember where the orbit camera was (unless it is already on its way back there).
    if (!this.#transition || !this.#orbitPose) this.#orbitPose = this.#pose()
    this.#mode = 'walk'
    this.#walkReady = false
    this.#down = null
    if (this.#controls) this.#controls.enabled = false
    this.#cursor.visible = false
    this.#renderer.domElement.style.cursor = 'default'

    this.#placeWalker(false)
    const p = this.#player!
    // Face the way they faced when they last left (D15); the first time, the way the orbit camera looks.
    const target = this.#controls?.target ?? new THREE.Vector3()
    const dir = new THREE.Vector3().subVectors(target, this.#orbitPose.pos)
    const yaw = this.#walkYaw ?? (Math.hypot(dir.x, dir.z) > 1e-3 ? Math.atan2(-dir.x, -dir.z) : 0)
    const to: Pose = {
      pos: new THREE.Vector3(p.x, this.#eyeY, p.z),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.06, yaw, 0, 'YXZ')),
      fov: this.#look.fov,
    }
    this.#camera.near = WALK_NEAR
    this.#camera.updateProjectionMatrix()
    this.#water.setDeepLine(true, WADE_DEPTH_M)
    this.#startTransition(to, 1, () => {
      this.#walkReady = true
      this.#bindWalkInput()
      this.#syncGrass(true)
      this.#emitStatus(true)
    })
    // The natural landscape appears as the camera starts to descend.
    this.#enterNaturalView()
    this.#guard.reset()
  }

  #exitWalk(): void {
    // The walker's position (#player) and heading survive the exit, so "Resume" returns to the same spot.
    if (this.#walkReady) this.#walkYaw = new THREE.Euler().setFromQuaternion(this.#camera.quaternion, 'YXZ').y
    this.#mode = 'orbit'
    this.#walkReady = false
    this.#leaveWalkInput()
    this.#water.setDeepLine(false, WADE_DEPTH_M)
    this.#emitStatus(true)
    const back = this.#orbitPose ?? this.#pose()
    this.#flora.cull(null, 0)
    this.#cullCenter = null
    this.#shadowsDirty = true
    this.#placeAnimals()
    this.#startTransition({ pos: back.pos.clone(), quat: back.quat.clone(), fov: ORBIT_FOV }, 0, () => {
      this.#camera.near = ORBIT_NEAR
      this.#camera.fov = ORBIT_FOV
      this.#camera.updateProjectionMatrix()
      this.#orbitPose = null
      if (this.#controls) {
        this.#controls.enabled = true
        this.#controls.update()
      }
      this.#renderer.domElement.style.cursor = this.#brush.tool === 'select' ? 'pointer' : 'crosshair'
      // Walk-only resources go; the overlay the viewer had chosen comes back.
      this.#flora.disposeGrass()
      this.#grassCenter = null
      this.#leaveNaturalView()
    })
  }

  #enterNaturalView(): void {
    const t = this.#terrain
    if (t) this.#recolor({ x0: 0, y0: 0, x1: t.size - 1, y1: t.size - 1 })
    this.#syncFlora()
    this.#cullFlora()
    this.#placeAnimals()
    this.#applyDay()
  }

  #leaveNaturalView(): void {
    const t = this.#terrain
    if (t) this.#recolor({ x0: 0, y0: 0, x1: t.size - 1, y1: t.size - 1 })
    this.#syncFlora()
    this.#applyDay()
  }

  /** Turn the camera by a yaw / pitch change (radians), keeping it level. */
  #lookBy(dyaw: number, dpitch: number): void {
    const e = new THREE.Euler().setFromQuaternion(this.#camera.quaternion, 'YXZ')
    e.y += dyaw
    e.x = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, e.x + dpitch))
    e.z = 0
    this.#camera.quaternion.setFromEuler(e)
  }

  #bindWalkInput(): void {
    this.#leaveWalkInput()
    const el = this.#renderer.domElement
    const doc = el.ownerDocument
    el.style.touchAction = 'none'

    const requestOrbit = (reason: ExitReason) => {
      if (this.#opts.onViewModeRequest) this.#opts.onViewModeRequest('orbit', reason)
      else this.setMode('orbit')
    }

    // Mouse look: PointerLockControls. `lock()` needs a user gesture and can be
    // refused, so the HUD shows "click to look" first and falls back to keys.
    const look = new LookControls(this.#camera, el)
    look.minPolarAngle = Math.PI / 2 - MAX_PITCH
    look.maxPolarAngle = Math.PI / 2 + MAX_PITCH
    // The addon only handles the lock itself here. The turning is done below
    // (`lockedMove`), so sensitivity and inverted look apply (D15).
    look.pointerSpeed = 0
    const lockedMove = (e: MouseEvent) => {
      if (this.#lookControls !== look || !look.isLocked) return
      const k = LOCKED_LOOK_SPEED * this.#look.sensitivity
      this.#lookBy(-e.movementX * k, (this.#look.invertY ? 1 : -1) * e.movementY * k)
    }
    doc.addEventListener('mousemove', lockedMove)
    this.#lookControls = look
    const supported = typeof el.requestPointerLock === 'function' && 'pointerLockElement' in doc
    this.#lookState = supported ? 'prompt' : 'unsupported'
    const onLockError = () => {
      if (this.#lookControls !== look) return
      this.#lookState = 'failed'
      this.#emitStatus(true)
    }
    look.onLockError = onLockError
    // The addon logs console.error on `pointerlockerror`; handle it ourselves instead.
    const internal = (look as unknown as { _onPointerlockError?: EventListener })._onPointerlockError
    if (internal) doc.removeEventListener('pointerlockerror', internal)
    doc.addEventListener('pointerlockerror', onLockError)
    const onLock = () => {
      this.#lookState = 'locked'
      this.#emitStatus(true)
    }
    const onUnlock = () => {
      if (this.#lookControls !== look) return
      // Esc (or anything else that releases the pointer) leaves walk mode.
      // The browser handles Esc itself while locked, so the page never sees
      // the key: a lock released while the window still has focus was Esc.
      this.#lookState = 'prompt'
      requestOrbit(doc.hasFocus() && !doc.hidden ? 'escape' : 'lock-lost')
    }
    look.addEventListener('lock', onLock)
    look.addEventListener('unlock', onUnlock)

    const keydown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (MOVE_KEYS.has(e.code)) {
        this.#keys.add(e.code)
        if (e.code.startsWith('Arrow')) e.preventDefault() // look, do not scroll the page
        return
      }
      if (e.code === 'KeyE' && !e.repeat) this.probeUnderfoot()
      // While locked the browser handles Esc itself and fires `unlock`.
      else if (e.code === 'Escape' && this.#lookState !== 'locked') requestOrbit('escape')
    }
    const keyup = (e: KeyboardEvent) => this.#keys.delete(e.code)
    const blur = () => this.#keys.clear()

    // Click to lock (mouse). Without a lock, dragging looks around: this is
    // also the touch look-drag.
    let drag: { id: number; x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button === 0 && this.#lookState === 'prompt') {
        look.lock()
        return
      }
      if (this.#lookState === 'locked') return
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        // Synthetic pointer: dragging still works inside the canvas.
      }
    }
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return
      const k = DRAG_LOOK_SPEED * this.#look.sensitivity
      this.#lookBy(-(e.clientX - drag.x) * k, (this.#look.invertY ? 1 : -1) * (e.clientY - drag.y) * k)
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    }
    const up = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return
      drag = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }

    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', blur)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)

    this.#unbindWalk = () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', blur)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      doc.removeEventListener('pointerlockerror', onLockError)
      doc.removeEventListener('mousemove', lockedMove)
      look.removeEventListener('lock', onLock)
      look.removeEventListener('unlock', onUnlock)
      look.onLockError = null
      // Cleared first, so the `unlock` this causes is not read as "leave walk mode".
      this.#lookControls = null
      if (look.isLocked) look.unlock()
      look.dispose() // disconnect(): removes its mousemove / pointerlockchange listeners
    }
  }

  /** Remove every walk-mode listener and release the pointer (D12 cleanup). */
  #leaveWalkInput(): void {
    this.#unbindWalk?.()
    this.#unbindWalk = null
    this.#keys.clear()
    this.#joystick = { strafe: 0, forward: 0 }
  }

  #stepWalk(dt: number): void {
    const f = this.#frame
    const p = this.#player
    if (!f || !p) return
    const k = this.#keys
    const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0)
    const tilt = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0)
    if (turn || tilt) this.#lookBy(turn * KEY_TURN_SPEED * dt, tilt * KEY_TURN_SPEED * 0.6 * dt)
    const yaw = new THREE.Euler().setFromQuaternion(this.#camera.quaternion, 'YXZ').y
    const step = stepWalk(
      p.x,
      p.z,
      {
        forward: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + this.#joystick.forward,
        strafe: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.#joystick.strafe,
        run: k.has('ShiftLeft') || k.has('ShiftRight'),
        yaw,
      },
      dt,
      this.#walkTerrain(),
    )
    this.#player = { x: step.x, z: step.z }
    // Follow the ground smoothly: the eye eases to its height, so creases
    // between cells do not jolt the view.
    const target = eyeY(heightToWorldY(step.groundM, f), this.#waterY())
    this.#eyeY += (target - this.#eyeY) * Math.min(1, dt * 14)
    this.#camera.position.set(step.x, this.#eyeY, step.z)

    this.#cullFlora()
    this.#syncGrass(false)
    if (Math.hypot(step.x - this.#shadowCenter.x, step.z - this.#shadowCenter.z) > SHADOW_RECENTER) this.#shadowsDirty = true
    this.#emitStatus(false, yaw, step.wading, step.blocked)
  }

  #emitStatus(force: boolean, yaw?: number, wading = false, blocked: Blocked = 'none'): void {
    const cb = this.#opts.onWalkStatus
    const f = this.#frame
    if (!cb || !f) return
    const now = performance.now()
    if (!force && now - this.#statusAt < 100) return
    const p = this.#player ?? { x: 0, z: 0 }
    const c = worldToCellF(p.x, p.z, f)
    const cell = this.#walkerCell() ?? { x: 0, y: 0 }
    const y = yaw ?? new THREE.Euler().setFromQuaternion(this.#camera.quaternion, 'YXZ').y
    const status: WalkStatus = {
      active: this.#mode === 'walk' && this.#walkReady,
      cellX: cell.x,
      cellY: cell.y,
      x: Math.round(c.x * 10) / 10,
      y: Math.round(c.y * 10) / 10,
      bearing: Math.round(yawToBearing(y) / 2) * 2,
      wading,
      blocked,
      look: this.#lookState,
    }
    const key = JSON.stringify(status)
    if (key === this.#lastStatus) return
    this.#lastStatus = key
    this.#statusAt = now
    cb(status)
  }

  // ---- Terrain mesh --------------------------------------------------------------

  #buildMesh(size: number): void {
    if (this.#mesh) {
      this.#scene.remove(this.#mesh)
      this.#mesh.geometry.dispose()
    }
    const geo = new THREE.BufferGeometry()
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
    const dynamic = (array: Float32Array, itemSize: number) => {
      const attr = new THREE.BufferAttribute(array, itemSize)
      attr.setUsage(THREE.DynamicDrawUsage)
      return attr
    }
    geo.setAttribute('position', dynamic(new Float32Array(size * size * 3), 3))
    // Lighting uses flat (per-face) normals from the shader. These per-vertex
    // normals exist for the shadow map's normal bias only.
    geo.setAttribute('normal', dynamic(new Float32Array(size * size * 3), 3))
    geo.setAttribute('color', dynamic(this.#colors, 3))
    // 1 = the natural slope/shore blend applies; 0 = keep the vertex color (low-trust marks).
    geo.setAttribute('grazeBlend', dynamic(new Float32Array(size * size).fill(1), 1))
    this.#mesh = new THREE.Mesh(geo, this.#terrainMaterial)
    this.#mesh.castShadow = this.#sun.castShadow
    this.#mesh.receiveShadow = this.#sun.castShadow
    this.#scene.add(this.#mesh)
  }

  /** Update positions, normals and colors in `rect` (colors and normals one cell wider). */
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

    // Neighbours' gradients change too: normals and colors go one cell wider.
    const wide = padRect(rect, 1, t.size)
    const nAttr = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute
    const nrm = nAttr.array as Float32Array
    const h = t.heightmap
    const at = (x: number, y: number) => h[Math.min(t.size - 1, Math.max(0, y)) * t.size + Math.min(t.size - 1, Math.max(0, x))]
    const k = VERTICAL_EXAGGERATION / (2 * t.cellSizeM)
    for (let y = wide.y0; y <= wide.y1; y++) {
      for (let x = wide.x0; x <= wide.x1; x++) {
        const nx = -(at(x + 1, y) - at(x - 1, y)) * k
        const nz = -(at(x, y + 1) - at(x, y - 1)) * k
        const inv = 1 / Math.hypot(nx, 1, nz)
        const i = (y * t.size + x) * 3
        nrm[i] = nx * inv
        nrm[i + 1] = inv
        nrm[i + 2] = nz * inv
      }
      nAttr.addUpdateRange((y * t.size + wide.x0) * 3, (wide.x1 - wide.x0 + 1) * 3)
    }
    nAttr.needsUpdate = true

    this.#water.setDepths(t.heightmap, t.size, t.waterLevelM)
    this.#shadowsDirty = true
    this.#recolor(wide)
  }

  #recolor(rect: DirtyRect): void {
    const t = this.#terrain
    const mesh = this.#mesh
    if (!t || !mesh || !this.#colors) return
    const o = this.#overlay
    const n = t.size * t.size
    const natural = this.#naturalView()
    const mode = natural ? 'terrain' : o.mode
    const ood = o.ood && o.ood.length === n ? o.ood : null
    const showOod = !natural && o.showOod
    writeColors(
      this.#colors,
      {
        size: t.size,
        heightmap: t.heightmap,
        waterLevelM: t.waterLevelM,
        band: this.#band,
        mode,
        cover: this.#cover(),
        confidence: o.confidence && o.confidence.length === n ? o.confidence : null,
        ood,
        showOod,
        classRgb: this.#classRgb,
      },
      rect,
    )
    // The natural blend is for the natural ground only. A data overlay keeps
    // its exact colors, and so does a low-trust mark on natural ground.
    const hasData = (mode === 'cover' && !!this.#cover()) || (mode === 'confidence' && !!o.confidence && o.confidence.length === n)
    this.#terrainUniforms.uNatural.value = hasData ? 0 : 1
    const blend = mesh.geometry.getAttribute('grazeBlend') as THREE.BufferAttribute
    const mask = blend.array as Float32Array
    const attr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const i = y * t.size + x
        mask[i] = showOod && ood && ood[i] && t.heightmap[i] >= t.waterLevelM ? 0 : 1
      }
      attr.addUpdateRange((y * t.size + rect.x0) * 3, (rect.x1 - rect.x0 + 1) * 3)
      blend.addUpdateRange(y * t.size + rect.x0, rect.x1 - rect.x0 + 1)
    }
    attr.needsUpdate = true
    blend.needsUpdate = true
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
    const waterY = heightToWorldY(t.waterLevelM, f)
    this.#fauna.place(
      this.#animalData.herbivores,
      this.#animalData.predators,
      this.#animalData.stride,
      f,
      (cx, cy) => Math.max(this.#worldY(cx, cy), waterY),
      // Ground scale on foot; enlarged in orbit view so they read from far away.
      this.#mode === 'walk' ? WALK_ANIMAL_SCALE : ORBIT_ANIMAL_SCALE,
    )
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

  // ---- Orbit view: brush and picking ----------------------------------------------

  #orbitInput(): boolean {
    return this.#mode === 'orbit' && this.#transition === null
  }

  #updateCursor(): void {
    const hit = this.#orbitInput() && this.#pointerInside && this.#brush.tool !== 'select' ? this.#hitCell() : null
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
      if (!this.#orbitInput()) return
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
      if (!this.#orbitInput()) return
      setPointer(e)
      this.#pointerInside = true
      this.#updateCursor()
    }
    const up = (e: PointerEvent) => {
      const d = this.#down
      this.#down = null
      if (!this.#orbitInput()) return
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

  // ---- Frame loop ------------------------------------------------------------------

  #onResize(): void {
    // Not drawing: keep the frame that is on screen (CSS scales it) and resize when drawing resumes.
    if (!this.#active && this.#hasFrame) {
      this.#resizePending = true
      return
    }
    this.#applyResize()
  }

  #applyResize(): void {
    this.#resizePending = false
    const w = this.#host.clientWidth || 1
    const h = this.#host.clientHeight || 1
    this.#renderer.setSize(w, h, false)
    this.#camera.aspect = w / h
    this.#camera.updateProjectionMatrix()
    this.requestRender()
  }

  #render(): void {
    if (this.#sky) this.#sky.update(this.#camera, this.#time)
    this.#water.setTime(this.#time)
    this.#flora.setTime(this.#time)
    this.#fauna.setTime(this.#time, performance.now() / 1000)
    this.#hasFrame = true
    if (this.#shadowsDirty) {
      this.#shadowsDirty = false
      this.#updateShadows()
    }
    this.#renderer.render(this.#scene, this.#camera)
  }

  #startLoop(): void {
    if (this.#raf || this.#destroyed || !this.#active || this.#host.ownerDocument.hidden) return
    this.#lastTime = 0
    this.#guard.reset()
    this.#raf = requestAnimationFrame(this.#tick)
  }

  #stopLoop(): void {
    cancelAnimationFrame(this.#raf)
    this.#raf = 0
  }

  #tick = (now: number): void => {
    if (this.#destroyed || !this.#active) {
      this.#raf = 0
      return
    }
    this.#raf = requestAnimationFrame(this.#tick)
    // Frame-rate cap (the backdrop): skip this callback until enough time has passed.
    const cap = this.#opts.fpsCap
    if (cap && this.#lastTime && now - this.#lastTime < 1000 / cap - 2) return
    const raw = this.#lastTime ? (now - this.#lastTime) / 1000 : 0
    const dt = Math.min(0.1, raw)
    this.#lastTime = now

    if (this.#orbitInput()) this.#sculpt(dt)
    // D19: the ambient camera turns on every drawn frame, from the renderer's own clock (never reset by a page).
    if (this.#ambient && this.#vantage) {
      this.#ambientT = stepAmbientClock(this.#ambientT, raw, this.#reducedMotion)
      this.#aimAmbient()
    }
    this.#stepCycle(dt)
    this.#stepTransition(dt)
    if (this.#mode === 'walk' && this.#walkReady) this.#stepWalk(dt)
    if (this.#orbitInput() && this.#controls?.update()) this.#needsRender = true

    // Walk mode and the day/night cycle animate: every frame is drawn, and
    // the frame rate is watched (D12). Orbit view draws on demand.
    // The ambient view animates (its camera turns, D19) unless motion is reduced: then it is a still that redraws on change.
    // It counts as animating, so it draws every frame (at most `fpsCap` a second) instead of waiting for requestRender().
    const animating = this.#scenery && (this.#ambient ? !this.#reducedMotion : this.#mode === 'walk' || this.#transition !== null || this.#autoCycle)
    if (animating) {
      this.#needsRender = true
      if (!this.#reducedMotion) this.#time += dt
      if (this.#guard.frame(raw)) this.#opts.onLowFps?.(this.#guard.fps)
    }
    if (!this.#needsRender) return
    this.#needsRender = false
    this.#render()
  }
}
