# packages/sim

- `herd/`: herd simulation (Role 2). Tick-based, deterministic given a
  seed, rules in `herd/ecology.json`. Rules, tick order and the rewilding
  score: [`docs/ecology-rules.md`](../../docs/ecology-rules.md). Tests:
  `herd/test/sim.test.ts` (run with `pnpm test`).
- `terrain/`: terrain generation (Role 1). Seeded fBm heightmap
  (`generateHeightmap`, `generateTerrain`) and sculpting brush
  (`applyBrush`). It has no three.js dependency. Heightmap to model inputs
  lives in `@graze/features` (`heightmapToInputs`), not here. Tests: `terrain/test/terrain.test.ts`.

The herd simulation is hand-written rules, **not machine learning**. Its only
ML input is the predicted cover map.

API (`herd/src/index.ts`): `createSim`, `stepSim`, `getPositions`,
`computeScore`, `validateRules`, `defaultEcology`.
