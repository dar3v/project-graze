/**
 * Covertype schema and loader. Column order, units and codes come from
 * covtype.info (shipped inside the UCI zip; `ml:fetch` extracts it next to
 * the data so it can be checked).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

import type { TerrainSample } from '../../../packages/features/src/index.ts'
import { DATA_DIR } from './paths.ts'

export const DATASET_URL = 'https://archive.ics.uci.edu/static/public/31/covertype.zip'
export const DATASET_PAGE = 'https://archive.ics.uci.edu/dataset/31/covertype'
export const DATASET_DOI = '10.24432/C50K5N'
export const DATASET_CITATION =
  'Blackard, J. (1998). Covertype [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C50K5N'
export const DATASET_LICENSE = 'CC BY 4.0'
/**
 * SHA-256 of covertype.zip as downloaded on 2026-11-14. If UCI repackages the
 * file, `ml:fetch` stops and asks a human to confirm and update this value.
 */
export const DATASET_ZIP_SHA256 = '89a975c2457cd48e824238ae43c5a3cb762e42c4b4078d9b44a4514055105f6d'

export const ZIP_PATH = join(DATA_DIR, 'covertype.zip')
export const GZ_PATH = join(DATA_DIR, 'covtype.data.gz')
export const INFO_PATH = join(DATA_DIR, 'covtype.info')
/** Parsed binary cache (Int16 columns + labels), rebuilt when missing. */
export const BIN_PATH = join(DATA_DIR, 'covtype.bin')

/** The 54 feature columns, in file order (covtype.info section 7). */
export const COLUMN_NAMES: readonly string[] = [
  'Elevation',
  'Aspect',
  'Slope',
  'Horizontal_Distance_To_Hydrology',
  'Vertical_Distance_To_Hydrology',
  'Horizontal_Distance_To_Roadways',
  'Hillshade_9am',
  'Hillshade_Noon',
  'Hillshade_3pm',
  'Horizontal_Distance_To_Fire_Points',
  ...Array.from({ length: 4 }, (_, i) => `Wilderness_Area${i + 1}`),
  ...Array.from({ length: 40 }, (_, i) => `Soil_Type${i + 1}`),
]
export const N_COLUMNS = 54

export const COL = {
  elevation: 0,
  aspect: 1,
  slope: 2,
  hDistHydro: 3,
  vDistHydro: 4,
  hDistRoad: 5,
  hillshade9am: 6,
  hillshadeNoon: 7,
  hillshade3pm: 8,
  hDistFire: 9,
  wildernessStart: 10,
  soilStart: 14,
} as const

/** Class names in class-index order (Cover_Type 1..7 -> index 0..6). */
export const CLASS_NAMES = [
  'Spruce/Fir',
  'Lodgepole Pine',
  'Ponderosa Pine',
  'Cottonwood/Willow',
  'Aspen',
  'Douglas-fir',
  'Krummholz',
] as const
export const N_CLASSES = CLASS_NAMES.length

/** Wilderness area names in area-index order (Wilderness_Area1..4 -> 0..3). */
export const AREA_NAMES = ['Rawah', 'Neota', 'Comanche Peak', 'Cache la Poudre'] as const
export const N_AREAS = AREA_NAMES.length

export interface Dataset {
  readonly n: number
  /** n x 54, row-major, raw integer values exactly as in the file. */
  readonly x: Int16Array
  /** Class index 0..6. */
  readonly y: Uint8Array
  /** Wilderness area index 0..3 (decoded from the one-hot columns). */
  readonly area: Uint8Array
}

export const at = (d: Dataset, row: number, col: number): number => d.x[row * N_COLUMNS + col]

/** One dataset row as the shared raw-input shape (@graze/features). */
export function rowToSample(d: Dataset, row: number): TerrainSample {
  const o = row * N_COLUMNS
  return {
    elevation: d.x[o + COL.elevation],
    slope: d.x[o + COL.slope],
    aspectDegrees: d.x[o + COL.aspect],
    hillshade9am: d.x[o + COL.hillshade9am],
    hillshadeNoon: d.x[o + COL.hillshadeNoon],
    hillshade3pm: d.x[o + COL.hillshade3pm],
    horizontalDistanceToWater: d.x[o + COL.hDistHydro],
    verticalDistanceToWater: d.x[o + COL.vDistHydro],
  }
}

export function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** Parse covtype.data text. Throws on any malformed row instead of skipping it. */
export function parseCovtype(text: string): Dataset {
  const lines = text.split('\n')
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  const n = lines.length
  const x = new Int16Array(n * N_COLUMNS)
  const y = new Uint8Array(n)
  const area = new Uint8Array(n)
  for (let r = 0; r < n; r++) {
    const parts = lines[r].split(',')
    if (parts.length !== N_COLUMNS + 1) throw new Error(`Row ${r + 1}: expected ${N_COLUMNS + 1} values, got ${parts.length}.`)
    let areaCount = 0
    for (let c = 0; c < N_COLUMNS; c++) {
      const v = Number(parts[c])
      if (!Number.isInteger(v) || v < -32768 || v > 32767) throw new Error(`Row ${r + 1}, column ${COLUMN_NAMES[c]}: bad value "${parts[c]}".`)
      x[r * N_COLUMNS + c] = v
      if (c >= COL.wildernessStart && c < COL.wildernessStart + N_AREAS && v === 1) {
        area[r] = c - COL.wildernessStart
        areaCount++
      }
    }
    if (areaCount !== 1) throw new Error(`Row ${r + 1}: expected exactly one wilderness area, got ${areaCount}.`)
    const label = Number(parts[N_COLUMNS])
    if (!Number.isInteger(label) || label < 1 || label > N_CLASSES) throw new Error(`Row ${r + 1}: bad Cover_Type "${parts[N_COLUMNS]}".`)
    y[r] = label - 1
  }
  return { n, x, y, area }
}

/** Load the dataset, building the binary cache from covtype.data.gz on first use. */
export function loadCovertype(): Dataset {
  if (existsSync(BIN_PATH)) {
    const buf = readFileSync(BIN_PATH)
    const n = buf.readUInt32LE(0)
    const xBytes = n * N_COLUMNS * 2
    const x = new Int16Array(buf.buffer.slice(buf.byteOffset + 4, buf.byteOffset + 4 + xBytes))
    const y = new Uint8Array(buf.subarray(4 + xBytes, 4 + xBytes + n))
    const area = new Uint8Array(buf.subarray(4 + xBytes + n, 4 + xBytes + 2 * n))
    return { n, x, y, area }
  }
  if (!existsSync(GZ_PATH)) throw new Error(`${GZ_PATH} not found. Run \`pnpm ml:fetch\` first.`)
  const d = parseCovtype(gunzipSync(readFileSync(GZ_PATH)).toString('utf8'))
  const header = Buffer.alloc(4)
  header.writeUInt32LE(d.n, 0)
  writeFileSync(BIN_PATH, Buffer.concat([header, Buffer.from(d.x.buffer), Buffer.from(d.y), Buffer.from(d.area)]))
  return d
}
