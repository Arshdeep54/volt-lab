import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { summarize } from '../src/experiments/statistics.mjs';

test('published study reconciles restored costs, budgets, learning curves, and model hashes', async () => {
  const study = JSON.parse(
    await readFile(
      new URL('../experiments/results/study.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(study.status, 'complete');
  assert.deepEqual(study.protocol.trainingSeeds, [42, 43, 44]);
  const components = [
    'bill',
    'wear',
    'carbonCost',
    'reliabilityCost',
    'deadlineCost',
    'settlement',
  ];
  const close = (actual, expected) =>
    assert.ok(
      Math.abs(actual - expected) < 1e-7,
      `${actual} differs from ${expected}`
    );
  for (const variant of study.variants) {
    assert.deepEqual(
      variant.runs.map((run) => run.seed),
      [42, 43, 44]
    );
    let previousStep = 0,
      previousSeconds = 0;
    for (const point of variant.curve) {
      assert.ok(point.step > previousStep && point.seconds >= previousSeconds);
      assert.equal(point.objective.n, 3);
      assert.ok(
        Number.isFinite(point.objective.mean) &&
          Number.isFinite(point.objective.sd)
      );
      previousStep = point.step;
      previousSeconds = point.seconds;
    }
    for (const run of variant.runs) {
      assert.equal(
        run.timesteps,
        variant.algorithm === 'Q-learning'
          ? Math.ceil(study.protocol.requestedSteps / 672) * 672
          : study.protocol.requestedSteps
      );
      assert.equal(run.curve.at(-1).step, run.timesteps);
      const bytes = await readFile(
        new URL('../' + run.artifact.path, import.meta.url)
      );
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        run.artifact.sha256
      );
    }
    for (const profile of ['balanced', 'cloudy', 'outage']) {
      const expected = summarize(
        variant.runs.map((run) => run.evaluations[profile].learned.objective)
      );
      close(variant.summary[profile].learned.objective.mean, expected.mean);
      close(variant.summary[profile].learned.objective.sd, expected.sd);
      const costs = variant.failureAnalysis[profile];
      close(
        components.reduce((total, key) => total + costs[key].mean, 0),
        costs.objective.mean
      );
      close(costs.objective.mean, expected.mean);
    }
  }
  const legacy = JSON.parse(
    await readFile(
      new URL('../experiments/results/benchmark.json', import.meta.url),
      'utf8'
    )
  ).variants[0];
  for (const profile of ['balanced', 'cloudy', 'outage']) {
    close(
      study.referenceFailureAnalysis[profile].objective.mean,
      legacy.summary[profile].learned.objective.mean
    );
    close(
      study.ruleFailureAnalysis[profile].objective,
      legacy.summary[profile].rule.objective.mean
    );
  }
});
