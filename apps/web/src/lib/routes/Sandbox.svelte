<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { modelStatus, predictBatch } from '../model/client.ts'
  import { heightmapToInputs, sampleAt } from '../deps/features.ts'
  import type { TerrainInputs } from '../deps/features.ts'
  import { POSE_STRIDE, type InterpolatedPoses } from '../deps/herd.ts'
  import { inputSpec } from '../model/modelCard.ts'
  import SiteProbe from '../probe/SiteProbe.svelte'
  import { classColor } from '../sandbox/palette.ts'
  import { fetchWorld, modelMismatchNotice, parseWorldHash, restoreWorld, saveWorld, worldShareHash, type RestoredWorld } from '../sandbox/worldIo.ts'
  import SettingsPanel from '../settings/SettingsPanel.svelte'
  import { reducedMotion, settings } from '../state/settings.ts'
  import SimPanel from '../sim/SimPanel.svelte'
  import { helpOpen, isTypingTarget } from '../help/help.ts'
  import {
    installTerrain,
    probeOpen,
    selectCell,
    selectedCell,
    terrainFor,
    terrainVersion,
    viewMode,
    worldConfig,
    worldKeyOf,
    type ViewMode,
  } from '../state/appState.ts'
  import { PREDICTION_NOTICE, WORLD_FEATURES } from '../state/worldFeatures.ts'
  import { CELL_SIZE_M, COVERTYPE_ELEVATION, GRID, reliefBand, waterLevelForShare } from '../world/terrain.ts'
  import { exportShareCode, exportWorld, importWorld, isShareCode } from '../world/share.ts'
  import WorldView from '../world/WorldView.svelte'

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

  // Terrain from the shared store. The entry is cached in appState, so
  // leaving this page and coming back keeps brush edits. WorldView's brush
  // edits `entry.heightmap` IN PLACE and then calls onheightmapchange.
  const entry = $derived(terrainFor($worldConfig, $terrainVersion, elevation))
  const heightM = $derived(entry.heightmap)
  const band = $derived(reliefBand(elevation, $worldConfig.relief, $worldConfig.center))

  // Water level in meters for the chosen share of cells. Recomputed when the
  // slider or the terrain identity changes, not on every brush stroke, so
  // sculpting below the water line floods instead of moving the water.
  const waterLevel = $derived(waterLevelForShare(heightM, $worldConfig.waterShare))

  let cells: TerrainInputs | null = $state.raw(null)
  $effect(() => {
    cells = heightmapToInputs(heightM, { size: GRID, cellSizeM: CELL_SIZE_M, waterLevelM: waterLevel })
  })

  let cover: Uint8Array | null = $state.raw(null)
  let confidence: Float32Array | null = $state.raw(null)
  let ood: Uint8Array | null = $state.raw(null)
  let batchInfo: { oodCount: number; invalidCount: number } | null = $state(null)
  let mapVersion = $state(0)
  /** worldKeyOf() of the terrain the current cover map was predicted for. */
  let coverWorldKey = $state('')
  let predicting = $state(false)
  let predictError: string | null = $state(null)
  // Poses keep their heading ([x, y, heading, ...]), so the animals face the way they move.
  let poses: InterpolatedPoses | null = $state.raw(null)

  function onHeightmapChange(): void {
    // Water distance is global, so the whole grid is recomputed (~16k cells, ~4 ms).
    cells = heightmapToInputs(heightM, { size: GRID, cellSizeM: CELL_SIZE_M, waterLevelM: waterLevel })
    // Refresh an open probe so it shows the sculpted cell, not stale values.
    const sel = $selectedCell
    if ($probeOpen && sel) pick(sel.x, sel.y)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0

  // Debounced batch prediction whenever the terrain (or the model) changes.
  $effect(() => {
    const c = cells
    const ready = !!card
    const key = worldKeyOf($worldConfig)
    clearTimeout(timer)
    if (!c || !ready) return
    timer = setTimeout(() => runBatch(c.packed, key), DEBOUNCE_MS)
  })

  async function runBatch(inputs: Float32Array, key: string): Promise<void> {
    const mine = ++seq
    predicting = true
    predictError = null
    try {
      const r = await predictBatch(inputs.slice()) // copy: the buffer is transferred
      if (mine !== seq) return
      cover = r.classIndex
      confidence = r.confidence
      ood = r.ood
      batchInfo = { oodCount: r.oodCount, invalidCount: r.invalidCount }
      coverWorldKey = key
      mapVersion++
    } catch (err) {
      if (mine === seq) predictError = err instanceof Error ? err.message : String(err)
    } finally {
      if (mine === seq) predicting = false
    }
  }

  /**
   * One prediction state for every view (orbit overlay, walk HUD):
   * loading | predicting | ready | unavailable (no model) | failed (this batch).
   */
  const predictionState = $derived(
    $modelStatus.state === 'loading' ? 'loading' : $modelStatus.state === 'error' ? 'unavailable' : predictError ? 'failed' : predicting ? 'predicting' : 'ready',
  )
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

  const counts = $derived.by(() => {
    if (!cover || !cells || !card || cover.length !== cells.water.length) return null
    const out = new Array<number>(card.classes.length).fill(0)
    let land = 0
    for (let i = 0; i < cover.length; i++) {
      if (cells.water[i]) continue
      out[cover[i]]++
      land++
    }
    return { out, land }
  })

  // ---- view mode, settings, help ---------------------------------------

  let settingsOpen = $state(false)

  function setMode(m: ViewMode): void {
    if (m === 'walk' && !WORLD_FEATURES.walkMode) return
    viewMode.set(m)
  }

  function onkeydown(e: KeyboardEvent): void {
    if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || $helpOpen) return
    if (e.key === 'v' || e.key === 'V') setMode($viewMode === 'orbit' ? 'walk' : 'orbit')
  }

  // ---- terrain controls (write the shared store) -------------------------

  function setSeed(v: number): void {
    if (Number.isFinite(v)) worldConfig.update((c) => ({ ...c, seed: Math.trunc(v) }))
  }

  // ---- save, share, load (D12) ---------------------------------------------

  let shareState: { kind: 'idle' } | { kind: 'busy'; what: string } | { kind: 'saved'; id: string; url: string } | { kind: 'error'; message: string } = $state({ kind: 'idle' })
  let worldNotice: string | null = $state(null)
  let codeInput = $state('')
  let copied = $state(false)

  async function save(): Promise<void> {
    if (!card) return
    shareState = { kind: 'busy', what: 'Saving…' }
    const world = exportWorld({ config: $worldConfig, modelVersion: card.model.version, elevation, base: entry.base, heightmap: entry.heightmap })
    const r = await saveWorld(world)
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
    showRestored(restoreWorld(r.value), r.value.modelVersion)
    loadedFrom = id
  }

  /** Show a restored world (from the API or from a pasted code). */
  function showRestored(restored: RestoredWorld, savedModelVersion: string): void {
    // Install first, then point the store at it, so the Sandbox picks up the
    // loaded heightmap (with its edits) instead of regenerating. Predictions
    // are never stored: the batch effect re-predicts with the current model.
    installTerrain(restored.config, $terrainVersion, elevation, restored.base, restored.heightmap)
    worldConfig.set(restored.config)
    probeOpen.set(false)
    shareState = { kind: 'idle' }
    const current = card?.model.version
    worldNotice = current ? modelMismatchNotice(savedModelVersion, current) : null
  }

  // Offline share code (ROLE-1 D13): the same saved world, compressed into
  // text. It needs no server, so it works when the Worlds API is not deployed.
  let codeCopied = $state(false)

  async function copyCode(): Promise<void> {
    if (!card) return
    const world = exportWorld({ config: $worldConfig, modelVersion: card.model.version, elevation, base: entry.base, heightmap: entry.heightmap })
    try {
      await navigator.clipboard.writeText(await exportShareCode(world))
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
    showRestored(r.restored, r.modelVersion)
    loadedFrom = null
    codeInput = ''
  }

  let loadedFrom: string | null = $state(null)

  function loadFromInput(): void {
    const text = codeInput.trim()
    if (isShareCode(text) || text.startsWith('{')) {
      void loadCode(text)
      return
    }
    const id = parseWorldHash(text.includes('#') ? text.slice(text.indexOf('#')) : `#/world/${text.toLowerCase()}`)
    if (!id) {
      shareState = { kind: 'error', message: 'That is not a world code. Paste a 10-character code, a whole share link, or an offline code (it starts with "graze1.").' }
      return
    }
    location.hash = worldShareHash(id)
  }

  // A world link is loaded once the model has settled (ready or failed), so
  // the terrain is built for the final elevation range and not regenerated.
  let pendingId: string | null = $state(null)

  function onHash(): void {
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
    clearTimeout(timer)
    window.removeEventListener('hashchange', onHash)
  })
</script>

<svelte:window {onkeydown} />

<section class="section" aria-labelledby="sandbox-title">
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

  <p class="hint muted">
    {#if $viewMode === 'walk'}
      Walk the valley you sculpted. The plants are the model's predicted cover type; sparse, grey plants mark low trust. Press E to probe the cell under you, Esc to go back.
    {:else}
      Select a cell to probe it. Raise, lower or flatten the ground and the cover map is predicted again in your browser. Right-drag to orbit, scroll to zoom.
    {/if}
  </p>

  {#if worldNotice}
    <p class="notice warn" role="status">{worldNotice} <button type="button" class="link" onclick={() => (worldNotice = null)}>Dismiss</button></p>
  {/if}

  <div class="map">
    <WorldView
      heightmap={heightM}
      size={GRID}
      cellSizeM={CELL_SIZE_M}
      waterLevelM={waterLevel}
      elevation={{ min: elevation.min, max: elevation.max }}
      classes={card?.classes ?? []}
      {cover}
      {confidence}
      {ood}
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

  <p class="world-notice">{PREDICTION_NOTICE}</p>

  <p class="status muted" aria-live="polite">
    {#if predictionState === 'unavailable'}
      <span class="err">Predictions unavailable: no model loaded.</span>
    {:else if predictionState === 'loading'}
      Loading the model…
    {:else if predictionState === 'failed'}
      <span class="err">Prediction failed: {predictError}</span>
    {:else if predictionState === 'predicting'}
      Predicting {GRID * GRID} cells in the browser…
    {:else if batchInfo && cells}
      {GRID * GRID} cells predicted in the browser · {batchInfo.oodCount} low trust{batchInfo.invalidCount ? ` · ${batchInfo.invalidCount} invalid` : ''}{cells.hasWater
        ? ''
        : ' · no water on this map'}
    {/if}
  </p>

  {#if counts && card}
    <ul class="legend" aria-label="Share of land per predicted cover type">
      <li class="label">Share of land</li>
      {#each card.classes as name, i (i)}
        <li>
          <span class="sw" style:background={classColor(i)}></span>{name}
          <span class="pct">{counts.land ? Math.round((counts.out[i] / counts.land) * 100) : 0}%</span>
        </li>
      {/each}
    </ul>
  {/if}

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
    <label>
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
    <button type="button" onclick={() => terrainVersion.update((v) => v + 1)}>Reset terrain</button>
    <button type="button" onclick={manualProbe} disabled={!card}>Enter values manually</button>
  </div>

  <div class="share" aria-labelledby="share-title">
    <h3 id="share-title" class="label">Save and share</h3>
    <div class="share-row">
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
      {:else}
        Saves the seed, the sliders and your brush edits, plus the model version. No predictions and no personal data. The offline code holds the same world as text and needs no server.
      {/if}
    </p>
  </div>

  {#if $probeOpen && card}
    <SiteProbe {card} selection={$selectedCell} onclose={() => probeOpen.set(false)} />
  {/if}

  {#if card && cells}
    <SimPanel size={GRID} {cover} water={cells.water} classes={card.classes} {mapVersion} worldKey={coverWorldKey} onposes={(p) => (poses = p)} />
  {/if}
</section>

<style>
  .hint {
    text-align: center;
    font-size: 11px;
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
    font-size: 10px;
    color: var(--text-3);
    margin-left: 4px;
  }

  .map {
    margin-top: 8px;
  }

  .world-notice {
    text-align: center;
    font-size: 11px;
    color: var(--text-2);
    margin-top: 8px;
  }

  .status {
    text-align: center;
    font-size: 11px;
    margin-top: 6px;
    min-height: 1.6em;
  }

  .err {
    color: var(--error);
  }

  .legend {
    list-style: none;
    padding: 0;
    margin: 14px 0 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 16px;
    font-size: 11px;
    color: var(--text-2);
  }

  .sw {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
  }

  .pct {
    color: var(--text-3);
    margin-left: 4px;
  }

  .controls {
    margin-top: 28px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    align-items: end;
  }

  .controls label {
    display: grid;
    gap: 6px;
  }

  .share {
    margin-top: 28px;
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
    flex: 1 1 260px;
    min-width: 0;
  }

  .load input {
    flex: 1;
    min-width: 0;
  }

  .small {
    font-size: 11px;
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
    font-size: 12px;
    color: var(--text);
  }
</style>
