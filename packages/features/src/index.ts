export {
  FEATURE_NAMES,
  FEATURE_DIM,
  computeFeatures,
  toFeatureVector,
  sampleToVector,
  isFiniteFeatureValues,
  outOfRangeFeatureNames,
} from './features.ts'

export type {
  FeatureName,
  FeatureValues,
  FeatureVector,
  FeatureRanges,
  TerrainSample,
} from './features.ts'

export {
  SUN,
  SUN_ASTRONOMICAL,
  STUDY_LATITUDE_DEG,
  SOLSTICE_DECLINATION_DEG,
  solarPosition,
  hillshade,
  slopeAspect,
  distanceToWaterCells,
  heightmapToSamples,
} from './terrain.ts'

export type { SunPosition, TerrainInputOptions, TerrainInputs } from './terrain.ts'
