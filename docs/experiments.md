# Experiment methodology and interpretation

## Separation of scenarios

| Use                 | Scenario seeds                                                   |
| ------------------- | ---------------------------------------------------------------- |
| Q-learning training | training seed × 100,000 + episode index                          |
| DQN training        | reproducible resets below 70,000,000, plus initial training seed |
| Validation          | 810000001–810000002                                              |
| Final testing       | 910000001–910000010                                              |
| Interactive replay  | 920000001–920000003                                              |

All algorithms use the same physical limits, reward accounting, and default information content. Final policies are greedy. Each controller sees identical test weeks within a profile. Training uses the balanced scenario distribution; cloudy and longer outage profiles test changes in conditions.

The published studies use final policies at fixed budgets. Validation is recorded during training but does not choose checkpoints using the test set. The original browser reference budget was previously selected using separate validation comparisons; it is presented as one reference policy, separately from multi-seed results.

## Algorithms

Q-learning uses Float32 action values, α=0.2, γ=0.995, and ε decaying from 1 to 0.05 over the first 80% of the episode budget. Greedy ties default to battery idle with EV off. Training curves aggregate 50 episodes.

DQN uses Stable-Baselines3 with a 64×64 MLP, replay buffer 50,000, batch size 64, learning rate 0.001, γ=0.995, warm-up 2,000 steps, one gradient update per four environment steps, and target updates every 1,000 steps. Exploration decays over 80% of the budget to 0.05. Validation snapshots occur every 20,000 steps; training return is the mean of the latest completed episodes in the monitor window.

DQN training uses CPU execution with one Torch thread. Results record dependency versions, code commit, source hashes, budget, seeds, and saved model hashes. Reproducibility depends on the recorded versions and platform; wall-clock measurements naturally vary.

## Aggregation and uncertainty

First average each trained policy over ten test weeks per profile. Then compute the mean and sample standard deviation across independently trained policies. Five Q-learning seeds and three DQN seeds are published.

This spread measures variation across training seeds on the fixed test set. It does not quantify every source of uncertainty, establish statistical significance, or create independent baseline observations. Deterministic baselines have no training-seed variation. Their scenario-level variation is not displayed as a confidence interval.

The DQN budget is 100,000 steps per seed versus 6,000 × 672 = 4,032,000 Q-learning steps per seed. These are deliberately explicit, unequal budgets. The study demonstrates a second agent and its failure modes, not a fair compute-matched ranking.

## Controlled comparisons

Each ablation trains five seeds at 6,000 episodes:

1. Default reward and hourly observation.
2. Set carbonWeight to zero during training.
3. Raise deadlinePenalty from 2 to 4 during training.
4. Replace hourly time buckets with quarter-hour buckets.

Evaluation restores the default reward accounting, while retaining the observation encoding required by each policy. Comparing differently scaled training returns alone would not be meaningful.

Outage severity is evaluated without retraining. Freeze five default policies and test two interruptions per week lasting one, three, or six hours. Unserved household energy rises from 3.91 to 8.99 to 21.03 kWh/week in this published experiment.

## Findings and limits

The tariff-aware rule wins the mixed-weather combined objective. Q-learning's mean beats the no-battery objective but has worse EV readiness. The single reference seed performs much better than the five-seed mean; publishing both prevents a favorable seed from standing in for reproducibility.

Removing carbon cost during training lowers the common objective in the measured ablation, despite evaluation retaining carbon cost. This does not establish that carbon penalties are generally harmful. The stronger deadline penalty improves readiness in this sample. Quarter-hour buckets expand the table fourfold and perform worse at the fixed budget; sparse state visitation is a plausible explanation, not a measured causal conclusion.

At 100,000 steps, DQN has poor readiness and high variation. The data do not establish whether a larger budget, different observation, or different hyperparameters would solve it. No changes were selected by repeatedly choosing the best held-out result.

## Artifact handling

Browser Q-learning runs use schemaVersion=1 with a run ID, source, timestamp, environment configuration/version, algorithm settings, code provenance, source fingerprint, Q-table, learning curve, and completed evaluation. Export also includes current replay telemetry and totals. Imports enforce schema, physical settings, supported observation encoding, finite values, table size, completed evaluation, and an 8 MB size limit.

IndexedDB stores completed experiments in the visitor's browser. Loading restores the policy and restarts the scenario; it does not resume a paused training job or replay position. Errors are surfaced. JSON files can transfer policies between browser profiles.

Imports require complete code, dataset, and algorithm metadata before writing to browser storage. Imported evaluation numbers are claims, not evidence: the browser replaces them by greedily evaluating the imported Q-table on all 30 held-out weeks under the default objective weights, retaining its observation encoding. Exports record this local evaluation and its scenario seeds. Training history and claimed training provenance are retained; local evaluation does not authenticate those claims.

Offline curated JSON reports and DQN model ZIP files are tracked. Generated per-run Q-table artifacts remain in ignored experiments/local/. DQN ZIP files are restored through Stable-Baselines3; the browser importer accepts Q-learning JSON only. src/dqn-replay.json contains an actual trajectory from the restored seed-42 DQN policy on replay seed 920000001.

Run artifact/model validation before trusting external files. Python model ZIP files should only be loaded from trusted sources.

## Historical code provenance

Published reports retain the commit IDs recorded when their experiments ran. Repository history was subsequently rewritten to exclude local development files and private metadata. The simulator and training source at these commits is unchanged; source and model hashes in the reports remain valid. Use the corresponding current commit to inspect each original code snapshot.

| Report    | Recorded commit                            | Current commit                                                                                                                     |
| --------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| benchmark | `7f22919bb221f0fb233980dbb855dd3e3cfb6837` | [497f9e8426573f3ac6483a06857eaef195693234](https://github.com/Arshdeep54/volt-lab/commit/497f9e8426573f3ac6483a06857eaef195693234) |
| ablations | `b5e667e5d6fcd6cdc6c31b507e006ac013d027ed` | [cb39ae36f9fe40e1a6a1e20355ceef14dcae0868](https://github.com/Arshdeep54/volt-lab/commit/cb39ae36f9fe40e1a6a1e20355ceef14dcae0868) |
| dqn       | `3b7b5048da924518934084c547ec4d8195c45ea1` | [55f900846a5d962b88a979f1497ac330886b3c04](https://github.com/Arshdeep54/volt-lab/commit/55f900846a5d962b88a979f1497ac330886b3c04) |

## References

- [Stable-Baselines3 evaluation guidance](https://stable-baselines3.readthedocs.io/en/master/guide/rl_tips.html)
- [Stable-Baselines3 DQN](https://stable-baselines3.readthedocs.io/en/master/modules/dqn.html)
