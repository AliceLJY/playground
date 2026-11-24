// The published single file, the words on the page and in the docs, and the homepage cover.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const PUBLIC = () => ['index.template.html', 'README.md', 'README_CN.md', 'SPEC.md', ...fs.readdirSync(path.join(root, 'src')).map(x => 'src/' + x)];
const physics = import('../src/physics.js');

test('D1 built page is self-contained and keeps the Three.js licence and the play-test hooks', () => {
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(!/<script[^>]+src\s*=/i.test(html), 'no external script');
  assert.ok(!/<link[^>]+href\s*=\s*["'](?!data:)/i.test(html), 'no external stylesheet');
  assert.ok(!/<!--BUNDLE-->/.test(html), 'bundle marker replaced');
  assert.match(html, /Content-Security-Policy/, 'page carries its CSP');
  assert.match(html, /Three\.js/); assert.match(html, /Permission is hereby granted/);
  for (const hook of ['__PLAYTEST__', 'snapshot', 'setSeed', 'grab', 'release', 'pour', 'reset']) assert.match(html, new RegExp(hook), hook);
  assert.ok(!/https?:\/\/(?!www\.w3\.org|threejs\.org|github\.com\/mrdoob)[\w.-]+\.[a-z]{2,}\/[\w/.-]*\.(png|jpe?g|webp|glb|gltf|hdr|ktx2|woff2?|js|css)\b/i.test(html), 'no asset URL');
  assert.ok(html.length < 1_000_000, `single file ${html.length} bytes, budget 1 MB`);
});

test('D2 everything on screen comes from code: no image, model or font files in the work', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === 'dist' || e.name === 'shots' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const assets = walk(root).filter(f => /\.(png|jpe?g|webp|gif|svg|glb|gltf|obj|fbx|hdr|exr|ktx2|woff2?|ttf|otf)$/i.test(f));
  assert.deepEqual(assets.map(f => path.relative(root, f)), []);
  for (const f of fs.readdirSync(path.join(root, 'src'))) assert.ok(!/from\s+['"]three\/examples\/jsm\/loaders|GLTFLoader|TextureLoader|RGBELoader/.test(fs.readFileSync(path.join(root, 'src', f), 'utf8')), `${f} loads an asset`);
});

test('D3 public files carry no contact or identity details; signature is the public handle only', () => {
  for (const f of PUBLIC()) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(text), `${f} contains an e-mail address`);
    assert.ok(!/(微信号|手机号|电话|wechat id|phone)\s*[:：]\s*[+\d]|(^|\D)1[3-9]\d{9}(\D|$)/i.test(text), `${f} contains contact details`);
  }
  for (const f of ['README.md', 'README_CN.md']) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(text, /我的AI小木屋|@AliceLJY/, `${f} must sign with the public handle`);
    assert.match(text, /谁会点开、AI 素材|Who it's for, AI assets/, `${f} ends with the audience and AI-material section`);
  }
});

test('D4 the homepage cover exists at 640×480', () => {
  const buf = fs.readFileSync(path.join(root, '..', 'covers', 'gummy-bears.webp'));
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
  assert.ok(i > 0, 'lossy webp expected');
  assert.deepEqual([buf.readUInt16LE(i + 3) & 0x3fff, buf.readUInt16LE(i + 5) & 0x3fff], [640, 480]);
});

test('D5 SPEC states the same bear caps and phone tier the code uses', async () => {
  const { CAP, POUR } = await physics;
  const spec = fs.readFileSync(path.join(root, 'SPEC.md'), 'utf8');
  assert.match(spec, new RegExp(`桌面[^\\n]*${CAP.high}\\s*只`), 'desktop cap');
  assert.match(spec, new RegExp(`手机[^\\n]*${CAP.low}\\s*只`), 'phone cap');
  assert.match(spec, new RegExp(`每次倒\\s*${POUR}\\s*只`), 'pour size');
  assert.match(spec, /关折射|不用折射/); assert.match(spec, /影子图/);
});
