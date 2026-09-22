import { mkdir, readdir, copyFile, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(new URL('src/', dist), { recursive: true });
for (const name of ['index.html', 'styles.css', '_headers']) {
  await copyFile(new URL(name, root), new URL(name, dist));
}
const sources = (await readdir(new URL('src/', root))).filter((name) =>
  /\.(mjs|json)$/.test(name)
);
for (const name of sources) {
  await copyFile(new URL('src/' + name, root), new URL('src/' + name, dist));
}
console.log('Built ' + (sources.length + 3) + ' public assets in dist/');
