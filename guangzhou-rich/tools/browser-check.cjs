// 花城收租佬 · 浏览器检查（验收条目 5–9）。
// 用法：先在本目录起 http 服务（python3 -m http.server 8811），再
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8811/ shots
// 线上复验把地址换成 https://aliceljy.github.io/playground/guangzhou-rich/。
// 模型座位全部用 page.route 拦截 mock，不发真实请求；key 是假的。
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.argv[2] || 'http://127.0.0.1:8811/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'shots';
const FAKE_KEY = 'sk-test-FAKE-browser-0000000000000';
fs.mkdirSync(OUT, { recursive: true });
const origin = new URL(BASE).origin;
const results = [];
const check = (id, name, ok, detail) => { results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + JSON.stringify(detail) : ''}`); };

async function newPage(browser, vp, opts = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: opts.dpr || 2, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  const page = await ctx.newPage();
  const log = { errors: [], console: [], requests: [], csp: [] };
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('console', (m) => log.console.push(m.type() + ': ' + m.text()));
  page.on('request', (r) => log.requests.push({ url: r.url(), method: r.method(), auth: !!r.headers().authorization }));
  await page.addInitScript(() => { self.__csp = []; document.addEventListener('securitypolicyviolation', (e) => self.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  return { ctx, page, log };
}
const ready = (page) => page.waitForFunction(() => self.__PLAYTEST__ && self.__PLAYTEST__.ready, null, { polling: 100, timeout: 10000 });
const snap = (page) => page.evaluate(() => self.__PLAYTEST__.snapshot());

// 按钮与读数外框两两不重叠、都在可视区内
async function layoutCheck(page, vp) {
  return page.evaluate((vp) => {
    const sel = 'button:not([hidden]), .pl, .notes .warn, .seat input, .seat select, #round, #event';
    const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && !e.closest('[hidden]') && !e.closest('details:not([open]) > :not(summary)'); });
    const over = document.getElementById('over');
    const scope = over && !over.hidden ? els.filter((e) => over.contains(e)) : els;
    const boxes = scope.map((e) => { const r = e.getBoundingClientRect(); return { n: e.id || e.className || e.tagName, l: r.left, t: r.top, r: r.right, b: r.bottom }; });
    const overlaps = [];
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const x = boxes[a], y = boxes[b];
      const ix = Math.min(x.r, y.r) - Math.max(x.l, y.l), iy = Math.min(x.b, y.b) - Math.max(x.t, y.t);
      if (ix > 1 && iy > 1) overlaps.push([x.n, y.n]);
    }
    const outside = boxes.filter((x) => x.l < -1 || x.t < -1 || x.r > vp.width + 1 || x.b > vp.height + 1).map((x) => x.n);
    const small = scope.filter((e) => e.tagName === 'BUTTON').map((e) => [e.id || e.textContent.trim(), e.getBoundingClientRect().height]).filter(([, h]) => h < 36);
    return { count: boxes.length, overlaps, outside, small };
  }, vp);
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();

  // ---- 机位截图与布局：手机两档 + 桌面 ----
  const VPS = [
    { name: 'mobile-664', vp: { width: 390, height: 664 }, touch: true },
    { name: 'mobile-844', vp: { width: 390, height: 844 }, touch: true },
    { name: 'desktop', vp: { width: 1280, height: 800 }, dpr: 1 },
  ];
  for (const v of VPS) {
    for (const view of ['setup', 'play', 'over']) {
      const { ctx, page, log } = await newPage(browser, v.vp, v);
      await page.goto(`${BASE}?view=${view}&seed=7`);
      await ready(page);
      await page.waitForTimeout(150);
      const s = await snap(page);
      const screenOk = s.view === view && s.screen === (view === 'setup' ? 'setup' : view === 'play' ? 'play' : 'over');
      const statusOk = view === 'setup' || (view === 'play' ? s.phase === 'roll' && s.turn === 0 && s.round === 5 : s.phase === 'over');
      await page.screenshot({ path: path.join(OUT, `${v.name}-${view}.png`) });
      const lay = await layoutCheck(page, v.vp);
      check(`L-${v.name}-${view}`, `机位 ${view} 实际进入且布局不重叠不出屏（${v.vp.width}×${v.vp.height}）`, screenOk && statusOk && !lay.overlaps.length && !lay.outside.length && !lay.small.length && !log.errors.length,
        { reported: { view: s.view, screen: s.screen, phase: s.phase, round: s.round }, overlaps: lay.overlaps, outside: lay.outside, small: lay.small, errors: log.errors });
      await ctx.close();
    }
  }

  // ---- 检查自校准：故意把两个按钮叠在一起、把主按钮推出屏，布局检查必须报出来 ----
  {
    const vp = { width: 390, height: 664 };
    const { ctx, page } = await newPage(browser, vp, { touch: true });
    await page.goto(`${BASE}?view=play&seed=7`);
    await ready(page);
    await page.evaluate(() => { const b = document.getElementById('act-b'); b.style.marginLeft = '-200px'; });
    const bad1 = await layoutCheck(page, vp);
    await page.evaluate(() => { const b = document.getElementById('act-b'); b.style.marginLeft = ''; document.getElementById('actions').style.marginTop = '400px'; });
    const bad2 = await layoutCheck(page, vp);
    check('C1', '布局检查自校准：已知坏的两种摆法（按钮重叠、按钮出屏）都能被抓到', bad1.overlaps.length > 0 && bad2.outside.length > 0, { overlaps: bad1.overlaps, outside: bad2.outside });
    await ctx.close();
  }

  // ---- 陌生人第一分钟：手机 390×664，正常速度，只点最显眼的主按钮 ----
  {
    const vp = { width: 390, height: 664 };
    const { ctx, page, log } = await newPage(browser, vp, { touch: true });
    await page.goto(`${BASE}?seed=3`);
    await ready(page);
    const start = Date.now();
    const startBox = await page.locator('#start').boundingBox();
    const howto = await page.locator('.howto li').count();
    await page.screenshot({ path: path.join(OUT, 'opening-0-setup.png') });
    await page.tap('#start');
    let bought = false, firstChoiceMs = null, shots = 0, sawBuyButtons = false;
    while (Date.now() - start < 30000) {
      const s = await snap(page);
      if (s.turn === 0 && !s.busy && s.pending) {
        if (firstChoiceMs == null) firstChoiceMs = Date.now() - start;
        if (s.pending.type === 'buy') {
          sawBuyButtons = (await page.locator('#act-a').textContent()).includes('买下') && (await page.locator('#act-b').isVisible());
          if (shots < 2) await page.screenshot({ path: path.join(OUT, `opening-${++shots}-buy.png`) });
        } else if (shots < 1) await page.screenshot({ path: path.join(OUT, `opening-${++shots}-dice.png`) });
        const before = s.owner.filter((o) => o === 0).length;
        await page.tap('#act-a');
        await page.waitForTimeout(80);
        const after = (await snap(page)).owner.filter((o) => o === 0).length;
        if (after > before) { bought = true; break; }
      }
      await page.waitForTimeout(100);
    }
    const ms = Date.now() - start;
    await page.screenshot({ path: path.join(OUT, 'opening-3-bought.png') });
    check('F1', '陌生人第一分钟：开局按钮在首屏、首屏三行怎么玩、30 秒内只点主按钮就买下第一块地', bought && ms <= 30000 && startBox.y + startBox.height <= vp.height && howto === 3 && sawBuyButtons && !log.errors.length,
      { ms, firstChoiceMs, startBottom: startBox.y + startBox.height, howto, sawBuyButtons, errors: log.errors });
    await ctx.close();
  }

  // ---- mock DeepSeek 座位走完回合；key 不外露；只连本站和模型地址；CSP 0 违规 ----
  {
    const vp = { width: 390, height: 844 };
    const { ctx, page, log } = await newPage(browser, vp, { touch: true });
    const calls = [];
    await page.route('https://api.deepseek.com/**', async (route) => {
      const req = route.request();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const body = JSON.parse(req.postData() || '{}');
      calls.push({ auth: req.headers().authorization === 'Bearer ' + FAKE_KEY, keyInUrl: req.url().includes(FAKE_KEY), keyInBody: (req.postData() || '').includes(FAKE_KEY), model: body.model, promptLen: (body.messages || []).map((m) => m.content).join('').length });
      const n = calls.length;
      return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ c: 1, say: `第${n}回，睇我发达` }) } }] }) });
    });
    await page.goto(`${BASE}?seed=5&fast=1`);
    await ready(page);
    await page.selectOption('.seat[data-seat="1"] .s-kind', 'deepseek');
    await page.fill('.seat[data-seat="1"] .s-key', FAKE_KEY);
    await page.screenshot({ path: path.join(OUT, 'deepseek-0-setup.png') });
    await page.tap('#start');
    let bubbleSeen = '', s;
    const until = Date.now() + 20000;
    while (Date.now() < until) {
      s = await snap(page);
      if (s.bubble && s.bubble.includes('睇我发达') && !bubbleSeen) { bubbleSeen = s.bubble; await page.screenshot({ path: path.join(OUT, 'deepseek-1-taunt.png') }); }
      if (calls.length >= 3 && bubbleSeen) break;
      if (s.phase === 'over') break;
      if (s.turn === 0 && !s.busy && s.pending) await page.tap('#act-a').catch(() => {});
      await page.waitForTimeout(60);
    }
    s = await snap(page);
    const seat1 = s.seats[1];
    const dom = await page.evaluate(() => document.documentElement.outerHTML.replace(/value="[^"]*"/g, '') + document.body.innerText);
    const store = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage)));
    const csp = await page.evaluate(() => self.__csp);
    const leaks = {
      dom: dom.includes(FAKE_KEY), storage: store.includes(FAKE_KEY), snapshot: JSON.stringify(s).includes(FAKE_KEY),
      console: log.console.some((c) => c.includes(FAKE_KEY)), url: calls.some((c) => c.keyInUrl), body: calls.some((c) => c.keyInBody),
    };
    check('K1', 'mock DeepSeek 座位真走了回合：请求带 Authorization、嘴炮出现在棋盘中心、决定被采用', calls.length >= 1 && calls.every((c) => c.auth && c.model === 'deepseek-chat' && c.promptLen < 400) && bubbleSeen && seat1.failures === 0 && seat1.provider === 'deepseek',
      { calls: calls.length, bubble: bubbleSeen, seat1, maxPrompt: Math.max(...calls.map((c) => c.promptLen)) });
    check('K2', 'key 不外露：DOM 文本、存储（未勾记住）、试玩快照、console、请求地址与正文里都没有', !Object.values(leaks).some(Boolean), leaks);
    const foreign = log.requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('https://api.deepseek.com/')).map((r) => r.url);
    check('K3', '页面不外连：请求只到本站与（mock 的）模型地址；CSP 0 次违规；无页面报错', !foreign.length && !csp.length && !log.errors.length, { foreign, csp, errors: log.errors, total: log.requests.length });
    await ctx.close();
  }

  // ---- 自定义地址被拦：TypeError → 人话提示，退回规则机器人，游戏照走（在最矮的手机视口里，提示行也不能把按钮挤出屏） ----
  {
    const vp = { width: 390, height: 664 };
    const { ctx, page, log } = await newPage(browser, vp, { touch: true });
    await page.route('https://relay.example.invalid/**', (route) => route.abort('failed'));
    await page.goto(`${BASE}?seed=5&fast=1`);
    await ready(page);
    await page.selectOption('.seat[data-seat="2"] .s-kind', 'deepseek');
    await page.fill('.seat[data-seat="2"] .s-key', FAKE_KEY);
    await page.click('.seat[data-seat="2"] details summary');
    await page.fill('.seat[data-seat="2"] .s-url', 'https://relay.example.invalid/v1/chat/completions');
    await page.tap('#start');
    let s;
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      s = await snap(page);
      if (s.seats[2].note || s.phase === 'over') break;
      if (s.turn === 0 && !s.busy && s.pending) await page.tap('#act-a').catch(() => {});
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(200);
    s = await snap(page);
    await page.screenshot({ path: path.join(OUT, 'relay-blocked.png') });
    const warn = await page.locator('#notes .warn[data-seat="2"]').textContent().catch(() => '');
    const lay = await layoutCheck(page, vp);
    check('K4', '自定义地址被浏览器拦：座位上提示「这个地址不允许网页直接调用」，这回合规则机器人代打，游戏继续；390×664 下提示行不挤出按钮', /不允许网页直接调用/.test(warn) && s.stats.turns >= 3 && !log.errors.length && !lay.overlaps.length && !lay.outside.length, { warn, turns: s.stats.turns, errors: log.errors, overlaps: lay.overlaps, outside: lay.outside });
    await ctx.close();
  }

  // ---- 记住 key：勾选才写，清掉按钮能清 ----
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 }, { touch: true });
    await page.goto(`${BASE}?seed=5&fast=1`);
    await ready(page);
    await page.selectOption('.seat[data-seat="1"] .s-kind', 'qwen');
    await page.fill('.seat[data-seat="1"] .s-key', FAKE_KEY);
    await page.check('#remember');
    await page.route('https://dashscope.aliyuncs.com/**', (route) => route.abort('failed'));
    await page.tap('#start');
    const stored = await page.evaluate(() => localStorage.getItem('guangzhou-rich/v1/seats') || '');
    await page.goto(`${BASE}?seed=5&fast=1`);
    await ready(page);
    const prefilled = await page.inputValue('.seat[data-seat="1"] .s-key');
    await page.click('#forget');
    const after = await page.evaluate(() => localStorage.getItem('guangzhou-rich/v1/seats'));
    const cleared = await page.inputValue('.seat[data-seat="1"] .s-key');
    check('K5', '勾「记住」才存 localStorage，重开会预填；点「清掉记住的 key」后存储和输入框都清空', stored.includes(FAKE_KEY) && prefilled === FAKE_KEY && after === null && cleared === '', { storedHasKey: stored.includes(FAKE_KEY), prefilledOk: prefilled === FAKE_KEY, after, clearedEmpty: cleared === '' });
    await ctx.close();
  }

  // ---- 换服务商时地址和模型名回到该家的默认值；「恢复默认」按钮同理（Alice 11-23：换模型后默认地址要重新出来）----
  {
    const DS = { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' };
    const QW = { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' };
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 }, { touch: true });
    await page.goto(`${BASE}?seed=5&fast=1`);
    await ready(page);
    const row = '.seat[data-seat="1"]';
    const read = async () => ({ url: await page.inputValue(`${row} .s-url`), model: await page.inputValue(`${row} .s-model`) });
    await page.selectOption(`${row} .s-kind`, 'deepseek');
    await page.click(`${row} details summary`);
    await page.fill(`${row} .s-url`, 'https://relay.example.com/v1/chat/completions');
    await page.fill(`${row} .s-model`, 'my-model');
    await page.selectOption(`${row} .s-kind`, 'qwen');
    const toQwen = await read();
    await page.fill(`${row} .s-url`, 'https://relay.example.com/v1/chat/completions');
    await page.selectOption(`${row} .s-kind`, 'deepseek');
    const backDs = await read();
    await page.fill(`${row} .s-url`, 'https://relay.example.com/v1/chat/completions');
    await page.fill(`${row} .s-model`, 'my-model');
    const btn = await page.$(`${row} .s-reset`);
    if (btn) await btn.click();
    const reset = await read();
    const lay = await layoutCheck(page, { width: 390, height: 844 });
    const ok = toQwen.url === QW.url && toQwen.model === QW.model && backDs.url === DS.url && backDs.model === DS.model && !!btn && reset.url === DS.url && reset.model === DS.model && !lay.overlaps.length;
    check('K6', '换服务商后接口地址与模型名回到该家默认；「恢复默认」一点就回到当前这家的默认值', ok, { toQwen, backDs, hasResetButton: !!btn, reset, overlaps: lay.overlaps });
    await ctx.close();
  }

  await browser.close();
  const report = { base: BASE, browser: 'Playwright Chromium (headless)', at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length, results };
  // 报告里同样不许有 key
  const text = JSON.stringify(report, null, 2);
  if (text.includes(FAKE_KEY)) throw new Error('报告里出现了 key');
  fs.writeFileSync(path.join(OUT, 'browser-report.json'), text);
  console.log(`\n${report.pass} pass / ${report.fail} fail`);
  process.exit(report.fail ? 1 : 0);
})();
