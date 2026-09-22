import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { MicrogridAgent, evaluateMicrogrid, MICRO_CONFIG, MICRO_VALIDATION_SEEDS, MICRO_TEST_SEEDS } from '../src/microgrid.mjs';
import { createRun } from '../src/experiments/artifact.mjs';
import { summarizeControllers } from '../src/experiments/statistics.mjs';

const episodes = Number(process.argv[2] || 6000);
if (!Number.isInteger(episodes) || episodes < 50 || episodes > 100000) throw new Error('Budget must be 50–100000 episodes.');
const mode = process.argv[3] || 'benchmark';
if (!['benchmark','ablations'].includes(mode)) throw new Error('Choose benchmark or ablations.');
const root = new URL('../', import.meta.url);
const provenance = {
  commit: execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  scenarioHash: createHash('sha256').update(await readFile(new URL('src/microgrid/scenario.mjs',root))).digest('hex'),
  environmentHash: createHash('sha256').update(await readFile(new URL('src/microgrid/environment.mjs',root))).digest('hex'),
};
const variants = mode === 'benchmark' ? [{name:'default',config:{}}] : [
  {name:'default',config:{}},
  {name:'no-carbon-cost',config:{carbonWeight:0}},
  {name:'stronger-ev-deadline',config:{deadlinePenalty:4}},
  {name:'quarter-hour-observation',config:{observation:'quarter-hour'}},
];
const trainingSeeds = [42,43,44,45,46];
const reports = [];
await mkdir(new URL('experiments/local/',root),{recursive:true});
await mkdir(new URL('experiments/results/',root),{recursive:true});
for (const variant of variants) {
  const runs = [];
  for (const seed of trainingSeeds) {
    const started = performance.now(), agent = new MicrogridAgent(seed,variant.config), curve = [];
    let rewards = [];
    for (let ep=0; ep<episodes; ep++) {
      const point = agent.trainEpisode(ep,episodes);
      rewards.push(point.reward);
      if ((ep+1)%50===0 || ep+1===episodes) {
        curve.push({...point,reward:rewards.reduce((a,b)=>a+b,0)/rewards.length,validation:-evaluateMicrogrid(agent,MICRO_VALIDATION_SEEDS).learned.objective});
        rewards=[];
      }
    }
    // Evaluate all variants with the same reward accounting, retaining each policy's observation encoding.
    const evaluationConfig = {...MICRO_CONFIG,observation:agent.config.observation};
    const evaluations = Object.fromEntries(['balanced','cloudy','outage'].map(profile => [profile,evaluateMicrogrid(agent,undefined,profile,evaluationConfig)]));
    const model = {seed,episodes,config:agent.config,q:Array.from(agent.q),curve,evaluations};
    const artifact = createRun(model,provenance);
    const severity = Object.fromEntries([1,3,6].map(outageHours => [outageHours,evaluateMicrogrid(agent,undefined,'outage',evaluationConfig,{outageHours}).learned]));
    await writeFile(new URL('experiments/local/'+artifact.id+'.json',root),JSON.stringify(artifact));
    const result = {id:artifact.id,seed,episodes,seconds:(performance.now()-started)/1000,config:agent.config,evaluations,severity};
    runs.push(result);
    console.log(variant.name+' seed '+seed+': '+evaluations.balanced.learned.objective.toFixed(2)+' objective; '+result.seconds.toFixed(1)+'s');
  }
  reports.push({name:variant.name,config:variant.config,runs,summary:Object.fromEntries(['balanced','cloudy','outage'].map(profile => [profile,summarizeControllers(runs,profile)]))});
}
const report = {
  schemaVersion:1,environmentVersion:'microgrid-v1',createdAt:new Date().toISOString(),provenance,
  protocol:{episodes,trainingSeeds,validationSeeds:MICRO_VALIDATION_SEEDS,testSeeds:MICRO_TEST_SEEDS,profiles:['balanced','cloudy','outage'],evaluationConfig:MICRO_CONFIG,spread:'sample standard deviation across independent training seeds',selection:'fixed final policy; no test-based checkpoint selection'},
  variants:reports,
};
await writeFile(new URL('experiments/results/'+mode+'.json',root),JSON.stringify(report,null,2)+'\n');
console.log('Saved '+mode+' report; model artifacts remain in experiments/local/.');
