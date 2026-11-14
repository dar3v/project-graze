# Feature contract

> **Status: PROPOSAL from Role 2 (App and Sim). Needs sign-off from Role 1
> and Role 3.** The app already implements this. If you change anything here,
> tell the other roles and update the code it names.

Source of truth for the shapes passed between the world (Role 1), the
model (Role 3), and the app and sim (Role 2). Feature order and preprocessing
live in `packages/features` (`FEATURE_NAMES`, `computeFeatures`). This document
does not redefine them.

## Grid

| Item | Shape |
| --- | --- |
| Heightmap | `Float32Array(16384)`, row-major, `index = y * 128 + x`, meters, scaled into the elevation training range from `model_card.json` |
| Cell size | 30 m (verify against the dataset docs) |
| Orientation | `y = 0` is the north edge; `+x` is east |
| Cover map | `Uint8Array(16384)` of class indices into `model_card.json` `classes` |
| Water | `Uint8Array(16384)`: 1 = under water (not passable for animals) |

## Raw inputs vs. model features

The Site Probe and the Worker take **raw inputs** (`TerrainSample` from
`@graze/features`). `computeFeatures` turns them into the model's feature
vector (aspect becomes sin and cos). Batch buffers are packed in this order,
8 floats per cell (`TERRAIN_SAMPLE_KEYS` in `@graze/features`; read and write
cells with `sampleAt` / `packSample`):

`elevation, slope, aspectDegrees, hillshade9am, hillshadeNoon, hillshade3pm, horizontalDistanceToWater, verticalDistanceToWater`

## Feature formulas (Role 3, `@graze/features`)

**Model vector** (`computeFeatures` / `sampleToVector`, in `FEATURE_NAMES` order):

| Feature | Formula |
| --- | --- |
| `elevation` | raw elevation, m |
| `slope` | raw slope, degrees |
| `aspectSin`, `aspectCos` | `sin(aspect)`, `cos(aspect)` with aspect in radians. This removes the 0/360 wrap. |
| `hillshade9am`, `hillshadeNoon`, `hillshade3pm` | raw value, 0–255 |
| `horizontalDistanceToWater`, `verticalDistanceToWater` | raw value, m |

No scaling happens here. Softmax and MLP models carry their own `scaler`
in `model.json`. The forest uses raw values.

**Heightmap → raw inputs** (`heightmapToSamples` in
`packages/features/src/terrain.ts`):

| Input | Formula |
| --- | --- |
| slope | `atan(hypot(dz/dx, dz/dy))` in degrees. Central differences use the 30 m cell size; edge cells use one-sided differences. |
| aspect | compass bearing of the downhill direction, `atan2(-dz/dx, dz/dy)` mapped to [0, 360), where `+y` is south. A flat cell is 0. |
| hillshade | `round(255 * clamp(cos(zen)cos(s) + sin(zen)sin(s)cos(az - aspect), 0, 1))`, with zen = 90° − sun altitude. Sun positions come from `SUN`, fitted so the formula reproduces Covertype's columns from Covertype's own slope and aspect (`ml/reports/exploration.json`, `hillshadeCheck`). Physically computed solstice positions are in `SUN_ASTRONOMICAL` but do not match the data. |
| horizontal distance to water | exact Euclidean distance from the cell centre to the nearest water-cell centre (`distanceToWaterCells`) × 30 m. It is 0 on water. With no water on the map, it is the grid diagonal in meters. |
| vertical distance to water | cell height − water level. It is 0 on water and negative never occurs on land. Covertype allows negative values; flat water cannot produce them. |

Water: a cell is water when its height is strictly below the water level.

## Model output (per input)

```ts
{ classIndex: number, probs: number[] /* length = classes.length */, ood: boolean }
```

The app's `Prediction` adds `oodReasons: string[]` (plain language) and
`outOfRange: RawInputKey[]`. (The `stub` flag was removed on Nov 14 with the
stub predictor.)

`ood` is true when any raw input is outside its training range in
`model_card.json`, **or** when `model.json` ships a detector and it fires.

## Files (Role 3 exports)

Both are served from `apps/web/public/model/`.

### `model_card.json`

Required (the app refuses to load without them):

```jsonc
{
  "schemaVersion": 1,
  "model":   { "name": "...", "type": "...", "version": "...", "trainedAt": "?", "seed": 0, "selectionRule": "?" },
  "classes": ["...7 names, in class-index order..."],
  "features": ["...must equal FEATURE_NAMES exactly..."],
  "inputs": [
    // one entry per raw input key; min/max = training-data range
    // hardMin/hardMax (optional) = physically valid range
    { "name": "elevation", "label": "Elevation", "unit": "m", "min": 0, "max": 0, "hardMin": 0, "hardMax": 0 }
  ]
}
```

Optional sections. The Model Report shows "not in model_card.json yet" for
missing ones and ignores malformed ones (with a visible warning):

| Key | Shape |
| --- | --- |
| `dataset` | `{ name, citation?, license?, url?, instances?, region?, featuresUsed?, featuresExcluded?, classCounts?: number[], preparation?: string[] }` |
| `split` | `{ strategy, description?, details?: string[] }` |
| `baselines` | `[{ name, accuracy?, macroF1, selected?, notes? }]` |
| `evaluations` | `[{ name, split, accuracy?, macroF1, confusionMatrix?: number[K][K] (rows = true), perClass?: [{ precision, recall, f1, support }] }]` |
| `calibration` | `{ method?, ece?, bins: [{ lower, upper, confidence, accuracy, count }] }` |
| `ablations` | `[{ name, description?, macroF1, referenceMacroF1? }]` |
| `featureImportance` | `{ method, values: [{ feature, importance }] }` |
| `ood` | `{ method, description, threshold?, flaggedRate? }` |
| `limitations` | `string[]`: human-written "what these numbers do not mean" |

### `model.json`

```jsonc
{
  "schemaVersion": 1,
  "featureNames": ["...must equal FEATURE_NAMES..."],
  "classCount": 7,
  "scaler": { "mean": [9], "std": [9] },            // optional, applied to the feature vector
  "ood": { "method": "standardized-distance", "mean": [9], "std": [9], "threshold": 3.0 }, // optional
  "model": { "type": "softmax", "weights": [[/* 7 x 9 */]], "bias": [7] }
  // or { "type": "mlp", "layers": [{ "weights": [[out][in]], "bias": [out], "activation": "relu" | "tanh" | "linear" }] }  (softmax applied to the last layer)
  // or { "type": "forest", "trees": [{ "feature": [], "threshold": [], "left": [], "right": [], "value": [[K]] }] }  (leaf: feature < 0; x[f] <= t goes left)
  "temperature": { "value": 1.0, "applied": "folded-into-weights" | "not-applied" }  // informational; the runtime ignores it
}
```

`standardized-distance` = `sqrt(mean_i(((x_i - mean_i) / std_i)^2))` over the
feature vector, compared against `threshold`.

## Inference Worker API

Implemented in `apps/web/src/lib/model/protocol.ts` and `worker.ts`.

| Main → Worker | Worker → Main |
| --- | --- |
| `init { baseUrl }` | `ready { card, warnings }` or `fatal { message }` |
| `predictBatch { id, inputs: Float32Array }` (transferred) | `predictBatchResult { id, result: { classIndex: Uint8Array, confidence: Float32Array, ood: Uint8Array, oodCount, invalidCount } }` |
| `predictOne { id, sample }` | `predictOneResult { id, prediction }` |
| `explainOne { id, sample }` | `explainOneResult { id, explanation: { prediction, sentence, method, sensitivities } }` |
| | `error { id, message }` |

`explainOne` currently uses a generic local-sensitivity method: each input
moves by ±10% of its training range and the change in every class
probability is recorded. If Role 3 provides a model-specific explain
function, it replaces `createEngine().explainOne` in
`apps/web/src/lib/model/engine.ts`, and the message shape stays the same.

## Hand-off points

- **3D world as the page background (Role 1):** export
  `mountWorld(target, { reducedMotion }) => { destroy() }` (sync or async) from
  `apps/web/src/lib/world/index.ts`. Types: `apps/web/src/lib/backdrop/worldContract.ts`.
  `target` is a full-viewport element behind the UI; append the three.js
  canvas to it. The app puts a black layer at 72% opacity over it and fades it
  in once mounted. Until the file exists, or if mounting throws, the background
  stays black. The backdrop gets no pointer events.

- **Cell selection (Role 1 → Role 2):** call `selectCell({ x, y, sample, water })`
  from `apps/web/src/lib/sandbox/selection.ts`. The Site Probe opens prefilled.
- **Animal positions (Role 2 → Role 1):** `WorldView` gets `herbivores` and
  `predators` as interleaved `Float32Array [x0, y0, x1, y1, ...]` in cell
  coordinates, interpolated between sim ticks every frame while the sim runs.
  Poses with heading (`[x, y, heading, ...]`, `POSE_STRIDE = 3`) come from
  `snapshotPoses` / `interpolateSnapshot` in `packages/sim/herd/src/view.ts`.
  Ground height: `sampleHeight(heightmap, size, x, y)` (bilinear). See
  `docs/app-state.md`.
- **Saved worlds (Role 2, D12):** format in `packages/worlds`, API in
  `docs/worlds-api.md`.
- **Terrain → raw inputs:** `@graze/features` is the only implementation.
  `heightmapToInputs` returns the packed `Float32Array` (the app's Worker
  batch); `heightmapToSamples` returns one `TerrainSample` per cell in
  float64 (the ML pipeline). Both run the same code and use the fitted
  `SUN`. The earlier copies in `packages/sim/terrain` and the app placeholder
  were deleted because they had drifted (old sun angles, chamfer distance).
