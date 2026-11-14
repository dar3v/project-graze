import { bindings, defineConfig } from 'cf/config'
import * as entrypoint from './src/index.ts' with { type: 'cf-worker' }

export default defineConfig({
  worker: {
    name: 'project-graze',
    compatibilityDate: '2026-11-10',
    entrypoint,
    env: {
      // Saved worlds (docs/worlds-api.md). Local dev uses a local database;
      // no ID is needed until someone deploys it.
      DB: bindings.d1(),
      // Workers Rate Limiting binding. Approximate and per Cloudflare location
      // (see docs/worlds-api.md, "Rate limiting"). Applied to saves only.
      WORLDS_RATE_LIMIT: bindings.rateLimit({ namespace: '1001', simple: { limit: 10, period: 60 } }),
    }
  }
})
