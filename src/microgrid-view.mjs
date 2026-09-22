import {
  MicrogridEnv,
  generateMicrogrid,
  microGreedy,
  microRule,
  MICRO_CONFIG,
} from './microgrid.mjs';
export const micro = {
  model: null,
  env: null,
  latest: null,
  running: false,
  profile: 'balanced',
  controller: 'learned',
  seed: 920000001,
  speed: 1000,
  lastTick: 0,
  events: [],
  training: null,
  worker: null,
  budget: 6000,
  trainSeed: 42,
  error: null,
};
const batteryNames = ['Charge', 'Idle', 'Discharge'];
const evNames = ['Off', 'Slow', 'Fast'];
const clock = (x) =>
  'D' +
  (x.day + 1) +
  ' / ' +
  String(x.hour).padStart(2, '0') +
  ':' +
  String(x.minute).padStart(2, '0');
function logEvent(x, message) {
  micro.events.unshift({ time: clock(x), message });
  micro.events = micro.events.slice(0, 6);
}
function advance() {
  const env = micro.env;
  if (env.done) {
    micro.running = false;
    return;
  }
  const rule = microRule(env),
    state = env.state;
  const action =
    micro.controller === 'learned'
      ? microGreedy(micro.model.q, state)
      : micro.controller === 'rule'
        ? rule
        : 3 + (rule % 3);
  const previous = micro.latest,
    x = env.step(action);
  x.state = state;
  micro.latest = x;
  if (previous && previous.gridAvailable !== x.gridAvailable)
    logEvent(
      x,
      x.gridAvailable
        ? 'Grid restored'
        : 'Grid outage · battery reserve matters'
    );
  if (previous && previous.evConnected !== x.evConnected)
    logEvent(
      x,
      x.evConnected
        ? 'EV arrived · charging goal 80% by 07:00'
        : 'EV away · returns at 18:00'
    );
  if (x.departure)
    logEvent(
      x,
      x.shortfall < 0.1
        ? 'Departure · EV charging goal met'
        : 'Departure · ' + x.shortfall.toFixed(1) + ' kWh below goal'
    );
  if (x.unserved > 0 && (!previous || previous.unserved === 0))
    logEvent(
      x,
      'Household energy unmet · ' + x.unserved.toFixed(2) + ' kWh this interval'
    );
  if (env.done) {
    micro.running = false;
    logEvent(x, 'Week complete · export the telemetry');
  }
}
function reset() {
  micro.running = false;
  micro.env = new MicrogridEnv(generateMicrogrid(micro.seed, micro.profile));
  micro.latest = null;
  micro.events = [];
  advance();
  logEvent(micro.latest, 'Simulation initialized · seeded 15-minute telemetry');
}
export async function loadMicrogrid() {
  try {
    const response = await fetch('/src/microgrid-reference.json');
    if (!response.ok) throw new Error('Microgrid reference model unavailable');
    micro.model = await response.json();
    const params = new URLSearchParams(location.search);
    if (['balanced', 'cloudy', 'outage'].includes(params.get('profile')))
      micro.profile = params.get('profile');
    if (['learned', 'rule', 'noBattery'].includes(params.get('controller')))
      micro.controller = params.get('controller');
    if (
      [920000001, 920000002, 920000003].includes(Number(params.get('scenario')))
    )
      micro.seed = Number(params.get('scenario'));
    reset();
  } catch (error) {
    micro.error = error.message;
  }
}
export function microgridTick(render) {
  const now = Date.now(), elapsed = now - micro.lastTick;
  if (micro.running && elapsed >= micro.speed) {
    micro.lastTick = now - (elapsed % micro.speed);
    advance();
    render();
  }
}
export function microgridExport() {
  return {
    project: 'Volt Lab microgrid',
    version: '0.2.0',
    provenance: 'Actual joint-action Q-learning; simulated 15-minute telemetry',
    exportedAt: new Date().toISOString(),
    config: MICRO_CONFIG,
    model: micro.model,
    training: micro.training,
    scenario: {
      seed: micro.seed,
      profile: micro.profile,
      controller: micro.controller,
    },
    totals: micro.env.totals,
    telemetry: micro.env.history,
  };
}
export async function microgridAction(action, render, toast, basicBusy) {
  if (action === 'micro-play') {
    micro.running = !micro.running;
    micro.lastTick = Date.now();
    render();
    return;
  }
  if (action === 'micro-step') {
    micro.running = false;
    advance();
    render();
    return;
  }
  if (action === 'micro-reset') {
    reset();
    render();
    return;
  }
  if (action === 'micro-outage' || action === 'micro-departure') {
    if (action === 'micro-outage') micro.profile = 'outage';
    reset();
    const target = action === 'micro-outage' ? 260 : 27;
    while (micro.latest.index < target) advance();
    render();
    toast('Advanced through every prior interval to this event.');
    return;
  }
  if (action === 'micro-share') {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('lab', 'microgrid');
    url.searchParams.set('profile', micro.profile);
    url.searchParams.set('controller', micro.controller);
    url.searchParams.set('scenario', micro.seed);
    try {
      await navigator.clipboard.writeText(url.href);
      toast('Scenario link copied. Friends load the reference policy.');
    } catch {
      toast('Share this scenario: ' + url.href);
    }
    return;
  }
  if (action === 'micro-pause') {
    micro.training.paused = !micro.training.paused;
    micro.worker.postMessage({
      type: micro.training.paused ? 'pause' : 'resume',
    });
    render();
    return;
  }
  if (action === 'micro-train') {
    if (basicBusy || micro.worker) {
      toast('Finish the current training run first.');
      return;
    }
    micro.running = false;
    micro.training = {
      episodes: 0,
      target: micro.budget,
      curve: [],
      paused: false,
    };
    micro.worker = new Worker('/src/microgrid-worker.mjs', { type: 'module' });
    micro.worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        micro.training.episodes = data.point.episode;
        micro.training.curve.push(data.point);
        render();
      } else if (data.type === 'complete') {
        micro.model = data;
        micro.worker.terminate();
        micro.worker = null;
        micro.training = null;
        reset();
        render();
        toast(
          'Joint policy trained and evaluated on 10 held-out weeks in three profiles.'
        );
      } else if (data.type === 'error') {
        micro.worker.terminate();
        micro.worker = null;
        micro.training = null;
        render();
        toast('Microgrid training failed: ' + data.message);
      }
    };
    micro.worker.onerror = (event) => {
      micro.worker.terminate();
      micro.worker = null;
      micro.training = null;
      render();
      toast('Microgrid worker failed: ' + event.message);
    };
    micro.worker.postMessage({
      type: 'train',
      seed: micro.trainSeed,
      episodes: micro.budget,
    });
    render();
  }
}
export function microgridChange(id, value, render) {
  if (id === 'micro-profile') micro.profile = value;
  if (id === 'micro-controller') micro.controller = value;
  if (id === 'micro-scenario') micro.seed = Number(value);
  if (id === 'micro-speed') {
    micro.speed = Number(value);
    micro.lastTick = Date.now();
  }
  if (id === 'micro-budget') micro.budget = Number(value);
  if (id === 'micro-train-seed') micro.trainSeed = Number(value);
  if (['micro-profile', 'micro-controller', 'micro-scenario'].includes(id))
    reset();
  render();
}
function select(id, values, current) {
  return (
    '<select id="' +
    id +
    '" class="select" ' +
    (micro.training && ['micro-budget', 'micro-train-seed'].includes(id)
      ? 'disabled'
      : '') +
    ' aria-label="' +
    id.replace('micro-', 'Microgrid ') +
    '">' +
    values
      .map(
        ([value, label]) =>
          '<option value="' +
          value +
          '" ' +
          (value === current ? 'selected' : '') +
          '>' +
          label +
          '</option>'
      )
      .join('') +
    '</select>'
  );
}
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
  const curve = train ? train.curve : model.curve;
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
    '<div class="micro-bottom"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Learning to coordinate the home</h2><div class="panel-subtitle">' +
    (train ? 'New training run' : 'Completed model') +
    ' · seed ' +
    (train ? micro.trainSeed : model.seed) +
    ' · ' +
    number(train ? train.episodes : model.episodes) +
    ' episodes</div></div><span class="pill">' +
    (train ? (train.paused ? 'PAUSED' : 'TRAINING') : 'Q-LEARNING') +
    '</span></div><div class="legend"><span><i></i>Training · 50-episode mean</span><span><i class="secondary"></i>Validation · 2 weeks</span></div><div class="chart-wrap">' +
    (curve.length
      ? chart(
          [
            {
              color: '#168477',
              values: curve.map((p) => ({ x: p.episode, y: p.reward })),
            },
            {
              color: '#4e83b3',
              values: curve.map((p) => ({ x: p.episode, y: p.validation })),
            },
          ],
          { ylabel: 'Objective return ($ / week)', height: 225 }
        )
      : '<p class="chart-caption">Collecting the first 50 training episodes…</p>') +
    '</div><div class="micro-experiment-controls"><label>Budget ' +
    select(
      'micro-budget',
      [
        [3000, '3,000 episodes'],
        [6000, '6,000 episodes'],
        [12000, '12,000 episodes'],
      ],
      micro.budget
    ) +
    '</label><label>Seed ' +
    select(
      'micro-train-seed',
      [
        [42, '42'],
        [43, '43'],
        [44, '44'],
      ],
      micro.trainSeed
    ) +
    '</label></div><div class="chart-caption">7,776 approximate states · 9 joint actions · 672 steps per week. Training runs in a Web Worker. Live simulation uses the last completed policy.</div></section>' +
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
