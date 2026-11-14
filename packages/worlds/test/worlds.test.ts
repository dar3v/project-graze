import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyEdits,
  EDIT_UNIT_M,
  editedCellCount,
  encodeEdits,
  MAX_WORLD_BYTES,
  newWorldId,
  parseWorldHash,
  validateWorld,
  WORLD_ID_PATTERN,
  WORLD_SIZE,
  worldShareHash,
} from '../src/index.ts'

const N = WORLD_SIZE * WORLD_SIZE
const base = Float32Array.from({ length: N }, (_, i) => 2000 + (i % 97))

const valid = (edits: number[] = []) => ({
  schemaVersion: 1,
  modelVersion: '0.1.0-dev',
  seed: -3,
  size: WORLD_SIZE,
  options: { center: 0, relief: 1, roughness: 0.5, valley: 0.35, waterShare: 0.12, elevation: { min: 1859, max: 3858 } },
  edits,
})

test('edits round-trip within half an edit unit', () => {
  const cur = base.slice()
  cur[0] += 12.34
  cur[5] -= 0.26
  cur[N - 1] += 150
  cur[9] += 0.01 // below the unit: not stored
  const edits = encodeEdits(base, cur)
  assert.deepEqual(edits, [0, 123, 5, -3, N - 1 - 5, 1500])
  assert.equal(editedCellCount(edits), 3)
  assert.ok(validateWorld(valid(edits)).ok)
  const back = applyEdits(base, edits)
  for (let i = 0; i < N; i++) assert.ok(Math.abs(back[i] - cur[i]) <= EDIT_UNIT_M / 2 + 1e-3, `cell ${i}`)
})

test('an edit on every cell still fits the size limit', () => {
  const cur = base.map((h, i) => h + ((i % 5) - 2) * 300 + 0.1)
  const w = valid(encodeEdits(base, cur))
  assert.equal(w.edits.length, 2 * N)
  assert.ok(JSON.stringify(w).length < MAX_WORLD_BYTES)
  assert.ok(validateWorld(w).ok)
})

test('validateWorld lists every problem and never throws', () => {
  for (const bad of [null, 1, 'x', [], {}]) assert.equal(validateWorld(bad).ok, false)
  const r = validateWorld({ ...valid(), seed: 'seven', size: 64, options: { center: 2 }, edits: [1], extra: true })
  assert.equal(r.ok, false)
  if (!r.ok) {
    const all = r.errors.join(' | ')
    for (const s of ['seed', 'size', 'options.center', 'options.relief', 'options.elevation', 'pairs', 'unknown field "extra"']) assert.ok(all.includes(s), s)
  }
  assert.equal(validateWorld({ ...valid(), options: { ...valid().options, elevation: { min: 10, max: 5 } } }).ok, false)
  assert.equal(validateWorld({ ...valid(), options: { ...valid().options, note: 'hi' } }).ok, false)
})

test('ids and share hashes', () => {
  const id = newWorldId()
  assert.match(id, WORLD_ID_PATTERN)
  assert.notEqual(newWorldId(), id)
  assert.equal(parseWorldHash(worldShareHash(id)), id)
  assert.equal(parseWorldHash('#/report'), null)
  assert.equal(parseWorldHash('#/world/../../x'), null)
})
