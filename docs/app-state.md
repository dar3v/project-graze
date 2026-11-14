# App state, view modes and the sim view (Role 2: D9, D10, D11)

*Agent draft, 2026-11-15. The "WorldView props" section was confirmed and built on the Role 1 side the same day.*

## One shared state

There is one shared state, in `apps/web/src/lib/state/`. Every view reads
and writes the same stores. Switching from orbit to walk changes only
`viewMode`, so no other state is lost.

| Store | File | Holds | Remembered |
| --- | --- | --- | --- |
| `worldConfig` | `appState.ts` | seed, band center, water share, relief, roughness, valley | this visit |
| `terrainVersion` | `appState.ts` | "Reset terrain" counter | this visit |
| world terrain (`terrainFor`, `openSavedWorld`, `toSavedWorld`) | `worldTerrain.ts` | base heightmap, brush edits (edited in place), recipe and the elevation range it was built in | this visit |
| `selectedCell`, `probeOpen` | `appState.ts` (re-exports `sandbox/selection.ts`) | the probed cell | this visit |
| `viewMode` | `appState.ts` | `'orbit'` or `'walk'` | this visit |
| `settings` | `settings.ts` | quality preset, time of day, auto-cycle, overlay, low-trust toggle, motion | per viewer, in browser storage |

What "remembered" means:

- **This visit:** the stores live at module level. Leaving the Sandbox for
  the Model Report and coming back keeps the world and any brush edits. A
  page reload starts fresh.
- **Per viewer:** settings are saved in `localStorage` under
  `graze.settings.v1`. Every read and write is wrapped in try/catch. With
  empty, blocked or full storage, the app uses the defaults and settings last
  for this visit only (tested in `apps/web/test/state.test.ts`).

## One selection event

Whatever the view, the cell selection goes through `pick(x, y)` in
`Sandbox.svelte`. That sets `selectedCell` and `probeOpen`, so there is one
Site Probe panel and one form:

- an orbit click calls it through `WorldView`'s `onpick`;
- "inspect the cell underfoot" (E) in walk mode calls the same `onpick`
  (ROLE-1 D11).

## Prediction state

The Sandbox derives one `predictionState` for every view:

| State | When |
| --- | --- |
| `loading` | the model is still loading |
| `predicting` | a batch is running |
| `ready` | the latest batch has finished |
| `unavailable` | no model loaded |
| `failed` | the latest batch failed |

When the model files fail to load, the 3D world still renders and can be
sculpted. It has no cover map, no Site Probe and no sim, and the page shows
"Predictions unavailable". The walk HUD shows the same state, from the
`prediction` prop.

## WorldView props the app passes

Role 1 built every prop below on 2026-11-15, the flags in
`apps/web/src/lib/state/worldFeatures.ts` are all true, and `Sandbox.svelte`
passes the store values. The flags stay in the code as the switch for any
later prop.

| Prop | Type | From | Flag |
| --- | --- | --- | --- |
| `viewMode` | `'orbit' \| 'walk'` | `$viewMode`; toggle button and `V` | `walkMode` |
| `quality` | `'low' \| 'medium' \| 'high'` | `$settings.quality` | `qualityPresets` |
| `timeOfDay`, `autoCycle` | `number` (hours, 0–24), `boolean` | `$settings` | `timeOfDay` |
| `overlay`, `showOod` | `'terrain' \| 'cover' \| 'confidence'`, `boolean` | `$settings` | `overlayProps` |
| `reducedMotion` | `boolean` | `$reducedMotion` | `reducedMotion` |
| `notice` | `string` | `PREDICTION_NOTICE` | (pinned in the walk HUD) |
| `prediction` | `'loading' \| 'predicting' \| 'ready' \| 'unavailable' \| 'failed'` | `predictionState` | (walk HUD) |
| `onviewmodechange` | `(m) => void` | sets `$viewMode` (Esc or a released pointer lock leaves walk mode) | `walkMode` |

Added by Role 1 in the same change:

| Prop | Type | Why |
| --- | --- | --- |
| `seed` | `number` (`$worldConfig.seed`) | the same seed and cover map give the same forest |
| `poseStride` | `2 \| 3` | 3 passes `[x, y, heading]` poses straight through, so animals face the way they move |
| `ontimeofdaychange` | `(hour) => void` | the cycle reports its clock every quarter hour, so the Settings slider follows it |
| `onautocyclechange` | `(on) => void` | the frame-rate guard pauses the cycle (ROLE-1 D10 fallback); `T` in walk mode |
| `onoverlaychange`, `onshowoodchange` | `(value) => void` | the controls under the world write the same settings as the Settings panel |

Walk mode always shows the natural landscape. `overlay` and `showOod` apply in
orbit view; on foot the prediction is in the plants, the HUD and the minimap.

These props already work and need nothing more:

- `herbivores`, `predators`
- `busy`
- `onpick`
- `onheightmapchange`

## Sim view for the renderer (D10)

The read-only interface is in `packages/sim/herd/src/view.ts`, which has no
rendering code:

- `snapshotPoses(state)` returns `{ tick, herbivores, predators }`. Each
  species is `{ ids: Uint32Array, poses: Float32Array }`, with poses packed as
  `[x, y, heading, ...]` (`POSE_STRIDE = 3`).
  - Coordinates are grid cells: integers are cell centers, x points east, y
    points south.
  - `heading` is `atan2(dy, dx)` of the last move.
- `interpolateSnapshot(prev, next, t)` gives the poses `t` of the way between
  two ticks. It matches animals by id. Newborns appear at their new pose, and
  animals that died drop out.
- `posesToPositions(poses)` turns `[x, y, heading]` into `[x, y]`, the format
  `WorldView` takes today.

**Clock.** The sim and the renderer run on separate clocks:

- `SimPanel` steps the sim on a fixed `setInterval` (100 ms × speed). That is
  the sim clock.
- A `requestAnimationFrame` loop interpolates between the last two snapshots
  every frame and sends the poses to the page.

So the tick rate does not depend on the frame rate. With reduced motion on,
there is no interpolation: animals step once per tick.

**Ground height (agreed convention).** An animal at fractional cell `(x, y)`
stands at `sampleHeight(heightmap, size, x, y)` from `packages/sim/terrain`:

- The lookup is bilinear over the four surrounding cells, in the row-major,
  30 m contract.
- Cell centers are exact, and points off the grid are clamped.

ROLE-1 D8's `getGroundHeight(x, z)` (`world/walk.ts`) is this function
after converting world `(x, z)` to cells (`worldToCellF` in
`world/coords.ts`). Role 1 confirmed the convention on 2026-11-15. A unit test on a 3×3 heightmap is in
`packages/sim/herd/test/view.test.ts`.

**Water.** Animals stand only on land at every tick boundary (tested).
Between ticks, the path is a straight line, so a gliding animal can cross a
water cell for a frame or two.

**Re-seeding and terrain edits.** See `docs/ecology-rules.md`, "Terrain
edits". In short:

- A new terrain seed (or new band center, relief, roughness or valley)
  restarts the herds with the same sim seed, so the run is deterministic.
- Sculpting, or moving the water slider, keeps the run going on the new map.
