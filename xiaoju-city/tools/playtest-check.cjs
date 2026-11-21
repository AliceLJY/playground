// Browser checks for the 2026-11-22 play reports (Alice + Duet). Each check was run red on f45b7cd before the fix.
// Usage (repo root served): NODE_PATH="$(npm root -g)" node tools/playtest-check.cjs http://127.0.0.1:8766/xiaoju-city/ <out-dir>
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:8766/xiaoju-city/';
const out = process.argv[3] || 'shots/playtest';
fs.mkdirSync(out, { recursive: true });
const results = []; let failed = 0;
function check(name, ok, data) { results.push({ name, ok: !!ok, data }); if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (data === undefined ? '' : ' ' + JSON.stringify(data))); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const phone = (w, h) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
async function open(browser, opts, query = '') {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url + query); await page.waitForFunction(() => window.__ride?.ready && window.__PLAYTEST__?.ready, null, { polling: 200, timeout: 30000 }); await sleep(600);
  return { ctx, page, errors };
}
async function depart(page) { await page.click('#start'); await sleep(300); if (await page.isVisible('#modal')) await page.click('#dialog-action'); await sleep(400); }
const rects = (page, sels) => page.evaluate(sels => Object.fromEntries(sels.map(s => { const e = document.querySelector(s); if (!e || e.closest('[hidden]') || getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden') return [s, null]; const r = e.getBoundingClientRect(); return [s, r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null]; })), sels);
const overlap = (a, b) => a && b ? Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) : 0;
function pairs(map) { const keys = Object.keys(map).filter(k => map[k]), bad = []; for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const o = overlap(map[keys[i]], map[keys[j]]); if (o > 1) bad.push([keys[i], keys[j], Math.round(o)]); } return bad; }
const hitAt = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return 'missing'; const r = e.getBoundingClientRect(), hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return hit === e || e.contains(hit) ? 'self' : (hit?.id || hit?.className || hit?.tagName) + ''; }, sel);

(async () => {
  const browser = await chromium.launch();
  // 1. Short touch landscape (iPhone SE 667x375 and a wider 844x390): action bar must not cover the map launcher or readouts.
  for (const [w, h] of [[667, 375], [844, 390]]) {
    const { ctx, page } = await open(browser, phone(w, h)); await depart(page);
    // stand inside the first ring so the interaction prompt is showing too
    await page.evaluate(() => window.__PLAYTEST__.step(2600)); await sleep(200);
    const map = await rects(page, ['.bottom-bar', '#route-map', '.speed-readout', '.boost-meter', '#interaction', '.top-actions', '.touch-controls>div:first-child', '.touch-controls>div:last-child']);
    check(`${w}x${h} landscape: action bar, map launcher, readouts and prompt do not overlap`, pairs(map).length === 0, pairs(map));
    check(`${w}x${h} landscape: tapping the map launcher hits the map launcher`, await hitAt(page, '#route-map') === 'self', await hitAt(page, '#route-map'));
    await page.screenshot({ path: `${out}/landscape-${w}x${h}-ride.png` });
    await ctx.close();
  }
  // 2. Portrait 390x664: hint bubble vs place card and map; navigation bar vs speed/boost; no keyboard hint on touch.
  {
    const { ctx, page } = await open(browser, phone(390, 664)); await depart(page);
    await page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = '← 骑楼雨夜 · 停一下就能进'; t.classList.add('show'); });
    const a = await rects(page, ['#toast', '.place', '#route-map']);
    check('390x664: hint bubble clears the place card and map', overlap(a['#toast'], a['.place']) + overlap(a['#toast'], a['#route-map']) === 0, a);
    const hint = await page.evaluate(() => { const e = document.querySelector('.boost-meter small'); return e && getComputedStyle(e).display !== 'none' ? e.textContent : null; });
    check('390x664 touch: no keyboard-only Shift/B hint', !hint, hint);
    await page.evaluate(() => document.getElementById('route-map').click()); await sleep(300);
    await page.evaluate(() => { const b = [...document.querySelectorAll('.route-choices button')].find(b => b.textContent.includes('十三行')); b.click(); }); await sleep(200);
    const btn = await rects(page, ['#dialog-action']), vh = 664;
    check('390x664 map: start-navigation button is fully on screen and tappable', btn['#dialog-action'] && btn['#dialog-action'].b <= vh && btn['#dialog-action'].t >= 0 && await hitAt(page, '#dialog-action') === 'self', { btn: btn['#dialog-action'], hit: await hitAt(page, '#dialog-action') });
    await page.screenshot({ path: `${out}/portrait-map.png` });
    await page.click('#dialog-action'); await sleep(500);
    const n = await rects(page, ['#navigation-hud', '.speed-readout', '.boost-meter', '.bottom-bar', '.place', '#route-map']);
    check('390x664: navigation bar does not cover readouts', pairs(n).length === 0, pairs(n));
    await page.screenshot({ path: `${out}/portrait-nav.png` });
    await ctx.close();
  }
  // 3. Map in short landscape: button reachable.
  {
    const { ctx, page } = await open(browser, phone(667, 375)); await depart(page);
    await page.evaluate(() => document.getElementById('route-map').click()); await sleep(300);
    const btn = await rects(page, ['#dialog-action']);
    check('667x375 map: start-navigation button is fully on screen and tappable', btn['#dialog-action'] && btn['#dialog-action'].b <= 375 && await hitAt(page, '#dialog-action') === 'self', { btn: btn['#dialog-action'], hit: await hitAt(page, '#dialog-action') });
    await ctx.close();
  }
  // 4. Title in short landscape: the dancing buildings must read at phone size.
  {
    const { ctx, page } = await open(browser, phone(667, 375));
    const b = await page.evaluate(() => window.__PLAYTEST__.titleBounds());
    const width = (Math.max(...b.map(x => x.x + x.width)) - Math.min(...b.map(x => x.x))) / 667, minH = Math.min(...b.map(x => x.height)) / 375;
    check('667x375 title: buildings span >=45% width and each >=25% height', width >= .45 && minH >= .25, { width: +width.toFixed(2), minH: +minH.toFixed(2) });
    await page.screenshot({ path: `${out}/landscape-667-title.png` });
    await ctx.close();
  }
  // 5. Toggle colours follow on/off, not the button identity.
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1365, height: 800 } }); await depart(page);
    const lum = () => page.evaluate(() => ['cruise', 'assist'].map(id => { const e = document.getElementById(id), c = getComputedStyle(e).backgroundColor.match(/\d+(\.\d+)?/g).map(Number); return { id, on: e.getAttribute('aria-pressed') === 'true', lum: .3 * c[0] + .59 * c[1] + .11 * c[2] }; }));
    await page.click('#cruise'); await page.click('#assist'); await sleep(300);
    const s = await lum(); const on = s.filter(x => x.on), off = s.filter(x => !x.on);
    check('toggles: an ON switch is darker than an OFF switch', on.length && off.length && Math.max(...on.map(x => x.lum)) < Math.min(...off.map(x => x.lum)), s);
    // 6. Journal opens at the top.
    await page.click('#journal'); await sleep(300);
    const j = await page.evaluate(() => { const d = document.querySelector('.paper-dialog'), first = document.querySelector('.journal-item'); const dr = d.getBoundingClientRect(), fr = first.getBoundingClientRect(); return { firstTop: Math.round(fr.top), dialogTop: Math.round(dr.top), dialogBottom: Math.round(dr.bottom), scroller: Math.max(d.scrollTop, document.getElementById('dialog-content').scrollTop) }; });
    check('journal opens at its first entry, not scrolled to the bottom', j.firstTop >= j.dialogTop && j.firstTop < j.dialogBottom && j.scroller < 5, j);
    await ctx.close();
  }
  // 7. Crash into the arcade (Alice: "撞到就穿帧"): no part of the fallen cat may end up behind a wall or pillar.
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1365, height: 800 } }); await depart(page);
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowLeft'); await sleep(700); await page.keyboard.up('ArrowLeft');
    let crash = false;
    for (let i = 0; i < 120 && !crash; i++) { await sleep(100); crash = await page.evaluate(() => window.__ride.state.phase === 'crash'); }
    await page.keyboard.up('ArrowUp');
    check('repro reaches a crash', crash);
    let worst = { through: 0 };
    for (let i = 0; i < 14; i++) { await sleep(150); const p = await page.evaluate(() => window.__ride.catPenetration()); if (p.through > worst.through) worst = p; if (i === 6) await page.screenshot({ path: `${out}/crash.png` }); }
    check('fallen cat: no body part ends up behind a wall or pillar', worst.through === 0, worst);
    await ctx.close();
  }
  // 7b/7c. Camera keeps sight of the rider riding under the arcade edge and when hitting a tree (Duet 19).
  for (const scene of ['arcade', 'tree']) {
    const { ctx, page } = await open(browser, { viewport: { width: 1365, height: 800 } }); await depart(page);
    const placed = await page.evaluate(kind => {
      const C = window.RideCore, obs = window.__ride.obstacles;
      if (kind === 'arcade') {
        const o = obs.filter(o => o.kind === '骑楼柱子').map(o => ({ o, n: C.nearest(o.x, o.z, [C.MAIN]) })).filter(x => x.n.at > 40 && x.n.at < 120).sort((a, b) => a.n.at - b.n.at)[0];
        const lat = (o.o.x - o.n.x) * Math.cos(o.n.heading) - (o.o.z - o.n.z) * Math.sin(o.n.heading), off = lat - Math.sign(lat) * .9, p = C.at(C.MAIN, o.n.at - 14, off);
        return window.__PLAYTEST__.place({ x: p.x, z: p.z, heading: p.heading, cruising: false });
      }
      const t = obs.filter(o => o.kind === '树池').map(o => ({ o, n: C.nearest(o.x, o.z, [C.MAIN]) })).sort((a, b) => a.n.distance - b.n.distance)[0].o;
      const h = Math.atan2(-(t.x - 0), -(t.z - 0)); // overwritten below
      const n = C.nearest(t.x, t.z, [C.MAIN]), road = C.at(n.road, n.at);
      const hx = t.x - road.x, hz = t.z - road.z, heading = Math.atan2(-hx, -hz);
      return window.__PLAYTEST__.place({ x: road.x, z: road.z, heading, cruising: false });
    }, scene);
    let occluded = 0, samples = 0, crashed = false;
    await page.keyboard.down('ArrowUp');
    for (let i = 0; i < 26; i++) { await sleep(150); samples++; const s = await page.evaluate(() => ({ occ: window.__ride.riderOccluded(), phase: window.__ride.state.phase })); if (s.occ) occluded++; crashed ||= s.phase === 'crash'; if (i === 12) await page.screenshot({ path: `${out}/camera-${scene}.png` }); }
    await page.keyboard.up('ArrowUp');
    check(`camera keeps sight of the rider (${scene})`, occluded === 0, { occluded, samples, crashed, start: [placed.x.toFixed(1), placed.z.toFixed(1)] });
    await ctx.close();
  }
  // 7d. R next to a tree: back on the road centre, facing along the road (Duet 20: it only stood the bike up, still nosed into the tree).
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1365, height: 800 } }); await depart(page);
    const r = await page.evaluate(() => {
      const C = window.RideCore, t = window.__ride.obstacles.filter(o => o.kind === '树池').map(o => ({ o, n: C.nearest(o.x, o.z) })).sort((a, b) => a.n.distance - b.n.distance)[0];
      const dx = t.o.x - t.n.x, dz = t.o.z - t.n.z, len = Math.hypot(dx, dz), x = t.o.x - dx / len * 1.4, z = t.o.z - dz / len * 1.4;
      window.__PLAYTEST__.place({ x, z, heading: Math.atan2(-dx, -dz), cruising: false });
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
      const s = window.__ride.state, n = C.nearest(s.x, s.z), road = C.at(n.road, n.at), off = Math.abs(Math.sin(C.wrap(s.heading - road.heading)));
      return { fromRoad: +n.distance.toFixed(2), headingOffRoad: +off.toFixed(3) };
    });
    check('R puts the bike on the road centre facing along the road', r.fromRoad < .3 && r.headingOffRoad < .05, r);
    await ctx.close();
  }
  // 8. Resume with auto-forward off: no "车会自己前行" tutorial.
  {
    const { ctx, page } = await open(browser, phone(390, 664));
    await page.evaluate(() => { const p = window.RideCore.at(window.RideCore.MAIN, 40); localStorage.setItem('xiaoju-city/v1', JSON.stringify({ x: p.x, z: p.z, heading: p.heading, visits: ['qilou-rain'], cruising: false, assist: false, id: 'qilou-rain', savedAt: Date.now() })); });
    await page.reload(); await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 200 }); await sleep(500);
    await page.click('#start'); await sleep(300);
    const text = await page.evaluate(() => (document.getElementById('modal').hidden ? '' : document.getElementById('dialog-content').textContent) + ' | ' + document.getElementById('toast').textContent);
    if (await page.isVisible('#modal')) await page.click('#dialog-action'); await sleep(300);
    const toast = await page.evaluate(() => document.getElementById('toast').textContent);
    check('resume with auto-forward off does not claim the bike rides itself', !/自己前行/.test(text + toast), text + ' || ' + toast);
    await ctx.close();
  }
  // 9. Coming back through the back/forward cache must not leave a stale card open.
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1365, height: 800 } }, '?view=hotspot');
    await page.waitForFunction(() => window.__PLAYTEST__.snapshot().view === 'hotspot', null, { polling: 200 });
    const nav = page.waitForNavigation({ timeout: 4000 }).then(() => true).catch(() => false);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    check('restored-from-cache page reloads instead of showing the stale card', await nav);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${out}/playtest-report.json`, JSON.stringify(results, null, 1));
  console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
