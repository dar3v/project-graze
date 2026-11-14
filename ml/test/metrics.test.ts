import assert from 'node:assert/strict'
import { test } from 'node:test'

import { calibrationBins, confusionMatrix, evaluate, metricsFromConfusion } from '../src/metrics.ts'
import { fitTemperature } from '../src/calibration.ts'
import { applyTemperature } from '../src/models/types.ts'
import { createRng } from '../src/lib/rng.ts'

const close = (a: number, b: number, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)

test('hand-checked confusion matrix metrics', () => {
  // true: 0 0 0 1 1 2 ; pred: 0 0 1 1 2 2
  const cm = confusionMatrix(Uint8Array.from([0, 0, 0, 1, 1, 2]), Uint8Array.from([0, 0, 1, 1, 2, 2]), 3)
  assert.deepEqual(cm, [[2, 1, 0], [0, 1, 1], [0, 0, 1]])
  const m = metricsFromConfusion(cm)
  close(m.accuracy, 4 / 6)
  close(m.perClass[0].precision, 1)
  close(m.perClass[0].recall, 2 / 3)
  close(m.perClass[1].precision, 0.5)
  close(m.perClass[2].f1, 2 / 3)
  close(m.macroF1, (0.8 + 0.5 + 2 / 3) / 3)
})

test('macro-F1 ignores classes absent from the evaluated rows', () => {
  const m = metricsFromConfusion(confusionMatrix(Uint8Array.from([0, 1]), Uint8Array.from([0, 1]), 3))
  close(m.macroF1, 1)
})

test('log loss and calibration bins', () => {
  const probs = Float32Array.from([0.9, 0.1, 0.2, 0.8])
  const m = evaluate(probs, Uint8Array.from([0, 0]), 2)
  close(m.logLoss!, -(Math.log(0.9) + Math.log(0.2)) / 2, 1e-6)
  // Values away from bin edges (Float32 0.9 falls just below 0.9).
  const p2 = Float32Array.from([0.95, 0.05, 0.25, 0.75])
  const { ece, bins } = calibrationBins(p2, Uint8Array.from([0, 0]), 2)
  assert.equal(bins.length, 2)
  close(ece, (Math.abs(0.95 - 1) + Math.abs(0.75 - 0)) / 2, 1e-6)
})

test('temperature scaling recovers a known over-confidence', () => {
  // True probs p; model reports p^(1/0.5) (too sharp). Fitted T should be ~0.5^-1 inverse => about 2.
  const rng = createRng(1)
  const n = 20000
  const k = 3
  const probs = new Float32Array(n * k)
  const y = new Uint8Array(n)
  const truth = [0.6, 0.3, 0.1]
  for (let i = 0; i < n; i++) {
    const u = rng()
    y[i] = u < 0.6 ? 0 : u < 0.9 ? 1 : 2
    probs.set(truth, i * k)
  }
  const sharp = applyTemperature(probs, k, 0.5)
  const t = fitTemperature(sharp, y, k)
  assert.ok(Math.abs(t - 2) < 0.1, `T = ${t}`)
})
