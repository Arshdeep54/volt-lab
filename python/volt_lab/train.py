"""CPU DQN experiments with versioned artifacts and fixed held-out tests."""
import argparse
import hashlib
import json
import subprocess
import time
from importlib.metadata import version
from pathlib import Path
from statistics import mean, stdev
import torch
from stable_baselines3 import DQN
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.monitor import Monitor
from .env import MicrogridEnv
from .evaluation import evaluate, TEST_SEEDS, VALIDATION_SEEDS
from .physics import CONFIG, ENVIRONMENT_VERSION

ROOT = Path(__file__).resolve().parents[2]
HYPERPARAMETERS = dict(learning_rate=0.001, buffer_size=50000, learning_starts=2000,
                      batch_size=64, gamma=0.995, train_freq=4, gradient_steps=1,
                      target_update_interval=1000, exploration_fraction=0.8,
                      exploration_final_eps=0.05, policy_kwargs={"net_arch": [64, 64]})


class ValidationCallback(BaseCallback):
    def __init__(self):
        super().__init__()
        self.curve = []

    def _on_step(self):
        if self.num_timesteps % 20000 == 0:
            validation = evaluate(self.model, VALIDATION_SEEDS)["learned"]["objective"]
            episodes = list(self.model.ep_info_buffer)
            self.curve.append(dict(step=self.num_timesteps,
                                   reward=mean(item["r"] for item in episodes) if episodes else 0,
                                   validation=-validation,
                                   epsilon=float(self.model.exploration_rate)))
            print(f"step {self.num_timesteps}: validation objective {validation:.2f}", flush=True)
        return True


def train(timesteps=100000, seeds=(42, 43, 44)):
    torch.set_num_threads(1)
    output = ROOT / "experiments/models"
    output.mkdir(parents=True, exist_ok=True)
    runs = []
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    for seed in seeds:
        started = time.perf_counter()
        env = Monitor(MicrogridEnv())
        model = DQN("MlpPolicy", env, seed=seed, device="cpu", **HYPERPARAMETERS)
        callback = ValidationCallback()
        model.learn(total_timesteps=timesteps, callback=callback)
        model_path = output / f"dqn-seed-{seed}.zip"
        model.save(model_path)
        evaluations = {profile: evaluate(model, profile=profile) for profile in ("balanced", "cloudy", "outage")}
        run = dict(id=f"dqn-{seed}-{timesteps}", seed=seed, timesteps=model.num_timesteps,
                   seconds=time.perf_counter() - started, hyperparameters=HYPERPARAMETERS,
                   curve=callback.curve, evaluations=evaluations,
                   artifact={"path": str(model_path.relative_to(ROOT)), "sha256": hashlib.sha256(model_path.read_bytes()).hexdigest()})
        runs.append(run)
        env.close()
        print(f"seed {seed}: test objective {evaluations['balanced']['learned']['objective']:.2f}; {run['seconds']:.1f}s", flush=True)
    summary = {}
    for profile in ("balanced", "cloudy", "outage"):
        summary[profile] = {}
        for controller in ("learned", "rule", "noBattery"):
            summary[profile][controller] = {}
            for metric in ("objective", "bill", "carbon", "unserved", "shortfall", "readyDepartures", "departures"):
                values = [run["evaluations"][profile][controller][metric] for run in runs]
                summary[profile][controller][metric] = dict(mean=mean(values), sd=stdev(values) if len(values) > 1 else 0, n=len(values))
    result = dict(schemaVersion=1, algorithm="DQN", environmentVersion=ENVIRONMENT_VERSION,
                  provenance={"commit": commit, "dependencies": {name: version(name) for name in ("torch", "gymnasium", "stable-baselines3", "numpy")},
                              "environmentHash": hashlib.sha256((ROOT / "python/volt_lab/physics.py").read_bytes()).hexdigest(),
                              "scenarioHash": hashlib.sha256((ROOT / "python/volt_lab/scenario.py").read_bytes()).hexdigest()},
                  protocol={"trainingSeeds": list(seeds), "timesteps": timesteps,
                            "trainingScenarioSeeds": "seeded resets in [1, 70000000), plus initial training seed",
                            "validationSeeds": VALIDATION_SEEDS, "testSeeds": TEST_SEEDS,
                            "config": CONFIG, "selection": "fixed final policy; no test-based checkpoint selection",
                            "observation": "six normalized discrete buckets; same information as hourly tabular agent",
                            "spread": "sample standard deviation across training seeds"},
                  runs=runs, summary=summary)
    (ROOT / "experiments/results").mkdir(parents=True, exist_ok=True)
    (ROOT / "experiments/results/dqn.json").write_text(json.dumps(result, indent=2) + "\n")
    # Export a reproducible trajectory for optional offline DQN replay.
    replay_model = DQN.load(output / f"dqn-seed-{seeds[0]}.zip", device="cpu")
    replay_env = MicrogridEnv()
    obs, _ = replay_env.reset(seed=920000001)
    while not replay_env.simulator.done:
        action, _ = replay_model.predict(obs, deterministic=True)
        obs, _, _, _, _ = replay_env.step(int(action))
    replay = dict(algorithm="DQN", seed=seeds[0], scenarioSeed=920000001,
                  modelSha256=runs[0]["artifact"]["sha256"], telemetry=replay_env.simulator.history,
                  totals=replay_env.simulator.totals)
    (ROOT / "src/dqn-replay.json").write_text(json.dumps(replay))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timesteps", type=int, default=100000)
    parser.add_argument("--seeds", type=int, nargs="+", default=[42, 43, 44])
    args = parser.parse_args()
    if args.timesteps < 1000 or args.timesteps > 10_000_000:
        parser.error("timesteps must be between 1000 and 10000000")
    train(args.timesteps, tuple(args.seeds))
