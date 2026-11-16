<script lang="ts">
  import { route, ROUTES } from './lib/router.ts'
  import { modelStatus } from './lib/model/client.ts'
  import WorldBackdrop from './lib/backdrop/WorldBackdrop.svelte'
  import Footer from './lib/components/Footer.svelte'
  import Sandbox from './lib/routes/Sandbox.svelte'
  import ModelReport from './lib/routes/ModelReport.svelte'
  import ResponsibleUse from './lib/routes/ResponsibleUse.svelte'
  import HelpOverlay from './lib/help/HelpOverlay.svelte'
  import { helpOpen, isTypingTarget } from './lib/help/help.ts'
  import { viewMode } from './lib/state/appState.ts'

  // Walk mode covers the window (ROLE-1 D14): the page under it is inert.
  const walking = $derived($route === 'sandbox' && $viewMode === 'walk')

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
      e.preventDefault()
      helpOpen.update((v) => !v)
    }
  }

  const statusLabel = $derived(
    $modelStatus.state === 'loading'
      ? 'model: loading'
      : $modelStatus.state === 'error'
        ? 'model: error'
        : `model: ${$modelStatus.card.model.version}`,
  )
</script>

<svelte:window {onkeydown} />

<WorldBackdrop />

<div class="utility" inert={walking}>
  <button type="button" class="btn" onclick={() => helpOpen.set(true)} title="Controls help (?)" aria-haspopup="dialog">? help</button>
  <a class="btn" href="#/report" title="Model status. Opens the Model Report.">{statusLabel}</a>
</div>

<HelpOverlay />

<div class="shell" class:walking>
  <header inert={walking}>
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
    <div class="notice error banner" role="alert" inert={walking}>
      <strong>The model could not be loaded.</strong> Predictions are unavailable. {$modelStatus.message}
    </div>
  {/if}

  <main>
    <!-- The Sandbox stays mounted behind the other pages (ROLE-1 D14): its
         terrain, predictions and herds are the world the background draws,
         and they are still there on return. -->
    <div hidden={$route !== 'sandbox'}>
      <Sandbox active={$route === 'sandbox'} />
    </div>
    {#if $route === 'sandbox'}
      <!-- shown above -->
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

  <div inert={walking}><Footer /></div>
</div>

<style>
  .utility {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 10;
    display: flex;
    gap: 6px;
  }

  .utility .btn {
    font-size: 10px;
    padding: 5px 10px;
    background: rgba(8, 10, 13, 0.85);
  }

  /* Walk mode is a fixed, full-viewport layer inside the shell: lift the shell
     above the utility buttons (z-index 10) while it is on. The help dialog
     (40) still opens over it. */
  .shell.walking {
    z-index: 20;
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
