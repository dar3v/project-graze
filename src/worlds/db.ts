/**
 * D1 access for saved worlds. The table is created on first use with the same
 * statement as migrations/0001_create_worlds.sql (a test keeps them equal), so
 * local dev works without applying migrations by hand.
 */
import type { SavedWorld, StoredWorld } from '../../packages/worlds/src/index.ts'

/** Minimal slice of the D1 API this module uses (lets tests pass a SQLite-backed fake). */
export interface WorldsDb {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>
      first<T = Record<string, unknown>>(): Promise<T | null>
    }
  }
  exec(sql: string): Promise<unknown>
}

export const WORLDS_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);`

const ready = new WeakMap<object, Promise<unknown>>()

function ensureSchema(db: WorldsDb): Promise<unknown> {
  let p = ready.get(db)
  if (!p) {
    // D1's exec() takes one statement per line, so collapse the statement.
    p = db.exec(WORLDS_SCHEMA_SQL.replace(/\s*\n\s*/g, ' '))
    p.catch(() => ready.delete(db))
    ready.set(db, p)
  }
  return p
}

export async function insertWorld(db: WorldsDb, id: string, world: SavedWorld, createdAt: string): Promise<void> {
  await ensureSchema(db)
  await db
    .prepare('INSERT INTO worlds (id, schema_version, model_version, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, world.schemaVersion, world.modelVersion, JSON.stringify(world), createdAt)
    .run()
}

export async function findWorld(db: WorldsDb, id: string): Promise<StoredWorld | null> {
  await ensureSchema(db)
  const row = await db.prepare('SELECT data, created_at FROM worlds WHERE id = ?').bind(id).first<{ data: string; created_at: string }>()
  if (!row) return null
  return { ...(JSON.parse(row.data) as SavedWorld), id, createdAt: row.created_at }
}
