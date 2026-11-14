/**
 * Tick-based herd simulation on a predicted cover map.
 *
 * NOT machine learning: every behaviour below is a hand-written rule read from
 * `ecology.json`. The only ML input is the cover map (one class index per
 * cell), which decides how much food each cell can hold.
 *
 * Deterministic: given the same cover map, rules and seed, the sequence of
 * states is identical. All randomness flows through the seeded Rng whose state
 * is stored on SimState.
 */

import { Rng, seedToState } from './rng.ts'
import type { EcologyRules, SpeciesRules } from './rules.ts'

export type Species = 'herbivore' | 'predator'

export interface Animal {
  readonly id: number
  x: number
  y: number
  /** Facing in radians, atan2(dy, dx) in grid coordinates (+x east, +y south). Updated when the animal moves. */
  heading: number
  energy: number
  age: number
}

export type SimEventKind = 'birth' | 'starvation' | 'old-age' | 'predation' | 'extinction' | 'info'

export interface SimEvent {
  readonly tick: number
  readonly kind: SimEventKind
  readonly species?: Species
  readonly count: number
  readonly message: string
}

export interface PopulationSample {
  readonly tick: number
  readonly herbivores: number
  readonly predators: number
  /** Total biomass as a fraction of total capacity, 0..1. */
  readonly biomassFraction: number
}

export interface SimState {
  readonly width: number
  readonly height: number
  readonly cover: Uint8Array
  /** 1 = land animals can stand on, 0 = blocked (e.g. water). */
  readonly passable: Uint8Array
  readonly maxBiomass: Float32Array
  readonly regrowth: Float32Array
  readonly biomass: Float32Array
  totalCapacity: number
  readonly rules: EcologyRules
  readonly seed: number
  herbivores: Animal[]
  predators: Animal[]
  tick: number
  nextId: number
  rngState: number
  events: SimEvent[]
  history: PopulationSample[]
}

export interface CreateSimOptions {
  readonly width: number
  readonly height: number
  readonly cover: Uint8Array
  readonly passable?: Uint8Array
  readonly rules: EcologyRules
  readonly seed: number
}

export class SimInputError extends Error {}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export function createSim(opts: CreateSimOptions): SimState {
  const { width, height, cover, rules } = opts
  const n = width * height
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new SimInputError('Grid width and height must be positive integers.')
  }
  if (cover.length !== n) {
    throw new SimInputError(`Cover map has ${cover.length} cells; expected ${n} (${width}x${height}).`)
  }
  const passable = opts.passable ?? new Uint8Array(n).fill(1)
  if (passable.length !== n) throw new SimInputError('Passable mask size does not match the cover map.')

  const classCount = rules.vegetation.foodByClass.length
  const maxBiomass = new Float32Array(n)
  const regrowth = new Float32Array(n)
  let totalCapacity = 0
  for (let i = 0; i < n; i++) {
    const c = cover[i]
    if (passable[i] === 0) continue
    if (c >= classCount) {
      throw new SimInputError(`Cell ${i} has cover class ${c}, but ecology rules define ${classCount} classes.`)
    }
    maxBiomass[i] = rules.vegetation.foodByClass[c]
    regrowth[i] = rules.vegetation.regrowthByClass[c] * maxBiomass[i]
    totalCapacity += maxBiomass[i]
  }

  const state: SimState = {
    width,
    height,
    cover: cover.slice(),
    passable: passable.slice(),
    maxBiomass,
    regrowth,
    biomass: maxBiomass.slice(),
    totalCapacity,
    rules,
    seed: opts.seed,
    herbivores: [],
    predators: [],
    tick: 0,
    nextId: 1,
    rngState: seedToState(opts.seed),
    events: [],
    history: [],
  }

  const landCells: number[] = []
  for (let i = 0; i < n; i++) if (passable[i] === 1) landCells.push(i)

  const rng = new Rng(state.rngState)
  if (landCells.length === 0) {
    pushEvent(state, { tick: 0, kind: 'info', count: 0, message: 'No habitable land: the whole map is water or empty. No animals released.' })
  } else {
    state.herbivores = spawn(state, rng, landCells, rules.herbivore)
    if (rules.predator.enabled) state.predators = spawn(state, rng, landCells, rules.predator)
    pushEvent(state, {
      tick: 0,
      kind: 'info',
      count: state.herbivores.length + state.predators.length,
      message: `Released ${state.herbivores.length} herbivores` + (rules.predator.enabled ? ` and ${state.predators.length} predators.` : '. Predators are disabled.'),
    })
  }
  state.rngState = rng.state
  recordHistory(state)
  return state
}

function spawn(state: SimState, rng: Rng, landCells: readonly number[], rules: SpeciesRules): Animal[] {
  const out: Animal[] = []
  for (let k = 0; k < rules.initialCount; k++) {
    const cell = landCells[rng.int(landCells.length)]
    const id = state.nextId++
    out.push({
      id,
      x: cell % state.width,
      y: Math.floor(cell / state.width),
      // Golden-angle spread: varied starting headings without drawing from the RNG,
      // so adding headings did not change any run.
      heading: (id * GOLDEN_ANGLE) % (2 * Math.PI),
      energy: rules.startEnergy,
      age: rng.int(Math.max(1, Math.floor(rules.maxAge / 2))),
    })
  }
  return out
}

function pushEvent(state: SimState, event: SimEvent): void {
  state.events.push(event)
  const max = state.rules.log.maxEvents
  if (state.events.length > max) state.events.splice(0, state.events.length - max)
}

function recordHistory(state: SimState): void {
  let total = 0
  for (let i = 0; i < state.biomass.length; i++) total += state.biomass[i]
  state.history.push({
    tick: state.tick,
    herbivores: state.herbivores.length,
    predators: state.predators.length,
    biomassFraction: state.totalCapacity > 0 ? total / state.totalCapacity : 0,
  })
  const max = state.rules.log.maxHistory
  if (state.history.length > max) state.history.splice(0, state.history.length - max)
}

function clampToGrid(state: SimState, x: number, y: number): [number, number] {
  return [Math.min(state.width - 1, Math.max(0, x)), Math.min(state.height - 1, Math.max(0, y))]
}

/** Move an animal, turning it to face the direction of travel (no turn when it stays put). */
function moveTo(a: Animal, nx: number, ny: number): void {
  if (nx !== a.x || ny !== a.y) a.heading = Math.atan2(ny - a.y, nx - a.x)
  a.x = nx
  a.y = ny
}

/** Random passable cell within `radius` of (x, y); stays put if none is found. */
function wander(state: SimState, rng: Rng, a: Animal, radius: number): void {
  for (let attempt = 0; attempt < 4; attempt++) {
    const dx = rng.int(2 * radius + 1) - radius
    const dy = rng.int(2 * radius + 1) - radius
    const [nx, ny] = clampToGrid(state, a.x + dx, a.y + dy)
    if (state.passable[ny * state.width + nx] === 1) {
      moveTo(a, nx, ny)
      return
    }
  }
}

/** Move to the passable cell with the most biomass within moveRadius (ties: first found, scan order is fixed). */
function graze(state: SimState, rng: Rng, a: Animal): void {
  const r = state.rules.herbivore.moveRadius
  if (rng.next() < state.rules.herbivore.wanderChance) {
    wander(state, rng, a, r)
    return
  }
  let bestX = a.x
  let bestY = a.y
  let best = state.biomass[a.y * state.width + a.x]
  // Random scan offset breaks directional bias while staying deterministic.
  const offset = rng.int((2 * r + 1) * (2 * r + 1))
  const side = 2 * r + 1
  for (let k = 0; k < side * side; k++) {
    const j = (k + offset) % (side * side)
    const nx = a.x + (j % side) - r
    const ny = a.y + Math.floor(j / side) - r
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue
    const idx = ny * state.width + nx
    if (state.passable[idx] === 0) continue
    if (state.biomass[idx] > best) {
      best = state.biomass[idx]
      bestX = nx
      bestY = ny
    }
  }
  moveTo(a, bestX, bestY)
}

/** Step toward (tx, ty), shortening the step until it lands on a passable cell. */
function stepToward(state: SimState, a: Animal, tx: number, ty: number, maxStep: number): void {
  const dx = tx - a.x
  const dy = ty - a.y
  for (let step = maxStep; step >= 1; step--) {
    const nx = a.x + Math.sign(dx) * Math.min(Math.abs(dx), step)
    const ny = a.y + Math.sign(dy) * Math.min(Math.abs(dy), step)
    if (state.passable[ny * state.width + nx] === 1) {
      moveTo(a, nx, ny)
      return
    }
  }
}

function reproduce(state: SimState, rng: Rng, parent: Animal, rules: SpeciesRules, population: number, babies: Animal[]): void {
  if (parent.energy < rules.reproduceEnergyThreshold) return
  if (population + babies.length >= rules.maxPopulation) return
  if (rng.next() >= rules.reproduceChance) return
  parent.energy -= rules.reproduceCost
  babies.push({ id: state.nextId++, x: parent.x, y: parent.y, heading: parent.heading, energy: rules.reproduceCost, age: 0 })
}

interface TickCounts {
  births: number
  starved: number
  oldAge: number
}

function emptyCounts(): TickCounts {
  return { births: 0, starved: 0, oldAge: 0 }
}

function stepVegetation(state: SimState): void {
  const { biomass, maxBiomass, regrowth } = state
  for (let i = 0; i < biomass.length; i++) {
    const v = biomass[i] + regrowth[i]
    biomass[i] = v > maxBiomass[i] ? maxBiomass[i] : v
  }
}

function stepHerbivores(state: SimState, rng: Rng, counts: TickCounts): void {
  const rules = state.rules.herbivore
  const babies: Animal[] = []
  const survivors: Animal[] = []
  for (const a of state.herbivores) {
    a.age++
    a.energy -= rules.metabolismPerTick
    graze(state, rng, a)
    const idx = a.y * state.width + a.x
    const eaten = Math.min(rules.biteSize, state.biomass[idx])
    state.biomass[idx] -= eaten
    a.energy = Math.min(rules.maxEnergy, a.energy + eaten * rules.energyPerBiomass)
    if (a.energy <= 0) {
      counts.starved++
      continue
    }
    if (a.age > rules.maxAge) {
      counts.oldAge++
      continue
    }
    reproduce(state, rng, a, rules, state.herbivores.length, babies)
    survivors.push(a)
  }
  counts.births += babies.length
  state.herbivores = survivors.concat(babies)
}

function stepPredators(state: SimState, rng: Rng, counts: TickCounts): number {
  const rules = state.rules.predator
  const babies: Animal[] = []
  const survivors: Animal[] = []
  const eatenIds = new Set<number>()
  let kills = 0
  for (const p of state.predators) {
    p.age++
    p.energy -= rules.metabolismPerTick

    // Nearest live herbivore within huntRadius (Chebyshev). Fixed scan order.
    let target: Animal | undefined
    let bestD = Infinity
    for (const h of state.herbivores) {
      if (eatenIds.has(h.id)) continue
      const d = Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y))
      if (d <= rules.huntRadius && d < bestD) {
        bestD = d
        target = h
      }
    }

    if (target && rng.next() >= rules.wanderChance) {
      stepToward(state, p, target.x, target.y, rules.moveRadius)
      const d = Math.max(Math.abs(target.x - p.x), Math.abs(target.y - p.y))
      if (d <= 1 && rng.next() < rules.killChance) {
        eatenIds.add(target.id)
        kills++
        p.energy = Math.min(rules.maxEnergy, p.energy + rules.energyPerKill)
      }
    } else {
      wander(state, rng, p, rules.moveRadius)
    }

    if (p.energy <= 0) {
      counts.starved++
      continue
    }
    if (p.age > rules.maxAge) {
      counts.oldAge++
      continue
    }
    reproduce(state, rng, p, rules, state.predators.length, babies)
    survivors.push(p)
  }
  counts.births += babies.length
  state.predators = survivors.concat(babies)
  if (eatenIds.size > 0) state.herbivores = state.herbivores.filter((h) => !eatenIds.has(h.id))
  return kills
}

function logCounts(state: SimState, species: Species, counts: TickCounts): void {
  const label = species === 'herbivore' ? 'herbivore' : 'predator'
  const plural = (n: number) => (n === 1 ? label : `${label}s`)
  if (counts.births > 0) {
    pushEvent(state, { tick: state.tick, kind: 'birth', species, count: counts.births, message: `${counts.births} ${plural(counts.births)} born` })
  }
  if (counts.starved > 0) {
    pushEvent(state, { tick: state.tick, kind: 'starvation', species, count: counts.starved, message: `${counts.starved} ${plural(counts.starved)} starved` })
  }
  if (counts.oldAge > 0) {
    pushEvent(state, { tick: state.tick, kind: 'old-age', species, count: counts.oldAge, message: `${counts.oldAge} ${plural(counts.oldAge)} died of old age` })
  }
}

/** Advance the simulation by `ticks` steps (mutates and returns `state`). */
export function stepSim(state: SimState, ticks = 1): SimState {
  for (let t = 0; t < ticks; t++) {
    const rng = new Rng(state.rngState)
    const herbBefore = state.herbivores.length
    const predBefore = state.predators.length
    state.tick++

    stepVegetation(state)
    const hCounts = emptyCounts()
    stepHerbivores(state, rng, hCounts)
    const pCounts = emptyCounts()
    const kills = state.rules.predator.enabled ? stepPredators(state, rng, pCounts) : 0

    logCounts(state, 'herbivore', hCounts)
    if (kills > 0) {
      pushEvent(state, { tick: state.tick, kind: 'predation', species: 'herbivore', count: kills, message: `${kills} herbivore${kills === 1 ? ' was' : 's were'} caught by predators` })
    }
    logCounts(state, 'predator', pCounts)
    if (herbBefore > 0 && state.herbivores.length === 0) {
      pushEvent(state, { tick: state.tick, kind: 'extinction', species: 'herbivore', count: 0, message: 'Herbivores are extinct' })
    }
    if (predBefore > 0 && state.predators.length === 0) {
      pushEvent(state, { tick: state.tick, kind: 'extinction', species: 'predator', count: 0, message: 'Predators are extinct' })
    }

    state.rngState = rng.state
    recordHistory(state)
  }
  return state
}

export interface MapChange {
  readonly cover: Uint8Array
  /** 1 = land, 0 = blocked (water). Defaults to all land. */
  readonly passable?: Uint8Array
}

export interface MapChangeResult {
  /** Animals that stood on a cell that became water and were moved to the nearest land cell. */
  readonly moved: number
  /** Animals removed because no land cell was left anywhere. */
  readonly removed: number
}

/** Nearest passable cell by Chebyshev rings, scanned in a fixed order (deterministic). */
function nearestPassable(state: SimState, x: number, y: number): [number, number] | null {
  const maxR = Math.max(state.width, state.height)
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue
        if (state.passable[ny * state.width + nx] === 1) return [nx, ny]
      }
    }
  }
  return null
}

/**
 * The terrain was edited under a running simulation: swap in the new cover
 * map and water mask WITHOUT restarting. Animals, ages, energy, tick and RNG
 * state are kept, so the run continues. Rules (docs/ecology-rules.md,
 * "Terrain edits"):
 *
 * - each cell's food capacity and regrowth follow its new cover class; current
 *   biomass is capped at the new capacity (a cell that just became land starts
 *   empty and regrows);
 * - an animal on a cell that became water moves to the nearest land cell
 *   (Chebyshev rings, fixed scan order); if no land is left it is removed;
 * - one "info" event summarises what happened.
 *
 * Uses no randomness, so it does not change the RNG sequence. Mutates `state`.
 */
export function applyMapChange(state: SimState, change: MapChange): MapChangeResult {
  const n = state.width * state.height
  const { cover } = change
  const passable = change.passable ?? new Uint8Array(n).fill(1)
  if (cover.length !== n) throw new SimInputError(`Cover map has ${cover.length} cells; expected ${n} (${state.width}x${state.height}).`)
  if (passable.length !== n) throw new SimInputError('Passable mask size does not match the cover map.')
  const { foodByClass, regrowthByClass } = state.rules.vegetation
  for (let i = 0; i < n; i++) {
    if (passable[i] === 1 && cover[i] >= foodByClass.length) {
      throw new SimInputError(`Cell ${i} has cover class ${cover[i]}, but ecology rules define ${foodByClass.length} classes.`)
    }
  }

  let total = 0
  for (let i = 0; i < n; i++) {
    state.cover[i] = cover[i]
    state.passable[i] = passable[i]
    const max = passable[i] === 1 ? foodByClass[cover[i]] : 0
    state.maxBiomass[i] = max
    state.regrowth[i] = passable[i] === 1 ? regrowthByClass[cover[i]] * max : 0
    if (state.biomass[i] > max) state.biomass[i] = max
    total += max
  }
  state.totalCapacity = total

  let moved = 0
  let removed = 0
  const rehome = (list: Animal[]): Animal[] =>
    list.filter((a) => {
      if (state.passable[a.y * state.width + a.x] === 1) return true
      const to = nearestPassable(state, a.x, a.y)
      if (!to) {
        removed++
        return false
      }
      moveTo(a, to[0], to[1])
      moved++
      return true
    })
  state.herbivores = rehome(state.herbivores)
  state.predators = rehome(state.predators)

  const parts = ['Terrain changed: the herds keep running on the new map']
  if (moved > 0) parts.push(`${moved} animal${moved === 1 ? '' : 's'} moved off new water`)
  if (removed > 0) parts.push(`${removed} removed (no land left)`)
  pushEvent(state, { tick: state.tick, kind: 'info', count: moved + removed, message: parts.join('; ') + '.' })
  return { moved, removed }
}

/**
 * Animal positions for the renderer (Role 1): interleaved [x0, y0, x1, y1, ...]
 * in grid-cell coordinates.
 */
export function getPositions(state: SimState): { herbivores: Float32Array; predators: Float32Array } {
  const pack = (list: readonly Animal[]) => {
    const out = new Float32Array(list.length * 2)
    list.forEach((a, i) => {
      out[2 * i] = a.x
      out[2 * i + 1] = a.y
    })
    return out
  }
  return { herbivores: pack(state.herbivores), predators: pack(state.predators) }
}
