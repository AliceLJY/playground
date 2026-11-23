// 花城收租佬 · 页面静态检查：验收条目 6（不外连、有 CSP）与 5 的源码一侧（key 不进日志、不挂到全局）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');

test('CSP：只许本站脚本和样式，联网只到 self 与 https，不放行 http 明文', () => {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, '缺 CSP meta');
  const csp = Object.fromEntries(m[1].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(csp['default-src'], ["'none'"]);
  assert.deepEqual(csp['script-src'], ["'self'"]);
  assert.deepEqual(csp['style-src'], ["'self'"]);
  assert.ok(csp['connect-src'].includes('https://api.deepseek.com'));
  assert.ok(csp['connect-src'].includes('https://dashscope.aliyuncs.com'));
  assert.ok(!csp['connect-src'].includes('http:'), 'connect-src 不许放行 http:');
  assert.ok(!m[1].includes('unsafe-inline') && !m[1].includes('unsafe-eval'));
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<link'), 'CSP 要排在任何资源之前');
});

test('不加载任何第三方东西：所有 src/href 都是本目录相对路径，没有内联脚本和 style 属性', () => {
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((x) => x[1]);
  assert.ok(refs.length >= 4);
  for (const r of refs) assert.match(r, /^src\/[a-z]+\.(js|css)$/, `外部或意外的引用：${r}`);
  assert.doesNotMatch(html, /<script>(?!<\/script>)/, '有内联脚本');
  assert.doesNotMatch(html, /\sstyle="/, '有 style 属性（会被 CSP 拦）');
  for (const f of ['core.js', 'ai.js', 'game.js', 'style.css']) assert.doesNotMatch(src(f), /https?:\/\/(?!api\.deepseek\.com|dashscope\.aliyuncs\.com)[a-z0-9]/i, `${f} 里有别的外部地址`);
});

test('页面常驻说明 key 的去向；记住 key 要访客主动勾选，并写明同站共享', () => {
  assert.match(html, /key 只在你的浏览器里，直连 DeepSeek\/千问，本站不经手/);
  assert.match(html, /<input type="checkbox" id="remember">/, '勾选框默认不勾');
  assert.match(html, /同一网站的其他页面也读得到/);
  assert.match(html, /清掉记住的 key/);
});

test('源码里不打印、不挂全局：没有 console 输出；座位配置不挂到 window；试玩钩子只回报有没有 key', () => {
  for (const f of ['core.js', 'ai.js', 'game.js']) assert.doesNotMatch(src(f), /console\.(log|info|warn|error|debug)/, `${f} 有 console 输出`);
  const g = src('game.js');
  const globals = [...g.matchAll(/self\.([A-Za-z_$][\w$]*)\s*=/g)].map((x) => x[1]);
  assert.deepEqual(globals, ['__PLAYTEST__']);
  const hook = g.slice(g.indexOf('self.__PLAYTEST__'));
  assert.match(hook, /hasKey: !!s\.key/);
  assert.doesNotMatch(hook.slice(0, hook.indexOf('reset:')), /\bkey:|\burl:|\bmodel:/, '钩子里不该回报 key、地址或模型名');
  // localStorage 只在勾选后写
  assert.match(g, /if \(\$\('remember'\)\.checked\)\s*\{\s*localStorage\.setItem/);
  // key 输入框是密码框、不自动填充
  assert.match(g, /class="s-key" type="password" autocomplete="off"/);
});
