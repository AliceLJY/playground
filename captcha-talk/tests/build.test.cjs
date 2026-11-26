const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('打包出来的页面自带一切、带内容安全策略、保留 Three.js 许可、挂了录制与试玩钩子', () => {
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(!/<script[^>]+src\s*=/i.test(html), '不许从外面加载脚本');
  assert.ok(!/<link[^>]+href\s*=\s*["'](?!data:)/i.test(html), '不许从外面加载样式或图标');
  assert.ok(!/<!--BUNDLE-->/.test(html));
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /Permission is hereby granted/);
  assert.match(html, /__PLAYTEST__/); assert.match(html, /__talk/); assert.match(html, /headless/);
  assert.match(html, /prefers-reduced-motion/);
});
