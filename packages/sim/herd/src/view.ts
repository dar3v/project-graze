/**
 * Read-only view of the sim for the renderer (Role 1). No rendering code here.
 *
 * Coordinates are grid cells, the same frame the cover map uses: (x, y) with
 * x east and y south, integer values at cell centers. The renderer lifts each
 * animal onto the ground with Role 1's `sampleHeight(heightmap, size, x, y)`
 * (bilinear in cell coordinates, packages/sim/terrain). That is the agreed
 * `getGroundHeight` convention; see docs/ecology-rules.md, "Rendering contract".
 *
 * The sim ticks on its own clock (the app runs it every TICK_MS). The renderer
 * draws every frame. `interpolateSnapshot(prev, next, t)` blends the two most
 * recent ticks so animals glide instead of jumping once per tick.
 */

import type { Animal, SimState } from './sim.ts'

/** Floats per animal in a pose array: x, y, heading (radians, atan2(dy, dx)). */
export const POSE_STRIDE = 3

export interface SpeciesPoses {
  /** Stable animal ids, in the same order as `poses`. */
  readonly ids: Uint32Array
  /** [x0, y0, heading0, x1, y1, heading1, ...] in grid-cell coordinates. */
  readonly poses: Float32Array
}

export interface SimSnapshot {
  readonly tick: number
  readonly herbivores: SpeciesPoses
  readonly predators: SpeciesPoses
}

function packPoses(list: readonly Animal[]): SpeciesPoses {
  const ids = new Uint32Array(list.length)
  const poses = new Float32Array(list.length * POSE_STRIDE)
  list.forEach((a, i) => {
    ids[i] = a.id
    poses[i * POSE_STRIDE] = a.x
    poses[i * POSE_STRIDE + 1] = a.y
    poses[i * POSE_STRIDE + 2] = a.heading
  })
  return { ids, poses }
}

/** Copy of the animals' poses at the current tick (safe to keep; the sim mutates its own state). */
export function snapshotPoses(state: SimState): SimSnapshot {
  return { tick: state.tick, herbivores: packPoses(state.herbivores), predators: packPoses(state.predators) }
}

/** Shortest-arc blend between two angles. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

/**
 * Poses at fraction `t` (0..1, clamped) of the way from `prev` to `next`, in
 * `next`'s order. Animals matched by id. Animals born since `prev` appear at
 * their `next` pose; animals that died are not in `next` and are dropped.
 *
 * Between ticks the path is a straight line, so a blended position can pass
 * over a water cell; at every tick boundary (t = 0 or 1) animals stand on land.
 */
export function interpolatePoses(prev: SpeciesPoses | null, next: SpeciesPoses, t: number): Float32Array {
  const a = Math.min(1, Math.max(0, t))
  const out = new Float32Array(next.poses.length)
  const prevIndex = new Map<number, number>()
  if (prev) prev.ids.forEach((id, i) => prevIndex.set(id, i))
  for (let i = 0; i < next.ids.length; i++) {
    const o = i * POSE_STRIDE
    const j = prevIndex.get(next.ids[i])
    if (j === undefined) {
      out[o] = next.poses[o]
      out[o + 1] = next.poses[o + 1]
      out[o + 2] = next.poses[o + 2]
      continue
    }
    const p = j * POSE_STRIDE
    out[o] = prev!.poses[p] + (next.poses[o] - prev!.poses[p]) * a
    out[o + 1] = prev!.poses[p + 1] + (next.poses[o + 1] - prev!.poses[p + 1]) * a
    out[o + 2] = lerpAngle(prev!.poses[p + 2], next.poses[o + 2], a)
  }
  return out
}

export interface InterpolatedPoses {
  readonly herbivores: Float32Array
  readonly predators: Float32Array
}

export function interpolateSnapshot(prev: SimSnapshot | null, next: SimSnapshot, t: number): InterpolatedPoses {
  return {
    herbivores: interpolatePoses(prev?.herbivores ?? null, next.herbivores, t),
    predators: interpolatePoses(prev?.predators ?? null, next.predators, t),
  }
}

/** Drop the heading: [x, y, heading, ...] -> [x, y, ...], the format `WorldView` takes today. */
export function posesToPositions(poses: Float32Array): Float32Array {
  const n = poses.length / POSE_STRIDE
  const out = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    out[2 * i] = poses[i * POSE_STRIDE]
    out[2 * i + 1] = poses[i * POSE_STRIDE + 1]
  }
  return out
}
