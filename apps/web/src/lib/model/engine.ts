/**
 * Prediction engine used by the Worker: model card + predictor ->
 * predictOne / predictBatch / explainOne. Pure and synchronous so it is unit
 * tested directly (test/engine.test.ts).
 */

import { sampleToVector, type TerrainSample } from '../deps/features.ts'
import { argmax, oodScore, predictProbs, type ModelJson } from './inference.ts'
import { RAW_INPUT_DIM, RAW_INPUT_KEYS, sampleFromBuffer, type RawInputKey } from './inputs.ts'
import type { ModelCard } from './modelCard.ts'
import { formatNumber } from './validation.ts'

export interface Predictor {
  probs(features: readonly number[]): number[]
  /** Larger = more unusual. null when the model ships no detector. */
  oodScore(features: readonly number[]): number | null
  readonly oodThreshold?: number
}

/** Shared contract output, plus plain-language reasons for the OOD flag. */
export interface Prediction {
  readonly classIndex: number
  readonly probs: number[]
  readonly ood: boolean
  readonly oodReasons: string[]
  readonly outOfRange: RawInputKey[]
}

export interface BatchResult {
  readonly classIndex: Uint8Array
  readonly confidence: Float32Array
  readonly ood: Uint8Array
  readonly oodCount: number
  readonly invalidCount: number
}

export interface Sensitivity {
  readonly input: RawInputKey
  readonly label: string
  readonly unit: string
  readonly step: number
  /** Change in every class probability when the input rises by `step`. */
  readonly deltaUp: number[]
  /** Change in every class probability when the input falls by `step`. */
  readonly deltaDown: number[]
}

export interface Explanation {
  readonly prediction: Prediction
  readonly sentence: string
  readonly method: string
  readonly sensitivities: Sensitivity[]
}

export function modelPredictor(m: ModelJson): Predictor {
  return {
    probs: (f) => predictProbs(m, f),
    oodScore: (f) => oodScore(m, f),
    oodThreshold: m.ood?.threshold,
  }
}

/** Fraction of each input's training range used as the sensitivity step. */
export const SENSITIVITY_STEP_FRACTION = 0.1

export interface Engine {
  readonly card: ModelCard
  predictOne(sample: TerrainSample): Prediction
  predictBatch(buf: Float32Array): BatchResult
  explainOne(sample: TerrainSample): Explanation
}

export function createEngine(card: ModelCard, predictor: Predictor): Engine {
  const specs = RAW_INPUT_KEYS.map((k) => {
    const s = card.inputs.find((i) => i.name === k)
    if (!s) throw new Error(`model card has no input "${k}"`)
    return s
  })

  function outOfRange(sample: TerrainSample): RawInputKey[] {
    return RAW_INPUT_KEYS.filter((k, i) => sample[k] < specs[i].min || sample[k] > specs[i].max)
  }

  function predictOne(sample: TerrainSample): Prediction {
    const features = sampleToVector(sample)
    const probs = predictor.probs(features)
    const oor = outOfRange(sample)
    const reasons = oor.map((k) => {
      const s = specs[RAW_INPUT_KEYS.indexOf(k)]
      return `${s.label} (${formatNumber(sample[k])}${s.unit ? ' ' + s.unit : ''}) is outside the range seen in training.`
    })
    const score = predictor.oodScore(features)
    if (score !== null && predictor.oodThreshold !== undefined && score > predictor.oodThreshold) {
      reasons.push('This combination of inputs is unusual compared with the training data, even if each value is in range.')
    }
    return { classIndex: argmax(probs), probs, ood: reasons.length > 0, oodReasons: reasons, outOfRange: oor }
  }

  function predictBatch(buf: Float32Array): BatchResult {
    if (buf.length % RAW_INPUT_DIM !== 0) throw new Error(`Batch length ${buf.length} is not a multiple of ${RAW_INPUT_DIM}.`)
    const n = buf.length / RAW_INPUT_DIM
    const classIndex = new Uint8Array(n)
    const confidence = new Float32Array(n)
    const ood = new Uint8Array(n)
    let oodCount = 0
    let invalidCount = 0
    for (let c = 0; c < n; c++) {
      const sample = sampleFromBuffer(buf, c)
      if (!RAW_INPUT_KEYS.every((k) => Number.isFinite(sample[k]))) {
        invalidCount++
        ood[c] = 1
        oodCount++
        continue
      }
      const features = sampleToVector(sample)
      const probs = predictor.probs(features)
      const k = argmax(probs)
      classIndex[c] = k
      confidence[c] = probs[k]
      let flagged = outOfRange(sample).length > 0
      if (!flagged && predictor.oodThreshold !== undefined) {
        const s = predictor.oodScore(features)
        flagged = s !== null && s > predictor.oodThreshold
      }
      if (flagged) {
        ood[c] = 1
        oodCount++
      }
    }
    return { classIndex, confidence, ood, oodCount, invalidCount }
  }

  function explainOne(sample: TerrainSample): Explanation {
    const prediction = predictOne(sample)
    const base = prediction.probs
    const k = prediction.classIndex
    const sensitivities: Sensitivity[] = RAW_INPUT_KEYS.map((key, i) => {
      const spec = specs[i]
      const step = (spec.max - spec.min) * SENSITIVITY_STEP_FRACTION || 1
      const shift = (d: number): TerrainSample => {
        let v = sample[key] + d
        if (key === 'aspectDegrees') v = ((v % 360) + 360) % 360
        return { ...sample, [key]: v }
      }
      const up = predictor.probs(sampleToVector(shift(step)))
      const down = predictor.probs(sampleToVector(shift(-step)))
      return {
        input: key,
        label: spec.label,
        unit: spec.unit,
        step,
        deltaUp: up.map((p, j) => p - base[j]),
        deltaDown: down.map((p, j) => p - base[j]),
      }
    })
    return {
      prediction,
      sensitivities,
      method:
        `Local sensitivity: each input is moved up and down by ${SENSITIVITY_STEP_FRACTION * 100}% of its training range ` +
        'while the others stay fixed, and the change in each class probability is recorded. It describes the model near this point only, not cause and effect in nature.',
      sentence: explainSentence(card, prediction, sensitivities),
    }
  }

  return { card, predictOne, predictBatch, explainOne }
}

export function explainSentence(card: ModelCard, p: Prediction, sens: readonly Sensitivity[]): string {
  const k = p.classIndex
  const name = card.classes[k] ?? `class ${k}`
  const pct = Math.round(p.probs[k] * 100)
  let strongest: Sensitivity | undefined
  let best = 0
  for (const s of sens) {
    const m = Math.max(Math.abs(s.deltaUp[k]), Math.abs(s.deltaDown[k]))
    if (m > best) {
      best = m
      strongest = s
    }
  }
  const caveat = p.ood ? ', but these inputs are outside what the model was trained on, so treat it as a guess' : ''
  if (!strongest || best < 0.01) {
    return `The model predicts ${name} (${pct}%), and no single input changes that much nearby${caveat}.`
  }
  const up = strongest.deltaUp[k]
  const down = strongest.deltaDown[k]
  const useUp = Math.abs(up) >= Math.abs(down)
  const delta = useUp ? up : down
  const dir = useUp ? 'higher' : 'lower'
  const effect = delta > 0 ? 'more likely' : 'less likely'
  return (
    `The model predicts ${name} (${pct}%); it is most sensitive to ${strongest.label.toLowerCase()}, ` +
    `where a ${dir} value makes ${name} ${effect} (${delta > 0 ? '+' : ''}${Math.round(delta * 100)} points)${caveat}.`
  )
}
