/**
 * Model inference against stored fixtures (required test, docs/roles/ml.md).
 * Runs the APP runtime (apps/web/src/lib/model) on the shipped model.json and
 * compares with the probabilities the training pipeline recorded.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { sampleToVector, type TerrainSample } from '../../packages/features/src/index.ts'
import { createEngine, modelPredictor } from '../../apps/web/src/lib/model/engine.ts'
import { argmax, oodScore, parseModelJson, predictProbs } from '../../apps/web/src/lib/model/inference.ts'
import { parseModelCard } from '../../apps/web/src/lib/model/modelCard.ts'
import { FIXTURES_PATH, MODEL_OUT_DIR } from '../src/data/paths.ts'

const modelPath = join(MODEL_OUT_DIR, 'model.json')
const cardPath = join(MODEL_OUT_DIR, 'model_card.json')
const ready = existsSync(modelPath) && existsSync(cardPath) && existsSync(FIXTURES_PATH)

interface Fixture {
  readonly source: string
  readonly sample: TerrainSample
  readonly probs: number[]
  readonly classIndex: number
  readonly oodScore: number
  readonly ood: boolean
}

test('shipped model_card.json and model.json load in the app and reproduce the fixtures', { skip: !ready && 'run `pnpm ml:train` first' }, () => {
  const cardParsed = parseModelCard(JSON.parse(readFileSync(cardPath, 'utf8')))
  assert.ok(cardParsed.ok, cardParsed.ok ? '' : cardParsed.errors.join(' '))
  if (!cardParsed.ok) return
  assert.deepEqual(cardParsed.warnings, [], 'every optional model_card section must be well-formed')
  const parsed = parseModelJson(JSON.parse(readFileSync(modelPath, 'utf8')), cardParsed.card.classes.length)
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.errors.join(' '))
  if (!parsed.ok) return
  const fixtures: { tolerance: number; cases: Fixture[] } = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'))
  assert.ok(fixtures.cases.length >= 10)
  for (const f of fixtures.cases) {
    const v = sampleToVector(f.sample)
    const probs = predictProbs(parsed.model, v)
    probs.forEach((p, c) => assert.ok(Math.abs(p - f.probs[c]) <= fixtures.tolerance, `${f.source}: class ${c} ${p} vs ${f.probs[c]}`))
    assert.equal(argmax(probs), f.classIndex, f.source)
    const score = oodScore(parsed.model, v)
    assert.ok(score !== null && Math.abs(score - f.oodScore) <= 1e-9, f.source)
    assert.equal(score! > parsed.model.ood!.threshold, f.ood, f.source)
  }
  // The extreme fixture must be flagged.
  assert.ok(fixtures.cases.some((f) => f.source.startsWith('extreme') && f.ood))

  // Explain (D7): the engine's perturbation explanation works on the real model.
  const engine = createEngine(cardParsed.card, modelPredictor(parsed.model))
  const ex = engine.explainOne(fixtures.cases[0].sample)
  assert.equal(ex.sensitivities.length, 8)
  for (const s of ex.sensitivities) for (const d of [...s.deltaUp, ...s.deltaDown]) assert.ok(Number.isFinite(d))
})
