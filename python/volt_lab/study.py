"""Matched-transition and observation study; training never publishes its outputs."""

import argparse
import hashlib
import json
import math
import subprocess
from pathlib import Path
from statistics import mean, stdev
from uuid import uuid4

import torch
from stable_baselines3 import DQN

from .env import MicrogridEnv
from .evaluation import TEST_SEEDS, VALIDATION_SEEDS
from .physics import CONFIG, ENVIRONMENT_VERSION, rule_action
from .train import ROOT, train

PROFILES = ("balanced", "cloudy", "outage")
COMPONENTS = ("bill", "wear", "carbonCost", "reliabilityCost", "deadlineCost", "settlement")


def tabular_action(q, state):
    best = 3
    for action in range(9):
        if q[state * 9 + action] > q[state * 9 + best]:
            best = action
    return best


def diagnose_policy(action, profile="balanced", seeds=TEST_SEEDS, observation_mode="bucketed"):
    metrics = dict.fromkeys(
        (*COMPONENTS, "objective", "evIdleHours", "unserved", "departures", "readyDepartures"), 0.0
    )
    for seed in seeds:
        env = MicrogridEnv(profile=profile, observation_mode=observation_mode)
        observation, _ = env.reset(seed=seed)
        while not env.simulator.done:
            simulator = env.simulator
            chosen = action(env, observation)
            idle = (
                simulator.ev_connected
                and simulator.ev_soc < CONFIG["evTarget"] - 0.1
                and simulator.row["gridAvailable"]
                and chosen % 3 == 0
            )
            observation, _, _, _, record = env.step(chosen)
            values = {
                "bill": record["bill"],
                "wear": record["wear"],
                "carbonCost": record["carbon"] * CONFIG["carbonWeight"],
                "reliabilityCost": record["unserved"] * CONFIG["unservedPenalty"],
                "deadlineCost": record["shortfall"] * CONFIG["deadlinePenalty"],
                "settlement": record["settlement"],
                "objective": record["cost"],
                "evIdleHours": CONFIG["dt"] if idle else 0,
                "unserved": record["unserved"],
            }
            for key, value in values.items():
                metrics[key] += value / len(seeds)
        for key in ("departures", "readyDepartures"):
            metrics[key] += env.simulator.totals[key] / len(seeds)
        env.close()
    assert math.isclose(sum(metrics[key] for key in COMPONENTS), metrics["objective"], abs_tol=1e-8)
    return metrics


def summarize(values):
    return {"mean": mean(values), "sd": stdev(values) if len(values) > 1 else 0, "n": len(values)}


def summarize_curves(runs):
    grid = [point["step"] for point in runs[0]["curve"]]
    if any([point["step"] for point in run["curve"]] != grid for run in runs):
        raise ValueError("Learning curves must use the same checkpoint steps within a variant.")
    return [
        {
            "step": step,
            "seconds": mean(run["curve"][index]["seconds"] for run in runs),
            "objective": summarize([-run["curve"][index]["validation"] for run in runs]),
        }
        for index, step in enumerate(grid)
    ]


def load_model(path, expected_hash):
    file = ROOT / path
    if hashlib.sha256(file.read_bytes()).hexdigest() != expected_hash:
        raise ValueError("Model hash does not match its completed run.")
    return file


def analyze_runs(runs, algorithm, observation_mode):
    analyses = []
    for run in runs:
        artifact = run["artifact"]
        path = load_model(artifact["path"], artifact["sha256"])
        if algorithm == "Q-learning":
            q = json.loads(path.read_text())["q"]

            def action(env, obs):
                return tabular_action(q, env.simulator.state)
        else:
            model = DQN.load(path, device="cpu")

            def action(env, obs):
                return int(model.predict(obs, deterministic=True)[0])

        profiles = {}
        for profile in PROFILES:
            metrics = diagnose_policy(action, profile, observation_mode=observation_mode)
            if not math.isclose(
                metrics["objective"],
                run["evaluations"][profile]["learned"]["objective"],
                abs_tol=1e-7,
            ):
                raise ValueError("Restored policy does not reproduce its reported objective.")
            profiles[profile] = metrics
        analyses.append(profiles)
    return {
        profile: {
            key: summarize([analysis[profile][key] for analysis in analyses])
            for key in analyses[0][profile]
        }
        for profile in PROFILES
    }


def assemble_study(q_report, bucketed_report, continuous_report):
    torch.set_num_threads(1)
    if q_report.get("status") != "complete":
        raise ValueError("Q-learning study is incomplete.")
    for report, mode in ((bucketed_report, "bucketed"), (continuous_report, "continuous")):
        if (
            report.get("status") != "complete"
            or report["environmentVersion"] != ENVIRONMENT_VERSION
            or report["protocol"]["observation"] != mode
            or report["protocol"]["config"] != CONFIG
            or report["protocol"]["testSeeds"] != TEST_SEEDS
            or report["protocol"]["validationSeeds"] != VALIDATION_SEEDS
        ):
            raise ValueError(
                "DQN study protocols must use the common physics, seeds, and intended observation."
            )
    reports = [
        ("Q-learning / bucketed", "Q-learning", "bucketed", q_report["groups"][0]),
        ("DQN / bucketed", "DQN", "bucketed", bucketed_report),
        ("DQN / continuous", "DQN", "continuous", continuous_report),
    ]
    seeds = [42, 43, 44]
    for _, _, _, report in reports:
        if (
            report.get("status", "complete") != "complete"
            or [run["seed"] for run in report["runs"]] != seeds
        ):
            raise ValueError("Study requires complete runs with seeds 42, 43, and 44.")
    if bucketed_report["protocol"]["timesteps"] != continuous_report["protocol"]["timesteps"]:
        raise ValueError("DQN observation variants must use the same step budget.")
    expected_q_steps = math.ceil(bucketed_report["protocol"]["timesteps"] / 672) * 672
    if any(run["timesteps"] != expected_q_steps for run in reports[0][3]["runs"]):
        raise ValueError("Q-learning budget must be rounded up to complete weeks.")
    variants = []
    for name, algorithm, observation_mode, report in reports:
        variants.append(
            {
                "name": name,
                "algorithm": algorithm,
                "observation": observation_mode,
                "runs": report["runs"],
                "summary": report["summary"],
                "curve": summarize_curves(report["runs"]),
                "failureAnalysis": analyze_runs(report["runs"], algorithm, observation_mode),
            }
        )
    reference = q_report["groups"][1]
    published = json.loads((ROOT / "experiments/results/benchmark.json").read_text())["variants"][0]
    for actual, expected in zip(reference["runs"], published["runs"], strict=True):
        if actual["seed"] != expected["seed"] or not math.isclose(
            actual["evaluations"]["balanced"]["learned"]["objective"],
            expected["evaluations"]["balanced"]["learned"]["objective"],
            abs_tol=1e-8,
        ):
            raise ValueError("Reference reruns differ from published policies.")
    return {
        "schemaVersion": 1,
        "status": "complete",
        "environmentVersion": ENVIRONMENT_VERSION,
        "protocol": {
            "trainingSeeds": seeds,
            "validationSeeds": VALIDATION_SEEDS,
            "testSeeds": TEST_SEEDS,
            "config": CONFIG,
            "requestedSteps": bucketed_report["protocol"]["timesteps"],
            "selection": "fixed final policy; curves use validation only; no test-based tuning",
            "budgetMatching": "Q-learning rounds up to a whole 672-step week; actual steps recorded",
            "timing": "single-threaded DQN CPU runs; elapsed training excludes validation; local workload affects timings",
            "spread": "sample standard deviation across training seeds; not a confidence interval",
        },
        "provenance": {
            "analysisCommit": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
            ).strip(),
            "qCommit": q_report["commit"],
            "q": q_report["sourceHashes"],
            "bucketed": bucketed_report["provenance"],
            "continuous": continuous_report["provenance"],
            "analysisHash": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        },
        "variants": variants,
        "referenceFailureAnalysis": analyze_runs(reference["runs"], "Q-learning", "bucketed"),
        "referenceTrainingSeeds": [run["seed"] for run in reference["runs"]],
        "ruleFailureAnalysis": {
            profile: diagnose_policy(lambda env, obs: rule_action(env.simulator), profile)
            for profile in PROFILES
        },
    }


def run_study(timesteps=400000):
    if not 1000 <= timesteps <= 10_000_000:
        raise ValueError("Study budget must be between 1000 and 10000000 steps.")
    output = Path("experiments/local") / f"study-{uuid4().hex[:12]}"
    subprocess.run(
        ["node", "scripts/study-q.mjs", str(timesteps), str(output)], cwd=ROOT, check=True
    )
    q_report = json.loads((ROOT / output / "q-report.json").read_text())
    bucketed = train(timesteps, observation_mode="bucketed")
    continuous = train(timesteps, observation_mode="continuous")
    result = assemble_study(q_report, bucketed, continuous)
    (ROOT / output / "study.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"Completed study: {output}/study.json", flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timesteps", type=int, default=400000)
    run_study(parser.parse_args().timesteps)
