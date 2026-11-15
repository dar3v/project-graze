/**
 * Viewer settings (D11): pure parsing and storage helpers, no DOM, so they are
 * unit-tested in Node. The Svelte store lives in ./settings.ts.
 *
 * Settings are per viewer and stored in browser storage. Storage can be
 * missing, blocked or full (private windows, cleared site data), so every
 * access is wrapped in try/catch and the app works with empty storage.
 */

import { DEFAULT_ANIMAL_SPEED, isAnimalSpeed, type AnimalSpeed } from '../world/pace.ts'
import { DEFAULT_LOOK, LOOK_SENSITIVITY_RANGE, WALK_FOV_RANGE } from '../world/walk.ts'

export type { AnimalSpeed } from '../world/pace.ts'

export type QualityPreset = 'low' | 'medium' | 'high'
export type OverlayChoice = 'terrain' | 'cover' | 'confidence'
/** 'system' follows prefers-reduced-motion. */
export type MotionPreference = 'system' | 'reduce' | 'full'

export interface Settings {
  /** ROLE-1 D12 quality preset. */
  readonly quality: QualityPreset
  /** Hour of day, 0..24 (ROLE-1 D10). Cosmetic only: never a model input. */
  readonly timeOfDay: number
  readonly autoCycle: boolean
  readonly overlay: OverlayChoice
  readonly showOod: boolean
  readonly motion: MotionPreference
  /** ROLE-1 D15: multiplier on mouse and drag look speed in walk mode (1 = default). */
  readonly lookSensitivity: number
  /** ROLE-1 D15: moving the mouse up looks down. */
  readonly invertLookY: boolean
  /** ROLE-1 D15: vertical field of view in walk mode, degrees. */
  readonly fov: number
  /** ROLE-1 D16: how fast the animals move in ground-level views. */
  readonly animalSpeed: AnimalSpeed
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  timeOfDay: 10,
  // On by default since ROLE-1 D14: day and night keep running behind every page.
  autoCycle: true,
  overlay: 'cover',
  showOod: true,
  motion: 'system',
  lookSensitivity: DEFAULT_LOOK.sensitivity,
  invertLookY: DEFAULT_LOOK.invertY,
  fov: DEFAULT_LOOK.fov,
  animalSpeed: DEFAULT_ANIMAL_SPEED,
}

export const SETTINGS_STORAGE_KEY = 'graze.settings.v1'

const inRange = (v: unknown, range: { readonly min: number; readonly max: number }, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= range.min && v <= range.max ? v : fallback

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)

/** Field-by-field: a bad or missing field falls back to its default; never throws. */
export function parseSettings(raw: unknown): Settings {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_SETTINGS
  const t = o.timeOfDay
  return {
    quality: oneOf(o.quality, ['low', 'medium', 'high'], d.quality),
    timeOfDay: typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= 24 ? t : d.timeOfDay,
    autoCycle: typeof o.autoCycle === 'boolean' ? o.autoCycle : d.autoCycle,
    overlay: oneOf(o.overlay, ['terrain', 'cover', 'confidence'], d.overlay),
    showOod: typeof o.showOod === 'boolean' ? o.showOod : d.showOod,
    motion: oneOf(o.motion, ['system', 'reduce', 'full'], d.motion),
    lookSensitivity: inRange(o.lookSensitivity, LOOK_SENSITIVITY_RANGE, d.lookSensitivity),
    invertLookY: typeof o.invertLookY === 'boolean' ? o.invertLookY : d.invertLookY,
    fov: inRange(o.fov, WALK_FOV_RANGE, d.fov),
    animalSpeed: isAnimalSpeed(o.animalSpeed) ? o.animalSpeed : d.animalSpeed,
  }
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** Settings from storage, or the defaults if storage is missing, blocked or holds junk. */
export function loadSettings(storage: StorageLike | null): Settings {
  try {
    const text = storage?.getItem(SETTINGS_STORAGE_KEY)
    return text ? parseSettings(JSON.parse(text)) : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** True if saved. A failure (quota, blocked storage) is ignored: settings then last for this visit only. */
export function saveSettings(storage: StorageLike | null, s: Settings): boolean {
  try {
    if (!storage) return false
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}

export function resolveReducedMotion(pref: MotionPreference, systemPrefersReduced: boolean): boolean {
  return pref === 'reduce' || (pref === 'system' && systemPrefersReduced)
}
