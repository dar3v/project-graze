# Model Card / Model Report (stub)

Fill from real `ml:evaluate` output only. No metrics, dataset facts, or results
are recorded here by hand.

Sections:
- Dataset description and preparation steps → see `dataset-card.md`.
- Validation: stratified random split **and** leave-one-wilderness-area-out
  (the honest generalization test). Scalers and hyperparameters fit on training
  folds only; final test set untouched until the model is frozen.
- Models compared: majority-class baseline, hand-written elevation-band rule,
  softmax regression, and one flexible model (random forest or small neural
  network).
- Metrics: per-class precision/recall/F1, macro-F1, confusion matrix —
  produced by `ml:evaluate`, not written here.
- Ablations, including the hillshade-computation ablation.
- Limitations → see `limitations.md`.

Never-cut items kept as stubs so they are not dropped from scope: baselines,
leave-one-wilderness-area-out evaluation, validation, and the limitations
notice.
