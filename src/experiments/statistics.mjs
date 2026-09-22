export function summarize(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : 0;
  return { mean, sd, n: values.length };
}
export function summarizeControllers(runs, profile) {
  return Object.fromEntries(['learned', 'rule', 'noBattery'].map(controller => [
    controller,
    Object.fromEntries(['objective','bill','carbon','unserved','shortfall','readyDepartures','departures'].map(metric => [metric, summarize(runs.map(run => run.evaluations[profile][controller][metric]))]))
  ]));
}
