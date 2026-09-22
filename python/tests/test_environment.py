import json
from pathlib import Path

import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env
from stable_baselines3.common.env_checker import check_env as check_sb3
from volt_lab.env import MicrogridEnv
from volt_lab.physics import CONFIG, MicrogridSimulator
from volt_lab.scenario import generate_scenario

ROOT = Path(__file__).resolve().parents[2]


def test_complete_weeks_match_javascript_transitions():
    data = json.loads((ROOT / "shared/parity.json").read_text())
    assert CONFIG == data["config"]
    for fixture in data["fixtures"]:
        rows = generate_scenario(fixture["seed"], fixture["profile"])
        for actual, expected in zip(rows, fixture["rows"], strict=True):
            for key in expected:
                assert actual[key] == pytest.approx(expected[key], abs=1e-12)
        simulator = MicrogridSimulator(rows)
        for expected in fixture["transitions"]:
            assert simulator.state == expected["state"]
            step = simulator.step(expected["action"])
            assert simulator.state == expected["nextState"]
            for key in expected.keys() - {"action", "state", "nextState"}:
                assert step[key] == pytest.approx(expected[key], abs=1e-10)
        assert simulator.totals == pytest.approx(fixture["totals"], abs=1e-9)


def test_gymnasium_and_sb3_contracts():
    check_env(MicrogridEnv(), skip_render_check=True)
    check_sb3(MicrogridEnv(), warn=True)


def test_reset_is_reproducible_and_week_is_terminal():
    env = MicrogridEnv(profile="outage")
    obs, _ = env.reset(seed=42)
    initial = obs.copy()
    for _ in range(672):
        obs, _, terminated, truncated, _ = env.step(8)
        assert env.observation_space.contains(obs)
        assert not truncated
    assert terminated
    with pytest.raises(RuntimeError):
        env.step(0)
    obs, _ = env.reset(seed=42)
    np.testing.assert_array_equal(initial, obs)
    with pytest.raises(ValueError):
        env.step(9)
