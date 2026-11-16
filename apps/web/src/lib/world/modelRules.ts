/**
 * Custom `.glb` models (D17): the slots, the manifest format and the
 * validation rules. Three-free and pure, so the same rules run in the browser
 * (`./models.ts`), in `pnpm models:check` (no browser) and in the tests.
 *
 * Level A only: vertex colors, no textures. A model replaces one code-built
 * shape (a plant silhouette, the grass tuft, or an animal). Anything that
 * fails a rule here is rejected with a reason that names the file, and the
 * code-built shape stays, so the world always renders.
 *
 * Provenance: team-made files only. No AI-generated assets, and no downloaded
 * libraries without a team decision (docs/custom-models.md). The manifest
 * records who made each file.
 */

import { SPECIES } from './vegetation.ts'
import type { Silhouette } from './vegetation.ts'

export type PlantSlot = Silhouette
export type ModelSlot = PlantSlot | 'grassTuft' | 'herbivore' | 'predator'
export type SlotKind = 'tree' | 'shrub' | 'grass' | 'animal'

/** The 7 plant slots, in cover-class order (`SPECIES`). */
export const PLANT_SLOTS: readonly PlantSlot[] = SPECIES.map((s) => s.silhouette)
/** Every slot a model can fill: 7 plants, the grass tuft, two animals. */
export const MODEL_SLOTS: readonly ModelSlot[] = [...PLANT_SLOTS, 'grassTuft', 'herbivore', 'predator']

export function slotKind(slot: ModelSlot): SlotKind {
  if (slot === 'grassTuft') return 'grass'
  if (slot === 'herbivore' || slot === 'predator') return 'animal'
  return slot === 'shrub' ? 'shrub' : 'tree'
}

export function isModelSlot(v: unknown): v is ModelSlot {
  return typeof v === 'string' && (MODEL_SLOTS as readonly string[]).includes(v)
}

export interface SlotBudget {
  /** Most triangles a model in this slot may have. */
  readonly maxTriangles: number
  /** Plausible height (world units, 1 = one 30 m cell), or null where length is checked instead. */
  readonly height: readonly [number, number] | null
  /** Plausible length along +X (animals face +X), or null. */
  readonly length: readonly [number, number] | null
}

/**
 * Budgets per kind. The triangle budgets come from the instance counts: about
 * 19,000 plants on the high preset, so a 60-triangle tree is already over a
 * million triangles. Sizes are the guide's sizes with room either side.
 */
export const BUDGETS: Record<SlotKind, SlotBudget> = {
  tree: { maxTriangles: 60, height: [0.6, 2], length: null }, // about 1-1.4 units tall
  shrub: { maxTriangles: 60, height: [0.1, 0.8], length: null }, // about 0.3
  grass: { maxTriangles: 6, height: [0.03, 0.3], length: null },
  animal: { maxTriangles: 200, height: [0.1, 1.2], length: [0.25, 1] }, // about 0.5 long
}

/** One file may be at most this large. */
export const MAX_FILE_BYTES = 100 * 1024
/** All files together may be at most this large. */
export const MAX_TOTAL_BYTES = 1024 * 1024
/** The lowest point of a model must be this close to Y = 0 (the origin is at the base). */
export const BASE_TOLERANCE = 0.06

/** What a model must say about itself in `manifest.json`. */
export interface ManifestEntry {
  /** File name inside `public/models/`, for example `spire.glb`. */
  readonly file: string
  /** Who on the team made it. */
  readonly author: string
  readonly source: 'team-made'
  readonly version: number | string
}

export interface ModelManifest {
  readonly version: 1
  /** Every slot is listed. `null` means "use the code-built shape". */
  readonly slots: Record<ModelSlot, ManifestEntry | null>
}

export const EMPTY_MANIFEST: ModelManifest = {
  version: 1,
  slots: Object.fromEntries(MODEL_SLOTS.map((s) => [s, null])) as Record<ModelSlot, ManifestEntry | null>,
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A plain file name ending in .glb: no folders, no URLs, so a manifest can only point inside `models/`. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.glb$/

/**
 * Read an untrusted manifest. Never throws. A slot whose entry is wrong is
 * left empty and reported in `errors`; unknown slots are reported and
 * ignored. A missing `author` or a `source` other than "team-made" is an
 * error: provenance is not optional.
 */
export function parseManifest(raw: unknown): { manifest: ModelManifest; errors: string[] } {
  const errors: string[] = []
  const slots = { ...EMPTY_MANIFEST.slots }
  if (!isRecord(raw) || !isRecord(raw.slots)) {
    errors.push('manifest.json must be an object with a "slots" object')
    return { manifest: { version: 1, slots }, errors }
  }
  if (raw.version !== 1) errors.push('manifest.json: "version" must be 1')
  for (const [key, value] of Object.entries(raw.slots)) {
    if (!isModelSlot(key)) {
      errors.push(`manifest.json: unknown slot "${key}"`)
      continue
    }
    if (value === null || value === undefined) continue
    if (!isRecord(value)) {
      errors.push(`manifest.json: slot "${key}" must be null or an object`)
      continue
    }
    const problems: string[] = []
    if (typeof value.file !== 'string' || !FILE_NAME.test(value.file)) problems.push('"file" must be a .glb file name with no folder')
    if (typeof value.author !== 'string' || value.author.trim() === '') problems.push('"author" is missing')
    if (value.source !== 'team-made') problems.push('"source" must be "team-made"')
    if (typeof value.version !== 'number' && typeof value.version !== 'string') problems.push('"version" is missing')
    if (problems.length > 0) {
      errors.push(`manifest.json: slot "${key}": ${problems.join('; ')}`)
      continue
    }
    slots[key] = { file: value.file as string, author: (value.author as string).trim(), source: 'team-made', version: value.version as number | string }
  }
  return { manifest: { version: 1, slots }, errors }
}

/** What the loader measured in one file, in a form the rules can judge without three.js. */
export interface ModelSummary {
  readonly bytes: number
  readonly meshes: number
  readonly triangles: number
  /** Required attributes that some mesh lacks (`position` is the only hard requirement). */
  readonly missingAttributes: readonly string[]
  /** A skin or a skinned mesh: it cannot be instanced. */
  readonly hasSkin: boolean
  readonly hasAnimation: boolean
  /** Bounding box after the world matrix was baked in. */
  readonly min: readonly [number, number, number]
  readonly max: readonly [number, number, number]
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString()

/**
 * Judge one model. Returns null when it is accepted, or the reason it is
 * rejected. The caller puts the file name in front.
 */
export function validateModel(slot: ModelSlot, s: ModelSummary): string | null {
  const kind = slotKind(slot)
  const b = BUDGETS[kind]
  if (s.bytes > MAX_FILE_BYTES) return `${Math.ceil(s.bytes / 1024)} KB > ${MAX_FILE_BYTES / 1024} KB`
  if (s.meshes < 1) return 'no mesh in the file'
  if (s.hasSkin) return 'it has a skin; an instanced slot cannot use a skinned mesh'
  if (s.hasAnimation) return 'it has animation clips; instanced slots are animated by the shader, not by clips'
  if (s.missingAttributes.length > 0) return `missing attribute ${s.missingAttributes.join(', ')}`
  if (s.triangles < 1) return 'no triangles'
  if (s.triangles > b.maxTriangles) return `${s.triangles} triangles > ${b.maxTriangles}`
  if (![...s.min, ...s.max].every(Number.isFinite)) return 'its bounding box is not finite'
  if (Math.abs(s.min[1]) > BASE_TOLERANCE) return `its lowest point is at Y = ${fmt(s.min[1])}, not 0 (put the origin at the base and apply transforms)`
  const height = s.max[1] - s.min[1]
  if (b.height && (height < b.height[0] || height > b.height[1])) return `it is ${fmt(height)} units tall; a ${kind} should be ${b.height[0]} to ${b.height[1]} (1 unit is one 30 m cell)`
  const length = s.max[0] - s.min[0]
  if (b.length && (length < b.length[0] || length > b.length[1])) return `it is ${fmt(length)} units long; an animal should be ${b.length[0]} to ${b.length[1]}`
  return null
}

export interface ModelRejection {
  readonly slot: ModelSlot
  readonly file: string
  readonly reason: string
}

/** What happened to every slot: for the `P` readout and the checker's table. */
export interface ModelReport {
  readonly custom: readonly ModelSlot[]
  readonly rejected: readonly ModelRejection[]
  /** Problems with the manifest itself. */
  readonly errors: readonly string[]
}

export const NO_MODELS: ModelReport = { custom: [], rejected: [], errors: [] }

/** The models line of the `P` readout, for example `models: 7/10 custom, 3 default; spire.glb rejected: 74 triangles > 60`. */
export function modelsLine(r: ModelReport): string {
  const total = MODEL_SLOTS.length
  const head = `models: ${r.custom.length}/${total} custom, ${total - r.custom.length} default`
  const tail = r.rejected.map((x) => `${x.file} rejected: ${x.reason}`)
  if (r.errors.length > 0) tail.push(`manifest: ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}`)
  return tail.length > 0 ? `${head}; ${tail.join('; ')}` : head
}

/** Total-size rule: the files that still fit, in slot order, and the ones that push the set over 1 MB. */
export function withinTotalBudget(sizes: readonly { slot: ModelSlot; bytes: number }[]): { kept: ModelSlot[]; over: ModelSlot[] } {
  const kept: ModelSlot[] = []
  const over: ModelSlot[] = []
  let total = 0
  for (const s of sizes) {
    if (total + s.bytes > MAX_TOTAL_BYTES) over.push(s.slot)
    else {
      total += s.bytes
      kept.push(s.slot)
    }
  }
  return { kept, over }
}
