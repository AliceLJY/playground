// The published single file and the words on the page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('A8 built page is self-contained and keeps the Three.js licence and the play-test hook', () => {
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(!/<script[^>]+src\s*=/i.test(html), 'no external script');
  assert.ok(!/<link[^>]+href\s*=\s*["'](?!data:)/i.test(html), 'no external stylesheet');
  assert.ok(!/<!--BUNDLE-->/.test(html), 'bundle marker replaced');
  assert.match(html, /Three\.js/); assert.match(html, /Permission is hereby granted/);
  assert.match(html, /__PLAYTEST__/); assert.match(html, /__ORBITAL__/);
  assert.ok(html.length < 1_000_000, `single file ${html.length} bytes, budget 1 MB`);
});

test('A10 the page says the design is illustrative and never claims real-spacecraft accuracy', () => {
  const page = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
  assert.match(page, /示意/, 'page must say 示意');
  assert.match(page, /不代表真实航天器设计/);
  for (const f of ['index.template.html', 'src/main.js', 'README.md', 'README_CN.md', 'SPEC.md']) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/(真实|精确|准确)(还原|复刻)|1:1|NASA|ISS 同款|accurate (model|replica)|scale model of/i.test(text), `${f} claims real accuracy`);
  }
});

test('A10 public files carry no contact or identity details; signature is the public handle only', () => {
  for (const f of ['index.template.html', 'README.md', 'README_CN.md', 'SPEC.md', ...fs.readdirSync(path.join(root, 'src')).map(x => 'src/' + x)]) {
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
