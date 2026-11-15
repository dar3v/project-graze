import assert from 'node:assert/strict'
import { test } from 'node:test'
import { get } from 'svelte/store'

import { terrainVersion, viewMode, worldConfig } from '../src/lib/state/appState.ts'
import { DEFAULT_SETTINGS, loadSettings, parseSettings, resolveReducedMotion, saveSettings, SETTINGS_STORAGE_KEY } from '../src/lib/state/settingsCore.ts'
import { DEFAULT_WORLD, worldKeyOf } from '../src/lib/state/worldConfig.ts'
import { openSavedWorld, restoreTerrain, terrainFor, toSavedWorld } from '../src/lib/state/worldTerrain.ts'
import { fetchWorld, modelMismatchNotice, saveWorld } from '../src/lib/sandbox/worldIo.ts'

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

test('settings (ROLE-1 D14-D16): auto-cycle is on by default; walk settings have safe defaults and ranges', () => {
  assert.equal(DEFAULT_SETTINGS.autoCycle, true, 'day and night run behind every page by default')
  assert.equal(DEFAULT_SETTINGS.animalSpeed, 'match')
  assert.equal(DEFAULT_SETTINGS.lookSensitivity, 1)
  assert.equal(DEFAULT_SETTINGS.invertLookY, false)
  assert.equal(DEFAULT_SETTINGS.fov, 68)

  // Good values are kept.
  const kept = parseSettings({ lookSensitivity: 1.75, invertLookY: true, fov: 90, animalSpeed: 'x4', autoCycle: false })
  assert.deepEqual([kept.lookSensitivity, kept.invertLookY, kept.fov, kept.animalSpeed, kept.autoCycle], [1.75, true, 90, 'x4', false])

  // Out of range, wrong type or unknown: each field falls back on its own.
  const bad = parseSettings({ lookSensitivity: 50, invertLookY: 'yes', fov: 179, animalSpeed: 'warp', quality: 'low' })
  assert.deepEqual(bad, { ...DEFAULT_SETTINGS, quality: 'low' })
  assert.deepEqual(parseSettings({ lookSensitivity: Number.NaN, fov: null, animalSpeed: 3 }), DEFAULT_SETTINGS)

  // Settings saved before these fields existed still load, and get the defaults for the new ones.
  const old = { quality: 'high', timeOfDay: 18, autoCycle: false, overlay: 'terrain', showOod: false, motion: 'reduce' }
  assert.deepEqual(parseSettings(old), { ...DEFAULT_SETTINGS, ...old })
})

test('settings (ROLE-1 D14-D16): the new fields survive empty, corrupt, blocked and full storage', () => {
  const mem = new Map<string, string>()
  const ok = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
  const mine = { ...DEFAULT_SETTINGS, animalSpeed: 'paused' as const, fov: 75, invertLookY: true, lookSensitivity: 0.5 }
  assert.equal(saveSettings(ok, mine), true)
  assert.deepEqual(loadSettings(ok), mine, 'remembered')

  mem.set(SETTINGS_STORAGE_KEY, '{"animalSpeed":')
  assert.deepEqual(loadSettings(ok), DEFAULT_SETTINGS, 'corrupt JSON')
  mem.set(SETTINGS_STORAGE_KEY, '[1,2,3]')
  assert.deepEqual(loadSettings(ok), DEFAULT_SETTINGS, 'valid JSON of the wrong shape')

  const full = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
  mem.clear()
  assert.equal(saveSettings(full, mine), false, 'full storage: not saved, no throw')
  assert.deepEqual(loadSettings(full), DEFAULT_SETTINGS, 'and the app still starts on the defaults')

  const blocked = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('SecurityError')
    },
  }
  assert.deepEqual(loadSettings(blocked), DEFAULT_SETTINGS)
  assert.equal(saveSettings(blocked, mine), false)
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

test('saved worlds: save, restore and open reproduce the edited terrain', () => {
  const cfg = { ...DEFAULT_WORLD, seed: 21 }
  const t = terrainFor(cfg, 0, ELEV)
  t.heightmap[5000] += 40
  t.heightmap[5001] -= 12.3
  const saved = toSavedWorld(t, cfg.waterShare, '0.1.0-dev')
  assert.equal(saved.edits.length, 4)
  assert.deepEqual(saved.options.elevation, ELEV)
  const r = restoreTerrain(saved)
  assert.deepEqual(r.config, cfg)
  assert.deepEqual(r.elevation, ELEV)
  assert.deepEqual(r.base, t.base)
  for (let i = 0; i < r.heightmap.length; i++) assert.ok(Math.abs(r.heightmap[i] - t.heightmap[i]) < 0.06)

  terrainVersion.set(3)
  const opened = openSavedWorld(saved)
  assert.deepEqual(get(worldConfig), cfg, 'the store points at the opened recipe')
  assert.equal(terrainFor(get(worldConfig), 3, ELEV), opened, 'the Sandbox picks up the opened terrain')
  terrainVersion.set(0)
})

test('saved worlds: an opened world keeps its own elevation range through save and reopen', () => {
  // Saved under one model's elevation range, opened while another model is loaded.
  const savedRange = { min: 2000, max: 3600 }
  const cfg = { ...DEFAULT_WORLD, seed: 33 }
  const t = terrainFor(cfg, 0, savedRange)
  for (let i = 6000; i < 6040; i++) t.heightmap[i] += 30
  const saved = toSavedWorld(t, 0.2, '0.1.0')

  const opened = openSavedWorld(saved)
  // The Sandbox asks with the CURRENT model's range: the opened world is kept, not regenerated.
  const seen = terrainFor(get(worldConfig), get(terrainVersion), ELEV)
  assert.equal(seen, opened)
  assert.deepEqual(seen.elevation, savedRange)

  // Saving it again stores the range its base was built in, so reopening gives the same heights.
  const resaved = toSavedWorld(seen, 0.2, '0.2.0')
  assert.deepEqual(resaved.options.elevation, savedRange)
  assert.deepEqual(resaved.edits, saved.edits)
  const again = restoreTerrain(resaved)
  for (let i = 0; i < again.heightmap.length; i++) assert.ok(Math.abs(again.heightmap[i] - t.heightmap[i]) < 0.06)

  // "Reset terrain" makes a fresh terrain in the current range.
  const reset = terrainFor(get(worldConfig), get(terrainVersion) + 1, ELEV)
  assert.notEqual(reset, opened)
  assert.deepEqual(reset.elevation, ELEV)
})

test('app state: a generated terrain follows the requested elevation range', () => {
  const a = terrainFor(DEFAULT_WORLD, 5, { min: 1859, max: 3858 })
  const b = terrainFor(DEFAULT_WORLD, 5, { min: 2000, max: 3600 })
  assert.notEqual(a, b, 'a model with another range regenerates a generated terrain')
  assert.deepEqual(b.elevation, { min: 2000, max: 3600 })
})

test('saved worlds: model version mismatch gives a notice', () => {
  assert.equal(modelMismatchNotice('0.1.0', '0.1.0'), null)
  assert.match(modelMismatchNotice('0.1.0', '0.2.0') ?? '', /predicted again/)
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('saveWorld / fetchWorld never throw and turn failures into messages', async () => {
  const t = terrainFor(DEFAULT_WORLD, 9, ELEV)
  const world = toSavedWorld(t, DEFAULT_WORLD.waterShare, '0.1.0-dev')

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
