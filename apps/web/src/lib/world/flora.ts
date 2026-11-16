/**
 * Vegetation meshes (D9): instanced low-poly plants built from the placement
 * in ./vegetation.ts, plus the grass tufts around the walker.
 *
 * - 7 silhouettes, one per cover class. Every shape is built here from
 *   cones, cylinders and icosahedra: no models, no textures, no assets.
 * - One `InstancedMesh` per (chunk, class). An InstancedMesh has ONE bounding
 *   sphere for all its instances, so the map is split into chunks: each
 *   chunk is frustum-culled on its own, and chunks beyond the draw distance
 *   are hidden (`cull`).
 * - Per-plant tint comes from `setColorAt` (`instanceColor`). A vertex
 *   attribute `tintMask` (1 on the crown, 0 on the trunk) keeps the trunk
 *   its bark color.
 *
 * - Shapes are swappable (D17). `Flora` starts with the code-built shapes
 *   below; `setShapes()` hands it team-made geometries from `./models.ts`,
 *   which replace the matching slots the next time the plants are built. A
 *   slot with no custom shape keeps its code-built one.
 * - Wind sway (D18) is a vertex-shader displacement on the same material: no
 *   extra draw calls, driven by the scene clock, off with reduced motion.
 *
 * Everything created here is disposed by `dispose()`, which the renderer
 * calls when the vegetation is no longer shown (D12). Custom shapes are
 * CLONED when the plants are built and the clones are disposed with the rest,
 * so the loaded model set itself is never touched and never reloaded.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { cellToWorldX, cellToWorldZ, heightToWorldY } from './coords.ts'
import type { Frame } from './coords.ts'
import { PALETTE } from './palette.ts'
import { sampleHeight } from './terrain.ts'
import { CHUNK_CELLS, chunkInRange, PLANT_STRIDE, SPECIES } from './vegetation.ts'
import type { PlantBatch, Silhouette } from './vegetation.ts'

/** Custom geometries by slot (the 7 silhouettes and the grass tuft). Missing slots keep the code-built shape. */
export type FloraShapes = Partial<Record<Silhouette | 'grassTuft', THREE.BufferGeometry>>

/** Sway of a plant's top, world units per unit of height squared (a 1.4-unit tree tip moves about 0.04). */
export const PLANT_SWAY = 0.02
/** Grass sways more than trees. */
export const GRASS_SWAY = 0.9

type Part = { geo: THREE.BufferGeometry; color: string; tint: boolean; shadeBottom?: number }

/** Give a part its vertex colors and tint mask, then merge the parts into one geometry. */
function build(parts: Part[]): THREE.BufferGeometry {
  const done = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo
    if (g !== p.geo) p.geo.dispose()
    g.deleteAttribute('uv')
    const pos = g.getAttribute('position')
    g.computeBoundingBox()
    const y0 = g.boundingBox!.min.y
    const span = g.boundingBox!.max.y - y0 || 1
    const base = new THREE.Color(p.color)
    const colors = new Float32Array(pos.count * 3)
    const mask = new Float32Array(pos.count).fill(p.tint ? 1 : 0)
    for (let i = 0; i < pos.count; i++) {
      // Darker at the bottom of a crown: reads as depth without any texture.
      const k = p.shadeBottom === undefined ? 1 : p.shadeBottom + (1 - p.shadeBottom) * ((pos.getY(i) - y0) / span)
      colors[i * 3] = base.r * k
      colors[i * 3 + 1] = base.g * k
      colors[i * 3 + 2] = base.b * k
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('tintMask', new THREE.BufferAttribute(mask, 1))
    return g
  })
  const merged = mergeGeometries(done, false)
  done.forEach((g) => g.dispose())
  if (!merged) throw new Error('Could not build a plant geometry.')
  return merged
}

const cone = (r: number, h: number, y: number, seg = 6) => new THREE.ConeGeometry(r, h, seg, 1, true).translate(0, y + h / 2, 0)
const trunk = (r: number, h: number, seg = 5) => new THREE.CylinderGeometry(r * 0.7, r, h, seg, 1, true).translate(0, h / 2, 0)
const blob = (r: number, sy: number, x: number, y: number, z: number) => new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(x, y, z)

const WHITE = '#ffffff'
const BARK = PALETTE.vegetation.trunk

/** One low-poly geometry per silhouette. Heights are in world units (1 = one cell). */
const SILHOUETTES: Record<Silhouette, () => THREE.BufferGeometry> = {
  // Narrow spire of three stacked cones (spruce / fir).
  spire: () =>
    build([
      { geo: trunk(0.05, 0.35), color: BARK, tint: false },
      { geo: cone(0.4, 0.7, 0.22), color: WHITE, tint: true, shadeBottom: 0.6 },
      { geo: cone(0.3, 0.6, 0.62), color: WHITE, tint: true, shadeBottom: 0.7 },
      { geo: cone(0.19, 0.5, 1.02), color: WHITE, tint: true, shadeBottom: 0.8 },
    ]),
  // Tall bare pole with a small crown high up (lodgepole pine).
  pole: () =>
    build([
      { geo: trunk(0.04, 1.05), color: BARK, tint: false },
      { geo: cone(0.23, 0.55, 0.85), color: WHITE, tint: true, shadeBottom: 0.65 },
      { geo: cone(0.15, 0.45, 1.22), color: WHITE, tint: true, shadeBottom: 0.8 },
    ]),
  // Sturdy ruddy trunk, open rounded crown (ponderosa pine).
  broadPine: () =>
    build([
      { geo: trunk(0.075, 0.75, 6), color: PALETTE.vegetation.trunkRuddy, tint: false },
      { geo: cone(0.46, 0.6, 0.6, 7), color: WHITE, tint: true, shadeBottom: 0.6 },
      { geo: blob(0.33, 0.8, 0, 1.2, 0), color: WHITE, tint: true, shadeBottom: 0.75 },
    ]),
  // Short trunk, wide round crown in two lobes (cottonwood / willow).
  roundCrown: () =>
    build([
      { geo: trunk(0.07, 0.5, 6), color: BARK, tint: false },
      { geo: blob(0.52, 0.68, 0, 0.82, 0), color: WHITE, tint: true, shadeBottom: 0.6 },
      { geo: blob(0.32, 0.7, 0.3, 0.72, 0.18), color: WHITE, tint: true, shadeBottom: 0.65 },
    ]),
  // Slender pale trunk, small oval crown (aspen).
  slender: () =>
    build([
      { geo: trunk(0.04, 0.95), color: PALETTE.vegetation.trunkPale, tint: false },
      { geo: blob(0.27, 1.45, 0, 1.12, 0), color: WHITE, tint: true, shadeBottom: 0.7 },
    ]),
  // Big full cone in two tiers (Douglas-fir).
  fullCone: () =>
    build([
      { geo: trunk(0.07, 0.4, 6), color: BARK, tint: false },
      { geo: cone(0.55, 1.0, 0.28, 7), color: WHITE, tint: true, shadeBottom: 0.55 },
      { geo: cone(0.36, 0.8, 0.95, 7), color: WHITE, tint: true, shadeBottom: 0.75 },
    ]),
  // Low stunted clumps hugging the ground (krummholz).
  shrub: () =>
    build([
      { geo: blob(0.3, 0.45, 0, 0.1, 0), color: WHITE, tint: true, shadeBottom: 0.6 },
      { geo: blob(0.2, 0.5, 0.26, 0.08, 0.1), color: WHITE, tint: true, shadeBottom: 0.65 },
      { geo: blob(0.16, 0.5, -0.18, 0.07, 0.2), color: WHITE, tint: true, shadeBottom: 0.65 },
    ]),
}

/** A tuft: three crossed, tapered blades. */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI
    const dx = Math.cos(a) * 0.035
    const dz = Math.sin(a) * 0.035
    const lean = 0.02 * (k - 1)
    pos.push(-dx, 0, -dz, dx, 0, dz, lean, 0.1, lean)
    col.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1, 1, 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('tintMask', new THREE.Float32BufferAttribute(new Array(9).fill(1), 1))
  g.computeVertexNormals()
  return g
}

interface SwayUniforms {
  /** Scene clock, seconds. Shared by the plants and the grass. */
  readonly uTime: { value: number }
  /** Sway amplitude; 0 turns the sway off (reduced motion). */
  readonly uSway: { value: number }
}

/**
 * Lambert material whose instance tint is applied only where `tintMask` is 1,
 * with wind sway: the vertices lean with the square of their height, so the
 * base stays planted, and each plant gets its own phase from its position.
 */
function tintedMaterial(side: THREE.Side, sway: SwayUniforms): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sway.uTime
    shader.uniforms.uSway = sway.uSway
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tintMask;\nuniform float uTime;\nuniform float uSway;')
      .replace(
        '#include <color_vertex>',
        /* glsl */ `vColor = vec4(color, 1.0);
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, tintMask);
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
#ifdef USE_INSTANCING
  if (uSway > 0.0) {
    float grazeH = max(position.y, 0.0);
    float grazePhase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 1.3;
    transformed.x += sin(uTime * 1.6 + grazePhase) * uSway * grazeH * grazeH;
    transformed.z += cos(uTime * 1.1 + grazePhase) * uSway * 0.6 * grazeH * grazeH;
  }
#endif`,
      )
  }
  m.customProgramCacheKey = () => 'graze-flora'
  return m
}

export interface FloraStats {
  /** InstancedMeshes that exist (one per chunk and class with plants). */
  readonly batches: number
  /** Of those, how many are within the draw distance right now. */
  readonly visibleBatches: number
  readonly plants: number
  readonly visiblePlants: number
  readonly grassTufts: number
}

interface Batch {
  readonly mesh: THREE.InstancedMesh
  readonly chunkX: number
  readonly chunkY: number
}

export class Flora {
  readonly #scene: THREE.Scene
  #geometries: THREE.BufferGeometry[] | null = null
  #material: THREE.MeshLambertMaterial | null = null
  #batches: Batch[] = []
  #plants = 0
  #grass: THREE.InstancedMesh | null = null
  #grassCapacity = 0
  #castShadow = true
  #shapes: FloraShapes = {}
  readonly #uTime = { value: 0 }
  readonly #plantSway = { value: PLANT_SWAY }
  readonly #grassSway = { value: GRASS_SWAY }

  constructor(scene: THREE.Scene) {
    this.#scene = scene
  }

  /**
   * Use these custom geometries (D17) from now on. The plants and the grass
   * that exist are freed, because their meshes hold the old shapes: the
   * caller builds them again (`setPlants`, `setGrass`). Returns true when
   * something has to be rebuilt.
   */
  setShapes(shapes: FloraShapes): boolean {
    this.#shapes = { ...shapes }
    const had = this.hasPlants || this.#grass !== null
    this.#clearPlants()
    this.disposeGrass()
    this.#geometries?.forEach((g) => g.dispose())
    this.#geometries = null
    return had
  }

  /** How many of the 8 flora slots use a custom shape. */
  get customShapes(): number {
    return Object.keys(this.#shapes).length
  }

  /** Scene clock for the wind sway (seconds). */
  setTime(t: number): void {
    this.#uTime.value = t
  }

  /** Wind sway on or off (off with reduced motion). */
  setSway(on: boolean): void {
    this.#plantSway.value = on ? PLANT_SWAY : 0
    this.#grassSway.value = on ? GRASS_SWAY : 0
  }

  get hasPlants(): boolean {
    return this.#batches.length > 0
  }

  /** Replace every plant. `heightmap` is sampled (bilinear) to stand each plant on the ground. */
  setPlants(batches: readonly PlantBatch[], heightmap: Float32Array, frame: Frame): void {
    this.#clearPlants()
    if (batches.length === 0) return
    // A custom shape is cloned, so disposing the plants never touches the loaded model set.
    this.#geometries ??= SPECIES.map((s) => this.#shapes[s.silhouette]?.clone() ?? SILHOUETTES[s.silhouette]())
    this.#material ??= tintedMaterial(THREE.FrontSide, { uTime: this.#uTime, uSway: this.#plantSway })
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const c = new THREE.Color()
    for (const b of batches) {
      const mesh = new THREE.InstancedMesh(this.#geometries[b.classIndex % this.#geometries.length], this.#material, b.count)
      for (let k = 0; k < b.count; k++) {
        const o = k * PLANT_STRIDE
        const cx = b.plants[o]
        const cy = b.plants[o + 1]
        const scale = b.plants[o + 2]
        // Sunk a little so a plant on a slope never shows a gap under its trunk.
        p.set(cellToWorldX(cx, frame), heightToWorldY(sampleHeight(heightmap, frame.size, cx, cy), frame) - 0.04 * scale, cellToWorldZ(cy, frame))
        q.setFromAxisAngle(up, b.plants[o + 3])
        s.setScalar(scale)
        mesh.setMatrixAt(k, m.compose(p, q, s))
        mesh.setColorAt(k, c.setRGB(b.plants[o + 4], b.plants[o + 5], b.plants[o + 6]))
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.castShadow = this.#castShadow
      mesh.receiveShadow = false
      this.#scene.add(mesh)
      this.#batches.push({ mesh, chunkX: b.chunkX, chunkY: b.chunkY })
      this.#plants += b.count
    }
  }

  /**
   * Distance culling (D9). Chunks farther than `radius` cells from the point
   * (fractional cell coordinates) are hidden. Pass `null` to show everything
   * (orbit view).
   */
  cull(center: { x: number; y: number } | null, radius: number): void {
    for (const b of this.#batches) b.mesh.visible = !center || chunkInRange(b.chunkX, b.chunkY, center.x, center.y, radius)
  }

  setCastShadow(on: boolean): void {
    this.#castShadow = on
    for (const b of this.#batches) b.mesh.castShadow = on
  }

  /** Replace the grass tufts around the walker (PLANT_STRIDE floats per tuft). */
  setGrass(tufts: Float32Array, heightmap: Float32Array, frame: Frame): void {
    const n = tufts.length / PLANT_STRIDE
    if (n === 0) {
      if (this.#grass) this.#grass.count = 0
      return
    }
    if (!this.#grass || n > this.#grassCapacity) {
      const old = this.#grass
      this.#grassCapacity = Math.max(n, this.#grassCapacity * 2, 512)
      this.#grass = new THREE.InstancedMesh(
        old?.geometry ?? this.#shapes.grassTuft?.clone() ?? tuftGeometry(),
        old?.material ?? tintedMaterial(THREE.DoubleSide, { uTime: this.#uTime, uSway: this.#grassSway }),
        this.#grassCapacity,
      )
      this.#grass.frustumCulled = false // re-placed around the walker; always near the camera
      this.#grass.castShadow = false
      this.#grass.receiveShadow = false
      if (old) {
        this.#scene.remove(old)
        old.dispose()
      }
      this.#scene.add(this.#grass)
    }
    const g = this.#grass
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const c = new THREE.Color()
    for (let k = 0; k < n; k++) {
      const o = k * PLANT_STRIDE
      p.set(cellToWorldX(tufts[o], frame), heightToWorldY(sampleHeight(heightmap, frame.size, tufts[o], tufts[o + 1]), frame), cellToWorldZ(tufts[o + 1], frame))
      q.setFromAxisAngle(up, tufts[o + 3])
      s.setScalar(tufts[o + 2])
      g.setMatrixAt(k, m.compose(p, q, s))
      g.setColorAt(k, c.setRGB(tufts[o + 4], tufts[o + 5], tufts[o + 6]))
    }
    g.count = n
    g.instanceMatrix.needsUpdate = true
    if (g.instanceColor) g.instanceColor.needsUpdate = true
  }

  /** Remove the grass (walk-mode only) and free its geometry and material. */
  disposeGrass(): void {
    const g = this.#grass
    if (!g) return
    this.#scene.remove(g)
    g.geometry.dispose()
    ;(g.material as THREE.Material).dispose()
    g.dispose()
    this.#grass = null
    this.#grassCapacity = 0
  }

  stats(): FloraStats {
    let visibleBatches = 0
    let visiblePlants = 0
    for (const b of this.#batches) {
      if (!b.mesh.visible) continue
      visibleBatches++
      visiblePlants += b.mesh.count
    }
    return { batches: this.#batches.length, visibleBatches, plants: this.#plants, visiblePlants, grassTufts: this.#grass?.count ?? 0 }
  }

  #clearPlants(): void {
    for (const b of this.#batches) {
      this.#scene.remove(b.mesh)
      b.mesh.dispose()
    }
    this.#batches = []
    this.#plants = 0
  }

  /** Free every geometry, material and instance buffer made here. */
  dispose(): void {
    this.#clearPlants()
    this.disposeGrass()
    this.#geometries?.forEach((g) => g.dispose())
    this.#geometries = null
    this.#material?.dispose()
    this.#material = null
  }
}

export { CHUNK_CELLS }
