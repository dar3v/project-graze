import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LeakageError, LockedTestSet, assertDisjoint, assertSplitsClean, innerSplit, makeSplits, stratifiedSplit } from '../src/splits.ts'
import { syntheticDataset } from './helpers.ts'

const d = syntheticDataset(7000)

test('splits are deterministic for a seed and differ across seeds', () => {
  const a = makeSplits(d, 42)
  const b = makeSplits(d, 42)
  const c = makeSplits(d, 7)
  assert.equal(a.test.hash, b.test.hash)
  assert.deepEqual(a.random.val, b.random.val)
  assert.notEqual(a.test.hash, c.test.hash)
})

test('test and dev partition the data; no fold leaks into the test set or its own validation', () => {
  const s = makeSplits(d, 42)
  assert.equal(s.test.size + s.dev.length, d.n)
  assert.doesNotThrow(() => assertSplitsClean(s, d))
  for (const f of s.loao) {
    for (const i of f.val) assert.equal(d.area[i], f.heldOutArea)
    for (const i of f.train) assert.notEqual(d.area[i], f.heldOutArea)
    assert.equal(f.train.length + f.val.length, s.dev.length)
  }
})

test('LEAKAGE TEST: a test row planted in training makes the checks fail', () => {
  const s = makeSplits(d, 42)
  const testRow = s.test.unlockForFinalEvaluation(LockedTestSet.CONFIRMATION)[0]
  const leakyTrain = Uint32Array.from([...s.random.train, testRow])
  const leaky = { ...s, random: { ...s.random, train: leakyTrain } }
  assert.throws(() => assertSplitsClean(leaky, d), LeakageError)
  assert.throws(() => s.test.assertDisjointFrom(leakyTrain, 'train'), LeakageError)
  // Validation rows in training are caught too.
  const overlap = { ...s, random: { ...s.random, train: Uint32Array.from([...s.random.train, s.random.val[0]]) } }
  assert.throws(() => assertSplitsClean(overlap, d), LeakageError)
  // A held-out-area row in LOAO training is caught.
  const f = s.loao[0]
  const otherArea = { ...f, train: Uint32Array.from([...f.train, f.val[0]]), val: f.val.subarray(1) }
  assert.throws(() => assertSplitsClean({ ...s, loao: [otherArea, ...s.loao.slice(1)] }, d), LeakageError)
})

test('the locked test set refuses to unlock without the freeze confirmation', () => {
  const s = makeSplits(d, 42)
  assert.throws(() => s.test.unlockForFinalEvaluation('please'))
})

test('stratified split keeps class proportions', () => {
  const all = Uint32Array.from({ length: d.n }, (_, i) => i)
  const { held } = stratifiedSplit(all, d.y, 0.1, 1)
  const counts = new Array(7).fill(0)
  for (const i of held) counts[d.y[i]]++
  for (const c of counts) assert.equal(c, 100)
})

test('innerSplit and assertDisjoint', () => {
  const s = makeSplits(d, 42)
  const { fit, holdout } = innerSplit(s.random.train, d.y, 3)
  assert.equal(fit.length + holdout.length, s.random.train.length)
  assert.doesNotThrow(() => assertDisjoint(fit, holdout, 'x'))
  assert.throws(() => assertDisjoint([1, 2], [2, 3], 'x'), LeakageError)
})
