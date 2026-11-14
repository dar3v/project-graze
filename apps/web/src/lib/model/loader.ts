/**
 * Loads model_card.json + model.json and builds an Engine. `fetchJson` is
 * injected so the failure paths are unit tested without a network.
 */

import { createEngine, modelPredictor, type Engine } from './engine.ts'
import { parseModelJson } from './inference.ts'
import { parseModelCard, type ModelCard } from './modelCard.ts'
import { MODEL_CARD_JSON, MODEL_JSON } from './config.ts'

export type FetchJson = (url: string) => Promise<unknown>

export type LoadOutcome =
  | { readonly ok: true; readonly engine: Engine; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly message: string }

export class ModelLoadError extends Error {}

export async function fetchJsonOrThrow(url: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, { cache: 'no-cache' })
  } catch {
    throw new ModelLoadError(`Could not reach ${url} (network error).`)
  }
  if (!res.ok) throw new ModelLoadError(`${url} returned HTTP ${res.status}.`)
  try {
    return await res.json()
  } catch {
    throw new ModelLoadError(`${url} is not valid JSON.`)
  }
}

export async function loadCard(fetchJson: FetchJson, baseUrl: string): Promise<{ card: ModelCard; warnings: readonly string[] }> {
  const raw = await fetchJson(baseUrl + MODEL_CARD_JSON)
  const parsed = parseModelCard(raw)
  if (!parsed.ok) throw new ModelLoadError(`model_card.json is invalid: ${parsed.errors.join(' ')}`)
  return { card: parsed.card, warnings: parsed.warnings }
}

async function loadReal(fetchJson: FetchJson, baseUrl: string): Promise<{ engine: Engine; warnings: readonly string[] }> {
  const { card, warnings } = await loadCard(fetchJson, baseUrl)
  const raw = await fetchJson(baseUrl + MODEL_JSON)
  const parsed = parseModelJson(raw, card.classes.length)
  if (!parsed.ok) throw new ModelLoadError(`model.json is invalid: ${parsed.errors.join(' ')}`)
  return { engine: createEngine(card, modelPredictor(parsed.model)), warnings }
}

/** Missing or invalid model files are a visible error; there is no fallback predictor. */
export async function loadEngine(fetchJson: FetchJson, baseUrl: string): Promise<LoadOutcome> {
  try {
    const { engine, warnings } = await loadReal(fetchJson, baseUrl)
    return { ok: true, engine, warnings }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
