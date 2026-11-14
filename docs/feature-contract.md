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
8 floats per cell (`apps/web/src/lib/model/inputs.ts`, `RAW_INPUT_KEYS`):

`elevation, slope, aspectDegrees, hillshade9am, hillshadeNoon, hillshade3pm, horizontalDistanceToWater, verticalDistanceToWater`

## Model output (per input)

```ts
{ classIndex: number, probs: number[] /* length = classes.length */, ood: boolean }
```

The app's `Prediction` adds `oodReasons: string[]` (plain language),
`outOfRange: RawInputKey[]`, and `stub: boolean`.

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
}
```

`standardized-distance` = `sqrt(mean_i(((x_i - mean_i) / std_i)^2))` over the
feature vector, compared against `threshold`.

## Inference Worker API

Implemented in `apps/web/src/lib/model/protocol.ts` and `worker.ts`.

| Main → Worker | Worker → Main |
| --- | --- |
| `init { baseUrl, allowStub }` | `ready { card, stub, loadError?, warnings }` or `fatal { message }` |
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
- **Animal positions (Role 2 → Role 1):** `getPositions(simState)` from
  `packages/sim/herd` returns `{ herbivores, predators }` as interleaved
  `Float32Array [x0, y0, x1, y1, ...]` in cell coordinates.
- **Terrain → raw inputs:** the placeholder implementation is
  `apps/web/src/lib/sandbox/terrain.ts` (`computeCellInputs`). If Role 1
  ships one in `packages/sim/terrain/`, the app switches to it and the
  placeholder is deleted.
