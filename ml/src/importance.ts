/**
 * Permutation importance (D5): drop in macro-F1 when one feature column is
 * shuffled, averaged over repeats. Global, model-agnostic. Correlated
 * features (the three hillshades; aspect sin/cos) share credit, so a low
 * value does not mean the information is useless.
 */
import { createRng, shuffle } from './lib/rng.ts'
import type { Matrix } from './featureSets.ts'
import { macroF1Of } from './metrics.ts'
import type { Classifier } from './models/types.ts'

export function permutationImportance(
  model: Classifier,
  m: Matrix,
  y: Uint8Array,
  names: readonly string[],
  repeats: number,
  seed: number,
): { feature: string; importance: number; std: number }[] {
  const base = macroF1Of(model.predictProba(m), y, model.k)
  const rng = createRng(seed)
  return names.map((feature, c) => {
    const drops: number[] = []
    for (let r = 0; r < repeats; r++) {
      const data = Float64Array.from(m.data)
      const perm = new Uint32Array(m.rows)
      for (let i = 0; i < m.rows; i++) perm[i] = i
      shuffle(perm, rng)
      for (let i = 0; i < m.rows; i++) data[i * m.cols + c] = m.data[perm[i] * m.cols + c]
      drops.push(base - macroF1Of(model.predictProba({ rows: m.rows, cols: m.cols, data }), y, model.k))
    }
    const mean = drops.reduce((a, b) => a + b, 0) / repeats
    const std = Math.sqrt(drops.reduce((a, b) => a + (b - mean) ** 2, 0) / repeats)
    return { feature, importance: mean, std }
  })
}
