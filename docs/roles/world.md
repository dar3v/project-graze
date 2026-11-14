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
- [ ] `generateHeightmap(seed, options)` returns a 128×128 `Float32Array` using seeded fBm noise
- [ ] Same seed always gives the same output (unit test)
- [ ] Elevation is scaled into the dataset's range per the contract (unit test on min/max)
- [ ] Options: seed, roughness, water level

### D2. Scene and mesh (Days 2-3)
- [ ] Low-poly mesh with vertex colors (no voxels)
- [ ] Orbit camera, water plane, seed input, water-level slider
- [ ] Runs at 30+ fps on the team's weakest laptop

### D3. Brush (Days 4-5)
- [ ] Raise, lower, flatten, with radius and strength controls
- [ ] Mesh updates only the touched region
- [ ] Emits a debounced `onHeightmapChange(dirtyRect)` event so the model re-predicts without lag

### D4. Cell picking (Days 5-6)
- [ ] Clicking the terrain selects a cell `(x, y)` and highlights it
- [ ] Emits the selection to Role 2's Site Probe panel

### D5. Overlays (Days 6-7)
- [ ] Cover-type overlay using class colors read from `model_card.json`
- [ ] Confidence overlay
- [ ] **OOD overlay:** cells flagged as unlike the training data are visibly marked ("low trust")
- [ ] Toggle control and a legend

### D6. Animals (Days 8-10)
- [ ] Instanced meshes for one herbivore and one predator
- [ ] Positions come from Role 2's sim state; no sim logic in the renderer

### D7. Polish and robustness (Days 10-11)
- [ ] Handles window resize
- [ ] Friendly message if WebGL is unavailable
- [ ] Loading state while the model loads
- [ ] No console errors on a fresh load

### Stretch (only if everything else is frozen by Day 10)
Walk mode, day/night, shareable seeds through a URL parameter.

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

---

## Cut order (if behind)

1. Walk mode, day/night, shareable seeds
2. Confidence overlay
3. Animal polish

**Never cut:** the OOD overlay, the brush, the cover overlay.

---

## You must be able to explain in the defense

- How elevation is scaled into the dataset's range, and why
- Why predictions on generated terrain are not predictions for Minecraft biomes
- How the heightmap becomes model inputs (slope, aspect, hillshade, water distance), at least at a high level
- What the OOD overlay means and why it is there

---

## Working rules

- Don't change the heightmap format without telling the other two and updating `docs/feature-contract.md`.
- "Done" means typecheck and tests pass.
- Let OpenCode draft the code. You read and understand every file that touches the contract.
