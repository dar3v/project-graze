# Dataset card: Covertype

*(agent draft: facts below are copied from `covtype.info` and
`ml/reports/exploration.json`, which `pnpm ml:explore` regenerates. A human
must review this card.)*

## Source and credit

| | |
| --- | --- |
| Name | Covertype |
| Publisher | UCI Machine Learning Repository, <https://archive.ics.uci.edu/dataset/31/covertype> |
| Citation | Blackard, J. (1998). Covertype [Dataset]. UCI Machine Learning Repository. <https://doi.org/10.24432/C50K5N> |
| License | CC BY 4.0. `covtype.info` also asks reusers to retain the copyright notice for Jock A. Blackard and Colorado State University. |
| Original owners | Remote Sensing and GIS Program, Department of Forest Sciences, Colorado State University |
| Donated | August 1998 |
| File used | `covertype.zip` (contains `covtype.data.gz`). The SHA-256 is pinned in `ml/src/data/covertype.ts` and verified by `pnpm ml:fetch`. |

Related publication: Blackard, J. A. and Dean, D. J. (2000). "Comparative
accuracies of artificial neural networks and discriminant analysis in
predicting forest cover types from cartographic variables." *Computers and
Electronics in Agriculture* 24(3): 131–151.

## What a row is

One row is one **30 m × 30 m cell** in one of four wilderness areas of the
Roosevelt National Forest, northern Colorado:

- Rawah
- Neota
- Comanche Peak
- Cache la Poudre

These areas have little human disturbance, so cover type mostly reflects
ecological processes (`covtype.info`).

The **target** is the cover type mapped by the US Forest Service Region 2
Resource Information System. There are 7 classes:

1. Spruce/Fir
2. Lodgepole Pine
3. Ponderosa Pine
4. Cottonwood/Willow
5. Aspen
6. Douglas-fir
7. Krummholz

The app uses class indices 0–6 in this order (`model_card.json` `classes`).

## Size and attributes

The file has **581,012 rows** and **54 feature columns**: 10 quantitative, 4
binary wilderness-area columns and 40 binary soil-type columns. There are no
missing values. `parseCovtype` rejects any malformed row and checks that each
row has exactly one wilderness area.

| Column | Unit | Used by the model? |
| --- | --- | --- |
| Elevation | m | yes |
| Aspect | degrees azimuth | yes, as sin/cos |
| Slope | degrees | yes |
| Horizontal / vertical distance to hydrology | m | yes |
| Hillshade 9am / noon / 3pm (summer solstice) | 0–255 index | yes |
| Horizontal distance to roadways | m | **no** |
| Horizontal distance to fire points | m | **no** |
| Wilderness area (4 indicators) | 0/1 | **no** (used only to define the leave-area-out folds) |
| Soil type (40 indicators) | 0/1 | **no** |

**Why some columns are excluded:** the app predicts cover for *generated*
terrain, which has no soils, roads, fire history or wilderness boundaries. A
model that used those columns could not run in the sandbox. The
`all-original` ablation in `model_card.json` measures how much accuracy this
costs.

## Class balance

The full counts are in `exploration.json` `classCounts` and in
`model_card.json` `dataset.classCounts`.

- Lodgepole Pine and Spruce/Fir together account for about 85% of rows.
- Cottonwood/Willow is under 0.5% of rows.
- The classes are not spread evenly across areas (`devClassCountsByArea`):
  - Cottonwood/Willow occurs **only** in Cache la Poudre.
  - Cache la Poudre has no Spruce/Fir.
  - Neota has only Spruce/Fir, Lodgepole Pine and Krummholz.

  Leave-one-area-out results therefore vary a lot between folds.

## Odd values

Counts are on the dev set and come from `exploration.json` `devOddValues`
and `devDuplicates`.

- **Aspect:** both 0 and 360 occur (`aspect360`), and they mean the same
  direction. The sin/cos encoding makes them identical.
- **Vertical distance to water:** about 9.5% of rows are negative, meaning
  the cell is below the nearest water surface. Generated terrain with one
  flat water level never produces negative values (see
  `feature-contract.md`).
- **Hillshade:**
  - Hillshade 3pm is 0 in about 0.2% of rows: steep slopes facing away
    from the afternoon sun.
  - No row has all three hillshades at 0.
- **Duplicates:** no full rows repeat. A small number of rows share
  identical 8 raw model inputs, and some of those carry a different label.
  This is irreducible noise for a terrain-only model.

## Known limits

- **Geographic scope:** one national forest in one state. Nothing here says
  what grows in other mountain ranges or climates.
- **Spatial correlation:** neighbouring cells are correlated, so random
  splits overstate accuracy. That is why we use leave-one-area-out.
- **Labels:** labels are mapped from survey data, not ground truth for
  every cell.
- **Derived variables:** slope, aspect, hillshade and water distances were
  derived from USGS and USFS GIS layers whose exact processing we do not
  know. The app recomputes them from synthetic heightmaps
  (`docs/notes.md` section 5).

## How predictions are shown

*(Agent draft, 2026-11-15; needs human review.)*

The app never shows Covertype rows. It shows a model trained on them,
applied to terrain that is generated, not measured.

- **Walk-mode vegetation and the cover overlay are a visualization of
  predicted classes on generated terrain.** Each cell's trees and tint come
  from the class the model predicts for that cell's computed inputs.
- **Generated terrain is not real terrain.** It is seeded noise scaled into
  Covertype's elevation range. Its slope, aspect, hillshade and water
  distances are computed by `@graze/features`, not taken from the USGS and
  USFS layers behind this dataset (see "Known limits").
- **The OOD flag marks low-trust cells**: cells whose inputs are outside the
  training ranges, or far from the training data's centre. They are drawn
  sparse and desaturated in walk mode. On the Sandbox page's default
  settings, the share of land cells flagged is measured in
  `model_card.json` `ood.generatedTerrain` and summarized in
  `docs/model-card.md`.
