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
| `docs/limitations.md` still has its "(stub)" heading and says to copy the README text in word for word. | `docs/limitations.md` |
| The features README mentions `placeholder.ts` files that were deleted. | `packages/features/README.md:23` |
| The old terrain generator is still there only because `ml/src/train.ts` uses it. Removing it means rerunning `ml:train`, so either do that or document why it stays. | `apps/web/src/lib/sandbox/terrain.ts` |
| The rate-limit `namespace: '1001'` is a placeholder copied from the docs. It has to be unique before you deploy. | `cloudflare.config.ts:15` |
| The knowledge graph was built before the backdrop and `.glb` commit, so it's out of date. Run `/graphify --update` before relying on it for docs. | `graphify-out/` |

## 2. Decisions the group needs to make

- ~~**Does `engine.explainOne` count as Role 3's explain function?**~~ **Yes** (decided 2026-11-18). Ticked `docs/roles/ml.md` D7 and `docs/roles/app-and-sim.md` D3 (sensitivity bars).
- ~~**Optional items: cut them or build them?**~~ Checked 2026-11-18. **Built:** D18 wind sway, leg swing and ground texture, and photo mode (stretch). All are ticked in `docs/roles/world.md`, except D18's toggle count check. **Not built:** the walk-mode event log (`docs/roles/app-and-sim.md` D10, already marked cut) and the ambient soundscape (stretch). Cut those two on paper.
- ~~**Should cell picking be on the 3D view or the 2D map?**~~ **3D view only** (decided 2026-11-18). Cells are picked in the Sandbox's `WorldView`: the Select tool in orbit view, or E in walk mode. There is no 2D map, and the page background never takes clicks.

## 3. Work only the group can do (and what to learn from it)

- **ML interpretation:** the D5 per-class discussion and the D8 conclusions. Two `TODO (humans)` notes are waiting in `docs/model-card.md:132` and `:310`. Two classes make up about 85% of the rows, so be ready to explain why macro-F1 is the metric and not accuracy.
- **Freeze (D9):** run `ml:evaluate-final` **once**, then commit and tag the model. No tags exist yet. Learn why the test set can only be used once.
- **Your own wording** for the limitations notice and the other in-app notices. The drafts are done, but the final text has to be yours.
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
