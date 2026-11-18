# Finalization notes

*Written 2026-11-17, before the documentation pass.*

## Current state

Everything passes:

- `pnpm test`: 185 of 185 tests (196 before the custom-model tests were removed on 2026-11-18)
- `pnpm typecheck`
- `pnpm web:build` (warns that one bundle is over 500 kB)

The code is in good shape. What's left is paperwork, a few decisions, and work only the group can do.

## 1. Cleanup before the docs

| Item | Where |
|---|---|
| ~~D14–D17 unticked~~ Done 2026-11-18: D14–D16 checked against the code and ticked. Still open: the D14 count check (5 page switches, 5 walk toggles) and the D15 hand check at 390 px. D17 was dropped. | `docs/roles/world.md:224-270` |
| ~~`docs/custom-models.md` is missing~~ Done 2026-11-18: custom models are dropped. The loader, manifest, `public/models/`, `models:check` and the guide were removed, so nothing links there any more. | — |
| ~~`docs/limitations.md` is a stub~~ Done 2026-11-18: it now quotes the in-app notice and mirrors the README limitations list. | `docs/limitations.md` |
| ~~The features README mentions deleted `placeholder.ts` files~~ Done 2026-11-18: it now describes the relative-path imports the consumers use. | `packages/features/README.md:21-24` |
| ~~The old terrain generator stays for `ml/src/train.ts`~~ Done 2026-11-18: training had already moved to `packages/sim/terrain` (commit `2651b71`), so the generator and its test were deleted. No retrain needed. | `apps/web/src/lib/sandbox/terrain.ts` (deleted) |
| The rate-limit `namespace: '1001'` is a placeholder copied from the docs. It has to be unique before you deploy. | `cloudflare.config.ts:15` |
| ~~The knowledge graph is out of date~~ Done 2026-11-18: rebuilt from scratch, and a manifest is saved so later `--update` runs are incremental. | `graphify-out/` |
| ~~`packages/sim/src/placeholder.ts` is dead code~~ Done 2026-11-18: deleted (nothing imported it). | `packages/sim/src/` (deleted) |
| The limitations list is in both `README.md` and `docs/limitations.md`, and nothing checks that they match. Edit both together, or keep the list in one place and link to it from the other. | `README.md`, `docs/limitations.md` |
| `graphify-out/` is partly tracked in git: `graph.json`, `graph.html`, `GRAPH_REPORT.md` and the labels are committed, the cache is ignored. Every rebuild is a large diff. Decide whether to keep committing it or add `graphify-out/` to `.gitignore`. | `.gitignore:40-44` |

## 2. Decisions the group needs to make

- ~~**Does `engine.explainOne` count as Role 3's explain function?**~~ **Yes** (decided 2026-11-18). Ticked `docs/roles/ml.md` D7 and `docs/roles/app-and-sim.md` D3 (sensitivity bars).
- ~~**Optional items: cut them or build them?**~~ Checked 2026-11-18. **Built:** D18 wind sway, leg swing and ground texture, and photo mode (stretch). All are ticked in `docs/roles/world.md`, except D18's toggle count check. **Not built:** the walk-mode event log (`docs/roles/app-and-sim.md` D10, already marked cut) and the ambient soundscape (stretch). Cut those two on paper.
- ~~**Should cell picking be on the 3D view or the 2D map?**~~ **3D view only** (decided 2026-11-18). Cells are picked in the Sandbox's `WorldView`: the Select tool in orbit view, or E in walk mode. There is no 2D map, and the page background never takes clicks.

## 3. Work only the group can do (and what to learn from it)

- **ML interpretation:** the D5 per-class discussion and the D8 conclusions. Two `TODO (humans)` notes are waiting in `docs/model-card.md:132` and `:310`. Two classes make up about 85% of the rows, so be ready to explain why macro-F1 is the metric and not accuracy.
- **Freeze (D9):** run `ml:evaluate-final` **once**, then commit and tag the model. No tags exist yet. Learn why the test set can only be used once.
- **Your own wording** for the limitations notice and the other in-app notices. The drafts are done, but the final text has to be yours.
- **The Model Report's "what these numbers do not mean" section.** The page renders it from the card, but the text must be written by humans (`docs/roles/app-and-sim.md:85`).
- **Checks by hand that headless testing can't do:**
  - pointer lock and leaving it with Esc;
  - 30+ fps on your weakest laptop, recorded with the machine's name;
  - telling each plant class apart while walking.
- **Deploy and demo:** `npm run deploy` creates Cloudflare resources, so get the group's go-ahead first. Also record the demo video and post the Worker API announcement (the draft is in `docs/notes.md` §8).
- **Defense prep:** each role doc has a "You must be able to explain in the defense" section. Use those as your study list.

## Suggested order

1. Make the section 2 decisions.
2. Do the section 1 cleanup.
3. Do the D9 freeze.
4. Write the docs and the final wording.
5. Deploy and record the video.
