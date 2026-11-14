/**
 * `pnpm ml:evaluate-final -- --confirm-frozen` (D9). Evaluates the SHIPPED
 * model.json once on the locked final test set and writes the result into
 * model_card.json (`finalTest`) and ml/reports/final-test.json.
 *
 * Refuses to run unless:
 *  - `--confirm-frozen` is passed (a human has frozen the model), and
 *  - ml/reports/final-test.json does not exist yet (evaluated once only).
 * Uses the app runtime (apps/web/src/lib/model/inference.ts) so the numbers
 * describe exactly what the app computes.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { sampleToVector } from '../../packages/features/src/index.ts'
import { argmax, oodScore, parseModelJson, predictProbs } from '../../apps/web/src/lib/model/inference.ts'
import { CLASS_NAMES, N_CLASSES, loadCovertype, rowToSample } from './data/covertype.ts'
import { MODEL_OUT_DIR, REPORTS_DIR } from './data/paths.ts'
import { confusionMatrix, logLoss, metricsFromConfusion } from './metrics.ts'
import { LockedTestSet, makeSplits } from './splits.ts'
import { SEED } from './config.ts'

const OUT = join(REPORTS_DIR, 'final-test.json')

function main(): void {
  if (!process.argv.includes('--confirm-frozen')) {
    throw new Error('The final test set is evaluated once, after the model is frozen (D9). Re-run with --confirm-frozen.')
  }
  if (existsSync(OUT)) throw new Error(`${OUT} exists: the final test set was already used. Do not re-evaluate.`)
  const cardPath = join(MODEL_OUT_DIR, 'model_card.json')
  const card = JSON.parse(readFileSync(cardPath, 'utf8'))
  const parsed = parseModelJson(JSON.parse(readFileSync(join(MODEL_OUT_DIR, 'model.json'), 'utf8')), N_CLASSES)
  if (!parsed.ok) throw new Error(parsed.errors.join(' '))
  const d = loadCovertype()
  const rows = makeSplits(d, SEED).test.unlockForFinalEvaluation(LockedTestSet.CONFIRMATION)
  const probs = new Float32Array(rows.length * N_CLASSES)
  const yTrue = new Uint8Array(rows.length)
  const yPred = new Uint8Array(rows.length)
  let flagged = 0
  rows.forEach((row, i) => {
    const v = sampleToVector(rowToSample(d, row))
    const p = predictProbs(parsed.model, v)
    probs.set(p, i * N_CLASSES)
    yTrue[i] = d.y[row]
    yPred[i] = argmax(p)
    if ((oodScore(parsed.model, v) ?? 0) > (parsed.model.ood?.threshold ?? Infinity)) flagged++
  })
  const m = metricsFromConfusion(confusionMatrix(yTrue, yPred, N_CLASSES), logLoss(probs, yTrue, N_CLASSES))
  const result = { evaluatedAt: new Date().toISOString(), rows: rows.length, accuracy: m.accuracy, macroF1: m.macroF1, logLoss: m.logLoss, perClass: m.perClass, confusionMatrix: m.confusionMatrix, oodFlaggedRate: flagged / rows.length }
  writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n')
  card.finalTest = result
  card.model.frozen = true
  card.evaluations.unshift({ name: `${card.model.type} (frozen)`, split: 'Final test set (stratified random, evaluated once)', accuracy: m.accuracy, macroF1: m.macroF1, confusionMatrix: m.confusionMatrix, perClass: m.perClass })
  writeFileSync(cardPath, JSON.stringify(card, null, 2) + '\n')
  console.log(`Final test (${rows.length} rows): accuracy ${m.accuracy.toFixed(4)}, macro-F1 ${m.macroF1.toFixed(4)}`)
  CLASS_NAMES.forEach((c, i) => console.log(`  ${c.padEnd(18)} F1 ${m.perClass[i].f1.toFixed(3)}  support ${m.perClass[i].support}`))
}

main()
