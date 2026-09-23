import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('development server exposes only public assets and curated reports', async () => {
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const base = await new Promise((resolve, reject) => {
      child.stdout.once('data', (data) =>
        resolve(data.toString().match(/http:\/\/localhost:\d+/)[0])
      );
      child.once('error', reject);
    });
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/src/microgrid/config.mjs')).status, 200);
    assert.equal((await fetch(base + '/src/..%2fpackage.json')).status, 404);
    assert.equal((await fetch(base + '/python/volt_lab/env.py')).status, 404);
    assert.equal(
      (await fetch(base + '/src/reports/benchmark.json')).status,
      200
    );
    assert.equal((await fetch(base + '/src/reports/study.json')).status, 200);
    assert.equal(
      (await fetch(base + '/experiments/local/study.json')).status,
      404
    );
  } finally {
    child.kill();
  }
});
