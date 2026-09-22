// Pure simulation and learning code, shared by the browser worker and Node tests.
export const CONFIG = Object.freeze({
  capacity: 10,
  power: 2.5,
  efficiency: 0.95,
  wear: 0.015,
  hours: 168,
  initialSoc: 5,
  terminalPrice: 0.12,
});
export const ACTIONS = ['Charge', 'Idle', 'Discharge'];
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function generateScenario(seed, weather = 'mixed') {
  const rng = random(seed),
    data = [];
  for (let day = 0; day < 7; day++) {
    const sun =
      weather === 'cloudy'
        ? 0.25
        : weather === 'sunny'
          ? 0.95
          : 0.35 + rng() * 0.65;
    for (let hour = 0; hour < 24; hour++) {
      const price = hour < 7 ? 0.09 : hour >= 17 && hour < 22 ? 0.36 : 0.18;
      const demand = Math.max(
        0.3,
        0.8 +
          (hour >= 17 && hour < 22 ? 1.5 : 0) +
          (hour >= 7 && hour < 10 ? 0.7 : 0) +
          rng() * 0.8
      );
      const solar =
        Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)) *
        4.5 *
        sun *
        (0.85 + rng() * 0.15);
      data.push({ hour, day, price, demand, solar });
    }
  }
  return data;
}
export function stateIndex(row, soc) {
  const net = row.demand - row.solar;
  const bucket = net < 0 ? 0 : net < 1.5 ? 1 : 2;
  return (
    (row.hour * 11 + Math.min(10, Math.max(0, Math.round(soc)))) * 3 + bucket
  );
}
export class BatteryEnv {
  constructor(scenario) {
    this.scenario = scenario;
    this.soc = CONFIG.initialSoc;
    this.t = 0;
    this.done = false;
    this.history = [];
    this.cost = 0;
  }
  get state() {
    return stateIndex(
      this.scenario[Math.min(this.t, this.scenario.length - 1)],
      this.soc
    );
  }
  step(action) {
    if (this.done)
      throw new Error('Episode finished; create a new environment.');
    if (!Number.isInteger(action) || action < 0 || action > 2)
      throw new Error('Action must be 0, 1, or 2.');
    const row = this.scenario[this.t],
      previousSoc = this.soc;
    const charge =
      action === 0
        ? Math.min(
            CONFIG.power,
            (CONFIG.capacity - this.soc) / CONFIG.efficiency
          )
        : 0;
    // No export revenue; only discharge what the house can use.
    const discharge =
      action === 2
        ? Math.min(
            CONFIG.power,
            this.soc * CONFIG.efficiency,
            Math.max(0, row.demand - row.solar)
          )
        : 0;
    this.soc = Math.max(
      0,
      Math.min(
        CONFIG.capacity,
        this.soc + charge * CONFIG.efficiency - discharge / CONFIG.efficiency
      )
    );
    const balance = row.demand - row.solar + charge - discharge;
    const grid = Math.max(0, balance),
      curtailed = Math.max(0, -balance);
    const bill = grid * row.price,
      wear = (charge + discharge) * CONFIG.wear;
    this.t++;
    this.done = this.t === this.scenario.length;
    // Charge/credit the difference from the initial battery energy to prevent free-energy comparisons.
    const settlement = this.done
      ? (CONFIG.initialSoc - this.soc) * CONFIG.terminalPrice
      : 0;
    const cost = bill + wear + settlement;
    this.cost += cost;
    const result = {
      ...row,
      t: this.t - 1,
      previousSoc,
      soc: this.soc,
      action,
      charge,
      discharge,
      grid,
      curtailed,
      bill,
      wear,
      settlement,
      cost,
      reward: -cost,
      done: this.done,
    };
    this.history.push(result);
    return result;
  }
}
export function greedyAction(q, state) {
  const i = state * 3;
  let best = 1;
  for (const a of [0, 2]) if (q[i + a] > q[i + best]) best = a;
  return best;
}
export function ruleAction(env) {
  const r = env.scenario[env.t];
  if (r.solar > r.demand || r.price <= 0.09) return 0;
  if (r.price >= 0.36) return 2;
  return 1;
}
export class QAgent {
  constructor(seed = 42) {
    this.seed = seed;
    this.rng = random(seed);
    this.q = new Float64Array(24 * 11 * 3 * 3);
    this.alpha = 0.25;
    this.gamma = 0.97;
    this.epsilon = 1;
    this.steps = 0;
  }
  update(state, action, reward, nextState, done) {
    const i = state * 3 + action;
    const target =
      reward +
      (done
        ? 0
        : this.gamma * this.q[nextState * 3 + greedyAction(this.q, nextState)]);
    const error = target - this.q[i];
    this.q[i] += this.alpha * error;
    return error;
  }
  trainEpisode(episode, total) {
    this.epsilon = Math.max(0.05, 1 - episode / (total * 0.75));
    const env = new BatteryEnv(generateScenario(this.seed * 100000 + episode));
    let error = 0;
    while (!env.done) {
      const state = env.state;
      const action =
        this.rng() < this.epsilon
          ? Math.floor(this.rng() * 3)
          : greedyAction(this.q, state);
      const x = env.step(action);
      error += Math.abs(
        this.update(state, action, x.reward, env.state, env.done)
      );
      this.steps++;
    }
    return {
      episode: episode + 1,
      reward: -env.cost,
      error: error / CONFIG.hours,
      epsilon: this.epsilon,
    };
  }
}
export function rollout(
  q,
  seed = 900000001,
  weather = 'mixed',
  controller = 'learned'
) {
  const env = new BatteryEnv(generateScenario(seed, weather));
  while (!env.done)
    env.step(
      controller === 'rule'
        ? ruleAction(env)
        : controller === 'noBattery'
          ? 1
          : greedyAction(q, env.state)
    );
  return { cost: env.cost, history: env.history };
}
export const VALIDATION_SEEDS = [800000001, 800000002, 800000003];
export const TEST_SEEDS = Array.from({ length: 20 }, (_, i) => 900000001 + i);
export function evaluate(agent, seeds = TEST_SEEDS, weather = 'mixed') {
  const means = { learned: 0, rule: 0, noBattery: 0, scenarios: seeds.length };
  for (const seed of seeds)
    for (const controller of ['learned', 'rule', 'noBattery'])
      means[controller] +=
        rollout(agent.q, seed, weather, controller).cost / seeds.length;
  return means;
}
