/** What the herd panel tells the page about the running sim (ROLE-1 D15, D16). */
export interface HerdSummary {
  readonly tick: number
  readonly herbivores: number
  /** Null when predators are switched off in the rules. */
  readonly predators: number | null
  /** Rewilding score 0..100, or null before there is one. */
  readonly score: number | null
  readonly provisional: boolean
  readonly running: boolean
  /** Sim time scale in effect (1 = full sim speed). */
  readonly timeScale: number
}
