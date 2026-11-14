/**
 * `pnpm ml:bench`: measured inference latency (D10). Runs the app's own
 * loader path (parseModelCard + parseModelJson + createEngine) and engine on
 * the shipped files in Node, on the machine named in the output. It does not
 * include a browser fetch, Worker startup or postMessage; see docs/notes.md.
 * Writes ml/reports/latency.json. Numbers are machine-specific: re-run on the
 * machine you want to quote.
 */
import { cpus, platform, release, totalmem } from 'node:os'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { heightmapToInputs, sampleAt, TERRAIN_SAMPLE_DIM } from '../../packages/features/src/index.ts'
import { generateTerrain, GRID } from '../../packages/sim/terrain/src/index.ts'
import { MODEL_OUT_DIR, REPORTS_DIR } from './data/paths.ts'
import { SANDBOX_WORLD, appEngine } from './generatedTerrain.ts'

const RUNS = 200
const WARMUP = 20

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b)
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  return { runs: s.length, medianMs: q(0.5), p95Ms: q(0.95), maxMs: s[s.length - 1] }
}

function time(fn: () => void, runs = RUNS, warmup = WARMUP): number[] {
  for (let i = 0; i < warmup; i++) fn()
  const out: number[] = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    fn()
    out.push(performance.now() - t)
  }
  return out
}

const cardPath = join(MODEL_OUT_DIR, 'model_card.json')
const modelPath = join(MODEL_OUT_DIR, 'model.json')
const load = () => appEngine(JSON.parse(readFileSync(cardPath, 'utf8')), JSON.parse(readFileSync(modelPath, 'utf8')))

// First load in this process, then warm repeats.
const t0 = performance.now()
const engine = load()
const firstLoadMs = performance.now() - t0
const warmLoad = stats(time(load, 50, 5))

const e = engine.card.inputs.find((i) => i.name === 'elevation')!
const terrain = generateTerrain({ ...SANDBOX_WORLD.options, seed: 7, elevation: { min: e.min, max: e.max } })
const inputOpts = { size: terrain.size, cellSizeM: terrain.cellSizeM, waterLevelM: terrain.waterLevelM }
const inputs = heightmapToInputs(terrain.heightmap, inputOpts)
const cells = inputs.packed.length / TERRAIN_SAMPLE_DIM

const features = stats(time(() => heightmapToInputs(terrain.heightmap, inputOpts), 100, 10))
const batch = stats(time(() => engine.predictBatch(inputs.packed.slice())))

// A 16 x 16 dirty region (the fallback in docs/notes.md section 9).
const region = new Float32Array(16 * 16 * TERRAIN_SAMPLE_DIM)
for (let y = 0; y < 16; y++)
  for (let x = 0; x < 16; x++) {
    const src = ((56 + y) * GRID + 56 + x) * TERRAIN_SAMPLE_DIM
    region.set(inputs.packed.subarray(src, src + TERRAIN_SAMPLE_DIM), (y * 16 + x) * TERRAIN_SAMPLE_DIM)
  }
const regionBatch = stats(time(() => engine.predictBatch(region.slice())))

// predictOne: one call is far below timer resolution, so each run times 1000 calls.
const PER_RUN = 1000
const samples = Array.from({ length: PER_RUN }, (_, i) => sampleAt(inputs.packed, (i * 16) % cells))
const oneRuns = time(() => {
  for (const s of samples) engine.predictOne(s)
}, 100, 10).map((ms) => ms / PER_RUN)
const explainRuns = time(() => {
  for (let i = 0; i < 100; i++) engine.explainOne(samples[i])
}, 50, 5).map((ms) => ms / 100)

const cpu = cpus()
const report = {
  generatedBy: 'ml/src/bench.ts',
  measuredAt: new Date().toISOString(),
  modelVersion: (engine.card as { modelVersion?: string }).modelVersion ?? engine.card.model.version,
  modelType: engine.card.model.type,
  machine: {
    cpu: cpu[0]?.model.trim(),
    logicalCores: cpu.length,
    memoryGB: Math.round(totalmem() / 2 ** 30),
    os: `${platform()} ${release()}`,
    runtime: `Node ${process.version}`,
  },
  scope:
    'Node, single thread, app engine code (apps/web/src/lib/model) on the shipped model files. Excludes browser fetch, Worker startup, structured-clone/postMessage and rendering.',
  modelLoad: { firstLoadMs, warm: warmLoad, includes: 'read both files from disk, JSON.parse, parseModelCard, parseModelJson, createEngine' },
  heightmapToInputs: { cells, ...features },
  predictBatchFullGrid: { cells, ...batch },
  predictBatchDirtyRegion16x16: { cells: 256, ...regionBatch },
  predictOne: { ...stats(oneRuns), note: `each run = ${PER_RUN} calls; per-call time` },
  explainOne: { ...stats(explainRuns), note: 'each run = 100 calls; per-call time' },
}
writeFileSync(join(REPORTS_DIR, 'latency.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
