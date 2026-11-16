/**
 * The sim clock (ROLE-1 D16): how wall time becomes ticks.
 *
 * The sim itself has no notion of real time: `stepSim(state, n)` runs n
 * ticks, and the same seed and the same NUMBER of ticks always give the same
 * state. This clock only decides WHEN the next tick is due. Slowing it
 * (walk mode's "match walker" pace) spaces the ticks further apart in real
 * time and changes nothing else, so determinism is untouched
 * (test/clock.test.ts runs the same ticks at 1x and at 0.25x and compares).
 *
 * No DOM and no timers here: the caller feeds it elapsed milliseconds.
 */

import type { EcologyRules } from './rules.ts'

/** The app wakes the clock this often, ms. Independent of the frame rate. */
export const TICK_MS = 100

/** At most this many ticks are released by one `advance`, so a stalled tab does not burst. */
export const MAX_TICKS_PER_ADVANCE = 60

export class SimClock {
  /** Fraction of a tick already waited. */
  #acc = 0

  /**
   * Add `dtMs` of wall time at `ticksPerSecond` and return the whole ticks
   * now due. The remainder is kept, so the long-run rate is exact whatever
   * the caller's timer jitter. A rate of 0 (paused) releases nothing.
   */
  advance(dtMs: number, ticksPerSecond: number): number {
    if (!(dtMs > 0) || !(ticksPerSecond > 0)) return 0
    this.#acc += (dtMs / 1000) * ticksPerSecond
    const due = Math.floor(this.#acc)
    this.#acc -= due
    if (due > MAX_TICKS_PER_ADVANCE) {
      this.#acc = 0
      return MAX_TICKS_PER_ADVANCE
    }
    return due
  }

  /** How far into the next tick the clock is, 0..1. */
  get phase(): number {
    return this.#acc
  }

  reset(): void {
    this.#acc = 0
  }
}

/**
 * Wall time between two batches of ticks, ms: what the renderer glides an
 * animal over. Never shorter than the wake-up interval.
 */
export function tickGapMs(ticksPerSecond: number): number {
  if (!(ticksPerSecond > 0)) return Infinity
  return Math.max(TICK_MS, 1000 / ticksPerSecond)
}

/** Median of a list (0 for an empty list). */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const v = [...values].sort((a, b) => a - b)
  const mid = v.length >> 1
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

/** Straight-line length (cells) of every non-zero move within a Chebyshev radius. */
export function moveDistances(radius: number): number[] {
  const r = Math.max(0, Math.floor(radius))
  const out: number[] = []
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx !== 0 || dy !== 0) out.push(Math.hypot(dx, dy))
  return out
}

/**
 * Cells a moving animal typically covers in ONE tick, from the rules: the
 * median length of the moves the rules allow (each species' `moveRadius`;
 * predators count only when enabled). An estimate, not a measurement: the
 * walk-mode readout shows the measured speed next to it.
 */
export function medianMoveCells(rules: EcologyRules): number {
  const moves = moveDistances(rules.herbivore.moveRadius)
  if (rules.predator.enabled) moves.push(...moveDistances(rules.predator.moveRadius))
  return median(moves)
}

/** Typical speed of a moving animal at a tick rate, cells per second. */
export function medianMovingSpeed(rules: EcologyRules, ticksPerSecond: number): number {
  return medianMoveCells(rules) * Math.max(0, ticksPerSecond)
}
