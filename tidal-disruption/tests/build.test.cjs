const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('A8 built page is self-contained and preserves the Three.js licence', () => {
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(!/<script[^>]+src\s*=/i.test(html));
  assert.ok(!/<link[^>]+href\s*=\s*["'](?!data:)/i.test(html));
  assert.ok(!/<!--BUNDLE-->/.test(html));
  assert.match(html, /Three\.js/);
  assert.match(html, /Permission is hereby granted/);
  assert.match(html, /__PLAYTEST__/);
});
