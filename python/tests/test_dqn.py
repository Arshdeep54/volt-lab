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
