// 发布文件扫描（README 验收 7、9）：公开仓推上去就上线，这里拦「写进去就收不回来」的那类东西，
// 以及「不抄寺庙站」——页面与文案里不出现寺庙词。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
// 被查的字符串拆开写，免得这个测试文件自己命中自己
const BAD = [
  ['本机路径', new RegExp('/Us' + 'ers/')],
  ['tailnet 域名', new RegExp('ts' + '\\.net', 'i')],
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
const all = walk('.').filter((f) => !/\.(png|jpg|jpeg|webp|gif|ico|mp4)$/i.test(f));
const PAGE_FILES = ['index.html', ...fs.readdirSync(path.join(root, 'src')).map((f) => path.join('src', f))];

test('验收 7 所有文件（含文档、测试、工具）都不含本机路径、内网地址、会话 id', () => {
  assert.ok(all.length > 6, '没扫到文件');
  for (const f of all) {
    const text = read(f);
    for (const [name, re] of BAD) assert.ok(!re.test(text), `${f} 含有 ${name}`);
  }
});

test('验收 7 页面文件没有任何外部地址、没有网络请求 API、不引外部样式', () => {
  for (const f of PAGE_FILES) {
    const text = read(f);
    assert.ok(!/https?:\/\//i.test(text), `${f} 含 http(s) 地址`);
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b/.test(text), `${f} 用了网络请求 API（跨用户痕迹共享只在 plan 里设计，第一版不接）`);
    assert.ok(!/@import|<link[^>]+href=/i.test(text), `${f} 引了外部样式或链接`);
  }
  const html = read('index.html');
  for (const m of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) assert.ok(/^(\.\/|src\/|#)/.test(m[1]), `index.html 里的 ${m[0]} 不是本目录相对路径`);
  assert.ok(!/<audio|\.(mp3|wav|ogg|m4a)\b/i.test(html + read('src/game.js')), '不用音频文件，声音全部合成');
});

test('验收 9 不抄寺庙站：页面与文案里不出现寺庙词汇，动词表是茶楼自己的', () => {
  const TEMPLE = ['殿', '磕头', '念珠', '上香', '敲钟', '打坐', '放下', '功德', '和尚', '佛', '寺', '庙'];
  for (const f of [...PAGE_FILES, 'README.md', 'README_CN.md']) {
    if (!fs.existsSync(path.join(root, f))) continue;
    const text = read(f).replace(/寺庙站|线上寺庙|sansatemple|寺庙/g, ''); // README 里允许提一句「不是寺庙站的皮」
    for (const w of TEMPLE) assert.ok(!text.includes(w), `${f} 出现了寺庙词「${w}」`);
  }
  const D = require('../src/core.js');
  assert.deepEqual(D.PLAYER_ACTS.map((a) => a.zh), ['落座', '斟茶', '叩指', '揭盖', '翻报纸', '夹一件', '离席', '唔该'], '八个动作，goal 允许 5–8 个');
  const html = read('index.html');
  for (const a of D.PLAYER_ACTS) assert.ok(html.includes(`>${a.zh}<`), `页面上缺「${a.zh}」按钮`);
});
