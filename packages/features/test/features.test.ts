import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  FEATURE_NAMES,
  FEATURE_DIM,
  computeFeatures,
  toFeatureVector,
  sampleToVector,
  isFiniteFeatureValues,
  outOfRangeFeatureNames,
} from '../src/index.ts'
import type { FeatureRanges, TerrainSample } from '../src/index.ts'

const sample: TerrainSample = {
  elevation: 3000,
  slope: 12,
  aspectDegrees: 90,
  hillshade9am: 200,
  hillshadeNoon: 220,
  hillshade3pm: 150,
  horizontalDistanceToWater: 120,
  verticalDistanceToWater: 30,
}

test('FEATURE_NAMES is the canonical feature order with no duplicates', () => {
  assert.deepEqual([...FEATURE_NAMES], [
    'elevation',
    'slope',
    'aspectSin',
    'aspectCos',
    'hillshade9am',
    'hillshadeNoon',
    'hillshade3pm',
    'horizontalDistanceToWater',
    'verticalDistanceToWater',
  ])
  assert.equal(FEATURE_DIM, FEATURE_NAMES.length)
  assert.equal(new Set(FEATURE_NAMES).size, FEATURE_DIM)
})

test('computeFeatures is deterministic, pure, and finite', () => {
  const a = computeFeatures(sample)
  const b = computeFeatures(sample)
  assert.deepEqual(a, b)
  assert.ok(isFiniteFeatureValues(a))

  // A frozen input proves the function does not mutate its argument.
  const frozen: TerrainSample = Object.freeze({ ...sample })
  assert.doesNotThrow(() => computeFeatures(frozen))
})

test('aspect is split into sin/cos and is continuous across 0/360', () => {
  const north = computeFeatures({ ...sample, aspectDegrees: 0 })
  assert.ok(Math.abs(north.aspectSin) < 1e-12)
  assert.ok(Math.abs(north.aspectCos - 1) < 1e-12)

  const east = computeFeatures({ ...sample, aspectDegrees: 90 })
  assert.ok(Math.abs(east.aspectSin - 1) < 1e-12)
  assert.ok(Math.abs(east.aspectCos) < 1e-12)

  const wrap = computeFeatures({ ...sample, aspectDegrees: 360 })
  assert.ok(Math.abs(wrap.aspectSin - north.aspectSin) < 1e-12)
  assert.ok(Math.abs(wrap.aspectCos - north.aspectCos) < 1e-12)
})

test('toFeatureVector emits FEATURE_NAMES order', () => {
  const values = computeFeatures(sample)
  const vector = toFeatureVector(values)
  assert.equal(vector.length, FEATURE_DIM)
  FEATURE_NAMES.forEach((name, i) => assert.equal(vector[i], values[name]))
  assert.deepEqual(vector, sampleToVector(sample))
})

test('isFiniteFeatureValues rejects NaN and Infinity', () => {
  assert.ok(isFiniteFeatureValues(computeFeatures(sample)))
  assert.ok(!isFiniteFeatureValues({ ...computeFeatures(sample), slope: Number.NaN }))
  assert.ok(!isFiniteFeatureValues({ ...computeFeatures(sample), elevation: Infinity }))
})

test('outOfRangeFeatureNames flags only names outside caller-supplied ranges', () => {
  const values = computeFeatures(sample)
  // Arbitrary test-only bounds, not dataset facts.
  const ranges: FeatureRanges = {
    elevation: [0, 5000],
    slope: [0, 90],
    aspectSin: [-1, 1],
    aspectCos: [-1, 1],
    hillshade9am: [0, 255],
    hillshadeNoon: [0, 255],
    hillshade3pm: [0, 255],
    horizontalDistanceToWater: [0, 10000],
    verticalDistanceToWater: [-1000, 10000],
  }
  assert.deepEqual(outOfRangeFeatureNames(values, ranges), [])

  const narrow: FeatureRanges = { ...ranges, elevation: [0, 100] }
  assert.deepEqual(outOfRangeFeatureNames(values, narrow), ['elevation'])
})

test('package resolves by its own name via exports', async () => {
  const mod = await import('@graze/features')
  assert.equal(mod.FEATURE_DIM, FEATURE_DIM)
  assert.equal(typeof mod.computeFeatures, 'function')
})
