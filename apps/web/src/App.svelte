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

<HelpOverlay />

<div class="shell">
  <Sandbox>
    {#snippet header()}
      <header>
        <div class="badges">
          <a class="btn" href="#/report" title="Model status. Opens the Model Report.">{statusLabel}</a>
        </div>
        <p class="label eyebrow">CSST 102 · terrain-to-habitat classifier</p>
        <h1>Graze</h1>
        <p class="tagline">Sculpt a valley. A model guesses what would grow there. Then see if your herds can live on it.</p>

        <nav aria-label="Sections">
          {#each ROUTES as r (r.id)}
            <a class="btn" href={r.hash} aria-current={$route === r.id ? 'page' : undefined}>{r.label}</a>
          {/each}
        </nav>
      </header>

      {#if $modelStatus.state === 'error'}
        <div class="notice error banner" role="alert">
          <strong>The model could not be loaded.</strong> Predictions are unavailable. {$modelStatus.message}
        </div>
      {/if}

      {#if $route === 'not-found'}
        <p class="notice warn banner" role="status">There is no page at this address. <a href="#/">Back to the overview</a>.</p>
      {/if}
    {/snippet}

    <!-- One section at a time; the Overview is the Sandbox's own (it stays mounted, see Sandbox.svelte). -->
    {#if $route === 'report'}
      <ModelReport />
    {:else if $route === 'responsible-use'}
      <ResponsibleUse />
    {/if}
    <Footer />
  </Sandbox>
</div>

<style>
  /* Two columns (layout-refactoring.md): the sandbox is pinned on the left,
     the documentation feed scrolls on its own on the right. */
  .shell {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    height: 100vh;
    height: 100dvh;
  }

  /* Narrow screens: one column, the page scrolls as a whole. */
  @media (max-width: 960px) {
    .shell {
      display: block;
      height: auto;
    }
  }

  .badges {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-bottom: 16px;
  }

  .badges .btn {
    font-size: 10px;
    padding: 5px 10px;
    background: rgba(8, 10, 13, 0.85);
  }

  .eyebrow {
    margin-bottom: 12px;
  }

  h1 {
    font-size: clamp(26px, 3.2vw, 40px);
    font-weight: 300;
    letter-spacing: 0.36em;
    text-transform: uppercase;
    color: var(--text);
  }

  .tagline {
    margin-top: 12px;
    font-size: 13px;
    letter-spacing: 0.04em;
    color: var(--text-2);
  }

  nav {
    margin-top: 24px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Same as the active Orbit/Walk button in the Sandbox. */
  nav .btn[aria-current='page'] {
    color: var(--text);
    border-color: var(--text-2);
    background: var(--fill);
  }

  .banner {
    margin-top: 24px;
  }
</style>
