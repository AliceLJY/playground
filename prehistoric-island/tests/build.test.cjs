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
  assert.match(html, /__PLAYTEST__/); assert.match(html, /__ISLAND__/); assert.match(html, /setView/);
  assert.ok(html.length < 1_000_000, `single file ${html.length} bytes, budget 1 MB`);
});

test('D2 the page says the shapes are illustrative, not a reconstruction, and names no species or dates', () => {
  const page = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
  assert.match(page, /示意/); assert.match(page, /不是真实复原/); assert.match(page, /不代表这些动物生活在同一时期/);
  for (const f of PUBLIC()) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/(真实|精确|准确)(还原|复原|复刻)(?!。|，|）)|科学复原|accurate (model|reconstruction|replica)|scientifically accurate/i.test(text.replace(/不是真实复原|不是科学复原|not (a|an) (scientific |accurate )?reconstruction/gi, '')), `${f} claims accuracy`);
    // No Latin genus or species names, and no ages in years.
    assert.ok(!/\b[A-Z][a-z]+(saurus|saurs?|don|odon|ceras|ceratops|dactylus|pteryx|ites|ichthys|suchus|raptor|mimus)\b/.test(text), `${f} names a genus`);
    assert.ok(!/\d\s*(万|亿)\s*年|million years|\d\s*(Ma|Myr)\b|侏罗纪|白垩纪|三叠纪|Jurassic|Cretaceous|Triassic/i.test(text), `${f} names a period or an age`);
  }
});

test('D3 public files carry no contact or identity details; signature is the public handle only', () => {
  for (const f of PUBLIC()) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(text), `${f} contains an e-mail address`);
    assert.ok(!/(微信号|手机号|电话|wechat id|phone)\s*[:：]\s*\S|(^|\D)1[3-9]\d{9}(\D|$)/i.test(text), `${f} contains contact details`);
  }
  for (const f of ['README.md', 'README_CN.md']) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(text, /我的AI小木屋|@AliceLJY/, `${f} must sign with the public handle`);
    assert.match(text, /谁会点开、AI 素材|Who it's for, AI assets/, `${f} ends with the audience and AI-material section`);
  }
});

test('D4 the homepage cover exists at 640×480', () => {
  const buf = fs.readFileSync(path.join(root, '..', 'covers', 'prehistoric-island.webp'));
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  // VP8 (lossy) frame header carries the size after the start code 9d 01 2a.
  const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
  assert.ok(i > 0, 'lossy webp expected');
  assert.deepEqual([buf.readUInt16LE(i + 3) & 0x3fff, buf.readUInt16LE(i + 5) & 0x3fff], [640, 480]);
});
