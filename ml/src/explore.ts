/**
 * `pnpm ml:explore` (D1 spike + D3 exploration). Prints and writes
 * ml/reports/exploration.json:
 *  - class counts (whole dataset; label counts only),
 *  - majority-class and elevation-band baselines on the random split,
 *  - feature ranges, odd values and duplicate rows on the DEV set only
 *    (the final test set is never read here),
 *  - the hillshade check: our @graze/features hillshade formula applied to
 *    the dataset's own slope/aspect vs. the dataset's hillshade columns.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SUN, SUN_ASTRONOMICAL, hillshade, type SunPosition } from '../../packages/features/src/index.ts'
import { AREA_NAMES, CLASS_NAMES, COL, N_AREAS, N_CLASSES, N_COLUMNS, at, loadCovertype, type Dataset } from './data/covertype.ts'
import { REPORTS_DIR } from './data/paths.ts'
import { buildMatrix, labelsOf } from './featureSets.ts'
import { evaluate } from './metrics.ts'
import { fitElevationBand, fitMajority } from './models/baselines.ts'
import { makeSplits } from './splits.ts'
import { SEED } from './config.ts'

const RAW_COLS = [
  ['elevation', COL.elevation, 'm'],
  ['slope', COL.slope, 'deg'],
  ['aspectDegrees', COL.aspect, 'deg'],
  ['hillshade9am', COL.hillshade9am, '0-255'],
  ['hillshadeNoon', COL.hillshadeNoon, '0-255'],
  ['hillshade3pm', COL.hillshade3pm, '0-255'],
  ['horizontalDistanceToWater', COL.hDistHydro, 'm'],
  ['verticalDistanceToWater', COL.vDistHydro, 'm'],
  ['horizontalDistanceToRoadways', COL.hDistRoad, 'm'],
  ['horizontalDistanceToFirePoints', COL.hDistFire, 'm'],
] as const

function quantiles(sorted: Float64Array, qs: number[]): number[] {
  return qs.map((q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))])
}

function columnStats(d: Dataset, rows: Uint32Array, col: number) {
  const v = new Float64Array(rows.length)
  let sum = 0
  for (let i = 0; i < rows.length; i++) {
    v[i] = at(d, rows[i], col)
    sum += v[i]
  }
  const mean = sum / v.length
  let ss = 0
  for (const x of v) ss += (x - mean) ** 2
  v.sort()
  const [p01, p50, p99] = quantiles(v, [0.01, 0.5, 0.99])
  let zeros = 0
  let negatives = 0
  for (const x of v) {
    if (x === 0) zeros++
    if (x < 0) negatives++
  }
  return { min: v[0], p01, median: p50, p99, max: v[v.length - 1], mean, std: Math.sqrt(ss / v.length), zeros, negatives }
}

/** Mean absolute error of our hillshade formula vs. a dataset hillshade column. */
function hillshadeError(d: Dataset, rows: Uint32Array, col: number, sun: SunPosition) {
  let abs = 0
  let bias = 0
  for (const r of rows) {
    const ours = hillshade(at(d, r, COL.slope), at(d, r, COL.aspect), sun)
    const diff = ours - at(d, r, col)
    abs += Math.abs(diff)
    bias += diff
  }
  return { mae: abs / rows.length, meanDifference: bias / rows.length }
}

/** Coarse-to-fine grid search for the sun position that best reproduces a column (diagnostic only). */
function fitSun(d: Dataset, rows: Uint32Array, col: number): SunPosition & { mae: number } {
  let best = { azimuth: 0, altitude: 0, mae: Infinity }
  const search = (azs: number[], alts: number[]) => {
    for (const azimuth of azs)
      for (const altitude of alts) {
        const { mae } = hillshadeError(d, rows, col, { azimuth, altitude })
        if (mae < best.mae) best = { azimuth, altitude, mae }
      }
  }
  const range = (lo: number, hi: number, step: number) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step)
  search(range(0, 355, 5), range(5, 85, 5))
  search(range(best.azimuth - 5, best.azimuth + 5, 1), range(best.altitude - 5, best.altitude + 5, 1))
  search(range(best.azimuth - 1, best.azimuth + 1, 0.25), range(best.altitude - 1, best.altitude + 1, 0.25))
  return best
}

function main(): void {
  const d = loadCovertype()
  const s = makeSplits(d, SEED)
  const dev = s.dev

  const classCounts = new Array<number>(N_CLASSES).fill(0)
  for (const c of d.y) classCounts[c]++
  const areaClass = Array.from({ length: N_AREAS }, () => new Array<number>(N_CLASSES).fill(0))
  for (const i of dev) areaClass[d.area[i]][d.y[i]]++

  // Baselines on the random split (fit on train, scored on validation).
  const yTrain = labelsOf(d, s.random.train)
  const yVal = labelsOf(d, s.random.val)
  const trainM = buildMatrix(d, s.random.train, 'terrain')
  const valM = buildMatrix(d, s.random.val, 'terrain')
  const elev = new Float64Array(trainM.rows)
  for (let i = 0; i < trainM.rows; i++) elev[i] = trainM.data[i * trainM.cols]
  const majority = evaluate(fitMajority(yTrain, N_CLASSES).predictProba(valM), yVal, N_CLASSES)
  const band = evaluate(fitElevationBand(elev, yTrain, N_CLASSES).predictProba(valM), yVal, N_CLASSES)

  const ranges = Object.fromEntries(RAW_COLS.map(([name, col, unit]) => [name, { unit, ...columnStats(d, dev, col) }]))

  // Duplicates: identical full 54-column rows, and identical 8 raw model inputs.
  const seenFull = new Map<string, number>()
  const seenRaw = new Map<string, Set<number>>()
  let dupFull = 0
  let dupRaw = 0
  let conflictingRaw = 0
  for (const i of dev) {
    const full = Array.from(d.x.subarray(i * N_COLUMNS, (i + 1) * N_COLUMNS)).join(',')
    if (seenFull.has(full)) dupFull++
    else seenFull.set(full, i)
    const raw = RAW_COLS.slice(0, 8).map(([, c]) => at(d, i, c)).join(',')
    const labels = seenRaw.get(raw)
    if (labels) {
      dupRaw++
      if (!labels.has(d.y[i])) conflictingRaw++
      labels.add(d.y[i])
    } else seenRaw.set(raw, new Set([d.y[i]]))
  }

  // Odd values worth knowing about.
  let aspect360 = 0
  let allHillshadeZero = 0
  for (const i of dev) {
    if (at(d, i, COL.aspect) === 360) aspect360++
    if (at(d, i, COL.hillshade9am) === 0 && at(d, i, COL.hillshadeNoon) === 0 && at(d, i, COL.hillshade3pm) === 0) allHillshadeZero++
  }

  // Hillshade check on a fixed 50k dev subsample (enough for a stable MAE).
  const hsRows = dev.filter((_, i) => i % Math.ceil(dev.length / 50_000) === 0)
  const hillshadeCheck = (['hillshade9am', 'hillshadeNoon', 'hillshade3pm'] as const).map((key) => {
    const col = COL[key]
    return {
      column: key,
      astronomicalSun: SUN_ASTRONOMICAL[key],
      astronomical: hillshadeError(d, hsRows, col, SUN_ASTRONOMICAL[key]),
      sharedSun: SUN[key],
      shared: hillshadeError(d, hsRows, col, SUN[key]),
      bestFitSun: fitSun(d, hsRows, col),
    }
  })

  const report = {
    generatedBy: 'ml/src/explore.ts',
    seed: SEED,
    rows: d.n,
    devRows: dev.length,
    testRowsLocked: s.test.size,
    classes: CLASS_NAMES,
    classCounts,
    classShare: classCounts.map((c) => c / d.n),
    areas: AREA_NAMES,
    devClassCountsByArea: areaClass,
    baselinesRandomSplit: {
      majority: { accuracy: majority.accuracy, macroF1: majority.macroF1 },
      elevationBand: { accuracy: band.accuracy, macroF1: band.macroF1 },
    },
    devRanges: ranges,
    devOddValues: { aspect360, allHillshadeZero, hillshade3pmZero: ranges.hillshade3pm.zeros, negativeVerticalDistance: ranges.verticalDistanceToWater.negatives },
    devDuplicates: { identicalFullRows: dupFull, identicalRawInputs: dupRaw, identicalRawInputsWithDifferentLabel: conflictingRaw },
    hillshadeCheck: { rows: hsRows.length, results: hillshadeCheck },
  }
  mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(join(REPORTS_DIR, 'exploration.json'), JSON.stringify(report, null, 2) + '\n')

  const pct = (v: number) => (100 * v).toFixed(2) + '%'
  console.log(`Covertype: ${d.n} rows, ${N_COLUMNS} features, ${N_CLASSES} classes. Dev ${dev.length}, locked test ${s.test.size}.`)
  console.log('\nClass counts (whole dataset):')
  CLASS_NAMES.forEach((c, i) => console.log(`  ${String(i).padStart(1)} ${c.padEnd(18)} ${String(classCounts[i]).padStart(7)}  ${pct(classCounts[i] / d.n)}`))
  console.log('\nBaselines (random split, fit on train, scored on validation):')
  console.log(`  majority class      accuracy ${pct(majority.accuracy)}  macro-F1 ${majority.macroF1.toFixed(3)}`)
  console.log(`  elevation-band rule accuracy ${pct(band.accuracy)}  macro-F1 ${band.macroF1.toFixed(3)}`)
  console.log('\nHillshade check (our formula on dataset slope/aspect vs. dataset column):')
  for (const h of hillshadeCheck)
    console.log(
      `  ${h.column.padEnd(14)} astronomical MAE ${h.astronomical.mae.toFixed(2)} | shared SUN MAE ${h.shared.mae.toFixed(2)} | best fit az ${h.bestFitSun.azimuth} alt ${h.bestFitSun.altitude} MAE ${h.bestFitSun.mae.toFixed(2)}`,
    )
  console.log(`\nDuplicates in dev: ${dupFull} identical full rows, ${dupRaw} identical raw inputs (${conflictingRaw} with a different label).`)
  console.log(`Wrote ${join(REPORTS_DIR, 'exploration.json')}`)
}

main()
