// Role 1 extended scope (D8-D13): walk physics, vegetation placement,
// day/night, quality presets and save/share. All three-free.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { heightmapToInputs } from '../src/lib/deps/features.ts'
import { advanceHour, dayState, formatHour, MIN_LIGHT_ALTITUDE, wrapHour } from '../src/lib/world/daynight.ts'
import { desaturate, luminance, PALETTE, saturation, toLinear } from '../src/lib/world/palette.ts'
import { FpsGuard, lowerPreset, minPreset, QUALITY, TARGET_FPS } from '../src/lib/world/quality.ts'
import { exportShareCode, importWorld, isShareCode, MAX_IMPORT_CHARS, readWorldInput, SHARE_CODE_PREFIX } from '../src/lib/world/share.ts'
import { restoreTerrain, toSavedWorld } from '../src/lib/state/worldTerrain.ts'
import type { WorldTerrain } from '../src/lib/state/worldTerrain.ts'
import { generateTerrain } from '../src/lib/world/terrain.ts'
import {
  CHUNK_CELLS,
  chunkInRange,
  countPlants,
  GRASS_RADIUS,
  OOD_DENSITY,
  PATCH_DENSITY,
  PATCH_RADIUS_MAX,
  PATCH_RADIUS_MIN,
  patchDensity,
  patchWeight,
  placeGrass,
  placeVegetation,
  PLAINS_DENSITY,
  PLANT_STRIDE,
  plantTint,
  SPECIES,
} from '../src/lib/world/vegetation.ts'
import {
  compassPoint,
  EYE_HEIGHT,
  eyeY,
  findSpawn,
  getGroundHeight,
  RUN_SPEED,
  SLOPE_LIMIT,
  stepWalk,
  WADE_DEPTH_M,
  WADE_SPEED_FACTOR,
  walkBound,
  WALK_SPEED,
  yawToBearing,
} from '../src/lib/world/walk.ts'
import type { WalkTerrain } from '../src/lib/world/walk.ts'
import { VERTICAL_EXAGGERATION } from '../src/lib/world/coords.ts'

// ---- D8: getGroundHeight -------------------------------------------------------

// 3 x 3 heightmap, row-major (index = y * 3 + x), 30 m cells. World (0, 0) is
// the center cell; -X is west, -Z is north.
//   y=0 (north):  10  20  30
//   y=1:          40  50  60
//   y=2 (south):  70  80  90
const TINY: WalkTerrain = { heightmap: Float32Array.from([10, 20, 30, 40, 50, 60, 70, 80, 90]), size: 3, cellSizeM: 30, waterLevelM: 0 }

test('getGroundHeight: exact at cell centers, bilinear in between, clamped outside', () => {
  assert.equal(getGroundHeight(0, 0, TINY), 50) // center cell (1, 1)
  assert.equal(getGroundHeight(-1, -1, TINY), 10) // north-west cell (0, 0)
  assert.equal(getGroundHeight(1, -1, TINY), 30) // north-east cell (2, 0)
  assert.equal(getGroundHeight(-1, 1, TINY), 70) // south-west cell (0, 2)
  // Halfway between two cells along X, then along Z.
  assert.equal(getGroundHeight(0.5, 0, TINY), 55)
  assert.equal(getGroundHeight(0, -0.5, TINY), 35)
  // Middle of the four north-west cells: the mean of 10, 20, 40, 50.
  assert.equal(getGroundHeight(-0.5, -0.5, TINY), 30)
  // A quarter of the way: weights 0.75/0.25 on each axis.
  assert.ok(Math.abs(getGroundHeight(-0.75, -0.75, TINY) - (10 + 0.25 * 10 + 0.25 * 30)) < 1e-9)
  // Off the map: clamped to the edge.
  assert.equal(getGroundHeight(-50, -50, TINY), 10)
  assert.equal(getGroundHeight(50, 50, TINY), 90)
})

test('getGroundHeight is continuous across a cell boundary (no 30 m steps)', () => {
  const t = generateTerrain({ seed: 3 })
  const w: WalkTerrain = { heightmap: t.heightmap, size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM }
  for (let k = 0; k < 200; k++) {
    const x = -20 + k * 0.2
    assert.ok(Math.abs(getGroundHeight(x + 1e-4, 3.3, w) - getGroundHeight(x, 3.3, w)) < 0.05)
  }
})

// ---- D8: movement ------------------------------------------------------------

function flat(size: number, height: number, waterLevelM = -1000): WalkTerrain {
  return { heightmap: new Float32Array(size * size).fill(height), size, cellSizeM: 30, waterLevelM }
}

test('walk constants are sane, and the eye stays above water while wading', () => {
  assert.ok(WALK_SPEED > 0 && RUN_SPEED > WALK_SPEED)
  assert.ok(SLOPE_LIMIT > 0 && SLOPE_LIMIT < 90)
  assert.ok(WADE_SPEED_FACTOR > 0 && WADE_SPEED_FACTOR < 1)
  // Deepest wade, in world units, is shallower than the eye height.
  assert.ok((WADE_DEPTH_M / 30) * VERTICAL_EXAGGERATION < EYE_HEIGHT)
  assert.equal(eyeY(2, -5), 2 + EYE_HEIGHT)
  assert.ok(eyeY(0, 3) > 3, 'never under the surface')
})

test('walking follows the camera yaw; running is faster', () => {
  const t = flat(33, 100)
  const north = stepWalk(0, 0, { forward: 1, strafe: 0, run: false, yaw: 0 }, 1, t)
  assert.ok(Math.abs(north.x) < 1e-9)
  assert.ok(Math.abs(north.z + WALK_SPEED) < 1e-9, 'yaw 0 walks north (-Z)')
  const east = stepWalk(0, 0, { forward: 0, strafe: 1, run: false, yaw: 0 }, 1, t)
  assert.ok(Math.abs(east.x - WALK_SPEED) < 1e-9, 'strafing right at yaw 0 goes east (+X)')
  const west = stepWalk(0, 0, { forward: 1, strafe: 0, run: false, yaw: Math.PI / 2 }, 1, t)
  assert.ok(Math.abs(west.x + WALK_SPEED) < 1e-9, 'turning left by 90 degrees faces west')
  const run = stepWalk(0, 0, { forward: 1, strafe: 0, run: true, yaw: 0 }, 1, t)
  assert.ok(Math.abs(run.z + RUN_SPEED) < 1e-9)
  // Diagonal input is not faster than straight.
  const diag = stepWalk(0, 0, { forward: 1, strafe: 1, run: false, yaw: 0 }, 1, t)
  assert.ok(Math.abs(Math.hypot(diag.x, diag.z) - WALK_SPEED) < 1e-9)
  assert.equal(north.blocked, 'none')
  assert.equal(north.groundM, 100)
})

test('the walker cannot cross the map edge', () => {
  const t = flat(17, 100)
  const bound = walkBound(17)
  let p = { x: 0, z: 0 }
  for (let k = 0; k < 200; k++) {
    const s = stepWalk(p.x, p.z, { forward: 1, strafe: 0.3, run: true, yaw: -0.7 }, 0.1, t)
    p = { x: s.x, z: s.z }
    assert.ok(Math.abs(p.x) <= bound && Math.abs(p.z) <= bound)
  }
  assert.equal(Math.max(Math.abs(p.x), Math.abs(p.z)), bound, 'pinned to the edge')
  assert.equal(stepWalk(p.x, p.z, { forward: 1, strafe: 0.3, run: true, yaw: -0.7 }, 0.1, t).blocked, 'edge')
  // A position outside the map (a smaller terrain was loaded) is pulled back in.
  const back = stepWalk(500, -500, { forward: 0, strafe: 0, run: false, yaw: 0 }, 0.1, t)
  assert.deepEqual([back.x, back.z], [bound, -bound])
})

test('slopes steeper than SLOPE_LIMIT block the climb, never the descent', () => {
  // Ground rises to the east: `grade` meters per meter.
  const ramp = (grade: number): WalkTerrain => {
    const size = 17
    const h = new Float32Array(size * size)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = 1000 + x * 30 * grade
    return { heightmap: h, size, cellSizeM: 30, waterLevelM: -1000 }
  }
  const eastward = { forward: 0, strafe: 1, run: false, yaw: 0 }
  const westward = { forward: 0, strafe: -1, run: false, yaw: 0 }
  const gentle = Math.tan(((SLOPE_LIMIT - 5) * Math.PI) / 180)
  const steep = Math.tan(((SLOPE_LIMIT + 5) * Math.PI) / 180)
  assert.ok(stepWalk(0, 0, eastward, 0.1, ramp(gentle)).x > 0, 'a slope under the limit is climbed')
  const up = stepWalk(0, 0, eastward, 0.1, ramp(steep))
  assert.equal(up.x, 0)
  assert.equal(up.blocked, 'slope')
  assert.ok(stepWalk(0, 0, westward, 0.1, ramp(steep)).x < 0, 'going down is allowed')
  // Crossing a slope at an angle is less steep than going straight up it, so
  // the diagonal is allowed here...
  assert.ok(stepWalk(0, 0, { forward: 1, strafe: 1, run: false, yaw: 0 }, 0.1, ramp(steep)).x > 0)
  // ...but not on a cliff. There the walker slides: the northward part is kept.
  const slide = stepWalk(0, 0, { forward: 1, strafe: 1, run: false, yaw: 0 }, 0.1, ramp(Math.tan((75 * Math.PI) / 180)))
  assert.equal(slide.x, 0)
  assert.ok(slide.z < 0)
  assert.equal(slide.blocked, 'slope')
})

test('water: shallows are waded slowly, deep water is blocked', () => {
  // A beach sloping down to the east at 2 m per cell; the waterline is at x = 8.
  const size = 33
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = 1000 - x * 2
  const t: WalkTerrain = { heightmap: h, size, cellSizeM: 30, waterLevelM: 1000 - 8 * 2 }
  const half = (size - 1) / 2
  const east = { forward: 0, strafe: 1, run: false, yaw: 0 }

  const dry = stepWalk(4 - half, 0, east, 0.1, t)
  assert.equal(dry.wading, false)
  assert.ok(Math.abs(dry.x - (4 - half) - WALK_SPEED * 0.1) < 1e-9)

  const wet = stepWalk(9 - half, 0, east, 0.1, t) // 2 m deep
  assert.equal(wet.wading, true)
  assert.ok(Math.abs(wet.x - (9 - half) - WALK_SPEED * WADE_SPEED_FACTOR * 0.1) < 1e-9, 'wading is slower')

  // Keep walking east: the walker stops where the water reaches WADE_DEPTH_M.
  let x = 9 - half
  let last = wet
  for (let k = 0; k < 400; k++) {
    last = stepWalk(x, 0, east, 0.1, t)
    x = last.x
  }
  assert.equal(last.blocked, 'water')
  assert.ok(last.depthM <= WADE_DEPTH_M + 1e-6 && last.depthM > WADE_DEPTH_M - 1)
  // From too deep (the water rose), moving back to the shallows is allowed.
  const deepX = 20 - half
  assert.ok(stepWalk(deepX, 0, { forward: 0, strafe: -1, run: false, yaw: 0 }, 0.1, t).x < deepX)
  assert.equal(stepWalk(deepX, 0, east, 0.1, t).x, deepX)
})

test('spawn lands on the dry cell nearest to the wanted point', () => {
  const t = generateTerrain({ seed: 7, waterLevel: 0.3 })
  const w: WalkTerrain = { heightmap: t.heightmap, size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM }
  const s = findSpawn(0, 0, w) // the valley in the middle is under water
  assert.ok(getGroundHeight(s.x, s.z, w) >= w.waterLevelM)
  assert.ok(Math.abs(s.x) <= walkBound(w.size) && Math.abs(s.z) <= walkBound(w.size))
  // All water: falls back to the highest cell instead of failing.
  const drowned = findSpawn(0, 0, { ...w, waterLevelM: 1e6 })
  assert.ok(Number.isFinite(drowned.x) && Number.isFinite(drowned.z))
})

test('compass: yaw 0 looks north, turning left looks west', () => {
  assert.equal(yawToBearing(0), 0)
  assert.equal(yawToBearing(Math.PI / 2), 270)
  assert.equal(yawToBearing(-Math.PI / 2), 90)
  assert.equal(compassPoint(0), 'N')
  assert.equal(compassPoint(90), 'E')
  assert.equal(compassPoint(200), 'S')
  assert.equal(compassPoint(359), 'N')
})

// ---- D9: vegetation ---------------------------------------------------------

function tinyForest(over: { ood?: Uint8Array | null; seed?: number; density?: number; cover?: Uint8Array } = {}) {
  const size = 8
  const heightmap = new Float32Array(size * size).fill(100)
  heightmap[0] = 10 // one water cell
  const cover = over.cover ?? Uint8Array.from({ length: size * size }, (_, i) => i % 7)
  return placeVegetation({ size, cellSizeM: 30, heightmap, waterLevelM: 50, cover, ood: over.ood ?? null, seed: over.seed ?? 42, density: over.density ?? 1 })
}

const flatten = (batches: ReturnType<typeof placeVegetation>) => batches.map((b) => [b.chunkX, b.chunkY, b.classIndex, b.count, Array.from(b.plants)])

test('vegetation: the same seed gives the same forest; another seed gives another', () => {
  assert.deepEqual(flatten(tinyForest()), flatten(tinyForest()))
  assert.notDeepEqual(flatten(tinyForest({ seed: 43 })), flatten(tinyForest()))
})

test('vegetation: one silhouette per cover class, plants stay in their own cell, none in water', () => {
  assert.equal(SPECIES.length, 7)
  assert.equal(new Set(SPECIES.map((s) => s.silhouette)).size, 7, '7 distinct silhouettes')
  assert.equal(PALETTE.vegetation.classTints.length, 7)
  assert.equal(new Set(PALETTE.vegetation.classTints).size, 7, '7 distinct tints')
  const batches = tinyForest()
  assert.deepEqual([...new Set(batches.map((b) => b.classIndex))].sort(), [0, 1, 2, 3, 4, 5, 6])
  for (const b of batches) {
    assert.equal(b.plants.length, b.count * PLANT_STRIDE)
    for (let k = 0; k < b.count; k++) {
      const x = Math.round(b.plants[k * PLANT_STRIDE]) + 0 // + 0: Math.round(-0.3) is -0
      const y = Math.round(b.plants[k * PLANT_STRIDE + 1]) + 0
      assert.equal((y * 8 + x) % 7, b.classIndex, 'the plant matches its cell class')
      assert.notEqual(y * 8 + x, 0, 'no plant in the water cell')
      assert.equal(Math.floor(x / CHUNK_CELLS), b.chunkX)
      assert.equal(Math.floor(y / CHUNK_CELLS), b.chunkY)
    }
  }
})

test('vegetation: low-trust (OOD) cells are sparse and desaturated', () => {
  const size = 32
  const heightmap = new Float32Array(size * size).fill(100)
  const cover = new Uint8Array(size * size).fill(3)
  const input = { size, cellSizeM: 30, heightmap, waterLevelM: 50, cover, seed: 9, density: 1 }
  const trusted = placeVegetation({ ...input, ood: null })
  const unsure = placeVegetation({ ...input, ood: new Uint8Array(size * size).fill(1) })
  const ratio = countPlants(unsure) / countPlants(trusted)
  assert.ok(Math.abs(ratio - OOD_DENSITY) < 0.08, `sparse: ${ratio}`)
  const meanSat = (bs: typeof trusted) => {
    let s = 0
    let n = 0
    for (const b of bs)
      for (let k = 0; k < b.count; k++) {
        s += saturation([b.plants[k * PLANT_STRIDE + 4], b.plants[k * PLANT_STRIDE + 5], b.plants[k * PLANT_STRIDE + 6]])
        n++
      }
    return s / n
  }
  assert.ok(meanSat(unsure) < meanSat(trusted) * 0.5, 'washed out')
  for (let c = 0; c < 7; c++) assert.ok(saturation(plantTint(c, true, 0.5)) < saturation(plantTint(c, false, 0.5)))
  // Only the flagged cell changes: plants elsewhere do not move.
  const one = new Uint8Array(size * size)
  one[5 * size + 5] = 1
  const partial = placeVegetation({ ...input, ood: one })
  assert.ok(countPlants(partial) <= countPlants(trusted))
  assert.ok(countPlants(trusted) - countPlants(partial) <= 2)
})

test('vegetation: density scales the forest, steep cells stay bare', () => {
  assert.ok(countPlants(tinyForest({ density: 0.3 })) < countPlants(tinyForest({ density: 1 })))
  assert.equal(countPlants(tinyForest({ density: 0 })), 0)
  const size = 8
  const cliff = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cliff[y * size + x] = 1000 + x * 60 // 63 degrees
  const cover = new Uint8Array(size * size)
  // Interior cells are too steep for plants (edge cells use a clamped difference).
  const batches = placeVegetation({ size, cellSizeM: 30, heightmap: cliff, waterLevelM: 0, cover, ood: null, seed: 1, density: 1 })
  for (const b of batches) for (let k = 0; k < b.count; k++) assert.ok([0, size - 1].includes(Math.round(b.plants[k * PLANT_STRIDE])))
  assert.throws(() => placeVegetation({ size, cellSizeM: 30, heightmap: cliff, waterLevelM: 0, cover: new Uint8Array(3), ood: null, seed: 1, density: 1 }))
})

// ---- D21: sparse trees, small forest patches --------------------------------------

/** Flat dry land, one cover class everywhere: only the patches decide where trees go. */
function plain(size: number, classIndex: number, over: { seed?: number; density?: number; ood?: Uint8Array | null } = {}) {
  const heightmap = new Float32Array(size * size).fill(100)
  const cover = new Uint8Array(size * size).fill(classIndex)
  return placeVegetation({ size, cellSizeM: 30, heightmap, waterLevelM: 50, cover, ood: over.ood ?? null, seed: over.seed ?? 7, density: over.density ?? 0.6 })
}

/** Cells (y * size + x) holding at least one plant. */
function plantedCells(batches: ReturnType<typeof placeVegetation>, size: number): Set<number> {
  const out = new Set<number>()
  for (const b of batches) for (let k = 0; k < b.count; k++) out.add((Math.round(b.plants[k * PLANT_STRIDE + 1]) + 0) * size + (Math.round(b.plants[k * PLANT_STRIDE]) + 0))
  return out
}

test('patches: the same seed and cover map give the same patches; another seed moves them', () => {
  assert.deepEqual(flatten(plain(48, 1)), flatten(plain(48, 1)))
  assert.notDeepEqual([...plantedCells(plain(48, 1, { seed: 8 }), 48)], [...plantedCells(plain(48, 1), 48)])
  for (let y = 0; y < 48; y += 5) for (let x = 0; x < 48; x += 3) assert.equal(patchWeight(7, x, y), patchWeight(7, x, y))
})

test('patches: open plains, so more than half the land cells have no tree', () => {
  const size = 64
  const planted = plantedCells(plain(size, 1), size)
  assert.ok(planted.size < (size * size) / 2, `${planted.size} of ${size * size} cells have a tree`)
  // ...and there is forest: some cells are dense.
  assert.ok(planted.size > size * size * 0.05)
  assert.equal(patchDensity(7, 0, 0) >= PLAINS_DENSITY && patchDensity(7, 0, 0) <= PATCH_DENSITY, true)
})

test('patches: small, about 6-15 cells across', () => {
  // Equal-area diameter of every connected patch that is not cut by the map edge.
  const size = 128
  const sizes: number[] = []
  for (const seed of [3, 7, 11]) {
    const inPatch = (x: number, y: number) => patchWeight(seed, x, y) > 0.02
    const seen = new Uint8Array(size * size)
    for (let i = 0; i < seen.length; i++) {
      if (seen[i] || !inPatch(i % size, Math.floor(i / size))) continue
      const stack = [i]
      seen[i] = 1
      let area = 0
      let edge = false
      while (stack.length) {
        const j = stack.pop()!
        const x = j % size
        const y = Math.floor(j / size)
        area++
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) edge = true
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen[ny * size + nx] || !inPatch(nx, ny)) continue
          seen[ny * size + nx] = 1
          stack.push(ny * size + nx)
        }
      }
      if (!edge) sizes.push(2 * Math.sqrt(area / Math.PI))
    }
  }
  sizes.sort((a, b) => a - b)
  const median = sizes[sizes.length >> 1]
  assert.ok(sizes.length > 20, `${sizes.length} patches`)
  assert.ok(median >= 6 && median <= 15, `median patch ${median.toFixed(1)} cells across`)
  assert.ok(sizes[Math.floor(sizes.length * 0.1)] >= 2 * PATCH_RADIUS_MIN - 2, 'no specks')
  assert.ok(sizes[Math.floor(sizes.length * 0.9)] <= 2 * PATCH_RADIUS_MAX + 3, 'no big merged forests')
})

test('patches: the cover class still picks the silhouette; shrubs keep their own density', () => {
  // Each plant matches the class of its cell, inside and outside patches.
  const size = 32
  const heightmap = new Float32Array(size * size).fill(100)
  const cover = Uint8Array.from({ length: size * size }, (_, i) => i % 7)
  const batches = placeVegetation({ size, cellSizeM: 30, heightmap, waterLevelM: 50, cover, ood: null, seed: 5, density: 1 })
  for (const b of batches)
    for (let k = 0; k < b.count; k++) {
      const x = Math.round(b.plants[k * PLANT_STRIDE]) + 0
      const y = Math.round(b.plants[k * PLANT_STRIDE + 1]) + 0
      assert.equal(cover[y * size + x], b.classIndex)
    }
  // Krummholz is not patchy: every land cell keeps its shrubs, patch or plains.
  assert.equal(SPECIES[6].patchy, false)
  assert.ok(SPECIES.slice(0, 6).every((s) => s.patchy))
  const shrubs = plain(32, 6, { density: 1 })
  assert.equal(plantedCells(shrubs, 32).size, 32 * 32, 'shrubs everywhere')
  assert.ok(Math.abs(countPlants(shrubs) / (32 * 32) - SPECIES[6].perCell) < 0.1)
})

test('patches: the OOD rule applies on top, so low-trust cells stay sparser', () => {
  const size = 64
  const trusted = countPlants(plain(size, 1))
  const unsure = countPlants(plain(size, 1, { ood: new Uint8Array(size * size).fill(1) }))
  const ratio = unsure / trusted
  assert.ok(Math.abs(ratio - OOD_DENSITY) < 0.08, `low trust keeps ${ratio.toFixed(2)} of the trees`)
})

test('patches: quality presets scale the density, not the layout', () => {
  const size = 64
  const inPatch = (batches: ReturnType<typeof placeVegetation>) => {
    let n = 0
    let total = 0
    for (const b of batches)
      for (let k = 0; k < b.count; k++) {
        total++
        if (patchWeight(7, Math.round(b.plants[k * PLANT_STRIDE]), Math.round(b.plants[k * PLANT_STRIDE + 1])) > 0) n++
      }
    return n / total
  }
  const counts = [QUALITY.low, QUALITY.medium, QUALITY.high].map((q) => plain(size, 1, { density: q.vegetationDensity }))
  // PLAINS_DENSITY leaves a lone tree here and there; the rest stand in the patches, the same share on every preset.
  const shares = counts.map(inPatch)
  for (const s of shares) assert.ok(s > 0.85, `share of trees inside patches: ${s.toFixed(2)}`)
  assert.ok(Math.max(...shares) - Math.min(...shares) < 0.05, `same layout on every preset: ${shares.map((s) => s.toFixed(2)).join(', ')}`)
  assert.ok(countPlants(counts[0]) < countPlants(counts[1]) && countPlants(counts[1]) < countPlants(counts[2]))
})

test('vegetation culling: a chunk is kept while any part is within the radius', () => {
  assert.equal(chunkInRange(0, 0, 8, 8, 1), true, 'standing inside it')
  assert.equal(chunkInRange(1, 0, 8, 8, 5), false, 'next chunk starts 7.5 cells away')
  assert.equal(chunkInRange(1, 0, 8, 8, 8), true)
  assert.equal(chunkInRange(3, 3, 0, 0, 40), false)
  assert.equal(chunkInRange(3, 3, 0, 0, 70), true)
})

test('grass: seeded, near the walker only, and stable when the walker moves', () => {
  const size = 64
  const heightmap = new Float32Array(size * size).fill(100)
  const base = { size, cellSizeM: 30, heightmap, waterLevelM: 50, cover: null, ood: null, seed: 5, perCell: 4 }
  const a = placeGrass({ ...base, centerX: 30, centerY: 30 })
  assert.deepEqual(Array.from(a), Array.from(placeGrass({ ...base, centerX: 30, centerY: 30 })))
  assert.ok(a.length > 0 && a.length % PLANT_STRIDE === 0)
  const at = new Map<string, number>()
  for (let k = 0; k < a.length; k += PLANT_STRIDE) {
    assert.ok(Math.hypot(a[k] - 30, a[k + 1] - 30) <= GRASS_RADIUS)
    at.set(`${a[k]},${a[k + 1]}`, a[k + 3])
  }
  // After a step, tufts that are still in range are at the same spot with the same rotation.
  const b = placeGrass({ ...base, centerX: 31, centerY: 30 })
  let shared = 0
  for (let k = 0; k < b.length; k += PLANT_STRIDE) {
    const rot = at.get(`${b[k]},${b[k + 1]}`)
    if (rot !== undefined) {
      assert.equal(rot, b[k + 3])
      shared++
    }
  }
  assert.ok(shared > a.length / PLANT_STRIDE / 2)
  assert.equal(placeGrass({ ...base, perCell: 0, centerX: 30, centerY: 30 }).length, 0)
})

// ---- D10: day/night ------------------------------------------------------------

test('day/night: the sun rises in the east, peaks in the south, sets in the west', () => {
  const noon = dayState(12)
  assert.ok(noon.sunDir[1] > 0.7 && noon.sunDir[2] > 0, 'high, toward +Z (south)')
  assert.ok(dayState(6.5).sunDir[0] > 0.9, 'east at sunrise')
  assert.ok(dayState(17.5).sunDir[0] < -0.9, 'west at sunset')
  assert.ok(dayState(0).sunDir[1] < -0.7, 'below the ground at midnight')
  for (const h of [0, 3, 5.9, 6, 6.1, 9, 12, 15, 17.9, 18, 18.1, 21, 24]) {
    const s = dayState(h)
    assert.ok(Math.abs(Math.hypot(...s.sunDir) - 1) < 1e-9)
    assert.ok(Math.abs(Math.hypot(...s.lightDir) - 1) < 1e-9)
    assert.ok(s.lightDir[1] >= MIN_LIGHT_ALTITUDE - 1e-9, 'the light never comes from below')
    assert.ok(Math.abs(s.day + s.twilight + s.night - 1) < 1e-9)
    assert.ok(s.lightIntensity >= 0 && s.ambientIntensity > 0)
    for (const c of [s.zenith, s.fog, s.waterShallow, s.waterDeep, s.ambientSky, s.lightColor]) for (const v of c) assert.ok(v >= 0 && v <= 1)
  }
})

test('day/night: night is dim with stars; day is bright without; the cycle wraps', () => {
  const night = dayState(0)
  const day = dayState(12)
  assert.equal(night.night, 1)
  assert.equal(day.day, 1)
  assert.equal(night.stars, 1)
  assert.equal(day.stars, 0)
  assert.ok(luminance(night.zenith) < luminance(day.zenith) / 4)
  assert.ok(luminance(night.fog) < luminance(day.fog) / 4)
  assert.ok(luminance(night.waterShallow) < luminance(day.waterShallow))
  assert.ok(night.lightIntensity < day.lightIntensity / 3)
  assert.ok(night.ambientIntensity < day.ambientIntensity)
  assert.deepEqual(day.fog, toLinear(PALETTE.time.day.fog), 'colors come from the palette')
  assert.deepEqual(night.waterDeep, toLinear(PALETTE.time.night.waterDeep))
  assert.deepEqual(dayState(24), dayState(0))
  assert.deepEqual(dayState(-2), dayState(22))
  // No jump at sunrise or sunset: the light fades through zero.
  assert.ok(dayState(6).lightIntensity < 0.01 && dayState(18).lightIntensity < 0.01)
  assert.ok(Math.abs(dayState(5.99).lightIntensity - dayState(6.01).lightIntensity) < 0.01)
})

test('day/night: auto-cycle advances and wraps', () => {
  assert.equal(advanceHour(10, 0), 10)
  assert.equal(advanceHour(10, 240, 240), 10, 'one day later')
  assert.ok(Math.abs(advanceHour(23, 20, 240) - 1) < 1e-9)
  assert.equal(wrapHour(25), 1)
  assert.equal(formatHour(6.5), '06:30')
  assert.equal(formatHour(23.999), '00:00')
})

test('day/night is cosmetic: the world never imports the feature code, and time of day changes no model input', () => {
  // 1. No file in world/ imports @graze/features (where hillshade and SUN live).
  const dir = new URL('../src/lib/world/', import.meta.url)
  const files = readdirSync(dir).filter((f) => /\.(ts|svelte)$/.test(f))
  assert.ok(files.includes('daynight.ts') && files.includes('scene.ts'))
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8')
    const imports = src.match(/from\s+['"][^'"]+['"]/g) ?? []
    for (const imp of imports) assert.ok(!/deps\/features|packages\/features|@graze\/features/.test(imp), `${f} must not import the feature code (${imp})`)
  }
  // 2. The model inputs are a function of the heightmap and the water level
  //    only. Computing every lighting state in between changes nothing.
  const t = generateTerrain({ seed: 11 })
  const opts = { size: t.size, cellSizeM: t.cellSizeM, waterLevelM: t.waterLevelM }
  const before = heightmapToInputs(t.heightmap, opts).packed.slice()
  for (let h = 0; h < 24; h += 1.5) dayState(h)
  assert.deepEqual(heightmapToInputs(t.heightmap, opts).packed, before)
})

// ---- D12: quality --------------------------------------------------------------

test('quality presets step down in every cost', () => {
  const { low, medium, high } = QUALITY
  for (const k of ['vegetationDensity', 'grassPerCell', 'shadowMapSize', 'drawDistance', 'pixelRatioCap'] as const) {
    assert.ok(low[k] <= medium[k] && medium[k] <= high[k], k)
    assert.ok(low[k] < high[k], k)
  }
  assert.equal(lowerPreset('high'), 'medium')
  assert.equal(lowerPreset('medium'), 'low')
  assert.equal(lowerPreset('low'), null)
  assert.equal(minPreset('high', 'low'), 'low')
  assert.equal(minPreset('medium', 'high'), 'medium')
})

test('fps guard: reports only after several seconds under the target', () => {
  const g = new FpsGuard(TARGET_FPS, 4, 2)
  const run = (fps: number, seconds: number) => {
    let fired = 0
    for (let t = 0; t < seconds; t += 1 / fps) if (g.frame(1 / fps)) fired++
    return fired
  }
  assert.equal(run(60, 10), 0, 'fast: never')
  assert.ok(Math.abs(g.fps - 60) < 1)
  assert.equal(run(20, 3), 0, 'slow, but not for long enough')
  assert.equal(run(60, 2), 0, 'recovered: the timer starts over')
  assert.equal(run(20, 3), 0)
  assert.equal(run(20, 3), 1, 'slow for more than 4 s: reported once')
  // A long gap (hidden tab) is not a slow frame; the grace period follows it.
  assert.equal(g.frame(5), false)
  assert.equal(run(10, 1.5), 0, 'grace period after a restart')
  g.reset()
  assert.equal(g.fps, 0)
})

// ---- D13: save / load / share --------------------------------------------------

const ELEV = { min: 1859, max: 3858 }
const CONFIG = { seed: 21, center: 0.4, waterShare: 0.2, relief: 0.2, roughness: 0.5, valley: 0.35 }

function sculpted(): WorldTerrain {
  const base = generateTerrain({ seed: CONFIG.seed, center: CONFIG.center, relief: CONFIG.relief, roughness: CONFIG.roughness, valley: CONFIG.valley, elevation: ELEV }).heightmap
  const heightmap = base.slice()
  for (let i = 4000; i < 4060; i++) heightmap[i] += 25 // a brush stroke
  return { config: CONFIG, elevation: ELEV, base, heightmap }
}

test('toSavedWorld stores the recipe and a compact edit delta, not the heightmap', () => {
  const t = sculpted()
  const world = toSavedWorld(t, CONFIG.waterShare, '0.1.0-dev')
  assert.equal(world.schemaVersion, 1)
  assert.equal(world.modelVersion, '0.1.0-dev')
  assert.equal(world.seed, 21)
  assert.equal(world.options.waterShare, 0.2)
  assert.equal(world.edits.length, 60 * 2, '60 edited cells, [gap, change] pairs')
  assert.ok(JSON.stringify(world).length < 1500, 'compact')
  assert.equal(toSavedWorld({ ...t, heightmap: t.base }, CONFIG.waterShare, '0.1.0-dev').edits.length, 0)
})

test('share code round trip restores the seed, the water level and the brush edits', async () => {
  const t = sculpted()
  const world = toSavedWorld(t, CONFIG.waterShare, '0.1.0-dev')
  const code = await exportShareCode(world)
  assert.ok(code.startsWith(SHARE_CODE_PREFIX) && isShareCode(code))
  assert.match(code, /^graze1\.[A-Za-z0-9_-]+$/, 'safe to paste and to put in a link')
  const back = await importWorld(`  ${code}\n`)
  assert.ok(back.ok)
  if (!back.ok) return
  assert.deepEqual(back.world, world)
  assert.equal(back.world.schemaVersion, 1)
  assert.equal(back.world.modelVersion, '0.1.0-dev', 'surfaced so the app can re-predict and say so')
  const restored = restoreTerrain(back.world)
  assert.deepEqual(restored.config, CONFIG)
  assert.deepEqual(restored.base, t.base)
  for (let i = 0; i < t.heightmap.length; i++) assert.ok(Math.abs(restored.heightmap[i] - t.heightmap[i]) <= 0.051)
  // The saved-world JSON itself is accepted too.
  const fromJson = await importWorld(JSON.stringify(world))
  assert.ok(fromJson.ok && fromJson.world.seed === 21)
})

test('importWorld: bad, damaged or oversized input gives a friendly message and never throws', async () => {
  const t = sculpted()
  const code = await exportShareCode(toSavedWorld(t, CONFIG.waterShare, '0.1.0-dev'))
  const plain = toSavedWorld({ ...t, heightmap: t.base }, CONFIG.waterShare, '0.1.0-dev')
  const bad: unknown[] = [
    '',
    '   ',
    'hello',
    null,
    42,
    'graze1.',
    'graze1.!!!!',
    'graze1.AAAA',
    code.slice(0, code.length - 12), // truncated
    code.slice(0, 20) + 'x'.repeat(40) + code.slice(60), // corrupted
    'graze0.' + btoa('not json').replace(/=+$/, ''),
    '{"schemaVersion":1}',
    '{"schemaVersion":2,"modelVersion":"1","seed":1,"size":128,"options":{},"edits":[]}',
    JSON.stringify({ ...plain, name: 'extra field' }),
    JSON.stringify({ ...plain, seed: 1.5 }),
    '{' + ' '.repeat(MAX_IMPORT_CHARS),
  ]
  for (const input of bad) {
    const r = await importWorld(input)
    assert.equal(r.ok, false, String(input).slice(0, 40))
    if (!r.ok) assert.ok(r.message.length > 10 && !/undefined|\[object/.test(r.message))
  }
  // A code that inflates past the size limit (a "zip bomb") is refused.
  const bomb = new Blob([new Uint8Array(5_000_000)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const bytes = new Uint8Array(await new Response(bomb).arrayBuffer())
  const r = await importWorld(SHARE_CODE_PREFIX + Buffer.from(bytes).toString('base64url'))
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.message, /too large/)
})

test('readWorldInput sorts codes, JSON, links and ids, with one message for anything else', () => {
  assert.deepEqual(readWorldInput('  graze1.abc '), { kind: 'text', text: 'graze1.abc' })
  assert.deepEqual(readWorldInput('{"seed":1}'), { kind: 'text', text: '{"seed":1}' })
  assert.deepEqual(readWorldInput('ABCDEFGHIJ'), { kind: 'id', id: 'abcdefghij' })
  assert.deepEqual(readWorldInput('https://example.test/app/#/world/abcdefghij'), { kind: 'id', id: 'abcdefghij' })
  for (const bad of ['', 'hello', 'abc', '#/world/short']) {
    const r = readWorldInput(bad)
    assert.equal(r.kind, 'invalid', bad)
    if (r.kind === 'invalid') assert.match(r.message, /graze1\./)
  }
})

test('palette helpers', () => {
  const c = toLinear('#336699')
  assert.ok(saturation(desaturate(c, 1)) < 1e-9)
  assert.deepEqual(desaturate(c, 0), c)
})
