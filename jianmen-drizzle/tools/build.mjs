// 打包：src/main.js（含 PlayCanvas）→ dist/main.js，连同页面与素材（场景 SOG、原画）拷进 dist/。
// 不是单文件：场景是 8 MB 的二进制。Usage: npm ci && node tools/build.mjs
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
rmSync(dist, { recursive: true, force: true }); mkdirSync(dist, { recursive: true });
await build({
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, format: 'esm', target: 'es2022',
  outfile: path.join(dist, 'main.js'), external: ['node:worker_threads'], legalComments: 'none', logLevel: 'warning'
});
cpSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
cpSync(path.join(root, 'public/assets'), path.join(dist, 'assets'), { recursive: true });
const notice = ['PlayCanvas Engine (MIT)', readFileSync(path.join(root, 'node_modules/playcanvas/LICENSE'), 'utf8').trim()].join('\n');
writeFileSync(path.join(dist, 'LICENSES.txt'), notice + '\n');
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
if (/<script[^>]+src="(?!\.\/main\.js)|<link[^>]+href="(?!data:)/.test(html)) throw new Error('the page must not load anything from outside itself');
let total = 0; const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else total += s.size; } }; walk(dist);
console.log('dist ready', (total / 1048576).toFixed(1), 'MB');
