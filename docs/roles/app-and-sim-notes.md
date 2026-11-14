# Role 2 notes: App and Sim

What you own, how it works, what you will be asked in the defense, and what is
still open. Code paths are given so you can show the actual code when asked.

---

## 1. What you own

| Area | Path |
| --- | --- |
| App shell, routes, footer | `apps/web/src/App.svelte`, `src/lib/router.ts`, `src/lib/components/Footer.svelte` |
| 3D background mount point | `src/lib/backdrop/` (the 3D scene itself is Role 1's `src/lib/world/`) |
| Inference Worker | `src/lib/model/` (`worker.ts`, `client.ts`, `engine.ts`, `inference.ts`, `loader.ts`) |
| Site Probe | `src/lib/probe/SiteProbe.svelte`, `src/lib/model/validation.ts` |
| Model Report | `src/lib/routes/ModelReport.svelte` |
| Responsible Use | `src/lib/routes/ResponsibleUse.svelte` (draft; the team rewrites it) |
| Herd simulation | `packages/sim/herd/` (`ecology.json`, `src/sim.ts`, `src/score.ts`) |
| Docs | `docs/ecology-rules.md`, `docs/feature-contract.md` (proposal) |

You do **not** edit: `src/lib/world/` and `packages/sim/terrain/` (Role 1),
`packages/features/`, `ml/` and the contents of `model.json` (Role 3).

Commands: `pnpm web:dev` (the app), `pnpm test` (45 tests), `pnpm typecheck`,
`pnpm web:build`. `pnpm run dev` is the Hono Worker, not the app.

---

## 2. How it works, in one pass

1. **Terrain to raw inputs.** A 128×128 heightmap (meters, 30 m cells) becomes
   8 raw inputs per cell: elevation, slope, aspect, three hillshades, and
   horizontal and vertical distance to water
   (`heightmapToInputs` in `@graze/features`, the only implementation; the
   ML pipeline runs the same code).
2. **Raw inputs to features.** `computeFeatures` from `@graze/features` turns
   aspect into sin and cos. Training uses the **same function**, so
   preprocessing cannot drift.
3. **Worker.** The main thread sends a `Float32Array` (16384 × 8) to the Web
   Worker. The Worker scales the features, runs the model, and returns a class
   index, a confidence, and an OOD flag per cell.
4. **Cover map to sim.** The predicted class per cell sets how much food the
   cell holds (`ecology.json`). Herbivores eat it, predators eat herbivores.
5. **Site Probe.** Clicking a cell prefills the form. Validation runs, then the
   Worker's `explainOne` returns the probabilities, the sensitivity, and the
   explanation sentence.

---

## 3. The four things the brief says you must explain

### Q1. What happens between pressing Predict and seeing a prediction?

1. `validateForm` (`validation.ts`) checks every field:
   - empty → error "Required.";
   - not a plain number (`abc`, `1,000`, `NaN`, `1e999`) → error;
   - outside `hardMin`/`hardMax` (physically impossible, e.g. slope 95°) →
     error. Nothing is sent to the model;
   - outside `min`/`max` (the training range) → **warning only**. The
     prediction still runs, but it is flagged.

   All of these ranges come from `model_card.json`, not from code.
2. `explainOne(sample)` posts a message to the Web Worker (`client.ts`).
3. In the Worker, `computeFeatures` turns aspect into sin and cos, giving the
   same 9-feature vector used in training.
4. The scaler from `model.json` standardizes the vector. The model (softmax,
   MLP or forest) produces 7 probabilities, and the predicted class is the
   argmax.
5. OOD check: the prediction is flagged if any input is outside its training
   range, **or** if the detector distance is above its threshold.
6. Sensitivity: each input is moved ±10% of its training range and the
   probability change is recorded. The largest change becomes the
   one-sentence explanation.
7. The result comes back to the page: class, bars, sentence, warnings.

Nothing leaves the browser. There is no server call.

### Q2. Why is the herd simulation not machine learning, and how does the UI say so?

- Nothing in it learns from data. Every number in `ecology.json` was chosen
  by us and tuned by eye so the populations cycle.
- Its only ML input is the cover map (the class per cell).
- The UI puts the full rules table under the sim with the label
  **"Assumptions, not model output"**, and the README and
  `docs/ecology-rules.md` say the same.
- The sim is deterministic: same map + rules + seed = same run (unit-tested).
  A learned model would not be "fixed" like that by hand.

### Q3. How does each Responsible ML issue map to a safeguard?

| Issue | Safeguard in the app |
| --- | --- |
| Privacy | No accounts, cookies or analytics; predictions run in the browser; no external fonts |
| Bias | Per-class precision/recall/F1 and macro-F1, not accuracy alone; class balance shown |
| Fairness | Leave-one-wilderness-area-out evaluation; out-of-range inputs flagged |
| Transparency | Report generated from `model_card.json`; sim rules labeled as assumptions; stub labeled |
| Explainability | All probabilities shown; sensitivity bars; explanation sentence; global feature importance |
| Accountability | Fixed seeds, versions in the model card, deterministic sim, ownership documented |
| Over-reliance | "Educational simulation only" on every page; OOD warnings; calibration reported |

### Q4. Why does the Model Report read from `model_card.json` instead of hard-coded numbers?

- The numbers on the page are exactly what the pipeline produced. Nobody can
  mistype or "improve" a metric.
- Retraining updates the report automatically.
- If the file is missing, the page says so instead of showing stale numbers.
- The stub is never used on this page, so fake numbers can never appear in
  the report.

---

## 4. Questions you may be grilled on

**"Your validation allows out-of-range values. Isn't that wrong?"**
There are two tiers. Physically impossible values are errors and are
blocked. Values outside the training data are allowed but flagged, because
showing the user that the model is extrapolating is the point of the OOD
warning. Blocking them would hide that.

**"What does OOD mean here, exactly?"**
Out of distribution: the input does not look like the training data. It is
flagged two ways: (1) any single input outside its training min/max, and
(2) a combined distance (root-mean-square z-score of the features) above a
threshold from `model.json`. (2) catches combinations that are each in range
but unusual together.

**"Is the sensitivity bar the model's reasoning?"**
No. It is a local, one-at-a-time perturbation: "near this point, if elevation
went up by 10% of its range, P(class) changes by X points". It is not cause
and effect in nature, and it ignores interactions between inputs. The page
says this.

**"Why a Web Worker?"**
Predicting 16,384 cells on every terrain change would freeze the page if it
ran on the main thread. The Worker keeps the UI responsive. It also means no
server and no data leaving the browser.

**"Why debounce?"**
Dragging a slider fires many changes per second. Predicting only after
250 ms of no changes avoids wasted batches. Results that arrive out of order
are discarded (a sequence number check in `Sandbox.svelte`).

**"What if the model files fail to load?"**
The app shows a visible error, and the sandbox explains that predictions are
unavailable. The labeled stub was removed once the real model shipped.
Nothing crashes. This
is tested in `apps/web/test/model.test.ts`.

**"What if someone trains with features in a different order?"**
The app refuses to load. Both `model_card.json` `features` and `model.json`
`featureNames` must equal `FEATURE_NAMES` exactly, otherwise it raises a
visible error.

**"How is the sim deterministic?"**
All randomness comes from one seeded generator (mulberry32) whose state is
stored in the sim state. Animals are processed in a fixed order. The test
runs two sims with the same seed for 150 ticks and checks they are identical,
including when stepped in chunks.

**"What does the rewilding score reward?"**
`100 × (0.3 × habitat diversity + 0.4 × herbivore stability + 0.3 × predator stability)`.
Diversity is the normalized Shannon entropy of the cover classes. Stability
is presence × (1 − coefficient of variation) over the last 200 ticks, and 0
if the species is extinct. It rewards what **our rules** reward, not real
ecological health.

**"Why macro-F1 and not accuracy?"**
Two classes dominate Covertype. A model that predicts only those two can
have high accuracy and still be useless on the rare classes. Macro-F1
averages over the classes equally.

**"Why is the stratified split called optimistic?"**
Neighboring cells are correlated, so near-duplicates end up on both sides of
a random split. Leave-one-wilderness-area-out tests a whole area the model
never saw, which is closer to how the app uses it on new terrain.

**"Is the terrain real?"**
No. It is generated. The model predicts what a real site with those terrain
values would likely grow, based on one forest in Colorado. The footer says
this on every page.

---

## 5. Known gaps and risks

- **Stub removed (Nov 14).** Missing or invalid model files are now a
  visible error; there is no fallback predictor.
- **One terrain-inputs module.** `heightmapToInputs` in `@graze/features` is
  the only terrain -> inputs code. The copies in `packages/sim/terrain` and
  the app placeholder were deleted: they used the old assumed sun angles
  (9am hillshade ~35 points off on the default map) and a chamfer water
  distance. Outputs of the kept code were checked bit-identical before and
  after the change.
- **Placeholder generator remains** (`sandbox/terrain.ts`) only because
  `ml/src/train.ts` still builds its generated-terrain evaluation with it
  (architecture review candidate 2). The 2D `MapView` was deleted.
- **Elevation slider.** Elevation drives the prediction most, so a fixed
  band gives a near single-class map (99% Lodgepole Pine at the 50% center).
  The Sandbox defaults to a 40% center (a Lodgepole/Ponderosa mix) and lets
  the user move the band. Relief stays at 20%; 40% puts ~6,000 cells out of
  distribution.
- **`.svelte` files are not type-checked**, only compiled by the build.
  `pnpm typecheck` covers the `.ts` files and the tests.
- **Deploy is not done.** It needs your Cloudflare account. The exact `cf`
  command for a Pages deploy was not confirmed. Find it with
  `npx cf cli search "deploy static site to pages"`, then put the live link
  in the README.
- **Responsible Use wording is a draft.** The brief says humans write the
  final text.
- **Model files are cached with revalidation** (`cache: 'no-cache'`). In
  testing, a browser cached the old "file missing" response. If the app shows
  the stub after Role 3 drops the files in, do a hard reload.

---

## 6. Still to agree with teammates

**With Role 3:**
- Sign off on `docs/feature-contract.md`: the `model_card.json` fields, the
  `model.json` format, and the Worker message names.
- The class order in `model_card.json`. `ecology.json` assumes the Covertype
  order. If it differs, reorder `foodByClass` and `regrowthByClass`.
- Whether they provide their own explain function. If so, it replaces
  `explainOne` in `engine.ts`.
- `hardMin`/`hardMax` per input in the card (physically valid ranges), and
  the human-written `limitations` list.

**With Role 1:**
- Export `mountWorld(target, { reducedMotion }) => { destroy() }` from
  `src/lib/world/index.ts` for the dimmed background.
- **Open decision:** is the 3D background clickable? Right now it ignores
  clicks, and cells are picked on the 2D placeholder map. If the 3D world
  becomes the interactive map, it calls `selectCell({ x, y, sample, water })`.
- Animals: Role 1 reads `getPositions(simState)` to draw them in 3D.

---

## 7. Cut order (from the brief)

If behind: 1. predator, 2. ecology editor (rules are already read-only),
3. event log polish. **Never cut:** input validation, the Model Report, the
limitations notice, the Responsible Use page.
