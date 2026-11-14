<script lang="ts">
  // Full-viewport background. Black by default; fades in Role 1's 3D world
  // (src/lib/world/index.ts -> mountWorld) underneath a black dimming layer.
  import { onDestroy, onMount } from 'svelte'
  import type { WorldHandle, WorldModule } from './worldContract.ts'

  /** Opacity of the black layer over the 3D world (0 = no dimming, 1 = black). */
  const DIM = 0.72

  // import.meta.glob returns {} when the file does not exist yet, so the build
  // works before Role 1's world lands.
  const worldModules = import.meta.glob<WorldModule>('../world/index.ts')

  let host: HTMLDivElement | undefined = $state()
  let loaded = $state(false)
  let handle: WorldHandle | undefined
  let destroyed = false

  onMount(async () => {
    const load = Object.values(worldModules)[0]
    if (!load || !host) return
    try {
      const mod = await load()
      if (destroyed || typeof mod.mountWorld !== 'function') return
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      handle = await mod.mountWorld(host, { reducedMotion })
      if (destroyed) {
        handle.destroy()
        return
      }
      loaded = true
    } catch (err) {
      // The background is decorative: stay black, never break the page.
      console.warn('3D background failed to load; using the black background.', err)
    }
  })

  onDestroy(() => {
    destroyed = true
    handle?.destroy()
  })
</script>

<div class="backdrop" aria-hidden="true">
  <div class="world" class:loaded bind:this={host}></div>
  <div class="dim" style:opacity={DIM}></div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    background: #000;
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
  }

  .dim {
    position: absolute;
    inset: 0;
    background: #000;
  }
</style>
