// Bundle src/main.js with Three.js into one self-contained page: dist/index.html.
// Usage: npm ci && node tools/build.mjs      (CI runs exactly this)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, minify: true, format: 'iife', target: 'es2020', write: false,
  loader: { '.jpg': 'dataurl' }, legalComments: 'none', logLevel: 'warning',
});
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const template = readFileSync(path.join(root, 'index.template.html'), 'utf8');
const marker = '<!--BUNDLE-->';
if (template.split(marker).length !== 2) throw new Error('index.template.html must contain exactly one ' + marker);
const threeLicense = readFileSync(path.join(root, 'node_modules/three/LICENSE'), 'utf8').trim();
const notice = `<!--\nBundles Three.js (MIT):\n${threeLicense}\n\nFurniture kit ported from wy51ai/floorplan-3d (MIT, Copyright (c) 2026 wuyi). See THIRD_PARTY_NOTICES.md in the source folder.\n-->\n`;
// function replacers: a plain string would let "$&" and friends inside the bundle be read as replacement patterns
const html = template.replace('<head>', () => '<head>\n' + notice).replace(marker, () => '<script>\n' + js + '\n</script>');
if (/<script[^>]+src=|<link[^>]+href=/.test(html)) throw new Error('the page must not load anything from outside itself');
mkdirSync(path.join(root, 'dist'), { recursive: true });
writeFileSync(path.join(root, 'dist/index.html'), html);
console.log('dist/index.html', Buffer.byteLength(html), 'bytes', createHash('sha256').update(html).digest('hex').slice(0, 16));
