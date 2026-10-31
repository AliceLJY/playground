// 浏览器验收：SPEC.md 的 B1–B9。手动运行，需要全局 Playwright 和 Google Chrome。
//   node tools/build.mjs
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <输出目录> [页面地址]
// 不给地址就打开本地 dist/index.html。把 report.json 和截图写进输出目录。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'browser-check';
const base = process.argv[3] || 'file://' + path.resolve(__dirname, '../dist/index.html');
fs.mkdirSync(out, { recursive: true });
const pageUrl = base.split('?')[0];
const isExternal = (u) => !(u.startsWith('data:') || u.startsWith('blob:')) && (base.startsWith('file:') ? u.split('?')[0] !== pageUrl : new URL(u).origin !== new URL(base).origin || !new URL(u).pathname.startsWith(new URL(base).pathname.replace(/[^/]*$/, '')));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  const report = { base, browser: browser.version(), when: new Date().toISOString(), checks: [] };
  const check = (id, name, pass, detail) => { report.checks.push({ id, name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name} — ${detail}`); };
  const errors = [], external = [];
  const open = async (query, w, h, dpr = 1) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 600, isMobile: w < 600 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${query} ${w}x${h}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${query} ${w}x${h}: ${m.text()}`); });
    page.on('request', (r) => { if (isExternal(r.url())) external.push(r.url()); });
    await page.goto(base + query);
    await page.waitForFunction(() => window.__roach && window.__roach.ready, null, { polling: 100, timeout: 20000 });
    return { ctx, page };
  };
  const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display === 'none' || +cs.opacity === 0 ? null : { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }, sel);
  const overlap = (a, b) => a && b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  // B2 固定机位取景：桌面 1440×900 与手机 390×664（iPhone 减去 Safari 地址栏和底栏）
  const views = ['hero', 'tripod', 'hind', 'four', 'biped', 'xray', 'explode', 'wings', 'swag'];
  const frame = {};
  for (const [w, h, dpr, tag] of [[1440, 900, 1, 'desk'], [390, 664, 2, 'phone']]) {
    const bad = [];
    for (const v of views) {
      const { ctx, page } = await open('?view=' + v, w, h, dpr); await page.waitForTimeout(300);
      const box = await page.evaluate(() => window.__roach.bodyBox());
      const dock = await rect(page, '.dock'), title = await rect(page, '.title'), charts = tag === 'phone' ? await rect(page, '.charts') : null;
      await page.screenshot({ path: path.join(out, `${tag}-${v}.png`) });
      // 虫身中心在画里，且至少 60% 的身体不在底栏/标题/手机步态图后面
      const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
      const top = Math.max(title ? title.y1 / h : 0, 0), bottom = Math.min(dock.y0 / h, charts ? charts.y0 / h : 1);
      const visH = Math.max(0, Math.min(box.y1, bottom) - Math.max(box.y0, top)) / Math.max(1e-6, box.y1 - box.y0);
      const ok = cx > 0.12 && cx < 0.88 && cy > 0.08 && cy < 0.9 && visH >= (v === 'swag' && tag === 'desk' ? 0.85 : 0.6);
      frame[`${tag}-${v}`] = { box, visH: +visH.toFixed(2) };
      if (!ok) bad.push(`${v}: 中心 ${cx.toFixed(2)},${cy.toFixed(2)} 露出 ${(visH * 100).toFixed(0)}%`);
      if (v === 'hind') {
        const c = await rect(page, '#callout');
        const hit = [['标题', title], ['底栏', dock], ['图表', await rect(page, '.charts')], ['字幕', await rect(page, '#caption')]].filter(([, r]) => overlap(c, r)).map(([n]) => n);
        check(`B3-${tag}`, `${tag} 后足标注不压标题、底栏、图表`, c && hit.filter((n) => n !== '字幕').length === 0, c ? `压到：${hit.join('、') || '无'}` : '标注没出现');
      }
      await ctx.close();
    }
    check(`B2-${tag}`, `${tag} 九个固定机位虫身都在画里、露出够多`, bad.length === 0, bad.join('；') || '全部通过');
  }
  report.frame = frame;

  // B4 玩家默认档：无参数、1440×900、像素比 2；导览自己在走
  { const { ctx, page } = await open('', 1440, 900, 2);
    const t0 = await page.evaluate(() => window.__roach.state().tourClock); await page.waitForTimeout(3000);
    const s = await page.evaluate(() => ({ st: window.__roach.state(), info: window.__roach.info() }));
    await page.screenshot({ path: path.join(out, 'default.png') });
    report.default = s;
    check('B4', '默认档导览自动播放', s.st.mode === 'tour' && s.st.tourClock > t0 + 2, `模式 ${s.st.mode}，导览时钟 ${t0.toFixed(2)} → ${s.st.tourClock.toFixed(2)}；${s.info.renderer}；像素比 ${s.info.pixelRatio}；${s.info.calls} draw calls；帧率 ${s.st.fps.toFixed(0)}${/SwiftShader/i.test(s.info.renderer) ? '（软渲染，帧率不算数）' : ''}`);
    check('B4b', '默认档 draw call 不超过 450', s.info.calls <= 450, `${s.info.calls} 次`);
    await ctx.close(); }

  // B5 接管与交还：拖速度条就交出控制，idle 秒后回到导览（?idle=3 缩短等待）
  { const { ctx, page } = await open('?idle=3', 1440, 900);
    await page.waitForTimeout(800);
    const sl = await rect(page, '#speed');
    await page.mouse.click(sl.x0 + (sl.x1 - sl.x0) * 0.95, (sl.y0 + sl.y1) / 2);
    await page.waitForTimeout(1500);
    const s1 = await page.evaluate(() => window.__roach.state());
    await page.waitForTimeout(3200);
    const s2 = await page.evaluate(() => window.__roach.state());
    check('B5', '点速度条接管、目标速度跟着变，静置后回到导览', s1.mode === 'live' && s1.target.v > 1.3 && s1.live.v > 1.0 && s2.mode === 'tour', `点后 ${s1.mode} 目标 ${s1.target.v.toFixed(2)} 当前 ${s1.live.v.toFixed(2)}；静置后 ${s2.mode}`);
    await ctx.close(); }

  // B6 按钮：最靓的仔、拆开、单看后足、X 光
  { const { ctx, page } = await open('', 1440, 900);
    await page.waitForTimeout(500);
    await page.click('[data-act="swag"]'); await page.waitForTimeout(2600);
    const a = await page.evaluate(() => ({ st: window.__roach.state(), swag: document.body.classList.contains('swag'), pressed: document.querySelector('[data-act="swag"]').getAttribute('aria-pressed') }));
    await page.screenshot({ path: path.join(out, 'live-swag.png') });
    await page.click('[data-act="swag"]'); await page.click('[data-act="explode"]'); await page.waitForTimeout(2000);
    const b = await page.evaluate(() => window.__roach.state());
    await page.click('[data-act="explode"]'); await page.click('[data-sys="legs2"]'); await page.waitForTimeout(800);
    const c = await page.evaluate(() => ({ st: window.__roach.state(), callout: document.querySelector('#callout').classList.contains('on'), text: document.querySelector('#callout b').textContent }));
    await page.click('[data-act="xray"]'); await page.waitForTimeout(300);
    const d = await page.evaluate(() => window.__roach.state());
    check('B6', '按钮：亮相立起戴墨镜、拆开、单看后足出标注、X 光', a.st.live.swag > 0.9 && a.swag && a.pressed === 'true' && b.live.explode > 0.9 && c.st.live.focus === 'legs2' && c.callout && c.text === '后足' && d.live.xray && d.live.focus === null,
      `亮相 ${a.st.live.swag.toFixed(2)}；拆开 ${b.live.explode.toFixed(2)}；单看 ${c.st.live.focus}、标注「${c.text}」；X 光 ${d.live.xray}`);
    await ctx.close(); }

  // B7 手机：底栏完整在可视区，「最靓的仔」不用滑就点得到，点中心命中它
  for (const [w, h] of [[390, 664], [412, 700], [360, 600]]) {
    const { ctx, page } = await open('', w, h, 2);
    await page.waitForTimeout(400);
    const dock = await rect(page, '.dock'), btn = await rect(page, '[data-act="swag"]');
    const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('[data-act]') ? e.closest('[data-act]').dataset.act : e && e.tagName; }, [(btn.x0 + btn.x1) / 2, (btn.y0 + btn.y1) / 2]);
    await page.screenshot({ path: path.join(out, `phone-default-${w}x${h}.png`) });
    check(`B7-${w}x${h}`, `${w}×${h} 底栏在屏内，「最靓的仔」可直接点`, dock.y1 <= h && dock.x0 >= 0 && dock.x1 <= w && btn.x1 <= w && hit === 'swag', `底栏 ${dock.y0.toFixed(0)}–${dock.y1.toFixed(0)}，按钮右缘 ${btn.x1.toFixed(0)}，中心命中 ${hit}`);
    await ctx.close();
  }

  // B8 首帧就有虫（分享卡、录片第 0 帧）
  { const { ctx, page } = await open('?at=0', 1200, 630);
    const box = await page.evaluate(() => window.__roach.bodyBox());
    await page.screenshot({ path: path.join(out, 'card-1200x630.png') });
    check('B8', '第 0 帧画面里就有整只虫', box.x0 > 0.05 && box.x1 < 0.95 && box.y0 > 0.02 && box.y1 < 0.98, `虫身 x ${box.x0.toFixed(2)}–${box.x1.toFixed(2)}，y ${box.y0.toFixed(2)}–${box.y1.toFixed(2)}`);
    await ctx.close(); }

  if (base.startsWith('file:')) { const kb = fs.statSync(pageUrl.replace('file://', '')).size / 1024; check('B9', '单文件小于 1 MB（链接预览卡要求）', kb < 1024, `${kb.toFixed(0)} KB`); }
  check('B1', '页面无报错、不向外部请求任何东西', errors.length === 0 && external.length === 0, `报错 ${errors.length} 条${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}；外部请求 ${external.length} 个${external.length ? '：' + external.slice(0, 3).join(' ') : ''}`);
  report.errors = errors; report.external = external;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.pass).length;
  console.log(failed ? `${failed} 项未通过` : '全部通过');
  await browser.close(); process.exit(failed ? 1 : 0);
})();
