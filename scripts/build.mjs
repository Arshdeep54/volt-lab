import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readdir,
  copyFile,
  rm,
  readFile,
  writeFile,
} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(new URL('src/', dist), { recursive: true });
for (const name of ['index.html', 'styles.css', '_headers']) {
  await copyFile(new URL(name, root), new URL(name, dist));
}
async function copySources(source, target) {
  let count = 0;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const subTarget = new URL(entry.name + '/', target);
      await mkdir(subTarget, { recursive: true });
      count += await copySources(new URL(entry.name + '/', source), subTarget);
    } else if (/\.(mjs|json)$/.test(entry.name)) {
      await copyFile(new URL(entry.name, source), new URL(entry.name, target));
      count++;
    }
  }
  return count;
}
await mkdir(new URL('src/reports/', dist), { recursive: true });
for (const name of ['benchmark', 'ablations', 'dqn', 'study']) {
  await copyFile(
    new URL('experiments/results/' + name + '.json', root),
    new URL('src/reports/' + name + '.json', dist)
  );
}
const metadata = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  environmentHash: createHash('sha256')
    .update(await readFile(new URL('src/microgrid/environment.mjs', root)))
    .digest('hex'),
  scenarioHash: createHash('sha256')
    .update(await readFile(new URL('src/microgrid/scenario.mjs', root)))
    .digest('hex'),
};
const html = await readFile(new URL('index.html', dist), 'utf8');
await writeFile(
  new URL('index.html', dist),
  html.replace(
    '</head>',
    "<meta name=volt-build content='" + JSON.stringify(metadata) + "'>\n</head>"
  )
);
const count = await copySources(new URL('src/', root), new URL('src/', dist));
console.log('Built ' + (count + 3) + ' public assets in dist/');
