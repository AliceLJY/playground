'use strict';
// 跑 Codex 交货时自带的 20 项检查（verify.cjs），并守住发布副本只改了版权页脚这一处
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

test('Codex 自带的 20 项检查全部通过', () => {
  const r = spawnSync(process.execPath, ['verify.cjs'], { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `verify.cjs 失败：\n${r.stdout}\n${r.stderr}`);
  const pass = (r.stdout.match(/^PASS /gm) || []).length;
  assert.strictEqual(pass, 20, `应有 20 条 PASS，实际 ${pass} 条`);
});

test('页脚带版权行', () => {
  assert.match(html, /<footer>[\s\S]*© 我的AI小木屋[\s\S]*<\/footer>/, '页脚缺「© 我的AI小木屋」');
});

test('不引用外部素材，离线可玩', () => {
  assert.doesNotMatch(html, /<(?:script|link|img|audio)[^>]+(?:src|href)=["']https?:/i, '出现了外部资源引用');
});
