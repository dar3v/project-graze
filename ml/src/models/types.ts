import type { Matrix } from '../featureSets.ts'

export type ModelFamily = 'majority' | 'elevation-band' | 'softmax' | 'mlp' | 'forest'

/** Simplest first. Used by the selection rule's tie-break (docs/notes.md). */
export const SIMPLICITY_ORDER: readonly ModelFamily[] = ['majority', 'elevation-band', 'softmax', 'mlp', 'forest']

export interface Classifier {
  readonly family: ModelFamily
  readonly k: number
  /** n x k row-major class probabilities. */
  predictProba(m: Matrix): Float32Array
}

export type ClassWeighting = 'none' | 'sqrt-balanced'

/**
 * Per-class sample weights. 'sqrt-balanced': w_c proportional to
 * 1/sqrt(frequency_c), normalized so the average weight over samples is 1.
 * (Full 1/frequency balancing over-weights Cottonwood/Willow, which is <1% of rows.)
 */
export function classWeights(y: Uint8Array, k: number, mode: ClassWeighting): Float64Array {
  const w = new Float64Array(k).fill(1)
  if (mode === 'none') return w
  const counts = new Float64Array(k)
  for (const c of y) counts[c]++
  let total = 0
  for (let c = 0; c < k; c++) {
    w[c] = counts[c] > 0 ? 1 / Math.sqrt(counts[c]) : 0
    total += w[c] * counts[c]
  }
  for (let c = 0; c < k; c++) w[c] *= y.length / total
  return w
}

/** Raise probabilities to 1/T and renormalise: temperature scaling expressed on probabilities. */
export function applyTemperature(probs: Float32Array, k: number, t: number): Float32Array {
  if (t === 1) return probs
  const out = new Float32Array(probs.length)
  const n = probs.length / k
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let c = 0; c < k; c++) {
      const v = Math.exp(Math.log(Math.max(probs[i * k + c], 1e-12)) / t)
      out[i * k + c] = v
      s += v
    }
    for (let c = 0; c < k; c++) out[i * k + c] /= s
  }
  return out
}
