// Browser checks for the 2026-11-25 Duet regression report. Both were run red on c817f7a before the fix.
// Usage (repo root served): NODE_PATH="$(npm root -g)" node tools/duet-recheck.cjs http://127.0.0.1:8771/xiaoju-city/ <out-dir>
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:8771/xiaoju-city/';
const out = process.argv[3] || 'shots/duet-recheck';
fs.mkdirSync(out, { recursive: true });
const results = []; let failed = 0;
function check(name, ok, data) { results.push({ name, ok: !!ok, data }); if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (data === undefined ? '' : ' ' + JSON.stringify(data))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(browser, opts) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url); await page.waitForFunction(() => window.__ride?.ready && window.__PLAYTEST__?.ready, null, { polling: 200, timeout: 60000 }); await sleep(600);
  return { ctx, page, errors };
}
async function depart(page) { await page.click('#start'); await sleep(300); if (await page.isVisible('#modal')) await page.click('#dialog-action'); await sleep(400); }
const rects = (page, sels) => page.evaluate(sels => Object.fromEntries(sels.map(s => { const e = document.querySelector(s); if (!e || e.closest('[hidden]') || getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden') return [s, null]; const r = e.getBoundingClientRect(); return [s, r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null]; })), sels);
const overlap = (a, b) => a && b ? Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) : 0;
function pairs(map) { const keys = Object.keys(map).filter(k => map[k]), bad = []; for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const o = overlap(map[keys[i]], map[keys[j]]); if (o > 1) bad.push([keys[i], keys[j], Math.round(o)]); } return bad; }
const hitAt = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return 'missing'; const r = e.getBoundingClientRect(), hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return hit === e || e.contains(hit) ? 'self' : (hit?.id || hit?.className || hit?.tagName) + ''; }, sel);
// What the map should pick: the nearest doorway not yet visited (promised in the 2026-11-22 fixes, Duet 9/15).
const mapPick = page => page.evaluate(() => { const s = window.__ride.state, C = window.RideCore; const want = C.HOTSPOTS.filter(h => !s.visits.includes(h.id)).map(h => { const p = C.at(h.road, h.at); return { id: h.id, d: Math.hypot(p.x - s.x, p.z - s.z) }; }).sort((a, b) => a.d - b.d)[0]?.id; return { selected: document.querySelector('.route-choices button[aria-pressed=true]')?.dataset.place, want, visits: s.visits }; });

(async () => {
  const browser = await chromium.launch();
  // 1. Map opens on the nearest unvisited doorway (Duet 15: it always opened on 街坊球场).
  for (const hasTouch of [false, true]) {
    const { ctx, page } = await open(browser, { viewport: { width: 1365, height: 800 }, hasTouch }); await depart(page);
    if (hasTouch) await page.tap('#route-map'); else await page.click('#route-map'); await sleep(400);
    const a = await mapPick(page);
    check(`map launcher (${hasTouch ? 'tap' : 'click'}) selects the nearest unvisited doorway`, a.want && a.selected === a.want, a);
    if (!hasTouch) {
      await page.screenshot({ path: `${out}/map-default.png` });
      await page.click('#dialog-secondary'); await sleep(300); await page.keyboard.press('KeyM'); await sleep(400);
      const k = await mapPick(page);
      check('M key selects the nearest unvisited doorway', k.want && k.selected === k.want, k);
    }
    await ctx.close();
  }
  {
    // Returning from the nearest doorway: the next nearest unvisited one is picked, not the one just visited.
    const { ctx, page } = await open(browser, { viewport: { width: 1365, height: 800 } });
    await page.evaluate(() => { const C = window.RideCore, h = C.HOTSPOTS.find(h => h.id === 'datai-teahouse'), p = C.at(h.road, h.at); localStorage.setItem('xiaoju-city/v1', JSON.stringify({ x: p.x, z: p.z, heading: p.heading, visits: ['datai-teahouse'], cruising: true, assist: false, id: 'datai-teahouse', savedAt: Date.now() })); });
    await page.reload(); await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 200, timeout: 60000 }); await sleep(500);
    await depart(page); await page.click('#route-map'); await sleep(400);
    const r = await mapPick(page);
    check('after visiting a doorway the map picks the next nearest unvisited one', r.want && r.want !== 'datai-teahouse' && r.selected === r.want, r);
    await ctx.close();
  }
  // 2. 667x375 without touch (Duet 27): readouts must not sit on the map launcher; check with touch too.
  for (const hasTouch of [false, true]) {
    const tag = hasTouch ? 'touch' : 'mouse';
    const { ctx, page } = await open(browser, { viewport: { width: 667, height: 375 }, hasTouch, isMobile: hasTouch, deviceScaleFactor: 2 });
    const t = await rects(page, ['.intro-panel h1', '#start', '.top-actions', '.brand']);
    check(`667x375 ${tag} title: start button on screen, nothing overlaps`, t['#start'] && t['#start'].b <= 375 && t['#start'].r <= 667 && pairs(t).length === 0 && await hitAt(page, '#start') === 'self', { pairs: pairs(t), start: t['#start'] });
    await page.screenshot({ path: `${out}/667x375-${tag}-title.png` });
    await depart(page);
    await page.evaluate(() => window.__PLAYTEST__.step(2600)); await sleep(200); // inside the first ring, so the stop prompt shows too
    const m = await rects(page, ['.speed-readout', '.boost-meter', '#route-map', '.place', '.bottom-bar', '#interaction', '.top-actions', '.touch-controls>div:first-child', '.touch-controls>div:last-child']);
    check(`667x375 ${tag} ride: readouts, map launcher, bars and prompt do not overlap`, pairs(m).length === 0, pairs(m));
    check(`667x375 ${tag} ride: tapping the map launcher hits the map launcher`, await hitAt(page, '#route-map') === 'self', await hitAt(page, '#route-map'));
    await page.screenshot({ path: `${out}/667x375-${tag}-ride.png` });
    await ctx.close();
  }
  // 3. Selected place name on the big map stays whole inside the canvas, for every destination (Duet follow-up: 「搭台 · 茶楼早」 was cut at the right edge),
  //    and 4. the selected choice is scrolled into view when the map opens (it sat in 骑楼段, below the fold).
  for (const [w, h, hasTouch] of [[1365, 800, false], [667, 375, true], [667, 375, false], [844, 390, true], [390, 664, true]]) {
    const { ctx, page } = await open(browser, { viewport: { width: w, height: h }, hasTouch, isMobile: hasTouch, deviceScaleFactor: 2 });
    await page.evaluate(() => { // record selected-name draws on the route overview, in canvas bitmap pixels
      window.__labels = []; const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y) { if (this.canvas.id === 'route-overview' && /^600 /.test(this.font)) { const m = this.measureText(text), t = this.getTransform(), al = this.textAlign; const x0 = al === 'right' || al === 'end' ? x - m.width : al === 'center' ? x - m.width / 2 : x; window.__labels.push({ text, l: t.a * x0 + t.e, r: t.a * (x0 + m.width) + t.e, t: t.d * (y - m.actualBoundingBoxAscent) + t.f, b: t.d * (y + m.actualBoundingBoxDescent) + t.f, cw: this.canvas.width, ch: this.canvas.height }); } return orig.apply(this, arguments); };
    });
    await depart(page);
    if (hasTouch) await page.tap('#route-map'); else await page.click('#route-map'); await sleep(400);
    const seen = await page.evaluate(() => { const v = document.getElementById('dialog-content').getBoundingClientRect(), b = document.querySelector('.route-choices button[aria-pressed=true]').getBoundingClientRect(); return { id: document.querySelector('.route-choices button[aria-pressed=true]').dataset.place, button: { t: Math.round(b.top), b: Math.round(b.bottom) }, view: { t: Math.round(v.top), b: Math.round(v.bottom) }, visible: b.top >= v.top - 1 && b.bottom <= v.bottom + 1 }; });
    check(`${w}x${h} map opens with the selected choice in view`, seen.visible, seen);
    const first = await page.evaluate(() => window.__labels.at(-1));
    const vis = await page.evaluate(lab => { const c = document.getElementById('route-overview'), r = c.getBoundingClientRect(), v = document.getElementById('dialog-content').getBoundingClientRect(), s = Math.min(r.width / c.width, r.height / c.height), ox = r.left + (r.width - c.width * s) / 2, oy = r.top + (r.height - c.height * s) / 2; const css = { l: ox + lab.l * s, r: ox + lab.r * s, t: oy + lab.t * s, b: oy + lab.b * s }; return { css, inView: css.l >= 0 && css.r <= innerWidth && css.t >= 0 && css.b <= innerHeight, inDialogView: css.t >= v.top - 1 && css.b <= v.bottom + 1 }; }, first);
    check(`${w}x${h} default selected name is whole inside the map and visible in the dialog when the map opens`, first && first.l >= 0 && first.r <= first.cw && first.t >= 0 && first.b <= first.ch && vis.inView && vis.inDialogView, { label: first?.text, ...vis });
    await page.screenshot({ path: `${out}/map-${w}x${h}-${hasTouch ? 'touch' : 'mouse'}.png` });
    const bad = [];
    for (const id of await page.evaluate(() => [...document.querySelectorAll('.route-choices button')].map(b => b.dataset.place))) {
      await page.evaluate(id => { window.__labels = []; document.querySelector(`.route-choices button[data-place="${id}"]`).click(); }, id);
      const lab = await page.evaluate(() => window.__labels.at(-1));
      if (!lab || lab.l < 0 || lab.r > lab.cw || lab.t < 0 || lab.b > lab.ch) bad.push(lab ? { id, text: lab.text, l: Math.round(lab.l), r: Math.round(lab.r), t: Math.round(lab.t), cw: lab.cw } : { id, missing: true });
    }
    check(`${w}x${h} every destination's selected name stays inside the map`, bad.length === 0, bad);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${out}/duet-recheck-report.json`, JSON.stringify(results, null, 1));
  console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
