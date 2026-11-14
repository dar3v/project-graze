/**
 * Export (D7): model.json in the format apps/web/src/lib/model/inference.ts
 * parses (docs/feature-contract.md), plus helpers shared by train.ts.
 */
import { FEATURE_NAMES } from '../../packages/features/src/index.ts'
import { forestFromTrees, type ForestModel, type Tree } from './models/forest.ts'
import type { NetworkModel } from './models/network.ts'
import type { StandardizedDetector } from './ood.ts'
import { MODEL_VERSION, SCHEMA_VERSION } from './config.ts'

/** Leaf probabilities are rounded to this many decimals to keep model.json small. */
export const LEAF_DECIMALS = 4

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

/**
 * The forest exactly as it will ship: leaf values rounded (the app, like
 * forestFromTrees, divides each leaf by its sum). Metrics on the
 * final model and the inference fixtures are computed from THIS model so
 * they describe what the app runs.
 */
export function roundForest(model: ForestModel, k: number): ForestModel {
  const trees: Tree[] = model.trees.map((t) => {
    const value = new Float64Array(t.value.length)
    for (let node = 0; node < t.nodeCount; node++) {
      if (t.feature[node] >= 0) continue
      for (let c = 0; c < k; c++) value[node * k + c] = round(t.value[node * k + c], LEAF_DECIMALS)
    }
    return { ...t, value }
  })
  return forestFromTrees(trees, k, model.config)
}

type ModelSection =
  | { type: 'softmax'; weights: number[][]; bias: number[] }
  | { type: 'mlp'; layers: { weights: number[][]; bias: number[]; activation: 'relu' | 'linear' }[] }
  | { type: 'forest'; trees: { feature: number[]; threshold: number[]; left: number[]; right: number[]; value: number[][] }[] }

function matrixRows(w: Float64Array, rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, r) => Array.from(w.subarray(r * cols, (r + 1) * cols)))
}

export interface ModelJsonExport {
  schemaVersion: typeof SCHEMA_VERSION
  /** Same value as model_card.json `modelVersion`; a saved world stores it (D11). */
  modelVersion: string
  featureNames: string[]
  classCount: number
  scaler?: { mean: number[]; std: number[] }
  ood: { method: 'standardized-distance'; mean: number[]; std: number[]; threshold: number }
  model: ModelSection
  /** Informational: the temperature already folded into the last layer (networks) or NOT applied (forest). */
  temperature: { value: number; applied: 'folded-into-weights' | 'not-applied' }
}

export function exportModelJson(
  model: NetworkModel | ForestModel,
  ood: StandardizedDetector,
  temperature: number,
): ModelJsonExport {
  const k = model.k
  let section: ModelSection
  let scaler: ModelJsonExport['scaler']
  if (model.family === 'forest') {
    const f = model as ForestModel
    section = {
      type: 'forest',
      trees: f.trees.map((t) => {
        const value: number[][] = []
        for (let node = 0; node < t.nodeCount; node++) {
          const leaf = t.feature[node] < 0
          value.push(Array.from({ length: k }, (_, c) => (leaf ? t.value[node * k + c] : 0)))
        }
        return { feature: Array.from(t.feature), threshold: Array.from(t.threshold), left: Array.from(t.left), right: Array.from(t.right), value }
      }),
    }
  } else {
    const n = model as NetworkModel
    scaler = { mean: [...n.scaler.mean], std: [...n.scaler.std] }
    if (n.family === 'softmax') {
      const L = n.layers[0]
      section = { type: 'softmax', weights: matrixRows(L.w, L.outDim, L.inDim), bias: Array.from(L.b) }
    } else {
      section = {
        type: 'mlp',
        layers: n.layers.map((L) => ({ weights: matrixRows(L.w, L.outDim, L.inDim), bias: Array.from(L.b), activation: L.activation })),
      }
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    featureNames: [...FEATURE_NAMES],
    classCount: k,
    ...(scaler ? { scaler } : {}),
    ood: { method: 'standardized-distance', mean: [...ood.mean], std: [...ood.std], threshold: ood.threshold },
    model: section,
    temperature: { value: temperature, applied: model.family === 'forest' ? 'not-applied' : 'folded-into-weights' },
  }
}
