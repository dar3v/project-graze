/**
 * The saved-worlds API client (D12): POST and GET a saved world, the share
 * link hash, and the model-mismatch notice. The format and its validation
 * are shared with the Worker: packages/worlds. The API is documented in
 * docs/worlds-api.md. Turning a terrain into a saved world and back is
 * ../state/worldTerrain.ts; the offline share code is ../world/share.ts.
 *
 * Only the recipe is sent: seed, generator options, elevation range, brush
 * edits as a sparse delta, and the model version. No predictions, no personal
 * data, nothing typed by the viewer.
 */
import { validateWorld, type SavedWorld, type StoredWorld } from '../../../../../packages/worlds/src/index.ts'

export { parseWorldHash, worldShareHash, WORLD_ID_PATTERN } from '../../../../../packages/worlds/src/index.ts'
export type { SavedWorld, StoredWorld } from '../../../../../packages/worlds/src/index.ts'

/**
 * Where the API lives. Empty = same origin as the app (`/api/worlds`). Set
 * VITE_WORLDS_API at build time when the static app and the Worker are on
 * different origins (docs/worlds-api.md, "Local development").
 */
export function worldsApiBase(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env
  return (env?.VITE_WORLDS_API ?? '').replace(/\/+$/, '')
}

/** The notice to show after loading, or null when the model versions match (D11, D12). */
export function modelMismatchNotice(savedModelVersion: string, currentModelVersion: string): string | null {
  if (savedModelVersion === currentModelVersion) return null
  return (
    `This world was saved with model ${savedModelVersion}. It has been predicted again with the current model ` +
    `(${currentModelVersion}), so the cover map may differ from what was saved.`
  )
}

export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const UNREACHABLE = 'The saved-worlds service could not be reached. Saving and sharing need it; everything else works offline.'

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: unknown; details?: unknown }
    const details = Array.isArray(j.details) ? j.details.filter((d) => typeof d === 'string').slice(0, 3) : []
    if (typeof j.error === 'string') return [j.error, ...details].join(' ')
  } catch {
    // not JSON: fall through
  }
  return fallback
}

/** Validate locally, then POST. Resolves with the new id or a message to show; never rejects. */
export async function saveWorld(world: SavedWorld, fetchFn: FetchLike = fetch, base = worldsApiBase()): Promise<Outcome<{ id: string }>> {
  const check = validateWorld(world)
  if (!check.ok) return { ok: false, message: `This world cannot be saved: ${check.errors.join(' ')}` }
  let res: Response
  try {
    res = await fetchFn(`${base}/api/worlds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(world) })
  } catch {
    return { ok: false, message: UNREACHABLE }
  }
  if (res.status !== 201) return { ok: false, message: await errorMessage(res, `Saving failed (HTTP ${res.status}).`) }
  try {
    const j = (await res.json()) as { id?: unknown }
    if (typeof j.id === 'string') return { ok: true, value: { id: j.id } }
  } catch {
    // fall through
  }
  return { ok: false, message: 'The server saved the world but sent back an unreadable reply.' }
}

/** GET and validate. Resolves with the world or a message to show; never rejects. */
export async function fetchWorld(id: string, fetchFn: FetchLike = fetch, base = worldsApiBase()): Promise<Outcome<StoredWorld>> {
  let res: Response
  try {
    res = await fetchFn(`${base}/api/worlds/${encodeURIComponent(id)}`)
  } catch {
    return { ok: false, message: UNREACHABLE }
  }
  if (res.status === 404) {
    // Our API answers 404 with a JSON error. Anything else (an HTML 404 page)
    // means the API is not deployed at this address.
    const isApi = (res.headers.get('content-type') ?? '').includes('application/json')
    return { ok: false, message: isApi ? `No saved world has the code "${id}". Check the link or code.` : UNREACHABLE }
  }
  if (!res.ok) return { ok: false, message: await errorMessage(res, `Loading failed (HTTP ${res.status}).`) }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, message: 'The saved world could not be read (not JSON).' }
  }
  if (typeof body !== 'object' || body === null) return { ok: false, message: 'The saved world could not be read.' }
  const { id: gotId, createdAt, ...rest } = body as Record<string, unknown>
  const check = validateWorld(rest)
  if (!check.ok) return { ok: false, message: `The saved world is damaged or from a newer app: ${check.errors.slice(0, 3).join(' ')}` }
  return { ok: true, value: { ...check.world, id: typeof gotId === 'string' ? gotId : id, createdAt: typeof createdAt === 'string' ? createdAt : '' } }
}
