/**
 * Shared terrain-feature contract for Project Graze.
 *
 * This module is the single source of truth for the features consumed by BOTH
 * the training pipeline (`ml/`) and the browser app (`apps/web`). Import it from
 * `@graze/features`; never redefine the feature order or preprocessing locally,
 * so preprocessing cannot drift between training and inference
 * (README.md "Why TypeScript instead of Python?").
 *
 * The feature list mirrors README.md "The ML problem / Features used":
 *   Elevation, slope, aspect (sin/cos), hillshade (9am, noon, 3pm),
 *   horizontal and vertical distance to water.
 */

/** Canonical feature order. Training and inference must use this exact order. */
export const FEATURE_NAMES = [
  'elevation',
  'slope',
  'aspectSin',
  'aspectCos',
  'hillshade9am',
  'hillshadeNoon',
  'hillshade3pm',
  'horizontalDistanceToWater',
  'verticalDistanceToWater',
] as const

export type FeatureName = (typeof FEATURE_NAMES)[number]

/** Number of model inputs, derived from FEATURE_NAMES (never hardcoded). */
export const FEATURE_DIM = FEATURE_NAMES.length

/**
 * Raw, unprocessed terrain quantities for one cell.
 *
 * `hillshade9am/Noon/3pm` are supplied by the caller:
 *  - training (`ml/`): read directly from the Covertype dataset columns;
 *  - app (`apps/web`): produced by the terrain's own documented hillshade
 *    computation (README.md notes it may differ slightly from the dataset
 *    method; an ablation measures the effect).
 * Keeping hillshade as an input (rather than computing it here) keeps this
 * module free of dataset-specific constants and sun-geometry assumptions while
 * still guaranteeing both sides feed the same shape into `computeFeatures`.
 */
export interface TerrainSample {
  readonly elevation: number
  readonly slope: number
  /** Aspect in degrees, clockwise from north (0..360). */
  readonly aspectDegrees: number
  readonly hillshade9am: number
  readonly hillshadeNoon: number
  readonly hillshade3pm: number
  readonly horizontalDistanceToWater: number
  readonly verticalDistanceToWater: number
}

/** Named feature values, keyed by canonical feature name. */
export type FeatureValues = Readonly<Record<FeatureName, number>>

/** Ordered numeric vector in FEATURE_NAMES order — what the model consumes. */
export type FeatureVector = readonly number[]

/**
 * Inclusive [min, max] bounds per feature.
 * Ranges are produced from the training data by the `ml:prepare` script and
 * passed in at call time. This module invents no dataset bounds.
 */
export type FeatureRanges = Readonly<Record<FeatureName, readonly [number, number]>>

const DEGREES_TO_RADIANS = Math.PI / 180

/**
 * Pure, deterministic transform from a terrain sample to named feature values.
 * The only derived feature is aspect -> (sin, cos), which removes the 0/360
 * wrap-around discontinuity. No state, no I/O, no dataset constants.
 */
export function computeFeatures(sample: TerrainSample): FeatureValues {
  const aspectRadians = sample.aspectDegrees * DEGREES_TO_RADIANS
  return {
    elevation: sample.elevation,
    slope: sample.slope,
    aspectSin: Math.sin(aspectRadians),
    aspectCos: Math.cos(aspectRadians),
    hillshade9am: sample.hillshade9am,
    hillshadeNoon: sample.hillshadeNoon,
    hillshade3pm: sample.hillshade3pm,
    horizontalDistanceToWater: sample.horizontalDistanceToWater,
    verticalDistanceToWater: sample.verticalDistanceToWater,
  }
}

/** Convert named values to the ordered vector the model is trained on. */
export function toFeatureVector(values: FeatureValues): FeatureVector {
  return FEATURE_NAMES.map((name) => values[name])
}

/** Convenience: sample -> ordered vector in one step. */
export function sampleToVector(sample: TerrainSample): FeatureVector {
  return toFeatureVector(computeFeatures(sample))
}

/** True when every feature is a finite number. */
export function isFiniteFeatureValues(values: FeatureValues): boolean {
  return FEATURE_NAMES.every((name) => Number.isFinite(values[name]))
}

/**
 * Names whose values fall outside caller-supplied ranges. Feeds the Site Probe
 * "out-of-range inputs trigger a warning" behaviour (README.md). Bounds come
 * from `ml:prepare` output, never from this module.
 */
export function outOfRangeFeatureNames(
  values: FeatureValues,
  ranges: FeatureRanges,
): FeatureName[] {
  return FEATURE_NAMES.filter((name) => {
    const [min, max] = ranges[name]
    return values[name] < min || values[name] > max
  })
}
