import { writable } from 'svelte/store'
import type { TerrainSample } from '../deps/features.ts'

/**
 * Selected terrain cell. This is the hand-off point with Role 1: the 3D world
 * calls `selectCell(...)` when a cell is clicked, and the Site Probe opens
 * prefilled from `sample`. Cells are picked in the 3D view only.
 */
export interface CellSelection {
  readonly x: number
  readonly y: number
  readonly sample: TerrainSample
  readonly water: boolean
}

export const selectedCell = writable<CellSelection | null>(null)

export function selectCell(sel: CellSelection | null): void {
  selectedCell.set(sel)
}
