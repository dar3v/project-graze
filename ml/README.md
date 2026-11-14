# ml/: training pipeline (Role 3)

Plain TypeScript run by Node 24 with `--experimental-strip-types`. There are
no ML libraries. Owner: Role 3 (see `docs/roles/ml.md`).

| Command | Script | Output |
| --- | --- | --- |
| `pnpm ml:fetch` | `src/fetch.ts` | `ml/data/` (gitignored): zip, `covtype.data.gz`, `covtype.info`, parsed cache |
| `pnpm ml:explore` | `src/explore.ts` | `ml/reports/exploration.json`: class counts, baselines, ranges, odd values, hillshade check |
| `pnpm ml:train` | fetch + explore + `src/train.ts` | `apps/web/public/model/{model.json,model_card.json}`, `ml/reports/train-report.json`, `ml/test/fixtures/inference-fixtures.json` |
| `pnpm ml:evaluate-final -- --confirm-frozen` | `src/evaluate-final.ts` | evaluates the locked test set **once** and writes `ml/reports/final-test.json` and `model_card.json` `finalTest` |

## Layout

```
src/config.ts         every setting: seed, row cap, grids, tie margin, OOD percentile
src/data/             Covertype schema, loader, paths
src/splits.ts         locked test set, random split, leave-one-area-out folds, leakage checks
src/featureSets.ts    feature matrices via @graze/features (+ ablation sets), scaler
src/models/           baselines, softmax/MLP (network.ts), random forest
src/metrics.ts        confusion matrix, per-class P/R/F1, macro-F1, log loss, calibration bins
src/calibration.ts    temperature scaling
src/ood.ts            standardized distance (shipped) + full Mahalanobis (comparison)
src/importance.ts     permutation importance
src/export.ts         model.json writer (app format)
test/                 leakage, metrics, models, and app-runtime fixture tests
```

Decisions, the selection rule and its timing are in `docs/notes.md`. The
rules: never invent numbers, and humans write the interpretation.
