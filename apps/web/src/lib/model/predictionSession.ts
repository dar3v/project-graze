/**
 * The prediction session: turns a stream of terrain inputs into cover maps.
 *
 * The page hands it the packed inputs every time the terrain changes (a
 * brush stroke, the water slider, a new seed). The session:
 * - debounces: only the last request in a burst is predicted;
 * - copies the inputs before predicting, because the Worker adapter takes
 *   ownership of (transfers) the buffer it is given;
 * - drops stale results: a slow batch that finishes after a newer request
 *   never replaces the newer map;
 * - publishes a `CoverMap` in one piece: the predictions AND the inputs they
 *   were predicted from (with their water mask), the world key and a version
 *   number. Readers that need cover and water together (the herd sim, the
 *   cover legend) read both from the same map, so they never pair a new
 *   water mask with an old cover map.
 *
 * The seam is `PredictBatch`. The app passes the Worker client's
 * `predictBatch`; tests pass an in-process engine or a fake.
 *
 * No DOM, no Svelte runes; unit-tested in test/prediction.test.ts.
 */
import { writable, type Readable } from 'svelte/store'

import type { TerrainInputs } from '../deps/features.ts'
import type { PredictionState } from '../state/appState.ts'
import type { BatchResult } from './engine.ts'

/** Predict a packed batch. May take ownership of (transfer) the buffer. */
export type PredictBatch = (inputs: Float32Array) => Promise<BatchResult>

export interface CoverMap {
  /** The inputs this map was predicted from (their `water` mask is the map's water). */
  readonly inputs: TerrainInputs
  /** Predicted class index per cell (the cover map). */
  readonly cover: Uint8Array
  /** Max class probability per cell. */
  readonly confidence: Float32Array
  /** 1 where the cell is out of distribution (low trust). */
  readonly ood: Uint8Array
  readonly oodCount: number
  readonly invalidCount: number
  /** `worldKeyOf()` of the landscape it was predicted for. */
  readonly worldKey: string
  /** 1, 2, 3, ... for each map published by this session. */
  readonly version: number
}

export interface PredictionSnapshot {
  /** The latest cover map, kept while a newer one is being predicted or after a failure. */
  readonly map: CoverMap | null
  /** A batch is running (not while the debounce waits, so dragging a slider does not flash "Predicting"). */
  readonly predicting: boolean
  /** Why the latest batch failed; cleared when the next batch starts. */
  readonly error: string | null
}

export interface PredictionSession {
  readonly snapshot: Readable<PredictionSnapshot>
  /** Predict these inputs after the debounce, replacing any request still waiting. */
  request(inputs: TerrainInputs, worldKey: string): void
  /** Drop the waiting request and ignore any batch still running. */
  cancel(): void
  /** `cancel()`, for good: nothing is published after this. */
  dispose(): void
}

export function createPredictionSession(predict: PredictBatch, opts: { readonly debounceMs: number }): PredictionSession {
  const snapshot = writable<PredictionSnapshot>({ map: null, predicting: false, error: null })
  let timer: ReturnType<typeof setTimeout> | undefined
  /** Bumped by every request and cancel: a batch publishes only if it is still the latest. */
  let seq = 0
  let version = 0
  let disposed = false

  async function run(inputs: TerrainInputs, worldKey: string, mine: number): Promise<void> {
    snapshot.update((s) => ({ ...s, predicting: true, error: null }))
    try {
      const r = await predict(inputs.packed.slice())
      if (mine !== seq) return
      version++
      const map: CoverMap = { inputs, cover: r.classIndex, confidence: r.confidence, ood: r.ood, oodCount: r.oodCount, invalidCount: r.invalidCount, worldKey, version }
      snapshot.set({ map, predicting: false, error: null })
    } catch (err) {
      if (mine !== seq) return
      snapshot.update((s) => ({ ...s, predicting: false, error: err instanceof Error ? err.message : String(err) }))
    }
  }

  function cancel(): void {
    clearTimeout(timer)
    timer = undefined
    seq++
    snapshot.update((s) => (s.predicting ? { ...s, predicting: false } : s))
  }

  return {
    snapshot,
    request(inputs, worldKey) {
      if (disposed) return
      clearTimeout(timer)
      const mine = ++seq
      timer = setTimeout(() => {
        timer = undefined
        void run(inputs, worldKey, mine)
      }, opts.debounceMs)
    },
    cancel,
    dispose() {
      cancel()
      disposed = true
    },
  }
}

/**
 * One prediction state for every view (orbit overlay, walk HUD, status line).
 * The model's own state comes first: without a model nothing is predicted.
 */
export function predictionStateOf(model: 'loading' | 'ready' | 'error', s: PredictionSnapshot): PredictionState {
  if (model === 'loading') return 'loading'
  if (model === 'error') return 'unavailable'
  if (s.error) return 'failed'
  return s.predicting ? 'predicting' : 'ready'
}
