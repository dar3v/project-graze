/**
 * Every pipeline setting in one place. Changing anything here changes the
 * model; record why in docs/notes.md.
 */
import type { ForestConfig } from './models/forest.ts'
import type { NetworkConfig } from './models/network.ts'

/**
 * Model version (D11), written to model.json and model_card.json. Bump it
 * whenever a re-export can change any prediction (weights, features, classes,
 * OOD detector or threshold) and add a line to the changelog in
 * docs/model-card.md. Class order and names are a stable contract (D10):
 * changing them needs Roles 1 and 2 told first AND a version bump.
 * `-dev` until the human freeze (D9).
 */
export const MODEL_VERSION = '0.1.0-dev'

/**
 * Shape version of model.json / model_card.json. Bump only when a field the
 * app requires changes or is removed; new optional fields keep the version.
 */
export const SCHEMA_VERSION = 1

/** Master seed. Every random choice derives from it via subSeed(SEED, name). */
export const SEED = 42

/**
 * Rows used to fit each flexible model (uniform subsample of the training
 * fold's inner-fit part). Keeps `pnpm ml:train` to minutes in plain
 * TypeScript; baselines always use every training row.
 */
export const MAX_TRAIN_ROWS = 150_000

/** Selection rule tie margin in mean leave-area-out macro-F1 (docs/notes.md). */
export const SELECTION_TIE_MARGIN = 0.01

/** Percentile of in-distribution (inner holdout) OOD distances used as the threshold. */
export const OOD_PERCENTILE = 0.99

/** Rows sampled from each validation set for permutation importance. */
export const IMPORTANCE_ROWS = 20_000
export const IMPORTANCE_REPEATS = 3

type Grid<T> = readonly (Omit<T, 'seed'> & { readonly label: string })[]

const softmaxBase = { hidden: [], epochs: 5, batchSize: 256, learningRate: 0.01, l2: 1e-5 } as const
const mlpBase = { epochs: 10, batchSize: 256, learningRate: 0.003, l2: 1e-6, classWeighting: 'sqrt-balanced' } as const
const forestBase = { trees: 25, maxDepth: 12, minLeaf: 20, mtry: 0, maxSamples: MAX_TRAIN_ROWS, bins: 64 } as const

/**
 * Tuning grids: two candidates per family, tuned on the inner holdout of
 * each training fold. Ranges and the forest caps (25 trees, depth 12, so
 * model.json stays a few MB) were set from a timing/size smoke test on the
 * random split only, before the selection rule was frozen (docs/notes.md).
 */
export const GRIDS = {
  softmax: [
    { ...softmaxBase, classWeighting: 'none', label: 'unweighted' },
    { ...softmaxBase, classWeighting: 'sqrt-balanced', label: 'sqrt-balanced' },
  ] satisfies Grid<NetworkConfig>,
  mlp: [
    { ...mlpBase, hidden: [32, 32], label: '32x32' },
    { ...mlpBase, hidden: [64, 64], label: '64x64' },
  ] satisfies Grid<NetworkConfig>,
  forest: [
    { ...forestBase, classWeighting: 'none', label: 'unweighted' },
    { ...forestBase, classWeighting: 'sqrt-balanced', label: 'sqrt-balanced' },
  ] satisfies Grid<ForestConfig>,
} as const
