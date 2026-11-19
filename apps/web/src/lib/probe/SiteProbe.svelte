<script lang="ts">
  import { untrack } from 'svelte'
  import ProbBars from '../components/ProbBars.svelte'
  import { explainOne } from '../model/client.ts'
  import type { Explanation } from '../model/engine.ts'
  import { TERRAIN_SAMPLE_KEYS, type TerrainSampleKey } from '../deps/features.ts'
  import { inputSpec, type ModelCard } from '../model/modelCard.ts'
  import { emptyForm, formatNumber, sampleToForm, validateForm, type FormValues, type ValidationResult } from '../model/validation.ts'
  import type { CellSelection } from '../sandbox/selection.ts'

  interface Props {
    card: ModelCard
    selection: CellSelection | null
    onclose: () => void
  }

  let { card, selection, onclose }: Props = $props()

  let values: Record<TerrainSampleKey, string> = $state({ ...emptyForm() })
  let checked = $state<ValidationResult | null>(null)
  let explanation = $state<Explanation | null>(null)
  let busy = $state(false)
  let runError: string | null = $state(null)
  let requestSeq = 0

  // Prefill from the clicked cell and predict right away.
  $effect(() => {
    const sel = selection
    if (!sel) return
    // untrack: typing in the form must not re-trigger the prefill.
    untrack(() => {
      values = { ...sampleToForm(sel.sample) }
      void submit()
    })
  })

  const errorCount = $derived(checked ? Object.keys(checked.errors).length : 0)

  async function submit(e?: SubmitEvent): Promise<void> {
    e?.preventDefault()
    runError = null
    const result = validateForm(values as FormValues, card)
    checked = result
    if (!result.sample) {
      explanation = null
      return
    }
    const seq = ++requestSeq
    busy = true
    try {
      const ex = await explainOne(result.sample)
      if (seq === requestSeq) explanation = ex
    } catch (err) {
      if (seq === requestSeq) {
        explanation = null
        runError = err instanceof Error ? err.message : String(err)
      }
    } finally {
      if (seq === requestSeq) busy = false
    }
  }

  function clear(): void {
    values = { ...emptyForm() }
    checked = null
    explanation = null
    runError = null
  }

  function rangeHint(key: TerrainSampleKey): string {
    const s = inputSpec(card, key)
    const u = s.unit ? ` ${s.unit}` : ''
    return `training range ${formatNumber(s.min)} to ${formatNumber(s.max)}${u}`
  }

  const k = $derived(explanation?.prediction.classIndex ?? 0)
  const maxDelta = $derived(
    explanation ? Math.max(0.01, ...explanation.sensitivities.flatMap((s) => [Math.abs(s.deltaUp[k]), Math.abs(s.deltaDown[k])])) : 1,
  )
  const pts = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)}`
</script>

<section class="probe panel" aria-labelledby="probe-title">
  <div class="head">
    <h2 id="probe-title">Site Probe</h2>
    <button type="button" onclick={onclose} aria-label="Close the Site Probe">Close</button>
  </div>
  <p class="muted intro">
    {#if selection}
      Cell ({selection.x}, {selection.y}){selection.water ? ', under water. The model was not trained on lake beds, so this is out of scope' : ''}. Values are prefilled
      from the terrain; edit any of them and predict again.
    {:else}
      Type terrain values to get a prediction. Every field is required.
    {/if}
  </p>

  <form onsubmit={submit} novalidate>
    <div class="grid">
      {#each TERRAIN_SAMPLE_KEYS as key (key)}
        {@const spec = inputSpec(card, key)}
        {@const err = checked?.errors[key]}
        {@const warn = checked?.warnings[key]}
        <div class="field">
          <label for="f-{key}">{spec.label}{spec.unit ? ` (${spec.unit})` : ''}</label>
          <input
            id="f-{key}"
            name={key}
            inputmode="decimal"
            autocomplete="off"
            bind:value={values[key]}
            aria-invalid={err ? 'true' : undefined}
            aria-describedby="h-{key}"
          />
          <p id="h-{key}" class="hint" class:err class:warn={!err && warn}>
            {err ?? warn ?? rangeHint(key)}
          </p>
        </div>
      {/each}
    </div>

    <div class="actions">
      <button class="primary" type="submit" disabled={busy}>{busy ? 'Predicting…' : 'Predict'}</button>
      <button type="button" onclick={clear}>Clear</button>
      {#if errorCount > 0}
        <span class="err-summary" role="alert">Fix {errorCount} field{errorCount === 1 ? '' : 's'} to get a prediction.</span>
      {/if}
    </div>
  </form>

  {#if runError}
    <div class="notice error result" role="alert"><strong>Prediction failed.</strong> {runError}</div>
  {/if}

  {#if explanation}
    {@const p = explanation.prediction}
    <div class="result" aria-live="polite">
      <p class="label">Predicted cover type</p>
      <p class="prediction">{card.classes[p.classIndex]}</p>
      <p class="sentence">{explanation.sentence}</p>

      {#if p.ood}
        <div class="notice warn ood" role="status">
          <strong>Out of the model's comfort zone.</strong>
          <ul>
            {#each p.oodReasons as reason}<li>{reason}</li>{/each}
          </ul>
          The prediction below is shown anyway, but it is extrapolation and may be wrong.
        </div>
      {/if}

      <h3>Probabilities</h3>
      <ProbBars classes={card.classes} probs={p.probs} highlight={p.classIndex} />

      <h3>Sensitivity: {card.classes[p.classIndex]}</h3>
      <p class="muted small">{explanation.method}</p>
      <ul class="sens">
        {#each explanation.sensitivities as s (s.input)}
          {@const up = s.deltaUp[k]}
          {@const down = s.deltaDown[k]}
          <li>
            <span class="sname">{s.label}<span class="step"> ±{formatNumber(Math.round(s.step * 10) / 10)}{s.unit ? ' ' + s.unit : ''}</span></span>
            <span class="dbar" aria-hidden="true">
              <span class="half neg">
                {#if down < 0}<span class="d" style:width="{(Math.abs(down) / maxDelta) * 100}%" title="lower"></span>{/if}
                {#if up < 0}<span class="d up" style:width="{(Math.abs(up) / maxDelta) * 100}%" title="higher"></span>{/if}
              </span>
              <span class="half pos">
                {#if up > 0}<span class="d up" style:width="{(up / maxDelta) * 100}%" title="higher"></span>{/if}
                {#if down > 0}<span class="d" style:width="{(down / maxDelta) * 100}%" title="lower"></span>{/if}
              </span>
            </span>
            <span class="vals">↑ {pts(up)} · ↓ {pts(down)}</span>
          </li>
        {/each}
      </ul>
      <p class="muted small">
        Bars show percentage-point change in P({card.classes[p.classIndex]}). Light bar: input raised. Dark bar: input lowered.
      </p>
    </div>
  {/if}
</section>

<style>
  .probe {
    margin-top: 24px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .head h2 {
    margin: 0;
  }

  .intro {
    margin: 10px 0 18px;
    font-size: 15px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 14px 18px;
  }

  label {
    display: block;
    font-size: 14px;
    letter-spacing: 0.06em;
    color: var(--text-2);
    margin-bottom: 4px;
  }

  .hint {
    font-size: 14px;
    color: var(--text-2);
    margin-top: 4px;
    line-height: 1.45;
  }

  .hint.err {
    color: var(--error);
  }

  .hint.warn {
    color: var(--warn);
  }

  .actions {
    margin-top: 18px;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .err-summary {
    font-size: 15px;
    color: var(--error);
  }

  .result {
    margin-top: 28px;
  }

  .prediction {
    font-size: 28px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 300;
    margin-top: 4px;
  }

  .sentence {
    margin-top: 10px;
    color: var(--text-2);
  }

  .ood {
    margin-top: 16px;
  }

  .ood ul {
    margin: 6px 0;
    padding-left: 18px;
  }

  .small {
    font-size: 14px;
    margin-bottom: 10px;
  }

  .sens {
    list-style: none;
    padding: 0;
    margin: 0 0 8px;
    display: grid;
    gap: 6px;
  }

  .sens li {
    display: grid;
    grid-template-columns: minmax(150px, 220px) 1fr 140px;
    gap: 12px;
    align-items: center;
    font-size: 15px;
    color: var(--text-2);
  }

  .step {
    color: var(--text-3);
  }

  .dbar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 10px;
    background: #121518;
  }

  .half {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .half.neg {
    align-items: flex-end;
    border-right: 1px solid var(--text-3);
  }

  .d {
    display: block;
    height: 4px;
    background: #4f555c;
  }

  .d.up {
    background: #b9bec5;
  }

  .vals {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 14px;
  }

  @media (max-width: 560px) {
    .sens li {
      grid-template-columns: 1fr;
      gap: 2px;
    }
    .vals {
      text-align: left;
    }
  }
</style>
