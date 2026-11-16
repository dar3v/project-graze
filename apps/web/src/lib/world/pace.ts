/**
 * Animal pace in ground-level views (D16). Three-free and pure, unit-tested.
 *
 * The herd sim was tuned to be watched from above: at its normal rate an
 * animal crosses a dozen cells a second, which from eye level is a blur. In
 * walk mode and in the ambient backdrop the sim CLOCK is therefore slowed
 * until a typical moving animal covers about `ANIMAL_PACE` x `WALK_SPEED`
 * cells a second. Nothing else changes: the same ticks happen in the same
 * order, only further apart in real time (Role 2's `SimClock`, and its
 * determinism test, in packages/sim/herd).
 *
 * The scale is computed from the ecology rules (`medianMovingSpeed` in
 * packages/sim/herd), never hand-set, so editing `ecology.json` keeps the pace
 * right. It only ever slows the sim down.
 */

import { WALK_SPEED } from './walk.ts'

/** A typical moving animal goes this fraction of the walker's speed. Role 1 owns this number. */
export const ANIMAL_PACE = 0.9

/**
 * The sim time scale that brings a median moving speed (cells per second at
 * full sim speed) down to walking pace. Never above 1: it does not speed the
 * sim up when the animals are already slow.
 */
export function paceScale(medianMovingSpeed: number): number {
  if (!(medianMovingSpeed > 0) || !Number.isFinite(medianMovingSpeed)) return 1
  return Math.min(1, (ANIMAL_PACE * WALK_SPEED) / medianMovingSpeed)
}

/** The "Animal speed" control. `match` is the default. */
export type AnimalSpeed = 'match' | 'x2' | 'x4' | 'full' | 'paused'

export const ANIMAL_SPEEDS: readonly { readonly id: AnimalSpeed; readonly label: string }[] = [
  { id: 'match', label: 'Match walker' },
  { id: 'x2', label: '2×' },
  { id: 'x4', label: '4×' },
  { id: 'full', label: 'Full sim speed' },
  { id: 'paused', label: 'Paused' },
]

export const DEFAULT_ANIMAL_SPEED: AnimalSpeed = 'match'

export function isAnimalSpeed(v: unknown): v is AnimalSpeed {
  return ANIMAL_SPEEDS.some((s) => s.id === v)
}

export function animalSpeedLabel(choice: AnimalSpeed): string {
  return ANIMAL_SPEEDS.find((s) => s.id === choice)?.label ?? choice
}

/** The next choice, for the key that cycles the control. */
export function nextAnimalSpeed(choice: AnimalSpeed): AnimalSpeed {
  const i = ANIMAL_SPEEDS.findIndex((s) => s.id === choice)
  return ANIMAL_SPEEDS[(i + 1) % ANIMAL_SPEEDS.length].id
}

/**
 * Sim time scale (0..1) for a choice, given the walking-pace scale. 2× and
 * 4× are multiples of walking pace, never faster than the full sim speed.
 */
export function animalTimeScale(choice: AnimalSpeed, pace: number): number {
  switch (choice) {
    case 'paused':
      return 0
    case 'full':
      return 1
    case 'x2':
      return Math.min(1, pace * 2)
    case 'x4':
      return Math.min(1, pace * 4)
    default:
      return Math.min(1, pace)
  }
}

/** Animals that moved less than this many cells between two readings count as standing. */
const MOVING_EPSILON = 1e-3

interface Track {
  last: Float32Array | null
  path: Float32Array
}

/**
 * Measures how fast the animals actually move on screen, for the `P`
 * readout. Feed it every pose array the renderer is given; `read()` returns
 * the median speed of the animals that moved since the last reading, in
 * cells per second.
 *
 * Pose arrays carry no ids, so an animal is followed by its index. When a
 * species' count changes (a birth or a death reorders the array) that
 * species starts over, which costs one reading at most.
 */
export class PaceMeter {
  #tracks: [Track, Track] = [
    { last: null, path: new Float32Array(0) },
    { last: null, path: new Float32Array(0) },
  ]
  #since: number | null = null
  #now = 0

  /** `nowS` is any clock in seconds (the renderer passes `performance.now() / 1000`). */
  sample(herbivores: Float32Array | null, predators: Float32Array | null, stride: number, nowS: number): void {
    this.#since ??= nowS
    this.#now = nowS
    this.#one(this.#tracks[0], herbivores, stride)
    this.#one(this.#tracks[1], predators, stride)
  }

  #one(track: Track, poses: Float32Array | null, stride: number): void {
    const n = poses ? Math.floor(poses.length / stride) : 0
    if (!poses || n === 0) {
      track.last = null
      track.path = new Float32Array(0)
      return
    }
    const xy = new Float32Array(n * 2)
    for (let k = 0; k < n; k++) {
      xy[k * 2] = poses[k * stride]
      xy[k * 2 + 1] = poses[k * stride + 1]
    }
    if (!track.last || track.last.length !== xy.length) {
      track.path = new Float32Array(n)
    } else {
      for (let k = 0; k < n; k++) track.path[k] += Math.hypot(xy[k * 2] - track.last[k * 2], xy[k * 2 + 1] - track.last[k * 2 + 1])
    }
    track.last = xy
  }

  /** Median speed of the moving animals since the last reading (cells per second), or 0 if none moved. */
  read(): number {
    const elapsed = this.#since === null ? 0 : this.#now - this.#since
    const speeds: number[] = []
    for (const track of this.#tracks) {
      if (elapsed > 0) for (const p of track.path) if (p > MOVING_EPSILON) speeds.push(p / elapsed)
      track.path.fill(0)
    }
    this.#since = this.#now
    if (speeds.length === 0) return 0
    speeds.sort((a, b) => a - b)
    const mid = speeds.length >> 1
    return speeds.length % 2 ? speeds[mid] : (speeds[mid - 1] + speeds[mid]) / 2
  }

  reset(): void {
    for (const track of this.#tracks) {
      track.last = null
      track.path = new Float32Array(0)
    }
    this.#since = null
  }
}
