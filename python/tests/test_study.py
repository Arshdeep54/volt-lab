import math

import pytest
from volt_lab.evaluation import TEST_SEEDS, VALIDATION_SEEDS
from volt_lab.physics import CONFIG, ENVIRONMENT_VERSION, rule_action
from volt_lab.study import (
    COMPONENTS,
    assemble_study,
    diagnose_policy,
    summarize_curves,
    tabular_action,
)


def test_failure_analysis_reconciles_costs_and_exposes_missed_charging():
    idle = diagnose_policy(lambda env, obs: 3, seeds=[910000001])
    rule = diagnose_policy(lambda env, obs: rule_action(env.simulator), seeds=[910000001])
    for result in (idle, rule):
        assert math.isclose(
            sum(result[key] for key in COMPONENTS), result["objective"], abs_tol=1e-8
        )
        assert result["departures"] == 7
    assert idle["deadlineCost"] > rule["deadlineCost"]
    assert idle["readyDepartures"] < rule["readyDepartures"]
    assert idle["evIdleHours"] > rule["evIdleHours"]
    assert tabular_action([0] * 9, 0) == 3


def test_curve_aggregation_preserves_steps_times_and_training_seed_variation():
    runs = [
        {"curve": [{"step": 20000, "seconds": seconds, "validation": -objective}]}
        for seconds, objective in [(10, 20), (12, 30), (14, 40)]
    ]
    curve = summarize_curves(runs)
    assert curve == [{"step": 20000, "seconds": 12, "objective": {"mean": 30, "sd": 10, "n": 3}}]
    runs[-1]["curve"][0]["step"] = 40000
    with pytest.raises(ValueError, match="checkpoint steps"):
        summarize_curves(runs)


def test_study_rejects_incomplete_runs_and_unequal_dqn_budgets():
    with pytest.raises(ValueError, match="incomplete"):
        assemble_study({"status": "in-progress"}, {}, {})
    runs = [{"seed": seed, "timesteps": 400512} for seed in [42, 43, 44]]
    q = {"status": "complete", "groups": [{"runs": runs}]}

    def report(mode, steps):
        return {
            "status": "complete",
            "environmentVersion": ENVIRONMENT_VERSION,
            "runs": runs,
            "protocol": {
                "observation": mode,
                "config": CONFIG,
                "testSeeds": TEST_SEEDS,
                "validationSeeds": VALIDATION_SEEDS,
                "timesteps": steps,
            },
        }

    with pytest.raises(ValueError, match="same step budget"):
        assemble_study(q, report("bucketed", 100000), report("continuous", 400000))
