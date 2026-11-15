<script lang="ts">
  // Walk info and settings (ROLE-1 D15). Opens when walk mode is left by any
  // path (the exit button, Esc, V, the pointer lock being lost). "Resume
  // walking" goes back to the same spot and heading.
  //
  // Accessibility: a modal dialog. Focus moves into it when it opens, Tab
  // stays inside it, Esc closes it, and the page puts focus back on "Walk
  // here" when it closes. Every control has a label.
  //
  // The wording below is an agent draft; the team writes the final text, as
  // for the other notices.
  import { onMount } from 'svelte'
  import SettingsPanel from '../settings/SettingsPanel.svelte'
  import type { HerdSummary } from '../sim/herdSummary.ts'
  import { animalSpeedLabel, type AnimalSpeed } from '../world/pace.ts'
  import { EYE_HEIGHT, RUN_SPEED, WALK_SPEED, type WalkExit } from '../world/walk.ts'

  interface Props {
    exit: WalkExit
    herd: HerdSummary | null
    animalSpeed: AnimalSpeed
    cellSizeM: number
    /** False when walk mode cannot be entered right now. */
    canResume: boolean
    onresume: () => void
    onclose: () => void
  }

  let { exit, herd, animalSpeed, cellSizeM, canResume, onresume, onclose }: Props = $props()

  let dialog: HTMLDivElement | undefined = $state()
  let resumeBtn: HTMLButtonElement | undefined = $state()

  const REASON: Record<WalkExit['reason'], string> = {
    button: 'You left walk mode with the exit button.',
    escape: 'You left walk mode with Esc.',
    key: 'You left walk mode.',
    'lock-lost': 'Walk mode ended because the browser released the mouse pointer.',
  }

  const CONTROLS: [string, string][] = [
    ['Click', 'Look around with the mouse (locks the pointer)'],
    ['W A S D', `Walk, ${WALK_SPEED} cells a second`],
    ['Shift', `Run, ${RUN_SPEED} cells a second`],
    ['Arrow keys', 'Look around without the mouse'],
    ['E', 'Open the Site Probe for the cell under you'],
    ['[ and ]', 'Earlier or later time of day'],
    ['T', 'Day/night cycle on or off'],
    ['G', 'Animal speed'],
    ['Esc or V', 'Exit walk mode'],
    ['Touch', 'Left stick walks, drag to look, Exit walk mode button under the minimap'],
  ]

  onMount(() => {
    resumeBtn?.focus()
  })

  function focusable(): HTMLElement[] {
    if (!dialog) return []
    return [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])')].filter((el) => !el.closest('fieldset[disabled]'))
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onclose()
      return
    }
    if (e.key !== 'Tab') return
    // Keep Tab inside the dialog.
    const items = focusable()
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !dialog?.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !dialog?.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }
</script>

<div class="scrim" role="presentation" onclick={onclose}></div>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="walk-panel-title" tabindex="-1" bind:this={dialog} {onkeydown}>
  <header>
    <h2 id="walk-panel-title">Walk info and settings</h2>
    <button type="button" onclick={onclose}>Close</button>
  </header>

  <p class="muted small">{REASON[exit.reason]} Your spot and the way you faced are kept.</p>

  <div class="actions">
    <button type="button" class="primary" bind:this={resumeBtn} onclick={onresume} disabled={!canResume}>Resume walking</button>
    <button type="button" onclick={onclose}>Stay in orbit view</button>
  </div>

  <section aria-labelledby="walk-cell-title">
    <h3 id="walk-cell-title" class="label">The cell you last stood on</h3>
    <dl class="facts">
      <dt>Cell</dt>
      <dd>({exit.cell.x}, {exit.cell.y})</dd>
      <dt>Predicted cover</dt>
      <dd>{exit.cell.water ? 'Water (no prediction)' : (exit.cell.className ?? 'No prediction yet')}</dd>
      <dt>Confidence</dt>
      <dd>{exit.cell.confidence === null ? '—' : `${Math.round(exit.cell.confidence * 100)}%`}</dd>
      <dt>Trust</dt>
      <dd class:low={exit.cell.lowTrust}>
        {#if exit.cell.water || exit.cell.className === null}—{:else if exit.cell.lowTrust}Low trust: this cell is unlike the training data{:else}Not flagged{/if}
      </dd>
    </dl>
  </section>

  <section aria-labelledby="walk-read-title">
    <h3 id="walk-read-title" class="label">How to read what you saw</h3>
    <ul>
      <li>The vegetation is a <strong>rendering of predicted classes</strong>, not photographs or ground truth. Sparse, grey plants mark low trust.</li>
      <li>
        The scale is a diorama. One cell is {cellSizeM} m, and you walk as a giant: your eyes are {EYE_HEIGHT} cells above the ground and a step
        covers several cells.
      </li>
      <li>Day and night are cosmetic. The sun you see is <strong>not</strong> the model's hillshade input, and moving it changes no prediction.</li>
      <li>
        Animals are slowed to about your walking speed while you are on the ground (now: <strong>{animalSpeedLabel(animalSpeed)}</strong>). That slows
        the whole simulation clock, so herds breed and starve more slowly per real second. Orbit view runs at full speed.
      </li>
    </ul>
  </section>

  <section aria-labelledby="walk-herd-title">
    <h3 id="walk-herd-title" class="label">Herds</h3>
    {#if herd}
      <dl class="facts">
        <dt>Herbivores</dt>
        <dd>{herd.herbivores}</dd>
        <dt>Predators</dt>
        <dd>{herd.predators ?? 'off'}</dd>
        <dt>Rewilding score</dt>
        <dd>{herd.score === null ? '—' : `${herd.score}/100`}{herd.score !== null && herd.provisional ? ' (provisional)' : ''}</dd>
        <dt>Simulation</dt>
        <dd>{herd.running ? 'running' : 'paused'} · tick {herd.tick}</dd>
      </dl>
    {:else}
      <p class="muted small">No herds yet. Start the herd simulation under the world to see animals on your walk.</p>
    {/if}
  </section>

  <section aria-labelledby="walk-keys-title">
    <h3 id="walk-keys-title" class="label">Controls</h3>
    <dl class="keys">
      {#each CONTROLS as [key, what] (key)}
        <dt><kbd>{key}</kbd></dt>
        <dd>{what}</dd>
      {/each}
    </dl>
  </section>

  <section aria-labelledby="walk-settings-title">
    <h3 id="walk-settings-title" class="label">Settings</h3>
    <p class="muted small">Changes apply at once and are there when you resume. Remembered in this browser only.</p>
    <SettingsPanel embedded />
  </section>

  <p class="links">
    <a href="#/report">Model Report</a> · <a href="#/responsible-use">Responsible Use</a>
  </p>
</div>

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
    width: min(560px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
    padding: 20px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    display: grid;
    gap: 14px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  h2,
  h3 {
    margin: 0;
  }

  h3 {
    margin-bottom: 8px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .actions button {
    min-height: 44px;
  }

  .small {
    font-size: 11px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 6px;
    font-size: 12px;
    color: var(--text-2);
  }

  strong {
    color: var(--text);
    font-weight: 500;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 14px;
    margin: 0;
    font-size: 12px;
  }

  dt {
    color: var(--text-2);
  }

  dd {
    margin: 0;
  }

  .keys dd {
    color: var(--text-2);
  }

  .low {
    color: var(--warn);
  }

  kbd {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border);
    padding: 0 5px;
    white-space: nowrap;
  }

  .links {
    font-size: 12px;
    text-align: center;
  }
</style>
