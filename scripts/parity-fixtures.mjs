import { mkdir, writeFile } from 'node:fs/promises';
import {
  MICRO_CONFIG,
  MicrogridEnv,
  generateMicrogrid,
} from '../src/microgrid.mjs';
await mkdir(new URL('../shared/', import.meta.url), { recursive: true });
await mkdir(new URL('../python/volt_lab/', import.meta.url), {
  recursive: true,
});
const fixtures = [
  ['balanced', 42],
  ['outage', 43],
].map(([profile, seed]) => {
  const rows = generateMicrogrid(seed, profile),
    env = new MicrogridEnv(rows),
    transitions = [];
  while (!env.done) {
    const action = (env.t * 7) % 9,
      state = env.state,
      step = env.step(action);
    const keys = [
      'soc',
      'evSoc',
      'grid',
      'charge',
      'discharge',
      'curtailed',
      'servedHome',
      'unserved',
      'shortfall',
      'reward',
      'settlement',
      'done',
    ];
    transitions.push({
      action,
      state,
      nextState: env.state,
      ...Object.fromEntries(keys.map((key) => [key, step[key]])),
    });
  }
  return { profile, seed, rows, transitions, totals: env.totals };
});
await writeFile(
  new URL('../shared/parity.json', import.meta.url),
  JSON.stringify({ config: MICRO_CONFIG, fixtures })
);
await writeFile(
  new URL('../python/volt_lab/config.json', import.meta.url),
  JSON.stringify(MICRO_CONFIG, null, 2) + '\n'
);
console.log('Generated full-week JavaScript/Python parity fixtures.');
