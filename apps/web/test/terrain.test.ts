import assert from 'node:assert/strict'
import { test } from 'node:test'

import { RAW_INPUT_DIM, sampleFromBuffer } from '../src/lib/model/inputs.ts'
import { computeCellInputs, generateHeightmap, quantile, scaleHeightmap } from '../src/lib/sandbox/terrain.ts'

test('heightmap is deterministic, normalized and seed-dependent', () => {
  const a = generateHeightmap(7, 32)
  assert.deepEqual(a, generateHeightmap(7, 32))
  assert.notDeepEqual(a, generateHeightmap(8, 32))
  assert.ok(Math.min(...a) === 0 && Math.abs(Math.max(...a) - 1) < 1e-6)
})

test('cell inputs: flat land next to water', () => {
  const size = 8
  const h = new Float32Array(size * size).fill(100)
  for (let y = 0; y < size; y++) h[y * size] = 50 // west column below water level
  const { inputs, water, hasWater } = computeCellInputs(h, size, 30, 60)
  assert.ok(hasWater)
  assert.equal(water[0], 1)
  assert.equal(inputs.length, size * size * RAW_INPUT_DIM)
  const s = sampleFromBuffer(inputs, 3 * size + 4) // interior flat cell
  assert.equal(s.slope, 0)
  assert.equal(s.horizontalDistanceToWater, 4 * 30)
  assert.equal(s.verticalDistanceToWater, 40)
  assert.ok(s.hillshadeNoon > 0 && s.hillshadeNoon <= 255)
})

test('aspect points downhill, clockwise from north', () => {
  const size = 5
  // Height rises toward the north (small y), so the slope faces south (180°).
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = (size - y) * 10
  const s = sampleFromBuffer(computeCellInputs(h, size, 30, -1).inputs, 2 * size + 2)
  assert.ok(Math.abs(s.aspectDegrees - 180) < 1e-6)
  // Height rises toward the west, so the slope faces east (90°).
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = (size - x) * 10
  const e = sampleFromBuffer(computeCellInputs(h, size, 30, -1).inputs, 2 * size + 2)
  assert.ok(Math.abs(e.aspectDegrees - 90) < 1e-6)
})

test('no water anywhere gives finite distances, never Infinity', () => {
  const size = 4
  const { inputs, hasWater } = computeCellInputs(new Float32Array(size * size).fill(10), size, 30, 0)
  assert.equal(hasWater, false)
  assert.ok(Array.from(inputs).every(Number.isFinite))
})

test('rejects a heightmap of the wrong size', () => {
  assert.throws(() => computeCellInputs(new Float32Array(3), 4, 30, 0))
})

test('scale and quantile helpers', () => {
  assert.deepEqual(Array.from(scaleHeightmap(Float32Array.from([0, 0.5, 1]), 2000, 3000)), [2000, 2500, 3000])
  assert.equal(quantile(Float32Array.from([5, 1, 3]), 0), 1)
  assert.equal(quantile(new Float32Array(0), 0.5), 0)
})
