/**
 * Saved-world format (Role 2, D12). Shared by the browser (before upload, and
 * after download) and the Hono Worker (on every request), so both sides apply
 * the same rules.
 *
 * A world is stored as the RECIPE, not the terrain: seed, generator options,
 * the elevation range the generator scaled into, and the brush edits as a
 * sparse delta from the generated heightmap. Predictions are never stored;
 * loading a world always re-predicts with the model the app has now.
 *
 * No personal data: no accounts, no names, no free-text fields. Unknown keys
 * are rejected so nothing else can be smuggled in.
 */

export const WORLD_SCHEMA_VERSION = 1
/** Heightmap side length. The contract fixes it at 128 (docs/feature-contract.md). */
export const WORLD_SIZE = 128
/** Largest accepted request body / stored payload, in bytes of UTF-8 JSON. */
export const MAX_WORLD_BYTES = 200_000
/** Brush edits are stored in decimeters: a loaded world is within 5 cm of the saved one. */
export const EDIT_UNIT_M = 0.1
/** Largest stored height change for one cell, in edit units (2,000 m). */
export const MAX_EDIT_UNITS = 20_000
/** Ids are 10 lowercase base-32 characters (~50 bits). */
export const WORLD_ID_PATTERN = /^[a-z2-7]{10}$/

export interface WorldOptions {
  /** Generator band center, 0..1 (Role 1's `center`). */
  readonly center: number
  /** Generator relief, 0..1. */
  readonly relief: number
  /** Generator roughness, 0..1. */
  readonly roughness: number
  /** Generator valley depth, 0..1. */
  readonly valley: number
  /** Share of cells under water, 0..1 (the Sandbox's water slider / 100). */
  readonly waterShare: number
  /** Elevation range the generator scaled into, meters (model_card.json training range when saved). */
  readonly elevation: { readonly min: number; readonly max: number }
}

export interface SavedWorld {
  readonly schemaVersion: typeof WORLD_SCHEMA_VERSION
  /** `model_card.json` model.version when the world was saved. */
  readonly modelVersion: string
  readonly seed: number
  readonly size: number
  readonly options: WorldOptions
  /**
   * Brush edits, flat pairs `[gap0, d0, gap1, d1, ...]`. `gap` is the cell
   * index minus the previous edited index (the first is the index itself), so
   * indices are strictly increasing; `d` is the height change in EDIT_UNIT_M,
   * never 0.
   */
  readonly edits: readonly number[]
}

export interface StoredWorld extends SavedWorld {
  readonly id: string
  /** ISO 8601, set by the server. */
  readonly createdAt: string
}

export type WorldResult = { readonly ok: true; readonly world: SavedWorld } | { readonly ok: false; readonly errors: readonly string[] }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1

const WORLD_KEYS = ['schemaVersion', 'modelVersion', 'seed', 'size', 'options', 'edits']
const OPTION_KEYS = ['center', 'relief', 'roughness', 'valley', 'waterShare', 'elevation']

function unknownKeys(o: Obj, allowed: readonly string[], where: string, errors: string[]): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${where} has an unknown field "${k}".`)
}

/** Byte length of the JSON a world serializes to. */
export function worldByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/** Validate an untrusted saved world (a parsed request body, a downloaded file). Never throws. */
export function validateWorld(raw: unknown): WorldResult {
  const errors: string[] = []
  if (!isObj(raw)) return { ok: false, errors: ['A saved world must be a JSON object.'] }
  unknownKeys(raw, WORLD_KEYS, 'The world', errors)

  if (raw.schemaVersion !== WORLD_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${WORLD_SCHEMA_VERSION}; this world was saved in a format this app cannot read.`)
  }
  if (typeof raw.modelVersion !== 'string' || !/^[0-9A-Za-z.+-]{1,32}$/.test(raw.modelVersion)) {
    errors.push('modelVersion must be a version string like "0.1.0" (letters, digits, ".", "+", "-"; at most 32).')
  }
  if (!isInt(raw.seed) || raw.seed < -2147483648 || raw.seed > 2147483647) errors.push('seed must be a 32-bit integer.')
  if (raw.size !== WORLD_SIZE) errors.push(`size must be ${WORLD_SIZE}.`)

  const o = raw.options
  if (!isObj(o)) errors.push('options must be an object.')
  else {
    unknownKeys(o, OPTION_KEYS, 'options', errors)
    for (const k of ['center', 'relief', 'roughness', 'valley', 'waterShare'] as const) {
      if (!isUnit(o[k])) errors.push(`options.${k} must be a number from 0 to 1.`)
    }
    const e = o.elevation
    if (!isObj(e) || Object.keys(e).some((k) => k !== 'min' && k !== 'max')) errors.push('options.elevation must be { min, max }.')
    else if (!(typeof e.min === 'number' && typeof e.max === 'number' && Number.isFinite(e.min) && Number.isFinite(e.max) && e.min >= 0 && e.max <= 9000 && e.min < e.max)) {
      errors.push('options.elevation must have 0 <= min < max <= 9000 meters.')
    }
  }

  const edits = raw.edits
  if (!Array.isArray(edits)) errors.push('edits must be an array.')
  else if (edits.length % 2 !== 0) errors.push('edits must hold [gap, change] pairs.')
  else if (edits.length > 2 * WORLD_SIZE * WORLD_SIZE) errors.push('edits lists more cells than the map has.')
  else {
    let index = -1
    for (let k = 0; k < edits.length; k += 2) {
      const gap = edits[k]
      const d = edits[k + 1]
      if (!isInt(gap) || gap < (k === 0 ? 0 : 1)) {
        errors.push(`edits[${k}] must be a ${k === 0 ? 'non-negative' : 'positive'} integer cell gap.`)
        break
      }
      index += k === 0 ? gap + 1 : gap
      if (index >= WORLD_SIZE * WORLD_SIZE) {
        errors.push(`edits[${k}] points past the last cell.`)
        break
      }
      if (!isInt(d) || d === 0 || Math.abs(d) > MAX_EDIT_UNITS) {
        errors.push(`edits[${k + 1}] must be a non-zero integer change of at most ${MAX_EDIT_UNITS} (${MAX_EDIT_UNITS * EDIT_UNIT_M} m).`)
        break
      }
    }
  }

  if (errors.length === 0 && worldByteLength(raw) > MAX_WORLD_BYTES) {
    errors.push(`The world is too large to save (over ${MAX_WORLD_BYTES / 1000} kB). Reset part of the terrain and try again.`)
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, world: raw as unknown as SavedWorld }
}

/** Sparse brush-edit delta between the generated heightmap and the current one. */
export function encodeEdits(base: Float32Array, current: Float32Array): number[] {
  if (base.length !== current.length) throw new RangeError('base and current heightmaps differ in size')
  const out: number[] = []
  let last = -1
  for (let i = 0; i < base.length; i++) {
    const d = Math.max(-MAX_EDIT_UNITS, Math.min(MAX_EDIT_UNITS, Math.round((current[i] - base[i]) / EDIT_UNIT_M)))
    if (d === 0) continue
    out.push(last < 0 ? i : i - last, d)
    last = i
  }
  return out
}

/** The edited heightmap: a copy of `base` with `edits` applied. `edits` must have passed validateWorld. */
export function applyEdits(base: Float32Array, edits: readonly number[]): Float32Array {
  const out = base.slice()
  let index = -1
  for (let k = 0; k < edits.length; k += 2) {
    index += k === 0 ? edits[k] + 1 : edits[k]
    out[index] += edits[k + 1] * EDIT_UNIT_M
  }
  return out
}

/** Number of edited cells in an edits array. */
export const editedCellCount = (edits: readonly number[]): number => edits.length / 2

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

/** A new random world id (crypto-random; works in Workers, browsers and Node). */
export function newWorldId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  let id = ''
  for (const b of bytes) id += ID_ALPHABET[b & 31]
  return id
}

/** Share link for a saved world: the app's own address with `#/world/<id>`. Hash routes never reach the server. */
export function worldShareHash(id: string): string {
  return `#/world/${id}`
}

/** The id in a `#/world/<id>` hash, or null. */
export function parseWorldHash(hash: string): string | null {
  const m = /^#\/world\/([a-z2-7]{10})\/?$/.exec(hash)
  return m ? m[1] : null
}
