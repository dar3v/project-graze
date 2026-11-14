<script lang="ts">
  import { route, ROUTES } from './lib/router.ts'
  import { modelStatus } from './lib/model/client.ts'
  import WorldBackdrop from './lib/backdrop/WorldBackdrop.svelte'
  import Footer from './lib/components/Footer.svelte'
  import Sandbox from './lib/routes/Sandbox.svelte'
  import ModelReport from './lib/routes/ModelReport.svelte'
  import ResponsibleUse from './lib/routes/ResponsibleUse.svelte'

  const statusLabel = $derived(
    $modelStatus.state === 'loading'
      ? 'model: loading'
      : $modelStatus.state === 'error'
        ? 'model: error'
        : $modelStatus.stub
          ? 'model: stub'
          : `model: ${$modelStatus.card.model.version}`,
  )
</script>

<WorldBackdrop />

<a class="btn utility" href="#/report" title="Model status. Opens the Model Report.">{statusLabel}</a>

<div class="shell">
  <header>
    <p class="label eyebrow">CSST 102 · terrain-to-habitat classifier</p>
    <h1>Graze</h1>
    <p class="tagline">Sculpt a valley. A model guesses what would grow there.<br />Then see if your herds can live on it.</p>

    <nav aria-label="Main">
      {#each ROUTES as r, i (r.id)}
        <a class="tab" href={r.hash} aria-current={$route === r.id ? 'page' : undefined}><span class="n">{i + 1}</span> {r.label}</a>
      {/each}
    </nav>
  </header>

  {#if $modelStatus.state === 'error'}
    <div class="notice error banner" role="alert">
      <strong>The model could not be loaded.</strong> Predictions are unavailable. {$modelStatus.message}
    </div>
  {:else if $modelStatus.state === 'ready' && $modelStatus.stub}
    <div class="notice warn banner" role="status">
      <span class="stub-tag">stub</span> <strong>Fake predictions.</strong> The real model files are not available yet, so a
      placeholder predictor is running. Its class names and numbers are made up and mean nothing.
      {#if $modelStatus.loadError}<span class="muted"> ({$modelStatus.loadError})</span>{/if}
    </div>
  {/if}

  <main>
    {#if $route === 'sandbox'}
      <Sandbox />
    {:else if $route === 'report'}
      <ModelReport />
    {:else if $route === 'responsible-use'}
      <ResponsibleUse />
    {:else}
      <section class="section">
        <h2>Not found</h2>
        <p class="muted">There is no page at this address. <a href="#/">Back to the sandbox</a>.</p>
      </section>
    {/if}
  </main>

  <Footer />
</div>

<style>
  .utility {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 10;
    font-size: 10px;
    padding: 5px 10px;
    background: rgba(8, 10, 13, 0.85);
  }

  .shell {
    position: relative;
    z-index: 1;
    max-width: 760px;
    margin: 0 auto;
    padding: 96px 16px 48px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    text-align: center;
  }

  .eyebrow {
    margin-bottom: 18px;
  }

  h1 {
    font-size: clamp(30px, 8vw, 48px);
    font-weight: 300;
    letter-spacing: 0.36em;
    text-transform: uppercase;
    margin-right: -0.36em;
    color: var(--text);
  }

  .tagline {
    margin-top: 18px;
    font-size: 14px;
    letter-spacing: 0.04em;
    color: var(--text-2);
  }

  nav {
    margin-top: 48px;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tab {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-2);
    border: 1px solid var(--border);
    padding: 7px 14px;
    text-decoration: none;
  }

  .tab:hover {
    background: var(--fill);
    color: var(--text);
  }

  .tab[aria-current='page'] {
    background: var(--fill);
    color: var(--text);
    border-color: #3a3f45;
  }

  .n {
    color: var(--text-3);
    margin-right: 4px;
  }

  .banner {
    margin-top: 40px;
  }

  main {
    flex: 1;
  }
</style>
