# apps/web

Svelte 5 + Vite static app. Owner: Role 2 (App and Sim), except
`src/lib/world/` (Role 1). It uses the root `package.json` dependencies; there
is no separate install (see `pnpm-workspace.yaml` for why).

```bash
pnpm web:dev       # dev server
pnpm web:build     # static build -> apps/web/dist
pnpm web:preview   # serve the build locally
pnpm test          # unit tests (validation, inference, terrain, sim)
pnpm typecheck     # includes tsc -p apps/web (Svelte markup is checked by the Vite build)
```

## Layout

| Path | What |
| --- | --- |
| `src/App.svelte`, `src/lib/router.ts` | Shell, hash routes (`#/`, `#/report`, `#/responsible-use`), status button, stub/error banner |
| `src/lib/components/Footer.svelte` | Intended use, limitation, dataset credit (on every page) |
| `src/lib/model/` | Inference: `modelCard.ts` (schema + parser), `validation.ts`, `inference.ts` (softmax/mlp/forest), `engine.ts` (predict/explain), `loader.ts`, `worker.ts`, `client.ts`, `protocol.ts` |
| `src/lib/model/stub.ts` | **STUB** fake predictor. Remove before Day 12 (`config.ts` → `ALLOW_STUB_MODEL = false`) |
| `src/lib/probe/SiteProbe.svelte` | Site Probe form, validation, prediction, explanation, sensitivity bars, OOD warnings |
| `src/lib/sandbox/` | Cell selection hand-off (picked in Role 1's 3D view), the walk info panel, world import/export, and the old placeholder terrain generator (kept only for `ml/src/train.ts`) |
| `src/lib/sim/` | Herd sim UI: controls, score, population chart, event log, rules table |
| `src/lib/routes/` | Sandbox, Model Report, Responsible Use pages |
| `public/model/` | **Role 3** drops `model.json` and `model_card.json` here |

Contracts: [`docs/feature-contract.md`](../../docs/feature-contract.md).
Ecology rules and score: [`docs/ecology-rules.md`](../../docs/ecology-rules.md).

## Model files and the stub

The Worker fetches `model/model_card.json` and `model/model.json` relative to
the page. If either is missing or invalid:

- with `ALLOW_STUB_MODEL = true` (now), the app runs the stub, shows a
  "STUB: fake predictions" banner, and includes the load error;
- with `false` (from Day 12), the app shows a visible error and the sandbox
  explains that predictions are unavailable. Nothing crashes.

The Model Report never uses the stub. It reads only `model_card.json` and
shows an error until that file exists.
