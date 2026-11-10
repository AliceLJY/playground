// 把 src/main.js 连同 Three.js 打成自包含的单文件。出两份：
//   dist/index.html   WebGL 版（默认，手机兼容面最大）
//   dist/webgpu.html  WebGPU 版（同一套场景代码，渲染后端换成 three/webgpu + TSL）
// 用法：npm ci && node tools/build.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webgpu = {
  name: 'webgpu-backend',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(root, 'node_modules/three/build/three.webgpu.js') }));
    b.onResolve({ filter: /^three\/tsl$/ }, () => ({ path: path.join(root, 'node_modules/three/build/three.tsl.js') }));
    b.onResolve({ filter: /\/gfx\.js$/ }, () => ({ path: path.join(root, 'src/gfx-webgpu.js') }));
  },
};
const template = readFileSync(path.join(root, 'index.template.html'), 'utf8');
const marker = '<!--BUNDLE-->';
if (template.split(marker).length !== 2) throw new Error('index.template.html must contain exactly one ' + marker);
const threeLicense = readFileSync(path.join(root, 'node_modules/three/LICENSE'), 'utf8').trim();
const notice = `<!--\nBundles Three.js (MIT):\n${threeLicense}\n-->\n`;
mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const [name, plugins] of [['index.html', []], ['webgpu.html', [webgpu]]]) {
  const out = await build({ entryPoints: [path.join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: 'es2022', write: false, legalComments: 'none', logLevel: 'warning', plugins });
  const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  // function replacers: a plain string would let "$&" and friends inside the bundle be read as replacement patterns
  const html = template.replace('<head>', () => '<head>\n' + notice).replace(marker, () => '<script>\n' + js + '\n</script>');
  if (/<script[^>]+src=|<link[^>]+href="(?!data:)/.test(html)) throw new Error('the page must not load anything from outside itself');
  writeFileSync(path.join(root, 'dist', name), html);
  console.log('dist/' + name, Buffer.byteLength(html), 'bytes', createHash('sha256').update(html).digest('hex').slice(0, 16));
}
