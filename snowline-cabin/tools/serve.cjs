// Minimal static server for the source-entry browser check (dev.html). Binds 127.0.0.1 only; stop it when done.
//   node tools/serve.cjs . 8938      then open http://127.0.0.1:8938/dev.html
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2]), port = +process.argv[3];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', () => console.log('serving', root, 'on', port));
