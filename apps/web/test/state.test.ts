import assert from 'node:assert/strict'
import { test } from 'node:test'
import { get } from 'svelte/store'

import { installTerrain, terrainFor, viewMode, worldConfig } from '../src/lib/state/appState.ts'
import { DEFAULT_SETTINGS, loadSettings, parseSettings, resolveReducedMotion, saveSettings, SETTINGS_STORAGE_KEY } from '../src/lib/state/settingsCore.ts'
import { DEFAULT_WORLD, worldKeyOf } from '../src/lib/state/worldConfig.ts'
import { buildSavedWorld, fetchWorld, modelMismatchNotice, restoreWorld, saveWorld } from '../src/lib/sandbox/worldIo.ts'

const ELEV = { min: 1859, max: 3858 }

test('settings: junk, partial and missing values fall back field by field', () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(parseSettings({ quality: 'ultra', timeOfDay: 30, autoCycle: 'yes', overlay: 'confidence', motion: 'reduce' }), {
    ...DEFAULT_SETTINGS,
    overlay: 'confidence',
    motion: 'reduce',
  })
})

test('settings: work with empty, throwing or full storage', () => {
  const map = new Map<string, string>()
  const ok = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) }
  assert.deepEqual(loadSettings(ok), DEFAULT_SETTINGS, 'empty storage')
  assert.equal(saveSettings(ok, { ...DEFAULT_SETTINGS, quality: 'low' }), true)
  assert.equal(loadSettings(ok).quality, 'low', 'remembered')

  map.set(SETTINGS_STORAGE_KEY, '{broken')
  assert.deepEqual(loadSettings(ok), DEFAULT_SETTINGS, 'corrupt JSON')

  const blocked = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
  assert.deepEqual(loadSettings(blocked), DEFAULT_SETTINGS)
  assert.equal(saveSettings(blocked, DEFAULT_SETTINGS), false)
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS)
  assert.equal(saveSettings(null, DEFAULT_SETTINGS), false)
})

test('settings: reduced motion follows the system only when set to "system"', () => {
  assert.equal(resolveReducedMotion('system', true), true)
  assert.equal(resolveReducedMotion('system', false), false)
  assert.equal(resolveReducedMotion('full', true), false)
  assert.equal(resolveReducedMotion('reduce', false), true)
})

test('app state: brush edits survive leaving and returning; water share does not regenerate', () => {
  const a = terrainFor(DEFAULT_WORLD, 0, ELEV)
  a.heightmap[100] += 50 // a brush edit
  const again = terrainFor({ ...DEFAULT_WORLD, waterShare: 0.3 }, 0, ELEV)
  assert.equal(again, a, 'same entry: edits kept')
  assert.equal(again.heightmap[100], a.base[100] + 50)

  const reset = terrainFor(DEFAULT_WORLD, 1, ELEV)
  assert.notEqual(reset, a)
  assert.deepEqual(reset.heightmap, reset.base, 'reset drops edits')
  assert.notEqual(worldKeyOf({ ...DEFAULT_WORLD, seed: 8 }), worldKeyOf(DEFAULT_WORLD))
})

test('app state: switching view mode touches nothing else', () => {
  const cfg = get(worldConfig)
  viewMode.set('walk')
  viewMode.set('orbit')
  assert.equal(get(worldConfig), cfg)
})

test('saved worlds: build, restore and install reproduce the edited terrain', () => {
  const t = terrainFor({ ...DEFAULT_WORLD, seed: 21 }, 0, ELEV)
  t.heightmap[5000] += 40
  t.heightmap[5001] -= 12.3
  const saved = buildSavedWorld({ ...DEFAULT_WORLD, seed: 21 }, '0.1.0-dev', ELEV, t.base, t.heightmap)
  assert.equal(saved.edits.length, 4)
  const r = restoreWorld(saved)
  assert.deepEqual(r.config, { ...DEFAULT_WORLD, seed: 21 })
  assert.deepEqual(r.base, t.base)
  for (let i = 0; i < r.heightmap.length; i++) assert.ok(Math.abs(r.heightmap[i] - t.heightmap[i]) < 0.06)

  installTerrain(r.config, 3, ELEV, r.base, r.heightmap)
  assert.equal(terrainFor(r.config, 3, ELEV).heightmap, r.heightmap, 'the Sandbox picks up the loaded terrain')
})

test('saved worlds: model version mismatch gives a notice', () => {
  assert.equal(modelMismatchNotice('0.1.0', '0.1.0'), null)
  assert.match(modelMismatchNotice('0.1.0', '0.2.0') ?? '', /predicted again/)
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('saveWorld / fetchWorld never throw and turn failures into messages', async () => {
  const t = terrainFor(DEFAULT_WORLD, 9, ELEV)
  const world = buildSavedWorld(DEFAULT_WORLD, '0.1.0-dev', ELEV, t.base, t.heightmap)

  const saved = await saveWorld(world, async () => json(201, { id: 'abcdefghij' }), '')
  assert.deepEqual(saved, { ok: true, value: { id: 'abcdefghij' } })

  const offline = await saveWorld(world, async () => {
    throw new TypeError('Failed to fetch')
  })
  assert.equal(offline.ok, false)
  if (!offline.ok) assert.match(offline.message, /could not be reached/)

  const limited = await saveWorld(world, async () => json(429, { error: 'Too many saves.' }))
  assert.deepEqual(limited, { ok: false, message: 'Too many saves.' })

  const invalid = await saveWorld({ ...world, seed: 0.5 }, async () => {
    throw new Error('must not be called')
  })
  assert.equal(invalid.ok, false)

  const got = await fetchWorld('abcdefghij', async () => json(200, { ...world, id: 'abcdefghij', createdAt: '2026-11-15T00:00:00.000Z' }))
  assert.ok(got.ok)
  if (got.ok) assert.equal(got.value.seed, DEFAULT_WORLD.seed)

  const missing = await fetchWorld('abcdefghij', async () => json(404, { error: 'No.' }))
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.match(missing.message, /No saved world/)
  const noApi = await fetchWorld('abcdefghij', async () => new Response('<h1>404</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } }))
  assert.equal(noApi.ok, false)
  if (!noApi.ok) assert.match(noApi.message, /could not be reached/)
  const damaged = await fetchWorld('abcdefghij', async () => json(200, { ...world, edits: 'x' }))
  assert.equal(damaged.ok, false)
  const html = await fetchWorld('abcdefghij', async () => new Response('<html>', { status: 200 }))
  assert.equal(html.ok, false)
})
