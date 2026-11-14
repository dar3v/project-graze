<script lang="ts">
  import { PREDICTION_NOTICE } from '../state/worldFeatures.ts'
</script>

<footer>
  <p class="notice-line">{PREDICTION_NOTICE}</p>
  <p>
    <strong>Educational simulation only.</strong> Not for real forestry, conservation, or land-use decisions. The model learned
    from one forest region in Colorado. Its predictions do not transfer to other places, and on this generated terrain they are
    estimates, not facts.
    <a href="#/responsible-use">Limitations and responsible use</a>.
  </p>
  <p class="credit">
    Data: Blackard, J. (1998). <em>Covertype</em> [Dataset]. UCI Machine Learning Repository.
    <a href="https://doi.org/10.24432/C50K5N" rel="noopener noreferrer" target="_blank">doi:10.24432/C50K5N</a>. Licensed under
    <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer" target="_blank">CC BY 4.0</a>. Original database
    © Jock A. Blackard and Colorado State University.
  </p>
</footer>

<style>
  footer {
    margin-top: 96px;
    padding-top: 24px;
    border-top: 1px solid #16191c;
    text-align: center;
    font-size: 11px;
    line-height: 1.7;
    color: var(--text-2);
    letter-spacing: 0.02em;
  }

  strong {
    color: var(--text);
    font-weight: 500;
  }

  .notice-line {
    margin-bottom: 10px;
    color: var(--text);
  }

  .credit {
    margin-top: 10px;
  }
</style>
