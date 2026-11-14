/**
 * D10 dirty-region fallback: predicting only the cells of a dirty rect gives
 * exactly what the full-grid batch gives for those cells. Inputs still come
 * from a full-grid heightmapToInputs, because water distance is global.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { heightmapToInputs, TERRAIN_SAMPLE_DIM as D } from '../../packages/features/src/index.ts'
import { applyBrush, generateTerrain, padRect, type DirtyRect } from '../../packages/sim/terrain/src/index.ts'
import { MODEL_OUT_DIR } from '../src/data/paths.ts'
import { SANDBOX_WORLD, appEngine } from '../src/generatedTerrain.ts'

const modelPath = join(MODEL_OUT_DIR, 'model.json')
const cardPath = join(MODEL_OUT_DIR, 'model_card.json')
const ready = existsSync(modelPath) && existsSync(cardPath)

function packRegion(packed: Float32Array, size: number, r: DirtyRect): Float32Array {
  const w = r.x1 - r.x0 + 1
  const out = new Float32Array(w * (r.y1 - r.y0 + 1) * D)
  for (let y = r.y0; y <= r.y1; y++) out.set(packed.subarray((y * size + r.x0) * D, (y * size + r.x1 + 1) * D), (y - r.y0) * w * D)
  return out
}

test('dirty-region prediction equals the full-grid prediction for the same cells', { skip: !ready && 'run `pnpm ml:train` first' }, () => {
  const engine = appEngine(JSON.parse(readFileSync(cardPath, 'utf8')), JSON.parse(readFileSync(modelPath, 'utf8')))
  const e = engine.card.inputs.find((i) => i.name === 'elevation')!
  const t = generateTerrain({ ...SANDBOX_WORLD.options, seed: 3, elevation: { min: e.min, max: e.max } })
  const dirty = applyBrush(t.heightmap, t.size, { x: 40, y: 70, radius: 6, strength: 60, mode: 'raise' })
  assert.ok(dirty, 'brush touched no cells')
  // Slope and hillshade use neighbours, so the cells whose inputs change reach one past the edit.
  const rect = padRect(dirty, 1, t.size)
  const inputs = heightmapToInputs(t.heightmap, { size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM })
  const full = engine.predictBatch(inputs.packed.slice())
  const part = engine.predictBatch(packRegion(inputs.packed, t.size, rect))
  const w = rect.x1 - rect.x0 + 1
  for (let y = rect.y0; y <= rect.y1; y++)
    for (let x = rect.x0; x <= rect.x1; x++) {
      const c = y * t.size + x
      const r = (y - rect.y0) * w + (x - rect.x0)
      assert.equal(part.classIndex[r], full.classIndex[c], `class at (${x}, ${y})`)
      assert.equal(part.confidence[r], full.confidence[c], `confidence at (${x}, ${y})`)
      assert.equal(part.ood[r], full.ood[c], `ood at (${x}, ${y})`)
    }
})
