/**
 * Sculpting brush (Role 1). Pure functions over the contract heightmap so the
 * renderer and tests share one implementation. The brush edits the heightmap
 * in place and returns the dirty rectangle, so callers re-mesh and re-predict
 * only the touched region.
 */

export type BrushMode = 'raise' | 'lower' | 'flatten'

export interface BrushStroke {
  readonly mode: BrushMode
  /** Brush center in cell coordinates (fractional allowed). */
  readonly x: number
  readonly y: number
  /** Radius in cells (> 0). */
  readonly radius: number
  /**
   * raise / lower: meters added at the center per application.
   * flatten: blend factor toward `target` at the center per application (0..1).
   */
  readonly strength: number
  /** flatten only: target height in meters. */
  readonly target?: number
  /** Heights are clamped to this range (the elevation training range). */
  readonly min?: number
  readonly max?: number
}

/** Inclusive cell rectangle: x0 <= x <= x1, y0 <= y <= y1. */
export interface DirtyRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export function unionRect(a: DirtyRect | null, b: DirtyRect | null): DirtyRect | null {
  if (!a) return b
  if (!b) return a
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}

/** Grow a rect by `pad` cells, clipped to the grid. */
export function padRect(r: DirtyRect, pad: number, size: number): DirtyRect {
  return {
    x0: Math.max(0, r.x0 - pad),
    y0: Math.max(0, r.y0 - pad),
    x1: Math.min(size - 1, r.x1 + pad),
    y1: Math.min(size - 1, r.y1 + pad),
  }
}

/** Smooth falloff: 1 at the center, 0 at the rim (cosine bell). */
export function falloff(dist: number, radius: number): number {
  if (dist >= radius) return 0
  return 0.5 * (1 + Math.cos((Math.PI * dist) / radius))
}

/**
 * Apply one brush dab to `heightmap` (size x size, row-major) in place.
 * Returns the rectangle of cells whose height changed, or null if none did.
 */
export function applyBrush(heightmap: Float32Array, size: number, s: BrushStroke): DirtyRect | null {
  if (heightmap.length !== size * size) throw new Error(`Heightmap has ${heightmap.length} cells; expected ${size * size}.`)
  if (!(s.radius > 0) || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null
  const lo = s.min ?? -Infinity
  const hi = s.max ?? Infinity
  const x0 = Math.max(0, Math.floor(s.x - s.radius))
  const y0 = Math.max(0, Math.floor(s.y - s.radius))
  const x1 = Math.min(size - 1, Math.ceil(s.x + s.radius))
  const y1 = Math.min(size - 1, Math.ceil(s.y + s.radius))
  let dx0 = Infinity
  let dy0 = Infinity
  let dx1 = -Infinity
  let dy1 = -Infinity
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const w = falloff(Math.hypot(x - s.x, y - s.y), s.radius)
      if (w <= 0) continue
      const i = y * size + x
      const old = heightmap[i]
      let next: number
      if (s.mode === 'raise') next = old + s.strength * w
      else if (s.mode === 'lower') next = old - s.strength * w
      else {
        const t = s.target ?? old
        next = old + (t - old) * Math.min(1, Math.max(0, s.strength * w))
      }
      next = Math.min(hi, Math.max(lo, next))
      heightmap[i] = next
      if (heightmap[i] !== old) {
        if (x < dx0) dx0 = x
        if (y < dy0) dy0 = y
        if (x > dx1) dx1 = x
        if (y > dy1) dy1 = y
      }
    }
  }
  return dx1 < 0 ? null : { x0: dx0, y0: dy0, x1: dx1, y1: dy1 }
}

/** Bilinear height sample at fractional cell coordinates (clamped to the grid). */
export function sampleHeight(heightmap: Float32Array, size: number, x: number, y: number): number {
  const cx = Math.min(size - 1, Math.max(0, x))
  const cy = Math.min(size - 1, Math.max(0, y))
  const xi = Math.min(size - 2, Math.floor(cx))
  const yi = Math.min(size - 2, Math.floor(cy))
  const fx = cx - xi
  const fy = cy - yi
  const a = heightmap[yi * size + xi]
  const b = heightmap[yi * size + xi + 1]
  const c = heightmap[(yi + 1) * size + xi]
  const d = heightmap[(yi + 1) * size + xi + 1]
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
