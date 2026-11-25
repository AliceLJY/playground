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
  await browser.close();
  fs.writeFileSync(`${out}/duet-recheck-report.json`, JSON.stringify(results, null, 1));
  console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
