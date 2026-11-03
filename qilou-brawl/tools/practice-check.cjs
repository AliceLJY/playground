// Built page, normal entry, real keyboard / native touch. Hooks are read-only.
// NODE_PATH="$(npm root -g)" node tools/practice-check.cjs <base-url> <out-dir> [viewport-width]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const [base, out, onlyWidth] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const report = { browser: browser.version(), checks: [], errors: [], views: [], shots: [] };
  const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); if (!pass) throw new Error(name); };
  try {
    for (const [width, height] of [[390,664], [320,568], [844,340], [1365,900]].filter(([w]) => !onlyWidth || w === +onlyWidth)) {
      const touch = width !== 1365;
      const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
      const page = await ctx.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
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
      await page.goto(base);
      await page.waitForFunction(() => window.__qilou?.ready, null, { polling: 100, timeout: 90000 });
      const state = () => page.evaluate(() => {
        const s = window.__qilou.sim();
        return { ...window.__qilou.info(), foes: s.enemies.map(e => ({ id: e.id, kind: e.kind, hp: e.hp })), hits: s.stats.hitsLanded, guard: s.player.guard };
      });
      const wait = fn => page.waitForFunction(fn, null, { polling: 30, timeout: 20000 });
      const shot = async name => {
        const file = `${width}x${height}-${name}.png`;
        await page.screenshot({ path: path.join(out, file) });
        report.shots.push({ file, state: await state() });
      };
      const usable = async selector => page.locator(selector).evaluateAll(els => els.length > 0 && els.every(el => {
        const r = el.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
      }));
      const click = async selector => { if (touch) await page.tap(selector); else await page.click(selector); };
      const cdp = touch ? await ctx.newCDPSession(page) : null;
      const press = async (act, down) => {
        if (!touch) return page.keyboard[down ? 'down' : 'up'](act === 'block' ? 'KeyQ' : 'KeyK');
        const r = await page.locator(`[data-act=${act}]`).boundingBox();
        await cdp.send('Input.dispatchTouchEvent', { type: down ? 'touchStart' : 'touchEnd', touchPoints: down ? [{ x:r.x+r.width/2, y:r.y+r.height/2, id:1 }] : [] });
      };
      const tapKick = async () => { await press('kick', true); await page.waitForTimeout(80); await press('kick', false); };
      report.views.push(await page.evaluate(async () => {
        const cv = document.querySelector('canvas'), adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
        return { width:innerWidth, height:innerHeight, dpr:devicePixelRatio, canvas:[cv.width,cv.height], renderer:window.__testRenderer, adapter:adapter ? { vendor:adapter.info.vendor, architecture:adapter.info.architecture } : null };
      }));
      check(`${width}: both menu entries reachable`, await usable('#start, #practice'));
      await shot('menu'); await click('#practice');
      await wait(() => window.__qilou.info().chars === 2);
      check(`${width}: only one granny`, (await state()).foes.length === 1 && (await state()).foes[0].kind === 'apo');
      if (touch) check(`${width}: real guard/kick touch targets`, await usable('[data-act=block], [data-act=kick]'));
      await tapKick(); await page.waitForTimeout(700);
      check(`${width}: early kick cannot finish or hurt granny`, (await state()).phase === 'fight' && (await state()).foes[0].hp === 42);
      await press('block', true);
      await wait(() => window.__qilou.info().practice.blocks === 1);
      const bannerClear = () => page.locator('#banner').evaluate(el => {
        const range = document.createRange();range.selectNodeContents(el);const a=range.getBoundingClientRect(),b=document.getElementById('practice-skip').getBoundingClientRect();
        return a.bottom<=b.top || a.top>=b.bottom || a.right<=b.left || a.left>=b.right;
      });
      check(`${width}: early-kick banner does not cover skip`, await bannerClear());
      await shot('one-block'); const first = await state();
      check(`${width}: rendered character uses the actual guard state`, await page.evaluate(() => window.__qilou.facing().state === 'block'));
      await press('block', false);
      await wait(() => window.__qilou.info().practice.blocks === 0);
      const reset = await state();
      check(`${width}: missed palm resets real progress only`, reset.hp === 100 && reset.phase === 'fight' && reset.foes[0].id === first.foes[0].id && reset.practice.elapsed > first.practice.elapsed);
      const bannerBounds = await page.locator('#banner').evaluate(el => {
        const range = document.createRange(); range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:innerWidth, height:innerHeight };
      });
      check(`${width}: reset message text stays on screen during animation`, bannerBounds.left >= 0 && bannerBounds.right <= width && bannerBounds.top >= 0 && bannerBounds.bottom <= height, bannerBounds);
      check(`${width}: reset banner does not cover skip`, await bannerClear());
      await shot('reset');
      await press('block', true);
      const counts = [];
      for (const count of [1,2,3]) {
        await page.waitForFunction(n => window.__qilou.info().practice.blocks === n, count, { polling:30, timeout:20000 });
        counts.push((await state()).practice.blocks);
      }
      check(`${width}: native inputs block three palms`, counts.join() === '1,2,3', counts);
      check(`${width}: third block waits for kick`, (await state()).phase === 'fight' && await page.locator('#practice-hint').textContent() === '借过喇 · 松开挡，还一脚');
      check(`${width}: hint stays in viewport`, await page.locator('#practice-hud').evaluate(el => { const r=el.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&el.scrollWidth<=r.width; }));
      await shot('ready');
      // Leaving while guard is still physically held must clear it and freeze the minute.
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await press('block', false); const paused = await state(); await page.waitForTimeout(160);
      check(`${width}: blur pauses practice clock`, (await state()).practice.elapsed === paused.practice.elapsed);
      check(`${width}: paused exit/resume usable`, await usable('#resume, #practice-exit'));
      await click('#resume'); await page.waitForTimeout(120);
      check(`${width}: resume clears held guard`, (await state()).state !== 'block');
      await tapKick(); await wait(() => window.__qilou.info().phase === 'practice-win');
      check(`${width}: one actual kick completes`, (await state()).hits === 1);
      check(`${width}: result controls reachable`, await usable('#practice-main, #practice-again, #practice-menu'));
      await shot('win');
      check(`${width}: actual completion is remembered`, await page.evaluate(()=>localStorage.getItem('qilou-practice-seen')==='1'));
      await click('#practice-main');
      check(`${width}: result button no longer has keyboard focus`, await page.evaluate(() => document.activeElement.id !== 'practice-main'));
      let normal = await state();
      check(`${width}: normal wave clean after lesson`, normal.practice === null && normal.wave === 0 && normal.enemies === 4 && normal.hp === 100 && normal.t === 0 && normal.hits === 0);
      for (let line = 0; line < 2; line++) {
        if (touch) await page.touchscreen.tap(width / 2, height * .45); else await page.keyboard.press('Enter');
        await page.waitForTimeout(160);
      }
      normal = await state();
      check(`${width}: normal inputs and HUD restored`, normal.state !== 'block' && normal.t > 0 && await page.locator('#practice-hud').isHidden() && !(await page.locator('body').getAttribute('class') || '').includes('practice'), { normal, dialog:await page.locator('#dialog').textContent(), bodyClass:await page.locator('body').getAttribute('class'), active:await page.evaluate(() => document.activeElement.id) });
      await shot('normal');
      // Second visit: whole 60 s timeout by advancing the page clock, never the sim state.
      await page.reload(); await page.waitForFunction(() => window.__qilou?.ready, null, { polling:100, timeout:90000 });
      await click('#start');check(`${width}: reload after completion enters original brawl`,(await state()).practice===null&&(await state()).enemies===4);
      await page.reload();await page.waitForFunction(()=>window.__qilou?.ready,null,{polling:100,timeout:90000});
      const clockStart = new Date();
      await page.clock.install({ time: clockStart });
      await page.clock.pauseAt(new Date(clockStart.getTime() + 10000));
      await click('#practice');
      await page.clock.runFor(61000);
      check(`${width}: actual one-minute timeout`, (await state()).phase === 'practice-timeout' && (await state()).practice.elapsed === 60);
      check(`${width}: timeout buttons reachable`, await usable('#practice-main, #practice-again, #practice-menu'));
      await shot('timeout'); await click('#practice-again');
      check(`${width}: retry resets practice`, (await state()).practice.blocks === 0 && (await state()).practice.elapsed === 0 && (await state()).enemies === 1);
      await click('#pause-btn'); await click('#practice-exit');
      check(`${width}: paused practice returns to menu`, await usable('#start, #practice') && (await state()).practice === null);
      await click('#practice'); await press('block', true); await page.clock.runFor(10000); await press('block', false);
      await tapKick(); await page.clock.runFor(1000);
      check(`${width}: can complete again after leaving practice`, (await state()).phase === 'practice-win');
      await click('#practice-menu');
      await click('#start'); normal = await state();
      check(`${width}: result-menu-start restores default`, normal.practice === null && normal.enemies === 4 && normal.t === 0);
      await ctx.close();
    }
    check('requested viewports were actually exercised', report.views.length === (onlyWidth ? 1 : 4));
    check('zero page / console errors', report.errors.length === 0, report.errors);
  } finally {
    await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report,null,2));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
