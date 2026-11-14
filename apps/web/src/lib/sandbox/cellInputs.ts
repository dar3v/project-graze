/**
 * Heightmap -> packed raw model inputs for the Worker batch.
 *
 * Uses `heightmapToSamples` from @graze/features (Role 3), not Role 1's
 * `computeCellInputs`, because the features module carries the hillshade sun
 * positions (`SUN`) fitted to the Covertype columns the model was trained on.
 * Role 1's copy still uses the earlier assumed sun angles; on the default
 * terrain that puts the 9am hillshade ~35 points (of 255) off on average, which
 * is train/serve skew. Switch back to Role 1's function once its SUN matches.
 */

import { heightmapToSamples } from '../deps/features.ts'
import { RAW_INPUT_DIM, writeSampleToBuffer } from '../model/inputs.ts'

export interface PackedCellInputs {
  /** n * RAW_INPUT_DIM floats in RAW_INPUT_KEYS order. */
  readonly inputs: Float32Array
  /** 1 where the cell is under the water level. */
  readonly water: Uint8Array
  readonly hasWater: boolean
}

export function packCellInputs(heightM: Float32Array, size: number, cellSizeM: number, waterLevelM: number): PackedCellInputs {
  const { samples, water, hasWater } = heightmapToSamples(heightM, { size, cellSizeM, waterLevelM })
  const inputs = new Float32Array(samples.length * RAW_INPUT_DIM)
  for (let i = 0; i < samples.length; i++) writeSampleToBuffer(inputs, i, samples[i])
  return { inputs, water, hasWater }
}
