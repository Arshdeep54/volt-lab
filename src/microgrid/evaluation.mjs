import { MICRO_TEST_SEEDS } from './config.mjs';
import { MicrogridEnv } from './environment.mjs';
import { generateMicrogrid } from './scenario.mjs';
import { microGreedy, microRule } from './policies.mjs';
export function evaluateMicrogrid(
  agent,
  seeds = MICRO_TEST_SEEDS,
  profile = 'balanced',
  config = agent.config,
  scenarioOptions = {}
) {
  const result = { scenarios: seeds.length, profile };
  for (const controller of ['learned', 'rule', 'noBattery']) {
    const total = {
      objective: 0,
      bill: 0,
      carbon: 0,
      unserved: 0,
      shortfall: 0,
      gridEnergy: 0,
      departures: 0,
      readyDepartures: 0,
    };
    for (const seed of seeds) {
      const env = new MicrogridEnv(
        generateMicrogrid(seed, profile, scenarioOptions),
        config
      );
      while (!env.done) {
        const rule = microRule(env);
        env.step(
          controller === 'learned'
            ? microGreedy(agent.q, env.state)
            : controller === 'rule'
              ? rule
              : 3 + (rule % 3)
        );
      }
      for (const key of Object.keys(total))
        total[key] += env.totals[key] / seeds.length;
    }
    result[controller] = total;
  }
  return result;
}
