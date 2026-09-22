export const MICRO_CONFIG = Object.freeze({
  observation: 'hourly',
  dt: 0.25,
  steps: 672,
  capacity: 10,
  batteryPower: 3,
  efficiency: 0.95,
  gridLimit: 5,
  evCapacity: 40,
  evTarget: 32,
  evEfficiency: 0.92,
  evRates: [0, 1.8, 3.6],
  wear: 0.015,
  carbonWeight: 0.05,
  unservedPenalty: 4,
  deadlinePenalty: 2,
  initialSoc: 5,
  initialEvSoc: 24,
});
export const MICRO_ACTIONS = Array.from({ length: 9 }, (_, i) => ({
  battery: Math.floor(i / 3),
  ev: i % 3,
}));
export const MICRO_TEST_SEEDS = Array.from(
  { length: 10 },
  (_, i) => 910000001 + i
);
export const MICRO_VALIDATION_SEEDS = [810000001, 810000002];

export const MICRO_ENV_VERSION = 'microgrid-v1';
export const stateCount = (config) =>
  (config.observation === 'quarter-hour' ? 96 : 24) * 6 * 3 * 3 * 3 * 2;
