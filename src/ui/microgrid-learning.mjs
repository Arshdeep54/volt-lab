import { chart } from './chart.mjs';
import { select } from './controls.mjs';
import { number } from './format.mjs';

export function learningPanel(micro) {
  const model = micro.model,
    training = micro.training,
    curve = training ? training.curve : model.curve;
  const graph = curve.length
    ? chart(
        [
          {
            color: '#168477',
            values: curve.map((point) => ({
              x: point.episode,
              y: point.reward,
            })),
          },
          {
            color: '#4e83b3',
            values: curve.map((point) => ({
              x: point.episode,
              y: point.validation,
            })),
          },
        ],
        { ylabel: 'Objective return ($ / week)', height: 225 }
      )
    : '<p class="chart-caption">Collecting the first 50 training episodes…</p>';
  return `<section class="panel">
    <div class="panel-head"><div><h2 class="panel-title">Learning to coordinate the home</h2>
    <div class="panel-subtitle">${training ? 'New training run' : 'Completed model'} · seed ${training ? micro.trainSeed : model.seed} · ${number(training ? training.episodes : model.episodes)} episodes</div></div>
    <span class="pill">${training ? (training.paused ? 'PAUSED' : 'TRAINING') : 'Q-LEARNING'}</span></div>
    <div class="legend"><span><i></i>Training · 50-episode mean</span><span><i class="secondary"></i>Validation · 2 weeks</span></div>
    <div class="chart-wrap">${graph}</div>
    <div class="micro-experiment-controls">
      <label>Budget ${select(
        'micro-budget',
        [
          [3000, '3,000 episodes'],
          [6000, '6,000 episodes'],
          [12000, '12,000 episodes'],
        ],
        micro.budget,
        { disabled: !!training }
      )}</label>
      <label>Seed ${select(
        'micro-train-seed',
        [
          [42, '42'],
          [43, '43'],
          [44, '44'],
        ],
        micro.trainSeed,
        { disabled: !!training }
      )}</label>
    </div>
    <div class="chart-caption">9 joint actions · 672 intervals per week. Browser training uses Q-learning; the Python DQN comparison runs offline. Final evaluation remains separate from validation.</div>
  </section>`;
}
