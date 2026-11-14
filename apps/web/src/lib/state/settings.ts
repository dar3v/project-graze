import { derived, readable, writable } from 'svelte/store'
import { DEFAULT_SETTINGS, loadSettings, resolveReducedMotion, saveSettings, type Settings, type StorageLike } from './settingsCore.ts'

function storage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Viewer settings, remembered in browser storage (D11). */
export const settings = writable<Settings>(loadSettings(storage()))
settings.subscribe((s) => saveSettings(storage(), s))

export function resetSettings(): void {
  settings.set(DEFAULT_SETTINGS)
}

const systemReducedMotion = readable(false, (set) => {
  let mq: MediaQueryList
  try {
    mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  } catch {
    return
  }
  set(mq.matches)
  const on = () => set(mq.matches)
  mq.addEventListener('change', on)
  return () => mq.removeEventListener('change', on)
})

/** True when animation should be minimised: the viewer's setting, or the system preference when set to "system". */
export const reducedMotion = derived([settings, systemReducedMotion], ([s, sys]) => resolveReducedMotion(s.motion, sys))
