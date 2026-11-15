/**
 * The live world, shared with the page background (ROLE-1 D14).
 *
 * The Sandbox owns the terrain, the predictions and the sim. It publishes
 * them here, and `backdrop/WorldBackdrop.svelte` draws the same arrays behind
 * every page. Nothing is copied: the heightmap is the one the brush edits in
 * place, so `terrainRev` is bumped after each edit.
 *
 * The Sandbox stays mounted while another page is shown (App.svelte), so the
 * predictions and the herds keep running behind the Model Report and the
 * Responsible Use page, and the world is still there on return.
 */
import { writable } from 'svelte/store'

import type { AmbientWorld } from '../backdrop/worldContract.ts'

export type { AmbientWorld } from '../backdrop/worldContract.ts'

export const liveWorld = writable<AmbientWorld | null>(null)

export interface LivePoses {
  readonly herbivores: Float32Array | null
  readonly predators: Float32Array | null
  /** Floats per animal: 3 is [x, y, heading] (POSE_STRIDE). */
  readonly stride: number
}

/** Animal poses, written once per frame while the sim runs. */
export const livePoses = writable<LivePoses | null>(null)
