<script lang="ts">
  import type { PopulationSample } from '../deps/herd.ts'
  import { HERBIVORE_COLOR, PREDATOR_COLOR } from '../sandbox/palette.ts'

  let { history, version }: { history: readonly PopulationSample[]; version: number } = $props()

  let canvas: HTMLCanvasElement | undefined = $state()
  const W = 640
  const H = 180
  const PAD = 28

  $effect(() => {
    void version
    draw()
  })

  function draw(): void {
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const data = history
    const maxPop = Math.max(10, ...data.map((s) => Math.max(s.herbivores, s.predators)))
    const x0 = PAD
    const x1 = W - 8
    const y0 = 8
    const y1 = H - 20

    ctx.strokeStyle = '#1d2024'
    ctx.lineWidth = 1
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillStyle = '#8a9098'
    for (let g = 0; g <= 4; g++) {
      const y = y1 - ((y1 - y0) * g) / 4
      ctx.beginPath()
      ctx.moveTo(x0, y + 0.5)
      ctx.lineTo(x1, y + 0.5)
      ctx.stroke()
      ctx.fillText(String(Math.round((maxPop * g) / 4)), 0, y + 3)
    }
    if (data.length < 2) return

    const t0 = data[0].tick
    const t1 = data[data.length - 1].tick
    const sx = (t: number) => x0 + ((t - t0) / Math.max(1, t1 - t0)) * (x1 - x0)
    ctx.fillText(`tick ${t0}`, x0, H - 4)
    const lbl = `tick ${t1}`
    ctx.fillText(lbl, x1 - ctx.measureText(lbl).width, H - 4)

    const line = (get: (s: PopulationSample) => number, max: number, color: string, width: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      data.forEach((s, i) => {
        const x = sx(s.tick)
        const y = y1 - (get(s) / max) * (y1 - y0)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
    line((s) => s.biomassFraction, 1, '#3a4a40', 1)
    line((s) => s.herbivores, maxPop, HERBIVORE_COLOR, 1.5)
    line((s) => s.predators, maxPop, PREDATOR_COLOR, 1.5)
  }

  const last = $derived(history[history.length - 1])
</script>

<figure>
  <canvas
    bind:this={canvas}
    style:aspect-ratio="{W} / {H}"
  >
    {last
      ? `Population over time. Latest: ${last.herbivores} herbivores, ${last.predators} predators, vegetation at ${Math.round(last.biomassFraction * 100)}% of capacity.`
      : 'Population over time. No data yet.'}
  </canvas>
  <figcaption>
    <span><i style:background={HERBIVORE_COLOR}></i>herbivores</span>
    <span><i style:background={PREDATOR_COLOR}></i>predators</span>
    <span><i style:background="#3a4a40"></i>vegetation (share of capacity, own scale)</span>
  </figcaption>
</figure>

<style>
  figure {
    margin: 0;
  }

  canvas {
    display: block;
    width: 100%;
    border: 1px solid var(--border);
  }

  figcaption {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 14px;
    color: var(--text-2);
  }

  i {
    display: inline-block;
    width: 10px;
    height: 2px;
    margin-right: 6px;
    vertical-align: middle;
  }
</style>
