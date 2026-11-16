import { readable } from 'svelte/store'
import { parseWorldHash } from '../../../../packages/worlds/src/index.ts'

/**
 * Hash routes so the static build needs no server-side rewrites. Each route
 * is one section of the right-hand feed (App.svelte shows one at a time).
 */
export const ROUTES = [
  { id: 'sandbox', hash: '#/', label: 'Overview' },
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
  const onChange = () => set(parseHash(location.hash))
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
})
