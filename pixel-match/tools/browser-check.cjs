// 浏览器验收：固定机位截图、真实点击、版式、牌面像素和 Node 软光栅逐像素一致、绘制耗时、开局 30 秒逐帧。
//
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <页面地址> <输出目录>
//   本地：python3 -m http.server 8765（在仓根）后用 http://127.0.0.1:8765/pixel-match/
//   线上：https://aliceljy.github.io/playground/pixel-match/
// 请求路径按页面所在目录换算（basePath），本地和线上同一套判据。任何一条不过退出码 1。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const C = require('../src/core.js');
const F = require('../src/figures.js');
const K = require('../src/card.js');
const RS = require('../src/raster.js');

const [base, out] = process.argv.slice(2);
if (!base || !out) { console.error('用法见文件头'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const root = new URL(base.endsWith('/') ? base : base + '/');
const basePath = root.pathname;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`); };

async function open(browser, query, vp, dpr) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: dpr, hasTouch: true, isMobile: vp[0] < 600 });
  const page = await ctx.newPage();
  const errors = [], foreign = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol === 'data:') return; if (u.origin !== root.origin || !u.pathname.startsWith(basePath)) foreign.push(r.url()); });
  await page.goto(new URL(query, root).href);
  await page.waitForFunction(() => window.__pixelMatch && window.__pixelMatch.ready, null, { polling: 100, timeout: 30000 });
  return { ctx, page, errors, foreign };
}

(async () => {
  const browser = await chromium.launch();
  const PHONE = [390, 664], DESK = [1280, 720];

  // ---- 1 固定机位：手机与桌面各拍一遍，钩子回报的状态要对得上 ----
  const want = { hero: { level: 2, mode: 'play' }, wide: { level: 4, mode: 'play', remaining: 48 }, match: { level: 1, mode: 'play' }, photo: { level: 0, mode: 'photo' }, final: { level: 4, mode: 'done' }, lost: { level: 4, mode: 'lost' } };
  for (const [vp, dpr, tag] of [[PHONE, 3, 'phone'], [DESK, 1, 'desk']]) for (const v of Object.keys(want)) {
    const { ctx, page, errors, foreign } = await open(browser, `?view=${v}`, vp, dpr);
    await page.waitForTimeout(250);
    const p = await page.evaluate(() => window.__pixelMatch.probe());
    await page.screenshot({ path: path.join(out, `${tag}-${v}.png`) });
    const w = want[v], vs = p.viewState || {};
    const okState = vs.view === v && Object.entries(w).every(([k, val]) => vs[k] === val);
    check(`机位 ${v}（${tag}）进入了要的状态`, okState, JSON.stringify(vs));
    if (v === 'match') check('机位 match 停在一对刚配上、小人正在做动作的时刻', p.matches >= 1, `matches=${p.matches}`);
    check(`机位 ${v}（${tag}）无报错、不向站外请求`, !errors.length && !foreign.length, [...errors, ...foreign].join(' | '));
    await ctx.close();
  }

  // ---- 2 真实点击：默认入口 → 开始 → 第 1 关，点一对能消、点错会换选、提示和暂停按钮管用 ----
  {
    const { ctx, page, errors } = await open(browser, '', PHONE, 3);
    await page.getByRole('button', { name: '开始玩' }).tap();
    await page.getByRole('button', { name: '开始', exact: true }).tap();
    let p = await page.evaluate(() => window.__pixelMatch.probe());
    check('点「开始玩」「开始」进第 1 关并开始计时', p.mode === 'play' && p.level === 0 && p.status === 'playing', `mode=${p.mode}`);
    const move = await page.evaluate(() => { const m = window.PixelMatchCore.firstMove(window.__pixelMatch.probe().grid); return m && [m[0], m[1]].map((c) => ({ ...window.__pixelMatch.cellCenter(c.r, c.c), r: c.r, c: c.c })); });
    await page.touchscreen.tap(move[0].x, move[0].y); await page.waitForTimeout(120);
    p = await page.evaluate(() => window.__pixelMatch.probe());
    check('点第一张：选中', p.selected && p.selected.r === move[0].r && p.selected.c === move[0].c, JSON.stringify(p.selected));
    await page.screenshot({ path: path.join(out, 'tap-selected.png') });
    await page.touchscreen.tap(move[1].x, move[1].y); await page.waitForTimeout(150);
    p = await page.evaluate(() => window.__pixelMatch.probe());
    check('点第二张一样的：消掉一对', p.matches === 1 && p.grid[move[0].r][move[0].c] === -1 && p.grid[move[1].r][move[1].c] === -1, `matches=${p.matches}`);
    await page.screenshot({ path: path.join(out, 'tap-matched.png') });
    const pair = await page.evaluate(() => { const g = window.__pixelMatch.probe().grid; const cells = []; g.forEach((row, r) => row.forEach((t, c) => { if (t >= 0) cells.push({ r, c, t }); })); const a = cells[0], b = cells.find((x) => x.t !== a.t); return [a, b].map((x) => ({ ...window.__pixelMatch.cellCenter(x.r, x.c), r: x.r, c: x.c })); });
    await page.touchscreen.tap(pair[0].x, pair[0].y); await page.waitForTimeout(80); await page.touchscreen.tap(pair[1].x, pair[1].y); await page.waitForTimeout(80);
    p = await page.evaluate(() => window.__pixelMatch.probe());
    check('点两张不一样的：选中换到后点的那张', p.mistakes >= 1 && p.selected && p.selected.r === pair[1].r && p.selected.c === pair[1].c);
    await page.getByRole('button', { name: '提示' }).tap(); await page.waitForTimeout(100);
    p = await page.evaluate(() => window.__pixelMatch.probe());
    check('点「提示」：次数减一', p.hints === C.HINTS - 1, `hints=${p.hints}`);
    await page.screenshot({ path: path.join(out, 'tap-hint.png') });
    await page.getByRole('button', { name: '暂停' }).tap(); await page.waitForTimeout(100);
    const t1 = (await page.evaluate(() => window.__pixelMatch.probe())).time; await page.waitForTimeout(600);
    const t2 = (await page.evaluate(() => window.__pixelMatch.probe())).time;
    check('点「暂停」：计时停住', t1 === t2, `${t1} → ${t2}`);
    await page.getByRole('button', { name: '继续' }).tap(); await page.waitForTimeout(400);
    check('点「继续」：接着计时', (await page.evaluate(() => window.__pixelMatch.probe())).time > t2);
    check('真实点击全程无报错', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---- 3 版式：多种手机视口里，按钮完整在可视区、点得到、够大；棋盘在顶栏和底栏之间 ----
  for (const [w, h, dpr] of [[390, 664, 3], [412, 700, 2.625], [360, 600, 2], [375, 548, 2], [1280, 720, 1], [844, 390, 3]]) {
    const { ctx, page } = await open(browser, '?view=wide', [w, h], dpr);
    await page.evaluate(() => { window.__pixelMatch.freeze(false); });
    const r = await page.evaluate(() => {
      const p = window.__pixelMatch.probe(), L = p.layout, out = [];
      for (const b of document.querySelectorAll('#bar button')) { const q = b.getBoundingClientRect(), hit = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); out.push({ id: b.id, ok: q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight && q.height >= 44 && q.width >= 44 && b.contains(hit) }); }
      const boardOk = L.board.y >= 40 && L.board.y + L.board.h <= innerHeight - 50 && L.board.x >= 0 && L.board.x + L.board.w <= innerWidth;
      return { buttons: out, boardOk, card: L.card, scale: L.scale };
    });
    const tall = h >= 600 && w < 600;
    check(`版式 ${w}×${h}：底栏三个按钮完整、点得到、≥44px`, r.buttons.every((b) => b.ok), JSON.stringify(r.buttons));
    check(`版式 ${w}×${h}：棋盘在顶栏和底栏之间`, r.boardOk);
    if (tall) check(`版式 ${w}×${h}：第 5 关牌面 ≥ 40×46 CSS、小人每个像素 ≥ 1.5 CSS`, r.card.w >= 40 && r.card.h >= 46 && r.scale.adult / dpr >= 1.5, JSON.stringify(r));
    await page.screenshot({ path: path.join(out, `layout-${w}x${h}.png`) });
    // 结尾页按钮
    await ctx.close();
    const end = await open(browser, '?view=final', [w, h], dpr);
    const eb = await end.page.evaluate(() => [...document.querySelectorAll('#panel button')].map((b) => { const q = b.getBoundingClientRect(), hit = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return q.top >= 0 && q.bottom <= innerHeight && q.left >= 0 && q.right <= innerWidth && q.height >= 44 && b.contains(hit); }));
    check(`版式 ${w}×${h}：合影页「再玩一遍」完整在可视区`, eb.length && eb.every(Boolean));
    await end.page.screenshot({ path: path.join(out, `layout-final-${w}x${h}.png`) });
    await end.ctx.close();
  }

  // ---- 4 牌面像素：浏览器真画布上的牌，和 Node 软光栅画的同一张逐像素一致（像不像的读数就是玩家看到的那张） ----
  for (const dpr of [2, 3]) {
    const { ctx, page } = await open(browser, '?view=wide', PHONE, dpr);
    const cells = await page.evaluate(() => { const p = window.__pixelMatch.probe(), seen = new Set(), out = []; p.grid.forEach((row, r) => row.forEach((t, c) => { if (t >= 0 && !seen.has(t)) { seen.add(t); out.push([r, c]); } })); return out; });
    let worst = 0, n = 0;
    for (const [r, c] of cells) {
      const rd = await page.evaluate(([r, c]) => window.__pixelMatch.cardReadout(r, c), [r, c]);
      const L = C.layout(PHONE[0], PHONE[1], 6, 8, dpr), ras = RS.Raster(rd.w, rd.h, '#000000');
      K.paintCard(ras.ctx, F.ROSTER.find((f) => f.id === rd.type), rd.w, rd.h, L.scale.adult, L.scale.kid);
      const e = Math.max(1, Math.round(rd.h / 60)), m = e * 3;
      for (let y = m; y < rd.h - m; y++) for (let x = m; x < rd.w - m; x++) {
        const o = (y * rd.w + x), d = Math.max(...[0, 1, 2].map((k) => Math.abs(rd.data[o * 4 + k] - ras.data[o * 3 + k])));
        if (d > worst) worst = d; n++;
      }
    }
    check(`牌面像素（像素比 ${dpr}）：13 种小人的真画布与软光栅逐像素一致`, cells.length === 13 && worst <= 2, `比了 ${n} 个像素，最大差 ${worst}`);
    await ctx.close();
  }

  // ---- 5 绘制耗时：默认入口第 5 关，手抖档自动驾驶连玩 9 秒 ----
  {
    const { ctx, page, errors } = await open(browser, '', PHONE, 3);
    await page.evaluate(() => { window.__pixelMatch.start(4, 3); window.__pixelMatch.autopilot('human'); });
    await page.waitForTimeout(9000);
    const p = await page.evaluate(() => window.__pixelMatch.probe());
    check('绘制耗时：平均 ≤ 4 毫秒、最长 ≤ 16 毫秒', p.draw.mean <= 4 && p.draw.max <= 16, JSON.stringify(p.draw));
    check('自动驾驶 9 秒里真的消掉过牌', p.matches >= 1, `matches=${p.matches}`);
    check('连玩无报错', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ---- 6 开局 30 秒逐帧：从默认入口进，点开始、认人、开始、头几下真实点击 ----
  {
    const dir = path.join(out, 'opening'); fs.mkdirSync(dir, { recursive: true });
    const { ctx, page } = await open(browser, '', PHONE, 2);
    let k = 0; const shot = async (n = 1, gap = 250) => { for (let i = 0; i < n; i++) { await page.screenshot({ path: path.join(dir, `${String(++k).padStart(3, '0')}.png`) }); await page.waitForTimeout(gap); } };
    await shot(4);
    await page.getByRole('button', { name: '开始玩' }).tap(); await shot(4);
    await page.getByRole('button', { name: '开始', exact: true }).tap(); await shot(2);
    for (let i = 0; i < 5; i++) {
      const mv = await page.evaluate(() => { const m = window.PixelMatchCore.firstMove(window.__pixelMatch.probe().grid); return m && [m[0], m[1]].map((c) => window.__pixelMatch.cellCenter(c.r, c.c)); });
      if (!mv) break;
      await page.waitForTimeout(700); await page.touchscreen.tap(mv[0].x, mv[0].y); await shot(1, 120);
      await page.waitForTimeout(400); await page.touchscreen.tap(mv[1].x, mv[1].y); await shot(4, 120);
    }
    const p = await page.evaluate(() => window.__pixelMatch.probe());
    check('开局：头几下真实点击都消掉了', p.matches === 5, `matches=${p.matches}，帧在 ${dir}`);
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base: root.href, when: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
