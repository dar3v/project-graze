import assert from 'node:assert/strict'
import { test } from 'node:test'

import { generateHeightmap, quantile, scaleHeightmap } from '../src/lib/sandbox/terrain.ts'

test('heightmap is deterministic, normalized and seed-dependent', () => {
  const a = generateHeightmap(7, 32)
  assert.deepEqual(a, generateHeightmap(7, 32))
  assert.notDeepEqual(a, generateHeightmap(8, 32))
  assert.ok(Math.min(...a) === 0 && Math.abs(Math.max(...a) - 1) < 1e-6)
})

test('scale and quantile helpers', () => {
  assert.deepEqual(Array.from(scaleHeightmap(Float32Array.from([0, 0.5, 1]), 2000, 3000)), [2000, 2500, 3000])
  assert.equal(quantile(Float32Array.from([5, 1, 3]), 0), 1)
  assert.equal(quantile(new Float32Array(0), 0.5), 0)
})
