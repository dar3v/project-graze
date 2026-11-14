/**
 * PLACEHOLDER terrain generator from before Role 1's world landed. The app no
 * longer uses it; it stays only because ml/src/train.ts builds its
 * generated-terrain evaluation with it. Moving training onto Role 1's
 * generateTerrain (architecture review candidate 2) deletes this file.
 *
 * Model inputs are NOT computed here: use heightmapToInputs from
 * @graze/features, the only terrain -> inputs implementation.
 */

export const GRID = 128
export const CELL_SIZE_M = 30

function hash(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(seed, xi, yi)
  const b = hash(seed, xi + 1, yi)
  const c = hash(seed, xi, yi + 1)
  const d = hash(seed, xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** Seeded fBm heightmap normalized to [0, 1]. */
export function generateHeightmap(seed: number, size = GRID): Float32Array {
  const raw = new Float64Array(size * size)
  let lo = Infinity
  let hi = -Infinity
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 1
      let freq = 1 / 40
      let v = 0
      for (let o = 0; o < 5; o++) {
        v += amp * valueNoise(seed + o * 1013, x * freq, y * freq)
        amp *= 0.5
        freq *= 2
      }
      // Valley shape: lower in the middle columns.
      v -= 0.35 * Math.exp(-(((x - size / 2) / (size / 4)) ** 2))
      raw[y * size + x] = v
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  }
  const span = hi - lo || 1
  const out = new Float32Array(size * size)
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (raw[i] - lo) / span))
  return out
}

export function scaleHeightmap(h01: Float32Array, minM: number, maxM: number): Float32Array {
  return h01.map((v) => minM + v * (maxM - minM))
}

export function quantile(values: Float32Array, q: number): number {
  if (values.length === 0) return 0
  const sorted = Float32Array.from(values).sort()
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]
}
