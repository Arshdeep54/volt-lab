import { MICRO_ACTIONS, MICRO_CONFIG } from './config.mjs';
export class MicrogridEnv {
  constructor(scenario, config = {}) {
    this.config = Object.freeze({ ...MICRO_CONFIG, ...config });
    this.scenario = scenario;
    this.t = 0;
    this.done = false;
    this.soc = this.config.initialSoc;
    this.evSoc = this.config.initialEvSoc;
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
    const row = this.row,
      net = row.home - row.solar;
    const soc = Math.min(5, Math.round(this.soc / 2));
    const deficit = this.evConnected ? Math.max(0, 32 - this.evSoc) : 0;
    const ev = deficit < 0.1 ? 0 : deficit < 8 ? 1 : 2;
    const urgency = !this.evConnected
      ? 0
      : row.hour < 7 && row.hour >= 3
        ? 2
        : 1;
    return (
      (((((this.config.observation === 'quarter-hour'
        ? row.hour * 4 + row.minute / 15
        : row.hour) *
        6 +
        soc) *
        3 +
        ev) *
        3 +
        (net < 0 ? 0 : net < 1.5 ? 1 : 2)) *
        3 +
        urgency) *
        2 +
      Number(row.gridAvailable)
    );
  }
  step(index) {
    if (this.done) throw new Error('Episode finished; restart the microgrid.');
    if (!Number.isInteger(index) || index < 0 || index > 8)
      throw new Error('Joint action must be between 0 and 8.');
    const row = this.row,
      action = MICRO_ACTIONS[index],
      config = this.config,
      previousSoc = this.soc,
      evConnected = this.evConnected;
    const requestedEv = evConnected
      ? Math.min(
          config.evRates[action.ev],
          Math.max(0, config.evTarget - this.evSoc) /
            (config.evEfficiency * config.dt)
        )
      : 0;
    const discharge =
      action.battery === 2
        ? Math.min(
            config.batteryPower,
            (this.soc * config.efficiency) / config.dt,
            Math.max(0, row.home + requestedEv - row.solar)
          )
        : 0;
    const supply =
      row.solar + (row.gridAvailable ? config.gridLimit : 0) + discharge;
    const servedHome = Math.min(row.home, supply);
    const evPower = Math.min(requestedEv, Math.max(0, supply - servedHome));
    const charge =
      action.battery === 0
        ? Math.min(
            config.batteryPower,
            (config.capacity - this.soc) / (config.efficiency * config.dt),
            Math.max(0, supply - servedHome - evPower)
          )
        : 0;
    const balance = servedHome + evPower + charge - row.solar - discharge;
    const grid = Math.max(0, balance),
      curtailed = Math.max(0, -balance);
    this.soc = Math.max(
      0,
      Math.min(
        config.capacity,
        this.soc +
          (charge * config.efficiency - discharge / config.efficiency) *
            config.dt
      )
    );
    this.evSoc = Math.min(
      config.evTarget,
      this.evSoc + evPower * config.evEfficiency * config.dt
    );
    const unserved = (row.home - servedHome) * config.dt;
    let shortfall = 0,
      departure = false;
    if (row.hour === 6 && row.minute === 45) {
      departure = true;
      shortfall = Math.max(0, config.evTarget - this.evSoc);
      this.totals.departures++;
      if (shortfall < 0.1) this.totals.readyDepartures++;
      this.evSoc = Math.max(0, this.evSoc - row.trip);
    }
    this.t++;
    this.done = this.t === this.scenario.length;
    const bill = grid * config.dt * row.price,
      carbon = grid * config.dt * row.carbon,
      wear = (charge + discharge) * config.dt * config.wear;
    const settlement = this.done
      ? (config.initialSoc - this.soc + (config.initialEvSoc - this.evSoc)) *
        0.12
      : 0;
    const cost =
      bill +
      wear +
      carbon * config.carbonWeight +
      unserved * config.unservedPenalty +
      shortfall * config.deadlinePenalty +
      settlement;
    const transition = {
      ...row,
      index: this.t - 1,
      previousSoc,
      soc: this.soc,
      evSoc: this.evSoc,
      evConnected,
      action: index,
      batteryAction: action.battery,
      evAction: action.ev,
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
      gridEnergy: grid * config.dt,
    }))
      this.totals[key] += value;
    this.history.push(transition);
    return transition;
  }
}
