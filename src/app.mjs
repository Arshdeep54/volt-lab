import { micro, loadMicrogrid, microgridView, microgridTick, microgridAction, microgridChange, microgridExport } from './microgrid-view.mjs';
import { scenePalette, blendPalettes } from './scene-theme.mjs';
import {
  ACTIONS,
  CONFIG,
  QAgent,
  rollout,
  stateIndex,
  greedyAction,
} from './rl.mjs';
const $ = (s) => document.querySelector(s);
let reference,
  run,
  view = 'overview',
  hour = 12,
  playing = false,
  controller = 'learned',
  weather = 'mixed',
  worker = null,
  busy = false,
  paused = false,
  mode = 'train',
  benchmarks = [],
  benchmarkEpisodes = 1200,
  progress = 0;
let chosenSeed = 42,
  chosenEpisodes = 1200;
const money = (n) => '$' + n.toFixed(2);
const number = (n) => n.toLocaleString('en-US');
const labels = {
  overview: 'Environment',
  microgrid: 'Microgrid lab',
  training: 'Training lab',
  results: 'Evaluation',
  architecture: 'How it works',
  glossary: 'RL field guide',
};
const toast = (text) => {
  $('#toast').textContent = text;
  $('#toast').classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
};
function heading(eyebrow, title, description, actions = '') {
  return (
    '<div class="page-heading"><div><div class="eyebrow">' +
    eyebrow +
    '</div><h1>' +
    title +
    '</h1><p>' +
    description +
    '</p></div><div class="actions">' +
    actions +
    '</div></div>'
  );
}
function controls() {
  return (
    '<button class="button quiet" data-action="' +
    (busy ? 'pause' : 'reset') +
    '">' +
    (busy ? (paused ? '▶ Resume' : 'Ⅱ Pause') : '↺ Reset to reference') +
    '</button><button class="button" data-action="train" ' +
    (busy ? 'disabled' : '') +
    '>▶ Start training</button>'
  );
}
function replay() {
  return rollout(run.q, 900000001, weather, controller);
}
function stats() {
  const e = run.evaluation;
  const savings = e ? (1 - e.learned / e.noBattery) * 100 : 0;
  return (
    '<div class="metrics">' +
    [
      [
        'Training episodes',
        number(run.episodes),
        '/ ' + number(busy && mode === 'train' ? chosenEpisodes : run.episodes),
        'Seed ' +
          run.seed +
          ' · ' +
          (busy && mode === 'train' ? 'training in browser' : 'completed run'),
      ],
      [
        'Evaluation cost',
        e ? money(e.learned) : 'Pending',
        e ? '/ week' : '',
        e ? 'Mean of 20 held-out weeks' : 'Available when training finishes',
      ],
      [
        'Savings vs. no battery',
        e ? savings.toFixed(1) + '%' : 'Pending',
        '',
        'Includes wear + energy settlement',
      ],
      [
        'Exploration rate',
        ((run.curve.at(-1)?.epsilon ?? 1) * 100).toFixed(0) + '%',
        '',
        'ε-greedy · random actions during training',
      ],
    ]
      .map(
        ([label, value, unit, foot], i) =>
          '<article class="metric"><div class="metric-label">' +
          label +
          '<span>' +
          ['⌁', '↘', '↗', '◌'][i] +
          '</span></div><div class="metric-number">' +
          value +
          '<small>' +
          unit +
          '</small></div><div class="metric-foot ' +
          (i === 2 ? 'positive' : '') +
          '">' +
          foot +
          '</div></article>'
      )
      .join('') +
    '</div>'
  );
}
function chart(
  series,
  {
    width = 520,
    height = 224,
    xlabel = 'Training episode',
    ylabel = 'Return ($ / week)',
    minY,
    maxY,
  } = {}
) {
  const left = 54,
    right = 14,
    top = 20,
    bottom = 42,
    w = width - left - right,
    h = height - top - bottom;
  const values = series.flatMap((s) => s.values.map((v) => v.y));
  let lo = minY ?? Math.min(...values),
    hi = maxY ?? Math.max(...values);
  if (!Number.isFinite(lo)) {
    lo = -100;
    hi = 0;
  }
  if (hi === lo) hi = lo + 1;
  if (minY === undefined) {
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
  }
  const xs = series.flatMap((s) => s.values.map((v) => v.x));
  const xmin = xs.length ? Math.min(...xs) : 0,
    xmax = xs.length ? Math.max(Math.max(...xs), xmin + 1) : chosenEpisodes;
  const x = (v) => left + ((v - xmin) / (xmax - xmin || 1)) * w,
    y = (v) => top + ((hi - v) / (hi - lo)) * h;
  let svg =
    '<svg viewBox="0 0 ' +
    width +
    ' ' +
    height +
    '" role="img" aria-label="' +
    ylabel +
    ' by ' +
    xlabel +
    '"><title>' +
    ylabel +
    ' by ' +
    xlabel +
    '</title>';
  for (let i = 0; i < 4; i++) {
    const yy = top + (h * i) / 3;
    svg +=
      '<line x1="' +
      left +
      '" y1="' +
      yy +
      '" x2="' +
      (width - right) +
      '" y2="' +
      yy +
      '" stroke="#e6edef"/><text x="' +
      (left - 8) +
      '" y="' +
      (yy + 3) +
      '" text-anchor="end" fill="#81959c" font-size="9">' +
      (hi - ((hi - lo) * i) / 3).toFixed(0) +
      '</text>';
  }
  for (let i = 0; i < 5; i++) {
    const v = xmin + ((xmax - xmin) * i) / 4;
    svg +=
      '<text x="' +
      x(v) +
      '" y="' +
      (height - 23) +
      '" text-anchor="middle" fill="#81959c" font-size="9">' +
      Math.round(v) +
      '</text>';
  }
  for (const s of series) {
    if (s.values.length === 1) {
      svg += '<circle cx="' + x(s.values[0].x) + '" cy="' + y(s.values[0].y) + '" r="3" fill="' + s.color + '"/>';
    }
    const points = s.values.map((v) => x(v.x) + ',' + y(v.y)).join(' ');
    svg +=
      '<polyline points="' +
      points +
      '" fill="none" stroke="' +
      s.color +
      '" stroke-width="2" stroke-linejoin="round"/>';
  }
  return (
    svg +
    '<text x="' +
    (left + w / 2) +
    '" y="' +
    (height - 6) +
    '" text-anchor="middle" fill="#81959c" font-size="9">' +
    xlabel +
    '</text><text transform="translate(12,' +
    (top + h / 2) +
    ') rotate(-90)" text-anchor="middle" fill="#81959c" font-size="9">' +
    ylabel +
    '</text></svg>'
  );
}
function trainingChart(large = false) {
  const trainBusy = busy && mode === 'train';
  return (
    '<div class="panel"><div class="panel-head"><div><h2 class="panel-title">Learning to spend less</h2><div class="panel-subtitle">Higher return means lower weekly cost</div></div><span class="pill ' +
    (trainBusy ? 'amber' : '') +
    '">' +
    (trainBusy
      ? paused
        ? 'PAUSED'
        : 'TRAINING'
      : (run.provenance ? 'REFERENCE' : 'TRAINED') + ' / SEED ' + run.seed) +
    '</span></div><div class="legend"><span><i></i>Training · 25-episode mean</span><span><i class="secondary"></i>Validation · 3 fixed weeks</span></div><div class="chart-wrap">' +
    chart(
      [
        {
          color: '#168477',
          values: run.curve.map((p) => ({ x: p.episode, y: p.reward })),
        },
        {
          color: '#4e83b3',
          values: run.curve.map((p) => ({ x: p.episode, y: p.validation })),
        },
      ],
      { width: large ? 760 : 520, height: large ? 300 : 224 }
    ) +
    '</div><div class="chart-caption">Actual Q-learning output · synthetic scenarios · validation is separate from the final test set.</div><div class="training-status"><div><b><span class="status-dot"></span>' +
    (trainBusy
      ? paused
        ? 'Training paused'
        : 'Updating the Q-table'
      : 'Run complete. Ready to explore.') +
    '</b><small>' +
    number(run.episodes * 168) +
    ' environment steps · 792 discrete states · 3 actions</small></div><div class="mini-progress"><i style="width:' +
    (trainBusy ? progress : 100) +
    '%"></i></div></div>' +
    (large
      ? '<div class="training-detail"><div class="detail-stat"><span>Learning rate / α</span><strong>0.25</strong></div><div class="detail-stat"><span>Discount factor / γ</span><strong>0.97</strong></div><div class="detail-stat"><span>Mean |TD error| / last episode</span><strong>' +
        (run.curve.at(-1)?.error ?? 0).toFixed(3) +
        '</strong></div></div>'
      : '') +
    '</div>'
  );
}
function scene(x) {
  const celestialY = 48 + Math.abs(x.hour - 12) * 9;
  return (
    '<svg viewBox="0 0 550 265" role="img" aria-label="Home energy flow: solar, house, grid, and battery"><title>Home energy flow at ' +
    x.hour +
    ':00</title><defs><mask id="scene-moon"><rect width="550" height="265" fill="white"/><circle cx="449" cy="65" r="13" fill="black"/></mask><pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="var(--scene-dots)"/></pattern></defs><rect width="550" height="265" fill="url(#dots)"/><g class="scene-stars" fill="#e4f0f7"><circle cx="169" cy="48" r="1.2"/><circle cx="329" cy="35" r="1"/><circle cx="378" cy="69" r="1.5"/><circle cx="482" cy="103" r="1"/><circle cx="115" cy="79" r="1.4"/><circle cx="221" cy="29" r="1"/><circle cx="497" cy="43" r="1.3"/></g><ellipse cx="277" cy="213" rx="167" ry="28" fill="var(--scene-shadow)"/><path d="M121 167L276 93 425 164 273 240Z" fill="var(--scene-ground)" stroke="var(--scene-ground-line)"/><path d="M166 119L266 67 354 111 254 165Z" fill="#355764"/><path d="M166 119L254 165 254 214 166 168Z" fill="var(--scene-wall-shade)"/><path d="M254 165L354 111 354 162 254 214Z" fill="var(--scene-wall)" stroke="var(--scene-ground-line)"/><path d="M170 117L267 62 359 109 354 116 265 72 173 124Z" fill="#416571"/> <path d="M197 107L246 80 288 101 240 128Z" fill="#264a62" stroke="#769daa"/><path d="M205 103L247 125M218 96L260 118M232 88L274 110M209 113L258 87M224 121L273 94" stroke="#7296a8" stroke-width="1"/><path d="M181 137L205 150 205 174 181 161Z" fill="var(--scene-window)" stroke="#809faa"/><path d="M190 142L190 166M181 149L205 162" stroke="#c8dfe4"/><path d="M282 164L306 151 306 190 282 203Z" fill="#b9cdd1"/><path d="M318 144L339 132 339 153 318 165Z" fill="var(--scene-window)"/><path d="M328 138L328 159M318 154L339 143" stroke="#deebed"/> <path d="M387 154L413 140 432 149 406 164Z" fill="#d2e3de"/><path d="M387 154L406 164 406 205 387 195Z" fill="#98b7ae"/><path d="M406 164L432 149 432 190 406 205Z" fill="#e2eeea" stroke="#adc8bc"/><path d="M412 171L426 163 426 ' +
    (191 - x.soc * 2) +
    ' 412 ' +
    (199 - x.soc * 2) +
    'Z" fill="#168477"/><text x="419" y="220" text-anchor="middle" fill="var(--scene-muted)" font-size="9">BATTERY</text> <path d="M113 98V159M94 115H131M99 99H128M103 116L92 157M123 116L135 157M103 135H124" stroke="#8aa4af" stroke-width="3" fill="none"/><text x="109" y="179" text-anchor="middle" fill="var(--scene-muted)" font-size="9">GRID</text><path d="M116 155L155 177 175 166" stroke="#4e83b3" stroke-width="2" fill="none" class="' +
    (x.grid > 0 ? 'flow-line' : '') +
    '"/><path d="M350 173L373 185 393 175" stroke="#168477" stroke-width="2" fill="none" class="' +
    (x.charge + x.discharge > 0 ? 'flow-line' : '') +
    '"/> <g class="scene-sun" transform="translate(0,' +
    (celestialY - 71) +
    ')"><circle cx="440" cy="71" r="15" fill="#f2c568"/><path d="M440 48V42M440 94V100M417 71H411M463 71H469M423 54L418 49M457 88L462 93M457 54L462 49M423 88L418 93" stroke="#e6b451" stroke-width="2"/></g><g class="scene-moon"><circle cx="442" cy="71" r="15" fill="#d4e2e7" mask="url(#scene-moon)"/>' +
    '</g><path d="M138 210V179M129 190L138 172 147 190Z" fill="#91b3a1"/><path d="M369 215V197M360 203L369 186 378 203Z" fill="#91b3a1"/></svg>'
  );
}
function environmentPanel() {
  const r = replay(),
    x = r.history[hour];
  const phase =
    x.hour < 5 || x.hour >= 19
      ? 'night'
      : x.hour < 8
        ? 'dawn'
        : x.hour >= 17
          ? 'dusk'
          : 'day';
  return (
    '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Your energy environment</h2><div class="panel-subtitle">Watch the policy make one decision every hour</div></div><span class="pill">' +
    ACTIONS[x.action].toUpperCase() +
    '</span></div><div class="scene scene-' +
    phase +
    '"><div class="scene-time"><strong>' +
    String(x.hour).padStart(2, '0') +
    ':00</strong><small>Day ' +
    (x.day + 1) +
    ' of 7 · ' +
    money(x.price) +
    ' / kWh</small></div><div class="scene-weather">' +
    (phase === 'night'
      ? 'Nighttime'
      : weather === 'cloudy'
        ? 'Cloudy conditions'
        : weather === 'sunny'
          ? 'Clear conditions'
          : 'Variable sunshine') +
    '</div>' +
    scene(x) +
    '</div><div class="energy-chips"><div class="energy-chip">SOLAR GENERATION<b>' +
    x.solar.toFixed(2) +
    ' <small>kW</small></b></div><div class="energy-chip">HOUSE DEMAND<b>' +
    x.demand.toFixed(2) +
    ' <small>kW</small></b></div><div class="energy-chip">BATTERY CHARGE<b>' +
    (x.soc * 10).toFixed(0) +
    '<small>% / 10 kWh</small></b></div></div><div class="replay-controls"><button class="button quiet small" data-action="play" aria-label="' +
    (playing ? 'Pause replay' : 'Play replay') +
    '">' +
    (playing ? 'Ⅱ' : '▶') +
    '</button><button class="button quiet small" data-action="step" aria-label="Step one hour">→</button><input id="timeline" type="range" min="0" max="167" value="' +
    hour +
    '" aria-label="Replay hour"><label for="timeline">' +
    (hour + 1) +
    ' / 168</label><select id="controller" aria-label="Replay controller"><option value="learned" ' +
    (controller === 'learned' ? 'selected' : '') +
    '>Learned policy</option><option value="rule" ' +
    (controller === 'rule' ? 'selected' : '') +
    '>Rule-based</option><option value="noBattery" ' +
    (controller === 'noBattery' ? 'selected' : '') +
    '>No battery</option></select></div></section>'
  );
}
function energyChart() {
  const data = replay().history.filter((x) => x.day === Math.floor(hour / 24));
  return (
    '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">A day in the environment</h2><div class="panel-subtitle">Day ' +
    (Math.floor(hour / 24) + 1) +
    ' · hourly energy balance</div></div><select id="weather" class="select" aria-label="Replay weather">' +
    ['mixed', 'sunny', 'cloudy']
      .map(
        (x) =>
          '<option value="' +
          x +
          '" ' +
          (weather === x ? 'selected' : '') +
          '>' +
          x[0].toUpperCase() +
          x.slice(1) +
          '</option>'
      )
      .join('') +
    '</select></div><div class="legend"><span><i class="sun"></i>Solar generation</span><span><i class="secondary"></i>House demand</span><span><i></i>Grid import</span></div><div class="chart-wrap">' +
    chart(
      [
        {
          color: '#e8a341',
          values: data.map((x) => ({ x: x.hour, y: x.solar })),
        },
        {
          color: '#4e83b3',
          values: data.map((x) => ({ x: x.hour, y: x.demand })),
        },
        {
          color: '#168477',
          values: data.map((x) => ({ x: x.hour, y: x.grid })),
        },
      ],
      {
        xlabel: 'Hour of day',
        ylabel: 'Power (kW)',
        height: 190,
        minY: 0,
        maxY: 6,
      }
    ) +
    '</div><div class="chart-caption">Replay scenario 900000001 · each step lasts 1 hour. Weather changes this replay only.</div></section>'
  );
}
function decisions() {
  const data = replay()
    .history.slice(Math.max(0, hour - 3), hour + 1)
    .reverse();
  const x = data[0],
    state = stateIndex(x, x.previousSoc),
    best = greedyAction(run.q, state);
  return (
    '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Inside the agent’s decisions</h2><div class="panel-subtitle">Latest actions in the replay · reward includes battery wear</div></div><span class="tiny-label">ACTION LOG</span></div><table class="action-table"><thead><tr><th>DAY / HOUR</th><th>ACTION</th><th>SOC AFTER</th><th>REWARD ($)</th></tr></thead><tbody>' +
    data
      .map(
        (x) =>
          '<tr><td>D' +
          (x.day + 1) +
          ' / ' +
          String(x.hour).padStart(2, '0') +
          ':00</td><td><span class="action-tag ' +
          ACTIONS[x.action].toLowerCase() +
          '">' +
          ACTIONS[x.action] +
          '</span></td><td>' +
          x.soc.toFixed(1) +
          ' kWh</td><td>' +
          x.reward.toFixed(3) +
          '</td></tr>'
      )
      .join('') +
    '</tbody></table><div class="q-inspector"><span>LEARNED Q-VALUES · STATE ' +
    state +
    ' · BEFORE THIS STEP</span><div class="q-values">' +
    ACTIONS.map(
      (a, i) =>
        '<div class="' +
        (i === best ? 'chosen' : '') +
        '">' +
        a +
        (i === best ? ' · best' : '') +
        '<b>' +
        run.q[state * 3 + i].toFixed(2) +
        '</b></div>'
    ).join('') +
    '</div></div><div class="chart-caption">Q-values estimate discounted return, not confidence. Evaluation uses ε = 0. Actions are clipped to physical limits.</div></section>'
  );
}
function overview() {
  return (
    heading(
      'THE ENERGY CONTROL ROOM',
      'Small decisions. Smarter energy.',
      'See an agent learn when to store energy, use it, and wait.',
      controls()
    ) +
    stats() +
    '<div class="main-grid">' +
    environmentPanel() +
    trainingChart() +
    '</div><div class="bottom-grid">' +
    energyChart() +
    decisions() +
    '</div><div class="info-strip"><strong>Why reinforcement learning?</strong><span>Charging now changes what’s possible later. The agent learns the value of those future choices.</span><button data-view="architecture">Follow the learning loop ↗</button></div>'
  );
}
function training() {
  return (
    heading(
      'EXPERIMENTS / Q-LEARNING',
      'Give the agent room to learn.',
      'Train an actual policy in a background worker. Watch exploration turn into decisions.',
      controls()
    ) +
    '<div class="training-layout"><section class="panel form-panel"><h2 class="panel-title">Experiment settings</h2><div><label for="seed">Training seed</label><select id="seed" class="select" ' +
    (busy ? 'disabled' : '') +
    '>' +
    [42, 43, 44, 45, 46]
      .map(
        (s) =>
          '<option ' +
          (s === chosenSeed ? 'selected' : '') +
          '>' +
          s +
          '</option>'
      )
      .join('') +
    '</select></div><div><label for="episodes">Training budget</label><select id="episodes" class="select" ' +
    (busy ? 'disabled' : '') +
    '>' +
    [1200, 4000, 10000]
      .map(
        (s) =>
          '<option value="' +
          s +
          '" ' +
          (s === chosenEpisodes ? 'selected' : '') +
          '>' +
          number(s) +
          ' episodes</option>'
      )
      .join('') +
    '</select></div><div class="formula">Q(s,a) ← Q(s,a) + α<br>× [r + γ max Q(s′,a′) − Q(s,a)]</div><p class="form-note">Exploration starts at 100% and decays to 5% over the first 75% of training. Rewards include grid cost, battery wear, and end-of-week energy settlement.</p><button class="button" data-action="train" ' +
    (busy ? 'disabled' : '') +
    '>▶ Train this experiment</button></section>' +
    trainingChart(true) +
    '</div><div class="info-strip neutral"><strong>Training ≠ evaluation.</strong><span>Training uses random actions to discover useful behavior. Validation uses a greedy policy on three separate weeks. The final evaluation uses 20 additional weeks.</span></div>'
  );
}
function results() {
  if (!run.evaluation)
    return (
      heading(
        'EVALUATION / PENDING',
        'Let the experiment finish.',
        'Final evaluation runs on 20 held-out weeks after training completes.',
        controls()
      ) +
      stats() +
      trainingChart(true)
    );
  const e = run.evaluation,
    max = Math.max(e.learned, e.rule, e.noBattery);
  const diff = (1 - e.learned / e.rule) * 100;
  return (
    heading(
      'BENCHMARK / HELD-OUT SCENARIOS',
      'Does the learned policy hold up?',
      'Compare controllers on exactly the same 20 simulated weeks. Lower cost is better.',
      (busy && mode === 'benchmark'
        ? '<button class="button quiet" data-action="pause">' +
          (paused ? '▶ Resume' : 'Ⅱ Pause') +
          '</button>'
        : '') +
        '<button class="button" data-action="benchmark" ' +
        (busy ? 'disabled' : '') +
        '>' +
        (busy && mode === 'benchmark'
          ? 'Running five seeds…'
          : 'Run five-seed benchmark') +
        '</button>'
    ) +
    stats() +
    '<div class="result-grid"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Weekly cost by controller</h2><div class="panel-subtitle">Mean objective cost · USD / week · 20 test scenarios</div></div><span class="pill">SEED ' +
    run.seed +
    '</span></div><div class="bar-list">' +
    [
      ['noBattery', 'No battery', '#a6b8c1'],
      ['rule', 'Rule-based', '#4e83b3'],
      ['learned', 'Q-learning', '#168477'],
    ]
      .map(
        ([key, label, color]) =>
          '<div class="bar-row"><span>' +
          label +
          '</span><div class="bar-track"><i style="width:' +
          (e[key] / max) * 100 +
          '%;background:' +
          color +
          '"></i></div><b>' +
          money(e[key]) +
          '</b></div>'
      )
      .join('') +
    '</div><div class="result-note"><strong>' +
    (diff >= 0
      ? 'The learned policy beats the rule-based controller.'
      : 'The rule-based controller currently wins.') +
    '</strong> ' +
    (diff >= 0
      ? 'The agent costs ' + diff.toFixed(1) + '% less.'
      : 'The agent costs ' +
        Math.abs(diff).toFixed(1) +
        '% more. That’s a useful result: a learned controller needs to earn its complexity.') +
    ' Both battery controllers use identical physics and energy settlement.</div></section><section class="panel"><div class="panel-head"><h2 class="panel-title">An evaluation you can explain</h2></div><ol class="method-list"><li><span class="number">01</span><div><strong>Separate the scenarios</strong><p>Training, validation, and test seeds never overlap in this demo.</p></div></li><li><span class="number">02</span><div><strong>Keep the comparison fair</strong><p>Same demand, solar, tariff, initial charge, wear costs, and terminal settlement.</p></div></li><li><span class="number">03</span><div><strong>Look beyond one lucky run</strong><p>Train five independent agents. Report the mean and standard deviation across seeds.</p></div></li></ol></section></div>' +
    benchmarkTable() +
    '<div class="info-strip neutral"><strong>Scope of these results</strong><span>These are synthetic time-of-use tariffs and demand profiles. This MVP has no real-world energy validation, export revenue, or demand forecasts.</span></div>'
  );
}
function benchmarkTable() {
  if (!benchmarks.length)
    return (
      '<div class="info-strip"><strong>' +
      (busy && mode === 'benchmark'
        ? 'Benchmark in progress'
        : 'Test reproducibility') +
      '</strong><span>' +
      (busy && mode === 'benchmark'
        ? 'Training seed ' +
          run.benchmarkSeed +
          ' · ' +
          progress.toFixed(0) +
          '% through its budget.'
        : 'Run the five-seed benchmark to measure variation between independent training runs.') +
      '</span></div>'
    );
  const mean =
    benchmarks.reduce((a, b) => a + b.learned, 0) / benchmarks.length;
  const sd = Math.sqrt(
    benchmarks.reduce((a, b) => a + (b.learned - mean) ** 2, 0) /
      (benchmarks.length - 1)
  );
  return (
    '<section class="panel" style="margin-top:22px"><div class="panel-head"><div><h2 class="panel-title">Five independent training runs</h2><div class="panel-subtitle">' +
    number(benchmarkEpisodes) +
    ' episodes per seed · same 20 held-out test weeks</div></div><span class="pill">' +
    money(mean) +
    ' ± ' +
    money(sd) +
    ' / WEEK</span></div><table class="action-table"><thead><tr><th>TRAINING SEED</th><th>Q-LEARNING</th><th>RULE-BASED</th><th>NO BATTERY</th></tr></thead><tbody>' +
    benchmarks
      .map(
        (x) =>
          '<tr><td>' +
          x.seed +
          '</td><td>' +
          money(x.learned) +
          '</td><td>' +
          money(x.rule) +
          '</td><td>' +
          money(x.noBattery) +
          '</td></tr>'
      )
      .join('') +
    '</tbody></table><div class="chart-caption" style="padding-top:12px">± sample standard deviation across the five training seeds; not a confidence interval.</div></section>'
  );
}
function architecture() {
  return (
    heading(
      'A WALK THROUGH THE SYSTEM',
      'The loop behind every decision.',
      'A real simulator. A learning agent. A feedback loop you can inspect.'
    ) +
    '<section class="panel architecture"><div class="flow-top"><article class="flow-node"><div class="eyebrow">ENVIRONMENT / BATTERYENV</div><h2>The simulated home</h2><p>Demand + solar + electricity price<br>Battery capacity: 10 kWh<br>Actions advance time by 1 hour.</p></article><div class="flow-arrow">→</div><article class="flow-node"><div class="eyebrow">OBSERVATION → STATE</div><h2>What the agent sees</h2><p>Hour of day × battery charge bucket × net demand bucket = 792 states.<br>No future actual values are exposed.</p></article><div class="flow-arrow">→</div><article class="flow-node highlight"><div class="eyebrow">AGENT / Q-TABLE</div><h2>Choose an action</h2><p>Charge, idle, or discharge.<br>Explore with probability ε.<br>Otherwise choose the highest Q-value.</p></article></div><div class="flow-return">← Apply action → enforce physical limits → calculate reward + next state → update Q(s,a) → repeat for 168 hours ↺</div><div class="flow-bottom"><article><h3>What gets learned?</h3><p>A <span class="keyword">Q-value</span> estimates the discounted future return of taking an action in a state. The <span class="keyword">Bellman update</span> adjusts that estimate using the reward and best next-state value. Terminal transitions do not bootstrap.</p></article><article><h3>What creates the reward?</h3><p><span class="keyword">r = −(grid bill + wear + settlement)</span><br>Charge/discharge limits and efficiency are enforced directly in the simulator. End-of-week settlement values remaining battery energy relative to its starting charge.</p></article><article><h3>How training reaches the dashboard</h3><p>A browser <span class="keyword">Web Worker</span> runs the simulator and Q-learning off the main thread. Every 25 episodes it sends a Q-table snapshot, training mean, validation return, and exploration rate to the UI.</p></article><article><h3>How we check the result</h3><p>Freeze exploration at zero. Run the learned policy, a rule-based controller, and no battery on the same held-out weeks. Repeat training across five seeds to measure variability.</p></article></div></section><div class="info-strip neutral"><strong>Deliberately small.</strong><span>Tabular Q-learning has no neural network or backpropagation. A later version can keep this simulator and add a Gymnasium adapter with DQN or SAC.</span></div>'
  );
}
const terms = [
  [
    'Environment',
    'The system the agent interacts with. It defines observations, actions, transitions, and rewards.',
    'Here: the house, grid, solar panels, and battery.',
  ],
  [
    'Agent',
    'The decision maker that learns from its interactions with the environment.',
    'Here: the Q-learning controller.',
  ],
  [
    'Observation',
    'Information available to the agent at the current step. It should not leak future outcomes.',
    'Here: current time, charge, and net demand.',
  ],
  [
    'State',
    'A representation used to make decisions. In an ideal Markov state, it contains everything needed to predict the next transition.',
    'Here: 792 discrete states; an approximation because weather has hidden variation.',
  ],
  [
    'Action',
    'A choice the agent can make in the environment.',
    'Charge (0), idle (1), or discharge (2).',
  ],
  [
    'Reward',
    'Immediate numerical feedback after taking an action. It expresses the objective.',
    'Negative electricity cost, battery wear, and terminal settlement.',
  ],
  [
    'Return',
    'The sum of rewards over a trajectory; the learning objective may discount future rewards.',
    'Plots show undiscounted weekly return; Q-learning uses γ = 0.97.',
  ],
  [
    'Policy',
    'The rule that maps a state or observation to an action.',
    'Greedy evaluation chooses the largest learned Q-value.',
  ],
  [
    'Episode',
    'One complete interaction sequence, ending at a defined terminal condition.',
    'One episode is seven days, or 168 hourly steps.',
  ],
  [
    'Transition',
    'One experience tuple: state, action, reward, next state, and whether the episode ended.',
    'A charge decision changes SOC and returns a cost.',
  ],
  [
    'Q-value',
    'An estimate of discounted future return for taking an action in a state and then following the policy.',
    'Each of the 792 states has three learned action values.',
  ],
  [
    'Q-learning',
    'An off-policy temporal-difference algorithm that learns action values from transitions.',
    'This MVP updates a table, rather than a neural network.',
  ],
  [
    'Exploration / exploitation',
    'Exploration tries actions to learn; exploitation uses the current best estimate.',
    'ε decays from 1.00 to 0.05 during training.',
  ],
  [
    'Learning rate / α',
    'Controls how much each new experience changes the current value estimate.',
    'α = 0.25 in this MVP.',
  ],
  [
    'Discount factor / γ',
    'Controls how much future rewards count relative to immediate rewards.',
    'γ = 0.97 encourages planning beyond the current hour.',
  ],
  [
    'TD error',
    'The difference between the current value estimate and a reward-plus-next-value target.',
    'δ = r + γ max Q(s′,a′) − Q(s,a), except at terminal steps.',
  ],
  [
    'Baseline',
    'A reference controller used to judge whether learning adds value.',
    'No battery and a tariff-aware rule-based controller.',
  ],
  [
    'Random seed',
    'A value that makes randomized scenarios and training choices reproducible.',
    'Training seeds 42–46; evaluation uses separate fixed seeds.',
  ],
  [
    'Generalization',
    'Whether a learned policy works on scenarios it did not train on.',
    'Evaluate on 20 held-out weeks, plus inspect cloudy replay conditions.',
  ],
  [
    'Reward hacking',
    'Behavior that maximizes the written reward while missing the intended goal.',
    'Physical limits prevent impossible energy; terminal settlement discourages free initial energy.',
  ],
  [
    'Bellman equation',
    'Relates the value of a state or action to immediate reward and future value. Q-learning uses a sampled version of this relationship.',
    'Target: r + γ max Q(s′,a′), or just r at episode end.',
  ],
  [
    'Off-policy learning',
    'Learns about a target policy using experience collected by a different behavior policy.',
    'Q-learning learns greedy action values from ε-greedy exploration.',
  ],
  [
    'On-policy learning',
    'Learns about the policy currently collecting experience.',
    'A contrast to this MVP; methods such as SARSA use the next action actually selected.',
  ],
  [
    'Markov decision process / MDP',
    'A model described by states, actions, transition probabilities, rewards, and a discount factor.',
    'Our discrete observation is approximate: it omits day index and hidden weather variation.',
  ],
  [
    'Function approximation',
    'Represents values or a policy with a parameterized function rather than storing every state in a table.',
    'DQN would use a neural network in place of our 2,376 table entries.',
  ],
  [
    'Replay buffer',
    'Stores past transitions so an algorithm can sample and reuse experience.',
    'Common in DQN and SAC; this online tabular agent has no replay buffer.',
  ],
  [
    'PPO',
    'Proximal policy optimization: a policy-gradient method that limits the scale of policy updates.',
    'Another possible future comparison; not implemented in this MVP.',
  ],
  [
    'DQN',
    'Deep Q-network: approximates Q-values with a neural network instead of a table, commonly using replay and target networks.',
    'A future extension; this MVP does not implement DQN.',
  ],
  [
    'SAC',
    'Soft actor-critic: an off-policy actor-critic method often used for continuous control.',
    'A future extension for continuous battery power decisions.',
  ],
];
function glossary() {
  return (
    heading(
      'YOUR RL FIELD GUIDE',
      'Learn the language of the loop.',
      'The concepts you’ll need to explain this project in a demo or an interview.',
      '<input class="glossary-search" id="search" type="search" placeholder="Find a concept…" aria-label="Search RL concepts">'
    ) +
    '<div class="glossary-grid" id="terms">' +
    termCards('') +
    '</div>'
  );
}
function termCards(query) {
  const found = terms.filter((t) =>
    t.join(' ').toLowerCase().includes(query.toLowerCase())
  );
  return found.length
    ? found
        .map(
          ([name, description, example], i) =>
            '<article class="glossary-card"><span class="tiny-label">RL / ' +
            String(i + 1).padStart(2, '0') +
            '</span><h2>' +
            name +
            '</h2><p>' +
            description +
            '</p><div class="example">' +
            example +
            '</div></article>'
        )
        .join('')
    : '<p class="subtext">No matching concepts. Try “reward” or “policy”.</p>';
}
let displayedPalette = null;
let sceneFrame = 0;
function animateScene() {
  cancelAnimationFrame(sceneFrame);
  const node = $('.scene');
  if (!node) { displayedPalette = null; return; }
  const target = scenePalette(Number(node.dataset.hour ?? hour % 24));
  const from = displayedPalette || target;
  const paint = palette => {
    displayedPalette = palette;
    for (const [key, value] of Object.entries(palette)) node.style.setProperty(key, value);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { paint(target); return; }
  paint(from);
  const started = performance.now();
  const frame = now => {
    const progress = Math.min(1, (now - started) / 700);
    paint(blendPalettes(from, target, progress * progress * (3 - 2 * progress)));
    if (progress < 1) sceneFrame = requestAnimationFrame(frame);
  };
  sceneFrame = requestAnimationFrame(frame);
}
function render() {
  const focus = document.activeElement;
  const selector = focus?.id
    ? '#' + focus.id
    : focus?.dataset.action
      ? '[data-action="' + focus.dataset.action + '"]'
      : null;
  $('#main').innerHTML = {
    overview,
    microgrid: () => microgridView({heading,scene,chart,money,number}),
    training,
    results,
    architecture,
    glossary,
  }[view]();
  animateScene();
  $('#breadcrumb').textContent = labels[view];
  document
    .querySelectorAll('.nav-item')
    .forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (selector)
    document.querySelector(selector)?.focus({ preventScroll: true });
}
function changeView(next) {
  view = next;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function start(type = 'train') {
  if (busy || micro.worker) { toast('Finish the current training run first.'); return; }
  playing = false;
  busy = true;
  paused = false;
  mode = type;
  progress = 0;
  worker = new Worker('/src/worker.mjs', { type: 'module' });
  if (type === 'train') {
    run = {
      ...run,
      q: Array.from(new QAgent(chosenSeed).q),
      curve: [],
      seed: chosenSeed,
      episodes: 0,
      evaluation: null,
    };
    view = 'training';
  } else {
    benchmarks = [];
    view = 'results';
    run.benchmarkSeed = 42;
  }
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      progress = (data.point.episode / chosenEpisodes) * 100;
      if (data.mode === 'train') {
        run.q = data.q;
        run.curve.push(data.point);
        run.episodes = data.point.episode;
      } else run.benchmarkSeed = data.seed;
      render();
    } else if (data.type === 'complete') {
      run = { ...data };
      busy = false;
      paused = false;
      worker.terminate();
      worker = null;
      render();
      toast('Training complete. Evaluation uses 20 held-out weeks.');
    } else if (data.type === 'benchmarkComplete') {
      benchmarks = data.runs;
      benchmarkEpisodes = data.episodes;
      busy = false;
      worker.terminate();
      worker = null;
      render();
      toast('Five-seed benchmark complete.');
    } else if (data.type === 'error') {
      busy = false;
      worker.terminate();
      worker = null;
      render();
      toast('Training failed: ' + data.message);
    }
  };
  worker.onerror = (event) => {
    busy = false;
    worker?.terminate();
    worker = null;
    render();
    toast('Worker failed: ' + event.message);
  };
  worker.postMessage({ type, seed: chosenSeed, episodes: chosenEpisodes });
  render();
}
function exportRun() {
  const artifact = view === 'microgrid' ? microgridExport() : {
    project: 'Volt Lab',
    version: '0.1.0',
    provenance:
      'Actual tabular Q-learning; synthetic hourly energy environment',
    exportedAt: new Date().toISOString(),
    status: busy ? 'in-progress' : 'complete',
    config: CONFIG,
    algorithm: {
      name: 'Q-learning',
      alpha: 0.25,
      gamma: 0.97,
      epsilonFloor: 0.05,
    },
    run,
    benchmarks,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = view === 'microgrid' ? 'volt-lab-microgrid.json' : 'volt-lab-seed-' + run.seed + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Experiment exported with metrics, settings, and Q-table.');
}
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-view],[data-action],#export');
  if (!target) return;
  if (target.dataset.view) {
    changeView(target.dataset.view);
    return;
  }
  if (target.id === 'export') {
    exportRun();
    return;
  }
  if (target.dataset.action?.startsWith('micro-')) { microgridAction(target.dataset.action,render,toast,busy); return; }
  switch (target.dataset.action) {
    case 'train':
      start();
      break;
    case 'benchmark':
      start('benchmark');
      break;
    case 'pause':
      paused = !paused;
      worker?.postMessage({ type: paused ? 'pause' : 'resume' });
      render();
      break;
    case 'reset':
      run = structuredClone(reference);
      chosenEpisodes = 1200;
      chosenSeed = 42;
      benchmarks = [];
      render();
      toast('Restored the reproducible reference run.');
      break;
    case 'play':
      playing = !playing;
      render();
      break;
    case 'step':
      hour = (hour + 1) % 168;
      render();
      break;
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'search')
    $('#terms').innerHTML = termCards(e.target.value);
});
document.addEventListener('change', (e) => {
  if (e.target.id.startsWith('micro-')) { microgridChange(e.target.id,e.target.value,render); return; }
  if (e.target.id === 'timeline') {
    hour = Number(e.target.value);
    render();
  }
  if (e.target.id === 'seed') chosenSeed = Number(e.target.value);
  if (e.target.id === 'episodes') chosenEpisodes = Number(e.target.value);
  if (e.target.id === 'controller') {
    controller = e.target.value;
    render();
  }
  if (e.target.id === 'weather') {
    weather = e.target.value;
    render();
  }
});
setInterval(() => {
  if (playing && view === 'overview') {
    hour = (hour + 1) % 168;
    render();
  }
}, 850);
setInterval(() => { if (view === 'microgrid') microgridTick(render); },100);
try {
  const response = await fetch('/src/reference.json');
  if (!response.ok) throw new Error('Reference run unavailable');
  reference = await response.json();
  run = structuredClone(reference);
  await loadMicrogrid();
  if (new URLSearchParams(location.search).get('lab') === 'microgrid') view = 'microgrid';
  render();
} catch (error) {
  $('#main').innerHTML =
    '<div class="panel form-panel"><h1>Could not load Volt Lab</h1><p>Start the project with npm start and reload this page.</p></div>';
  toast(error.message);
}
