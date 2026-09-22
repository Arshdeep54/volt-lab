import {
  micro,
  loadMicrogrid,
  microgridView,
  microgridTick,
  microgridAction,
  microgridChange,
  microgridExport,
} from './microgrid-view.mjs';
import { heading } from './ui/layout.mjs';
import { chart } from './ui/chart.mjs';
import { scene } from './ui/scene.mjs';
import { animateScene } from './ui/scene-animation.mjs';
import { money, number } from './ui/format.mjs';
import { createBatteryViews } from './ui/battery-views.mjs';
import { architecture, glossary, termCards } from './ui/help.mjs';
import { CONFIG, QAgent } from './rl.mjs';
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
function render() {
  const focus = document.activeElement;
  const selector = focus?.id
    ? '#' + focus.id
    : focus?.dataset.action
      ? '[data-action="' + focus.dataset.action + '"]'
      : null;
  const { overview, training, results } = createBatteryViews({
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
  });
  $('#main').innerHTML = {
    overview,
    microgrid: () => microgridView({ heading, scene, chart, money, number }),
    training,
    results,
    architecture,
    glossary,
  }[view]();
  animateScene(hour);
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
  if (busy || micro.worker) {
    toast('Finish the current training run first.');
    return;
  }
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
  const artifact =
    view === 'microgrid'
      ? microgridExport()
      : {
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
  a.download =
    view === 'microgrid'
      ? 'volt-lab-microgrid.json'
      : 'volt-lab-seed-' + run.seed + '.json';
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
  if (target.dataset.action?.startsWith('micro-')) {
    microgridAction(target.dataset.action, render, toast, busy);
    return;
  }
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
  if (e.target.id.startsWith('micro-')) {
    microgridChange(e.target.id, e.target.value, render);
    return;
  }
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
setInterval(() => {
  if (view === 'microgrid') microgridTick(render);
}, 100);
try {
  const response = await fetch('/src/reference.json');
  if (!response.ok) throw new Error('Reference run unavailable');
  reference = await response.json();
  run = structuredClone(reference);
  await loadMicrogrid();
  if (new URLSearchParams(location.search).get('lab') === 'microgrid')
    view = 'microgrid';
  render();
} catch (error) {
  $('#main').innerHTML =
    '<div class="panel form-panel"><h1>Could not load Volt Lab</h1><p>Start the project with npm start and reload this page.</p></div>';
  toast(error.message);
}
