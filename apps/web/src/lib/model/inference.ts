/**
 * Pure model runtime for model.json (format proposal in
 * docs/feature-contract.md). Runs inside the Web Worker; no I/O, no DOM.
 *
 * Supported `model.type`s match the candidates in README.md:
 *   - "softmax": multinomial logistic regression
 *   - "mlp":     small neural network (last layer is softmaxed)
 *   - "forest":  random forest (leaf values are class probabilities, averaged)
 * If Role 3 exports anything else, loading fails with a visible error.
 */

import { FEATURE_NAMES } from '../deps/features.ts'

export type Activation = 'relu' | 'tanh' | 'linear'

export interface SoftmaxModel {
  readonly type: 'softmax'
  /** [class][feature] */
  readonly weights: readonly (readonly number[])[]
  readonly bias: readonly number[]
}

export interface MlpModel {
  readonly type: 'mlp'
  readonly layers: readonly {
    /** [out][in] */
    readonly weights: readonly (readonly number[])[]
    readonly bias: readonly number[]
    readonly activation: Activation
  }[]
}

export interface ForestModel {
  readonly type: 'forest'
  /** Flat sklearn-style trees. Leaf: feature[i] < 0. Split: x[feature] <= threshold -> left. */
  readonly trees: readonly {
    readonly feature: readonly number[]
    readonly threshold: readonly number[]
    readonly left: readonly number[]
    readonly right: readonly number[]
    readonly value: readonly (readonly number[])[]
  }[]
}

export interface OodDetector {
  /** Root-mean-square z-score of the feature vector against training mean/std. */
  readonly method: 'standardized-distance'
  readonly mean: readonly number[]
  readonly std: readonly number[]
  readonly threshold: number
}

export interface ModelJson {
  readonly schemaVersion: number
  readonly featureNames: readonly string[]
  readonly classCount: number
  /** Applied to the feature vector before the model, when present. */
  readonly scaler?: { readonly mean: readonly number[]; readonly std: readonly number[] }
  readonly ood?: OodDetector
  readonly model: SoftmaxModel | MlpModel | ForestModel
}

export type ModelResult = { readonly ok: true; readonly model: ModelJson } | { readonly ok: false; readonly errors: readonly string[] }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec = (v: unknown, len?: number): v is number[] => Array.isArray(v) && v.every(isNum) && (len === undefined || v.length === len)
const isMat = (v: unknown, rows: number, cols: number): boolean => Array.isArray(v) && v.length === rows && v.every((r) => isVec(r, cols))

export function parseModelJson(raw: unknown, classCount: number): ModelResult {
  const errors: string[] = []
  if (!isObj(raw)) return { ok: false, errors: ['model.json is not a JSON object.'] }
  const d = FEATURE_NAMES.length
  if (!Array.isArray(raw.featureNames) || raw.featureNames.join(',') !== FEATURE_NAMES.join(',')) {
    errors.push('model.json featureNames do not match the shared feature contract.')
  }
  if (raw.classCount !== classCount) errors.push(`model.json classCount (${String(raw.classCount)}) does not match model_card.json (${classCount}).`)
  if (raw.scaler !== undefined) {
    const s = raw.scaler
    if (!isObj(s) || !isVec(s.mean, d) || !isVec(s.std, d) || (s.std as number[]).some((x) => x <= 0)) {
      errors.push(`scaler needs mean and std arrays of length ${d} with std > 0.`)
    }
  }
  if (raw.ood !== undefined) {
    const o = raw.ood
    if (!isObj(o) || o.method !== 'standardized-distance' || !isVec(o.mean, d) || !isVec(o.std, d) || !isNum(o.threshold) || (o.std as number[]).some((x) => x <= 0)) {
      errors.push('ood must be { method: "standardized-distance", mean, std, threshold }.')
    }
  }
  const m = raw.model
  if (!isObj(m)) errors.push('model.json needs a "model" object.')
  else if (m.type === 'softmax') {
    if (!isMat(m.weights, classCount, d) || !isVec(m.bias, classCount)) errors.push(`softmax needs weights [${classCount}][${d}] and bias [${classCount}].`)
  } else if (m.type === 'mlp') {
    if (!Array.isArray(m.layers) || m.layers.length === 0) errors.push('mlp needs at least one layer.')
    else {
      let inDim: number = d
      m.layers.forEach((l, i) => {
        if (!isObj(l) || !Array.isArray(l.weights) || l.weights.length === 0) {
          errors.push(`mlp layer ${i} is malformed.`)
          return
        }
        const out = l.weights.length
        if (!isMat(l.weights, out, inDim) || !isVec(l.bias, out)) errors.push(`mlp layer ${i} expects weights [out][${inDim}] and bias [out].`)
        if (l.activation !== 'relu' && l.activation !== 'tanh' && l.activation !== 'linear') errors.push(`mlp layer ${i} activation must be relu, tanh or linear.`)
        inDim = out
      })
      if (inDim !== classCount) errors.push(`mlp output size ${inDim} does not match ${classCount} classes.`)
    }
  } else if (m.type === 'forest') {
    if (!Array.isArray(m.trees) || m.trees.length === 0) errors.push('forest needs at least one tree.')
    else
      m.trees.forEach((t, i) => {
        if (!isObj(t) || !isVec(t.feature) || !isVec(t.threshold) || !isVec(t.left) || !isVec(t.right) || !Array.isArray(t.value)) {
          errors.push(`forest tree ${i} is malformed.`)
          return
        }
        const n = (t.feature as number[]).length
        const sizesOk = [t.threshold, t.left, t.right, t.value].every((a) => (a as unknown[]).length === n)
        const valuesOk = (t.value as unknown[]).every((v) => isVec(v, classCount))
        const featOk = (t.feature as number[]).every((f) => f < d)
        if (!sizesOk || !valuesOk || !featOk) errors.push(`forest tree ${i} has inconsistent arrays.`)
      })
  } else errors.push(`Unsupported model type "${String(m.type)}". Supported: softmax, mlp, forest.`)

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, model: raw as unknown as ModelJson }
}

export function softmax(logits: readonly number[]): number[] {
  const max = Math.max(...logits)
  const exps = logits.map((z) => Math.exp(z - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}

function activate(v: number, a: Activation): number {
  if (a === 'relu') return v > 0 ? v : 0
  if (a === 'tanh') return Math.tanh(v)
  return v
}

function dense(x: readonly number[], w: readonly (readonly number[])[], b: readonly number[]): number[] {
  return w.map((row, j) => row.reduce((acc, wij, i) => acc + wij * x[i], b[j]))
}

function scale(m: ModelJson, x: readonly number[]): number[] {
  if (!m.scaler) return [...x]
  const { mean, std } = m.scaler
  return x.map((v, i) => (v - mean[i]) / std[i])
}

/** Class probabilities for one feature vector (FEATURE_NAMES order). */
export function predictProbs(m: ModelJson, features: readonly number[]): number[] {
  const x = scale(m, features)
  const model = m.model
  if (model.type === 'softmax') return softmax(dense(x, model.weights, model.bias))
  if (model.type === 'mlp') {
    let h = x
    for (const layer of model.layers) h = dense(h, layer.weights, layer.bias).map((v) => activate(v, layer.activation))
    return softmax(h)
  }
  const acc = new Array<number>(m.classCount).fill(0)
  for (const tree of model.trees) {
    let node = 0
    while (tree.feature[node] >= 0) node = x[tree.feature[node]] <= tree.threshold[node] ? tree.left[node] : tree.right[node]
    const leaf = tree.value[node]
    const total = leaf.reduce((a, b) => a + b, 0) || 1
    leaf.forEach((v, k) => (acc[k] += v / total))
  }
  return acc.map((v) => v / model.trees.length)
}

/** True when the detector flags the feature vector as unlike the training data. */
export function oodScore(m: ModelJson, features: readonly number[]): number | null {
  const o = m.ood
  if (!o) return null
  let s = 0
  for (let i = 0; i < features.length; i++) s += ((features[i] - o.mean[i]) / o.std[i]) ** 2
  return Math.sqrt(s / features.length)
}

export function argmax(v: readonly number[]): number {
  let best = 0
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i
  return best
}
