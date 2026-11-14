/**
 * Heightmap -> raw model inputs (D2 of docs/roles/ml.md).
 *
 * Every formula here is documented in docs/feature-contract.md ("Terrain ->
 * raw inputs"). The app and the training pipeline (the hillshade check in
 * `ml/src/explore.ts`) both call these functions, so the formulas cannot drift.
 *
 * Conventions (shared contract):
 *  - heightmap: row-major, index = y * size + x, meters;
 *  - y = 0 is the north edge, +x is east;
 *  - aspect: compass bearing of the downhill direction, degrees clockwise
 *    from north (Covertype "Aspect in degrees azimuth");
 *  - slope: degrees; hillshade: 0..255 index (Covertype units).
 */

import type { TerrainSample } from './features.ts'

const RAD = Math.PI / 180

export interface SunPosition {
  /** Degrees clockwise from north. */
  readonly azimuth: number
  /** Degrees above the horizon. */
  readonly altitude: number
}

/**
 * Sun position from latitude, solar declination and hour angle (all degrees;
 * hour angle is negative before solar noon). Standard spherical-astronomy
 * formulas; no atmospheric refraction.
 */
export function solarPosition(latitudeDeg: number, declinationDeg: number, hourAngleDeg: number): SunPosition {
  const lat = latitudeDeg * RAD
  const dec = declinationDeg * RAD
  const h = hourAngleDeg * RAD
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h)
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  // Azimuth measured from north, clockwise.
  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat))
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) / RAD
  if (hourAngleDeg > 0) az = 360 - az
  return { azimuth: az, altitude: alt / RAD }
}

/**
 * Covertype's hillshade columns are "at 9am / noon / 3pm, summer solstice"
 * (covtype.info). Taking the study area at latitude 40.6 N (Roosevelt
 * National Forest, read off a map), declination 23.44 deg and hour angles
 * -45 / 0 / +45 deg gives SUN_ASTRONOMICAL. Those positions do NOT reproduce
 * the dataset: our formula on the dataset's own slope/aspect is off by a mean
 * 11-34 index points (ml/reports/exploration.json, `hillshadeCheck`).
 */
export const STUDY_LATITUDE_DEG = 40.6
export const SOLSTICE_DECLINATION_DEG = 23.44

export const SUN_ASTRONOMICAL = {
  hillshade9am: solarPosition(STUDY_LATITUDE_DEG, SOLSTICE_DECLINATION_DEG, -45),
  hillshadeNoon: solarPosition(STUDY_LATITUDE_DEG, SOLSTICE_DECLINATION_DEG, 0),
  hillshade3pm: solarPosition(STUDY_LATITUDE_DEG, SOLSTICE_DECLINATION_DEG, 45),
} as const satisfies Record<'hillshade9am' | 'hillshadeNoon' | 'hillshade3pm', SunPosition>

/**
 * Sun positions used for every hillshade the app computes. Fitted by grid
 * search (0.25 deg resolution) so that `hillshade(slope, aspect, sun)`
 * reproduces each dataset hillshade column from the dataset's own slope and
 * aspect, on dev-set rows only (`pnpm ml:explore`, `hillshadeCheck.bestFitSun`;
 * mean absolute error below 1 index point for all three). Using them makes
 * generated-terrain hillshade relate to slope/aspect the same way the
 * training data does. Re-run `ml:explore` and update these together.
 */
export const SUN = {
  hillshade9am: { azimuth: 114, altitude: 58.75 },
  hillshadeNoon: { azimuth: 218, altitude: 68.75 },
  hillshade3pm: { azimuth: 269, altitude: 37.75 },
} as const satisfies Record<'hillshade9am' | 'hillshadeNoon' | 'hillshade3pm', SunPosition>

/**
 * GIS (ESRI-style) hillshade: 255 * (cos(zenith) cos(slope) +
 * sin(zenith) sin(slope) cos(sunAzimuth - aspect)), clamped to 0..255 and
 * rounded to an integer like the dataset column.
 */
export function hillshade(slopeDeg: number, aspectDeg: number, sun: SunPosition): number {
  const zen = (90 - sun.altitude) * RAD
  const s = slopeDeg * RAD
  const v = Math.cos(zen) * Math.cos(s) + Math.sin(zen) * Math.sin(s) * Math.cos((sun.azimuth - aspectDeg) * RAD)
  return Math.round(255 * Math.max(0, Math.min(1, v)))
}

/**
 * Slope and aspect from central differences (edges clamp to the nearest
 * cell, i.e. one-sided). Flat cells get aspect 0 (north), as the dataset has
 * no "flat" code.
 */
export function slopeAspect(
  heightM: ArrayLike<number>,
  size: number,
  cellSizeM: number,
  x: number,
  y: number,
): { slopeDeg: number; aspectDeg: number } {
  const at = (xx: number, yy: number) =>
    heightM[Math.min(size - 1, Math.max(0, yy)) * size + Math.min(size - 1, Math.max(0, xx))]
  const xl = Math.max(0, x - 1)
  const xr = Math.min(size - 1, x + 1)
  const yu = Math.max(0, y - 1)
  const yd = Math.min(size - 1, y + 1)
  // dz/dx toward east, dz/dy toward south (row index grows southward).
  const dzdx = xr === xl ? 0 : (at(xr, y) - at(xl, y)) / ((xr - xl) * cellSizeM)
  const dzdy = yd === yu ? 0 : (at(x, yd) - at(x, yu)) / ((yd - yu) * cellSizeM)
  const slopeDeg = Math.atan(Math.hypot(dzdx, dzdy)) / RAD
  // Downhill vector in (east, north) components is (-dzdx, +dzdy).
  const aspectDeg = dzdx === 0 && dzdy === 0 ? 0 : (Math.atan2(-dzdx, dzdy) / RAD + 360) % 360
  return { slopeDeg, aspectDeg }
}

/**
 * Exact Euclidean distance (in cells) from every cell to the nearest water
 * cell, via the Felzenszwalb-Huttenlocher separable transform. Returns
 * Infinity everywhere when there is no water.
 */
export function distanceToWaterCells(water: ArrayLike<number>, size: number): Float64Array {
  const n = size * size
  const INF = 1e20
  const f = new Float64Array(n)
  for (let i = 0; i < n; i++) f[i] = water[i] ? 0 : INF
  const tmp = new Float64Array(n)
  const d = new Float64Array(size)
  const v = new Int32Array(size)
  const z = new Float64Array(size + 1)
  const pass = (get: (k: number) => number, set: (k: number, val: number) => void) => {
    let k = 0
    v[0] = 0
    z[0] = -Infinity
    z[1] = Infinity
    for (let q = 1; q < size; q++) {
      let s = (get(q) + q * q - (get(v[k]) + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) {
        k--
        s = (get(q) + q * q - (get(v[k]) + v[k] * v[k])) / (2 * q - 2 * v[k])
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < size; q++) {
      while (z[k + 1] < q) k++
      d[q] = (q - v[k]) ** 2 + get(v[k])
    }
    for (let q = 0; q < size; q++) set(q, d[q])
  }
  for (let x = 0; x < size; x++) pass((k) => f[k * size + x], (k, val) => (tmp[k * size + x] = val))
  for (let y = 0; y < size; y++) pass((k) => tmp[y * size + k], (k, val) => (f[y * size + k] = val))
  let any = false
  for (let i = 0; i < n; i++) if (water[i]) any = true
  for (let i = 0; i < n; i++) f[i] = any ? Math.sqrt(f[i]) : Infinity
  return f
}

export interface TerrainInputOptions {
  readonly size: number
  readonly cellSizeM: number
  /** Cells strictly below this height are water. */
  readonly waterLevelM: number
  readonly sun?: Record<'hillshade9am' | 'hillshadeNoon' | 'hillshade3pm', SunPosition>
}

export interface TerrainInputs {
  readonly samples: TerrainSample[]
  /** 1 where the cell is under the water level. */
  readonly water: Uint8Array
  readonly hasWater: boolean
}

/**
 * Heightmap -> one raw TerrainSample per cell.
 *
 * Water distances (Covertype "nearest surface water features"):
 *  - horizontal = Euclidean distance to the nearest water cell centre, meters;
 *  - vertical   = cell height - water level (positive above water). Covertype
 *    uses the height difference to the nearest water feature's surface; with a
 *    single flat water level both are the same.
 *  - water cells get 0 for both.
 *  - no water at all: horizontal = the grid diagonal in meters (largest
 *    in-map distance), vertical = height - water level.
 */
export function heightmapToSamples(heightM: ArrayLike<number>, opts: TerrainInputOptions): TerrainInputs {
  const { size, cellSizeM, waterLevelM } = opts
  const sun = opts.sun ?? SUN
  const n = size * size
  if (heightM.length !== n) throw new Error(`Heightmap has ${heightM.length} cells; expected ${n}.`)
  const water = new Uint8Array(n)
  let hasWater = false
  for (let i = 0; i < n; i++) {
    if (heightM[i] < waterLevelM) {
      water[i] = 1
      hasWater = true
    }
  }
  const dist = distanceToWaterCells(water, size)
  const maxDist = Math.hypot(size, size) * cellSizeM
  const samples: TerrainSample[] = new Array(n)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const { slopeDeg, aspectDeg } = slopeAspect(heightM, size, cellSizeM, x, y)
      const wet = water[i] === 1
      samples[i] = {
        elevation: heightM[i],
        slope: slopeDeg,
        aspectDegrees: aspectDeg,
        hillshade9am: hillshade(slopeDeg, aspectDeg, sun.hillshade9am),
        hillshadeNoon: hillshade(slopeDeg, aspectDeg, sun.hillshadeNoon),
        hillshade3pm: hillshade(slopeDeg, aspectDeg, sun.hillshade3pm),
        horizontalDistanceToWater: wet ? 0 : hasWater ? dist[i] * cellSizeM : maxDist,
        verticalDistanceToWater: wet ? 0 : heightM[i] - waterLevelM,
      }
    }
  }
  return { samples, water, hasWater }
}
