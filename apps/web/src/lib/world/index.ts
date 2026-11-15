/**
 * Role 1's world. Two entry points:
 *
 * - `mountWorld(target, options)`: the page background (D14), a dimmed,
 *   ground-level view of the live world (contract:
 *   ../backdrop/worldContract.ts; implementation: ./backdrop.ts). The app
 *   picks this file up automatically through import.meta.glob.
 * - `WorldView.svelte` / `WorldRenderer`: the interactive 3D sandbox (orbit
 *   camera, brush, picking, overlays, animals, walk mode). See README.md in
 *   this folder.
 */

import type { WorldHandle, WorldMountOptions } from '../backdrop/worldContract.ts'
import { AmbientBackdrop } from './backdrop.ts'

export function mountWorld(target: HTMLElement, options: WorldMountOptions): WorldHandle {
  // Throws WorldUnavailableError without WebGL 2; the backdrop then stays black.
  return new AmbientBackdrop(target, options)
}

export { backdropLease, dimState } from './ambient.ts'
export type { DimState } from './ambient.ts'
export { viewPresence } from './presence.ts'
export { WorldRenderer, WorldUnavailableError } from './scene.ts'
export type { BrushSettings, ExitReason, LookSettings, OverlayData, TerrainData, WorldRendererOptions, WorldTool } from './scene.ts'
export type { OverlayMode } from './colors.ts'
export type { DirtyRect } from './terrain.ts'
