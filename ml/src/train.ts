/**
 * `pnpm ml:train`: one command, every D4-D7 result.
 *
 *  1. Splits (+ leakage checks, + ml/splits.lock.json pin).
 *  2. For the random fold and the 4 LOAO folds: baselines + tuned softmax /
 *     MLP / forest (tuning, temperature on the fold's inner holdout only).
 *  3. Selection by the rule in docs/notes.md section 3.
 *  4. Ablations, permutation importance, OOD study (incl. generated terrain).
 *  5. Final model on the dev set -> apps/web/public/model/{model.json,
 *     model_card.json}, ml/test/fixtures/inference-fixtures.json,
 *     ml/reports/train-report.json.
 * The final test set is never touched here.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { FEATURE_NAMES, heightmapToSamples, sampleToVector, type TerrainSample } from '../../packages/features/src/index.ts'
import { GENERATED_SEEDS, SANDBOX_WORLD, appEngine, generatedLandSamples, generatedTerrainStudy } from './generatedTerrain.ts'
import { subSeed } from './lib/rng.ts'
import {
  AREA_NAMES,
  CLASS_DISPLAY_LABELS,
  CLASS_NAMES,
  COL,
  DATASET_CITATION,
  DATASET_DOI,
  DATASET_LICENSE,
  DATASET_PAGE,
  N_CLASSES,
  at,
  loadCovertype,
  rowToSample,
  type Dataset,
} from './data/covertype.ts'
import { FIXTURES_PATH, MODEL_OUT_DIR, REPORTS_DIR, SPLIT_LOCK_PATH } from './data/paths.ts'
import { FEATURE_SETS, buildMatrix, labelsOf, type FeatureSetName, type Matrix } from './featureSets.ts'
import { addConfusion, calibrationBins, evaluate, metricsFromConfusion, type Metrics } from './metrics.ts'
import { fitElevationBand, fitMajority } from './models/baselines.ts'
import { trainForest, type ForestConfig, type ForestModel } from './models/forest.ts'
import { trainNetwork, withTemperature, type NetworkConfig, type NetworkModel } from './models/network.ts'
import { SIMPLICITY_ORDER, applyTemperature, type Classifier, type ModelFamily } from './models/types.ts'
import { fitTemperature } from './calibration.ts'
import { fitMahalanobis, fitStandardized, flaggedRate, mahalanobisScores, percentile, standardizedScores } from './ood.ts'
import { permutationImportance } from './importance.ts'
import { exportModelJson, roundForest } from './export.ts'
import { innerSplit, makeSplits, subsample, TEST_FRACTION, type Fold, type Splits } from './splits.ts'
import {
  GRIDS,
  IMPORTANCE_REPEATS,
  IMPORTANCE_ROWS,
  MAX_TRAIN_ROWS,
  MODEL_VERSION,
  OOD_PERCENTILE,
  SCHEMA_VERSION,
  SEED,
  SELECTION_TIE_MARGIN,
} from './config.ts'

type Learned = 'softmax' | 'mlp' | 'forest'
const LEARNED: readonly Learned[] = ['softmax', 'mlp', 'forest']
const K = N_CLASSES
const t0 = performance.now()
const log = (msg: string) => console.log(`[${((performance.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${msg}`)

// ---------------------------------------------------------------- helpers

function fitLearned(family: Learned, gridIndex: number, x: Matrix, y: Uint8Array, seed: number): Classifier {
  if (family === 'forest') {
    const { label: _l, ...cfg } = GRIDS.forest[gridIndex]
    return trainForest(x, y, K, { ...cfg, seed } satisfies ForestConfig)
  }
  const { label: _l, ...cfg } = GRIDS[family][gridIndex]
  return trainNetwork(x, y, K, { ...cfg, hidden: [...cfg.hidden], seed } satisfies NetworkConfig)
}

function elevationColumn(m: Matrix): Float64Array {
  const e = new Float64Array(m.rows)
  for (let i = 0; i < m.rows; i++) e[i] = m.data[i * m.cols]
  return e
}

/** Compact metrics for the JSON report (confusion + per-class kept). */
const pack = (m: Metrics) => ({
  n: m.n,
  accuracy: m.accuracy,
  macroF1: m.macroF1,
  logLoss: m.logLoss,
  perClass: m.perClass,
  confusionMatrix: m.confusionMatrix,
})

interface FoldData {
  readonly fold: Fold
  readonly fitRows: Uint32Array
  readonly holdRows: Uint32Array
  readonly xFit: Matrix
  readonly yFit: Uint8Array
  readonly xHold: Matrix
  readonly yHold: Uint8Array
  readonly xVal: Matrix
  readonly yVal: Uint8Array
}

function foldData(d: Dataset, fold: Fold, set: FeatureSetName): FoldData {
  const inner = innerSplit(fold.train, d.y, subSeed(SEED, `${fold.name}/inner`))
  const fitRows = subsample(inner.fit, MAX_TRAIN_ROWS, subSeed(SEED, `${fold.name}/subsample`))
  return {
    fold,
    fitRows,
    holdRows: inner.holdout,
    xFit: buildMatrix(d, fitRows, set),
    yFit: labelsOf(d, fitRows),
    xHold: buildMatrix(d, inner.holdout, set),
    yHold: labelsOf(d, inner.holdout),
    xVal: buildMatrix(d, fold.val, set),
    yVal: labelsOf(d, fold.val),
  }
}

interface FamilyFoldResult {
  readonly family: ModelFamily
  readonly chosen?: string
  readonly gridHoldoutMacroF1?: Record<string, number>
  readonly temperature?: number
  readonly metrics: Metrics
  readonly calibration?: {
    readonly before: { ece: number; logLoss: number }
    readonly after: { ece: number; logLoss: number; bins: ReturnType<typeof calibrationBins>['bins'] }
  }
}

function runFold(d: Dataset, fold: Fold): FamilyFoldResult[] {
  const fd = foldData(d, fold, 'terrain')
  const out: FamilyFoldResult[] = []
  // Baselines: fit on every training row of the fold (no tuning needed).
  const yTrain = labelsOf(d, fold.train)
  const xTrain = buildMatrix(d, fold.train, 'terrain')
  out.push({ family: 'majority', metrics: evaluate(fitMajority(yTrain, K).predictProba(fd.xVal), fd.yVal, K) })
  out.push({ family: 'elevation-band', metrics: evaluate(fitElevationBand(elevationColumn(xTrain), yTrain, K).predictProba(fd.xVal), fd.yVal, K) })

  for (const family of LEARNED) {
    const grid = GRIDS[family]
    let best = -1
    let bestScore = -Infinity
    let bestModel: Classifier | null = null
    const scores: Record<string, number> = {}
    grid.forEach((g, gi) => {
      const model = fitLearned(family, gi, fd.xFit, fd.yFit, subSeed(SEED, `${fold.name}/${family}/${g.label}`))
      const s = evaluate(model.predictProba(fd.xHold), fd.yHold, K).macroF1
      scores[g.label] = s
      if (s > bestScore) {
        bestScore = s
        best = gi
        bestModel = model
      }
    })
    const model = bestModel as unknown as Classifier
    const holdProbs = model.predictProba(fd.xHold)
    const t = fitTemperature(holdProbs, fd.yHold, K)
    const valRaw = model.predictProba(fd.xVal)
    const valCal = applyTemperature(valRaw, K, t)
    const before = calibrationBins(valRaw, fd.yVal, K)
    const after = calibrationBins(valCal, fd.yVal, K)
    // Metrics on calibrated probabilities (same argmax, calibrated log loss).
    const metrics = evaluate(valCal, fd.yVal, K)
    out.push({
      family,
      chosen: grid[best].label,
      gridHoldoutMacroF1: scores,
      temperature: t,
      metrics,
      calibration: {
        before: { ece: before.ece, logLoss: evaluate(valRaw, fd.yVal, K).logLoss! },
        after: { ece: after.ece, logLoss: metrics.logLoss!, bins: after.bins },
      },
    })
    log(`  ${fold.name.padEnd(22)} ${family.padEnd(8)} ${grid[best].label.padEnd(14)} macro-F1 ${metrics.macroF1.toFixed(3)} acc ${metrics.accuracy.toFixed(3)} T ${t.toFixed(2)}`)
  }
  return out
}

function checkSplitLock(s: Splits): void {
  const lock = { seed: SEED, testFraction: TEST_FRACTION, testSize: s.test.size, testSha256: s.test.hash, devSize: s.dev.length }
  if (existsSync(SPLIT_LOCK_PATH)) {
    const prev = JSON.parse(readFileSync(SPLIT_LOCK_PATH, 'utf8'))
    for (const key of Object.keys(lock) as (keyof typeof lock)[])
      if (prev[key] !== lock[key])
        throw new Error(`Final test set changed (${key}: ${prev[key]} -> ${lock[key]}). The locked test set must not move; see docs/notes.md section 4.`)
  } else writeFileSync(SPLIT_LOCK_PATH, JSON.stringify(lock, null, 2) + '\n')
}

function samplesMatrix(samples: readonly TerrainSample[]): Matrix {
  const cols = FEATURE_NAMES.length
  const data = new Float64Array(samples.length * cols)
  samples.forEach((s, r) => data.set(sampleToVector(s), r * cols))
  return { rows: samples.length, cols, data }
}

// ---------------------------------------------------------------- main

function main(): void {
  const d = loadCovertype()
  const splits = makeSplits(d, SEED)
  checkSplitLock(splits)
  log(`Splits OK: dev ${splits.dev.length}, locked test ${splits.test.size}, LOAO val sizes ${splits.loao.map((f) => f.val.length).join('/')}`)

  // 2. All models on all folds.
  const folds = [splits.random, ...splits.loao]
  const foldResults = new Map<string, FamilyFoldResult[]>()
  for (const fold of folds) foldResults.set(fold.name, runFold(d, fold))

  const families: ModelFamily[] = ['majority', 'elevation-band', ...LEARNED]
  const summary = families.map((family) => {
    const per = splits.loao.map((f) => foldResults.get(f.name)!.find((r) => r.family === family)!)
    const random = foldResults.get('random')!.find((r) => r.family === family)!
    const f1s = per.map((r) => r.metrics.macroF1)
    const mean = f1s.reduce((a, b) => a + b, 0) / f1s.length
    const std = Math.sqrt(f1s.reduce((a, b) => a + (b - mean) ** 2, 0) / f1s.length)
    const pooled = metricsFromConfusion(per.map((r) => r.metrics.confusionMatrix).reduce(addConfusion))
    const chosen = per.map((r) => r.chosen).filter((c): c is string => c !== undefined)
    return {
      family,
      loaoMeanMacroF1: mean,
      loaoStdMacroF1: std,
      loaoMeanAccuracy: per.reduce((a, r) => a + r.metrics.accuracy, 0) / per.length,
      loaoPerFold: per.map((r, i) => ({ fold: splits.loao[i].name, ...pack(r.metrics), chosen: r.chosen, temperature: r.temperature, calibration: r.calibration && { before: r.calibration.before, after: { ece: r.calibration.after.ece, logLoss: r.calibration.after.logLoss } } })),
      loaoPooled: pack(pooled),
      random: { ...pack(random.metrics), chosen: random.chosen, temperature: random.temperature, calibration: random.calibration },
      chosenConfigs: chosen,
    }
  })

  // 3. Selection rule (docs/notes.md section 3).
  const eligible = summary.filter((s) => (LEARNED as readonly string[]).includes(s.family))
  const bestScore = Math.max(...eligible.map((s) => s.loaoMeanMacroF1))
  const withinNoise = eligible.filter((s) => s.loaoMeanMacroF1 >= bestScore - SELECTION_TIE_MARGIN)
  const selected = withinNoise.sort((a, b) => SIMPLICITY_ORDER.indexOf(a.family) - SIMPLICITY_ORDER.indexOf(b.family))[0]
  const family = selected.family as Learned
  const labels = GRIDS[family].map((g) => g.label)
  const counts = labels.map((l) => selected.chosenConfigs.filter((c) => c === l).length)
  const gridIndex = counts.indexOf(Math.max(...counts))
  log(`Selected ${family} (${labels[gridIndex]}): LOAO mean macro-F1 ${selected.loaoMeanMacroF1.toFixed(3)} (best ${bestScore.toFixed(3)}, margin ${SELECTION_TIE_MARGIN})`)

  // 4a. Ablations: selected family + config, every feature set, every fold.
  const ablationSets: FeatureSetName[] = ['terrain', 'terrain-no-hillshade', 'terrain-no-water', 'all-original']
  const importanceModels: { fold: Fold; model: Classifier; data: FoldData }[] = []
  const ablations = ablationSets.map((set) => {
    const perFold = folds.map((fold) => {
      const fd = foldData(d, fold, set)
      const model = fitLearned(family, gridIndex, fd.xFit, fd.yFit, subSeed(SEED, `${fold.name}/ablation/${set}`))
      const m = evaluate(model.predictProba(fd.xVal), fd.yVal, K)
      if (set === 'terrain') importanceModels.push({ fold, model, data: fd })
      return { fold: fold.name, accuracy: m.accuracy, macroF1: m.macroF1 }
    })
    const loao = perFold.filter((p) => p.fold !== 'random')
    const r = {
      featureSet: set,
      description: FEATURE_SETS[set].description,
      features: FEATURE_SETS[set].names.length,
      randomMacroF1: perFold[0].macroF1,
      loaoMeanMacroF1: loao.reduce((a, p) => a + p.macroF1, 0) / loao.length,
      perFold,
    }
    log(`  ablation ${set.padEnd(22)} random ${r.randomMacroF1.toFixed(3)}  LOAO ${r.loaoMeanMacroF1.toFixed(3)}`)
    return r
  })

  // 4b. Permutation importance on validation rows (random fold, and mean over LOAO folds).
  const importanceFor = (entries: typeof importanceModels) => {
    const all = entries.map(({ fold, model, data }) => {
      const rows = subsample(Uint32Array.from({ length: data.xVal.rows }, (_, i) => i), IMPORTANCE_ROWS, subSeed(SEED, `${fold.name}/importance-rows`))
      const x: Matrix = { rows: rows.length, cols: data.xVal.cols, data: new Float64Array(rows.length * data.xVal.cols) }
      const y = new Uint8Array(rows.length)
      rows.forEach((r, i) => {
        x.data.set(data.xVal.data.subarray(r * x.cols, (r + 1) * x.cols), i * x.cols)
        y[i] = data.yVal[r]
      })
      return permutationImportance(model, x, y, FEATURE_NAMES, IMPORTANCE_REPEATS, subSeed(SEED, `${fold.name}/importance`))
    })
    return FEATURE_NAMES.map((feature, j) => ({ feature, importance: all.reduce((a, r) => a + r[j].importance, 0) / all.length }))
  }
  const importance = {
    method: `Permutation importance: mean drop in macro-F1 when one feature is shuffled (${IMPORTANCE_REPEATS} repeats, up to ${IMPORTANCE_ROWS} validation rows per fold)`,
    random: importanceFor(importanceModels.filter((e) => e.fold.kind === 'random')),
    loaoMean: importanceFor(importanceModels.filter((e) => e.fold.kind === 'loao')),
  }
  log('Permutation importance done.')

  // 5. Final model on the dev set.
  const devFold: Fold = { name: 'final-dev', kind: 'random', train: splits.dev, val: new Uint32Array(0) }
  const fd = foldData(d, devFold, 'terrain')
  splits.test.assertDisjointFrom(fd.fitRows, 'final training rows')
  splits.test.assertDisjointFrom(fd.holdRows, 'final calibration rows')
  let finalModel = fitLearned(family, gridIndex, fd.xFit, fd.yFit, subSeed(SEED, `final/${family}`))
  if (family === 'forest') finalModel = roundForest(finalModel as ForestModel, K)
  const holdRaw = finalModel.predictProba(fd.xHold)
  const temperature = fitTemperature(holdRaw, fd.yHold, K)
  let shipped: Classifier = finalModel
  if (family !== 'forest') shipped = withTemperature(finalModel as NetworkModel, temperature)
  const holdShipped = shipped.predictProba(fd.xHold)
  const finalHoldout = evaluate(holdShipped, fd.yHold, K)

  // OOD: final detector on the dev inner-fit rows, threshold from the inner holdout.
  const devFitAll = buildMatrix(d, innerSplit(splits.dev, d.y, subSeed(SEED, 'final-dev/inner')).fit, 'terrain')
  const detector = fitStandardized(devFitAll)
  detector.threshold = percentile(standardizedScores(detector, fd.xHold), OOD_PERCENTILE)
  const maha = fitMahalanobis(devFitAll)
  maha.threshold = percentile(mahalanobisScores(maha, fd.xHold), OOD_PERCENTILE)

  // Training ranges for model_card inputs (all dev rows).
  const rawKeys = [
    ['elevation', 'Elevation', 'm', COL.elevation, undefined, undefined],
    ['slope', 'Slope', '°', COL.slope, 0, 90],
    ['aspectDegrees', 'Aspect', '° from north', COL.aspect, 0, 360],
    ['hillshade9am', 'Hillshade 9am', '0–255', COL.hillshade9am, 0, 255],
    ['hillshadeNoon', 'Hillshade noon', '0–255', COL.hillshadeNoon, 0, 255],
    ['hillshade3pm', 'Hillshade 3pm', '0–255', COL.hillshade3pm, 0, 255],
    ['horizontalDistanceToWater', 'Horizontal distance to water', 'm', COL.hDistHydro, 0, undefined],
    ['verticalDistanceToWater', 'Vertical distance to water', 'm', COL.vDistHydro, undefined, undefined],
  ] as const
  const inputs = rawKeys.map(([name, label, unit, col, hardMin, hardMax]) => {
    let min = Infinity
    let max = -Infinity
    for (const i of splits.dev) {
      const v = at(d, i, col)
      if (v < min) min = v
      if (v > max) max = v
    }
    return { name, label, unit, min, max, ...(hardMin !== undefined ? { hardMin } : {}), ...(hardMax !== undefined ? { hardMax } : {}) }
  })
  const elevRange = inputs[0]

  // OOD study.
  const loaoOod = splits.loao.map((fold) => {
    const inner = innerSplit(fold.train, d.y, subSeed(SEED, `${fold.name}/inner`))
    const xFit = buildMatrix(d, inner.fit, 'terrain')
    const xHold = buildMatrix(d, inner.holdout, 'terrain')
    const xVal = buildMatrix(d, fold.val, 'terrain')
    const sd = fitStandardized(xFit)
    sd.threshold = percentile(standardizedScores(sd, xHold), OOD_PERCENTILE)
    const md = fitMahalanobis(xFit)
    md.threshold = percentile(mahalanobisScores(md, xHold), OOD_PERCENTILE)
    return {
      heldOutArea: AREA_NAMES[fold.heldOutArea!],
      standardizedFlaggedRate: flaggedRate(standardizedScores(sd, xVal), sd.threshold),
      mahalanobisFlaggedRate: flaggedRate(mahalanobisScores(md, xVal), md.threshold),
    }
  })
  const generated = generatedLandSamples(SANDBOX_WORLD, GENERATED_SEEDS, elevRange)
  const xGen = samplesMatrix(generated)
  const genOutOfRange =
    generated.filter((s) => inputs.some((inp) => s[inp.name] < inp.min || s[inp.name] > inp.max)).length / generated.length
  const genStd = flaggedRate(standardizedScores(detector, xGen), detector.threshold)
  const genMaha = flaggedRate(mahalanobisScores(maha, xGen), maha.threshold)
  const oodStudy = {
    percentile: OOD_PERCENTILE,
    threshold: detector.threshold,
    devHoldoutFlaggedRate: flaggedRate(standardizedScores(detector, fd.xHold), detector.threshold),
    mahalanobisComparison: { threshold: maha.threshold, devHoldoutFlaggedRate: flaggedRate(mahalanobisScores(maha, fd.xHold), maha.threshold) },
    loaoHeldOutArea: loaoOod,
    generatedTerrain: {
      generator: `packages/sim/terrain generateTerrain, ${SANDBOX_WORLD.description}, seeds ${GENERATED_SEEDS[0]}-${GENERATED_SEEDS[GENERATED_SEEDS.length - 1]} (water cells excluded), inputs from @graze/features heightmapToSamples. Detector only; the app-level rates are in walkMode below.`,
      cells: generated.length,
      standardizedFlaggedRate: genStd,
      mahalanobisFlaggedRate: genMaha,
      outsideTrainingRangeRate: genOutOfRange,
    },
  }
  log(`OOD threshold ${detector.threshold.toFixed(3)}; generated terrain flagged ${(100 * genStd).toFixed(1)}% (Mahalanobis ${(100 * genMaha).toFixed(1)}%)`)

  // Fixtures: real dev rows (every class, every area) + generated cells + an extreme input.
  const fixtureSamples: { source: string; sample: TerrainSample }[] = []
  for (let c = 0; c < K; c++) {
    const row = fd.holdRows.find((r) => d.y[r] === c)
    if (row !== undefined) fixtureSamples.push({ source: `dev holdout row ${row} (${CLASS_NAMES[c]}, ${AREA_NAMES[d.area[row]]})`, sample: rowToSample(d, row) })
  }
  for (let i = 0; i < 8; i++) {
    const idx = Math.floor((i * generated.length) / 8)
    fixtureSamples.push({ source: `generated terrain cell ${idx}`, sample: generated[idx] })
  }
  fixtureSamples.push({
    source: 'extreme input (outside training ranges)',
    sample: { elevation: 5000, slope: 80, aspectDegrees: 45, hillshade9am: 0, hillshadeNoon: 0, hillshade3pm: 0, horizontalDistanceToWater: 9000, verticalDistanceToWater: -900 },
  })
  const xFix = samplesMatrix(fixtureSamples.map((f) => f.sample))
  const fixProbs = shipped.predictProba(xFix)
  const fixOod = standardizedScores(detector, xFix)
  const fixtures = {
    generatedBy: 'ml/src/train.ts',
    // Training-side probabilities are Float32 (about 7 significant digits).
    tolerance: 1e-6,
    cases: fixtureSamples.map((f, i) => {
      const probs = Array.from(fixProbs.subarray(i * K, (i + 1) * K))
      return { source: f.source, sample: f.sample, probs, classIndex: probs.indexOf(Math.max(...probs)), oodScore: fixOod[i], ood: fixOod[i] > detector.threshold }
    }),
  }

  // Export model.json.
  const modelJson = exportModelJson(shipped as NetworkModel | ForestModel, detector, temperature)
  const modelJsonText = JSON.stringify(modelJson)

  // model_card.json.
  const classCounts = new Array<number>(K).fill(0)
  for (const c of d.y) classCounts[c]++
  const sel = summary.find((s) => s.family === family)!
  const familyName: Record<ModelFamily, string> = {
    majority: 'Majority class',
    'elevation-band': 'Elevation-band rule',
    softmax: 'Softmax regression',
    mlp: 'Small MLP',
    forest: 'Random forest',
  }
  const exploration = JSON.parse(readFileSync(join(REPORTS_DIR, 'exploration.json'), 'utf8'))
  const today = new Date().toISOString().slice(0, 10)
  const cardBase = {
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    model: {
      name: 'Project Graze habitat classifier',
      type: family,
      version: MODEL_VERSION,
      trainedAt: today,
      seed: SEED,
      selectionRule:
        `Highest mean macro-F1 over the 4 leave-one-wilderness-area-out folds; a simpler model within ${SELECTION_TIE_MARGIN} macro-F1 of the best wins (softmax < MLP < forest). Written before any LOAO result (docs/notes.md section 3).`,
      config: GRIDS[family][gridIndex],
      frozen: false,
    },
    classes: [...CLASS_NAMES],
    classDisplayLabels: [...CLASS_DISPLAY_LABELS],
    classOrderNote:
      'Class indices are a stable contract: the cover map, vegetation meshes and tints are keyed by index. Reordering or renaming a class requires telling Roles 1 and 2 first and bumping modelVersion.',
    features: [...FEATURE_NAMES],
    inputs,
    dataset: {
      name: 'Covertype (UCI Machine Learning Repository)',
      citation: DATASET_CITATION,
      doi: DATASET_DOI,
      license: DATASET_LICENSE,
      url: DATASET_PAGE,
      instances: d.n,
      region: 'Four wilderness areas of the Roosevelt National Forest, northern Colorado, USA (30 m x 30 m cells)',
      featuresUsed: [...FEATURE_NAMES],
      featuresExcluded: ['Soil type (40 indicators)', 'Wilderness area (4 indicators)', 'Horizontal distance to roadways', 'Horizontal distance to fire points'],
      classCounts,
      preparation: [
        'Downloaded from UCI and verified by SHA-256 (ml:fetch).',
        `Locked final test set: stratified ${TEST_FRACTION * 100}% of all rows (${splits.test.size}), never used before the model freeze.`,
        'Model inputs built with @graze/features sampleToVector, the same function the app uses (aspect -> sin/cos).',
        'Standardization (networks) and the OOD detector fit on training rows only; temperature and OOD threshold on a 15% inner holdout of the training rows.',
        `Flexible models trained on a uniform subsample of at most ${MAX_TRAIN_ROWS} training rows per fold.`,
      ],
    },
    split: {
      strategy: 'Leave-one-wilderness-area-out (selection) + stratified random split (optimistic reference)',
      description:
        'Random splits put neighbouring, correlated 30 m cells on both sides, so they overstate accuracy. Holding out a whole wilderness area tests generalization to a new landscape, which is what the sandbox asks of the model.',
      details: [
        `Dev set: ${splits.dev.length} rows; locked test set: ${splits.test.size} rows.`,
        `Random split of dev: ${splits.random.train.length} train / ${splits.random.val.length} validation (stratified).`,
        ...splits.loao.map((f) => `LOAO fold, held-out ${AREA_NAMES[f.heldOutArea!]}: ${f.train.length} train / ${f.val.length} validation.`),
        'Cottonwood/Willow occurs only in Cache la Poudre, so it is unseen in training when that area is held out.',
      ],
    },
    baselines: summary.map((s) => ({
      name: familyName[s.family],
      accuracy: s.loaoMeanAccuracy,
      macroF1: s.loaoMeanMacroF1,
      selected: s.family === family,
      notes: `Mean over LOAO folds (std ${s.loaoStdMacroF1.toFixed(3)}). Random split: macro-F1 ${s.random.macroF1.toFixed(3)}, accuracy ${s.random.accuracy.toFixed(3)}.`,
    })),
    evaluations: [
      { name: familyName[family], split: 'Random split (optimistic)', accuracy: sel.random.accuracy, macroF1: sel.random.macroF1, logLoss: sel.random.logLoss, confusionMatrix: sel.random.confusionMatrix, perClass: sel.random.perClass },
      { name: familyName[family], split: 'Leave-one-area-out (pooled over 4 folds)', accuracy: sel.loaoPooled.accuracy, macroF1: sel.loaoPooled.macroF1, logLoss: sel.loaoPooled.logLoss, confusionMatrix: sel.loaoPooled.confusionMatrix, perClass: sel.loaoPooled.perClass },
      ...sel.loaoPerFold.map((f) => ({ name: familyName[family], split: `Held-out area: ${f.fold.replace('loao-', '')}`, accuracy: f.accuracy, macroF1: f.macroF1, logLoss: f.logLoss, confusionMatrix: f.confusionMatrix, perClass: f.perClass })),
      ...summary
        .filter((s) => s.family !== family)
        .flatMap((s) => [
          { name: familyName[s.family], split: 'Random split (optimistic)', accuracy: s.random.accuracy, macroF1: s.random.macroF1, logLoss: s.random.logLoss, confusionMatrix: s.random.confusionMatrix, perClass: s.random.perClass },
          { name: familyName[s.family], split: 'Leave-one-area-out (pooled over 4 folds)', accuracy: s.loaoPooled.accuracy, macroF1: s.loaoPooled.macroF1, logLoss: s.loaoPooled.logLoss, confusionMatrix: s.loaoPooled.confusionMatrix, perClass: s.loaoPooled.perClass },
        ]),
    ],
    calibration: {
      method:
        family === 'forest'
          ? 'Temperature scaling fitted on the inner holdout; NOT applied by the app runtime (forest format has no temperature), bins show calibrated probabilities on the random-split validation'
          : 'Temperature scaling fitted on the inner holdout and folded into the last layer; bins are on the random-split validation',
      temperature: sel.random.temperature,
      eceBefore: sel.random.calibration!.before.ece,
      ece: sel.random.calibration!.after.ece,
      bins: sel.random.calibration!.after.bins,
      shippedModelTemperature: temperature,
    },
    ablations: ablations.map((a) => ({
      name: a.featureSet,
      description: `${a.description} LOAO mean macro-F1 shown; random split ${a.randomMacroF1.toFixed(3)}.`,
      macroF1: a.loaoMeanMacroF1,
      referenceMacroF1: ablations[0].loaoMeanMacroF1,
    })),
    featureImportance: { method: `${importance.method}; mean over the 4 LOAO folds`, values: importance.loaoMean },
    ood: {
      method: 'standardized-distance',
      description: `Root-mean-square z-score of the 9 model features against the training mean/std. Threshold = ${OOD_PERCENTILE * 100}th percentile of distances on in-distribution holdout rows, so about ${((1 - OOD_PERCENTILE) * 100).toFixed(0)}% of normal rows are flagged by design. It measures distance from the centre of the data, not unusual combinations of normal values.`,
      threshold: detector.threshold,
      flaggedRate: oodStudy.devHoldoutFlaggedRate,
      heldOutAreaFlaggedRate: Object.fromEntries(loaoOod.map((o) => [o.heldOutArea, o.standardizedFlaggedRate])),
    },
    finalModelHoldout: { accuracy: finalHoldout.accuracy, macroF1: finalHoldout.macroF1, logLoss: finalHoldout.logLoss, note: 'Inner holdout of the dev set (also used for temperature and OOD threshold); not the locked test set.' },
    hillshade: { method: '@graze/features hillshade() with dataset-fitted sun positions', check: exploration.hillshadeCheck },
    finalTest: null,
    limitations: [
      'Predicts the mapped cover type of 30 m cells in four Colorado wilderness areas from terrain alone; it knows nothing about soil, climate, fire history or disturbance.',
      'Soil type, wilderness area and distances to roads and fire points are excluded because generated terrain has none of them; the all-original-features ablation shows what that costs.',
      'Spruce/Fir and Lodgepole Pine are most of the data; accuracy mostly reflects those two classes, so macro-F1 and per-class recall are reported.',
      'Leave-one-area-out results vary a lot between areas; a held-out area can contain classes or elevations the training areas barely have.',
      'Generated terrain is synthetic; hillshade and water distances are computed differently from the GIS layers behind the dataset.',
      'The OOD flag is a distance from the training centre; it cannot catch inputs that look typical feature-by-feature but never occur together in real landscapes.',
      'Walk-mode vegetation and overlays draw the predicted class of each cell of generated terrain. The terrain is not a real place, a good-looking world is not evidence that the model is accurate, and low-trust (OOD) cells are drawn differently because their predictions are guesses.',
      'Educational simulation only, not a forest-management or ecological decision tool.',
    ],
    versions: {
      node: process.version,
      pipeline: 'ml/src (no ML libraries)',
      modelJsonBytes: Buffer.byteLength(modelJsonText),
      modelJsonSha256: createHash('sha256').update(modelJsonText).digest('hex'),
    },
  }

  // Generated terrain as the app sees it (D12): Role 1's generator, the app's
  // inputs function, the app engine on the files being exported.
  const walkMode = generatedTerrainStudy(appEngine(cardBase, modelJson))
  const sandbox = walkMode.worlds.find((w) => w.name === SANDBOX_WORLD.name)!
  const card = {
    ...cardBase,
    ood: {
      ...cardBase.ood,
      generatedTerrainFlaggedRate: sandbox.flaggedRate,
      generatedTerrain: {
        generator: walkMode.generator,
        seeds: `${GENERATED_SEEDS[0]}-${GENERATED_SEEDS[GENERATED_SEEDS.length - 1]}`,
        flagDefinition: walkMode.flagDefinition,
        worlds: walkMode.worlds.map(({ perSeed: _p, predictedClassShare: _c, seeds: _s, ...w }) => w),
      },
    },
  }
  log(`Generated terrain (${SANDBOX_WORLD.name}): app flags ${(100 * sandbox.flaggedRate).toFixed(1)}% of land cells as low trust`)

  const report = {
    generatedBy: 'ml/src/train.ts',
    trainedAt: today,
    seed: SEED,
    maxTrainRows: MAX_TRAIN_ROWS,
    grids: GRIDS,
    selection: { rule: card.model.selectionRule, bestScore, withinNoise: withinNoise.map((s) => s.family), selected: family, config: GRIDS[family][gridIndex], configVotes: Object.fromEntries(labels.map((l, i) => [l, counts[i]])) },
    summary,
    ablations,
    importance,
    ood: { ...oodStudy, walkMode },
    final: { temperature, holdout: pack(finalHoldout), modelJsonBytes: Buffer.byteLength(modelJsonText) },
    runtimeSeconds: (performance.now() - t0) / 1000,
  }

  mkdirSync(MODEL_OUT_DIR, { recursive: true })
  mkdirSync(REPORTS_DIR, { recursive: true })
  mkdirSync(dirname(FIXTURES_PATH), { recursive: true })
  writeFileSync(join(MODEL_OUT_DIR, 'model.json'), modelJsonText)
  writeFileSync(join(MODEL_OUT_DIR, 'model_card.json'), JSON.stringify(card, null, 2) + '\n')
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2) + '\n')
  writeFileSync(join(REPORTS_DIR, 'train-report.json'), JSON.stringify(report, null, 2) + '\n')
  log(`Wrote model.json (${(Buffer.byteLength(modelJsonText) / 1e6).toFixed(2)} MB), model_card.json, fixtures, train-report.json.`)
}

main()
