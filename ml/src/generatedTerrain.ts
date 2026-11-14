/**
 * Generated-terrain study (D6, D12). Builds worlds with Role 1's generator
 * (packages/sim/terrain `generateTerrain`, the one the app runs), turns them
 * into model inputs with @graze/features `heightmapToInputs` (the app's
 * function), and predicts them with the APP engine
 * (apps/web/src/lib/model/engine.ts). The flag rates are therefore the rates
 * the overlay and walk mode show, not a training-side approximation.
 *
 * Water cells are excluded: the app predicts them but nothing grows there.
 */
import { heightmapToInputs, heightmapToSamples, sampleAt, type TerrainInputs, type TerrainSample } from '../../packages/features/src/index.ts'
import { generateTerrain, type TerrainOptions } from '../../packages/sim/terrain/src/index.ts'
import { createEngine, modelPredictor, type Engine } from '../../apps/web/src/lib/model/engine.ts'
import { parseModelJson } from '../../apps/web/src/lib/model/inference.ts'
import { parseModelCard } from '../../apps/web/src/lib/model/modelCard.ts'

export const GENERATED_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => i + 1)

export interface WorldConfig {
  readonly name: string
  readonly description: string
  /** Generator options other than seed and elevation (elevation = the model's training range). */
  readonly options: Omit<TerrainOptions, 'seed' | 'elevation'>
}

/**
 * The Sandbox page's settings when it opens (apps/web/src/lib/routes/Sandbox.svelte:
 * RELIEF = 0.2, bandCenter = 40, waterShare = 12). Keep in step with that file.
 */
export const SANDBOX_WORLD: WorldConfig = {
  name: 'sandbox-page-defaults',
  description: 'Sandbox page on load: relief 0.2, band center 0.4, 12% water, roughness 0.5, valley 0.35',
  options: { relief: 0.2, center: 0.4, waterLevel: 0.12 },
}

export const ROLE1_DEFAULT_WORLD: WorldConfig = {
  name: 'generator-defaults',
  description: 'generateTerrain defaults: relief 0.2, center 0.5, 12% water, roughness 0.5, valley 0.35',
  options: {},
}

/** The headline configurations, then one-option sweeps around the Sandbox defaults for Role 1's tuning. */
export const WORLD_CONFIGS: readonly WorldConfig[] = [
  SANDBOX_WORLD,
  ROLE1_DEFAULT_WORLD,
  ...[0.1, 0.25, 0.55, 0.7, 0.85].map((center) => ({
    name: `center-${center}`,
    description: `Sandbox defaults with band center ${center}`,
    options: { ...SANDBOX_WORLD.options, center },
  })),
  ...[0, 1].map((roughness) => ({
    name: `roughness-${roughness}`,
    description: `Sandbox defaults with roughness ${roughness}`,
    options: { ...SANDBOX_WORLD.options, roughness },
  })),
  ...[0.1, 0.3].map((relief) => ({
    name: `relief-${relief}`,
    description: `Sandbox defaults with relief ${relief}`,
    options: { ...SANDBOX_WORLD.options, relief },
  })),
]

export interface ElevationRange {
  readonly min: number
  readonly max: number
}

export function generatedWorldInputs(config: WorldConfig, seed: number, elevation: ElevationRange): TerrainInputs {
  const t = generateTerrain({ ...config.options, seed, elevation })
  return heightmapToInputs(t.heightmap, { size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM })
}

/** Land cells of every seed as float64 samples (training-side matrices, fixtures). */
export function generatedLandSamples(config: WorldConfig, seeds: readonly number[], elevation: ElevationRange): TerrainSample[] {
  const out: TerrainSample[] = []
  for (const seed of seeds) {
    const t = generateTerrain({ ...config.options, seed, elevation })
    const { samples, water } = heightmapToSamples(t.heightmap, { size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM })
    samples.forEach((s, i) => {
      if (!water[i]) out.push(s)
    })
  }
  return out
}

/** The app engine built from in-memory model_card / model.json objects (throws if either is invalid). */
export function appEngine(cardRaw: unknown, modelRaw: unknown): Engine {
  const card = parseModelCard(cardRaw)
  if (!card.ok) throw new Error(`model_card.json is invalid: ${card.errors.join(' ')}`)
  const model = parseModelJson(modelRaw, card.card.classes.length)
  if (!model.ok) throw new Error(`model.json is invalid: ${model.errors.join(' ')}`)
  return createEngine(card.card, modelPredictor(model.model))
}

export interface WorldStudy {
  readonly name: string
  readonly description: string
  readonly options: WorldConfig['options']
  readonly seeds: readonly number[]
  readonly landCells: number
  /** What the app shows as low trust: detector fires OR an input is outside the training range. */
  readonly flaggedRate: number
  readonly detectorFlaggedRate: number
  readonly outsideTrainingRangeRate: number
  /** Share of land cells with each input outside its training range (a cell can count under several). */
  readonly outsideRangeByInput: Readonly<Record<string, number>>
  readonly perSeedFlaggedRate: { readonly min: number; readonly median: number; readonly max: number }
  readonly perSeed: readonly { readonly seed: number; readonly landCells: number; readonly flaggedRate: number }[]
  /** Share of land cells predicted as each class, in class-index order. */
  readonly predictedClassShare: readonly number[]
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function studyWorld(engine: Engine, config: WorldConfig, seeds: readonly number[], elevation: ElevationRange): WorldStudy {
  const k = engine.card.classes.length
  const classCounts = new Array<number>(k).fill(0)
  let land = 0
  let flagged = 0
  let detector = 0
  let outside = 0
  const byInput: Record<string, number> = {}
  const perSeed: { seed: number; landCells: number; flaggedRate: number }[] = []
  for (const seed of seeds) {
    const inputs = generatedWorldInputs(config, seed, elevation)
    const result = engine.predictBatch(inputs.packed.slice())
    let seedLand = 0
    let seedFlagged = 0
    for (let c = 0; c < inputs.water.length; c++) {
      if (inputs.water[c]) continue
      seedLand++
      classCounts[result.classIndex[c]]++
      if (result.ood[c]) seedFlagged++
      const p = engine.predictOne(sampleAt(inputs.packed, c))
      for (const key of p.outOfRange) byInput[key] = (byInput[key] ?? 0) + 1
      if (p.outOfRange.length > 0) outside++
      else if (p.ood) detector++
    }
    land += seedLand
    flagged += seedFlagged
    perSeed.push({ seed, landCells: seedLand, flaggedRate: seedFlagged / seedLand })
  }
  const rates = perSeed.map((s) => s.flaggedRate)
  return {
    name: config.name,
    description: config.description,
    options: config.options,
    seeds,
    landCells: land,
    flaggedRate: flagged / land,
    // Cells inside every training range whose detector score is over the threshold.
    detectorFlaggedRate: detector / land,
    outsideTrainingRangeRate: outside / land,
    outsideRangeByInput: Object.fromEntries(Object.entries(byInput).map(([key, n]) => [key, n / land])),
    perSeedFlaggedRate: { min: Math.min(...rates), median: median(rates), max: Math.max(...rates) },
    perSeed,
    predictedClassShare: classCounts.map((n) => n / land),
  }
}

export function generatedTerrainStudy(engine: Engine, seeds: readonly number[] = GENERATED_SEEDS) {
  const e = engine.card.inputs.find((i) => i.name === 'elevation')!
  const elevation = { min: e.min, max: e.max }
  return {
    generator: 'packages/sim/terrain generateTerrain (Role 1), inputs from @graze/features heightmapToInputs, predicted by the app engine; water cells excluded',
    elevationRange: elevation,
    flagDefinition: 'flaggedRate = cells the app marks low trust (OOD detector over threshold OR any input outside its training range). detectorFlaggedRate and outsideTrainingRangeRate split it and sum to flaggedRate.',
    worlds: WORLD_CONFIGS.map((c) => studyWorld(engine, c, seeds, elevation)),
  }
}
