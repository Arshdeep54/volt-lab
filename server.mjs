import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const name = decodeURIComponent(
      url.pathname === '/' ? '/index.html' : url.pathname
    );
    const publicFiles = ['/index.html', '/styles.css'];
    const reportFiles = ['benchmark.json', 'ablations.json', 'dqn.json'];
    let file;
    if (publicFiles.includes(name)) file = path.join(root,name);
    else if (name.startsWith('/src/reports/') && reportFiles.includes(name.slice('/src/reports/'.length))) {
      file = path.join(root,'experiments/results',name.slice('/src/reports/'.length));
    } else if (name.startsWith('/src/') && ['.mjs','.json'].includes(path.extname(name))) {
      file = path.resolve(root,'.'+name);
      if (!file.startsWith(path.join(root,'src') + path.sep)) file = null;
    }
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.listen(Number(process.env.PORT || 5173), '0.0.0.0', () =>
  console.log('Volt Lab → http://localhost:' + server.address().port)
);
