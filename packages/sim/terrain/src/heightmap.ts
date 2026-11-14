/**
 * Terrain generator (Role 1). Produces the heightmap described in
 * docs/feature-contract.md:
 *   Float32Array(GRID * GRID), row-major (index = y * GRID + x), meters,
 *   y = 0 is the north edge, +x is east, cells are CELL_SIZE_M wide.
 *
 * Elevation scaling: the raw fBm field is normalized to [0, 1], then mapped
 * into a band of the dataset's elevation range. The band is `relief` (a share
 * of the full range) wide and centered on `center`. Using the full 2000 m
 * Covertype range over a 3.84 km map would give slopes far steeper than the
 * dataset's (mean ~14 degrees), which pushes most cells out of distribution.
 */

import { fbm } from './noise.ts'

export const GRID = 128
export const CELL_SIZE_M = 30

/**
 * Covertype elevation range in meters (covtype.info: Elevation 1859..3858).
 * Only a default: the app passes the training range from model_card.json.
 */
export const COVERTYPE_ELEVATION = { min: 1859, max: 3858 } as const

export interface ElevationRange {
  readonly min: number
  readonly max: number
}

export interface TerrainOptions {
  /** Integer seed. Same seed + options = identical heightmap. */
  readonly seed: number
  /** 0 (smooth hills) .. 1 (rugged). Default 0.5. */
  readonly roughness?: number
  /** Share of cells under water, 0..1. Default 0.12. */
  readonly waterLevel?: number
  /** Grid side length in cells. Default GRID (128). */
  readonly size?: number
  /** Elevation range to scale into. Default COVERTYPE_ELEVATION. */
  readonly elevation?: ElevationRange
  /**
   * Share of the elevation range the terrain spans, 0..1. Default 0.2: with
   * roughness 0.5 this gives a mean slope of ~15 degrees (Covertype: ~14).
   */
  readonly relief?: number
  /** Where the band is centered, 0 (range min) .. 1 (range max). Default 0.5. */
  readonly center?: number
  /** Depth of the central north-south valley, 0..1. Default 0.35. */
  readonly valley?: number
}

export interface Terrain {
  readonly size: number
  readonly cellSizeM: number
  /** Heights in meters, row-major. */
  readonly heightmap: Float32Array
  /** Water surface in meters: cells strictly below it are under water. */
  readonly waterLevelM: number
  /** The elevation band actually used, in meters. */
  readonly band: ElevationRange
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Resolve options to concrete values, validating ranges. */
function resolve(o: TerrainOptions) {
  if (!Number.isFinite(o.seed)) throw new RangeError('seed must be a finite number')
  const size = o.size ?? GRID
  if (!Number.isInteger(size) || size < 2) throw new RangeError('size must be an integer >= 2')
  const elevation = o.elevation ?? COVERTYPE_ELEVATION
  if (!(elevation.max > elevation.min)) throw new RangeError('elevation.max must be greater than elevation.min')
  return {
    seed: Math.trunc(o.seed) | 0,
    size,
    elevation,
    roughness: clamp01(o.roughness ?? 0.5),
    waterLevel: clamp01(o.waterLevel ?? 0.12),
    relief: clamp01(o.relief ?? 0.2),
    center: clamp01(o.center ?? 0.5),
    valley: clamp01(o.valley ?? 0.35),
  }
}

/** Elevation band [min, max] in meters, kept inside `elevation`. */
export function reliefBand(elevation: ElevationRange, relief: number, center: number): ElevationRange {
  const span = elevation.max - elevation.min
  const half = (span * clamp01(relief)) / 2
  const mid = Math.min(elevation.max - half, Math.max(elevation.min + half, elevation.min + span * clamp01(center)))
  return { min: mid - half, max: mid + half }
}

/** Seeded fBm field normalized to [0, 1] (exactly 0 and 1 at the extremes). */
export function generateHeight01(seed: number, size: number, roughness: number, valley: number): Float32Array {
  // Roughness maps to fBm persistence: 0.35 (smooth) .. 0.65 (rugged).
  const noise = { octaves: 5, baseFrequency: 1 / 40, persistence: 0.35 + 0.3 * roughness, lacunarity: 2 }
  const raw = new Float64Array(size * size)
  let lo = Infinity
  let hi = -Infinity
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = fbm(seed, x, y, noise)
      // Valley: lower the middle columns so water collects in a river valley.
      v -= valley * Math.exp(-(((x - size / 2) / (size / 4)) ** 2))
      raw[y * size + x] = v
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  const span = hi - lo || 1
  const out = new Float32Array(size * size)
  for (let i = 0; i < out.length; i++) out[i] = clamp01((raw[i] - lo) / span)
  return out
}

/**
 * Height in meters at which `share` of the cells lie below. Cells strictly
 * below the returned level are water. Share 0 gives a level below every cell.
 */
export function waterLevelForShare(heightmap: Float32Array, share: number): number {
  const n = heightmap.length
  if (n === 0) return 0
  const sorted = Float32Array.from(heightmap).sort()
  const k = Math.round(clamp01(share) * n)
  if (k <= 0) return sorted[0] - 1
  if (k >= n) return sorted[n - 1] + 1
  // Midway between the k-th lowest and the next, so exactly k cells are below.
  return (sorted[k - 1] + sorted[k]) / 2
}

/** Generate a full terrain: heightmap in meters plus a water level. */
export function generateTerrain(options: TerrainOptions): Terrain {
  const o = resolve(options)
  const h01 = generateHeight01(o.seed, o.size, o.roughness, o.valley)
  const band = reliefBand(o.elevation, o.relief, o.center)
  const heightmap = new Float32Array(h01.length)
  for (let i = 0; i < h01.length; i++) heightmap[i] = band.min + h01[i] * (band.max - band.min)
  return { size: o.size, cellSizeM: CELL_SIZE_M, heightmap, waterLevelM: waterLevelForShare(heightmap, o.waterLevel), band }
}

/**
 * Contract entry point: a seeded heightmap in meters (default 128 x 128).
 * Equivalent to `generateTerrain({ seed, ...options }).heightmap`.
 */
export function generateHeightmap(seed: number, options: Omit<TerrainOptions, 'seed'> = {}): Float32Array {
  return generateTerrain({ ...options, seed }).heightmap
}
