// The published single file and the words on the page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const PUBLIC = () => ['index.template.html', 'README.md', 'README_CN.md', 'SPEC.md', ...fs.readdirSync(path.join(root, 'src')).map(x => 'src/' + x)];

test('D1 built page is self-contained and keeps the Three.js licence and the play-test hooks', () => {
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(!/<script[^>]+src\s*=/i.test(html), 'no external script');
  assert.ok(!/<link[^>]+href\s*=\s*["'](?!data:)/i.test(html), 'no external stylesheet');
  assert.ok(!/<!--BUNDLE-->/.test(html), 'bundle marker replaced');
  assert.match(html, /Content-Security-Policy/, 'page carries its CSP');
  assert.match(html, /Three\.js/); assert.match(html, /Permission is hereby granted/);
  for (const hook of ['__PLAYTEST__', 'snapshot', 'setSeed', 'reset', 'step', 'hover', 'walkTo', 'pluck', 'jump', 'peck']) assert.ok(html.includes(hook), `missing ${hook}`);
  assert.ok(html.length < 1_000_000, `single file ${html.length} bytes, budget 1 MB`);
});

test('D2 the page says the shapes are illustrative and names no species', () => {
  const page = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
  assert.match(page, /示意/); assert.match(page, /油彩孔雀/); assert.match(page, /Painterly Peacock/i);
  for (const id of ['b-fan', 'b-near', 'b-back', 'b-jump', 'b-sound']) assert.match(page, new RegExp(`id="${id}"`));
  assert.match(page, /aria-pressed="false">声音 关/, 'sound starts muted');
  for (const f of PUBLIC()) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/\bPavo\b|cristatus|muticus|Afropavo|congensis|蓝孔雀|绿孔雀|刚果孔雀|印度孔雀/i.test(text), `${f} names a species`);
    assert.ok(!/(真实|精确|准确)(还原|复原)|accurate (model|reconstruction)/i.test(text.replace(/不是真实复原|not an accurate model/gi, '')), `${f} claims accuracy`);
  }
});

test('D3 public files carry no contact or identity details; signature is the public handle only', () => {
  for (const f of PUBLIC()) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(text), `${f} contains an e-mail address`);
    assert.ok(!/gmail|(微信号|手机号|电话|wechat id|phone (number|no\.?))\s*[:：]\s*\S|(^|\D)1[3-9]\d{9}(\D|$)/i.test(text), `${f} contains contact details`);
  }
  for (const f of ['README.md', 'README_CN.md']) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(text, /我的AI小木屋|@AliceLJY/, `${f} must sign with the public handle`);
    assert.match(text, /谁会点开、AI 素材|Who it's for, AI assets/, `${f} ends with the audience and AI-material section`);
  }
});

test('D4 the homepage cover exists at 640×480', () => {
  const buf = fs.readFileSync(path.join(root, '..', 'covers', 'painterly-peacock.webp'));
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
  assert.ok(i > 0, 'lossy webp expected');
  assert.deepEqual([buf.readUInt16LE(i + 3) & 0x3fff, buf.readUInt16LE(i + 5) & 0x3fff], [640, 480]);
});
