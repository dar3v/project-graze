import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseModelCard, type ModelCard } from '../src/lib/model/modelCard.ts'
import { emptyForm, parseField, sampleToForm, validateForm, type FormValues } from '../src/lib/model/validation.ts'
import { STUB_CARD } from '../src/lib/model/stub.ts'
import { rawCard, SAMPLE } from './fixtures.ts'

function card(): ModelCard {
  const r = parseModelCard(rawCard())
  if (!r.ok) throw new Error(r.errors.join(' '))
  return r.card
}

const valid = (): FormValues => sampleToForm(SAMPLE)

test('valid form produces a sample with no errors or warnings', () => {
  const r = validateForm(valid(), card())
  assert.deepEqual(r.errors, {})
  assert.deepEqual(r.warnings, {})
  assert.deepEqual(r.sample, SAMPLE)
})

test('missing values are errors', () => {
  const r = validateForm({ ...valid(), slope: '   ' }, card())
  assert.equal(r.sample, undefined)
  assert.equal(r.errors.slope, 'Required.')
  const all = validateForm(emptyForm(), card())
  assert.equal(Object.keys(all.errors).length, 8)
})

test('non-numeric values are errors', () => {
  for (const bad of ['abc', '12abc', '1,000', 'NaN', 'Infinity', '--3', '0x10', '1e999']) {
    const r = validateForm({ ...valid(), elevation: bad }, card())
    assert.ok(r.errors.elevation, `"${bad}" should be rejected`)
    assert.equal(r.sample, undefined)
  }
  for (const ok of ['2750', '2750.5', '-0', '+12', '.5', '3e3']) assert.equal(typeof parseField(ok), 'number', ok)
})

test('values outside the physical range are errors, using hardMin/hardMax from the card', () => {
  const r = validateForm({ ...valid(), slope: '95' }, card())
  assert.match(r.errors.slope ?? '', /between 0 ° and 90 °/)
  const neg = validateForm({ ...valid(), horizontalDistanceToWater: '-5' }, card())
  assert.match(neg.errors.horizontalDistanceToWater ?? '', /at least 0 m/)
})

test('values outside the training range are warnings, not errors', () => {
  const r = validateForm({ ...valid(), elevation: '4000' }, card())
  assert.ok(r.sample, 'prediction should still be allowed')
  assert.match(r.warnings.elevation ?? '', /outside the training data \(2000 m to 3500 m\)/)
})

test('ranges come from the card, not from code', () => {
  const raw = rawCard()
  ;(raw.inputs as any[])[0].max = 5000
  const wide = parseModelCard(raw)
  assert.ok(wide.ok)
  if (wide.ok) assert.equal(validateForm({ ...valid(), elevation: '4000' }, wide.card).warnings.elevation, undefined)
})

test('the stub card is usable by the validator and labeled as a stub', () => {
  assert.equal(STUB_CARD.stub, true)
  assert.ok(STUB_CARD.classes.every((c) => c.startsWith('Stub class')))
  assert.ok(validateForm(valid(), STUB_CARD).sample)
})
