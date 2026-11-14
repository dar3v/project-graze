/**
 * The offline share code (D13, optional): a saved world as text.
 *
 * A code is the saved-world JSON, compressed and base64url-encoded, that a
 * viewer copies and pastes. It needs no server, so sharing works on a static
 * host even when the Worlds API is not deployed. (With the API, the short
 * `#/world/<id>` link from `sandbox/worldIo.ts` does the same job.)
 *
 * The format, its limits and its validation belong to Role 2 and live in
 * `packages/worlds` (`docs/worlds-api.md`); the version is two fields there,
 * `schemaVersion` and `modelVersion`. Turning the terrain into a saved world
 * and back (recipe plus a compact brush-edit delta, never the heightmap) is
 * `../state/worldTerrain.ts` (`toSavedWorld`, `openSavedWorld`).
 *
 * `readWorldInput()` sorts what a viewer pasted into "World code or link":
 * an offline code, saved-world JSON, a share link or a 10-character id.
 *
 * Nothing here throws on bad input: every failure is a message to show.
 */

import { MAX_WORLD_BYTES, parseWorldHash, validateWorld } from '../../../../../packages/worlds/src/index.ts'
import type { SavedWorld } from '../../../../../packages/worlds/src/index.ts'

/** Compressed code: `graze1.` + base64url(deflate-raw(JSON)). */
export const SHARE_CODE_PREFIX = 'graze1.'
/** Uncompressed code, written only where CompressionStream is missing: `graze0.` + base64url(JSON). */
export const SHARE_CODE_PLAIN_PREFIX = 'graze0.'
/** Longest text `importWorld` will look at. Base64 of the largest allowed world is about 267,000 characters. */
export const MAX_IMPORT_CHARS = 300_000

/** A validated saved world (its `modelVersion` says which model it was saved with), or a message to show. */
export type ImportResult = { readonly ok: true; readonly world: SavedWorld } | { readonly ok: false; readonly message: string }

export const NOT_A_WORLD = 'That is not a world code. Paste a 10-character code, a whole share link, or an offline code (it starts with "graze1.").'
const DAMAGED = 'This world code is damaged or incomplete. Copy the whole code and try again.'
const TOO_LARGE = `This world is too large to open (over ${MAX_WORLD_BYTES / 1000} kB).`

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Inflate at most `limit` bytes; null if the data is bad, 'too-large' if it would exceed the limit. */
async function inflate(bytes: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array | 'too-large' | null> {
  try {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
    const parts: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > limit) {
        await reader.cancel().catch(() => undefined)
        return 'too-large'
      }
      parts.push(value)
    }
    const out = new Uint8Array(total)
    let at = 0
    for (const p of parts) {
      out.set(p, at)
      at += p.length
    }
    return out
  } catch {
    return null
  }
}

/** A share code for a saved world. Paste it into "World code or link" to open the world anywhere. */
export async function exportShareCode(world: SavedWorld): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(world))
  if (typeof CompressionStream === 'function') {
    try {
      return SHARE_CODE_PREFIX + toBase64Url(await deflate(json))
    } catch {
      // fall through to the plain code
    }
  }
  return SHARE_CODE_PLAIN_PREFIX + toBase64Url(json)
}

/** True if the text looks like a share code (it may still be damaged). */
export function isShareCode(text: string): boolean {
  const t = text.trim()
  return t.startsWith(SHARE_CODE_PREFIX) || t.startsWith(SHARE_CODE_PLAIN_PREFIX)
}

async function codeToJson(text: string): Promise<{ json: string } | { message: string }> {
  const compressed = text.startsWith(SHARE_CODE_PREFIX)
  const bytes = fromBase64Url(text.slice(compressed ? SHARE_CODE_PREFIX.length : SHARE_CODE_PLAIN_PREFIX.length))
  if (!bytes || bytes.length === 0) return { message: DAMAGED }
  let raw: Uint8Array
  if (compressed) {
    if (typeof DecompressionStream !== 'function') return { message: 'This browser cannot open compressed world codes. Try a current browser.' }
    const r = await inflate(bytes, MAX_WORLD_BYTES)
    if (r === 'too-large') return { message: TOO_LARGE }
    if (!r) return { message: DAMAGED }
    raw = r
  } else {
    if (bytes.length > MAX_WORLD_BYTES) return { message: TOO_LARGE }
    raw = bytes
  }
  try {
    return { json: new TextDecoder('utf-8', { fatal: true }).decode(raw) }
  } catch {
    return { message: DAMAGED }
  }
}

/**
 * Read a world from untrusted text: a share code, or the saved-world JSON
 * itself. The world is validated with the same `validateWorld` the server
 * uses (types, ranges, unknown fields, size). Bad,
 * damaged or oversized input gives `{ ok: false, message }`; it never throws.
 */
export async function importWorld(text: unknown): Promise<ImportResult> {
  try {
    if (typeof text !== 'string') return { ok: false, message: NOT_A_WORLD }
    const t = text.trim()
    if (t.length === 0) return { ok: false, message: NOT_A_WORLD }
    if (t.length > MAX_IMPORT_CHARS) return { ok: false, message: TOO_LARGE }
    let json: string
    if (isShareCode(t)) {
      const r = await codeToJson(t)
      if ('message' in r) return { ok: false, message: r.message }
      json = r.json
    } else if (t.startsWith('{')) {
      json = t
    } else {
      return { ok: false, message: NOT_A_WORLD }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return { ok: false, message: DAMAGED }
    }
    const check = validateWorld(parsed)
    if (!check.ok) return { ok: false, message: `This world cannot be opened: ${check.errors.slice(0, 3).join(' ')}` }
    return { ok: true, world: check.world }
  } catch {
    return { ok: false, message: DAMAGED }
  }
}

/** What a viewer pasted into "World code or link". */
export type WorldInput =
  /** An offline code or saved-world JSON: open it with `importWorld`. */
  | { readonly kind: 'text'; readonly text: string }
  /** A saved-world id (from a bare code or a whole share link): fetch it from the API. */
  | { readonly kind: 'id'; readonly id: string }
  | { readonly kind: 'invalid'; readonly message: string }

/** Sort pasted text into an offline code / JSON, a saved-world id, or neither. */
export function readWorldInput(text: string): WorldInput {
  const t = text.trim()
  if (isShareCode(t) || t.startsWith('{')) return { kind: 'text', text: t }
  const id = parseWorldHash(t.includes('#') ? t.slice(t.indexOf('#')) : `#/world/${t.toLowerCase()}`)
  return id ? { kind: 'id', id } : { kind: 'invalid', message: NOT_A_WORLD }
}
