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
  // grab an object by its post and drag it along the ruler towards bench position `to` with a quick hand (full-speed
  // pointer gain), then fine-tune with the ◀ ▶ buttons the way a learner would; finally hold still so it can count
  const drag = async (page, from, to, grabY = Y0 - 6, steps = 8) => {
    const a = await P(page, from, grabY), b = await P(page, to, grabY);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(120);
  };
  const tune = async (page, what, to, tol = 0.3) => {
    for (let i = 0; i < 80; i++) {
      const v = (await S(page))[what]; if (Math.abs(v - to) <= tol) break;
      await page.click(`button.nudge[data-k="${what}"][data-d="${v < to ? 1 : -1}"]`); await page.waitForTimeout(30);
    }
    await page.waitForTimeout(750);
  };
  const best = (u) => L + (u * F) / (u - F);

  // B1-B4: the whole lesson by hand, desktop 1440x860, player default dpr 2
  {
    const { ctx, page } = await open('', 1440, 860, 2);
    const st0 = await S(page);
    await drag(page, st0.candle, 15);
    const st1 = await S(page);
    check('B2', 'dragging the candle moves it along the ruler', Math.abs(st1.candle - 15) < 0.8, `asked 15, got ${st1.candle.toFixed(2)}`);
    await drag(page, 15, 10);   // back to the start position (u = 30)
    // step 1: parallel light, screen to the focal point
    await page.click('#sun'); let s = await S(page);
    await drag(page, s.screen, L + F, Y0 - 13); await tune(page, 'screen', L + F, 0.2); s = await S(page);
    const toastFocus = await page.textContent('#toast');
    await page.waitForTimeout(2000); s = await S(page);
    check('R4', 'parallel light switches itself off after the focal point is found', s.focusFound && !s.sun, `focus ${s.focusFound}, sun ${s.sun}`);
    // step 2: guess
    await page.click('#guess button:nth-child(2)');
    await page.waitForTimeout(150); const noteNow = await page.isVisible('#guessNote') && (await S(page)).step === 2;
    // steps 3-5: three real images, screen dragged to the sharp spot
    for (const [u, key] of [[30, 'far'], [20, 'two'], [15, 'mid']]) {
      s = await S(page); await drag(page, s.candle, L - u); await tune(page, 'candle', L - u, 0.25);
      s = await S(page);
      if (key === 'far') {   // sweeping straight through the sharp spot must not count
        await drag(page, s.screen, best(s.u) + 12, Y0 - 13); await drag(page, best(s.u) + 12, best(s.u) - 8, Y0 - 13, 6); await page.waitForTimeout(700);
        const sw = await S(page); check('R1', 'sweeping the screen through the sharp spot does not unlock the row', !sw.found.includes('far'), `screen ended at ${sw.screen.toFixed(1)}, found ${sw.found}`);
        s = sw;
      }
      await drag(page, s.screen, best(s.u), Y0 - 13); await tune(page, 'screen', best(s.u), 0.25); s = await S(page);
      check('B3' + key, `a ${key} image is found by dragging the screen`, s.found.includes(key), `u=${s.u.toFixed(2)} screen=${s.screen.toFixed(2)} best=${best(s.u).toFixed(2)}`);
    }
    // step 6: candle onto f (it clicks on), sweep the screen
    const eyeOff = await page.isDisabled('#eye');
    check('R5', '"look with the eye" is unavailable while the candle is outside f', eyeOff, `disabled ${eyeOff} at u=${s.u.toFixed(1)}`);
    s = await S(page); await drag(page, s.candle, L - F - 0.4); await tune(page, 'candle', L - F, 0.01); s = await S(page);
    await drag(page, s.screen, 50, Y0 - 13); await drag(page, 50, 80, Y0 - 13); await page.waitForTimeout(200); s = await S(page);
    check('B3focal', 'candle snaps onto f and a screen sweep records "no image"', s.u === F && s.found.includes('focal'), `u=${s.u} found=${s.found}`);
    // step 7: inside f, then look through the lens
    await drag(page, L - F, L - 6); await tune(page, 'candle', L - 6, 0.3); await page.click('#eye'); await page.waitForTimeout(200); s = await S(page);
    check('B3near', 'inside f, "look with the eye" finds the virtual image', s.found.includes('near'), `u=${s.u.toFixed(2)} found=${s.found}`);
    const answer = await page.isVisible('#answer');
    const recap = await page.textContent('#answerGuess');
    check('R6', 'the answer card goes back to the guess', /倒立、缩小/.test(recap) && /猜对了/.test(recap), recap);
    check('B4', 'the whole lesson completes with real drags and clicks and ends on the answer', s.step === 7 && s.focusFound && s.predicted === 1 && answer, `step ${s.step + 1}/8, focus ${s.focusFound}, guess ${s.predicted}, answer visible ${answer}; focus toast "${(toastFocus || '').slice(0, 24)}…"`);
    const rows = await page.$$eval('#table tr td.q', (t) => t.length);
    check('B4t', 'the table is completely filled', rows === 0, `${rows} empty cells`);
    const noteLater = await page.isVisible('#guessNote');
    check('R12', 'the "guess noted" line shows while the guess is tested (step 3), not on every later step', noteNow && !noteLater, `on step 3 ${noteNow}, at the end ${noteLater}`);
    await page.screenshot({ path: path.join(out, 'desktop-answer.png') });
    const info = await page.evaluate(() => window.__lens.info());
    check('B6', 'draw calls within 120', info.calls <= 120, `${info.calls} calls, ${info.tris} triangles, renderer ${info.renderer}`);
    report.renderer = info.renderer;
    await ctx.close();
  }
  // R3, R2: grabbing at the flame moves the candle even with the screen behind it; a focused slider keeps up with 3D drags
  {
    const { ctx, page } = await open('', 1440, 860, 1);
    await page.evaluate(() => window.__lens.set({ candle: 30, screen: 50 })); await page.waitForTimeout(80);
    const a = await P(page, 30, Y0 + 1), b = await P(page, 22, Y0 + 1);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(80);
    let s = await S(page);
    check('R3', 'grabbing the flame drags the candle, not the screen behind it', s.candle < 29 && Math.abs(s.screen - 50) < 1e-6, `candle ${s.candle.toFixed(1)}, screen ${s.screen.toFixed(1)}`);
    await page.focus('#screen'); await drag(page, 50, 70, Y0 - 13); s = await S(page);
    const sv = +(await page.$eval('#screen', (e) => e.value));
    check('R2', 'a slider that has keyboard focus still follows a 3D drag', Math.abs(sv - s.screen) < 0.15, `slider ${sv}, bench ${s.screen.toFixed(2)}`);
    await ctx.close();
  }
  // R7-R10: second playtest round (2026-10-29)
  {
    const { ctx, page } = await open('', 1440, 860, 1);
    const fine = [];
    for (const ruler of [20, 30]) for (const d of [1, -1]) {
      await page.evaluate((x) => window.__lens.set({ candle: x }), ruler); await page.waitForTimeout(40);
      await page.click(`button.nudge[data-k="candle"][data-d="${d}"]`); await page.waitForTimeout(40);
      fine.push(+((await S(page)).candle - ruler).toFixed(2));
    }
    check('R7', 'the fine-step buttons step off f and 2f instead of freezing there', fine.every((x, i) => Math.abs(x - (i % 2 ? -0.5 : 0.5)) < 1e-6), `steps from 2f, f: ${fine.join(', ')} cm`);
    await page.evaluate(() => window.__lens.set({ sun: true })); await page.waitForTimeout(60);
    const lab = await page.textContent('#uLabel');
    check('R8', 'under parallel light the first reading is labelled as the light source, not object distance', lab === '光源', `"${lab}: ${await page.textContent('#u')}"`);
    await page.evaluate(() => window.__lens.set({ screen: 50 })); await page.waitForTimeout(2600);
    const s9 = await S(page);
    check('R9', 'after the focal point the lesson stops on step 2 with the guesses showing', s9.step === 1 && await page.isVisible('#guess button'), `step ${s9.step + 1}, guesses visible ${await page.isVisible('#guess button')}`);
    await page.evaluate(() => window.__lens.set({ candle: 30, sun: false })); await page.waitForTimeout(80);
    const st6 = await page.textContent('#status');
    check('R10', 'on the focal point the status shows how much of the 15 cm sweep is done', /\/ 15 cm/.test(st6), st6);
    await ctx.close();
  }
  { // footer fully visible at the bottom of the answer page
    const { ctx, page } = await open('?found=all', 1440, 860, 1);
    await page.evaluate(() => { const a = document.querySelector('aside'); a.scrollTop = a.scrollHeight; }); await page.waitForTimeout(100);
    const f = await page.evaluate(() => { const r = document.querySelector('footer').getBoundingClientRect(), a = document.querySelector('aside').getBoundingClientRect(); return { fb: r.bottom, ab: a.bottom }; });
    check('R11', 'the footer is not cut off at the bottom of the panel', f.fb <= f.ab - 4, `footer bottom ${f.fb.toFixed(0)}, panel bottom ${f.ab.toFixed(0)}`);
    await ctx.close();
  }
  // B5: phone viewports with browser bars subtracted; the bench, panel controls and inset must not collide
  for (const [w, h] of [[390, 664], [412, 700], [360, 600]]) {
    const { ctx, page } = await open('', w, h, 2, true);
    const r = await page.evaluate(() => {
      const box = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x0: b.left, x1: b.right, y0: b.top, y1: b.bottom }; };
      return { stage: box('scene'), inset: box('inset'), tag: box('tag'), sun: box('sun'), card: box('stepTitle'), inPanel: !!document.querySelector('aside #inset') };
    });
    const lensP = await P(page, L, Y0), candleP = await P(page, 10, Y0), endP = await P(page, 100, 0), zeroP = await P(page, 0, 0);
    const inStage = (p) => p.x >= r.stage.x0 && p.x <= r.stage.x1 && p.y >= r.stage.y0 && p.y <= r.stage.y1;
    const underInset = (p) => p.x >= r.inset.x0 && p.x <= r.inset.x1 && p.y >= r.inset.y0 && p.y <= r.inset.y1;
    const zoomW = r.inset.x1 - r.inset.x0;
    check('B5z', `phone ${w}x${h}: the screen close-up sits in the panel at least 40% of the width`, r.inPanel && zoomW >= 0.4 * w, `in panel ${r.inPanel}, ${zoomW.toFixed(0)} px wide`);
    const zoomSeen = r.inset.y0 + 0.6 * (r.inset.y1 - r.inset.y0) <= h;
    const ok = [lensP, candleP, endP, zeroP].every(inStage) && ![lensP, candleP, endP, zeroP].some(underInset) && r.stage.y1 - r.stage.y0 >= 200 && r.sun.y1 <= h && r.card.y1 <= h && zoomSeen;
    check('B5', `phone ${w}x${h}: bench fully on stage, not under the inset; step card, tools and most of the close-up visible without scrolling`, ok, `stage h ${(r.stage.y1 - r.stage.y0).toFixed(0)}, tools bottom ${r.sun.y1.toFixed(0)}/${h}, close-up ${r.inset.y0.toFixed(0)}-${r.inset.y1.toFixed(0)}, ruler ends at (${zeroP.x.toFixed(0)}, ${endP.x.toFixed(0)}) of ${w}`);
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
