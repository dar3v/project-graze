/**
 * Animals (D6, D9, D18): two instanced low-poly meshes, one herbivore
 * and one predator, drawn where Role 2's sim says they are. No sim logic
 * here: the renderer gets positions (and headings, when given) in cell
 * coordinates and stands each animal on the ground with the same bilinear
 * height lookup the walker uses.
 *
 * Shapes. The shapes are made of boxes: no models, no assets. Every shape
 * faces +X at heading 0.
 *
 * Motion (D18). Legs swing and the body bobs in the vertex shader, so it
 * costs no draw calls and works on hundreds of animals:
 *  - `legMask` (per vertex) says which vertices are legs and which way they
 *    swing: +1 and -1 swing in opposite directions, 0 is the body;
 *  - `aSpeed` (per instance, 0..1) is how fast that animal is moving, filled
 *    in `place()` from the distance it covered since the last poses. An
 *    animal standing still does not walk in place;
 *  - the phase comes from the instance position, so a herd is not in step.
 * The legs lean (a shear below the hip) instead of rotating, which needs no
 * per-leg pivot. Off with reduced motion.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { cellToWorldX, cellToWorldZ } from './coords.ts'
import type { Frame } from './coords.ts'
import { PALETTE } from './palette.ts'

/** Animals are drawn this many times larger in orbit view so they read from far away. */
export const ORBIT_ANIMAL_SCALE = 2.4
/** Ground-scale size in walk mode. */
export const WALK_ANIMAL_SCALE = 1
/** An animal moving this many cells a second (or faster) swings its legs fully. */
export const FULL_STRIDE_SPEED = 1.5
/** How far a foot leans forward and back, as a share of the leg length. */
export const LEG_SWING = 0.55
/** Body bob at full stride, world units. */
export const BODY_BOB = 0.012
/** Leg swings per second of scene time at full stride (radians per second). */
const STRIDE_RATE = 9
/** Poses older than this are not "moving" any more: the sim paused. Seconds. */
const STALE_POSES_S = 0.35

export type AnimalSlot = 'herbivore' | 'predator'

/** A box part: `leg` is its legMask (+1 or -1 for a leg, 0 for the body). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: string, leg = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed()
  g.deleteAttribute('uv')
  const n = g.getAttribute('position').count
  const c = new THREE.Color(hex)
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.setAttribute('legMask', new THREE.BufferAttribute(new Float32Array(n).fill(leg), 1))
  return g
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  if (!g) throw new Error('Could not build an animal geometry.')
  return g
}

/** Grazer: deep body, long neck, upright head, four legs. About 0.5 long, 0.5 tall. Faces +X. */
export function herbivoreGeometry(): THREE.BufferGeometry {
  const c = PALETTE.animals.herbivore
  return merge([
    box(0.4, 0.18, 0.16, 0, 0.3, 0, c), // body
    box(0.09, 0.2, 0.09, 0.2, 0.42, 0, c), // neck
    box(0.16, 0.09, 0.1, 0.27, 0.52, 0, c), // head
    // Diagonal pairs move together (a trot).
    box(0.05, 0.22, 0.05, 0.14, 0.11, 0.05, c, 1),
    box(0.05, 0.22, 0.05, 0.14, 0.11, -0.05, c, -1),
    box(0.05, 0.22, 0.05, -0.14, 0.11, 0.05, c, -1),
    box(0.05, 0.22, 0.05, -0.14, 0.11, -0.05, c, 1),
  ])
}

/** Hunter: long low body, head forward, tail, short legs. About 0.6 long, 0.3 tall. Faces +X. */
export function predatorGeometry(): THREE.BufferGeometry {
  const c = PALETTE.animals.predator
  return merge([
    box(0.46, 0.13, 0.13, 0, 0.21, 0, c), // body
    box(0.16, 0.11, 0.11, 0.29, 0.25, 0, c), // head
    box(0.2, 0.05, 0.05, -0.31, 0.24, 0, c), // tail
    box(0.05, 0.15, 0.05, 0.16, 0.075, 0.04, c, 1),
    box(0.05, 0.15, 0.05, 0.16, 0.075, -0.04, c, -1),
    box(0.05, 0.15, 0.05, -0.16, 0.075, 0.04, c, -1),
    box(0.05, 0.15, 0.05, -0.16, 0.075, -0.04, c, 1),
  ])
}

/** Height of the hips: the highest leg vertex (0 when the shape has no legs marked). */
export function hipHeight(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position')
  const leg = g.getAttribute('legMask')
  if (!pos || !leg) return 0
  let hip = 0
  for (let i = 0; i < pos.count; i++) if (leg.getX(i) !== 0) hip = Math.max(hip, pos.getY(i))
  return hip
}

const UP = new THREE.Vector3(0, 1, 0)

/**
 * The instance matrix of one animal: it stands at world (x, y, z), is scaled
 * uniformly, and turns its +X (the way every animal model faces) toward its
 * heading. `heading` is the sim's: radians, atan2(dy, dx) in GRID coordinates,
 * where +x is east (+X) and +y is south (+Z). A grid heading h is therefore a
 * rotation of -h about +Y.
 */
export function animalMatrix(out: THREE.Matrix4, x: number, y: number, z: number, heading: number, scale: number): THREE.Matrix4 {
  return out.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, -heading), new THREE.Vector3(scale, scale, scale))
}

interface Herd {
  mesh: THREE.InstancedMesh
  material: THREE.MeshLambertMaterial
  /** uHip uniform of this species' material. */
  readonly hip: { value: number }
  /** Cell positions at the last new poses, to measure speed. */
  last: Float32Array | null
  lastPoses: Float32Array | null
}

export class Fauna {
  readonly #scene: THREE.Scene
  readonly #uTime = { value: 0 }
  readonly #uSwing = { value: LEG_SWING }
  #herds: Record<AnimalSlot, Herd>
  #posesAt = 0
  #moving = false

  constructor(scene: THREE.Scene) {
    this.#scene = scene
    this.#herds = {
      herbivore: this.#make(herbivoreGeometry(), 64),
      predator: this.#make(predatorGeometry(), 16),
    }
  }

  #material(hip: { value: number }): THREE.MeshLambertMaterial {
    // Colors are vertex colors: the palette color baked into each shape.
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.#uTime
      shader.uniforms.uSwing = this.#uSwing
      shader.uniforms.uHip = hip
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float legMask;\nattribute float aSpeed;\nuniform float uTime;\nuniform float uSwing;\nuniform float uHip;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
#ifdef USE_INSTANCING
  if (uSwing > 0.0 && aSpeed > 0.0) {
    float grazePhase = instanceMatrix[3].x * 2.3 + instanceMatrix[3].z * 3.1;
    float grazeStride = sin(uTime * ${STRIDE_RATE.toFixed(1)} + grazePhase);
    // Legs lean from the hip: the foot moves most, the hip not at all.
    transformed.x += max(uHip - position.y, 0.0) * grazeStride * legMask * uSwing * aSpeed;
    transformed.y += abs(grazeStride) * ${BODY_BOB.toFixed(3)} * aSpeed * (1.0 - abs(legMask));
  }
#endif`,
        )
    }
    m.customProgramCacheKey = () => 'graze-fauna'
    return m
  }

  #make(geo: THREE.BufferGeometry, capacity: number): Herd {
    const hip = { value: hipHeight(geo) }
    const material = this.#material(hip)
    return { mesh: this.#mesh(geo, material, capacity), material, hip, last: null, lastPoses: null }
  }

  #mesh(geo: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1))
    const mesh = new THREE.InstancedMesh(geo, material, capacity)
    mesh.count = 0
    mesh.frustumCulled = false
    this.#scene.add(mesh)
    return mesh
  }

  get count(): number {
    return this.#herds.herbivore.mesh.count + this.#herds.predator.mesh.count
  }

  /** Scene clock (seconds) for the leg swing, and the wall clock used to notice that the poses stopped. */
  setTime(t: number, nowS: number): void {
    this.#uTime.value = t
    if (this.#moving && nowS - this.#posesAt > STALE_POSES_S) {
      // No new poses for a while: the sim is paused, so nobody is walking.
      this.#moving = false
      for (const herd of Object.values(this.#herds)) {
        const speed = herd.mesh.geometry.getAttribute('aSpeed') as THREE.InstancedBufferAttribute
        ;(speed.array as Float32Array).fill(0)
        speed.needsUpdate = true
        herd.last = null
      }
    }
  }

  /** Leg swing and body bob on or off (off with reduced motion). */
  setSwing(on: boolean): void {
    this.#uSwing.value = on ? LEG_SWING : 0
  }

  /**
   * Place the animals. `stride` 2 = [x, y, ...]; 3 = [x, y, heading, ...]
   * (heading in radians, atan2(dy, dx) in grid coordinates). `groundY(cx, cy)`
   * returns the world Y to stand on. `nowS` is a wall clock in seconds: the
   * speed of each animal is the distance since the previous NEW pose array.
   */
  place(
    herbivores: Float32Array | null,
    predators: Float32Array | null,
    stride: number,
    frame: Frame,
    groundY: (cx: number, cy: number) => number,
    scale: number,
    nowS: number = performance.now() / 1000,
  ): void {
    const m = new THREE.Matrix4()
    const fresh = herbivores !== this.#herds.herbivore.lastPoses || predators !== this.#herds.predator.lastPoses
    const dt = nowS - this.#posesAt
    const one = (herd: Herd, pts: Float32Array | null): void => {
      const n = pts ? Math.floor(pts.length / stride) : 0
      let mesh = herd.mesh
      if (n > mesh.instanceMatrix.count) {
        // Grow capacity (double) by replacing the mesh; geometry and material are reused.
        const capacity = Math.max(n, mesh.instanceMatrix.count * 2)
        this.#scene.remove(mesh)
        mesh.dispose()
        mesh = this.#mesh(mesh.geometry, herd.material, capacity)
        herd.mesh = mesh
      }
      const speed = mesh.geometry.getAttribute('aSpeed') as THREE.InstancedBufferAttribute
      const speeds = speed.array as Float32Array
      // Speeds are measured only between two different pose arrays with the same animals in them.
      const measure = fresh && pts !== herd.lastPoses
      const comparable = measure && herd.last !== null && herd.last.length === n * 2 && dt > 1e-3 && dt < 1
      const now = measure ? new Float32Array(n * 2) : null
      for (let k = 0; k < n; k++) {
        const cx = pts![k * stride]
        const cy = pts![k * stride + 1]
        mesh.setMatrixAt(k, animalMatrix(m, cellToWorldX(cx, frame), groundY(cx, cy), cellToWorldZ(cy, frame), stride >= 3 ? pts![k * stride + 2] : 0, scale))
        if (now) {
          now[k * 2] = cx
          now[k * 2 + 1] = cy
          const cellsPerS = comparable ? Math.hypot(cx - herd.last![k * 2], cy - herd.last![k * 2 + 1]) / dt : 0
          const target = Math.min(1, cellsPerS / FULL_STRIDE_SPEED)
          // Eased, so a leg does not start or stop in one frame.
          speeds[k] = comparable ? speeds[k] + (target - speeds[k]) * 0.25 : 0
        }
      }
      if (now) {
        herd.last = now
        herd.lastPoses = pts
        speed.needsUpdate = true
      }
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
    }
    one(this.#herds.herbivore, herbivores)
    one(this.#herds.predator, predators)
    if (fresh) {
      this.#posesAt = nowS
      this.#moving = true
    }
  }

  dispose(): void {
    for (const herd of Object.values(this.#herds)) {
      this.#scene.remove(herd.mesh)
      herd.mesh.geometry.dispose()
      herd.material.dispose()
      herd.mesh.dispose()
    }
  }
}
