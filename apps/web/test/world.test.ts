import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

import { DirtyRectBatcher } from '../src/lib/world/batcher.ts'
import { CONFIDENCE_HIGH, CONFIDENCE_LOW, hexToRgb01, OOD_COLOR, writeColors } from '../src/lib/world/colors.ts'
import type { ColorInputs } from '../src/lib/world/colors.ts'
import { cellToWorldX, cellToWorldZ, heightToWorldY, nearestCell, worldToCell, worldToCellF } from '../src/lib/world/coords.ts'

test('cell <-> world coordinates round-trip; north is -Z, east is +X', () => {
  const f = { size: 128, cellSizeM: 30, baseM: 2500 }
  assert.equal(cellToWorldX(0, f), -63.5)
  assert.equal(cellToWorldZ(127, f), 63.5)
  assert.ok(cellToWorldZ(0, f) < cellToWorldZ(1, f)) // y = 0 (north) is furthest from the camera
  assert.deepEqual(worldToCellF(cellToWorldX(10.25, f), cellToWorldZ(99, f), f), { x: 10.25, y: 99 })
  assert.deepEqual(worldToCell(cellToWorldX(10.4, f), cellToWorldZ(20.6, f), f), { x: 10, y: 21 })
  assert.equal(worldToCell(-1000, 0, f), null)
  assert.equal(nearestCell(127.6, 0, 128), null)
  assert.equal(heightToWorldY(2500, f), 0)
  assert.ok(heightToWorldY(2530, f) > 0)
})

function colorInputs(over: Partial<ColorInputs>): ColorInputs {
  const size = 4
  return {
    size,
    heightmap: new Float32Array(size * size).fill(100),
    waterLevelM: 50,
    band: { min: 0, max: 200 },
    mode: 'terrain',
    cover: null,
    confidence: null,
    ood: null,
    showOod: false,
    classRgb: [hexToRgb01('#ff0000'), hexToRgb01('#00ff00')],
    ...over,
  }
}

const rgbAt = (out: Float32Array, i: number) => [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]]
const ALL = { x0: 0, y0: 0, x1: 3, y1: 3 }

test('cover overlay paints class colors; water cells stay riverbed', () => {
  const out = new Float32Array(16 * 3)
  const heightmap = new Float32Array(16).fill(100)
  heightmap[5] = 10 // under water
  const cover = new Uint8Array(16).fill(1)
  writeColors(out, colorInputs({ mode: 'cover', cover, heightmap }), ALL)
  assert.deepEqual(rgbAt(out, 0), [0, 1, 0])
  assert.notDeepEqual(rgbAt(out, 5), [0, 1, 0])
})

test('confidence overlay ramps from low to high', () => {
  const out = new Float32Array(16 * 3)
  const confidence = new Float32Array(16)
  confidence[1] = 1
  writeColors(out, colorInputs({ mode: 'confidence', confidence }), ALL)
  assert.deepEqual(rgbAt(out, 0), Array.from(Float32Array.from(CONFIDENCE_LOW)))
  assert.deepEqual(rgbAt(out, 1), Array.from(Float32Array.from(CONFIDENCE_HIGH)))
})

test('OOD cells are marked only when enabled, in any overlay', () => {
  const ood = new Uint8Array(16)
  ood[0] = 1
  const off = new Float32Array(16 * 3)
  const on = new Float32Array(16 * 3)
  writeColors(off, colorInputs({ ood, showOod: false }), ALL)
  writeColors(on, colorInputs({ ood, showOod: true }), ALL)
  assert.notDeepEqual(rgbAt(on, 0), rgbAt(off, 0))
  assert.deepEqual(rgbAt(on, 1), rgbAt(off, 1)) // unflagged cell unchanged
  // Pulled strongly toward the OOD color.
  const d = (a: number[]) => Math.hypot(a[0] - OOD_COLOR[0], a[1] - OOD_COLOR[1], a[2] - OOD_COLOR[2])
  assert.ok(d(rgbAt(on, 0)) < d(rgbAt(off, 0)))
})

test('writeColors only touches the given rect', () => {
  const out = new Float32Array(16 * 3).fill(-1)
  writeColors(out, colorInputs({}), { x0: 1, y0: 1, x1: 2, y1: 1 })
  assert.equal(out[0], -1)
  assert.notEqual(out[(1 * 4 + 1) * 3], -1)
  assert.notEqual(out[(1 * 4 + 2) * 3], -1)
  assert.equal(out[(2 * 4 + 1) * 3], -1)
})

test('dirty-rect batcher debounces and emits the union once', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const seen: unknown[] = []
    const b = new DirtyRectBatcher(250, (r) => seen.push(r))
    b.add({ x0: 5, y0: 5, x1: 6, y1: 6 })
    mock.timers.tick(200)
    b.add({ x0: 1, y0: 7, x1: 2, y1: 9 })
    mock.timers.tick(200)
    assert.equal(seen.length, 0) // still within 250 ms of the last dab
    mock.timers.tick(60)
    assert.deepEqual(seen, [{ x0: 1, y0: 5, x1: 6, y1: 9 }])
    b.add({ x0: 0, y0: 0, x1: 0, y1: 0 })
    b.cancel()
    mock.timers.tick(1000)
    assert.equal(seen.length, 1)
    b.add(null)
    b.flush()
    assert.equal(seen.length, 1)
  } finally {
    mock.timers.reset()
  }
})
