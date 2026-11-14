<script lang="ts">
  import { classColor } from '../sandbox/palette.ts'

  let { classes, probs, highlight }: { classes: readonly string[]; probs: readonly number[]; highlight?: number } = $props()
</script>

<ul class="bars" aria-label="Class probabilities">
  {#each classes as name, i (i)}
    <li class:hl={i === highlight}>
      <span class="name"><span class="swatch" style:background={classColor(i)}></span>{name}</span>
      <span class="track" aria-hidden="true"><span class="fill" style:width="{Math.max(0, Math.min(1, probs[i] ?? 0)) * 100}%"></span></span>
      <span class="pct">{((probs[i] ?? 0) * 100).toFixed(1)}%</span>
    </li>
  {/each}
</ul>

<style>
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  li {
    display: grid;
    grid-template-columns: minmax(120px, 190px) 1fr 56px;
    gap: 12px;
    align-items: center;
    font-size: 12px;
    color: var(--text-2);
  }

  li.hl {
    color: var(--text);
  }

  .swatch {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 8px;
  }

  .track {
    height: 6px;
    background: #15181b;
  }

  .fill {
    display: block;
    height: 100%;
    background: #6b7178;
  }

  .hl .fill {
    background: var(--text);
  }

  .pct {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
