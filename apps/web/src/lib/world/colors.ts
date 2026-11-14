/**
 * Per-vertex colors for the terrain mesh (one vertex per cell). Three-free so
 * it is unit-tested. Writes linear RGB floats (0..1), 3 per cell.
 *
 * Overlays:
 * - terrain:    hypsometric tint (valley green -> rock -> snow), steep = rocky
 * - cover:      predicted class color (by class index, see ../sandbox/palette.ts)
 * - confidence: pale (low) -> deep teal (high), max class probability
 * - OOD:        independent of the mode. Cells flagged as unlike the training
 *               data get an amber checkerboard ("low trust").
 */

import type { DirtyRect } from './terrain.ts'

export type OverlayMode = 'terrain' | 'cover' | 'confidence'

export type Rgb = readonly [number, number, number]

export interface ColorInputs {
  readonly size: number
  readonly heightmap: Float32Array
  readonly waterLevelM: number
  /** Elevation band used for the terrain tint (usually the heightmap's own range). */
  readonly band: { readonly min: number; readonly max: number }
  readonly mode: OverlayMode
  /** Class index per cell. */
  readonly cover: Uint8Array | null
  /** Max class probability per cell, 0..1. */
  readonly confidence: Float32Array | null
  readonly ood: Uint8Array | null
  readonly showOod: boolean
  /** Linear 0..1 RGB per class index. */
  readonly classRgb: readonly Rgb[]
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/**
 * '#rrggbb' (sRGB, as written in CSS) -> LINEAR 0..1 RGB, which is what
 * three.js expects in vertex colors. The renderer outputs sRGB, so the hex
 * values below display as written.
 */
export function hexToRgb01(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t))
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
}

/** Hypsometric stops, t = 0 (band min) .. 1 (band max). */
const TERRAIN_STOPS: readonly (readonly [number, Rgb])[] = [
  [0.0, hexToRgb01('#4f6b3a')],
  [0.35, hexToRgb01('#6f8a4a')],
  [0.6, hexToRgb01('#8a8256')],
  [0.82, hexToRgb01('#8d8a84')],
  [1.0, hexToRgb01('#e6e8ea')],
]
const ROCK = hexToRgb01('#7b746a')
const RIVERBED = hexToRgb01('#4a5a52')
export const CONFIDENCE_LOW = hexToRgb01('#e2dccb')
export const CONFIDENCE_HIGH = hexToRgb01('#1f5a55')
export const OOD_COLOR = hexToRgb01('#e0a040')
const NO_DATA = hexToRgb01('#5a5f64')

export function terrainColor(t: number, slope01: number): Rgb {
  const k = Math.min(1, Math.max(0, t))
  let c = TERRAIN_STOPS[TERRAIN_STOPS.length - 1][1]
  for (let i = 1; i < TERRAIN_STOPS.length; i++) {
    const [t1, c1] = TERRAIN_STOPS[i]
    if (k <= t1) {
      const [t0, c0] = TERRAIN_STOPS[i - 1]
      c = mix(c0, c1, (k - t0) / (t1 - t0))
      break
    }
  }
  return mix(c, ROCK, slope01 * 0.8)
}

export function confidenceColor(p: number): Rgb {
  return mix(CONFIDENCE_LOW, CONFIDENCE_HIGH, p)
}

/** Write colors for every cell in `rect` (inclusive) into `out` (3 floats per cell). */
export function writeColors(out: Float32Array, c: ColorInputs, rect: DirtyRect): void {
  const { size, heightmap: h } = c
  const span = c.band.max - c.band.min || 1
  const at = (x: number, y: number) => h[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))]
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = y * size + x
      let col: Rgb
      if (h[i] < c.waterLevelM) col = RIVERBED
      else if (c.mode === 'cover' && c.cover) col = c.classRgb[c.cover[i] % c.classRgb.length] ?? NO_DATA
      else if (c.mode === 'confidence' && c.confidence) col = confidenceColor(c.confidence[i])
      else {
        // Rise over run in meters per meter is irrelevant for color; a
        // neighbour difference relative to the band is enough to pick out cliffs.
        const g = Math.hypot(at(x + 1, y) - at(x - 1, y), at(x, y + 1) - at(x, y - 1)) / span
        col = terrainColor((h[i] - c.band.min) / span, Math.min(1, g * 5))
      }
      if (c.showOod && c.ood && c.ood[i] && h[i] >= c.waterLevelM) {
        col = mix(col, OOD_COLOR, (x + y) % 2 === 0 ? 0.85 : 0.35)
      }
      out[i * 3] = col[0]
      out[i * 3 + 1] = col[1]
      out[i * 3 + 2] = col[2]
    }
  }
}
