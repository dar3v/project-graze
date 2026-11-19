<script lang="ts">
  // Every number on this page is read from model_card.json at runtime.
  // Nothing is typed in by hand. A card marked `stub: true` gets a warning banner.
  import { baseUrl } from '../model/client.ts'
  import { fetchJsonOrThrow, loadCard } from '../model/loader.ts'
  import type { ModelCard } from '../model/modelCard.ts'
  import { classColor } from '../sandbox/palette.ts'

  let report: { s: 'loading' } | { s: 'ok'; card: ModelCard; warnings: readonly string[] } | { s: 'error'; message: string } = $state({
    s: 'loading',
  })

  loadCard(fetchJsonOrThrow, baseUrl())
    .then(({ card, warnings }) => (report = { s: 'ok', card, warnings }))
    .catch((err: unknown) => (report = { s: 'error', message: err instanceof Error ? err.message : String(err) }))

  const f3 = (v: number | undefined) => (v === undefined ? '—' : v.toFixed(3))
  const pct = (v: number | undefined) => (v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)
  const int = (v: number | undefined) => (v === undefined ? '—' : v.toLocaleString('en-US'))
</script>

{#snippet missing(what: string)}
  <p class="muted missing">Not in model_card.json yet ({what}).</p>
{/snippet}

<section class="section" aria-labelledby="report-title">
  <h2 id="report-title">Model Report</h2>
  <p class="muted lead">
    Generated at runtime from <code>model/model_card.json</code>, written by the training pipeline. If a number is wrong, fix the
    pipeline, not this page.
  </p>

  {#if report.s === 'loading'}
    <p class="muted">Loading model_card.json…</p>
  {:else if report.s === 'error'}
    <div class="notice error" role="alert">
      <strong>The model card is not available.</strong> This page shows only what <code>model_card.json</code> contains, so it stays empty
      until the trained model is exported. {report.message}
    </div>
  {:else}
    {@const c = report.card}
    {#if c.stub}
      <div class="notice warn"><span class="stub-tag">stub</span> This card is marked as a stub. Its contents are placeholders.</div>
    {/if}
    {#each report.warnings as w}
      <p class="notice warn">{w}</p>
    {/each}

    <h3>Model</h3>
    <table>
      <tbody>
        <tr><th scope="row">Name</th><td>{c.model.name}</td></tr>
        <tr><th scope="row">Type</th><td>{c.model.type}</td></tr>
        <tr><th scope="row">Version</th><td>{c.model.version}</td></tr>
        {#if c.model.trainedAt}<tr><th scope="row">Trained</th><td>{c.model.trainedAt}</td></tr>{/if}
        {#if c.model.seed !== undefined}<tr><th scope="row">Seed</th><td>{c.model.seed}</td></tr>{/if}
        {#if c.model.selectionRule}<tr><th scope="row">Selection rule</th><td>{c.model.selectionRule}</td></tr>{/if}
        <tr><th scope="row">Inputs</th><td>{c.features.join(', ')}</td></tr>
      </tbody>
    </table>

    <h3>Dataset</h3>
    {#if c.dataset}
      {@const d = c.dataset}
      <table>
        <tbody>
          <tr><th scope="row">Name</th><td>{d.name}</td></tr>
          {#if d.instances !== undefined}<tr><th scope="row">Instances</th><td>{int(d.instances)}</td></tr>{/if}
          {#if d.region}<tr><th scope="row">Region</th><td>{d.region}</td></tr>{/if}
          {#if d.featuresUsed}<tr><th scope="row">Features used</th><td>{d.featuresUsed.join(', ')}</td></tr>{/if}
          {#if d.featuresExcluded}<tr><th scope="row">Excluded</th><td>{d.featuresExcluded.join(', ')}</td></tr>{/if}
          {#if d.license}<tr><th scope="row">License</th><td>{d.license}</td></tr>{/if}
          {#if d.citation}<tr><th scope="row">Citation</th><td>{d.citation}{#if d.url} <a href={d.url} rel="noopener noreferrer" target="_blank">link</a>{/if}</td></tr>{/if}
        </tbody>
      </table>
      {#if d.classCounts && d.classCounts.length === c.classes.length}
        {@const total = d.classCounts.reduce((a, b) => a + b, 0)}
        <h3>Class balance</h3>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Class</th><th class="num">Count</th><th class="num">Share</th></tr></thead>
            <tbody>
              {#each c.classes as name, i (i)}
                <tr><td><span class="sw" style:background={classColor(i)}></span>{name}</td><td class="num">{int(d.classCounts[i])}</td><td class="num">{pct(d.classCounts[i] / total)}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      {#if d.preparation}
        <h3>Preparation</h3>
        <ol class="steps">{#each d.preparation as step}<li>{step}</li>{/each}</ol>
      {/if}
    {:else}
      {@render missing('dataset')}
    {/if}

    <h3>Split strategy</h3>
    {#if c.split}
      <p><strong class="hi">{c.split.strategy}</strong></p>
      {#if c.split.description}<p class="muted">{c.split.description}</p>{/if}
      {#if c.split.details}<ul class="steps">{#each c.split.details as d}<li>{d}</li>{/each}</ul>{/if}
    {:else}
      {@render missing('split')}
    {/if}

    <h3>Baseline comparison</h3>
    {#if c.baselines}
      <div class="table-scroll">
        <table>
          <thead><tr><th>Model</th><th class="num">Accuracy</th><th class="num">Macro-F1</th><th>Notes</th></tr></thead>
          <tbody>
            {#each c.baselines as b (b.name)}
              <tr class:sel={b.selected}>
                <td>{b.name}{b.selected ? ' (selected)' : ''}</td>
                <td class="num">{pct(b.accuracy)}</td>
                <td class="num">{f3(b.macroF1)}</td>
                <td class="muted">{b.notes ?? ''}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      {@render missing('baselines')}
    {/if}

    <h3>Evaluation</h3>
    {#if c.evaluations && c.evaluations.length > 0}
      {#each c.evaluations as ev, k (`${ev.name}|${ev.split}|${k}`)}
        <div class="eval">
          <p class="hi">{ev.name}</p>
          <p class="muted small">Split: {ev.split} · accuracy {pct(ev.accuracy)} · <strong class="hi">macro-F1 {f3(ev.macroF1)}</strong></p>

          {#if ev.perClass}
            <div class="table-scroll">
              <table>
                <thead><tr><th>Class</th><th class="num">Precision</th><th class="num">Recall</th><th class="num">F1</th><th class="num">Support</th></tr></thead>
                <tbody>
                  {#each ev.perClass as m, i (i)}
                    <tr><td>{c.classes[i]}</td><td class="num">{f3(m.precision)}</td><td class="num">{f3(m.recall)}</td><td class="num">{f3(m.f1)}</td><td class="num">{int(m.support)}</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          {#if ev.confusionMatrix}
            {@const cm = ev.confusionMatrix}
            <p class="label cm-label">Confusion matrix · rows: true class · columns: predicted · shade: share of the row</p>
            <div class="table-scroll">
              <table class="cm">
                <thead>
                  <tr><th></th>{#each c.classes as _, j (j)}<th class="num" title={c.classes[j]}>{j + 1}</th>{/each}</tr>
                </thead>
                <tbody>
                  {#each cm as row, i (i)}
                    {@const rowSum = row.reduce((a, b) => a + b, 0) || 1}
                    <tr>
                      <th scope="row">{i + 1} {c.classes[i]}</th>
                      {#each row as v, j (j)}
                        {@const share = v / rowSum}
                        <td class="num cell" class:diag={i === j} style:background="rgba(212, 215, 220, {(share * 0.45).toFixed(3)})" title="{c.classes[i]} → {c.classes[j]}: {int(v)} ({pct(share)})">{int(v)}</td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/each}
    {:else}
      {@render missing('evaluations: per-class metrics, macro-F1, confusion matrix')}
    {/if}

    <h3>Calibration</h3>
    {#if c.calibration}
      {@const cal = c.calibration}
      <p class="muted small">{cal.method ?? 'Reliability bins'}{cal.ece !== undefined ? ` · expected calibration error ${f3(cal.ece)}` : ''}</p>
      <svg class="reliability" viewBox="0 0 220 220" role="img" aria-label="Reliability diagram: predicted confidence against observed accuracy per bin">
        <rect x="20" y="10" width="190" height="190" fill="none" stroke="#2a2e33" />
        <line x1="20" y1="200" x2="210" y2="10" stroke="#5b6168" stroke-dasharray="3 3" />
        {#each cal.bins as b}
          <rect x={20 + b.lower * 190} y={200 - b.accuracy * 190} width={Math.max(1, (b.upper - b.lower) * 190 - 2)} height={b.accuracy * 190} fill="#4f555c" />
          <circle cx={20 + b.confidence * 190} cy={200 - b.confidence * 190} r="2" fill="#d4d7dc" />
        {/each}
        <text x="20" y="216" fill="#8a9098" font-size="11">confidence →</text>
        <text x="2" y="10" fill="#8a9098" font-size="11" transform="rotate(90 2 10)">accuracy →</text>
      </svg>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Bin</th><th class="num">Mean confidence</th><th class="num">Accuracy</th><th class="num">Count</th></tr></thead>
          <tbody>
            {#each cal.bins as b}
              <tr><td>{b.lower.toFixed(1)}–{b.upper.toFixed(1)}</td><td class="num">{pct(b.confidence)}</td><td class="num">{pct(b.accuracy)}</td><td class="num">{int(b.count)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      {@render missing('calibration')}
    {/if}

    <h3>Ablations</h3>
    {#if c.ablations}
      <div class="table-scroll">
        <table>
          <thead><tr><th>Ablation</th><th class="num">Macro-F1</th><th class="num">Change</th></tr></thead>
          <tbody>
            {#each c.ablations as a (a.name)}
              <tr>
                <td>{a.name}{#if a.description}<br /><span class="muted small">{a.description}</span>{/if}</td>
                <td class="num">{f3(a.macroF1)}</td>
                <td class="num">{a.referenceMacroF1 !== undefined ? `${a.macroF1 - a.referenceMacroF1 >= 0 ? '+' : ''}${(a.macroF1 - a.referenceMacroF1).toFixed(3)}` : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      {@render missing('ablations')}
    {/if}

    <h3>Global feature importance</h3>
    {#if c.featureImportance}
      {@const fi = c.featureImportance}
      {@const max = Math.max(1e-9, ...fi.values.map((v) => Math.abs(v.importance)))}
      <p class="muted small">Method: {fi.method}</p>
      <ul class="fi">
        {#each [...fi.values].sort((a, b) => b.importance - a.importance) as v (v.feature)}
          <li>
            <span>{v.feature}</span>
            <span class="track"><span class="fill" style:width="{(Math.abs(v.importance) / max) * 100}%"></span></span>
            <span class="num">{v.importance.toFixed(3)}</span>
          </li>
        {/each}
      </ul>
    {:else}
      {@render missing('featureImportance')}
    {/if}

    <h3>Out-of-distribution detector</h3>
    {#if c.ood}
      <p><strong class="hi">{c.ood.method}</strong></p>
      <p class="muted">{c.ood.description}</p>
      <p class="muted small">
        {#if c.ood.threshold !== undefined}Threshold {c.ood.threshold}.{/if}
        {#if c.ood.flaggedRate !== undefined}Flags {pct(c.ood.flaggedRate)} of held-out samples.{/if}
        In the app, a prediction is also flagged when any input is outside its training range.
        {#if typeof c.ood.generatedTerrainFlaggedRate === 'number'}On generated Sandbox worlds (default settings, several seeds),
          {pct(c.ood.generatedTerrainFlaggedRate)} of land cells are marked low trust.{/if}
      </p>
    {:else}
      {@render missing('ood')}
    {/if}

    <h3>Limitations and what these numbers do not mean</h3>
    {#if c.limitations && c.limitations.length > 0}
      <ul class="steps">{#each c.limitations as l}<li>{l}</li>{/each}</ul>
    {:else}
      {@render missing('limitations, written by the team')}
    {/if}
    <p class="muted small">More context: <a href="#/responsible-use">Responsible Use</a>.</p>
  {/if}
</section>

<style>
  .lead {
    font-size: 15px;
    margin-bottom: 24px;
  }

  code {
    font-size: 15px;
    color: var(--text);
  }

  .missing {
    font-size: 15px;
    border: 1px dashed var(--border);
    padding: 8px 12px;
  }

  th[scope='row'] {
    width: 200px;
    white-space: nowrap;
  }

  .hi {
    color: var(--text);
    font-weight: 400;
  }

  .small {
    font-size: 14px;
  }

  .steps {
    margin: 0;
    padding-left: 20px;
    color: var(--text-2);
    font-size: 15px;
  }

  .sw {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 8px;
  }

  tr.sel td {
    color: var(--text);
  }

  .eval {
    margin-bottom: 28px;
  }

  .eval > .muted {
    margin: 2px 0 10px;
  }

  .cm-label {
    margin-top: 14px;
    margin-bottom: 6px;
  }

  .cm td.cell {
    padding: 4px 8px;
    border: 1px solid #14171a;
  }

  .cm td.diag {
    color: var(--text);
    outline: 1px solid #3a3f45;
  }

  .cm th[scope='row'] {
    width: auto;
    font-size: 14px;
  }

  .reliability {
    width: 220px;
    max-width: 100%;
    display: block;
    margin: 6px 0 12px;
  }

  .fi {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 6px;
  }

  .fi li {
    display: grid;
    grid-template-columns: minmax(190px, 290px) 1fr 75px;
    gap: 12px;
    align-items: center;
    font-size: 15px;
    color: var(--text-2);
  }

  .track {
    height: 6px;
    background: #15181b;
  }

  .fill {
    display: block;
    height: 100%;
    background: #8a9098;
  }

  .fi .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
