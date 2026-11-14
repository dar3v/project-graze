/**
 * Seeded PRNG (mulberry32). The whole generator state is one uint32, so it can
 * live inside the plain-data SimState and the simulation stays deterministic
 * and serializable for a given seed.
 */

/** Normalize any number (including negatives and floats) to a uint32 seed. */
export function seedToState(seed: number): number {
  if (!Number.isFinite(seed)) return 0x9e3779b9
  return Math.trunc(seed) >>> 0
}

/** Advance the state; returns [nextState, valueIn0to1]. */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [next, value]
}

/** Small mutable wrapper used inside one simulation step. */
export class Rng {
  state: number
  constructor(state: number) {
    this.state = state >>> 0
  }
  next(): number {
    const [s, v] = nextRandom(this.state)
    this.state = s
    return v
  }
  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n)
  }
}
