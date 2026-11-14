# Model card: Project Graze habitat classifier

*(Agent draft, 2026-11-15. A human must review every section. Sections marked
**HUMAN** are left for the team to write: the conclusions must be ours.)*

Every number here is copied from `apps/web/public/model/model_card.json`
(the field is named next to each table) or from a report in `ml/reports/`.
If the two ever disagree, the JSON is right and this file is stale. Re-run
`pnpm ml:train` and update this file.

| | |
| --- | --- |
| Model version | `0.1.0-dev` (`modelVersion`). It stays `-dev` until the D9 freeze. |
| Schema version | `1` (`schemaVersion`) |
| Type | Softmax regression (multinomial logistic regression), 9 inputs, 7 classes |
| Size | 2,496 bytes (`versions.modelJsonBytes`) |
| Trained | `model.trainedAt`, seed 42, `pnpm ml:train` (deterministic) |
| Frozen | No (`model.frozen: false`). The locked test set has not been read (`finalTest: null`). |

## What it does

Given 8 terrain inputs for one 30 m cell (elevation, slope, aspect, three
hillshade values and two water distances), the model returns a probability
for each of 7 forest cover types. Aspect becomes sin and cos, which makes 9
model features. The app turns a generated 128 × 128 heightmap into those
inputs with `heightmapToInputs` from `@graze/features`, the same code the
training pipeline uses. It then predicts every cell in a Web Worker in the
browser. There is no server round trip.

Each prediction is `{ classIndex, probs[7], ood }`. `ood` marks a cell as low
trust.

### Intended use

- An educational sandbox: show how terrain alone relates to mapped forest
  cover in one region, and how uncertain that relationship is.
- Drive the visuals: overlays, walk-mode vegetation and the herd simulation's
  habitat.

### Out of scope

- Any real forest-management, ecological or land-use decision.
- Any place outside the four Colorado wilderness areas in the dataset.
- Treating a generated world's predictions as facts about a real place.

## Data

See `docs/dataset-card.md`. In short, the data is Covertype (Blackard, 1998;
UCI; DOI 10.24432/C50K5N; CC BY 4.0). It has 581,012 cells
(`dataset.instances`) in four wilderness areas of the Roosevelt National
Forest. Class counts (`dataset.classCounts`):

| Index | Class | Rows |
| --- | --- | --- |
| 0 | Spruce/Fir | 211,840 |
| 1 | Lodgepole Pine | 283,301 |
| 2 | Ponderosa Pine | 35,754 |
| 3 | Cottonwood/Willow | 2,747 |
| 4 | Aspen | 9,493 |
| 5 | Douglas-fir | 17,367 |
| 6 | Krummholz | 20,510 |

Excluded on purpose: soil type, wilderness area, and distances to roads and
fire points. Generated terrain has none of them (`dataset.featuresExcluded`).

## How it was selected

The rule was written before any leave-one-area-out (LOAO) result existed
(`docs/notes.md` section 3; `model.selectionRule`): pick the highest mean
macro-F1 over the 4 LOAO folds, and if a simpler model is within 0.01, pick
that one (softmax < MLP < forest).

Mean LOAO results (`baselines`):

| Model | LOAO accuracy | LOAO macro-F1 (std) | Random-split macro-F1 |
| --- | --- | --- | --- |
| Majority class | 0.359 | 0.120 (0.054) | 0.094 |
| Elevation-band rule | 0.625 | 0.355 (0.048) | 0.346 |
| **Softmax regression (selected)** | 0.596 | **0.385** (0.084) | 0.483 |
| Small MLP | 0.570 | 0.384 (0.080) | 0.581 |
| Random forest | 0.576 | 0.390 (0.070) | 0.604 |

The forest had the best mean (0.390). Softmax is within 0.01 of it and is the
simplest, so the rule selects softmax. Its config is `sqrt-balanced` class
weights (`model.config`).

## Metrics: selected model

Both split types side by side (`evaluations`, first two entries):

| Split | Accuracy | Macro-F1 | Log loss |
| --- | --- | --- | --- |
| Random split (optimistic) | 0.682 | 0.483 | 0.758 |
| LOAO, pooled over 4 folds | 0.642 | 0.370 | not computed |

The random split is optimistic because neighbouring 30 m cells are correlated
and land on both sides of it. LOAO tests a landscape the model has not seen.

Per class (recall / F1):

| Class | Random recall | Random F1 | LOAO recall | LOAO F1 | LOAO support |
| --- | --- | --- | --- | --- | --- |
| Spruce/Fir | 0.693 | 0.684 | 0.677 | 0.667 | 190,656 |
| Lodgepole Pine | 0.727 | 0.738 | 0.706 | 0.710 | 254,971 |
| Ponderosa Pine | 0.654 | 0.629 | 0.379 | 0.420 | 32,179 |
| Cottonwood/Willow | 0.237 | 0.299 | 0 | 0 | 2,472 |
| Aspen | 0.098 | 0.138 | 0.043 | 0.052 | 8,544 |
| Douglas-fir | 0.407 | 0.373 | 0.429 | 0.344 | 15,630 |
| Krummholz | 0.565 | 0.520 | 0.394 | 0.399 | 18,459 |

Per held-out area (`evaluations`, "Held-out area: …"):

| Held-out area | Accuracy | Macro-F1 | Log loss |
| --- | --- | --- | --- |
| Rawah | 0.685 | 0.431 | 0.767 |
| Neota | 0.610 | 0.470 | 0.993 |
| Comanche Peak | 0.628 | 0.389 | 0.913 |
| Cache la Poudre | 0.459 | 0.248 | 2.448 |

Cottonwood/Willow occurs only in Cache la Poudre, so its LOAO recall is 0 by
construction (`split.details`).

Inner holdout of the dev set for the shipped model (`finalModelHoldout`):
accuracy 0.683, macro-F1 0.489, log loss 0.757. This is not the locked test
set.

**Locked test set:** not evaluated (`finalTest: null`). It runs once, after
the human freeze (D9).

### Per-class discussion — **HUMAN**

> TODO (humans): Two classes are about 85% of the rows, so accuracy mostly
> measures Spruce/Fir and Lodgepole Pine. Discuss what the per-class table
> shows: which classes the model effectively never predicts, and why
> Cache la Poudre is the hardest area.

## Ablations

LOAO mean macro-F1 (`ablations`; reference = the deployed feature set):

| Feature set | LOAO macro-F1 | Random macro-F1 |
| --- | --- | --- |
| Terrain (deployed, 9 features) | 0.385 | 0.486 |
| Terrain without hillshade | 0.388 | 0.451 |
| Terrain without water distances | 0.362 | 0.434 |
| All original features (evaluation only) | 0.347 | 0.581 |

## Calibration

Temperature scaling was fitted on the inner holdout and folded into the
weights (`calibration`). On the random-split validation, ECE is 0.100 before
and 0.014 after (temperature 0.690). The shipped model's temperature is 0.666
(`calibration.shippedModelTemperature`).

## Feature importance

Permutation importance is the mean drop in macro-F1 when one feature is
shuffled, averaged over the 4 LOAO folds (`featureImportance`):

| Feature | Importance |
| --- | --- |
| elevation | 0.1408 |
| hillshade3pm | 0.0151 |
| horizontalDistanceToWater | 0.0104 |
| aspectCos | 0.0046 |
| slope | 0.0037 |
| aspectSin | 0.0008 |
| hillshadeNoon | −0.0019 |
| verticalDistanceToWater | −0.0025 |
| hillshade9am | −0.0047 |

## Out-of-distribution (low-trust) flag

The app flags a cell when **either** of these holds:

1. **Detector:** the root-mean-square z-score of the 9 features (a diagonal
   Mahalanobis distance) is above 2.103 (`ood.threshold`). The threshold is
   the 99th percentile on in-distribution holdout rows.
2. **Range check:** any raw input is outside its training range
   (`inputs[].min/max`).

Rates measured for the detector alone (`ood`):

| Rows | Flagged |
| --- | --- |
| Dev inner holdout (1% by design) | 1.0% |
| Held out: Rawah | 0.3% |
| Held out: Neota | 0.1% |
| Held out: Comanche Peak | 1.8% |
| Held out: Cache la Poudre | 15.2% |

For each held-out area, the detector was fit without that area.

On generated terrain, the app-level rate (detector or range check) is in
"How predictions are shown" below.

What it cannot catch: inputs that look typical feature by feature but never
occur together in real landscapes, and anything the 9 features do not
describe (`limitations`).

## Inference API (Worker)

This is Role 2's Worker (`apps/web/src/lib/model/protocol.ts`), confirmed here
as the D10 interface. Shapes follow `docs/feature-contract.md`.

| Message | Input | Output |
| --- | --- | --- |
| `predictOne` | one `TerrainSample` (8 raw inputs) | `{ classIndex, probs[7], ood, oodReasons, outOfRange }` |
| `predictBatch` | `Float32Array` of `n × 8` raw inputs, in `TERRAIN_SAMPLE_KEYS` order (transferred) | `{ classIndex: Uint8Array(n), confidence: Float32Array(n), ood: Uint8Array(n), oodCount, invalidCount }` |
| `explainOne` | one `TerrainSample` | `{ prediction, sentence, method, sensitivities }` |

**Confidence** is the probability of the predicted class:
`probs[classIndex]` for `predictOne`, and `confidence[i]` for `predictBatch`.
The walk HUD shows it for the cell underfoot.

**Class order is a stable contract** (`classOrderNote`). The cover map,
vegetation meshes and tints are keyed by class index. Reordering or renaming
a class requires telling Roles 1 and 2 first and bumping `modelVersion`.
`ml/test/contract.test.ts` pins the order.

**Display labels:** `classDisplayLabels` gives short HUD names in the same
order (Spruce-fir, Lodgepole, Ponderosa, Cottonwood, Aspen, Douglas-fir,
Krummholz). Colors stay in the app's palette file.

Latency is measured, not estimated. See `docs/notes.md` section 9 and
`ml/reports/latency.json`.

## How predictions are shown

- **Walk-mode vegetation and the overlays are a visualization of predicted
  classes on generated terrain.** Each cell's trees are drawn from the class
  the model predicts for that cell. They are not observations.
- **Generated terrain is not real terrain.** The heightmap is seeded noise,
  scaled into the dataset's elevation range. Its hillshade and water
  distances are computed from that heightmap, not from the GIS layers behind
  Covertype.
- **The OOD flag marks low-trust cells.** These cells are drawn sparse and
  desaturated in walk mode and marked in the OOD overlay.
- A good-looking world is not evidence that the model is accurate. Accuracy
  comes only from the evaluations above, on real data.

### How much of a generated world is low trust

Measured with `pnpm ml:train` (`ood.generatedTerrain` in `model_card.json`)
or `pnpm ml:generated-ood` (`ml/reports/generated-terrain-ood.json`). The
setup is Role 1's `generateTerrain` with seeds 1–20 and the model's elevation
range, then `heightmapToInputs`, then the app engine. Rates are over land
cells (288,361 per configuration; water cells excluded).

| World | Low trust (app) | Detector only | Outside a training range | Per seed (min – median – max) |
| --- | --- | --- | --- | --- |
| Sandbox page on load (relief 0.2, center 0.4, 12% water) | 12.2% | 1.4% | 10.9% | 1.0% – 9.1% – 37.9% |
| `generateTerrain` defaults (center 0.5) | 12.1% | 1.2% | 10.9% | 1.0% – 9.0% – 37.8% |

Nearly all of the out-of-range cells have **horizontal distance to water**
above the training maximum of 1,397 m (`outsideRangeByInput`). With a 12%
water share that collects in the central valley, cells in the far corners of
the 3.84 km map are farther from water than any Covertype cell. The per-seed
spread is wide for the same reason: it depends on where the water ends up.
The single-option sweeps for Role 1 (band center, roughness, relief) are in
the same JSON.

## Versioning and compatibility

- `model.json` and `model_card.json` both carry `modelVersion` and
  `schemaVersion`. `model_card.json` `versions.modelJsonSha256` is the
  SHA-256 of the exact `model.json` it describes.
  `ml/test/contract.test.ts` checks all three.
- `modelVersion` is bumped whenever a re-export can change any prediction:
  weights, features, classes or their order, the OOD detector, or the
  threshold. It is set in `ml/src/config.ts` (`MODEL_VERSION`).
- `schemaVersion` is bumped only when a field the app requires changes or is
  removed. New optional fields keep it.
- **Saved worlds** (Role 2 D12) store `modelVersion`, plus seed, generation
  options and brush delta. They never store predictions. On load:
  - **same `modelVersion`:** re-predict as usual (predictions are not
    stored, so there is nothing to reconcile);
  - **different `modelVersion`:** rebuild the terrain, re-predict with the
    current model, and show a notice such as "This world was saved with
    model X; covers are re-predicted with model Y and may differ";
  - **unknown or newer `schemaVersion` of the world record:** refuse to
    load and show a friendly error.

### Changelog

| Model version | Date | Change | Why |
| --- | --- | --- | --- |
| `0.1.0-dev` | 2026-11-14 | First real model: softmax regression, `sqrt-balanced`, temperature folded in, standardized-distance OOD detector at the 99th percentile. | Selected by the LOAO rule (`docs/notes.md` section 3). |
| `0.1.0-dev` (same weights) | 2026-11-15 | Added `modelVersion`, `classDisplayLabels`, `classOrderNote`, `versions.modelJsonSha256`, the walk-mode limitation, and `ood.generatedTerrain`. The generated-terrain study and fixtures now use Role 1's `generateTerrain` instead of the old placeholder generator, which the app no longer uses. `model.json` weights are byte-identical. | D10–D12. No prediction changed, so no version bump. |

## Limitations

The list the Model Report page shows is `limitations` in `model_card.json`.
It includes the walk-mode caveat, and `docs/limitations.md` mirrors it. In
short:

- Terrain only: the model knows nothing of soil, climate, fire history or
  disturbance.
- Two classes dominate; read macro-F1 and per-class recall, not accuracy.
- Results vary a lot between held-out areas.
- Generated terrain is synthetic and computed differently from the dataset's
  GIS layers.
- The OOD flag only measures distance from the training centre, plus the
  range check.
- Walk-mode vegetation is a picture of predictions, not of a real place.
- Educational simulation only.

## Interpretation of results — **HUMAN**

> TODO (humans, D8): write the conclusions in your own words. The defense
> questions in `docs/roles/ml.md` are the checklist:
> - why random splits are optimistic here and LOAO is more honest;
> - why the MLP and forest lead on the random split, and what happens to
>   that lead on LOAO;
> - what each ablation row means for the hillshade mismatch and for
>   excluding soil, area, roads and fire points;
> - what the elevation-band baseline's score says about the problem.
