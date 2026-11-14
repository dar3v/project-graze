<script lang="ts">
  // PLACEHOLDER 2D top-down map until Role 1's 3D world lands. It draws the
  // predicted cover map with a little relief shading, water, out-of-range
  // cells, the selected cell, and sim animals. Clicking emits a cell.
  import { classColor, hexToRgb, HERBIVORE_COLOR, PREDATOR_COLOR, WATER_RGB } from './palette.ts'

  interface Props {
    size: number
    height01: Float32Array
    water: Uint8Array
    cover: Uint8Array | null
    ood: Uint8Array | null
    showOod: boolean
    selected: { x: number; y: number } | null
    herbivores: Float32Array | null
    predators: Float32Array | null
    onpick: (x: number, y: number) => void
  }

  let { size, height01, water, cover, ood, showOod, selected, herbivores, predators, onpick }: Props = $props()

  const SCALE = 4
  let canvas: HTMLCanvasElement | undefined = $state()
  const base = document.createElement('canvas')

  function drawBase(): void {
    base.width = size
    base.height = size
    const ctx = base.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(size, size)
    const rgb = Array.from({ length: 16 }, (_, k) => hexToRgb(classColor(k)))
    for (let i = 0; i < size * size; i++) {
      const o = i * 4
      const x = i % size
      // Cheap relief: compare with the western neighbour.
      const relief = x > 0 ? (height01[i] - height01[i - 1]) * 18 : 0
      const light = 0.55 + 0.45 * height01[i] + relief
      let c: [number, number, number]
      if (water[i]) c = WATER_RGB
      else if (cover) c = rgb[cover[i] % rgb.length]
      else c = [70, 74, 78]
      const l = water[i] ? 1 : Math.max(0.35, Math.min(1.25, light))
      img.data[o] = Math.min(255, c[0] * l)
      img.data[o + 1] = Math.min(255, c[1] * l)
      img.data[o + 2] = Math.min(255, c[2] * l)
      img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }

  function drawDots(ctx: CanvasRenderingContext2D, pts: Float32Array | null, color: string, r: number): void {
    if (!pts) return
    ctx.fillStyle = color
    for (let i = 0; i < pts.length; i += 2) {
      ctx.fillRect(pts[i] * SCALE + SCALE / 2 - r, pts[i + 1] * SCALE + SCALE / 2 - r, 2 * r, 2 * r)
    }
  }

  $effect(() => {
    // Base layer depends on terrain + predictions only.
    void [height01, water, cover]
    drawBase()
    render()
  })

  $effect(() => {
    void [ood, showOod, selected, herbivores, predators]
    render()
  })

  function render(): void {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = size * SCALE
    canvas.height = size * SCALE
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(base, 0, 0, size * SCALE, size * SCALE)

    if (showOod && ood) {
      ctx.fillStyle = 'rgba(201, 178, 124, 0.55)'
      for (let i = 0; i < ood.length; i++) {
        if (!ood[i] || water[i]) continue
        const x = (i % size) * SCALE
        const y = Math.floor(i / size) * SCALE
        if ((x / SCALE + y / SCALE) % 2 === 0) ctx.fillRect(x + 1, y + 1, 2, 2)
      }
    }

    drawDots(ctx, herbivores, HERBIVORE_COLOR, 1)
    drawDots(ctx, predators, PREDATOR_COLOR, 2)

    if (selected) {
      ctx.strokeStyle = '#d4d7dc'
      ctx.lineWidth = 1
      ctx.strokeRect(selected.x * SCALE - 2.5, selected.y * SCALE - 2.5, SCALE + 5, SCALE + 5)
    }
  }

  function cellFromEvent(e: MouseEvent): [number, number] | null {
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * size)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * size)
    if (x < 0 || y < 0 || x >= size || y >= size) return null
    return [x, y]
  }

  function onclick(e: MouseEvent): void {
    const cell = cellFromEvent(e)
    if (cell) onpick(cell[0], cell[1])
  }

  function onkeydown(e: KeyboardEvent): void {
    const cur = selected ?? { x: Math.floor(size / 2), y: Math.floor(size / 2) }
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (e.key in moves) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      onpick(Math.min(size - 1, Math.max(0, cur.x + dx)), Math.min(size - 1, Math.max(0, cur.y + dy)))
    } else if (e.key === 'Enter' && !selected) {
      onpick(cur.x, cur.y)
    }
  }
</script>

<canvas
  bind:this={canvas}
  {onclick}
  {onkeydown}
  tabindex="0"
  aria-label="Terrain map, {size} by {size} cells. Click a cell, or use the arrow keys, to probe it."
></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    max-width: 512px;
    aspect-ratio: 1;
    margin: 0 auto;
    image-rendering: pixelated;
    border: 1px solid var(--border);
    cursor: crosshair;
    background: #0d1013;
  }
</style>
