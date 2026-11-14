import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  SUN,
  SUN_ASTRONOMICAL,
  distanceToWaterCells,
  heightmapToSamples,
  hillshade,
  slopeAspect,
  solarPosition,
} from '../src/index.ts'

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)

// 3x3 plane rising 30 m per cell toward the east (cell size 30 m):
// dz/dx = 1 -> slope 45 deg; downhill faces west -> aspect 270.
const EAST_RAMP = Float32Array.from([0, 30, 60, 0, 30, 60, 0, 30, 60])

test('slope and aspect on a hand-checkable east-rising plane', () => {
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      const { slopeDeg, aspectDeg } = slopeAspect(EAST_RAMP, 3, 30, x, y)
      close(slopeDeg, 45, 1e-6)
      close(aspectDeg, 270, 1e-6)
    }
})

test('aspect points downhill for all four compass directions', () => {
  // Rising toward the south (row index grows south) -> faces north (0).
  const south = Float32Array.from([0, 0, 0, 10, 10, 10, 20, 20, 20])
  close(slopeAspect(south, 3, 30, 1, 1).aspectDeg, 0)
  // Rising toward the north -> faces south (180).
  const north = Float32Array.from([20, 20, 20, 10, 10, 10, 0, 0, 0])
  close(slopeAspect(north, 3, 30, 1, 1).aspectDeg, 180)
  // Rising toward the west -> faces east (90).
  const west = Float32Array.from([20, 10, 0, 20, 10, 0, 20, 10, 0])
  close(slopeAspect(west, 3, 30, 1, 1).aspectDeg, 90)
  // Flat -> slope 0, aspect 0 by convention.
  const flat = new Float32Array(9).fill(5)
  assert.deepEqual(slopeAspect(flat, 3, 30, 1, 1), { slopeDeg: 0, aspectDeg: 0 })
})

test('solarPosition: noon at the solstice is due south at 90 - lat + decl', () => {
  const noon = solarPosition(40.6, 23.44, 0)
  close(noon.azimuth, 180, 1e-9)
  close(noon.altitude, 90 - 40.6 + 23.44, 1e-9)
  // Morning and afternoon are mirror images about the meridian.
  const am = solarPosition(40.6, 23.44, -45)
  const pm = solarPosition(40.6, 23.44, 45)
  close(am.altitude, pm.altitude)
  close(am.azimuth + pm.azimuth, 360)
  assert.ok(am.azimuth > 90 && am.azimuth < 180)
  assert.deepEqual(SUN_ASTRONOMICAL.hillshadeNoon, noon)
})

test('hillshade: flat ground = 255 * sin(altitude); slope facing the sun at 90 - altitude = 255', () => {
  const sun = { azimuth: 180, altitude: 60 }
  assert.equal(hillshade(0, 0, sun), Math.round(255 * Math.sin(60 * Math.PI / 180)))
  assert.equal(hillshade(30, 180, sun), 255)
  // Facing directly away at a slope steeper than the altitude -> 0 (clamped).
  assert.equal(hillshade(60, 0, sun), 0)
})

test('distanceToWaterCells is exact Euclidean distance', () => {
  const size = 5
  const water = new Uint8Array(size * size)
  water[0] = 1 // top-left corner
  const d = distanceToWaterCells(water, size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) close(d[y * size + x], Math.hypot(x, y))
  assert.ok(distanceToWaterCells(new Uint8Array(4), 2).every((v) => v === Infinity))
})

test('heightmapToSamples on a tiny heightmap with a water cell', () => {
  // Lowest cell (0,0) is under a water level of 1 m.
  const { samples, water, hasWater } = heightmapToSamples(EAST_RAMP, { size: 3, cellSizeM: 30, waterLevelM: 1 })
  assert.ok(hasWater)
  assert.deepEqual([...water], [1, 0, 0, 1, 0, 0, 1, 0, 0])
  const c = samples[1 * 3 + 2] // x=2, y=1: 60 m high, 2 cells east of water
  close(c.elevation, 60)
  close(c.slope, 45, 1e-6)
  close(c.aspectDegrees, 270, 1e-6)
  close(c.horizontalDistanceToWater, 60)
  close(c.verticalDistanceToWater, 59)
  assert.equal(c.hillshadeNoon, hillshade(45, 270, SUN.hillshadeNoon))
  const w = samples[0]
  assert.equal(w.horizontalDistanceToWater, 0)
  assert.equal(w.verticalDistanceToWater, 0)
  for (const s of samples) for (const v of Object.values(s)) assert.ok(Number.isFinite(v))
})

test('heightmapToSamples without water uses the grid diagonal, not Infinity', () => {
  const { samples, hasWater } = heightmapToSamples(EAST_RAMP, { size: 3, cellSizeM: 30, waterLevelM: -100 })
  assert.equal(hasWater, false)
  close(samples[4].horizontalDistanceToWater, Math.hypot(3, 3) * 30)
  close(samples[4].verticalDistanceToWater, 130)
  assert.throws(() => heightmapToSamples(new Float32Array(8), { size: 3, cellSizeM: 30, waterLevelM: 0 }))
})
