/**
 * Rewilding score. Definition and rationale: docs/ecology-rules.md
 * ("Rewilding score"). Keep this file and that section in sync.
 *
 *   score = 100 * (wD * habitatDiversity + wH * herbivoreStability + wP * predatorStability)
 *
 * - habitatDiversity: Shannon entropy of cover classes over land cells,
 *   divided by ln(classCount), so 0 = one class, 1 = all classes equally common.
 * - stability(species) over the last `window` history samples:
 *     0 if the species is extinct at the latest tick, otherwise
 *     presence * max(0, 1 - CV)
 *   where presence = fraction of samples with population > 0 and
 *   CV = standard deviation / mean of the population (coefficient of variation).
 * - weights: diversity 0.3, herbivores 0.4, predators 0.3. With predators
 *   disabled: diversity 0.4, herbivores 0.6.
 */

import type { PopulationSample, SimState } from './sim.ts'

export const SCORE_WINDOW = 200
/** Fewer samples than this and the score is marked provisional. */
export const SCORE_MIN_SAMPLES = 50

export interface RewildingScore {
  readonly score: number
  readonly habitatDiversity: number
  readonly herbivoreStability: number
  readonly predatorStability: number | null
  readonly weights: { readonly diversity: number; readonly herbivores: number; readonly predators: number }
  readonly samples: number
  readonly provisional: boolean
}

export function habitatDiversity(cover: Uint8Array, passable: Uint8Array, classCount: number): number {
  if (classCount <= 1) return 0
  const counts = new Array<number>(classCount).fill(0)
  let total = 0
  for (let i = 0; i < cover.length; i++) {
    if (passable[i] === 0 || cover[i] >= classCount) continue
    counts[cover[i]]++
    total++
  }
  if (total === 0) return 0
  let h = 0
  for (const c of counts) {
    if (c === 0) continue
    const p = c / total
    h -= p * Math.log(p)
  }
  return h / Math.log(classCount)
}

export function populationStability(values: readonly number[]): number {
  if (values.length === 0 || values[values.length - 1] === 0) return 0
  const present = values.filter((v) => v > 0).length / values.length
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length
  const cv = Math.sqrt(variance) / mean
  return present * Math.max(0, 1 - cv)
}

export function computeScore(state: SimState, window = SCORE_WINDOW): RewildingScore {
  const recent: readonly PopulationSample[] = state.history.slice(-window)
  const predatorsOn = state.rules.predator.enabled
  const weights = predatorsOn
    ? { diversity: 0.3, herbivores: 0.4, predators: 0.3 }
    : { diversity: 0.4, herbivores: 0.6, predators: 0 }

  const diversity = habitatDiversity(state.cover, state.passable, state.rules.vegetation.foodByClass.length)
  const herb = populationStability(recent.map((s) => s.herbivores))
  const pred = predatorsOn ? populationStability(recent.map((s) => s.predators)) : null

  const raw = weights.diversity * diversity + weights.herbivores * herb + weights.predators * (pred ?? 0)
  return {
    score: Math.round(100 * raw),
    habitatDiversity: diversity,
    herbivoreStability: herb,
    predatorStability: pred,
    weights,
    samples: recent.length,
    provisional: recent.length < SCORE_MIN_SAMPLES,
  }
}
