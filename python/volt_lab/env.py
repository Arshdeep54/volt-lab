"""Gymnasium API for the finite seven-day microgrid task."""
import gymnasium as gym
import numpy as np
from .physics import MicrogridSimulator, CONFIG
from .scenario import generate_scenario


class MicrogridEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, profile="balanced", config=None):
        self.profile = profile
        self.config = {**CONFIG, **(config or {})}
        self.action_space = gym.spaces.Discrete(9)
        # Same information as the tabular agent, normalized for the neural network.
        self.observation_space = gym.spaces.Box(0, 1, shape=(6,), dtype=np.float32)
        self.simulator = None

    def observation(self):
        buckets = self.simulator.buckets
        clock_scale = 95 if self.config["observation"] == "quarter-hour" else 23
        return np.array(buckets, dtype=np.float32) / np.array([clock_scale, 5, 2, 2, 2, 1], dtype=np.float32)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        options = options or {}
        scenario_seed = options.get("scenario_seed", seed if seed is not None else int(self.np_random.integers(1, 70_000_000)))
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
