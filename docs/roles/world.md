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
- Color management is on by default in 0.187.0 (`renderer.outputColorSpace` is `THREE.SRGBColorSpace`). Author the D9 palette file in sRGB hex so class tints, sky, fog, and water agree.

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
| Last (target) | D13 save / load / share (OPTIONAL, first cut) |

---

## Cut order (if behind)

1. D13 (save / load / share; OPTIONAL)
2. Day/night auto-cycle (keep a fixed time of day and the slider)
3. Minimap
4. Vegetation detail (grass tufts, ground scatter)
5. Lower quality presets (drop low / medium, keep high)

**Never cut:** the OOD overlay, the brush, the cover overlay, D8 (walk mode core), and the D12 cleanup checks (dispose on exit, no memory growth after 5 toggles, no console errors).

---

## You must be able to explain in the defense

- How elevation is scaled into the dataset's range, and why
- Why predictions on generated terrain are not predictions for Minecraft biomes
- How the heightmap becomes model inputs (slope, aspect, hillshade, water distance), at least at a high level
- What the OOD overlay means and why it is there
- How `getGroundHeight(x, z)` turns the player's `(x, z)` into a ground height: bilinear interpolation of the four heightmap cells in the same row-major, 30 m contract, and why interpolation (not the nearest cell) keeps walking smooth
- Why the visual day/night sun is separate from the hillshade feature: hillshade is a fixed model input computed from the heightmap by `computeFeatures` (`docs/feature-contract.md`), so moving the sun slider changes no prediction
- How vegetation is placed from predicted classes, and what it looks like when the model is unsure: seeded instancing per cover class, with sparse / desaturated plants on OOD cells

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
| Role 3 (ML) | Nothing new. |
