# Glossary

Domain terms used across the app, the ML pipeline and the docs. Use these
names in code and in reviews. Add terms here when a new concept gets a name.

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Heightmap** | `Float32Array(size * size)` of heights in meters, row-major (`index = y * size + x`), `y = 0` is north, cells are 30 m. | `packages/sim/terrain` (generation, brush) |
| **Terrain sample** | The 8 raw values the model reads for one cell: elevation, slope, aspect, three hillshades, horizontal and vertical distance to water. Type `TerrainSample`. "Raw inputs" and "cell inputs" in older notes mean the same thing. | `@graze/features` |
| **Sample key order** | `TERRAIN_SAMPLE_KEYS`: the single order of the 8 values whenever samples are packed into a buffer. | `@graze/features` |
| **Packed inputs** | `TERRAIN_SAMPLE_DIM` numbers per cell in sample key order, one buffer for the whole grid. What the Worker batch takes. Read a cell with `sampleAt`, write one with `packSample`. | `@graze/features` |
| **Terrain-inputs module** | Heightmap + water level → packed inputs and water mask (`heightmapToInputs`; `heightmapToSamples` for one object per cell). The only implementation; the app and training both call it. | `packages/features/src/terrain.ts` |
| **SUN** | The three sun positions used for hillshade, fitted to the Covertype hillshade columns. Part of the shared contract. | `@graze/features` |
| **Feature vector** | The 9 model features computed from a terrain sample (aspect becomes sin and cos), in `FEATURE_NAMES` order. | `@graze/features` (`computeFeatures`) |
| **Cover map** | `Uint8Array` of predicted cover-type class indices per cell, in `model_card.json` class order. | app Worker batch result |
| **OOD** | Out of distribution: an input outside its training range, or a combination of inputs far from the training data. | model card, Worker |
| **Ecology rules** | Hand-written herd-simulation assumptions (`ecology.json`). Not model output. | `packages/sim/herd` |
