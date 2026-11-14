// Test-only fixtures. Every number here is arbitrary and exists only to drive
// the tests; none of it is a dataset fact or a model metric.

import { FEATURE_NAMES } from '../src/lib/deps/features.ts'
import type { TerrainSample } from '../src/lib/deps/features.ts'

export const CLASSES = ['A', 'B', 'C']

export function rawCard(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    model: { name: 'test', type: 'softmax', version: '0.0.1' },
    classes: [...CLASSES],
    features: [...FEATURE_NAMES],
    inputs: [
      { name: 'elevation', label: 'Elevation', unit: 'm', min: 2000, max: 3500, hardMin: 0, hardMax: 9000 },
      { name: 'slope', label: 'Slope', unit: '°', min: 0, max: 60, hardMin: 0, hardMax: 90 },
      { name: 'aspectDegrees', label: 'Aspect', unit: '°', min: 0, max: 360, hardMin: 0, hardMax: 360 },
      { name: 'hillshade9am', label: 'Hillshade 9am', unit: '', min: 0, max: 255, hardMin: 0, hardMax: 255 },
      { name: 'hillshadeNoon', label: 'Hillshade noon', unit: '', min: 0, max: 255, hardMin: 0, hardMax: 255 },
      { name: 'hillshade3pm', label: 'Hillshade 3pm', unit: '', min: 0, max: 255, hardMin: 0, hardMax: 255 },
      { name: 'horizontalDistanceToWater', label: 'Horizontal distance to water', unit: 'm', min: 0, max: 1000, hardMin: 0 },
      { name: 'verticalDistanceToWater', label: 'Vertical distance to water', unit: 'm', min: -100, max: 500 },
    ],
  }
}

/** Softmax model where class 0 rises with elevation and class 2 falls with it. */
export function rawSoftmaxModel(): Record<string, unknown> {
  const d = FEATURE_NAMES.length
  const zeros = () => new Array<number>(d).fill(0)
  const w0 = zeros()
  w0[0] = 2
  const w2 = zeros()
  w2[0] = -2
  return {
    schemaVersion: 1,
    featureNames: [...FEATURE_NAMES],
    classCount: 3,
    scaler: { mean: [2750, ...new Array(d - 1).fill(0)], std: [500, ...new Array(d - 1).fill(1)] },
    ood: { method: 'standardized-distance', mean: new Array(d).fill(0), std: new Array(d).fill(1000), threshold: 5 },
    model: { type: 'softmax', weights: [w0, zeros(), w2], bias: [0, 0, 0] },
  }
}

export const SAMPLE: TerrainSample = {
  elevation: 3000,
  slope: 10,
  aspectDegrees: 90,
  hillshade9am: 200,
  hillshadeNoon: 220,
  hillshade3pm: 150,
  horizontalDistanceToWater: 120,
  verticalDistanceToWater: 30,
}
