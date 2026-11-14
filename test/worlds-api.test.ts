import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import app from '../src/index.ts'
import { WORLDS_SCHEMA_SQL } from '../src/worlds/db.ts'
import { MAX_WORLD_BYTES, WORLD_ID_PATTERN, WORLD_SCHEMA_VERSION, type SavedWorld } from '../packages/worlds/src/index.ts'
import { fakeD1 } from './fakeD1.ts'

const world = (over: Partial<SavedWorld> = {}): SavedWorld => ({
  schemaVersion: WORLD_SCHEMA_VERSION,
  modelVersion: '0.1.0-dev',
  seed: 7,
  size: 128,
  options: { center: 0.4, relief: 0.2, roughness: 0.5, valley: 0.35, waterShare: 0.12, elevation: { min: 1859, max: 3858 } },
  edits: [130, 25, 1, -12, 400, 3],
  ...over,
})

function env(limit = Infinity) {
  let calls = 0
  return {
    DB: fakeD1(),
    WORLDS_RATE_LIMIT: { limit: async () => ({ success: ++calls <= limit }) },
  }
}

// The fake bindings implement only what the API uses.
const request = (e: ReturnType<typeof env>, path: string, init?: RequestInit) => app.request(path, init, e as never)

const post = (e: ReturnType<typeof env>, body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  request(e, '/api/worlds', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })

test('save then load round-trips the world', async () => {
  const e = env()
  const res = await post(e, world())
  assert.equal(res.status, 201)
  const { id, createdAt } = (await res.json()) as { id: string; createdAt: string }
  assert.match(id, WORLD_ID_PATTERN)
  assert.ok(!Number.isNaN(Date.parse(createdAt)))

  const got = await request(e, `/api/worlds/${id}`)
  assert.equal(got.status, 200)
  assert.deepEqual(await got.json(), { ...world(), id, createdAt })

  // Only the five schema columns are stored: no IP, no user agent.
  const cols = e.DB.sqlite.prepare('PRAGMA table_info(worlds)').all().map((r) => (r as { name: string }).name)
  assert.deepEqual(cols, ['id', 'schema_version', 'model_version', 'data', 'created_at'])
})

test('bad payloads are rejected with a friendly 4xx and nothing is stored', async () => {
  const e = env()
  const cases: [unknown, number][] = [
    ['{not json', 400],
    [[1, 2], 400],
    [world({ seed: 1.5 }), 400],
    [world({ modelVersion: '<script>' }), 400],
    [{ ...world(), name: 'my world' }, 400],
    [world({ edits: [0, 0] }), 400],
    [world({ edits: [5, 1, 0, 1] }), 400],
    [world({ edits: [16384, 1] }), 400],
    [world({ schemaVersion: 99 as 1 }), 400],
    [world({ options: { ...world().options, waterShare: 3 } }), 400],
  ]
  for (const [body, status] of cases) {
    const res = await post(e, body)
    assert.equal(res.status, status, JSON.stringify(body).slice(0, 80))
    const j = (await res.json()) as { error: string }
    assert.equal(typeof j.error, 'string')
  }
  const wrongType = await post(e, world(), { 'Content-Type': 'text/plain' })
  assert.equal(wrongType.status, 415)
  const table = e.DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'worlds'").get()
  if (table) assert.equal((e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM worlds').get() as { n: number }).n, 0)
})

test('oversized payloads get 413', async () => {
  const e = env()
  const big = JSON.stringify(world()) + ' '.repeat(MAX_WORLD_BYTES)
  const res = await post(e, big)
  assert.equal(res.status, 413)
  assert.match(((await res.json()) as { error: string }).error, /too large/)
})

test('saves are rate limited', async () => {
  const e = env(2)
  assert.equal((await post(e, world())).status, 201)
  assert.equal((await post(e, world())).status, 201)
  const res = await post(e, world())
  assert.equal(res.status, 429)
})

test('loading checks the id and reports a missing world', async () => {
  const e = env()
  assert.equal((await request(e, '/api/worlds/NOT-AN-ID')).status, 400)
  assert.equal((await request(e, '/api/worlds/abcdefghij')).status, 404)
  assert.equal((await request(e, '/api/nothing')).status, 404)
})

test('CORS lets the static app call the API from another origin', async () => {
  const res = await request(env(), '/api/worlds', { method: 'OPTIONS', headers: { Origin: 'https://example.org', 'Access-Control-Request-Method': 'POST' } })
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
})

test('the migration and the on-first-use schema are the same statement', () => {
  const sql = readFileSync(new URL('../migrations/0001_create_worlds.sql', import.meta.url).pathname, 'utf8')
  const strip = (s: string) => s.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()
  assert.equal(strip(sql), strip(WORLDS_SCHEMA_SQL))
})
