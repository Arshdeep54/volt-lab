import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { summarize } from '../src/experiments/statistics.mjs';

test('published reports match their individual runs and trained model hashes', async () => {
  for (const name of ['benchmark','ablations','dqn']) {
    const report = JSON.parse(await readFile(new URL('../experiments/results/'+name+'.json',import.meta.url),'utf8'));
    const variants = report.variants || [report];
    for (const variant of variants) {
      for (const profile of ['balanced','cloudy','outage']) {
        for (const controller of ['learned','rule','noBattery']) {
          const expected=summarize(variant.runs.map(run=>run.evaluations[profile][controller].objective));
          const actual=variant.summary[profile][controller].objective;
          assert.ok(Math.abs(expected.mean-actual.mean)<1e-10);
          assert.ok(Math.abs(expected.sd-actual.sd)<1e-10);
          assert.equal(expected.n,actual.n);
        }
      }
      assert.equal(new Set(variant.runs.map(run=>run.seed)).size,variant.runs.length);
    }
    if (name==='dqn') {
      for (const run of report.runs) {
        const bytes=await readFile(new URL('../'+run.artifact.path,import.meta.url));
        assert.equal(createHash('sha256').update(bytes).digest('hex'),run.artifact.sha256);
      }
    }
  }
});
