/**
 * model_card.json schema (proposal, see docs/feature-contract.md) and a
 * tolerant runtime parser. Everything the app shows about the model — class
 * names, input ranges, metrics — comes from this file. Nothing is hard-coded.
 *
 * Required sections (the app cannot work without them): model, classes,
 * features, inputs. Every other section is optional; when one is missing or
 * malformed the Model Report says so instead of crashing.
 */

import { FEATURE_NAMES } from '../deps/features.ts'
import { RAW_INPUT_KEYS, type RawInputKey } from './inputs.ts'

export interface CardInput {
  readonly name: RawInputKey
  readonly label: string
  readonly unit: string
  /** Training-data range. Outside it -> plain-language warning (still predicts). */
  readonly min: number
  readonly max: number
  /** Physically valid range. Outside it -> validation error (no prediction). */
  readonly hardMin?: number
  readonly hardMax?: number
  readonly description?: string
}

export interface PerClassMetrics {
  readonly precision: number
  readonly recall: number
  readonly f1: number
  readonly support: number
}

export interface Evaluation {
  readonly name: string
  readonly split: string
  readonly accuracy?: number
  readonly macroF1: number
  /** Rows = true class, columns = predicted class, in `classes` order. */
  readonly confusionMatrix?: readonly (readonly number[])[]
  readonly perClass?: readonly PerClassMetrics[]
}

export interface ModelCard {
  readonly schemaVersion: number
  readonly stub?: boolean
  readonly model: {
    readonly name: string
    readonly type: string
    readonly version: string
    readonly trainedAt?: string
    readonly seed?: number
    readonly selectionRule?: string
  }
  readonly classes: readonly string[]
  readonly features: readonly string[]
  readonly inputs: readonly CardInput[]
  readonly dataset?: {
    readonly name: string
    readonly citation?: string
    readonly license?: string
    readonly url?: string
    readonly instances?: number
    readonly region?: string
    readonly featuresUsed?: readonly string[]
    readonly featuresExcluded?: readonly string[]
    readonly classCounts?: readonly number[]
    readonly preparation?: readonly string[]
  }
  readonly split?: {
    readonly strategy: string
    readonly description?: string
    readonly details?: readonly string[]
  }
  readonly baselines?: readonly {
    readonly name: string
    readonly accuracy?: number
    readonly macroF1: number
    readonly selected?: boolean
    readonly notes?: string
  }[]
  readonly evaluations?: readonly Evaluation[]
  readonly calibration?: {
    readonly method?: string
    readonly ece?: number
    readonly bins: readonly {
      readonly lower: number
      readonly upper: number
      readonly confidence: number
      readonly accuracy: number
      readonly count: number
    }[]
  }
  readonly ablations?: readonly {
    readonly name: string
    readonly description?: string
    readonly macroF1: number
    readonly referenceMacroF1?: number
  }[]
  readonly featureImportance?: {
    readonly method: string
    readonly values: readonly { readonly feature: string; readonly importance: number }[]
  }
  readonly ood?: {
    readonly method: string
    readonly description: string
    readonly threshold?: number
    readonly flaggedRate?: number
  }
  readonly limitations?: readonly string[]
}

export type CardResult =
  | { readonly ok: true; readonly card: ModelCard; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNumArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isNum)
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)

const OPTIONAL_CHECKS: Record<string, (v: unknown, classCount: number) => boolean> = {
  dataset: (v) => isObj(v) && isStr(v.name),
  split: (v) => isObj(v) && isStr(v.strategy),
  baselines: (v) => Array.isArray(v) && v.every((b) => isObj(b) && isStr(b.name) && isNum(b.macroF1)),
  evaluations: (v, k) =>
    Array.isArray(v) &&
    v.every(
      (e) =>
        isObj(e) &&
        isStr(e.name) &&
        isStr(e.split) &&
        isNum(e.macroF1) &&
        (e.confusionMatrix === undefined ||
          (Array.isArray(e.confusionMatrix) && e.confusionMatrix.length === k && e.confusionMatrix.every((r) => isNumArray(r) && r.length === k))) &&
        (e.perClass === undefined ||
          (Array.isArray(e.perClass) &&
            e.perClass.length === k &&
            e.perClass.every((p) => isObj(p) && isNum(p.precision) && isNum(p.recall) && isNum(p.f1) && isNum(p.support)))),
    ),
  calibration: (v) =>
    isObj(v) &&
    Array.isArray(v.bins) &&
    v.bins.every((b) => isObj(b) && isNum(b.lower) && isNum(b.upper) && isNum(b.confidence) && isNum(b.accuracy) && isNum(b.count)),
  ablations: (v) => Array.isArray(v) && v.every((a) => isObj(a) && isStr(a.name) && isNum(a.macroF1)),
  featureImportance: (v) =>
    isObj(v) && isStr(v.method) && Array.isArray(v.values) && v.values.every((x) => isObj(x) && isStr(x.feature) && isNum(x.importance)),
  ood: (v) => isObj(v) && isStr(v.method) && isStr(v.description),
  limitations: (v) => isStrArray(v),
}

export function parseModelCard(raw: unknown): CardResult {
  const errors: string[] = []
  if (!isObj(raw)) return { ok: false, errors: ['model_card.json is not a JSON object.'] }

  if (!isNum(raw.schemaVersion)) errors.push('schemaVersion must be a number.')
  const m = raw.model
  if (!isObj(m) || !isStr(m.name) || !isStr(m.type) || !isStr(m.version)) {
    errors.push('model must have name, type and version strings.')
  }

  if (!isStrArray(raw.classes) || raw.classes.length < 2) errors.push('classes must list at least two class names.')

  if (!isStrArray(raw.features)) errors.push('features must be an array of feature names.')
  else if (raw.features.join(',') !== FEATURE_NAMES.join(',')) {
    errors.push(
      `features [${raw.features.join(', ')}] do not match the shared contract [${FEATURE_NAMES.join(', ')}]. ` +
        'The model was trained with a different feature order; refusing to use it.',
    )
  }

  if (!Array.isArray(raw.inputs)) errors.push('inputs must be an array of input ranges.')
  else {
    const seen = new Set<string>()
    raw.inputs.forEach((inp, i) => {
      if (!isObj(inp) || !isStr(inp.name)) {
        errors.push(`inputs[${i}] needs a name.`)
        return
      }
      const where = `inputs "${inp.name}"`
      if (!(RAW_INPUT_KEYS as readonly string[]).includes(inp.name)) errors.push(`${where} is not a known input.`)
      seen.add(inp.name)
      if (!isStr(inp.label)) errors.push(`${where} needs a label.`)
      if (typeof inp.unit !== 'string') errors.push(`${where} needs a unit (use "" for none).`)
      if (!isNum(inp.min) || !isNum(inp.max) || inp.min > inp.max) errors.push(`${where} needs numeric min <= max.`)
      if (inp.hardMin !== undefined && !isNum(inp.hardMin)) errors.push(`${where} hardMin must be a number.`)
      if (inp.hardMax !== undefined && !isNum(inp.hardMax)) errors.push(`${where} hardMax must be a number.`)
    })
    for (const k of RAW_INPUT_KEYS) if (!seen.has(k)) errors.push(`inputs is missing a range for "${k}".`)
  }

  if (errors.length > 0) return { ok: false, errors }

  const classCount = (raw.classes as string[]).length
  const warnings: string[] = []
  const card: Obj = { ...raw }
  for (const [key, check] of Object.entries(OPTIONAL_CHECKS)) {
    if (card[key] === undefined) continue
    if (!check(card[key], classCount)) {
      warnings.push(`Section "${key}" in model_card.json is malformed and was ignored.`)
      delete card[key]
    }
  }
  return { ok: true, card: card as unknown as ModelCard, warnings }
}

export function inputSpec(card: ModelCard, key: RawInputKey): CardInput {
  const spec = card.inputs.find((i) => i.name === key)
  // parseModelCard guarantees every key is present.
  if (!spec) throw new Error(`model card has no input "${key}"`)
  return spec
}
