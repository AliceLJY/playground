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

// 2026-11-24 外部试玩复核加的检查。EXTRA_ONLY=1 时只跑这一组（改一条、看一条用）。
async function extra(browser) {
  // ---- D1 骰面与实际点数同源（2026-11-24 外部试玩：骰面偶尔不是刚掷的点）----
  // 正常速度（带摇骰动画）下，点完「掷两颗 / 掷一颗」的当下、动画中途、走完之后，DOM 上的骰面都要等于规则核心刚掷出的点；
  // 两颗只显示一颗、一颗显示两颗都算错。走完后棋子所在格要等于核心的位置。旧代码两处错：摇骰那 300ms 里显示上一手的点；掷完没有决定要做时核心当场把 g.dice 清空，这一手的点从来没画出来（骰面停在上一手，两颗/一颗都能错）。
  {
    const { ctx, page, log } = await newPage(browser, { width: 1280, height: 800 }, { dpr: 1 });
    await page.goto(`${BASE}?seed=11`);
    await ready(page);
    await page.click('#start');
    const bad = [];
    let rolls = 0, ones = 0, twos = 0, tokenBad = 0;
    const domDice = () => page.evaluate(() => [...document.querySelectorAll('#dice .die')].filter((d) => !d.hidden).map((d) => d.textContent).join(','));
    const until = Date.now() + 120000;
    while (rolls < 6 && Date.now() < until) {
      const s = await snap(page);
      if (s.phase === 'over') break;
      if (s.turn === 0 && !s.busy && s.pending) {
        if (s.pending.type !== 'dice') { await page.click('#act-a'); await page.waitForTimeout(100); continue; }
        const one = rolls % 2 === 1;
        await page.click(one ? '#act-b' : '#act-a');
        rolls++; if (one) ones++; else twos++;
        const real = (await snap(page)).lastRoll.dice.join(',');
        for (const wait of [0, 120, 250]) {
          if (wait) await page.waitForTimeout(wait === 120 ? 120 : 130);
          const dom = await domDice();
          if (dom !== real) bad.push({ roll: rolls, atMs: wait, dom, real });
        }
        // 等这一手走完（busy 放开），骰面仍对、棋子在核心给的位置上
        await page.waitForFunction(() => !self.__PLAYTEST__.snapshot().busy, null, { polling: 50, timeout: 8000 }).catch(() => {});
        const after = await snap(page);
        const domEnd = await domDice();
        if (domEnd !== after.lastRoll.dice.join(',') && after.turn === 0) bad.push({ roll: rolls, atMs: 'end', dom: domEnd, real: after.lastRoll.dice.join(',') });
        const cell = await page.evaluate(() => { const t = document.querySelector('#board .tok[title="你"]'); return t ? Number(t.closest('.cell').dataset.sq) : -1; });
        if (cell !== after.players[0].pos) tokenBad++;
      }
      await page.waitForTimeout(60);
    }
    check('D1', '骰面与实际点数同源：点完立刻、摇骰中途、走完，DOM 骰面都等于刚掷的点（两颗不缺、一颗不多）；棋子停在核心给的格上', rolls === 6 && ones === 3 && twos === 3 && !bad.length && !tokenBad && !log.errors.length,
      { rolls, ones, twos, bad: bad.slice(0, 4), badCount: bad.length, tokenBad, errors: log.errors });
    await ctx.close();
  }

  // ---- O1 结算遮罩盖满整个视口（外部试玩：1280 宽下遮罩只有 1100px，右边「换座位」仍能点）----
  // 结算页出现时，遮罩要铺满视口；游玩页的每个按钮中心点点下去，命中的必须是遮罩里的东西，不能是底下的按钮。
  for (const vp of [{ width: 1280, height: 521 }, { width: 1280, height: 800 }, { width: 1600, height: 900 }, { width: 390, height: 664 }]) {
    const { ctx, page, log } = await newPage(browser, vp, { dpr: 1 });
    await page.goto(`${BASE}?view=over&seed=7`);
    await ready(page);
    const r = await page.evaluate(() => {
      const o = document.getElementById('over').getBoundingClientRect();
      const under = [...document.querySelectorAll('#play button')].map((b) => { const q = b.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { id: b.id, leaked: !!hit && !document.getElementById('over').contains(hit) }; });
      return { left: o.left, right: o.right, top: o.top, bottom: o.bottom, vw: innerWidth, vh: innerHeight, under };
    });
    const covered = r.left <= 0 && r.right >= r.vw && r.top <= 0 && r.bottom >= r.vh;
    const leaked = r.under.filter((x) => x.leaked).map((x) => x.id);
    check(`O1-${vp.width}x${vp.height}`, `结算遮罩盖满 ${vp.width}×${vp.height}，底下的按钮点不到`, covered && !leaked.length && !log.errors.length, { overlay: [r.left, r.right, r.top, r.bottom], viewport: [r.vw, r.vh], leaked, errors: log.errors });
    await ctx.close();
  }

  // ---- G1 记录栏：机器人回合要看得到，最新在上就不能从 1 开始数（外部试玩：记录栏像倒序；机器人回合不显示）----
  // 打到又轮回自己：记录里要能看到三个机器人各自这一圈做了什么；最新的在最上面；条目前不带从 1 数起的序号。
  for (const vp of [{ width: 1280, height: 800, dpr: 1 }, { width: 390, height: 664, touch: true }]) {
    const { ctx, page, log } = await newPage(browser, vp, vp);
    await page.goto(`${BASE}?seed=11&fast=1`);
    await ready(page);
    await page.click('#start');
    // 一路点主按钮打到第 3 轮轮到自己掷骰（此前三个机器人至少各走过两次）
    const until = Date.now() + 30000;
    for (;;) {
      const s = await snap(page);
      if (s.phase === 'over' || Date.now() > until || (s.round >= 3 && s.turn === 0 && !s.busy && s.pending && s.pending.type === 'dice')) break;
      if (s.turn === 0 && !s.busy && s.pending) await page.click('#act-a').catch(() => {});
      await page.waitForTimeout(60);
    }
    const r = await page.evaluate(() => {
      const items = [...document.querySelectorAll('#log li')].map((li) => li.textContent);
      const st = getComputedStyle(document.getElementById('log'));
      const rows = [...document.querySelectorAll('#log li')].map((li) => getComputedStyle(li).listStyleType);
      return { items, listStyle: st.listStyleType, rows };
    });
    const names = ['阿发', '阿珍', '阿强'];
    const missing = names.filter((n) => !r.items.some((t) => t.includes(n)));
    const newestFirst = r.items.length > 0 && r.items[0].includes('阿强');
    const numbered = r.listStyle !== 'none' && r.listStyle !== 'disc' && r.listStyle !== 'circle' && r.listStyle !== 'square';
    check(`G1-${vp.width}x${vp.height}`, `记录栏：三个机器人这一圈的动作都在、最新在最上、不带从 1 数起的序号（${vp.width}×${vp.height}）`, !missing.length && newestFirst && !numbered && !log.errors.length,
      { items: r.items, missing, newestFirst, listStyle: r.listStyle, errors: log.errors });
    await ctx.close();
  }

  // ---- T1 竖屏棋子不盖字（外部试玩：开局四棋子盖住「出发」、棋子盖价格）----
  // 开局四个棋子叠在出发格，再快速打一段，每个采样时刻：棋子外框与格内文字（地名、价格、楼层标记）的重叠面积为 0（容许 1px 抗锯齿），棋子不出格。
  const tokenOverlaps = (page) => page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('#board .cell').forEach((c) => {
      const cr = c.getBoundingClientRect();
      const toks = [...c.querySelectorAll('.tok')].map((t) => t.getBoundingClientRect());
      if (!toks.length) return;
      toks.forEach((t) => { if (t.left < cr.left - 1 || t.right > cr.right + 1 || t.bottom > cr.bottom + 1) bad.push({ sq: c.dataset.sq, what: 'outside-cell' }); });
      [...c.querySelectorAll('.nm,.pr,.lv')].filter((e) => e.textContent.trim()).forEach((e) => {
        const rg = document.createRange(); rg.selectNodeContents(e);
        const x = rg.getBoundingClientRect();
        toks.forEach((t) => { const ix = Math.min(x.right, t.right) - Math.max(x.left, t.left), iy = Math.min(x.bottom, t.bottom) - Math.max(x.top, t.top); if (ix > 1 && iy > 1) bad.push({ sq: c.dataset.sq, text: e.textContent.trim(), area: Math.round(ix * iy) }); });
      });
    });
    return bad;
  });
  for (const vp of [{ width: 390, height: 664 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const { ctx, page, log } = await newPage(browser, vp, { touch: true });
    await page.goto(`${BASE}?seed=7&fast=1`);
    await ready(page);
    await page.click('#start');
    await page.waitForTimeout(100);
    const atStart = await tokenOverlaps(page);
    const sampled = []; let samples = 0;
    const until = Date.now() + 14000;
    while (Date.now() < until) {
      const s = await snap(page);
      if (s.phase === 'over') break;
      if (s.turn === 0 && !s.busy && s.pending) await page.tap('#act-a').catch(() => {});
      const b = await tokenOverlaps(page);
      samples++;
      if (b.length) sampled.push(...b);
      await page.waitForTimeout(90);
    }
    check(`T1-${vp.width}x${vp.height}`, `竖屏棋子不盖字：开局四个棋子叠在出发格、再打一段共 ${samples} 个采样，棋子与地名/价格/楼层标记重叠为 0（${vp.width}×${vp.height}）`, !atStart.length && !sampled.length && !log.errors.length,
      { atStart: atStart.slice(0, 4), atStartCount: atStart.length, sampledCount: sampled.length, firstSampled: sampled.slice(0, 3), samples, errors: log.errors });
    await ctx.close();
  }

  // ---- H1 规则行不留单字尾行（外部试玩：规则行尾单字成行）----
  // 选座页三行怎么玩，在几种窄屏宽度下，每一行折行后最后一行至少 3 个字宽（标点也算一字，不许「买。」这种孤字尾巴），且不横向溢出。
  for (const w of [390, 375, 360, 320]) {
    const { ctx, page, log } = await newPage(browser, { width: w, height: 664 }, { touch: true });
    await page.goto(`${BASE}?seed=7`);
    await ready(page);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.howto li, .keynote, .masthead .tag')].map((li) => {
      const rg = document.createRange(); rg.selectNodeContents(li);
      const lines = {};
      [...rg.getClientRects()].forEach((r) => { const k = Math.round(r.top); lines[k] = (lines[k] || 0) + r.width; });
      const ws = Object.values(lines);
      const fs = parseFloat(getComputedStyle(li).fontSize);
      return { text: li.textContent.slice(0, 8), lines: ws.length, lastChars: Math.round((ws[ws.length - 1] / fs) * 10) / 10, overflow: li.scrollWidth > li.clientWidth + 1 };
    }));
    const orphan = rows.filter((r) => r.lines > 1 && r.lastChars < 3);
    check(`H1-${w}`, `规则行（三行怎么玩、key 说明、副标题）折行后最后一行不少于 3 个字宽、不溢出（${w} 宽）`, !orphan.length && !rows.some((r) => r.overflow) && !log.errors.length, { rows, orphan, errors: log.errors });
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  const ONLY = !!process.env.EXTRA_ONLY;
  if (!ONLY) {

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

  }
  await extra(browser);

  await browser.close();
  const report = { base: BASE, browser: 'Playwright Chromium (headless)', at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length, results };
  // 报告里同样不许有 key
  const text = JSON.stringify(report, null, 2);
  if (text.includes(FAKE_KEY)) throw new Error('报告里出现了 key');
  fs.writeFileSync(path.join(OUT, 'browser-report.json'), text);
  console.log(`\n${report.pass} pass / ${report.fail} fail`);
  process.exit(report.fail ? 1 : 0);
})();
