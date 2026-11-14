/**
 * Softmax regression and small MLP, from scratch (no ML dependency, see
 * docs/notes.md). Softmax regression is the zero-hidden-layer case.
 *
 * Training: standardized inputs (scaler fit on the training matrix only),
 * cross-entropy with optional class weights, L2 on weights, Adam, mini-batches,
 * cosine learning-rate decay, fixed epochs. Deterministic given the seed.
 */
import { createRng, gaussian, shuffle } from '../lib/rng.ts'
import { fitScaler, type Matrix, type Scaler } from '../featureSets.ts'
import { classWeights, type Classifier, type ClassWeighting } from './types.ts'

export interface NetworkConfig {
  /** Hidden layer widths; [] = softmax regression. */
  readonly hidden: readonly number[]
  readonly epochs: number
  readonly batchSize: number
  readonly learningRate: number
  readonly l2: number
  readonly classWeighting: ClassWeighting
  readonly seed: number
}

interface Layer {
  readonly inDim: number
  readonly outDim: number
  /** [out][in] row-major. */
  readonly w: Float64Array
  readonly b: Float64Array
  readonly activation: 'relu' | 'linear'
}

export interface NetworkModel extends Classifier {
  readonly scaler: Scaler
  readonly layers: readonly Layer[]
  readonly config: NetworkConfig
  /** Pre-softmax outputs for standardized-on-the-fly inputs. */
  logits(m: Matrix): Float64Array
}

function forwardRow(layers: readonly Layer[], x: Float64Array, acts: Float64Array[]): void {
  let input = x
  for (let l = 0; l < layers.length; l++) {
    const L = layers[l]
    const out = acts[l]
    for (let o = 0; o < L.outDim; o++) {
      let s = L.b[o]
      const off = o * L.inDim
      for (let i = 0; i < L.inDim; i++) s += L.w[off + i] * input[i]
      out[o] = L.activation === 'relu' && s < 0 ? 0 : s
    }
    input = out
  }
}

function softmaxInPlace(z: Float64Array): void {
  let max = -Infinity
  for (const v of z) if (v > max) max = v
  let s = 0
  for (let i = 0; i < z.length; i++) {
    z[i] = Math.exp(z[i] - max)
    s += z[i]
  }
  for (let i = 0; i < z.length; i++) z[i] /= s
}

function makeModel(layers: Layer[], scaler: Scaler, k: number, config: NetworkConfig): NetworkModel {
  const d = scaler.mean.length
  const logits = (m: Matrix): Float64Array => {
    const out = new Float64Array(m.rows * k)
    const x = new Float64Array(d)
    const acts = layers.map((L) => new Float64Array(L.outDim))
    for (let r = 0; r < m.rows; r++) {
      for (let j = 0; j < d; j++) x[j] = (m.data[r * d + j] - scaler.mean[j]) / scaler.std[j]
      forwardRow(layers, x, acts)
      out.set(acts[acts.length - 1], r * k)
    }
    return out
  }
  return {
    family: config.hidden.length === 0 ? 'softmax' : 'mlp',
    k,
    scaler,
    layers,
    config,
    logits,
    predictProba(m) {
      const z = logits(m)
      const out = new Float32Array(z.length)
      const row = new Float64Array(k)
      for (let r = 0; r < m.rows; r++) {
        for (let c = 0; c < k; c++) row[c] = z[r * k + c]
        softmaxInPlace(row)
        for (let c = 0; c < k; c++) out[r * k + c] = row[c]
      }
      return out
    },
  }
}

export function trainNetwork(m: Matrix, y: Uint8Array, k: number, config: NetworkConfig): NetworkModel {
  const rng = createRng(config.seed)
  const scaler = fitScaler(m)
  const d = m.cols
  const dims = [d, ...config.hidden, k]
  const layers: Layer[] = []
  for (let l = 0; l < dims.length - 1; l++) {
    const inDim = dims[l]
    const outDim = dims[l + 1]
    const last = l === dims.length - 2
    // He init for ReLU layers; small Glorot-like init for the output layer.
    const scale = last ? Math.sqrt(1 / inDim) : Math.sqrt(2 / inDim)
    const w = new Float64Array(outDim * inDim)
    for (let i = 0; i < w.length; i++) w[i] = gaussian(rng) * scale
    layers.push({ inDim, outDim, w, b: new Float64Array(outDim), activation: last ? 'linear' : 'relu' })
  }
  const cw = classWeights(y, k, config.classWeighting)

  // Standardize once.
  const xs = new Float64Array(m.data.length)
  for (let r = 0; r < m.rows; r++) for (let j = 0; j < d; j++) xs[r * d + j] = (m.data[r * d + j] - scaler.mean[j]) / scaler.std[j]

  const gw = layers.map((L) => new Float64Array(L.w.length))
  const gb = layers.map((L) => new Float64Array(L.b.length))
  const mw = layers.map((L) => new Float64Array(L.w.length))
  const vw = layers.map((L) => new Float64Array(L.w.length))
  const mb = layers.map((L) => new Float64Array(L.b.length))
  const vb = layers.map((L) => new Float64Array(L.b.length))
  const acts = layers.map((L) => new Float64Array(L.outDim))
  const deltas = layers.map((L) => new Float64Array(L.outDim))
  const beta1 = 0.9
  const beta2 = 0.999
  const eps = 1e-8
  let step = 0

  const order = new Uint32Array(m.rows)
  for (let i = 0; i < m.rows; i++) order[i] = i
  const stepsPerEpoch = Math.ceil(m.rows / config.batchSize)
  const totalSteps = stepsPerEpoch * config.epochs

  for (let epoch = 0; epoch < config.epochs; epoch++) {
    shuffle(order, rng)
    for (let start = 0; start < m.rows; start += config.batchSize) {
      const end = Math.min(m.rows, start + config.batchSize)
      for (let l = 0; l < layers.length; l++) {
        gw[l].fill(0)
        gb[l].fill(0)
      }
      let batchWeight = 0
      for (let bi = start; bi < end; bi++) {
        const r = order[bi]
        const x = xs.subarray(r * d, (r + 1) * d)
        forwardRow(layers, x, acts)
        const out = deltas[layers.length - 1]
        out.set(acts[layers.length - 1])
        softmaxInPlace(out)
        const sw = cw[y[r]]
        batchWeight += sw
        // dL/dz = w * (p - onehot)
        for (let c = 0; c < k; c++) out[c] = sw * (out[c] - (c === y[r] ? 1 : 0))
        for (let l = layers.length - 1; l >= 0; l--) {
          const L = layers[l]
          const input = l === 0 ? x : acts[l - 1]
          const delta = deltas[l]
          const g = gw[l]
          for (let o = 0; o < L.outDim; o++) {
            const dv = delta[o]
            if (dv === 0) continue
            gb[l][o] += dv
            const off = o * L.inDim
            for (let i = 0; i < L.inDim; i++) g[off + i] += dv * input[i]
          }
          if (l > 0) {
            const prev = deltas[l - 1]
            const prevAct = acts[l - 1]
            for (let i = 0; i < L.inDim; i++) {
              if (prevAct[i] <= 0) {
                prev[i] = 0
                continue
              }
              let s = 0
              for (let o = 0; o < L.outDim; o++) s += L.w[o * L.inDim + i] * delta[o]
              prev[i] = s
            }
          }
        }
      }
      step++
      const lr = config.learningRate * 0.5 * (1 + Math.cos((Math.PI * (step - 1)) / totalSteps))
      const bc1 = 1 - beta1 ** step
      const bc2 = 1 - beta2 ** step
      const norm = 1 / Math.max(batchWeight, 1e-12)
      for (let l = 0; l < layers.length; l++) {
        const L = layers[l]
        for (let i = 0; i < L.w.length; i++) {
          const g = gw[l][i] * norm + config.l2 * L.w[i]
          mw[l][i] = beta1 * mw[l][i] + (1 - beta1) * g
          vw[l][i] = beta2 * vw[l][i] + (1 - beta2) * g * g
          L.w[i] -= (lr * (mw[l][i] / bc1)) / (Math.sqrt(vw[l][i] / bc2) + eps)
        }
        for (let i = 0; i < L.b.length; i++) {
          const g = gb[l][i] * norm
          mb[l][i] = beta1 * mb[l][i] + (1 - beta1) * g
          vb[l][i] = beta2 * vb[l][i] + (1 - beta2) * g * g
          L.b[i] -= (lr * (mb[l][i] / bc1)) / (Math.sqrt(vb[l][i] / bc2) + eps)
        }
      }
    }
  }
  return makeModel(layers, scaler, k, config)
}

/**
 * Fold a temperature into the last layer (logits / T) so the exported model
 * needs no extra field: softmax(z / T) == softmax((W x + b) / T).
 */
export function withTemperature(model: NetworkModel, t: number): NetworkModel {
  const layers = model.layers.map((L, i) =>
    i === model.layers.length - 1 ? { ...L, w: L.w.map((v) => v / t), b: L.b.map((v) => v / t) } : L,
  )
  return makeModel(layers, model.scaler, model.k, model.config)
}
