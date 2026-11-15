# Graph Report - project-graze  (2026-11-15)

## Corpus Check
- 40 files · ~154,300 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1891 nodes · 4221 edges · 94 communities (89 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 102 edges (avg confidence: 0.86)
- Token cost: 90,460 input · 0 output

## Community Hubs (Navigation)
- World Renderer Lifecycle
- Sandbox Route
- App Router & Shell
- WorldView & Animal Pace
- Build & Worker Config
- Dirty-Rect Batcher
- Site Probe Inputs
- Covertype Dataset Loader
- Network & Forest Models
- Overlay Colors & Coords
- Model Worker Client
- Settings Panel
- Sim Panel Herd Bindings
- Ambient Backdrop Camera
- Seeded RNG & Sim Core
- Cell Selection & Env Types
- ML Training Loop
- Vegetation Placement
- Model Card Parser
- Predictor & OOD Score
- Walk Vantage Finder
- ML Benchmarking
- Inference Engine
- Dataset Exploration
- Site Probe Explain
- Confidence Colors
- Fauna Meshes
- Data Splits & Leakage
- World Backdrop Contract
- Models Check Script
- Terrain & Prediction Glossary
- Sim Clock
- App Shell & Help
- GLB Validation Budgets
- Walk HUD Stats
- ML Training Config
- World Backdrop Component
- Sky & Palette
- Herd Package API
- Flora Meshes
- Custom Design Guide
- Probability & Population Charts
- Engine Prediction Functions
- Share Codes
- App & Sim Deliverables
- Root TS Config
- Walk Exit Panel
- Backdrop Column Dimming
- Web TS Config
- Sim Rules Validation
- Web App & Model Files
- Day/Night Cycle
- Custom Model Rules
- Limitations & Model Card
- Hillshade & Sun Notes
- App & Sim Design Notes
- Calibration & Final Eval
- Model Credits & Asset Rule
- Dataset Card & Citations
- LOAO Folds & Locked Test
- World Role README
- Ecology Rules & Score Docs
- Role 2 Walk Changes
- Day/Night & D12 Docs
- Worlds API Docs
- Rewilding Score
- Models Manifest Slots
- Herd Store & Event Log
- Quality Presets
- Sim Playback Controls
- ML Pipeline Commands
- Project Platform Overview
- Sandbox Terrain Generator
- Pace Meter
- World Deliverables D4-D13
- Features Package Manifest
- Sim TS Config
- World Handle API
- App State Design
- OOD Detection Notes
- ML Validation Overview
- Web Entry & Overlays
- Features TS Config
- Test TS Config
- Web Package Manifest
- FPS Guard
- ML Package Manifest
- Sim Package Manifest
- pnpm Workspace Config
- Feature Contract Docs
- ML Training Spike
- Walk Inference Latency
- Sim Placeholder
- Docs Index

## God Nodes (most connected - your core abstractions)
1. `WorldRenderer` - 93 edges
2. `main()` - 33 edges
3. `AmbientBackdrop` - 24 edges
4. `svelte` - 22 edges
5. `TerrainSample` - 21 edges
6. `generateTerrain()` - 19 edges
7. `sampleToVector()` - 18 edges
8. `Flora` - 18 edges
9. `createEngine()` - 17 edges
10. `parseModelJson()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Covertype dataset` --semantically_similar_to--> `Covertype Dataset (UCI, Blackard 1998)`  [INFERRED] [semantically similar]
  docs/dataset-card.md → README.md
- `ecology.json rules` --semantically_similar_to--> `Ecology rules`  [INFERRED] [semantically similar]
  docs/ecology-rules.md → GLOSSARY.md
- `Team-Made-Only Asset Rule` --semantically_similar_to--> `No AI-Generated Assets Rule`  [INFERRED] [semantically similar]
  apps/web/public/models/CREDITS.md → docs/roles/world.md
- `Fixture` --references--> `TerrainSample`  [EXTRACTED]
  ml/test/inference.test.ts → packages/features/src/features.ts
- `CardInput` --references--> `TerrainSampleKey`  [EXTRACTED]
  apps/web/src/lib/model/modelCard.ts → packages/features/src/features.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Honest evaluation protocol (LOAO, macro-F1, locked test, selection rule)** — docs_notes_loao_evaluation, docs_notes_macro_f1, docs_notes_lockedtestset, docs_notes_model_selection_rule, docs_notes_assertsplitsclean [EXTRACTED 1.00]
- **Models compared under the LOAO selection rule** — docs_model_card_softmax_model, docs_model_card_random_forest, docs_model_card_mlp, docs_model_card_elevation_band_rule, docs_model_card_majority_baseline [EXTRACTED 1.00]
- **Rewilding score components** — docs_ecology_rules_rewilding_score, docs_ecology_rules_habitat_diversity, docs_ecology_rules_population_stability, glossary_cover_map [EXTRACTED 1.00]
- **Saved world save/load/share flow** — docs_worlds_api_savedworld, docs_worlds_api_post_api_worlds, docs_worlds_api_get_api_worlds_id, docs_worlds_api_opensavedworld, docs_worlds_api_offline_code, docs_worlds_api_share_link, docs_worlds_api_model_version_mismatch_repredict [EXTRACTED 1.00]
- **OOD low-trust signal from detector to UI and world** — docs_notes_ood_detector, docs_roles_ml_d6_ood_detector, docs_roles_world_d5_overlays, docs_roles_app_and_sim_d13_walk_mode_safeguards [INFERRED 0.85]
- **Terrain to cover-map prediction pipeline** — glossary_heightmap, glossary_terrain_inputs_module, glossary_packed_inputs, docs_feature_contract_worker_api, glossary_prediction_session, glossary_cover_map [INFERRED 0.85]
- **Consumers of the shared heightmap/cover-map contract** — docs_roles_world_shared_contract, docs_roles_world_d8_walk_mode, docs_roles_world_d9_landscape_visuals, docs_roles_world_d14_ambient_backdrop, docs_roles_world_getgroundheight [EXTRACTED 1.00]
- **OOD low-trust visibility across overlay, vegetation, HUD and custom models** — docs_roles_world_ood_low_trust, docs_roles_world_d5_overlays, docs_roles_world_d9_landscape_visuals, docs_roles_world_d11_walk_hud, docs_roles_world_glb_validation_budgets [EXTRACTED 1.00]
- **Models compared for cover-type classification** — readme_baselines, readme_softmax_regression, readme_mlp, readme_random_forest [EXTRACTED 1.00]

## Communities (94 total, 5 thin omitted)

### Community 0 - "World Renderer Lifecycle"
Cohesion: 0.05
Nodes (6): Flora, tintedMaterial(), tuftGeometry(), LookControls, WorldRenderer, eyeY()

### Community 1 - "Sandbox Route"
Cohesion: 0.04
Nodes (41): { active = true }, band, busy, card, cells, codeCopied, codeInput, copied (+33 more)

### Community 2 - "App Router & Shell"
Cohesion: 0.06
Nodes (45): parseHash(), route, RouteId, ROUTES, errorMessage(), FetchLike, fetchWorld(), modelMismatchNotice() (+37 more)

### Community 3 - "WorldView & Animal Pace"
Cohesion: 0.04
Nodes (48): animalSpeedLabel(), nextAnimalSpeed(), classColors, cycle, effectiveQuality, exitWalk(), failure, frame (+40 more)

### Community 4 - "Build & Worker Config"
Cohesion: 0.05
Nodes (44): cloudflare.config.ts bindings (cf/config), Hono CLI, Hono app on Cloudflare Workers, here, repoRoot, dependencies, hono@5.0.0-rc.1, svelte@^5.57.3 (+36 more)

### Community 5 - "Dirty-Rect Batcher"
Cohesion: 0.11
Nodes (27): defaultTimers, DirtyRectBatcher, Timers, applyBrush(), BrushMode, BrushStroke, DirtyRect, falloff() (+19 more)

### Community 6 - "Site Probe Inputs"
Cohesion: 0.13
Nodes (35): ValidationResult, inputs(), computeFeatures(), FEATURE_DIM, FEATURE_NAMES, FeatureName, FeatureRanges, FeatureValues (+27 more)

### Community 7 - "Covertype Dataset Loader"
Cohesion: 0.08
Nodes (31): MODEL_VERSION, BIN_PATH, CLASS_DISPLAY_LABELS, CLASS_NAMES, DATASET_CITATION, DATASET_DOI, DATASET_LICENSE, DATASET_PAGE (+23 more)

### Community 8 - "Network & Forest Models"
Cohesion: 0.13
Nodes (31): roundForest(), fitScaler(), Matrix, Scaler, permutationImportance(), createRng(), gaussian(), Rng (+23 more)

### Community 9 - "Overlay Colors & Coords"
Cohesion: 0.08
Nodes (30): OverlayMode, cellToWorldX(), cellToWorldZ(), heightToWorldY(), nearestCell(), VERTICAL_EXAGGERATION, worldToCell(), worldToCellF() (+22 more)

### Community 10 - "Model Worker Client"
Cohesion: 0.10
Nodes (26): baseUrl(), failAll(), modelStatus, pending, predictBatch(), predictOne(), request(), send() (+18 more)

### Community 11 - "Settings Panel"
Cohesion: 0.09
Nodes (29): { onclose, embedded = false }, Props, reducedMotion, resetSettings(), settings, systemReducedMotion, DEFAULT_SETTINGS, inRange() (+21 more)

### Community 12 - "Sim Panel Herd Bindings"
Cohesion: 0.06
Nodes (15): clock, fullRate, pace, Props, rate, rulesResult, running, score (+7 more)

### Community 13 - "Ambient Backdrop Camera"
Cohesion: 0.10
Nodes (28): AMBIENT_FPS_CAP, AMBIENT_MIN_FPS, AMBIENT_PITCH, AMBIENT_QUALITY, AMBIENT_YAW_PERIOD_S, AMBIENT_YAW_RANGE_DEG, ambientYaw(), backdropContrast() (+20 more)

### Community 14 - "Seeded RNG & Sim Core"
Cohesion: 0.13
Nodes (28): nextRandom(), Rng, seedToState(), applyMapChange(), clampToGrid(), createSim(), emptyCounts(), graze() (+20 more)

### Community 15 - "Cell Selection & Env Types"
Cohesion: 0.13
Nodes (25): *.svelte, CellSelection, selectCell(), selectedCell, probeOpen, terrainVersion, viewMode, worldConfig (+17 more)

### Community 16 - "ML Training Loop"
Cohesion: 0.14
Nodes (30): buildMatrix(), labelsOf(), generatedLandSamples(), subSeed(), addConfusion(), calibrationBins(), Metrics, ModelFamily (+22 more)

### Community 17 - "Vegetation Placement"
Cohesion: 0.10
Nodes (27): desaturate(), luminance(), cellSlopeDeg(), CLASS_TINTS, countPlants(), GRASS, GRASS_DRY, GRASS_RADIUS (+19 more)

### Community 18 - "Model Card Parser"
Cohesion: 0.14
Nodes (20): CardInput, CardResult, Evaluation, isNum(), isNumArray(), isObj(), isStr(), isStrArray() (+12 more)

### Community 19 - "Predictor & OOD Score"
Cohesion: 0.11
Nodes (24): modelPredictor(), Predictor, activate(), Activation, dense(), ForestModel, isMat(), isNum() (+16 more)

### Community 20 - "Walk Vantage Finder"
Cohesion: 0.11
Nodes (26): findVantage(), isDry(), rng(), canMove(), CellArrays, CellReading, clamp(), COMPASS (+18 more)

### Community 21 - "ML Benchmarking"
Cohesion: 0.08
Nodes (22): batch, cardPath, cpu, engine, explainRuns, features, inputOpts, inputs (+14 more)

### Community 22 - "Inference Engine"
Cohesion: 0.11
Nodes (20): BatchResult, createEngine(), explainOne(), outOfRange(), predictBatch(), predictOne(), explainSentence(), Sensitivity (+12 more)

### Community 23 - "Dataset Exploration"
Cohesion: 0.12
Nodes (21): at(), COL, COLUMN_NAMES, Dataset, N_COLUMNS, columnStats(), fitSun(), hillshadeError() (+13 more)

### Community 24 - "Site Probe Explain"
Cohesion: 0.13
Nodes (23): explainOne(), inputSpec(), emptyForm(), formatNumber(), FormValues, parseField(), sampleToForm(), validateForm() (+15 more)

### Community 25 - "Confidence Colors"
Cohesion: 0.14
Nodes (22): ColorInputs, CONFIDENCE_HIGH, CONFIDENCE_LOW, confidenceColor(), hexToRgb01, NO_DATA, OOD_COLOR, RIVERBED (+14 more)

### Community 26 - "Fauna Meshes"
Cohesion: 0.13
Nodes (17): Frame, animalMatrix(), AnimalSlot, BODY_BOB, box(), Fauna, FaunaShapes, FULL_STRIDE_SPEED (+9 more)

### Community 27 - "Data Splits & Leakage"
Cohesion: 0.14
Nodes (20): AREA_NAMES, N_AREAS, N_CLASSES, rowToSample(), main(), OUT, assertDisjoint(), assertSplitsClean() (+12 more)

### Community 28 - "World Backdrop Contract"
Cohesion: 0.18
Nodes (11): AmbientEnvironment, AmbientLease, AmbientWorld, BackdropStats, WorldMountOptions, AmbientFallback, ambientQuality(), nextAmbientFallback() (+3 more)

### Community 29 - "Models Check Script"
Cohesion: 0.11
Nodes (19): dir, listed, problems, rows, widths, BASE_TOLERANCE, BUDGETS, isModelSlot() (+11 more)

### Community 30 - "Terrain & Prediction Glossary"
Cohesion: 0.13
Nodes (22): Debounced onHeightmapChange batcher, Vegetation placement (vegetation.ts), predictionState, 128x128 grid contract, heightmapToSamples, Hillshade formula (fitted SUN), Model output {classIndex, probs, ood}, modelVersion / schemaVersion versioning (+14 more)

### Community 31 - "Sim Clock"
Cohesion: 0.13
Nodes (10): MAX_TICKS_PER_ADVANCE, median(), medianMoveCells(), medianMovingSpeed(), moveDistances(), SimClock, TICK_MS, tickGapMs() (+2 more)

### Community 32 - "App Shell & Help"
Cohesion: 0.12
Nodes (13): statusLabel, walking, helpOpen, isTypingTarget(), closeBtn, groups, ModelStatus, issues (+5 more)

### Community 33 - "GLB Validation Budgets"
Cohesion: 0.14
Nodes (20): fmt(), MAX_FILE_BYTES, MAX_TOTAL_BYTES, ModelManifest, ModelRejection, ModelReport, ModelSlot, ModelSummary (+12 more)

### Community 34 - "Walk HUD Stats"
Cohesion: 0.10
Nodes (19): WorldStats, compassPoint(), WADE_DEPTH_M, base, cell, HELP, knob, mapCanvas (+11 more)

### Community 35 - "ML Training Config"
Cohesion: 0.10
Nodes (19): forestBase, Grid, GRIDS, IMPORTANCE_REPEATS, IMPORTANCE_ROWS, MAX_TRAIN_ROWS, mlpBase, OOD_PERCENTILE (+11 more)

### Community 36 - "World Backdrop Component"
Cohesion: 0.11
Nodes (17): columnHalf, dim, feather, handle, host, lease, loaded, presence (+9 more)

### Community 37 - "Sky & Palette"
Cohesion: 0.12
Nodes (6): DayState, PALETTE, SkyDome, DEPTH_RANGE_M, WaterSurface, three

### Community 38 - "Herd Package API"
Cohesion: 0.22
Nodes (17): EcologyRules, Animal, CreateSimOptions, SimState, InterpolatedPoses, interpolatePoses(), interpolateSnapshot(), lerpAngle() (+9 more)

### Community 39 - "Flora Meshes"
Cohesion: 0.11
Nodes (12): Batch, FloraShapes, FloraStats, GRASS_SWAY, Part, PLANT_SWAY, SILHOUETTES, SwayUniforms (+4 more)

### Community 40 - "Custom Design Guide"
Cohesion: 0.14
Nodes (17): snapshotPoses / interpolateSnapshot (view.ts), Animal Body Animation (shader legs), Blender-to-glb Asset Pipeline, Checking Work (P readout, 5-toggle check), classTints (palette.ts), Custom 3D Designs and Textures for Walk Mode, Level C: Detailed Textures, Flora / Fauna instanced renderers (+9 more)

### Community 41 - "Probability & Population Charts"
Cohesion: 0.15
Nodes (10): { classes, probs, highlight }, CLASS_COLORS, classColor(), HERBIVORE_COLOR, PREDATOR_COLOR, WATER_RGB, canvas, { history, version } (+2 more)

### Community 42 - "Engine Prediction Functions"
Cohesion: 0.17
Nodes (12): Engine, ElevationRange, GENERATED_SEEDS, generatedTerrainStudy(), generatedWorldInputs(), median(), ROLE1_DEFAULT_WORLD, studyWorld() (+4 more)

### Community 43 - "Share Codes"
Cohesion: 0.18
Nodes (15): codeToJson(), deflate(), exportShareCode(), fromBase64Url(), ImportResult, importWorld(), inflate(), isShareCode() (+7 more)

### Community 44 - "App & Sim Deliverables"
Cohesion: 0.12
Nodes (16): applyMapChange, D10 Sim State for Ground-Scale Viewing, D11 Settings, Help, and Notices, D12 Worlds API (optional), D13 Content and Safeguards for Walk Mode, D2 Inference Worker Integration, D3 Site Probe, D4 Model Report Page (+8 more)

### Community 45 - "Root TS Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, jsxImportSource, lib, module, moduleResolution (+7 more)

### Community 46 - "Walk Exit Panel"
Cohesion: 0.15
Nodes (12): CONTROLS, dialog, { exit, herd, animalSpeed, cellSizeM, canResume, onresume, onclose }, focusable(), onkeydown(), Props, REASON, resumeBtn (+4 more)

### Community 47 - "Backdrop Column Dimming"
Cohesion: 0.14
Nodes (11): COLUMN_FEATHER_PX, COLUMN_WIDTH_PX, NO_VIEW, ViewPresence, mountWorld(), viewPresence, BrushSettings, OverlayData (+3 more)

### Community 48 - "Web TS Config"
Cohesion: 0.13
Nodes (13): compilerOptions, lib, noEmit, resolveJsonModule, types, extends, include, compilerOptions (+5 more)

### Community 49 - "Sim Rules Validation"
Cohesion: 0.21
Nodes (14): checkClassArray(), checkNumber(), checkSpecies(), HerbivoreRules, INTEGER_KEYS, isRecord(), PredatorRules, PROBABILITY_KEYS (+6 more)

### Community 50 - "Web App & Model Files"
Cohesion: 0.21
Nodes (14): apps/web README, Inference modules (engine/worker/loader), model.json and model_card.json (public/model), Stub model predictor (ALLOW_STUB_MODEL), mountWorld backdrop, Feature Contract, explainOne local sensitivity, Role hand-off points (+6 more)

### Community 51 - "Day/Night Cycle"
Cohesion: 0.20
Nodes (13): advanceHour(), DAY_LENGTH_S, dayState(), formatHour(), KEYS, LIGHT, linearKeys(), MIN_LIGHT_ALTITUDE (+5 more)

### Community 52 - "Custom Model Rules"
Cohesion: 0.19
Nodes (9): EMPTY_MANIFEST, OOD_DENSITY, Species, fan(), GlbMesh, makeGlb(), MANIFEST_PATH, ok (+1 more)

### Community 53 - "Limitations & Model Card"
Cohesion: 0.22
Nodes (12): Limitations Notice, Educational-simulation-only notice, Model Card: Habitat Classifier, Elevation-band rule baseline, Majority-class baseline, Small MLP, Permutation feature importance, Random forest baseline (+4 more)

### Community 54 - "Hillshade & Sun Notes"
Cohesion: 0.14
Nodes (12): SUN (fitted sun positions in @graze/features), Hillshade: Our Method vs Dataset (D2), Without-Hillshade Ablation, D11 Model Versioning and Compatibility, D12 Documentation for the Walkable World, D2 Shared Features, D4 Training and Comparison, D5 Evaluation (+4 more)

### Community 55 - "App & Sim Design Notes"
Cohesion: 0.16
Nodes (13): computeFeatures, Role 2 Cut Order, 250 ms Debounce with Sequence Check, Elevation Band Slider (40% default), heightmapToInputs (@graze/features), Herd Simulation (not ML), Inference Web Worker, Known Gaps and Risks (+5 more)

### Community 56 - "Calibration & Final Eval"
Cohesion: 0.32
Nodes (10): fitTemperature(), argmaxRows(), CalibrationBin, confusionMatrix(), evaluate(), logLoss(), macroF1Of(), metricsFromConfusion() (+2 more)

### Community 57 - "Model Credits & Asset Rule"
Cohesion: 0.22
Nodes (9): Model Credits (CREDITS.md), pnpm models:check, $comment, version, D17 Custom .glb Models, D18 Motion and Polish Extras, D9 Landscape Visuals, World Palette File (world/palette.ts) (+1 more)

### Community 58 - "Dataset Card & Citations"
Cohesion: 0.21
Nodes (13): Dataset Card: Covertype, Blackard (1998) Covertype citation, Blackard & Dean (2000) ANN vs discriminant analysis, Class imbalance (Lodgepole + Spruce/Fir ~85%), 7 cover-type classes, Covertype dataset, Excluded columns (soil, wilderness, roads, fire), Negative vertical distance to water (+5 more)

### Community 59 - "LOAO Folds & Locked Test"
Cohesion: 0.18
Nodes (12): assertSplitsClean Leakage Check, Leave-One-Wilderness-Area-Out (LOAO) Folds, LockedTestSet / splits.lock.json, Macro-F1 Metric, ML Working Notes (Role 3), Random Split (optimistic), Random-Split Smoke Test, SELECTION_TIE_MARGIN (0.01) (+4 more)

### Community 60 - "World Role README"
Cohesion: 0.20
Nodes (10): World (Role 1) README, Cosmetic day/night cycle, getGroundHeight (bilinear), palette.ts (all world colors), Quality presets and frame-rate guard, Offline share code (share.ts), 2x vertical exaggeration, Walk mode (+2 more)

### Community 61 - "Ecology Rules & Score Docs"
Cohesion: 0.27
Nodes (12): Ecology Rules, applyMapChange terrain-edit handling, ecology.json rules, Habitat diversity D (Shannon entropy), Population stability S (1 - CV), Rewilding score formula (score.ts), Seeded PRNG determinism, Tick order (regrow, herbivores, predators, log) (+4 more)

### Community 62 - "Role 2 Walk Changes"
Cohesion: 0.21
Nodes (10): Changes Needed in ROLE-2, D15 Exit Button and Walk Info Panel (onexit), D16 Animal Pace (paceScale, ANIMAL_PACE), D2 Scene and Mesh, D6 Animals (instanced herbivore/predator), D7 Polish and Robustness, PointerLockControls (three r187), WorldView Component (+2 more)

### Community 63 - "Day/Night & D12 Docs"
Cohesion: 0.23
Nodes (10): D10 Day/Night Cycle, D12 Measurements (i7-11700, RTX 4060), D12 Performance and Quality Presets, D14 Ambient Backdrop is the Walk View, D1 Terrain Generator (generateHeightmap, seeded fBm), D3 Brush (onHeightmapChange dirtyRect), D8 Walk Mode, getGroundHeight(x, z) (+2 more)

### Community 64 - "Worlds API Docs"
Cohesion: 0.27
Nodes (12): D1 worlds table (0001_create_worlds.sql), GET /api/worlds/:id, Hono Worker (src/index.ts), Offline Code graze1., POST /api/worlds, SavedWorld format (packages/worlds), Share Link #/world/<id>, Sparse Brush-Edit Delta [gap, change] (+4 more)

### Community 65 - "Rewilding Score"
Cohesion: 0.23
Nodes (8): computeScore(), habitatDiversity(), populationStability(), RewildingScore, SCORE_MIN_SAMPLES, SCORE_WINDOW, getPositions(), PopulationSample

### Community 66 - "Models Manifest Slots"
Cohesion: 0.18
Nodes (11): slots, broadPine, fullCone, grassTuft, herbivore, pole, predator, roundCrown (+3 more)

### Community 67 - "Herd Store & Event Log"
Cohesion: 0.18
Nodes (4): { events, version }, recent, { rules, classes }, speciesRows

### Community 68 - "Quality Presets"
Cohesion: 0.18
Nodes (10): DEFAULT_QUALITY, FPS_GRACE_SECONDS, LOW_FPS_SECONDS, lowerPreset(), minPreset(), ORDER, QUALITY, QualityPreset (+2 more)

### Community 69 - "Sim Playback Controls"
Cohesion: 0.33
Nodes (10): clearSim(), emit(), frame(), passableFromWater(), pause(), play(), reset(), snap() (+2 more)

### Community 70 - "ML Pipeline Commands"
Cohesion: 0.24
Nodes (10): D9 model freeze / locked test set, Generated-terrain low-trust rates, ml/ Training Pipeline README, pnpm ml:bench (latency), pnpm ml:evaluate-final, pnpm ml:explore (exploration.json), pnpm ml:fetch, pnpm ml:generated-ood (+2 more)

### Community 71 - "Project Platform Overview"
Cohesion: 0.22
Nodes (9): cf CLI (not wrangler), D13 Save, Load and Share World, Role 1: World, Cloudflare Pages Static Deploy, No pnpm packages: workspace, Project Graze, Hono Worker Saved-Worlds API, Team (dar3v World, Liamjandr App/Sim, Zeki-Zek ML) (+1 more)

### Community 72 - "Sandbox Terrain Generator"
Cohesion: 0.33
Nodes (6): CELL_SIZE_M, generateHeightmap(), GRID, quantile(), scaleHeightmap(), valueNoise()

### Community 74 - "World Deliverables D4-D13"
Cohesion: 0.25
Nodes (5): pick(x, y) selection event, D11 Walk HUD and ML Tie-in, D4 Cell Picking (onpick), .glb Validation Budgets and tintMask, Site Probe

### Community 75 - "Features Package Manifest"
Cohesion: 0.25
Nodes (7): exports, ./package.json, name, private, type, types, version

### Community 76 - "Sim TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, resolveJsonModule, types, extends, include, ../../tsconfig.json

### Community 78 - "App State Design"
Cohesion: 0.43
Nodes (7): App State, View Modes and Sim View, settings store (localStorage graze.settings.v1), One shared app state (stores), Separate sim and render clocks, snapshotPoses / interpolateSnapshot (view.ts), viewMode store (orbit/walk), WorldView props contract

### Community 79 - "OOD Detection Notes"
Cohesion: 0.29
Nodes (7): isOOD (ml/src/ood.ts), OOD Detector standardized-distance (D6), OOD_PERCENTILE (99th), Open Questions for Humans, explainOne ±10% Perturbation Sensitivity, validateForm two-tier validation, D6 Out-of-Distribution Detector

### Community 80 - "ML Validation Overview"
Cohesion: 0.33
Nodes (6): Majority-Class and Elevation-Band Baselines, TypeScript ML Training Pipeline (ml/), MLP (small neural network), Random Forest, Softmax Regression, Stratified Random Split

### Community 81 - "Web Entry & Overlays"
Cohesion: 0.33
Nodes (6): apps/web index.html, #app mount + /src/main.ts entry, D5 Overlays (cover, confidence), model.json / model_card.json, Model Report Page, In-Browser Web Worker Inference

### Community 82 - "Features TS Config"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, extends, include, ../../tsconfig.json

### Community 83 - "Test TS Config"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../tsconfig.json

### Community 84 - "Web Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 86 - "ML Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 87 - "Sim Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 88 - "pnpm Workspace Config"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, workerd, onlyBuiltDependencies

### Community 89 - "Feature Contract Docs"
Cohesion: 0.50
Nodes (4): computeFeatures / FEATURE_NAMES, @graze/features README, @graze/features single source of truth, features.ts reviewer gate

### Community 90 - "ML Training Spike"
Cohesion: 0.50
Nodes (3): Seeded PRNG (ml/src/lib/rng.ts), Covertype Dataset (Blackard 1998), D1 Data Spike (Covertype)

### Community 91 - "Walk Inference Latency"
Cohesion: 1.00
Nodes (3): Dirty-Region Prediction Fallback, Measured Inference Latency (D10), D10 Inference Support for Walk Mode

## Knowledge Gaps
- **79 isolated node(s):** `../../tsconfig.json`, `../../tsconfig.json`, `../tsconfig.json`, `#app mount + /src/main.ts entry`, `Educational-simulation-only notice` (+74 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 662 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `svelte` connect `Cell Selection & Env Types` to `App Shell & Help`, `Sandbox Route`, `App Router & Shell`, `WorldView & Animal Pace`, `World Backdrop Component`, `Build & Worker Config`, `Model Worker Client`, `Settings Panel`, `Sim Panel Herd Bindings`, `Walk Exit Panel`, `Backdrop Column Dimming`, `Model Card Parser`, `Inference Engine`, `Site Probe Explain`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **What connects `../../tsconfig.json`, `../../tsconfig.json`, `../tsconfig.json` to the rest of the system?**
  _79 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `World Renderer Lifecycle` be split into smaller, more focused modules?**
  _Cohesion score 0.0537714712471994 - nodes in this community are weakly interconnected._
- **Why does `WorldRenderer` connect `World Renderer Lifecycle` to `GLB Validation Budgets`, `WorldView & Animal Pace`, `Overlay Colors & Coords`, `Pace Meter`, `Ambient Backdrop Camera`, `Backdrop Column Dimming`, `Walk Vantage Finder`, `Fauna Meshes`, `World Backdrop Contract`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Should `Sandbox Route` be split into smaller, more focused modules?**
  _Cohesion score 0.03571428571428571 - nodes in this community are weakly interconnected._
- **Why does `D9 Walk Mode Integration` connect `App & Sim Deliverables` to `Inference Engine`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Should `App Router & Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.06327683615819209 - nodes in this community are weakly interconnected._