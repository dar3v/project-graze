import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sampleHeight } from '../../terrain/src/index.ts'
import {
  applyMapChange,
  createSim,
  defaultEcology,
  interpolatePoses,
  interpolateSnapshot,
  lerpAngle,
  POSE_STRIDE,
  posesToPositions,
  snapshotPoses,
  stepSim,
  validateRules,
} from '../src/index.ts'
import type { EcologyRules, SimState, SpeciesPoses } from '../src/index.ts'

const W = 24
const H = 24

function rules(): EcologyRules {
  const r = validateRules(defaultEcology, 7)
  if (!r.ok) throw new Error(r.errors.join('; '))
  return r.rules
}

const stripes = () => Uint8Array.from({ length: W * H }, (_, i) => (i % W) % 7)

function sim(seed = 3, passable?: Uint8Array): SimState {
  return createSim({ width: W, height: H, cover: stripes(), passable, rules: rules(), seed })
}

const poses = (ids: number[], xyh: number[]): SpeciesPoses => ({ ids: Uint32Array.from(ids), poses: Float32Array.from(xyh) })

test('snapshotPoses is a copy with id, x, y and heading per animal', () => {
  const s = sim()
  const snap = snapshotPoses(s)
  assert.equal(snap.herbivores.poses.length, s.herbivores.length * POSE_STRIDE)
  s.herbivores.forEach((a, i) => {
    assert.equal(snap.herbivores.ids[i], a.id)
    assert.equal(snap.herbivores.poses[i * POSE_STRIDE], a.x)
    assert.equal(snap.herbivores.poses[i * POSE_STRIDE + 1], a.y)
    assert.ok(Math.abs(snap.herbivores.poses[i * POSE_STRIDE + 2] - a.heading) < 1e-6)
  })
  stepSim(s, 5)
  assert.notDeepEqual(Array.from(snapshotPoses(s).herbivores.poses), Array.from(snap.herbivores.poses))
})

test('heading faces the direction of the last move', () => {
  const s = sim()
  const before = new Map(s.herbivores.map((a) => [a.id, { x: a.x, y: a.y }]))
  stepSim(s, 1)
  let checked = 0
  for (const a of s.herbivores) {
    const b = before.get(a.id)
    if (!b || (b.x === a.x && b.y === a.y)) continue
    assert.ok(Math.abs(a.heading - Math.atan2(a.y - b.y, a.x - b.x)) < 1e-9)
    checked++
  }
  assert.ok(checked > 0)
})

test('interpolatePoses blends matched ids, keeps newborns at their next pose, drops the dead', () => {
  const prev = poses([1, 2, 3], [0, 0, 0, 10, 10, 0, 5, 5, 0])
  const next = poses([1, 4], [2, 4, Math.PI / 2, 7, 7, 1])
  const half = interpolatePoses(prev, next, 0.5)
  assert.deepEqual(Array.from(half), [1, 2, Math.fround(Math.PI / 4), 7, 7, 1])
  assert.deepEqual(Array.from(interpolatePoses(prev, next, 0)).slice(0, 2), [0, 0])
  assert.deepEqual(Array.from(interpolatePoses(prev, next, 1)).slice(0, 2), [2, 4])
  // t is clamped.
  assert.deepEqual(Array.from(interpolatePoses(prev, next, 3)).slice(0, 2), [2, 4])
  // No previous tick: next poses as-is.
  assert.deepEqual(Array.from(interpolatePoses(null, next, 0.3)), Array.from(next.poses))
})

test('lerpAngle takes the short way round', () => {
  const a = 0.9 * Math.PI
  const b = -0.9 * Math.PI
  const mid = lerpAngle(a, b, 0.5)
  assert.ok(Math.abs(Math.cos(mid) - -1) < 1e-9)
})

test('interpolated sim positions stay inside the grid and end on land', () => {
  const water = new Uint8Array(W * H).fill(1)
  for (let y = 0; y < H; y++) for (let x = 10; x < 13; x++) water[y * W + x] = 0
  const s = sim(5, water)
  for (let t = 0; t < 30; t++) {
    const prev = snapshotPoses(s)
    stepSim(s, 2)
    const next = snapshotPoses(s)
    for (const f of [0.25, 0.5, 1]) {
      const p = interpolateSnapshot(prev, next, f).herbivores
      for (let i = 0; i < p.length; i += POSE_STRIDE) {
        assert.ok(p[i] >= 0 && p[i] <= W - 1 && p[i + 1] >= 0 && p[i + 1] <= H - 1)
        if (f === 1) assert.equal(water[p[i + 1] * W + p[i]], 1, 'at a tick boundary every animal stands on land')
      }
    }
  }
})

test('posesToPositions drops the heading', () => {
  assert.deepEqual(Array.from(posesToPositions(Float32Array.from([1, 2, 3, 4, 5, 6]))), [1, 2, 4, 5])
})

test('ground height convention: bilinear sampleHeight at cell coordinates', () => {
  // 3x3 heightmap in meters, row-major: index = y * 3 + x.
  const h = Float32Array.from([100, 110, 120, 200, 210, 220, 300, 310, 320])
  assert.equal(sampleHeight(h, 3, 1, 1), 210, 'cell centers are exact')
  assert.equal(sampleHeight(h, 3, 0.5, 0.5), 155, 'between four cells: mean of the four')
  assert.equal(sampleHeight(h, 3, 1.5, 0), 115)
  assert.equal(sampleHeight(h, 3, -4, 9), 300, 'clamped to the grid')
  // An interpolated animal halfway between (0,0) and (1,1) stands at the bilinear height there.
  const p = interpolatePoses(poses([1], [0, 0, 0]), poses([1], [1, 1, 0]), 0.5)
  assert.equal(sampleHeight(h, 3, p[0], p[1]), 155)
})

test('applyMapChange keeps the run going and moves animals off new water', () => {
  const s = sim(9)
  stepSim(s, 20)
  const tick = s.tick
  const rng = s.rngState
  const ids = s.herbivores.map((a) => a.id).concat(s.predators.map((a) => a.id))

  // Flood the left half.
  const passable = new Uint8Array(W * H).fill(1)
  for (let i = 0; i < W * H; i++) if (i % W < W / 2) passable[i] = 0
  const r = applyMapChange(s, { cover: stripes(), passable })

  assert.equal(s.tick, tick, 'tick kept')
  assert.equal(s.rngState, rng, 'no randomness used')
  assert.equal(r.removed, 0)
  assert.ok(r.moved > 0)
  assert.deepEqual(s.herbivores.map((a) => a.id).concat(s.predators.map((a) => a.id)), ids, 'same animals, same order')
  for (const a of [...s.herbivores, ...s.predators]) assert.equal(passable[a.y * W + a.x], 1)
  for (let i = 0; i < W * H; i++) {
    if (!passable[i]) assert.equal(s.maxBiomass[i], 0)
    assert.ok(s.biomass[i] <= s.maxBiomass[i])
  }
  assert.match(s.events.at(-1)!.message, /Terrain changed/)
  stepSim(s, 10) // still runs
})

test('applyMapChange is deterministic and removes animals only when no land is left', () => {
  const a = sim(4)
  const b = sim(4)
  const passable = Uint8Array.from({ length: W * H }, (_, i) => (i % 3 === 0 ? 0 : 1))
  applyMapChange(a, { cover: stripes(), passable })
  applyMapChange(b, { cover: stripes(), passable })
  stepSim(a, 25)
  stepSim(b, 25)
  assert.deepEqual(snapshotPoses(a), snapshotPoses(b))

  const c = sim(4)
  const n = c.herbivores.length + c.predators.length
  const r = applyMapChange(c, { cover: stripes(), passable: new Uint8Array(W * H) })
  assert.equal(r.removed, n)
  assert.equal(c.herbivores.length + c.predators.length, 0)
  assert.equal(c.totalCapacity, 0)
})

test('applyMapChange rejects a wrong-size map', () => {
  assert.throws(() => applyMapChange(sim(), { cover: new Uint8Array(3) }), /expected/)
})
