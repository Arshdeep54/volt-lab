import { mkdir, readdir, copyFile, rm } from 'node:fs/promises';
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
const count = await copySources(new URL('src/', root), new URL('src/', dist));
console.log('Built ' + (count + 3) + ' public assets in dist/');
