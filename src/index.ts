import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'

import { MAX_WORLD_BYTES, newWorldId, validateWorld, WORLD_ID_PATTERN } from '../packages/worlds/src/index.ts'
import { findWorld, insertWorld } from './worlds/db.ts'

// Bindings come from cloudflare.config.ts (generated `Env`). Tests pass a
// SQLite-backed fake for DB that implements the `WorldsDb` slice.
const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => c.text('Graze API. See docs/worlds-api.md.'))

// The static app may be served from another origin (Cloudflare Pages). No
// cookies or credentials are used, so any origin may call the API.
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 86400 }))

const fail = (message: string, details: readonly string[] = []) => ({ error: message, details })

app.post(
  '/api/worlds',
  bodyLimit({
    maxSize: MAX_WORLD_BYTES,
    onError: (c) => c.json(fail(`This world is too large to save (over ${MAX_WORLD_BYTES / 1000} kB). Reset part of the terrain and try again.`), 413),
  }),
  async (c) => {
    const limiter = c.env.WORLDS_RATE_LIMIT
    if (limiter) {
      // The client address is used only as the rate-limit key; it is not stored.
      const key = `save:${c.req.header('cf-connecting-ip') ?? 'unknown'}`
      const { success } = await limiter.limit({ key })
      if (!success) return c.json(fail('Too many saves in a short time. Wait a minute and try again.'), 429)
    }
    if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return c.json(fail('Send the world as JSON (Content-Type: application/json).'), 415)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(fail('The request body is not valid JSON.'), 400)
    }
    const result = validateWorld(body)
    if (!result.ok) return c.json(fail('This is not a valid saved world.', result.errors), 400)

    const id = newWorldId()
    const createdAt = new Date().toISOString()
    await insertWorld(c.env.DB, id, result.world, createdAt)
    return c.json({ id, createdAt }, 201)
  },
)

app.get('/api/worlds/:id', async (c) => {
  const id = c.req.param('id')
  if (!WORLD_ID_PATTERN.test(id)) return c.json(fail('That is not a world id.'), 400)
  const world = await findWorld(c.env.DB, id)
  if (!world) return c.json(fail('No saved world has that id.'), 404)
  return c.json(world, 200, { 'Cache-Control': 'public, max-age=3600' })
})

// Hono 5: fallback handlers are middleware; the caught error is `c.error`.
app.notFound('/api/*', (c) => c.json(fail('Not found.'), 404))

app.onError('/api/*', (c) => {
  console.error('worlds API error', c.error)
  return c.json(fail('The server could not complete the request. Try again later.'), 500)
})

export default app
