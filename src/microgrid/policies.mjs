export function microGreedy(q, state) {
  let best = 3;
  for (let a = 0; a < 9; a++)
    if (q[state * 9 + a] > q[state * 9 + best]) best = a;
  return best;
}
export function microRule(env) {
  const row = env.row,
    needed = Math.max(0, 32 - env.evSoc);
  const battery = !row.gridAvailable
    ? 2
    : row.price <= 0.09 || row.solar > row.home
      ? 0
      : row.price >= 0.36
        ? 2
        : 1;
  const ev =
    env.evConnected &&
    needed > 0.1 &&
    (row.price <= 0.09 ||
      (row.hour < 7 && row.hour >= 3) ||
      row.solar > row.home + 1.8)
      ? 2
      : 0;
  return battery * 3 + ev;
}
