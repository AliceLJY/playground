// Regression checks against the built page. No fixed-view or autopilot shortcuts.
// NODE_PATH="$(npm root -g)" node tools/input-check.cjs <base-url> <out-dir>
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const [base, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const report = { browser: browser.version(), checks: [], errors: [], views: [] };
  const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, detail });
  try {
    for (const [width, height] of [[390,664], [320,568], [844,340], [1365,900]]) {
      const touch = width !== 1365;
      const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
          const gl = original.call(this, type, ...args);
          if (gl && this.id === 'game') {
            window.__testRenderer = { backend: type };
            if (type.startsWith('webgl')) { const ext = gl.getExtension('WEBGL_debug_renderer_info'); window.__testRenderer.renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }
          }
          return gl;
        };
      });
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      await page.goto(base);
      await page.waitForFunction(() => window.__qilou?.ready, null, { polling: 100, timeout: 90000 });
      const shot = name => page.screenshot({ path: path.join(out, `${width}x${height}-${name}.png`) });
      const info = () => page.evaluate(() => window.__qilou.info());
      report.views.push(await page.evaluate(async () => {
        const cv = document.querySelector('canvas'), adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
        return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, canvas: [cv.width, cv.height], renderer: window.__testRenderer, adapter: adapter ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description } : null };
      }));
      const usable = async selector => page.locator(selector).evaluateAll(els => els.length > 0 && els.every(el => {
        const r = el.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
      }));
      if (touch) check(`${width}: intro explains movement, camera and gong`, await page.locator('#title').evaluate(el => {
        return [...el.querySelectorAll('*')].some(e => e.getClientRects().length && /左.*拖动.*右.*拖动.*锣鼓满/.test(e.textContent));
      }));
      check(`${width}: start is reachable`, await usable('#start')); await shot('intro');
      await page.click('#start');
      const introBefore = await info(); await page.waitForTimeout(300);
      check(`${width}: opening dialogue gives time to read`, (await info()).t === introBefore.t);
      // The existing two dialogue lines gate combat until the player continues.
      await page.mouse.click(width / 2, height * .45); await page.mouse.click(width / 2, height * .45);
      await page.waitForTimeout(120);
      await page.keyboard.down('KeyQ'); await page.waitForTimeout(120);
      check(`${width}: keyboard Q enters the same guard`, (await info()).state === 'block'); await page.keyboard.up('KeyQ');
      if (touch) {
        const cdp = await ctx.newCDPSession(page);
        const r = await page.locator('[data-act=block]').boundingBox();
        const point = { x: r.x+r.width/2, y: r.y+r.height/2, id: 1 };
        const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
        await send('touchStart', [point]);
        const states = [];
        for (let n=0; n<12; n++) { await page.waitForTimeout(60); states.push((await info()).state); }
        check(`${width}: native touch holds block across 12 samples`, states.filter(s => s === 'block').length >= 10, states);
        await shot('block');
        // Slide outside, then release: no sticky guard, regardless of capture policy.
        await send('touchMove', [{ ...point, x: 10, y: height/2 }]); await send('touchEnd', []);
        await page.waitForTimeout(100); check(`${width}: outside release clears guard`, (await info()).state !== 'block');
        await send('touchStart', [point]); await send('touchCancel', []);
        await page.waitForTimeout(100); check(`${width}: touchcancel clears guard`, (await info()).state !== 'block');
        await page.locator('[data-act=block]').evaluate(el => el.addEventListener('pointerdown', e => { el.dataset.pointer = e.pointerId; }, { once:true }));
        await send('touchStart', [point]);
        await send('touchMove', [{ ...point, x: point.x + 1 }]);
        await page.locator('[data-act=block]').evaluate(el => el.releasePointerCapture(+el.dataset.pointer));
        await send('touchMove', [{ ...point, x: point.x + 2 }]);
        await page.waitForTimeout(100); check(`${width}: lost capture clears guard`, (await info()).state !== 'block' && await page.locator('#pad .down').count() === 0); await send('touchEnd', []);
        // Reset through the real page so movement/blur is not affected by combat damage.
      }
      await page.reload(); await page.waitForFunction(() => window.__qilou?.ready, null, { polling: 100 });
      await page.click('#start'); await page.mouse.click(width/2,height*.45); await page.mouse.click(width/2,height*.45);
      await page.keyboard.down('KeyW'); await page.waitForTimeout(180);
      const moved = await info();
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      const before = await info(); await page.waitForTimeout(300); const after = await info();
      check(`${width}: blur freezes combat time, position and health`, before.t === after.t && before.z === after.z && before.hp === after.hp, { moved, before, after });
      await shot('blur');
      const resume = await usable('#resume'); check(`${width}: explicit touch-sized resume`, resume);
      if (resume) {
        await page.click('#resume'); await page.waitForTimeout(160); const resumed = await info();
        check(`${width}: resume clears held keyboard movement`, resumed.z === after.z && resumed.t > after.t, resumed);
        await page.keyboard.up('KeyW');
        let pausedTouch;
        if (touch) {
          const cdp = pausedTouch = await ctx.newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:40,y:height*.65,id:1}] });
          await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:40,y:height*.65-40,id:1}] });
          const r = await page.locator('[data-act=block]').boundingBox();
          await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:40,y:height*.65-40,id:1},{x:r.x+r.width/2,y:r.y+r.height/2,id:2}] });
        }
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, value:true }); document.dispatchEvent(new Event('visibilitychange')); });
        const hidden = await info(); await page.waitForTimeout(180);
        check(`${width}: hidden page freezes combat`, hidden.t === (await info()).t);
        if (pausedTouch) await pausedTouch.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
        await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
        await page.waitForTimeout(100); check(`${width}: visibility restore waits for continue`, hidden.t === (await info()).t);
        await page.click('#resume'); await page.waitForTimeout(100);
        const clean = await info();
        check(`${width}: resume clears joystick and touch guard`, clean.z === hidden.z && clean.state !== 'block' && await page.locator('#pad .down, #stick.on').count() === 0, clean);
        await page.click('#pause-btn'); const p = await info(); await page.waitForTimeout(120);
        check(`${width}: manual pause freezes`, p.t === (await info()).t); await shot('pause');
        await page.click('#resume'); await page.waitForTimeout(80);
        check(`${width}: manual resume advances`, (await info()).t > p.t);
      }
      await ctx.close();
    }
    check('zero page / console errors', report.errors.length === 0, report.errors);
  } finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report,null,2)); }
  for (const c of report.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}`);
  if (report.checks.some(c => !c.pass)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode=1; });
