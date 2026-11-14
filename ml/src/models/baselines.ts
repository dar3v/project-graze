/** Baselines (D1/D4). Both are fit on training rows only. */
import type { Matrix } from '../featureSets.ts'
import type { Classifier } from './types.ts'

/** Predicts the training class frequencies for every row (argmax = majority class). */
export function fitMajority(y: Uint8Array, k: number): Classifier {
  const p = new Float32Array(k)
  for (const c of y) p[c]++
  for (let c = 0; c < k; c++) p[c] /= y.length
  return {
    family: 'majority',
    k,
    predictProba(m) {
      const out = new Float32Array(m.rows * k)
      for (let i = 0; i < m.rows; i++) out.set(p, i * k)
      return out
    },
  }
}

export const ELEVATION_BAND_M = 50

/**
 * Elevation-band rule: split elevation into 50 m bands; each band predicts its
 * training class distribution (add-one smoothed). Bands never seen in training
 * use the nearest seen band. A transparent, one-feature rule a forester could
 * write on a card; it encodes the known elevation zonation of these forests.
 */
export function fitElevationBand(elevation: Float64Array, y: Uint8Array, k: number, bandM = ELEVATION_BAND_M): Classifier & { bands: Map<number, Float32Array> } {
  const counts = new Map<number, Float64Array>()
  for (let i = 0; i < y.length; i++) {
    const b = Math.floor(elevation[i] / bandM)
    let c = counts.get(b)
    if (!c) counts.set(b, (c = new Float64Array(k)))
    c[y[i]]++
  }
  const bands = new Map<number, Float32Array>()
  for (const [b, c] of counts) {
    const total = c.reduce((a, v) => a + v, 0) + k
    bands.set(b, Float32Array.from(c, (v) => (v + 1) / total))
  }
  const keys = [...bands.keys()].sort((a, b) => a - b)
  const lookup = (b: number): Float32Array => {
    const hit = bands.get(b)
    if (hit) return hit
    let best = keys[0]
    for (const key of keys) if (Math.abs(key - b) < Math.abs(best - b)) best = key
    return bands.get(best)!
  }
  return {
    family: 'elevation-band',
    k,
    bands,
    predictProba(m: Matrix) {
      // Elevation is column 0 in every feature set (FEATURE_NAMES[0]).
      const out = new Float32Array(m.rows * k)
      for (let i = 0; i < m.rows; i++) out.set(lookup(Math.floor(m.data[i * m.cols] / bandM)), i * k)
      return out
    },
  }
}
