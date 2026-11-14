<script lang="ts">
  import type { SimEvent } from '../deps/herd.ts'

  let { events, version }: { events: readonly SimEvent[]; version: number } = $props()

  const SHOW = 60
  const recent = $derived.by(() => {
    void version
    return events.slice(-SHOW).reverse()
  })
</script>

<div class="log" role="log" aria-label="Simulation event log" aria-live="off">
  {#if recent.length === 0}
    <p class="muted">No events yet.</p>
  {:else}
    <ol>
      {#each recent as e, i (`${e.tick}-${e.kind}-${e.species ?? ''}-${i}`)}
        <li class={e.kind}><span class="t">t{e.tick}</span> {e.message}</li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .log {
    border: 1px solid var(--border);
    max-height: 220px;
    overflow-y: auto;
    padding: 10px 12px;
    font-size: 12px;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    color: var(--text-2);
    padding: 1px 0;
  }

  li.extinction,
  li.info {
    color: var(--text);
  }

  .t {
    color: var(--text-3);
    display: inline-block;
    min-width: 56px;
  }
</style>
