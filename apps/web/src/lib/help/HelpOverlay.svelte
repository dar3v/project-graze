<script lang="ts">
  // Controls help (D11). Reachable from every page with "?" and from the
  // Help button on the Sandbox. Lists what works now; walk-mode keys are
  // listed as coming with ROLE-1 D8.
  import { WORLD_FEATURES } from '../state/worldFeatures.ts'
  import { helpOpen } from './help.ts'

  let closeBtn: HTMLButtonElement | undefined = $state()

  $effect(() => {
    if ($helpOpen) closeBtn?.focus()
  })

  const groups: { title: string; note?: string; rows: [string, string][] }[] = [
    {
      title: 'Anywhere',
      rows: [
        ['?', 'Open or close this help'],
        ['Esc', 'Close this help'],
      ],
    },
    {
      title: 'Sandbox · orbit view',
      rows: [
        ['1', 'Select tool: click a cell to open the Site Probe'],
        ['2 / 3 / 4', 'Raise / lower / flatten brush: drag on the terrain'],
        ['Right-drag', 'Orbit the camera'],
        ['Scroll', 'Zoom'],
        ['V', WORLD_FEATURES.walkMode ? 'Switch between orbit and walk view' : 'Switch to walk view (when walk mode is available)'],
      ],
    },
    {
      title: 'Walk view',
      note: WORLD_FEATURES.walkMode ? undefined : 'Walk mode comes with the 3D world update (Role 1). These are the planned keys.',
      rows: [
        ['Click', 'Start looking around (locks the pointer)'],
        ['W A S D', 'Walk'],
        ['Shift', 'Run'],
        ['Arrow keys', 'Look around without the mouse'],
        ['E', 'Open the Site Probe for the cell under your feet'],
        ['[ and ]', 'Earlier / later time of day (lighting only)'],
        ['T', 'Day/night cycle on or off'],
        ['G', 'Animal speed: match walker, 2×, 4×, full sim speed, paused'],
        ['H', 'Show the walk controls inside the view'],
        ['P', 'Frame rate, draw counts and animal speed'],
        ['Esc or V', 'Exit walk mode (also the Exit walk mode button). The walk info and settings panel opens'],
        ['Resume walking', 'In that panel: return to the same spot, facing the same way'],
      ],
    },
  ]

  function onkeydown(e: KeyboardEvent): void {
    if ($helpOpen && e.key === 'Escape') {
      e.preventDefault()
      helpOpen.set(false)
    }
  }
</script>

<svelte:window {onkeydown} />

{#if $helpOpen}
  <div class="scrim" role="presentation" onclick={() => helpOpen.set(false)}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
    <header>
      <h2 id="help-title">Controls</h2>
      <button type="button" bind:this={closeBtn} onclick={() => helpOpen.set(false)}>Close</button>
    </header>
    {#each groups as g (g.title)}
      <h3 class="label">{g.title}</h3>
      {#if g.note}<p class="note">{g.note}</p>{/if}
      <dl class:pending={!!g.note}>
        {#each g.rows as [key, what] (key)}
          <dt><kbd>{key}</kbd></dt>
          <dd>{what}</dd>
        {/each}
      </dl>
    {/each}
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(0 0 0 / 0.6);
  }

  .dialog {
    position: fixed;
    z-index: 41;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    padding: 20px;
    background: var(--bg-2);
    border: 1px solid var(--border);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  h2 {
    margin: 0;
  }

  h3 {
    margin: 16px 0 6px;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 14px;
    margin: 0;
    font-size: 12px;
  }

  dl.pending {
    opacity: 0.6;
  }

  dd {
    margin: 0;
    color: var(--text-2);
  }

  kbd {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border);
    padding: 0 5px;
  }

  .note {
    font-size: 11px;
    color: var(--warn);
    margin-bottom: 6px;
  }
</style>
