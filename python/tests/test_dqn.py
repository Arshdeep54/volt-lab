import numpy as np
from stable_baselines3 import DQN
from volt_lab.env import MicrogridEnv


def test_dqn_trains_and_restored_policy_matches(tmp_path):
    env = MicrogridEnv()
    model = DQN(
        "MlpPolicy",
        env,
        seed=42,
        device="cpu",
        learning_starts=16,
        buffer_size=128,
        batch_size=16,
        train_freq=4,
        policy_kwargs={"net_arch": [16]},
        verbose=0,
    )
    model.learn(total_timesteps=64)
    observation, _ = env.reset(seed=910000001)
    action, _ = model.predict(observation, deterministic=True)
    path = tmp_path / "policy"
    model.save(path)
    restored = DQN.load(path, device="cpu")
    actual, _ = restored.predict(observation, deterministic=True)
    np.testing.assert_array_equal(action, actual)
    assert env.action_space.contains(action)
    env.close()


def test_published_replay_matches_restored_dqn():
    import json
    from pathlib import Path

    import pytest
    import torch

    torch.set_num_threads(1)
    root = Path(__file__).resolve().parents[2]
    replay = json.loads((root / "src/dqn-replay.json").read_text())
    model = DQN.load(root / "experiments/models/dqn-seed-42.zip", device="cpu")
    env = MicrogridEnv()
    obs, _ = env.reset(seed=replay["scenarioSeed"])
    for expected in replay["telemetry"]:
        action, _ = model.predict(obs, deterministic=True)
        assert int(action) == expected["action"]
        obs, reward, _, _, _ = env.step(int(action))
        assert reward == pytest.approx(expected["reward"], abs=1e-9)
    assert env.simulator.totals == pytest.approx(replay["totals"], abs=1e-8)
    env.close()
