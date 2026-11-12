# ml/ (stub)

Node/TypeScript training scripts placeholder: `ml:fetch`, `ml:prepare`,
`ml:train`, `ml:evaluate` (names from README.md; scripts are not yet in
package.json). Owner: Zeki-Zek (README.md Team table).

`src/placeholder.ts` only proves the shared `packages/features` contract
resolves; it is included in the root typecheck. No data, model, metrics, or
dataset facts exist yet. When real scripts land, give this package its own
tsconfig and remove it from the root `tsconfig.json` include.
