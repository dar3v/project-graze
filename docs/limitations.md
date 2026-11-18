# Limitations

What the app must not be used for, and how to read what it shows. This list
mirrors README.md "Responsible use and limitations"; keep the two in sync.

**Never cut:** the in-app notice below stays even if other scope is cut.

## In-app notice

Every page shows this in the footer (`apps/web/src/lib/components/Footer.svelte`):

> **Educational simulation only.** Not for real forestry, conservation, or
> land-use decisions. The model learned from one forest region in Colorado.
> Its predictions do not transfer to other places, and on this generated
> terrain they are estimates, not facts.

Above it, and under the 3D world, is `PREDICTION_NOTICE`
(`apps/web/src/lib/state/worldFeatures.ts`): "Predictions are for
terrain-like inputs, not real ground truth." The full explanation is the
Responsible Use page (`#/responsible-use`).

## Limitations

- **Educational simulation only.** Do not use this for real forestry, conservation, or land-use decisions.
- **One forest.** All training data comes from a single region in Colorado, so predictions do not transfer to other climates or ecosystems.
- **Synthetic terrain.** Generated terrain differs from real terrain. The app predicts what a real site with those terrain features would likely have, not actual Minecraft biomes.
- **Estimates, not guarantees.** Predicted probabilities are estimates and can be wrong, especially for rare classes and out-of-range inputs.
- **Class imbalance.** Two cover types dominate the data, so we report per-class metrics and macro-F1, not accuracy alone.
- **Computed features.** Our hillshade computation may differ slightly from the dataset's original method. An ablation measures how much this matters.
- **Walk mode and the background are pictures of predictions.** Vegetation in walk mode, the page background and the overlays draw the model's predicted class on generated terrain, not a real place. Plant and animal shapes are team-made art built in code, not data. A good-looking world is not evidence the model is accurate, and low-trust (out-of-distribution) cells are drawn differently.
- **Privacy.** The app has no accounts and collects no personal data. Saved worlds store only the terrain recipe.

Metrics, per-class results and the model's own limitations are in
[`model-card.md`](model-card.md); the dataset's are in
[`dataset-card.md`](dataset-card.md).
