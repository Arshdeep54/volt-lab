import {
  MicrogridAgent,
  evaluateMicrogrid,
  MICRO_VALIDATION_SEEDS,
} from './microgrid.mjs';
let paused = false;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
self.onmessage = async ({ data }) => {
  if (data.type === 'pause') {
    paused = true;
    return;
  }
  if (data.type === 'resume') {
    paused = false;
    return;
  }
  if (data.type !== 'train') return;
  paused = false;
  try {
    const agent = new MicrogridAgent(data.seed),
      curve = [];
    let rewards = [];
    for (let ep = 0; ep < data.episodes; ep++) {
      while (paused) await wait(50);
      const point = agent.trainEpisode(ep, data.episodes);
      rewards.push(point.reward);
      if ((ep + 1) % 50 === 0 || ep + 1 === data.episodes) {
        const sample = {
          ...point,
          reward: rewards.reduce((a, b) => a + b, 0) / rewards.length,
          validation: -evaluateMicrogrid(agent, MICRO_VALIDATION_SEEDS).learned
            .objective,
        };
        rewards = [];
        curve.push(sample);
        self.postMessage({ type: 'progress', point: sample });
        await wait(50);
      }
    }
    const evaluations = Object.fromEntries(
      ['balanced', 'cloudy', 'outage'].map((profile) => [
        profile,
        evaluateMicrogrid(agent, undefined, profile),
      ])
    );
    self.postMessage({
      type: 'complete',
      config: agent.config,
      seed: data.seed,
      episodes: data.episodes,
      q: Array.from(agent.q),
      curve,
      evaluations,
    });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
