// Single import point for the shared feature contract (Role 3 owns it).
// Relative import on purpose: works in Vite, tsc and `node --test` without a
// pnpm workspace (see pnpm-workspace.yaml and packages/features/README.md).
export {
  FEATURE_NAMES,
  FEATURE_DIM,
  computeFeatures,
  toFeatureVector,
  sampleToVector,
  isFiniteFeatureValues,
} from '../../../../../packages/features/src/index.ts'
export type { FeatureName, FeatureValues, FeatureVector, TerrainSample } from '../../../../../packages/features/src/index.ts'
