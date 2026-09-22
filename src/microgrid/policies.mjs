export function microGreedy(q, state) {
  let best = 3;
  for (let a = 0; a < 9; a++)
    if (q[state * 9 + a] > q[state * 9 + best]) best = a;
  return best;
}
export function microRule(env) {
  const r = env.row,
    needed = Math.max(0, 32 - env.evSoc);
  const battery = !r.gridAvailable
    ? 2
    : r.price <= 0.09 || r.solar > r.home
      ? 0
      : r.price >= 0.36
        ? 2
        : 1;
  const ev =
    env.evConnected &&
    needed > 0.1 &&
    (r.price <= 0.09 || (r.hour < 7 && r.hour >= 3) || r.solar > r.home + 1.8)
      ? 2
      : 0;
  return battery * 3 + ev;
}
