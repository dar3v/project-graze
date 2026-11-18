/**
 * Cell <-> world coordinates for the 3D scene. Three-free so it is unit-tested.
 *
 * One world unit = one cell (30 m). Vertex (x, y) sits at the CENTER of cell
 * (x, y), so animals at cell coordinates land on the
 * same spot. Grid y = 0 is north = -Z (away from the default camera), +x is
 * east = +X. Heights are exaggerated so a 3.8 km map still reads as a valley.
 */

/** Vertical exaggeration applied to heights (1 = true scale). */
export const VERTICAL_EXAGGERATION = 2

export interface Frame {
  /** Grid side length in cells. */
  readonly size: number
  readonly cellSizeM: number
  /** Height in meters that maps to world Y = 0. */
  readonly baseM: number
}

export function cellToWorldX(x: number, f: Frame): number {
  return x - (f.size - 1) / 2
}

export function cellToWorldZ(y: number, f: Frame): number {
  return y - (f.size - 1) / 2
}

export function heightToWorldY(heightM: number, f: Frame): number {
  return ((heightM - f.baseM) / f.cellSizeM) * VERTICAL_EXAGGERATION
}

/** Fractional cell coordinates of a world point (inverse of cellToWorld*). */
export function worldToCellF(wx: number, wz: number, f: Frame): { x: number; y: number } {
  return { x: wx + (f.size - 1) / 2, y: wz + (f.size - 1) / 2 }
}

/** Nearest integer cell to fractional cell coordinates, or null if outside the grid. */
export function nearestCell(cx: number, cy: number, size: number): { x: number; y: number } | null {
  const x = Math.round(cx)
  const y = Math.round(cy)
  if (x < 0 || y < 0 || x >= size || y >= size) return null
  return { x, y }
}

/** Integer cell under a world point, or null if outside the grid. */
export function worldToCell(wx: number, wz: number, f: Frame): { x: number; y: number } | null {
  const c = worldToCellF(wx, wz, f)
  return nearestCell(c.x, c.y, f.size)
}
