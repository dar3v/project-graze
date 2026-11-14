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
- [ ] Orbit camera, water plane, seed input, water-level slider
- [ ] Runs at 30+ fps on the team's weakest laptop

### D3. Brush (Days 4-5)
- [x] Raise, lower, flatten, with radius and strength controls
- [x] Mesh updates only the touched region
- [x] Emits a debounced `onHeightmapChange(dirtyRect)` event so the model re-predicts without lag

### D4. Cell picking (Days 5-6)
- [x] Clicking the terrain selects a cell `(x, y)` and highlights it
- [ ] Emits the selection to Role 2's Site Probe panel

### D5. Overlays (Days 6-7)
- [x] Cover-type overlay using class colors read from `model_card.json`
- [x] Confidence overlay
- [x] **OOD overlay:** cells flagged as unlike the training data are visibly marked ("low trust")
- [x] Toggle control and a legend

### D6. Animals (Days 8-10)
- [x] Instanced meshes for one herbivore and one predator
- [ ] Positions come from Role 2's sim state; no sim logic in the renderer

### D7. Polish and robustness (Days 10-11)
- [x] Handles window resize
- [x] Friendly message if WebGL is unavailable
- [ ] Loading state while the model loads
- [ ] No console errors on a fresh load

Implementation notes (2026-11-14):
- Code is in `packages/sim/terrain/` and `apps/web/src/lib/world/` (see that folder's README).
- D2 "Orbit camera, water plane, seed input, water-level slider": the camera and water plane are done. The seed input and water slider already exist on the Sandbox page, which still shows the 2D placeholder map. They work in 3D once `WorldView` replaces `MapView` (Role 2 wiring).
- D2 "30+ fps": not measured on the team's weakest laptop yet. Rendering is on demand and the pixel ratio is capped.
- D4 "Emits the selection to the Site Probe", D6 "Positions come from the sim", and D7 "Loading state": `WorldView` has `onpick`, `herbivores`/`predators` and `busy` props. They take effect once the Sandbox page passes them.
- D5 class colors come from `apps/web/src/lib/sandbox/palette.ts` by class index, because `model_card.json` has no color field.
- D7 "No console errors on a fresh load": checked in headless Firefox on the built app with the 3D backdrop. Check again after the Sandbox wiring.

Extended scope (D8-D13) adds walk mode, landscape visuals, day/night, a walk
HUD, quality settings, and optional save/share. It reads the live heightmap,
cover map, confidence, OOD array and animal positions from the shared contract
above; the contract does not change. All geometry and audio are procedural,
instanced low-poly meshes, shaders, or team-made. No AI-generated assets.
Three is 0.187.0 (r187); see "Library version notes" after D13 before using any
three.js addon API.

### D8. Walk mode (core)
- [ ] A toggle switches between orbit view and first-person walk mode, with a smooth camera transition in both directions
- [ ] Desktop: WASD movement and mouse look via `PointerLockControls`, with a visible "click to look" prompt before lock
- [ ] Escape unlocks cleanly, returns to orbit view, and brings the prompt back
- [ ] Touch: on-screen joystick for movement and look-drag for the camera
- [ ] Keyboard-only fallback when pointer lock is denied or unavailable
- [ ] `getGroundHeight(x, z)` interpolates the heightmap and the player follows it; unit test against a tiny known heightmap
- [ ] `EYE_HEIGHT`, `WALK_SPEED`, `RUN_SPEED`, and `SLOPE_LIMIT` are named constants; the player cannot cross the map edge
- [ ] Water: shallow wading slows the player; deep water is blocked with a visible shoreline boundary (chosen behaviour, documented here)
- [ ] Reads the live heightmap: brush edits made in orbit view appear in walk mode with no reload
- [ ] Reads the same heightmap and cover map as orbit view; the shared contract is unchanged

### D9. Landscape visuals (the "beautiful" part)
- [ ] Vegetation instanced by predicted cover class: 7 distinct low-poly tree/shrub silhouettes and tints, one per class
- [ ] Placement is procedural from the cover map with seeded randomness; the same seed gives the same forest (unit test on a tiny cover map)
- [ ] OOD cells render visibly different: sparse and desaturated vegetation, so low-trust predictions show in the world, not only in the overlay
- [ ] Ground detail near the player: grass tufts or ground scatter
- [ ] Slope-based rock/dirt blending on the terrain material
- [ ] Shoreline treatment where land meets water
- [ ] Water has an animated surface with transparency and simple shore foam or depth tint
- [ ] Sky, fog, and soft shadows tuned so the valley reads as a place
- [ ] A documented palette file holds every color; class tints, sky, fog, and water all read from it
- [ ] Herbivores and predators from Role 2's sim state are visible from walk mode at ground scale
- [ ] Distance culling or LOD: vegetation outside a named radius is dropped or simplified
- [ ] All vegetation geometry and textures are procedural or team-made; no AI-generated assets

### D10. Day/night cycle
- [ ] Time-of-day slider plus an optional auto-cycle toggle
- [ ] Sun direction drives the directional light, sky color, fog color, water tint, and ambient light
- [ ] Night has moon/stars or a dim night palette
- [ ] Cosmetic only: the visual sun is NOT the model's hillshade feature. The model's features come from the heightmap through `computeFeatures`, never from the visual sun; moving the slider changes no prediction
- [ ] In-app About text request for Role 2: state that visual lighting is separate from hillshade, and that predictions use terrain-like inputs, not real ground truth
- [ ] Fixed-time fallback if the cycle drops below the D12 frame-rate target

### D11. Walk HUD and ML tie-in
- [ ] HUD shows the cell under the player: predicted cover type, confidence, and a low-trust flag when the cell is OOD
- [ ] Pressing a key (for example E) opens the Site Probe for the cell underfoot; emits the same selection event as D4
- [ ] Minimap or compass showing position and heading (cut first if behind)
- [ ] A one-line notice stays visible: predictions are for terrain-like inputs, not real ground truth
- [ ] Controls help overlay

### D12. Performance and quality settings
- [ ] Quality presets (low / medium / high) control vegetation density, shadow quality, draw distance, and pixel-ratio cap
- [ ] Auto-downgrade or a clear warning if frame rate drops below the target for several seconds
- [ ] TARGET: 30+ fps in walk mode on the default preset on the team's weakest laptop. Measure and record the result here, naming the machine. Not yet measured
- [ ] Draw-call and instance counts for the default preset measured and recorded here (values pending measurement)
- [ ] Dispose geometries, materials, and listeners when leaving walk mode or the page; no memory growth after 5 mode toggles
- [ ] No console errors after toggling modes, resizing, and re-seeding

### D13. Save, load, and share world
**OPTIONAL.** Depends on Role 2. First thing cut.
- [ ] Client side: `exportWorld()` and `importWorld()` use the seed, generation options, and brush edits stored as a compact delta (not the full heightmap), plus a version field
- [ ] Seed and water level restorable from a plain `#name` style link only if it respects the hosting constraints for published pages; otherwise a share code the user pastes in
- [ ] Hono + D1 interface proposed for Role 2 to confirm: `POST /api/worlds` (store a world, return an id) and `GET /api/worlds/:id` (fetch it), with size limits, validation, and no personal data stored. The API and the D1 table belong to Role 2
- [ ] Imported worlds are validated; bad or oversized data shows a friendly error and never crashes the app

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
- [ ] Seeded terrain mesh rendering with orbit camera, water plane, seed input, and water slider
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
| Role 2 (App and Sim) | Replace `MapView` with `WorldView` on the Sandbox page and pass `onpick`, `herbivores` / `predators`, and `busy`. Own the Hono + D1 endpoints for D13 (`POST /api/worlds`, `GET /api/worlds/:id`) and the in-app About text on visual lighting vs. the hillshade feature. |
| Role 3 (ML) | Nothing new. |
