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
- [ ] Script downloads and parses Covertype (581,012 rows, 54 features, 7 classes)
- [ ] Prints class counts
- [ ] Prints majority-class baseline accuracy
- [ ] Prints elevation-band rule baseline accuracy
- [ ] `docs/notes.md` records which TypeScript approach you will use (from-scratch softmax, `ml-random-forest`, TensorFlow.js) and whether installs worked

### D2. Shared features (Days 1-3)
- [ ] `packages/features/features.ts` exports: raw columns to model vector, and heightmap to raw columns (elevation, slope, aspect, hillshade x3, water distances)
- [ ] Each formula documented in `docs/feature-contract.md`
- [ ] Unit test on a tiny hand-checkable heightmap
- [ ] A note on how our hillshade computation may differ from the dataset's original method (this is why the ablation exists)

### D3. Data preparation and splits (Days 2-3)
- [ ] Exploration summary: class balance, feature ranges, missing or odd values
- [ ] Stratified random split (documented as optimistic, because neighboring cells are correlated)
- [ ] Leave-one-wilderness-area-out folds (the honest evaluation)
- [ ] Final test set locked away and untouched until the model is frozen
- [ ] Scalers fit on training folds only
- [ ] A leakage test that fails if test rows appear in training

### D4. Training and comparison (Days 4-5)
- [ ] Selection rule written to `docs/notes.md` **before** you look at results: best macro-F1 on leave-area-out folds; prefer the simpler model if within noise
- [ ] Models: majority baseline, elevation-band rule, softmax regression, random forest, small MLP
- [ ] Fixed random seeds
- [ ] One command (`npm run ml:train`) reproduces everything
- [ ] Tuning uses training folds only

### D5. Evaluation (Days 4-5)
- [ ] Confusion matrix, accuracy, per-class precision/recall/F1, macro-F1, log loss
- [ ] Both split types reported side by side
- [ ] Ablations: terrain-only vs. all original features, with vs. without hillshade, with vs. without water-distance features
- [ ] Calibration check and temperature scaling
- [ ] Permutation importance (global)
- [ ] Per-class results discussed, because two classes dominate and accuracy alone misleads

### D6. Out-of-distribution detector (Days 5-6)
- [ ] kNN distance or Mahalanobis distance from the training feature distribution
- [ ] Threshold chosen from the training data (for example, a high percentile of held-out distances), with the choice documented
- [ ] `isOOD(vector)` exported and parameters stored in `model.json`
- [ ] Report how often real held-out rows are flagged vs. generated-terrain cells

### D7. Export (Day 5, update as needed)
- [ ] `model.json`: weights, scaler, OOD parameters, temperature, sized to load quickly (cap trees and depth if the forest is large)
- [ ] `model_card.json`: class names and order, feature names and ranges, all metrics, ablations, calibration, importance, versions, citation, limitations
- [ ] Fixture file of sample inputs with expected outputs, for the inference test
- [ ] Explain function: perturbs each input and returns probability shifts (for Role 2's sensitivity bars)
- [ ] Announce the Worker API to Role 2 on Day 4

### D8. Documentation (Days 11-12)
- [ ] `docs/dataset-card.md`: source, citation (Blackard, 1998; DOI 10.24432/C50K5N; CC BY 4.0), attributes, target, size, known limits
- [ ] `docs/model-card.md`: what it does, how it was selected, metrics, errors, limitations, intended use
- [ ] README paragraph justifying TypeScript training (shared feature code prevents train/serve drift) and noting the pipeline is small enough to port to Python
- [ ] **Interpretation of results written by humans.** OpenCode may draft the structure; the conclusions must be yours

### D9. Freeze (Day 12)
- [ ] Model frozen. Final test set evaluated once
- [ ] Final `model.json` and `model_card.json` committed and tagged

---

## Tonight (definition of done)

- [ ] Repo cloned, installed, and running on your machine
- [ ] D1 complete and committed
- [ ] `docs/notes.md` answers: "Is training in TypeScript going to be a problem?"

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

---

## Cut order (if behind)

1. Random forest or MLP (keep one flexible model plus softmax and baselines)
2. Permutation importance
3. Extra ablations (keep terrain-only vs. all features)

**Never cut:** baselines, leave-one-wilderness-area-out evaluation, the OOD detector, the limitations content, the leakage test.

---

## You must be able to explain in the defense

- Why random splits give optimistic results here, and why leave-area-out is more honest
- Why soil type, wilderness area, and road/fire distances are excluded from the features
- Why accuracy is misleading on this dataset and which metrics replace it
- Why the neural net did or didn't beat the simpler models
- What the OOD detector measures, how the threshold was chosen, and what it cannot catch
- How preprocessing is identical in training and in the app

---

## Working rules

- **Never invent numbers.** Every metric in the docs comes from `model_card.json`.
- `features.ts` changes require telling the other two, because it changes the contract.
- "Done" means typecheck and tests pass.
- Tests required: feature computation on a known heightmap, model inference against stored fixtures, split leakage.
- Agents draft code and docs; humans write the interpretation.
