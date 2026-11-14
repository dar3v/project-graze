/**
 * PLACEHOLDER terrain for the 2D dev map, used until Role 1's world
 * (apps/web/src/lib/world/ + packages/sim/terrain/) lands. It follows the
 * shared contract so the real world can replace it 1:1:
 *   - heightmap: Float32Array(GRID * GRID), row-major (index = y * GRID + x),
 *     meters, scaled into the model card's elevation training range;
 *   - cell size: CELL_SIZE_M meters (verify against the dataset docs).
 *
 * `computeCellInputs` derives the model's raw inputs per cell. If Role 1
 * ships its own terrain-feature function, switch to it and delete this one so
 * there is only one implementation.
 */

import { RAW_INPUT_DIM } from '../model/inputs.ts'

export const GRID = 128
export const CELL_SIZE_M = 30

/** Assumed sun positions (azimuth, altitude in degrees) for the hillshade inputs. */
export const SUN = {
  hillshade9am: { azimuth: 100, altitude: 45 },
  hillshadeNoon: { azimuth: 180, altitude: 72 },
  hillshade3pm: { azimuth: 250, altitude: 45 },
} as const

function hash(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(seed, xi, yi)
  const b = hash(seed, xi + 1, yi)
  const c = hash(seed, xi, yi + 1)
  const d = hash(seed, xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** Seeded fBm heightmap normalized to [0, 1]. */
export function generateHeightmap(seed: number, size = GRID): Float32Array {
  const raw = new Float64Array(size * size)
  let lo = Infinity
  let hi = -Infinity
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 1
      let freq = 1 / 40
      let v = 0
      for (let o = 0; o < 5; o++) {
        v += amp * valueNoise(seed + o * 1013, x * freq, y * freq)
        amp *= 0.5
        freq *= 2
      }
      // Valley shape: lower in the middle columns.
      v -= 0.35 * Math.exp(-(((x - size / 2) / (size / 4)) ** 2))
      raw[y * size + x] = v
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  }
  const span = hi - lo || 1
  const out = new Float32Array(size * size)
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (raw[i] - lo) / span))
  return out
}

export function scaleHeightmap(h01: Float32Array, minM: number, maxM: number): Float32Array {
  return h01.map((v) => minM + v * (maxM - minM))
}

export function quantile(values: Float32Array, q: number): number {
  if (values.length === 0) return 0
  const sorted = Float32Array.from(values).sort()
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]
}

/** Chamfer (1, sqrt 2) distance transform from water cells, in cells. */
function distanceToWater(water: Uint8Array, size: number): Float32Array {
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

export interface CellInputs {
  /** n * RAW_INPUT_DIM floats in RAW_INPUT_KEYS order. */
  readonly inputs: Float32Array
  /** 1 where the cell is under the water level. */
  readonly water: Uint8Array
  readonly hasWater: boolean
}

export function computeCellInputs(heightM: Float32Array, size: number, cellSizeM: number, waterLevelM: number): CellInputs {
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
  // No water anywhere: use the farthest possible distance instead of Infinity.
  const dist = hasWater ? distanceToWater(water, size) : new Float32Array(n).fill(Math.hypot(size, size))
  const inputs = new Float32Array(n * RAW_INPUT_DIM)
  const at = (x: number, y: number) => heightM[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))]
  const rad = Math.PI / 180

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      // Gradient: +x is east, +y is south (row 0 is the north edge).
      const dzdx = (at(x + 1, y) - at(x - 1, y)) / (2 * cellSizeM)
      const dzdy = (at(x, y + 1) - at(x, y - 1)) / (2 * cellSizeM)
      const slopeRad = Math.atan(Math.hypot(dzdx, dzdy))
      // Aspect: compass bearing of the downhill direction, clockwise from north.
      let aspect = 0
      if (dzdx !== 0 || dzdy !== 0) aspect = (Math.atan2(-dzdx, dzdy) / rad + 360) % 360
      const shade = (sun: { azimuth: number; altitude: number }) => {
        const zen = (90 - sun.altitude) * rad
        const v = Math.cos(zen) * Math.cos(slopeRad) + Math.sin(zen) * Math.sin(slopeRad) * Math.cos((sun.azimuth - aspect) * rad)
        return Math.round(255 * Math.max(0, Math.min(1, v)))
      }
      const o = i * RAW_INPUT_DIM
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
