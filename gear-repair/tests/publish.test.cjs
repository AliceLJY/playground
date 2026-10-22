// 发布文件扫描（SPEC 验收 8）：页面不发外部请求、不带本机路径和内网地址；vendor 与 npm 包 three@0.160.0 逐字节相同。
// 这是公开仓，推上去就上线，所以这条测试要拦住的是「写进去了就收不回来」的那类东西。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
// 被查的字符串拆开写，免得这个测试文件自己命中自己
const BAD = [
  ['本机路径', new RegExp('/Us' + 'ers/')],
  ['tailnet 域名', new RegExp('ts' + '\\.net', 'i')],
  ['tailnet 名', new RegExp('tail' + '[0-9a-f]{6,}\\.', 'i')],
  ['tailnet IP 段 100.64–127', /\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/],
  ['私网 IP', /\b(192\.168|10\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/],
  ['本机用户名', new RegExp('anxian' + 'jingya', 'i')],
  ['会话 id（UUID）', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ['内部设备名', new RegExp('mac-' + 'mini\\.', 'i')],
];
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.name === '.DS_Store' || e.name === 'check-out' || e.name === 'node_modules') continue;
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
};
const all = walk('.').filter((f) => !/\.(png|jpg|jpeg|webp|gif|ico)$/i.test(f));
const PAGE_FILES = ['index.html', ...fs.readdirSync(path.join(root, 'src')).map((f) => path.join('src', f))];

test('验收 8 所有文件（含文档、测试、工具）都不含本机路径、内网地址、会话 id', () => {
  assert.ok(all.length > 10, '没扫到文件');
  for (const f of all) {
    const text = read(f);
    for (const [name, re] of BAD) assert.ok(!re.test(text), `${f} 含有 ${name}`);
  }
});

test('验收 8 页面文件（index.html 和 src/）没有任何外部地址、没有网络请求 API', () => {
  for (const f of PAGE_FILES) {
    const text = read(f);
    assert.ok(!/https?:\/\//i.test(text), `${f} 含 http(s) 地址`);
    assert.ok(!/(^|[^:\w])\/\/[a-z0-9-]+\.[a-z]{2,}/i.test(text.replace(/\/\/[^\n]*/g, '')), `${f} 含协议相对地址`);
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b/.test(text), `${f} 用了网络请求 API`);
    assert.ok(!/@import|<link[^>]+href=["'](?!data:)/i.test(text), `${f} 引了外部样式或链接`);
  }
  const html = read('index.html');
  for (const m of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    assert.ok(/^(\.\/|src\/|vendor\/|data:|#)/.test(m[1]), `index.html 里的 ${m[0]} 不是本目录相对路径`);
  }
});

test('验收 8 importmap 只指向 ./vendor/，且指向的文件都存在', () => {
  const html = read('index.html');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  const entries = Object.entries(map.imports);
  assert.ok(entries.length >= 3);
  for (const [name, target] of entries) {
    assert.ok(target.startsWith('./vendor/'), `${name} 指向 ${target}，不是本地 vendor`);
    assert.ok(fs.existsSync(path.join(root, target)), `${target} 不存在`);
  }
});

test('验收 8 vendor 文件与 npm 包 three@0.160.0 逐字节相同（SHA-256），许可文本在位', () => {
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex');
  assert.equal(sha('vendor/three.module.js'), '76dea8151bc9352aef3528b4262e249b2604f62543828328db978d060d61a495');
  assert.equal(sha('vendor/OrbitControls.js'), '5a44a9e86a2a0fb11933eed69bc2cd33c76a496854c1aed6ed776efa87d7b064');
  assert.equal(sha('vendor/RoomEnvironment.js'), 'e21f41b7ef2016f2984a5d27850b42dffa797a6a194a138e288b06576d765a7b');
  assert.match(read('vendor/THREE-LICENSE.txt'), /The MIT License/);
  assert.match(read('THIRD_PARTY_NOTICES.md'), /three@0\.160\.0/);
});

test('验收 8 校准：扫描器能抓到真的坏样本', () => {
  const samples = ['/Us' + 'ers/someone/a.js', 'https://mac-' + 'mini.tail' + 'abc123.ts' + '.net/x', 'http://100.' + '101.2.3:3080/', '3f2504e0-4f89-41d3-' + '9a0c-0305e82c3301'];
  for (const s of samples) assert.ok(BAD.some(([, re]) => re.test(s)), `没抓到：${s}`);
  assert.ok(/https?:\/\//.test('fetch("https://cdn.example.com/x.js")'));
});

test('验收 8 README.md 是纯英文（没有汉字），README_CN.md 有汉字；两份末尾都有「谁会点开、AI 素材」一节', () => {
  const en = read('README.md'), cn = read('README_CN.md');
  assert.ok(!/[㐀-鿿　-〿＀-￯]/.test(en), 'README.md 里有中文字符');
  assert.ok(/[一-鿿]/.test(cn));
  assert.ok(/^## Who it's for, AI assets\s*$/m.test(en), 'README.md 缺 "Who it\'s for, AI assets" 一节');
  assert.ok(/^## 谁会点开、AI 素材\s*$/m.test(cn), 'README_CN.md 缺「谁会点开、AI 素材」一节');
  const tail = (t, h) => t.slice(t.search(new RegExp('^## ' + h, 'm')));
  assert.ok(!/^## /m.test(tail(en, "Who it's for, AI assets").replace(/^## .*\n/, '')), 'README.md 里「谁会点开」不是最后一节');
  assert.ok(!/^## /m.test(tail(cn, '谁会点开、AI 素材').replace(/^## .*\n/, '')), 'README_CN.md 里「谁会点开」不是最后一节');
});
