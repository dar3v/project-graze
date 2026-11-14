<script lang="ts">
  // DRAFT wording (agent-drafted). The team must rewrite and approve the final
  // text (tempRole2.md D7: humans write the Responsible Use wording).
  const issues: { id: string; title: string; issue: string; safeguards: string[] }[] = [
    {
      id: 'privacy',
      title: 'Privacy',
      issue:
        'Apps that store user input can leak it or use it for things people did not agree to.',
      safeguards: [
        'No accounts, no sign-in, no cookies, no analytics, and no personal data collected.',
        'Predictions run in a Web Worker in your browser. The values you type into the Site Probe are never sent to a server.',
        'The only network requests load the app and the model files, except when you press "Save and get a link". A save sends the world\'s recipe (seed, sliders, brush edits as height changes, model version) and nothing else: no names, no free text, no predictions. Your network address is used only to limit how often saves can be made and is not stored.',
        'Settings are kept in your own browser storage, never on a server.',
      ],
    },
    {
      id: 'bias',
      title: 'Bias',
      issue:
        'The training data comes from four wilderness areas in one national forest in northern Colorado. Two cover types make up most of the rows, so a model can look accurate while doing badly on rare types.',
      safeguards: [
        'The Model Report shows per-class precision, recall and F1 and macro-F1, not accuracy alone.',
        'The class balance of the dataset is shown next to the metrics.',
        'Every page footer says the model comes from a single region and does not transfer elsewhere.',
      ],
    },
    {
      id: 'fairness',
      title: 'Fairness',
      issue:
        'The model makes no decisions about people. The risk is about places: some terrain types (rare cover types, unusual elevations) are served worse than others.',
      safeguards: [
        'Leave-one-wilderness-area-out evaluation in the Model Report shows how much performance drops on an area the model never saw.',
        'Inputs outside the training range are flagged in the Site Probe and can be shown on the map.',
      ],
    },
    {
      id: 'transparency',
      title: 'Transparency',
      issue: 'People need to know what the system is, what data it used, and which parts are learned versus made up.',
      safeguards: [
        'The Model Report is generated from model_card.json, so the numbers shown are the numbers the pipeline produced.',
        'The herd simulation rules are labeled "assumptions, not model output" and shown in full next to the simulation.',
        'If the model files are missing or invalid, the app shows an error instead of guessing; there is no fallback predictor.',
        'Dataset source and license are credited on every page.',
      ],
    },
    {
      id: 'explainability',
      title: 'Explainability',
      issue: 'A probability on its own does not tell anyone why the model leaned one way.',
      safeguards: [
        'The Site Probe shows all class probabilities, not just the top one.',
        'A one-sentence explanation and sensitivity bars show how each input moves the prediction near that point.',
        'The Model Report shows global feature importance and the ablation results.',
        'The method is described in plain words, including that sensitivity is not cause and effect.',
      ],
    },
    {
      id: 'accountability',
      title: 'Accountability',
      issue: 'When something is wrong, it should be clear who owns it and how to reproduce it.',
      safeguards: [
        'Training is scripted with fixed seeds, and versions are recorded in model_card.json.',
        'The simulation is deterministic for a given seed, so any run can be replayed.',
        'File ownership per team member is documented in the repository.',
      ],
    },
    {
      id: 'over-reliance',
      title: 'Over-reliance',
      issue:
        'A polished interface can make guesses look like facts, and someone could take the output into a real forestry or land-use decision.',
      safeguards: [
        'Every page carries an "educational simulation only" notice, and a line under the 3D world says predictions are for terrain-like inputs, not real ground truth.',
        'A good-looking 3D world can make predictions feel more trustworthy than they are. Low-trust (out-of-distribution) cells are drawn differently in the world itself, not only in an overlay. Confidence is shown next to each prediction. The Model Report is one click away from every view.',
        'Out-of-range and unusual inputs get a plain-language warning that the prediction is extrapolation.',
        'Probabilities are shown as estimates. Calibration is reported so people can see when confidence is too high.',
        'The Model Report ends with a section on what the numbers do not mean.',
      ],
    },
  ]
</script>

<section class="section" aria-labelledby="ru-title">
  <h2 id="ru-title">Responsible Use</h2>
  <p class="notice warn draft"><strong>Draft.</strong> This wording is a first draft. The team edits and approves the final text.</p>

  <p class="lead">
    Graze is a classroom project. It pairs a real classifier (trained on the Covertype dataset) with a made-up valley and a
    hand-written herd simulation. Each risk below is listed with the safeguard this app uses for it.
  </p>

  <nav class="toc" aria-label="Topics">
    {#each issues as it, i (it.id)}<a href="#/responsible-use" onclick={(e) => { e.preventDefault(); document.getElementById(`ru-${it.id}`)?.scrollIntoView({ behavior: 'smooth' }) }}><span class="n">{i + 1}</span> {it.title}</a>{/each}
  </nav>

  {#each issues as it (it.id)}
    <article id="ru-{it.id}">
      <h3>{it.title}</h3>
      <p class="label">Risk</p>
      <p class="muted">{it.issue}</p>
      <p class="label sg">Safeguard in this app</p>
      <ul>{#each it.safeguards as s}<li>{s}</li>{/each}</ul>
    </article>
  {/each}

  <article id="ru-world">
    <h3>What the 3D world shows</h3>
    <ul>
      <li>
        The trees and ground cover in the 3D world, and the colours on the map, are a <strong>drawing of the predicted classes</strong>. They are not
        photographs, survey data or ground truth. One tree shape per class is placed where the model predicted that class.
      </li>
      <li>The valley is generated by code from a seed. It is not a real place, and the predictions describe no real ground.</li>
      <li>
        The day/night cycle and the light on the terrain are <strong>cosmetic</strong>. The visible sun is not the model's hillshade input. The
        model's hillshade values come from the shape of the terrain and a fixed sun position, so moving the time of day never changes a
        prediction.
      </li>
      <li>
        Cells marked low trust are unlike the data the model learned from. The <a href="#/report">Model Report</a> gives the measured share of
        low-trust cells on generated worlds. Treat what is drawn there as the least reliable part of the picture.
      </li>
    </ul>
  </article>

  <article>
    <h3>What this app is not</h3>
    <ul>
      <li>Not a forestry, conservation, or land-use tool. Do not use it for real decisions.</li>
      <li>Not a model of real animals. The herd rules are our assumptions and have not been checked against field data.</li>
      <li>Not a source of facts about any real place. The terrain is generated.</li>
    </ul>
  </article>
</section>

<style>
  .draft {
    margin-bottom: 20px;
  }

  .lead {
    color: var(--text-2);
  }

  .toc {
    margin: 28px 0 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .toc a {
    color: var(--text-2);
    text-decoration: none;
  }

  .toc a:hover {
    color: var(--text);
  }

  .n {
    color: var(--text-3);
  }

  article {
    border-top: 1px solid #16191c;
    padding-top: 6px;
    margin-top: 28px;
  }

  .sg {
    margin-top: 12px;
  }

  ul {
    margin: 4px 0 0;
    padding-left: 18px;
    color: var(--text);
  }

  li + li {
    margin-top: 4px;
  }
</style>
