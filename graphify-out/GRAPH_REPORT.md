# Graph Report - project-graze  (2026-11-15)

## Corpus Check
- 171 files · ~129,776 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 1, .css 1)

## Summary
- 1562 nodes · 3619 edges · 75 communities (69 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 109 edges (avg confidence: 0.87)
- Token cost: 200,705 input · 0 output

## Community Hubs (Navigation)
- Herd Simulation Core
- WorldView Component & Quality
- ML Benchmarking & Heightmaps
- ML Training Config
- Build & Worker Config
- Covertype Dataset Loader
- Worlds Persistence API
- Sandbox Route
- Site Probe & Validation
- Model Inference Math
- Flora & Vegetation Meshes
- Network & Forest Models
- Feature Computation
- Model Worker Client
- World Save/Load IO
- Walk Mode Movement
- Scene Setup & Overlays
- Dataset Exploration
- Platform & Tooling Docs
- World Color Palette
- App Shell & Help
- Coordinates & Look Controls
- World Renderer
- Sim Panel Herd Bindings
- Settings Panel
- Feature Contract Docs
- Dataset & Model Card
- Data Splits & Leakage
- Engine & Generated Terrain
- Day/Night & Water
- Calibration & Final Eval
- Walk HUD
- Custom Design Guide
- World Mount & Sky
- ML Evaluation Protocol
- Share Codes
- Root TS Config
- Probability & Population Charts
- Prediction Session
- Hillshade & Sim State Notes
- Cell-World Coordinates
- ML Role Deliverables
- Role Deliverables D2-D13
- App & Sim Design Notes
- Web App & Model Files
- Model Card Parser
- Dirty-Rect Batcher
- Worlds API Docs
- World Role README
- Ecology Rules & Score
- World Backdrop Contract
- Sim Rules & Event Log
- OOD Detection Notes
- Fauna Meshes
- Sandbox Terrain Generator
- Sim Playback Controls
- Flora Lifecycle
- Web TS Config
- ML Pipeline Commands
- Cell Selection & Entry
- App State Design
- Features Package Manifest
- Sim TS Config
- Engine Prediction Functions
- ML TS Config
- Features TS Config
- Test TS Config
- Web Package Manifest
- FPS Guard
- ML Package Manifest
- Sim Package Manifest
- pnpm Workspace Config
- Sim Placeholder
- Docs Index

## God Nodes (most connected - your core abstractions)
1. `WorldRenderer` - 83 edges
2. `main()` - 33 edges
3. `TerrainSample` - 21 edges
4. `generateTerrain()` - 21 edges
5. `Project Graze README` - 20 edges
6. `svelte` - 19 edges
7. `sampleToVector()` - 18 edges
8. `Model Card: Habitat Classifier` - 18 edges
9. `createEngine()` - 17 edges
10. `parseModelJson()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Covertype dataset` --semantically_similar_to--> `Covertype dataset (UCI)`  [INFERRED] [semantically similar]
  docs/dataset-card.md → README.md
- `Rewilding score formula (score.ts)` --semantically_similar_to--> `Rewilding score`  [INFERRED] [semantically similar]
  docs/ecology-rules.md → README.md
- `ecology.json rules` --semantically_similar_to--> `Ecology rules`  [INFERRED] [semantically similar]
  docs/ecology-rules.md → GLOSSARY.md
- `CardInput` --references--> `TerrainSampleKey`  [EXTRACTED]
  apps/web/src/lib/model/modelCard.ts → packages/features/src/features.ts
- `sculpted()` --calls--> `generateTerrain()`  [EXTRACTED]
  apps/web/test/walk.test.ts → packages/sim/terrain/src/heightmap.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Terrain to cover-map prediction pipeline** — glossary_heightmap, glossary_terrain_inputs_module, glossary_packed_inputs, docs_feature_contract_worker_api, glossary_prediction_session, glossary_cover_map [INFERRED 0.85]
- **Models compared under the LOAO selection rule** — docs_model_card_softmax_model, docs_model_card_random_forest, docs_model_card_mlp, docs_model_card_elevation_band_rule, docs_model_card_majority_baseline [EXTRACTED 1.00]
- **Rewilding score components** — docs_ecology_rules_rewilding_score, docs_ecology_rules_habitat_diversity, docs_ecology_rules_population_stability, glossary_cover_map [EXTRACTED 1.00]
- **OOD low-trust signal from detector to UI and world** — docs_notes_ood_detector, docs_roles_ml_d6_ood_detector, docs_roles_world_ood_low_trust_vegetation, docs_roles_world_d5_overlays, docs_roles_app_and_sim_d13_walk_mode_safeguards [INFERRED 0.85]
- **Saved world save/load/share flow** — docs_worlds_api_savedworld, docs_worlds_api_post_api_worlds, docs_worlds_api_get_api_worlds_id, docs_worlds_api_opensavedworld, docs_worlds_api_offline_code, docs_worlds_api_share_link, docs_worlds_api_model_version_mismatch_repredict [EXTRACTED 1.00]
- **Honest evaluation protocol (LOAO, macro-F1, locked test, selection rule)** — docs_notes_loao_evaluation, docs_notes_macro_f1, docs_notes_lockedtestset, docs_notes_model_selection_rule, docs_notes_assertsplitsclean [EXTRACTED 1.00]

## Communities (75 total, 6 thin omitted)

### Community 0 - "Herd Simulation Core"
Cohesion: 0.06
Nodes (67): nextRandom(), Rng, seedToState(), checkClassArray(), checkNumber(), checkSpecies(), EcologyRules, HerbivoreRules (+59 more)

### Community 1 - "WorldView Component & Quality"
Cohesion: 0.04
Nodes (52): formatHour(), classOverlay(), DEFAULT_QUALITY, FPS_GRACE_SECONDS, LOW_FPS_SECONDS, lowerPreset(), minPreset(), ORDER (+44 more)

### Community 2 - "ML Benchmarking & Heightmaps"
Cohesion: 0.07
Nodes (43): inputs(), batch, cardPath, cpu, engine, explainRuns, features, inputOpts (+35 more)

### Community 3 - "ML Training Config"
Cohesion: 0.08
Nodes (42): forestBase, Grid, GRIDS, IMPORTANCE_REPEATS, IMPORTANCE_ROWS, MAX_TRAIN_ROWS, mlpBase, OOD_PERCENTILE (+34 more)

### Community 4 - "Build & Worker Config"
Cohesion: 0.05
Nodes (41): here, repoRoot, dependencies, hono@5.0.0-rc.1, svelte@^5.57.3, three@^0.187.0, devDependencies, cf@^1.0.0-beta.14 (+33 more)

### Community 5 - "Covertype Dataset Loader"
Cohesion: 0.07
Nodes (35): MODEL_VERSION, AREA_NAMES, BIN_PATH, CLASS_DISPLAY_LABELS, CLASS_NAMES, DATASET_CITATION, DATASET_DOI, DATASET_LICENSE (+27 more)

### Community 6 - "Worlds Persistence API"
Cohesion: 0.08
Nodes (33): EDIT_UNIT_M, editedCellCount(), isInt(), isObj(), isUnit(), MAX_EDIT_UNITS, MAX_WORLD_BYTES, newWorldId() (+25 more)

### Community 7 - "Sandbox Route"
Cohesion: 0.06
Nodes (35): band, busy, card, cells, codeCopied, codeInput, copied, copyCode() (+27 more)

### Community 8 - "Site Probe & Validation"
Cohesion: 0.10
Nodes (31): explainOne(), Prediction, Predictor, Sensitivity, SENSITIVITY_STEP_FRACTION, inputSpec(), ModelCard, emptyForm() (+23 more)

### Community 9 - "Model Inference Math"
Cohesion: 0.10
Nodes (31): modelPredictor(), activate(), Activation, dense(), ForestModel, isMat(), isNum(), isObj() (+23 more)

### Community 10 - "Flora & Vegetation Meshes"
Cohesion: 0.07
Nodes (33): Batch, FloraStats, Part, SILHOUETTES, tuftGeometry(), cellSlopeDeg(), CHUNK_CELLS, chunkInRange() (+25 more)

### Community 11 - "Network & Forest Models"
Cohesion: 0.14
Nodes (29): fitScaler(), Matrix, Scaler, permutationImportance(), createRng(), gaussian(), Rng, shuffle() (+21 more)

### Community 12 - "Feature Computation"
Cohesion: 0.15
Nodes (29): computeFeatures(), FEATURE_DIM, FEATURE_NAMES, FeatureName, FeatureRanges, FeatureValues, FeatureVector, isFiniteFeatureValues() (+21 more)

### Community 13 - "Model Worker Client"
Cohesion: 0.11
Nodes (24): baseUrl(), failAll(), modelStatus, pending, predictBatch(), predictOne(), request(), send() (+16 more)

### Community 14 - "World Save/Load IO"
Cohesion: 0.12
Nodes (27): errorMessage(), FetchLike, fetchWorld(), modelMismatchNotice(), Outcome, saveWorld(), probeOpen, terrainVersion (+19 more)

### Community 15 - "Walk Mode Movement"
Cohesion: 0.11
Nodes (27): canMove(), clamp(), COMPASS, compassPoint(), EDGE_MARGIN, EYE_HEIGHT, eyeY(), findSpawn() (+19 more)

### Community 16 - "Scene Setup & Overlays"
Cohesion: 0.10
Nodes (25): OverlayMode, VERTICAL_EXAGGERATION, ORBIT_ANIMAL_SCALE, WALK_ANIMAL_SCALE, BACKDROP_SEED, BrushSettings, CONTEXT_ATTRIBUTES, createContext() (+17 more)

### Community 17 - "Dataset Exploration"
Cohesion: 0.12
Nodes (25): at(), COL, COLUMN_NAMES, Dataset, N_COLUMNS, columnStats(), fitSun(), hillshadeError() (+17 more)

### Community 18 - "Platform & Tooling Docs"
Cohesion: 0.11
Nodes (24): cloudflare.config.ts bindings (cf/config), cf CLI (not wrangler), Hono CLI, Hono app on Cloudflare Workers, apps/web index.html, #app mount + /src/main.ts entry, computeFeatures / FEATURE_NAMES, Limitations Notice (+16 more)

### Community 19 - "World Color Palette"
Cohesion: 0.13
Nodes (24): ColorInputs, CONFIDENCE_HIGH, CONFIDENCE_LOW, confidenceColor(), hexToRgb01, NO_DATA, OOD_COLOR, RIVERBED (+16 more)

### Community 20 - "App Shell & Help"
Cohesion: 0.12
Nodes (17): onkeydown(), statusLabel, helpOpen, isTypingTarget(), closeBtn, groups, ModelStatus, parseHash() (+9 more)

### Community 21 - "Coordinates & Look Controls"
Cohesion: 0.14
Nodes (4): nearestCell(), worldToCell(), worldToCellF(), LookControls

### Community 23 - "Sim Panel Herd Bindings"
Cohesion: 0.08
Nodes (10): Props, rulesResult, running, score, seed, sim, simError, { size, cover, water, classes, mapVersion, worldKey, onposes } (+2 more)

### Community 24 - "Settings Panel"
Cohesion: 0.12
Nodes (18): { onclose }, Props, reducedMotion, resetSettings(), settings, systemReducedMotion, DEFAULT_SETTINGS, loadSettings() (+10 more)

### Community 25 - "Feature Contract Docs"
Cohesion: 0.12
Nodes (23): Debounced onHeightmapChange batcher, Vegetation placement (vegetation.ts), predictionState, 128x128 grid contract, heightmapToSamples, Hillshade formula (fitted SUN), Model output {classIndex, probs, ood}, OOD low-trust flag (detector or range check) (+15 more)

### Community 26 - "Dataset & Model Card"
Cohesion: 0.14
Nodes (22): Dataset Card: Covertype, Blackard (1998) Covertype citation, Blackard & Dean (2000) ANN vs discriminant analysis, Class imbalance (Lodgepole + Spruce/Fir ~85%), 7 cover-type classes, Covertype dataset, Excluded columns (soil, wilderness, roads, fire), Negative vertical distance to water (+14 more)

### Community 27 - "Data Splits & Leakage"
Cohesion: 0.18
Nodes (17): subSeed(), assertDisjoint(), assertSplitsClean(), Fold, hashIndices(), INNER_HOLDOUT_FRACTION, innerSplit(), LeakageError (+9 more)

### Community 28 - "Engine & Generated Terrain"
Cohesion: 0.15
Nodes (17): Engine, ElevationRange, GENERATED_SEEDS, generatedLandSamples(), generatedTerrainStudy(), generatedWorldInputs(), median(), ROLE1_DEFAULT_WORLD (+9 more)

### Community 29 - "Day/Night & Water"
Cohesion: 0.14
Nodes (16): advanceHour(), DAY_LENGTH_S, DayState, dayState(), KEYS, LIGHT, MIN_LIGHT_ALTITUDE, smoothstep() (+8 more)

### Community 30 - "Calibration & Final Eval"
Cohesion: 0.23
Nodes (15): oodScore(), fitTemperature(), rowToSample(), main(), OUT, argmaxRows(), CalibrationBin, calibrationBins() (+7 more)

### Community 31 - "Walk HUD"
Cohesion: 0.12
Nodes (16): WorldStats, base, cell, HELP, knob, mapCanvas, OOD, OOD_CSS (+8 more)

### Community 32 - "Custom Design Guide"
Cohesion: 0.12
Nodes (19): snapshotPoses / interpolateSnapshot (view.ts), Animal Body Animation (shader legs), Blender-to-glb Asset Pipeline, Checking Work (P readout, 5-toggle check), classTints (palette.ts), Custom 3D Designs and Textures for Walk Mode, Level C: Detailed Textures, Flora / Fauna instanced renderers (+11 more)

### Community 33 - "World Mount & Sky"
Cohesion: 0.13
Nodes (3): mountWorld(), SkyDome, WaterSurface

### Community 35 - "ML Evaluation Protocol"
Cohesion: 0.13
Nodes (15): assertSplitsClean Leakage Check, Leave-One-Wilderness-Area-Out (LOAO) Folds, LockedTestSet / splits.lock.json, Macro-F1 Metric, ML Working Notes (Role 3), Random Split (optimistic), Random-Split Smoke Test, Seeded PRNG (ml/src/lib/rng.ts) (+7 more)

### Community 36 - "Share Codes"
Cohesion: 0.18
Nodes (15): codeToJson(), deflate(), exportShareCode(), fromBase64Url(), ImportResult, importWorld(), inflate(), isShareCode() (+7 more)

### Community 37 - "Root TS Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, jsxImportSource, lib, module, moduleResolution (+7 more)

### Community 38 - "Probability & Population Charts"
Cohesion: 0.16
Nodes (9): { classes, probs, highlight }, CLASS_COLORS, classColor(), HERBIVORE_COLOR, PREDATOR_COLOR, WATER_RGB, canvas, { history, version } (+1 more)

### Community 39 - "Prediction Session"
Cohesion: 0.15
Nodes (9): BatchResult, CoverMap, createPredictionSession(), PredictBatch, PredictionSession, PredictionSnapshot, predictionStateOf(), PredictionState (+1 more)

### Community 40 - "Hillshade & Sim State Notes"
Cohesion: 0.14
Nodes (15): SUN (fitted sun positions in @graze/features), Hillshade: Our Method vs Dataset (D2), Without-Hillshade Ablation, applyMapChange, D10 Sim State for Ground-Scale Viewing, D2 Shared Features, D10 Day/Night Cycle (cosmetic), D11 Walk HUD and ML Tie-in (+7 more)

### Community 41 - "Cell-World Coordinates"
Cohesion: 0.32
Nodes (6): cellToWorldX(), cellToWorldZ(), Frame, heightToWorldY(), tintedMaterial(), sampleHeight()

### Community 42 - "ML Role Deliverables"
Cohesion: 0.15
Nodes (12): Dirty-Region Prediction Fallback, Measured Inference Latency (D10), D10 Inference Support for Walk Mode, D11 Model Versioning and Compatibility, D12 Documentation for the Walkable World, D4 Training and Comparison, D5 Evaluation, D8 Documentation (+4 more)

### Community 43 - "Role Deliverables D2-D13"
Cohesion: 0.14
Nodes (14): D11 Settings, Help, and Notices, D12 Worlds API (optional), D2 Inference Worker Integration, D3 Site Probe, D4 Model Report Page, D5 Herd Simulation, D7 Responsible Use Page, D9 Walk Mode Integration (+6 more)

### Community 44 - "App & Sim Design Notes"
Cohesion: 0.16
Nodes (13): computeFeatures, Role 2 Cut Order, 250 ms Debounce with Sequence Check, Elevation Band Slider (40% default), heightmapToInputs (@graze/features), Herd Simulation (not ML), Inference Web Worker, Known Gaps and Risks (+5 more)

### Community 45 - "Web App & Model Files"
Cohesion: 0.23
Nodes (13): apps/web README, Inference modules (engine/worker/loader), model.json and model_card.json (public/model), Stub model predictor (ALLOW_STUB_MODEL), mountWorld backdrop, Feature Contract, explainOne local sensitivity, Role hand-off points (+5 more)

### Community 46 - "Model Card Parser"
Cohesion: 0.23
Nodes (12): CardInput, CardResult, Evaluation, isNum(), isNumArray(), isObj(), isStr(), isStrArray() (+4 more)

### Community 47 - "Dirty-Rect Batcher"
Cohesion: 0.27
Nodes (4): defaultTimers, DirtyRectBatcher, Timers, DirtyRect

### Community 48 - "Worlds API Docs"
Cohesion: 0.26
Nodes (13): D13 Save, Load, and Share World, D1 worlds table (0001_create_worlds.sql), GET /api/worlds/:id, Hono Worker (src/index.ts), Offline Code graze1., POST /api/worlds, SavedWorld format (packages/worlds), Share Link #/world/<id> (+5 more)

### Community 49 - "World Role README"
Cohesion: 0.20
Nodes (10): World (Role 1) README, Cosmetic day/night cycle, getGroundHeight (bilinear), palette.ts (all world colors), Quality presets and frame-rate guard, Offline share code (share.ts), 2x vertical exaggeration, Walk mode (+2 more)

### Community 50 - "Ecology Rules & Score"
Cohesion: 0.27
Nodes (12): Ecology Rules, applyMapChange terrain-edit handling, ecology.json rules, Habitat diversity D (Shannon entropy), Population stability S (1 - CV), Rewilding score formula (score.ts), Seeded PRNG determinism, Tick order (regrow, herbivores, predators, log) (+4 more)

### Community 51 - "World Backdrop Contract"
Cohesion: 0.22
Nodes (6): host, loaded, worldModules, WorldHandle, WorldModule, WorldMountOptions

### Community 52 - "Sim Rules & Event Log"
Cohesion: 0.18
Nodes (4): { events, version }, recent, { rules, classes }, speciesRows

### Community 53 - "OOD Detection Notes"
Cohesion: 0.18
Nodes (10): isOOD (ml/src/ood.ts), OOD Detector standardized-distance (D6), OOD_PERCENTILE (99th), Open Questions for Humans, D13 Content and Safeguards for Walk Mode, explainOne ±10% Perturbation Sensitivity, validateForm two-tier validation, D6 Out-of-Distribution Detector (+2 more)

### Community 54 - "Fauna Meshes"
Cohesion: 0.36
Nodes (5): box(), Fauna, herbivoreGeometry(), merge(), predatorGeometry()

### Community 55 - "Sandbox Terrain Generator"
Cohesion: 0.33
Nodes (6): CELL_SIZE_M, generateHeightmap(), GRID, quantile(), scaleHeightmap(), valueNoise()

### Community 56 - "Sim Playback Controls"
Cohesion: 0.39
Nodes (9): clearSim(), emit(), frame(), passableFromWater(), pause(), play(), reset(), snap() (+1 more)

### Community 58 - "Web TS Config"
Cohesion: 0.22
Nodes (8): compilerOptions, lib, noEmit, resolveJsonModule, types, extends, include, ../../tsconfig.json

### Community 59 - "ML Pipeline Commands"
Cohesion: 0.28
Nodes (9): D9 model freeze / locked test set, Generated-terrain low-trust rates, ml/ Training Pipeline README, pnpm ml:bench (latency), pnpm ml:evaluate-final, pnpm ml:explore (exploration.json), pnpm ml:fetch, pnpm ml:generated-ood (+1 more)

### Community 60 - "Cell Selection & Entry"
Cohesion: 0.25
Nodes (5): *.svelte, CellSelection, selectedCell, target, svelte

### Community 61 - "App State Design"
Cohesion: 0.36
Nodes (8): App State, View Modes and Sim View, pick(x, y) selection event, settings store (localStorage graze.settings.v1), One shared app state (stores), Separate sim and render clocks, snapshotPoses / interpolateSnapshot (view.ts), viewMode store (orbit/walk), WorldView props contract

### Community 62 - "Features Package Manifest"
Cohesion: 0.25
Nodes (7): exports, ./package.json, name, private, type, types, version

### Community 63 - "Sim TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, resolveJsonModule, types, extends, include, ../../tsconfig.json

### Community 64 - "Engine Prediction Functions"
Cohesion: 0.52
Nodes (7): createEngine(), explainOne(), outOfRange(), predictBatch(), predictOne(), explainSentence(), argmax()

### Community 65 - "ML TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, extends, include, ../tsconfig.json

### Community 66 - "Features TS Config"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, extends, include, ../../tsconfig.json

### Community 67 - "Test TS Config"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../tsconfig.json

### Community 68 - "Web Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 70 - "ML Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 71 - "Sim Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 72 - "pnpm Workspace Config"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, workerd, onlyBuiltDependencies

## Knowledge Gaps
- **64 isolated node(s):** `../../tsconfig.json`, `../tsconfig.json`, `../../tsconfig.json`, `../../tsconfig.json`, `../tsconfig.json` (+59 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 502 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Role 2: App and Sim` connect `Role Deliverables D2-D13` to `Hillshade & Sim State Notes`, `App & Sim Design Notes`, `OOD Detection Notes`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **What connects `../../tsconfig.json`, `../tsconfig.json`, `../../tsconfig.json` to the rest of the system?**
  _64 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Herd Simulation Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06263173742848539 - nodes in this community are weakly interconnected._
- **Why does `D9 Walk Mode Integration` connect `Role Deliverables D2-D13` to `Prediction Session`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Should `WorldView Component & Quality` be split into smaller, more focused modules?**
  _Cohesion score 0.04067796610169491 - nodes in this community are weakly interconnected._
- **Why does `apps/web README` connect `Web App & Model Files` to `Site Probe & Validation`, `Ecology Rules & Score`, `Platform & Tooling Docs`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Should `ML Benchmarking & Heightmaps` be split into smaller, more focused modules?**
  _Cohesion score 0.06641604010025062 - nodes in this community are weakly interconnected._