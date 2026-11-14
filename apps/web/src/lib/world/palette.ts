/**
 * The world's palette (D9). EVERY color the 3D world draws is defined here:
 * terrain, overlays, vegetation tints per cover class, sky, fog, water,
 * lights, animals and UI lines. Nothing else in `world/` holds a color
 * literal, so the look can be tuned in one place and the sky, fog and water
 * always agree.
 *
 * All values are sRGB hex, as written in CSS (`renderer.outputColorSpace` is
 * sRGB in three r187, so a hex here displays as written). Use `toLinear` for
 * vertex/instance colors and `new THREE.Color(hex)` for materials and
 * uniforms; both convert to the linear working space.
 *
 * Three-free, so tests can read it.
 */

import { classColor } from '../sandbox/palette.ts'

export type Rgb = readonly [number, number, number]

/** Colors that change with the time of day (D10). Blended by `daynight.ts`. */
export interface TimeColors {
  /** Sky straight up. */
  readonly zenith: string
  /** Sky at the horizon AND the fog color: the same on purpose, so distant terrain dissolves into the sky. */
  readonly fog: string
  /** Glow around the sun (or moon) in the sky. */
  readonly glow: string
  /** Directional light: the sun by day, the moon by night. */
  readonly light: string
  /** Hemisphere light from above / from the ground. */
  readonly ambientSky: string
  readonly ambientGround: string
  readonly waterShallow: string
  readonly waterDeep: string
  readonly cloud: string
}

export const PALETTE = {
  /** Natural ground. `stops` are a hypsometric tint: t = 0 (lowest cell) .. 1 (highest). */
  terrain: {
    stops: [
      [0.0, '#4f6b3a'],
      [0.35, '#6a8a48'],
      [0.62, '#839052'],
      [0.84, '#8d8a84'],
      [1.0, '#e6e8ea'],
    ] as readonly (readonly [number, string])[],
    /** Steep slopes (shader blend, and the per-vertex tint in the overlays). */
    rock: '#7b746a',
    /** Moderate slopes between grass and rock. */
    dirt: '#7a6449',
    /** Shoreline band just above the water. */
    sand: '#b9a77c',
    /** Ground under water. */
    riverbed: '#4a5a52',
  },

  /** Data overlays. Class colors for the cover overlay are `classOverlay(i)`. */
  overlay: {
    confidenceLow: '#e2dccb',
    confidenceHigh: '#1f5a55',
    /** "Low trust" (OOD) checkerboard. */
    ood: '#e0a040',
    noData: '#5a5f64',
  },

  /**
   * Vegetation (D9). `classTints[i]` tints the crown of the plant drawn for
   * cover class i (class order comes from model_card.json; for the shipped
   * card: Spruce/Fir, Lodgepole Pine, Ponderosa Pine, Cottonwood/Willow,
   * Aspen, Douglas-fir, Krummholz).
   */
  vegetation: {
    classTints: ['#2f5d4a', '#4a7340', '#7d8f3c', '#6fae4e', '#c2b83a', '#285238', '#7f8f72'] as readonly string[],
    trunk: '#5b4635',
    /** Pale bark (class 4, aspen-like silhouette). */
    trunkPale: '#d9d6c8',
    /** Ruddy bark (class 2, ponderosa-like silhouette). */
    trunkRuddy: '#8a5a3a',
    /** Low-trust (OOD) plants are pulled toward this grey. */
    lowTrust: '#8b8d86',
    grass: '#6f9448',
    grassDry: '#a39a5c',
  },

  time: {
    night: {
      zenith: '#080d22',
      fog: '#172037',
      glow: '#3a4a78',
      light: '#9db4e0',
      ambientSky: '#3f4f7a',
      ambientGround: '#151922',
      waterShallow: '#24425e',
      waterDeep: '#0b1a30',
      cloud: '#27304d',
    },
    twilight: {
      zenith: '#34497f',
      fog: '#e2a57c',
      glow: '#ff9d5c',
      light: '#ffb37a',
      ambientSky: '#9690b4',
      ambientGround: '#4a3f3a',
      waterShallow: '#7d94a0',
      waterDeep: '#263f5a',
      cloud: '#f2bfa5',
    },
    day: {
      zenith: '#3c7cc2',
      fog: '#bfd9e8',
      glow: '#fff4d6',
      light: '#fff2dd',
      ambientSky: '#dfe8ef',
      ambientGround: '#4a4f3f',
      waterShallow: '#62b3b4',
      waterDeep: '#1c5876',
      cloud: '#ffffff',
    },
  } satisfies Record<'night' | 'twilight' | 'day', TimeColors>,

  sky: {
    sunDisc: '#fff6e0',
    moonDisc: '#e8ecf5',
    stars: '#f3f5ff',
  },

  water: {
    foam: '#f1f6f4',
    /** The line where wading ends and deep water begins (walk mode). */
    deepLine: '#d7ecf0',
  },

  animals: {
    herbivore: '#e3e5e8',
    predator: '#c4a27f',
  },

  ui: {
    brushCursor: '#f4f1e8',
    selection: '#ffffff',
  },

  /** The decorative page background keeps the app's dark look: no sky. */
  backdrop: {
    clear: '#0d1013',
    fog: '#0d1013',
    light: '#fff2dd',
    ambientSky: '#dfe8ef',
    ambientGround: '#2a2f2a',
    water: '#2d5f73',
  },
} as const

/**
 * Cover-overlay color for class index `i`. Kept in `../sandbox/palette.ts`
 * because the page legends (Role 2) use the same list; the world reads it
 * through here so this file stays the one place the world gets colors from.
 */
export function classOverlay(i: number): string {
  return classColor(i)
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/** '#rrggbb' (sRGB) -> LINEAR 0..1 RGB, which is what three.js expects in vertex and instance colors. */
export function toLinear(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]
}

/** Linear 0..1 RGB -> CSS `rgb(r g b)` (for legends that must match the canvas). */
export function toCss(c: Rgb): string {
  return `rgb(${c.map((v) => Math.round(255 * Math.min(1, Math.max(0, linearToSrgb(v))))).join(' ')})`
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t))
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

/** Relative luminance of a linear color. */
export function luminance(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** Pull a linear color toward its own grey. `amount` 0 = unchanged, 1 = grey. */
export function desaturate(c: Rgb, amount: number): Rgb {
  const l = luminance(c)
  return mix(c, [l, l, l], amount)
}

/** 0 (grey) .. 1 (fully saturated), HSV-style, for tests and tuning. */
export function saturation(c: Rgb): number {
  const hi = Math.max(c[0], c[1], c[2])
  const lo = Math.min(c[0], c[1], c[2])
  return hi <= 0 ? 0 : (hi - lo) / hi
}
