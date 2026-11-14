import assert from 'node:assert/strict'
import { test } from 'node:test'
import { get } from 'svelte/store'

import { heightmapToInputs } from '../src/lib/deps/features.ts'
import { createEngine, modelPredictor, type BatchResult } from '../src/lib/model/engine.ts'
import { parseModelJson } from '../src/lib/model/inference.ts'
import { parseModelCard } from '../src/lib/model/modelCard.ts'
import { createPredictionSession, predictionStateOf, type PredictBatch } from '../src/lib/model/predictionSession.ts'
import { generateTerrain } from '../src/lib/world/terrain.ts'
import { rawCard, rawSoftmaxModel } from './fixtures.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Terrain inputs for a small generated map. */
function inputs(seed: number, waterShift = 0) {
  const t = generateTerrain({ seed, size: 24 })
  return heightmapToInputs(t.heightmap, { size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM + waterShift })
}

/** A fake batch: class = round(first packed value) % 3, so results are traceable to their inputs. */
function fakeResult(buf: Float32Array, n: number): BatchResult {
  const classIndex = new Uint8Array(n).fill(Math.round(buf[0]) % 3)
  return { classIndex, confidence: new Float32Array(n).fill(0.5), ood: new Uint8Array(n), oodCount: 0, invalidCount: 0 }
}

/** The in-process adapter: the real engine with the test fixture model. */
function engineAdapter(): PredictBatch {
  const c = parseModelCard(rawCard())
  const m = parseModelJson(rawSoftmaxModel(), 3)
  if (!c.ok || !m.ok) throw new Error('fixtures')
  const engine = createEngine(c.card, modelPredictor(m.model))
  return async (buf) => engine.predictBatch(buf)
}

test('prediction session: a burst of requests is predicted once, with the last inputs', async () => {
  const seen: Float32Array[] = []
  const session = createPredictionSession(
    async (buf) => {
      seen.push(buf)
      return fakeResult(buf, buf.length / 8)
    },
    { debounceMs: 10 },
  )
  const a = inputs(1)
  const b = inputs(2)
  const c = inputs(3)
  session.request(a, 'k1')
  session.request(b, 'k2')
  session.request(c, 'k3')
  assert.equal(get(session.snapshot).predicting, false, 'not "predicting" while the debounce waits')
  await sleep(40)
  assert.equal(seen.length, 1)
  assert.deepEqual(seen[0], c.packed)
  const map = get(session.snapshot).map
  assert.ok(map)
  assert.equal(map.inputs, c, 'the map carries the inputs it was predicted from')
  assert.equal(map.worldKey, 'k3')
  assert.equal(map.version, 1)
  session.dispose()
})

test('prediction session: a slow, older batch never replaces a newer map', async () => {
  const delays = [60, 5]
  const session = createPredictionSession(
    async (buf) => {
      await sleep(delays.shift() ?? 0)
      return fakeResult(buf, buf.length / 8)
    },
    { debounceMs: 0 },
  )
  const older = inputs(4)
  const newer = inputs(5, 30)
  session.request(older, 'old')
  await sleep(10) // the older batch is now running
  assert.equal(get(session.snapshot).predicting, true)
  session.request(newer, 'new')
  await sleep(100)
  const s = get(session.snapshot)
  assert.equal(s.predicting, false)
  assert.equal(s.map?.worldKey, 'new')
  assert.equal(s.map?.inputs, newer)
  assert.equal(s.map?.version, 1, 'only one map was published')
  session.dispose()
})

test('prediction session: cover and water are published together, from the same inputs', async () => {
  const session = createPredictionSession(engineAdapter(), { debounceMs: 0 })
  const dry = inputs(6, -1000)
  const wet = inputs(6, 40)
  assert.ok(wet.water.some((w) => w === 1) && !dry.water.some((w) => w === 1))
  session.request(dry, 'k')
  await sleep(20)
  // The water rises; until the new map arrives, readers keep the old cover AND the old water.
  session.request(wet, 'k')
  const between = get(session.snapshot).map
  assert.equal(between?.inputs.water, dry.water)
  await sleep(20)
  const after = get(session.snapshot).map
  assert.ok(after)
  assert.equal(after.inputs.water, wet.water)
  assert.equal(after.cover.length, wet.water.length)
  assert.equal(after.version, 2)
  session.dispose()
})

test('prediction session: the caller keeps its inputs even when the adapter transfers the buffer', async () => {
  const session = createPredictionSession(
    async (buf) => {
      const n = buf.length / 8
      structuredClone(buf, { transfer: [buf.buffer] }) // what postMessage does: `buf` is detached
      assert.equal(buf.length, 0)
      return fakeResult(new Float32Array(1), n)
    },
    { debounceMs: 0 },
  )
  const a = inputs(7)
  const before = a.packed.length
  session.request(a, 'k')
  await sleep(20)
  assert.equal(a.packed.length, before, 'the session copied before handing the buffer over')
  assert.ok(get(session.snapshot).map)
  session.dispose()
})

test('prediction session: a failure keeps the last map and is cleared by the next batch', async () => {
  let fail = false
  const session = createPredictionSession(
    async (buf) => {
      if (fail) throw new Error('worker crashed')
      return fakeResult(buf, buf.length / 8)
    },
    { debounceMs: 0 },
  )
  session.request(inputs(8), 'k')
  await sleep(20)
  fail = true
  session.request(inputs(9), 'k')
  await sleep(20)
  let s = get(session.snapshot)
  assert.equal(s.error, 'worker crashed')
  assert.equal(s.predicting, false)
  assert.equal(s.map?.version, 1, 'the last good map stays')
  assert.equal(predictionStateOf('ready', s), 'failed')
  fail = false
  session.request(inputs(10), 'k')
  await sleep(20)
  s = get(session.snapshot)
  assert.equal(s.error, null)
  assert.equal(s.map?.version, 2)
  session.dispose()
})

test('prediction session: cancel and dispose drop waiting and running batches', async () => {
  let calls = 0
  const session = createPredictionSession(
    async (buf) => {
      calls++
      await sleep(20)
      return fakeResult(buf, buf.length / 8)
    },
    { debounceMs: 10 },
  )
  session.request(inputs(11), 'k')
  session.cancel()
  await sleep(40)
  assert.equal(calls, 0, 'a waiting request is dropped')

  session.request(inputs(12), 'k')
  await sleep(15) // running now
  session.dispose()
  await sleep(40)
  assert.equal(get(session.snapshot).map, null, 'a running batch is ignored after dispose')
  assert.equal(get(session.snapshot).predicting, false)
  session.request(inputs(13), 'k')
  await sleep(40)
  assert.equal(calls, 1, 'nothing is predicted after dispose')
})

test('prediction state: the model state comes first, then failure, then the batch', () => {
  const idle = { map: null, predicting: false, error: null }
  assert.equal(predictionStateOf('loading', { ...idle, error: 'x' }), 'loading')
  assert.equal(predictionStateOf('error', { ...idle, predicting: true }), 'unavailable')
  assert.equal(predictionStateOf('ready', { ...idle, error: 'x', predicting: true }), 'failed')
  assert.equal(predictionStateOf('ready', { ...idle, predicting: true }), 'predicting')
  assert.equal(predictionStateOf('ready', idle), 'ready')
})
