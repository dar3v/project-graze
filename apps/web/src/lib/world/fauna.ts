/**
 * Animals (D6, D9): two instanced low-poly meshes, one herbivore and one
 * predator, drawn where Role 2's sim says they are. No sim logic here: the
 * renderer gets positions (and headings, when given) in cell coordinates and
 * stands each animal on the ground with the same bilinear height lookup the
 * walker uses.
 *
 * Shapes are built from boxes: no models, no assets. They face +X at heading 0.
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

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  if (!g) throw new Error('Could not build an animal geometry.')
  return g
}

/** Grazer: deep body, long neck, upright head, four legs. About 0.5 long, 0.5 tall. */
function herbivoreGeometry(): THREE.BufferGeometry {
  return merge([
    box(0.4, 0.18, 0.16, 0, 0.3, 0), // body
    box(0.09, 0.2, 0.09, 0.2, 0.42, 0), // neck
    box(0.16, 0.09, 0.1, 0.27, 0.52, 0), // head
    box(0.05, 0.22, 0.05, 0.14, 0.11, 0.05),
    box(0.05, 0.22, 0.05, 0.14, 0.11, -0.05),
    box(0.05, 0.22, 0.05, -0.14, 0.11, 0.05),
    box(0.05, 0.22, 0.05, -0.14, 0.11, -0.05),
  ])
}

/** Hunter: long low body, head forward, tail, short legs. About 0.6 long, 0.3 tall. */
function predatorGeometry(): THREE.BufferGeometry {
  return merge([
    box(0.46, 0.13, 0.13, 0, 0.21, 0), // body
    box(0.16, 0.11, 0.11, 0.29, 0.25, 0), // head
    box(0.2, 0.05, 0.05, -0.31, 0.24, 0), // tail
    box(0.05, 0.15, 0.05, 0.16, 0.075, 0.04),
    box(0.05, 0.15, 0.05, 0.16, 0.075, -0.04),
    box(0.05, 0.15, 0.05, -0.16, 0.075, 0.04),
    box(0.05, 0.15, 0.05, -0.16, 0.075, -0.04),
  ])
}

export class Fauna {
  readonly #scene: THREE.Scene
  #herbivores: THREE.InstancedMesh
  #predators: THREE.InstancedMesh

  constructor(scene: THREE.Scene) {
    this.#scene = scene
    this.#herbivores = this.#make(herbivoreGeometry(), PALETTE.animals.herbivore, 64)
    this.#predators = this.#make(predatorGeometry(), PALETTE.animals.predator, 16)
  }

  #make(geo: THREE.BufferGeometry, hex: string, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: hex, flatShading: true }), capacity)
    mesh.count = 0
    mesh.frustumCulled = false
    this.#scene.add(mesh)
    return mesh
  }

  get count(): number {
    return this.#herbivores.count + this.#predators.count
  }

  /**
   * Place the animals. `stride` 2 = [x, y, ...]; 3 = [x, y, heading, ...]
   * (heading in radians, atan2(dy, dx) in grid coordinates). `groundY(cx, cy)`
   * returns the world Y to stand on.
   */
  place(
    herbivores: Float32Array | null,
    predators: Float32Array | null,
    stride: number,
    frame: Frame,
    groundY: (cx: number, cy: number) => number,
    scale: number,
  ): void {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3(scale, scale, scale)
    const up = new THREE.Vector3(0, 1, 0)
    const one = (mesh: THREE.InstancedMesh, pts: Float32Array | null): THREE.InstancedMesh => {
      const n = pts ? Math.floor(pts.length / stride) : 0
      if (n > mesh.instanceMatrix.count) {
        // Grow capacity (double) by replacing the mesh; geometry and material are reused.
        const bigger = new THREE.InstancedMesh(mesh.geometry, mesh.material, Math.max(n, mesh.instanceMatrix.count * 2))
        bigger.frustumCulled = false
        this.#scene.remove(mesh)
        mesh.dispose()
        this.#scene.add(bigger)
        mesh = bigger
      }
      for (let k = 0; k < n; k++) {
        const cx = pts![k * stride]
        const cy = pts![k * stride + 1]
        // Grid +y is south = +Z, so a grid heading h is a rotation of -h about +Y.
        q.setFromAxisAngle(up, stride >= 3 ? -pts![k * stride + 2] : 0)
        p.set(cellToWorldX(cx, frame), groundY(cx, cy), cellToWorldZ(cy, frame))
        mesh.setMatrixAt(k, m.compose(p, q, s))
      }
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      return mesh
    }
    this.#herbivores = one(this.#herbivores, herbivores)
    this.#predators = one(this.#predators, predators)
  }

  dispose(): void {
    for (const mesh of [this.#herbivores, this.#predators]) {
      this.#scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
  }
}
