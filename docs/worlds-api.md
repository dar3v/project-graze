# Worlds API: save, load, share (Role 2, D12, optional)

*Agent draft, 2026-11-15. Nothing is deployed and no Cloudflare resources were
created.*

The Hono Worker (`src/index.ts`) stores small world recipes in D1. The static
app saves and loads them, and shares them as a link or a code.

## What is stored

The format is `SavedWorld` in `packages/worlds/src/index.ts`. The same
`validateWorld` runs in the browser before upload, in the Worker on every
save, and in the browser again after download.

| Field | Contents |
| --- | --- |
| `schemaVersion` | `1` |
| `modelVersion` | `model_card.json` `model.version` at save time |
| `seed` | 32-bit integer |
| `size` | `128` |
| `options` | `center`, `relief`, `roughness`, `valley`, `waterShare` (each 0–1), `elevation {min, max}` (meters) |
| `edits` | brush edits as a sparse delta from the generated heightmap: flat `[gap, change]` pairs (see below) |

How `edits` works:

- `gap` is the distance in cells from the previous edited cell. For the first
  pair it is the cell index itself.
- `change` is the height change in 0.1 m units. A loaded world is within
  5 cm of the saved one.
- An edit on every cell still fits under the size limit (tested).

The server adds `id` and `createdAt`.

**Not stored:**

- predictions (a loaded world is always predicted again)
- names, accounts, free text
- IP addresses, user agents

Unknown fields are rejected, so nothing else can be slipped in.

## Endpoints

| Method and path | Success | Errors (JSON `{ error, details[] }`) |
| --- | --- | --- |
| `POST /api/worlds` | `201 { id, createdAt }` | `400` not JSON or invalid world, `413` over 200 kB, `415` not `application/json`, `429` rate limited, `500` |
| `GET /api/worlds/:id` | `200` the world plus `id` and `createdAt`, `Cache-Control: public, max-age=3600` | `400` malformed id, `404` unknown id |

Ids are 10 random base-32 characters (`[a-z2-7]`, about 50 bits). CORS allows
any origin, because the static app may be on another origin. There are no
credentials or cookies.

This confirms ROLE-1 D13's proposed paths unchanged. The changes needed in
ROLE-1 are already listed in `docs/roles/app-and-sim.md` under D12:

- `version` becomes `modelVersion` plus `schemaVersion`;
- `importWorld()` must surface `modelVersion`;
- `exportWorld()`/`importWorld()` can wrap `buildSavedWorld()` and
  `restoreWorld()` in `apps/web/src/lib/sandbox/worldIo.ts`.

## Loading a world saved under another model

`restoreWorld()` regenerates the terrain from the recipe and applies the
edits. The Sandbox then predicts it again with the model it has loaded now.

If `modelVersion` differs from the current `model.version`, the page shows:

> This world was saved with model X. It has been predicted again with the
> current model (Y), so the cover map may differ from what was saved.

This matches the rule in `docs/model-card.md`, "Versioning and compatibility".

## Share link and code

- **Link:** `<app address>#/world/<id>`. The router sends `#/world/<id>` to
  the Sandbox, which loads the world once the model has finished loading.
- **Code:** the 10-character id. Paste it, or the whole link, into "World
  code or link" and press Open.

- **Offline code (Role 1, D13):** "Copy offline code" puts the whole saved
  world on the clipboard as text: `graze1.` followed by the same JSON,
  deflate-compressed and base64url-encoded (`apps/web/src/lib/world/share.ts`).
  Pasting it into "World code or link" opens the world with no request to the
  API, so sharing works even where the Worker is not deployed. It is
  validated with the same `validateWorld`, and a code that would inflate past
  the 200 kB limit is refused. A world with no brush edits is about 150
  characters; a heavily sculpted one can run to tens of thousands.

Hosting check:

- The part after `#` is never sent to the server; browsers keep the fragment
  client-side.
- So the link works on any static host: Cloudflare Pages, `vite preview`, or
  a plain file server.
- It needs no rewrite rules, which the app already relies on for its hash
  routes.
- The link only loads if the Worker API can be reached from that page (see
  below). Otherwise the page shows "The saved-worlds service could not be
  reached" and everything else keeps working.

## D1 schema and migration

The table is defined in `migrations/0001_create_worlds.sql`:

```sql
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

The Worker also runs the same statement once per isolate before its first
query (`src/worlds/db.ts`). A test keeps the two copies equal. This way local
development works without applying migrations by hand.

For a deployed database, apply the migration with `cf d1 migrations apply`
(it takes the database ID; see `cf d1 migrations apply --help`).

Limits:

- D1 allows rows up to 2 MB.
- The 100 KB SQL statement limit does not apply to bound values.
- Our 200 kB payload cap is well inside both.
- Source: <https://developers.cloudflare.com/d1/platform/limits/>, checked
  2026-11-15.

## Rate limiting (verified)

Cloudflare offers a **Workers Rate Limiting binding**. Its documentation and
changelog say it is generally available:

- <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>
- 2025-09-19 GA changelog

The installed `cf/config` has `bindings.rateLimit({ namespace, simple: { limit, period } })`.
`period` must be 10 or 60 seconds.

What the docs say about it:

- Limits are **approximate and per Cloudflare location**, so requests can
  exceed them while counts update.
- There is a separate "strict limits" option for an exact cross-location
  limit. We do not use it.
- WAF rate limiting rules are a zone-level product for a custom domain. We
  did not configure them.

What we use:

- `WORLDS_RATE_LIMIT`: 10 saves per 60 s per key, on `POST` only.
- The key is `save:<cf-connecting-ip>`. The address is used only as the key
  and is never written to D1.
- `namespace: '1001'` is a placeholder from the docs. It must be unique in
  the account that deploys, so change it then.

## Local development

The Worker and the static app are two dev servers:

1. `pnpm dev` starts the Worker with local D1 and the rate-limit binding
   (`cf dev`). It prints its local URL.
2. `VITE_WORLDS_API=<that URL> pnpm web:dev` starts the app pointed at it.

Without `VITE_WORLDS_API`, the app calls `/api/worlds` on its own origin.
That is right when the app and the API share an origin in production.

Without step 1, saving and loading show the "could not be reached" message.

Tests:

- `test/worlds-api.test.ts` runs the real Hono app against an in-memory
  SQLite stand-in for D1 (`test/fakeD1.ts`, Node's `node:sqlite`). It covers
  round-trip save and load, bad payloads, oversized payloads, rate limiting,
  ids, CORS, and that the migration matches the schema.
- `packages/worlds/test/` covers the format.
- `apps/web/test/state.test.ts` covers the client.
