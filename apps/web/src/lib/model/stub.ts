/**
 * ============================  STUB  ============================
 * FAKE predictions used only until Role 3 exports model.json and
 * model_card.json. Must be removed before Day 12 (set
 * ALLOW_STUB_MODEL = false in config.ts, then delete this file).
 *
 * - Class names are "Stub class N", never real cover types.
 * - Input ranges below are rough placeholders, labeled as such,
 *   not dataset statistics.
 * - The UI shows a "STUB: fake predictions" banner whenever this is used.
 * ================================================================
 */

import type { ModelCard } from './modelCard.ts'
import { softmax } from './inference.ts'
import type { Predictor } from './engine.ts'

const STUB_CLASS_COUNT = 7

export const STUB_CARD: ModelCard = {
  schemaVersion: 1,
  stub: true,
  model: { name: 'STUB (fake predictions)', type: 'stub', version: '0.0.0-stub' },
  classes: Array.from({ length: STUB_CLASS_COUNT }, (_, i) => `Stub class ${i + 1}`),
  features: [
    'elevation',
    'slope',
    'aspectSin',
    'aspectCos',
    'hillshade9am',
    'hillshadeNoon',
    'hillshade3pm',
    'horizontalDistanceToWater',
    'verticalDistanceToWater',
  ],
  // PLACEHOLDER ranges for the stub only. The real ranges come from model_card.json.
  inputs: [
    { name: 'elevation', label: 'Elevation', unit: 'm', min: 1800, max: 3900, hardMin: 0, hardMax: 9000 },
    { name: 'slope', label: 'Slope', unit: '°', min: 0, max: 66, hardMin: 0, hardMax: 90 },
    { name: 'aspectDegrees', label: 'Aspect', unit: '°', min: 0, max: 360, hardMin: 0, hardMax: 360 },
    { name: 'hillshade9am', label: 'Hillshade 9am', unit: '', min: 0, max: 255, hardMin: 0, hardMax: 255 },
    { name: 'hillshadeNoon', label: 'Hillshade noon', unit: '', min: 0, max: 255, hardMin: 0, hardMax: 255 },
    { name: 'hillshade3pm', label: 'Hillshade 3pm', unit: '', min: 0, max: 255, hardMin: 0, hardMax: 255 },
    { name: 'horizontalDistanceToWater', label: 'Horizontal distance to water', unit: 'm', min: 0, max: 1400, hardMin: 0 },
    { name: 'verticalDistanceToWater', label: 'Vertical distance to water', unit: 'm', min: -175, max: 600 },
  ],
}

/** Deterministic nonsense: soft elevation bands plus a nudge from water distance. */
export const STUB_PREDICTOR: Predictor = {
  stub: true,
  probs(features) {
    const elevation = features[0]
    const water = features[7]
    const t = Math.min(1, Math.max(0, (elevation - 1800) / 2100))
    const logits = Array.from({ length: STUB_CLASS_COUNT }, (_, k) => {
      const center = (k + 0.5) / STUB_CLASS_COUNT
      return -((t - center) ** 2) / 0.01 + (k === 3 ? Math.max(0, 1 - water / 150) * 3 : 0)
    })
    return softmax(logits)
  },
  oodScore: () => null,
}
