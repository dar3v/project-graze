# Ecology rules

**These are assumptions, not model output.** The herd simulation is hand-written
rules. It is not machine learning, and the rules have not been fitted to or
checked against field data. The only ML input is the cover map: one predicted
cover type per cell, which sets how much food that cell can hold.

The rules live in [`packages/sim/herd/ecology.json`](../packages/sim/herd/ecology.json).
The app validates the file at load time and shows the full rules table under
the simulation, labeled "assumptions, not model output".

## Why the simulation is not ML

Nothing in `packages/sim/herd` learns from data. Each number is a value we
picked so the dynamics look plausible and interesting (herds grow, overgraze,
get hunted, recover). Changing a number changes the outcome directly, with no
training step. That is why the UI keeps the rules visible and separate from
the model's predictions.

## Tick order

One tick, in this order (`packages/sim/herd/src/sim.ts`):

1. **Vegetation regrows.** Each land cell gains `regrowthByClass[c] * foodByClass[c]`
   biomass, up to `foodByClass[c]`.
2. **Herbivores**, in a fixed order: age +1, lose `metabolismPerTick` energy,
   then move. With probability `wanderChance` the move is random; otherwise the
   herbivore goes to the cell with the most biomass within `moveRadius`. It
   then eats up to `biteSize` biomass, gaining `energyPerBiomass` energy per
   unit (capped at `maxEnergy`). It dies of starvation at energy ≤ 0, or of
   old age past `maxAge`. If its energy is ≥ `reproduceEnergyThreshold`, then
   with probability `reproduceChance` (and below `maxPopulation`) it gives
   `reproduceCost` energy to one offspring on its cell.
3. **Predators** (if `enabled`): age and metabolism as above. A predator looks
   for the nearest herbivore within `huntRadius` and steps up to `moveRadius`
   toward it. If it ends adjacent, the kill succeeds with probability
   `killChance` and the predator gains `energyPerKill`. Otherwise it wanders.
   Death and breeding work as for herbivores.
4. Births and deaths are counted and written to the event log. History stores
   the populations and the vegetation level.

Animals never stand on water. Every random draw comes from one seeded PRNG
stored in the sim state, so **the same map, rules and seed always give the
same run** (unit-tested in `packages/sim/herd/test/sim.test.ts`).

## Terrain edits

What happens when the map changes under a sim, in `SimPanel.svelte` and
`applyMapChange` in `sim.ts`:

- **New landscape** (a new terrain seed, band center, relief, roughness or
  valley; or a loaded world): the sim restarts with the same sim seed on the
  first cover map predicted for the new terrain. The same terrain plus the
  same sim seed always gives the same run.
- **Same landscape, edited** (brush strokes, the water slider): the run keeps
  going.
  - Animals, ages, energy, tick count and RNG state are kept.
  - Each cell's food capacity and regrowth follow its new predicted class.
    Biomass is capped at the new capacity, and a cell that just rose out of
    the water starts empty and regrows.
  - An animal standing on a cell that is now water moves to the nearest land
    cell (Chebyshev rings, fixed scan order).
  - If no land is left at all, the animals are removed.
  - One "Terrain changed" line goes to the event log.
  - No random numbers are drawn, so a recorded sequence of edits replays
    exactly (unit-tested in `packages/sim/herd/test/view.test.ts`).

## Rendering contract

The sim has no rendering code. The renderer (Role 1) reads
`snapshotPoses` / `interpolateSnapshot` from `packages/sim/herd/src/view.ts`,
which give `[x, y, heading]` per animal in grid-cell coordinates. It lifts
each animal onto the ground with `sampleHeight` (bilinear). The sim ticks on
its own clock, and the page interpolates between ticks every frame. Details
are in `docs/app-state.md`, "Sim view for the renderer".

## Values and rationale

Per cover class, in `model_card.json` class order. The current values assume
the Covertype order: Spruce/Fir, Lodgepole Pine, Ponderosa Pine,
Cottonwood/Willow, Aspen, Douglas-fir, Krummholz.

| Class (assumed order) | Food capacity | Regrowth / tick | Rationale (our assumption) |
| --- | ---: | ---: | --- |
| Spruce/Fir | 3 | 0.6% | Dense conifer, little understory forage |
| Lodgepole Pine | 2 | 0.6% | Dense stands, poor forage |
| Ponderosa Pine | 5 | 1.0% | Open stands with grass understory |
| Cottonwood/Willow | 9 | 1.4% | Riparian browse, best forage |
| Aspen | 8 | 1.4% | Rich understory, favored browse |
| Douglas-fir | 4 | 0.8% | Mixed |
| Krummholz | 1 | 0.3% | Treeline, harsh and slow |

The animal parameters are in `ecology.json` and are shown in the app. They
were tuned by hand on 128×128 generated maps so that herbivores and predators
cycle without one side going extinct in most seeds. That tuning is the only
"fitting" involved, and it was done by eye.

## Rewilding score

Implemented in `packages/sim/herd/src/score.ts`. Keep the two in sync.

```
score = round(100 * (wD * D + wH * S_herbivore + wP * S_predator))
```

- **Habitat diversity `D`**: Shannon entropy of the cover classes over land
  cells, divided by `ln(K)` for `K` classes. 0 means one class everywhere;
  1 means every class is equally common. Rewards worlds where the model
  predicts a mix of habitats.
- **Population stability `S`** for each species, over the last 200 ticks:
  - 0 if the species is extinct at the latest tick;
  - otherwise `presence * max(0, 1 - CV)`, where `presence` is the share of
    ticks with population > 0 and `CV` is the standard deviation divided by the
    mean (coefficient of variation).

  Rewards populations that persist and do not swing wildly.
- **Weights:** `wD = 0.3`, `wH = 0.4`, `wP = 0.3`. With predators disabled:
  `wD = 0.4`, `wH = 0.6`.
- With fewer than 50 history samples the score is marked **provisional**.

What the score does not mean: it is not a measure of real ecological health.
It rewards what our rules reward. A world can score well here and still be
nonsense ecologically.

## Editing the rules

Edit `ecology.json` and reload. Invalid values (negative numbers,
probabilities above 1, wrong array lengths for the model's class count) are
reported in the UI, and the simulation is disabled until they are fixed. The
app does not crash.
