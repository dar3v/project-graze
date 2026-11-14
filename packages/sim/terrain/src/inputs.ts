/**
 * Heightmap -> the model's raw inputs per cell (Role 1's terrain-to-inputs
 * function named in docs/feature-contract.md "Hand-off points").
 *
 * Output is packed TERRAIN_INPUT_KEYS.length floats per cell, in the same
 * order as the app's RAW_INPUT_KEYS (apps/web/src/lib/model/inputs.ts; a test
 * checks they match). `computeFeatures` from @graze/features then turns these
 * into the model's feature vector. Same math as the app's placeholder
 * (apps/web/src/lib/sandbox/terrain.ts), so swapping is 1:1.
 *
 * - slope: central differences, degrees.
 * - aspect: compass bearing of the downhill direction, clockwise from north.
 * - hillshade: standard Lambertian hillshade (0..255) for the SUN positions.
 * - horizontal distance to water: chamfer (1, sqrt 2) distance x cell size.
 * - vertical distance to water: height above the water level.
 */

import type { TerrainSample } from '../../../features/src/index.ts'

export const TERRAIN_INPUT_KEYS = [
  'elevation',
  'slope',
  'aspectDegrees',
  'hillshade9am',
  'hillshadeNoon',
  'hillshade3pm',
  'horizontalDistanceToWater',
  'verticalDistanceToWater',
] as const satisfies readonly (keyof TerrainSample)[]

export const TERRAIN_INPUT_DIM = TERRAIN_INPUT_KEYS.length

/**
 * Assumed sun positions (azimuth, altitude in degrees). The dataset's own
 * hillshade method is not published in detail; Role 3's ablation measures
 * how much this assumption matters.
 */
export const SUN = {
  hillshade9am: { azimuth: 100, altitude: 45 },
  hillshadeNoon: { azimuth: 180, altitude: 72 },
  hillshade3pm: { azimuth: 250, altitude: 45 },
} as const

/** Chamfer (1, sqrt 2) distance transform from water cells, in cells. */
export function distanceToWater(water: Uint8Array, size: number): Float32Array {
  const INF = 1e9
  const d = new Float32Array(size * size)
  for (let i = 0; i < d.length; i++) d[i] = water[i] ? 0 : INF
  const D = Math.SQRT2
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1)
      if (y > 0) {
        d[i] = Math.min(d[i], d[i - size] + 1)
        if (x > 0) d[i] = Math.min(d[i], d[i - size - 1] + D)
        if (x < size - 1) d[i] = Math.min(d[i], d[i - size + 1] + D)
      }
    }
  for (let y = size - 1; y >= 0; y--)
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x
      if (x < size - 1) d[i] = Math.min(d[i], d[i + 1] + 1)
      if (y < size - 1) {
        d[i] = Math.min(d[i], d[i + size] + 1)
        if (x < size - 1) d[i] = Math.min(d[i], d[i + size + 1] + D)
        if (x > 0) d[i] = Math.min(d[i], d[i + size - 1] + D)
      }
    }
  return d
}

/** 1 where the cell is strictly below the water level. */
export function waterMask(heightM: Float32Array, waterLevelM: number): Uint8Array {
  const water = new Uint8Array(heightM.length)
  for (let i = 0; i < heightM.length; i++) if (heightM[i] < waterLevelM) water[i] = 1
  return water
}

export interface CellInputs {
  /** n * TERRAIN_INPUT_DIM floats in TERRAIN_INPUT_KEYS order. */
  readonly inputs: Float32Array
  /** 1 where the cell is under the water level. */
  readonly water: Uint8Array
  readonly hasWater: boolean
}

export function computeCellInputs(heightM: Float32Array, size: number, cellSizeM: number, waterLevelM: number): CellInputs {
  const n = size * size
  if (heightM.length !== n) throw new Error(`Heightmap has ${heightM.length} cells; expected ${n}.`)
  const water = waterMask(heightM, waterLevelM)
  const hasWater = water.includes(1)
  // No water anywhere: use the farthest possible distance instead of Infinity.
  const dist = hasWater ? distanceToWater(water, size) : new Float32Array(n).fill(Math.hypot(size, size))
  const inputs = new Float32Array(n * TERRAIN_INPUT_DIM)
  const at = (x: number, y: number) => heightM[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))]
  const rad = Math.PI / 180

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      // Gradient: +x is east, +y is south (row 0 is the north edge).
      const dzdx = (at(x + 1, y) - at(x - 1, y)) / (2 * cellSizeM)
      const dzdy = (at(x, y + 1) - at(x, y - 1)) / (2 * cellSizeM)
      const slopeRad = Math.atan(Math.hypot(dzdx, dzdy))
      let aspect = 0
      if (dzdx !== 0 || dzdy !== 0) aspect = (Math.atan2(-dzdx, dzdy) / rad + 360) % 360
      const shade = (sun: { azimuth: number; altitude: number }) => {
        const zen = (90 - sun.altitude) * rad
        const v = Math.cos(zen) * Math.cos(slopeRad) + Math.sin(zen) * Math.sin(slopeRad) * Math.cos((sun.azimuth - aspect) * rad)
        return Math.round(255 * Math.max(0, Math.min(1, v)))
      }
      const o = i * TERRAIN_INPUT_DIM
      inputs[o] = heightM[i]
      inputs[o + 1] = slopeRad / rad
      inputs[o + 2] = aspect
      inputs[o + 3] = shade(SUN.hillshade9am)
      inputs[o + 4] = shade(SUN.hillshadeNoon)
      inputs[o + 5] = shade(SUN.hillshade3pm)
      inputs[o + 6] = water[i] ? 0 : dist[i] * cellSizeM
      inputs[o + 7] = water[i] ? 0 : heightM[i] - waterLevelM
    }
  }
  return { inputs, water, hasWater }
}
