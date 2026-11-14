/**
 * Out-of-distribution detection (D6).
 *
 * Shipped method: "standardized-distance" (docs/feature-contract.md), the
 * root-mean-square z-score of the 9-value feature vector against the training
 * mean/std, i.e. a diagonal Mahalanobis distance divided by sqrt(d). This is
 * the method the app's runtime implements.
 *
 * For comparison only, the report also computes the full-covariance
 * Mahalanobis distance (same sqrt(d) normalisation), which accounts for
 * correlated features (e.g. the three hillshades) and catches unusual
 * combinations of individually normal values.
 */
import type { Matrix } from './featureSets.ts'

export interface StandardizedDetector {
  readonly method: 'standardized-distance'
  readonly mean: number[]
  readonly std: number[]
  threshold: number
}

export function fitStandardized(m: Matrix): StandardizedDetector {
  const mean = new Array<number>(m.cols).fill(0)
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) mean[c] += m.data[r * m.cols + c]
  for (let c = 0; c < m.cols; c++) mean[c] /= m.rows
  const std = new Array<number>(m.cols).fill(0)
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) std[c] += (m.data[r * m.cols + c] - mean[c]) ** 2
  for (let c = 0; c < m.cols; c++) std[c] = Math.sqrt(std[c] / m.rows) || 1
  return { method: 'standardized-distance', mean, std, threshold: Infinity }
}

/** Same formula as apps/web/src/lib/model/inference.ts `oodScore`. */
export function standardizedScores(det: StandardizedDetector, m: Matrix): Float64Array {
  const out = new Float64Array(m.rows)
  for (let r = 0; r < m.rows; r++) {
    let s = 0
    for (let c = 0; c < m.cols; c++) s += ((m.data[r * m.cols + c] - det.mean[c]) / det.std[c]) ** 2
    out[r] = Math.sqrt(s / m.cols)
  }
  return out
}

export interface MahalanobisDetector {
  readonly mean: number[]
  /** Lower-triangular Cholesky factor of the covariance, row-major d x d. */
  readonly chol: Float64Array
  threshold: number
}

export function fitMahalanobis(m: Matrix): MahalanobisDetector {
  const d = m.cols
  const mean = new Array<number>(d).fill(0)
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < d; c++) mean[c] += m.data[r * d + c]
  for (let c = 0; c < d; c++) mean[c] /= m.rows
  const cov = new Float64Array(d * d)
  for (let r = 0; r < m.rows; r++)
    for (let i = 0; i < d; i++) {
      const di = m.data[r * d + i] - mean[i]
      for (let j = 0; j <= i; j++) cov[i * d + j] += di * (m.data[r * d + j] - mean[j])
    }
  for (let i = 0; i < d; i++) for (let j = 0; j <= i; j++) cov[j * d + i] = cov[i * d + j] = cov[i * d + j] / m.rows
  // Small ridge keeps the factorisation stable for near-collinear features.
  for (let i = 0; i < d; i++) cov[i * d + i] += 1e-9 * (cov[i * d + i] || 1)
  const L = new Float64Array(d * d)
  for (let i = 0; i < d; i++)
    for (let j = 0; j <= i; j++) {
      let s = cov[i * d + j]
      for (let k = 0; k < j; k++) s -= L[i * d + k] * L[j * d + k]
      L[i * d + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * d + j]
    }
  return { mean, chol: L, threshold: Infinity }
}

export function mahalanobisScores(det: MahalanobisDetector, m: Matrix): Float64Array {
  const d = m.cols
  const out = new Float64Array(m.rows)
  const z = new Float64Array(d)
  for (let r = 0; r < m.rows; r++) {
    // Solve L z = (x - mean); distance^2 = |z|^2.
    let s = 0
    for (let i = 0; i < d; i++) {
      let v = m.data[r * d + i] - det.mean[i]
      for (let k = 0; k < i; k++) v -= det.chol[i * d + k] * z[k]
      z[i] = v / det.chol[i * d + i]
      s += z[i] * z[i]
    }
    out[r] = Math.sqrt(s / d)
  }
  return out
}

export function percentile(values: Float64Array, q: number): number {
  const sorted = Float64Array.from(values).sort()
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]
}

export function flaggedRate(scores: Float64Array, threshold: number): number {
  let n = 0
  for (const s of scores) if (s > threshold) n++
  return scores.length > 0 ? n / scores.length : 0
}

/**
 * True when a feature vector (FEATURE_NAMES order) is out of distribution for
 * the shipped detector: the same test the app runs (`oodScore > threshold`).
 */
export function isOOD(det: StandardizedDetector, vector: ArrayLike<number>): boolean {
  let s = 0
  for (let c = 0; c < vector.length; c++) s += ((vector[c] - det.mean[c]) / det.std[c]) ** 2
  return Math.sqrt(s / vector.length) > det.threshold
}
