<script lang="ts">
  import { onDestroy, onMount, type Snippet } from 'svelte'
  import { modelStatus, predictBatch } from '../model/client.ts'
  import { createPredictionSession, predictionStateOf } from '../model/predictionSession.ts'
  import { heightmapToInputs, sampleAt } from '../deps/features.ts'
  import type { TerrainInputs } from '../deps/features.ts'
  import { POSE_STRIDE, type InterpolatedPoses } from '../deps/herd.ts'
  import { inputSpec } from '../model/modelCard.ts'
  import SiteProbe from '../probe/SiteProbe.svelte'
  import WalkPanel from '../sandbox/WalkPanel.svelte'
  import { fetchWorld, modelMismatchNotice, parseWorldHash, saveWorld, worldShareHash, type SavedWorld } from '../sandbox/worldIo.ts'
  import SettingsPanel from '../settings/SettingsPanel.svelte'
  import { reducedMotion, settings } from '../state/settings.ts'
  import type { HerdSummary } from '../sim/herdSummary.ts'
  import SimPanel from '../sim/SimPanel.svelte'
  import { liveWorld, livePoses } from '../state/liveWorld.ts'
  import { helpOpen, isTypingTarget } from '../help/help.ts'
  import { route } from '../router.ts'
  import { probeOpen, selectCell, selectedCell, terrainVersion, viewMode, worldConfig, worldKeyOf, type ViewMode } from '../state/appState.ts'
  import { openSavedWorld, terrainFor, toSavedWorld } from '../state/worldTerrain.ts'
  import { PREDICTION_NOTICE, WORLD_FEATURES } from '../state/worldFeatures.ts'
  import { CELL_SIZE_M, COVERTYPE_ELEVATION, GRID, reliefBand, waterLevelForShare } from '../world/terrain.ts'
  import { exportShareCode, importWorld, readWorldInput } from '../world/share.ts'
  import type { WalkExit } from '../world/walk.ts'
  import WorldView from '../world/WorldView.svelte'

  interface Props {
    /** Top of the right-hand feed: title, badges, section chips. */
    header?: Snippet
    /** The feed after the Overview: Model Report, Responsible Use, footer. */
    children?: Snippet
  }

  let { header, children }: Props = $props()

  // A new section starts at the top of the feed.
  let feed: HTMLDivElement | undefined = $state()
  $effect(() => {
    void $route
    feed?.scrollTo(0, 0)
  })

  const DEBOUNCE_MS = 250

  const card = $derived($modelStatus.state === 'ready' ? $modelStatus.card : null)
  // Without a model the world still renders and can be sculpted (D9: "walk
  // mode stays usable with a predictions-unavailable state"). The generator
  // then scales into Covertype's documented elevation range.
  const elevation = $derived.by(() => {
    if (!card) return COVERTYPE_ELEVATION
    const e = inputSpec(card, 'elevation')
    return { min: e.min, max: e.max }
  })

  // Terrain from the shared store. It is cached in state/worldTerrain.ts, so
  // leaving this page and coming back keeps brush edits. WorldView's brush
  // edits `entry.heightmap` IN PLACE and then calls onheightmapchange.
  // An opened world keeps the elevation range it was saved in, which can
  // differ from `elevation` (the model loaded now): read `entry.elevation`.
  const entry = $derived(terrainFor($worldConfig, $terrainVersion, elevation))
  const heightM = $derived(entry.heightmap)
  const band = $derived(reliefBand(entry.elevation, $worldConfig.relief, $worldConfig.center))

  // Water level in meters for the chosen share of cells. Recomputed when the
  // slider or the terrain identity changes, not on every brush stroke, so
  // sculpting below the water line floods instead of moving the water.
  const waterLevel = $derived(waterLevelForShare(heightM, $worldConfig.waterShare))

  // The live terrain inputs: the Site Probe reads them at once. The brush
  // edits the heightmap IN PLACE (Svelte cannot see that), so a brush stroke
  // refreshes them through onHeightmapChange; everything else through the effect.
  let cells: TerrainInputs | null = $state.raw(null)
  function refreshCells(): void {
    // Water distance is global, so the whole grid is recomputed (~16k cells, ~4 ms).
    cells = heightmapToInputs(heightM, { size: GRID, cellSizeM: CELL_SIZE_M, waterLevelM: waterLevel })
  }
  $effect(refreshCells)

  // Poses keep their heading ([x, y, heading, ...]), so the animals face the way they move.
  let poses: InterpolatedPoses | null = $state.raw(null)

  // The page background draws this same world (ROLE-1 D14). The heightmap is
  // edited in place, so `terrainRev` tells it when to look again.
  let terrainRev = $state(0)
  $effect(() => {
    liveWorld.set({
      heightmap: heightM,
      size: GRID,
      cellSizeM: CELL_SIZE_M,
      waterLevelM: waterLevel,
      elevation: { min: entry.elevation.min, max: entry.elevation.max },
      seed: $worldConfig.seed,
      cover: map?.cover ?? null,
      ood: map?.ood ?? null,
      terrainRev,
    })
  })

  function onPoses(p: InterpolatedPoses | null): void {
    poses = p
    livePoses.set(p ? { herbivores: p.herbivores, predators: p.predators, stride: POSE_STRIDE } : null)
  }

  function onHeightmapChange(): void {
    terrainRev++
    refreshCells()
    // Refresh an open probe so it shows the sculpted cell, not stale values.
    const sel = $selectedCell
    if ($probeOpen && sel) pick(sel.x, sel.y)
  }

  // Cover maps: debounced, stale results dropped, and each map published
  // together with the inputs (and water mask) it was predicted from.
  const session = createPredictionSession(predictBatch, { debounceMs: DEBOUNCE_MS })
  const prediction = session.snapshot
  const map = $derived($prediction.map)

  $effect(() => {
    if (cells && card) session.request(cells, worldKeyOf($worldConfig))
    else session.cancel()
  })

  const predictionState = $derived(predictionStateOf($modelStatus.state, $prediction))
  const busy = $derived(predictionState === 'loading' ? 'Loading the model…' : predictionState === 'predicting' ? 'Predicting…' : null)

  // The one selection event (D9): orbit clicks and "inspect cell underfoot"
  // (E in walk mode, ROLE-1 D11) both reach this through WorldView's onpick.
  function pick(x: number, y: number): void {
    if (!cells) return
    const i = y * GRID + x
    selectCell({ x, y, sample: sampleAt(cells.packed, i), water: cells.water[i] === 1 })
    probeOpen.set(true)
  }

  function manualProbe(): void {
    selectCell(null)
    probeOpen.set(true)
  }

  // Rounded percent of land per class, from one cover map and the water mask it was predicted with.
  const shares = $derived.by(() => {
    if (!map || !card) return null
    const { cover, inputs } = map
    const out = new Array<number>(card.classes.length).fill(0)
    let land = 0
    for (let i = 0; i < cover.length; i++) {
      if (inputs.water[i]) continue
      out[cover[i]]++
      land++
    }
    return out.map((n) => (land ? Math.round((n / land) * 100) : 0))
  })

  // ---- view mode, settings, help ---------------------------------------

  let settingsOpen = $state(false)

  function setMode(m: ViewMode): void {
    if (m === 'walk' && !WORLD_FEATURES.walkMode) return
    if (m === 'walk') walkExit = null
    viewMode.set(m)
  }

  function onkeydown(e: KeyboardEvent): void {
    // Not under the walk panel (a dialog).
    if (walkExit) return
    if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || $helpOpen) return
    if (e.key === 'v' || e.key === 'V') setMode($viewMode === 'orbit' ? 'walk' : 'orbit')
  }

  // ---- leaving walk mode: the info and settings panel (ROLE-1 D15) --------

  let walkButton: HTMLButtonElement | undefined = $state()
  /** Set when walk mode was left: why, and the cell last stood on. The panel is open while it is set. */
  let walkExit: WalkExit | null = $state.raw(null)
  let herd: HerdSummary | null = $state.raw(null)

  function onWalkExit(exit: WalkExit): void {
    walkExit = exit
  }

  function closeWalkPanel(): void {
    walkExit = null
    // Focus goes back to where walk mode is entered from.
    queueMicrotask(() => walkButton?.focus())
  }

  function resumeWalk(): void {
    walkExit = null
    setMode('walk')
  }

  // ---- animal pace (ROLE-1 D16) ---------------------------------------------

  // Walk mode shows the herds at walking pace. Orbit view and the herd
  // panel run at full sim speed: the pace follows the view mode.
  const groundLevel = $derived($viewMode === 'walk')

  // ---- terrain controls (write the shared store) -------------------------

  function setSeed(v: number): void {
    if (Number.isFinite(v)) worldConfig.update((c) => ({ ...c, seed: Math.trunc(v) }))
  }

  // ---- save, share, load (D12) ---------------------------------------------

  let shareState: { kind: 'idle' } | { kind: 'busy'; what: string } | { kind: 'saved'; id: string; url: string } | { kind: 'error'; message: string } = $state({ kind: 'idle' })
  let worldNotice: string | null = $state(null)
  let codeInput = $state('')
  let copied = $state(false)

  /** The world being worked on, in saved-world form (recipe, edits, model version). */
  function currentWorld(modelVersion: string): SavedWorld {
    return toSavedWorld(entry, $worldConfig.waterShare, modelVersion)
  }

  async function save(): Promise<void> {
    if (!card) return
    shareState = { kind: 'busy', what: 'Saving…' }
    const r = await saveWorld(currentWorld(card.model.version))
    if (!r.ok) {
      shareState = { kind: 'error', message: r.message }
      return
    }
    const url = new URL(worldShareHash(r.value.id), location.href).href
    shareState = { kind: 'saved', id: r.value.id, url }
  }

  async function copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      copied = true
      setTimeout(() => (copied = false), 1500)
    } catch {
      copied = false
    }
  }

  async function load(id: string): Promise<void> {
    shareState = { kind: 'busy', what: 'Loading the saved world…' }
    worldNotice = null
    const r = await fetchWorld(id)
    if (!r.ok) {
      shareState = { kind: 'error', message: r.message }
      return
    }
    openWorld(r.value)
    loadedFrom = id
  }

  /** Make a saved world (from the API or from a pasted code) the world being worked on. */
  function openWorld(world: SavedWorld): void {
    // Predictions are never stored: the batch effect re-predicts with the current model.
    openSavedWorld(world)
    probeOpen.set(false)
    shareState = { kind: 'idle' }
    const current = card?.model.version
    worldNotice = current ? modelMismatchNotice(world.modelVersion, current) : null
  }

  // Offline share code (ROLE-1 D13): the same saved world, compressed into
  // text. It needs no server, so it works when the Worlds API is not deployed.
  let codeCopied = $state(false)

  async function copyCode(): Promise<void> {
    if (!card) return
    try {
      await navigator.clipboard.writeText(await exportShareCode(currentWorld(card.model.version)))
      codeCopied = true
      setTimeout(() => (codeCopied = false), 1500)
    } catch {
      shareState = { kind: 'error', message: 'The code could not be copied. The browser blocked the clipboard.' }
    }
  }

  async function loadCode(text: string): Promise<void> {
    shareState = { kind: 'busy', what: 'Opening the world…' }
    worldNotice = null
    const r = await importWorld(text)
    if (!r.ok) {
      shareState = { kind: 'error', message: r.message }
      return
    }
    openWorld(r.world)
    loadedFrom = null
    codeInput = ''
  }

  let loadedFrom: string | null = $state(null)

  function loadFromInput(): void {
    const input = readWorldInput(codeInput)
    if (input.kind === 'text') void loadCode(input.text)
    else if (input.kind === 'id') location.hash = worldShareHash(input.id)
    else shareState = { kind: 'error', message: input.message }
  }

  // A world link is loaded once the model has settled (ready or failed), so
  // the notice can compare the saved model version with the loaded one.
  let pendingId: string | null = $state(null)

  function onHash(): void {
    // A link in the walk panel (Model Report, Responsible Use) scrolls the feed: close the panel, keep the world.
    walkExit = null
    const id = parseWorldHash(location.hash)
    if (id && id !== loadedFrom) pendingId = id
  }

  $effect(() => {
    if (pendingId && $modelStatus.state !== 'loading') {
      const id = pendingId
      pendingId = null
      void load(id)
    }
  })

  onMount(() => {
    onHash()
    window.addEventListener('hashchange', onHash)
  })

  onDestroy(() => {
    session.dispose()
    window.removeEventListener('hashchange', onHash)
  })
</script>

<svelte:window {onkeydown} />

<!-- Left column (layout-refactoring.md): the viewport and its controls stay in view. -->
<section class="player" aria-labelledby="sandbox-title">
  <!-- Walk mode covers the window: what it covers is inert, so Tab cannot reach it. -->
  <div class="covered" inert={$viewMode === 'walk'}>
  <h2 id="sandbox-title" class="visually-hidden">Sandbox</h2>

  {#if $modelStatus.state === 'error'}
    <div class="notice error" role="alert">
      <strong>Predictions unavailable.</strong> The model files (<code>model.json</code>, <code>model_card.json</code>) did not load, so there
      is no cover map, Site Probe or herd simulation. You can still sculpt and explore the terrain, and read the
      <a href="#/responsible-use">Responsible Use</a> page.
    </div>
  {/if}

  <div class="viewbar">
    <div class="seg" role="radiogroup" aria-label="View mode">
      <button type="button" role="radio" aria-checked={$viewMode === 'orbit'} class:active={$viewMode === 'orbit'} onclick={() => setMode('orbit')}>Orbit</button>
      <button
        type="button"
        role="radio"
        aria-checked={$viewMode === 'walk'}
        class:active={$viewMode === 'walk'}
        disabled={!WORLD_FEATURES.walkMode}
        title={WORLD_FEATURES.walkMode ? 'Walk at ground level (V)' : 'Walk mode comes with the 3D world update (Role 1)'}
        bind:this={walkButton}
        onclick={() => setMode('walk')}>Walk <kbd>V</kbd></button
      >
    </div>
    <div class="right">
      <button type="button" onclick={() => (settingsOpen = !settingsOpen)} aria-expanded={settingsOpen}>Settings</button>
      <button type="button" onclick={() => helpOpen.set(true)} aria-haspopup="dialog">Help <kbd>?</kbd></button>
    </div>
  </div>

  {#if settingsOpen}
    <SettingsPanel onclose={() => (settingsOpen = false)} />
  {/if}


  {#if worldNotice}
    <p class="notice warn" role="status">{worldNotice} <button type="button" class="link" onclick={() => (worldNotice = null)}>Dismiss</button></p>
  {/if}
  </div>

  <div class="map">
    <WorldView
      onexit={onWalkExit}
      lookSensitivity={$settings.lookSensitivity}
      invertLookY={$settings.invertLookY}
      fov={$settings.fov}
      animalSpeed={$settings.animalSpeed}
      onanimalspeedchange={(a) => settings.update((v) => ({ ...v, animalSpeed: a }))}
      animalTimeScale={herd?.timeScale ?? null}
      heightmap={heightM}
      size={GRID}
      cellSizeM={CELL_SIZE_M}
      waterLevelM={waterLevel}
      elevation={{ min: elevation.min, max: elevation.max }}
      classes={card?.classes ?? []}
      cover={map?.cover ?? null}
      confidence={map?.confidence ?? null}
      ood={map?.ood ?? null}
      {shares}
      selected={$probeOpen ? $selectedCell : null}
      herbivores={poses?.herbivores ?? null}
      predators={poses?.predators ?? null}
      poseStride={POSE_STRIDE}
      {busy}
      onpick={card ? pick : undefined}
      onheightmapchange={onHeightmapChange}
      seed={$worldConfig.seed}
      viewMode={$viewMode}
      onviewmodechange={setMode}
      quality={$settings.quality}
      timeOfDay={$settings.timeOfDay}
      autoCycle={$settings.autoCycle}
      ontimeofdaychange={(h) => settings.update((v) => ({ ...v, timeOfDay: h }))}
      onautocyclechange={(on) => settings.update((v) => ({ ...v, autoCycle: on }))}
      overlay={$settings.overlay}
      showOod={$settings.showOod}
      onoverlaychange={(m) => settings.update((v) => ({ ...v, overlay: m }))}
      onshowoodchange={(on) => settings.update((v) => ({ ...v, showOod: on }))}
      reducedMotion={$reducedMotion}
      notice={PREDICTION_NOTICE}
      prediction={predictionState}
    />
  </div>

  {#if walkExit}
    <WalkPanel
      exit={walkExit}
      {herd}
      animalSpeed={$settings.animalSpeed}
      cellSizeM={CELL_SIZE_M}
      canResume={WORLD_FEATURES.walkMode}
      onresume={resumeWalk}
      onclose={closeWalkPanel}
    />
  {/if}

  <div class="covered" inert={$viewMode === 'walk'}>
  <p class="status muted" aria-live="polite">
    {#if predictionState === 'unavailable'}
      <span class="err">Predictions unavailable: no model loaded.</span>
    {:else if predictionState === 'loading'}
      Loading the model…
    {:else if predictionState === 'failed'}
      <span class="err">Prediction failed: {$prediction.error}</span>
    {:else if predictionState === 'predicting'}
      Predicting {GRID * GRID} cells in the browser…
    {:else if map}
      {GRID * GRID} cells predicted in the browser · {map.oodCount} low trust{map.invalidCount ? ` · ${map.invalidCount} invalid` : ''}{map.inputs.hasWater
        ? ''
        : ' · no water on this map'}
    {/if}
  </p>

  <div class="controls">
    <label>
      <span class="label">Terrain seed</span>
      <input type="number" step="1" value={$worldConfig.seed} onchange={(e) => setSeed(Number(e.currentTarget.value))} />
    </label>
    <label>
      <span class="label">Elevation · {Math.round(band.min)}–{Math.round(band.max)} m</span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={Math.round($worldConfig.center * 100)}
        oninput={(e) => worldConfig.update((c) => ({ ...c, center: Number(e.currentTarget.value) / 100 }))}
      />
    </label>
    <label class="water">
      <span class="label">Water level · {Math.round($worldConfig.waterShare * 100)}% of cells</span>
      <input
        type="range"
        min="0"
        max="40"
        step="1"
        value={Math.round($worldConfig.waterShare * 100)}
        oninput={(e) => worldConfig.update((c) => ({ ...c, waterShare: Number(e.currentTarget.value) / 100 }))}
      />
    </label>
  </div>

  <div class="share" aria-labelledby="share-title">
    <h3 id="share-title" class="visually-hidden">Save and share</h3>
    <div class="share-row">
      <button type="button" onclick={() => terrainVersion.update((v) => v + 1)}>Reset terrain</button>
      <button type="button" onclick={manualProbe} disabled={!card}>Enter values manually</button>
      <button type="button" onclick={save} disabled={!card || shareState.kind === 'busy'}>Save and get a link</button>
      <button type="button" onclick={copyCode} disabled={!card || shareState.kind === 'busy'} title="A code that holds the whole world. It works without the saved-worlds service.">
        {codeCopied ? 'Code copied' : 'Copy offline code'}
      </button>
      <form
        class="load"
        onsubmit={(e) => {
          e.preventDefault()
          loadFromInput()
        }}
      >
        <input type="text" bind:value={codeInput} placeholder="World code or link" aria-label="World code, share link or offline code" maxlength="300000" spellcheck="false" autocomplete="off" />
        <button type="submit" disabled={!codeInput.trim() || shareState.kind === 'busy'}>Open</button>
      </form>
    </div>
    <p class="muted small" aria-live="polite">
      {#if shareState.kind === 'busy'}
        {shareState.what}
      {:else if shareState.kind === 'saved'}
        Saved. Code <strong>{shareState.id}</strong> · <a href={shareState.url}>{shareState.url}</a>
        <button type="button" class="link" onclick={() => shareState.kind === 'saved' && copyLink(shareState.url)}>{copied ? 'Copied' : 'Copy link'}</button>
      {:else if shareState.kind === 'error'}
        <span class="err">{shareState.message}</span>
      {/if}
    </p>
  </div>
  </div>
</section>

<!-- Right column: title, then the chosen section (Overview, Model Report or Responsible Use). -->
<div class="feed" bind:this={feed} inert={$viewMode === 'walk'}>
  {@render header?.()}

  <!-- Hidden, not unmounted, on the other sections: its herd panel runs the sim the canvas draws. -->
  <section id="overview" class="section" aria-labelledby="overview-title" hidden={$route !== 'sandbox'}>
    <h2 id="overview-title">Overview</h2>
  <p class="hint muted">
    {#if $viewMode === 'walk'}
      Walk the valley you sculpted. The plants are the model's predicted cover type; sparse, grey plants mark low trust. Press E to probe the cell under you, Esc to exit.
    {:else}
      Select a cell to probe it. Raise, lower or flatten the ground and the cover map is predicted again in your browser. Right-drag to orbit, scroll to zoom.
    {/if}
  </p>
    <p class="hint muted">Save and get a link keeps the seed, the sliders and your brush edits, plus the model version. No predictions and no personal data. The offline code holds the same world as text and needs no server.</p>
    <p class="world-notice">{PREDICTION_NOTICE}</p>

    {#if $probeOpen && card}
    <SiteProbe {card} selection={$selectedCell} onclose={() => probeOpen.set(false)} />
  {/if}

    {#if card && cells}
    <SimPanel
      size={GRID}
      cover={map?.cover ?? null}
      water={map?.inputs.water ?? cells.water}
      classes={card.classes}
      mapVersion={map?.version ?? 0}
      worldKey={map?.worldKey ?? ''}
      onposes={onPoses}
      animalSpeed={groundLevel ? $settings.animalSpeed : null}
      onsummary={(h) => (herd = h)}
    />
  {/if}
  </section>

  {@render children?.()}
</div>

<style>
  /* The two columns sit in App.svelte's grid. */
  .player {
    position: sticky;
    top: 0;
    /* Sticky makes the column a stacking context: lift it above the feed so the full-window walk view covers everything. */
    z-index: 1;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .feed {
    height: 100vh;
    height: 100dvh;
    overflow-y: auto;
    padding: 24px 28px 48px;
    scrollbar-width: thin;
  }

  /* The canvas takes whatever height the controls leave, so the column never scrolls. */
  .map {
    flex: 1 1 0;
    min-height: 0;
  }

  .map :global(.world-view) {
    height: 100%;
    grid-template-rows: minmax(0, 1fr);
  }

  .map :global(.frame) {
    aspect-ratio: auto;
    max-height: none;
  }

  .feed :global(.section) {
    margin-top: 40px;
  }

  @media (max-width: 960px) {
    .player,
    .feed {
      position: static;
      height: auto;
      overflow: visible;
    }

    /* One column: the canvas goes back to its own shape. */
    .map {
      flex: none;
    }

    .map :global(.world-view) {
      height: auto;
    }

    .map :global(.frame) {
      aspect-ratio: 16 / 10;
      max-height: 52vh;
    }
  }

  .hint {
    font-size: 15px;
    margin: 14px 0;
  }

  .viewbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .seg,
  .right {
    display: flex;
    gap: 4px;
  }

  .seg button.active {
    color: var(--text);
    border-color: var(--text-2);
    background: var(--fill);
  }

  kbd {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text-3);
    margin-left: 4px;
  }

  .world-notice {
    font-size: 14px;
    color: var(--text-2);
    margin: 8px 0 24px;
  }

  .status {
    text-align: center;
    font-size: 14px;
    margin-top: 4px;
    min-height: 1.6em;
  }

  .err {
    color: var(--error);
  }

  .controls {
    margin-top: 8px;
    display: grid;
    /* the seed needs little width; each slider column is at least as wide as its one-line label */
    grid-template-columns: 8em minmax(max-content, 1fr) minmax(max-content, 1fr);
    gap: 10px 20px;
  }

  /* below this the three labels no longer fit side by side: water level gets its own row */
  @media (max-width: 1340px) {
    .controls {
      grid-template-columns: 8em minmax(0, 1fr);
    }

    .controls .water {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 960px) {
    .controls {
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    }
  }

  /* same shape as the toolbar: label on top, sliders level with the middle of the seed box */
  .controls label {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 6px;
  }

  .controls .label {
    white-space: nowrap;
  }

  .controls input[type='range'] {
    align-self: center;
  }

  .share {
    margin-top: 12px;
    display: grid;
    gap: 8px;
  }

  .share-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .load {
    display: flex;
    gap: 8px;
    flex: 1 1 200px;
    min-width: 0;
  }

  .load input {
    flex: 1;
    min-width: 0;
  }

  .small {
    font-size: 14px;
    overflow-wrap: anywhere;
  }

  .small strong {
    color: var(--text);
    font-weight: 500;
  }

  button.link {
    border: 0;
    padding: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 3px;
    font-size: inherit;
    text-transform: none;
    letter-spacing: normal;
  }

  code {
    font-size: 15px;
    color: var(--text);
  }
</style>
