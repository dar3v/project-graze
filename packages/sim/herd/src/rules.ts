/**
 * Ecology rule types and a runtime validator for `ecology.json`.
 * These rules are hand-written assumptions, NOT model output.
 */

export interface SpeciesRules {
  readonly initialCount: number
  readonly startEnergy: number
  readonly maxEnergy: number
  readonly metabolismPerTick: number
  /** Max cells (Chebyshev distance) moved per tick. */
  readonly moveRadius: number
  /** Probability of a random move instead of a purposeful one. */
  readonly wanderChance: number
  readonly reproduceEnergyThreshold: number
  readonly reproduceCost: number
  readonly reproduceChance: number
  readonly maxAge: number
  readonly maxPopulation: number
}

export interface HerbivoreRules extends SpeciesRules {
  /** Max biomass eaten per tick. */
  readonly biteSize: number
  /** Energy gained per unit of biomass eaten. */
  readonly energyPerBiomass: number
}

export interface PredatorRules extends SpeciesRules {
  readonly enabled: boolean
  /** Distance (cells) at which a predator notices a herbivore. */
  readonly huntRadius: number
  /** Probability a hunt succeeds once adjacent. */
  readonly killChance: number
  readonly energyPerKill: number
}

export interface VegetationRules {
  /** Max biomass a cell can hold, per cover class index. */
  readonly foodByClass: readonly number[]
  /** Fraction of max biomass regrown per tick, per cover class index. */
  readonly regrowthByClass: readonly number[]
}

export interface EcologyRules {
  readonly version: 1
  readonly vegetation: VegetationRules
  readonly herbivore: HerbivoreRules
  readonly predator: PredatorRules
  readonly log: { readonly maxEvents: number; readonly maxHistory: number }
}

export type RulesResult =
  | { readonly ok: true; readonly rules: EcologyRules }
  | { readonly ok: false; readonly errors: readonly string[] }

const SPECIES_KEYS = [
  'initialCount',
  'startEnergy',
  'maxEnergy',
  'metabolismPerTick',
  'moveRadius',
  'wanderChance',
  'reproduceEnergyThreshold',
  'reproduceCost',
  'reproduceChance',
  'maxAge',
  'maxPopulation',
] as const

const PROBABILITY_KEYS = new Set(['wanderChance', 'reproduceChance', 'killChance'])
const INTEGER_KEYS = new Set(['initialCount', 'moveRadius', 'maxAge', 'maxPopulation', 'huntRadius'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function checkNumber(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): void {
  const v = obj[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errors.push(`${path}.${key} must be a finite number`)
    return
  }
  if (v < 0) errors.push(`${path}.${key} must not be negative`)
  if (PROBABILITY_KEYS.has(key) && v > 1) errors.push(`${path}.${key} is a probability and must be <= 1`)
  if (INTEGER_KEYS.has(key) && !Number.isInteger(v)) errors.push(`${path}.${key} must be an integer`)
}

function checkSpecies(raw: unknown, path: string, extra: readonly string[], errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${path} must be an object`)
    return
  }
  for (const key of [...SPECIES_KEYS, ...extra]) checkNumber(raw, key, path, errors)
  if (typeof raw.maxEnergy === 'number' && typeof raw.startEnergy === 'number' && raw.startEnergy > raw.maxEnergy) {
    errors.push(`${path}.startEnergy must be <= maxEnergy`)
  }
}

function checkClassArray(raw: unknown, path: string, classCount: number | undefined, errors: string[]): void {
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push(`${path} must be a non-empty array`)
    return
  }
  if (classCount !== undefined && raw.length !== classCount) {
    errors.push(`${path} has ${raw.length} entries but the model has ${classCount} classes`)
  }
  raw.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`${path}[${i}] must be a finite number >= 0`)
  })
}

/**
 * Validate untrusted JSON as EcologyRules. `classCount`, when given, must
 * match the per-class arrays (it comes from model_card.json).
 */
export function validateRules(raw: unknown, classCount?: number): RulesResult {
  const errors: string[] = []
  if (!isRecord(raw)) return { ok: false, errors: ['rules must be a JSON object'] }
  if (raw.version !== 1) errors.push('version must be 1')

  const veg = raw.vegetation
  if (!isRecord(veg)) errors.push('vegetation must be an object')
  else {
    checkClassArray(veg.foodByClass, 'vegetation.foodByClass', classCount, errors)
    checkClassArray(veg.regrowthByClass, 'vegetation.regrowthByClass', classCount, errors)
    if (Array.isArray(veg.foodByClass) && Array.isArray(veg.regrowthByClass) && veg.foodByClass.length !== veg.regrowthByClass.length) {
      errors.push('vegetation.foodByClass and vegetation.regrowthByClass must have the same length')
    }
  }

  checkSpecies(raw.herbivore, 'herbivore', ['biteSize', 'energyPerBiomass'], errors)
  checkSpecies(raw.predator, 'predator', ['huntRadius', 'killChance', 'energyPerKill'], errors)
  if (isRecord(raw.predator) && typeof raw.predator.enabled !== 'boolean') errors.push('predator.enabled must be true or false')

  const log = raw.log
  if (!isRecord(log)) errors.push('log must be an object')
  else {
    checkNumber(log, 'maxEvents', 'log', errors)
    checkNumber(log, 'maxHistory', 'log', errors)
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, rules: raw as unknown as EcologyRules }
}
