import { writable } from 'svelte/store'

/** Controls help overlay (D11). Opened with "?" anywhere, or the Help button. */
export const helpOpen = writable(false)

/** True when a key press is meant for a form field, not a shortcut. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
}
