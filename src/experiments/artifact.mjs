import {
  MICRO_CONFIG,
  MICRO_ENV_VERSION,
  MICRO_TEST_SEEDS,
  stateCount,
} from '../microgrid/config.mjs';
import { evaluateMicrogrid } from '../microgrid/evaluation.mjs';

export function createRun(model, provenance = {}) {
  const config = { ...MICRO_CONFIG, ...model.config };
  return {
    schemaVersion: 1,
    project: 'Volt Lab microgrid',
    id: 'q-' + model.seed + '-' + crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'complete',
    source: provenance.source ?? 'training',
    environment: { version: MICRO_ENV_VERSION, config },
    dataset: {
      name: 'seeded-synthetic-microgrid-v1',
      fingerprint: provenance.scenarioHash ?? null,
    },
    code: {
      commit: provenance.commit ?? null,
      environmentHash: provenance.environmentHash ?? null,
    },
    algorithm: {
      name: 'Q-learning',
      alpha: 0.2,
      gamma: 0.995,
      epsilonFloor: 0.05,
      seed: model.seed,
      episodes: model.episodes,
    },
    model: { ...model, config },
  };
}

export function validateRun(run) {
  if (
    !run ||
    run.schemaVersion !== 1 ||
    run.project !== 'Volt Lab microgrid' ||
    run.status !== 'complete' ||
    typeof run.id !== 'string' ||
    run.id.length > 120 ||
    !Number.isFinite(Date.parse(run.createdAt)) ||
    run.environment?.version !== MICRO_ENV_VERSION ||
    run.algorithm?.name !== 'Q-learning'
  )
    throw new Error('Unsupported experiment artifact.');
  if (
    typeof run.source !== 'string' ||
    !run.source ||
    run.source.length > 80 ||
    !run.code ||
    !run.dataset ||
    typeof run.dataset.name !== 'string' ||
    ![run.code.commit, run.code.environmentHash, run.dataset.fingerprint].every(
      (value) =>
        value === null || (typeof value === 'string' && value.length <= 128)
    ) ||
    run.algorithm.alpha !== 0.2 ||
    run.algorithm.gamma !== 0.995 ||
    run.algorithm.epsilonFloor !== 0.05
  )
    throw new Error('Invalid experiment metadata.');
  const model = run.model,
    config = run.environment.config;
  if (
    !model ||
    !config ||
    !['hourly', 'quarter-hour'].includes(config.observation) ||
    !Number.isInteger(model.seed) ||
    model.seed < 0 ||
    !Number.isInteger(model.episodes) ||
    model.episodes < 1 ||
    model.episodes > 100000 ||
    model.seed !== run.algorithm.seed ||
    model.episodes !== run.algorithm.episodes
  ) {
    throw new Error('Invalid experiment settings.');
  }
  for (const key of Object.keys(MICRO_CONFIG)) {
    if (key === 'observation') continue;
    if (['carbonWeight', 'deadlinePenalty'].includes(key)) {
      if (!Number.isFinite(config[key]) || config[key] < 0 || config[key] > 10)
        throw new Error('Invalid reward weights.');
    } else if (
      JSON.stringify(config[key]) !== JSON.stringify(MICRO_CONFIG[key])
    ) {
      throw new Error('Unsupported physical configuration.');
    }
  }
  if (
    !model.config ||
    Object.keys(config).some(
      (key) => JSON.stringify(model.config[key]) !== JSON.stringify(config[key])
    )
  )
    throw new Error('Model and environment settings disagree.');
  if (
    !Array.isArray(model.q) ||
    model.q.length !== stateCount(config) * 9 ||
    !model.q.every(Number.isFinite)
  ) {
    throw new Error('Invalid Q-table.');
  }
  if (
    !Array.isArray(model.curve) ||
    model.curve.length > 2000 ||
    !model.curve.every((point) =>
      ['episode', 'reward', 'validation', 'epsilon', 'error'].every((key) =>
        Number.isFinite(point?.[key])
      )
    )
  ) {
    throw new Error('Invalid learning curve.');
  }
  for (const profile of ['balanced', 'cloudy', 'outage']) {
    for (const controller of ['learned', 'rule', 'noBattery']) {
      const metrics = model.evaluations?.[profile]?.[controller];
      if (
        !metrics ||
        ![
          'objective',
          'bill',
          'carbon',
          'unserved',
          'shortfall',
          'readyDepartures',
          'departures',
        ].every((key) => Number.isFinite(metrics[key]))
      ) {
        throw new Error('Missing completed evaluation.');
      }
    }
  }
  return run;
}

export function verifyImportedRun(run, provenance = {}) {
  validateRun(run);
  const config = { ...MICRO_CONFIG, observation: run.model.config.observation };
  const evaluations = Object.fromEntries(
    ['balanced', 'cloudy', 'outage'].map((profile) => [
      profile,
      evaluateMicrogrid(run.model, MICRO_TEST_SEEDS, profile, config),
    ])
  );
  return {
    ...run,
    source: 'import',
    model: { ...run.model, evaluations },
    evaluation: {
      method: 'locally recomputed greedy evaluation',
      environmentVersion: MICRO_ENV_VERSION,
      config,
      testSeeds: MICRO_TEST_SEEDS,
      code: {
        commit: provenance.commit ?? null,
        environmentHash: provenance.environmentHash ?? null,
        scenarioHash: provenance.scenarioHash ?? null,
      },
      verifiedAt: new Date().toISOString(),
    },
  };
}
