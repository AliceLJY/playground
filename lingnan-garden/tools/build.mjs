// 把 src/main.js 连同 Three.js 打成自包含的单文件 dist/index.html；对照用的起始图缩小后内嵌。
// 用法：npm ci && node tools/build.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(path.join(root, 'index.template.html'), 'utf8');
for (const marker of ['<!--BUNDLE-->', '__REF_IMAGE__']) if (template.split(marker).length !== 2) throw new Error('index.template.html must contain exactly one ' + marker);
const threeLicense = readFileSync(path.join(root, 'node_modules/three/LICENSE'), 'utf8').trim();
const notice = `<!--\nBundles Three.js (MIT):\n${threeLicense}\n-->\n`;
const ref = 'data:image/jpeg;base64,' + readFileSync(path.join(root, 'ref/start.jpg')).toString('base64');
const out = await build({ entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: 'es2022', write: false, legalComments: 'none', logLevel: 'warning' });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
// function replacers: a plain string would let "$&" inside the bundle be read as a replacement pattern
const html = template.replace('<head>', () => '<head>\n' + notice).replace('__REF_IMAGE__', () => ref).replace('<!--BUNDLE-->', () => '<script>\n' + js + '\n</script>');
if (/<script[^>]+src=|<link[^>]+href="(?!data:)|<img[^>]+src="(?!data:)/.test(html)) throw new Error('the page must not load anything from outside itself');
mkdirSync(path.join(root, 'dist'), { recursive: true });
writeFileSync(path.join(root, 'dist/index.html'), html);
console.log('dist/index.html', Buffer.byteLength(html), 'bytes', createHash('sha256').update(html).digest('hex').slice(0, 16));
