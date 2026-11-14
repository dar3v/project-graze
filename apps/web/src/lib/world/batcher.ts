/**
 * Debounced dirty-rect events (D3). While the user sculpts, every brush dab
 * adds its rect; `emit` fires once, `delayMs` after the last dab, with the
 * union of everything touched since the previous emit. The model then
 * re-predicts once per pause instead of once per frame.
 */

import { unionRect } from './terrain.ts'
import type { DirtyRect } from './terrain.ts'

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(id: unknown): void
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export class DirtyRectBatcher {
  #pending: DirtyRect | null = null
  #timer: unknown = undefined
  readonly #delayMs: number
  readonly #emit: (rect: DirtyRect) => void
  readonly #timers: Timers

  constructor(delayMs: number, emit: (rect: DirtyRect) => void, timers: Timers = defaultTimers) {
    this.#delayMs = delayMs
    this.#emit = emit
    this.#timers = timers
  }

  get pending(): DirtyRect | null {
    return this.#pending
  }

  add(rect: DirtyRect | null): void {
    if (!rect) return
    this.#pending = unionRect(this.#pending, rect)
    if (this.#timer !== undefined) this.#timers.clearTimeout(this.#timer)
    this.#timer = this.#timers.setTimeout(() => this.flush(), this.#delayMs)
  }

  /** Emit now (if anything is pending). */
  flush(): void {
    if (this.#timer !== undefined) this.#timers.clearTimeout(this.#timer)
    this.#timer = undefined
    const r = this.#pending
    this.#pending = null
    if (r) this.#emit(r)
  }

  /** Drop pending changes without emitting. */
  cancel(): void {
    if (this.#timer !== undefined) this.#timers.clearTimeout(this.#timer)
    this.#timer = undefined
    this.#pending = null
  }
}
