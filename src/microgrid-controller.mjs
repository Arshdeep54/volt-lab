import { createRun } from './experiments/artifact.mjs';
import {
  saveRun,
  listRuns,
  getRun,
  deleteRun,
  importRun,
} from './experiments/store.mjs';
import {
  MicrogridEnv,
  generateMicrogrid,
  microGreedy,
  microRule,
} from './microgrid.mjs';
export const micro = {
  model: null,
  record: null,
  savedRuns: [],
  provenance: {},
  storageError: null,
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
export const clock = (x) =>
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
  micro.env = new MicrogridEnv(
    generateMicrogrid(micro.seed, micro.profile),
    micro.model.config
  );
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
    const metadata = document.querySelector('meta[name="volt-build"]')?.content;
    micro.provenance = metadata ? JSON.parse(metadata) : {};
    micro.record = createRun(micro.model, {
      ...micro.provenance,
      source: 'reference',
    });
    micro.model = micro.record.model;
    try {
      micro.savedRuns = await listRuns();
    } catch (error) {
      micro.storageError = error.message;
    }
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
  const now = Date.now(),
    elapsed = now - micro.lastTick;
  if (micro.running && elapsed >= micro.speed) {
    micro.lastTick = now - (elapsed % micro.speed);
    advance();
    render();
  }
}
export function microgridExport() {
  return {
    ...micro.record,
    project: 'Volt Lab microgrid',
    version: '0.3.0',
    provenance: 'Actual joint-action Q-learning; simulated 15-minute telemetry',
    exportedAt: new Date().toISOString(),
    config: micro.model.config,
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
export async function microgridAction(action, render, toast, basicBusy, runId) {
  if (action === 'micro-save') {
    try {
      await saveRun(micro.record);
      micro.savedRuns = await listRuns();
      render();
      toast('Experiment saved in this browser.');
    } catch (error) {
      toast('Could not save experiment: ' + error.message);
    }
    return;
  }
  if (action === 'micro-load' || action === 'micro-delete') {
    if (micro.worker) {
      toast('Finish training before changing saved experiments.');
      return;
    }
    try {
      if (action === 'micro-delete') await deleteRun(runId);
      else {
        micro.record = await getRun(runId);
        micro.model = micro.record.model;
        reset();
      }
      micro.savedRuns = await listRuns();
      render();
      toast(
        action === 'micro-load'
          ? 'Saved policy restored.'
          : 'Saved experiment removed.'
      );
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (action === 'micro-import') {
    document.querySelector('#import-run').click();
    return;
  }
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
    micro.worker.onmessage = async ({ data }) => {
      if (data.type === 'progress') {
        micro.training.episodes = data.point.episode;
        micro.training.curve.push(data.point);
        render();
      } else if (data.type === 'complete') {
        micro.record = createRun(data, micro.provenance);
        micro.model = micro.record.model;
        try {
          await saveRun(micro.record);
          micro.savedRuns = await listRuns();
        } catch (error) {
          micro.storageError = error.message;
        }
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

export async function microgridImport(file, render, toast) {
  if (micro.worker) {
    toast('Finish training before importing a policy.');
    return;
  }
  try {
    micro.record = await importRun(file);
    micro.model = micro.record.model;
    micro.savedRuns = await listRuns();
    reset();
    render();
    toast('Policy imported; scores recomputed on 30 held-out weeks.');
  } catch (error) {
    toast('Could not import experiment: ' + error.message);
  }
}
