import { random } from '../rl.mjs';
import { MicrogridEnv } from './environment.mjs';
import { generateMicrogrid } from './scenario.mjs';
import { microGreedy } from './policies.mjs';
export class MicrogridAgent {
  constructor(seed = 42) {
    this.seed = seed;
    this.rng = random(seed);
    this.q = new Float32Array(7776 * 9);
    this.epsilon = 1;
    this.alpha = 0.2;
    this.gamma = 0.995;
  }
  trainEpisode(episode, total) {
    this.epsilon = Math.max(0.05, 1 - episode / (total * 0.8));
    const env = new MicrogridEnv(
      generateMicrogrid(this.seed * 100000 + episode)
    );
    let error = 0;
    while (!env.done) {
      const state = env.state,
        action =
          this.rng() < this.epsilon
            ? Math.floor(this.rng() * 9)
            : microGreedy(this.q, state),
        x = env.step(action);
      const target =
        x.reward +
        (env.done
          ? 0
          : this.gamma *
            this.q[env.state * 9 + microGreedy(this.q, env.state)]);
      const delta = target - this.q[state * 9 + action];
      this.q[state * 9 + action] += this.alpha * delta;
      error += Math.abs(delta);
    }
    return {
      episode: episode + 1,
      reward: -env.totals.objective,
      error: error / 672,
      epsilon: this.epsilon,
    };
  }
}
