import { random } from '../rl.mjs';
export function generateMicrogrid(seed, profile = 'balanced') {
  const rng = random(seed),
    rows = [],
    outageDay = Math.floor(rng() * 7);
  for (let day = 0; day < 7; day++) {
    const sunlight =
      profile === 'cloudy' ? 0.2 + rng() * 0.2 : 0.45 + rng() * 0.55;
    const trip = 10 + rng() * 7;
    for (let quarter = 0; quarter < 96; quarter++) {
      const time = quarter / 4,
        hour = Math.floor(time),
        minute = (quarter % 4) * 15;
      const gridAvailable = !(profile === 'outage'
        ? (day === 2 || day === 5) && time >= 17 && time < 20
        : day === outageDay && time >= 18 && time < 19);
      rows.push({
        day,
        hour,
        minute,
        time,
        trip,
        gridAvailable,
        price: hour < 7 ? 0.09 : hour >= 17 && hour < 22 ? 0.36 : 0.18,
        home:
          0.65 +
          rng() * 0.6 +
          (hour >= 17 && hour < 22 ? 1.6 : 0) +
          (hour >= 7 && hour < 9 ? 0.65 : 0),
        solar:
          Math.max(0, Math.sin(((time - 6) / 12) * Math.PI)) *
          5 *
          sunlight *
          (0.85 + rng() * 0.15),
        carbon:
          hour >= 17 && hour < 22 ? 0.65 : hour >= 10 && hour < 16 ? 0.3 : 0.45,
      });
    }
  }
  return rows;
}
