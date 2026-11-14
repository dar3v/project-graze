/// <reference lib="webworker" />
/**
 * Inference Web Worker. Loads model_card.json and model.json once, then
 * answers predictBatch / predictOne / explainOne. Predictions never leave the
 * browser: there is no server round trip.
 */

import type { Engine } from './engine.ts'
import { fetchJsonOrThrow, loadEngine } from './loader.ts'
import type { FromWorker, ToWorker } from './protocol.ts'

declare const self: DedicatedWorkerGlobalScope

let engine: Engine | undefined

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer)
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data
  if (msg.type === 'init') {
    const outcome = await loadEngine(fetchJsonOrThrow, msg.baseUrl)
    if (!outcome.ok) {
      post({ type: 'fatal', message: outcome.message })
      return
    }
    engine = outcome.engine
    post({ type: 'ready', card: engine.card, warnings: outcome.warnings })
    return
  }

  if (!engine) {
    post({ type: 'error', id: msg.id, message: 'The model is not loaded.' })
    return
  }
  try {
    if (msg.type === 'predictBatch') {
      const result = engine.predictBatch(msg.inputs)
      post({ type: 'predictBatchResult', id: msg.id, result }, [result.classIndex.buffer, result.confidence.buffer, result.ood.buffer])
    } else if (msg.type === 'predictOne') {
      post({ type: 'predictOneResult', id: msg.id, prediction: engine.predictOne(msg.sample) })
    } else if (msg.type === 'explainOne') {
      post({ type: 'explainOneResult', id: msg.id, explanation: engine.explainOne(msg.sample) })
    }
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  }
}
