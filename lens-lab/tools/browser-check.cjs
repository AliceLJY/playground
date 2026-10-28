// Browser acceptance for 凸透镜成像: SPEC 验收条目 B1-B6. Run by hand; needs an existing Playwright install and Google Chrome.
//   node tools/build.mjs
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <out-dir> [page-url]
// Without a URL it opens dist/index.html from disk. The lesson is walked with real mouse drags and clicks, not hooks;
// the hook only reports state and where a bench point is on screen.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'browser-check';
const base = process.argv[3] || 'file://' + path.resolve(__dirname, '../dist/index.html');
fs.mkdirSync(out, { recursive: true });
const isExternal = (u) => !(u.startsWith('data:') || u.startsWith('blob:')) && (base.startsWith('file:') ? u.split('?')[0] !== base.split('?')[0] : new URL(u).origin !== new URL(base).origin);
const L = 40, F = 10, Y0 = 18;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { base, browser: browser.version(), when: new Date().toISOString(), checks: [] };
  let fails = 0;
  const check = (id, name, pass, detail) => { report.checks.push({ id, name, pass: !!pass, detail }); if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name} — ${detail}`); };
  const errors = [], external = [];
  const open = async (query, w, h, dpr = 1, touch = false) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${query}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${query}: ${m.text()}`); });
    page.on('request', (r) => { if (isExternal(r.url())) external.push(r.url()); });
    await page.goto(base + query);
    await page.waitForFunction(() => window.__lens && window.__lens.ready, null, { polling: 100, timeout: 20000 });
    await page.waitForTimeout(400);
    return { ctx, page };
  };
  const S = (page) => page.evaluate(() => window.__lens.state());
  const P = (page, x, y) => page.evaluate(([a, b]) => window.__lens.project(a, b), [x, y]);
  // grab an object by its post and drag it along the ruler to bench position `to`, in small mouse steps
  const drag = async (page, from, to, grabY = Y0 - 6) => {
    const a = await P(page, from, grabY), b = await P(page, to, grabY);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    for (let i = 1; i <= 24; i++) { await page.mouse.move(a.x + ((b.x - a.x) * i) / 24, a.y + ((b.y - a.y) * i) / 24); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(120);
  };
  const best = (u) => L + (u * F) / (u - F);

  // B1-B4: the whole lesson by hand, desktop 1440x860, player default dpr 2
  {
    const { ctx, page } = await open('', 1440, 860, 2);
    const st0 = await S(page);
    await drag(page, st0.candle, 15);
    const st1 = await S(page);
    check('B2', 'dragging the candle moves it along the ruler', Math.abs(st1.candle - 15) < 0.8, `asked 15, got ${st1.candle.toFixed(2)}`);
    await drag(page, 15, 30);   // back to the start position
    // step 1: parallel light, screen to the focal point
    await page.click('#sun'); let s = await S(page);
    await drag(page, s.screen, L + F, Y0 - 13); s = await S(page);
    if (!s.focusFound) { await drag(page, s.screen, L + F + (L + F - s.screen), Y0 - 13); s = await S(page); }
    const toastFocus = await page.textContent('#toast');
    await page.click('#sun');
    // step 2: guess
    await page.click('#guess button:nth-child(2)');
    // steps 3-5: three real images, screen dragged to the sharp spot
    for (const [u, key] of [[30, 'far'], [20, 'two'], [15, 'mid']]) {
      s = await S(page); await drag(page, s.candle, L - u + (u === 20 ? 0.3 : 0));
      s = await S(page); await drag(page, s.screen, best(s.u), Y0 - 13); s = await S(page);
      if (!s.found.includes(key)) { await drag(page, s.screen, best(s.u) + (best(s.u) - s.screen) * 0.9, Y0 - 13); s = await S(page); }
      check('B3' + key, `a ${key} image is found by dragging the screen`, s.found.includes(key), `u=${s.u.toFixed(2)} screen=${s.screen.toFixed(2)} best=${best(s.u).toFixed(2)}`);
    }
    // step 6: candle onto f (it clicks on), sweep the screen
    s = await S(page); await drag(page, s.candle, L - F - 0.4); s = await S(page);
    await drag(page, s.screen, 50, Y0 - 13); await drag(page, 50, 80, Y0 - 13); s = await S(page);
    check('B3focal', 'candle snaps onto f and a screen sweep records "no image"', s.u === F && s.found.includes('focal'), `u=${s.u} found=${s.found}`);
    // step 7: inside f, then look through the lens
    await drag(page, L - F, L - 6); await page.click('#eye'); await page.waitForTimeout(200); s = await S(page);
    check('B3near', 'inside f, "look with the eye" finds the virtual image', s.found.includes('near'), `u=${s.u.toFixed(2)} found=${s.found}`);
    const answer = await page.isVisible('#answer');
    check('B4', 'the whole lesson completes with real drags and clicks and ends on the answer', s.step === 7 && s.focusFound && s.predicted === 1 && answer, `step ${s.step + 1}/8, focus ${s.focusFound}, guess ${s.predicted}, answer visible ${answer}; focus toast "${(toastFocus || '').slice(0, 24)}…"`);
    const rows = await page.$$eval('#table tr td.q', (t) => t.length);
    check('B4t', 'the table is completely filled', rows === 0, `${rows} empty cells`);
    await page.screenshot({ path: path.join(out, 'desktop-answer.png') });
    const info = await page.evaluate(() => window.__lens.info());
    check('B6', 'draw calls within 120', info.calls <= 120, `${info.calls} calls, ${info.tris} triangles, renderer ${info.renderer}`);
    report.renderer = info.renderer;
    await ctx.close();
  }
  // B5: phone viewports with browser bars subtracted; the bench, panel controls and inset must not collide
  for (const [w, h] of [[390, 664], [412, 700], [360, 600]]) {
    const { ctx, page } = await open('', w, h, 2, true);
    const r = await page.evaluate(() => {
      const box = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x0: b.left, x1: b.right, y0: b.top, y1: b.bottom }; };
      return { stage: box('scene'), inset: box('inset'), tag: box('tag'), sun: box('sun'), card: box('stepTitle') };
    });
    const lensP = await P(page, L, Y0), candleP = await P(page, 10, Y0), endP = await P(page, 100, 0), zeroP = await P(page, 0, 0);
    const inStage = (p) => p.x >= r.stage.x0 && p.x <= r.stage.x1 && p.y >= r.stage.y0 && p.y <= r.stage.y1;
    const underInset = (p) => p.x >= r.inset.x0 && p.x <= r.inset.x1 && p.y >= r.inset.y0 && p.y <= r.inset.y1;
    const ok = [lensP, candleP, endP, zeroP].every(inStage) && ![lensP, candleP, endP, zeroP].some(underInset) && r.stage.y1 - r.stage.y0 >= 200 && r.sun.y1 <= h && r.card.y1 <= h && r.tag.x1 < r.inset.x0;
    check('B5', `phone ${w}x${h}: bench fully on stage, not under the inset; step card and tools visible without scrolling`, ok, `stage h ${(r.stage.y1 - r.stage.y0).toFixed(0)}, tools bottom ${r.sun.y1.toFixed(0)}/${h}, ruler ends at (${zeroP.x.toFixed(0)}, ${endP.x.toFixed(0)}) of ${w}`);
    await page.screenshot({ path: path.join(out, `phone-${w}x${h}.png`) });
    // touch drag on the candle works too
    const a = await P(page, 10, Y0 - 6), b = await P(page, 25, Y0 - 6);
    const cdp = await ctx.newCDPSession(page);
    const tp = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y }] });
    await tp('touchStart', a); for (let i = 1; i <= 16; i++) { await tp('touchMove', { x: a.x + ((b.x - a.x) * i) / 16, y: a.y + ((b.y - a.y) * i) / 16 }); await page.waitForTimeout(16); } await tp('touchEnd', b);
    await page.waitForTimeout(150);
    const st = await S(page);
    check('B5t', `phone ${w}x${h}: a finger drags the candle`, Math.abs(st.candle - 25) < 1.2, `asked 25, got ${st.candle.toFixed(2)}`);
    await ctx.close();
  }
  check('B1', 'no page errors and nothing requested from outside the page', errors.length === 0 && external.length === 0, `${errors.length} errors ${JSON.stringify(errors.slice(0, 3))}, ${external.length} external`);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
