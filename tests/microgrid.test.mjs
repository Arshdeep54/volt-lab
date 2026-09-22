import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MicrogridEnv,
  MicrogridAgent,
  generateMicrogrid,
  evaluateMicrogrid,
  MICRO_CONFIG,
} from '../src/microgrid.mjs';
test('microgrid scenarios are reproducible with 15-minute resolution', () => {
  assert.deepEqual(generateMicrogrid(42), generateMicrogrid(42));
  assert.notDeepEqual(generateMicrogrid(42), generateMicrogrid(43));
  assert.equal(generateMicrogrid(42).length, 672);
});
test('joint actions conserve energy and respect grid, battery, and EV limits', () => {
  const env = new MicrogridEnv(generateMicrogrid(123, 'outage'));
  while (!env.done) {
    const x = env.step(env.t % 9);
    assert.ok(x.grid >= 0 && x.grid <= MICRO_CONFIG.gridLimit + 1e-9);
    assert.ok(env.soc >= 0 && env.soc <= 10);
    assert.ok(env.evSoc >= 0 && env.evSoc <= 40);
    assert.ok(
      Math.abs(
        x.grid +
          x.solar +
          x.discharge -
          x.servedHome -
          x.evPower -
          x.charge -
          x.curtailed
      ) < 1e-9
    );
    assert.ok(
      Math.abs(
        x.soc - x.previousSoc - (x.charge * 0.95 - x.discharge / 0.95) * 0.25
      ) < 1e-9
    );
    if (!x.gridAvailable) assert.equal(x.grid, 0);
    if (!x.evConnected) assert.equal(x.evPower, 0);
  }
  assert.equal(env.totals.departures, 7);
  assert.throws(() => env.step(3), /finished/);
});
test('outage prioritizes essential household demand before EV charging', () => {
  const row = {
    ...generateMicrogrid(4)[0],
    solar: 0,
    home: 2,
    gridAvailable: false,
  };
  const env = new MicrogridEnv([row]);
  env.soc = 0;
  const x = env.step(5);
  assert.equal(x.evPower, 0);
  assert.equal(x.grid, 0);
  assert.equal(x.unserved, 0.5);
  assert.ok(x.cost >= x.unserved * MICRO_CONFIG.unservedPenalty);
});
test('EV departure goal is measured after the final charging interval', () => {
  const row = {
    ...generateMicrogrid(4)[0],
    hour: 6,
    minute: 45,
    home: 0.8,
    solar: 0,
    gridAvailable: true,
    trip: 12,
  };
  const env = new MicrogridEnv([row]);
  env.evSoc = 20;
  const x = env.step(5);
  assert.ok(Math.abs(x.shortfall - (32 - (20 + 3.6 * 0.25 * 0.92))) < 1e-9);
  assert.equal(env.totals.departures, 1);
  assert.equal(env.totals.readyDepartures, 0);
});
test('the expanded agent learns and evaluation is reproducible', () => {
  const agent = new MicrogridAgent(42);
  const before = evaluateMicrogrid(agent, [910000001]).learned.objective;
  for (let ep = 0; ep < 1500; ep++) agent.trainEpisode(ep, 1500);
  const result = evaluateMicrogrid(agent, [910000001, 910000002]);
  assert.deepEqual(result, evaluateMicrogrid(agent, [910000001, 910000002]));
  assert.ok(result.learned.objective < before);
  assert.equal(agent.q.length, 7776 * 9);
});
