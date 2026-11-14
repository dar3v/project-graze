/**
 * Role 1's world. Two entry points:
 *
 * - `mountWorld(target, { reducedMotion })`: the decorative, slowly orbiting
 *   page background (contract: ../backdrop/worldContract.ts). The app picks
 *   this file up automatically through import.meta.glob.
 * - `WorldView.svelte` / `WorldRenderer`: the interactive 3D sandbox (orbit
 *   camera, brush, picking, overlays, animals). See README.md in this folder.
 */

import type { WorldHandle, WorldMountOptions } from '../backdrop/worldContract.ts'
import { WorldRenderer } from './scene.ts'
import { COVERTYPE_ELEVATION, generateTerrain } from './terrain.ts'

/** Seed of the background valley. Any seed works; this one reads well. */
export const BACKDROP_SEED = 7

export function mountWorld(target: HTMLElement, options: WorldMountOptions): WorldHandle {
  // Throws WorldUnavailableError without WebGL; the backdrop then stays black.
  const world = new WorldRenderer(target, { interactive: false, autoRotate: true, reducedMotion: options.reducedMotion, maxPixelRatio: 1 })
  const t = generateTerrain({ seed: BACKDROP_SEED, waterLevel: 0.12 })
  world.setTerrain({ heightmap: t.heightmap, size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM, elevation: COVERTYPE_ELEVATION })
  return { destroy: () => world.destroy() }
}

export { WorldRenderer, WorldUnavailableError } from './scene.ts'
export type { BrushSettings, OverlayData, TerrainData, WorldRendererOptions, WorldTool } from './scene.ts'
export type { OverlayMode } from './colors.ts'
export type { DirtyRect } from './terrain.ts'
