/**
 * Site Probe form validation. Ranges come only from model_card.json.
 *
 * - missing / non-numeric      -> error (blocks prediction)
 * - outside hardMin..hardMax   -> error (physically invalid, blocks prediction)
 * - outside min..max (training)-> warning (prediction runs, flagged as extrapolation)
 */

import type { TerrainSample } from '../deps/features.ts'
import type { ModelCard } from './modelCard.ts'
import { inputSpec } from './modelCard.ts'
import { RAW_INPUT_KEYS, type RawInputKey } from './inputs.ts'

export type FormValues = Readonly<Record<RawInputKey, string>>

export interface ValidationResult {
  /** Present only when there are no errors. */
  readonly sample?: TerrainSample
  readonly errors: Partial<Record<RawInputKey, string>>
  readonly warnings: Partial<Record<RawInputKey, string>>
}

const NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)))
}

function withUnit(n: number, unit: string): string {
  return unit ? `${formatNumber(n)} ${unit}` : formatNumber(n)
}

/** Parse one field. Returns a number or an error message. */
export function parseField(raw: string): number | string {
  const s = raw.trim()
  if (s === '') return 'Required.'
  if (!NUMERIC.test(s)) return 'Must be a number (for example 2750 or 12.5).'
  const n = Number(s)
  if (!Number.isFinite(n)) return 'Must be a finite number.'
  return n
}

export function validateForm(values: FormValues, card: ModelCard): ValidationResult {
  const errors: Partial<Record<RawInputKey, string>> = {}
  const warnings: Partial<Record<RawInputKey, string>> = {}
  const parsed: Partial<Record<RawInputKey, number>> = {}

  for (const key of RAW_INPUT_KEYS) {
    const spec = inputSpec(card, key)
    const result = parseField(values[key] ?? '')
    if (typeof result === 'string') {
      errors[key] = result
      continue
    }
    const lo = spec.hardMin
    const hi = spec.hardMax
    if ((lo !== undefined && result < lo) || (hi !== undefined && result > hi)) {
      const range =
        lo !== undefined && hi !== undefined
          ? `between ${withUnit(lo, spec.unit)} and ${withUnit(hi, spec.unit)}`
          : lo !== undefined
            ? `at least ${withUnit(lo, spec.unit)}`
            : `at most ${withUnit(hi as number, spec.unit)}`
      errors[key] = `${spec.label} must be ${range}.`
      continue
    }
    if (result < spec.min || result > spec.max) {
      warnings[key] =
        `${withUnit(result, spec.unit)} is outside the training data (${withUnit(spec.min, spec.unit)} to ${withUnit(spec.max, spec.unit)}). ` +
        'The model never saw values like this, so treat the prediction as a guess.'
    }
    parsed[key] = result
  }

  if (Object.keys(errors).length > 0) return { errors, warnings }
  return { sample: parsed as TerrainSample, errors, warnings }
}

/** Prefill strings for the form from a terrain cell. */
export function sampleToForm(sample: TerrainSample): FormValues {
  const out = {} as Record<RawInputKey, string>
  for (const key of RAW_INPUT_KEYS) out[key] = formatNumber(Math.round(sample[key] * 100) / 100)
  return out
}

export function emptyForm(): FormValues {
  const out = {} as Record<RawInputKey, string>
  for (const key of RAW_INPUT_KEYS) out[key] = ''
  return out
}
