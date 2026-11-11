// Source and single-file entry points, served entirely from this directory.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] ?? 8941);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  const file = path.resolve(root, '.' + pathname);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403); res.end(); return; }
  if (pathname === '/dev.html') {
    const template = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
    const imports = JSON.stringify({ imports: { three: './node_modules/three/build/three.module.js' } });
    res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' });
    res.end(template.replace('<!--BUNDLE-->', '<script type="importmap">' + imports + '</script><script type="module" src="./src/main.js"></script>'));
    return;
  }
  fs.readFile(file, (error, buffer) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buffer);
  });
});
server.listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port));
