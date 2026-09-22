import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BatteryEnv,
  generateScenario,
  greedyAction,
  QAgent,
  evaluate,
} from '../src/rl.mjs';

test('scenario generation is deterministic and varies by seed', () => {
  assert.deepEqual(generateScenario(42), generateScenario(42));
  assert.notDeepEqual(generateScenario(42), generateScenario(43));
});
test('battery remains within capacity and energy is conserved', () => {
  const env = new BatteryEnv(generateScenario(12));
  for (let t = 0; t < 168; t++) {
    const x = env.step(t % 3);
    assert.ok(env.soc >= 0 && env.soc <= 10);
    assert.ok(
      Math.abs(
        x.grid - x.demand + x.solar - x.charge + x.discharge - x.curtailed
      ) < 1e-9
    );
    assert.ok(
      Math.abs(x.soc - x.previousSoc - x.charge * 0.95 + x.discharge / 0.95) <
        1e-9
    );
    assert.ok(x.grid >= 0);
  }
  assert.equal(env.done, true);
  assert.throws(() => env.step(0), /finished/);
});
test('charging at full capacity and discharging empty are physically clipped', () => {
  const env = new BatteryEnv(generateScenario(1));
  env.soc = 10;
  assert.equal(env.step(0).charge, 0);
  env.soc = 0;
  assert.equal(env.step(2).discharge, 0);
});
test('terminal reward settles stored energy and does not bootstrap', () => {
  const scenario = generateScenario(4);
  const env = new BatteryEnv(scenario);
  while (!env.done) env.step(1);
  assert.equal(env.history.at(-1).settlement, 0);
  const agent = new QAgent(1);
  agent.q.fill(100);
  agent.update(0, 1, -2, 3, true);
  assert.equal(agent.q[1], 74.5);
});
test('evaluation uses the same held-out scenarios for all controllers', () => {
  const agent = new QAgent(42);
  const a = evaluate(agent, [10001, 10002]);
  const b = evaluate(agent, [10001, 10002]);
  assert.deepEqual(a, b);
  assert.equal(a.scenarios, 2);
  assert.ok(Number.isFinite(a.learned));
  assert.ok(a.noBattery > 0 && a.rule > 0);
});
test('Q-learning is reproducible and improves over an untrained policy on fixed validation scenarios', () => {
  const a = new QAgent(42),
    b = new QAgent(42);
  const before = evaluate(a, [20001, 20002, 20003]).learned;
  for (let i = 0; i < 1200; i++) {
    a.trainEpisode(i, 1200);
    b.trainEpisode(i, 1200);
  }
  assert.deepEqual(a.q, b.q);
  assert.ok(evaluate(a, [20001, 20002, 20003]).learned < before);
  assert.ok([0, 1, 2].includes(greedyAction(a.q, 0)));
});
