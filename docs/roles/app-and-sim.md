# Role 2: App and Sim

**Owner:** [Name]
**Mission:** Turn the model into a usable, honest product: the forms, validation, Model Report, Responsible Use page, and the herd simulation that makes the world feel like a game.

---

## Ownership

| You own | You do not edit (ask the owner) |
| --- | --- |
| `apps/web/` except `src/lib/world/` | `apps/web/src/lib/world/` (Role 1) |
| `packages/sim/herd/` (ecology rules, simulation) | `packages/features/` and `ml/` (Role 3) |
| Inference Worker wiring | `model.json` contents (Role 3) |
| Deploy config (Cloudflare Pages) | `packages/sim/terrain/` (Role 1) |
| `docs/ecology-rules.md` | |

---

## Shared contract (agree on this in the first 30 minutes; source of truth is `docs/feature-contract.md`)

- **Heightmap:** `Float32Array` of length 16384, row-major (`index = y * 128 + x`), values in meters, scaled into Covertype's elevation range.
- **Cell size:** 30 m (verify against the dataset docs).
- **Cover map:** `Uint8Array(16384)` of class indices 0-6, in the order listed in `model_card.json`.
- **Model output per input:** `{ classIndex, probs: number[7], ood: boolean }`.
- **Model files:** `apps/web/public/model/model.json` and `model_card.json`.
- **Worker API:** agree on message names with Role 3 on Day 4 (suggested: `predictBatch`, `predictOne`, `explainOne`).

You **consume** the model and the cover map. You **produce** the sim state (animal positions) that Role 1 renders.

---

## Design Style

### LAYOUT
- Single centered column on a full-viewport near-black background. Generous vertical whitespace, with content grouped in small clusters (eyebrow, title, tagline, selector, primary action, settings, footer).
- Utility pinned top-right (small ghost button) and a credits/footer line pinned bottom-center.

### COLOR
- Background: #07090b to #0a0d10 (almost black, slightly cool).
- Primary text: #d4d7dc. Secondary: #8a9098. Tertiary/captions: #5b6168.
- Borders: 1px solid #2a2e33. Selected/hover fill: #1c1f23 with brighter text.
- One restrained accent, a muted teal (#6fb8c4), used only for text links with a thin underline.
- No saturated colors anywhere else.


### TYPOGRAPHY
- Monospace throughout (JetBrains Mono, IBM Plex Mono, or similar).
- Title: ~44-52px, uppercase, very wide letter-spacing (0.3-0.4em), light weight.
- Tagline: 14-15px, two short lines, wide-ish tracking, secondary color.
- Eyebrow and section labels: 11-12px, uppercase, 0.15em tracking, tertiary color.
- Buttons and tabs: 11-13px uppercase, 0.08em tracking. Small numeric prefix on tabs ("1 ", "2 ") in dimmer gray.

### FEEL
Hushed, cinematic, lo-fi, terminal-meets-game-launcher. Lots of negative space, low contrast hierarchy, everything small and deliberate. Accessibility: keep body text at least 4.5:1 contrast against the background.

## Deliverables

Each item is done only when every checkbox is ticked.

### D1. App shell (Days 1-3)
- [x] Svelte routes: Sandbox, Model Report, About / Responsible Use
- [x] Consistent layout and navigation
- [x] Footer notice on every page: intended use, limitation, and dataset credit (Blackard, 1998; CC BY 4.0)

### D2. Inference Worker integration (Days 6-7)
- [x] Web Worker loads `model.json` and `model_card.json`
- [x] No server round trip for predictions
- [x] Debounced batch prediction when the terrain changes
- [x] Graceful failure if the model files fail to load (visible error, no crash)
- [x] A stub that returns clearly labeled fake predictions is acceptable until Role 3 exports the real model, but it must be removed before Day 12 *(removed Nov 14 once Role 3's model shipped: missing or invalid model files now show a visible error)*

### D3. Site Probe (Days 3-7)
- [x] Panel opens when a cell is clicked (Role 1 emits the selection) *(Sandbox now uses Role 1's 3D `WorldView`; its Select tool calls `pick`)*
- [x] Editable form with every model feature, prefilled from the cell
- [x] Validation for missing, non-numeric, and out-of-range values, using ranges from `model_card.json` (nothing hard-coded)
- [x] Output: predicted cover type, probability bars, one-sentence explanation
- [ ] Sensitivity bars (how each input moves the probabilities), provided by Role 3's explain function *(bars shown using a generic ±10% method; waiting on Role 3's explain function)*
- [x] Out-of-range and OOD warnings shown in plain language
- [x] Validation unit tests

### D4. Model Report page (Days 6-7)
- [x] Reads **only** from `model_card.json`; no numbers typed into the page
- [x] Shows: dataset summary, split strategy, baseline comparison table, confusion matrix, per-class precision/recall/F1, macro-F1, calibration, ablations, global feature importance, OOD detector summary
- [ ] A "limitations and what these numbers do not mean" section (text written by humans, see Role 3) *(section renders from the card; waiting on the human-written text)*

### D5. Herd simulation (Days 8-9)
- [x] Tick-based simulation on the cover map
- [x] Rules live in an editable `ecology.json` (food value per cover type, movement, reproduction, starvation)
- [x] Rules table shown in the UI and labeled **"assumptions, not model output"**
- [x] Population chart (canvas) and event log
- [x] Deterministic given a seed (unit test)

### D6. Predator and score (Day 10)
- [x] Predator rules added to `ecology.json`
- [x] Rewilding score defined in `docs/ecology-rules.md`: rewards stable populations and habitat diversity
- [x] Score and event log visible in the UI

### D7. Responsible Use page (Day 11)
- [x] Covers: privacy, bias, fairness, transparency, explainability, accountability, over-reliance
- [x] Each issue paired with a concrete safeguard in this app (OOD flag, limitations notice, report page, no personal data collected)
- [ ] Draft by OpenCode is fine; the final wording is written and edited by humans *(draft done; human rewrite pending)*

### D8. Errors, tests, deploy (Days 11-12)
- [x] No unhandled errors on bad input, missing model, or empty terrain
- [ ] Static deploy on Cloudflare Pages, linked in the README *(not deployed yet; steps are in the README)*
- [ ] Fallback: local run instructions plus the demo video *(local run instructions done; demo video pending)*

### D9. Walk mode integration
- [ ] Replace the 2D `MapView` with Role 1's `WorldView` on the Sandbox page and pass `onpick`, `herbivores`, `predators`, and `busy`; this also unblocks the unchecked items in ROLE-1 D2, D4, D6, D7
- [ ] One shared app state store for seed, generation options, water level, brush edits, selected cell, overlay toggles, view mode (orbit or walk), time of day, and quality preset; orbit and walk read the same store and switching modes loses no state
- [ ] Mode toggle control in the Sandbox UI, plus a keyboard shortcut listed in the help overlay
- [ ] Site Probe opens from both a click in orbit view and the "inspect cell underfoot" action in walk mode (ROLE-1 D11), using the same panel and the same selection event, with no duplicate form
- [ ] Brush edits made in orbit view trigger the debounced re-prediction through the inference Worker, and walk mode shows the updated cover with no reload
- [ ] Loading state while the model loads and while a re-prediction batch runs; failures show a visible message and walk mode stays usable with a "predictions unavailable" HUD state
- [ ] Layout works on mobile and desktop; Site Probe and Model Report links remain reachable from walk mode without losing the world

### D10. Sim state for ground-scale viewing
- [ ] Sim exposes positions (and heading) for herbivores and predators through a documented read-only interface that Role 1 renders; no rendering code in `packages/sim/herd/`
- [ ] Simulation tick rate is decoupled from render frame rate, with interpolation so animals move smoothly in walk mode
- [ ] Animals respect water and terrain: placed using the same `getGroundHeight` convention as ROLE-1 D8 (agree and document it, with a unit test on a tiny heightmap)
- [ ] Sim re-seeds deterministically when the world seed changes, and pauses or recovers cleanly when terrain is edited under animals (document the behavior)
- [ ] Event log entries shown in walk mode in a compact form (OPTIONAL, cut first)

### D11. Settings, help, and notices
- [ ] One settings panel for quality preset (ROLE-1 D12), time of day and auto-cycle (ROLE-1 D10), overlay toggles, and reduced-motion preference
- [ ] Controls help overlay (ROLE-1 D8, D11) reachable from the UI and from walk mode
- [ ] The persistent notice from ROLE-1 D11 ("predictions are for terrain-like inputs, not real ground truth") is shown in walk mode as well as in the footer
- [ ] Settings are remembered per viewer using browser storage wrapped in try/catch, and the app works with empty storage

### D12. Worlds API (Hono + D1), extended scope, optional, first thing cut
**OPTIONAL.** Replaces the old "Optional: Hono + D1" bullet; keeps its cut-first status.
- [ ] Review ROLE-1 D13's proposed interface (`POST /api/worlds`, `GET /api/worlds/:id`); confirm or amend it, and list any change under "Changes needed in ROLE-1"
- [ ] Data stored: seed, generation options, brush-edit delta, `modelVersion`, `schemaVersion`, created time. No personal data, no accounts, no free-text fields
- [ ] Validation on both client and server: size limit, field types and ranges, rejection of malformed or oversized payloads with a friendly error
- [ ] Rate-limit note: verify what the Cloudflare platform offers (Workers Rate Limiting binding / WAF rate limiting rules) and record the finding; do not assume a product
- [ ] Worker route, D1 schema, and migration documented in the repo; local dev instructions that work without a deployed D1
- [ ] Loading a world saved under a different `modelVersion` re-predicts with the current model and shows a notice
- [ ] Share link or share code format agreed with ROLE-1 D13 and constrained by the hosting rules for the deployed site (verify)
- [ ] Tests: round-trip save and load, rejected bad payloads, oversized payloads

**Changes needed in ROLE-1** (from confirming D13): endpoint paths unchanged. ROLE-1 D13's single "version field" becomes `modelVersion` and `schemaVersion`, and `importWorld()` must surface `modelVersion` so the app can re-predict and show a notice on mismatch.

### D13. Content and safeguards for walk mode
- [ ] Update the About / Responsible Use page: walk-mode vegetation is a rendering of predicted classes, not photographs or ground truth
- [ ] State that the day/night cycle is cosmetic and is not the model's hillshade feature (ROLE-1 D10 asks for this note)
- [ ] List the over-reliance risk: a good-looking world can make predictions feel more trustworthy than they are, with these safeguards: OOD low-trust rendering, the persistent notice, confidence in the HUD, link to the Model Report
- [ ] Humans write the final wording; OpenCode drafts

### Optional (cut by default)
Hono + D1 for saved or shared worlds is now D12. Cut-first status kept.

---

## Tonight (definition of done)

- [x] Svelte shell with the three routes
- [x] Site Probe form with validation (hard-coded ranges are acceptable tonight)
- [x] Footer notice and dataset credit
- [x] A prediction stub, **clearly labeled as a stub**
- [x] Committed and pushed

---

## Timeline

| Day | Target |
| --- | --- |
| 1 | Shell, routes, deploy hello-world |
| 2-3 | D1 complete, Site Probe form started |
| 4-5 | Agree Worker API with Role 3; Site Probe form and validation complete |
| 6-7 | D2, D3, D4 complete (needs Role 3's `model.json`) |
| 8-9 | D5 complete |
| 10 | D6 complete |
| 11 | D7 and D8 |
| 12 | Final deploy, remove all stubs |
| 13 | Record the demo video |
| 14 | Buffer |

### Extended scope

Team is ahead of the original schedule above. These are targets, not a new
freeze. Day 12 final deploy, Day 13 demo video, and Day 14 buffer stay where
they are.

| Target order | Deliverables |
| --- | --- |
| First (target) | D9 walk mode integration (it unblocks Role 1) |
| Next (target) | D10 sim state and D11 settings, help, notices |
| Next (target) | D13 content and safeguards |
| Last (target) | D12 Worlds API (OPTIONAL, first cut) |

---

## Cut order (if behind)

1. D12 (Worlds API; OPTIONAL)
2. Event log in walk mode
3. Settings polish (keep presets)

**Never cut:** input validation, the Model Report page, the limitations notice, the Responsible Use page, D9 (walk mode integration), and no unhandled errors when switching modes.

---

## You must be able to explain in the defense

- What happens between pressing submit and seeing a prediction (validation, features, Worker, model)
- Why the herd simulation is **not** machine learning, and why that is labeled in the UI
- How each Responsible ML issue maps to a safeguard in the app
- Why the Model Report reads from `model_card.json` instead of hard-coded numbers
- How orbit and walk mode share one state and one Site Probe
- Why animals are rendered by Role 1 but simulated here
- What a saved world contains and why it stores a model version

---

## Working rules

- Never hard-code metrics, class names, or feature ranges. Read them from `model_card.json`.
- Don't change the model API without telling Role 3 and updating `docs/feature-contract.md`.
- "Done" means typecheck and tests pass.
- Humans write the Responsible Use wording. OpenCode drafts.

---
## Current Progress
nov 14

I've built all eight Role 2 deliverables (D1–D8) that can be finished before Role 1 and Role 3 deliver. Typecheck passes, all 45 tests pass, and the build is clean. I also drove the built app in headless Firefox. The Sandbox page loaded the map, opened the Site Probe and ran the sim, with no app errors. The Model Report rendered every section from a throwaway fake card, which I deleted afterwards. Nothing is committed or pushed yet.

What's in place:
- D1 App shell: three pages (Sandbox, Model Report, Responsible Use) in your design style, with the notice and dataset credit (Blackard 1998, CC BY 4.0) in the footer of every page. A small button top-right shows the model status.
- D2 Inference worker: predictions run in the browser, with no server round trip. The worker loads model_card.json and model.json and supports softmax, small neural net and random forest formats. It re-predicts the whole map 250 ms after the terrain stops changing. Missing or broken files show a visible error instead of crashing.
- Stub: until Role 3 exports the model, a fake predictor runs. A banner says "STUB: fake predictions" and the classes are named "Stub class 1–7". To remove it on Day 12, set ALLOW_STUB_MODEL = false in apps/web/src/lib/model/config.ts and delete stub.ts.
- D3 Site Probe: clicking a cell opens a form prefilled from that cell. Missing, non-numeric and physically impossible values are errors. Values outside the training range are allowed but get a plain-language warning. All ranges come from model_card.json. The output shows the predicted type, probability bars, a one-sentence explanation and sensitivity bars.
- D4 Model Report: reads only model_card.json and never shows stub numbers. Any section missing from the card says "not in model_card.json yet".
- D5/D6 Herd simulation: lives in packages/sim/herd, with herbivores, predators and the rules in ecology.json. The UI shows the rules table labeled "Assumptions, not model output", plus a population chart, event log and rewilding score. A unit test confirms the same seed gives the same run. I tuned the default rules so herds and predators cycle without either dying out in most seeds.
- D7 Responsible Use: pairs each of the seven issues with a safeguard in the app. It's an agent-written draft, marked "Draft" on the page, for your team to rewrite.
- D8: run commands, a local fallback and deploy steps are in the README.

Decisions that need sign-off from Role 1 and Role 3:
- Model file formats and worker messages: none of this existed yet, so I wrote it up in docs/feature-contract.md, marked "proposal". The app already follows it, so if Role 3 exports a different shape, either the files or the app has to change.
- Sensitivity bars: I used a generic method (move each input ±10% and see how the probabilities shift). If Role 3 provides their own explain function, it replaces one function in engine.ts.
- Placeholder map: the Sandbox uses a flat 2D map, and my own slope, aspect, hillshade and water-distance calculation, until Role 1's 3D world exists. I didn't touch src/lib/world/, packages/features/ or ml/. Role 1 plugs in by calling selectCell(...) when a cell is clicked, and gets animal positions from getPositions(simState). The hillshade sun angles are rough assumptions.

Setup changes and limits:
- The web app uses the root's packages, which keepspace" setup intact. I added
  @sveltejs/vite-plugin-svelte and @types/node, plbuild and web:preview. typecheck and test now also
  cover the web app and the sim.
- I took apps/web/src out of the root tsconfig.jso, which is what the apps/web README said to do once
  real code landed.
- The .svelte component files themselves aren't tyompiles them.Deploy: I didn't deploy, because that needs yourouldn't confirm the exact cf command for a Pagesdeploy. The README has the steps and an empty sl

changes

How it behaves:
- Before the world exists: the page stays black. That file doesn't exist yet, and the app builds and runs fine without it.
- If it fails to load: the page stays black, a warning goes to the console, and nothing else breaks.
- Dimming: a black layer at 72% opacity sits over the 3D world. To change how dark it is, edit DIM in apps/web/src/lib/backdrop/WorldBackdrop.svelte.
- Reduced motion: Role 1's scene is told when the user has asked for reduced motion, so it can keep the camera still.
- Persistence: the background stays mounted across all three pages, so switching tabs doesn't reload the 3D scene.

Decision for you: the background is display-only and doesn't respond to clicks, so the 2D placeholder map is still how you click cells on the Sandbox page. Do you want clicking to happen on the 3D background instead? If so, the Sandbox page would need to let clicks through to it, and the dimming would probably be lighter there. Otherwise the 2D map box gets replaced by a second, interactive view of the world.

---

### Nov 14 (later): wiring after Roles 1 and 3 landed

- Sandbox uses Role 1's 3D `WorldView`: brush, overlays (cover, confidence, OOD), click-to-probe and herds drawn in 3D. The 2D placeholder map is no longer on the page.
- Stub removed (D2): `stub.ts`, `ALLOW_STUB_MODEL`, the banner and the `stub` flags are gone. Missing model files are a visible error.
- Model inputs are computed with `@graze/features` `heightmapToSamples` so the hillshade uses Role 3's fitted `SUN`. Role 1's `computeCellInputs` still has the old sun angles, which was train/serve skew. **Needs Role 1:** switch `packages/sim/terrain` to the fitted `SUN`.
- New "Elevation" slider (band center). Default 40%, because the 50% band predicts 99% Lodgepole Pine.
- Checked: typecheck, 91 tests, build, and headless Firefox at 1280 px and 390 px (map renders, batch predicts, sim runs, probe opens, no horizontal scroll, no app errors).
- Still open: sensitivity from Role 3's explain function (none exists yet), human-written limitations and Responsible Use text, Cloudflare Pages deploy, demo video.

---

## Needs from other roles

| Role | Needed |
| --- | --- |
| Role 1 (World) | Expose `onpick`, `herbivores` / `predators`, `busy`, the settings props (view mode, quality preset, time of day, overlay toggles, reduced motion), and `getGroundHeight` for D9-D11. |
| Role 3 (ML) | Per-cell prediction latency numbers and a stable class order (D10) for the walk HUD and D9. |
