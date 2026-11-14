// Single import point for Role 1's terrain package (packages/sim/terrain).
// Relative import on purpose, like ../deps/herd.ts: works in Vite, tsc and
// `node --test` without a pnpm workspace.
export * from '../../../../../packages/sim/terrain/src/index.ts'
