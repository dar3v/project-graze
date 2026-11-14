/**
 * Seeded value noise and fBm. Pure integer hashing, no Math.random, so the
 * same seed gives bit-identical output on every machine and in Node tests.
 */

/** Hash (seed, x, y) to a float in [0, 1). */
export function hash2(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smoothly interpolated value noise in [0, 1]. */
export function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash2(seed, xi, yi)
  const b = hash2(seed, xi + 1, yi)
  const c = hash2(seed, xi, yi + 1)
  const d = hash2(seed, xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

export interface FbmOptions {
  /** Number of noise layers. */
  readonly octaves: number
  /** Frequency of the first octave, in cycles per cell. */
  readonly baseFrequency: number
  /** Amplitude multiplier per octave (0..1). Higher = rougher terrain. */
  readonly persistence: number
  /** Frequency multiplier per octave. */
  readonly lacunarity: number
}

/**
 * Fractal Brownian motion: a sum of value-noise octaves. Each octave uses a
 * different derived seed so octaves do not line up. Output is not normalized.
 */
export function fbm(seed: number, x: number, y: number, o: FbmOptions): number {
  let amp = 1
  let freq = o.baseFrequency
  let v = 0
  for (let k = 0; k < o.octaves; k++) {
    v += amp * valueNoise((seed + k * 1013) | 0, x * freq, y * freq)
    amp *= o.persistence
    freq *= o.lacunarity
  }
  return v
}
