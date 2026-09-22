import { ACTIONS, rollout, stateIndex, greedyAction } from '../rl.mjs';
import { heading } from './layout.mjs';
import { chart } from './chart.mjs';
import { scene } from './scene.mjs';
import { money, number } from './format.mjs';

export function createBatteryViews({
  run,
  hour,
  playing,
  controller,
  weather,
  busy,
  paused,
  mode,
  benchmarks,
  benchmarkEpisodes,
  progress,
  chosenSeed,
  chosenEpisodes,
}) {
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
          '/ ' +
            number(busy && mode === 'train' ? chosenEpisodes : run.episodes),
          'Seed ' +
            run.seed +
            ' · ' +
            (busy && mode === 'train'
              ? 'training in browser'
              : 'completed run'),
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
    const data = replay().history.filter(
      (x) => x.day === Math.floor(hour / 24)
    );
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

  return { overview, training, results };
}
