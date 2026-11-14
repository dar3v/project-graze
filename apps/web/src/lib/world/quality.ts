/**
 * Quality presets and the frame-rate guard (D12). Three-free, unit-tested.
 *
 * A preset sets four things: how much vegetation is placed, how good the
 * shadows are, how far the walker sees, and the device-pixel-ratio cap.
 * `FpsGuard` watches the frame rate while the scene animates and reports when
 * it has stayed under the target for several seconds; the view then stops
 * the day/night cycle first (D10 fallback) and lowers the preset next.
 */

export type QualityPreset = 'low' | 'medium' | 'high'

export interface QualitySpec {
  /** Multiplier on every species' plants-per-cell, 0..1. */
  readonly vegetationDensity: number
  /** Grass tufts per land cell near the walker (0 = none). */
  readonly grassPerCell: number
  /** Shadow map side in pixels; 0 turns shadows off. */
  readonly shadowMapSize: number
  /** Walk mode: vegetation beyond this many cells is dropped, and the fog is opaque there. */
  readonly drawDistance: number
  /** Cap on window.devicePixelRatio. */
  readonly pixelRatioCap: number
  /** Procedural clouds in the sky shader. */
  readonly clouds: boolean
}

export const QUALITY: Record<QualityPreset, QualitySpec> = {
  low: { vegetationDensity: 0.3, grassPerCell: 0, shadowMapSize: 0, drawDistance: 48, pixelRatioCap: 1, clouds: false },
  medium: { vegetationDensity: 0.6, grassPerCell: 12, shadowMapSize: 1024, drawDistance: 80, pixelRatioCap: 1.5, clouds: true },
  high: { vegetationDensity: 1, grassPerCell: 22, shadowMapSize: 2048, drawDistance: 128, pixelRatioCap: 2, clouds: true },
}

/** The preset the app starts on (`DEFAULT_SETTINGS.quality`). */
export const DEFAULT_QUALITY: QualityPreset = 'medium'

/** Frame-rate target for walk mode on the default preset (D12). */
export const TARGET_FPS = 30
/** The frame rate must stay under the target this long before the guard reports it. */
export const LOW_FPS_SECONDS = 4
/** Frames right after a (re)start are ignored: shader compiles and mesh builds stall them. */
export const FPS_GRACE_SECONDS = 2

const ORDER: readonly QualityPreset[] = ['low', 'medium', 'high']

/** The next preset down, or null at the lowest. */
export function lowerPreset(q: QualityPreset): QualityPreset | null {
  const i = ORDER.indexOf(q)
  return i > 0 ? ORDER[i - 1] : null
}

/** The lower (cheaper) of two presets. */
export function minPreset(a: QualityPreset, b: QualityPreset): QualityPreset {
  return ORDER[Math.min(ORDER.indexOf(a), ORDER.indexOf(b))]
}

export class FpsGuard {
  readonly #target: number
  readonly #holdS: number
  readonly #graceS: number
  #fps = 0
  #lowFor = 0
  #grace: number

  constructor(target: number = TARGET_FPS, holdS: number = LOW_FPS_SECONDS, graceS: number = FPS_GRACE_SECONDS) {
    this.#target = target
    this.#holdS = holdS
    this.#graceS = graceS
    this.#grace = graceS
  }

  /** Smoothed frames per second (0 until the first frame). */
  get fps(): number {
    return this.#fps
  }

  /** Start over: after a mode change, a preset change, or a pause in rendering. */
  reset(): void {
    this.#fps = 0
    this.#lowFor = 0
    this.#grace = this.#graceS
  }

  /**
   * Record one frame that took `dt` seconds. Returns true ONCE each time the
   * smoothed frame rate has been under the target for `holdS` seconds in a
   * row; the timer then starts again.
   */
  frame(dt: number): boolean {
    // A gap this long is a hidden tab or a debugger pause, not a slow frame.
    if (!(dt > 0) || dt > 1) {
      this.reset()
      return false
    }
    const now = 1 / dt
    this.#fps = this.#fps === 0 ? now : this.#fps + (now - this.#fps) * Math.min(1, dt * 4)
    if (this.#grace > 0) {
      this.#grace -= dt
      return false
    }
    if (this.#fps >= this.#target) {
      this.#lowFor = 0
      return false
    }
    this.#lowFor += dt
    if (this.#lowFor < this.#holdS) return false
    this.#lowFor = 0
    return true
  }
}
