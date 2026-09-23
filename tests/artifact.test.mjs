import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as artifacts from '../src/experiments/artifact.mjs';
import { evaluateMicrogrid, MICRO_CONFIG } from '../src/microgrid.mjs';
const { createRun, validateRun } = artifacts;

test('experiment artifacts preserve metadata and reject unsafe or incomplete models', async () => {
  const model = JSON.parse(
    await readFile(
      new URL('../src/microgrid-reference.json', import.meta.url),
      'utf8'
    )
  );
  const run = createRun(model, { commit: 'abc123', scenarioHash: 'fixture' });
  assert.equal(validateRun(run), run);
  assert.equal(run.code.commit, 'abc123');
  assert.equal(run.environment.config.observation, 'hourly');
  assert.throws(
    () => validateRun({ ...run, status: 'in-progress' }),
    /Unsupported/
  );
  assert.throws(
    () => validateRun({ ...run, model: { ...run.model, q: [0] } }),
    /Q-table/
  );
  const config = { ...run.environment.config, efficiency: 0 };
  assert.throws(
    () => validateRun({ ...run, environment: { ...run.environment, config } }),
    /physical/
  );
});

test('imports reject missing metadata before it can reach the dashboard', async () => {
  const model = JSON.parse(
    await readFile(
      new URL('../src/microgrid-reference.json', import.meta.url),
      'utf8'
    )
  );
  for (const field of ['code', 'dataset', 'source']) {
    const run = createRun(model);
    delete run[field];
    assert.throws(() => validateRun(run), /metadata/);
  }
});

test('import verification replaces claimed scores under the common objective', async () => {
  const model = JSON.parse(
    await readFile(
      new URL('../src/microgrid-reference.json', import.meta.url),
      'utf8'
    )
  );
  const run = createRun(model);
  run.model.q.fill(0);
  run.environment.config.carbonWeight = 0;
  run.model.config.carbonWeight = 0;
  run.model.evaluations.balanced.learned.objective = -1000000;
  const verified = artifacts.verifyImportedRun(run);
  const expected = evaluateMicrogrid(
    verified.model,
    undefined,
    'balanced',
    MICRO_CONFIG
  );
  assert.deepEqual(verified.model.evaluations.balanced, expected);
  assert.equal(verified.source, 'import');
  assert.deepEqual(
    verified.evaluation.testSeeds,
    Array.from({ length: 10 }, (_, i) => 910000001 + i)
  );
  assert.equal(verified.evaluation.config.carbonWeight, 0.05);
  assert.notEqual(
    verified.model.evaluations.balanced.learned.objective,
    -1000000
  );
  assert.equal(run.model.evaluations.balanced.learned.objective, -1000000);
});
