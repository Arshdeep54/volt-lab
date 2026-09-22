import { select } from './ui/controls.mjs';
import { learningPanel } from './ui/microgrid-learning.mjs';
import { micro, clock } from './microgrid-controller.mjs';
export {
  micro,
  loadMicrogrid,
  microgridTick,
  microgridAction,
  microgridChange,
  microgridExport,
} from './microgrid-controller.mjs';
const batteryNames = ['Charge', 'Idle', 'Discharge'];
export function microgridView({ heading, scene, chart, money, number }) {
  if (micro.error)
    return heading(
      'MICROGRID / UNAVAILABLE',
      'Could not load the microgrid.',
      'Reload the page to load the reference model.'
    );
  const x = micro.latest,
    t = micro.env.totals,
    model = micro.model,
    train = micro.training,
    e = model.evaluations[micro.profile];
  let illustration = scene({ ...x, demand: x.home });
  illustration = illustration.replace(
    'Home energy flow: solar, house, grid, and battery',
    'Microgrid energy flow: solar, home, stationary battery, EV, and grid'
  );
  illustration = illustration.replace(
    '</svg>',
    '<g opacity="' +
      (x.evConnected ? 1 : 0.35) +
      '"><path d="M64 197L84 185 115 199 95 211Z" fill="#c9dbe0"/><path d="M64 197L95 211 95 222 64 208Z" fill="#7da2ad"/><path d="M95 211L115 199 115 211 95 222Z" fill="#a8c5cf"/><path d="M73 194L85 187 105 197 94 203Z" fill="#395e70"/><circle cx="73" cy="211" r="4" fill="#264453"/><circle cx="102" cy="216" r="4" fill="#264453"/><text x="88" y="241" text-anchor="middle" fill="var(--scene-muted)" font-size="9">EV / ' +
      (x.evConnected ? 'HOME' : 'AWAY') +
      '</text></g><path d="M175 179L152 190 118 208" stroke="#e8a341" stroke-width="2" fill="none" class="' +
      (x.evPower > 0 ? 'flow-line' : '') +
      '"/></svg>'
  );
  const meters = [
    ['Solar panels', x.solar.toFixed(2) + ' kW', 'Renewable generation'],
    [
      'Household',
      x.home.toFixed(2) + ' kW',
      x.unserved > 0 ? 'Demand partly unmet' : 'Essential demand served',
    ],
    [
      'Battery',
      (x.soc * 10).toFixed(0) + '%',
      batteryNames[x.batteryAction] +
        ' · ' +
        (x.charge + x.discharge).toFixed(2) +
        ' kW',
    ],
    [
      'Electric vehicle',
      ((x.evSoc / 40) * 100).toFixed(0) + '%',
      x.evConnected
        ? x.evPower.toFixed(2) + ' kW · target 80%'
        : 'Away · returns 18:00',
    ],
    [
      'Grid',
      x.grid.toFixed(2) + ' kW',
      x.gridAvailable ? 'Connected · 5 kW limit' : 'Outage · 0 kW available',
    ],
  ];
  const recent = micro.env.history.slice(-32);
  const powerChart = chart(
    [
      {
        color: '#e8a341',
        values: recent.map((r) => ({ x: r.index * 0.25, y: r.solar })),
      },
      {
        color: '#4e83b3',
        values: recent.map((r) => ({ x: r.index * 0.25, y: r.grid })),
      },
      {
        color: '#168477',
        values: recent.map((r) => ({ x: r.index * 0.25, y: r.evPower })),
      },
    ],
    {
      xlabel: 'Simulation hour since start',
      ylabel: 'Power (kW)',
      minY: 0,
      maxY: 6,
      height: 210,
    }
  );
  return (
    heading(
      'ADVANCED ENVIRONMENT / LIVE SIMULATION',
      'A whole home. More decisions.',
      'Solar, battery, EV charging, carbon, and outages. One agent coordinating nine joint actions.',
      '<button class="button quiet" data-action="micro-share">Share scenario ↗</button>' +
        (train
          ? '<button class="button quiet" data-action="micro-pause">' +
            (train.paused ? '▶ Resume training' : 'Ⅱ Pause training') +
            '</button>'
          : '') +
        '<button class="button" data-action="micro-train" ' +
        (train ? 'disabled' : '') +
        '>▶ Train joint policy</button>'
    ) +
    '<div class="micro-toolbar"><div class="micro-stream"><span class="status-dot"></span>' +
    (micro.running ? 'STREAMING' : 'PAUSED') +
    '<small>Simulated readings · 15-minute steps</small></div>' +
    select(
      'micro-profile',
      [
        ['balanced', 'Mixed sunshine'],
        ['cloudy', 'Cloudy week'],
        ['outage', 'Outage stress test'],
      ],
      micro.profile
    ) +
    select(
      'micro-controller',
      [
        ['learned', 'Learned policy'],
        ['rule', 'Rule-based'],
        ['noBattery', 'No battery + EV rules'],
      ],
      micro.controller
    ) +
    select(
      'micro-scenario',
      [
        [920000001, 'Scenario 1'],
        [920000002, 'Scenario 2'],
        [920000003, 'Scenario 3'],
      ],
      micro.seed
    ) +
    select(
      'micro-speed',
      [
        [2000, '0.5× · slow'],
        [1000, '1× · normal'],
        [500, '2× · fast'],
        [250, '4× · fastest'],
      ],
      micro.speed
    ) +
    '</div>' +
    '<div class="metrics">' +
    [
      ['Energy bill so far', money(t.bill), 'Actual grid purchases'],
      [
        'Grid emissions',
        t.carbon.toFixed(1) + ' kg',
        'Synthetic grid intensity',
      ],
      [
        'Unserved household',
        t.unserved.toFixed(2) + ' kWh',
        'Zero is the reliability goal',
      ],
      [
        'EV departures ready',
        t.readyDepartures + ' / ' + t.departures,
        '80% charge goal by 07:00',
      ],
    ]
      .map(
        ([label, value, foot]) =>
          '<article class="metric"><div class="metric-label">' +
          label +
          '</div><div class="metric-number">' +
          value +
          '</div><div class="metric-foot">' +
          foot +
          '</div></article>'
      )
      .join('') +
    '</div>' +
    '<div class="micro-layout"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Live microgrid</h2><div class="panel-subtitle">Latest completed interval · ' +
    clock(x) +
    '</div></div><span class="pill ' +
    (!x.gridAvailable ? 'amber' : '') +
    '">' +
    (x.gridAvailable ? 'GRID CONNECTED' : 'GRID OUTAGE') +
    '</span></div><div class="scene" data-hour="' +
    x.time +
    '"><div class="scene-time"><strong>' +
    String(x.hour).padStart(2, '0') +
    ':' +
    String(x.minute).padStart(2, '0') +
    '</strong><small>Day ' +
    (x.day + 1) +
    ' · ' +
    money(x.price) +
    ' / kWh</small></div><div class="scene-weather">' +
    (x.hour < 6 || x.hour >= 19
      ? 'Nighttime'
      : micro.profile === 'cloudy'
        ? 'Cloudy skies'
        : 'Variable sunshine') +
    '</div>' +
    illustration +
    '</div><div class="micro-meters">' +
    meters
      .map(
        ([label, value, foot]) =>
          '<div><span>' +
          label +
          '</span><b>' +
          value +
          '</b><small>' +
          foot +
          '</small></div>'
      )
      .join('') +
    '</div><div class="replay-controls"><button class="button" data-action="micro-play" ' +
    (train || micro.env.done ? 'disabled' : '') +
    '>' +
    (micro.running ? 'Ⅱ Pause live' : '▶ Start live') +
    '</button><button class="button quiet small" data-action="micro-step" ' +
    (train || micro.env.done ? 'disabled' : '') +
    '>Step 15 min</button><button class="button quiet small" data-action="micro-reset">↺ Restart</button><span class="tiny-label">' +
    micro.env.t +
    ' / 672 SAMPLES</span></div><div class="micro-events-shortcuts"><span>Show a moment</span><button data-action="micro-outage">Grid outage ↗</button><button data-action="micro-departure">EV departure ↗</button></div></section>' +
    '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Telemetry, as it happens</h2><div class="panel-subtitle">Rolling eight-hour window · generated by the simulator</div></div><span class="pill">LIVE DATA</span></div><div class="legend"><span><i class="sun"></i>Solar</span><span><i class="secondary"></i>Grid import</span><span><i></i>EV charging</span></div><div class="chart-wrap">' +
    powerChart +
    '</div><div class="micro-event-feed"><h3>Environment events</h3>' +
    micro.events
      .map(
        (event) =>
          '<div><time>' +
          event.time +
          '</time><span>' +
          event.message +
          '</span></div>'
      )
      .join('') +
    '</div></section></div>' +
    '<div class="micro-bottom">' +
    learningPanel(micro) +
    '<section class="panel"><div class="panel-head"><div><h2 class="panel-title">Cost, readiness, and resilience</h2><div class="panel-subtitle">Completed model · ' +
    micro.profile +
    ' profile · 10 held-out weeks</div></div></div><table class="action-table micro-evaluation"><thead><tr><th>Controller</th><th>Objective</th><th>CO₂ kg</th><th>EV ready</th></tr></thead><tbody>' +
    [
      ['learned', 'Q-learning'],
      ['rule', 'Rule-based'],
      ['noBattery', 'No battery'],
    ]
      .map(
        ([key, label]) =>
          '<tr><td>' +
          label +
          '</td><td>' +
          money(e[key].objective) +
          '</td><td>' +
          e[key].carbon.toFixed(1) +
          '</td><td>' +
          ((e[key].readyDepartures / e[key].departures) * 100).toFixed(1) +
          '%</td></tr>'
      )
      .join('') +
    '</tbody></table><div class="micro-result-details"><div><span>Learned policy / grid bill</span><b>' +
    money(e.learned.bill) +
    ' / week</b></div><div><span>Learned policy / unmet household</span><b>' +
    e.learned.unserved.toFixed(2) +
    ' kWh / week</b></div><div><span>Learned policy / EV shortfall</span><b>' +
    e.learned.shortfall.toFixed(2) +
    ' kWh / week</b></div></div><div class="chart-caption">Objective includes electricity, battery wear, carbon cost, missed charging goals, unmet household energy, and terminal energy settlement. The cheapest bill alone is not the objective.</div></section></div>' +
    '<section class="micro-loop"><span>Observe home + battery + EV + grid</span><b>→</b><span>Choose battery action × EV rate</span><b>→</b><span>Apply physics + deadlines</span><b>→</b><span>Reward → update Q-table</span></section><div class="info-strip neutral"><strong>Live simulation, clearly labeled.</strong><span>This is seeded simulated telemetry, not connected-device data. Each visitor runs their own simulation. Training and evaluation do not use future actual readings.</span></div>'
  );
}
