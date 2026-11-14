export { createSim, stepSim, getPositions, SimInputError } from './sim.ts'
export type { Animal, CreateSimOptions, PopulationSample, SimEvent, SimEventKind, SimState, Species } from './sim.ts'
export { validateRules } from './rules.ts'
export type { EcologyRules, HerbivoreRules, PredatorRules, RulesResult, SpeciesRules, VegetationRules } from './rules.ts'
export { computeScore, habitatDiversity, populationStability, SCORE_MIN_SAMPLES, SCORE_WINDOW } from './score.ts'
export type { RewildingScore } from './score.ts'
export { default as defaultEcology } from '../ecology.json' with { type: 'json' }
