# Graph Report - project-graze  (2026-11-18)

## Corpus Check
- 180 files · ~152,503 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 1, .css 1)

## Summary
- 1788 nodes · 4201 edges · 83 communities (78 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 156 edges (avg confidence: 0.87)
- Token cost: 236,822 input · 0 output

## Community Hubs (Navigation)
- Sim Clock & Herd Rules
- ML Bench & Generated Terrain
- WorldView Controls
- World Backdrop Component
- Sandbox Route
- Root Package & Config
- Covertype Dataset Loader
- Shared Feature Contract
- Predictor & Inference
- Settings Store
- Glossary Concepts
- Scaler & Model Utilities
- Ambient Backdrop Rules
- Sim Panel Herd Bindings
- WorldRenderer Core
- World Mount & Leases
- Walk Info Panel
- Training Metrics Loop
- Cell Selection & App State
- Renderer Motion & FPS Guard
- Site Probe Form
- Model Worker Client
- App Shell & Help
- Sky Water Lifecycle
- Saved World Format
- Vegetation Placement Tests
- Walk HUD
- ML Config Grids
- Cell World Coordinates
- Day/Night & Palette
- Fauna Meshes
- App State Contract Docs
- Role 2 App & Sim Docs
- Data Splits
- Agents & Repo Conventions
- Flora Meshes
- Vegetation Tints & Grass
- Worlds DB Layer
- Prediction Session
- Ecology Rules Docs
- Model File Loader
- Dataset Card
- ML Working Notes
- Calibration & Metrics
- OOD & Calibration Concepts
- Walk Look Controls
- Share Codes
- TS Compiler Config
- Charts & Class Palette
- World Save/Load IO
- Model Card Parser
- Dirty-Rect Batcher
- Overlay Colors
- World Renderer Docs
- Worlds API Docs
- World Round 2 Deliverables
- Terrain Material
- Model Card Evaluation
- Data Exploration & Sun Fit
- Web App README
- Herd Event Log & Rules
- OOD Responsible Use
- Feature Sets & Columns
- Sim Panel Playback
- Flora Lifecycle
- Model Export & Versioning
- Web TS Config
- Features Package Manifest
- Sim TS Config
- Inference Engine
- ML TS Config
- Finalization Decisions
- Inference Latency & Class Order
- Features TS Config
- Test TS Config
- Web Package Manifest
- Shared Features & Hillshade
- ML Package Manifest
- Sim Package Manifest
- pnpm Workspace
- Animal Pace Meter
- Site Probe & Sensitivity
- Sim Placeholder

## God Nodes (most connected - your core abstractions)
1. `WorldRenderer` - 99 edges
2. `main()` - 33 edges
3. `AmbientBackdrop` - 24 edges
4. `svelte` - 22 edges
5. `TerrainSample` - 21 edges
6. `generateTerrain()` - 21 edges
7. `Role 1: World` - 20 edges
8. `sampleToVector()` - 18 edges
9. `createEngine()` - 17 edges
10. `parseModelJson()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `explainOne local sensitivity (+/-10% range)` --semantically_similar_to--> `Sensitivity bars`  [INFERRED] [semantically similar]
  docs/feature-contract.md → GLOSSARY.md
- `In-app educational-simulation notice` --semantically_similar_to--> `Responsible use and limitations`  [INFERRED] [semantically similar]
  docs/limitations.md → README.md
- `Relative-path imports instead of workspace` --semantically_similar_to--> `No pnpm packages workspace`  [INFERRED] [semantically similar]
  packages/features/README.md → README.md
- `sampleHeight bilinear ground height` --semantically_similar_to--> `walk.ts getGroundHeight`  [INFERRED] [semantically similar]
  docs/app-state.md → apps/web/src/lib/world/README.md
- `CardInput` --references--> `TerrainSampleKey`  [EXTRACTED]
  apps/web/src/lib/model/modelCard.ts → packages/features/src/features.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Shared preprocessing prevents train/inference drift** — packages_features_readme_graze_features, glossary_terrain_inputs_module, readme_why_typescript, docs_feature_contract_heightmap_to_inputs_formulas, docs_feature_contract_deleted_drifted_copies [INFERRED 0.85]
- **Save and share world flow** — glossary_saved_world, docs_worlds_api_saved_world_format, docs_worlds_api_post_worlds, docs_worlds_api_get_world, docs_worlds_api_offline_code, apps_web_src_lib_world_readme_share_ts [INFERRED 0.85]
- **Model evaluation and selection protocol** — glossary_loao, glossary_selection_rule, glossary_macro_f1, glossary_locked_test_set, glossary_freeze, readme_softmax_selected [INFERRED 0.85]
- **Low-trust (OOD) signal from detector to world rendering** — docs_notes_standardized_distance_detector, docs_model_card_ood_flag, docs_roles_world_overlays, docs_roles_world_ood_vegetation, docs_model_card_generated_terrain_ood_rate [INFERRED 0.85]
- **Shared train/serve preprocessing via @graze/features** — docs_model_card_heightmaptoinputs, docs_roles_app_and_sim_notes_computefeatures, docs_notes_hillshade_method, docs_roles_ml_shared_features [INFERRED 0.85]
- **Honest model selection (LOAO, macro-F1, pre-registered rule)** — docs_model_card_loao_evaluation, docs_model_card_macro_f1, docs_model_card_selection_rule, docs_notes_model_selection_rule, docs_notes_splits [INFERRED 0.85]

## Communities (83 total, 5 thin omitted)

### Community 0 - "Sim Clock & Herd Rules"
Cohesion: 0.05
Nodes (78): MAX_TICKS_PER_ADVANCE, median(), medianMoveCells(), medianMovingSpeed(), moveDistances(), SimClock, TICK_MS, tickGapMs() (+70 more)

### Community 1 - "ML Bench & Generated Terrain"
Cohesion: 0.05
Nodes (57): patchWeight(), world(), batch, cardPath, cpu, engine, explainRuns, features (+49 more)

### Community 2 - "WorldView Controls"
Cohesion: 0.04
Nodes (53): advanceHour(), formatHour(), wrapHour(), animalSpeedLabel(), nextAnimalSpeed(), classOverlay(), lowerPreset(), classColors (+45 more)

### Community 3 - "World Backdrop Component"
Cohesion: 0.07
Nodes (26): dim, handle, host, lease, loaded, presence, stats, walking (+18 more)

### Community 4 - "Sandbox Route"
Cohesion: 0.04
Nodes (39): band, busy, card, cells, codeCopied, codeInput, copied, copyCode() (+31 more)

### Community 5 - "Root Package & Config"
Cohesion: 0.05
Nodes (42): here, repoRoot, dependencies, hono@5.0.0-rc.1, svelte@^5.57.3, three@^0.187.0, devDependencies, cf@^1.0.0-beta.14 (+34 more)

### Community 6 - "Covertype Dataset Loader"
Cohesion: 0.08
Nodes (33): MODEL_VERSION, BIN_PATH, CLASS_DISPLAY_LABELS, CLASS_NAMES, DATASET_CITATION, DATASET_DOI, DATASET_LICENSE, DATASET_PAGE (+25 more)

### Community 7 - "Shared Feature Contract"
Cohesion: 0.13
Nodes (34): inputs(), samplesMatrix(), computeFeatures(), FEATURE_DIM, FEATURE_NAMES, FeatureName, FeatureRanges, FeatureValues (+26 more)

### Community 8 - "Predictor & Inference"
Cohesion: 0.09
Nodes (33): modelPredictor(), Predictor, activate(), Activation, dense(), ForestModel, isMat(), isNum() (+25 more)

### Community 9 - "Settings Store"
Cohesion: 0.08
Nodes (31): { onclose, embedded = false }, Props, reducedMotion, resetSettings(), settings, systemReducedMotion, DEFAULT_SETTINGS, inRange() (+23 more)

### Community 10 - "Glossary Concepts"
Cohesion: 0.08
Nodes (34): explainOne local sensitivity (+/-10% range), Heightmap to raw inputs formulas, explainOne counts as Role 3 explain (decided), Ambient backdrop, Brush (sparse delta edits), Cell (30 m, index y*size+x), Class weighting (sqrt-balanced), Covertype dataset (+26 more)

### Community 11 - "Scaler & Model Utilities"
Cohesion: 0.14
Nodes (29): fitScaler(), Matrix, Scaler, permutationImportance(), createRng(), gaussian(), Rng, shuffle() (+21 more)

### Community 12 - "Ambient Backdrop Rules"
Cohesion: 0.09
Nodes (32): AMBIENT_FPS_CAP, AMBIENT_MAX_DT_S, AMBIENT_MIN_FPS, AMBIENT_PITCH, AMBIENT_QUALITY, AMBIENT_TURN_S, AMBIENT_YAW_RATE_DEG_S, ambientQuality() (+24 more)

### Community 13 - "Sim Panel Herd Bindings"
Cohesion: 0.06
Nodes (16): HerdSummary, clock, fullRate, pace, Props, rate, rulesResult, running (+8 more)

### Community 14 - "WorldRenderer Core"
Cohesion: 0.13
Nodes (3): QualityPreset, WorldRenderer, eyeY()

### Community 15 - "World Mount & Leases"
Cohesion: 0.09
Nodes (29): backdropLease(), DimState, stepAmbientClock(), OverlayMode, mountWorld(), DEFAULT_QUALITY, FPS_GRACE_SECONDS, LOW_FPS_SECONDS (+21 more)

### Community 16 - "Walk Info Panel"
Cohesion: 0.09
Nodes (30): CONTROLS, dialog, { exit, herd, animalSpeed, cellSizeM, canResume, onresume, onclose }, focusable(), onkeydown(), Props, REASON, resumeBtn (+22 more)

### Community 17 - "Training Metrics Loop"
Cohesion: 0.15
Nodes (31): rowToSample(), roundForest(), buildMatrix(), labelsOf(), subSeed(), addConfusion(), calibrationBins(), Metrics (+23 more)

### Community 18 - "Cell Selection & App State"
Cohesion: 0.14
Nodes (24): *.svelte, CellSelection, selectedCell, terrainVersion, ViewMode, viewMode, worldConfig, DEFAULT_WORLD (+16 more)

### Community 20 - "Site Probe Form"
Cohesion: 0.13
Nodes (25): explainOne(), inputSpec(), ModelCard, emptyForm(), formatNumber(), FormValues, parseField(), sampleToForm() (+17 more)

### Community 21 - "Model Worker Client"
Cohesion: 0.13
Nodes (20): baseUrl(), failAll(), modelStatus, pending, predictBatch(), predictOne(), request(), send() (+12 more)

### Community 22 - "App Shell & Help"
Cohesion: 0.11
Nodes (18): onkeydown(), statusLabel, helpOpen, isTypingTarget(), closeBtn, groups, ModelStatus, parseHash() (+10 more)

### Community 23 - "Sky Water Lifecycle"
Cohesion: 0.09
Nodes (3): DayState, SkyDome, WaterSurface

### Community 24 - "Saved World Format"
Cohesion: 0.13
Nodes (19): EDIT_UNIT_M, editedCellCount(), isInt(), isObj(), isUnit(), MAX_EDIT_UNITS, MAX_WORLD_BYTES, newWorldId() (+11 more)

### Community 25 - "Vegetation Placement Tests"
Cohesion: 0.11
Nodes (19): desaturate(), luminance(), countPlants(), OOD_DENSITY, PATCH_DENSITY, PATCH_RADIUS_MAX, PATCH_RADIUS_MIN, patchDensity() (+11 more)

### Community 26 - "Walk HUD"
Cohesion: 0.09
Nodes (20): WorldStats, compassPoint(), readCell(), WADE_DEPTH_M, base, cell, HELP, knob (+12 more)

### Community 27 - "ML Config Grids"
Cohesion: 0.10
Nodes (20): forestBase, Grid, GRIDS, IMPORTANCE_REPEATS, IMPORTANCE_ROWS, MAX_TRAIN_ROWS, mlpBase, OOD_PERCENTILE (+12 more)

### Community 28 - "Cell World Coordinates"
Cohesion: 0.20
Nodes (12): hexToRgb01, cellToWorldX(), cellToWorldZ(), Frame, heightToWorldY(), nearestCell(), worldToCell(), worldToCellF() (+4 more)

### Community 29 - "Day/Night & Palette"
Cohesion: 0.13
Nodes (19): TERRAIN_STOPS, DAY_LENGTH_S, dayState(), KEYS, LIGHT, linearKeys(), MIN_LIGHT_ALTITUDE, smoothstep() (+11 more)

### Community 30 - "Fauna Meshes"
Cohesion: 0.15
Nodes (15): animalMatrix(), AnimalSlot, BODY_BOB, box(), Fauna, FULL_STRIDE_SPEED, herbivoreGeometry(), Herd (+7 more)

### Community 31 - "App State Contract Docs"
Cohesion: 0.11
Nodes (17): walk.ts getGroundHeight, pick(x, y) single selection event, sampleHeight bilinear ground height, One shared app state (lib/state), snapshotPoses / interpolateSnapshot (view.ts), viewMode store, worldConfig store, WorldView props contract (+9 more)

### Community 32 - "Role 2 App & Sim Docs"
Cohesion: 0.12
Nodes (15): Design style (monospace, near-black, muted teal), Herd simulation and predator (D5, D6), Model Report page (D4), ecology.json, Known gaps and risks, Terrain to prediction pipeline, Rewilding score, Role 2 notes: App and Sim (+7 more)

### Community 33 - "Data Splits"
Cohesion: 0.17
Nodes (16): Dataset, N_COLUMNS, assertDisjoint(), assertSplitsClean(), hashIndices(), INNER_HOLDOUT_FRACTION, innerSplit(), LeakageError (+8 more)

### Community 34 - "Agents & Repo Conventions"
Cohesion: 0.15
Nodes (10): Hono app on Cloudflare Workers (src/index.ts), FEATURE_NAMES, Reviewer gate for features.ts and eval scripts, Elevation-band baseline rule, Terrain-to-habitat classifier, Project Graze rewilding sandbox, Random forest, Small MLP (+2 more)

### Community 35 - "Flora Meshes"
Cohesion: 0.10
Nodes (15): Batch, FloraStats, GRASS_SWAY, Part, PLANT_SWAY, SILHOUETTES, SwayUniforms, tuftGeometry() (+7 more)

### Community 36 - "Vegetation Tints & Grass"
Cohesion: 0.12
Nodes (19): cellSlopeDeg(), CLASS_TINTS, GRASS, GRASS_DRY, GRASS_RADIUS, GrassInput, LOW_TRUST_GREY, MAX_PLANT_SLOPE (+11 more)

### Community 37 - "Worlds DB Layer"
Cohesion: 0.16
Nodes (13): SavedWorld, StoredWorld, WORLD_SCHEMA_VERSION, ensureSchema(), findWorld(), insertWorld(), ready, WORLDS_SCHEMA_SQL (+5 more)

### Community 38 - "Prediction Session"
Cohesion: 0.15
Nodes (9): BatchResult, CoverMap, createPredictionSession(), PredictBatch, PredictionSession, PredictionSnapshot, predictionStateOf(), PredictionState (+1 more)

### Community 39 - "Ecology Rules Docs"
Cohesion: 0.14
Nodes (15): predictionState (loading/predicting/ready/unavailable/failed), Seeded PRNG determinism, ecology.json rules file, Per-class food capacity and regrowth, Habitat diversity (Shannon entropy), Population stability (presence x (1-CV)), Rewilding score formula (diversity + stability), Terrain edits handling (applyMapChange) (+7 more)

### Community 40 - "Model File Loader"
Cohesion: 0.18
Nodes (11): MODEL_BASE_PATH, MODEL_CARD_JSON, MODEL_JSON, FetchJson, fetchJsonOrThrow(), loadCard(), loadEngine(), LoadOutcome (+3 more)

### Community 41 - "Dataset Card"
Cohesion: 0.14
Nodes (10): Blackard (1998) Covertype citation, Blackard & Dean (2000) comparative accuracies, Class imbalance (~85% two classes), Odd values (aspect 0/360, negative vertical distance), Seven cover type classes, Spatial correlation limit, Four wilderness areas (Rawah, Neota, Comanche Peak, Cache la Poudre), PREDICTION_NOTICE (+2 more)

### Community 42 - "ML Working Notes"
Cohesion: 0.16
Nodes (15): assertSplitsClean leakage check, LockedTestSet / splits.lock.json, ML working notes (Role 3), Random-split smoke test before rule freeze, Single seeded PRNG (ml/src/lib/rng.ts), Splits: locked final test, random 80/20, LOAO folds (D3), docs/feature-contract.md, Seeded mulberry32 sim determinism (+7 more)

### Community 43 - "Calibration & Metrics"
Cohesion: 0.28
Nodes (12): oodScore(), fitTemperature(), main(), argmaxRows(), CalibrationBin, confusionMatrix(), evaluate(), logLoss() (+4 more)

### Community 44 - "OOD & Calibration Concepts"
Cohesion: 0.12
Nodes (13): Standardized-distance OOD, Calibration / temperature scaling, Low trust rendering, model.json, Out-of-distribution (OOD) detector, calibration.ts temperature scaling, export.ts model.json writer, importance.ts permutation importance (+5 more)

### Community 46 - "Share Codes"
Cohesion: 0.18
Nodes (15): codeToJson(), deflate(), exportShareCode(), fromBase64Url(), ImportResult, importWorld(), inflate(), isShareCode() (+7 more)

### Community 47 - "TS Compiler Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, jsxImportSource, lib, module, moduleResolution (+7 more)

### Community 48 - "Charts & Class Palette"
Cohesion: 0.16
Nodes (9): { classes, probs, highlight }, CLASS_COLORS, classColor(), HERBIVORE_COLOR, PREDATOR_COLOR, WATER_RGB, canvas, { history, version } (+1 more)

### Community 49 - "World Save/Load IO"
Cohesion: 0.18
Nodes (13): load(), loadCode(), loadFromInput(), openWorld(), save(), errorMessage(), FetchLike, fetchWorld() (+5 more)

### Community 50 - "Model Card Parser"
Cohesion: 0.23
Nodes (12): CardInput, CardResult, Evaluation, isNum(), isNumArray(), isObj(), isStr(), isStrArray() (+4 more)

### Community 51 - "Dirty-Rect Batcher"
Cohesion: 0.27
Nodes (4): defaultTimers, DirtyRectBatcher, Timers, DirtyRect

### Community 52 - "Overlay Colors"
Cohesion: 0.23
Nodes (12): ColorInputs, CONFIDENCE_HIGH, CONFIDENCE_LOW, confidenceColor(), NO_DATA, OOD_COLOR, RIVERBED, ROCK (+4 more)

### Community 53 - "World Renderer Docs"
Cohesion: 0.17
Nodes (8): Forest patches (D21), palette.ts (every world color), PointerLockControls / LookControls, quality.ts presets and frame-rate guard, Render on demand in orbit view, vegetation.ts plant placement, WebGL 2 required, WorldRenderer (scene.ts)

### Community 54 - "Worlds API Docs"
Cohesion: 0.21
Nodes (9): share.ts offline share code, Rate-limit namespace placeholder '1001', D1 worlds table schema, Sparse [gap, change] edits encoding, In-memory SQLite D1 stand-in tests, GET /api/worlds/:id, Model version mismatch re-prediction, POST /api/worlds (+1 more)

### Community 55 - "World Round 2 Deliverables"
Cohesion: 0.23
Nodes (10): Backdrop camera never stops rotating (D19), Custom .glb models (D17, dropped), Walk-mode performance measurements, OOD cells render sparse and desaturated, Performance and quality presets (D12), Role 1: World, Sparse trees: clustered forest patches (D21), three.js 0.187.0 library version notes (+2 more)

### Community 56 - "Terrain Material"
Cohesion: 0.20
Nodes (11): VERTICAL_EXAGGERATION, createTerrainMaterial(), DETAIL_SIZE, DETAIL_STRENGTH, DETAIL_TILE, DIRT_SLOPE, groundDetailPixels(), groundDetailTexture() (+3 more)

### Community 57 - "Model Card Evaluation"
Cohesion: 0.26
Nodes (10): Feature ablations (hillshade, water distances, all features), Covertype dataset (Blackard 1998, CC BY 4.0), Model limitations, Macro-F1 metric, Model card: Project Graze habitat classifier, Permutation feature importance, Softmax regression habitat classifier, Temperature scaling calibration (+2 more)

### Community 58 - "Data Exploration & Sun Fit"
Cohesion: 0.32
Nodes (11): AREA_NAMES, at(), N_AREAS, columnStats(), fitSun(), hillshadeError(), main(), quantiles() (+3 more)

### Community 59 - "Web App README"
Cohesion: 0.18
Nodes (9): #app mount and /src/main.ts entry, Footer.svelte notice, src/lib/model inference modules, Hash router (router.ts), Herd sim UI (src/lib/sim), Stub fake predictor (ALLOW_STUB_MODEL), Svelte 5 + Vite static app, In-app educational-simulation notice (+1 more)

### Community 60 - "Herd Event Log & Rules"
Cohesion: 0.18
Nodes (4): { events, version }, recent, { rules, classes }, speciesRows

### Community 61 - "OOD Responsible Use"
Cohesion: 0.24
Nodes (10): Generated-terrain low-trust rate (~12%), Out-of-distribution low-trust flag (detector or range check), isOOD (ml/src/ood.ts), standardized-distance OOD detector (99th percentile), Responsible ML issue-to-safeguard mapping, Content and safeguards for walk mode (D13), D6 Out-of-distribution detector, D12 Documentation for the walkable world (+2 more)

### Community 62 - "Feature Sets & Columns"
Cohesion: 0.18
Nodes (8): COL, COLUMN_NAMES, EXTRA_COLS, FEATURE_SETS, FeatureSet, FeatureSetName, HILLSHADE, WATER

### Community 63 - "Sim Panel Playback"
Cohesion: 0.33
Nodes (10): clearSim(), emit(), frame(), passableFromWater(), pause(), play(), reset(), snap() (+2 more)

### Community 65 - "Model Export & Versioning"
Cohesion: 0.24
Nodes (9): Model changelog, model_card.json, model.json, modelVersion / schemaVersion versioning and saved-world compatibility, Worker API announcement (D7, D10), Worlds API (Hono + D1) (D12), D7 Export (model.json, model_card.json, fixtures), D11 Model versioning and compatibility (+1 more)

### Community 66 - "Web TS Config"
Cohesion: 0.22
Nodes (8): compilerOptions, lib, noEmit, resolveJsonModule, types, extends, include, ../../tsconfig.json

### Community 67 - "Features Package Manifest"
Cohesion: 0.25
Nodes (7): exports, ./package.json, name, private, type, types, version

### Community 68 - "Sim TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, resolveJsonModule, types, extends, include, ../../tsconfig.json

### Community 69 - "Inference Engine"
Cohesion: 0.52
Nodes (7): createEngine(), explainOne(), outOfRange(), predictBatch(), predictOne(), explainSentence(), argmax()

### Community 70 - "ML TS Config"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, types, extends, include, ../tsconfig.json

### Community 71 - "Finalization Decisions"
Cohesion: 0.33
Nodes (4): Custom models dropped, Hand checks (pointer lock, 30fps, plant classes), Cell picking 3D view only (decided), pnpm ml:evaluate-final

### Community 72 - "Inference Latency & Class Order"
Cohesion: 0.40
Nodes (5): classDisplayLabels, Dirty-region re-prediction fallback, Measured inference latency (pnpm ml:bench), D10 Inference support for walk mode, Brush with debounced onHeightmapChange (D3)

### Community 73 - "Features TS Config"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, extends, include, ../../tsconfig.json

### Community 74 - "Test TS Config"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../tsconfig.json

### Community 75 - "Web Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 76 - "Shared Features & Hillshade"
Cohesion: 0.50
Nodes (3): heightmapToInputs (@graze/features), computeFeatures (@graze/features), D2 Shared features (packages/features)

### Community 77 - "ML Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 78 - "Sim Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 79 - "pnpm Workspace"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, workerd, onlyBuiltDependencies

### Community 81 - "Site Probe & Sensitivity"
Cohesion: 0.50
Nodes (4): Open questions for humans (D7 explain, D9 freeze), Perturbation sensitivity (±10% of range), Site Probe (D3), Cell picking (onpick, D4)

## Knowledge Gaps
- **66 isolated node(s):** `../../tsconfig.json`, `../tsconfig.json`, `../../tsconfig.json`, `../../tsconfig.json`, `../tsconfig.json` (+61 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 582 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `pick(x, y) single selection event` connect `App State Contract Docs` to `WorldView Controls`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **What connects `../../tsconfig.json`, `../tsconfig.json`, `../../tsconfig.json` to the rest of the system?**
  _66 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Sim Clock & Herd Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.052525252525252523 - nodes in this community are weakly interconnected._
- **Why does `WorldRenderer` connect `WorldRenderer Core` to `Flora Lifecycle`, `WorldView Controls`, `World Backdrop Component`, `Ambient Backdrop Rules`, `Walk Look Controls`, `World Mount & Leases`, `Walk Info Panel`, `Dirty-Rect Batcher`, `Overlay Colors`, `Renderer Motion & FPS Guard`, `Sky Water Lifecycle`, `Terrain Material`, `Cell World Coordinates`, `Fauna Meshes`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Should `ML Bench & Generated Terrain` be split into smaller, more focused modules?**
  _Cohesion score 0.05359937402190924 - nodes in this community are weakly interconnected._
- **Why does `svelte` connect `Cell Selection & App State` to `WorldView Controls`, `World Backdrop Component`, `Sandbox Route`, `Root Package & Config`, `Prediction Session`, `Settings Store`, `Ambient Backdrop Rules`, `Sim Panel Herd Bindings`, `Walk Info Panel`, `Site Probe Form`, `Model Worker Client`, `App Shell & Help`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Should `WorldView Controls` be split into smaller, more focused modules?**
  _Cohesion score 0.04180790960451977 - nodes in this community are weakly interconnected._