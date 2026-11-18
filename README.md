# Project Graze

**A rewilding sandbox powered by a terrain-to-habitat classifier.**
Sculpt a procedurally generated valley, let a trained model predict what vegetation would grow on it, then release herds and predators and see whether your world can sustain them.

> CSST 102 – Basic Machine Learning · Final project: a web-based predictive ML system

---

## Status

*Last updated 2026-11-18.*

| Area | State |
| --- | --- |
| Repo and tooling | Built: `pnpm test`, `pnpm typecheck` and `pnpm web:build` pass |
| Shared features contract (`@graze/features`) | Built: the only terrain-to-inputs code, used by training and the app |
| Terrain and 3D world | Built: seeded terrain, water, brush, overlays, cell picking, herds, walk mode, day/night, forest patches |
| Ambient backdrop | Built: a dimmed, live ground-level view of the world behind every page |
| Data pipeline (download, verify, split) | Built: SHA-256-checked download, locked test set pinned by hash |
| Model training and evaluation | Built: softmax regression selected by the LOAO rule. **Not frozen yet**; the locked test set is unread |
| Site Probe (input, validation, prediction, sensitivity) | Built; uses the exported model |
| Model Report page | Built; reads `model_card.json` only |
| Herd simulation | Built: herbivores, predators, rewilding score, slowed to walking pace on the ground |
| Save and share worlds | Built: offline share codes, plus the optional Worlds API (Hono + D1) |
| App shell and Responsible Use page | Built (Responsible Use wording is a draft) |
| Deployment | Not deployed yet |

What is left before submission is listed in [`docs/finalization-notes.md`](docs/finalization-notes.md).
Metrics below come from `model_card.json`; final test numbers are added only after the model is frozen.

---

## What it does

- **Terrain sandbox:** seeded noise terrain with a water-level control and a raise/lower brush, rendered in 3D. Overlays show the predicted cover, the model's confidence, and low-trust (out-of-distribution) cells.
- **Habitat prediction:** a classifier predicts the forest cover type of every cell from terrain features only, and the map is repainted as you sculpt. Predictions run in the browser, in a Web Worker.
- **Site Probe:** click a cell in the 3D view, or type values into the form, to get a predicted cover type, class probabilities, sensitivity bars (how each input moves the probabilities) and a plain-language explanation. Out-of-range and out-of-distribution inputs trigger a warning.
- **Walk mode:** walk the valley at ground level. Trees and shrubs are drawn from the predicted classes; low-trust cells grow sparse, grey plants. Press `E` to probe the cell underfoot. Leaving walk mode opens an info and settings panel.
- **Living background:** every page sits on a dimmed, slowly turning ground-level view of your world, with a cosmetic day/night cycle. The sun you see is not the model's hillshade input.
- **Save and share:** copy a world as a `graze1.…` code that works offline, or, with the optional Worlds API, as a link.
- **Herd simulation:** herbivores graze, predators hunt, and vegetation regrows according to hand-written, editable ecology rules. A rewilding score summarizes how well your world holds up.
- **Model Report:** dataset description, preparation steps, model comparison, metrics, ablations, and limitations.

The ecology rules are **assumptions we wrote**, not model output. Only the habitat classifier is machine learning.

---

## The ML problem

| | |
| --- | --- |
| **Task** | Multiclass classification: predict forest cover type from terrain |
| **Dataset** | Covertype, UCI Machine Learning Repository |
| **Size** | 581,012 instances, 54 original features, 7 classes |
| **Classes** | Spruce/Fir, Lodgepole Pine, Ponderosa Pine, Cottonwood/Willow, Aspen, Douglas-fir, Krummholz |
| **Features used** | Elevation, slope, aspect (sin/cos), hillshade (9am, noon, 3pm), horizontal and vertical distance to water |
| **Features excluded** | Soil type, wilderness area, and distance to roads and fire points, since generated terrain has none of these |

**Validation:** a stratified random split (optimistic, since neighboring cells are correlated) and **leave-one-wilderness-area-out** (the honest generalization test). Scalers and hyperparameters are fit on training folds only, and a final test set stays untouched until the model is frozen.

**Models compared:** majority-class baseline, hand-written elevation-band rule, softmax regression, a small MLP and a random forest, all written from scratch. The selection rule was written down before any LOAO result: highest mean LOAO macro-F1 wins, but a simpler model within 0.01 of the best is chosen instead.

| Model | LOAO accuracy | LOAO macro-F1 (std) | Random-split macro-F1 |
| --- | --- | --- | --- |
| Majority class | 0.359 | 0.120 (0.054) | 0.094 |
| Elevation-band rule | 0.625 | 0.355 (0.048) | 0.346 |
| **Softmax regression (selected)** | 0.596 | **0.385** (0.084) | 0.483 |
| Small MLP | 0.570 | 0.384 (0.080) | 0.581 |
| Random forest | 0.576 | 0.390 (0.070) | 0.604 |

The forest scores best, but softmax is within 0.01 and is the simplest, so the rule selects it. On unseen land (LOAO) every model is far weaker than on the random split, and it only beats the elevation-band rule by a little: elevation carries most of the signal (permutation importance 0.14, every other feature 0.015 or less). Details, per-class metrics, calibration, ablations and OOD rates are in [`docs/model-card.md`](docs/model-card.md). These numbers are from validation, not the locked test set.

**Why TypeScript instead of Python?** The same `features` module computes inputs for both training and the app, so preprocessing cannot drift between the two. A single language keeps the pipeline small, reproducible, and easy to run in the browser. The training code is documented and deterministic.

---

## Tech stack

- **Frontend:** Svelte + Vite, three.js
- **Model inference:** JSON weights loaded in a Web Worker (no server round trip)
- **Backend:** Hono on Cloudflare Workers (from the Cloudflare template)
- **Training:** Node/TypeScript scripts in `ml/`
- **Hosting:** Cloudflare

---

## Getting started

### Prerequisites

- Node.js (current LTS) and pnpm (the repo has a `pnpm-lock.yaml`; commands below use `pnpm`)
- A Cloudflare account, only needed for deployment

### Install and run

```bash
git clone <repo-url>
cd <repo-folder>
pnpm install
pnpm web:dev        # the Svelte app (sandbox, Site Probe, Model Report, sim)
pnpm test           # unit tests
pnpm typecheck
```

`pnpm web:dev` prints a local URL. `pnpm run dev` starts the Hono Worker
(`cf dev`), which is separate from the web app. The Worker serves the
optional saved-worlds API (save, load and share a world as a link). To use it
locally, start both servers: `VITE_WORLDS_API=<Worker URL> pnpm web:dev`.
Details are in [docs/worlds-api.md](docs/worlds-api.md). Everything else works
without it.

### Run locally without the internet (fallback)

```bash
pnpm install
pnpm web:build
pnpm web:preview    # serves apps/web/dist on a local URL
```

Everything, including predictions, runs in the browser. The app needs
`model.json` and `model_card.json` in `apps/web/public/model/` (`pnpm ml:train`
writes them); without them it shows an error instead of predictions.

### Deploy

The web app is a static site (`apps/web/dist`) meant for Cloudflare Pages.
**Live demo:** *link goes here after the first deploy.*

```bash
pnpm web:build
npx cf cli search "deploy static site to pages"   # find the current Pages/static deploy command
```

`pnpm run deploy` deploys the Hono Worker, not the web app.

This project uses the `cf` CLI, not wrangler (see `AGENTS.md`). Run `npx cf --help`
and `cf cli search` to find the authentication command before deploying. Check
Cloudflare's current free-tier limits before launch.

### Train the model

```bash
pnpm ml:train          # fetch + verify Covertype, explore, train every model, export (minutes)
pnpm ml:fetch          # only download Covertype into ml/data/ and verify its SHA-256
pnpm ml:explore        # only the data summary and baselines -> ml/reports/exploration.json
pnpm ml:generated-ood  # how often generated worlds are flagged OOD vs. real held-out rows
pnpm ml:bench          # inference latency of the exported model -> ml/reports/latency.json
pnpm ml:evaluate-final -- --confirm-frozen   # ONCE, after the model is frozen (D9)
```

`pnpm ml:train` writes these files:

- `apps/web/public/model/model.json` and `model_card.json`;
- `ml/reports/train-report.json` (every fold, model and ablation);
- `ml/test/fixtures/inference-fixtures.json`.

Seeds are fixed, the pipeline uses no ML libraries, and the final test set is
pinned by hash in `ml/splits.lock.json`. Rebuilding from scratch should
reproduce the reported results. See `ml/README.md` for the pipeline.

**Why train in TypeScript?** Training and the app call the same
`@graze/features` function to turn terrain into model inputs. Preprocessing
therefore cannot drift between what the model learned and what the sandbox
feeds it, which is the most common way a deployed model silently breaks. The
exported model is also checked against fixtures by running the app's own
inference code in the tests. The pipeline is small:

- three models written from scratch: softmax regression, an MLP and a
  random forest;
- about 2,600 lines of TypeScript, with plain loops and no framework magic.

It would port to Python (NumPy or scikit-learn) in an afternoon if the course
or a reviewer needed it. The JSON model format is documented in
`docs/feature-contract.md`.

---

## Project structure

```
apps/web/                 # Svelte + Vite app (see apps/web/README.md)
packages/features/        # @graze/features — shared terrain-feature contract
packages/sim/terrain/     # seeded heightmap generator and brush (no three.js)
packages/sim/herd/        # herd simulation + ecology.json (rules are assumptions)
ml/                       # Node/TypeScript data pipeline, training, evaluation, export
docs/                     # feature contract, ecology rules, model/dataset cards, role plans
GLOSSARY.md               # the project's terms, with where each one lives in the code
packages/worlds/          # saved-world format + validation (shared by app and Worker)
src/index.ts              # Hono Worker: saved-worlds API (docs/worlds-api.md)
migrations/               # D1 schema for saved worlds
test/                     # Worker API tests (in-memory SQLite stand-in for D1)
cloudflare.config.ts      # Worker config / bindings (D1, rate limit)
vite.config.ts            # Vite + @cloudflare/vite-plugin
```

*`packages/features` is the single source of truth: `ml/` and `apps/web` both
import it, so preprocessing cannot drift between training and inference. There
is intentionally no pnpm `packages:` workspace declaration — `cf` (beta) cannot
build from a workspace root, and the Worker lives at the repo root. See
`pnpm-workspace.yaml` and `packages/features/README.md` for how the shared
module is resolved.*

---

## Responsible use and limitations

- **Educational simulation only.** Do not use this for real forestry, conservation, or land-use decisions.
- **One forest.** All training data comes from a single region in Colorado, so predictions do not transfer to other climates or ecosystems.
- **Synthetic terrain.** Generated terrain differs from real terrain. The app predicts what a real site with those terrain features would likely have, not actual Minecraft biomes.
- **Estimates, not guarantees.** Predicted probabilities are estimates and can be wrong, especially for rare classes and out-of-range inputs.
- **Class imbalance.** Two cover types dominate the data, so we report per-class metrics and macro-F1, not accuracy alone.
- **Computed features.** Our hillshade computation may differ slightly from the dataset's original method. An ablation measures how much this matters.
- **Walk mode and the background are pictures of predictions.** Vegetation in walk mode, the page background and the overlays draw the model's predicted class on generated terrain, not a real place. Plant and animal shapes are team-made art built in code, not data. A good-looking world is not evidence the model is accurate, and low-trust (out-of-distribution) cells are drawn differently.
- **Privacy.** The app has no accounts and collects no personal data. Saved worlds store only the terrain recipe.

More in [`docs/limitations.md`](docs/limitations.md) and the app's Responsible Use page.

---

## Data source and credit

Blackard, J. (1998). *Covertype* [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C50K5N

Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Reuse of the original database requires retaining the copyright notice for Jock A. Blackard and Colorado State University.

---

## Team

| Member | Focus |
| --- | --- |
| *dar3v* | World: terrain generation, mesh, brush, camera |
| *Liamjandr* | App and simulation: UI, Site Probe, Model Report, herd simulation |
| *Zeki-Zek* | ML: data pipeline, features, training, evaluation, model and dataset cards |

---

## Working with AI coding agents

This project is built with agent assistance (OpenCode). Rules for agents, including file ownership and what "done" means, live in `AGENTS.md`. All results and numbers in the docs are generated from real outputs, and every team member can explain the ML pipeline.