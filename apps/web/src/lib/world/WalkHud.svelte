<script lang="ts">
  // Walk-mode HUD (D8, D11). Drawn over the 3D view; it holds no world state.
  // It shows what the model predicts for the cell under the walker, a
  // minimap with position and heading, the standing notice, the "click to
  // look" prompt, touch controls, and the controls help card.
  import { PALETTE, toCss, toLinear } from './palette.ts'
  import type { WalkStatus, WorldStats } from './scene.ts'
  import { compassPoint, RUN_SPEED, WADE_DEPTH_M, WALK_SPEED } from './walk.ts'

  export type PredictionState = 'loading' | 'predicting' | 'ready' | 'unavailable' | 'failed'

  interface Props {
    status: WalkStatus
    heightmap: Float32Array
    size: number
    waterLevelM: number
    classes: readonly string[]
    /** '#rrggbb' per class index (the cover overlay colors). */
    classColors: readonly string[]
    cover: Uint8Array | null
    confidence: Float32Array | null
    ood: Uint8Array | null
    prediction: PredictionState
    notice: string
    hourLabel: string
    /** Touch UI: joystick and buttons instead of the mouse prompt. */
    touch: boolean
    toast: string | null
    helpOpen: boolean
    perf: WorldStats | null
    canProbe: boolean
    onmove: (strafe: number, forward: number) => void
    onprobe: () => void
    onexit: () => void
    onhelp: () => void
  }

  let { status, heightmap, size, waterLevelM, classes, classColors, cover, confidence, ood, prediction, notice, hourLabel, touch, toast, helpOpen, perf, canProbe, onmove, onprobe, onexit, onhelp }: Props =
    $props()

  // ---- cell under the walker ---------------------------------------------------

  const cell = $derived.by(() => {
    const i = status.cellY * size + status.cellX
    const n = size * size
    const water = heightmap[i] < waterLevelM
    const has = !!cover && cover.length === n
    return {
      water,
      className: has && !water ? (classes[cover![i]] ?? `Class ${cover![i]}`) : null,
      confidence: has && !water && confidence && confidence.length === n ? confidence[i] : null,
      lowTrust: has && !water && !!ood && ood.length === n && ood[i] === 1,
    }
  })

  const predictionText = $derived(
    prediction === 'loading'
      ? 'Loading the model…'
      : prediction === 'unavailable'
        ? 'Predictions unavailable: no model loaded'
        : prediction === 'failed'
          ? 'Prediction failed'
          : null,
  )

  // ---- minimap -------------------------------------------------------------------

  let mapCanvas: HTMLCanvasElement | undefined = $state()
  let base: ImageData | null = $state.raw(null)

  const hexBytes = (hex: string): [number, number, number] => {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const WATER = hexBytes(PALETTE.time.day.waterDeep)
  const OOD = hexBytes(PALETTE.overlay.ood)
  const OOD_CSS = toCss(toLinear(PALETTE.overlay.ood))

  // The map image: predicted cover (or plain relief while there is none),
  // water, and low-trust cells in amber. Rebuilt only when the data changes.
  $effect(() => {
    const n = size * size
    const img = new ImageData(size, size)
    const has = !!cover && cover.length === n
    const colors = classColors.map(hexBytes)
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < n; i++) {
      if (heightmap[i] < lo) lo = heightmap[i]
      if (heightmap[i] > hi) hi = heightmap[i]
    }
    for (let i = 0; i < n; i++) {
      let c: [number, number, number]
      if (heightmap[i] < waterLevelM) c = WATER
      else if (has && colors.length) c = colors[cover![i] % colors.length]
      else {
        const g = 70 + Math.round(((heightmap[i] - lo) / (hi - lo || 1)) * 130)
        c = [g, g, g]
      }
      if (has && ood && ood.length === n && ood[i] === 1 && heightmap[i] >= waterLevelM) c = [(c[0] + OOD[0] * 2) / 3, (c[1] + OOD[1] * 2) / 3, (c[2] + OOD[2] * 2) / 3]
      img.data[i * 4] = c[0]
      img.data[i * 4 + 1] = c[1]
      img.data[i * 4 + 2] = c[2]
      img.data[i * 4 + 3] = 255
    }
    base = img
  })

  $effect(() => {
    const ctx = mapCanvas?.getContext('2d')
    if (!ctx || !base) return
    ctx.putImageData(base, 0, 0)
    // Walker: an arrow pointing along the heading (north is up).
    const a = (status.bearing * Math.PI) / 180
    ctx.save()
    ctx.translate(status.x + 0.5, status.y + 0.5)
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(0, -7)
    ctx.lineTo(4.5, 5)
    ctx.lineTo(0, 2.5)
    ctx.lineTo(-4.5, 5)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fill()
    ctx.restore()
  })

  // ---- joystick (touch) ------------------------------------------------------------

  let stick: HTMLDivElement | undefined = $state()
  let knob = $state({ x: 0, y: 0 })
  let stickPointer: number | null = null

  function stickAt(e: PointerEvent): void {
    if (!stick) return
    const r = stick.getBoundingClientRect()
    const half = r.width / 2
    let x = (e.clientX - r.left - half) / half
    let y = (e.clientY - r.top - half) / half
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    knob = { x, y }
    onmove(x, -y) // up on the stick is forward
  }

  function stickDown(e: PointerEvent): void {
    stickPointer = e.pointerId
    try {
      stick?.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic pointer: the stick still follows while inside it.
    }
    stickAt(e)
  }

  function stickMove(e: PointerEvent): void {
    if (stickPointer === e.pointerId) stickAt(e)
  }

  function stickUp(e: PointerEvent): void {
    if (stickPointer !== e.pointerId) return
    stickPointer = null
    knob = { x: 0, y: 0 }
    onmove(0, 0)
  }

  const HELP: [string, string][] = [
    ['Click', 'Look around with the mouse (locks the pointer)'],
    ['W A S D', `Walk (${WALK_SPEED} cells a second)`],
    ['Shift', `Run (${RUN_SPEED} cells a second)`],
    ['Arrow keys', 'Look around without the mouse'],
    ['E', 'Open the Site Probe for the cell under your feet'],
    ['[ and ]', 'Earlier / later time of day (lighting only)'],
    ['T', 'Day/night cycle on or off'],
    ['C', 'Save a photo of the view'],
    ['P', 'Show frame rate and draw counts'],
    ['H', 'Show or hide this card'],
    ['Esc or V', 'Back to orbit view'],
  ]
</script>

<div class="hud" class:touch>
  <div class="cell panel" aria-label="Cell under you">
    <div class="where">Cell ({status.cellX}, {status.cellY}) · {hourLabel}</div>
    {#if predictionText}
      <div class="state">{predictionText}</div>
    {:else if cell.water}
      <div class="name">Water{status.wading ? ' · wading' : ''}</div>
    {:else if cell.className}
      <div class="name">{cell.className}</div>
      <div class="conf">
        {#if cell.confidence !== null}{Math.round(cell.confidence * 100)}% confidence{/if}
        {#if prediction === 'predicting'}<span class="dim"> · updating…</span>{/if}
      </div>
      {#if cell.lowTrust}
        <div class="low" style:color={OOD_CSS}>Low trust: unlike the training data</div>
      {/if}
    {:else}
      <div class="state">{prediction === 'predicting' ? 'Predicting…' : 'No prediction yet'}</div>
    {/if}
    {#if status.blocked === 'water'}
      <div class="dim">Deep water ahead (over {WADE_DEPTH_M} m): the pale line marks it</div>
    {:else if status.blocked === 'slope'}
      <div class="dim">Too steep to climb here</div>
    {:else if status.blocked === 'edge'}
      <div class="dim">Edge of the map</div>
    {/if}
  </div>

  <div class="map panel">
    <canvas bind:this={mapCanvas} width={size} height={size} aria-label="Minimap: predicted cover, with your position and heading"></canvas>
    <div class="heading">{compassPoint(status.bearing)} · {status.bearing}°</div>
  </div>

  {#if status.active && !touch && status.look !== 'locked' && !helpOpen}
    <div class="prompt panel" role="status">
      {#if status.look === 'prompt'}
        <strong>Click to look</strong>
        <span>W A S D to walk · Shift to run · E to probe the cell · Esc back to orbit · H for all keys</span>
      {:else}
        <strong>Mouse look is not available here</strong>
        <span>Arrow keys or drag to look · W A S D to walk · E to probe the cell · Esc back to orbit · H for all keys</span>
      {/if}
    </div>
  {/if}

  {#if status.look === 'locked'}
    <div class="crosshair" aria-hidden="true"></div>
  {/if}

  {#if helpOpen}
    <div class="help panel" role="dialog" aria-label="Walk mode controls">
      <h3>Walk mode controls</h3>
      <dl>
        {#each HELP as [key, what] (key)}
          <dt><kbd>{key}</kbd></dt>
          <dd>{what}</dd>
        {/each}
      </dl>
      <p class="dim">Touch: left stick walks, drag anywhere else to look.</p>
    </div>
  {/if}

  {#if toast}
    <div class="toast panel" role="status">{toast}</div>
  {/if}

  {#if perf}
    <div class="perf panel" aria-label="Performance">
      {Math.round(perf.fps)} fps · {perf.quality} · {perf.drawCalls} draw calls · {Math.round(perf.triangles / 1000)}k triangles<br />
      {perf.visiblePlants}/{perf.plants} plants in {perf.visiblePlantBatches}/{perf.plantBatches} batches · {perf.grassTufts} tufts · {perf.animals} animals<br />
      {perf.geometries} geometries · {perf.textures} textures · {perf.programs} programs · pixel ratio {perf.pixelRatio}
    </div>
  {/if}

  {#if touch}
    <div class="stick" bind:this={stick} onpointerdown={stickDown} onpointermove={stickMove} onpointerup={stickUp} onpointercancel={stickUp} role="application" aria-label="Walk joystick">
      <div class="knob" style:transform="translate({knob.x * 34}px, {knob.y * 34}px)"></div>
    </div>
    <div class="buttons">
      <button type="button" onclick={onprobe} disabled={!canProbe}>Probe</button>
      <button type="button" onclick={onhelp}>Keys</button>
      <button type="button" onclick={onexit}>Exit</button>
    </div>
  {/if}

  <div class="notice">{notice}</div>
</div>

<style>
  .hud {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    font-size: 11px;
    color: #f2f4f6;
  }

  .panel {
    position: absolute;
    background: rgb(8 10 13 / 0.62);
    border: 1px solid rgb(255 255 255 / 0.14);
    padding: 8px 10px;
  }

  .cell {
    top: 10px;
    left: 10px;
    max-width: min(60%, 280px);
    display: grid;
    gap: 2px;
  }

  .where,
  .dim {
    color: rgb(242 244 246 / 0.65);
  }

  .name {
    font-size: 15px;
    font-weight: 500;
  }

  .state {
    font-size: 13px;
  }

  .low {
    font-weight: 500;
  }

  .map {
    top: 10px;
    right: 10px;
    padding: 4px;
    display: grid;
    gap: 3px;
    justify-items: center;
  }

  .map canvas {
    display: block;
    width: 112px;
    height: 112px;
    image-rendering: pixelated;
  }

  .heading {
    font-family: var(--mono);
    font-size: 10px;
  }

  .prompt {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: grid;
    gap: 6px;
    text-align: center;
    max-width: min(86%, 420px);
    padding: 14px 18px;
  }

  .prompt strong {
    font-size: 16px;
    font-weight: 500;
  }

  .crosshair {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    margin: -3px 0 0 -3px;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.8);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.5);
  }

  .help {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(92%, 430px);
    max-height: 88%;
    overflow: auto;
    pointer-events: auto;
  }

  .help h3 {
    margin: 0 0 8px;
    font-size: 13px;
  }

  .help dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 5px 12px;
  }

  .help dt,
  .help dd {
    margin: 0;
  }

  .help p {
    margin: 8px 0 0;
  }

  kbd {
    font-family: var(--mono);
    font-size: 10px;
    white-space: nowrap;
  }

  .toast {
    left: 50%;
    bottom: 34px;
    transform: translateX(-50%);
    max-width: 86%;
    text-align: center;
  }

  .perf {
    left: 10px;
    bottom: 34px;
    font-family: var(--mono);
    font-size: 10px;
    line-height: 1.5;
  }

  .touch .perf {
    bottom: auto;
    top: 96px;
  }

  .stick {
    position: absolute;
    left: 16px;
    bottom: 40px;
    width: 104px;
    height: 104px;
    border-radius: 50%;
    background: rgb(8 10 13 / 0.45);
    border: 1px solid rgb(255 255 255 / 0.3);
    pointer-events: auto;
    touch-action: none;
    display: grid;
    place-items: center;
  }

  .knob {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.75);
  }

  .buttons {
    position: absolute;
    right: 12px;
    bottom: 40px;
    display: grid;
    gap: 6px;
    pointer-events: auto;
  }

  .buttons button {
    background: rgb(8 10 13 / 0.62);
    color: #f2f4f6;
    border: 1px solid rgb(255 255 255 / 0.3);
    padding: 10px 14px;
  }

  .notice {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 6px 10px;
    text-align: center;
    background: rgb(8 10 13 / 0.62);
    color: rgb(242 244 246 / 0.9);
  }
</style>
