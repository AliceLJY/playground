// Browser acceptance for "agent 引擎是什么" (SPEC §8.9–8.10), run by hand, not part of CI.
// Needs an existing Playwright install and Google Chrome; this repository installs neither.
//   python3 -m http.server 8971 --bind 127.0.0.1          (inside agent-engine/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [base-url]
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails.
// Optional: AE_SIZES=desktop,phone limits the sizes; AE_ONLY=fixed,interact runs only some parts (fixed, opening, hold, tour, interact, perf);
// both are used to calibrate the checks against deliberately broken copies.
// Parts: 1) five screen sizes x six fixed views (+ the failure cards flipped) in the light theme, 2) the same on desktop and phone in the dark theme,
// 3) the normal entry, first 30 seconds, desktop and phone (it waits on scene 1; nothing autoplays), 3b) 45 s of nobody touching it on a fake clock,
// 4) the autoplay tour on a fake clock after pressing the button, 5) real clicks, keys, reduced motion, 6) frame times during the loop replay.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'check-out', base = process.argv[3] || 'http://127.0.0.1:8971/index.html', origin = new URL(base).origin;
fs.mkdirSync(out, { recursive: true });
const ALL_SIZES = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  big: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  fold: { viewport: { width: 720, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const SIZES = Object.fromEntries(Object.entries(ALL_SIZES).filter(([k]) => !process.env.AE_SIZES || process.env.AE_SIZES.split(',').includes(k)));
const want = (part) => !process.env.AE_ONLY || process.env.AE_ONLY.split(',').includes(part);   // parts: fixed, opening, hold, tour, interact, perf
const report = { base, checks: [], runs: [] }; let failed = 0;
const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, detail }); if (!pass) failed++; console.log(pass ? 'ok  ' : 'FAIL', name, detail == null ? '' : JSON.stringify(detail).slice(0, 260)); };

// ---------- runs inside the page: what a visitor could not read, reach or see whole ----------
function inspectPage(expectW) {
  const vw = innerWidth;
  const visible = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rect = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const label = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '')) + ':' + (e.textContent || '').trim().slice(0, 18);
  const KEY = ['h1', '.sub', '.eyebrow', '#steps button', '#play', '.pager button', '.scene.on h2', '.scene.on .panel p', '.scene.on .hint', '.scene.on .layer', '.scene.on .who div',
    '.scene.on .bub', '.scene.on .stamp', '.scene.on .st', '.scene.on .center', '.scene.on .msg', '.scene.on .fc', '.scene.on .six div', '.scene.on .road',
    '.scene.on .node', '.scene.on .verdict .v', '.scene.on .retell', '.scene.on .world', 'footer h3', 'footer li', 'footer .note'];
  const els = [...new Set(KEY.flatMap((s) => [...document.querySelectorAll(s)]))].filter(visible);
  const problems = { overflow: [], clipped: [], offscreen: [], tiny: [], touch: [], overlap: [], outside: [] };
  for (const e of els) {
    const cs = getComputedStyle(e), r = rect(e);
    if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1) problems.overflow.push(label(e) + ' scrollW ' + e.scrollWidth + ' > ' + e.clientWidth);
    if (cs.overflowY !== 'visible' && e.clientHeight > 0 && e.scrollHeight > e.clientHeight + 1) problems.overflow.push(label(e) + ' scrollH ' + e.scrollHeight + ' > ' + e.clientHeight);
    for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const ac = getComputedStyle(a);
      if (/(hidden|clip|auto|scroll)/.test(ac.overflowX + ac.overflowY)) {
        const ar = rect(a);
        if (r.l < ar.l - 1.5 || r.r > ar.r + 1.5 || r.t < ar.t - 1.5 || r.b > ar.b + 1.5) problems.clipped.push(label(e) + ' sticks out of ' + label(a));
      }
    }
    if (r.l < -1 || r.r > vw + 1) problems.offscreen.push(label(e) + ' ' + Math.round(r.l) + '..' + Math.round(r.r) + ' of ' + vw);
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(cs.fontSize) < 11) problems.tiny.push(label(e) + ' ' + cs.fontSize);
    if (e.matches('.scene.on .panel p:not(.note)') && vw <= 560 && parseFloat(cs.fontSize) < 14) problems.tiny.push(label(e) + ' body text ' + cs.fontSize);
    if (e.matches('#steps button, #play, .pager button, .scene.on .fc') && (r.w < 36 || r.h < 36)) problems.touch.push(label(e) + ' ' + Math.round(r.w) + 'x' + Math.round(r.h));
  }
  // anything on the scene that scrolls or hides overflow sideways is text a visitor cannot see whole
  for (const e of document.querySelectorAll('.scene.on *')) {
    if (!visible(e)) continue;
    const ox = getComputedStyle(e).overflowX;
    if (/(auto|scroll|hidden|clip)/.test(ox) && e.scrollWidth > e.clientWidth + 1) problems.overflow.push('scrolls sideways: ' + label(e) + ' ' + e.scrollWidth + ' > ' + e.clientWidth);
  }
  // no two items of a group may cover each other
  const GROUPS = ['.scene.on .layer', '.scene.on .who div', '.scene.on .bub', '.scene.on .fc', '.scene.on .six div', '.scene.on .road', '.scene.on .node', '.scene.on .st, .scene.on .center'];
  for (const g of GROUPS) {
    const items = [...document.querySelectorAll(g)].filter(visible);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = rect(items[i]), b = rect(items[j]);
      if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1) problems.overlap.push(g + ': ' + label(items[i]) + ' x ' + label(items[j]));
    }
  }
  // ring stations and the centre label stay inside the ring box
  const ring = document.querySelector('.scene.on .ring');
  if (ring) { const rr = rect(ring); for (const e of ring.querySelectorAll('.st, .center')) { const r = rect(e); if (r.l < rr.l - 1 || r.r > rr.r + 1 || r.t < rr.t - 1 || r.b > rr.b + 1) problems.outside.push(label(e) + ' leaves the ring'); } }
  // rendered contrast: colour against the first opaque background behind it, opacity blended in
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const blend = (f, b, a) => ({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 });
  const bgOf = (e) => { for (let a = e; a; a = a.parentElement) { const c = parse(getComputedStyle(a).backgroundColor); if (c && c.a > 0.99) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const lows = [];
  const textEls = [...document.querySelectorAll('header *, .stepper *, .scene.on *, .pager *, footer *')].filter((e) => visible(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  for (const e of textEls) {
    let op = 1; for (let a = e; a; a = a.parentElement) op *= parseFloat(getComputedStyle(a).opacity);
    const bg = bgOf(e), fg = parse(getComputedStyle(e).color); if (!fg) continue;
    const eff = blend(fg.a < 1 ? blend(fg, bg, fg.a) : fg, bg, op);
    const [x, y] = [L(eff), L(bg)].sort((p, q) => q - p), ratio = (x + 0.05) / (y + 0.05);
    if (ratio < 4.5) lows.push(label(e) + ' ' + ratio.toFixed(2));
  }
  const scene = document.querySelector('.scene.on'), sr = rect(scene);
  return {
    problems, lows, vw, expectW, docW: document.documentElement.scrollWidth, layoutW: document.documentElement.clientWidth,
    scene: { w: Math.round(sr.w), h: Math.round(sr.h), chars: scene.innerText.replace(/\s+/g, '').length, title: scene.dataset.title },
    counts: {
      layer: document.querySelectorAll('.scene.on .layer').length, layerOn: [...document.querySelectorAll('.scene.on .layer')].filter((e) => +getComputedStyle(e).opacity > 0.99).length,
      who: document.querySelectorAll('.scene.on .who div').length,
      bub: [...document.querySelectorAll('.scene.on .bub')].filter((e) => visible(e) && +getComputedStyle(e).opacity > 0.99).length,
      stamp: [...document.querySelectorAll('.scene.on .stamp')].filter((e) => +getComputedStyle(e).opacity > 0.99).length,
      st: document.querySelectorAll('.scene.on .st').length, msgs: [...document.querySelectorAll('.scene.on .msg')].filter(visible).length,
      cards: document.querySelectorAll('.scene.on .fc').length, flipped: [...document.querySelectorAll('.scene.on .fc.flip')].filter((c) => visible(c.querySelector('.fix'))).length,
      live: [...document.querySelectorAll('.scene.on .fc.flip .live code')].filter((e) => visible(e) && e.textContent.trim().length > 8).length,
      six: document.querySelectorAll('.scene.on .six div').length, roads: document.querySelectorAll('.scene.on .road').length, pick: document.querySelector('.scene.on .road.pick') ? [...document.querySelectorAll('.scene.on .road')].indexOf(document.querySelector('.scene.on .road.pick')) : -1,
      verdicts: [...document.querySelectorAll('.scene.on .verdict .v')].filter(visible).length, retell: [...document.querySelectorAll('.scene.on .retell')].filter(visible).length,
      lit: document.querySelectorAll('.scene.on #lifeflow .node.lit').length,
    },
    ringBox: document.querySelector('.ringbox') ? Math.round(document.querySelector('.ringbox').getBoundingClientRect().width) : 0,
    whoRows: (() => { const tops = {}; for (const e of document.querySelectorAll('.scene.on .who div')) { const k = Math.round(e.getBoundingClientRect().top); tops[k] = (tops[k] || 0) + 1; } return Object.values(tops); })(),
    texts: { phase: (document.getElementById('phase') || {}).textContent, lastMsg: [...document.querySelectorAll('.scene.on .msg')].filter(visible).pop()?.textContent || '', world: (document.getElementById('world') || {}).innerText || '', ring: ring ? getComputedStyle(ring).display : null },
  };
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); report.browser = browser.version();
  async function open(query, size, opt = {}) {
    const ctx = await browser.newContext(Object.assign({}, SIZES[size], opt.dark ? { colorScheme: 'dark' } : { colorScheme: 'light' }, opt.reduced ? { reducedMotion: 'reduce' } : {}));
    if (opt.perf) await ctx.addInitScript(() => {
      window.__perf = { long: [], frames: [] };
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__perf.long.push({ start: e.startTime, dur: e.duration }))).observe({ type: 'longtask', buffered: true }); } catch (e) { /* not supported */ }
      let last = 0; const loop = (t) => { if (last) window.__perf.frames.push(t - last); last = t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    });
    const page = await ctx.newPage(), errors = [], external = [];
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith('data:')) external.push(u); });
    if (opt.clock) await page.clock.install();
    const t0 = Date.now();
    await page.goto(base + query);
    await page.waitForFunction(() => window.__agentEngine && window.__agentEngine.ready, null, { polling: 50, timeout: 20000 });
    return { ctx, page, errors, external, readyMs: Date.now() - t0 };
  }
  const state = (page) => page.evaluate(() => window.__agentEngine.state());
  const shot = (page, name, full) => page.screenshot({ path: path.join(out, name), fullPage: !!full, scale: 'css' });

  // what each fixed view must show once settled
  const SUBJECT = {
    1: (r, st) => r.counts.layer === 3 && r.counts.layerOn === 3 && r.counts.who === 4,
    2: (r, st) => r.counts.bub === 3 && r.counts.stamp === 1 && st.chat.shown === 3,
    3: (r, st) => r.counts.st === 6 && r.counts.msgs === 7 && st.loop.turn === 3 && st.loop.done && /停/.test(r.texts.phase) && /一共 31 个目录/.test(r.texts.lastMsg),
    4: (r, st) => r.counts.cards === 8 && r.counts.six === 6,
    5: (r, st) => r.counts.roads === 3 && r.counts.pick === 0,
    6: (r, st) => r.counts.verdicts === 3 && r.counts.retell === 1 && r.counts.lit === 4 && st.life.updated && /余额: 782/.test(r.texts.world),
  };
  async function fixedView(size, n, tag, query, opt) {
    const { ctx, page, errors, external, readyMs } = await open(query || '?view=' + n, size, opt);
    await page.waitForTimeout(250);
    const st = await state(page), r = await page.evaluate(inspectPage, SIZES[size].viewport.width);
    const file = (opt && opt.dark ? 'dark-' : '') + size + '-v' + n + (tag || '') + '.png';
    await shot(page, file, true);
    report.runs.push({ size, view: n, query, dark: !!(opt && opt.dark), file, state: st, scene: r.scene, counts: r.counts, readyMs });
    const name = (opt && opt.dark ? 'dark ' : '') + size + ' view ' + n + (tag || '');
    check(`${name}: no page errors`, errors.length === 0, errors);
    check(`${name}: no external requests`, external.length === 0, external);
    check(`${name}: frozen on scene ${n}, settled`, st.view === n && st.mode === 'frozen' && st.settled && !st.playing, { view: st.view, mode: st.mode, settled: st.settled });
    check(`${name}: scene is non-empty`, r.scene.w >= Math.min(280, r.vw - 40) && r.scene.h >= 200 && r.scene.chars >= 80, r.scene);
    check(`${name}: layout width is the device width (a page without a viewport meta lays out 980 px wide), no sideways scroll`, r.vw === r.expectW && r.layoutW === r.vw && r.docW <= r.vw + 1, { expect: r.expectW, vw: r.vw, layoutW: r.layoutW, docW: r.docW });
    check(`${name}: key text does not overflow its box`, r.problems.overflow.length === 0, r.problems.overflow.slice(0, 4));
    check(`${name}: key text is not clipped by a container`, r.problems.clipped.length === 0, r.problems.clipped.slice(0, 4));
    check(`${name}: key text is on screen sideways`, r.problems.offscreen.length === 0, r.problems.offscreen.slice(0, 4));
    check(`${name}: items of a group do not overlap, ring stays inside its box`, r.problems.overlap.length === 0 && r.problems.outside.length === 0, r.problems.overlap.concat(r.problems.outside).slice(0, 4));
    check(`${name}: font sizes (>= 11, phone body >= 14)`, r.problems.tiny.length === 0, r.problems.tiny.slice(0, 4));
    check(`${name}: touch targets >= 36 px`, r.problems.touch.length === 0, r.problems.touch.slice(0, 4));
    check(`${name}: rendered text contrast >= 4.5`, r.lows.length === 0, r.lows.slice(0, 5));
    if (!query) check(`${name}: subject is what the spec says`, SUBJECT[n](r, st), { counts: r.counts, loop: st.loop, life: st.life, texts: r.texts });
    if (!query && n === 1) check(`${name}: the four "who is where" cards form even rows (no lone card on the last row)`, r.whoRows.length > 0 && r.whoRows.every((c) => c === r.whoRows[0]) && r.whoRows.reduce((a, b) => a + b, 0) === 4, r.whoRows);
    if (!query && n === 3) check(`${name}: ring layout follows its container (box ${r.ringBox} px: ${r.ringBox >= 420 ? 'ring' : 'list'})`, (r.ringBox >= 420) === (r.texts.ring === 'block'), { ringBox: r.ringBox, display: r.texts.ring });
    await ctx.close();
    return { st, r };
  }

  if (want('fixed')) {
  // 1 + 2. fixed views, five sizes, light theme; dark on desktop and phone
  for (const size of Object.keys(SIZES)) {
    for (let n = 1; n <= 6; n++) await fixedView(size, n);
    const { st, r } = await fixedView(size, 4, '-flipped', '?view=4&flip=all');
    check(`${size} view 4 flipped: all eight backs show a live line`, st.cards.flipped.length === 8 && r.counts.flipped === 8 && r.counts.live === 8, { flipped: st.cards.flipped, counts: r.counts });
  }
  for (const size of ['desktop', 'phone'].filter((k) => SIZES[k])) {
    for (let n = 1; n <= 6; n++) await fixedView(size, n, '', undefined, { dark: true });
    await fixedView(size, 4, '-flipped', '?view=4&flip=all', { dark: true });
  }
  }

  if (want('opening')) {
  // 3. normal entry, first 30 seconds, as a visitor sees it
  for (const size of ['desktop', 'phone']) {
    const { ctx, page, errors, external, readyMs } = await open('', size);
    const marks = [0.5, 1.5, 2, 4, 6, 8, 12, 20, 30], frames = [], startAt = Date.now();
    for (const m of marks) {
      const wait = startAt + m * 1000 - Date.now(); if (wait > 0) await page.waitForTimeout(wait);
      const st = await state(page), r = await page.evaluate(() => ({ on: [...document.querySelectorAll('.scene.on .layer')].filter((e) => +getComputedStyle(e).opacity > 0.99).length, bar: document.getElementById('barfill').getBoundingClientRect().width, label: document.getElementById('play').textContent }));
      await shot(page, `open-${size}-${String(m).padStart(4, '0')}s.png`);
      frames.push({ at: m, view: st.view, mode: st.mode, playing: st.playing, layersShown: r.on, bar: Math.round(r.bar), label: r.label });
    }
    report.runs.push({ size, opening: frames, readyMs });
    check(`${size} opening: waits on scene 1 for the whole 30 s, manual mode, not playing, button says autoplay, progress bar empty`, frames.every((f) => f.view === 1 && f.mode === 'manual' && !f.playing && f.label === '自动播放' && f.bar === 0), frames.map((f) => [f.at, f.view, f.mode, f.playing, f.label, f.bar]));
    check(`${size} opening: the three layer cards come in one after another (not all there at 0.5 s) and are all in by 2 s`, frames.find((f) => f.at === 0.5).layersShown < 3 && frames.find((f) => f.at === 2).layersShown === 3, frames.map((f) => [f.at, f.layersShown]));
    check(`${size} opening: no page errors, no outside requests`, errors.length === 0 && external.length === 0, { errors, external });
    check(`${size} opening: ready within 1.5 s`, readyMs <= 1500, { readyMs });
    await ctx.close();
  }
  }

  if (want('hold')) {
  // 3b. nobody touches the page for 45 seconds on a fake clock: it must still be on scene 1, not playing, button still says "autoplay"
  for (const size of ['desktop', 'phone']) {
    const { ctx, page, errors } = await open('', size, { clock: true });
    const now = await page.evaluate(() => Date.now()); await page.clock.pauseAt(now + 50);
    for (let t = 0; t < 45000; t += 500) await page.clock.runFor(500);
    await page.waitForTimeout(400);
    const st = await state(page), label = await page.textContent('#play'), bar = await page.evaluate(() => Math.round(document.getElementById('barfill').getBoundingClientRect().width));
    await shot(page, `hold-${size}-45s.png`);
    report.runs.push({ size, hold: { view: st.view, mode: st.mode, playing: st.playing, label, layers: st.layers, bar } });
    check(`${size} hold: after 45 s of nobody touching it the page is still on scene 1, not playing, button says autoplay, progress bar empty`, st.view === 1 && !st.playing && st.mode === 'manual' && label === '自动播放' && st.layers.shown === 3 && bar === 0, { view: st.view, mode: st.mode, playing: st.playing, label, layers: st.layers, bar });
    check(`${size} hold: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }
  }

  if (want('tour')) {
  // 4. the autoplay tour on a fake clock, started with the button: every scene stays for its planned dwell, then the next one starts
  for (const size of ['desktop', 'phone']) {
    const { ctx, page, errors } = await open('', size, { clock: true });
    await (size === 'phone' ? page.tap('#play') : page.click('#play'));      // autoplay starts only when asked for
    const started = await state(page);
    const now = await page.evaluate(() => Date.now()); await page.clock.pauseAt(now + 50);
    const tour = [], ANIM = [1400, 3700, 300 + 15 * 700, 600, 600, 6300];
    for (let i = 1; i <= 6; i++) {
      const st0 = await state(page); if (st0.view !== i) break;
      const dwell = st0.dwell[i - 1]; let t = 0, midShot = false, endShot = false, mid = null, cur = st0;
      while (cur.view === i && cur.mode === 'auto' && t < dwell + 3000) {
        await page.clock.runFor(250); t += 250;
        if (!midShot && t >= ANIM[i - 1] * 0.45) { midShot = true; await page.waitForTimeout(450); mid = await state(page); await shot(page, `tour-${size}-s${i}-mid.png`, true); }
        if (!endShot && t >= ANIM[i - 1] + 600) { endShot = true; await page.waitForTimeout(450); await shot(page, `tour-${size}-s${i}-settled.png`, true); }
        cur = await state(page);
      }
      tour.push({ scene: i, dwell, leftAfter: t, midChat: mid.chat.shown, midLoop: mid.loop.messages, midLife: mid.life.verdicts, next: cur.view, mode: cur.mode, playing: cur.playing });
    }
    report.runs.push({ size, tour });
    check(`${size} tour: pressing the button starts autoplay from scene 1 (mode auto, button offers a pause)`, started.mode === 'auto' && started.playing && started.view === 1, { mode: started.mode, playing: started.playing, view: started.view });
    check(`${size} tour: scenes follow 1..6 in order`, tour.length === 6 && tour.every((t, k) => (k < 5 ? t.next === k + 2 : t.next === 6)), tour.map((t) => [t.scene, t.next]));
    check(`${size} tour: each scene stays for its planned dwell (first scene started a moment before the clock was paused)`, tour.every((t) => t.leftAfter >= t.dwell - 1500 && t.leftAfter <= t.dwell + 300), tour.map((t) => [t.scene, t.dwell, t.leftAfter]));
    check(`${size} tour: dwells come from the real text, each 12-40 s, together 90-240 s`, tour.every((t) => t.dwell >= 12000 && t.dwell <= 40000) && tour.reduce((a, t) => a + t.dwell, 0) / 1000 >= 90 && tour.reduce((a, t) => a + t.dwell, 0) / 1000 <= 240, tour.map((t) => t.dwell));
    check(`${size} tour: mid-animation frames are partial (chat, loop and verdicts fill in gradually)`, tour.length === 6 && tour[1].midChat >= 1 && tour[1].midChat <= 3 && tour[2].midLoop >= 1 && tour[2].midLoop < 7 && tour[5].midLife >= 1 && tour[5].midLife < 3, tour.length === 6 ? { chat: tour[1].midChat, loop: tour[2].midLoop, life: tour[5].midLife } : tour);
    check(`${size} tour: after scene 6 autoplay ends and offers a replay`, tour.length === 6 && tour[5].mode === 'ended' && !tour[5].playing && (await page.textContent('#play')) === '重新播放', tour[5]);
    check(`${size} tour: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }
  }

  if (want('interact')) {
  // 5. real clicks, keys and the real-time loop replay
  for (const size of ['desktop', 'phone']) {
    const { ctx, page, errors } = await open('', size);
    const tap = size === 'phone' ? (sel) => page.tap(sel) : (sel) => page.click(sel);
    await tap('#next'); await page.waitForTimeout(100);
    let st = await state(page);
    check(`${size} click: "next" moves to scene 2 and the page stays in manual mode`, st.view === 2 && st.mode === 'manual' && !st.playing, { view: st.view, mode: st.mode });
    await tap('#steps button:nth-child(3)');
    const seen = [];
    for (let k = 0; k < 14; k++) { const s = await state(page); seen.push([Math.round(k * 0.9 * 10) / 10, s.loop.turn, s.loop.messages]); await page.waitForTimeout(900); }
    const done = await state(page);
    check(`${size} click: the loop replays in real time and ends on turn 3 with 7 messages`, done.loop.turn === 3 && done.loop.messages === 7 && done.loop.done && seen[1][2] < 7, seen);
    check(`${size} click: turn and message count only go up while it plays`, seen.every((s, i) => i === 0 || (s[1] >= seen[i - 1][1] && s[2] >= seen[i - 1][2])), seen);
    await tap('#steps button:nth-child(4)'); await page.waitForTimeout(700);
    await tap('.scene.on .fc:nth-child(1)');
    st = await state(page);
    check(`${size} click: tapping a failure card flips it`, st.cards.flipped.join() === '1', st.cards);
    await page.focus('.scene.on .fc:nth-child(2)'); await page.keyboard.press('Enter');
    st = await state(page);
    check(`${size} keys: Enter on a focused card flips it`, st.cards.flipped.join() === '1,2', st.cards);
    await page.keyboard.press('Enter'); await tap('.scene.on .fc:nth-child(1)');
    st = await state(page);
    check(`${size} keys/click: cards flip back`, st.cards.flipped.length === 0, st.cards);
    await page.mouse.click(5, 5); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
    check(`${size} keys: ArrowRight goes to scene 5`, (await state(page)).view === 5);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100);
    check(`${size} keys: ArrowLeft twice goes back to scene 3`, (await state(page)).view === 3);
    await tap('#play'); await page.waitForTimeout(150);
    st = await state(page);
    check(`${size} click: the play button restarts autoplay from the current scene`, st.mode === 'auto' && st.playing && st.view === 3 && (await page.textContent('#play')) === '暂停播放', { mode: st.mode, view: st.view });
    await tap('#play'); st = await state(page);
    check(`${size} click: pressing it again pauses`, st.mode === 'manual' && !st.playing && (await page.textContent('#play')) === '自动播放');
    check(`${size} click: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }
  // 5b. autoplay hands over when the visitor does anything, and a new scene opens at its top
  for (const size of ['desktop', 'phone']) {
    const tap = size === 'phone' ? (sel) => page.tap(sel) : (sel) => page.click(sel);
    var page;
    {
      const o = await open('', size); page = o.page;
      const idle = await state(page);
      await tap('#play'); await page.waitForTimeout(700);
      const was = await state(page);
      await tap('.scene.on .layer');
      const st = await state(page);
      check(`${size} autoplay: the button starts it from the idle entry`, idle.mode === 'manual' && !idle.playing && was.playing && was.mode === 'auto' && was.view === 1, { idle: idle.mode, was: was.mode, view: was.view });
      check(`${size} autoplay: a tap on plain content hands over`, was.playing && was.mode === 'auto' && st.mode === 'manual' && !st.playing, { was: was.mode, now: st.mode });
      await o.ctx.close();
    }
    {
      const o = await open('', size); page = o.page;
      await tap('#steps button:nth-child(4)'); await page.waitForTimeout(500);
      await tap('#play'); await page.waitForTimeout(200);
      const running = await state(page);
      await tap('.scene.on .fc:nth-child(3)');
      const st = await state(page);
      check(`${size} autoplay: flipping a failure card while autoplay runs stops it, and the card stays flipped`, running.playing && running.view === 4 && st.cards.flipped.join() === '3' && st.mode === 'manual' && !st.playing, { running: running.playing, view: st.view, mode: st.mode, cards: st.cards });
      await o.ctx.close();
    }
    if (size === 'desktop') {
      const o = await open('', size); page = o.page;
      await page.click('#play'); await page.waitForTimeout(500);
      const was = await state(page);
      await page.mouse.move(600, 400); await page.mouse.wheel(0, 60); await page.waitForTimeout(100);
      const st = await state(page);
      check(`${size} autoplay: scrolling with the wheel hands over`, was.playing && st.mode === 'manual' && !st.playing, { was: was.mode, mode: st.mode });
      await o.ctx.close();
    }
    {
      const o = await open('?view=4', size); page = o.page;
      await page.evaluate(() => window.scrollTo(0, 1e5)); await page.waitForTimeout(200);
      const y0 = await page.evaluate(() => window.scrollY);
      await tap('#next'); await page.waitForTimeout(1200);
      const r = await page.evaluate(() => ({ top: document.querySelector('.stepper').getBoundingClientRect().top, y: window.scrollY, view: window.__agentEngine.state().view }));
      check(`${size} pager: "next" from the bottom of a long scene shows the top of the next one`, r.view === 5 && r.top >= -1 && r.top <= 120 && y0 > 200, { y0, ...r });
      await o.ctx.close();
    }
  }
  {
    const { ctx, page, errors } = await open('', 'desktop', { reduced: true });
    await page.waitForTimeout(3000);
    const st = await state(page), r = await page.evaluate(inspectPage, SIZES.desktop.viewport.width);
    check('reduced motion: shows scene 1 settled and does not autoplay', st.mode === 'reduced' && !st.playing && st.view === 1 && r.counts.layerOn === 3, { mode: st.mode, counts: r.counts });
    await page.click('#next'); await page.click('#next'); await page.waitForTimeout(100);
    const s3 = await state(page);
    check('reduced motion: scene 3 jumps straight to its final state', s3.view === 3 && s3.loop.done && s3.loop.messages === 7, s3.loop);
    check('reduced motion: no page errors', errors.length === 0, errors);
    await ctx.close();
  }
  }

  if (want('perf')) {
  // 6. frame times and long tasks during 9 seconds of the loop replay (scene 3, the busiest animation), started by a real click or tap
  for (const size of ['desktop', 'phone']) {
    const { ctx, page, readyMs } = await open('', size, { perf: true });
    await (size === 'phone' ? page.tap('#steps button:nth-child(3)') : page.click('#steps button:nth-child(3)'));
    await page.waitForTimeout(9000);
    const replay = await state(page);
    const p = await page.evaluate(() => ({ long: window.__perf.long.filter((l) => l.start > 0).map((l) => Math.round(l.dur)), frames: window.__perf.frames.slice() }));
    const f = p.frames.slice().sort((a, b) => a - b), med = f[Math.floor(f.length / 2)], p95 = f[Math.floor(f.length * 0.95)];
    report.runs.push({ size, perf: { readyMs, frames: f.length, medianMs: +med.toFixed(1), p95Ms: +p95.toFixed(1), longTasks: p.long } });
    check(`${size} perf: ready within 1.5 s (${readyMs} ms)`, readyMs <= 1500, { readyMs });
    check(`${size} perf: the loop replay was running (scene 3, messages ${replay.loop.messages} of 7)`, replay.view === 3 && replay.loop.messages >= 5, replay.loop);
    check(`${size} perf: no long task (> 50 ms) in 9 s of loop replay`, p.long.length === 0, p.long);
    check(`${size} perf: median frame interval <= 17 ms over ${f.length} frames (median ${med.toFixed(1)}, p95 ${p95.toFixed(1)})`, med <= 17, { med, p95 });
    await ctx.close();
  }
  }

  await browser.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(failed ? `${failed} check(s) failed of ${report.checks.length}` : `all ${report.checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
