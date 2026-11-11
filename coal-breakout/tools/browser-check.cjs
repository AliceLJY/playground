// Uses an existing Playwright/Chromium install. No package installation or runtime dependency.
// NODE_PATH="$(npm root -g)" node tools/browser-check.cjs [base-url] [output-dir]
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8936/coal-breakout/';
const out = process.argv[3] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const report = { base, checks: [], views: [] }; let failed = 0;
function check(name, pass, detail) { report.checks.push({ name, pass: !!pass, detail }); if (!pass) failed++; console.log(pass ? 'OK' : 'FAIL', name, JSON.stringify(detail ?? '')); }
const sizes = { phone390: { width: 390, height: 664 }, phone412: { width: 412, height: 700 }, desktop: { width: 1280, height: 800 } };
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] }); report.browser = browser.version();
  async function open(view, size = 'phone390', init) {
    const context = await browser.newContext({ viewport: sizes[size], deviceScaleFactor: size === 'desktop' ? 1 : 2, isMobile: size !== 'desktop', hasTouch: size !== 'desktop', acceptDownloads: true });
    if (init) await context.addInitScript(init);
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => {
      const u = new URL(r.url()); const b = new URL(base);
      if (u.protocol.startsWith('http') && (u.origin !== b.origin || !u.pathname.startsWith(b.pathname.replace(/index\.html$/, '')))) external.push(u.origin + u.pathname);
    });
    const url = new URL(base); if (view) url.searchParams.set('view', view); else url.searchParams.set('test', '1');
    await page.goto(url.href); await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50, timeout: 30000 });
    return { context, page, errors, external };
  }
  async function layout(page) {
    return page.evaluate(() => [...document.querySelectorAll('button')].filter(b => !b.disabled && b.getClientRects().length && !b.closest('[hidden]')).map(b => {
      const r = b.getBoundingClientRect(), center = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      // Ignore game HUD covered by title/selection/result overlays.
      const covered = !b.closest('.veil') && [...document.querySelectorAll('.veil')].some(v => !v.hidden);
      return { id: b.id || b.textContent.slice(0, 30), w: r.width, h: r.height, x: r.x, y: r.y, pass: covered || (r.x >= 0 && r.y >= 0 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5 && r.width >= 44 && r.height >= 44 && (center === b || b.contains(center))) };
    }));
  }
  async function titlePixels(page, png) {
    return page.evaluate(async data => {
      const img = new Image(); img.src = data; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const g = canvas.getContext('2d'); g.drawImage(img, 0, 0);
      const pixels = g.getImageData(0, 0, img.width, img.height).data, scale = img.width / innerWidth;
      const title = document.querySelector('#title');
      return ['header', '#tip'].map(selector => {
        const r = document.querySelector(selector).getBoundingClientRect(); let samples = 0, mismatches = 0, maxError = 0;
        for (let y = Math.ceil(r.top) + 1; y < r.bottom - 1; y++) for (let x = Math.ceil(r.left) + 1; x < r.right - 1; x++) {
          // Sample exposed title background, excluding its own text/buttons/art, not the HUD underneath.
          if (document.elementFromPoint(x + .5, y + .5) !== title) continue;
          const i = (Math.floor((y + .5) * scale) * img.width + Math.floor((x + .5) * scale)) * 4;
          const error = Math.max(Math.abs(pixels[i] - 16), Math.abs(pixels[i + 1] - 24), Math.abs(pixels[i + 2] - 39));
          samples++; if (error > 1) mismatches++; maxError = Math.max(maxError, error);
        }
        return { selector, samples, mismatches, maxError };
      });
    }, 'data:image/png;base64,' + png.toString('base64'));
  }
  async function translucent(page, selector) {
    return page.locator(selector).evaluate(el => {
      const color = getComputedStyle(el).backgroundColor, parts = color.match(/[\d.]+/g).map(Number);
      return { color, alpha: parts.length === 4 ? parts[3] : 1 };
    });
  }
  for (const size of Object.keys(sizes)) for (const view of ['', 'hero', 'levelup', 'boss', 'result', 'stress']) {
    const { context, page, errors, external } = await open(view, size);
    const snapshot = await page.evaluate(() => __PLAYTEST__.snapshot()), buttons = await layout(page);
    const file = `${size}-${view || 'title'}.png`; const png = await page.screenshot({ path: path.join(out, file) });
    check(`${size}/${view || 'title'} real state`, !view || snapshot.actualView === view, snapshot);
    check(`${size}/${view || 'title'} buttons visible, clickable, >=44px`, buttons.every(b => b.pass), buttons);
    check(`${size}/${view || 'title'} no errors / external resources`, !errors.length && !external.length, { errors, external });
    if (!view) {
      const pixels = await titlePixels(page, png);
      check(`${size} title blocks HUD/footer: actual pixels equal #101827 (±1)`, pixels.every(r => r.samples >= 100 && r.mismatches === 0), pixels);
    }
    if (view === 'levelup') {
      const veil = await translucent(page, '#upgrade');
      check(`${size} upgrade keeps battlefield translucent`, veil.alpha > 0 && veil.alpha < 1, veil);
    }
    if (view === 'hero') {
      const pixels = await page.evaluate(() => {
        const canvas = document.querySelector('#game'), g = canvas.getContext('2d'), hook = __PLAYTEST__;
        hook.paint('background'); const bg = g.getImageData(0, 0, canvas.width, canvas.height).data;
        hook.paint('hero'); const fg = g.getImageData(0, 0, canvas.width, canvas.height).data;
        const n = canvas.width * canvas.height, mask = new Uint8Array(n); let white = 0, delta = 0, samples = 0, minX = canvas.width, maxX = 0;
        for (let i = 0; i < n; i++) if (fg[i * 4] !== bg[i * 4] || fg[i * 4 + 1] !== bg[i * 4 + 1] || fg[i * 4 + 2] !== bg[i * 4 + 2]) mask[i] = 1;
        for (let i = canvas.width; i < n - canvas.width; i++) {
          if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - canvas.width] || !mask[i + canvas.width]) continue;
          samples++; const x = i % canvas.width; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          if (fg[i * 4] > 230 && fg[i * 4 + 1] > 230) { white++; delta += fg[i * 4] - bg[i * 4]; }
        }
        hook.paint(); return { samples, white, edgeContrast: delta / white, silhouetteFraction: (maxX - minX + 1) / canvas.width };
      });
      check(`${size} hero actual pixels: inner white contrast >=100, width 11–14%`, pixels.samples > 100 && pixels.white > 5 && pixels.edgeContrast >= 100 && pixels.silhouetteFraction >= .11 && pixels.silhouetteFraction <= .14, pixels);
      const occlusions = await page.evaluate(() => {
        const hook = __PLAYTEST__, s = hook.state(), canvas = document.querySelector('#game'), g = canvas.getContext('2d');
        const saved = [s.x, s.y, s.vx, s.vy], scale = canvas.width / 360, cases = [];
        for (let prop = 0; prop < s.oOn.length; prop++) if (s.oOn[prop]) {
          // Reproduce north-side overlap for every prop in this actual seeded layout.
          s.x = s.ox[prop]; s.y = s.oy[prop] - s.ohh[prop] - 24; s.vx = s.vy = 0;
          hook.paint('background'); const bg = g.getImageData(0, 0, canvas.width, canvas.height).data;
          hook.paint('hero'); const fg = g.getImageData(0, 0, canvas.width, canvas.height).data;
          let changed = 0, outside = 0;
          for (let i = 0; i < fg.length; i += 4) {
            if (fg[i] === bg[i] && fg[i + 1] === bg[i + 1] && fg[i + 2] === bg[i + 2]) continue;
            changed++;
            const x = (i / 4 % canvas.width + .5) / scale, y = (Math.floor(i / 4 / canvas.width) + .5) / scale;
            if (x < s.x - 32 || x > s.x + 32 || y < s.y - 46 || y > s.y + 51) outside++;
          }
          cases.push({ prop, changed, outside, image: canvas.toDataURL().split(',')[1] });
        }
        [s.x, s.y, s.vx, s.vy] = saved; hook.paint(); return cases;
      });
      for (const c of occlusions) { fs.writeFileSync(path.join(out, `${size}-hero-prop${c.prop}.png`), Buffer.from(c.image, 'base64')); delete c.image; }
      check(`${size} north-side mask contains only hero pixels`, occlusions.length === 4 && occlusions.every(c => c.changed > 100 && c.outside === 0), occlusions);
    }
    if (view === 'result') {
      const png = await page.evaluate(() => document.querySelector('#poster').toDataURL().split(',')[1]); fs.writeFileSync(path.join(out, `${size}-poster.png`), Buffer.from(png, 'base64'));
      const download = page.waitForEvent('download'); await page.click('#save'); const file = await download; await file.saveAs(path.join(out, `${size}-download.png`));
      check(`${size} PNG download`, fs.statSync(path.join(out, `${size}-download.png`)).size > 1000);
      await page.reload(); check(`${size} progress survives reload`, (await page.evaluate(() => __PLAYTEST__.snapshot())).progress === 2);
    }
    report.views.push({ file, size: sizes[size], snapshot }); await context.close();
  }
  // A fresh normal entry: real browser touch events, no simulation-position hooks.
  for (const size of Object.keys(sizes)) {
    const { context, page, errors } = await open('', size); const cdp = await context.newCDPSession(page);
    await page.click('#start'); const before = await page.evaluate(() => __PLAYTEST__.snapshot());
    const box = await page.locator('#game').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 60, y }] });
    await page.waitForTimeout(70); const moved = await page.evaluate(() => __PLAYTEST__.snapshot());
    check(`${size} drag right responds within 100 ms`, moved.x > before.x && Math.abs(moved.y - before.y) < 1, { before: before.x, after: moved.x });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(35); const stopped = await page.evaluate(() => __PLAYTEST__.snapshot()); await page.waitForTimeout(100);
    check(`${size} touch release stops`, (await page.evaluate(() => __PLAYTEST__.snapshot())).x === stopped.x);
    for (const event of ['pointercancel', 'lostpointercapture']) {
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y + 20);
      await page.evaluate(event => document.querySelector('#game').dispatchEvent(new PointerEvent(event, { pointerId: 1 })), event);
      await page.mouse.up(); check(`${size} ${event} clears input`, (await page.evaluate(() => __PLAYTEST__.snapshot())).input.every(v => v === 0));
    }
    await page.keyboard.down('KeyW'); await page.waitForTimeout(70); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('KeyW');
    check(`${size} blur pauses and clears keys`, await page.evaluate(() => __PLAYTEST__.snapshot().paused && __PLAYTEST__.snapshot().input.every(v => v === 0)));
    const veil = await translucent(page, '#pause');
    check(`${size} pause keeps battlefield translucent`, veil.alpha > 0 && veil.alpha < 1, veil);
    await page.click('#resume'); await page.click('#sound'); check(`${size} sound user gesture resumes WebAudio`, await page.evaluate(() => __PLAYTEST__.snapshot().sound && __PLAYTEST__.snapshot().audioState === 'running'));
    await page.click('#sound'); check(`${size} sound switch suspends audio`, await page.evaluate(() => !__PLAYTEST__.snapshot().sound && __PLAYTEST__.snapshot().audioState === 'suspended'));
    await page.screenshot({ path: path.join(out, `${size}-default.png`) }); check(`${size} default no page errors`, !errors.length, errors); await context.close();
  }
  // Stress: unfreeze the actual 324-enemy simulation, sample normal RAF at default resolution.
  {
    const { context, page, errors } = await open('stress');
    report.renderer = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const e = g?.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unavailable'; });
    await page.evaluate(() => { __PLAYTEST__.resetMetrics(); __PLAYTEST__.freeze(false); }); await page.waitForTimeout(2000);
    const snapshot = await page.evaluate(() => { __PLAYTEST__.freeze(true); return __PLAYTEST__.snapshot(); }), metrics = await page.evaluate(() => __PLAYTEST__.metrics());
    check('stress >=300 live during active simulation, p95<=16.7ms, <=2500 draw calls', snapshot.enemies >= 300 && snapshot.phase === 'play' && metrics.samples >= 60 && metrics.p95 <= 16.7 && metrics.drawCalls <= 2500, { snapshot, metrics, renderer: report.renderer });
    check('stress no errors', !errors.length, errors); report.performance = metrics;
    await page.screenshot({ path: path.join(out, 'stress-active.png') }); await context.close();
  }
  // Real whole rounds for result/retry plus storage failure behavior.
  {
    const { context, page } = await open('', 'phone390', () => { Storage.prototype.getItem = () => { throw new Error('blocked'); }; Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
    await page.click('#start'); const dead = await page.evaluate(() => __PLAYTEST__.simulate(16000, 'reckless'));
    check('reckless browser death with blocked storage', dead.phase === 'dead');
    await page.screenshot({ path: path.join(out, 'death.png') }); await page.click('#retry'); const retry = await page.evaluate(() => __PLAYTEST__.snapshot());
    check('immediate same-level restart', retry.phase === 'play' && retry.level === 1 && retry.hp === 6);
    for (let level = 1; level <= 3; level++) {
      const won = await page.evaluate(() => __PLAYTEST__.simulate(16000, 'precise'));
      check(`stage ${level} victory and unlock without storage`, won.phase === 'won' && won.level === level && won.progress === Math.min(3, level + 1), won);
      if (level < 3) await page.click('#next');
    }
    check('final clear hides next-level button', await page.locator('#next').isHidden()); await context.close();
  }
  // Share-files path: stub only the OS endpoint; the application must generate a real PNG File.
  {
    const { context, page } = await open('result', 'phone390', () => {
      Object.defineProperty(navigator, 'canShare', { value: data => data.files?.[0] instanceof File });
      Object.defineProperty(navigator, 'share', { value: async data => { window.shared = { name: data.files[0].name, type: data.files[0].type, size: data.files[0].size }; } });
    });
    await page.click('#save'); await page.waitForFunction(() => window.shared, null, { polling: 50 }); const shared = await page.evaluate(() => window.shared);
    check('file-share receives an actual PNG File', shared.type === 'image/png' && shared.size > 1000, shared); await context.close();
  }
  await browser.close(); fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(`${report.checks.length} checks; ${failed} failures`); process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
