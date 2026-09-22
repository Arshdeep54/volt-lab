import { random } from './rl.mjs';
export const MICRO_CONFIG = Object.freeze({
  dt: 0.25,
  steps: 672,
  capacity: 10,
  batteryPower: 3,
  efficiency: 0.95,
  gridLimit: 5,
  evCapacity: 40,
  evTarget: 32,
  evEfficiency: 0.92,
  evRates: [0, 1.8, 3.6],
  wear: 0.015,
  carbonWeight: 0.05,
  unservedPenalty: 4,
  deadlinePenalty: 2,
  initialSoc: 5,
  initialEvSoc: 24,
});
export const MICRO_ACTIONS = Array.from({ length: 9 }, (_, i) => ({
  battery: Math.floor(i / 3),
  ev: i % 3,
}));
export function generateMicrogrid(seed, profile = 'balanced') {
  const rng = random(seed),
    rows = [],
    outageDay = Math.floor(rng() * 7);
  for (let day = 0; day < 7; day++) {
    const sunlight =
      profile === 'cloudy' ? 0.2 + rng() * 0.2 : 0.45 + rng() * 0.55;
    const trip = 10 + rng() * 7;
    for (let quarter = 0; quarter < 96; quarter++) {
      const time = quarter / 4,
        hour = Math.floor(time),
        minute = (quarter % 4) * 15;
      const gridAvailable = !(profile === 'outage'
        ? (day === 2 || day === 5) && time >= 17 && time < 20
        : day === outageDay && time >= 18 && time < 19);
      rows.push({
        day,
        hour,
        minute,
        time,
        trip,
        gridAvailable,
        price: hour < 7 ? 0.09 : hour >= 17 && hour < 22 ? 0.36 : 0.18,
        home:
          0.65 +
          rng() * 0.6 +
          (hour >= 17 && hour < 22 ? 1.6 : 0) +
          (hour >= 7 && hour < 9 ? 0.65 : 0),
        solar:
          Math.max(0, Math.sin(((time - 6) / 12) * Math.PI)) *
          5 *
          sunlight *
          (0.85 + rng() * 0.15),
        carbon:
          hour >= 17 && hour < 22 ? 0.65 : hour >= 10 && hour < 16 ? 0.3 : 0.45,
      });
    }
  }
  return rows;
}
export class MicrogridEnv {
  constructor(scenario) {
    this.scenario = scenario;
    this.t = 0;
    this.done = false;
    this.soc = 5;
    this.evSoc = 24;
    this.history = [];
    this.totals = {
      objective: 0,
      bill: 0,
      carbon: 0,
      unserved: 0,
      shortfall: 0,
      gridEnergy: 0,
      departures: 0,
      readyDepartures: 0,
    };
  }
  get row() {
    return this.scenario[Math.min(this.t, this.scenario.length - 1)];
  }
  get evConnected() {
    return this.row.hour < 7 || this.row.hour >= 18;
  }
  get state() {
    const r = this.row,
      net = r.home - r.solar;
    const soc = Math.min(5, Math.round(this.soc / 2));
    const deficit = this.evConnected ? Math.max(0, 32 - this.evSoc) : 0;
    const ev = deficit < 0.1 ? 0 : deficit < 8 ? 1 : 2;
    const urgency = !this.evConnected ? 0 : r.hour < 7 && r.hour >= 3 ? 2 : 1;
    return (
      ((((r.hour * 6 + soc) * 3 + ev) * 3 + (net < 0 ? 0 : net < 1.5 ? 1 : 2)) *
        3 +
        urgency) *
        2 +
      Number(r.gridAvailable)
    );
  }
  step(index) {
    if (this.done) throw new Error('Episode finished; restart the microgrid.');
    if (!Number.isInteger(index) || index < 0 || index > 8)
      throw new Error('Joint action must be between 0 and 8.');
    const r = this.row,
      a = MICRO_ACTIONS[index],
      c = MICRO_CONFIG,
      previousSoc = this.soc,
      evConnected = this.evConnected;
    const requestedEv = evConnected
      ? Math.min(
          c.evRates[a.ev],
          Math.max(0, c.evTarget - this.evSoc) / (c.evEfficiency * c.dt)
        )
      : 0;
    const discharge =
      a.battery === 2
        ? Math.min(
            c.batteryPower,
            (this.soc * c.efficiency) / c.dt,
            Math.max(0, r.home + requestedEv - r.solar)
          )
        : 0;
    const supply = r.solar + (r.gridAvailable ? c.gridLimit : 0) + discharge;
    const servedHome = Math.min(r.home, supply);
    const evPower = Math.min(requestedEv, Math.max(0, supply - servedHome));
    const charge =
      a.battery === 0
        ? Math.min(
            c.batteryPower,
            (c.capacity - this.soc) / (c.efficiency * c.dt),
            Math.max(0, supply - servedHome - evPower)
          )
        : 0;
    const balance = servedHome + evPower + charge - r.solar - discharge;
    const grid = Math.max(0, balance),
      curtailed = Math.max(0, -balance);
    this.soc = Math.max(
      0,
      Math.min(
        c.capacity,
        this.soc + (charge * c.efficiency - discharge / c.efficiency) * c.dt
      )
    );
    this.evSoc = Math.min(
      c.evTarget,
      this.evSoc + evPower * c.evEfficiency * c.dt
    );
    const unserved = (r.home - servedHome) * c.dt;
    let shortfall = 0,
      departure = false;
    if (r.hour === 6 && r.minute === 45) {
      departure = true;
      shortfall = Math.max(0, c.evTarget - this.evSoc);
      this.totals.departures++;
      if (shortfall < 0.1) this.totals.readyDepartures++;
      this.evSoc = Math.max(0, this.evSoc - r.trip);
    }
    this.t++;
    this.done = this.t === this.scenario.length;
    const bill = grid * c.dt * r.price,
      carbon = grid * c.dt * r.carbon,
      wear = (charge + discharge) * c.dt * c.wear;
    const settlement = this.done
      ? (c.initialSoc - this.soc + (c.initialEvSoc - this.evSoc)) * 0.12
      : 0;
    const cost =
      bill +
      wear +
      carbon * c.carbonWeight +
      unserved * c.unservedPenalty +
      shortfall * c.deadlinePenalty +
      settlement;
    const x = {
      ...r,
      index: this.t - 1,
      previousSoc,
      soc: this.soc,
      evSoc: this.evSoc,
      evConnected,
      action: index,
      batteryAction: a.battery,
      evAction: a.ev,
      requestedEv,
      evPower,
      servedHome,
      grid,
      curtailed,
      charge,
      discharge,
      bill,
      carbon,
      wear,
      unserved,
      shortfall,
      departure,
      settlement,
      cost,
      reward: -cost,
      done: this.done,
    };
    for (const [key, value] of Object.entries({
      objective: cost,
      bill,
      carbon,
      unserved,
      shortfall,
      gridEnergy: grid * c.dt,
    }))
      this.totals[key] += value;
    this.history.push(x);
    return x;
  }
}
export function microGreedy(q, state) {
  let best = 3;
  for (let a = 0; a < 9; a++)
    if (q[state * 9 + a] > q[state * 9 + best]) best = a;
  return best;
}
export function microRule(env) {
  const r = env.row,
    needed = Math.max(0, 32 - env.evSoc);
  const battery = !r.gridAvailable
    ? 2
    : r.price <= 0.09 || r.solar > r.home
      ? 0
      : r.price >= 0.36
        ? 2
        : 1;
  const ev =
    env.evConnected &&
    needed > 0.1 &&
    (r.price <= 0.09 || (r.hour < 7 && r.hour >= 3) || r.solar > r.home + 1.8)
      ? 2
      : 0;
  return battery * 3 + ev;
}
export class MicrogridAgent {
  constructor(seed = 42) {
    this.seed = seed;
    this.rng = random(seed);
    this.q = new Float32Array(7776 * 9);
    this.epsilon = 1;
    this.alpha = 0.2;
    this.gamma = 0.995;
  }
  trainEpisode(episode, total) {
    this.epsilon = Math.max(0.05, 1 - episode / (total * 0.8));
    const env = new MicrogridEnv(
      generateMicrogrid(this.seed * 100000 + episode)
    );
    let error = 0;
    while (!env.done) {
      const state = env.state,
        action =
          this.rng() < this.epsilon
            ? Math.floor(this.rng() * 9)
            : microGreedy(this.q, state),
        x = env.step(action);
      const target =
        x.reward +
        (env.done
          ? 0
          : this.gamma *
            this.q[env.state * 9 + microGreedy(this.q, env.state)]);
      const delta = target - this.q[state * 9 + action];
      this.q[state * 9 + action] += this.alpha * delta;
      error += Math.abs(delta);
    }
    return {
      episode: episode + 1,
      reward: -env.totals.objective,
      error: error / 672,
      epsilon: this.epsilon,
    };
  }
}
export const MICRO_TEST_SEEDS = Array.from(
  { length: 10 },
  (_, i) => 910000001 + i
);
export const MICRO_VALIDATION_SEEDS = [810000001, 810000002];
export function evaluateMicrogrid(
  agent,
  seeds = MICRO_TEST_SEEDS,
  profile = 'balanced'
) {
  const result = { scenarios: seeds.length, profile };
  for (const controller of ['learned', 'rule', 'noBattery']) {
    const total = {
      objective: 0,
      bill: 0,
      carbon: 0,
      unserved: 0,
      shortfall: 0,
      gridEnergy: 0,
      departures: 0,
      readyDepartures: 0,
    };
    for (const seed of seeds) {
      const env = new MicrogridEnv(generateMicrogrid(seed, profile));
      while (!env.done) {
        const rule = microRule(env);
        env.step(
          controller === 'learned'
            ? microGreedy(agent.q, env.state)
            : controller === 'rule'
              ? rule
              : 3 + (rule % 3)
        );
      }
      for (const key of Object.keys(total))
        total[key] += env.totals[key] / seeds.length;
    }
    result[controller] = total;
  }
  return result;
}
