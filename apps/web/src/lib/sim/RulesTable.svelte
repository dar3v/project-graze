<script lang="ts">
  import type { EcologyRules, SpeciesRules } from '../deps/herd.ts'

  let { rules, classes }: { rules: EcologyRules; classes: readonly string[] } = $props()

  const speciesRows: { key: keyof SpeciesRules | 'biteSize' | 'energyPerBiomass' | 'huntRadius' | 'killChance' | 'energyPerKill'; label: string }[] = [
    { key: 'initialCount', label: 'Released at start' },
    { key: 'startEnergy', label: 'Starting energy' },
    { key: 'maxEnergy', label: 'Max energy' },
    { key: 'metabolismPerTick', label: 'Energy burned per tick' },
    { key: 'moveRadius', label: 'Max move per tick (cells)' },
    { key: 'wanderChance', label: 'Chance of a random move' },
    { key: 'biteSize', label: 'Biomass eaten per tick' },
    { key: 'energyPerBiomass', label: 'Energy per biomass eaten' },
    { key: 'huntRadius', label: 'Hunting sight (cells)' },
    { key: 'killChance', label: 'Hunt success chance' },
    { key: 'energyPerKill', label: 'Energy per kill' },
    { key: 'reproduceEnergyThreshold', label: 'Energy needed to breed' },
    { key: 'reproduceCost', label: 'Energy given to offspring' },
    { key: 'reproduceChance', label: 'Breeding chance per tick' },
    { key: 'maxAge', label: 'Max age (ticks)' },
    { key: 'maxPopulation', label: 'Population cap' },
  ]

  function val(obj: object, key: string): string {
    const v = (obj as Record<string, unknown>)[key]
    return typeof v === 'number' ? String(v) : '—'
  }
</script>

<div class="rules">
  <p class="badge">Assumptions, not model output</p>
  <p class="muted small">
    These numbers are hand-written guesses in <code>packages/sim/herd/ecology.json</code>. They are not learned from data and not
    validated against real ecosystems. Only the cover map comes from the model. See <code>docs/ecology-rules.md</code>.
  </p>

  <h3>Vegetation per cover type</h3>
  <div class="table-scroll">
    <table>
      <thead><tr><th>Cover type (from model)</th><th class="num">Food capacity</th><th class="num">Regrowth / tick</th></tr></thead>
      <tbody>
        {#each rules.vegetation.foodByClass as food, i (i)}
          <tr>
            <td>{classes[i] ?? `class ${i}`}</td>
            <td class="num">{food}</td>
            <td class="num">{(rules.vegetation.regrowthByClass[i] * 100).toFixed(1)}%</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h3>Animals</h3>
  <div class="table-scroll">
    <table>
      <thead>
        <tr><th>Rule</th><th class="num">Herbivore</th><th class="num">Predator{rules.predator.enabled ? '' : ' (off)'}</th></tr>
      </thead>
      <tbody>
        {#each speciesRows as row (row.key)}
          <tr><td>{row.label}</td><td class="num">{val(rules.herbivore, row.key)}</td><td class="num">{val(rules.predator, row.key)}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .badge {
    display: inline-block;
    border: 1px solid var(--text-3);
    color: var(--text);
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 3px 10px;
    margin-bottom: 10px;
  }

  .small {
    font-size: 12px;
  }

  code {
    font-size: 11px;
    color: var(--text);
  }
</style>
