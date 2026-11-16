/**
 * The page background (D14): an ambient `WorldRenderer` plus the rules about
 * when it draws. `../backdrop/WorldBackdrop.svelte` (Role 2) mounts it through
 * `mountWorld` in ./index.ts and feeds it the live world.
 *
 * - It draws the walk look (sky, fog, water, plants, animals) from a seeded
 *   vantage, at the `low` preset at most, at 30 frames a second at most.
 * - It draws only while it holds the lease (`setLease('draw')`). Otherwise it
 *   shows a still frame, which is drawn again (once) when the world behind it
 *   changed: a new terrain, a new cover map, another hour.
 * - If its frame rate stays low it stops the day/night cycle first, then
 *   freezes to a still frame for the rest of the visit.
 * - Without a cover map it shows terrain, sky and water; the plants appear
 *   when the first prediction arrives. Nothing here can block a page.
 */

import type { AmbientEnvironment, AmbientLease, AmbientWorld, BackdropStats, WorldHandle, WorldMountOptions } from '../backdrop/worldContract.ts'
import { AMBIENT_FPS_CAP, AMBIENT_MIN_FPS, ambientQuality, nextAmbientFallback } from './ambient.ts'
import type { AmbientFallback } from './ambient.ts'
import { WorldRenderer } from './scene.ts'

/** A still frame is redrawn this long after the last change, ms. */
export const STILL_DEBOUNCE_MS = 400
/** While the cycle runs, a still is redrawn only after the clock moved this many hours. */
export const STILL_HOUR_STEP = 1

export class AmbientBackdrop implements WorldHandle {
  readonly #world: WorldRenderer
  readonly #opts: WorldMountOptions
  readonly #host: HTMLElement
  #env: AmbientEnvironment
  #lease: AmbientLease = 'draw'
  #fallback: AmbientFallback = 'none'
  #current: AmbientWorld | null = null
  #stillTimer: ReturnType<typeof setTimeout> | undefined
  #stillHour: number
  #destroyed = false

  constructor(host: HTMLElement, opts: WorldMountOptions) {
    this.#host = host
    this.#opts = opts
    this.#env = opts.environment
    this.#stillHour = opts.environment.timeOfDay
    // Throws WorldUnavailableError without WebGL 2; the backdrop then stays black.
    this.#world = new WorldRenderer(host, {
      interactive: false,
      ambient: true,
      reducedMotion: opts.environment.reducedMotion,
      maxPixelRatio: 1,
      fpsCap: AMBIENT_FPS_CAP,
      lowFpsTarget: AMBIENT_MIN_FPS,
      onLowFps: () => this.#onLowFps(),
      onHourChange: (h) => opts.onHourChange?.(h),
    })
    this.#applyEnvironment()
  }

  #viewportWidth(): number {
    return this.#host.ownerDocument.defaultView?.innerWidth ?? this.#host.clientWidth
  }

  #cycleRunning(): boolean {
    return this.#env.autoCycle && this.#fallback === 'none' && !this.#env.reducedMotion
  }

  #applyEnvironment(): void {
    const w = this.#world
    w.setReducedMotion(this.#env.reducedMotion)
    w.setQuality(ambientQuality(this.#viewportWidth(), this.#env.quality))
    w.setTimeOfDay(this.#env.timeOfDay)
    w.setAutoCycle(this.#env.autoCycle && this.#fallback === 'none')
  }

  #drawing(): boolean {
    return this.#lease === 'draw' && this.#fallback !== 'frozen'
  }

  #applyLease(): void {
    const draw = this.#drawing()
    // Handing the frame over needs no extra draw: the last frame stays on the canvas.
    this.#world.setActive(draw)
    if (draw) clearTimeout(this.#stillTimer)
  }

  /** The world behind the still changed: draw it again, once, a little later. */
  #touch(): void {
    if (this.#destroyed || this.#drawing() || this.#lease === 'covered') return
    clearTimeout(this.#stillTimer)
    this.#stillTimer = setTimeout(() => {
      if (this.#destroyed || this.#drawing() || this.#lease === 'covered') return
      this.#stillHour = this.#env.timeOfDay
      this.#world.renderStill()
    }, STILL_DEBOUNCE_MS)
  }

  #onLowFps(): void {
    const next = nextAmbientFallback(this.#fallback, this.#cycleRunning())
    if (next === this.#fallback) return
    this.#fallback = next
    this.#applyEnvironment()
    this.#applyLease()
    if (next !== 'none') this.#opts.onFallback?.(next)
  }

  setWorld(world: AmbientWorld | null): void {
    if (this.#destroyed || !world) return
    const prev = this.#current
    this.#current = world
    const w = this.#world
    const newTerrain = !prev || prev.heightmap !== world.heightmap || prev.size !== world.size || prev.cellSizeM !== world.cellSizeM
    if (newTerrain) {
      w.setSeed(world.seed)
      w.setTerrain({ heightmap: world.heightmap, size: world.size, cellSizeM: world.cellSizeM, waterLevelM: world.waterLevelM, elevation: world.elevation })
    } else {
      if (prev.seed !== world.seed) w.setSeed(world.seed)
      if (prev.terrainRev !== world.terrainRev) w.refreshRegion({ x0: 0, y0: 0, x1: world.size - 1, y1: world.size - 1 })
      if (prev.waterLevelM !== world.waterLevelM) w.setWaterLevel(world.waterLevelM)
    }
    if (newTerrain || prev.cover !== world.cover || prev.ood !== world.ood) {
      // Always the natural view: the plants carry the prediction, grey and sparse where it is low trust.
      w.setOverlay({ mode: 'terrain', cover: world.cover, confidence: null, ood: world.ood, showOod: false, classColors: [] })
    }
    this.#touch()
  }

  setAnimals(herbivores: Float32Array | null, predators: Float32Array | null, stride: number): void {
    if (this.#destroyed) return
    this.#world.setAnimals(herbivores, predators, stride)
  }

  setEnvironment(environment: AmbientEnvironment): void {
    if (this.#destroyed) return
    const prev = this.#env
    this.#env = environment
    this.#applyEnvironment()
    const moved = Math.abs(environment.timeOfDay - this.#stillHour)
    const hourMoved = Math.min(moved, 24 - moved)
    // A running clock reports every quarter hour; a still follows it in hour steps, not on every report.
    if (prev.quality !== environment.quality || prev.reducedMotion !== environment.reducedMotion || hourMoved >= (environment.autoCycle ? STILL_HOUR_STEP : 1e-6)) this.#touch()
  }

  setLease(lease: AmbientLease): void {
    if (this.#destroyed || lease === this.#lease) return
    this.#lease = lease
    this.#applyLease()
  }

  /** For the performance checks: the renderer's counts (add `?stats` to the URL to see them). */
  stats(): BackdropStats {
    return this.#world.stats()
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    clearTimeout(this.#stillTimer)
    this.#world.destroy()
  }
}
