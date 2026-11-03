// 发布文件扫描（SPEC 验收 8）：公开仓推上去就上线，这里拦写进去就收不回来的那类东西。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
// 被查的字符串拆开写，免得这个测试文件自己命中自己
const BAD = [
  ['本机路径', new RegExp('/Us' + 'ers/')],
  ['tailnet 域名', new RegExp('ts' + '\\.net', 'i')],
  ['私网 IP', /\b(192\.168|10\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/],
  ['本机用户名', new RegExp('anxian' + 'jingya', 'i')],
  ['会话 id（UUID）', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ['内部设备名', new RegExp('mac-' + 'mini\\.', 'i')],
  ['邮箱地址', /\b[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com)[A-Za-z0-9-]+\.[A-Za-z]{2,}\b/],
];
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (e.name === '.DS_Store' || e.name === 'check-out') continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
};
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('验收 8 所有文件都不含本机路径、内网地址、会话 id、邮箱', () => {
  const files = walk('.').filter((f) => !/\.(png|jpg|webp)$/i.test(f));
  assert.ok(files.length >= 6, '没扫到文件');
  for (const f of files) for (const [name, re] of BAD) assert.ok(!re.test(read(f)), `${f} 含有 ${name}`);
});

test('验收 8 页面不发任何请求，外链只有 RecallNest 仓库', () => {
  for (const f of ['index.html', 'src/core.js', 'src/game.js', 'src/experiment.js']) {
    const text = read(f);
    for (const u of text.match(/https?:\/\/[^\s'"`)<]+/gi) || [])
      assert.ok(u === 'https://github.com/AliceLJY/recallnest' || u === 'http://www.w3.org/2000/svg', `${f} 含外部地址 ${u}`);
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b/.test(text), `${f} 用了网络 API`);
    assert.ok(!/<link[^>]+href=|@import/i.test(text), `${f} 引了外部样式`);
  }
});
