/**
 * One shared app state (D9). The Sandbox page, both view modes (orbit and
 * walk), the Site Probe and the saved-world loader all
 * read and write these stores. Switching view mode changes only `viewMode`,
 * so nothing else is lost. The stores live at module level, so leaving the
 * Sandbox for the Model Report and coming back also keeps everything,
 * including brush edits (the terrain is cached in ./worldTerrain.ts).
 *
 * Viewer preferences (quality, time of day, overlays, motion) are in
 * ./settings.ts, because they are remembered across visits; this file is the
 * world being worked on.
 */
import { writable } from 'svelte/store'
import { DEFAULT_WORLD, type WorldConfig } from './worldConfig.ts'

export { selectedCell, selectCell, type CellSelection } from '../sandbox/selection.ts'
export { DEFAULT_WORLD, worldKeyOf, type WorldConfig } from './worldConfig.ts'

export type ViewMode = 'orbit' | 'walk'

/**
 * What the views show about predictions: the model is loading, a batch is
 * running, the cover map is current, there is no model, or the last batch
 * failed. Computed by `predictionStateOf()` in model/predictionSession.ts.
 */
export type PredictionState = 'loading' | 'predicting' | 'ready' | 'unavailable' | 'failed'

export const worldConfig = writable<WorldConfig>(DEFAULT_WORLD)
/** Bumped by "Reset terrain": regenerates the same config and drops brush edits. */
export const terrainVersion = writable(0)
export const viewMode = writable<ViewMode>('orbit')
export const probeOpen = writable(false)
