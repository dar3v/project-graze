/**
 * The world terrain: the heightmap being worked on, and the only module that
 * creates, caches, opens and saves it.
 *
 * A world terrain is a generated base heightmap, the live heightmap (base
 * plus brush edits, edited IN PLACE by WorldView), the recipe it was
 * generated from, and the elevation range it was generated INTO. That range
 * travels with the terrain: a saved world stores it, and saving reads it back
 * from here, never from the model card loaded right now. (Before this module
 * a world opened under a different model range was saved with the current
 * range next to the old base, so reopening it applied the edits to a
 * different base.)
 *
 * Cache rule (one entry, module level, so leaving the Sandbox and coming back
 * keeps brush edits):
 * - a generated terrain is reused while the recipe, the reset count and the
 *   requested elevation range are unchanged. Water share is not part of the
 *   recipe: the water slider floods the same terrain.
 * - an opened (loaded) world keeps its own elevation range. It is reused for
 *   the same recipe and reset count whatever range the caller asks for, so a
 *   model that finishes loading later does not regenerate it.
 *
 * No DOM; unit-tested in test/state.test.ts.
 */
import { get } from 'svelte/store'

import { applyEdits, encodeEdits, WORLD_SCHEMA_VERSION, WORLD_SIZE, type SavedWorld } from '../../../../../packages/worlds/src/index.ts'
import { generateTerrain, type ElevationRange } from '../world/terrain.ts'
import { terrainVersion, worldConfig } from './appState.ts'
import { worldKeyOf, type WorldConfig } from './worldConfig.ts'

export type { ElevationRange } from '../world/terrain.ts'

export interface WorldTerrain {
  /** The recipe it was generated from. Its `waterShare` is not kept up to date: read the live config for that. */
  readonly config: WorldConfig
  /** The elevation range the base was generated into. */
  readonly elevation: ElevationRange
  /** As generated, before brush edits (for saving the edit delta). */
  readonly base: Float32Array
  /** The live heightmap. The brush edits it IN PLACE. */
  readonly heightmap: Float32Array
}

interface Entry {
  readonly terrain: WorldTerrain
  /** worldKeyOf(config) + reset count. */
  readonly recipe: string
  /** True for an opened world: its elevation range is part of the world, not of the request. */
  readonly opened: boolean
}

let cache: Entry | null = null

const recipeKey = (cfg: WorldConfig, version: number) => `${worldKeyOf(cfg)}|v${version}`
const sameRange = (a: ElevationRange, b: ElevationRange) => a.min === b.min && a.max === b.max

function generate(cfg: WorldConfig, elevation: ElevationRange, size?: number): Float32Array {
  return generateTerrain({
    seed: cfg.seed,
    center: cfg.center,
    relief: cfg.relief,
    roughness: cfg.roughness,
    valley: cfg.valley,
    size,
    elevation: { min: elevation.min, max: elevation.max },
  }).heightmap
}

/**
 * The terrain for this recipe and reset count. Returns the cached terrain
 * (with its brush edits) when it still matches (see the cache rule above);
 * otherwise generates a new one into `elevation` and caches it.
 */
export function terrainFor(cfg: WorldConfig, version: number, elevation: ElevationRange): WorldTerrain {
  const recipe = recipeKey(cfg, version)
  if (cache && cache.recipe === recipe && (cache.opened || sameRange(cache.terrain.elevation, elevation))) return cache.terrain
  const base = generate(cfg, elevation)
  const terrain: WorldTerrain = { config: cfg, elevation: { min: elevation.min, max: elevation.max }, base, heightmap: base.slice() }
  cache = { terrain, recipe, opened: false }
  return terrain
}

/** Rebuild a saved world's terrain: regenerate the base from its recipe and range, then apply its edits. */
export function restoreTerrain(world: SavedWorld): WorldTerrain {
  const o = world.options
  const config: WorldConfig = { seed: world.seed, center: o.center, waterShare: o.waterShare, relief: o.relief, roughness: o.roughness, valley: o.valley }
  const elevation = { min: o.elevation.min, max: o.elevation.max }
  const base = generate(config, elevation, world.size)
  return { config, elevation, base, heightmap: applyEdits(base, world.edits) }
}

/**
 * Make a validated saved world the world being worked on: rebuild its
 * terrain, cache it, then point `worldConfig` at its recipe, in that order,
 * so every reader of the store gets the opened terrain and not a fresh one.
 * Predictions are never stored: the page predicts the opened world again.
 */
export function openSavedWorld(world: SavedWorld): WorldTerrain {
  const terrain = restoreTerrain(world)
  cache = { terrain, recipe: recipeKey(terrain.config, get(terrainVersion)), opened: true }
  worldConfig.set(terrain.config)
  return terrain
}

/**
 * The saved-world form of a terrain: the recipe, the terrain's own elevation
 * range, the brush edits as a sparse delta, and the model version. Only
 * `waterShare` comes from outside, because the water slider changes it
 * without making a new terrain.
 */
export function toSavedWorld(t: WorldTerrain, waterShare: number, modelVersion: string): SavedWorld {
  return {
    schemaVersion: WORLD_SCHEMA_VERSION,
    modelVersion,
    seed: t.config.seed,
    size: WORLD_SIZE,
    options: {
      center: t.config.center,
      relief: t.config.relief,
      roughness: t.config.roughness,
      valley: t.config.valley,
      waterShare,
      elevation: { min: t.elevation.min, max: t.elevation.max },
    },
    edits: encodeEdits(t.base, t.heightmap),
  }
}
