// ROLE-1 D14-D16, D19, D20: the ambient backdrop's rules, the walker's
// placement, the exit payload, the animal pace and the ground detail texture.
// All pure.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  AMBIENT_FPS_CAP,
  AMBIENT_MAX_DT_S,
  AMBIENT_MIN_FPS,
  AMBIENT_TURN_S,
  AMBIENT_YAW_RATE_DEG_S,
  ambientQuality,
  ambientYaw,
  backdropContrast,
  backdropLease,
  DIM_IDLE,
  DIM_WALK,
  dimState,
  findVantage,
  isDry,
  MIN_TEXT_CONTRAST,
  nextAmbientFallback,
  stepAmbientClock,
  TEXT_BODY,
  TEXT_SECONDARY,
  viewDraws,
} from '../src/lib/world/ambient.ts'
import { ANIMAL_PACE, ANIMAL_SPEEDS, animalTimeScale, nextAnimalSpeed, PaceMeter, paceScale } from '../src/lib/world/pace.ts'
import { QUALITY } from '../src/lib/world/quality.ts'
import { generateTerrain } from '../src/lib/world/terrain.ts'
import { DETAIL_SIZE, groundDetailPixels } from '../src/lib/world/terrainMaterial.ts'
import { DEFAULT_LOOK, readCell, settleWalker, WADE_DEPTH_M, WALK_FOV_RANGE, WALK_SPEED, walkBound, waterDepth } from '../src/lib/world/walk.ts'
import type { WalkTerrain } from '../src/lib/world/walk.ts'

// ---- D20: one flat, constant dim ------------------------------------------------

test('dim: two fixed states, idle on every page and lifted in walk mode, switched at once', () => {
  assert.deepEqual(dimState(false), { mode: 'idle', opacity: DIM_IDLE })
  assert.deepEqual(dimState(true), { mode: 'walk', opacity: DIM_WALK })
  assert.equal(DIM_IDLE, 0.84)
  assert.equal(DIM_WALK, 0)
  // Nothing animates: the state carries no fade time, scrim or gradient, and does not depend on reduced motion.
  assert.deepEqual(Object.keys(dimState(false)).sort(), ['mode', 'opacity'])
  assert.equal(dimState.length, 1)
})

test('dim: the backdrop draws one flat layer with no transition, gradient or column scrim', () => {
  const svelte = readFileSync(new URL('../src/lib/backdrop/WorldBackdrop.svelte', import.meta.url), 'utf8')
  const style = svelte.slice(svelte.indexOf('<style>'))
  const dimRule = style.slice(style.indexOf('.dim {'), style.indexOf('}', style.indexOf('.dim {')))
  assert.ok(!/transition|animation/.test(dimRule), 'the dim layer has no transition or animation')
  assert.ok(!/gradient|mask|vignette|scrim|column/i.test(svelte.slice(svelte.indexOf('</script>'))), 'no gradient, mask or column layer in the markup or styles')
})

test('contrast: secondary and body text keep 4.5:1 on the brightest possible frame, under the flat dim', () => {
  // Pure white is brighter than any frame the sky can produce: if it passes, every frame passes.
  const white = [255, 255, 255] as const
  assert.ok(backdropContrast(TEXT_SECONDARY, white) >= MIN_TEXT_CONTRAST, `secondary text: ${backdropContrast(TEXT_SECONDARY, white).toFixed(2)}`)
  assert.ok(backdropContrast(TEXT_BODY, white) >= MIN_TEXT_CONTRAST)
  // A noon sky, now without any column scrim.
  assert.ok(backdropContrast(TEXT_SECONDARY, [150, 190, 230]) >= MIN_TEXT_CONTRAST)
  // Why the value went up from 0.72: on its own, that dim fails on a bright frame.
  assert.ok(backdropContrast(TEXT_SECONDARY, white, 0.72) < MIN_TEXT_CONTRAST)
  // A black frame is the easy case.
  assert.ok(backdropContrast(TEXT_SECONDARY, [0, 0, 0]) > 6)
})

// ---- D19: the ambient camera never stops turning ------------------------------------------

test('ambient turn: about 2-3 degrees a second, a full circle in a couple of minutes', () => {
  assert.ok(AMBIENT_YAW_RATE_DEG_S >= 2 && AMBIENT_YAW_RATE_DEG_S <= 3)
  assert.ok(AMBIENT_TURN_S >= 100 && AMBIENT_TURN_S <= 180, `${AMBIENT_TURN_S} s per turn`)
  assert.equal(ambientYaw(1.2, 0), 1.2)
  const perSecond = ambientYaw(1.2, 1) - ambientYaw(1.2, 0)
  assert.ok(Math.abs(perSecond - (AMBIENT_YAW_RATE_DEG_S * Math.PI) / 180) < 1e-9, 'constant rate')
})

/** Smallest signed angle from a to b. */
const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

test('ambient turn: stepped frame by frame, the yaw keeps changing; no pause, no swing back, no restart', () => {
  // Ten minutes at the 30 fps cap: every frame turns the same way by the same amount.
  let t = 0
  let yaw = ambientYaw(0.4, t)
  const step = (AMBIENT_YAW_RATE_DEG_S * Math.PI) / 180 / 30
  let total = 0
  for (let frame = 0; frame < 30 * 600; frame++) {
    t = stepAmbientClock(t, 1 / 30, false)
    const next = ambientYaw(0.4, t)
    const d = turn(yaw, next)
    assert.ok(d > 0, `frame ${frame}: the yaw moved on (${d})`)
    assert.ok(Math.abs(d - step) < 1e-6, `frame ${frame}: steady (${d} vs ${step})`)
    total += d
    yaw = next
  }
  assert.ok(Math.abs(total - (AMBIENT_YAW_RATE_DEG_S * 600 * Math.PI) / 180) < 1e-3, 'four full circles in ten minutes')
})

test('ambient clock: dt is capped, so a hidden tab or a stall never makes the camera jump', () => {
  assert.equal(stepAmbientClock(10, 5, false), 10 + AMBIENT_MAX_DT_S)
  assert.equal(AMBIENT_MAX_DT_S, 0.1)
  assert.equal(stepAmbientClock(10, 0, false), 10, 'the first frame after the loop restarts')
  assert.equal(stepAmbientClock(10, Number.NaN, false), 10)
  assert.equal(stepAmbientClock(10, -1, false), 10)
})

test('ambient clock: reduced motion holds the camera still', () => {
  let t = 3
  for (let i = 0; i < 100; i++) t = stepAmbientClock(t, 1 / 30, true)
  assert.equal(t, 3)
  assert.equal(ambientYaw(0.4, t), ambientYaw(0.4, 3))
})

test('ambient clock: stopping and starting again resumes from the same heading', () => {
  // Walk mode takes the view: no frames are drawn, so the clock does not move.
  let t = 0
  for (let i = 0; i < 90; i++) t = stepAmbientClock(t, 1 / 30, false)
  const heading = ambientYaw(0.4, t)
  // ...the loop restarts with dt = 0 on its first frame (the renderer resets its frame time).
  t = stepAmbientClock(t, 0, false)
  assert.equal(ambientYaw(0.4, t), heading)
  t = stepAmbientClock(t, 1 / 30, false)
  assert.ok(turn(heading, ambientYaw(0.4, t)) > 0)
})

function world(seed: number, waterLevel = 0.12): WalkTerrain {
  const t = generateTerrain({ seed, waterLevel })
  return { heightmap: t.heightmap, size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM }
}

test('ambient vantage: seeded, on dry land, inside the map, facing the valley', () => {
  for (const seed of [7, 21, 1234]) {
    const t = world(seed)
    const a = findVantage(t, seed)
    const b = findVantage(t, seed)
    assert.deepEqual(a, b, 'the same seed and terrain give the same vantage')
    assert.ok(isDry(a.x, a.z, t), `seed ${seed}: dry`)
    const bound = walkBound(t.size)
    assert.ok(Math.abs(a.x) <= bound && Math.abs(a.z) <= bound)
    assert.ok(Number.isFinite(a.yaw))
  }
  const t = world(7)
  assert.notDeepEqual(findVantage(t, 7), findVantage(t, 8), 'another seed stands somewhere else')
})

test('ambient vantage: a map with no dry land still gives a place to stand', () => {
  const size = 16
  const t: WalkTerrain = { heightmap: new Float32Array(size * size).fill(100), size, cellSizeM: 30, waterLevelM: 500 }
  t.heightmap[5 * size + 5] = 140 // the shallowest cell
  const v = findVantage(t, 3)
  assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z) && Number.isFinite(v.yaw))
  assert.ok(Math.abs(v.x) <= walkBound(size) && Math.abs(v.z) <= walkBound(size))
})

test('idle cost: at most the low preset, low on narrow screens, capped at 30 fps', () => {
  assert.equal(ambientQuality(1100, 'high'), 'low')
  assert.equal(ambientQuality(1100, 'medium'), 'low')
  assert.equal(ambientQuality(1100, 'low'), 'low')
  assert.equal(ambientQuality(390, 'high'), 'low')
  // What "low" means for the backdrop: no grass, no shadow map, the shortest draw distance.
  assert.equal(QUALITY.low.grassPerCell, 0)
  assert.equal(QUALITY.low.shadowMapSize, 0)
  assert.ok(QUALITY.low.drawDistance < QUALITY.medium.drawDistance)
  assert.equal(AMBIENT_FPS_CAP, 30)
  assert.ok(AMBIENT_MIN_FPS < AMBIENT_FPS_CAP, 'a backdrop held at the cap must not report itself as slow')
})

test('frame-rate fallback: stop the cycle first, then freeze to a still frame', () => {
  assert.equal(nextAmbientFallback('none', true), 'cycle-stopped')
  assert.equal(nextAmbientFallback('cycle-stopped', false), 'frozen')
  assert.equal(nextAmbientFallback('none', false), 'frozen', 'no cycle to stop: freeze')
  assert.equal(nextAmbientFallback('frozen', false), 'frozen')
})

test('who draws: the backdrop on every page except in walk mode; the view while on screen or walked in', () => {
  const another = { shown: false, onScreen: false, walking: false }
  const hidden = { shown: false, onScreen: true, walking: true }
  const orbit = { shown: true, onScreen: true, walking: false }
  const scrolled = { shown: true, onScreen: false, walking: false }
  const walk = { shown: true, onScreen: false, walking: true }
  // D19: the backdrop's camera keeps turning on the Sandbox too, even with the orbit view on screen.
  assert.equal(backdropLease(another), 'draw', 'another page')
  assert.equal(backdropLease(hidden), 'draw', 'a hidden Sandbox does not cover anything')
  assert.equal(backdropLease(orbit), 'draw', 'orbit view on screen: the backdrop still turns')
  assert.equal(backdropLease(scrolled), 'draw')
  assert.equal(backdropLease(walk), 'covered', 'walk mode covers the window')
  assert.equal(viewDraws(another), false)
  assert.equal(viewDraws(hidden), false, 'a hidden Sandbox never draws')
  assert.equal(viewDraws(orbit), true)
  assert.equal(viewDraws(scrolled), false, 'orbit view scrolled away')
  assert.equal(viewDraws(walk), true)
})

// ---- D15: the walker's place, the look settings, the exit payload -----------------------

/** 5 x 5 map, 30 m cells: a deep pool in the middle column, dry ground either side. */
function pool(): WalkTerrain {
  const size = 5
  const h = new Float32Array(size * size).fill(100)
  for (let y = 0; y < size; y++) h[y * size + 2] = 80 // 20 m under a 100 m water level: deep
  for (let y = 0; y < size; y++) h[y * size + 1] = 97 // 3 m deep: wading
  return { heightmap: h, size, cellSizeM: 30, waterLevelM: 100 }
}

test('settleWalker: kept on dry or wadable ground, moved off deep water, never outside the map', () => {
  const t = pool()
  // Dry (x = 3 is world x = 1): stays.
  assert.deepEqual(settleWalker(1, 0, t), { x: 1, z: 0, moved: false })
  // Wading depth (cell x = 1 is world x = -1): stays.
  const wade = settleWalker(-1, 0.5, t)
  assert.equal(wade.moved, false)
  assert.ok(waterDepth(wade.x, wade.z, t) > 0 && waterDepth(wade.x, wade.z, t) <= WADE_DEPTH_M)
  // Deep water (cell x = 2 is world x = 0): moved to the nearest dry cell.
  const deep = settleWalker(0, 0, t)
  assert.equal(deep.moved, true)
  assert.ok(waterDepth(deep.x, deep.z, t) <= 0, 'on dry land')
  assert.ok(Math.abs(deep.x) <= walkBound(t.size) && Math.abs(deep.z) <= walkBound(t.size))
  assert.equal(deep.x, 1, 'the nearest dry cell, not any dry cell')
  // Outside the map: pulled back inside the edge margin.
  const out = settleWalker(40, -40, t)
  assert.equal(out.moved, true)
  assert.ok(Math.abs(out.x) <= walkBound(t.size) && Math.abs(out.z) <= walkBound(t.size))
  assert.ok(waterDepth(out.x, out.z, t) <= WADE_DEPTH_M)
  // Junk coordinates do not throw and land inside.
  const junk = settleWalker(Number.NaN, Infinity, t)
  assert.ok(Number.isFinite(junk.x) && Number.isFinite(junk.z))
})

test('settleWalker: after the ground is lowered under the walker, they are moved off it', () => {
  const size = 5
  const h = new Float32Array(size * size).fill(120)
  const t: WalkTerrain = { heightmap: h, size, cellSizeM: 30, waterLevelM: 100 }
  assert.equal(settleWalker(0, 0, t).moved, false)
  h[2 * size + 2] = 60 // a brush edit digs a deep hole under them
  const after = settleWalker(0, 0, t)
  assert.equal(after.moved, true)
  assert.ok(waterDepth(after.x, after.z, t) <= 0)
})

test('look settings: the defaults are the behaviour before the settings existed', () => {
  assert.deepEqual(DEFAULT_LOOK, { sensitivity: 1, invertY: false, fov: 68 })
  assert.ok(WALK_FOV_RANGE.min <= DEFAULT_LOOK.fov && DEFAULT_LOOK.fov <= WALK_FOV_RANGE.max)
})

test('readCell: the exit payload names the class, confidence and low-trust flag of the cell stood on', () => {
  const size = 3
  const heightmap = new Float32Array(size * size).fill(200)
  heightmap[0] = 50 // one water cell
  const arrays = {
    heightmap,
    size,
    waterLevelM: 100,
    classes: ['Spruce/Fir', 'Lodgepole Pine'],
    cover: new Uint8Array([0, 1, 1, 0, 1, 0, 0, 0, 1]),
    confidence: new Float32Array(9).fill(0.5).fill(0.91, 4, 5),
    ood: new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0]),
  }
  assert.deepEqual(readCell(1, 1, arrays), { x: 1, y: 1, water: false, classIndex: 1, className: 'Lodgepole Pine', confidence: Math.fround(0.91), lowTrust: true })
  const water = readCell(0, 0, arrays)
  assert.equal(water.water, true)
  assert.equal(water.className, null)
  assert.equal(water.lowTrust, false)
  // No cover map yet, or one of the wrong size: no prediction, no crash.
  assert.equal(readCell(1, 1, { ...arrays, cover: null }).className, null)
  assert.equal(readCell(1, 1, { ...arrays, cover: new Uint8Array(4) }).className, null)
  // Out-of-range coordinates clamp to the map.
  assert.deepEqual([readCell(9, -4, arrays).x, readCell(9, -4, arrays).y], [2, 0])
})

// ---- D16: animal pace -------------------------------------------------------------

test('paceScale: slows to about the walker, and never speeds the sim up', () => {
  assert.equal(ANIMAL_PACE, 0.9)
  assert.ok(Math.abs(paceScale(40) - (0.9 * WALK_SPEED) / 40) < 1e-12)
  assert.equal(paceScale(1), 1, 'already slower than the walker: unchanged, not sped up')
  assert.equal(paceScale(0), 1)
  assert.equal(paceScale(Number.NaN), 1)
  // At the scaled clock, a median mover goes ANIMAL_PACE x WALK_SPEED cells a second.
  assert.ok(Math.abs(40 * paceScale(40) - ANIMAL_PACE * WALK_SPEED) < 1e-9)
})

test('animal speed control: match walker, 2x, 4x, full, paused; the key cycles through them', () => {
  const pace = 0.06
  assert.equal(animalTimeScale('match', pace), pace)
  assert.equal(animalTimeScale('x2', pace), pace * 2)
  assert.equal(animalTimeScale('x4', pace), pace * 4)
  assert.equal(animalTimeScale('full', pace), 1)
  assert.equal(animalTimeScale('paused', pace), 0)
  assert.equal(animalTimeScale('x4', 0.5), 1, 'never above full sim speed')
  assert.deepEqual(
    ANIMAL_SPEEDS.map((s) => s.id),
    ['match', 'x2', 'x4', 'full', 'paused'],
  )
  let c = ANIMAL_SPEEDS[0].id
  const seen = [c]
  for (let i = 0; i < ANIMAL_SPEEDS.length; i++) {
    c = nextAnimalSpeed(c)
    seen.push(c)
  }
  assert.deepEqual(seen, ['match', 'x2', 'x4', 'full', 'paused', 'match'])
})

test('PaceMeter: median speed of the animals that moved, in cells per second', () => {
  const m = new PaceMeter()
  assert.equal(m.read(), 0)
  // Three herbivores: one stands, one walks 2 cells/s, one 4 cells/s. One predator at 3 cells/s.
  const frame = (t: number) => ({
    h: new Float32Array([5, 5, 0, 10 + 2 * t, 10, 0, 20, 20 + 4 * t, 0]),
    p: new Float32Array([30 + 3 * t, 30, 0]),
  })
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const f = frame(t)
    m.sample(f.h, f.p, 3, t)
  }
  assert.ok(Math.abs(m.read() - 3) < 0.05, 'median of 2, 3 and 4; the standing animal is not counted')
  assert.equal(m.read(), 0, 'nothing moved since the last reading')
  // A changed count (a birth) starts that species over instead of comparing different animals.
  m.sample(new Float32Array([1, 1, 0]), null, 3, 2)
  m.sample(new Float32Array([1, 1, 0, 50, 50, 0]), null, 3, 2.1)
  assert.equal(m.read(), 0)
})

// ---- D18: ground detail texture ---------------------------------------------------

test('ground detail: procedural, deterministic, tiling and not flat', () => {
  const a = groundDetailPixels()
  const b = groundDetailPixels()
  assert.equal(a.length, DETAIL_SIZE * DETAIL_SIZE)
  assert.deepEqual(a, b)
  let lo = 255
  let hi = 0
  for (const v of a) {
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  assert.ok(hi - lo > 80, 'has grain')
  // Tiling: the step across the wrap is no bigger than steps inside the texture.
  let inside = 0
  let seam = 0
  for (let y = 0; y < DETAIL_SIZE; y++) {
    for (let x = 0; x < DETAIL_SIZE - 1; x++) inside = Math.max(inside, Math.abs(a[y * DETAIL_SIZE + x] - a[y * DETAIL_SIZE + x + 1]))
    seam = Math.max(seam, Math.abs(a[y * DETAIL_SIZE + DETAIL_SIZE - 1] - a[y * DETAIL_SIZE]))
  }
  assert.ok(seam <= inside, `seam ${seam} vs inside ${inside}`)
})
