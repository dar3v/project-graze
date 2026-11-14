/**
 * Feature matrices for training and ablations. The deployed feature set
 * ("terrain") is built ONLY through @graze/features `sampleToVector`, the same
 * function the app calls, so training and serving cannot drift.
 */
import { FEATURE_NAMES, sampleToVector } from '../../packages/features/src/index.ts'
import { COL, COLUMN_NAMES, N_COLUMNS, rowToSample, type Dataset } from './data/covertype.ts'

export type FeatureSetName = 'terrain' | 'terrain-no-hillshade' | 'terrain-no-water' | 'all-original'

export interface FeatureSet {
  readonly name: FeatureSetName
  readonly description: string
  readonly names: readonly string[]
}

const HILLSHADE = new Set(['hillshade9am', 'hillshadeNoon', 'hillshade3pm'])
const WATER = new Set(['horizontalDistanceToWater', 'verticalDistanceToWater'])
const EXTRA_COLS = [COL.hDistRoad, COL.hDistFire, ...Array.from({ length: 44 }, (_, i) => COL.wildernessStart + i)]

export const FEATURE_SETS: Record<FeatureSetName, FeatureSet> = {
  terrain: {
    name: 'terrain',
    description: 'The deployed contract: FEATURE_NAMES from @graze/features (9 values).',
    names: FEATURE_NAMES,
  },
  'terrain-no-hillshade': {
    name: 'terrain-no-hillshade',
    description: 'Contract features without the three hillshade columns.',
    names: FEATURE_NAMES.filter((n) => !HILLSHADE.has(n)),
  },
  'terrain-no-water': {
    name: 'terrain-no-water',
    description: 'Contract features without horizontal/vertical distance to water.',
    names: FEATURE_NAMES.filter((n) => !WATER.has(n)),
  },
  'all-original': {
    name: 'all-original',
    description:
      'Contract features plus the excluded original columns: distance to roads and fire points, 4 wilderness-area and 40 soil-type indicators. Evaluation only; generated terrain has none of these.',
    names: [...FEATURE_NAMES, ...EXTRA_COLS.map((c) => COLUMN_NAMES[c])],
  },
}

export interface Matrix {
  readonly rows: number
  readonly cols: number
  readonly data: Float64Array
}

export const rowOf = (m: Matrix, r: number): Float64Array => m.data.subarray(r * m.cols, (r + 1) * m.cols)

/** Build the feature matrix for `indices` (row r of the matrix = dataset row indices[r]). */
export function buildMatrix(d: Dataset, indices: ArrayLike<number>, set: FeatureSetName): Matrix {
  const names = FEATURE_SETS[set].names
  const keep = FEATURE_NAMES.map((n) => names.includes(n))
  const cols = names.length
  const data = new Float64Array(indices.length * cols)
  for (let r = 0; r < indices.length; r++) {
    const row = indices[r]
    const v = sampleToVector(rowToSample(d, row))
    let c = r * cols
    for (let j = 0; j < v.length; j++) if (keep[j]) data[c++] = v[j]
    if (set === 'all-original') for (const col of EXTRA_COLS) data[c++] = d.x[row * N_COLUMNS + col]
  }
  return { rows: indices.length, cols, data }
}

export function labelsOf(d: Dataset, indices: ArrayLike<number>): Uint8Array {
  const y = new Uint8Array(indices.length)
  for (let r = 0; r < indices.length; r++) y[r] = d.y[indices[r]]
  return y
}

export interface Scaler {
  readonly mean: number[]
  readonly std: number[]
}

/** Per-column mean/std fit on the given (training) matrix only. Zero-variance columns get std 1. */
export function fitScaler(m: Matrix): Scaler {
  const mean = new Array<number>(m.cols).fill(0)
  const sq = new Array<number>(m.cols).fill(0)
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) {
      const v = m.data[r * m.cols + c]
      mean[c] += v
      sq[c] += v * v
    }
  const std = mean.map((s, c) => {
    const mu = s / m.rows
    const variance = sq[c] / m.rows - mu * mu
    return variance > 1e-12 ? Math.sqrt(variance) : 1
  })
  return { mean: mean.map((s) => s / m.rows), std }
}

export function applyScaler(m: Matrix, s: Scaler): Matrix {
  const data = new Float64Array(m.data.length)
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) data[r * m.cols + c] = (m.data[r * m.cols + c] - s.mean[c]) / s.std[c]
  return { rows: m.rows, cols: m.cols, data }
}
