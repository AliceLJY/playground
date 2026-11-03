// NG3 acceptance: normal entry, real touch/keyboard inputs, no game-state setters.
// NODE_PATH="$(npm root -g)" node tools/discovery-check.cjs <out-dir> <base-url> [width]
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const out = process.argv[2], base = process.argv[3];
if (!out || !base) throw new Error('Usage: discovery-check.cjs <out-dir> <base-url> [width]');
const onlyWidth = process.argv.slice(4).find((arg) => !arg.startsWith('--'));
if (onlyWidth && ![390, 320, 844, 1365].includes(Number(onlyWidth))) throw new Error('Unsupported viewport width: ' + onlyWidth);
fs.mkdirSync(out, { recursive: true });
const report = { base, checks: [], errors: [], samples: {}, configurations: [] };
const check = (id, ok, detail) => { report.checks.push({ id, pass: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}`, JSON.stringify(detail)); };
const state = (page) => page.evaluate(() => window.__roach.state());
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  report.browser = browser.version();
  try {
    for (const [w, h] of [[390, 664], [320, 568], [844, 340], [1365, 900]].filter(([w]) => !onlyWidth || w === +onlyWidth)) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 600, isMobile: w < 600 });
      const page = await ctx.newPage(), tag = `${w}x${h}`;
      page.on('pageerror', (e) => report.errors.push(`${tag}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${tag}: ${m.text()}`); });
      const now = Date.now(); await page.clock.install({ time: now });
      await page.clock.pauseAt(new Date(now + 1000));
      await page.goto(base); await page.waitForFunction(() => window.__roach?.ready, null, { polling: 100 });
      const cdp = await ctx.newCDPSession(page);
      const click = async (sel) => {
        if (w < 600) await page.locator(sel).tap();
        else { await page.locator(sel).focus(); await page.keyboard.press('Enter'); }
      };
      const speed = async (v) => {
        if (w < 600) {
          const r = await page.locator('#speed').boundingBox(), x = r.x + 9 + (r.width - 18) * v / 1.5, y = r.y + r.height / 2;
          // A real drag, including thumb movement and pointer release.
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + 9, y }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await page.locator('#discoverySkip').focus();
          const current = (await state(page)).target.v, count = Math.round(Math.abs(v - current) / 0.1);
          for (let i = 0; i < count; i++) await page.keyboard.press(v > current ? 'ArrowUp' : 'ArrowDown');
        }
      };
      const seen = new Set();
      const observe = async (ms) => {
        for (let n = 0; n < ms; n += 100) {
          await page.clock.runFor(Math.min(100, ms - n));
          const p = await page.evaluate(() => ({ model: window.__roach.observation(), step: window.__roach.state().discovery.step }));
          for (const l of p.model.legs) {
            if (l.stance && l.load > 0.01 && Math.abs(l.P[1]) <= 0.3) seen.add(`${p.step}:${l.id}:down`);
            if (!l.stance && l.P[1] > 0.3) seen.add(`${p.step}:${l.id}:swing`);
          }
        }
      };
      const shot = async (name) => {
        // CSS captions keep their normal player transitions, so wait for the real fade too.
        await page.waitForTimeout(400);
        const boxes = await page.evaluate(() => {
          const selectors = ['#caption', '#callout', '.title', '.charts', '.dock', '.tourbar'];
          const rects = Object.fromEntries(selectors.map((s) => {
            const e = document.querySelector(s), r = e.getBoundingClientRect(), c = getComputedStyle(e);
            return [s, c.display === 'none' || +c.opacity === 0 ? null : r.toJSON()];
          }));
          const buttons = [...document.querySelectorAll('#discoveryAction, #discoverySkip')].filter((e) => !e.hidden).map((e) => {
            const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { id: e.id, ...r.toJSON(), hit: hit === e };
          });
          return { rects, buttons, body: window.__roach.bodyBox(), state: window.__roach.state() };
        });
        const visible = Object.values(boxes.rects).filter(Boolean);
        const inScreen = visible.every((r) => r.left >= 0 && r.right <= w + 0.5 && r.top >= 0 && r.bottom <= h + 0.5);
        const caption = boxes.rects['#caption'];
        const hits = caption ? Object.entries(boxes.rects).filter(([s, r]) => s !== '#caption' && r && overlap(caption, r) > 0.5).map(([s]) => s) : [];
        const body = { left: boxes.body.x0 * w, right: boxes.body.x1 * w, top: boxes.body.y0 * h, bottom: boxes.body.y1 * h };
        const bodyHit = caption ? overlap(caption, body) : 0;
        check(`${tag}-${name}-layout`, inScreen && !hits.length && bodyHit <= 0.5 && boxes.buttons.every((r) => r.width >= 44 && r.height >= 44 && r.hit), { inScreen, hits, bodyHit, buttons: boxes.buttons });
        const file = `${tag}-${name}`;
        fs.writeFileSync(path.join(out, file + '.json'), JSON.stringify(boxes, null, 2));
        await page.screenshot({ path: path.join(out, file + '.png') });
      };

      await page.clock.runFor(Math.max(0, Math.floor((35.5 - (await state(page)).tourClock) * 1000)));
      let s = await state(page);
      check(`${tag}-before-end`, s.mode === 'tour' && s.discovery.status === 'waiting' && s.tourClock < 36, { time: s.tourClock, status: s.discovery.status });
      await page.clock.runFor(2000);
      s = await state(page); check(`${tag}-invitation`, s.discovery.status === 'invited' && s.mode === 'live', s.discovery);
      await shot('invitation');
      await click('#discoveryAction'); await speed(1.5); await observe(4000);
      s = await state(page); check(`${tag}-wrong-speed`, s.discovery.step === 0 && s.discovery.held === 0 && /中足/.test(s.discovery.hint), s.discovery);
      await shot('wrong');
      await speed(w < 600 ? 1.15 : 1.1); await observe(4000);
      s = await state(page); check(`${tag}-four`, s.discovery.step === 1, s.discovery);
      await shot('four');
      await speed(1.5); await observe(4000);
      s = await state(page); check(`${tag}-two`, s.discovery.step === 2 && !s.discovery.ready, s.discovery);
      await click('#discoveryAction');
      check(`${tag}-early-confirm`, (await state(page)).discovery.status === 'active', (await state(page)).discovery);
      await shot('two');
      // Scroll only the existing row, then use the real part button.
      await page.locator('[data-sys="legs2"]').scrollIntoViewIfNeeded();
      await click('[data-sys="legs2"]'); await observe(400);
      await click('#discoveryAction');
      check(`${tag}-short-confirm`, (await state(page)).discovery.status === 'active', (await state(page)).discovery);
      await observe(1200); await shot('confirm');
      check(`${tag}-observed`, (await state(page)).discovery.ready && ['L3', 'R3'].every((id) => ['down', 'swing'].every((p) => seen.has(`2:${id}:${p}`))), [...seen]);
      await click('#discoveryAction'); await page.clock.runFor(3000); await shot('reward');
      s = await state(page);
      check(`${tag}-reward`, s.discovery.status === 'reward' && s.live.swag > 0.99 && s.view === 'pose' && (await page.locator('#caption').innerText()).includes('你发现了六足→四足→二足'), { discovery: s.discovery, swag: s.live.swag, view: s.view });
      await click('#discoveryAction');
      // Native range keyboard input on desktop; real touch drag on phones.
      if (w < 600) await speed(0.5);
      else { await page.locator('#speed').focus(); await page.keyboard.press('End'); }
      await page.clock.runFor(2500);
      const before = await state(page); await page.clock.runFor(400); s = await state(page);
      check(`${tag}-normal`, s.discovery.status === 'closed' && s.discovery.held === 0 && !s.discovery.down && !s.discovery.swing && s.live.swag < 0.01 && s.live.cycle > before.live.cycle && !await page.locator('#discoverySkip').isVisible() && !await page.locator('#discoveryAction').isVisible(), s.discovery);
      await shot('normal');
      await page.clock.runFor(23500);
      check(`${tag}-idle-return`, (await state(page)).mode === 'tour', { mode: (await state(page)).mode });
      report.configurations.push({ viewport: { w, h }, dpr: 2, info: await page.evaluate(() => window.__roach.info()), lowTier: (await state(page)).lowTier });
      report.samples[tag] = [...seen];
      await ctx.close();
    }

    // --flow-only is useful for repeating a single viewport after a CSS-only fix.
    if (!process.argv.includes('--flow-only')) {
    // Independent skip, active idle, and render-hook bypass on the normal URL.
    const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
    page.on('pageerror', (e) => report.errors.push(e.message));
    const now = Date.now(); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now + 1000));
    await page.goto(base); await page.waitForFunction(() => window.__roach?.ready, null, { polling: 100 });
    await page.clock.runFor(37000); await page.click('#discoverySkip'); await page.clock.runFor(38000);
    check('skip-no-reinvite', (await state(page)).mode === 'tour' && (await state(page)).discovery.status === 'closed', (await state(page)).discovery);
    await page.reload(); await page.waitForFunction(() => window.__roach?.ready, null, { polling: 100 }); await page.clock.runFor(37000);
    await page.click('#discoveryAction'); await page.clock.runFor(30000);
    check('active-idle', (await state(page)).mode === 'live' && (await state(page)).discovery.status === 'active', (await state(page)).discovery);
    await page.evaluate(() => window.__roach.render(32.4));
    check('render-bypass', (await state(page)).mode === 'frozen' && (await state(page)).view === 'pose' && !await page.locator('#discoverySkip').isVisible(), (await state(page)).discovery);
    for (const query of ['?view=swag', '?at=36', '?capture', '?discovery=off']) {
      const url = new URL(base); url.search = query; await page.goto(url.href);
      await page.waitForFunction(() => window.__roach?.ready, null, { polling: 100 });
      await page.clock.runFor(37000);
      check(`bypass-${query}`, (await state(page)).discovery.status === 'closed' && !await page.locator('#discoverySkip').isVisible(), { mode: (await state(page)).mode });
    }
    await page.close();
    }
    check('page-errors', report.errors.length === 0, report.errors);
  } catch (e) { report.errors.push(e.stack); check('runner', false, e.message); }
  finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  process.exitCode = report.checks.some((c) => !c.pass) || report.errors.length ? 1 : 0;
})();
