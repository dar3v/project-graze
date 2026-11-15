# World (Role 1)

The 3D terrain: mesh, water, camera, brush, picking, overlays and animals.
Terrain generation and the terrain-to-inputs math live in
[`packages/sim/terrain`](../../../../../packages/sim/terrain/src/index.ts), which
is three-free and unit-tested. Import it here through `./terrain.ts`.

| File | What it is |
| --- | --- |
| `index.ts` | `mountWorld(target, { reducedMotion })` for the page background (picked up by `../backdrop/WorldBackdrop.svelte`), plus re-exports |
| `scene.ts` | `WorldRenderer`: the three.js scene, both view modes, the frame loop. Draws what it is given and has no sim or model logic |
| `WorldView.svelte` | The view the Sandbox uses: toolbar, legend, quality guard, and the walk HUD |
| `WalkHud.svelte` | Walk-mode HUD: cell under you, minimap, prompt, touch joystick, controls card, notice |
| `palette.ts` | **Every color the world draws.** Terrain, overlays, class tints, sky, fog, water, lights (three-free) |
| `walk.ts` | Walk physics: `getGroundHeight`, `EYE_HEIGHT`, `WALK_SPEED`, `RUN_SPEED`, `SLOPE_LIMIT`, wading, map edge (three-free, tested) |
| `vegetation.ts` | Seeded plant and grass placement from the cover map; the OOD rule; chunk culling (three-free, tested) |
| `flora.ts` | The 7 plant silhouettes and the instanced meshes built from the placement |
| `fauna.ts` | Herbivore and predator meshes, instanced |
| `daynight.ts` | Cosmetic time of day: sun path, light, sky, fog and water colors (three-free, tested) |
| `sky.ts`, `water.ts` | Sky dome and water surface shaders |
| `terrainMaterial.ts` | Slope rock/dirt and shoreline blending on the terrain |
| `quality.ts` | Low / medium / high presets and the frame-rate guard (three-free, tested) |
| `share.ts` | the offline share code (`exportShareCode()`, `importWorld()`) and `readWorldInput()` (three-free, tested). Terrain to saved world and back is `state/worldTerrain.ts` |
| `colors.ts` | Vertex colors for the terrain, cover, confidence and OOD overlays (three-free, tested) |
| `coords.ts` | Cell to world coordinate mapping (tested) |
| `batcher.ts` | Debounced `onHeightmapChange(dirtyRect)` (tested) |

Tests: `apps/web/test/world.test.ts`, `apps/web/test/walk.test.ts` and
`packages/sim/terrain/test/terrain.test.ts`.

## Conventions

- One world unit is one cell (30 m). Vertex `(x, y)` sits at the center of cell
  `(x, y)`. North (`y = 0`) is `-Z`, and east is `+X`.
- Heights are drawn with a 2× vertical exaggeration (`VERTICAL_EXAGGERATION`).
  This affects only the drawing, never the heightmap or the model inputs.
- The brush clamps heights to the `elevation` range it is given. Pass the
  training range from `model_card.json`.

## Using `WorldView`

The Sandbox page (`../routes/Sandbox.svelte`) is the example. The first block
of props is required; everything after `onheightmapchange` is optional, and
without it the view keeps that state itself.

```svelte
<WorldView
  heightmap={heightM}            // Float32Array the brush edits in place
  size={GRID} cellSizeM={CELL_SIZE_M} waterLevelM={waterLevel}
  elevation={{ min, max }}       // the brush clamps to it
  classes={card.classes} {cover} {confidence} {ood}
  selected={probeOpen ? $selectedCell : null}
  herbivores={poses?.herbivores} predators={poses?.predators} poseStride={3}
  busy={predicting ? 'Predicting…' : null}
  onpick={pick}                  // orbit click AND E in walk mode
  onheightmapchange={recomputeInputsAndPredict}

  seed={$worldConfig.seed}       // same seed + cover map = same forest
  viewMode={$viewMode} onviewmodechange={(m) => viewMode.set(m)}
  quality={$settings.quality}
  timeOfDay={$settings.timeOfDay} autoCycle={$settings.autoCycle}
  ontimeofdaychange={...} onautocyclechange={...}
  overlay={$settings.overlay} showOod={$settings.showOod}
  onoverlaychange={...} onshowoodchange={...}
  reducedMotion={$reducedMotion}
  notice={PREDICTION_NOTICE} prediction={predictionState}
/>
```

- The page keeps `heightmap` as one mutable array. Each `onheightmapchange`
  should recompute `heightmapToInputs` (`@graze/features`) and run the
  debounced batch. The rect is padded by one cell because slope, aspect and
  hillshade use central differences.
- `onviewmodechange('orbit')` is called when the walker leaves (Esc, or the
  pointer lock is released). `ontimeofdaychange` is called while the cycle
  runs, every quarter hour of scene time. `onautocyclechange(false)` is called
  when the frame-rate guard pauses the cycle.
- Animal arrays are `[x, y, ...]` (`poseStride` 2) or `[x, y, heading, ...]`
  (3, `POSE_STRIDE`), in cell coordinates.

## Walk mode

- `getGroundHeight(x, z)` converts the world point to cell coordinates and
  blends the four surrounding heightmap cells bilinearly. It is the same
  lookup that stands the animals and the plants on the ground.
- The chosen scale, slope and water behaviour are written at the top of
  `walk.ts` and in `docs/roles/world.md` ("Walk mode: chosen behaviour").
- Mouse look is three's `PointerLockControls` (r187: it extends `Controls`,
  the camera is `controls.object`). `lock()` needs a click and can be refused,
  so the HUD shows "Click to look" first, and arrow keys and dragging always
  work. A refused lock is handled in `LookControls` (`scene.ts`) so it does
  not log a console error.
- Keys: W A S D, Shift, arrows, E (probe), `[` `]` (time), T (cycle), C
  (photo), P (frame rate and draw counts), H (keys), Esc or V (leave).

## What is drawn when

| View | Ground | Plants | Low trust shown as |
| --- | --- | --- | --- |
| Orbit, cover or confidence overlay | exact overlay colors, no slope blend | none | amber checkerboard (if on) |
| Orbit, "Terrain and vegetation" | natural, slope and shore blend | all chunks | amber checkerboard (if on), and sparse grey plants |
| Walk | natural, slope and shore blend | chunks within the draw distance, grass near the walker | sparse grey plants, the HUD flag, amber on the minimap |

Plants exist only while they are shown. Leaving walk mode with a data overlay
selected disposes them; so does `destroy()`. That is what keeps the resource
counts flat across mode toggles (D12).

## Day and night are cosmetic

`daynight.ts` only lights and colors the scene. The model's hillshade inputs
come from the heightmap and a fixed, fitted sun in `@graze/features`. Nothing
in this folder imports that package (a test in `walk.test.ts` fails if a file
here ever does), so the time slider cannot change a prediction.

## Design decisions

- **Default relief is 20% of the elevation range** (about 400 m over 3.84 km).
  At roughness 0.5 this gives a mean slope of about 15°. Covertype's mean
  slope is about 14°. Using the full range gives slopes far outside the
  training data, so most cells would be flagged OOD.
- **Colors** all come from `palette.ts`. The cover-overlay class colors are
  the one list kept elsewhere (`../sandbox/palette.ts`, shared with the page
  legends); the world reads it through `palette.ts` `classOverlay`.
  `model_card.json` has no color field.
- **Own sky and water shaders, not three's `Sky` / `Water` addons.** `Sky`
  computes its colors from a scattering model, so they could not come from
  the palette, and it needs tone mapping, which would shift overlay colors
  away from their legends. `Water` renders the scene a second time for its
  reflection. The water here reads depth from the heightmap instead, which
  gives the depth tint, the foam and the wading line for one draw call.
- **Shadows are redrawn on request.** The shadow map is updated when the sun,
  the terrain, the plants or the walker's neighbourhood change, not every
  frame. The terrain has per-vertex normals only for the shadow bias; its
  lighting is still flat.
- **Flat shading** computes normals per pixel, so sculpting only re-uploads the
  touched rows of the position and color buffers and never recomputes normals.
- **Render on demand in orbit view.** Frames are drawn only after a change or
  while the camera moves. Walk mode and the day/night cycle draw every frame,
  and the frame-rate guard watches them.
- **The backdrop** (`backdrop.ts`, `ambient.ts`) draws the walk look (sky,
  fog, water, plants, animals) from a seeded vantage at the `low` preset, at
  most 30 frames a second. Its camera turns without end at 2.5° a second
  (D19) on every page, the Sandbox included; it pauses only in walk mode, in
  a hidden tab, or when its frame-rate guard freezes it. With
  `prefers-reduced-motion` it holds still. Over it lies one flat black dim,
  `DIM_IDLE` 0.84, with no fade or gradient (D20).
- **Trees grow in small forest patches** (`vegetation.ts`, D21): a seeded
  cellular field picks where, the cover class picks which silhouette.
  Shrubs (Krummholz) and grass are not patchy. About a third of the plants of
  a uniformly planted map, with open plains between the patches.
- **WebGL 2 is required** (three r163+). Without it, `WorldView` shows a
  message and the backdrop stays black.
