import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FEATURE_NAMES } from '../src/lib/deps/features.ts'
import { createEngine, modelPredictor } from '../src/lib/model/engine.ts'
import { parseModelJson, predictProbs, softmax, type ModelJson } from '../src/lib/model/inference.ts'
import { RAW_INPUT_DIM, writeSampleToBuffer } from '../src/lib/model/inputs.ts'
import { loadEngine, type FetchJson } from '../src/lib/model/loader.ts'
import { parseModelCard, type ModelCard } from '../src/lib/model/modelCard.ts'
import { rawCard, rawSoftmaxModel, SAMPLE } from './fixtures.ts'

function card(): ModelCard {
  const r = parseModelCard(rawCard())
  if (!r.ok) throw new Error(r.errors.join(' '))
  return r.card
}
function model(): ModelJson {
  const r = parseModelJson(rawSoftmaxModel(), 3)
  if (!r.ok) throw new Error(r.errors.join(' '))
  return r.model
}

test('parseModelCard rejects missing required sections and feature drift', () => {
  assert.equal(parseModelCard(null).ok, false)
  const noInputs = rawCard()
  delete noInputs.inputs
  assert.equal(parseModelCard(noInputs).ok, false)
  const drift = rawCard()
  drift.features = [...FEATURE_NAMES].reverse()
  const r = parseModelCard(drift)
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes('do not match the shared contract')))
})

test('parseModelCard drops malformed optional sections with a warning', () => {
  const raw = rawCard()
  raw.evaluations = [{ name: 'x', split: 'y', macroF1: 0.5, confusionMatrix: [[1, 2]] }]
  raw.limitations = ['Humans wrote this.']
  const r = parseModelCard(raw)
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.card.evaluations, undefined)
    assert.deepEqual(r.card.limitations, ['Humans wrote this.'])
    assert.ok(r.warnings.some((w) => w.includes('evaluations')))
  }
})

test('softmax sums to 1 and is stable for large logits', () => {
  const p = softmax([1000, 1001, 999])
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-12)
  assert.ok(p.every(Number.isFinite))
})

test('parseModelJson validates shapes and supported types', () => {
  assert.ok(parseModelJson(rawSoftmaxModel(), 3).ok)
  assert.equal(parseModelJson(rawSoftmaxModel(), 7).ok, false)
  const bad = rawSoftmaxModel()
  ;(bad.model as any).type = 'svm'
  assert.equal(parseModelJson(bad, 3).ok, false)
})

test('mlp and forest models run', () => {
  const d = FEATURE_NAMES.length
  const mlp = parseModelJson(
    {
      schemaVersion: 1,
      featureNames: [...FEATURE_NAMES],
      classCount: 2,
      model: {
        type: 'mlp',
        layers: [
          { weights: [new Array(d).fill(0.001), new Array(d).fill(-0.001)], bias: [0, 0], activation: 'relu' },
          { weights: [[1, 0], [0, 1]], bias: [0, 0], activation: 'linear' },
        ],
      },
    },
    2,
  )
  assert.ok(mlp.ok)
  if (mlp.ok) assert.ok(predictProbs(mlp.model, new Array(d).fill(1))[0] > 0.5)

  const forest = parseModelJson(
    {
      schemaVersion: 1,
      featureNames: [...FEATURE_NAMES],
      classCount: 2,
      model: { type: 'forest', trees: [{ feature: [0, -1, -1], threshold: [2500, 0, 0], left: [1, -1, -1], right: [2, -1, -1], value: [[0, 0], [3, 1], [0, 4]] }] },
    },
    2,
  )
  assert.ok(forest.ok)
  if (forest.ok) {
    assert.deepEqual(predictProbs(forest.model, [2000, ...new Array(d - 1).fill(0)]), [0.75, 0.25])
    assert.deepEqual(predictProbs(forest.model, [3000, ...new Array(d - 1).fill(0)]), [0, 1])
  }
})

test('predictOne returns the shared output shape with OOD reasons', () => {
  const engine = createEngine(card(), modelPredictor(model()))
  const p = engine.predictOne(SAMPLE)
  assert.equal(p.probs.length, 3)
  assert.equal(p.classIndex, 0) // high elevation favors class 0 in the fixture
  assert.equal(p.ood, false)

  const far = engine.predictOne({ ...SAMPLE, elevation: 4200 })
  assert.equal(far.ood, true)
  assert.deepEqual(far.outOfRange, ['elevation'])
  assert.match(far.oodReasons[0], /Elevation \(4200 m\) is outside/)

  const weird = engine.predictOne({ ...SAMPLE, horizontalDistanceToWater: 900, verticalDistanceToWater: 400, elevation: 3400, hillshade9am: 255 })
  assert.equal(typeof weird.ood, 'boolean')
})

test('detector flags unusual combinations even when every input is in range', () => {
  const m = rawSoftmaxModel()
  ;(m.ood as any).threshold = 0.1
  const parsed = parseModelJson(m, 3)
  assert.ok(parsed.ok)
  if (!parsed.ok) return
  const p = createEngine(card(), modelPredictor(parsed.model)).predictOne(SAMPLE)
  assert.equal(p.ood, true)
  assert.ok(p.oodReasons.some((r) => r.includes('unusual combination') || r.includes('combination of inputs is unusual')))
})

test('predictBatch handles valid and invalid cells', () => {
  const engine = createEngine(card(), modelPredictor(model()))
  const buf = new Float32Array(3 * RAW_INPUT_DIM)
  writeSampleToBuffer(buf, 0, SAMPLE)
  writeSampleToBuffer(buf, 1, { ...SAMPLE, elevation: 2100 })
  writeSampleToBuffer(buf, 2, { ...SAMPLE, slope: Number.NaN })
  const r = engine.predictBatch(buf)
  assert.equal(r.classIndex[0], 0)
  assert.equal(r.classIndex[1], 2)
  assert.equal(r.invalidCount, 1)
  assert.equal(r.ood[2], 1)
  assert.throws(() => engine.predictBatch(new Float32Array(5)))
})

test('explainOne returns a sentence and a sensitivity per input', () => {
  const engine = createEngine(card(), modelPredictor(model()))
  const e = engine.explainOne(SAMPLE)
  assert.equal(e.sensitivities.length, RAW_INPUT_DIM)
  const elev = e.sensitivities.find((s) => s.input === 'elevation')
  assert.ok(elev && elev.deltaUp[0] > 0 && elev.deltaDown[0] < 0)
  assert.match(e.sentence, /^The model predicts A \(\d+%\); it is most sensitive to elevation/)
  assert.ok(!e.sentence.includes('\n'))
})

test('loader: missing files are a visible error (no fallback predictor)', async () => {
  const missing: FetchJson = async (url) => {
    throw new Error(`${url} returned HTTP 404.`)
  }
  const out = await loadEngine(missing, '/model/')
  assert.equal(out.ok, false)
  if (!out.ok) assert.match(out.message, /404/)
})

test('loader: invalid model.json is a visible error, valid files load the real model', async () => {
  const files: Record<string, unknown> = { '/model/model_card.json': rawCard(), '/model/model.json': { nope: true } }
  const fetchJson: FetchJson = async (url) => files[url]
  const bad = await loadEngine(fetchJson, '/model/')
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.message, /model.json is invalid/)

  files['/model/model.json'] = rawSoftmaxModel()
  const good = await loadEngine(fetchJson, '/model/')
  assert.ok(good.ok)
  if (good.ok) assert.deepEqual(good.engine.card.classes, card().classes)
})
