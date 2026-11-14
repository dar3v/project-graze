/** In-memory SQLite stand-in for the slice of D1 the worlds API uses (tests only). */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

export function fakeD1() {
  const db = new DatabaseSync(':memory:')
  return {
    sqlite: db,
    async exec(sql: string) {
      db.exec(sql)
      return {}
    },
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const v = values as SQLInputValue[]
          return {
            async run() {
              return db.prepare(sql).run(...v)
            },
            async first<T>() {
              return (db.prepare(sql).get(...v) as T | undefined) ?? null
            },
          }
        },
      }
    },
  }
}
