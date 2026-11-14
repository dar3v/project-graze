-- Saved worlds (docs/worlds-api.md). Keep in step with WORLDS_SCHEMA_SQL in src/worlds/db.ts.
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
