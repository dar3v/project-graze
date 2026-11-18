# Role 3: ML

**Owner:** [Name]
**Mission:** Build a trustworthy, reproducible classifier and document it honestly. This is the most graded part of the project, so everything here must be defensible by all three teammates.

---

## Ownership

| You own | You do not edit (ask the owner) |
| --- | --- |
| `ml/` (fetch-data, prepare, train, evaluate) | `apps/web/` pages (Role 2) |
| `packages/features/` (shared feature code) | `packages/sim/` (Roles 1 and 2) |
| `docs/dataset-card.md`, `docs/model-card.md`, `docs/notes.md` | `apps/web/src/lib/world/` (Role 1) |
| `model.json` and `model_card.json` exports | |

---

## Shared contract (agree on this in the first 30 minutes; source of truth is `docs/feature-contract.md`)

- **Heightmap:** `Float32Array` of length 16384, row-major (`index = y * 128 + x`), values in meters, scaled into Covertype's elevation range (verify the range in `covtype.info`).
- **Cell size:** 30 m (verify against the dataset docs).
- **Raw model inputs:** elevation, slope, aspect, hillshade 9am / noon / 3pm, horizontal distance to water, vertical distance to water. Units must match the dataset's (verify: slope and aspect in degrees, hillshade 0-255).
- **Model vector:** built by `features.ts` (aspect becomes sin/cos, scaling applied). The same function is used in training and in the app.
- **Model output:** `{ classIndex, probs: number[7], ood: boolean }`. Class indices 0-6, in the order listed in `model_card.json`.
- **Model files:** `apps/web/public/model/model.json` and `model_card.json`.

You **produce** the model, the feature code, and the cards. You **consume** nothing from the other roles except the contract.

---

## Deliverables

Each item is done only when every checkbox is ticked.

### D1. Data spike (tonight)
- [x] Script downloads and parses Covertype (581,012 rows, 54 features, 7 classes) *(`pnpm ml:fetch`; SHA-256 verified)*
- [x] Prints class counts *(`pnpm ml:explore`)*
- [x] Prints majority-class baseline accuracy
- [x] Prints elevation-band rule baseline accuracy
- [x] `docs/notes.md` records which TypeScript approach you will use (from-scratch softmax, `ml-random-forest`, TensorFlow.js) and whether installs worked *(section 1: all from scratch, no installs needed)*

### D2. Shared features (Days 1-3)
- [x] `packages/features/features.ts` exports: raw columns to model vector, and heightmap to raw columns (elevation, slope, aspect, hillshade x3, water distances) *(heightmap function lives in `src/terrain.ts`, exported from the package index)*
- [x] Each formula documented in `docs/feature-contract.md`
- [x] Unit test on a tiny hand-checkable heightmap *(`packages/features/test/terrain.test.ts`)*
- [x] A note on how our hillshade computation may differ from the dataset's original method (this is why the ablation exists) *(`docs/notes.md` section 5)*

### D3. Data preparation and splits (Days 2-3)
- [x] Exploration summary: class balance, feature ranges, missing or odd values *(`ml/reports/exploration.json`, `docs/dataset-card.md`)*
- [x] Stratified random split (documented as optimistic, because neighboring cells are correlated)
- [x] Leave-one-wilderness-area-out folds (the honest evaluation)
- [x] Final test set locked away and untouched until the model is frozen *(`LockedTestSet` + `ml/splits.lock.json`)*
- [x] Scalers fit on training folds only
- [x] A leakage test that fails if test rows appear in training *(`ml/test/splits.test.ts`)*

### D4. Training and comparison (Days 4-5)
- [x] Selection rule written to `docs/notes.md` **before** you look at results: best macro-F1 on leave-area-out folds; prefer the simpler model if within noise *(section 3; section 2 discloses the random-split smoke test run first)*
- [x] Models: majority baseline, elevation-band rule, softmax regression, random forest, small MLP
- [x] Fixed random seeds *(two runs gave a byte-identical `model.json`)*
- [x] One command (`npm run ml:train`) reproduces everything *(`pnpm ml:train`, ~4 min)*
- [x] Tuning uses training folds only *(inner holdout of each training fold)*

### D5. Evaluation (Days 4-5)
- [x] Confusion matrix, accuracy, per-class precision/recall/F1, macro-F1, log loss
- [x] Both split types reported side by side
- [x] Ablations: terrain-only vs. all original features, with vs. without hillshade, with vs. without water-distance features
- [x] Calibration check and temperature scaling
- [x] Permutation importance (global)
- [ ] Per-class results discussed, because two classes dominate and accuracy alone misleads *(numbers are in `model_card.json`; the discussion is for humans to write)*

### D6. Out-of-distribution detector (Days 5-6)
- [x] kNN distance or Mahalanobis distance from the training feature distribution *(diagonal Mahalanobis (`standardized-distance`) shipped; full Mahalanobis reported for comparison)*
- [x] Threshold chosen from the training data (for example, a high percentile of held-out distances), with the choice documented *(99th percentile, `docs/notes.md` section 6)*
- [x] `isOOD(vector)` exported and parameters stored in `model.json` *(`ml/src/ood.ts`)*
- [x] Report how often real held-out rows are flagged vs. generated-terrain cells *(`model_card.json` `ood`, `ml/reports/train-report.json`)*

### D7. Export (Day 5, update as needed)
- [x] `model.json`: weights, scaler, OOD parameters, temperature, sized to load quickly (cap trees and depth if the forest is large) *(softmax, 2.5 KB; temperature folded into the weights)*
- [x] `model_card.json`: class names and order, feature names and ranges, all metrics, ablations, calibration, importance, versions, citation, limitations *(limitations are an agent draft and need human review)*
- [x] Fixture file of sample inputs with expected outputs, for the inference test *(`ml/test/fixtures/inference-fixtures.json`, checked against the app runtime)*
- [x] Explain function: perturbs each input and returns probability shifts (for Role 2's sensitivity bars) *(Role 2's `engine.explainOne` does this and is tested on the real model. Team decision 2026-11-18: it counts as Role 3's explain function)*
- [ ] Announce the Worker API to Role 2 on Day 4 *(draft in `docs/notes.md` section 8; a human posts it)*

### D8. Documentation (Days 11-12)
- [x] `docs/dataset-card.md`: source, citation (Blackard, 1998; DOI 10.24432/C50K5N; CC BY 4.0), attributes, target, size, known limits *(agent draft, needs human review)*
- [x] `docs/model-card.md`: what it does, how it was selected, metrics, errors, limitations, intended use *(agent draft from `model_card.json`; HUMAN sections left empty)*
- [x] README paragraph justifying TypeScript training (shared feature code prevents train/serve drift) and noting the pipeline is small enough to port to Python
- [ ] **Interpretation of results written by humans.** OpenCode may draft the structure; the conclusions must be yours

### D9. Freeze (Day 12)
- [ ] Model frozen. Final test set evaluated once
- [ ] Final `model.json` and `model_card.json` committed and tagged

### D10. Inference support for walk mode
- [x] The Worker API exposes `predictOne` (for the HUD cell underfoot: class index, probabilities, confidence, ood flag) and `predictBatch` (for the full 128x128 grid), documented with the same shapes as the shared contract *(Role 2's `protocol.ts`, confirmed in `docs/notes.md` section 8)*
- [x] Measure and record, with the machine named: full-grid `predictBatch` time, `predictOne` time, and model load time. Record these in `docs/notes.md` as measured values, never estimates *(`pnpm ml:bench`, `docs/notes.md` section 9; Node, i7-11700)*
- [x] If the full-grid batch is too slow for brush editing, document the fallback (predict only the dirty region from `onHeightmapChange(dirtyRect)`), and add a test that the dirty-region result equals the full-grid result for the same cells *(~20 ms per full-grid edit in a Worker; dirty-region path documented and tested in `ml/test/dirtyRegion.test.ts`)*
- [x] Class order and class names in `model_card.json` are a stable contract: vegetation meshes and tints in ROLE-1 D9 are keyed by class index. Any reorder or change requires telling Roles 1 and 2 first and bumping the model version *(pinned by `ml/test/contract.test.ts`)*
- [x] Optional: short display labels per class in `model_card.json` for the HUD (colors stay in the app's palette file, since the model card has no color field) *(`classDisplayLabels`)*

### D11. Model versioning and compatibility
- [x] `model_card.json` and `model.json` carry a `modelVersion` and a `schemaVersion`
- [x] Saved worlds from ROLE-2 D12 store `modelVersion`; document what the app should do on mismatch (re-predict and show a notice) *(`docs/model-card.md`, "Versioning and compatibility"; Role 2 implements it)*
- [x] Changelog section in `docs/model-card.md` recording what changed between versions and why

### D12. Documentation for the walkable world
- [x] `docs/model-card.md` and `docs/dataset-card.md`: add a "How predictions are shown" section stating that walk-mode vegetation and overlays are a visualization of predicted classes on generated terrain, that generated terrain is not real terrain, and that the OOD flag marks low-trust cells
- [x] Report the OOD flag rate on generated terrain across several seeds and the default generation options, so Role 1 can tune how OOD cells look and so the report is honest about how much of a generated world is low-trust. These numbers are measured, never estimated *(20 seeds × 11 configs, `ml/reports/generated-terrain-ood.json`; Sandbox defaults 12.2%)*
- [x] Add the walk-mode caveat to the limitations content that feeds the Model Report page
- [ ] Humans write the interpretation

---

## Tonight (definition of done)

- [x] Repo cloned, installed, and running on your machine
- [x] D1 complete and committed
- [x] `docs/notes.md` answers: "Is training in TypeScript going to be a problem?"

This spike is the most important one tonight. If TypeScript training is painful, the team needs to know on Day 1, not Day 6.

---

## Timeline

| Day | Target |
| --- | --- |
| 1 | D1 spike; confirm library choice |
| 2-3 | D2 and D3 complete |
| 4-5 | D4, D5, D7 complete; Worker API announced |
| 5-6 | D6 complete; first real `model.json` handed to Roles 1 and 2 |
| 7-10 | Support integration, fix mismatches, re-export if features change |
| 11-12 | D8 and D9 |
| 13 | Write the ML sections of the presentation script from real results |
| 14 | Buffer |

### Extended scope

Team is ahead of the original schedule above. These are targets, not a new
freeze. Day 12 freeze (D9), Day 13 presentation script, and Day 14 buffer stay
where they are.

| Target order | Deliverable |
| --- | --- |
| First (target) | D10 inference support (it unblocks walk mode) |
| Next (target) | D11 model versioning |
| Next (target) | D12 walkable-world documentation, during the existing Day 11-12 documentation days |

---

## Cut order (if behind)

1. D11 changelog polish
2. Optional per-class display labels (D10)

**Never cut:** baselines, leave-one-wilderness-area-out evaluation, the OOD detector, the limitations content, the leakage test, stable class order, measured latency numbers.

---

## You must be able to explain in the defense

- Why random splits give optimistic results here, and why leave-area-out is more honest
- Why soil type, wilderness area, and road/fire distances are excluded from the features
- Why accuracy is misleading on this dataset and which metrics replace it
- Why the neural net did or didn't beat the simpler models
- What the OOD detector measures, how the threshold was chosen, and what it cannot catch
- How preprocessing is identical in training and in the app
- Why the HUD can show a prediction instantly in walk mode, and how the latency was measured
- What happens when a saved world meets a newer model
- Why a good-looking walk-mode world is not evidence the model is accurate

---

## Working rules

- **Never invent numbers.** Every metric in the docs comes from `model_card.json`.
- `features.ts` changes require telling the other two, because it changes the contract.
- "Done" means typecheck and tests pass.
- Tests required: feature computation on a known heightmap, model inference against stored fixtures, split leakage.
- Agents draft code and docs; humans write the interpretation.

---

## Needs from other roles

| Role | Needed |
| --- | --- |
| Role 2 (App and Sim) | Confirm the Worker message names (`predictBatch`, `predictOne`, `explainOne`) before D10 freezes them. |
| Role 1 (World) | Send the default generation options used for the OOD-rate report in D12. |
