import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  computeScore,
  createSim,
  defaultEcology,
  getPositions,
  habitatDiversity,
  populationStability,
  SimInputError,
  stepSim,
  validateRules,
} from '../src/index.ts'
import type { EcologyRules, SimState } from '../src/index.ts'

const W = 32
const H = 32

function rules(): EcologyRules {
  const r = validateRules(defaultEcology, 7)
  if (!r.ok) throw new Error(r.errors.join('; '))
  return r.rules
}

/** Test cover map: vertical stripes of all 7 classes. */
function stripes(): Uint8Array {
  const cover = new Uint8Array(W * H)
  for (let i = 0; i < cover.length; i++) cover[i] = (i % W) % 7
  return cover
}

function snapshot(s: SimState) {
  return {
    tick: s.tick,
    rng: s.rngState,
    herbivores: s.herbivores.map((a) => ({ ...a })),
    predators: s.predators.map((a) => ({ ...a })),
    biomass: Array.from(s.biomass),
    events: s.events.map((e) => ({ ...e })),
    history: s.history.map((h) => ({ ...h })),
  }
}

test('default ecology.json passes validation for 7 classes', () => {
  const r = validateRules(defaultEcology, 7)
  assert.ok(r.ok, r.ok ? '' : r.errors.join('; '))
})

test('validateRules reports bad values instead of throwing', () => {
  const bad = structuredClone(defaultEcology) as Record<string, any>
  bad.herbivore.reproduceChance = 2
  bad.predator.enabled = 'yes'
  bad.vegetation.foodByClass = [1, 2]
  const r = validateRules(bad, 7)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.ok(r.errors.some((e) => e.includes('herbivore.reproduceChance')))
    assert.ok(r.errors.some((e) => e.includes('predator.enabled')))
    assert.ok(r.errors.some((e) => e.includes('foodByClass')))
  }
  assert.equal(validateRules(null).ok, false)
  assert.equal(validateRules('nope').ok, false)
})

test('simulation is deterministic given a seed', () => {
  const a = createSim({ width: W, height: H, cover: stripes(), rules: rules(), seed: 42 })
  const b = createSim({ width: W, height: H, cover: stripes(), rules: rules(), seed: 42 })
  stepSim(a, 150)
  stepSim(b, 150)
  assert.deepEqual(snapshot(a), snapshot(b))

  // Stepping in chunks gives the same result as one long run.
  const c = createSim({ width: W, height: H, cover: stripes(), rules: rules(), seed: 42 })
  for (let i = 0; i < 15; i++) stepSim(c, 10)
  assert.deepEqual(snapshot(a), snapshot(c))
})

test('different seeds give different runs', () => {
  const a = stepSim(createSim({ width: W, height: H, cover: stripes(), rules: rules(), seed: 1 }), 50)
  const b = stepSim(createSim({ width: W, height: H, cover: stripes(), rules: rules(), seed: 2 }), 50)
  assert.notDeepEqual(snapshot(a).herbivores, snapshot(b).herbivores)
})

test('animals stay on the grid and on passable cells', () => {
  const passable = new Uint8Array(W * H).fill(1)
  for (let y = 0; y < H; y++) for (let x = 0; x < 8; x++) passable[y * W + x] = 0 // water strip
  const s = createSim({ width: W, height: H, cover: stripes(), passable, rules: rules(), seed: 7 })
  for (let t = 0; t < 100; t++) {
    stepSim(s)
    for (const a of [...s.herbivores, ...s.predators]) {
      assert.ok(a.x >= 0 && a.x < W && a.y >= 0 && a.y < H)
      assert.equal(passable[a.y * W + a.x], 1, `animal ${a.id} on water at tick ${s.tick}`)
    }
  }
})

test('herbivores starve on a map with no food', () => {
  const r = rules()
  const noFood: EcologyRules = { ...r, vegetation: { ...r.vegetation, foodByClass: [0, 0, 0, 0, 0, 0, 0] } }
  const s = createSim({ width: W, height: H, cover: stripes(), rules: noFood, seed: 3 })
  stepSim(s, Math.ceil(r.herbivore.startEnergy / r.herbivore.metabolismPerTick) + 1)
  assert.equal(s.herbivores.length, 0)
  assert.ok(s.events.some((e) => e.kind === 'starvation' && e.species === 'herbivore'))
  assert.ok(s.events.some((e) => e.kind === 'extinction' && e.species === 'herbivore'))
})

test('predators can be disabled', () => {
  const r = rules()
  const s = createSim({ width: W, height: H, cover: stripes(), rules: { ...r, predator: { ...r.predator, enabled: false } }, seed: 5 })
  stepSim(s, 20)
  assert.equal(s.predators.length, 0)
  assert.equal(computeScore(s).predatorStability, null)
})

test('all-water map releases no animals and does not crash', () => {
  const s = createSim({ width: W, height: H, cover: stripes(), passable: new Uint8Array(W * H), rules: rules(), seed: 9 })
  assert.equal(s.herbivores.length, 0)
  stepSim(s, 10)
  assert.equal(computeScore(s).score, 0)
  assert.ok(s.events[0].message.includes('No habitable land'))
})

test('createSim rejects mismatched inputs with a SimInputError', () => {
  assert.throws(() => createSim({ width: W, height: H, cover: new Uint8Array(10), rules: rules(), seed: 1 }), SimInputError)
  assert.throws(() => createSim({ width: 0, height: H, cover: new Uint8Array(0), rules: rules(), seed: 1 }), SimInputError)
  const badClass = stripes()
  badClass[0] = 9
  assert.throws(() => createSim({ width: W, height: H, cover: badClass, rules: rules(), seed: 1 }), SimInputError)
})

test('event log and history are capped', () => {
  const r = rules()
  const s = createSim({ width: W, height: H, cover: stripes(), rules: { ...r, log: { maxEvents: 5, maxHistory: 10 } }, seed: 11 })
  stepSim(s, 60)
  assert.ok(s.events.length <= 5)
  assert.ok(s.history.length <= 10)
})

test('getPositions packs x,y pairs', () => {
  const s = createSim({ width: W, height: H, cover: stripes(), rules: rules(), seed: 4 })
  const pos = getPositions(s)
  assert.equal(pos.herbivores.length, s.herbivores.length * 2)
  assert.equal(pos.herbivores[0], s.herbivores[0].x)
  assert.equal(pos.herbivores[1], s.herbivores[0].y)
})

test('habitatDiversity is 0 for one class and 1 for an even mix', () => {
  const pass = new Uint8Array(70).fill(1)
  assert.equal(habitatDiversity(new Uint8Array(70), pass, 7), 0)
  const even = new Uint8Array(70).map((_, i) => i % 7)
  assert.ok(Math.abs(habitatDiversity(even, pass, 7) - 1) < 1e-12)
})

test('populationStability rewards steady, present populations', () => {
  assert.equal(populationStability([10, 10, 10, 10]), 1)
  assert.equal(populationStability([10, 10, 10, 0]), 0)
  assert.equal(populationStability([]), 0)
  const swing = populationStability([1, 20, 1, 20])
  assert.ok(swing > 0 && swing < 0.5)
})

test('score is in 0..100 and provisional early on', () => {
  const s = createSim({ width: W, height: H, cover: stripes(), rules: rules(), seed: 21 })
  const early = computeScore(s)
  assert.ok(early.provisional)
  stepSim(s, 120)
  const later = computeScore(s)
  assert.ok(later.score >= 0 && later.score <= 100)
  assert.equal(later.provisional, false)
})
