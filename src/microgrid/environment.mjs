import { MICRO_ACTIONS, MICRO_CONFIG } from './config.mjs';
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
