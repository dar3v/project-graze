/**
 * Inference Worker message protocol (proposal; agree with Role 3 and record in
 * docs/feature-contract.md before changing).
 *
 * Main -> Worker                 Worker -> Main
 *   init { baseUrl }               ready { card, stub, loadError? } | fatal { message }
 *   predictBatch { id, inputs }    predictBatchResult { id, result }
 *   predictOne { id, sample }      predictOneResult { id, prediction }
 *   explainOne { id, sample }      explainOneResult { id, explanation }
 *                                  error { id, message }
 *
 * `inputs` is a Float32Array of n * RAW_INPUT_DIM values in RAW_INPUT_KEYS
 * order (transferred, not copied).
 */

import type { TerrainSample } from '../deps/features.ts'
import type { BatchResult, Explanation, Prediction } from './engine.ts'
import type { ModelCard } from './modelCard.ts'

export type ToWorker =
  | { readonly type: 'init'; readonly baseUrl: string; readonly allowStub: boolean }
  | { readonly type: 'predictBatch'; readonly id: number; readonly inputs: Float32Array }
  | { readonly type: 'predictOne'; readonly id: number; readonly sample: TerrainSample }
  | { readonly type: 'explainOne'; readonly id: number; readonly sample: TerrainSample }

export type FromWorker =
  | { readonly type: 'ready'; readonly card: ModelCard; readonly stub: boolean; readonly loadError?: string; readonly warnings: readonly string[] }
  | { readonly type: 'fatal'; readonly message: string }
  | { readonly type: 'predictBatchResult'; readonly id: number; readonly result: BatchResult }
  | { readonly type: 'predictOneResult'; readonly id: number; readonly prediction: Prediction }
  | { readonly type: 'explainOneResult'; readonly id: number; readonly explanation: Explanation }
  | { readonly type: 'error'; readonly id: number; readonly message: string }
