/**
 * Splits (D3). All index sets are deterministic functions of the seed.
 *
 *  1. Final test set: stratified 10% of ALL rows. Wrapped in LockedTestSet so
 *     training code cannot read it by accident; its hash is pinned in
 *     ml/splits.lock.json so any change to the split is detected.
 *  2. Dev set = everything else. Two evaluation designs on the dev set:
 *     - random: stratified 80/20 train/validation (optimistic: neighbouring
 *       30 m cells are spatially correlated and land on both sides);
 *     - leave-one-wilderness-area-out (LOAO): 4 folds, train on 3 areas,
 *       validate on the 4th (the honest generalization test).
 *  3. Inside any training set, `innerSplit` carves a stratified holdout for
 *     tuning, temperature scaling and the OOD threshold. Outer validation rows
 *     are never used for any fitting.
 */
import { createHash } from 'node:crypto'

import { createRng, shuffle, subSeed } from './lib/rng.ts'
import { AREA_NAMES, N_AREAS, N_CLASSES, type Dataset } from './data/covertype.ts'

export const TEST_FRACTION = 0.1
export const RANDOM_VAL_FRACTION = 0.2
export const INNER_HOLDOUT_FRACTION = 0.15

export class LeakageError extends Error {}

/** Throws LeakageError if any index appears in both sets. */
export function assertDisjoint(a: ArrayLike<number>, b: ArrayLike<number>, what: string): void {
  const seen = new Set<number>()
  for (let i = 0; i < a.length; i++) seen.add(a[i])
  let overlap = 0
  let first = -1
  for (let i = 0; i < b.length; i++)
    if (seen.has(b[i])) {
      overlap++
      if (first < 0) first = b[i]
    }
  if (overlap > 0) throw new LeakageError(`Leakage: ${overlap} row(s) shared between ${what} (first: row ${first}).`)
}

/**
 * Stratified split of `indices` by class: from each class, a `fraction` share
 * (rounded) goes to `held`. Both outputs are sorted.
 */
export function stratifiedSplit(
  indices: ArrayLike<number>,
  y: Uint8Array,
  fraction: number,
  seed: number,
): { rest: Uint32Array; held: Uint32Array } {
  const byClass: number[][] = Array.from({ length: N_CLASSES }, () => [])
  for (let i = 0; i < indices.length; i++) byClass[y[indices[i]]].push(indices[i])
  const rng = createRng(seed)
  const rest: number[] = []
  const held: number[] = []
  for (const rows of byClass) {
    const arr = shuffle(Uint32Array.from(rows), rng)
    const k = Math.round(arr.length * fraction)
    for (let i = 0; i < arr.length; i++) (i < k ? held : rest).push(arr[i])
  }
  return { rest: Uint32Array.from(rest).sort(), held: Uint32Array.from(held).sort() }
}

export function hashIndices(idx: Uint32Array): string {
  return createHash('sha256').update(Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength)).digest('hex')
}

const FREEZE_CONFIRMATION = 'the model is frozen'

/** The final test set. Its indices are reachable only through `unlockForFinalEvaluation`. */
export class LockedTestSet {
  readonly #indices: Uint32Array
  readonly size: number
  readonly hash: string
  constructor(indices: Uint32Array) {
    this.#indices = indices
    this.size = indices.length
    this.hash = hashIndices(indices)
  }
  /** Only `ml/src/evaluate-final.ts` calls this, after D9 (model freeze). */
  unlockForFinalEvaluation(confirmation: string): Uint32Array {
    if (confirmation !== FREEZE_CONFIRMATION) throw new Error(`Refusing to unlock the test set. Pass "${FREEZE_CONFIRMATION}".`)
    return this.#indices
  }
  /** Leakage check without exposing the indices. */
  assertDisjointFrom(other: ArrayLike<number>, what: string): void {
    assertDisjoint(this.#indices, other, `the final test set and ${what}`)
  }
  static readonly CONFIRMATION = FREEZE_CONFIRMATION
}

export interface Fold {
  readonly name: string
  readonly kind: 'random' | 'loao'
  readonly train: Uint32Array
  readonly val: Uint32Array
  /** LOAO only: the held-out wilderness area index. */
  readonly heldOutArea?: number
}

export interface Splits {
  readonly seed: number
  readonly test: LockedTestSet
  readonly dev: Uint32Array
  readonly random: Fold
  readonly loao: readonly Fold[]
}

export function makeSplits(d: Dataset, seed: number): Splits {
  const all = new Uint32Array(d.n)
  for (let i = 0; i < d.n; i++) all[i] = i
  const { rest: dev, held: test } = stratifiedSplit(all, d.y, TEST_FRACTION, subSeed(seed, 'final-test'))
  const r = stratifiedSplit(dev, d.y, RANDOM_VAL_FRACTION, subSeed(seed, 'random-split'))
  const random: Fold = { name: 'random', kind: 'random', train: r.rest, val: r.held }
  const loao: Fold[] = []
  for (let a = 0; a < N_AREAS; a++) {
    const train: number[] = []
    const val: number[] = []
    for (const i of dev) (d.area[i] === a ? val : train).push(i)
    loao.push({ name: `loao-${AREA_NAMES[a]}`, kind: 'loao', train: Uint32Array.from(train), val: Uint32Array.from(val), heldOutArea: a })
  }
  const splits: Splits = { seed, test: new LockedTestSet(test), dev, random, loao }
  assertSplitsClean(splits, d)
  return splits
}

/** The leakage checks every pipeline run performs (and the unit tests repeat). */
export function assertSplitsClean(s: Splits, d: Dataset): void {
  s.test.assertDisjointFrom(s.dev, 'the dev set')
  if (s.test.size + s.dev.length !== d.n) throw new LeakageError('Test + dev do not partition the dataset.')
  for (const f of [s.random, ...s.loao]) {
    assertDisjoint(f.train, f.val, `${f.name} train and validation`)
    s.test.assertDisjointFrom(f.train, `${f.name} train`)
    s.test.assertDisjointFrom(f.val, `${f.name} validation`)
  }
  for (const f of s.loao) {
    for (const i of f.train) if (d.area[i] === f.heldOutArea) throw new LeakageError(`${f.name}: held-out area row ${i} in training.`)
  }
}

/** Stratified holdout inside a training set (tuning / calibration / OOD threshold). */
export function innerSplit(train: Uint32Array, y: Uint8Array, seed: number, fraction = INNER_HOLDOUT_FRACTION): { fit: Uint32Array; holdout: Uint32Array } {
  const { rest, held } = stratifiedSplit(train, y, fraction, seed)
  assertDisjoint(rest, held, 'inner fit and inner holdout')
  return { fit: rest, holdout: held }
}

/** Uniform random subsample without replacement (sorted), or the input if small enough. */
export function subsample(idx: Uint32Array, max: number, seed: number): Uint32Array {
  if (idx.length <= max) return idx
  const copy = shuffle(Uint32Array.from(idx), createRng(seed))
  return copy.subarray(0, max).sort()
}
