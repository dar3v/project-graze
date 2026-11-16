/**
 * The ambient backdrop (D14): the numbers and rules behind the dimmed,
 * ground-level view that sits behind every page. Three-free and pure, so it
 * is unit-tested (apps/web/test/ambient.test.ts).
 *
 * Four things live here, each in ONE place:
 *
 * 1. The dim layer (D20). `DIM_IDLE` is one flat black layer over the whole
 *    world behind the pages; `DIM_WALK` is the dim in walk mode (none). No
 *    fade, no gradient: every pixel gets the same dim, and the switch is
 *    instant.
 * 2. The ambient camera (D19): a seeded vantage on dry land and a slow,
 *    continuous turn.
 * 3. The idle cost: the preset, the frame-rate cap and the guard threshold.
 * 4. Who draws. Two renderers exist (the backdrop and the Sandbox's
 *    `WorldView`). The backdrop draws everywhere except in walk mode
 *    (`backdropLease`, D19); the view draws while it is on screen or walked
 *    in (`viewDraws`).
 */

import { minPreset } from './quality.ts'
import type { QualityPreset } from './quality.ts'
import { findSpawn, getGroundHeight, walkBound } from './walk.ts'
import type { WalkTerrain } from './walk.ts'

// ---- 1. The dim layer ----------------------------------------------------------------

/**
 * Opacity of the one flat black layer over the world on every page while not
 * walking (0 = none, 1 = black). It is the whole dim: there is no second
 * layer behind the content column and no gradient (D20).
 *
 * 0.84 leaves 16% of the frame's light. That keeps secondary text (#8a9098)
 * at 4.5:1 even against a pure white frame, which is brighter than any frame
 * the sky can draw, so every frame passes (`backdropContrast`). The old 0.72
 * passed only with the column scrim; on its own it gave 2.9:1 on white.
 */
export const DIM_IDLE = 0.84
/**
 * The same layer in walk mode: lifted, the view belongs to the player. To
 * keep the dim in walk mode too, set it equal to `DIM_IDLE`.
 */
export const DIM_WALK = 0

export type DimMode = 'idle' | 'walk'

export interface DimState {
  readonly mode: DimMode
  /** Opacity of the full-viewport black layer. */
  readonly opacity: number
}

/**
 * The dim state machine. Two fixed states, `idle` (any page, not walking)
 * and `walk`, and the switch between them is instant: no fade, so there is
 * nothing for reduced motion to skip.
 */
export function dimState(walking: boolean): DimState {
  return walking ? { mode: 'walk', opacity: DIM_WALK } : { mode: 'idle', opacity: DIM_IDLE }
}

/** Secondary text color of the app (`--text-2`). */
export const TEXT_SECONDARY = '#8a9098'
/** Body text color of the app (`--text`). */
export const TEXT_BODY = '#d4d7dc'
/** WCAG AA contrast for normal text. */
export const MIN_TEXT_CONTRAST = 4.5

type Rgb255 = readonly [number, number, number]

function hexToRgb255(hex: string): Rgb255 {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG relative luminance of an sRGB color (0..255 per channel). */
export function relativeLuminance(rgb: Rgb255): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
}

/** WCAG contrast ratio of two relative luminances. */
export function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}

/** A frame pixel as it shows through black layers of the given opacities (browsers blend in sRGB). */
export function dimmedPixel(pixel: Rgb255, ...layers: number[]): Rgb255 {
  const k = layers.reduce((acc, a) => acc * (1 - a), 1)
  return [pixel[0] * k, pixel[1] * k, pixel[2] * k]
}

/**
 * Contrast of a text color against a backdrop frame pixel behind the flat
 * dim layer. `pixel` is the rendered frame's color behind the text, 0..255.
 */
export function backdropContrast(textHex: string, pixel: Rgb255, dim: number = DIM_IDLE): number {
  return contrastRatio(relativeLuminance(hexToRgb255(textHex)), relativeLuminance(dimmedPixel(pixel, dim)))
}

// ---- 2. The ambient camera ----------------------------------------------------------

/**
 * The ambient camera turns at this constant rate, degrees a second (D19): a
 * full circle every 144 s. It never pauses, swings back or restarts.
 */
export const AMBIENT_YAW_RATE_DEG_S = 2.5
/** Seconds for one full turn. */
export const AMBIENT_TURN_S = 360 / AMBIENT_YAW_RATE_DEG_S
/** The ambient camera looks this far below the horizon, radians. */
export const AMBIENT_PITCH = -0.05
/** The ambient clock never advances more than this per frame, s: no jump after a hidden tab or a stall. */
export const AMBIENT_MAX_DT_S = 0.1

/**
 * Camera yaw `t` seconds into the turn: the vantage's heading plus a steady
 * turn to the left. No travel: only the heading moves. Wrapped to one turn,
 * so a long visit loses no precision.
 */
export function ambientYaw(baseYaw: number, t: number): number {
  const turns = (((t / AMBIENT_TURN_S) % 1) + 1) % 1
  return baseYaw + turns * Math.PI * 2
}

/**
 * The ambient clock after one frame. It advances by the frame time, capped at
 * `AMBIENT_MAX_DT_S`, and holds still with reduced motion. It belongs to the
 * backdrop, not to a page, so navigating never resets it; it only stops while
 * the backdrop does not draw (walk mode, a hidden tab), and then resumes from
 * the same heading.
 */
export function stepAmbientClock(t: number, dt: number, reducedMotion: boolean): number {
  if (reducedMotion || !(dt > 0)) return t
  return t + Math.min(AMBIENT_MAX_DT_S, dt)
}

export interface Vantage {
  /** World coordinates (one unit is one cell). */
  readonly x: number
  readonly z: number
  /** Camera yaw in radians (three.js convention: 0 looks down -Z, positive turns left). */
  readonly yaw: number
}

/** Seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = (seed | 0) ^ 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VANTAGE_CANDIDATES = 96
/** The vantage keeps this many cells away from the map edge, so the view is not the void. */
const VANTAGE_MARGIN = 14
/** Height above the water (meters) that reads best: on a bank, not on a summit. */
const VANTAGE_RISE_M = 45

/**
 * Where the ambient camera stands: a dry cell chosen from the world seed, on
 * a bank a little above the water, facing the valley. The same seed and
 * terrain always give the same spot. On a map with no dry land it falls back
 * to the shallowest cell (`findSpawn`).
 */
export function findVantage(t: WalkTerrain, seed: number): Vantage {
  const half = (t.size - 1) / 2
  const margin = Math.min(VANTAGE_MARGIN, Math.floor(t.size / 4))
  const span = t.size - 1 - 2 * margin
  const next = rng(seed)

  // What the camera looks toward: the middle of the water, or the lowest ground.
  let wx = 0
  let wy = 0
  let wn = 0
  let lowest = 0
  for (let i = 0; i < t.heightmap.length; i++) {
    if (t.heightmap[i] < t.heightmap[lowest]) lowest = i
    if (t.heightmap[i] < t.waterLevelM) {
      wx += i % t.size
      wy += Math.floor(i / t.size)
      wn++
    }
  }
  const focusX = wn > 0 ? wx / wn : lowest % t.size
  const focusY = wn > 0 ? wy / wn : Math.floor(lowest / t.size)

  let best: { x: number; y: number } | null = null
  let bestScore = -Infinity
  for (let k = 0; k < VANTAGE_CANDIDATES; k++) {
    const x = margin + Math.round(next() * span)
    const y = margin + Math.round(next() * span)
    const h = t.heightmap[y * t.size + x]
    const rise = h - t.waterLevelM
    if (rise < 2) continue // under water, or right at the waterline
    const toFocus = Math.hypot(x - focusX, y - focusY)
    // A bank above the water, some distance back from what it looks at.
    const score = -Math.abs(rise - VANTAGE_RISE_M) / VANTAGE_RISE_M - Math.abs(toFocus - t.size * 0.22) / t.size
    if (score > bestScore) {
      bestScore = score
      best = { x, y }
    }
  }

  let x: number
  let z: number
  if (best) {
    x = best.x - half
    z = best.y - half
  } else {
    const spawn = findSpawn(0, 0, t)
    x = spawn.x
    z = spawn.z
  }
  const bound = walkBound(t.size)
  x = Math.min(bound, Math.max(-bound, x))
  z = Math.min(bound, Math.max(-bound, z))
  const dx = focusX - half - x
  const dz = focusY - half - z
  // Forward is (-sin yaw, -cos yaw).
  const yaw = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(-dx, -dz) : 0
  return { x, z, yaw }
}

/** True when the vantage stands on dry ground (used by the tests and the renderer's fallback). */
export function isDry(x: number, z: number, t: WalkTerrain): boolean {
  return getGroundHeight(x, z, t) >= t.waterLevelM
}

// ---- 3. The idle cost ----------------------------------------------------------------

/** The backdrop never draws above this preset: no grass, no shadow map, short draw distance. */
export const AMBIENT_QUALITY: QualityPreset = 'low'
/** The backdrop draws at most this many frames a second. */
export const AMBIENT_FPS_CAP = 30
/**
 * The backdrop's frame-rate guard reports under this rate. It is below the
 * cap on purpose: a backdrop held at 30 fps must not report itself as slow.
 */
export const AMBIENT_MIN_FPS = 20
/** Viewports this narrow or narrower (CSS px) are phones: `low` whatever the viewer's preset. */
export const NARROW_SCREEN_PX = 480

/** The preset the backdrop draws with: the viewer's, capped at `AMBIENT_QUALITY`; `low` on narrow screens. */
export function ambientQuality(viewportWidthPx: number, wanted: QualityPreset): QualityPreset {
  if (viewportWidthPx <= NARROW_SCREEN_PX) return 'low'
  return minPreset(wanted, AMBIENT_QUALITY)
}

/**
 * What the backdrop does when its frame-rate guard fires, in order: stop the
 * day/night cycle first, then freeze to a still frame.
 */
export type AmbientFallback = 'none' | 'cycle-stopped' | 'frozen'

export function nextAmbientFallback(now: AmbientFallback, cycleRunning: boolean): AmbientFallback {
  if (now === 'none' && cycleRunning) return 'cycle-stopped'
  return 'frozen'
}

// ---- 4. Who draws -------------------------------------------------------------------

export interface ViewPresence {
  /** The Sandbox's WorldView exists and its page is the one shown. */
  readonly shown: boolean
  /** Its viewport is at least partly inside the browser window. */
  readonly onScreen: boolean
  /** It is in walk mode (full viewport). */
  readonly walking: boolean
}

export const NO_VIEW: ViewPresence = { shown: false, onScreen: false, walking: false }

/**
 * The Sandbox's view draws while it is walked in or visible on screen;
 * otherwise it stops its frame loop and frees its plants and shadow map.
 */
export function viewDraws(v: ViewPresence): boolean {
  return v.shown && (v.walking || v.onScreen)
}

/**
 * The backdrop draws on every page, the Sandbox included, so its camera never
 * stops turning (D19). Only walk mode, which covers the window, takes the
 * view from it: then it stops its frame loop and frees its plants and shadow
 * map, and on exit it resumes from the same heading.
 *
 * This amends D14's "one renderer at a time": on the Sandbox in orbit view
 * both draw. The orbit view draws on demand (after a change or while its
 * camera moves); the backdrop draws at the `low` preset, at most 30 frames a
 * second.
 */
export function backdropLease(v: ViewPresence): 'draw' | 'covered' {
  return v.shown && v.walking ? 'covered' : 'draw'
}
