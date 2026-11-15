/**
 * Vegetation placement (D9). Three-free and pure, so it is unit-tested; the
 * meshes are built from its output in ./flora.ts.
 *
 * Every land cell gets plants of ONE silhouette: the one for its predicted
 * cover class. Placement is procedural and seeded: each cell draws its own
 * random numbers from a hash of (seed, x, y), so the same seed and the same
 * cover map always give the same forest, and editing one cell never moves
 * the plants in another.
 *
 * Trees grow in small forest patches with open plains between them (D21). A
 * seeded low-frequency noise field decides WHERE trees grow; the cover class
 * still decides WHAT grows, so the plants keep showing the predicted class.
 * Shrubs (Krummholz) are not patchy: they keep their own density.
 *
 * Low-trust (OOD) cells are drawn differently on purpose: fewer plants,
 * smaller, and pulled toward grey. A prediction the model is unsure about
 * then looks thin and washed out in the world itself, not only in the
 * overlay. This applies on top of the patch density.
 */

import { desaturate, mix, PALETTE, toLinear } from './palette.ts'
import type { Rgb } from './palette.ts'
import { hash2, valueNoise } from './terrain.ts'

/** Vegetation is split into square chunks of this many cells, so distant chunks can be dropped (D9 culling). */
export const CHUNK_CELLS = 16

/** Floats per plant: x, y (fractional cell coordinates), scale, rotation (radians), r, g, b (linear). */
export const PLANT_STRIDE = 7

export type Silhouette = 'spire' | 'pole' | 'broadPine' | 'roundCrown' | 'slender' | 'fullCone' | 'shrub'

export interface Species {
  /** Which low-poly shape to draw (./flora.ts builds one geometry per silhouette). */
  readonly silhouette: Silhouette
  /** Plants per land cell at full density. */
  readonly perCell: number
  readonly minScale: number
  readonly maxScale: number
  /** True for trees: they grow in forest patches (D21). Shrubs keep their own density everywhere. */
  readonly patchy: boolean
}

/**
 * One species per cover class INDEX (names always come from model_card.json;
 * the comments give the shipped card's order). Crown tints are
 * `PALETTE.vegetation.classTints[i]`.
 */
export const SPECIES: readonly Species[] = [
  { silhouette: 'spire', perCell: 1.5, minScale: 0.8, maxScale: 1.25, patchy: true }, // 0 Spruce/Fir: narrow stacked cones
  { silhouette: 'pole', perCell: 1.7, minScale: 0.8, maxScale: 1.2, patchy: true }, // 1 Lodgepole Pine: tall bare trunk, small high crown
  { silhouette: 'broadPine', perCell: 0.8, minScale: 0.85, maxScale: 1.3, patchy: true }, // 2 Ponderosa Pine: sturdy, open crown
  { silhouette: 'roundCrown', perCell: 0.7, minScale: 0.8, maxScale: 1.3, patchy: true }, // 3 Cottonwood/Willow: wide round crown
  { silhouette: 'slender', perCell: 1.4, minScale: 0.75, maxScale: 1.15, patchy: true }, // 4 Aspen: pale trunk, small oval crown
  { silhouette: 'fullCone', perCell: 1.1, minScale: 0.85, maxScale: 1.35, patchy: true }, // 5 Douglas-fir: big full cone
  { silhouette: 'shrub', perCell: 2.2, minScale: 0.7, maxScale: 1.3, patchy: false }, // 6 Krummholz: low stunted clumps
]

// ---- Forest patches (D21) ---------------------------------------------------------

/*
 * The patch field is cellular noise: the map is cut into a lattice of
 * PATCH_SCALE-cell squares (turned by PATCH_ANGLE, so nothing lines up with
 * the map's rows), and each square is one candidate site. A seeded draw
 * decides whether the site holds a patch, where in the square its centre
 * sits, and its radius. A little value noise roughens the rim, so patches
 * are blobs, not discs. Unlike plain value noise this keeps every patch
 * inside the wanted size: thresholded value noise gave 2-cell specks next to
 * 25-cell merged blobs.
 */

/**
 * Lattice spacing of the patch sites, in cells: one candidate patch per
 * PATCH_SCALE x PATCH_SCALE square. The terrain's first octave is 40 cells,
 * so the patches do not follow the hills.
 */
export const PATCH_SCALE = 16
/** A site holds a patch when its seeded draw (0..1) is at or above this; below it, the square stays plains. */
export const PATCH_THRESHOLD = 0.35
/** Patch radius range, cells: patches are 6-15 cells (180-450 m) across. */
export const PATCH_RADIUS_MIN = 3
export const PATCH_RADIUS_MAX = 7.5
/** Tree density on the plains, as a share of the species' full density. Near zero: a lone tree now and then. */
export const PLAINS_DENSITY = 0.02
/** Tree density inside a patch, as a share of the species' full density. Dense on purpose. */
export const PATCH_DENSITY = 1.6
/** The patch field is turned by this angle (radians). */
const PATCH_ANGLE = 0.61
/** The forest thins out over this many cells inside the rim. */
const PATCH_EDGE_CELLS = 1.5
/** The rim wobbles by up to this share of the radius, in and out. */
const PATCH_WOBBLE = 0.22
/** Patch centres keep this far from their square's sides, cells, so two neighbours rarely merge into one big blob. */
const PATCH_INSET = 2.5

/**
 * How much forest a cell is in, 0 (plains) to 1 (inside a patch). Independent
 * of the cover class and the quality preset: the same seed always gives the
 * same patches on every preset.
 */
export function patchWeight(seed: number, x: number, y: number): number {
  const s0 = (seed ^ SALT.patch) | 0
  const c = Math.cos(PATCH_ANGLE)
  const s = Math.sin(PATCH_ANGLE)
  // Into the turned lattice, in units of one square.
  const u = (x * c - y * s) / PATCH_SCALE
  const v = (x * s + y * c) / PATCH_SCALE
  const iu = Math.floor(u)
  const iv = Math.floor(v)
  const wobble = 1 + PATCH_WOBBLE * (2 * valueNoise(s0 ^ 0x2f6b, x / 3.5, y / 3.5) - 1)
  const inset = PATCH_INSET / PATCH_SCALE
  let best = 0
  for (let dv = -1; dv <= 1; dv++) {
    for (let du = -1; du <= 1; du++) {
      const su = iu + du
      const sv = iv + dv
      if (hash2(s0, su, sv) < PATCH_THRESHOLD) continue
      const cu = su + inset + (1 - 2 * inset) * hash2(s0 ^ 0x51a7, su, sv)
      const cv = sv + inset + (1 - 2 * inset) * hash2(s0 ^ 0x3c9e, su, sv)
      const radius = PATCH_RADIUS_MIN + (PATCH_RADIUS_MAX - PATCH_RADIUS_MIN) * hash2(s0 ^ 0x7e11, su, sv)
      const d = (Math.hypot(u - cu, v - cv) * PATCH_SCALE) / wobble
      const t = Math.min(1, Math.max(0, (radius - d) / PATCH_EDGE_CELLS))
      if (t > best) best = t
    }
  }
  return best * best * (3 - 2 * best)
}

/** Tree density multiplier for a cell: `PLAINS_DENSITY` on the plains, `PATCH_DENSITY` inside a patch. */
export function patchDensity(seed: number, x: number, y: number): number {
  return PLAINS_DENSITY + (PATCH_DENSITY - PLAINS_DENSITY) * patchWeight(seed, x, y)
}

/** Low-trust (OOD) cells keep this share of their plants. */
export const OOD_DENSITY = 0.35
/** Low-trust plants are pulled this far toward grey (0 = unchanged, 1 = grey). */
export const OOD_DESATURATION = 0.8
/** Low-trust plants are scaled by this. */
export const OOD_SCALE = 0.8
/** Plants thin out from this true slope (degrees) and stop at MAX_PLANT_SLOPE. */
export const THIN_PLANT_SLOPE = 26
export const MAX_PLANT_SLOPE = 40

export interface VegetationInput {
  readonly size: number
  readonly cellSizeM: number
  readonly heightmap: Float32Array
  readonly waterLevelM: number
  /** Predicted class index per cell (the contract cover map). */
  readonly cover: Uint8Array
  /** 1 = low trust. */
  readonly ood: Uint8Array | null
  /** World seed: same seed + same cover map = same forest. */
  readonly seed: number
  /** Density multiplier from the quality preset, 0..1. */
  readonly density: number
}

export interface PlantBatch {
  /** Chunk column and row (chunk = CHUNK_CELLS x CHUNK_CELLS cells). */
  readonly chunkX: number
  readonly chunkY: number
  readonly classIndex: number
  readonly count: number
  /** PLANT_STRIDE floats per plant. */
  readonly plants: Float32Array
}

/** Independent random streams per purpose, so adding one never shifts another. */
const SALT = { count: 0x51ed270b, x: 0x2545f491, y: 0x68e31da4, scale: 0x1b873593, rot: 0x7ed55d16, tint: 0x3c6ef372, ood: 0x5bd1e995, grass: 0x27d4eb2f, patch: 0x165667b1 }

/** Seeded random number in [0, 1) for cell (x, y), plant k, stream `salt`. */
function rand(seed: number, salt: number, x: number, y: number, k: number): number {
  return hash2((seed ^ salt ^ Math.imul(k + 1, 0x9e3779b1)) | 0, x, y)
}

/** True terrain slope in degrees at a cell (central differences, like the model's slope input). */
export function cellSlopeDeg(heightmap: Float32Array, size: number, cellSizeM: number, x: number, y: number): number {
  const at = (cx: number, cy: number) => heightmap[Math.min(size - 1, Math.max(0, cy)) * size + Math.min(size - 1, Math.max(0, cx))]
  const dx = (at(x + 1, y) - at(x - 1, y)) / (2 * cellSizeM)
  const dy = (at(x, y + 1) - at(x, y - 1)) / (2 * cellSizeM)
  return (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI
}

/** Share of plants kept on a slope: 1 below THIN_PLANT_SLOPE, 0 at MAX_PLANT_SLOPE. */
export function slopeKeep(slopeDeg: number): number {
  return Math.min(1, Math.max(0, (MAX_PLANT_SLOPE - slopeDeg) / (MAX_PLANT_SLOPE - THIN_PLANT_SLOPE)))
}

const CLASS_TINTS: readonly Rgb[] = PALETTE.vegetation.classTints.map(toLinear)
const LOW_TRUST_GREY = toLinear(PALETTE.vegetation.lowTrust)

/** Crown tint for a plant: the class tint, jittered, and washed out on low-trust cells. Linear RGB. */
export function plantTint(classIndex: number, lowTrust: boolean, jitter: number): Rgb {
  const base = CLASS_TINTS[classIndex % CLASS_TINTS.length]
  const k = 0.86 + 0.28 * jitter
  const c: Rgb = [base[0] * k, base[1] * k, base[2] * k]
  return lowTrust ? mix(desaturate(c, OOD_DESATURATION), LOW_TRUST_GREY, 0.35) : c
}

/**
 * Place every plant for a cover map. Returns one batch per (chunk, class)
 * that has plants, ordered by chunk then class, so the output is stable.
 */
export function placeVegetation(v: VegetationInput): PlantBatch[] {
  const n = v.size * v.size
  if (v.cover.length !== n || v.heightmap.length !== n) throw new Error(`Cover map and heightmap must both have ${n} cells.`)
  const ood = v.ood && v.ood.length === n ? v.ood : null
  const density = Math.min(1, Math.max(0, v.density))
  const chunks = Math.ceil(v.size / CHUNK_CELLS)
  const buckets = new Map<number, number[]>()
  if (density <= 0) return []

  for (let y = 0; y < v.size; y++) {
    for (let x = 0; x < v.size; x++) {
      const i = y * v.size + x
      if (v.heightmap[i] < v.waterLevelM) continue // water cell
      const keep = slopeKeep(cellSlopeDeg(v.heightmap, v.size, v.cellSizeM, x, y))
      if (keep <= 0) continue
      const classIndex = v.cover[i] % SPECIES.length
      const sp = SPECIES[classIndex]
      const lowTrust = !!ood && ood[i] === 1
      // Where (D21), then how trusted: the OOD share applies on top of the patch density.
      const patch = sp.patchy ? patchDensity(v.seed, x, y) : 1
      const expected = sp.perCell * density * keep * patch * (lowTrust ? OOD_DENSITY : 1)
      const count = Math.floor(expected) + (rand(v.seed, SALT.count, x, y, 0) < expected % 1 ? 1 : 0)
      if (count === 0) continue
      const key = (Math.floor(y / CHUNK_CELLS) * chunks + Math.floor(x / CHUNK_CELLS)) * SPECIES.length + classIndex
      let out = buckets.get(key)
      if (!out) buckets.set(key, (out = []))
      for (let k = 0; k < count; k++) {
        const scale = (sp.minScale + (sp.maxScale - sp.minScale) * rand(v.seed, SALT.scale, x, y, k)) * (lowTrust ? OOD_SCALE : 1)
        const tint = plantTint(classIndex, lowTrust, rand(v.seed, SALT.tint, x, y, k))
        out.push(
          // Anywhere inside the cell: cell (x, y) covers [x - 0.5, x + 0.5).
          x - 0.5 + rand(v.seed, SALT.x, x, y, k),
          y - 0.5 + rand(v.seed, SALT.y, x, y, k),
          scale,
          rand(v.seed, SALT.rot, x, y, k) * Math.PI * 2,
          tint[0],
          tint[1],
          tint[2],
        )
      }
    }
  }

  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((key) => {
      const plants = Float32Array.from(buckets.get(key)!)
      const chunk = Math.floor(key / SPECIES.length)
      return { chunkX: chunk % chunks, chunkY: Math.floor(chunk / chunks), classIndex: key % SPECIES.length, count: plants.length / PLANT_STRIDE, plants }
    })
}

/** Total number of plants in a set of batches. */
export function countPlants(batches: readonly PlantBatch[]): number {
  return batches.reduce((n, b) => n + b.count, 0)
}

/**
 * Is a chunk within `radius` cells of the point (cell coordinates)? Distance
 * is measured to the nearest point of the chunk, so a chunk is kept as long
 * as any part of it is inside the radius.
 */
export function chunkInRange(chunkX: number, chunkY: number, cx: number, cy: number, radius: number): boolean {
  const x0 = chunkX * CHUNK_CELLS - 0.5
  const y0 = chunkY * CHUNK_CELLS - 0.5
  const dx = Math.max(x0 - cx, 0, cx - (x0 + CHUNK_CELLS))
  const dy = Math.max(y0 - cy, 0, cy - (y0 + CHUNK_CELLS))
  return dx * dx + dy * dy <= radius * radius
}

// ---- Ground scatter near the walker ------------------------------------------

/** Grass tufts are placed within this many cells of the walker and re-placed as they move. */
export const GRASS_RADIUS = 9

export interface GrassInput {
  readonly size: number
  readonly cellSizeM: number
  readonly heightmap: Float32Array
  readonly waterLevelM: number
  readonly cover: Uint8Array | null
  readonly ood: Uint8Array | null
  readonly seed: number
  /** Tufts per land cell (quality preset). */
  readonly perCell: number
  /** Walker position in fractional cell coordinates. */
  readonly centerX: number
  readonly centerY: number
}

const GRASS = toLinear(PALETTE.vegetation.grass)
const GRASS_DRY = toLinear(PALETTE.vegetation.grassDry)

/**
 * Grass tufts around the walker: PLANT_STRIDE floats per tuft, same layout as
 * the plants. Seeded per cell like the trees, so a tuft stays where it is
 * when the set is re-placed around a new position. Tufts shrink toward the
 * rim of the radius, so they fade in instead of popping.
 */
export function placeGrass(g: GrassInput): Float32Array {
  const out: number[] = []
  if (g.perCell <= 0) return new Float32Array(0)
  const n = g.size * g.size
  const cover = g.cover && g.cover.length === n ? g.cover : null
  const ood = g.ood && g.ood.length === n ? g.ood : null
  const x0 = Math.max(0, Math.floor(g.centerX - GRASS_RADIUS))
  const x1 = Math.min(g.size - 1, Math.ceil(g.centerX + GRASS_RADIUS))
  const y0 = Math.max(0, Math.floor(g.centerY - GRASS_RADIUS))
  const y1 = Math.min(g.size - 1, Math.ceil(g.centerY + GRASS_RADIUS))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * g.size + x
      if (g.heightmap[i] < g.waterLevelM) continue
      const keep = slopeKeep(cellSlopeDeg(g.heightmap, g.size, g.cellSizeM, x, y))
      if (keep <= 0) continue
      const lowTrust = !!ood && ood[i] === 1
      const expected = g.perCell * keep * (lowTrust ? OOD_DENSITY : 1)
      const count = Math.floor(expected) + (rand(g.seed, SALT.grass, x, y, 0) < expected % 1 ? 1 : 0)
      // Stunted, dry tufts in the highest class (krummholz in the shipped card).
      const dry = cover ? (cover[i] % SPECIES.length === SPECIES.length - 1 ? 0.8 : 0.15) : 0.3
      for (let k = 0; k < count; k++) {
        const px = x - 0.5 + rand(g.seed, SALT.grass ^ SALT.x, x, y, k)
        const py = y - 0.5 + rand(g.seed, SALT.grass ^ SALT.y, x, y, k)
        const fade = 1 - Math.hypot(px - g.centerX, py - g.centerY) / GRASS_RADIUS
        if (fade <= 0) continue
        const jitter = rand(g.seed, SALT.grass ^ SALT.tint, x, y, k)
        let c = mix(GRASS, GRASS_DRY, Math.min(1, dry + 0.3 * jitter))
        if (lowTrust) c = mix(desaturate(c, OOD_DESATURATION), LOW_TRUST_GREY, 0.35)
        const scale = (0.6 + 0.8 * rand(g.seed, SALT.grass ^ SALT.scale, x, y, k)) * Math.min(1, fade * 3) * (lowTrust ? OOD_SCALE : 1)
        out.push(px, py, scale, rand(g.seed, SALT.grass ^ SALT.rot, x, y, k) * Math.PI * 2, c[0], c[1], c[2])
      }
    }
  }
  return Float32Array.from(out)
}
