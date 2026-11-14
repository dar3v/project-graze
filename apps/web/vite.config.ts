import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

// Static SPA build for Cloudflare Pages. Run from the repo root:
//   pnpm web:dev | pnpm web:build | pnpm web:preview
export default defineConfig({
  root: here,
  base: './',
  plugins: [svelte()],
  worker: { format: 'es' },
  server: { fs: { allow: [repoRoot] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
