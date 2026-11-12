# apps/web (stub)

Frontend placeholder: Svelte + Vite + three.js terrain sandbox, habitat
prediction via a Web Worker, Site Probe form, and Model Report page. Owner:
Liamjandr (app/simulation), with dar3v for the terrain world (README.md Team
table).

Nothing is implemented yet. `src/placeholder.ts` only proves the shared
`packages/features` contract resolves; it is included in the root typecheck.
When real Svelte code lands, give this package its own tsconfig, remove it from
the root `tsconfig.json` include, and switch the import to `@graze/features`
via a Vite alias (see `pnpm-workspace.yaml` note).
