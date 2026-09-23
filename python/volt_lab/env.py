"""Gymnasium API for the finite seven-day microgrid task."""

import gymnasium as gym
import numpy as np

from .physics import CONFIG, MicrogridSimulator
from .scenario import generate_scenario


class MicrogridEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, profile="balanced", config=None, observation_mode="bucketed"):
        if observation_mode not in ("bucketed", "continuous"):
            raise ValueError("Observation mode must be bucketed or continuous.")
        self.profile = profile
        self.observation_mode = observation_mode
        self.config = {**CONFIG, **(config or {})}
        self.action_space = gym.spaces.Discrete(9)
        # Same information as the tabular agent, normalized for the neural network.
        self.observation_space = gym.spaces.Box(
            0, 1, shape=(8 if observation_mode == "continuous" else 6,), dtype=np.float32
        )
        self.simulator = None

    def observation(self):
        if self.observation_mode == "continuous":
            simulator = self.simulator
            row = simulator.row
            time = row["hour"] + row["minute"] / 60
            return np.array(
                [
                    time / 23.75,
                    simulator.soc / self.config["capacity"],
                    simulator.ev_soc / self.config["evTarget"],
                    np.clip((row["home"] - row["solar"] + 5) / 10, 0, 1),
                    float(simulator.ev_connected),
                    ((7 - time) % 24 or 24) / 24,
                    (len(simulator.rows) - simulator.t) / len(simulator.rows),
                    float(row["gridAvailable"]),
                ],
                dtype=np.float32,
            )
        buckets = self.simulator.buckets
        clock_scale = 95 if self.config["observation"] == "quarter-hour" else 23
        return np.array(buckets, dtype=np.float32) / np.array(
            [clock_scale, 5, 2, 2, 2, 1], dtype=np.float32
        )

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        options = options or {}
        scenario_seed = options.get(
            "scenario_seed",
            seed if seed is not None else int(self.np_random.integers(1, 70_000_000)),
        )
        profile = options.get("profile", self.profile)
        self.simulator = MicrogridSimulator(generate_scenario(scenario_seed, profile), self.config)
        return self.observation(), {"scenario_seed": scenario_seed}

    def step(self, action):
        if self.simulator is None:
            raise RuntimeError("Call reset before step.")
        if not self.action_space.contains(action):
            raise ValueError("Joint action must be between 0 and 8.")
        record = self.simulator.step(int(action))
        # Settlement defines a task terminal at the end of the week, not an external time limit.
        return self.observation(), record["reward"], record["done"], False, record
