<script lang="ts">
  // The 3D world view (Role 1): orbit view with brush and overlays, and walk
  // mode with its HUD. It renders what it is given; the page owns the
  // heightmap, the predictions, the sim and the settings.
  //
  // The brush edits `heightmap` IN PLACE and then calls
  // `onheightmapchange(dirtyRect)` (debounced), so the page recomputes the
  // raw inputs and re-predicts. Clicking a cell (Select tool) or pressing E
  // in walk mode calls `onpick` with the cell: one selection event for both.
  //
  // Every prop after `onheightmapchange` is optional. Without it the view
  // keeps that piece of state itself, so it also works on its own.
  //
  // Walk mode is full viewport (D14): the viewport element leaves its box
  // and covers the window; the page under it is left as it is. Leaving walk
  // mode, by any path, calls `onexit` with the reason and the cell last stood
  // on (D15), and the walker's spot and heading are kept for the next entry.
  //
  // This view draws while it is walked in or on screen (`viewDraws`);
  // otherwise it stops its frame loop and frees its plants and shadow map.
  // The page backdrop draws on every page and pauses only while this view is
  // walked in (D19, `presence`).
  import { onDestroy, onMount, untrack } from 'svelte'
  import { NO_VIEW, viewDraws } from './ambient.ts'
  import { CONFIDENCE_HIGH, CONFIDENCE_LOW, OOD_COLOR } from './colors.ts'
  import type { OverlayMode } from './colors.ts'
  import { formatHour, wrapHour } from './daynight.ts'
  import { animalSpeedLabel, DEFAULT_ANIMAL_SPEED, nextAnimalSpeed } from './pace.ts'
  import type { AnimalSpeed } from './pace.ts'
  import { classOverlay, PALETTE, toCss } from './palette.ts'
  import { viewPresence } from './presence.ts'
  import { DEFAULT_QUALITY, lowerPreset, minPreset, TARGET_FPS } from './quality.ts'
  import type { QualityPreset } from './quality.ts'
  import { WorldRenderer, WorldUnavailableError } from './scene.ts'
  import type { ViewMode, WalkStatus, WorldStats, WorldTool } from './scene.ts'
  import type { DirtyRect } from './terrain.ts'
  import { DEFAULT_LOOK, readCell } from './walk.ts'
  import type { ExitReason, WalkExit } from './walk.ts'
  import WalkHud from './WalkHud.svelte'
  import type { PredictionState } from '../state/appState.ts'

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
    /** Rounded percent of land per class, shown in the legend next to each class. */
    shares?: readonly number[] | null
    selected: { x: number; y: number } | null
    herbivores?: Float32Array | null
    predators?: Float32Array | null
    /** Floats per animal: 2 = [x, y], 3 = [x, y, heading] (POSE_STRIDE). */
    poseStride?: number
    /** Shown over the orbit view while set (e.g. the model is loading or predicting). */
    busy?: string | null
    onpick?: (x: number, y: number) => void
    onheightmapchange?: (rect: DirtyRect) => void

    /** World seed: the same seed and cover map give the same forest. */
    seed?: number
    /** 'orbit' or 'walk' (D8). */
    viewMode?: ViewMode
    onviewmodechange?: (mode: ViewMode) => void
    /** Quality preset (D12). */
    quality?: QualityPreset
    /** Hour of day, 0..24 (D10). Lighting only: never a model input. */
    timeOfDay?: number
    autoCycle?: boolean
    ontimeofdaychange?: (hour: number) => void
    onautocyclechange?: (on: boolean) => void
    overlay?: OverlayMode
    showOod?: boolean
    onoverlaychange?: (mode: OverlayMode) => void
    onshowoodchange?: (on: boolean) => void
    reducedMotion?: boolean
    /** One line that stays visible in walk mode (D11). */
    notice?: string
    /** Prediction state for the walk HUD. */
    prediction?: PredictionState

    /**
     * False while the page that holds this view is not the one shown (the
     * Sandbox stays mounted behind the other pages). The view then takes no
     * keys and does not draw.
     */
    shown?: boolean
    /** Walk mode was left (button, Esc, V, pointer lock lost): the reason and the cell last stood on (D15). */
    onexit?: (exit: WalkExit) => void
    /** Walk-mode look settings (D15). The defaults are the behaviour before they existed. */
    lookSensitivity?: number
    invertLookY?: boolean
    /** Vertical field of view in walk mode, degrees (WALK_FOV_RANGE). */
    fov?: number
    /** The "Animal speed" choice (D16). The page applies it to the sim clock; the view shows and cycles it (G). */
    animalSpeed?: AnimalSpeed
    onanimalspeedchange?: (speed: AnimalSpeed) => void
    /** The sim time scale in effect, for the `P` readout (1 = full sim speed). */
    animalTimeScale?: number | null
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
    shares = null,
    selected,
    herbivores = null,
    predators = null,
    poseStride = 2,
    busy = null,
    onpick,
    onheightmapchange,
    seed = 0,
    viewMode,
    onviewmodechange,
    quality,
    timeOfDay,
    autoCycle,
    ontimeofdaychange,
    onautocyclechange,
    overlay,
    showOod,
    onoverlaychange,
    onshowoodchange,
    reducedMotion = false,
    notice = 'Predictions are for terrain-like inputs, not real ground truth.',
    prediction = 'ready',
    shown = true,
    onexit,
    lookSensitivity = DEFAULT_LOOK.sensitivity,
    invertLookY = DEFAULT_LOOK.invertY,
    fov = DEFAULT_LOOK.fov,
    animalSpeed = DEFAULT_ANIMAL_SPEED,
    onanimalspeedchange,
    animalTimeScale = null,
  }: Props = $props()

  let host: HTMLDivElement | undefined = $state()
  let frame: HTMLDivElement | undefined = $state()
  let world: WorldRenderer | null = $state.raw(null)
  let failure: string | null = $state(null)

  let tool: WorldTool = $state('select')
  let radius = $state(6)
  let strength = $state(40)

  // Each of these is the prop when the page passes one, else local state.
  let localMode: ViewMode = $state('orbit')
  let localOverlay: OverlayMode = $state('cover')
  let localShowOod = $state(true)
  let localHour = $state(10)
  let localCycle = $state(false)
  const mode = $derived(viewMode ?? localMode)
  const overlayMode = $derived(overlay ?? localOverlay)
  const oodMarks = $derived(showOod ?? localShowOod)
  const hour = $derived(timeOfDay ?? localHour)
  const cycle = $derived(autoCycle ?? localCycle)

  function setMode(m: ViewMode): void {
    localMode = m
    onviewmodechange?.(m)
  }

  // ---- leaving walk mode (D15) ----------------------------------------------------

  /** Why the walk is ending, when this view started the exit. Null: the page did (V, its view switch). */
  let exitReason: ExitReason | null = null

  /** Every exit path ends here: back to orbit view. `onexit` fires when the mode has changed. */
  function exitWalk(reason: ExitReason): void {
    exitReason = reason
    setMode('orbit')
  }

  let wasWalking = false
  $effect(() => {
    const walkingNow = mode === 'walk'
    untrack(() => {
      if (wasWalking && !walkingNow) {
        const reason = exitReason ?? 'key'
        exitReason = null
        onexit?.({ reason, cell: readCell(status.cellX, status.cellY, { heightmap, size, waterLevelM, classes, cover, confidence, ood }) })
      }
      wasWalking = walkingNow
    })
  })

  // ---- who draws (D14) --------------------------------------------------------------

  let onScreen = $state(true)
  const presence = $derived({ shown, onScreen, walking: mode === 'walk' })

  $effect(() => {
    viewPresence.set(presence)
  })

  $effect(() => {
    world?.setActive(viewDraws(presence))
  })

  // Walk mode covers the window: the page under it must not scroll.
  $effect(() => {
    if (mode !== 'walk' || !shown) return
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = before
    }
  })
  function setOverlay(m: OverlayMode): void {
    localOverlay = m
    onoverlaychange?.(m)
  }
  function setShowOod(on: boolean): void {
    localShowOod = on
    onshowoodchange?.(on)
  }
  /** The hour last set or reported, so two quick key presses add up before the prop comes back. */
  let hourNow = 10
  $effect(() => {
    hourNow = hour
  })
  function setHour(h: number): void {
    hourNow = wrapHour(h)
    localHour = hourNow
    ontimeofdaychange?.(hourNow)
  }
  function setCycle(on: boolean): void {
    localCycle = on
    onautocyclechange?.(on)
  }

  // ---- quality and the frame-rate guard (D12) -----------------------------------

  /** Set when the frame-rate guard lowered the preset; cleared when the viewer picks one. */
  let lowered: QualityPreset | null = $state(null)
  let perfNotice: string | null = $state(null)
  const wantedQuality = $derived(quality ?? DEFAULT_QUALITY)
  const effectiveQuality = $derived(lowered ? minPreset(wantedQuality, lowered) : wantedQuality)

  $effect(() => {
    // The viewer chose a preset: their choice replaces the automatic one.
    void wantedQuality
    untrack(() => {
      lowered = null
      perfNotice = null
    })
  })

  function onLowFps(fps: number): void {
    const now = Math.round(fps)
    if (cycle) {
      // D10 fallback: a fixed time of day costs less than a moving sun.
      setCycle(false)
      perfNotice = `The frame rate fell to ${now} fps (target ${TARGET_FPS}), so the day/night cycle was paused. The time of day stays where it is.`
      return
    }
    const next = lowerPreset(effectiveQuality)
    if (next) {
      lowered = next
      perfNotice = `The frame rate fell to ${now} fps (target ${TARGET_FPS}), so quality was lowered to ${next}.`
    } else {
      perfNotice = `The frame rate is ${now} fps, under the ${TARGET_FPS} fps target, on the lowest quality. A smaller window helps.`
    }
  }

  function restoreQuality(): void {
    lowered = null
    perfNotice = null
  }

  // ---- walk mode state ------------------------------------------------------------

  const IDLE: WalkStatus = { active: false, cellX: 0, cellY: 0, x: 0, y: 0, bearing: 0, wading: false, blocked: 'none', look: 'unsupported' }
  let status: WalkStatus = $state.raw(IDLE)
  let helpOpen = $state(false)
  let perfOpen = $state(false)
  let perf: WorldStats | null = $state.raw(null)
  let toast: string | null = $state(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let touch = $state(false)

  function say(text: string): void {
    toast = text
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast = null), 4500)
  }

  function probe(x: number, y: number): void {
    if (!onpick) {
      if (mode === 'walk') say('Predictions are unavailable, so there is nothing to probe here.')
      return
    }
    onpick(x, y)
    if (mode === 'walk') say(`Site Probe opened for cell (${x}, ${y}). Exit walk mode to read it.`)
  }

  function photo(): void {
    if (!world) return
    try {
      const a = document.createElement('a')
      a.href = world.capture()
      a.download = `graze-seed${seed}-${formatHour(world.hour).replace(':', '')}.png`
      a.click()
      if (mode === 'walk') say('Photo saved.')
    } catch {
      say('The photo could not be saved.')
    }
  }

  const TOOLS: { id: WorldTool; label: string; key: string }[] = [
    { id: 'select', label: 'Select', key: '1' },
    { id: 'raise', label: 'Raise', key: '2' },
    { id: 'lower', label: 'Lower', key: '3' },
    { id: 'flatten', label: 'Flatten', key: '4' },
  ]

  const OOD_CSS = toCss(OOD_COLOR)
  const CONF_GRADIENT = `linear-gradient(90deg, ${toCss(CONFIDENCE_LOW)}, ${toCss(CONFIDENCE_HIGH)})`
  const classColors = $derived(classes.map((_, i) => classOverlay(i)))
  /** Legend shown with the plants: walk mode, or orbit view under the Terrain overlay. */
  const plantLegend = $derived(!!cover && (mode === 'walk' || overlayMode === 'terrain'))
  // The class list also carries the shares, so it stays in every overlay once there is a cover map.
  const listClasses = $derived(plantLegend || (!!cover && (overlayMode === 'cover' || !!shares)))
  const showRamp = $derived(!plantLegend && overlayMode === 'confidence' && !!confidence)

  onMount(() => {
    if (!host) return
    try {
      touch = window.matchMedia('(pointer: coarse)').matches
    } catch {
      touch = false
    }
    try {
      world = new WorldRenderer(host, {
        interactive: true,
        reducedMotion: untrack(() => reducedMotion),
        onPick: (x, y) => probe(x, y),
        onHeightmapChange: (r) => onheightmapchange?.(r),
        onViewModeRequest: (m, reason) => (m === 'orbit' ? exitWalk(reason) : setMode(m)),
        onWalkStatus: (s) => (status = s),
        onLowFps,
        onHourChange: (h) => setHour(h),
      })
    } catch (err) {
      failure =
        err instanceof WorldUnavailableError
          ? 'This browser or device cannot show the 3D world (WebGL 2 is unavailable). Try another browser, or enable hardware acceleration.'
          : `The 3D world failed to start: ${err instanceof Error ? err.message : String(err)}`
    }
    // On screen or not: decides whether this view or the page backdrop draws.
    if (frame && typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) onScreen = e.isIntersecting
      })
      io.observe(frame)
      return () => io.disconnect()
    }
  })

  onDestroy(() => {
    viewPresence.set(NO_VIEW)
    clearTimeout(toastTimer)
    world?.destroy() // disposes geometries, materials, textures and every listener
  })

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
    world?.setOverlay({ mode: overlayMode, cover, confidence, ood, showOod: oodMarks, classColors })
  })

  $effect(() => {
    world?.setSelection(selected ? { x: selected.x, y: selected.y } : null)
  })

  $effect(() => {
    world?.setAnimals(herbivores, predators, poseStride)
  })

  $effect(() => {
    world?.setBrush({ tool, radius, strength: tool === 'flatten' ? strength / 40 : strength })
  })

  $effect(() => {
    world?.setSeed(seed)
  })

  $effect(() => {
    world?.setQuality(effectiveQuality)
  })

  $effect(() => {
    world?.setTimeOfDay(hour)
  })

  $effect(() => {
    world?.setAutoCycle(cycle)
  })

  $effect(() => {
    world?.setReducedMotion(reducedMotion)
  })

  $effect(() => {
    world?.setLook({ sensitivity: lookSensitivity, invertY: invertLookY, fov })
  })

  $effect(() => {
    world?.setMode(mode)
    if (mode === 'orbit') {
      helpOpen = false
      toast = null
    }
  })

  // Performance readout (P): polled twice a second while it is open.
  $effect(() => {
    const w = world
    if (!w || !perfOpen) {
      perf = null
      return
    }
    perf = w.stats()
    const id = setInterval(() => (perf = w.stats()), 500)
    return () => clearInterval(id)
  })

  function onkeydown(e: KeyboardEvent): void {
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
    if (e.ctrlKey || e.metaKey || e.altKey || !shown) return
    if (mode === 'orbit') {
      const picked = TOOLS.find((x) => x.key === e.key)
      if (picked) tool = picked.id
      return
    }
    // Walk mode. Movement, E and Esc are handled by the renderer.
    if (e.code === 'KeyH') helpOpen = !helpOpen
    else if (e.code === 'KeyP') perfOpen = !perfOpen
    else if (e.code === 'KeyT') setCycle(!cycle)
    else if (e.code === 'KeyG' && !e.repeat) {
      const next = nextAnimalSpeed(animalSpeed)
      onanimalspeedchange?.(next)
      say(onanimalspeedchange ? `Animal speed: ${animalSpeedLabel(next)}` : 'Animal speed is set by the page.')
    }
    else if (e.code === 'KeyC' && !e.repeat) photo()
    else if (e.code === 'BracketLeft') setHour(hourNow - 1)
    else if (e.code === 'BracketRight') setHour(hourNow + 1)
    else if (e.code === 'Escape' && helpOpen) helpOpen = false
  }

  /** A touch on the view switches the HUD to the joystick layout. */
  function onpointerdown(e: PointerEvent): void {
    if (e.pointerType === 'touch') touch = true
  }
</script>

<svelte:window {onkeydown} />

<div class="world-view">
  {#if failure}
    <div class="notice error" role="alert">{failure}</div>
  {:else}
    <!-- The frame keeps the view's place in the page while walk mode takes the viewport out of it. -->
    <div class="frame" bind:this={frame}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="viewport"
      class:walking={mode === 'walk'}
      bind:this={host}
      {onpointerdown}
      aria-label={mode === 'walk'
        ? '3D terrain, walk mode, full screen. W A S D to walk, mouse or arrow keys to look, E to probe the cell under you, Escape or the Exit walk mode button to leave.'
        : '3D terrain. Select tool: click a cell to probe it. Brush tools: drag to sculpt. Right-drag to orbit, scroll to zoom.'}
    >
      {#if mode === 'walk' && world}
        <WalkHud
          {status}
          {heightmap}
          {size}
          {waterLevelM}
          {classes}
          {classColors}
          {cover}
          {confidence}
          {ood}
          {prediction}
          {notice}
          hourLabel={formatHour(hour)}
          {touch}
          {toast}
          {helpOpen}
          {perf}
          animalSpeedLabel={animalSpeedLabel(animalSpeed)}
          animalScale={animalTimeScale}
          canProbe={!!onpick}
          onmove={(s, f) => world?.setMoveInput(s, f)}
          onprobe={() => world?.probeUnderfoot()}
          onexit={() => exitWalk('button')}
          onhelp={() => (helpOpen = !helpOpen)}
        />
      {:else}
        {#if busy}
          <div class="busy" aria-live="polite">{busy}</div>
        {/if}
        <button type="button" class="photo" onclick={photo} title="Save the view as a PNG (C)">Photo</button>
        {#if perf}
          <div class="orbit-perf">{perf.drawCalls} draw calls · {Math.round(perf.triangles / 1000)}k triangles · {perf.plants} plants · {perf.geometries} geometries · {perf.textures} textures · {perf.programs} programs</div>
        {/if}
      {/if}
    </div>
    </div>

    {#if perfNotice}
      <p class="perf-notice" role="status">
        {perfNotice}
        {#if lowered}<button type="button" class="link" onclick={restoreQuality}>Restore {wantedQuality}</button>{/if}
        <button type="button" class="link" onclick={() => (perfNotice = null)}>Dismiss</button>
      </p>
    {/if}

    <div class="toolbar" inert={mode === 'walk'}>
      <div class="tools" role="radiogroup" aria-label="Tool">
        {#each TOOLS as t (t.id)}
          <button type="button" role="radio" aria-checked={tool === t.id} class:active={tool === t.id} disabled={mode === 'walk'} onclick={() => (tool = t.id)} title="{t.label} ({t.key})">
            {t.label}
          </button>
        {/each}
        <span class="spacer"></span>
        <button type="button" class:active={cycle} aria-pressed={cycle} onclick={() => setCycle(!cycle)}>Day/night cycle</button>
        <button type="button" class:active={oodMarks} aria-pressed={oodMarks} onclick={() => setShowOod(!oodMarks)} disabled={mode === 'walk'}>Low-trust cells</button>
      </div>
      <label class:dimmed={tool === 'select' || mode === 'walk'}>
        <span class="label">Radius · {radius} cells</span>
        <input type="range" aria-valuetext="{radius} cells" min="1" max="20" step="1" bind:value={radius} disabled={tool === 'select' || mode === 'walk'} />
      </label>
      <label class:dimmed={tool === 'select' || mode === 'walk'}>
        <span class="label">Strength · {strength}</span>
        <input type="range" min="5" max="120" step="5" bind:value={strength} disabled={tool === 'select' || mode === 'walk'} />
      </label>
      <label>
        <span class="label">Time · {formatHour(hour)}</span>
        <input type="range" aria-valuetext={formatHour(hour)} min="0" max="24" step="0.25" value={hour} oninput={(e) => setHour(Number(e.currentTarget.value))} />
      </label>
      <label class:dimmed={mode === 'walk'}>
        <span class="label">Overlay{mode === 'walk' ? ' · orbit view only' : ''}</span>
        <select value={overlayMode} onchange={(e) => setOverlay(e.currentTarget.value as OverlayMode)} disabled={mode === 'walk'}>
          <option value="terrain">Terrain and vegetation</option>
          <option value="cover">Predicted cover</option>
          <option value="confidence" disabled={!confidence}>Confidence</option>
        </select>
      </label>
    </div>

    <ul class="legend" aria-label={shares ? 'Legend, with the share of land per predicted cover type' : 'Legend'}>
      {#if listClasses}
        {#if shares}<li class="label">Share of land</li>{/if}
        {#each classes as name, i (i)}
          <li>
            {#if plantLegend}
              <span class="sw tree" style:color={PALETTE.vegetation.classTints[i % PALETTE.vegetation.classTints.length]}></span>
            {:else}
              <span class="sw" style:background={classColors[i]}></span>
            {/if}{name}{#if shares}<span class="pct">{shares[i] ?? 0}%</span>{/if}
          </li>
        {/each}
        {#if plantLegend}
          <li><span class="sw tree" style:color={PALETTE.vegetation.lowTrust}></span>Sparse, grey plants: low trust</li>
        {/if}
      {/if}
      {#if showRamp}
        <li><span>Low</span><span class="ramp" style:background={CONF_GRADIENT}></span><span>High confidence</span></li>
      {:else if !listClasses}
        <li>Terrain colored by elevation and steepness</li>
      {/if}
      {#if mode === 'orbit' && oodMarks && ood}
        <li><span class="sw ood" style:background={OOD_CSS}></span>Low trust: unlike the training data</li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .world-view {
    display: grid;
    gap: 10px;
  }

  .frame {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    /* About half the pinned left column (layout-refactoring.md), leaving room for the controls. */
    max-height: 52vh;
  }

  .viewport {
    position: absolute;
    inset: 0;
    border: 1px solid var(--border);
    background: #0d1013;
    overflow: hidden;
  }

  .viewport :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* Walk mode is full viewport (D14): the view leaves its frame and covers
     the window, above the page and its fixed buttons. It appears at once,
     like the backdrop's dim, which switches with no fade (D20). The camera
     still glides (D8). */
  .viewport.walking {
    position: fixed;
    inset: 0;
    z-index: 30;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    border: 0;
  }

  .busy {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 5px 12px;
    font-size: 14px;
    color: var(--text-2);
    background: rgb(0 0 0 / 0.55);
    pointer-events: none;
  }

  .photo {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgb(0 0 0 / 0.55);
  }

  .orbit-perf {
    position: absolute;
    left: 10px;
    bottom: 10px;
    padding: 5px 10px;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text-2);
    background: rgb(0 0 0 / 0.55);
    pointer-events: none;
  }

  .perf-notice {
    margin: 0;
    font-size: 14px;
    color: var(--warn);
  }

  button.link {
    border: 0;
    padding: 0;
    margin-left: 8px;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 3px;
    font-size: inherit;
    text-transform: none;
    letter-spacing: normal;
  }

  .toolbar {
    display: grid;
    /* Radius, Strength, Time and Overlay on one row; the select gets a bit more for its option text */
    grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.4fr);
    gap: 12px;
  }

  .toolbar label {
    display: grid;
    /* label on top; the control fills the rest of the row (see .toolbar input[type=range]) */
    grid-template-rows: auto 1fr;
    gap: 6px;
    min-width: 0;
  }

  /* one-line labels keep every control in the row at the same height */
  .toolbar .label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    grid-column: 1 / -1;
  }

  .spacer {
    flex: 1;
  }

  .tools button.active {
    color: var(--text);
    border-color: var(--text-2);
  }

  .dimmed {
    opacity: 0.45;
  }

  /* slider tracks sit level with the middle of the select */
  .toolbar input[type='range'] {
    align-self: center;
  }


  .legend {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-2);
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pct {
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }

  .sw {
    display: inline-block;
    flex: none;
    width: 10px;
    height: 10px;
  }

  .sw.tree {
    width: 0;
    height: 0;
    background: none !important;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 11px solid currentColor;
  }

  .sw.ood {
    background-image: repeating-linear-gradient(45deg, transparent 0 2px, rgb(0 0 0 / 0.35) 2px 3px);
  }

  .ramp {
    display: inline-block;
    width: 100px;
    height: 10px;
  }
</style>
