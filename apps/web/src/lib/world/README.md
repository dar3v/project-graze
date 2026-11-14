# World (Role 1)

The 3D terrain: mesh, water, camera, brush, picking, overlays and animals.
Terrain generation and the terrain-to-inputs math live in
[`packages/sim/terrain`](../../../../../packages/sim/terrain/src/index.ts), which
is three-free and unit-tested. Import it here through `./terrain.ts`.

| File | What it is |
| --- | --- |
| `index.ts` | `mountWorld(target, { reducedMotion })` for the page background (picked up by `../backdrop/WorldBackdrop.svelte`), plus re-exports |
| `scene.ts` | `WorldRenderer`: the three.js scene. Draws what it is given and has no sim or model logic |
| `WorldView.svelte` | Interactive sandbox view with tools, overlay select, OOD toggle and legend. Used by the Sandbox page (`../routes/Sandbox.svelte`) |
| `colors.ts` | Vertex colors for the terrain, cover, confidence and OOD overlays (three-free, tested) |
| `coords.ts` | Cell to world coordinate mapping (tested) |
| `batcher.ts` | Debounced `onHeightmapChange(dirtyRect)` (tested) |

Tests: `apps/web/test/world.test.ts` and `packages/sim/terrain/test/terrain.test.ts`.

## Conventions

- One world unit is one cell (30 m). Vertex `(x, y)` sits at the center of cell
  `(x, y)`. North (`y = 0`) is `-Z`, and east is `+X`.
- Heights are drawn with a 2× vertical exaggeration (`VERTICAL_EXAGGERATION`).
  This affects only the drawing, never the heightmap or the model inputs.
- The brush clamps heights to the `elevation` range it is given. Pass the
  training range from `model_card.json`.

## Using `WorldView` on the Sandbox page (Role 2 wiring, not done yet)

```svelte
<WorldView
  heightmap={heightM}            // Float32Array the brush edits in place
  size={GRID} cellSizeM={CELL_SIZE_M} waterLevelM={waterLevel}
  elevation={{ min: elevation.min, max: elevation.max }}
  classes={card.classes} {cover} {confidence} {ood}
  selected={probeOpen ? $selectedCell : null}
  herbivores={positions?.herbivores} predators={positions?.predators}
  busy={predicting ? 'Predicting…' : null}
  onpick={pick}                  // already calls selectCell(...)
  onheightmapchange={() => recomputeInputsAndPredict()}
/>
```

The page has to keep `heightM` as a mutable array (`$state.raw`), not a
`$derived`. Each `onheightmapchange` should recompute `heightmapToInputs` (`@graze/features`) and
run the existing debounced batch. Water distance is global, so the whole grid
is recomputed, which takes about 16k cells and a few ms. The rect is padded by
one cell because slope, aspect and hillshade use central differences. It is
there for callers that want to do less work.
`confidence` is the batch result's `confidence` array. The page does not keep
it yet.

## Design decisions

- **Default relief is 20% of the elevation range** (about 400 m over 3.84 km).
  At roughness 0.5 this gives a mean slope of about 15°. Covertype's mean
  slope is about 14°. Using the full range gives slopes far outside the
  training data, so most cells would be flagged OOD.
- **Class colors** come from `../sandbox/palette.ts` by class index.
  `model_card.json` has no color field. If Role 3 adds one, read it in
  `WorldView.svelte` (`classColors`).
- **Flat shading** computes normals per pixel, so sculpting only re-uploads the
  touched rows of the position and color buffers and never recomputes normals.
- **Render on demand.** Frames are drawn only after a change or while the
  camera moves. The backdrop auto-rotates unless the user has
  `prefers-reduced-motion` set.
- **WebGL 2 is required** (three r163+). Without it, `WorldView` shows a
  message and the backdrop stays black.
