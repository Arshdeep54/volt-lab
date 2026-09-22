# Microgrid environment contract

The task is a finite seven-day episode with 672 fifteen-minute intervals. Environment version: microgrid-v1. JavaScript implements the browser/reference simulator; Python implements equivalent transitions behind Gymnasium. Changes to physics or observation semantics must update parity fixtures and the environment version.

## Devices and supply

| Quantity                 | Value                                  |
| ------------------------ | -------------------------------------- |
| Interval length          | 0.25 hours                             |
| Stationary battery       | 10 kWh, initially 5 kWh                |
| Battery power            | 3 kW on the bus side                   |
| Battery efficiency       | 0.95 each direction, 0.9025 round-trip |
| Grid import limit        | 5 kW; zero during an outage            |
| EV capacity              | 40 kWh; initially 24 kWh               |
| EV charging goal         | 32 kWh at 07:00                        |
| EV availability          | Home from 18:00 until 07:00            |
| EV charging rates        | 0, 1.8, or 3.6 kW                      |
| EV charging efficiency   | 0.92                                   |
| Daily travel consumption | Seeded 10–17 kWh                       |
| Solar nameplate          | 5 kW before weather/time scaling       |

Action encoding: batteryAction × 3 + evAction. Battery actions 0/1/2 mean charge/idle/discharge; EV actions 0/1/2 mean off/slow/fast.

Available supply consists of solar, permitted grid import, and requested battery discharge. Allocate it to household demand first, then requested EV charging, then stationary battery charging. Any unsupported household demand is unserved; unsupported charging is clipped. Surplus solar is curtailed.

Every interval conserves bus-side power:

```text
grid + solar + battery_discharge
= served_household + ev_charging + battery_charge + curtailed_solar
```

Stored battery energy changes by (charge × efficiency − discharge / efficiency) × interval length. EV stored energy increases by charging × EV efficiency × interval length. Neither device may exceed its limits.

At 06:45, apply the last charging interval before measuring the departure shortfall and readiness. Then subtract travel energy, clipping at zero. The EV is disconnected from 07:00 until 18:00.

## Scenario profiles

All profiles contain seeded household variation, solar variation, travel energy, synthetic tariffs, and carbon intensity.

- Balanced/cloudy: one seeded one-hour interruption at 18:00.
- Cloudy: lower daily solar scaling.
- Outage: interruptions on days 3 and 6 from 17:00 for three hours.
- Severity tests: replace those three-hour interruptions with one or six hours.

Tariffs: $0.09/kWh before 07:00, $0.36/kWh from 17:00 through 21:59, and $0.18/kWh otherwise. Modeled grid intensity: 0.65 kg/kWh in the evening peak, 0.30 at midday, and 0.45 otherwise.

## Observation and actions

Default discrete state:

```text
hour: 24 × battery SOC: 6 × EV deficit: 3
× household-minus-solar: 3 × urgency: 3 × grid availability: 2
= 7,776 states
```

SOC is rounded into 2 kWh buckets. EV deficit buckets distinguish goal met, less than 8 kWh remaining, and at least 8 kWh remaining. Disconnected EVs have zero reported deficit and urgency. Net demand distinguishes surplus solar, demand below 1.5 kW, and higher demand. Urgency distinguishes away, ordinary charging, and 03:00–07:00 charging.

The quarter-hour ablation replaces 24 hour buckets with 96 quarter-hour buckets, giving 31,104 states. The default table contains 69,984 action values. DQN receives the same six buckets normalized to [0,1], with Discrete(9) actions.

The representation omits exact SOC, day, remaining episode horizon, and future weather. This is approximate observation-based control; claims of a fully observed Markov environment would be inaccurate.

## Objective

Reward is negative cost:

```text
electricity_bill
+ battery_wear
+ grid_carbon × carbon_weight
+ unserved_household_energy × reliability_penalty
+ EV_departure_shortfall × deadline_penalty
+ terminal_energy_settlement
```

Defaults: wear $0.015/kWh moved; carbon $0.05/kg; unserved household $4/kWh; EV departure shortfall $2/kWh. Terminal settlement values the difference from initial stationary battery and EV energy at $0.12/kWh. It is a comparison convention, not a market liquidation price.

The week ends after the final interval, including settlement. Gymnasium returns terminated=True, truncated=False because settlement defines the end of the task. Terminal Q-learning targets contain reward alone.

The tariff-aware baseline fills the battery during cheap prices or solar surplus, discharges during outages/peak prices, and charges the EV during cheap/urgent/surplus periods. The no-battery baseline idles the stationary battery while retaining the same EV heuristic.

## References

- [Gymnasium custom environments](https://gymnasium.farama.org/introduction/create_custom_env/)
- [Stable-Baselines3 custom environments](https://stable-baselines3.readthedocs.io/en/master/guide/custom_env.html)
