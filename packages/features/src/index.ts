export {
  FEATURE_NAMES,
  FEATURE_DIM,
  computeFeatures,
  toFeatureVector,
  sampleToVector,
  isFiniteFeatureValues,
  outOfRangeFeatureNames,
  TERRAIN_SAMPLE_KEYS,
  TERRAIN_SAMPLE_DIM,
  sampleAt,
  packSample,
} from './features.ts'

export type {
  FeatureName,
  FeatureValues,
  FeatureVector,
  FeatureRanges,
  TerrainSample,
  TerrainSampleKey,
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
  heightmapToInputs,
  heightmapToSamples,
} from './terrain.ts'

export type { SunPosition, TerrainInputOptions, TerrainInputs, TerrainSamples } from './terrain.ts'
