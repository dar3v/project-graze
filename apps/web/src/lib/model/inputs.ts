import type { TerrainSample } from '../deps/features.ts'

/**
 * Raw inputs the user (or the terrain) supplies, in a fixed order. This is the
 * TerrainSample shape from @graze/features; `computeFeatures` turns it into the
 * model's feature vector (aspect -> sin/cos). Batch buffers sent to the
 * Worker are packed in this order, RAW_INPUT_KEYS.length floats per cell.
 */
export const RAW_INPUT_KEYS = [
  'elevation',
  'slope',
  'aspectDegrees',
  'hillshade9am',
  'hillshadeNoon',
  'hillshade3pm',
  'horizontalDistanceToWater',
  'verticalDistanceToWater',
] as const satisfies readonly (keyof TerrainSample)[]

export type RawInputKey = (typeof RAW_INPUT_KEYS)[number]

export const RAW_INPUT_DIM = RAW_INPUT_KEYS.length

// Compile-time guard: RAW_INPUT_KEYS must cover every TerrainSample field.
type Missing = Exclude<keyof TerrainSample, RawInputKey>
const _complete: Missing extends never ? true : false = true
void _complete

export function sampleFromBuffer(buf: ArrayLike<number>, cell: number): TerrainSample {
  const o = cell * RAW_INPUT_DIM
  return {
    elevation: buf[o],
    slope: buf[o + 1],
    aspectDegrees: buf[o + 2],
    hillshade9am: buf[o + 3],
    hillshadeNoon: buf[o + 4],
    hillshade3pm: buf[o + 5],
    horizontalDistanceToWater: buf[o + 6],
    verticalDistanceToWater: buf[o + 7],
  }
}

export function writeSampleToBuffer(buf: Float32Array, cell: number, s: TerrainSample): void {
  const o = cell * RAW_INPUT_DIM
  RAW_INPUT_KEYS.forEach((k, i) => {
    buf[o + i] = s[k]
  })
}
