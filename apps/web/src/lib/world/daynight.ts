/**
 * Day/night cycle (D10). Three-free and pure, so it is unit-tested.
 *
 * COSMETIC ONLY. This module decides how the scene is LIT and COLORED for a
 * time of day. It is not the model's hillshade feature and shares no code
 * with it: the model's inputs come from the heightmap through
 * `computeFeatures` / `heightmapToInputs` in `@graze/features`, which use a
 * fixed, fitted sun position (`SUN`). Nothing in `world/` imports that
 * package, and nothing here is ever passed to the model, so moving the time
 * slider changes no prediction (guarded by a test in world.test.ts).
 *
 * Frame: +X east, +Y up, -Z north. The sun rises in the east at 06:00, is
 * highest in the south at 12:00 and sets in the west at 18:00.
 */

import { mix, PALETTE, toLinear } from './palette.ts'
import type { Rgb, TimeColors } from './palette.ts'

/** Seconds of real time for one full day when the auto-cycle runs. */
export const DAY_LENGTH_S = 240
/** Tilt of the sun's path from straight overhead toward the south, degrees (noon altitude = 90 - tilt). */
export const SUN_PATH_TILT_DEG = 35
/** The light direction is never lower than this (sine of altitude), so shadows stay finite at sunrise. */
export const MIN_LIGHT_ALTITUDE = 0.16

export const LIGHT = {
  /** Directional light intensity at full day / full moon. */
  sun: 2.2,
  moon: 0.6,
  /** Hemisphere light intensity. */
  ambientDay: 1.4,
  ambientTwilight: 0.95,
  ambientNight: 0.8,
} as const

export type Vec3 = readonly [number, number, number]

export interface DayState {
  /** Hour of day, 0..24. */
  readonly hour: number
  /** Unit vector pointing AT the sun / moon. */
  readonly sunDir: Vec3
  readonly moonDir: Vec3
  /** Blend weights of the three palette keyframes; they sum to 1. */
  readonly day: number
  readonly twilight: number
  readonly night: number
  /** Unit vector pointing at whichever body lights the scene (sun by day, moon by night), kept above the horizon. */
  readonly lightDir: Vec3
  readonly lightColor: Rgb
  readonly lightIntensity: number
  readonly ambientSky: Rgb
  readonly ambientGround: Rgb
  readonly ambientIntensity: number
  readonly zenith: Rgb
  /** Horizon and fog color. */
  readonly fog: Rgb
  readonly glow: Rgb
  readonly waterShallow: Rgb
  readonly waterDeep: Rgb
  readonly cloud: Rgb
  /** Star visibility, 0..1. */
  readonly stars: number
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Wrap any number of hours into [0, 24). */
export function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24
}

const KEYS: Record<'night' | 'twilight' | 'day', Record<keyof TimeColors, Rgb>> = {
  night: linearKeys(PALETTE.time.night),
  twilight: linearKeys(PALETTE.time.twilight),
  day: linearKeys(PALETTE.time.day),
}

function linearKeys(c: TimeColors): Record<keyof TimeColors, Rgb> {
  return Object.fromEntries(Object.entries(c).map(([k, hex]) => [k, toLinear(hex)])) as Record<keyof TimeColors, Rgb>
}

function withMinAltitude(d: Vec3): Vec3 {
  if (d[1] >= MIN_LIGHT_ALTITUDE) return d
  const flat = Math.hypot(d[0], d[2]) || 1
  const k = Math.sqrt(1 - MIN_LIGHT_ALTITUDE * MIN_LIGHT_ALTITUDE) / flat
  return [d[0] * k, MIN_LIGHT_ALTITUDE, d[2] * k]
}

/** Everything the renderer needs to light and color the scene at `hour`. */
export function dayState(hour: number): DayState {
  const h = wrapHour(hour)
  const a = ((h - 6) / 24) * Math.PI * 2
  const tilt = (SUN_PATH_TILT_DEG * Math.PI) / 180
  const sunDir: Vec3 = [Math.cos(a), Math.sin(a) * Math.cos(tilt), Math.sin(a) * Math.sin(tilt)]
  const moonDir: Vec3 = [-sunDir[0], -sunDir[1], -sunDir[2]]
  const s = sunDir[1] // sine of the sun's altitude

  const day = smoothstep(0, 0.35, s)
  const night = smoothstep(0, 0.25, -s)
  const twilight = Math.max(0, 1 - day - night)
  const blend = (key: keyof TimeColors): Rgb => {
    const n = KEYS.night[key]
    const t = KEYS.twilight[key]
    const d = KEYS.day[key]
    return [n[0] * night + t[0] * twilight + d[0] * day, n[1] * night + t[1] * twilight + d[1] * day, n[2] * night + t[2] * twilight + d[2] * day]
  }

  // The sun lights the scene while it is up, the moon after it sets. Both fade
  // to zero at the horizon, so the hand-over never pops.
  const sunUp = s >= 0
  const lightIntensity = sunUp ? LIGHT.sun * smoothstep(0, 0.22, s) : LIGHT.moon * smoothstep(0, 0.25, -s)
  const lightColor = sunUp ? blend('light') : mix(KEYS.twilight.light, KEYS.night.light, smoothstep(0, 0.2, -s))

  return {
    hour: h,
    sunDir,
    moonDir,
    day,
    twilight,
    night,
    lightDir: withMinAltitude(sunUp ? sunDir : moonDir),
    lightColor,
    lightIntensity,
    ambientSky: blend('ambientSky'),
    ambientGround: blend('ambientGround'),
    ambientIntensity: LIGHT.ambientNight * night + LIGHT.ambientTwilight * twilight + LIGHT.ambientDay * day,
    zenith: blend('zenith'),
    fog: blend('fog'),
    glow: blend('glow'),
    waterShallow: blend('waterShallow'),
    waterDeep: blend('waterDeep'),
    cloud: blend('cloud'),
    stars: smoothstep(0.02, 0.22, -s),
  }
}

/** The hour after `dtSeconds` of auto-cycle. */
export function advanceHour(hour: number, dtSeconds: number, dayLengthS: number = DAY_LENGTH_S): number {
  return wrapHour(hour + (dtSeconds / dayLengthS) * 24)
}

/** '06:30' style label for an hour of day. */
export function formatHour(hour: number): string {
  const h = wrapHour(hour)
  const total = Math.round(h * 60) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
