# Role 1: World

**Owner:** [Name]
**Mission:** Make a terrain you can see, sculpt, and read the model's predictions on. If it doesn't look alive and respond to the brush, the rest of the project has nothing to stand on.

---

## Ownership

| You own | You do not edit (ask the owner) |
| --- | --- |
| `packages/sim/terrain/` (heightmap generation) | `packages/features/` (Role 3) |
| `apps/web/src/lib/world/` (three.js scene, brush, overlays) | `ml/` and `model.json` (Role 3) |
| World-side unit tests | `packages/sim/herd/` and Svelte pages (Role 2) |
| `apps/web/public/models/` and `world/models.ts` (custom `.glb` files, manifest, loader; see D17) | `WorldBackdrop.svelte`, settings store, Sandbox panels (Role 2; see "Changes needed in ROLE-2") |

---

## Shared contract (agree on this in the first 30 minutes; source of truth is `docs/feature-contract.md`)

- **Heightmap:** `Float32Array` of length 16384, row-major (`index = y * 128 + x`), values in meters, scaled into Covertype's elevation range (verify the range in `covtype.info`).
- **Cell size:** 30 m (verify against the dataset docs).
- **Cover map:** `Uint8Array(16384)` of class indices 0-6, in the order listed in `model_card.json`.
- **Per-cell outputs from the model:** class index, confidence, and an `ood` flag.
- **Model files:** `apps/web/public/model/model.json` and `model_card.json`.

You **produce** the heightmap. You **consume** the cover map, confidence array, OOD array, and animal positions.

---

## Deliverables

Each item is done only when every checkbox is ticked.

### D1. Terrain generator (Days 1-3)
- [x] `generateHeightmap(seed, options)` returns a 128×128 `Float32Array` using seeded fBm noise
- [x] Same seed always gives the same output (unit test)
- [x] Elevation is scaled into the dataset's range per the contract (unit test on min/max)
- [x] Options: seed, roughness, water level

### D2. Scene and mesh (Days 2-3)
- [x] Low-poly mesh with vertex colors (no voxels)
- [x] Orbit camera, water plane, seed input, water-level slider *(the Sandbox drives `WorldView` with its seed input and water slider since Nov 14)*
- [ ] Runs at 30+ fps on the team's weakest laptop *(not measured on that laptop yet. 60 fps, the display cap, on the machine named under D12. Orbit view renders on demand)*

### D3. Brush (Days 4-5)
- [x] Raise, lower, flatten, with radius and strength controls
- [x] Mesh updates only the touched region
- [x] Emits a debounced `onHeightmapChange(dirtyRect)` event so the model re-predicts without lag

### D4. Cell picking (Days 5-6)
- [x] Clicking the terrain selects a cell `(x, y)` and highlights it
- [x] Emits the selection to Role 2's Site Probe panel *(`onpick` reaches the Sandbox `pick(x, y)`; the probe opens from an orbit click and from E in walk mode)*

### D5. Overlays (Days 6-7)
- [x] Cover-type overlay using class colors read from `model_card.json`
- [x] Confidence overlay
- [x] **OOD overlay:** cells flagged as unlike the training data are visibly marked ("low trust")
- [x] Toggle control and a legend

### D6. Animals (Days 8-10)
- [x] Instanced meshes for one herbivore and one predator
- [x] Positions come from Role 2's sim state; no sim logic in the renderer *(`herbivores` / `predators` props, now with headings (`poseStride={POSE_STRIDE}`); 409 animals drawn in the check)*

### D7. Polish and robustness (Days 10-11)
- [x] Handles window resize
- [x] Friendly message if WebGL is unavailable
- [x] Loading state while the model loads *(`busy` label in orbit view; the walk HUD shows the `prediction` state)*
- [x] No console errors on a fresh load *(checked again on the wired Sandbox in headless Firefox, Nov 15)*

Implementation notes (2026-11-14; the wiring they wait on was done on Nov 14 and 15, see the checklists above):
- Code is in `packages/sim/terrain/` and `apps/web/src/lib/world/` (see that folder's README).
- D2 "Orbit camera, water plane, seed input, water-level slider": the camera and water plane are done. The seed input and water slider already exist on the Sandbox page, which still shows the 2D placeholder map. They work in 3D once `WorldView` replaces `MapView` (Role 2 wiring).
- D2 "30+ fps": not measured on the team's weakest laptop yet. Rendering is on demand and the pixel ratio is capped.
- D4 "Emits the selection to the Site Probe", D6 "Positions come from the sim", and D7 "Loading state": `WorldView` has `onpick`, `herbivores`/`predators` and `busy` props. They take effect once the Sandbox page passes them.
- D5 class colors come from `apps/web/src/lib/sandbox/palette.ts` by class index, because `model_card.json` has no color field.
- D7 "No console errors on a fresh load": checked in headless Firefox on the built app with the 3D backdrop. Check again after the Sandbox wiring.

Implementation notes (2026-11-15, extended scope):

**Walk mode: chosen behaviour (D8).**
- Scale. Walk mode is a diorama, not a human-scale hike. One world unit is one
  30 m cell, and the walker is a giant: `EYE_HEIGHT` 0.5 cells, `WALK_SPEED` 3
  and `RUN_SPEED` 7 cells a second. At true walking speed the 3.84 km map
  would take 45 minutes to cross.
- Slope. `SLOPE_LIMIT` is 45°, measured on the true terrain (the 2× drawing
  exaggeration is divided out). Climbing steeper ground is blocked; going
  down never is. A blocked step slides along the obstacle.
- Water. Water up to `WADE_DEPTH_M` (6 m) is waded at 45% speed. Deeper
  water is blocked. The water surface draws a dashed pale line at exactly
  that depth, so the boundary is visible from the shore. A walker caught in
  deep water (the slider moved) can always move toward the shallows.
- Leaving. Esc, `V`, "Back to orbit" or losing the pointer lock all return to
  orbit view. The orbit camera goes back to where it was.
- What you see on foot. Walk mode always shows the natural landscape. The
  plants carry the prediction, the HUD names it, and the minimap shows the
  cover map. The cover and confidence overlays are orbit-view tools. In orbit
  view, the "Terrain and vegetation" overlay shows the same plants.

**Measurements (D12).** Machine: desktop, Intel i7-11700, NVIDIA RTX 4060,
Fedora 44, Firefox (headless), 726×453 view, pixel ratio 1. This is NOT the
team's weakest laptop.

After D21 (sparse trees in forest patches), 2026-11-15: same machine,
full-viewport walk mode in a 1100×800 window, seed 7, default sliders, 10:00,
cycle off. No animals were on the map in this run.

| Preset | Walk fps | Draw calls | Triangles | Plants (drawn / placed) | Plant batches | Grass tufts |
| --- | --- | --- | --- | --- | --- | --- |
| low | 60 (display cap) | 33 | 49k | 1,353 / 1,941 | 78 / 122 | 0 |
| medium (default) | 60 (display cap) | 54 | 82k | 3,891 / 3,891 | 133 / 133 | 2,987 |
| high | 60 (display cap) | 55 | 116k | 6,478 / 6,478 | 137 / 137 | 5,497 |

- Placed plants are 33.6-33.7% of the D9 counts below on every preset.
- The backdrop (low preset, 30 fps cap) draws 26-33 draw calls and about
  47k triangles, 1,180 of 1,941 plants. Since D19 it also draws on the
  Sandbox while the orbit view is on screen, so that page pays for both
  renderers; the orbit view still draws on demand.

Before D21 (D9 placement, 726×453 view):

| Preset | Walk fps | Draw calls | Triangles | Plants (drawn / placed) | Plant batches | Grass tufts |
| --- | --- | --- | --- | --- | --- | --- |
| low | 60 (display cap) | 35–39 | 68–78k | about 3,700 / 5,757 | about 90 / 146 | 0 |
| medium (default) | 60 (display cap) | 56–66 | 154–215k | 11,563 / 11,563 | 151 / 151 | about 3,000 |
| high | 60 (display cap) | 58–65 | 238–283k | 19,271 / 19,271 | 154 / 154 | about 5,500 |

- Seed 7, default sliders. Draw calls change with where the walker looks,
  because each plant batch is frustum-culled.
- Animals add 2 draw calls (one instanced mesh per species), whatever their
  number; 409 animals were on the map in the check.
- Orbit view under the "Terrain and vegetation" overlay: 156 draw calls and
  334k triangles on a frame that also redraws the shadow map.
- To measure on another machine: enter walk mode and press `P`. The readout
  shows the frame rate, draw calls, triangles and instance counts. Record the
  weakest laptop here and tick the two open boxes (D2, D12).

**Still open, and why.**
- The 30 fps target on the weakest laptop (D2, D12): needs that laptop.
- Mouse look with a real click, and Esc from a real pointer lock (D8): the
  code path is built and the refused-lock path is checked, but a headless
  browser cannot grant a lock. Two minutes by hand in Chrome and Firefox.
- "Tonight": commit and push are yours.

Extended scope (D8-D13) adds walk mode, landscape visuals, day/night, a walk
HUD, quality settings, and optional save/share. It reads the live heightmap,
cover map, confidence, OOD array and animal positions from the shared contract
above; the contract does not change. All geometry and audio are procedural,
instanced low-poly meshes, shaders, or team-made. No AI-generated assets.
Three is 0.187.0 (r187); see "Library version notes" after D13 before using any
three.js addon API.

### D8. Walk mode (core)
- [x] A toggle switches between orbit view and first-person walk mode, with a smooth camera transition in both directions *(`viewMode` prop; the Sandbox toggle, `V`, and "Walk here" under the view. 1.1 s glide (position, direction, field of view, fog); instant with reduced motion)*
- [ ] Desktop: WASD movement and mouse look via `PointerLockControls`, with a visible "click to look" prompt before lock *(built: movement and the prompt were checked. Locking with a real click was NOT exercised: a headless browser cannot grant pointer lock. Check by hand)*
- [ ] Escape unlocks cleanly, returns to orbit view, and brings the prompt back *(built: Esc without a lock returns to orbit and the prompt is back on the next entry (checked). The unlock-by-Esc path needs the same hand check as above)*
- [x] Touch: on-screen joystick for movement and look-drag for the camera *(checked with synthetic touch pointer events; not tried on a real phone)*
- [x] Keyboard-only fallback when pointer lock is denied or unavailable *(arrow keys look, WASD walks, dragging also looks. Checked with a refused lock: the prompt changes and no console error is logged)*
- [x] `getGroundHeight(x, z)` interpolates the heightmap and the player follows it; unit test against a tiny known heightmap *(`world/walk.ts`; 3×3 test in `apps/web/test/walk.test.ts`. It is `sampleHeight` after `worldToCellF`, the convention Role 2 proposed: confirmed)*
- [x] `EYE_HEIGHT`, `WALK_SPEED`, `RUN_SPEED`, and `SLOPE_LIMIT` are named constants; the player cannot cross the map edge *(`world/walk.ts`; edge and slope tests)*
- [x] Water: shallow wading slows the player; deep water is blocked with a visible shoreline boundary (chosen behaviour, documented here) *(see "Walk mode: chosen behaviour" below)*
- [x] Reads the live heightmap: brush edits made in orbit view appear in walk mode with no reload *(one heightmap array for the mesh, the walker, the plants and the water)*
- [x] Reads the same heightmap and cover map as orbit view; the shared contract is unchanged

### D9. Landscape visuals (the "beautiful" part)
- [x] Vegetation instanced by predicted cover class: 7 distinct low-poly tree/shrub silhouettes and tints, one per class *(`world/vegetation.ts` (`SPECIES`) and `world/flora.ts`)*
- [x] Placement is procedural from the cover map with seeded randomness; the same seed gives the same forest (unit test on a tiny cover map)
- [x] OOD cells render visibly different: sparse and desaturated vegetation, so low-trust predictions show in the world, not only in the overlay *(35% of the plants, 0.8× size, pulled 80% toward grey; unit-tested)*
- [x] Ground detail near the player: grass tufts or ground scatter *(grass tufts within 9 cells of the walker; none on the low preset)*
- [x] Slope-based rock/dirt blending on the terrain material *(`world/terrainMaterial.ts`; off under the cover and confidence overlays so legend colors stay exact)*
- [x] Shoreline treatment where land meets water *(sand band above the waterline, wet ground below it)*
- [x] Water has an animated surface with transparency and simple shore foam or depth tint *(`world/water.ts`: ripples, depth tint and foam, from the heightmap, with no second render of the scene)*
- [x] Sky, fog, and soft shadows tuned so the valley reads as a place *(`world/sky.ts`; fog is the horizon color; PCF shadow map redrawn only when something changes. Tuned on screenshots, not yet by a person at a screen)*
- [x] A documented palette file holds every color; class tints, sky, fog, and water all read from it *(`world/palette.ts`)*
- [x] Herbivores and predators from Role 2's sim state are visible from walk mode at ground scale *(ground scale on foot, 2.4× in orbit view. The shapes were checked zoomed in from orbit; no walk-mode frame with an animal in view was captured)*
- [x] Distance culling or LOD: vegetation outside a named radius is dropped or simplified *(`drawDistance` per preset; 16-cell chunks beyond it are hidden. Seen on the low preset: 3,618 of 5,757 plants drawn)*
- [x] All vegetation geometry and textures are procedural or team-made; no AI-generated assets *(cones, cylinders, icosahedra and boxes built in code; no texture or model files)*

### D10. Day/night cycle
- [x] Time-of-day slider plus an optional auto-cycle toggle *(under the view and in Settings; `[` `]` and `T` in walk mode)*
- [x] Sun direction drives the directional light, sky color, fog color, water tint, and ambient light *(`world/daynight.ts`)*
- [x] Night has moon/stars or a dim night palette *(moon, stars and a dim palette)*
- [x] Cosmetic only: the visual sun is NOT the model's hillshade feature. The model's features come from the heightmap through `computeFeatures`, never from the visual sun; moving the slider changes no prediction *(a test fails if any file in `world/` imports the feature code)*
- [x] In-app About text request for Role 2: state that visual lighting is separate from hillshade, and that predictions use terrain-like inputs, not real ground truth *(Role 2 has it on the Responsible Use page and in Settings)*
- [x] Fixed-time fallback if the cycle drops below the D12 frame-rate target *(the cycle is paused, with a notice, before quality is lowered. The guard is unit-tested; the fallback never fired on this machine, so it was not seen live)*

### D11. Walk HUD and ML tie-in
- [x] HUD shows the cell under the player: predicted cover type, confidence, and a low-trust flag when the cell is OOD *(`world/WalkHud.svelte`; also the loading, unavailable and failed states)*
- [x] Pressing a key (for example E) opens the Site Probe for the cell underfoot; emits the same selection event as D4
- [x] Minimap or compass showing position and heading (cut first if behind) *(both: a cover minimap with a heading arrow, and a compass reading)*
- [x] A one-line notice stays visible: predictions are for terrain-like inputs, not real ground truth *(`notice` prop, pinned to the bottom of the view)*
- [x] Controls help overlay *(`H` inside the view; `?` for the app-wide help, which lists the same keys)*

### D12. Performance and quality settings
- [x] Quality presets (low / medium / high) control vegetation density, shadow quality, draw distance, and pixel-ratio cap *(`world/quality.ts`)*
- [x] Auto-downgrade or a clear warning if frame rate drops below the target for several seconds *(under 30 fps for 4 s: pause the day/night cycle, then lower the preset, then warn. Unit-tested guard; not seen live, because this machine never dropped below the target)*
- [ ] TARGET: 30+ fps in walk mode on the default preset on the team's weakest laptop. Measure and record the result here, naming the machine. Not yet measured *(still not measured on that laptop. See "Measurements" below for this machine and how to measure)*
- [x] Draw-call and instance counts for the default preset measured and recorded here (values pending measurement) *(see "Measurements" below)*
- [x] Dispose geometries, materials, and listeners when leaving walk mode or the page; no memory growth after 5 mode toggles *(11 geometries, 3 textures, 10 shader programs before and after 5 toggles)*
- [x] No console errors after toggling modes, resizing, and re-seeding *(headless Firefox, Nov 15)*

### D13. Save, load, and share world
**OPTIONAL.** Depends on Role 2. First thing cut.
- [x] Client side: `exportWorld()` and `importWorld()` use the seed, generation options, and brush edits stored as a compact delta (not the full heightmap), plus a version field *(export is `toSavedWorld()` and open is `openSavedWorld()` in `state/worldTerrain.ts`; the code and its validation are `importWorld()` / `exportShareCode()` in `world/share.ts`. The version is `schemaVersion` plus `modelVersion`, as Role 2 asked; `importWorld()` returns the world with its `modelVersion`)*
- [x] Seed and water level restorable from a plain `#name` style link only if it respects the hosting constraints for published pages; otherwise a share code the user pastes in *(both: Role 2's `#/world/<id>` link (agreed; needs the API) and an offline code, `graze1.…`, that needs no server)*
- [x] Hono + D1 interface proposed for Role 2 to confirm: `POST /api/worlds` (store a world, return an id) and `GET /api/worlds/:id` (fetch it), with size limits, validation, and no personal data stored. The API and the D1 table belong to Role 2 *(confirmed and built by Role 2: `docs/worlds-api.md`)*
- [x] Imported worlds are validated; bad or oversized data shows a friendly error and never crashes the app *(16 bad inputs and an oversized compressed code in the tests)*

Library version notes (three 0.187.0 / r187, matched by `@types/three` 0.187.0):
- Addons import from `three/addons/...` (the package-export alias), not `three/examples/jsm/...`, in this version.
- `PointerLockControls` (`three/addons/controls/PointerLockControls.js`) now extends the `Controls` base class. The camera is `controls.object`; older `getObject()` examples do not apply here. `disconnect()` and `dispose()` remove listeners, so call them in D12 cleanup. `lock()` needs a user gesture and can be denied (for example on iOS Safari), which is why D8 has touch and keyboard fallbacks.
- `Sky` (`three/addons/objects/Sky.js`) is a WebGL `ShaderMaterial` and works only with `WebGLRenderer`; the WebGPU `SkyMesh` in `three/webgpu` does not. In r187 the shader has built-in procedural clouds (`cloudCoverage`, `cloudDensity`, `cloudSpeed`, `time`) and a night-sky term, so D9/D10 need no cloud texture asset.
- `Water` (`three/addons/objects/Water.js`) is also WebGL-only (`WaterMesh` is the WebGPU variant). It needs a `waterNormals` texture for ripples: generate it procedurally or hand-author it, since we use no AI-generated assets. It re-renders the scene into a reflection target every frame, which costs draw calls; if the D12 frame-rate target is at risk, use a cheaper custom shader plane instead.
- `THREE.LOD`, `THREE.Fog` / `FogExp2`, and `THREE.InstancedMesh` are core, not addons. An `InstancedMesh` has one bounding sphere for all instances, so split vegetation into chunks for D9 distance culling, set `instanceMatrix.needsUpdate` after placement, and use `setColorAt()` / `instanceColor` for the per-class tints.
- `GLTFLoader` is `three/addons/loaders/GLTFLoader.js` and `mergeGeometries` is `three/addons/utils/BufferGeometryUtils.js`. Check both against r187 before D17. A `SkinnedMesh` cannot be instanced, so animated rigs are not used for the herd (see D18).
- Color management is on by default in 0.187.0 (`renderer.outputColorSpace` is `THREE.SRGBColorSpace`). Author the D9 palette file in sRGB hex so class tints, sky, fog, and water agree.

## Extended scope, round 2 (D14-D21)

*Added 2026-11-15. Design change: the app's background becomes the walk-mode view, walk mode gets an exit button and an info panel, animals slow down to walking pace, and the visuals open up to team-made `.glb` files.*

None of this changes the shared contract (heightmap, cover map, model output). D14-D16 need changes in Role 2's files; they are listed under "Changes needed in ROLE-2" below. Day 12 freeze, Day 13 captures and Day 14 buffer stay where they are.

### D14. Ambient backdrop is the walk view
Every page sits on a dimmed, live, ground-level view of the world. Walk mode lifts the dim and hands the view to the player.

- [ ] **Spike first (half a day), result recorded here:** how the one world is drawn behind the pages and in walk mode.
  - Option A: walk mode runs on the backdrop's renderer, which takes over input; the Sandbox's `WorldView` keeps orbit, brush and overlays.
  - Option B: the backdrop is its own ambient scene, and walk mode in `WorldView` becomes full-viewport.
  - Pick one and record the reason and the measured cost (draw calls, GPU resources, fps). The acceptance rule is the same for both: only one renderer draws at a time, the other stops its frame loop and frees its plants and shadow map, and the D12 cleanup counts stay flat.
  - **Amended by D19 (2026-11-15, team decision):** the backdrop keeps drawing on the Sandbox while the orbit view is on screen, so its camera never stops; both renderers draw there. Walk mode still takes the view alone: the backdrop stops its loop and frees its plants and shadow map. The Sandbox view still stops when it is off screen.
- [ ] The spinning orbit map is removed from the backdrop (`autoRotate` off, no overview camera).
- [ ] Ambient camera stands at `EYE_HEIGHT` on a seeded vantage on dry land, rides `getGroundHeight`, and turns continuously (see D19). No travel.
- [ ] The backdrop draws the walk look: sky, fog, shadows, water, plants, grass and animals, from the same live heightmap, cover map, OOD array and sim poses. This replaces the old "no sky, plants or shadows" backdrop rule; update the "Render on demand" note in `world/README.md`.
- [ ] Day/night keeps running behind every page. The backdrop reads the shared `timeOfDay` and `autoCycle`, and auto-cycle defaults to on (Role 2 default change). With reduced motion the time is frozen at its current value and the sky is still drawn at that time. The camera rotation is not part of this: see D19.
- [ ] Dim layer: `DIM_IDLE` (0.72 today) on every page when not walking, `DIM_WALK` = 0 in walk mode. One flat, uniform layer with no fade and no gradient (see D20). Both constants live in one place and are documented. *(done under D20: `DIM_IDLE` is now 0.84)*
- [ ] **Contrast:** secondary text (#8a9098) and body text keep at least 4.5:1 against the brightest backdrop frame (noon, clear sky, bright slope) on all three pages. Measure by sampling the rendered frame behind the text. If it fails, raise `DIM_IDLE` for the whole page; no gradient behind the content column (D20). Do not lower the text contrast.
- [ ] Idle cost: at most the `low` preset (no grass, short draw distance), capped at 30 fps, stopped while the tab is hidden, `low` by default on narrow screens (390 px). If the frame-rate guard fires, stop the cycle first, then freeze to a still frame.
- [ ] Graceful states: no cover map yet means terrain, sky and water only, and plants appear when predictions arrive. No WebGL 2 means the page stays black, as today. An empty world or a failed model never blocks the pages. The first frame fades in rather than popping.
- [ ] Pointer events: outside walk mode the backdrop ignores clicks, so pages stay clickable. In walk mode it takes pointer and touch input.
- [ ] Walk mode is entered from the Sandbox only (toggle, `V`, "Walk here"). Other pages show the dimmed ambient view and nothing else.
- [ ] Checks: unit test for the dim state machine (idle and walk, instant switch); headless Firefox at 390 px and 1100 px; no console errors on a fresh load; 5 page switches and 5 walk toggles with flat geometry, texture and program counts.

### D15. Leaving walk mode: exit button and info and settings panel
- [ ] A visible "Exit walk mode" button in the walk HUD, in the app's style (mono caps, 1 px border), touch target at least 44 × 44 px, clear of the joystick and minimap, and inside the safe-area insets.
- [ ] Under desktop pointer lock the cursor is hidden and cannot click the button. While locked, the HUD shows "Esc to exit" beside it. The button works whenever the pointer is free: unlocked, keyboard fallback, touch.
- [ ] Every exit path (button, Esc, `V`, lock lost) does the same thing: return to orbit view, keep the walker's position and heading, and call a new `onexit(reason)` prop. The Sandbox then opens the **Walk info and settings** panel. "Resume walking" returns to the same spot.
- [ ] The walker is placed on the nearest dry, walkable cell after a re-seed or a terrain edit under it, never in water deeper than `WADE_DEPTH_M` and never outside the map. Unit-tested on a tiny heightmap.
- [ ] `onexit` payload gives Role 2 what the panel needs: reason, walker cell, and the predicted class, confidence and low-trust flag of the cell last stood on.
- [ ] Panel content (Role 2 builds it; the wording is human-written, like the other notices):
  - **Info:** the controls; the cell last stood on (cover type, confidence, low-trust flag); "vegetation is a rendering of predicted classes, not photographs or ground truth"; scale (a diorama, one cell is 30 m, the walker is a giant); day/night is cosmetic and is not the hillshade feature; the animal pace note (D16); herd counts and rewilding score; links to the Model Report and Responsible Use.
  - **Settings:** quality preset, time of day and auto-cycle, animal speed (D16), mouse sensitivity, invert look Y, field of view, reduced motion, show low trust.
- [ ] New `WorldView` props for the three new settings: `lookSensitivity`, `invertLookY` and `fov`. Defaults reproduce today's behaviour; the field-of-view range is chosen and documented; stored through Role 2's settings store.
- [ ] Panel accessibility: focus moves into the panel when it opens and returns to "Walk here" when it closes, every control has a label, and it is fully keyboard operable. The help overlay lists exit and resume.
- [ ] Checks: at 390 px, walk, exit, change quality and time of day, resume, and the change shows with no reload; Model Report and Responsible Use links work from the panel and the world is still there on return; no console errors.

### D16. Animal pace in walk mode
- [ ] Default: in ground-level views (walk mode and the ambient backdrop), herbivores and predators move at about the walker's speed. The typical moving speed is `ANIMAL_PACE` (0.9) × `WALK_SPEED`. The default only ever slows the sim down, never speeds it up: `paceScale = min(1, ANIMAL_PACE × WALK_SPEED / medianMovingSpeed)`.
- [ ] `paceScale` is computed from the rules in `ecology.json`, not hand-set, so editing the rules keeps the pace right. Role 2 implements it in the sim clock; Role 1 owns `ANIMAL_PACE` and shows the measured speed in the `P` readout.
- [ ] "Animal speed" control: **Match walker** (default), 2×, 4×, Full sim speed, Paused. In Settings and in the D15 panel, plus a key that cycles it (listed in help). The choice is remembered per viewer (storage in try/catch).
- [ ] Orbit view and the Sandbox sim panel run at full sim speed. The pace follows the view mode.
- [ ] Determinism is untouched: the same seed and the same number of ticks give the same state at any speed; only the wall-clock tick rate changes. Role 2 unit test (N ticks at 1× and at 0.25× compare equal).
- [ ] Slowing the clock also slows breeding, starvation, the chart and the score per real second. The UI says so next to the control.
- [ ] Still smooth at the slowest setting: interpolation between ticks, no stepping, headings do not snap. Reduced motion keeps snapping to ticks.
- [ ] Animals still obey water and terrain through `getGroundHeight`. Running (`RUN_SPEED` 7) outpaces animals; that is intended.
- [ ] `P` readout adds: median animal speed in cells per second and the current multiplier.

### D17. Custom `.glb` models
Level A of `docs/custom-models.md` (vertex colours, no textures) is the target. The agent draft `custom-design-guide.md` moves into `docs/` and is corrected to match what is built.

- [ ] Ownership agreed with Role 2: Role 1 owns `apps/web/public/models/` and `world/models.ts`.
- [ ] `apps/web/public/models/manifest.json` ships from the start, with every slot empty. A missing file therefore never produces a 404 in the console. Each entry: `{ file, author, source: "team-made", version }`. Slots: the 7 plant silhouettes (names from `SPECIES`), `grassTuft`, `herbivore`, `predator`.
- [ ] `world/models.ts` loads with `GLTFLoader` and, per mesh, bakes the world matrix, makes it non-indexed, sets `tintMask` to 1 for materials named `crown*` and 0 for `trunk*`, `bark*` and everything else, fills `color` from vertex colours or the material colour, unifies the attributes, and merges into one geometry per slot.
- [ ] Swap-in: `Flora` and `Fauna` take a `Record<slot, BufferGeometry>` that starts with today's code-built shapes. Loaded shapes replace them when they arrive, and a failed slot keeps its default (404, parse error, over budget, bad attributes). The world always renders. A failure is one console warning, not an error.
- [ ] Validation at load and in the checker: triangle budget (tree or shrub up to 60, grass tuft up to 6, animal up to 200), file size (100 KB each, 1 MB in total), at least one mesh, required attributes, origin at the base (lowest point at Y ≈ 0), plausible height (trees about 1-1.4 units, shrubs about 0.3, animals about 0.5 long), and no skins or animations in instanced slots. Rejections name the file and the reason.
- [ ] `P` readout adds a models line, for example: `models: 7/10 custom, 3 default; spire.glb rejected: 74 triangles > 60`.
- [ ] `pnpm models:check` runs the same validation on `apps/web/public/models/` without a browser (for CI) and prints a table. It fails when `author` or `source: "team-made"` is missing.
- [ ] Provenance: no AI-generated assets (the D9 rule stays), and no downloaded libraries without a team decision. Each file has a line in `apps/web/public/models/CREDITS.md`.
- [ ] Animal facing: models face +X, and a unit test on a tiny asymmetric mesh checks that heading turns +X toward the direction of travel.
- [ ] The low-trust rule still works with custom shapes: an OOD plant from a custom model is sparse and grey (a test checks `tintMask`), and low-trust plants still look grey in the `P` check.
- [ ] Resources: loaded geometries are disposed in `Flora.dispose()` / `Fauna.dispose()`; the loader caches, so 5 walk/orbit toggles do not reload files and the geometry, texture and program counts stay flat.
- [ ] Re-measure draw calls, triangles and plant counts with the full custom set on all three presets and record them in "Measurements"; update the D9 asset line and the `world/README.md` file table.
- [ ] Dev loop: edit a `.glb` in `public/models/`, reload, and it shows with no code change. Documented in `docs/custom-models.md` with the Blender export settings (glTF Binary, +Y up, apply transforms and modifiers, flat shading, vertex colours on).
- [ ] OPTIONAL: a dev-only model preview (`?models=preview`) that shows all 10 slots on neutral ground at large size, plus the 32 px silhouette test from the guide.
- [ ] OPTIONAL: level B, the palette atlas texture from the guide. Only after level A works; the texture is disposed with the model and the tint mask is kept.

### D18. Motion and polish extras (OPTIONAL, cut first after D13)
- [ ] Wind sway on plants and grass: vertex shader displacement driven by the shared `uTime`, a per-plant phase from the instance position, stronger on grass. No new draw calls, one extra shader program, off with reduced motion, still shadows (guide 8.3).
- [ ] Animal leg swing and body bob: a custom `_LEGMASK` vertex attribute authored in the `.glb` (r187's loader should expose it as lowercase `_legmask`; verify), a per-instance phase, and a per-instance speed attribute filled in `Fauna.place()` so animals standing still stop walking in place (guide 8.4).
- [ ] Ground detail texture in `terrainMaterial.ts`, procedural, multiplied in only when `uNatural` is 1, so overlay colors stay exact.
- [ ] No frame or draw-call regression on the `P` readout, and the toggle check stays flat.

### D19. Backdrop camera never stops rotating
Amends the D14 camera item. The camera keeps turning the whole time, on the hero page and every other page.

- [x] The ambient camera turns continuously at a slow constant yaw (about 2-3° a second, a full circle in a couple of minutes). It does not pause, ping-pong at ±35°, or restart. The old "±35° look-around" wording is replaced. *(`AMBIENT_YAW_RATE_DEG_S` = 2.5, a full turn every 144 s, in `world/ambient.ts`. The ±35° swing and its constants are gone from the code and the comments)*
- [x] The rotation loop belongs to the ambient scene itself, not to any page. It keeps running across route changes (hero, Sandbox, Model Report, Responsible Use) and never resets on navigation. *(the clock lives in the backdrop's `WorldRenderer`, which `App.svelte` mounts once. Headless Firefox at 1100 px: the heading moved between two frames 5 s apart on the Sandbox top, the Sandbox scrolled down, Model Report, Responsible Use, and back on the Sandbox)*
- [x] Cause check: if the camera stops today, it is probably on-demand rendering. Orbit view only draws after `requestRender()`, so an ambient rotation that isn't counted as "animating" freezes after the first frame. Add the ambient rotation to the `animating` condition in `scene.ts` so it draws every frame, capped at 30 fps. *(not the cause here: the ambient view was already in `animating`. The cause was the D14 lease. On the Sandbox, which is the landing page, the orbit view is on screen, so the backdrop was handed a still frame and its camera stopped (measured: no change in 5 s). Fixed with `backdropLease` in `ambient.ts`: the backdrop now draws on every page and pauses only for walk mode. That amends D14's one-renderer rule; see the note under D14. Plus the old ±35° swing slowed to a stop at each end)*
- [x] Rotation advances from the shared clock (`#time`, with `dt` capped at 0.1 s), so it never jumps after a hidden tab. *(`stepAmbientClock` advances the backdrop's ambient clock by the same frame time `#time` uses, capped at `AMBIENT_MAX_DT_S` 0.1 s; the first frame after the loop restarts has dt 0. Unit-tested)*
- [x] Reduced motion is the one exception: the camera holds still and sky and water stay frozen, as in D14. *(unit-tested; in headless Firefox with `prefers-reduced-motion` the backdrop draws stills only on change, and frames 5 s apart differed only slightly, from plants loading in, not from the camera turning)*
- [x] Rotation stops only when walk mode takes the view. On exit it resumes from the heading the camera had when walk mode started. *(lease `covered` in walk mode, `draw` again after Esc (headless check); the clock does not move while nothing draws, so the heading picks up where it was (unit test). Also stops when the D14 frame-rate guard freezes the backdrop: see the last item)*
- [x] Pausing in a hidden tab (D14) is kept, since nothing draws then. *(unchanged: `visibilitychange` stops the loop. Not exercised headless)*
- [x] Test: a unit test steps the ambient camera for N frames and asserts the yaw keeps changing. A headless Firefox check at 1100 px and 390 px confirms the heading differs between two frames 5 s apart on the hero page, with no console errors. *(unit test: 10 minutes at 30 fps, every frame turns the same way by the same amount. Headless: 1100 px and 390 px (390 CSS px emulated as a 780 px window at 2× pixel ratio, since headless Firefox won't go narrower than 500 px), no console errors. At the emulated 390 px the backdrop drew at only 18-19 fps in headless Firefox, so the D14 guard (under 20 fps) froze it to a still frame after a few seconds. The guard is the documented fallback, not a bug; check on a real phone that it does not fire there)*

### D20. One flat, constant dim
Amends the D14 dim item. The dim becomes one flat layer: no fade in time and no gradient across the page (in the current build the centre column is darker than the sides).

- [x] Remove the fade and the gradient or vignette. `DIM_IDLE` is one fixed value applied on every page for the whole page lifetime, with no CSS transition, no animated opacity, and no gradient, vignette or radial mask. Every pixel of the backdrop gets the same dim. *(the content-column scrim (`COLUMN_SCRIM` and its linear gradient) and the 0.4 s fade are gone from `WorldBackdrop.svelte` and `ambient.ts`; headless check: one `.dim` layer at 0.84, transition 0 s, on every page. The world image itself still fades in once on first load, as D14 asks; that is not the dim)*
- [x] Walk mode switches the dim straight to `DIM_WALK` (0) on entry and straight back to `DIM_IDLE` on exit, with no animation. To keep the dim in walk mode too, set `DIM_WALK` equal to `DIM_IDLE`. *(headless: 0 in walk mode, 0.84 right after Esc. The walk view's own 0.4 s fade-in in `WorldView.svelte` was the same fade seen from the other side, so it is gone too; the camera glide (D8) stays)*
- [x] Both constants stay in one documented place. The reduced-motion branch of the dim state machine goes away, because there is nothing left to skip. *(`DIM_IDLE` and `DIM_WALK` in `world/ambient.ts`; `dimState(walking)` takes no reduced-motion argument)*
- [x] The unit test for the dim state machine now checks only the two fixed states and the instant switch. *(`apps/web/test/ambient.test.ts`, plus a test that the backdrop's markup has no transition, gradient, mask or column layer)*
- [x] The D14 contrast check still applies, but its "gradient behind the content column" fallback is withdrawn. If contrast fails, raise the one flat dim value for the whole page. Re-measure it with the final `DIM_IDLE`. *(it failed at 0.72 without the scrim (3.45:1 on the measured noon frame), so `DIM_IDLE` was raised to 0.84 for the whole page. Re-measured in headless Firefox at 1100 px, seed 7, noon, clear sky, 13 frames over one full turn: brightest pixel rgb(191, 217, 232) gives secondary text 4.94:1 and body text 11.0:1. 0.84 also passes against pure white (4.53:1), so no frame the sky can draw fails; unit-tested)*

### D21. Sparse trees: open plains with small forest patches
- [x] Overall tree density drops sharply, to about 25-35% of today's plant count on the medium preset. The exact number is chosen by eye and recorded in the measurements table. *(seed 7, medium: 3,891 plants, down from 11,563 (33.6%). Over 10 Sandbox-default worlds with real predictions: 29.4%, 19-34% per seed. Tuned on those numbers and one orbit and two walk frames; see "Measurements")*
- [x] Placement is clustered, not uniformly thinned. A seeded low-frequency noise field (a different octave from the terrain's) decides where forest patches go. Inside a patch, trees are dense. Outside it, density falls to near zero, which leaves open plains. *(`patchWeight` in `world/vegetation.ts`: seeded cellular noise on a 16-cell lattice, turned 35° off the map axes, with a value-noise wobble on the rim. Thresholded value noise was tried first and dropped: it gave 2-cell specks next to 25-cell merged blobs. Patch density 1.6×, plains 0.02×)*
- [x] Patches stay small: about 6-15 cells across (180-450 m), with plains between them. Named constants: `PATCH_SCALE`, `PATCH_THRESHOLD`, `PLAINS_DENSITY` and `PATCH_DENSITY`. *(all four, plus `PATCH_RADIUS_MIN` / `_MAX` (3 and 7.5 cells). Measured on 10 worlds: patches 6.6 cells across at the 10th percentile, 10.0 median, 15.5 at the 90th. Unit-tested)*
- [x] Cover class still decides which silhouette grows in a patch. Sparseness changes where plants go, not what they look like, so the map still shows the model's predicted classes. *(the patch field never reads the cover map; a test checks every plant against its cell's class)*
- [x] The OOD rule is unchanged (35% of plants, 0.8× size, grey). It applies on top of the patch density, so low-trust cells stay visibly sparser than trusted ones. *(unit test: low-trust cells keep 0.35 of the trees inside the same patches)*
- [x] Shrubs (Krummholz) and grass tufts keep their own density, so the plains are not bare. Grass covers the open ground. *(`Species.patchy` is false for Krummholz; grass placement is unchanged and covers every dry cell near the walker (medium: 2,987 tufts). Note: the shipped model predicted no Krummholz on the 10 measured worlds)*
- [x] Same seed and same cover map give the same patches (unit test on a tiny cover map). A test also checks the plains fraction: more than half the land cells have no tree. *(`apps/web/test/walk.test.ts`. Measured on 10 real worlds: 83% of land cells have no tree)*
- [x] Applies to the ambient backdrop, orbit "Terrain and vegetation" and walk mode alike. The three quality presets scale the patch density instead of changing the pattern, so low and high show the same layout. *(one `placeVegetation` call in `scene.ts` serves all three views. Seed 7: 33.7% / 33.6% / 33.6% of the old count on low / medium / high; a test checks the same share of trees stands in the patches on every preset)*
- [x] Re-measure draw calls, triangles and plant counts on all three presets, then update the "Measurements" table. Counts should drop, which gives headroom for the D17 custom models. *(see "Measurements". Medium: 54 draw calls and 82k triangles in walk mode, down from 56-66 and 154-215k)*
- [ ] Check by eye in walk mode that each class can still be told apart from the plants nearby, and that patches don't read as a regular grid. *(partly: on an orbit frame of seed 7 the patches are irregular and do not read as a grid, and two walk frames show tree clusters on grassy plains. Telling every class apart on foot needs a person at a screen)*

### Changes needed in ROLE-2
Mirror these in `docs/roles/app-and-sim.md`.

1. `WorldBackdrop.svelte`: drop the hard-coded `DIM` and any gradient or fade; use the ambient mode and the flat `DIM_IDLE` / `DIM_WALK` constants (D20), with the continuous rotation (D19); let pointer events through only in walk mode; stay mounted across pages. *(D19 and D20 parts done by Role 1 on 2026-11-15: one flat `.dim` layer from `dimState(walking)`, no column scrim or fade, lease from `backdropLease`. Role 2 to review)*
2. Settings store: auto-cycle default on; add `lookSensitivity`, `invertLookY`, `fov` and `animalSpeed`; keep working with empty, corrupt, blocked and full storage (tests).
3. Sandbox: open the Walk info and settings panel from `onexit`, with Resume; add exit and resume to the help overlay; pass the new `WorldView` props.
4. Sim clock: a time scale, `paceScale` computed from `ecology.json`, the median-speed helper, the determinism test, and the "slows the whole ecosystem" note next to the control.
5. Responsible Use / About (agent draft, human final): the background is a rendering of predicted classes and not a real place; custom models are team-made art, not data.
6. Hand `apps/web/public/models/` to Role 1.

### Gaps found while writing this section
- Pointer lock hides the cursor, so a clickable exit button alone is not enough on desktop; D15 covers it with the "Esc to exit" hint.
- A brightly lit backdrop can break the 4.5:1 text rule, so D14 has a contrast check at noon.
- Two WebGL scenes at once (backdrop plus Sandbox) would double GPU memory, so D14 starts with a spike.
- Slowing animals also slows the ecosystem, and the UI has to say so (D16).
- An optional `.glb` that 404s would log a console error, so the manifest always ships (D17).
- Not scheduled, in case there is time: animals that notice or avoid the walker (a sim rule, Role 2), and ambient sound (already in Stretch).

### Stretch (only if everything else is frozen by Day 10)
Walk mode, day/night, and shareable seeds are now in scope: see D8, D10, and D13.
- Ambient soundscape, composed and recorded by the team (no AI-generated assets)
- Photo mode: hide the HUD and capture a still

---

## Tonight (definition of done)

- [ ] Repo cloned, installed, and running on your machine
- [x] Seeded terrain mesh rendering with orbit camera, water plane, seed input, and water slider
- [ ] Committed and pushed

---

## Timeline

| Day | Target |
| --- | --- |
| 1 | Noise heightmap spike in three.js |
| 2-3 | D1 and D2 complete |
| 4-5 | D3 complete |
| 5-6 | D4 complete |
| 6-7 | D5 complete (needs Role 3's `model.json`; use a stub until then) |
| 8-10 | D6 complete |
| 10-11 | D7 complete |
| 12 | Freeze. Bug fixes only |
| 13 | Record screen captures and make the visuals for the slides |
| 14 | Buffer |

### Extended scope

The team is ahead of the original schedule above. These are targets, not a new
freeze. Day 12 freeze, Day 13 slides and captures, and Day 14 buffer stay where
they are.

| Target order | Deliverables |
| --- | --- |
| First (target) | D8 walk mode core, then D9 landscape visuals |
| Next (target) | D10 day/night, D11 walk HUD, D12 performance and quality |
| Then (target) | D14 ambient backdrop (spike first), D15 exit button and panel, D16 animal pace |
| After that (target) | D17 custom `.glb` models (level A) |
| Optional | D18 motion extras |
| Fixes (target) | D19 camera keeps rotating, D20 flat dim, D21 sparse trees |
| Last (target) | D13 save / load / share (OPTIONAL, first cut) |

---

## Cut order (if behind)

1. D13 (save / load / share; OPTIONAL)
2. D18 (sway, leg swing, ground texture; OPTIONAL)
3. D17 extras: model preview, level B texture, grass and animal slots (keep the 7 plant slots)
4. Day/night auto-cycle (keep a fixed time of day and the slider)
5. Minimap
6. Vegetation detail (grass tufts, ground scatter)
7. Lower quality presets (drop low / medium, keep high)

**Never cut:** the OOD overlay, the brush, the cover overlay, D8 (walk mode core), the D15 exit button, the D14 rule of one renderer drawing at a time (as amended by D19: in walk mode only the walk view draws), the D14 text contrast check, and the D12 cleanup checks (dispose on exit, no memory growth after 5 toggles, no console errors).

---

## You must be able to explain in the defense

- How elevation is scaled into the dataset's range, and why
- Why predictions on generated terrain are not predictions for Minecraft biomes
- How the heightmap becomes model inputs (slope, aspect, hillshade, water distance), at least at a high level
- What the OOD overlay means and why it is there
- How `getGroundHeight(x, z)` turns the player's `(x, z)` into a ground height: bilinear interpolation of the four heightmap cells in the same row-major, 30 m contract, and why interpolation (not the nearest cell) keeps walking smooth
- Why the visual day/night sun is separate from the hillshade feature: hillshade is a fixed model input computed from the heightmap by `computeFeatures` (`docs/feature-contract.md`), so moving the sun slider changes no prediction
- How vegetation is placed from predicted classes, and what it looks like when the model is unsure: seeded instancing per cover class, with sparse / desaturated plants on OOD cells
- Why the background is the walk view, how it is dimmed, and why only one renderer draws at a time (D14)
- Why the exit button needs an "Esc to exit" hint under pointer lock, and what survives an exit (D15)
- Why animals are slowed to about the walker's speed, how `paceScale` is computed from `ecology.json`, and why determinism is unaffected (D16)
- How a `.glb` becomes an instanced plant (tint mask, budgets, fallback) and why only team-made assets are allowed (D17)

---

## Working rules

- Don't change the heightmap format without telling the other two and updating `docs/feature-contract.md`.
- "Done" means typecheck and tests pass.
- Let OpenCode draft the code. You read and understand every file that touches the contract.

---

## Needs from other roles

| Role | Needed |
| --- | --- |
| Role 2 (App and Sim) | The Sandbox wiring is done (2026-11-15): `Sandbox.svelte` passes every `WorldView` prop in `docs/app-state.md`, and the flags in `state/worldFeatures.ts` are all true. Please review that change in your files (`Sandbox.svelte`, `worldFeatures.ts`, `HelpOverlay.svelte`), then tick your D9 and D11 items that were waiting on walk mode. The offline share code is new: say if you want it documented differently in `docs/worlds-api.md`. |
| Role 2, round 2 | Six changes listed under "Changes needed in ROLE-2" (D14-D17): backdrop wiring, settings, the Walk info panel, sim pace, wording, and handing over `public/models/`. Please reply with what you accept. |
| Role 3 (ML) | Nothing new. D17 does not touch the model files. |