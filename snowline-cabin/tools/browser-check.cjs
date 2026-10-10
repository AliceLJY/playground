// Browser acceptance for 雪线小木屋: SPEC 验收条目 B1-B12. Run by hand; needs an existing Playwright install and Google Chrome.
//   node tools/build.mjs
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <out-dir> [page-url]
// Without a URL it opens dist/index.html from disk. Writes report.json and screenshots into <out-dir>.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'browser-check';
const base = process.argv[3] || 'file://' + path.resolve(__dirname, '../dist/index.html');
fs.mkdirSync(out, { recursive: true });
const isExternal = (u) => !(u.startsWith('data:') || u.startsWith('blob:')) && (base.startsWith('file:') ? u.split('?')[0] !== base.split('?')[0] : new URL(u).origin !== new URL(base).origin);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { base, browser: browser.version(), when: new Date().toISOString(), checks: [] };
  const check = (id, name, pass, detail) => { const ne = pass === 'NE'; report.checks.push({ id, name, pass: ne ? false : !!pass, ne, detail }); console.log(`${ne ? 'N/E ' : pass ? 'PASS' : 'FAIL'}  ${id}  ${name} — ${detail}`); };
  const errors = [], external = [];
  const open = async (query, w, h, dpr = 1) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 600, isMobile: w < 600 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${query}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${query}: ${m.text()}`); });
    page.on('request', (r) => { if (isExternal(r.url())) external.push(r.url()); });
    await page.goto(base + query);
    await page.waitForFunction(() => window.__cabin && window.__cabin.ready, null, { polling: 100, timeout: 20000 });
    return { ctx, page };
  };
  // pixel statistics of a screenshot, read back in a blank page
  const stats = async (png) => {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    const r = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let lum = 0, warm = 0, n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) { lum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; if (d[i] > 200 && d[i] - d[i + 2] > 50) warm++; }
      return { lum: lum / n, warm: warm / n };
    }, png.toString('base64'));
    await ctx.close(); return r;
  };
  // what an empty page reaches on this display: below 55/s no page can show 50 fps, so the fps budget cannot be judged here
  const displayCap = await (async () => { const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), pg = await ctx.newPage(); await pg.setContent('<body style="background:#000"></body>');
    const f = await pg.evaluate(() => new Promise((res) => { const t = []; const fn = (n) => { t.push(n); if (t.length < 121) requestAnimationFrame(fn); else res((t.length - 1) / ((t[t.length - 1] - t[0]) / 1000)); }; requestAnimationFrame(fn); })); await ctx.close(); return f; })();
  report.displayCap = displayCap;

  // fixed views, 1280x720, dpr 1
  const shots = {};
  for (const v of ['hero', 'deck', 'sat', 'wide']) {
    const { ctx, page } = await open('?view=' + v, 1280, 720); await page.waitForTimeout(700);
    shots[v] = { png: await page.screenshot({ path: path.join(out, v + '.png') }), info: await page.evaluate(() => ({ ...window.__cabin.info(), hero: window.__cabin.heroBox(), copy: window.__cabin.copyBox() })) };
    await ctx.close();
  }
  const hs = await stats(shots.hero.png), h = shots.hero.info;
  check('B2', 'opening view: the lodge is clear of the copy and inside the frame', h.hero.x0 >= h.copy.x1 && h.hero.x1 <= 0.98 && h.hero.y1 - h.hero.y0 >= 0.4, `lodge x ${h.hero.x0.toFixed(3)}..${h.hero.x1.toFixed(3)}, copy ends at ${h.copy.x1.toFixed(3)}, lodge height share ${(h.hero.y1 - h.hero.y0).toFixed(2)}`);
  check('B3', 'opening view reads as night with warm lights (mean luminance 0.08-0.30, warm bright pixels 0.2%-6%)', hs.lum >= 0.08 && hs.lum <= 0.3 && hs.warm >= 0.002 && hs.warm <= 0.06, `luminance ${hs.lum.toFixed(3)}, warm share ${(hs.warm * 100).toFixed(2)}%`);
  const maxCalls = Math.max(...Object.values(shots).map((s) => s.info.calls));
  check('B4a', 'draw calls stay inside the budget of 120 in every fixed view', maxCalls <= 120, `max ${maxCalls}; triangles up to ${Math.max(...Object.values(shots).map((s) => s.info.tris))}`);

  // player default: no query, dpr 2, 1440x900
  { const { ctx, page } = await open('', 1440, 900, 2);
    const u0 = await page.evaluate(() => window.__cabin.state().u); await page.waitForTimeout(6000);
    const s = await page.evaluate(() => ({ st: window.__cabin.state(), info: window.__cabin.info() }));
    await page.screenshot({ path: path.join(out, 'default.png') });
    check('B4b', 'player default (1440x900, dpr 2): the loop runs by itself', s.st.mode === 'auto' && s.st.u > u0, `mode ${s.st.mode}, u ${u0.toFixed(4)} -> ${s.st.u.toFixed(4)}, pixel ratio ${s.info.pixelRatio}, render scale step ${s.info.scaleIdx}`);
    check('B4c', 'player default: at least 50 fps', s.info.fps >= 50 ? true : displayCap < 55 ? 'NE' : false, `fps ${s.info.fps.toFixed(1)}, empty-page rate on this display ${displayCap.toFixed(1)}`);
    // B5 drag
    const before = await page.evaluate(() => window.__cabin.state().cam);
    await page.mouse.move(900, 300); await page.mouse.down(); await page.mouse.move(700, 330, { steps: 12 }); 
    const mid = await page.evaluate(() => window.__cabin.state()); await page.mouse.up();
    const moved = Math.hypot(...mid.cam.map((v, i) => v - before[i]));
    await page.waitForTimeout(9500);
    const after = await page.evaluate(() => window.__cabin.state().mode);
    check('B5', 'a drag takes the view at once; about 8 s after letting go the loop has it back', mid.mode === 'manual' && moved > 1 && after === 'auto', `during drag: ${mid.mode}, camera moved ${moved.toFixed(1)} m; 9.5 s later: ${after}`);
    // B6 buttons
    const dist = () => page.evaluate(() => Math.hypot(...window.__cabin.state().cam.map((v, i) => v - [0, 4.2, 0][i])));
    const d0 = await dist(); await page.click('[data-act="in"]'); await page.waitForTimeout(200); const d1 = await dist();
    await page.click('[data-act="auto"]'); await page.waitForTimeout(7000); const offMode = await page.evaluate(() => window.__cabin.state().mode), pressed = await page.getAttribute('[data-act="auto"]', 'aria-pressed');
    await page.click('[data-act="reset"]'); await page.waitForTimeout(5000); const r = await page.evaluate(() => window.__cabin.state());
    check('B6', 'buttons: zoom in moves closer; auto-orbit off holds the view; reset returns to the loop start', d1 < d0 && offMode === 'manual' && pressed === 'false' && r.mode === 'auto' && r.u < 0.05, `distance ${d0.toFixed(1)} -> ${d1.toFixed(1)}; auto off for 7 s: ${offMode}; after reset: ${r.mode}, u ${r.u.toFixed(3)}`);
    await ctx.close(); }

  // B7 hover
  { const { ctx, page } = await open('?view=hero', 1280, 720); const hb = await page.evaluate(() => window.__cabin.heroBox());
    await page.mouse.move(((hb.x0 + hb.x1) / 2) * 1280, (hb.y0 * 0.45 + hb.y1 * 0.55) * 720); await page.waitForTimeout(300);
    const id = await page.evaluate(() => window.__cabin.state().hover); const cur = await page.evaluate(() => getComputedStyle(document.getElementById('scene')).cursor);
    check('B7', 'hovering the lodge marks one building for brighter windows; the pointer stays a normal arrow', !!id && cur === 'default', `hovered: ${id}, cursor: ${cur}`); await ctx.close(); }

  // B8 phone
  { const { ctx, page } = await open('?view=hero', 390, 844, 2); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, 'phone.png') });
    const s = await page.evaluate(() => ({ ui: window.__cabin.uiBoxes(), hero: window.__cabin.heroBox() }));
    const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1, k = Object.keys(s.ui), clashes = [];
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (hit(s.ui[k[i]], s.ui[k[j]])) clashes.push(k[i] + ' x ' + k[j]);
    check('B8', 'phone 390x844: no two pieces of text or controls overlap; the lodge sits above the copy', clashes.length === 0 && s.hero.y1 <= s.ui['.copy'].y0 && s.hero.x0 >= 0 && s.hero.x1 <= 1, `overlaps: ${clashes.join(', ') || 'none'}; lodge bottom ${s.hero.y1.toFixed(3)}, copy top ${s.ui['.copy'].y0.toFixed(3)}`); await ctx.close(); }

  // B9 lighting one lamp with a real click, then going back
  { const { ctx, page } = await open('', 1280, 720);
    const s0 = await page.evaluate(() => ({ lit: window.__cabin.state().lit.length, at: window.__cabin.summitOnScreen('beacon') }));
    await page.mouse.click(s0.at.x, s0.at.y);
    await page.waitForFunction(() => window.__cabin.state().lit.includes('beacon'), null, { polling: 100, timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(400);
    const s1 = await page.evaluate(() => ({ st: window.__cabin.state(), name: document.getElementById('storyName').textContent, on: document.getElementById('story').classList.contains('on'), chip: document.getElementById('chip').textContent }));
    await page.waitForTimeout(8000); const parked = await page.evaluate(() => window.__cabin.state().mode);
    await page.screenshot({ path: path.join(out, 'lamp.png') });
    await page.click('#back'); await page.waitForTimeout(8500);
    const s2 = await page.evaluate(() => ({ st: window.__cabin.state(), on: document.getElementById('story').classList.contains('on') }));
    check('B9', 'a click on a dark summit flies there, lights it and shows its story; the view stays until "回木屋", then the loop resumes', s0.lit === 0 && s1.st.lit.length === 1 && s1.st.focus === 'beacon' && s1.on && s1.name === '小烽火塔' && s1.chip.includes('1') && parked === 'manual' && !s2.on && s2.st.focus === null && s2.st.mode === 'auto',
      `before: ${s0.lit} lit; after click: lit ${JSON.stringify(s1.st.lit)}, story "${s1.name}", chip "${s1.chip}"; 8 s later still ${parked}; after back: story ${s2.on ? 'shown' : 'hidden'}, mode ${s2.st.mode}`);
    // B10 the other six, then the finale
    for (const id of ['red-hut', 'white-porch', 'bare-lantern', 'hamlet-east', 'hamlet-north', 'cairn']) { await page.evaluate((i) => window.__cabin.focus(i), id); await page.waitForFunction((i) => window.__cabin.state().lit.includes(i), id, { polling: 100, timeout: 12000 }).catch(() => {}); }
    await page.waitForFunction(() => window.__cabin.state().finale > 4, null, { polling: 100, timeout: 15000 }).catch(() => {});
    const f1 = await page.evaluate(() => ({ st: window.__cabin.state(), line: document.getElementById('storyLine').textContent, chip: document.getElementById('chip').textContent }));
    await page.screenshot({ path: path.join(out, 'finale.png') });
    await page.waitForFunction(() => window.__cabin.state().finale === -2, null, { polling: 100, timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(7000); const f2 = await page.evaluate(() => ({ st: window.__cabin.state(), on: document.getElementById('story').classList.contains('on') }));
    check('B10', 'seven lit summits start the finale once; it ends by itself and the loop resumes', f1.st.lit.length === 7 && f1.st.finale > 4 && f1.line.includes('七座山头都亮了') && f1.chip === '七座都亮了' && f2.st.finale === -2 && !f2.on && f2.st.mode === 'auto',
      `lit ${f1.st.lit.length}, finale clock ${f1.st.finale.toFixed(1)} s, line "${f1.line}", chip "${f1.chip}"; afterwards: finale ${f2.st.finale}, story ${f2.on ? 'shown' : 'hidden'}, mode ${f2.st.mode}`);
    await ctx.close(); }

  // B11 the hour
  { const hs2 = {};
    for (const hh of [0, 0.5, 1]) { const { ctx, page } = await open('?view=hero&h=' + hh, 1280, 720); await page.waitForTimeout(600); const png = await page.screenshot({ path: path.join(out, 'hour-' + hh + '.png') });
      const pg = await (await browser.newContext()).newPage();
      hs2[hh] = await pg.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(Math.round(img.width * 0.45), 0, Math.round(img.width * 0.5), Math.round(img.height * 0.3)).data; let r = 0, b = 0, l = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; b += d[i + 2]; l += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; } return { rb: r / b, lum: l / (d.length / 4) / 255 }; }, png.toString('base64'));
      await pg.context().close(); await ctx.close(); }
    check('B11', 'the hour changes the picture: the sky is darkest and bluest at night, warmer at dusk and at dawn', hs2[0.5].lum < hs2[0].lum && hs2[0.5].lum < hs2[1].lum && hs2[0].rb > hs2[0.5].rb + 0.15 && hs2[1].rb > hs2[0.5].rb + 0.1,
      `upper sky luminance dusk ${hs2[0].lum.toFixed(3)} / night ${hs2[0.5].lum.toFixed(3)} / dawn ${hs2[1].lum.toFixed(3)}; red-to-blue ratio ${hs2[0].rb.toFixed(2)} / ${hs2[0.5].rb.toFixed(2)} / ${hs2[1].rb.toFixed(2)}`);
    const { ctx, page } = await open('', 1280, 720); const box = await page.locator('#hour').boundingBox();
    await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2); await page.waitForTimeout(300); const hv = await page.evaluate(() => window.__cabin.state().hour);
    check('B11b', 'dragging the slider towards dusk changes the hour', hv < 0.25, `hour after a click at 10% of the slider: ${hv.toFixed(2)}`); await ctx.close(); }

  // B12 inside
  for (const [w, h, dpr, tag] of [[1280, 720, 1, 'desktop'], [390, 844, 2, 'phone']]) {
    const { ctx, page } = await open('?lit=all', w, h, dpr);
    await page.click('[data-act="enter"]'); await page.waitForTimeout(1300);
    const a = await page.evaluate(() => ({ st: window.__cabin.state(), ui: Object.keys(window.__cabin.uiBoxes()), boxes: window.__cabin.uiBoxes() }));
    await page.screenshot({ path: path.join(out, 'inside-' + tag + '.png') });
    // turn until another standing spot is on screen, then tap its ring
    let target = null;
    for (let turn = 0; turn < 8 && !target; turn++) {
      const spots = await page.evaluate(() => [0, 1, 2].map((i) => ({ i, cur: window.__cabin.state().spot, ...window.__cabin.spotOnScreen(i) })));
      target = spots.find((q) => q.front && q.x > w * 0.15 && q.x < w * 0.85 && q.y > h * 0.2 && q.y < h * 0.62 && ['fire', 'window', 'table'][q.i] !== q.cur) || null;
      if (!target) { await page.mouse.move(w * 0.3, h * 0.4); await page.mouse.down(); await page.mouse.move(w * 0.3 + h * 0.3, h * 0.4, { steps: 8 }); await page.mouse.up(); }
    }
    let moved = null; if (target) { if (w < 600) await page.touchscreen.tap(target.x, target.y); else await page.mouse.click(target.x, target.y); await page.waitForTimeout(300); moved = await page.evaluate(() => window.__cabin.state().spot); }
    await page.click('#leave'); await page.waitForTimeout(1300); const b = await page.evaluate(() => ({ st: window.__cabin.state(), ui: Object.keys(window.__cabin.uiBoxes()) }));
    const hit = (p, q) => p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1, clash = a.boxes['.indoor'] && a.boxes['.hour'] ? hit(a.boxes['.indoor'], a.boxes['.hour']) : true;
    check('B12-' + tag, 'the door button takes you inside; a tap on a floor ring moves you; "出门" brings the outside view back', a.st.inside && a.st.spot === 'fire' && a.ui.includes('.indoor') && !a.ui.includes('.tools') && !clash && target && moved && moved !== 'fire' && !b.st.inside && b.ui.includes('.tools') && !b.ui.includes('.indoor'),
      `inside ${a.st.inside} at "${a.st.spot}", panels ${a.ui.join(' ')}, panel and slider overlap ${clash}; ring tapped ${target ? 'yes' : 'none came into view'}, now at "${moved}"; after leaving: inside ${b.st.inside}`);
    await ctx.close(); }

  check('B1', 'no page errors and nothing loaded from outside the page', errors.length === 0 && external.length === 0, `errors ${errors.length}${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}; outside requests ${external.length}`);
  const fail = report.checks.filter((c) => !c.pass && !c.ne), ne = report.checks.filter((c) => c.ne);
  report.summary = { pass: report.checks.filter((c) => c.pass).length, fail: fail.length, notEvaluable: ne.length };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.summary.pass} passed, ${fail.length} failed, ${ne.length} not evaluable on this machine`);
  await browser.close(); process.exit(fail.length ? 1 : 0);
})();
