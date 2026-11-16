<script lang="ts">
  // Full-viewport background (ROLE-1 D14). Black by default; fades in Role 1's
  // ambient view of the LIVE world (src/lib/world/index.ts -> mountWorld)
  // under a black dimming layer. It is mounted once in App.svelte and stays
  // mounted across pages.
  //
  // - The dim comes from Role 1's `dimState()` (ROLE-1 D20): one flat black
  //   layer, DIM_IDLE on every page and DIM_WALK (none) in walk mode. No
  //   fade, no gradient, no second layer: every pixel gets the same dim and
  //   the switch is instant.
  // - It never takes pointer input, so the pages stay clickable. Walk mode
  //   runs in the Sandbox's own view, which then covers the viewport.
  // - It draws on every page and its camera never stops turning (ROLE-1
  //   D19). Walk mode covers the window, and only then does it pause
  //   (`setLease('covered')`).
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { liveWorld, livePoses } from '../state/liveWorld.ts'
  import { reducedMotion as reducedMotionStore, settings } from '../state/settings.ts'
  import type { AmbientEnvironment, AmbientLease, BackdropStats, WorldHandle, WorldModule } from './worldContract.ts'

  // import.meta.glob returns {} when the file does not exist, so the build
  // works without Role 1's world.
  type World = WorldModule & typeof import('../world/index.ts')
  const worldModules = import.meta.glob<World>('../world/index.ts')

  let host: HTMLDivElement | undefined = $state()
  let loaded = $state(false)
  let handle: WorldHandle | undefined = $state.raw()
  let world: World | undefined = $state.raw()
  let destroyed = false

  const environment = (): AmbientEnvironment => ({
    quality: get(settings).quality,
    timeOfDay: get(settings).timeOfDay,
    autoCycle: get(settings).autoCycle,
    reducedMotion: get(reducedMotionStore),
  })

  onMount(async () => {
    const load = Object.values(worldModules)[0]
    if (!load || !host) return
    try {
      const mod = await load()
      if (destroyed || typeof mod.mountWorld !== 'function') return
      const h = await mod.mountWorld(host, {
        environment: environment(),
        // The background's clock is the shared one: the pages show the same hour.
        onHourChange: (hour) => settings.update((s) => ({ ...s, timeOfDay: hour })),
        onFallback: (state) => console.info(`3D background: the frame rate stayed low, so ${state === 'frozen' ? 'it now shows a still frame' : 'the day/night cycle was stopped behind the pages'}.`),
      })
      if (destroyed) {
        h.destroy()
        return
      }
      world = mod
      handle = h
    } catch (err) {
      // The background is decorative: stay black, never break the page.
      console.warn('3D background failed to load; using the black background.', err)
    }
  })

  onDestroy(() => {
    destroyed = true
    handle?.destroy()
  })

  // The presence store lives in Role 1's module, which loads asynchronously.
  let presence = $state.raw({ shown: false, onScreen: false, walking: false })
  $effect(() => {
    if (!world) return
    return world.viewPresence.subscribe((p) => (presence = p))
  })

  const walking = $derived(presence.shown && presence.walking)
  // Until Role 1's module loads, the layer is fully black (the black background).
  const dim = $derived(world ? world.dimState(walking) : { opacity: 1 })
  // ROLE-1 D19: the background draws (and its camera turns) on every page, the
  // Sandbox included; only walk mode, which covers the window, pauses it.
  const lease = $derived<AmbientLease>(!world ? 'draw' : world.backdropLease(presence))

  $effect(() => {
    handle?.setLease(lease)
  })

  $effect(() => {
    const h = handle
    const w = $liveWorld
    if (!h || !w) return
    h.setWorld(w)
    // The first frame fades in (CSS) instead of popping.
    loaded = true
  })

  $effect(() => {
    const p = $livePoses
    handle?.setAnimals(p?.herbivores ?? null, p?.predators ?? null, p?.stride ?? 2)
  })

  $effect(() => {
    handle?.setEnvironment({ quality: $settings.quality, timeOfDay: $settings.timeOfDay, autoCycle: $settings.autoCycle, reducedMotion: $reducedMotionStore })
  })

  // `?stats` in the URL (before the #) shows the background's cost in the
  // bottom-left corner: for the D14 checks (flat counts across page switches).
  let showStats = false
  try {
    showStats = new URLSearchParams(location.search).has('stats')
  } catch {
    showStats = false
  }
  let stats: BackdropStats | null = $state.raw(null)
  $effect(() => {
    const h = handle
    if (!showStats || !h?.stats) return
    const id = setInterval(() => (stats = h.stats!()), 500)
    return () => clearInterval(id)
  })
</script>

<div class="backdrop" aria-hidden="true">
  <div class="world" class:loaded bind:this={host}></div>
  <div class="dim" style:opacity={dim.opacity}></div>
  {#if stats}
    <div class="stats">
      backdrop · {stats.active ? `drawing, ${Math.round(stats.fps)} fps` : 'still frame'} · {lease} · {stats.quality} · {stats.drawCalls} draw calls · {Math.round(stats.triangles / 1000)}k triangles ·
      {stats.visiblePlants}/{stats.plants} plants · {stats.animals} animals · {stats.geometries} geometries · {stats.textures} textures · {stats.programs} programs
    </div>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    background: #000;
    /* Never takes input: the pages above it stay clickable. */
    pointer-events: none;
    overflow: hidden;
  }

  .world {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 1.2s ease;
  }

  .world.loaded {
    opacity: 1;
  }

  .world :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
    /* While a still frame is shown the canvas is not resized: scale it without distortion. */
    object-fit: cover;
  }

  /* One flat layer over every pixel; its opacity switches at once (no transition). */
  .dim {
    position: absolute;
    inset: 0;
    background: #000;
  }

  .stats {
    position: absolute;
    left: 8px;
    bottom: 8px;
    max-width: calc(100vw - 16px);
    padding: 4px 8px;
    font-family: var(--mono);
    font-size: 10px;
    color: #d4d7dc;
    background: rgb(0 0 0 / 0.7);
  }

  @media (prefers-reduced-motion: reduce) {
    .world {
      transition: none;
    }
  }
</style>
