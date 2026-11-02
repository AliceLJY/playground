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

test('验收 7 页面文件只许访问痕迹服务这一个地址：没有别的外部地址、没有别的网络 API、不引外部样式', () => {
  const game = read('src/game.js');
  const m = game.match(/const TRACE_ENDPOINT = (null|'([^']*)');/);
  assert.ok(m, 'game.js 里要有 TRACE_ENDPOINT 常量（null 或一个地址）');
  const endpoint = m[2] || null;
  if (endpoint) assert.ok(/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(endpoint), `TRACE_ENDPOINT 只能是一个 workers.dev 地址，现在是 ${endpoint}`);
  for (const f of PAGE_FILES) {
    const text = read(f);
    const urls = text.match(/https?:\/\/[^\s'"`)]+/gi) || [];
    for (const u of urls) assert.ok(endpoint && u === endpoint, `${f} 含 ${u}——页面里唯一允许的地址是 TRACE_ENDPOINT`);
    assert.ok(!/\b(XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b/.test(text), `${f} 用了别的网络 API`);
    if (f !== path.join('src', 'game.js')) assert.ok(!/\bfetch\b/.test(text), `${f} 不该发请求，请求只在 game.js 的痕迹两处`);
    assert.ok(!/@import|<link[^>]+href=/i.test(text), `${f} 引了外部样式或链接`);
  }
  // game.js 里的 fetch 只有两处，都拼在 TRACE_ENDPOINT 后面，且都在「有地址才发」的守卫之后
  const calls = [...game.matchAll(/fetch\(([^,]+),/g)].map((x) => x[1].trim());
  assert.deepEqual(calls, ["TRACE_ENDPOINT + '/traces?n=12'", "TRACE_ENDPOINT + '/trace'"], '请求只能发往痕迹服务的两个路径');
  assert.equal((game.match(/!TRACE_ENDPOINT/g) || []).length, 2, '两处请求都要先判 TRACE_ENDPOINT 为空就不发');
  assert.ok(/credentials: 'omit'[^\n]*\n[^]*credentials: 'omit'/.test(game), '两处请求都不带 cookie');
  const html = read('index.html');
  for (const m2 of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) assert.ok(/^(\.\/|src\/|#)/.test(m2[1]), `index.html 里的 ${m2[0]} 不是本目录相对路径`);
  assert.ok(!/<audio|\.(mp3|wav|ogg|m4a)\b/i.test(html + game), '不用音频文件，声音全部合成');
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
