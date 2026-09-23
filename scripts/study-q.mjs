import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  MicrogridAgent,
  evaluateMicrogrid,
  MICRO_VALIDATION_SEEDS,
} from '../src/microgrid.mjs';
import { summarizeControllers } from '../src/experiments/statistics.mjs';

const steps = Number(process.argv[2] || 400000);
const output = process.argv[3];
if (!Number.isInteger(steps) || steps < 672 || steps > 10000000 || !output)
  throw new Error(
    'Provide a step budget (672–10000000) and a local output directory.'
  );
await mkdir(dirname(output), { recursive: true });
await mkdir(output);
const root = new URL('../', import.meta.url);
const groups = [];
for (const [name, episodes, seeds] of [
  ['matched', Math.ceil(steps / 672), [42, 43, 44]],
  ['reference', 6000, [42, 43, 44, 45, 46]],
]) {
  const runs = [];
  for (const seed of seeds) {
    const agent = new MicrogridAgent(seed),
      curve = [],
      started = performance.now();
    let validationMs = 0,
      rewards = [];
    for (let episode = 0; episode < episodes; episode++) {
      const point = agent.trainEpisode(episode, episodes);
      rewards.push(point.reward);
      if ((episode + 1) % 50 === 0 || episode + 1 === episodes) {
        const before = performance.now();
        const seconds = (before - started - validationMs) / 1000;
        const validation = evaluateMicrogrid(agent, MICRO_VALIDATION_SEEDS)
          .learned.objective;
        validationMs += performance.now() - before;
        curve.push({
          ...point,
          step: (episode + 1) * 672,
          seconds,
          reward: rewards.reduce((a, b) => a + b, 0) / rewards.length,
          validation: -validation,
        });
        rewards = [];
      }
    }
    const trainingSeconds = (performance.now() - started - validationMs) / 1000;
    const evaluations = Object.fromEntries(
      ['balanced', 'cloudy', 'outage'].map((profile) => [
        profile,
        evaluateMicrogrid(agent, undefined, profile),
      ])
    );
    const model = {
      seed,
      episodes,
      config: agent.config,
      q: Array.from(agent.q),
      curve,
      evaluations,
    };
    const bytes = JSON.stringify(model);
    const path = output + '/' + name + '-seed-' + seed + '.json';
    await writeFile(path, bytes);
    runs.push({
      seed,
      episodes,
      timesteps: episodes * 672,
      trainingSeconds,
      curve,
      evaluations,
      artifact: {
        path,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
    });
    console.log(
      name +
        ' Q-learning seed ' +
        seed +
        ': ' +
        evaluations.balanced.learned.objective.toFixed(2)
    );
  }
  groups.push({
    name,
    runs,
    summary: Object.fromEntries(
      ['balanced', 'cloudy', 'outage'].map((profile) => [
        profile,
        summarizeControllers(runs, profile),
      ])
    ),
  });
}
const hashes = {};
for (const file of [
  'src/microgrid/agent.mjs',
  'src/microgrid/environment.mjs',
  'src/microgrid/scenario.mjs',
  'src/microgrid/config.mjs',
  'scripts/study-q.mjs',
])
  hashes[file] = createHash('sha256')
    .update(await readFile(new URL(file, root)))
    .digest('hex');
await writeFile(
  output + '/q-report.json',
  JSON.stringify(
    {
      schemaVersion: 1,
      status: 'complete',
      commit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      sourceHashes: hashes,
      groups,
    },
    null,
    2
  ) + '\n'
);
