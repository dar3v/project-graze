/**
 * Random forest, from scratch. Histogram-based splits: each feature is cut
 * into at most `bins` quantile bins (edges from the training matrix only), and
 * a split "bin <= b" is stored as the raw threshold "x <= edge[b]", so the
 * exported trees run on raw feature values exactly as the app evaluates them
 * (docs/feature-contract.md, forest format).
 *
 * Gini impurity with optional class weights, bootstrap rows, `mtry` random
 * features per node, depth and leaf-size caps (also caps the export size).
 */
import { createRng, type Rng } from '../lib/rng.ts'
import type { Matrix } from '../featureSets.ts'
import { classWeights, type Classifier, type ClassWeighting } from './types.ts'

export interface ForestConfig {
  readonly trees: number
  readonly maxDepth: number
  readonly minLeaf: number
  /** Features tried per split; 0 = ceil(sqrt(d)). */
  readonly mtry: number
  /** Bootstrap sample size per tree (with replacement), capped at n. */
  readonly maxSamples: number
  readonly bins: number
  readonly classWeighting: ClassWeighting
  readonly seed: number
}

export interface Tree {
  readonly feature: Int32Array
  readonly threshold: Float64Array
  readonly left: Int32Array
  readonly right: Int32Array
  /** nodes x k; class distribution at leaves, zeros at internal nodes. */
  readonly value: Float64Array
  readonly nodeCount: number
}

export interface ForestModel extends Classifier {
  readonly trees: readonly Tree[]
  readonly config: ForestConfig
}

/** Quantile bin edges per feature (strictly increasing), from up to 100k rows. */
function binEdges(m: Matrix, bins: number, rng: Rng): Float64Array[] {
  const sampleRows = Math.min(m.rows, 100_000)
  const pick = new Uint32Array(sampleRows)
  for (let i = 0; i < sampleRows; i++) pick[i] = m.rows <= 100_000 ? i : Math.floor(rng() * m.rows)
  const edges: Float64Array[] = []
  for (let c = 0; c < m.cols; c++) {
    const vals = new Float64Array(sampleRows)
    for (let i = 0; i < sampleRows; i++) vals[i] = m.data[pick[i] * m.cols + c]
    vals.sort()
    const e: number[] = []
    for (let b = 1; b < bins; b++) {
      const v = vals[Math.min(sampleRows - 1, Math.floor((b * sampleRows) / bins))]
      if (e.length === 0 || v > e[e.length - 1]) e.push(v)
    }
    // Drop a top edge equal to the max: it would create an empty right side.
    if (e.length > 0 && e[e.length - 1] >= vals[sampleRows - 1]) e.pop()
    edges.push(Float64Array.from(e))
  }
  return edges
}

/** bin(x) = first i with x <= edges[i], else edges.length. */
function binOf(edges: Float64Array, x: number): number {
  let lo = 0
  let hi = edges.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (x <= edges[mid]) hi = mid
    else lo = mid + 1
  }
  return lo
}

export function trainForest(m: Matrix, y: Uint8Array, k: number, config: ForestConfig): ForestModel {
  const rng = createRng(config.seed)
  const d = m.cols
  const edges = binEdges(m, config.bins, rng)
  const nb = edges.map((e) => e.length + 1)
  const maxBins = Math.max(...nb)
  const binned = new Uint8Array(m.rows * d)
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < d; c++) binned[r * d + c] = binOf(edges[c], m.data[r * d + c])
  const cw = classWeights(y, k, config.classWeighting)
  const mtry = config.mtry > 0 ? Math.min(d, config.mtry) : Math.ceil(Math.sqrt(d))
  const sampleSize = Math.min(m.rows, config.maxSamples)

  const hist = new Float64Array(maxBins * k)
  const histN = new Uint32Array(maxBins)
  const leftW = new Float64Array(k)
  const totalW = new Float64Array(k)
  const featOrder = new Int32Array(d)

  const gini = (w: Float64Array | number[], total: number): number => {
    if (total <= 0) return 0
    let s = 0
    for (let c = 0; c < k; c++) s += (w[c] / total) ** 2
    return 1 - s
  }

  const trees: Tree[] = []
  for (let t = 0; t < config.trees; t++) {
    const rows = new Uint32Array(sampleSize)
    for (let i = 0; i < sampleSize; i++) rows[i] = Math.floor(rng() * m.rows)
    const feature: number[] = []
    const threshold: number[] = []
    const left: number[] = []
    const right: number[] = []
    const value: number[] = []
    // Stack of [nodeId, start, end, depth]
    const stack: [number, number, number, number][] = []
    const newNode = (): number => {
      feature.push(-1)
      threshold.push(0)
      left.push(-1)
      right.push(-1)
      for (let c = 0; c < k; c++) value.push(0)
      return feature.length - 1
    }
    stack.push([newNode(), 0, sampleSize, 0])
    while (stack.length > 0) {
      const [node, start, end, depth] = stack.pop()!
      totalW.fill(0)
      for (let i = start; i < end; i++) totalW[y[rows[i]]] += cw[y[rows[i]]]
      let tw = 0
      let classesPresent = 0
      for (let c = 0; c < k; c++) {
        tw += totalW[c]
        if (totalW[c] > 0) classesPresent++
      }
      const n = end - start
      const makeLeaf = () => {
        for (let c = 0; c < k; c++) value[node * k + c] = tw > 0 ? totalW[c] / tw : 1 / k
      }
      if (depth >= config.maxDepth || n < 2 * config.minLeaf || classesPresent <= 1) {
        makeLeaf()
        continue
      }
      const parentGini = gini(totalW, tw)
      let bestGain = 1e-12
      let bestFeat = -1
      let bestBin = -1
      for (let i = 0; i < d; i++) featOrder[i] = i
      for (let f = 0; f < mtry; f++) {
        const j = f + Math.floor(rng() * (d - f))
        const tmp = featOrder[f]
        featOrder[f] = featOrder[j]
        featOrder[j] = tmp
        const c = featOrder[f]
        const nbc = nb[c]
        if (nbc < 2) continue
        hist.fill(0, 0, nbc * k)
        histN.fill(0, 0, nbc)
        for (let i = start; i < end; i++) {
          const r = rows[i]
          const b = binned[r * d + c]
          hist[b * k + y[r]] += cw[y[r]]
          histN[b]++
        }
        leftW.fill(0)
        let leftN = 0
        let lw = 0
        for (let b = 0; b < nbc - 1; b++) {
          for (let cl = 0; cl < k; cl++) leftW[cl] += hist[b * k + cl]
          leftN += histN[b]
          lw = 0
          for (let cl = 0; cl < k; cl++) lw += leftW[cl]
          if (histN[b] === 0) continue
          const rightN = n - leftN
          if (leftN < config.minLeaf) continue
          if (rightN < config.minLeaf) break
          const rw = tw - lw
          let gl = 0
          let gr = 0
          for (let cl = 0; cl < k; cl++) {
            gl += (leftW[cl] / lw) ** 2
            gr += ((totalW[cl] - leftW[cl]) / rw) ** 2
          }
          const gain = parentGini - (lw / tw) * (1 - gl) - (rw / tw) * (1 - gr)
          if (gain > bestGain) {
            bestGain = gain
            bestFeat = c
            bestBin = b
          }
        }
      }
      if (bestFeat < 0) {
        makeLeaf()
        continue
      }
      // Partition rows[start:end) so bin <= bestBin comes first.
      let i = start
      let j = end - 1
      while (i <= j) {
        if (binned[rows[i] * d + bestFeat] <= bestBin) i++
        else {
          const tmp = rows[i]
          rows[i] = rows[j]
          rows[j] = tmp
          j--
        }
      }
      feature[node] = bestFeat
      threshold[node] = edges[bestFeat][bestBin]
      const l = newNode()
      const r = newNode()
      left[node] = l
      right[node] = r
      stack.push([r, i, end, depth + 1])
      stack.push([l, start, i, depth + 1])
    }
    trees.push({
      feature: Int32Array.from(feature),
      threshold: Float64Array.from(threshold),
      left: Int32Array.from(left),
      right: Int32Array.from(right),
      value: Float64Array.from(value),
      nodeCount: feature.length,
    })
  }
  return forestFromTrees(trees, k, config)
}

export function forestFromTrees(trees: readonly Tree[], k: number, config: ForestConfig): ForestModel {
  return {
    family: 'forest',
    k,
    trees,
    config,
    predictProba(m) {
      const out = new Float32Array(m.rows * k)
      const acc = new Float64Array(k)
      for (let r = 0; r < m.rows; r++) {
        acc.fill(0)
        const off = r * m.cols
        for (const t of trees) {
          let node = 0
          while (t.feature[node] >= 0) node = m.data[off + t.feature[node]] <= t.threshold[node] ? t.left[node] : t.right[node]
          // Normalise by the leaf sum, exactly like apps/web/src/lib/model/inference.ts.
          let total = 0
          for (let c = 0; c < k; c++) total += t.value[node * k + c]
          if (total === 0) total = 1
          for (let c = 0; c < k; c++) acc[c] += t.value[node * k + c] / total
        }
        for (let c = 0; c < k; c++) out[r * k + c] = acc[c] / trees.length
      }
      return out
    },
  }
}
