// Browser acceptance for the walk-in exhibit, run by hand (not part of CI or the build).
// Needs an existing Playwright install and Google Chrome; this repository installs neither.
//   node tools/build.mjs
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [page-url]
// Without a URL it opens dist/index.html from disk. Writes screenshots and report.json into <output-dir>.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'browser-check';
const base = process.argv[3] || 'file://' + path.resolve(__dirname, '../dist/index.html');
fs.mkdirSync(out, { recursive: true });
const shot = (name) => path.join(out, name + '.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { base, browser: browser.version(), runs: [], checks: [] };
  const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name + ' — ' + detail); };
  async function open(query, options = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ...options });
    const page = await ctx.newPage(), errors = [], external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', (r) => { const u = r.url(); if (u.split('?')[0] !== base.split('?')[0] && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
    await page.goto(base + query);
    await page.waitForFunction(() => window.__house && window.__house.ready, null, { polling: 100, timeout: 30000 });
    return { ctx, page, errors, external };
  }
  const probe = (page) => page.evaluate(() => ({ ...window.__house.probe(), gpu: (() => { const gl = document.createElement('canvas').getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })() }));
  const until = async (page, fn, ms, arg) => { try { await page.waitForFunction(fn, arg, { polling: 100, timeout: ms }); return true; } catch { return false; } };

  // 1. fixed views: one screenshot and one set of numbers each
  const views = [['hero', '?view=hero'], ['top', '?view=top'], ['living', '?view=living'], ['kitchen', '?view=kitchen'], ['family', '?view=family'], ['entry', '?view=entry'],
    ['cut', '?view=cut'], ['walk', '?view=walk'], ['night', '?view=hero&night=1'], ['sun-1000', '?view=hero&minute=600'], ['walnut', '?view=hero&style=walnut']];
  let allErrors = 0, allExternal = 0, maxCalls = 0;
  for (const [name, query] of views) {
    const { ctx, page, errors, external } = await open(query);
    await page.waitForTimeout(500);
    const p = await probe(page), box = await page.evaluate(() => window.__house.screenBox());
    await page.screenshot({ path: shot('view-' + name) });
    report.runs.push({ name, query, viewport: '1280x720', dpr: p.dpr, buffer: p.buffer, calls: p.calls, triangles: p.triangles, gpu: p.gpu, box, errors, external });
    allErrors += errors.length; allExternal += external.length; maxCalls = Math.max(maxCalls, p.calls);
    if (name === 'hero' || name === 'top') {
      const w = box.x1 - box.x0;
      check(`SPEC 5 ${name}: house width on screen`, w >= 0.45 && w <= 0.9 && box.x0 >= 0.02 && box.x1 <= 0.98 && box.y0 >= 0.02 && box.y1 <= 0.98, `${(w * 100).toFixed(1)}% of the viewport, box ${[box.x0, box.y0, box.x1, box.y1].map((v) => v.toFixed(3))}`);
    }
    await ctx.close();
  }
  check('SPEC 8 fixed views: no page errors, no outside requests', allErrors === 0 && allExternal === 0, `${allErrors} errors, ${allExternal} outside requests over ${views.length} views`);
  check('SPEC 9 fixed views: draw calls per frame (shadow pass included)', maxCalls <= 700, `highest ${maxCalls}, budget 700`);

  // 2. readings from the canvas
  {
    const { ctx, page } = await open('?view=living&labels=0');
    const rect = [0.52, 0.52, 0.66, 0.62];                         // a patch of living-room floor clear of furniture
    const oak = await page.evaluate((r) => window.__house.luma(...r), rect);
    await page.evaluate(() => window.__house.setStyle('walnut'));
    const walnut = await page.evaluate((r) => window.__house.luma(...r), rect);
    check('SPEC 6 style: walnut floor reads darker than oak', walnut < oak * 0.7, `oak ${oak.toFixed(1)}, walnut ${walnut.toFixed(1)} (display values 0-255)`);
    await ctx.close();
  }
  {
    const { ctx, page } = await open('?view=hero&labels=0');
    const inside = [0.42, 0.42, 0.58, 0.58], outside = [0.02, 0.3, 0.12, 0.5];
    const day = await page.evaluate(([a, b]) => [window.__house.luma(...a), window.__house.luma(...b)], [inside, outside]);
    await page.evaluate(() => window.__house.setNight(true));
    const night = await page.evaluate(([a, b]) => [window.__house.luma(...a), window.__house.luma(...b)], [inside, outside]);
    check('SPEC 7 night: rooms glow against a dark ground', night[0] > night[1] * 2 && night[1] < day[1] * 0.3, `inside/outside by day ${day.map((v) => v.toFixed(0))}, by night ${night.map((v) => v.toFixed(0))}`);
    await ctx.close();
  }

  // 3. what a visitor gets: no parameters, pixel ratio 2, real clicks and keys, everything in real time
  {
    const { ctx, page, errors, external } = await open('', { deviceScaleFactor: 2 });
    // 3a. it opens on the 2D plan: furniture library on the left, the plan in the middle, editing with real mouse and keys
    const layout = () => page.evaluate(() => window.__house.plan.layout());
    const first = await page.evaluate(() => { const p = window.__house.probe(); const st = document.getElementById('stage2d').getBoundingClientRect(), walls = document.getElementById('gWalls').getBoundingClientRect();
      return { mode2d: p.mode2d, pieces: p.pieces, cards: document.querySelectorAll('#lib .item').length, fits: walls.left >= st.left && walls.right <= st.right && walls.top >= st.top && walls.bottom <= st.bottom, share: walls.width / st.width }; });
    await page.screenshot({ path: shot('plan-open') });
    check('SPEC 11 plan: the page opens on the 2D plan with the library and the whole house in view', first.mode2d && first.pieces === 41 && first.cards === 63 && first.fits && first.share > 0.6,
      `2D ${first.mode2d}, ${first.pieces} pieces, ${first.cards} library cards, house fits ${first.fits} and takes ${(first.share * 100).toFixed(0)}% of the stage width`);
    const MMPX = await page.evaluate(() => window.__house.core.MM);
    const spot = [600 * MMPX, 480 * MMPX];                                              // a spot in the family room, off the tour route
    const card = await page.locator('#lib .item').first().boundingBox();
    const drop = await page.evaluate((w) => window.__house.plan.toScreen(w[0], w[1]), spot);
    await page.mouse.move(card.x + card.width / 2, card.y + 20); await page.mouse.down();
    await page.mouse.move(card.x + card.width / 2 + 30, card.y + 40, { steps: 3 }); await page.mouse.move(drop[0], drop[1], { steps: 12 });
    await page.screenshot({ path: shot('plan-dragging') });
    await page.mouse.up();
    let L = await layout();
    const bed = L[L.length - 1];
    check('SPEC 11 plan: dragging a library card onto the plan adds that piece where it was dropped', L.length === 42 && bed.type === 'bed' && Math.hypot(bed.cx - spot[0], bed.cy - spot[1]) < 30 && bed.cx % 10 === 0,
      `${L.length} pieces; new ${bed.type} at ${bed.cx},${bed.cy} mm, ${Math.hypot(bed.cx - spot[0], bed.cy - spot[1]).toFixed(0)} mm from the drop point`);
    const at = await page.evaluate((id) => window.__house.plan.screenOf(id), bed.id);
    const sPx = await page.evaluate(() => window.__house.plan.view().s);
    await page.mouse.move(at[0], at[1]); await page.mouse.down(); await page.mouse.move(at[0] - 40, at[1] + 20, { steps: 6 }); await page.mouse.up();
    await page.keyboard.press('r');
    await page.keyboard.press('ArrowRight');
    L = await layout();
    const nudged = L.find((f) => f.id === bed.id);
    check('SPEC 11 plan: a piece can be dragged, turned with R and nudged with the arrow keys', Math.abs(nudged.cx - (bed.cx - 40 / sPx + 10)) < 310 && Math.abs(nudged.cy - (bed.cy + 20 / sPx)) < 310 && nudged.rot === 90 && nudged.cx !== bed.cx,
      `moved from ${bed.cx},${bed.cy} to ${nudged.cx},${nudged.cy} (dragged ${(40 / sPx).toFixed(0)} mm left, ${(20 / sPx).toFixed(0)} mm down, wall snap may adjust), rot ${nudged.rot}`);
    // the two handles on a selected piece: the square resizes, the dot turns
    const handle = (q) => page.evaluate((sel) => { const r = [...document.querySelectorAll(sel)].pop().getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, q);
    const hs = await handle('#gSel [data-handle="size"]');
    await page.mouse.move(hs[0], hs[1]); await page.mouse.down(); await page.mouse.move(hs[0] + 30, hs[1] + 30, { steps: 5 }); await page.mouse.up();
    const sized = (await layout()).find((f) => f.id === bed.id);
    const hr = await handle('#gSel [data-handle="rot"]'), ctr = await page.evaluate((id) => window.__house.plan.screenOf(id), bed.id);
    await page.mouse.move(hr[0], hr[1]); await page.mouse.down(); await page.mouse.move(ctr[0], ctr[1] + 120, { steps: 8 }); await page.mouse.up();
    const turned2 = (await layout()).find((f) => f.id === bed.id);
    await page.screenshot({ path: shot('plan-handles') });
    check('SPEC 11 plan: the square handle resizes a piece and the dot handle turns it', (sized.w !== nudged.w || sized.d !== nudged.d) && sized.w >= 100 && sized.d >= 100 && sized.w % 10 === 0 && turned2.rot === 180,
      `size ${nudged.w}x${nudged.d} -> ${sized.w}x${sized.d} mm; dot dragged to straight below the piece: rot ${nudged.rot} -> ${turned2.rot}`);
    await page.keyboard.press('Control+d'); const n1 = (await layout()).length;
    await page.keyboard.press('Delete'); const n2 = (await layout()).length;
    await page.keyboard.press('Control+z'); const n3 = (await layout()).length;
    await page.keyboard.press('Control+z'); const n4 = (await layout()).length;
    check('SPEC 11 plan: duplicate, delete and undo', n1 === 43 && n2 === 42 && n3 === 43 && n4 === 42, `pieces after duplicate ${n1}, delete ${n2}, undo ${n3}, undo again ${n4}`);
    const fillOf = () => page.evaluate(() => ({ floor: document.querySelector('#gRooms .room[data-room="客餐厅"]').getAttribute('fill'), sofa: document.querySelector('#gFurn .furn rect').getAttribute('fill') }));
    const oak2d = await fillOf();
    await page.keyboard.press('c');
    const walnut2d = await fillOf();
    await page.screenshot({ path: shot('plan-walnut') });
    await page.keyboard.press('c');
    check('SPEC 6 plan: C swaps the wood on the plan too', oak2d.floor === 'url(#m-wood)' && walnut2d.floor === 'url(#m-walnut)' && oak2d.sofa !== walnut2d.sofa, `floor ${oak2d.floor} -> ${walnut2d.floor}, first piece ${oak2d.sofa} -> ${walnut2d.sofa}`);
    await page.reload();
    await page.waitForFunction(() => window.__house && window.__house.ready, null, { polling: 100, timeout: 30000 });
    const kept = await layout();
    check('SPEC 11 plan: the layout survives a reload', kept.length === 42 && kept.some((f) => f.id === bed.id && f.rot === 180), `${kept.length} pieces after reload, the added bed ${kept.some((f) => f.id === bed.id) ? 'is there' : 'is gone'}`);
    await page.screenshot({ path: shot('plan-edited') });
    // 3b. over to 3D: the house grows out of the plan with the edited layout
    await page.click('[data-mode="3d"]');
    const t0 = Date.now();
    await page.waitForTimeout(1500); await page.screenshot({ path: shot('default-grow-1.5s') });
    await page.waitForTimeout(1500); await page.screenshot({ path: shot('default-grow-3.0s') });
    const grown = await until(page, () => !window.__house.probe().growing, 8000);
    const growMs = Date.now() - t0;
    await page.waitForTimeout(300); await page.screenshot({ path: shot('default-after-grow') });
    const built = await probe(page);
    check('SPEC 8 default: switching to 3D grows the house from the edited plan', grown && growMs < 8000 && !built.mode2d && built.built === built.pieces + 1 && built.pieces === 42, `${(growMs / 1000).toFixed(1)} s; ${built.pieces} pieces on the plan, ${built.built} built in 3D (the fireplace is the extra one)`);
    await page.keyboard.press('3');
    await until(page, () => !window.__house.probe().tweening, 4000);
    const afterKey = await probe(page);
    check('SPEC 5 default: key 3 switches to the living room', afterKey.view === 'living', `view is ${afterKey.view}`);
    // walk in with the button; the tour plays by itself
    await page.click('[data-act="walk"]');
    const fps = [];
    let doorShot = false, doorAtCross = null, prevZ = null;
    const doorZ = await page.evaluate(() => window.__house.core.DOORS.find((d) => d.id === 'o20').cz);
    const tWalk = Date.now();
    while (Date.now() - tWalk < 30000) {
      const p = await probe(page);
      if (p.fps) fps.push(p.fps);
      const k = p.doors[5];                                                      // o20, the front door
      if (!doorShot && k > 0.5 && k < 1) { await page.screenshot({ path: shot('default-door-opening') }); doorShot = true; }
      if (prevZ !== null && prevZ > doorZ && p.walk.z <= doorZ && doorAtCross === null) doorAtCross = k;
      prevZ = p.walk.z;
      if (p.mode === 'walk' && !p.tweening && !(await page.evaluate(() => window.__house.state.touring)) && Date.now() - tWalk > 4000) break;
      await sleep(120);
    }
    await page.waitForTimeout(1200);
    const end = await probe(page);
    await page.screenshot({ path: shot('default-walk-end') });
    const want = await page.evaluate(() => { const C = window.__house.core, r = C.ROUTES.tour[C.ROUTES.tour.length - 1]; return [C.toX(r[0]), C.toZ(r[1])]; });
    const off = Math.hypot(end.walk.x - want[0], end.walk.z - want[1]);
    check('SPEC 3 default: the tour walks in through the front door to the living room', off < 0.3 && doorAtCross !== null && doorAtCross >= 0.75, `ended ${off.toFixed(2)} m from the last waypoint; front door ${doorAtCross === null ? 'never crossed' : (doorAtCross * 100).toFixed(0) + '% open when crossed'}; ${((Date.now() - tWalk) / 1000).toFixed(1)} s`);
    fps.sort((a, b) => a - b);
    check('SPEC 9 default: frame rate while walking', fps.length > 5 && fps[0] >= 30, `min ${fps[0]}, median ${fps[Math.floor(fps.length / 2)]} over ${fps.length} samples, buffer ${end.buffer.join('x')}`);
    // take over with the keyboard
    await page.keyboard.down('KeyS'); await page.waitForTimeout(900); await page.keyboard.up('KeyS');
    const moved = await probe(page);
    const dist = Math.hypot(moved.walk.x - end.walk.x, moved.walk.z - end.walk.z);
    check('SPEC 4 default: S walks backwards', dist > 0.6 && dist < 1.8, `moved ${dist.toFixed(2)} m in 0.9 s`);
    await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.move(760, 300, { steps: 6 }); await page.mouse.up();
    const turned = await probe(page);
    check('SPEC 4 default: dragging turns the head', Math.abs(turned.walk.yaw - moved.walk.yaw) > 0.3, `yaw changed by ${(turned.walk.yaw - moved.walk.yaw).toFixed(2)} rad`);
    await page.keyboard.press('n'); await page.waitForTimeout(400); await page.screenshot({ path: shot('default-walk-night') });
    await page.keyboard.press('n');
    await page.keyboard.press('Escape');
    await until(page, () => !window.__house.probe().tweening, 4000);
    const back = await probe(page);
    check('SPEC 4 default: Esc leaves the walk', back.mode === 'orbit', `mode is ${back.mode}`);
    // orbit by dragging, then a slider move switches to the real sun
    await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.move(540, 280, { steps: 6 }); await page.mouse.up();
    await page.evaluate(() => { const s = document.getElementById('sun'); s.value = '900'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(600);
    const sun = await page.evaluate(() => ({ light: window.__house.state.light, clock: document.getElementById('clock').textContent }));
    await page.screenshot({ path: shot('default-sun-1500') });
    check('SPEC 7 default: moving the slider switches to the real sun', sun.light === 'sun' && sun.clock === '15:00', `light ${sun.light}, clock ${sun.clock}`);
    await page.keyboard.press('x'); await page.keyboard.press('c'); await page.waitForTimeout(500);
    await page.screenshot({ path: shot('default-cut-walnut') });
    const st = await page.evaluate(() => ({ cut: window.__house.state.cut, style: window.__house.state.style }));
    check('SPEC 6 default: X cuts the walls and C swaps the wood', st.cut && st.style === 'walnut', JSON.stringify(st));
    // auto-orbit turns the camera by itself; replay runs the opening again and hands control back
    await page.keyboard.press('x'); await page.keyboard.press('1');
    await until(page, () => !window.__house.probe().tweening, 4000);
    const camAz = () => page.evaluate(() => { const c = window.__house.dev.camera.position; return Math.atan2(c.x, c.z); });
    await page.keyboard.press('o');
    const az0 = await camAz(); await page.waitForTimeout(1500); const az1 = await camAz();
    const autoOn = await page.evaluate(() => window.__house.state.auto);
    await page.screenshot({ path: shot('default-auto-orbit') });
    check('SPEC 5 default: O starts the auto-orbit', autoOn && Math.abs(az1 - az0) > 0.05, `auto ${autoOn}, camera turned ${(az1 - az0).toFixed(3)} rad in 1.5 s`);
    await page.keyboard.press('g');
    await page.waitForTimeout(300);
    const replaying = await page.evaluate(() => ({ growing: window.__house.probe().growing, auto: window.__house.state.auto }));
    const replayDone = await until(page, () => !window.__house.probe().growing, 8000);
    const after = await page.evaluate(() => ({ view: window.__house.state.view, box: window.__house.screenBox() }));
    check('SPEC 8 default: G replays the opening and ends on the overview', replaying.growing && !replaying.auto && replayDone && after.view === 'hero' && after.box.x1 - after.box.x0 > 0.45, `growing ${replaying.growing}, finished ${replayDone}, view ${after.view}, width ${((after.box.x1 - after.box.x0) * 100).toFixed(1)}%`);
    await page.keyboard.press('t'); await page.waitForTimeout(300);
    const back2d = await probe(page);
    check('SPEC 11 default: T returns to the plan', back2d.mode2d, `2D ${back2d.mode2d}`);
    report.runs.push({ name: 'default', viewport: '1280x720', dpr: end.dpr, buffer: end.buffer, fps, errors, external });
    check('SPEC 8 default: no page errors, no outside requests', errors.length === 0 && external.length === 0, `${errors.length} errors ${JSON.stringify(errors.slice(0, 3))}, ${external.length} outside requests`);
    await ctx.close();
  }

  // 4. phone, portrait, touch
  {
    const { ctx, page, errors, external } = await open('', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    await page.screenshot({ path: shot('phone-plan') });
    const p2 = await page.evaluate(() => { const lib = document.getElementById('libwrap').getBoundingClientRect(), st = document.getElementById('stage2d').getBoundingClientRect(), walls = document.getElementById('gWalls').getBoundingClientRect();
      return { scrollW: document.documentElement.scrollWidth, lib: [lib.top, lib.bottom], stage: [st.top, st.bottom], fits: walls.left >= 0 && walls.right <= innerWidth && walls.top >= st.top && walls.bottom <= st.bottom, n: window.__house.plan.layout().length }; });
    await page.tap('#lib .item >> nth=2');
    const p2n = await page.evaluate(() => window.__house.plan.layout().length);
    check('SPEC 10 phone: the plan fits, the library is a strip along the bottom, a tap on a card adds the piece', p2.scrollW <= 390 && p2.fits && p2.lib[1] <= 844 && p2.lib[0] >= p2.stage[1] - 1 && p2n === p2.n + 1,
      `page width ${p2.scrollW}, house fits ${p2.fits}, library strip ${p2.lib.map((v) => v.toFixed(0))}, pieces ${p2.n} -> ${p2n}`);
    await page.tap('[data-mode="3d"]');
    await until(page, () => !window.__house.probe().growing, 8000);
    await page.waitForTimeout(300); await page.screenshot({ path: shot('phone-hero') });
    const lay = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const walkBtn = document.querySelector('[data-act="walk"]').getBoundingClientRect();
      return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, bar: [r('bar').left, r('bar').right, r('bar').bottom], walkBtn: [walkBtn.left, walkBtn.right], box: window.__house.screenBox(), buffer: window.__house.probe().buffer };
    });
    check('SPEC 10 phone: nothing overflows and the walk button is on screen', lay.scrollW <= lay.innerW && lay.bar[0] >= 0 && lay.bar[1] <= lay.innerW && lay.bar[2] <= 844 && lay.walkBtn[0] >= 0 && lay.walkBtn[1] <= lay.innerW,
      `page width ${lay.scrollW}/${lay.innerW}, toolbar ${lay.bar.map((v) => v.toFixed(0))}, walk button ${lay.walkBtn.map((v) => v.toFixed(0))}`);
    const w = lay.box.x1 - lay.box.x0;
    check('SPEC 5 phone: the house fits the narrow screen', w >= 0.55 && lay.box.x0 >= 0.02 && lay.box.x1 <= 0.98, `${(w * 100).toFixed(1)}% of the width, buffer ${lay.buffer.join('x')}`);
    await page.tap('[data-act="walk"]');
    await page.waitForTimeout(1800);
    const tWalk = Date.now();
    while (Date.now() - tWalk < 30000) { if (!(await page.evaluate(() => window.__house.state.touring)) && Date.now() - tWalk > 3000) break; await sleep(200); }
    await page.waitForTimeout(1000); await page.screenshot({ path: shot('phone-walk-end') });
    const p0 = await probe(page);
    const joy = await page.evaluate(() => { const r = document.getElementById('joy').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, getComputedStyle(document.getElementById('joy')).display]; });
    // push the stick up for a second (touch drag through CDP)
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joy[0], y: joy[1] }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: joy[0], y: joy[1] + 40 }] });
    await page.waitForTimeout(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const p1 = await probe(page);
    const dist = Math.hypot(p1.walk.x - p0.walk.x, p1.walk.z - p0.walk.z);
    check('SPEC 10 phone: the joystick shows and moves the walker', joy[2] === 'block' && dist > 0.4, `joystick display ${joy[2]}, moved ${dist.toFixed(2)} m`);
    report.runs.push({ name: 'phone', viewport: '390x844', dpr: p1.dpr, buffer: p1.buffer, calls: p1.calls, errors, external });
    check('SPEC 8 phone: no page errors, no outside requests', errors.length === 0 && external.length === 0, `${errors.length} errors, ${external.length} outside requests`);
    await ctx.close();
  }

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.pass);
  console.log(`\n${report.checks.length - failed.length}/${report.checks.length} checks passed; browser ${report.browser}; GPU ${report.runs[0].gpu}`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
