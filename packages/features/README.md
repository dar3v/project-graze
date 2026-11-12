# @graze/features

Shared terrain-feature contract for Project Graze. **Single source of truth**:
both `ml/` (training) and `apps/web` (inference) import from here so
preprocessing cannot drift (README.md "Why TypeScript instead of Python?").

Exports:
- `FEATURE_NAMES` — canonical feature order.
- `FeatureValues` / `FeatureVector` — named values and ordered numeric vector.
- `computeFeatures(sample)` — pure, deterministic `TerrainSample -> FeatureValues`.
- `toFeatureVector` / `sampleToVector` — ordered vector for the model.
- `isFiniteFeatureValues` / `outOfRangeFeatureNames` — validation helpers.

No dataset constants, metrics, or results live here. Feature ranges come from
the `ml:prepare` output and are passed in at call time; hillshade values are
supplied by the caller (dataset columns for training, terrain computation for
the app). See README.md "The ML problem" for the feature list.

## How the shared module is resolved

`package.json` declares `name` + `exports`, so Node resolves `@graze/features`
by self-reference from inside this package (covered by the unit test). The
placeholder consumers in `apps/web/src/placeholder.ts` and
`ml/src/placeholder.ts` use relative `.ts` imports for now: this keeps `tsc`
and Vite/Node working without a pnpm workspace.

There is deliberately **no `packages:` field in `pnpm-workspace.yaml`**:
`cf` (beta) refuses to build from a pnpm workspace root, and the Worker lives
at the repo root (AGENTS.md). Switch consumers to the `@graze/features` name
via a bundler alias / supported workspace setup once that constraint changes.

## Reviewer gate

`features.ts` and the `ml/` evaluation scripts are cross-cutting: they feed the
ML owner (Zeki-Zek), the app owner (Liamjandr), and the world owner (dar3v).
**Any change to `features.ts` or to evaluation scripts requires a reviewer pass
from the app and world owners before merge.** This documents the gate; human
sign-off on the initial landing is still pending.

> Ownership note: AGENTS.md contains no ownership rules (it is the Cloudflare
> template); the roles above come from the README.md Team table.
