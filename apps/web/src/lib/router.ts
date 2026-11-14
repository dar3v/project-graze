import { readable } from 'svelte/store'
import { parseWorldHash } from '../../../../packages/worlds/src/index.ts'

/**
 * Hash routes so the static build needs no server-side rewrites.
 */
export const ROUTES = [
  { id: 'sandbox', hash: '#/', label: 'Sandbox' },
  { id: 'report', hash: '#/report', label: 'Model Report' },
  { id: 'responsible-use', hash: '#/responsible-use', label: 'Responsible Use' },
] as const

export type RouteId = (typeof ROUTES)[number]['id'] | 'not-found'

export function parseHash(hash: string): RouteId {
  // A shared world link (#/world/<id>) opens the Sandbox, which loads it.
  if (parseWorldHash(hash)) return 'sandbox'
  const h = hash === '' || hash === '#' ? '#/' : hash.replace(/\/+$/, '') || '#/'
  const match = ROUTES.find((r) => r.hash === h || (r.hash === '#/' && h === '#'))
  return match ? match.id : 'not-found'
}

export const route = readable<RouteId>(parseHash(location.hash), (set) => {
  let current = parseHash(location.hash)
  const onChange = () => {
    const next = parseHash(location.hash)
    // Only scroll on a real page change (opening a world link keeps the Sandbox in place).
    if (next !== current) window.scrollTo(0, 0)
    current = next
    set(next)
  }
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
})
