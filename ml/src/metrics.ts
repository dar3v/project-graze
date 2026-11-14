/** Classification metrics (D5). Probabilities are row-major n x K Float32Arrays. */

export interface PerClass {
  readonly precision: number
  readonly recall: number
  readonly f1: number
  readonly support: number
}

export interface Metrics {
  readonly n: number
  readonly accuracy: number
  /** Mean F1 over classes with support > 0 in the evaluated rows. */
  readonly macroF1: number
  readonly logLoss: number | null
  readonly perClass: PerClass[]
  /** Rows = true class, columns = predicted class. */
  readonly confusionMatrix: number[][]
}

export function argmaxRows(probs: Float32Array, k: number): Uint8Array {
  const n = probs.length / k
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    let best = 0
    for (let c = 1; c < k; c++) if (probs[i * k + c] > probs[i * k + best]) best = c
    out[i] = best
  }
  return out
}

export function confusionMatrix(yTrue: Uint8Array, yPred: Uint8Array, k: number): number[][] {
  const m = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  for (let i = 0; i < yTrue.length; i++) m[yTrue[i]][yPred[i]]++
  return m
}

export function metricsFromConfusion(cm: number[][], logLoss: number | null = null): Metrics {
  const k = cm.length
  let n = 0
  let correct = 0
  const perClass: PerClass[] = []
  for (let c = 0; c < k; c++) {
    const support = cm[c].reduce((a, b) => a + b, 0)
    let predicted = 0
    for (let r = 0; r < k; r++) predicted += cm[r][c]
    const tp = cm[c][c]
    const precision = predicted > 0 ? tp / predicted : 0
    const recall = support > 0 ? tp / support : 0
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
    perClass.push({ precision, recall, f1, support })
    n += support
    correct += tp
  }
  const present = perClass.filter((p) => p.support > 0)
  const macroF1 = present.reduce((a, p) => a + p.f1, 0) / Math.max(1, present.length)
  return { n, accuracy: n > 0 ? correct / n : 0, macroF1, logLoss, perClass, confusionMatrix: cm }
}

export function logLoss(probs: Float32Array, y: Uint8Array, k: number): number {
  let s = 0
  for (let i = 0; i < y.length; i++) s -= Math.log(Math.max(1e-15, probs[i * k + y[i]]))
  return s / y.length
}

export function evaluate(probs: Float32Array, y: Uint8Array, k: number): Metrics {
  const pred = argmaxRows(probs, k)
  return metricsFromConfusion(confusionMatrix(y, pred, k), logLoss(probs, y, k))
}

export function macroF1Of(probs: Float32Array, y: Uint8Array, k: number): number {
  return metricsFromConfusion(confusionMatrix(y, argmaxRows(probs, k), k)).macroF1
}

/** Element-wise sum of confusion matrices (pooled over folds). */
export function addConfusion(a: number[][], b: number[][]): number[][] {
  return a.map((row, r) => row.map((v, c) => v + b[r][c]))
}

export interface CalibrationBin {
  readonly lower: number
  readonly upper: number
  readonly confidence: number
  readonly accuracy: number
  readonly count: number
}

/** Top-label reliability bins and expected calibration error. */
export function calibrationBins(probs: Float32Array, y: Uint8Array, k: number, nBins = 10): { ece: number; bins: CalibrationBin[] } {
  const conf = new Float64Array(nBins)
  const acc = new Float64Array(nBins)
  const count = new Float64Array(nBins)
  for (let i = 0; i < y.length; i++) {
    let best = 0
    for (let c = 1; c < k; c++) if (probs[i * k + c] > probs[i * k + best]) best = c
    const p = probs[i * k + best]
    const b = Math.min(nBins - 1, Math.floor(p * nBins))
    conf[b] += p
    acc[b] += best === y[i] ? 1 : 0
    count[b]++
  }
  let ece = 0
  const bins: CalibrationBin[] = []
  for (let b = 0; b < nBins; b++) {
    if (count[b] === 0) continue
    const cb = conf[b] / count[b]
    const ab = acc[b] / count[b]
    ece += (count[b] / y.length) * Math.abs(cb - ab)
    bins.push({ lower: b / nBins, upper: (b + 1) / nBins, confidence: cb, accuracy: ab, count: count[b] })
  }
  return { ece, bins }
}
