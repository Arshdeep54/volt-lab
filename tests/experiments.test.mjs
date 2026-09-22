import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrogridEnv, MicrogridAgent, generateMicrogrid, evaluateMicrogrid } from '../src/microgrid.mjs';
import { summarize } from '../src/experiments/statistics.mjs';

test('reward changes preserve physical transitions and expose quarter-hour states', () => {
  const scenario = generateMicrogrid(42);
  const normal = new MicrogridEnv(scenario);
  const carbonFree = new MicrogridEnv(scenario, { carbonWeight: 0 });
  const detailed = new MicrogridEnv(scenario, { observation: 'quarter-hour' });
  for (let i = 0; i < 12; i++) {
    const a = normal.step(5), b = carbonFree.step(5);
    assert.equal(a.soc, b.soc);
    assert.equal(a.evSoc, b.evSoc);
    assert.ok(Math.abs(a.cost - b.cost - a.carbon * 0.05) < 1e-9);
    detailed.step(5);
  }
  const agent = new MicrogridAgent(42, { observation: 'quarter-hour' });
  assert.equal(agent.q.length, 31104 * 9);
  assert.ok(detailed.state < 31104);
  assert.deepEqual(evaluateMicrogrid(agent, [910000001]), evaluateMicrogrid(agent, [910000001]));
});

test('statistics report sample variation rather than confidence intervals', () => {
  assert.deepEqual(summarize([1, 2, 3]), {mean:2, sd:1, n:3});
  assert.deepEqual(summarize([7]), {mean:7, sd:0, n:1});
});
