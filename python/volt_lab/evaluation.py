"""Greedy held-out evaluation shared by DQN experiments."""

from .env import MicrogridEnv
from .physics import rule_action

TEST_SEEDS = list(range(910000001, 910000011))
VALIDATION_SEEDS = [810000001, 810000002]


def evaluate(model, seeds=TEST_SEEDS, profile="balanced"):
    results = {"scenarios": len(seeds), "profile": profile}
    for controller in ("learned", "rule", "noBattery"):
        totals = None
        for seed in seeds:
            env = MicrogridEnv(profile=profile)
            obs, _ = env.reset(seed=seed)
            done = False
            while not done:
                if controller == "learned":
                    action, _ = model.predict(obs, deterministic=True)
                    action = int(action)
                else:
                    action = rule_action(env.simulator)
                    if controller == "noBattery":
                        action = 3 + action % 3
                obs, _, done, _, _ = env.step(action)
            if totals is None:
                totals = {key: 0.0 for key in env.simulator.totals}
            for key, value in env.simulator.totals.items():
                totals[key] += value / len(seeds)
            env.close()
        results[controller] = totals
    return results
