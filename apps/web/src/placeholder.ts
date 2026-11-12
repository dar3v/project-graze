// Placeholder wiring: the app imports the same feature contract as training.
// Relative .ts import works with tsc and Vite without a pnpm workspace (see
// pnpm-workspace.yaml note). Switch to `@graze/features` once a bundler alias
// or workspace is configured. Replace with real Svelte + three.js when the
// frontend lands (README.md "Tech stack").
export {
  FEATURE_NAMES,
  computeFeatures,
  sampleToVector,
} from '../../../packages/features/src/index.ts'
