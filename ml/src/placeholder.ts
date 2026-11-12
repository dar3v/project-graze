// Placeholder wiring: the training pipeline imports the same feature contract
// as the app. Relative .ts import works with tsc and Node without a pnpm
// workspace (see pnpm-workspace.yaml note). Switch to `@graze/features` once a
// bundler alias or workspace is configured. Replace with ml:fetch / ml:prepare
// / ml:train / ml:evaluate scripts when the pipeline lands (README.md).
export {
  FEATURE_NAMES,
  computeFeatures,
  sampleToVector,
} from '../../packages/features/src/index.ts'
