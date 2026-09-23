import { micro } from '../microgrid-controller.mjs';
import { heading } from './layout.mjs';
import { learningPanel } from './microgrid-learning.mjs';
import { escapeHtml, money, number } from './format.mjs';
import { chart } from './chart.mjs';
import { microGreedy } from '../microgrid/policies.mjs';

let reports = null;
export async function loadReports() {
  reports = Object.fromEntries(
    await Promise.all(
      ['benchmark', 'ablations', 'dqn'].map(async (name) => {
        const response = await fetch('/src/reports/' + name + '.json');
        if (!response.ok)
          throw new Error('Benchmark report unavailable: ' + name);
        return [name, await response.json()];
      })
    )
  );
}

export function experimentsView() {
  const run = micro.record;
  if (!run)
    return heading(
      'EXPERIMENTS',
      'Experiment unavailable.',
      'Reload to load the reference policy.'
    );
  const saved = micro.savedRuns
    .map(
      (savedRun) => `<tr>
    <td><b>${escapeHtml(savedRun.id.slice(0, 18))}</b><small>${escapeHtml(savedRun.source || 'training')}</small></td>
    <td>${savedRun.model.seed}</td><td>${number(savedRun.model.episodes)}</td>
    <td>${money(savedRun.model.evaluations.balanced.learned.objective)}</td>
    <td><button class="button quiet small" data-action="micro-load" data-run-id="${escapeHtml(savedRun.id)}">Load</button>
    <button class="button quiet small" data-action="micro-delete" data-run-id="${escapeHtml(savedRun.id)}">Delete</button></td></tr>`
    )
    .join('');
  return (
    heading(
      'CONTROL WORKSPACE / EXPERIMENTS',
      'Reproducible experiments.',
      'Configure a policy, inspect the learning curve, and retain the evidence behind every result.',
      '<button class="button quiet" data-action="micro-import">Import run</button><button class="button quiet" data-action="micro-save">Save current run</button>' +
        (micro.training
          ? '<button class="button quiet" data-action="micro-pause">' +
            (micro.training.paused ? 'Resume training' : 'Pause training') +
            '</button>'
          : '') +
        '<button class="button" data-action="micro-train" ' +
        (micro.training ? 'disabled' : '') +
        '>Train Q-learning</button>'
    ) +
    `<div class="metrics">
      <article class="metric"><div class="metric-label">Current policy</div><div class="metric-number">Q-learning</div><div class="metric-foot">${escapeHtml(run.source)} · seed ${micro.model.seed}</div></article>
      <article class="metric"><div class="metric-label">Environment version</div><div class="metric-number">v1</div><div class="metric-foot">672 steps · 9 joint actions</div></article>
      <article class="metric"><div class="metric-label">Saved experiments</div><div class="metric-number">${micro.savedRuns.length}</div><div class="metric-foot">Stored privately in this browser</div></article>
      <article class="metric"><div class="metric-label">Completed training</div><div class="metric-number">${number(micro.model.episodes)}</div><div class="metric-foot">Episodes in the current policy</div></article>
    </div>
    <div class="micro-bottom">${learningPanel(micro)}
    <section class="panel"><div class="panel-head"><h2 class="panel-title">Experiment provenance</h2><span class="pill">${escapeHtml(run.source).toUpperCase()}</span></div>
      <dl class="provenance">
        <dt>Run ID</dt><dd>${escapeHtml(run.id)}</dd>
        <dt>Environment</dt><dd>${escapeHtml(run.environment.version)}</dd>
        <dt>Observation</dt><dd>${escapeHtml(run.environment.config.observation)}</dd>
        <dt>Code commit</dt><dd>${escapeHtml(run.code.commit || 'local development · not recorded')}</dd>
        <dt>Scenario fingerprint</dt><dd>${escapeHtml(run.dataset.fingerprint || 'local development · not recorded')}</dd>
        <dt>Algorithm</dt><dd>α 0.2 · γ 0.995 · ε floor 0.05</dd>
        <dt>Evaluation</dt><dd>10 held-out weeks per profile · greedy actions${run.evaluation ? ' · locally recomputed' : ''}</dd>
      </dl>
      <div class="chart-caption">A shared scenario link loads the reference policy. Export and import JSON to share a trained Q-table. Python DQN model files and reports are versioned in the repository.</div>
    </section></div>
    <section class="panel history-panel"><div class="panel-head"><div><h2 class="panel-title">Saved experiment history</h2><div class="panel-subtitle">Completed browser training is saved automatically</div></div></div>
    ${micro.storageError ? '<p class="chart-caption">Browser storage unavailable: ' + escapeHtml(micro.storageError) + '</p>' : ''}
    ${saved ? '<div class="table-scroll"><table class="action-table"><thead><tr><th>Run</th><th>Seed</th><th>Episodes</th><th>Mixed objective</th><th>Actions</th></tr></thead><tbody>' + saved + '</tbody></table></div>' : '<p class="chart-caption">No saved experiments yet. Train a policy or save the reference run.</p>'}
    </section>`
  );
}

export function evaluationView() {
  if (!reports)
    return heading(
      'EVALUATION',
      'Reports unavailable.',
      'Run the documented benchmark commands to generate the experiment reports.'
    );
  const q = reports.benchmark.variants[0],
    dqn = reports.dqn;
  const cards = [
    [
      'Q-learning',
      q.summary.balanced.learned,
      '5 seeds · 6,000 episodes / seed',
    ],
    ['DQN', dqn.summary.balanced.learned, '3 seeds · 100,000 steps / seed'],
    ['Rule-based', q.summary.balanced.rule, 'Identical held-out scenarios'],
    [
      'No battery',
      q.summary.balanced.noBattery,
      'EV controlled by the same rules',
    ],
  ];
  const rows = cards
    .map(
      ([
        name,
        metrics,
        budget,
      ]) => `<tr><td><b>${name}</b><small>${budget}</small></td>
    <td>${money(metrics.objective.mean)} ± ${money(metrics.objective.sd)}</td><td>${metrics.carbon.mean.toFixed(1)} ± ${metrics.carbon.sd.toFixed(1)}</td>
    <td>${((metrics.readyDepartures.mean / metrics.departures.mean) * 100).toFixed(1)}%</td><td>${metrics.unserved.mean.toFixed(2)}</td></tr>`
    )
    .join('');
  const profileRows = ['balanced', 'cloudy', 'outage']
    .map(
      (profile) =>
        `<tr><td>${profile}</td><td>${money(q.summary[profile].learned.objective.mean)} ± ${money(q.summary[profile].learned.objective.sd)}</td><td>${money(dqn.summary[profile].learned.objective.mean)} ± ${money(dqn.summary[profile].learned.objective.sd)}</td><td>${money(q.summary[profile].rule.objective.mean)}</td></tr>`
    )
    .join('');
  const seeds = q.runs
    .map(
      (run) =>
        `<tr><td>${run.seed}</td><td>${money(run.evaluations.balanced.learned.objective)}</td><td>${run.evaluations.balanced.learned.unserved.toFixed(2)} kWh</td><td>${run.seconds.toFixed(1)}s</td></tr>`
    )
    .join('');
  return (
    heading(
      'BENCHMARKS / HELD-OUT SCENARIOS',
      'Evidence across independent runs.',
      'Compare cost, emissions, readiness, and reliability. Every result below comes from a completed experiment.'
    ) +
    `<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Mixed-weather benchmark</h2><div class="panel-subtitle">10 held-out weeks per training seed · mean ± sample standard deviation across seeds</div></div><span class="pill">REPRODUCIBLE</span></div>
    <div class="table-scroll"><table class="action-table benchmark-table"><thead><tr><th>Controller</th><th>Objective / week</th><th>Grid CO₂ kg</th><th>EV ready</th><th>Unserved kWh</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="chart-caption">Synthetic scenarios. Q-learning and DQN have different training budgets; this is not a compute-matched algorithm ranking. Both observe the same six discrete buckets. ± describes training-seed variability, not a confidence interval.</div></section>
    <div class="micro-bottom report-grid"><section class="panel"><div class="panel-head"><h2 class="panel-title">Weather and outage generalization</h2></div>
    <div class="table-scroll"><table class="action-table"><thead><tr><th>Profile</th><th>Q-learning</th><th>DQN</th><th>Rule</th></tr></thead><tbody>${profileRows}</tbody></table></div></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">Q-learning seed variation</h2></div>
    <table class="action-table"><thead><tr><th>Seed</th><th>Objective</th><th>Unserved</th><th>Training + eval</th></tr></thead><tbody>${seeds}</tbody></table></section></div>
    <div class="info-strip neutral"><strong>Baseline losses remain visible.</strong><span>A larger neural network does not guarantee better control. The rule-based controller remains an important reference. Validation and test seeds are disjoint from training; final policies are evaluated without exploration.</span></div>`
  );
}

export function diagnosticsView() {
  if (!reports)
    return heading(
      'DIAGNOSTICS',
      'Reports unavailable.',
      'Generate the ablation report to inspect controlled comparisons.'
    );
  const x = micro.latest;
  const variants = reports.ablations.variants;
  const rows = variants
    .map((variant) => {
      const metrics = variant.summary.balanced.learned;
      return `<tr><td>${escapeHtml(variant.name)}</td><td>${money(metrics.objective.mean)} ± ${money(metrics.objective.sd)}</td><td>${metrics.carbon.mean.toFixed(1)}</td><td>${((metrics.readyDepartures.mean / metrics.departures.mean) * 100).toFixed(1)}%</td></tr>`;
    })
    .join('');
  const qValues = micro.model.q.slice(x.state * 9, x.state * 9 + 9);
  const best = microGreedy(micro.model.q, x.state);
  const actions = qValues
    .map(
      (value, action) =>
        `<tr class="${action === best ? 'selected-action' : ''}"><td>${['Charge', 'Idle', 'Discharge'][Math.floor(action / 3)]}</td><td>${['Off', 'Slow', 'Fast'][action % 3]}</td><td>${value.toFixed(3)}</td></tr>`
    )
    .join('');
  const severityRuns = reports.benchmark.variants[0].runs;
  const severity = [1, 3, 6].map((hours) => {
    const values = severityRuns.map((run) => run.severity[hours].unserved);
    return {
      x: hours,
      y: values.reduce((sum, value) => sum + value, 0) / values.length,
    };
  });
  return (
    heading(
      'POLICY DIAGNOSTICS / CONTROLLED EXPERIMENTS',
      'Understand the failure modes.',
      'Inspect joint action values and test the effects of reward weights, observation resolution, and outage duration.'
    ) +
    `<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Reward and observation ablations</h2><div class="panel-subtitle">${reports.ablations.protocol.trainingSeeds.length} seeds per variant · ${number(reports.ablations.protocol.episodes)} episodes · same test weeks and evaluation weights</div></div></div>
    <div class="table-scroll"><table class="action-table"><thead><tr><th>Training variant</th><th>Common objective</th><th>CO₂ kg</th><th>EV ready</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="chart-caption">Remove carbon cost, double the EV shortfall penalty, or replace the hour bucket with 15-minute time buckets. All policies are evaluated under the original reward weights. These are controlled comparisons, not hyperparameters selected using the test set.</div></section>
    <div class="micro-bottom report-grid"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Current policy / joint Q-values</h2><div class="panel-subtitle">State ${x.state} before the latest replay interval · greedy choice highlighted</div></div></div>
    <table class="action-table"><thead><tr><th>Battery</th><th>EV rate</th><th>Q-value</th></tr></thead><tbody>${actions}</tbody></table>
    <div class="chart-caption">Q-values estimate discounted return, not probability or confidence. Use Scenario replay to change the current state.</div></section>
    <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Outage severity stress test</h2><div class="panel-subtitle">Unserved household energy · mean across ${severityRuns.length} trained policies and 10 weeks</div></div></div>
    <div class="chart-wrap">${chart([{ color: '#168477', values: severity }], { xlabel: 'Outage hours per interruption', ylabel: 'Unserved energy (kWh / week)', minY: 0, height: 230 })}</div>
    <div class="chart-caption">Policies are frozen. Stress scenarios interrupt the grid twice per week, for 1, 3, or 6 hours.</div></section></div>`
  );
}
