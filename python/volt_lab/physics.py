"""Energy-conserving microgrid transitions, independent of Gymnasium."""

import json
import math
from importlib.resources import files

CONFIG = json.loads(files("volt_lab").joinpath("config.json").read_text())
ENVIRONMENT_VERSION = "microgrid-v1"


class MicrogridSimulator:
    def __init__(self, rows, config=None):
        self.config = {**CONFIG, **(config or {})}
        self.rows = rows
        self.t = 0
        self.done = False
        self.soc = self.config["initialSoc"]
        self.ev_soc = self.config["initialEvSoc"]
        self.history = []
        self.totals = dict(
            objective=0.0,
            bill=0.0,
            carbon=0.0,
            unserved=0.0,
            shortfall=0.0,
            gridEnergy=0.0,
            departures=0,
            readyDepartures=0,
        )

    @property
    def row(self):
        return self.rows[min(self.t, len(self.rows) - 1)]

    @property
    def ev_connected(self):
        return self.row["hour"] < 7 or self.row["hour"] >= 18

    @property
    def buckets(self):
        row = self.row
        net = row["home"] - row["solar"]
        soc = min(5, math.floor(self.soc / 2 + 0.5))
        deficit = max(0, 32 - self.ev_soc) if self.ev_connected else 0
        ev = 0 if deficit < 0.1 else 1 if deficit < 8 else 2
        urgency = 0 if not self.ev_connected else 2 if 3 <= row["hour"] < 7 else 1
        clock = (
            row["hour"] * 4 + row["minute"] // 15
            if self.config["observation"] == "quarter-hour"
            else row["hour"]
        )
        return (
            clock,
            soc,
            ev,
            (0 if net < 0 else 1 if net < 1.5 else 2),
            urgency,
            int(row["gridAvailable"]),
        )

    @property
    def state(self):
        clock, soc, ev, net, urgency, grid = self.buckets
        return ((((clock * 6 + soc) * 3 + ev) * 3 + net) * 3 + urgency) * 2 + grid

    def step(self, action):
        if self.done:
            raise RuntimeError("Episode finished; reset the environment.")
        if not isinstance(action, int) or not 0 <= action < 9:
            raise ValueError("Joint action must be between 0 and 8.")
        row, config = self.row, self.config
        battery_action, ev_action = divmod(action, 3)
        previous_soc, connected = self.soc, self.ev_connected
        requested_ev = (
            min(
                config["evRates"][ev_action],
                max(0, config["evTarget"] - self.ev_soc) / (config["evEfficiency"] * config["dt"]),
            )
            if connected
            else 0
        )
        discharge = (
            min(
                config["batteryPower"],
                self.soc * config["efficiency"] / config["dt"],
                max(0, row["home"] + requested_ev - row["solar"]),
            )
            if battery_action == 2
            else 0
        )
        supply = row["solar"] + (config["gridLimit"] if row["gridAvailable"] else 0) + discharge
        served_home = min(row["home"], supply)
        ev_power = min(requested_ev, max(0, supply - served_home))
        charge = (
            min(
                config["batteryPower"],
                (config["capacity"] - self.soc) / (config["efficiency"] * config["dt"]),
                max(0, supply - served_home - ev_power),
            )
            if battery_action == 0
            else 0
        )
        balance = served_home + ev_power + charge - row["solar"] - discharge
        grid, curtailed = max(0, balance), max(0, -balance)
        self.soc = max(
            0,
            min(
                config["capacity"],
                self.soc
                + (charge * config["efficiency"] - discharge / config["efficiency"]) * config["dt"],
            ),
        )
        self.ev_soc = min(
            config["evTarget"],
            self.ev_soc + ev_power * config["evEfficiency"] * config["dt"],
        )
        unserved = (row["home"] - served_home) * config["dt"]
        shortfall, departure = 0, row["hour"] == 6 and row["minute"] == 45
        if departure:
            shortfall = max(0, config["evTarget"] - self.ev_soc)
            self.totals["departures"] += 1
            self.totals["readyDepartures"] += int(shortfall < 0.1)
            self.ev_soc = max(0, self.ev_soc - row["trip"])
        self.t += 1
        self.done = self.t == len(self.rows)
        bill = grid * config["dt"] * row["price"]
        carbon = grid * config["dt"] * row["carbon"]
        wear = (charge + discharge) * config["dt"] * config["wear"]
        settlement = (
            ((config["initialSoc"] - self.soc) + (config["initialEvSoc"] - self.ev_soc)) * 0.12
            if self.done
            else 0
        )
        cost = (
            bill
            + wear
            + carbon * config["carbonWeight"]
            + unserved * config["unservedPenalty"]
            + shortfall * config["deadlinePenalty"]
            + settlement
        )
        record = {
            **row,
            "index": self.t - 1,
            "previousSoc": previous_soc,
            "soc": self.soc,
            "evSoc": self.ev_soc,
            "evConnected": connected,
            "action": action,
            "batteryAction": battery_action,
            "evAction": ev_action,
            "requestedEv": requested_ev,
            "evPower": ev_power,
            "servedHome": served_home,
            "grid": grid,
            "curtailed": curtailed,
            "charge": charge,
            "discharge": discharge,
            "bill": bill,
            "carbon": carbon,
            "wear": wear,
            "unserved": unserved,
            "shortfall": shortfall,
            "departure": departure,
            "settlement": settlement,
            "cost": cost,
            "reward": -cost,
            "done": self.done,
        }
        for key, value in dict(
            objective=cost,
            bill=bill,
            carbon=carbon,
            unserved=unserved,
            shortfall=shortfall,
            gridEnergy=grid * config["dt"],
        ).items():
            self.totals[key] += value
        self.history.append(record)
        return record


def rule_action(simulator):
    row = simulator.row
    battery = (
        2
        if not row["gridAvailable"]
        else 0
        if row["price"] <= 0.09 or row["solar"] > row["home"]
        else 2
        if row["price"] >= 0.36
        else 1
    )
    ev = (
        2
        if simulator.ev_connected
        and 32 - simulator.ev_soc > 0.1
        and (row["price"] <= 0.09 or 3 <= row["hour"] < 7 or row["solar"] > row["home"] + 1.8)
        else 0
    )
    return battery * 3 + ev
