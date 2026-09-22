import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRun, validateRun } from '../src/experiments/artifact.mjs';

test('experiment artifacts preserve metadata and reject unsafe or incomplete models', async () => {
  const model = JSON.parse(await readFile(new URL('../src/microgrid-reference.json',import.meta.url),'utf8'));
  const run = createRun(model,{commit:'abc123',scenarioHash:'fixture'});
  assert.equal(validateRun(run),run);
  assert.equal(run.code.commit,'abc123');
  assert.equal(run.environment.config.observation,'hourly');
  assert.throws(()=>validateRun({...run,status:'in-progress'}),/Unsupported/);
  assert.throws(()=>validateRun({...run,model:{...run.model,q:[0]}}),/Q-table/);
  const config = {...run.environment.config,efficiency:0};
  assert.throws(()=>validateRun({...run,environment:{...run.environment,config}}),/physical/);
});
