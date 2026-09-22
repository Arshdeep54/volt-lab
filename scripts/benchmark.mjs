import { QAgent, evaluate } from '../src/rl.mjs';
const runs = [];
for (const seed of [42, 43, 44, 45, 46]) {
  const agent = new QAgent(seed);
  for (let i = 0; i < 1200; i++) agent.trainEpisode(i, 1200);
  runs.push({ seed, ...evaluate(agent) });
}
console.log(JSON.stringify({ episodes: 1200, runs }, null, 2));
