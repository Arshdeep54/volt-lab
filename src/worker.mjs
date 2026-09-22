import { QAgent, evaluate, VALIDATION_SEEDS } from './rl.mjs';
let paused = false,
  cancelled = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
self.onmessage = async ({ data }) => {
  if (data.type === 'pause') {
    paused = true;
    return;
  }
  if (data.type === 'resume') {
    paused = false;
    return;
  }
  if (data.type === 'stop') {
    cancelled = true;
    return;
  }
  if (data.type !== 'train' && data.type !== 'benchmark') return;
  paused = false;
  cancelled = false;
  try {
    const seeds =
      data.type === 'benchmark' ? [42, 43, 44, 45, 46] : [data.seed];
    const runs = [];
    for (const seed of seeds) {
      const agent = new QAgent(seed),
        curve = [];
      let rewards = [];
      for (let ep = 0; ep < data.episodes; ep++) {
        while (paused && !cancelled) await wait(50);
        if (cancelled) return;
        const point = agent.trainEpisode(ep, data.episodes);
        rewards.push(point.reward);
        if ((ep + 1) % 25 === 0 || ep + 1 === data.episodes) {
          const validation = evaluate(agent, VALIDATION_SEEDS);
          const sample = {
            ...point,
            reward: rewards.reduce((a, b) => a + b, 0) / rewards.length,
            validation: -validation.learned,
          };
          rewards = [];
          curve.push(sample);
          self.postMessage({
            type: 'progress',
            mode: data.type,
            seed,
            run: runs.length + 1,
            totalRuns: seeds.length,
            point: sample,
            steps: agent.steps,
            q: Array.from(agent.q),
          });
          await wait(data.type === 'benchmark' ? 4 : 60);
        }
      }
      const evaluation = evaluate(agent);
      runs.push({ seed, ...evaluation });
      if (data.type === 'train')
        self.postMessage({
          type: 'complete',
          q: Array.from(agent.q),
          curve,
          evaluation,
          seed,
          episodes: data.episodes,
        });
    }
    if (data.type === 'benchmark')
      self.postMessage({
        type: 'benchmarkComplete',
        runs,
        episodes: data.episodes,
      });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
