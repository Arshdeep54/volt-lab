import { chart } from './chart.mjs';
import { escapeHtml, money, number } from './format.mjs';

const colors = ['#168477', '#4e83b3', '#b67b35'];

export function studyEvaluation(report) {
  const rows = report.variants
    .map((variant) => {
      const metrics = variant.summary.balanced.learned;
      const seconds =
        variant.runs.reduce((sum, run) => sum + run.trainingSeconds, 0) /
        variant.runs.length;
      return `<tr><td><b>${escapeHtml(variant.name)}</b></td><td>${number(variant.runs[0].timesteps)}</td><td>${seconds.toFixed(1)}s</td><td>${money(metrics.objective.mean)} ± ${money(metrics.objective.sd)}</td><td>${((100 * metrics.readyDepartures.mean) / metrics.departures.mean).toFixed(1)}%</td><td>${metrics.unserved.mean.toFixed(2)}</td></tr>`;
    })
    .join('');
  const legend = report.variants
    .map(
      (variant, index) =>
        `<span><i style="background:${colors[index]}"></i>${escapeHtml(variant.name)}</span>`
    )
    .join('');
  const profiles = [
    ['balanced', 'Mixed weather'],
    ['cloudy', 'Cloudy'],
    ['outage', 'Longer outages'],
  ]
    .map(
      ([profile, label]) =>
        `<tr><td>${label}</td>${report.variants.map((variant) => '<td>' + money(variant.summary[profile].learned.objective.mean) + ' ± ' + money(variant.summary[profile].learned.objective.sd) + '</td>').join('')}<td>${money(report.ruleFailureAnalysis[profile].objective)}</td></tr>`
    )
    .join('');
  const panels = [
    ['step', 'Environment transitions (×1,000)'],
    ['seconds', 'Elapsed training seconds'],
  ]
    .map(([axis, label]) => {
      const series = report.variants.map((variant, index) => ({
        color: colors[index],
        values: variant.curve.map((point) => ({
          x: axis === 'step' ? point.step / 1000 : point.seconds,
          y: point.objective.mean,
        })),
      }));
      return `<section class="panel"><div class="panel-head"><h2 class="panel-title">Learning versus ${axis === 'step' ? 'interactions' : 'time'}</h2></div><div class="legend">${legend}</div><div class="chart-wrap">${chart(series, { xlabel: label, ylabel: 'Validation objective ($ / week)', minY: 0, height: 250 })}</div><div class="chart-caption">Mean across three training seeds on separate validation weeks. Lower is better. Final policies are fixed by budget; these curves do not select a winner using the test set.</div></section>`;
    })
    .join('');
  return `<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Matched-transition observation study</h2><div class="panel-subtitle">Three seeds per variant · ${number(report.protocol.requestedSteps)} requested transitions · common physics and reward</div></div></div>
    <div class="table-scroll"><table class="action-table study-benchmark"><thead><tr><th>Agent / observation</th><th>Actual steps</th><th>Training time</th><th>Test objective / week</th><th>EV ready</th><th>Unserved kWh</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="chart-caption">Q-learning completes its last week, adding at most 671 transitions. Equal interactions do not mean equal computation. Timings exclude validation and depend on local workload; ± is training-seed standard deviation. The richer DQN adds exact charge, time until departure, and remaining horizon; no physics or reward changes.</div></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">Generalization across test profiles</h2></div><div class="table-scroll"><table class="action-table study-profiles"><thead><tr><th>Profile</th>${report.variants.map((variant) => '<th>' + escapeHtml(variant.name) + '</th>').join('')}<th>Rule-based</th></tr></thead><tbody>${profiles}</tbody></table></div><div class="chart-caption">Combined objective per week, lower is better. The richer DQN's mixed-weather improvement does not extend to cloudy conditions versus the heuristic. Every profile uses ten fixed test weeks.</div></section>
    <div class="micro-bottom report-grid study-curves">${panels}</div>`;
}

export function studyDiagnostics(report) {
  const entries = [
    [
      'Original Q-learning · five seeds',
      report.referenceFailureAnalysis.balanced,
    ],
    ['Rule-based', report.ruleFailureAnalysis.balanced],
    ...report.variants.map((variant) => [
      variant.name + ' · three seeds',
      variant.failureAnalysis.balanced,
    ]),
  ];
  const metric = (metrics, key) => metrics[key]?.mean ?? metrics[key];
  const rows = entries
    .map(
      ([name, metrics]) =>
        `<tr><td>${escapeHtml(name)}</td>${['bill', 'wear', 'carbonCost', 'reliabilityCost', 'deadlineCost', 'settlement', 'objective'].map((key) => '<td>' + money(metric(metrics, key)) + '</td>').join('')}</tr>`
    )
    .join('');
  const readiness = entries
    .map(
      ([name, metrics]) =>
        `<tr><td>${escapeHtml(name)}</td><td>${metric(metrics, 'evIdleHours').toFixed(1)} h</td><td>${((100 * metric(metrics, 'readyDepartures')) / metric(metrics, 'departures')).toFixed(1)}%</td><td>${metric(metrics, 'unserved').toFixed(2)} kWh</td></tr>`
    )
    .join('');
  return `<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Where the objective is lost</h2><div class="panel-subtitle">Mixed-weather held-out weeks · restored policies · common cost accounting</div></div></div>
    <div class="table-scroll"><table class="action-table cost-breakdown"><thead><tr><th>Controller</th><th>Electricity</th><th>Wear</th><th>Carbon cost</th><th>Unmet demand</th><th>EV shortfall</th><th>Settlement</th><th>Total / week</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="chart-caption">The six components sum to the objective before display rounding. Original Q-learning policies reproduce the published five-seed results; the new study uses three seeds and a smaller Q-learning budget. This is an accounting explanation, not proof that one observation feature caused a loss.</div></section>
    <section class="panel"><div class="panel-head"><h2 class="panel-title">Charging and reliability symptoms</h2></div><div class="table-scroll"><table class="action-table"><thead><tr><th>Controller</th><th>EV idle while below target</th><th>Departures ready</th><th>Unserved household</th></tr></thead><tbody>${readiness}</tbody></table></div>
    <div class="chart-caption">Idle hours count connected intervals with grid available, charge below target, and EV action off. Waiting can be rational under tariffs; this metric alone does not establish a policy error.</div></section>`;
}
