import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FEATURE_NAMES } from '../../packages/features/src/index.ts'
import { parseModelJson, predictProbs } from '../../apps/web/src/lib/model/inference.ts'
import { createRng, gaussian } from '../src/lib/rng.ts'
import type { Matrix } from '../src/featureSets.ts'
import { evaluate } from '../src/metrics.ts'
import { trainForest, type ForestModel } from '../src/models/forest.ts'
import { trainNetwork, withTemperature } from '../src/models/network.ts'
import { fitElevationBand, fitMajority } from '../src/models/baselines.ts'
import { applyTemperature, classWeights } from '../src/models/types.ts'
import { exportModelJson, roundForest } from '../src/export.ts'
import { fitStandardized, standardizedScores } from '../src/ood.ts'

const K = 7
const D = FEATURE_NAMES.length

/** Gaussian blobs: class c centred at c on feature c % D. Learnable but not trivial. */
function blobs(n: number, seed: number): { x: Matrix; y: Uint8Array } {
  const rng = createRng(seed)
  const data = new Float64Array(n * D)
  const y = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    y[i] = i % K
    for (let j = 0; j < D; j++) data[i * D + j] = gaussian(rng) * 0.5 + (j === y[i] % D ? 3 : 0)
  }
  return { x: { rows: n, cols: D, data }, y }
}

const train = blobs(3000, 1)
const val = blobs(1000, 2)

test('softmax, MLP and forest learn separable blobs; training is deterministic', () => {
  const soft = trainNetwork(train.x, train.y, K, { hidden: [], epochs: 5, batchSize: 64, learningRate: 0.05, l2: 0, classWeighting: 'none', seed: 1 })
  const mlp = trainNetwork(train.x, train.y, K, { hidden: [16], epochs: 5, batchSize: 64, learningRate: 0.01, l2: 0, classWeighting: 'none', seed: 1 })
  const forest = trainForest(train.x, train.y, K, { trees: 10, maxDepth: 8, minLeaf: 2, mtry: 0, maxSamples: 3000, bins: 32, classWeighting: 'none', seed: 1 })
  for (const m of [soft, mlp, forest]) assert.ok(evaluate(m.predictProba(val.x), val.y, K).accuracy > 0.9, m.family)
  const again = trainForest(train.x, train.y, K, { trees: 10, maxDepth: 8, minLeaf: 2, mtry: 0, maxSamples: 3000, bins: 32, classWeighting: 'none', seed: 1 })
  assert.deepEqual(forest.predictProba(val.x), again.predictProba(val.x))
})

test('exported networks and forests give the same probabilities in the app runtime', () => {
  const ood = fitStandardized(train.x)
  ood.threshold = 2
  const mlp = withTemperature(trainNetwork(train.x, train.y, K, { hidden: [8, 8], epochs: 2, batchSize: 64, learningRate: 0.01, l2: 0, classWeighting: 'sqrt-balanced', seed: 3 }), 1.7)
  const soft = trainNetwork(train.x, train.y, K, { hidden: [], epochs: 2, batchSize: 64, learningRate: 0.05, l2: 1e-4, classWeighting: 'none', seed: 3 })
  const forest = roundForest(trainForest(train.x, train.y, K, { trees: 5, maxDepth: 6, minLeaf: 5, mtry: 0, maxSamples: 3000, bins: 16, classWeighting: 'sqrt-balanced', seed: 3 }), K) as ForestModel
  for (const model of [mlp, soft, forest]) {
    const json = JSON.parse(JSON.stringify(exportModelJson(model, ood, 1.7)))
    const parsed = parseModelJson(json, K)
    assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join(' '))
    if (!parsed.ok) continue
    const ours = model.predictProba(val.x)
    for (let r = 0; r < 50; r++) {
      const app = predictProbs(parsed.model, Array.from(val.x.data.subarray(r * D, (r + 1) * D)))
      for (let c = 0; c < K; c++) assert.ok(Math.abs(app[c] - ours[r * K + c]) < 1e-6, `${model.family} row ${r} class ${c}`)
    }
  }
})

test('temperature folded into the last layer equals temperature applied to probabilities', () => {
  const net = trainNetwork(train.x, train.y, K, { hidden: [8], epochs: 1, batchSize: 64, learningRate: 0.01, l2: 0, classWeighting: 'none', seed: 4 })
  const a = applyTemperature(net.predictProba(val.x), K, 2.5)
  const b = withTemperature(net, 2.5).predictProba(val.x)
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-5)
})

test('baselines and class weights', () => {
  const y = Uint8Array.from([0, 0, 0, 1])
  const maj = fitMajority(y, 2).predictProba({ rows: 1, cols: 1, data: Float64Array.from([0]) })
  assert.deepEqual(Array.from(maj), [0.75, 0.25])
  const band = fitElevationBand(Float64Array.from([1000, 1010, 3000]), Uint8Array.from([0, 0, 1]), 2)
  const p = band.predictProba({ rows: 2, cols: 1, data: Float64Array.from([1020, 5000]) })
  assert.ok(p[0] > p[1] && p[3] > p[2])
  const w = classWeights(Uint8Array.from([0, 0, 0, 0, 1]), 2, 'sqrt-balanced')
  assert.ok(w[1] > w[0])
  assert.ok(Math.abs((4 * w[0] + w[1]) / 5 - 1) < 1e-12)
})

test('standardized OOD score matches the contract formula', () => {
  const det = fitStandardized(train.x)
  const s = standardizedScores(det, val.x)
  let manual = 0
  for (let j = 0; j < D; j++) manual += ((val.x.data[j] - det.mean[j]) / det.std[j]) ** 2
  assert.ok(Math.abs(s[0] - Math.sqrt(manual / D)) < 1e-12)
})
