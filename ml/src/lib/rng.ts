/** Seeded PRNG (mulberry32). Every random choice in ml/ goes through this. */
export type Rng = () => number

export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal via Box-Muller. */
export function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

/** In-place Fisher-Yates shuffle. */
export function shuffle<T extends { length: number; [i: number]: number }>(a: T, rng: Rng): T {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

/** Derive an independent seed for a named sub-task, so adding a task never shifts others. */
export function subSeed(seed: number, name: string): number {
  let h = 2166136261 ^ seed
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619)
  return h >>> 0
}
