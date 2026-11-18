# Glossary

Domain terms used across the app, the ML pipeline and the docs. Use these
names in code and in reviews. Add terms here when a new concept gets a name.
Where a term has a constant, the value is the one in the code today; the code
wins if they ever disagree.

## Terrain and world

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Grid** | The world is `GRID` × `GRID` cells (128 × 128 = 16,384). | `packages/sim/terrain/src/heightmap.ts` |
| **Cell** | One square of the grid, 30 m across, addressed as `(x, y)`. `y = 0` is north, `+x` is east. Everything per cell (heights, inputs, predictions) uses the same index, `y * size + x`. | `docs/feature-contract.md` |
| **Heightmap** | `Float32Array(size * size)` of heights in meters, row-major (`index = y * size + x`), `y = 0` is north, cells are 30 m. | `packages/sim/terrain` (generation, brush) |
| **Elevation range** | The meters the generator scales heights into, chosen to sit inside Covertype's elevation range so the model is not asked about heights it never saw. | `packages/sim/terrain` |
| **Seed** | The number that makes a generated world repeatable: the same seed and options always give the same heightmap. | `packages/sim/terrain` |
| **Water level** | Height below which a cell is water. It sets the water mask and the distance-to-water inputs. | Sandbox controls, `@graze/features` |
| **Water mask** | `Uint8Array` with 1 for water cells. Water cells are not predicted and get no plants. | `@graze/features` (`heightmapToInputs`) |
| **Brush** | Raise or lower the terrain under the cursor in orbit view. Edits are stored as a sparse delta on top of the generated base heightmap. | `packages/sim/terrain` (`applyBrush`) |
| **World terrain** | The terrain being worked on: generated base heightmap, live heightmap (base + brush edits), the recipe (`WorldConfig`) and the elevation range the base was generated into. An opened saved world keeps its own range. Type `WorldTerrain`. | `apps/web/src/lib/state/worldTerrain.ts` |
| **Saved world** | A world terrain as a recipe: seed, generator options, elevation range, brush edits as a sparse delta, `schemaVersion`, `modelVersion`. Never the heightmap, never predictions. Type `SavedWorld`. | `packages/worlds` (format, validation); `worldTerrain.ts` (`toSavedWorld`, `openSavedWorld`) |
| **Share code** | A saved world packed into text that starts with `graze1.`. It is pasted into the app and needs no server. | `apps/web/src/lib/world/share.ts` |
| **Worlds API** | The optional Hono Worker with a D1 table: `POST /api/worlds` stores a saved world and returns an id, `GET /api/worlds/:id` fetches it. This is what makes `#/world/<id>` links work. | `src/index.ts`, `docs/worlds-api.md` |

## Model inputs

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Terrain sample** | The 8 raw values the model reads for one cell: elevation, slope, aspect, three hillshades, horizontal and vertical distance to water. Type `TerrainSample`. "Raw inputs" and "cell inputs" in older notes mean the same thing. | `@graze/features` |
| **Sample key order** | `TERRAIN_SAMPLE_KEYS`: the single order of the 8 values whenever samples are packed into a buffer. | `@graze/features` |
| **Packed inputs** | `TERRAIN_SAMPLE_DIM` numbers per cell in sample key order, one buffer for the whole grid. What the Worker batch takes. Read a cell with `sampleAt`, write one with `packSample`. | `@graze/features` |
| **Terrain-inputs module** | Heightmap + water level → packed inputs and water mask (`heightmapToInputs`; `heightmapToSamples` for one object per cell). The only implementation; the app and training both call it. | `packages/features/src/terrain.ts` |
| **Hillshade** | How brightly the sun lights a slope, 0-255, at 9am, noon and 3pm. It is a model input computed from the heightmap. It has nothing to do with the visual day/night sun. | `@graze/features` |
| **SUN** | The three sun positions used for hillshade, fitted to the Covertype hillshade columns. Part of the shared contract. | `@graze/features` |
| **Feature vector** | The 9 model features computed from a terrain sample (aspect becomes sin and cos), in `FEATURE_NAMES` order. | `@graze/features` (`computeFeatures`) |
| **Scaler** | The mean and standard deviation per feature, fit on training folds only and shipped inside `model.json`, so the app standardizes inputs exactly as training did. | `model.json`, `docs/feature-contract.md` |

## Data, training and evaluation

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Covertype** | The dataset: 581,012 cells of Roosevelt National Forest, Colorado, each labeled with one of 7 forest cover types (Blackard, 1998, UCI, CC BY 4.0). | `docs/dataset-card.md`, `ml/src/data/` |
| **Cover type / class** | The label being predicted. The 7 classes in `model_card.json` order: Spruce/Fir, Lodgepole Pine, Ponderosa Pine, Cottonwood/Willow, Aspen, Douglas-fir, Krummholz. Class indices everywhere follow this order. | `model_card.json` (`classes`) |
| **Wilderness area** | One of the 4 regions the Covertype cells come from. The model never sees it as an input; it is used only to split the data. | `docs/dataset-card.md` |
| **Random split** | A stratified random train/validation split. Optimistic, because neighboring cells are alike and end up on both sides. | `ml/` |
| **LOAO** | Leave-one-wilderness-area-out: train on 3 areas, test on the 4th, four times. The honest test of whether the model works on land it has not seen. Model selection uses it. | `ml/`, `docs/model-card.md` |
| **Locked test set** | Rows set aside at the start and pinned by hash in `ml/splits.lock.json`. Read once with `pnpm ml:evaluate-final -- --confirm-frozen` after the model is frozen. Not read yet (`finalTest: null`). | `ml/splits.lock.json` |
| **Freeze** | The point after which the model is not changed any more. Only then is the locked test set read. `model.frozen` in the card says whether it has happened. | `model_card.json` |
| **Baseline** | A trivial model to beat: the majority class, and a hand-written elevation-band rule. | `ml/src/models/` |
| **Model family** | One of the models compared: softmax regression, a small MLP and a random forest. All three are written from scratch, with no ML library. | `ml/src/models/` |
| **Selection rule** | Highest mean LOAO macro-F1 wins, but a simpler model within 0.01 of the best is chosen instead (softmax < MLP < forest). Written down before any LOAO result. Softmax was selected. | `docs/notes.md` §3, `docs/model-card.md` |
| **Class weighting** | `sqrt-balanced`: rare classes count more in the training loss (by the square root of their rarity), so the model does not just learn the two big classes. | `model_card.json` (`model.config`) |
| **Macro-F1** | The F1 score averaged over the 7 classes with equal weight. The headline metric, because two classes dominate and accuracy alone hides the rare ones. | `docs/model-card.md` |
| **Calibration / temperature** | Fitting one number (the temperature) so predicted probabilities match how often the model is right. It is folded into the exported weights. | `ml/src/`, `model_card.json` (`calibration`) |
| **Ablation** | Training again without a group of features to see how much they matter (for example, the computed hillshade). | `model_card.json` (`ablations`) |
| **Permutation importance** | How much macro-F1 drops when one feature's values are shuffled. A rough measure of how much the model leans on that feature. | `model_card.json` (`featureImportance`) |
| **Generated-terrain OOD check** | How often cells of generated worlds are flagged OOD, compared with real held-out rows (`pnpm ml:generated-ood`). | `ml/src/generated-ood.ts` |

## Model files and inference

| Term | Meaning | Lives in |
| --- | --- | --- |
| **`model.json`** | The exported model: weights, scaler, OOD parameters and temperature. Loaded in the browser; no server is involved. | `apps/web/public/model/` |
| **`model_card.json`** | Everything about the model that the app and the Model Report show: classes, features and ranges, metrics, ablations, calibration, importance, OOD, versions, limitations. The Model Report reads only this file. | `apps/web/public/model/` |
| **Model version** | `modelVersion` in the card (now `0.1.0-dev`). Saved worlds record it, so the app can say when a world was made with another model. | `model_card.json` |
| **Inference fixtures** | Sample inputs with their expected outputs. A test runs the app's own inference code on them, so the exported model and the app cannot silently disagree. | `ml/test/fixtures/inference-fixtures.json` |
| **Model Worker** | A Web Worker that runs predictions off the main thread, so the page stays smooth while a whole grid is predicted. | `apps/web/src/lib/model/` |
| **Engine** | The pure, synchronous prediction code (`predictOne`, `predictBatch`, `explainOne`). The Worker runs it; the tests call it directly. | `apps/web/src/lib/model/engine.ts` |
| **Cover map** | `Uint8Array` of predicted cover-type class indices per cell, in `model_card.json` class order. | app Worker batch result |
| **Confidence** | The probability the model gives its predicted class for a cell. Shown by the confidence overlay. | Worker batch result |
| **Prediction session** | Turns terrain inputs into cover maps: debounce, stale-result dropping, buffer ownership. Publishes each cover map with the inputs and water mask it was predicted from (`CoverMap`). The Worker is its adapter in the app, an in-process engine in tests. | `apps/web/src/lib/model/predictionSession.ts` |
| **OOD** | Out of distribution: an input outside its training range, or a combination of inputs far from the training data. The detector is a standardized distance, flagged above the 99th percentile of the training data. | model card, Worker |
| **Low trust** | How the app shows an OOD cell: an OOD marker in the overlays, and sparser, smaller, grey plants in the 3D world. It means "don't believe this prediction much". | `apps/web/src/lib/world/vegetation.ts` |

## The app

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Sandbox** | The main page: the 3D world, the brush and world controls, the Site Probe and the herd simulation. | `apps/web/src/lib/routes/Sandbox.svelte` |
| **Model Report** | The page that explains the dataset, preparation, model comparison, metrics and limitations, read from `model_card.json`. | `routes/ModelReport.svelte` |
| **Responsible Use** | The page that says what the app must not be used for and how to read its pictures. | `routes/ResponsibleUse.svelte` |
| **Cell picking** | Clicking a cell to choose it. Done only in the 3D view: the Select tool in orbit view, or E in walk mode. Both call `onpick`, which calls `selectCell`. | `world/WorldView.svelte`, `sandbox/selection.ts` |
| **Site Probe** | The panel that opens for a picked cell, or for typed-in values: an editable form of the 8 inputs with validation, the predicted cover type, probability bars, sensitivity bars and OOD warnings. | `apps/web/src/lib/probe/` |
| **Sensitivity bars** | How much each input moves the probabilities: `explainOne` nudges each input up and down by a step of its range and measures the shift. Counts as Role 3's explain function (decided 2026-11-18). | `model/engine.ts` (`explainOne`) |
| **Orbit view** | The Sandbox's top-down 3D view with a camera you orbit. Brush, picking and overlays live here. It draws only after a change (render on demand). | `apps/web/src/lib/world/scene.ts` |
| **Overlay** | What the terrain is colored by in orbit view: `terrain` (natural look with plants), `cover` (predicted class colors) or `confidence`. Low-trust cells can be shown on top. | `world/colors.ts` |
| **Walk mode** | Walking on the terrain at ground level, full-viewport, entered from the Sandbox (toggle, `V`, "Walk here"). The plants are the predicted classes. | `world/walk.ts`, `world/WalkHud.svelte` |
| **Walk HUD** | The on-screen layer in walk mode: minimap, compass, cell readout, exit button, touch joystick and the `P` performance readout. | `world/WalkHud.svelte` |
| **Walk info panel** | Opens on every exit from walk mode: the cell last stood on, what the picture means, herds and score, and walk settings. "Resume walking" returns to the same spot. | `sandbox/WalkPanel.svelte` |
| **Ambient backdrop** | The live, dimmed, ground-level view of the world behind every page. Its camera turns without end and it pauses only while walk mode covers the window. | `backdrop/WorldBackdrop.svelte`, `world/ambient.ts` |
| **Dim** | One flat black layer over the backdrop, `DIM_IDLE` 0.84 on every page and `DIM_WALK` 0 in walk mode. Chosen so text keeps 4.5:1 contrast on any frame. | `world/ambient.ts` |
| **Lease** | Which renderer draws: the backdrop draws on every page except during walk mode; the Sandbox view draws while it is on screen or walked in (`backdropLease`, `viewDraws`). | `world/ambient.ts` |
| **Day/night** | Cosmetic time of day: sky, sun and light colors. It is not the hillshade input and changes no prediction. | `world/daynight.ts` |
| **Quality preset** | `low`, `medium` (default) or `high`: draw distance, plant density, grass and shadows. The backdrop never goes above `low`. | `world/quality.ts` |
| **Frame-rate guard** | Watches the frame rate and reports when it stays under the target for several seconds, so the view can step down (the backdrop stops the day/night cycle first, then freezes to a still). | `world/quality.ts`, `world/ambient.ts` |
| **Forest patches** | Trees grow in small seeded clusters with open plains between them. The cover class still decides which shape grows. | `world/vegetation.ts` |
| **Photo mode** | `C` or the Photo button saves the current 3D view as a PNG, without the HUD. | `world/WorldView.svelte` |

## Herd simulation

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Ecology rules** | Hand-written herd-simulation assumptions (`ecology.json`). Not model output. | `packages/sim/herd` |
| **Herbivore / predator** | The two species. Herbivores graze plants that depend on the predicted cover; predators hunt herbivores. | `packages/sim/herd`, `docs/ecology-rules.md` |
| **Tick** | One fixed simulation step, `TICK_MS` 100 ms of wall time at full speed. The same seed and number of ticks always give the same state. | `packages/sim/herd/src/clock.ts` |
| **Sim clock** | Releases ticks at a chosen rate (`SimClock`), so the sim can be slowed down without changing what happens per tick. | `packages/sim/herd/src/clock.ts` |
| **Pose interpolation** | Animals are drawn between two ticks so they glide instead of jumping. Reduced motion snaps them to ticks. | `packages/sim/herd` (`interpolatePoses`) |
| **Animal pace / `paceScale`** | On the ground, the sim is slowed so animals move at about `ANIMAL_PACE` (0.9) × the walker's speed. `paceScale` is computed from the rules and only ever slows the sim down. | `apps/web/src/lib/world/pace.ts` |
| **Animal speed** | The viewer's choice on the ground: Match walker (default), 2×, 4×, full sim speed or paused (key `G`). Orbit view always runs at full speed. | settings store, `world/pace.ts` |
| **Rewilding score** | 0-100. Combines habitat diversity (how mixed the predicted cover is) with how stable each population has been over the last 200 ticks. | `packages/sim/herd/src/score.ts`, `docs/ecology-rules.md` |
