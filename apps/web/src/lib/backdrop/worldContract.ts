/**
 * Contract for Role 1's 3D world as the page background.
 *
 * Role 1 provides `apps/web/src/lib/world/index.ts` exporting `mountWorld`.
 * The app calls it once with a full-viewport container that sits behind the
 * UI, under a black dimming layer. Until that file exists (or if mounting
 * fails) the background stays plain black.
 */

export interface WorldMountOptions {
  /** True when the user prefers reduced motion: keep the camera still. */
  readonly reducedMotion: boolean
}

export interface WorldHandle {
  /** Called when the app unmounts the background. Free GPU resources here. */
  destroy(): void
}

export interface WorldModule {
  mountWorld(target: HTMLElement, options: WorldMountOptions): WorldHandle | Promise<WorldHandle>
}
