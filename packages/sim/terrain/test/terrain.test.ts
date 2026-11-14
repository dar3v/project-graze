import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyBrush,
  CELL_SIZE_M,
  computeCellInputs,
  COVERTYPE_ELEVATION,
  generateHeightmap,
  generateTerrain,
  GRID,
  padRect,
  reliefBand,
  sampleHeight,
  TERRAIN_INPUT_DIM,
  unionRect,
  waterLevelForShare,
} from '../src/index.ts'

const min = (a: Float32Array) => a.reduce((m, v) => Math.min(m, v), Infinity)
const max = (a: Float32Array) => a.reduce((m, v) => Math.max(m, v), -Infinity)
const slopeAt = (inputs: Float32Array, i: number) => inputs[i * TERRAIN_INPUT_DIM + 1]

// D1: generator ---------------------------------------------------------------

test('generateHeightmap returns a 128 x 128 Float32Array by default', () => {
  const h = generateHeightmap(7)
  assert.ok(h instanceof Float32Array)
  assert.equal(h.length, GRID * GRID)
  assert.equal(GRID * GRID, 16384)
  assert.equal(CELL_SIZE_M, 30)
})

test('same seed gives identical output; different seeds differ', () => {
  const a = generateHeightmap(42)
  assert.deepEqual(a, generateHeightmap(42))
  assert.notDeepEqual(a, generateHeightmap(43))
})

test('elevation is scaled into the dataset range (min/max)', () => {
  for (const seed of [0, 1, 7, 12345, -9]) {
    const h = generateHeightmap(seed)
    assert.ok(min(h) >= COVERTYPE_ELEVATION.min, `seed ${seed}: min ${min(h)}`)
    assert.ok(max(h) <= COVERTYPE_ELEVATION.max, `seed ${seed}: max ${max(h)}`)
  }
  // Full relief spans the whole range exactly.
  const full = generateHeightmap(3, { relief: 1 })
  assert.ok(Math.abs(min(full) - COVERTYPE_ELEVATION.min) < 0.01)
  assert.ok(Math.abs(max(full) - COVERTYPE_ELEVATION.max) < 0.01)
})

test('a custom elevation range (from model_card.json) is respected', () => {
  const elevation = { min: 2000, max: 3000 }
  const t = generateTerrain({ seed: 5, elevation, relief: 0.5, center: 0.9 })
  assert.ok(min(t.heightmap) >= 2000 && max(t.heightmap) <= 3000)
  assert.deepEqual(t.band, reliefBand(elevation, 0.5, 0.9))
  // Band is pushed inside the range when center is near an edge.
  assert.deepEqual(reliefBand(elevation, 0.5, 1), { min: 2500, max: 3000 })
  assert.throws(() => generateTerrain({ seed: 1, elevation: { min: 10, max: 10 } }))
})

test('roughness makes terrain steeper on average', () => {
  const meanSlope = (roughness: number) => {
    const t = generateTerrain({ seed: 11, roughness })
    const { inputs } = computeCellInputs(t.heightmap, t.size, t.cellSizeM, t.waterLevelM)
    let s = 0
    for (let i = 0; i < t.size * t.size; i++) s += slopeAt(inputs, i)
    return s / (t.size * t.size)
  }
  assert.ok(meanSlope(1) > meanSlope(0))
})

test('default terrain has dataset-like slopes (mean 8..22 degrees)', () => {
  const t = generateTerrain({ seed: 7 })
  const { inputs } = computeCellInputs(t.heightmap, t.size, t.cellSizeM, t.waterLevelM)
  let s = 0
  for (let i = 0; i < t.size * t.size; i++) s += slopeAt(inputs, i)
  const mean = s / (t.size * t.size)
  assert.ok(mean > 8 && mean < 22, `mean slope ${mean}`)
})

test('water level option floods the requested share of cells', () => {
  for (const share of [0, 0.12, 0.3, 1]) {
    const t = generateTerrain({ seed: 9, waterLevel: share })
    const under = t.heightmap.filter((h) => h < t.waterLevelM).length
    assert.equal(under, Math.round(share * t.heightmap.length), `share ${share}`)
  }
  assert.equal(waterLevelForShare(new Float32Array(0), 0.5), 0)
})

// D3: brush -------------------------------------------------------------------

test('raise and lower change only cells inside the radius and report the dirty rect', () => {
  const size = 16
  const h = new Float32Array(size * size).fill(100)
  const r = applyBrush(h, size, { mode: 'raise', x: 8, y: 8, radius: 3, strength: 10 })
  assert.deepEqual(r, { x0: 6, y0: 6, x1: 10, y1: 10 })
  assert.equal(h[8 * size + 8], 110) // full strength at the center
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const inside = x >= r!.x0 && x <= r!.x1 && y >= r!.y0 && y <= r!.y1
      if (!inside) assert.equal(h[y * size + x], 100, `(${x}, ${y}) changed outside the rect`)
    }
  applyBrush(h, size, { mode: 'lower', x: 8, y: 8, radius: 3, strength: 10 })
  assert.equal(h[8 * size + 8], 100)
})

test('flatten moves heights toward the target; clamps to min/max', () => {
  const size = 8
  const h = new Float32Array(size * size)
  for (let i = 0; i < h.length; i++) h[i] = i
  applyBrush(h, size, { mode: 'flatten', x: 4, y: 4, radius: 2, strength: 1, target: 50 })
  assert.equal(h[4 * size + 4], 50)
  const flat = new Float32Array(size * size).fill(100)
  applyBrush(flat, size, { mode: 'raise', x: 4, y: 4, radius: 2, strength: 1000, max: 120 })
  assert.equal(max(flat), 120)
})

test('brush at the edge is clipped; no-op strokes return null', () => {
  const size = 8
  const h = new Float32Array(size * size).fill(5)
  const r = applyBrush(h, size, { mode: 'raise', x: 0, y: 0, radius: 2, strength: 1 })
  assert.equal(r!.x0, 0)
  assert.equal(r!.y0, 0)
  assert.equal(applyBrush(h, size, { mode: 'raise', x: 4, y: 4, radius: 0, strength: 1 }), null)
  assert.equal(applyBrush(h, size, { mode: 'raise', x: 4, y: 4, radius: 2, strength: 0 }), null)
  assert.throws(() => applyBrush(new Float32Array(3), size, { mode: 'raise', x: 0, y: 0, radius: 1, strength: 1 }))
})

test('rect helpers and bilinear sampling', () => {
  assert.deepEqual(unionRect({ x0: 1, y0: 1, x1: 2, y1: 2 }, { x0: 0, y0: 3, x1: 1, y1: 4 }), { x0: 0, y0: 1, x1: 2, y1: 4 })
  assert.equal(unionRect(null, null), null)
  assert.deepEqual(padRect({ x0: 0, y0: 5, x1: 7, y1: 6 }, 1, 8), { x0: 0, y0: 4, x1: 7, y1: 7 })
  const h = Float32Array.from([0, 10, 20, 30])
  assert.equal(sampleHeight(h, 2, 0.5, 0.5), 15)
  assert.equal(sampleHeight(h, 2, -3, 9), 20)
})

// Terrain -> raw inputs ---------------------------------------------------------

test('cell inputs: flat land next to water', () => {
  const size = 8
  const h = new Float32Array(size * size).fill(100)
  for (let y = 0; y < size; y++) h[y * size] = 50
  const { inputs, water, hasWater } = computeCellInputs(h, size, 30, 60)
  assert.ok(hasWater)
  assert.equal(water[0], 1)
  assert.equal(inputs.length, size * size * TERRAIN_INPUT_DIM)
  const o = (3 * size + 4) * TERRAIN_INPUT_DIM
  assert.equal(inputs[o + 1], 0) // slope
  assert.equal(inputs[o + 6], 4 * 30) // horizontal distance
  assert.equal(inputs[o + 7], 40) // vertical distance
})

test('aspect points downhill, clockwise from north', () => {
  const size = 5
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = (size - y) * 10
  const o = (2 * size + 2) * TERRAIN_INPUT_DIM
  assert.ok(Math.abs(computeCellInputs(h, size, 30, -1).inputs[o + 2] - 180) < 1e-6)
})

test('no water anywhere gives finite distances', () => {
  const { inputs, hasWater } = computeCellInputs(new Float32Array(16).fill(10), 4, 30, 0)
  assert.equal(hasWater, false)
  assert.ok(Array.from(inputs).every(Number.isFinite))
})
