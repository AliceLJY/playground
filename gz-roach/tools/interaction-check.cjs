// F3 regressions, run by browser-check.cjs (optionally --regressions-only).
// Inputs use the browser clock and real mouse/keyboard/CDP touch events, never state setters.
const path = require('node:path');
module.exports = async ({ open, check, rect, out }) => {
  const area = (a, b) => a && b ? Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) : 0;
  const state = (page) => page.evaluate(() => window.__roach.state());
  const clock = async (page) => { const now = Date.now(); await page.clock.install({ time: now }); await page.clock.pauseAt(new Date(now + 1000)); };
  const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });

  // Both explanation frames, including the short landscape missing from the original B3.
  for (const [w, h] of [[390, 664], [320, 568], [844, 340], [1365, 900]]) {
    for (const view of ['biped', 'explode', 'swag']) {
      const { ctx, page } = await open('?view=' + view, w, h, w < 600 ? 2 : 1);
      await page.waitForTimeout(400);
      const boxes = {};
      for (const sel of ['#caption', '#callout', '.charts', '.dock', '.title', '.tourbar']) boxes[sel] = await rect(page, sel);
      const body = await page.evaluate(() => window.__roach.bodyBox());
      const bodyPx = { x0: body.x0 * w, x1: body.x1 * w, y0: body.y0 * h, y1: body.y1 * h };
      const caption = boxes['#caption'], callout = boxes['#callout'];
      const hits = [['caption/callout', area(caption, callout)], ['charts/dock', area(boxes['.charts'], boxes['.dock'])]];
      if (w < 900) for (const sel of ['#caption', '#callout']) {
        for (const other of ['.title', '.charts', '.dock', '.tourbar']) hits.push([sel + '/' + other, area(boxes[sel], boxes[other])]);
        hits.push([sel + '/body', area(boxes[sel], bodyPx)]);
      }
      const hidden = hits.filter(([, a]) => a > 0.5);
      const onscreen = Object.values(boxes).filter(Boolean).every((r) => r.x0 >= 0 && r.x1 <= w + 0.5 && r.y0 >= 0 && r.y1 <= h + 0.5);
      await shot(page, `layout-${w}x${h}-${view}`);
      check(`B12-${w}x${h}-${view}`, '说明不相互遮挡、不盖虫身，图表不压底栏且在屏内', !hidden.length && onscreen, JSON.stringify({ hits: hidden, onscreen, boxes, body }));
      const s = await state(page), expected = view === 'biped' ? 'street' : view === 'swag' ? 'pose' : 'hero';
      check(`B17-${w}x${h}-${view}`, '钩子回报实际机位及相机坐标', s.view === expected && s.camera?.position?.length === 3 && s.camera?.target?.length === 3, JSON.stringify({ expected, view: s.view, camera: s.camera }));
      await ctx.close();
    }
  }

  if (process.argv.includes('--layout-only')) return;

  // Default 25-second timeout: 30 s held and moving, then 24 s idle, then return.
  { const { ctx, page } = await open('', 1365, 900);
    await clock(page);
    await page.mouse.move(670, 430); await page.mouse.down();
    const before = await state(page), samples = [];
    for (let i = 0; i < 30; i++) { await page.mouse.move(670 + (i % 2 ? 20 : -20), 430); await page.clock.runFor(1000); samples.push(await state(page)); }
    await shot(page, 'drag-30s');
    await page.mouse.up(); await page.clock.runFor(24000); const quiet24 = await state(page);
    await page.clock.runFor(1600); const returned = await state(page);
    const cameraMoved = before.camera && samples.some((s) => JSON.stringify(s.camera?.position) !== JSON.stringify(before.camera.position));
    check('B13', '持续拖动 30 秒保持手动，松手静置 25 秒后交还', samples.every((s) => s.mode === 'live') && quiet24.mode === 'live' && returned.mode === 'tour' && cameraMoved,
      JSON.stringify({ modes: samples.map((s) => s.mode), cameraMoved, quiet24: quiet24.mode, returned: returned.mode }));
    await ctx.close(); }

  // Native cancellation, lost capture, blur and visibility must all stop holding the timer.
  for (const end of ['touchCancel', 'lostpointercapture', 'blur', 'hidden']) {
    const { ctx, page } = await open('?idle=3', 390, 664, 2); await clock(page);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 300 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220, y: 310 }] });
    await page.clock.runFor(4000); const held = await state(page);
    if (end === 'touchCancel') await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    else await page.evaluate((kind) => {
      if (kind === 'lostpointercapture') {
        // CDP's first touch pointer id is reported by the real pointerdown.
        const canvas = document.querySelector('#scene');
        for (let id = 1; id < 10; id++) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      } else if (kind === 'blur') window.dispatchEvent(new Event('blur'));
      else { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }
    }, end);
    // Native capture changes are delivered before the next pointer event.
    if (end === 'lostpointercapture') await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 221, y: 310 }] });
    await page.clock.runFor(2400); const quiet = await state(page);
    await page.clock.runFor(1200); const released = await state(page);
    check(`B13-${end}`, '按住不超时，取消/丢捕获/失焦/切后台后重新计时', held.mode === 'live' && quiet.mode === 'live' && released.mode === 'tour', `${held.mode} → ${quiet.mode} → ${released.mode}`);
    await ctx.close();
  }

  { const { ctx, page } = await open('', 1365, 900); await clock(page);
    await page.click('[data-act="swag"]'); await page.clock.runFor(3000);
    const swag = await state(page);
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp');
    await page.clock.runFor(2500); const running = await state(page);
    await page.clock.runFor(400); const later = await state(page);
    await shot(page, 'swag-arrowup-running');
    check('B14', '亮相后真实方向键调速恢复步态', swag.live.swag > 0.99 && Math.abs(running.target.v - 1.2) < 0.01 && running.target.swag === 0 && running.live.swag < 0.01 && later.live.cycle > running.live.cycle + 0.1,
      JSON.stringify({ swag: swag.live.swag, speed: running.live.v, targetSwag: running.target.swag, liveSwag: running.live.swag, cycleDelta: later.live.cycle - running.live.cycle }));
    await ctx.close(); }

  for (const [w, h] of [[390, 664], [320, 568], [844, 340]]) {
    const { ctx, page } = await open('', w, h, 2); await clock(page);
    await page.mouse.click(w / 2, h * 0.45); await page.clock.runFor(400);
    const sizes = await page.evaluate(() => {
      const row = document.querySelector('.dock .row'), scroll = row.scrollLeft;
      const result = [...document.querySelectorAll('.dock button, #speed, #resumeTour')].map((e) => {
        e.scrollIntoView({ block: 'nearest', inline: 'center' });
        const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { text: e.textContent || e.id, w: r.width, h: r.height, hit: hit === e || e.contains(hit) };
      });
      row.scrollLeft = scroll; return result;
    });
    const status = await page.locator('#badge').innerText();
    const slow = await page.locator('#slowNote').count() && await page.locator('#slowNote').isVisible();
    const resume = await rect(page, '#resumeTour');
    const hit = resume && await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.id, [(resume.x0 + resume.x1) / 2, (resume.y0 + resume.y1) / 2]);
    await shot(page, `controls-${w}x${h}`);
    check(`B15-${w}x${h}`, '触控尺寸至少 44 px，慢放/手动状态可见，继续入口中心可点击', sizes.every((s) => s.w >= 44 && s.h >= 44 && s.hit) && slow && status.includes('你在操作') && hit === 'resumeTour', JSON.stringify({ sizes, slow, status, resume, hit }));
    if (hit === 'resumeTour') { await page.click('#resumeTour'); await page.clock.runFor(600); }
    const resumed = await state(page);
    check(`B16-${w}x${h}`, '继续导览入口调用正式恢复动作', hit === 'resumeTour' && resumed.mode === 'tour' && resumed.tourClock < 1, JSON.stringify({ hit, mode: resumed.mode, time: resumed.tourClock }));
    await ctx.close();
  }
};
