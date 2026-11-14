/**
 * D10 / D11 contract on the shipped files: versions agree, class order is the
 * pinned one, and the card describes the exact model.json it ships with.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { MODEL_VERSION, SCHEMA_VERSION } from '../src/config.ts'
import { CLASS_DISPLAY_LABELS, CLASS_NAMES } from '../src/data/covertype.ts'
import { MODEL_OUT_DIR } from '../src/data/paths.ts'

const modelPath = join(MODEL_OUT_DIR, 'model.json')
const cardPath = join(MODEL_OUT_DIR, 'model_card.json')
const ready = existsSync(modelPath) && existsSync(cardPath)

/**
 * Pinned class order. Vegetation, tints and the cover map are keyed by these
 * indices (Role 1 D9). Do not edit this list without telling Roles 1 and 2
 * and bumping MODEL_VERSION.
 */
const PINNED_CLASSES = ['Spruce/Fir', 'Lodgepole Pine', 'Ponderosa Pine', 'Cottonwood/Willow', 'Aspen', 'Douglas-fir', 'Krummholz']

test('class order matches the pinned contract', () => {
  assert.deepEqual([...CLASS_NAMES], PINNED_CLASSES)
  assert.equal(CLASS_DISPLAY_LABELS.length, CLASS_NAMES.length)
})

test('model.json and model_card.json carry the same modelVersion and schemaVersion', { skip: !ready && 'run `pnpm ml:train` first' }, () => {
  const modelText = readFileSync(modelPath, 'utf8')
  const model = JSON.parse(modelText)
  const card = JSON.parse(readFileSync(cardPath, 'utf8'))
  assert.equal(model.modelVersion, MODEL_VERSION)
  assert.equal(card.modelVersion, MODEL_VERSION)
  assert.equal(card.model.version, MODEL_VERSION)
  assert.equal(model.schemaVersion, SCHEMA_VERSION)
  assert.equal(card.schemaVersion, SCHEMA_VERSION)
  assert.deepEqual(card.classes, PINNED_CLASSES)
  assert.deepEqual(card.classDisplayLabels, [...CLASS_DISPLAY_LABELS])
  assert.equal(card.versions.modelJsonSha256, createHash('sha256').update(modelText).digest('hex'), 'model_card.json describes a different model.json')
})
