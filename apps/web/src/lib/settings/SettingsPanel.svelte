<script lang="ts">
  // One settings panel (D11): quality preset, time of day and auto-cycle,
  // overlay toggles, reduced motion. Values are remembered per viewer
  // (../state/settings.ts). Controls the 3D world cannot use yet are shown
  // disabled with a note, driven by WORLD_FEATURES.
  import { resetSettings, settings } from '../state/settings.ts'
  import { WORLD_FEATURES } from '../state/worldFeatures.ts'

  interface Props {
    onclose: () => void
  }

  let { onclose }: Props = $props()

  const PENDING = 'Needs the 3D world update (Role 1).'
  const hour = (t: number) => `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`

  function set<K extends keyof typeof $settings>(key: K, value: (typeof $settings)[K]): void {
    settings.update((s) => ({ ...s, [key]: value }))
  }
</script>

<section class="panel" aria-labelledby="settings-title">
  <header>
    <h2 id="settings-title">Settings</h2>
    <button type="button" onclick={onclose}>Close</button>
  </header>
  <p class="muted small">Remembered in this browser only. Nothing is sent anywhere.</p>

  <fieldset disabled={!WORLD_FEATURES.qualityPresets}>
    <legend class="label">Quality</legend>
    <div class="seg" role="radiogroup" aria-label="Quality preset">
      {#each ['low', 'medium', 'high'] as const as q (q)}
        <button type="button" role="radio" aria-checked={$settings.quality === q} class:active={$settings.quality === q} onclick={() => set('quality', q)}>{q}</button>
      {/each}
    </div>
    {#if !WORLD_FEATURES.qualityPresets}<p class="pending">{PENDING}</p>{/if}
  </fieldset>

  <fieldset disabled={!WORLD_FEATURES.timeOfDay}>
    <legend class="label">Time of day · {hour($settings.timeOfDay)}</legend>
    <input type="range" min="0" max="24" step="0.25" value={$settings.timeOfDay} oninput={(e) => set('timeOfDay', Number(e.currentTarget.value))} aria-label="Time of day" />
    <label class="check"><input type="checkbox" checked={$settings.autoCycle} onchange={(e) => set('autoCycle', e.currentTarget.checked)} /> Day/night cycle runs by itself</label>
    <p class="muted small">Lighting only. The sun you see is not the model's hillshade input and never changes a prediction.</p>
    {#if !WORLD_FEATURES.timeOfDay}<p class="pending">{PENDING}</p>{/if}
  </fieldset>

  <fieldset disabled={!WORLD_FEATURES.overlayProps}>
    <legend class="label">Overlay</legend>
    <select value={$settings.overlay} onchange={(e) => set('overlay', e.currentTarget.value as typeof $settings.overlay)} aria-label="Overlay">
      <option value="terrain">Terrain</option>
      <option value="cover">Predicted cover</option>
      <option value="confidence">Confidence</option>
    </select>
    <label class="check"><input type="checkbox" checked={$settings.showOod} onchange={(e) => set('showOod', e.currentTarget.checked)} /> Mark low-trust cells</label>
    {#if !WORLD_FEATURES.overlayProps}<p class="pending">For now, use the overlay controls under the world. {PENDING}</p>{/if}
  </fieldset>

  <fieldset>
    <legend class="label">Motion</legend>
    <div class="seg" role="radiogroup" aria-label="Motion">
      {#each [['system', 'Follow system'], ['reduce', 'Reduce'], ['full', 'Full']] as const as [v, label] (v)}
        <button type="button" role="radio" aria-checked={$settings.motion === v} class:active={$settings.motion === v} onclick={() => set('motion', v)}>{label}</button>
      {/each}
    </div>
    <p class="muted small">Reduce: animals step once per tick instead of gliding{WORLD_FEATURES.reducedMotion ? ', and the camera stays still' : ''}.</p>
  </fieldset>

  <button type="button" class="reset" onclick={resetSettings}>Restore defaults</button>
</section>

<style>
  .panel {
    border: 1px solid var(--border);
    background: rgb(8 10 13 / 0.92);
    padding: 16px;
    margin-top: 16px;
    display: grid;
    gap: 14px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h2 {
    margin: 0;
  }

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  fieldset:disabled > :not(legend):not(.pending) {
    opacity: 0.45;
  }

  legend {
    padding: 0;
    margin-bottom: 6px;
  }

  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .seg button {
    text-transform: uppercase;
  }

  .seg button.active {
    color: var(--text);
    border-color: var(--text-2);
    background: var(--fill);
  }

  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-2);
  }

  .check input {
    width: auto;
  }

  .small,
  .pending {
    font-size: 11px;
  }

  .pending {
    color: var(--warn);
  }

  .reset {
    justify-self: start;
  }
</style>
