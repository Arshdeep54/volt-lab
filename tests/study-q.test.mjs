import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Q-learning study refuses to overwrite an existing experiment directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'volt-study-'));
  try {
    await writeFile(
      join(directory, 'q-report.json'),
      'previous completed experiment'
    );
    const result = spawnSync(
      process.execPath,
      ['scripts/study-q.mjs', '672', directory],
      { encoding: 'utf8' }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /EEXIST/);
    assert.equal(
      await readFile(join(directory, 'q-report.json'), 'utf8'),
      'previous completed experiment'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
