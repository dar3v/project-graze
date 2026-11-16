/**
 * Contract for Role 1's 3D world as the page background (ROLE-1 D14).
 *
 * Role 1 provides `apps/web/src/lib/world/index.ts` exporting `mountWorld`.
 * The app calls it once with a full-viewport container that sits behind the
 * UI, under a black dimming layer, and keeps it mounted across pages. Until
 * that file exists (or if mounting fails) the background stays plain black.
 *
 * The background is the walk-mode look from a seeded vantage: the app hands
 * it the same live heightmap, cover map, low-trust array and animal poses the
 * Sandbox uses (`state/liveWorld.ts`). It never takes pointer input: walk
 * mode runs in the Sandbox's own `WorldView`, which then covers the viewport.
 */

/** The live world the background draws. Arrays are shared with the Sandbox, never copied. */
export interface AmbientWorld {
  /** Heights in meters, row-major. Edited in place by the brush; `terrainRev` says when. */
  readonly heightmap: Float32Array
  readonly size: number
  readonly cellSizeM: number
  readonly waterLevelM: number
  readonly elevation: { readonly min: number; readonly max: number }
  /** World seed: the vantage and the forest are seeded from it. */
  readonly seed: number
  /** Predicted class per cell, or null before the first prediction: terrain, sky and water only. */
  readonly cover: Uint8Array | null
  /** 1 where a cell is unlike the training data (drawn sparse and grey). */
  readonly ood: Uint8Array | null
  /** Bumped whenever the heightmap was edited in place. */
  readonly terrainRev: number
}

/** Viewer settings the background follows. */
export interface AmbientEnvironment {
  readonly quality: 'low' | 'medium' | 'high'
  /** Hour of day, 0..24. Lighting only. */
  readonly timeOfDay: number
  readonly autoCycle: boolean
  /** True when the viewer prefers reduced motion: the camera does not turn, and the clock stays where it is. */
  readonly reducedMotion: boolean
}

/**
 * Whether the background draws:
 *  - `draw`: the background animates. The app sends this on every page, the
 *    Sandbox included, so the camera never stops turning (ROLE-1 D19);
 *  - `still`: the background stops its frame loop, frees its plants and
 *    shadow map and shows a still frame, refreshed when the world changes.
 *    The app no longer sends it since D19; the background still supports it;
 *  - `covered`: walk mode covers the viewport. As `still`, with no refreshes.
 */
export type AmbientLease = 'draw' | 'still' | 'covered'

export interface WorldMountOptions {
  readonly environment: AmbientEnvironment
  /** The day/night cycle moved the clock (every quarter hour of scene time). */
  readonly onHourChange?: (hour: number) => void
  /**
   * The frame rate stayed low, and the background lowered its own cost:
   * first the cycle is stopped, then the view freezes to a still frame.
   */
  readonly onFallback?: (state: 'cycle-stopped' | 'frozen') => void
}

/** The background's cost, for the performance checks (`?stats` in the URL shows it). */
export interface BackdropStats {
  readonly fps: number
  readonly drawCalls: number
  readonly triangles: number
  readonly geometries: number
  readonly textures: number
  readonly programs: number
  readonly plants: number
  readonly visiblePlants: number
  readonly animals: number
  readonly quality: string
  /** True while the background is the renderer that draws. */
  readonly active: boolean
}

export interface WorldHandle {
  /** Optional: counts for the performance checks. */
  stats?(): BackdropStats
  setWorld(world: AmbientWorld | null): void
  /** Animal poses in cell coordinates; `stride` 3 is [x, y, heading, ...]. */
  setAnimals(herbivores: Float32Array | null, predators: Float32Array | null, stride: number): void
  setEnvironment(environment: AmbientEnvironment): void
  setLease(lease: AmbientLease): void
  /** Called when the app unmounts the background. Free GPU resources here. */
  destroy(): void
}

export interface WorldModule {
  mountWorld(target: HTMLElement, options: WorldMountOptions): WorldHandle | Promise<WorldHandle>
}
