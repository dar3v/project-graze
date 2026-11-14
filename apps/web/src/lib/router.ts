import { readable } from 'svelte/store'

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
  const h = hash === '' || hash === '#' ? '#/' : hash.replace(/\/+$/, '') || '#/'
  const match = ROUTES.find((r) => r.hash === h || (r.hash === '#/' && h === '#'))
  return match ? match.id : 'not-found'
}

export const route = readable<RouteId>(parseHash(location.hash), (set) => {
  const onChange = () => {
    set(parseHash(location.hash))
    window.scrollTo(0, 0)
  }
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
})
