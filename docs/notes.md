# ML working notes (Role 3)

Running log of ML decisions. Each numbered section is written **before** the
results it governs. Numbers come from `ml/reports/*.json` or
`apps/web/public/model/model_card.json` and are never typed in by hand.
Agent-drafted entries are marked *(agent draft)*. A human must confirm them.

---

## 1. TypeScript training approach (D1) *(agent draft, 2026-11-14)*

**Decision: everything from scratch in TypeScript, with no ML dependency.**
That covers softmax regression, a small MLP (backprop with Adam) and a
histogram-based random forest, all in `ml/src/models/`.

- No packages were installed. `ml-random-forest` and TensorFlow.js were not
  tried. Each would add a dependency, and its model format would still need
  converting to the `model.json` format that `apps/web` already parses. A
  forest written for this repo exports straight into that format.
- **Is training in TypeScript going to be a problem? No.** Training uses
  150k training rows and the 9 contract features on Node 24. One
  `pnpm ml:train` run takes minutes on a laptop. The figures below are from
  the smoke test in section 2:

  | Model | Training time |
  | --- | --- |
  | 25-tree depth-12 forest | about 2 s |
  | 64x64 MLP, 10 epochs | about 22 s |
  | softmax | under 1 s |

- The risk to watch is MLP time if the network grows. The cut order in
  `docs/roles/ml.md` already allows dropping the MLP.
- Every random choice goes through one seeded PRNG
  (`ml/src/lib/rng.ts`, master seed in `ml/src/config.ts`). The same commit
  and the same data give the same model.

## 2. What was looked at before the selection rule was frozen *(agent draft)*

To size the grids and the forest's export caps, a smoke test ran on the
**random split only**:

- data: a 150k-row subsample of random-split train, scored on random-split
  validation;
- models: softmax, 64x64 / 32x32 MLP, and forests of depth 12–18.

Findings:

- **Size:** depth-18 trees produced over 700k nodes. That is too large to
  ship, so the forest is capped at 25 trees and depth 12.
- **Accuracy:** sqrt-balanced class weights raised random-split macro-F1
  for the forest.

**No leave-one-wilderness-area-out number had been computed when section 3
was written.** The final test set has never been read.

## 3. Model selection rule (D4) *(agent draft, frozen before any LOAO result)*

1. **Primary metric:** mean macro-F1 over the 4 leave-one-wilderness-area-out
   (LOAO) validation folds of the dev set.
   - Macro-F1 averages over the classes present in each held-out area.
   - Accuracy, log loss and the random split are reported but do not decide.
2. **Candidates:** only models the app can run (`softmax`, `mlp`, `forest`).
   - The majority-class and elevation-band baselines are reported as
     reference points.
3. **Within noise means within 0.01** (`SELECTION_TIE_MARGIN`) of the best
   mean LOAO macro-F1.
   - Among models within noise, pick the simplest:
     softmax < MLP < forest.
   - The forest counts as least simple because it has the largest export
     and is the least inspectable.
4. **Hyperparameters:** each family has a 2-point grid (`ml/src/config.ts`).
   - The grid is tuned inside every fold on a stratified 15% inner holdout
     of that fold's training rows.
   - Outer validation rows are never used for fitting, tuning, temperature
     or thresholds.
5. **The shipped model:**
   - It is the selected family, retrained on the dev set with the same
     inner-holdout procedure.
   - Its grid point is the one chosen most often across the LOAO folds;
     ties go to the first grid point.
   - The temperature and the OOD threshold are fit on the inner holdout.
6. **Final test set:** evaluated once, only after a human freezes the model
   (D9), with `pnpm ml:evaluate-final`.

## 4. Splits (D3) *(agent draft)*

- **Final test:**
  - a stratified 10% of all rows, using seed `subSeed(42, 'final-test')`;
  - the hash and size are pinned in `ml/splits.lock.json`;
  - it is wrapped in `LockedTestSet` so that training code cannot read the
    indices.
- **Random split** of dev: stratified 80/20. It is **optimistic**, because
  adjacent 30 m cells are spatially correlated and fall on both sides.
- **LOAO:** 4 folds over the dev rows. Each fold trains on three
  wilderness areas and validates on the fourth.
  - When Cache la Poudre is held out, Cottonwood/Willow (which occurs only
    there) is never seen in training. Its recall in that fold is 0 by
    construction. This is intended and reported.
- **Scalers** are fit on the rows a model is trained on.
- **Leakage checks:** `assertSplitsClean` runs on every invocation, and
  `ml/test/splits.test.ts` covers the same checks, including a test that
  plants a test row in training and expects the check to fail.

## 5. Hillshade: our method vs. the dataset's (D2) *(agent draft)*

Covertype's three hillshade columns were computed by the dataset authors in
GIS software. We do not know their exact implementation. The app computes
hillshade from a generated heightmap with `hillshade()` in
`packages/features/src/terrain.ts`, the standard GIS formula.

- With *astronomical* summer-solstice sun positions for latitude 40.6 N, our
  formula applied to the dataset's own slope and aspect misses the dataset
  columns by a large mean absolute error (`ml/reports/exploration.json`,
  `hillshadeCheck.astronomical`).
- A grid search for the sun position reproduces each column almost exactly
  (`hillshadeCheck.bestFitSun`). Those fitted positions are now `SUN` in
  `@graze/features`, so the app's hillshade relates to slope and aspect the
  same way the training data does.

Differences that remain, and that no sun position can fix:

- the dataset's slope and aspect came from a real 30 m DEM with its own
  smoothing kernel, while ours come from central differences on a synthetic
  heightmap;
- real hillshade can include cast shadows from distant ridges, and the
  formula has none;
- generated terrain has a different distribution of slopes and aspects.

The **without-hillshade ablation** measures how much the model depends on
these three columns. If the drop is small, any remaining mismatch matters
little.

## 6. Out-of-distribution detector (D6) *(agent draft)*

**Shipped method: `standardized-distance`.** It is the only detector the app
runtime supports (`docs/feature-contract.md`). For each feature it takes
the z-score against the training mean and std, then the root-mean-square of
those z-scores. This is a diagonal Mahalanobis distance divided by √d.

- **Threshold:**
  - The detector is fit on the dev set's inner-fit rows.
  - The threshold is the 99th percentile of the scores on the inner
    holdout (`OOD_PERCENTILE` in `ml/src/config.ts`).
  - The holdout rows are in-distribution but unseen, so about 1% of normal
    rows are flagged by design.
  - 99% keeps false alarms on real terrain rare while still flagging the
    extreme fixture.
- **Comparison:** `ml/reports/train-report.json` (`ood`) also reports a
  full-covariance Mahalanobis detector, which accounts for correlated
  features.
- **Reported flagged rates:**
  - dev holdout;
  - each held-out wilderness area, with the detector fit without that area;
  - generated terrain, as the app flags it (detector **or** an input outside
    its training range). It is built with Role 1's `generateTerrain` at the
    Sandbox page's opening settings and the generator defaults, seeds 1–20,
    plus one-option sweeps. See `model_card.json` `ood.generatedTerrain` and
    `docs/model-card.md` ("How predictions are shown"). Before 2026-11-15
    this used the old placeholder generator at relief 0.3. The app no longer
    runs it, so those rates did not describe what users see.
- **What it cannot catch:** inputs that sit near the centre of each feature
  but form combinations never seen in real landscapes, and anything about
  the terrain that the 9 features don't describe.
- **Exports:** `isOOD(detector, vector)` in `ml/src/ood.ts`. The app uses
  the same formula (`oodScore`), and the inference test checks that both
  agree.

## 7. Open questions for humans

- Sign off on sections 1–9, and write the interpretation of results
  (D8: "conclusions must be yours"). `docs/model-card.md` has the structure
  and the numbers. Its **HUMAN** sections are empty on purpose.
- D7 explain: Role 2's `engine.explainOne` is a model-agnostic perturbation
  explain (±10% of each input's training range), tested on the real model
  in `ml/test/inference.test.ts`. Decide whether it counts as Role 3's
  explain function. No model-specific version was written.
- D9 freeze is human-owned. Do not run `pnpm ml:evaluate-final` until the
  team says the model is frozen.
- Role 2: `apps/web/src/lib/sandbox/terrain.ts` (the placeholder generator)
  has no users left now that `ml/src/train.ts` uses Role 1's generator.
  Its own header says it can be deleted. *(deleted 2026-11-18)*

## 8. Worker API announcement (D7, D10) *(agent draft, 2026-11-15)*

Message to Roles 1 and 2. The names follow Role 2's protocol
(`apps/web/src/lib/model/protocol.ts`), and Role 3 confirms them as-is:

> **Worker API, confirmed by Role 3.** `predictOne(sample)` returns
> `{ classIndex, probs[7], ood, oodReasons, outOfRange }`. Confidence is
> `probs[classIndex]`. `predictBatch(Float32Array n×8)` returns
> `{ classIndex: Uint8Array, confidence: Float32Array, ood: Uint8Array,
> oodCount, invalidCount }`. `explainOne(sample)` returns
> `{ prediction, sentence, method, sensitivities }`. Inputs are raw
> `TerrainSample` values in `TERRAIN_SAMPLE_KEYS` order. Class indices 0–6
> follow `model_card.json` `classes`, and that order is frozen: any change
> is announced first and bumps `modelVersion`. Short HUD names are in
> `classDisplayLabels`. Measured latency is in `docs/notes.md` section 9.
> Both model files now carry `modelVersion`, and a saved world should
> store it (see `docs/model-card.md`, "Versioning and compatibility").

Still to do by a human: post it to the team, and confirm with Role 2
that `docs/feature-contract.md`'s Worker table is updated. That table still
lists the removed `allowStub` and `stub` fields.


## 9. Measured inference latency (D10) *(agent draft, measured 2026-11-14)*

Measured with `pnpm ml:bench`. The raw output is in `ml/reports/latency.json`.

- **Machine:** Intel Core i7-11700 @ 2.50 GHz, 16 logical cores, 31 GB RAM.
  Fedora Linux, kernel 7.2.11.
- **Runtime:** Node v24.18.0, on a single thread.
- **Model:** softmax, `modelVersion` 0.1.0-dev.
- **Code timed:** the app's own engine code (`apps/web/src/lib/model`)
  running on the shipped model files.

These are Node numbers, **not browser numbers**. They leave out the
browser fetch, Worker startup, `postMessage` copies and rendering.

| Step | Runs | Median | p95 | Max |
|---|---|---|---|---|
| Model load, first (read + parse + validate + build engine) | 1 | 1.21 ms | | |
| Model load, warm | 50 | 0.21 ms | 0.38 ms | 1.04 ms |
| `heightmapToInputs`, 128×128 | 100 | 3.81 ms | 4.99 ms | 6.14 ms |
| `predictBatch`, full 128×128 grid (16,384 cells) | 200 | 16.2 ms | 18.2 ms | 19.2 ms |
| `predictBatch`, 16×16 dirty region (256 cells) | 200 | 0.27 ms | 0.39 ms | 0.52 ms |
| `predictOne`, per call | 100×1000 | 0.97 µs | 1.17 µs | 1.38 µs |
| `explainOne`, per call | 50×100 | 15.6 µs | 18.3 µs | 30.1 µs |

**Dirty-region fallback.** The two full-grid steps together, inputs and
`predictBatch`, take about 20 ms per edit. The Worker runs them off the
main thread, so this does not block rendering. A dirty-region path, which
re-predicts only the edited cells, is about 60× cheaper.
`ml/test/dirtyRegion.test.ts` checks that it gives the same result as the
full grid for those cells. Whether Role 2 uses it depends on how brush
editing feels in the browser, and this note does not measure that.
