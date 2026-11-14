/**
 * Main-thread side of the inference Worker: a status store plus promise-based
 * predictBatch / predictOne / explainOne.
 */

import { writable, type Readable } from 'svelte/store'
import type { TerrainSample } from '../deps/features.ts'
import { ALLOW_STUB_MODEL, MODEL_BASE_PATH } from './config.ts'
import type { BatchResult, Explanation, Prediction } from './engine.ts'
import type { ModelCard } from './modelCard.ts'
import type { FromWorker, ToWorker } from './protocol.ts'

export type ModelStatus =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly card: ModelCard; readonly stub: boolean; readonly loadError?: string; readonly warnings: readonly string[] }
  | { readonly state: 'error'; readonly message: string }

const status = writable<ModelStatus>({ state: 'loading' })
export const modelStatus: Readable<ModelStatus> = status

let worker: Worker | undefined
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

export function baseUrl(): string {
  return new URL(MODEL_BASE_PATH, new URL(import.meta.env.BASE_URL, location.href)).href
}

function failAll(message: string): void {
  for (const p of pending.values()) p.reject(new Error(message))
  pending.clear()
}

export function startModel(): void {
  if (worker) return
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  } catch (err) {
    status.set({ state: 'error', message: `Could not start the inference worker: ${err instanceof Error ? err.message : String(err)}` })
    return
  }
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data
    switch (msg.type) {
      case 'ready':
        status.set({ state: 'ready', card: msg.card, stub: msg.stub, loadError: msg.loadError, warnings: msg.warnings })
        return
      case 'fatal':
        status.set({ state: 'error', message: msg.message })
        failAll(msg.message)
        return
      case 'error': {
        const p = pending.get(msg.id)
        pending.delete(msg.id)
        p?.reject(new Error(msg.message))
        return
      }
      default: {
        const p = pending.get(msg.id)
        pending.delete(msg.id)
        if (!p) return
        if (msg.type === 'predictBatchResult') p.resolve(msg.result)
        else if (msg.type === 'predictOneResult') p.resolve(msg.prediction)
        else p.resolve(msg.explanation)
      }
    }
  }
  worker.onerror = (e) => {
    const message = `The inference worker crashed: ${e.message || 'unknown error'}`
    status.set({ state: 'error', message })
    failAll(message)
  }
  send({ type: 'init', baseUrl: baseUrl(), allowStub: ALLOW_STUB_MODEL })
}

function send(msg: ToWorker, transfer: Transferable[] = []): void {
  worker?.postMessage(msg, transfer)
}

function request<T>(build: (id: number) => ToWorker, transfer: Transferable[] = []): Promise<T> {
  if (!worker) return Promise.reject(new Error('The inference worker is not running.'))
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    send(build(id), transfer)
  })
}

/** `inputs` is transferred (it becomes unusable in the caller). */
export function predictBatch(inputs: Float32Array): Promise<BatchResult> {
  return request((id) => ({ type: 'predictBatch', id, inputs }), [inputs.buffer])
}

export function predictOne(sample: TerrainSample): Promise<Prediction> {
  return request((id) => ({ type: 'predictOne', id, sample }))
}

export function explainOne(sample: TerrainSample): Promise<Explanation> {
  return request((id) => ({ type: 'explainOne', id, sample }))
}
