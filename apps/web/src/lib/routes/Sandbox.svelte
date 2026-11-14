<script lang="ts">
  import { onDestroy } from 'svelte'
  import { modelStatus, predictBatch } from '../model/client.ts'
  import { sampleFromBuffer } from '../model/inputs.ts'
  import { inputSpec } from '../model/modelCard.ts'
  import SiteProbe from '../probe/SiteProbe.svelte'
  import { packCellInputs } from '../sandbox/cellInputs.ts'
  import type { PackedCellInputs } from '../sandbox/cellInputs.ts'
  import { classColor } from '../sandbox/palette.ts'
  import { selectCell, selectedCell } from '../sandbox/selection.ts'
  import SimPanel from '../sim/SimPanel.svelte'
  import { CELL_SIZE_M, generateTerrain, GRID, reliefBand, waterLevelForShare } from '../world/terrain.ts'
  import WorldView from '../world/WorldView.svelte'

  const DEBOUNCE_MS = 250
  /** Relief as a share of the elevation range (Role 1's default). */
  const RELIEF = 0.2

  let terrainSeed = $state(7)
  let waterShare = $state(12)
  /**
   * Where the terrain's elevation band sits in the model's training range, in
   * percent (Role 1's `center`). Elevation drives the prediction most, so a
   * fixed mid-range band (50%) gives an almost single-class map; 40% opens on
   * a Lodgepole/Ponderosa mix. Relief stays at Role 1's 20% default: wider
   * bands push most cells out of the training range.
   */
  let bandCenter = $state(40)
  let probeOpen = $state(false)
  /** Bumped by "Reset terrain" to regenerate the same seed (drops brush edits). */
  let terrainVersion = $state(0)

  let cover: Uint8Array | null = $state.raw(null)
  let confidence: Float32Array | null = $state.raw(null)
  let ood: Uint8Array | null = $state.raw(null)
  let batchInfo: { oodCount: number; invalidCount: number } | null = $state(null)
  let mapVersion = $state(0)
  let predicting = $state(false)
  let predictError: string | null = $state(null)
  let positions: { herbivores: Float32Array; predators: Float32Array } | null = $state.raw(null)

  const card = $derived($modelStatus.state === 'ready' ? $modelStatus.card : null)
  const elevation = $derived(card ? inputSpec(card, 'elevation') : null)

  // The heightmap is mutable: WorldView's brush edits it IN PLACE and then
  // calls onheightmapchange. It is replaced (new identity) only when the seed,
  // the band center, the model's elevation range or terrainVersion changes. Relief and the
  // elevation band come from Role 1's generator defaults (20% of the range).
  let heightM: Float32Array | null = $state.raw(null)
  $effect(() => {
    void terrainVersion
    if (!elevation) return
    heightM = generateTerrain({
      seed: Number(terrainSeed) || 0,
      center: bandCenter / 100,
      relief: RELIEF,
      elevation: { min: elevation.min, max: elevation.max },
    }).heightmap
  })

  // Water level in meters for the chosen share of cells. Recomputed when the
  // slider or the terrain identity changes, not on every brush stroke, so
  // sculpting below the water line floods instead of moving the water.
  const band = $derived(elevation ? reliefBand(elevation, RELIEF, bandCenter / 100) : null)

  const waterLevel = $derived(heightM ? waterLevelForShare(heightM, waterShare / 100) : 0)

  let cells: PackedCellInputs | null = $state.raw(null)
  $effect(() => {
    if (heightM) cells = packCellInputs(heightM, GRID, CELL_SIZE_M, waterLevel)
  })

  function onHeightmapChange(): void {
    // Water distance is global, so the whole grid is recomputed (~16k cells).
    if (heightM) cells = packCellInputs(heightM, GRID, CELL_SIZE_M, waterLevel)
    // Refresh an open probe so it shows the sculpted cell, not stale values.
    const sel = $selectedCell
    if (probeOpen && sel && cells) pick(sel.x, sel.y)
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0

  // Debounced batch prediction whenever the terrain (or the model) changes.
  $effect(() => {
    const c = cells
    if (!c) return
    clearTimeout(timer)
    timer = setTimeout(() => runBatch(c.inputs), DEBOUNCE_MS)
  })

  async function runBatch(inputs: Float32Array): Promise<void> {
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
      mapVersion++
    } catch (err) {
      if (mine === seq) predictError = err instanceof Error ? err.message : String(err)
    } finally {
      if (mine === seq) predicting = false
    }
  }

  onDestroy(() => clearTimeout(timer))

  function pick(x: number, y: number): void {
    if (!cells) return
    const i = y * GRID + x
    selectCell({ x, y, sample: sampleFromBuffer(cells.inputs, i), water: cells.water[i] === 1 })
    probeOpen = true
  }

  function manualProbe(): void {
    selectCell(null)
    probeOpen = true
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
</script>

<section class="section" aria-labelledby="sandbox-title">
  <h2 id="sandbox-title" class="visually-hidden">Sandbox</h2>

  {#if $modelStatus.state === 'loading'}
    <p class="muted center">Loading the model…</p>
  {:else if $modelStatus.state === 'error'}
    <div class="notice error" role="alert">
      <strong>No predictions without a model.</strong> The sandbox needs <code>model.json</code> and <code>model_card.json</code>.
      You can still read the <a href="#/responsible-use">Responsible Use</a> page.
    </div>
  {:else if card && cells && heightM && elevation}
    <p class="hint muted">
      Select a cell to probe it. Raise, lower or flatten the ground and the cover map is predicted again in your browser. Right-drag to orbit, scroll to zoom.
    </p>

    <div class="map">
      <WorldView
        heightmap={heightM}
        size={GRID}
        cellSizeM={CELL_SIZE_M}
        waterLevelM={waterLevel}
        elevation={{ min: elevation.min, max: elevation.max }}
        classes={card.classes}
        {cover}
        {confidence}
        {ood}
        selected={probeOpen ? $selectedCell : null}
        herbivores={positions?.herbivores ?? null}
        predators={positions?.predators ?? null}
        busy={predicting ? 'Predicting…' : null}
        onpick={pick}
        onheightmapchange={onHeightmapChange}
      />
    </div>

    <p class="status muted" aria-live="polite">
      {#if predictError}
        <span class="err">Prediction failed: {predictError}</span>
      {:else if predicting}
        Predicting {GRID * GRID} cells in the browser…
      {:else if batchInfo}
        {GRID * GRID} cells predicted in the browser · {batchInfo.oodCount} outside the training range{batchInfo.invalidCount
          ? ` · ${batchInfo.invalidCount} invalid`
          : ''}{cells.hasWater ? '' : ' · no water on this map'}
      {/if}
    </p>

    {#if counts}
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
        <input type="number" step="1" bind:value={terrainSeed} />
      </label>
      <label>
        <span class="label">Elevation · {band ? `${Math.round(band.min)}–${Math.round(band.max)} m` : ''}</span>
        <input type="range" min="0" max="100" step="5" bind:value={bandCenter} />
      </label>
      <label>
        <span class="label">Water level · {waterShare}% of cells</span>
        <input type="range" min="0" max="40" step="1" bind:value={waterShare} />
      </label>
      <button type="button" onclick={() => terrainVersion++}>Reset terrain</button>
      <button type="button" onclick={manualProbe}>Enter values manually</button>
    </div>

    {#if probeOpen}
      <SiteProbe {card} selection={$selectedCell} onclose={() => (probeOpen = false)} />
    {/if}

    <SimPanel size={GRID} {cover} water={cells.water} classes={card.classes} {mapVersion} onpositions={(p) => (positions = p)} />
  {/if}
</section>

<style>
  .center {
    text-align: center;
  }

  .hint {
    text-align: center;
    font-size: 11px;
    margin: 0 0 14px;
  }

  .map {
    margin-top: 8px;
  }

  .status {
    text-align: center;
    font-size: 11px;
    margin-top: 10px;
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

  code {
    font-size: 12px;
    color: var(--text);
  }
</style>
