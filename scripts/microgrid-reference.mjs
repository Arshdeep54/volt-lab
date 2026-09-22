import { writeFile } from 'node:fs/promises';
import {
  MicrogridAgent,
  evaluateMicrogrid,
  MICRO_VALIDATION_SEEDS,
  MICRO_CONFIG,
} from '../src/microgrid.mjs';
const agent = new MicrogridAgent(42),
  curve = [];
let rewards = [];
for (let ep = 0; ep < 6000; ep++) {
  const point = agent.trainEpisode(ep, 6000);
  rewards.push(point.reward);
  if ((ep + 1) % 50 === 0) {
    curve.push({
      ...point,
      reward: rewards.reduce((a, b) => a + b, 0) / rewards.length,
      validation: -evaluateMicrogrid(agent, MICRO_VALIDATION_SEEDS).learned
        .objective,
    });
    rewards = [];
  }
}
const evaluations = Object.fromEntries(
  ['balanced', 'cloudy', 'outage'].map((profile) => [
    profile,
    evaluateMicrogrid(agent, undefined, profile),
  ])
);
await writeFile(
  new URL('../src/microgrid-reference.json', import.meta.url),
  JSON.stringify({
    seed: 42,
    episodes: 6000,
    config: MICRO_CONFIG,
    provenance:
      'Actual tabular Q-learning in the 15-minute EV microgrid; scripts/microgrid-reference.mjs',
    q: Array.from(agent.q),
    curve,
    evaluations,
  })
);
console.log(JSON.stringify(evaluations.balanced, null, 2));
