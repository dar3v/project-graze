/**
 * `pnpm ml:generated-ood`: the D12 generated-terrain study on the SHIPPED
 * model files, without retraining. Use it when Role 1 changes generator
 * defaults. Writes ml/reports/generated-terrain-ood.json. model_card.json is
 * only written by `ml:train`, which runs the same study.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { MODEL_OUT_DIR, REPORTS_DIR } from './data/paths.ts'
import { appEngine, generatedTerrainStudy } from './generatedTerrain.ts'

const card = JSON.parse(readFileSync(join(MODEL_OUT_DIR, 'model_card.json'), 'utf8'))
const model = JSON.parse(readFileSync(join(MODEL_OUT_DIR, 'model.json'), 'utf8'))
const study = generatedTerrainStudy(appEngine(card, model))
const pct = (v: number) => `${(100 * v).toFixed(1)}%`
for (const w of study.worlds) {
  console.log(
    `${w.name.padEnd(22)} low trust ${pct(w.flaggedRate).padStart(6)} (seeds ${pct(w.perSeedFlaggedRate.min)}-${pct(w.perSeedFlaggedRate.max)}; ` +
      `detector ${pct(w.detectorFlaggedRate)}, outside range ${pct(w.outsideTrainingRangeRate)})`,
  )
}
const out = { generatedBy: 'ml/src/generated-ood.ts', modelVersion: card.modelVersion ?? card.model?.version, ...study }
writeFileSync(join(REPORTS_DIR, 'generated-terrain-ood.json'), JSON.stringify(out, null, 2) + '\n')
console.log('Wrote ml/reports/generated-terrain-ood.json')
