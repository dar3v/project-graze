/**
 * Save, load and share a world on the client (D13, optional).
 *
 * `exportWorld()` turns the world being worked on into the shared saved-world
 * format: the seed, the generation options, the model version, and the brush
 * edits as a compact delta from the generated terrain (never the full
 * heightmap). `importWorld()` reads one back and validates it.
 *
 * The format, its limits and its validation belong to Role 2 and live in
 * `packages/worlds` (`docs/worlds-api.md`); the version is two fields there,
 * `schemaVersion` and `modelVersion`. This file only wraps
 * `buildSavedWorld()` / `restoreWorld()` and adds a share CODE: the same
 * JSON, compressed and base64url-encoded, that a viewer copies and pastes.
 * A code needs no server, so sharing works on a static host even when the
 * Worlds API is not deployed. (With the API, the short `#/world/<id>` link
 * from `sandbox/worldIo.ts` does the same job.)
 *
 * Nothing here throws on bad input: every failure is a message to show.
 */

import { MAX_WORLD_BYTES, validateWorld } from '../../../../../packages/worlds/src/index.ts'
import type { SavedWorld } from '../../../../../packages/worlds/src/index.ts'
import { buildSavedWorld, restoreWorld } from '../sandbox/worldIo.ts'
import type { ElevationRange, RestoredWorld } from '../sandbox/worldIo.ts'
import type { WorldConfig } from '../state/worldConfig.ts'

/** Compressed code: `graze1.` + base64url(deflate-raw(JSON)). */
export const SHARE_CODE_PREFIX = 'graze1.'
/** Uncompressed code, written only where CompressionStream is missing: `graze0.` + base64url(JSON). */
export const SHARE_CODE_PLAIN_PREFIX = 'graze0.'
/** Longest text `importWorld` will look at. Base64 of the largest allowed world is about 267,000 characters. */
export const MAX_IMPORT_CHARS = 300_000

export interface ExportInput {
  /** Seed, generation options and water share (the shared `worldConfig` store). */
  readonly config: WorldConfig
  /** `model_card.json` `model.version` right now. */
  readonly modelVersion: string
  /** Elevation range the terrain was generated into. */
  readonly elevation: ElevationRange
  /** The terrain as generated, before brush edits. */
  readonly base: Float32Array
  /** The live heightmap, with brush edits. */
  readonly heightmap: Float32Array
}

/** The world as a saved-world object: recipe plus the brush-edit delta. */
export function exportWorld(input: ExportInput): SavedWorld {
  return buildSavedWorld(input.config, input.modelVersion, input.elevation, input.base, input.heightmap)
}

export type ImportResult =
  | {
      readonly ok: true
      readonly world: SavedWorld
      /** Format version of the saved world. */
      readonly schemaVersion: number
      /** Model the world was saved with. The app predicts again with its current model and says so if they differ. */
      readonly modelVersion: string
      /** Config and heightmaps rebuilt from the recipe and the edits. */
      readonly restored: RestoredWorld
    }
  | { readonly ok: false; readonly message: string }

const NOT_A_WORLD = 'That is not a world code. Paste a whole code (it starts with "graze1."), a share link, or a 10-character world code.'
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
 * uses (types, ranges, unknown fields, size), and only then rebuilt. Bad,
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
    return { ok: true, world: check.world, schemaVersion: check.world.schemaVersion, modelVersion: check.world.modelVersion, restored: restoreWorld(check.world) }
  } catch {
    return { ok: false, message: DAMAGED }
  }
}
