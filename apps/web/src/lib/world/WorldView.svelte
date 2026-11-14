<script lang="ts">
  // Interactive 3D sandbox view (Role 1). A drop-in for the placeholder
  // ../sandbox/MapView.svelte, plus brush and overlay controls. It renders
  // what it is given; the page owns the heightmap, predictions and the sim.
  //
  // The brush edits `heightmap` IN PLACE and then calls
  // `onheightmapchange(dirtyRect)` (debounced), so the page recomputes the
  // raw inputs and re-predicts. Clicking a cell (Select tool) calls `onpick`.
  import { onDestroy, onMount, untrack } from 'svelte'
  import { classColor } from '../sandbox/palette.ts'
  import { CONFIDENCE_HIGH, CONFIDENCE_LOW, OOD_COLOR } from './colors.ts'
  import type { OverlayMode } from './colors.ts'
  import { WorldRenderer, WorldUnavailableError } from './scene.ts'
  import type { WorldTool } from './scene.ts'
  import type { DirtyRect } from './terrain.ts'

  interface Props {
    heightmap: Float32Array
    size: number
    cellSizeM: number
    waterLevelM: number
    /** Elevation training range from model_card.json; the brush clamps to it. */
    elevation: { min: number; max: number }
    /** Class names in class-index order (model_card.json `classes`). */
    classes: readonly string[]
    cover: Uint8Array | null
    confidence?: Float32Array | null
    ood: Uint8Array | null
    selected: { x: number; y: number } | null
    herbivores?: Float32Array | null
    predators?: Float32Array | null
    /** Shown over the view while true (e.g. the model is loading or predicting). */
    busy?: string | null
    onpick?: (x: number, y: number) => void
    onheightmapchange?: (rect: DirtyRect) => void
  }

  let {
    heightmap,
    size,
    cellSizeM,
    waterLevelM,
    elevation,
    classes,
    cover,
    confidence = null,
    ood,
    selected,
    herbivores = null,
    predators = null,
    busy = null,
    onpick,
    onheightmapchange,
  }: Props = $props()

  let host: HTMLDivElement | undefined = $state()
  let world: WorldRenderer | null = $state.raw(null)
  let failure: string | null = $state(null)

  let tool: WorldTool = $state('select')
  let radius = $state(6)
  let strength = $state(40)
  let overlay: OverlayMode = $state('cover')
  let showOod = $state(true)

  const TOOLS: { id: WorldTool; label: string; key: string }[] = [
    { id: 'select', label: 'Select', key: '1' },
    { id: 'raise', label: 'Raise', key: '2' },
    { id: 'lower', label: 'Lower', key: '3' },
    { id: 'flatten', label: 'Flatten', key: '4' },
  ]

  const toCss = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055))).join(' ')})`
  const OOD_CSS = toCss(OOD_COLOR)
  const CONF_GRADIENT = `linear-gradient(90deg, ${toCss(CONFIDENCE_LOW)}, ${toCss(CONFIDENCE_HIGH)})`

  onMount(() => {
    if (!host) return
    try {
      world = new WorldRenderer(host, {
        interactive: true,
        onPick: (x, y) => onpick?.(x, y),
        onHeightmapChange: (r) => onheightmapchange?.(r),
      })
    } catch (err) {
      failure =
        err instanceof WorldUnavailableError
          ? 'This browser or device cannot show the 3D world (WebGL 2 is unavailable). Try another browser, or enable hardware acceleration.'
          : `The 3D world failed to start: ${err instanceof Error ? err.message : String(err)}`
    }
  })

  onDestroy(() => world?.destroy())

  // Terrain: full refresh only when the array identity, size or cell size
  // changes (a new seed). Water level has its own effect below.
  $effect(() => {
    const w = world
    const t = { heightmap, size, cellSizeM }
    if (!w) return
    untrack(() => w.setTerrain({ ...t, waterLevelM, elevation: { min: elevation.min, max: elevation.max } }))
  })

  $effect(() => {
    world?.setWaterLevel(waterLevelM)
  })

  $effect(() => {
    world?.setOverlay({ mode: overlay, cover, confidence, ood, showOod, classColors: classes.map((_, i) => classColor(i)) })
  })

  $effect(() => {
    world?.setSelection(selected ? { x: selected.x, y: selected.y } : null)
  })

  $effect(() => {
    world?.setAnimals(herbivores, predators)
  })

  $effect(() => {
    world?.setBrush({ tool, radius, strength: tool === 'flatten' ? strength / 40 : strength })
  })

  function onkeydown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
    const t = TOOLS.find((x) => x.key === e.key)
    if (t) tool = t.id
  }
</script>

<svelte:window {onkeydown} />

<div class="world-view">
  {#if failure}
    <div class="notice error" role="alert">{failure}</div>
  {:else}
    <div class="viewport" bind:this={host} aria-label="3D terrain. Select tool: click a cell to probe it. Brush tools: drag to sculpt. Right-drag to orbit, scroll to zoom.">
      {#if busy}
        <div class="busy" aria-live="polite">{busy}</div>
      {/if}
    </div>

    <div class="toolbar">
      <div class="tools" role="radiogroup" aria-label="Tool">
        {#each TOOLS as t (t.id)}
          <button type="button" role="radio" aria-checked={tool === t.id} class:active={tool === t.id} onclick={() => (tool = t.id)} title="{t.label} ({t.key})">
            {t.label}
          </button>
        {/each}
      </div>
      <label class:dimmed={tool === 'select'}>
        <span class="label">Radius · {radius} cells</span>
        <input type="range" min="1" max="20" step="1" bind:value={radius} disabled={tool === 'select'} />
      </label>
      <label class:dimmed={tool === 'select'}>
        <span class="label">Strength · {strength}</span>
        <input type="range" min="5" max="120" step="5" bind:value={strength} disabled={tool === 'select'} />
      </label>
      <label>
        <span class="label">Overlay</span>
        <select bind:value={overlay}>
          <option value="terrain">Terrain</option>
          <option value="cover">Predicted cover</option>
          <option value="confidence" disabled={!confidence}>Confidence</option>
        </select>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={showOod} />
        <span>Mark low-trust cells</span>
      </label>
    </div>

    <ul class="legend" aria-label="Legend">
      {#if overlay === 'cover' && cover}
        {#each classes as name, i (i)}
          <li><span class="sw" style:background={classColor(i)}></span>{name}</li>
        {/each}
      {:else if overlay === 'confidence' && confidence}
        <li><span>Low</span><span class="ramp" style:background={CONF_GRADIENT}></span><span>High confidence</span></li>
      {:else}
        <li>Terrain colored by elevation and steepness</li>
      {/if}
      {#if showOod && ood}
        <li><span class="sw ood" style:background={OOD_CSS}></span>Low trust: unlike the training data (out of distribution)</li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .world-view {
    display: grid;
    gap: 10px;
  }

  .viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    max-height: 70vh;
    border: 1px solid var(--border);
    background: #0d1013;
    overflow: hidden;
  }

  .viewport :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .busy {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 10px;
    font-size: 11px;
    color: var(--text-2);
    background: rgb(0 0 0 / 0.55);
    pointer-events: none;
  }

  .toolbar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    align-items: end;
  }

  .toolbar label {
    display: grid;
    gap: 6px;
  }

  .tools {
    display: flex;
    gap: 4px;
    grid-column: 1 / -1;
  }

  .tools button.active {
    color: var(--text);
    border-color: var(--text-2);
  }

  .dimmed {
    opacity: 0.45;
  }

  .check {
    display: flex !important;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-2);
  }

  .check input {
    width: auto;
  }

  .legend {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 16px;
    font-size: 11px;
    color: var(--text-2);
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sw {
    display: inline-block;
    width: 8px;
    height: 8px;
  }

  .sw.ood {
    background-image: repeating-linear-gradient(45deg, transparent 0 2px, rgb(0 0 0 / 0.35) 2px 3px);
  }

  .ramp {
    display: inline-block;
    width: 80px;
    height: 8px;
  }
</style>
