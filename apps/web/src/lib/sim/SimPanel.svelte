<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import {
    applyMapChange,
    computeScore,
    createSim,
    defaultEcology,
    interpolateSnapshot,
    medianMovingSpeed,
    SCORE_WINDOW,
    SimClock,
    snapshotPoses,
    stepSim,
    TICK_MS,
    tickGapMs,
    validateRules,
    type InterpolatedPoses,
    type SimSnapshot,
    type SimState,
  } from '../deps/herd.ts'
  import { reducedMotion } from '../state/settings.ts'
  import { animalSpeedLabel, animalTimeScale, paceScale, type AnimalSpeed } from '../world/pace.ts'
  import EventLog from './EventLog.svelte'
  import type { HerdSummary } from './herdSummary.ts'
  import PopulationChart from './PopulationChart.svelte'
  import RulesTable from './RulesTable.svelte'

  interface Props {
    size: number
    cover: Uint8Array | null
    water: Uint8Array
    classes: readonly string[]
    /** Increments whenever the cover map is replaced. */
    mapVersion: number
    /**
     * Identity of the landscape `cover` was predicted for (seed and generator
     * options). A new key re-seeds the sim; the same key with a new map
     * (brush edit, water level) keeps the herds running on the new map.
     */
    worldKey: string
    /**
     * Animal poses for the renderer, [x, y, heading] per animal in grid cells
     * (packages/sim/herd/src/view.ts). Called once per animation frame while
     * running (interpolated between ticks), and after every change.
     */
    onposes: (p: InterpolatedPoses | null) => void
    /**
     * ROLE-1 D16. The "Animal speed" choice while a ground-level view is
     * shown (walk mode, the ambient backdrop behind another page), or null
     * for full sim speed (orbit view, and this panel on the Sandbox). It
     * scales the sim CLOCK only: the ticks are the same, further apart.
     */
    animalSpeed?: AnimalSpeed | null
    /** Herd counts, score and the clock scale, for the walk info panel and the readout. */
    onsummary?: (s: HerdSummary | null) => void
  }

  let { size, cover, water, classes, mapVersion, worldKey, onposes, animalSpeed = null, onsummary }: Props = $props()

  const rulesResult = $derived(validateRules(defaultEcology, classes.length))

  let sim: SimState | null = $state.raw(null)
  let version = $state(0)
  let running = $state(false)
  let seed = $state(1)
  let speed = $state(2)
  let simError: string | null = $state(null)
  /** Map and world the running sim was last given (plain variables: read inside the effect without tracking). */
  let simMapVersion = -1
  let simWorldKey = ''

  /**
   * Sim clock (packages/sim/herd/src/clock.ts): woken every TICK_MS,
   * independent of the frame rate. At full speed it releases `speed` ticks per
   * wake-up, as before. In a ground-level view the rate is multiplied by
   * `timeScale`, so the same ticks happen further apart (ROLE-1 D16).
   */
  const clock = new SimClock()
  let timer: ReturnType<typeof setInterval> | undefined
  let raf = 0
  let prevSnap: SimSnapshot | null = null
  let nextSnap: SimSnapshot | null = null
  let lastWakeAt = 0
  let lastFrameAt = 0
  /** How far the animals have glided from the previous batch of ticks to the latest, 0..1. */
  let glide = 1

  /** Ticks per second at full sim speed. */
  const fullRate = $derived(speed * (1000 / TICK_MS))
  /**
   * The scale that brings a typical moving animal down to walking pace,
   * computed from the rules (never hand-set): editing ecology.json keeps it right.
   */
  const pace = $derived(rulesResult.ok ? paceScale(medianMovingSpeed(rulesResult.rules, fullRate)) : 1)
  const timeScale = $derived(animalSpeed ? animalTimeScale(animalSpeed, pace) : 1)
  const rate = $derived(fullRate * timeScale)

  const score = $derived.by(() => {
    void version
    return sim ? computeScore(sim) : null
  })

  function passableFromWater(): Uint8Array {
    const passable = new Uint8Array(water.length)
    for (let i = 0; i < water.length; i++) passable[i] = water[i] ? 0 : 1
    return passable
  }

  /** Poses at fraction t of the way from the previous step to the latest one. */
  function emit(t: number): void {
    onposes(sim && nextSnap ? interpolateSnapshot(prevSnap, nextSnap, t) : null)
  }

  /** Record a new state: the previous snapshot becomes the interpolation start. */
  function snap(keepPrev: boolean): void {
    prevSnap = keepPrev ? nextSnap : null
    nextSnap = sim ? snapshotPoses(sim) : null
    glide = 0
    version++
    if (!running || $reducedMotion) emit(1)
  }

  // Animals glide from one batch of ticks to the next over the time the clock
  // takes between batches, so they stay smooth at the slowest pace (no
  // stepping; headings turn along the shortest arc). A paused clock holds
  // them where they are.
  function frame(now: number): void {
    raf = 0
    if (!running) return
    const gap = tickGapMs(rate)
    if (Number.isFinite(gap)) glide = Math.min(1, glide + (now - lastFrameAt) / gap)
    lastFrameAt = now
    emit(glide)
    raf = requestAnimationFrame(frame)
  }

  function wake(): void {
    const now = performance.now()
    // A timer that fires late (a busy or background tab) does not make the sim catch up in a burst.
    const due = clock.advance(Math.min(now - lastWakeAt, TICK_MS * 4), rate)
    lastWakeAt = now
    if (due > 0) step(due)
  }

  function reset(): void {
    const wasRunning = running
    pause()
    simError = null
    if (!rulesResult.ok || !cover) return
    try {
      sim = createSim({ width: size, height: size, cover, passable: passableFromWater(), rules: rulesResult.rules, seed: Number(seed) || 0 })
      simMapVersion = mapVersion
      simWorldKey = worldKey
    } catch (err) {
      sim = null
      simError = err instanceof Error ? err.message : String(err)
    }
    snap(false)
    if (wasRunning && sim) play()
  }

  function step(n = 1): void {
    if (!sim) reset()
    if (!sim) return
    try {
      stepSim(sim, n)
    } catch (err) {
      pause()
      simError = `The simulation stopped: ${err instanceof Error ? err.message : String(err)}`
    }
    snap(true)
  }

  function play(): void {
    if (running) return
    if (!sim) reset()
    if (!sim) return
    running = true
    clock.reset()
    lastWakeAt = lastFrameAt = performance.now()
    timer = setInterval(wake, TICK_MS)
    if (!$reducedMotion) raf = requestAnimationFrame(frame)
  }

  function pause(): void {
    running = false
    if (timer) clearInterval(timer)
    timer = undefined
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    // Settle on the latest tick so paused animals sit on their cells.
    if (sim && nextSnap) emit(1)
  }

  function clearSim(): void {
    pause()
    sim = null
    snap(false)
  }

  // A new cover map arrived. New landscape: re-seed (same sim seed, so it is
  // deterministic). Same landscape, edited: keep the run going on the new map
  // (applyMapChange; docs/ecology-rules.md, "Terrain edits").
  $effect(() => {
    const v = mapVersion
    const key = worldKey
    const s = sim
    const c = cover
    if (!s || !c || v === simMapVersion) return
    untrack(() => {
      if (key !== simWorldKey) {
        reset()
        return
      }
      try {
        applyMapChange(s, { cover: c, passable: passableFromWater() })
        simMapVersion = v
        snap(false)
      } catch (err) {
        pause()
        simError = `The simulation could not follow the terrain change: ${err instanceof Error ? err.message : String(err)}`
      }
    })
  })

  // Reduced motion switched on while running: stop gliding, snap to ticks.
  $effect(() => {
    const reduce = $reducedMotion
    const isRunning = running
    untrack(() => {
      if (reduce && raf) {
        cancelAnimationFrame(raf)
        raf = 0
        emit(1)
      } else if (!reduce && isRunning && !raf) {
        lastFrameAt = performance.now()
        raf = requestAnimationFrame(frame)
      }
    })
  })

  onDestroy(() => {
    pause()
    onposes(null)
    onsummary?.(null)
  })

  $effect(() => {
    void version
    const s = sim
    const sc = score
    const summary: HerdSummary | null = s
      ? {
          tick: s.tick,
          herbivores: s.herbivores.length,
          predators: s.rules.predator.enabled ? s.predators.length : null,
          score: sc?.score ?? null,
          provisional: sc?.provisional ?? true,
          running,
          timeScale,
        }
      : null
    untrack(() => onsummary?.(summary))
  })

  const pct = (v: number) => `${Math.round(v * 100)}`
</script>

<section class="section" aria-labelledby="sim-title">
  <h2 id="sim-title">Herd simulation</h2>
  <p class="muted intro">
    Herbivores graze the vegetation the model predicts; predators hunt herbivores. The behaviour is hand-written rules, not
    machine learning. Same seed and same map give the same run. A new terrain seed restarts the herds; sculpting keeps them
    running and moves any animal caught by new water to the nearest land.
  </p>

  {#if !rulesResult.ok}
    <div class="notice error" role="alert">
      <strong>ecology.json is invalid.</strong> The simulation is disabled until it is fixed.
      <ul>{#each rulesResult.errors as e}<li>{e}</li>{/each}</ul>
    </div>
  {:else}
    <div class="controls">
      {#if running}
        <button class="primary" onclick={pause}>Pause</button>
      {:else}
        <button class="primary" onclick={play} disabled={!cover}>Run</button>
      {/if}
      <button onclick={() => step(1)} disabled={!cover || running}>Step</button>
      <button onclick={reset} disabled={!cover}>Reset</button>
      <button onclick={clearSim} disabled={!sim}>Clear</button>
      <label class="inline">Seed <input type="number" bind:value={seed} step="1" /></label>
      <label class="inline"
        >Speed
        <select bind:value={speed}>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={5}>5×</option>
          <option value={20}>20×</option>
        </select>
      </label>
    </div>

    {#if animalSpeed && timeScale < 1}
      <p class="muted small pace" role="status">
        Animal speed: <strong>{animalSpeedLabel(animalSpeed)}</strong>. A ground-level view is shown, so the sim clock runs at ×{timeScale.toFixed(3)} of
        the speed chosen here{timeScale === 0 ? ' (paused)' : ''}. That slows the whole ecosystem, not only the walking: breeding, starvation, the chart and
        the score all move slower per real second. The ticks themselves are unchanged. Orbit view runs at full sim speed.
      </p>
    {/if}

    {#if !cover}
      <p class="muted small">Waiting for a cover map from the model.</p>
    {/if}
    {#if simError}
      <div class="notice error" role="alert"><strong>Simulation error.</strong> {simError}</div>
    {/if}

    {#if sim}
      <div class="stats">
        <div><p class="label">Tick</p><p class="big">{sim.tick}</p></div>
        <div><p class="label">Herbivores</p><p class="big">{sim.herbivores.length}</p></div>
        <div><p class="label">Predators</p><p class="big">{sim.rules.predator.enabled ? sim.predators.length : 'off'}</p></div>
        <div>
          <p class="label">Rewilding score</p>
          <p class="big">{score?.score ?? '—'}<span class="of">/100</span></p>
        </div>
      </div>

      {#if score}
        <p class="muted small score-detail">
          Habitat diversity {pct(score.habitatDiversity)}% · herbivore stability {pct(score.herbivoreStability)}%{#if score.predatorStability !== null}
            · predator stability {pct(score.predatorStability)}%{/if}. Weights {score.weights.diversity} / {score.weights.herbivores}{#if score.predatorStability !== null}
            / {score.weights.predators}{/if}, over the last {Math.min(score.samples, SCORE_WINDOW)} ticks.
          {#if score.provisional}<strong>Provisional:</strong> run longer for a stable score.{/if}
          Definition: <code>docs/ecology-rules.md</code>.
        </p>
      {/if}

      <h3>Population</h3>
      <PopulationChart history={sim.history} {version} />

      <h3>Event log</h3>
      <EventLog events={sim.events} {version} />
    {/if}

    <h3>Ecology rules</h3>
    <RulesTable rules={rulesResult.rules} {classes} />
  {/if}
</section>

<style>
  .intro {
    font-size: 15px;
    margin-bottom: 16px;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .inline {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    font-size: 14px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-2);
  }

  .inline input {
    width: 100px;
  }

  .inline select {
    width: auto;
  }

  .small {
    font-size: 15px;
    margin-top: 12px;
  }

  .stats {
    margin-top: 24px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
  }

  .big {
    font-size: 28px;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
  }

  .of {
    font-size: 15px;
    color: var(--text-3);
    margin-left: 4px;
  }

  .score-detail strong {
    color: var(--text);
    font-weight: 500;
  }

  code {
    font-size: 14px;
    color: var(--text);
  }
</style>
