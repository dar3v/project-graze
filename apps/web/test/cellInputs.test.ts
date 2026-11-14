import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heightmapToSamples, SUN } from '../src/lib/deps/features.ts'
import { RAW_INPUT_DIM, sampleFromBuffer } from '../src/lib/model/inputs.ts'
import { packCellInputs } from '../src/lib/sandbox/cellInputs.ts'
import { generateTerrain } from '../src/lib/world/terrain.ts'

test('packCellInputs packs exactly what @graze/features computes (trained SUN)', () => {
  const t = generateTerrain({ seed: 3, size: 24 })
  const packed = packCellInputs(t.heightmap, t.size, t.cellSizeM, t.waterLevelM)
  const ref = heightmapToSamples(t.heightmap, { size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM, sun: SUN })
  assert.equal(packed.inputs.length, t.size * t.size * RAW_INPUT_DIM)
  assert.deepEqual(packed.water, ref.water)
  assert.equal(packed.hasWater, ref.hasWater)
  for (const i of [0, 37, 300, t.size * t.size - 1]) {
    const got = sampleFromBuffer(packed.inputs, i)
    for (const [k, v] of Object.entries(ref.samples[i])) assert.ok(Math.abs(got[k as keyof typeof got] - v) < 1e-3, `${k} at cell ${i}`)
  }
})

test('packCellInputs: no water gives finite distances', () => {
  const h = new Float32Array(16).fill(2500)
  const { inputs, hasWater } = packCellInputs(h, 4, 30, 0)
  assert.equal(hasWater, false)
  assert.ok(inputs.every(Number.isFinite))
})
