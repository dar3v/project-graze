// ROLE-1 D16: the sim clock. Slowing it changes when ticks happen, never what they do.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSim, defaultEcology, MAX_TICKS_PER_ADVANCE, medianMoveCells, medianMovingSpeed, moveDistances, SimClock, snapshotPoses, stepSim, TICK_MS, tickGapMs, validateRules } from '../src/index.ts'
import type { EcologyRules, SimState } from '../src/index.ts'

const result = validateRules(defaultEcology, 7)
if (!result.ok) throw new Error('ecology.json is invalid')
const RULES: EcologyRules = result.rules

function newSim(seed: number): SimState {
  const size = 24
  const cover = new Uint8Array(size * size)
  const passable = new Uint8Array(size * size).fill(1)
  for (let i = 0; i < cover.length; i++) cover[i] = (i * 7) % 7
  for (let x = 0; x < size; x++) passable[11 * size + x] = x % 5 === 0 ? 1 : 0 // a river with fords
  return createSim({ width: size, height: size, cover, passable, rules: RULES, seed })
}

/** Run a sim on the clock until `ticks` ticks have happened; returns the wall time it took, ms. */
function runOnClock(sim: SimState, ticks: number, ticksPerSecond: number, scale: number, wakeMs = TICK_MS): number {
  const clock = new SimClock()
  let wall = 0
  let done = 0
  while (done < ticks) {
    const due = Math.min(clock.advance(wakeMs, ticksPerSecond * scale), ticks - done)
    if (due > 0) stepSim(sim, due)
    done += due
    wall += wakeMs
    if (wall > 1e9) throw new Error('the clock never released the ticks')
  }
  return wall
}

test('determinism: N ticks at 1x and at 0.25x give the same state; only the wall time differs', () => {
  const N = 180
  const fast = newSim(42)
  const slow = newSim(42)
  const plain = newSim(42)
  const wallFast = runOnClock(fast, N, 20, 1)
  const wallSlow = runOnClock(slow, N, 20, 0.25)
  stepSim(plain, N) // no clock at all

  for (const s of [fast, slow]) {
    assert.equal(s.tick, N)
    assert.deepEqual(snapshotPoses(s), snapshotPoses(plain))
    assert.deepEqual(s.history, plain.history)
    assert.deepEqual(s.events, plain.events)
    assert.deepEqual(s.herbivores, plain.herbivores)
    assert.deepEqual(s.predators, plain.predators)
  }
  assert.ok(Math.abs(wallSlow / wallFast - 4) < 0.05, `0.25x takes four times as long (${wallFast} ms vs ${wallSlow} ms)`)
})

test('determinism does not depend on how often the clock is woken', () => {
  const a = newSim(9)
  const b = newSim(9)
  runOnClock(a, 90, 20, 0.0637, 100)
  runOnClock(b, 90, 20, 0.0637, 16.7) // woken every frame instead of every 100 ms
  assert.deepEqual(snapshotPoses(a), snapshotPoses(b))
})

test('SimClock: exact long-run rate, remainder kept, paused releases nothing', () => {
  const c = new SimClock()
  let ticks = 0
  for (let i = 0; i < 1000; i++) ticks += c.advance(100, 1.27) // 100 s at 1.27 ticks/s
  assert.equal(ticks, 127)
  assert.ok(c.phase >= 0 && c.phase < 1)

  const paused = new SimClock()
  for (let i = 0; i < 100; i++) assert.equal(paused.advance(100, 0), 0)
  assert.equal(paused.phase, 0, 'a paused clock does not drift')
  assert.equal(new SimClock().advance(-5, 20), 0)
  assert.equal(new SimClock().advance(Number.NaN, 20), 0)

  // A stalled tab does not release a burst.
  assert.equal(new SimClock().advance(60_000, 200), MAX_TICKS_PER_ADVANCE)

  // At full speed the app's default (2 ticks per 100 ms wake-up) is unchanged.
  const full = new SimClock()
  assert.deepEqual([full.advance(TICK_MS, 20), full.advance(TICK_MS, 20), full.advance(TICK_MS, 20)], [2, 2, 2])
})

test('tickGapMs: the glide between batches is never shorter than a wake-up, and endless when paused', () => {
  assert.equal(tickGapMs(20), TICK_MS)
  assert.equal(tickGapMs(200), TICK_MS)
  assert.ok(Math.abs(tickGapMs(1.25) - 800) < 1e-9)
  assert.equal(tickGapMs(0), Infinity)
})

test('median moving speed comes from the rules, so editing ecology.json moves the pace', () => {
  // Radius 2: 24 possible moves; lengths 1, 1.41, 2, 2.24 and 2.83.
  const d = moveDistances(2)
  assert.equal(d.length, 24)
  assert.ok(Math.abs(medianMoveCells(RULES) - (2 + Math.sqrt(5)) / 2) < 1e-9)
  assert.ok(Math.abs(medianMovingSpeed(RULES, 20) - 20 * medianMoveCells(RULES)) < 1e-9)

  const slower: EcologyRules = { ...RULES, herbivore: { ...RULES.herbivore, moveRadius: 1 }, predator: { ...RULES.predator, moveRadius: 1 } }
  assert.ok(medianMoveCells(slower) < medianMoveCells(RULES), 'a smaller move radius is a slower animal')
  const noPredators: EcologyRules = { ...RULES, predator: { ...RULES.predator, enabled: false, moveRadius: 9 } }
  assert.equal(medianMoveCells(noPredators), medianMoveCells(RULES), 'disabled predators do not count')
  assert.deepEqual(moveDistances(0), [])
})
