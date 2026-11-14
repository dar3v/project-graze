/**
 * One shared app state (D9). The Sandbox page, both view modes (orbit, and
 * walk once ROLE-1 D8 lands), the Site Probe and the saved-world loader all
 * read and write these stores. Switching view mode changes only `viewMode`,
 * so nothing else is lost. The stores live at module level, so leaving the
 * Sandbox for the Model Report and coming back also keeps everything,
 * including brush edits (the heightmap is cached below).
 *
 * Viewer preferences (quality, time of day, overlays, motion) are in
 * ./settings.ts, because they are remembered across visits; this file is the
 * world being worked on.
 */
import { writable } from 'svelte/store'
import { generateTerrain } from '../world/terrain.ts'
import { DEFAULT_WORLD, worldKeyOf, type WorldConfig } from './worldConfig.ts'

export { selectedCell, selectCell, type CellSelection } from '../sandbox/selection.ts'
export { DEFAULT_WORLD, worldKeyOf, type WorldConfig } from './worldConfig.ts'

export type ViewMode = 'orbit' | 'walk'

export const worldConfig = writable<WorldConfig>(DEFAULT_WORLD)
/** Bumped by "Reset terrain": regenerates the same config and drops brush edits. */
export const terrainVersion = writable(0)
export const viewMode = writable<ViewMode>('orbit')
export const probeOpen = writable(false)

export interface ElevationRange {
  readonly min: number
  readonly max: number
}

export interface TerrainEntry {
  /** Identity of the generated terrain: config + reset count + elevation range. */
  readonly key: string
  /** As generated, before brush edits (for saving the edit delta). */
  readonly base: Float32Array
  /** The live heightmap. The brush edits it IN PLACE. */
  readonly heightmap: Float32Array
}

let cache: TerrainEntry | null = null

export function terrainKey(cfg: WorldConfig, version: number, elevation: ElevationRange): string {
  return `${worldKeyOf(cfg)}|v${version}|e${elevation.min}-${elevation.max}`
}

/**
 * The terrain for this config. Returns the cached entry (with its brush edits)
 * when the key is unchanged; otherwise generates a new one and caches it.
 */
export function terrainFor(cfg: WorldConfig, version: number, elevation: ElevationRange): TerrainEntry {
  const key = terrainKey(cfg, version, elevation)
  if (cache?.key === key) return cache
  const base = generateTerrain({
    seed: cfg.seed,
    center: cfg.center,
    relief: cfg.relief,
    roughness: cfg.roughness,
    valley: cfg.valley,
    elevation: { min: elevation.min, max: elevation.max },
  }).heightmap
  cache = { key, base, heightmap: base.slice() }
  return cache
}

/**
 * Install a terrain built elsewhere (a loaded world) so the next `terrainFor`
 * with the same arguments returns it. Call before setting `worldConfig`.
 */
export function installTerrain(cfg: WorldConfig, version: number, elevation: ElevationRange, base: Float32Array, heightmap: Float32Array): void {
  cache = { key: terrainKey(cfg, version, elevation), base, heightmap }
}
