<script lang="ts">
  import { onDestroy } from 'svelte'
  import { modelStatus, predictBatch } from '../model/client.ts'
  import { sampleFromBuffer } from '../model/inputs.ts'
  import { inputSpec } from '../model/modelCard.ts'
  import SiteProbe from '../probe/SiteProbe.svelte'
  import MapView from '../sandbox/MapView.svelte'
  import { classColor } from '../sandbox/palette.ts'
  import { selectCell, selectedCell } from '../sandbox/selection.ts'
  import { CELL_SIZE_M, computeCellInputs, generateHeightmap, GRID, quantile, scaleHeightmap } from '../sandbox/terrain.ts'
  import SimPanel from '../sim/SimPanel.svelte'

  const DEBOUNCE_MS = 250

  let terrainSeed = $state(7)
  let waterShare = $state(12)
  let showOod = $state(false)
  let probeOpen = $state(false)

  let cover: Uint8Array | null = $state.raw(null)
  let ood: Uint8Array | null = $state.raw(null)
  let batchInfo: { oodCount: number; invalidCount: number } | null = $state(null)
  let mapVersion = $state(0)
  let predicting = $state(false)
  let predictError: string | null = $state(null)
  let positions: { herbivores: Float32Array; predators: Float32Array } | null = $state.raw(null)

  const card = $derived($modelStatus.state === 'ready' ? $modelStatus.card : null)
  const elevation = $derived(card ? inputSpec(card, 'elevation') : null)

  const height01 = $derived(generateHeightmap(Number(terrainSeed) || 0, GRID))
  // Placeholder relief: use the middle RELIEF_SHARE of the training elevation
  // range. The full range over a 3.8 km map gives unrealistically steep slopes.
  const RELIEF_SHARE = 0.3
  const heightM = $derived.by(() => {
    if (!elevation) return null
    const mid = (elevation.min + elevation.max) / 2
    const half = ((elevation.max - elevation.min) * RELIEF_SHARE) / 2
    return scaleHeightmap(height01, mid - half, mid + half)
  })
  const waterLevel = $derived(heightM ? quantile(heightM, waterShare / 100) : 0)
  const cells = $derived(heightM ? computeCellInputs(heightM, GRID, CELL_SIZE_M, waterLevel) : null)

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
    if (!cover || !cells || !card) return null
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
  {:else if card && cells}
    <p class="notice placeholder">
      <strong>Placeholder map.</strong> A flat 2D view of a generated valley, standing in for the 3D world. Click a cell to probe it.
    </p>

    <div class="map">
      <MapView
        size={GRID}
        {height01}
        water={cells.water}
        {cover}
        {ood}
        {showOod}
        selected={probeOpen ? $selectedCell : null}
        herbivores={positions?.herbivores ?? null}
        predators={positions?.predators ?? null}
        onpick={pick}
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
      <ul class="legend" aria-label="Legend: predicted cover types">
        {#each card.classes as name, i (i)}
          <li>
            <span class="sw" style:background={classColor(i)}></span>{name}
            <span class="pct">{counts.land ? Math.round((counts.out[i] / counts.land) * 100) : 0}%</span>
          </li>
        {/each}
        <li><span class="sw water"></span>Water</li>
      </ul>
    {/if}

    <div class="controls">
      <label>
        <span class="label">Terrain seed</span>
        <input type="number" step="1" bind:value={terrainSeed} />
      </label>
      <label>
        <span class="label">Water level · {waterShare}% of cells</span>
        <input type="range" min="0" max="40" step="1" bind:value={waterShare} />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={showOod} />
        <span>Mark cells outside the training range</span>
      </label>
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

  .placeholder {
    margin-bottom: 20px;
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

  .sw.water {
    background: rgb(16, 27, 34);
    outline: 1px solid var(--border);
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

  code {
    font-size: 12px;
    color: var(--text);
  }
</style>
