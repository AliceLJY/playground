// Browser acceptance for 手写板书 (SPEC §7 items 1, 2, 4-9), run by hand, not part of CI.  Adapted from dispatch-replay/tools/browser-check.cjs.
// Needs an existing Playwright install and Google Chrome; this repository installs neither.
//   python3 -m http.server 8973 --bind 127.0.0.1          (inside handwritten-board/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [base-url]
// Writes screenshots, the opening-30-seconds frames and report.json into <output-dir>; exits 1 when any check fails.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const C = require('../src/core.js'), PAGES = require('../src/pages.js');
const out = process.argv[2] || 'check-out', base = process.argv[3] || 'http://127.0.0.1:8973/index.html', origin = new URL(base).origin;
fs.mkdirSync(out, { recursive: true });

const SIZES = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  big: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  fold: { viewport: { width: 720, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
// SPEC §5: which board shape each screen gets (the one whose writing comes out larger on that screen)
const EXPECT_LAYOUT = { desktop: 'landscape', big: 'landscape', phone: 'portrait', landscape: 'landscape', fold: 'portrait' };
// SPEC §7 thresholds
const MIN_BODY_PX = 15, MIN_TITLE_PX = 20;     // item 5: on-screen size of the writing
const MIN_TOUCH_PX = 40;                       // item 6: height of a control on a touch screen
const TOL = 1.5;                               // px of slack for "inside the frame"
const WIRE_BUDGET = 400 * 1024;                // item 9: bytes fetched on load
const READY_MS = 1500;                         // item 9: page ready on a local server
const BUSY_MS = 4;                             // item 9: main-thread work per frame while it plays
const WRITING = PAGES.flatMap((p) => [p.title, ...p.lines.map((l) => l.text)]).map((t) => C.displayText(t));

const report = { base, checks: [], runs: [] }; let failed = 0;
const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, detail }); if (!pass) failed++; console.log(pass ? 'ok  ' : 'FAIL', name, detail == null ? '' : JSON.stringify(detail).slice(0, 260)); };
const overlap = (a, b, pad = 0) => a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;
const inside = (inner, outer, tol) => inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const QUICK = !!process.env.HB_QUICK;   // HB_QUICK=1: only the fixed views, on desktop and phone (for trying a change, or a deliberately broken copy)

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); report.browser = browser.version();
  const decoderCtx = await browser.newContext(), decoder = await decoderCtx.newPage();   // a blank page to read PNG pixels with

  async function open(query, size) {
    const ctx = await browser.newContext(SIZES[size]), page = await ctx.newPage(), errors = [], external = [], requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));
    page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    page.on('request', (r) => { const u = r.url(); if (u.startsWith('data:')) return; requests.push(u.replace(origin, '')); if (!u.startsWith(origin)) external.push(u); });
    await page.goto(base + query);
    await page.waitForFunction(() => window.__handBoard && window.__handBoard.ready, null, { polling: 100, timeout: 20000 });
    return { ctx, page, errors, external, requests };
  }
  const state = (page) => page.evaluate(() => window.__handBoard.state());

  // Fonts the browser really used to draw the characters matching a selector: { 'Family|custom': glyphCount }
  async function platformFonts(ctx, page, selector) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
    const agg = {};
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      for (const f of fonts) { const k = f.familyName + '|' + (f.isCustomFont ? 'custom' : 'system'); agg[k] = (agg[k] || 0) + f.glyphCount; }
    }
    await cdp.detach();
    return { agg, nodes: nodeIds.length };
  }

  // geometry of everything the checks compare, in viewport px
  const measure = (page) => page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    const visible = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.5; };
    const doc = document.documentElement, frame = document.getElementById('frame');
    const curPage = [...document.querySelectorAll('.page')].find(visible) || null;
    const body = document.querySelector('.line.body'), title = document.querySelector('.line.title');
    const scale = window.__handBoard.state().stage.scale;
    const chars = curPage ? [...curPage.querySelectorAll('.ch')].map((el) => ({ text: el.textContent, rect: r(el) })) : [];
    return {
      innerWidth: window.innerWidth, innerHeight: window.innerHeight, compat: document.compatMode,
      scrollW: doc.scrollWidth, scrollH: doc.scrollHeight, docW: doc.clientWidth, docH: doc.clientHeight,
      frame: r(frame), chars, curPageIndex: curPage ? +curPage.dataset.page : null,
      doodles: [...document.querySelectorAll('#doodles path')].filter((p) => parseFloat(getComputedStyle(p).opacity) > 0.5 && (!curPage || +p.dataset.page === +curPage.dataset.page))
        .map((p) => ({ rect: r(p), drawn: 1 - parseFloat(p.style.strokeDashoffset) / parseFloat(p.style.strokeDasharray) })),
      bodyPx: parseFloat(getComputedStyle(body).fontSize) * scale, titlePx: parseFloat(getComputedStyle(title).fontSize) * scale,
      controls: [...document.querySelectorAll('.bar button, .bar select, .bar label, .bar .prog')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => ({ id: el.id || el.className || el.tagName, ...r(el) })),
      bar: r(document.querySelector('.bar')), head: (() => { const h = document.querySelector('.head'); return h && getComputedStyle(h).display !== 'none' ? r(h) : null; })(),
      hand: r(document.getElementById('hand')),
      fonts: [...document.fonts].map((f) => ({ family: f.family, status: f.status })),
      fontCheck: document.fonts.check('46px "Long Cang"', '手写板书'),
      lineText: [...document.querySelectorAll('.line')].map((el) => [...el.querySelectorAll('.ch')].map((c) => c.textContent).join('')),
      resources: performance.getEntriesByType('resource').map((e) => ({ name: e.name.replace(location.origin, ''), bytes: e.transferSize || e.encodedBodySize })),
    };
  });

  // dark writing pixels and red doodle pixels in the frame, with the hand hidden so it does not count as ink
  async function ink(page) {
    await page.evaluate(() => { document.getElementById('hand').style.visibility = 'hidden'; });
    const png = await page.locator('#frame').screenshot();
    await page.evaluate(() => { document.getElementById('hand').style.visibility = ''; });
    return decoder.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let text = 0, marker = 0; const n = c.width * c.height;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (Math.max(r, gg, b) < 90) text++; else if (r > 170 && gg < 120 && b < 100) marker++;
      }
      return { text: text / n, marker: marker / n, w: c.width, h: c.height };
    }, png.toString('base64'));
  }

  // ===== 1. three fixed views on five screen shapes (items 1, 2, 4, 5, 6) =====
  const seen = {};     // view -> size -> marks, to compare across sizes
  const inkBy = {};
  const SIZE_LIST = QUICK ? ['desktop', 'phone'] : Object.keys(SIZES);
  for (const size of SIZE_LIST) for (const view of ['page1', 'page2', 'mid']) {
    const tag = `${size} ${view}`;
    const { ctx, page, errors, external, requests } = await open(`?view=${view}`, size);
    await page.waitForTimeout(300);
    const st = await state(page), m = await measure(page), im = await ink(page);
    await page.screenshot({ path: path.join(out, `${size}-${view}.png`) });
    const fontsUsed = await platformFonts(ctx, page, '.ch:not(.lat)'), latFonts = await platformFonts(ctx, page, '.ch.lat');
    report.runs.push({ size, view, state: st, ink: im, fontsUsed, latFonts, requests, metrics: { frame: m.frame, bodyPx: m.bodyPx, titlePx: m.titlePx, controls: m.controls } });
    (seen[view] = seen[view] || {})[size] = st.marks; (inkBy[size] = inkBy[size] || {})[view] = im;

    check(`${tag}: no page errors or warnings`, errors.length === 0, errors);
    check(`${tag}: no external requests`, external.length === 0, external);
    check(`${tag}: only the release files were requested`, requests.every((u) => /^\/(index\.html)?(\?.*)?$/.test(u) || /^\/(src\/[\w-]+\.js|vendor\/(gsap\.min\.js|LongCang-Regular\.subset\.woff2))$/.test(u.split('?')[0])), requests);
    check(`${tag}: standards mode`, m.compat === 'CSS1Compat', m.compat);
    check(`${tag}: layout viewport is the device width`, m.innerWidth === SIZES[size].viewport.width, { innerWidth: m.innerWidth, want: SIZES[size].viewport.width });
    check(`${tag}: page needs no scrolling`, m.scrollW <= m.docW + 1 && m.scrollH <= m.docH + 1, { scroll: [m.scrollW, m.scrollH], client: [m.docW, m.docH] });
    check(`${tag}: board shape is ${EXPECT_LAYOUT[size]}`, st.layout === EXPECT_LAYOUT[size], st.layout);
    // the page's own frame is what the Node-tested rule gives for the free box the page measured
    const rule = C.chooseLayout(st.box.w, st.box.h);
    check(`${tag}: frame ${Math.round(m.frame.w)}x${Math.round(m.frame.h)} is what the layout rule gives for the ${Math.round(st.box.w)}x${Math.round(st.box.h)} box`, rule.layout.name === st.layout && Math.abs(rule.w - m.frame.w) < 1 && Math.abs(rule.h - m.frame.h) < 1, { rule: [rule.layout.name, rule.w, rule.h], page: [st.layout, m.frame.w, m.frame.h] });

    // item 2: the font file loaded and the browser drew the writing with it
    const lc = m.fonts.filter((f) => /Long Cang/.test(f.family));
    check(`${tag}: Long Cang font face is loaded`, lc.length === 1 && lc[0].status === 'loaded' && m.fontCheck, lc);
    const keys = Object.keys(fontsUsed.agg);
    check(`${tag}: every non-Latin character is drawn with the bundled Long Cang`, keys.length === 1 && keys[0] === 'Long Cang|custom', fontsUsed.agg);
    const glyphs = Object.values(fontsUsed.agg).reduce((a, b) => a + b, 0), want = m.lineText.join('').replace(/[A-Za-z0-9]/g, '').length;
    check(`${tag}: Long Cang drew all ${want} of them (no glyph left to a fallback)`, glyphs === want, { glyphs, want });

    // the writing on the page is the writing in the data, character for character
    check(`${tag}: page text equals the data text`, JSON.stringify(m.lineText) === JSON.stringify(WRITING), { got: m.lineText.slice(0, 2), want: WRITING.slice(0, 2) });

    // item 4: the view lands on the same moment and the same picture everywhere
    const L = st.lines, byPage = (p) => L.filter((l) => l.page === p);
    const frac = (l) => l.revealed / l.chars;
    if (view === 'page1') {
      check(`${tag}: page 1 completely written and circled`, byPage(0).every((l) => frac(l) > 0.999) && st.doodles.filter((d) => d.page === 0).every((d) => d.drawn > 0.999) && st.doodles.filter((d) => d.page === 0).length === 4, { page1: byPage(0).map(frac), doodles: st.doodles.filter((d) => d.page === 0).map((d) => +d.drawn.toFixed(3)) });
      check(`${tag}: page 2 not started`, byPage(1).every((l) => frac(l) < 0.001) && st.pageLabel === '1 / 2', { page2: byPage(1).map(frac), label: st.pageLabel });
    }
    if (view === 'page2') {
      check(`${tag}: page 2 completely written and circled`, byPage(1).every((l) => frac(l) > 0.999) && st.doodles.filter((d) => d.page === 1).length === 3 && st.doodles.filter((d) => d.page === 1).every((d) => d.drawn > 0.999), { page2: byPage(1).map(frac) });
      check(`${tag}: label says 2 / 2 and page 1 has turned away`, st.pageLabel === '2 / 2' && m.curPageIndex === 1, { label: st.pageLabel, page: m.curPageIndex });
    }
    if (view !== 'mid') check(`${tag}: the hand has lifted off, so nothing covers the finished page`, st.hand.alpha < 0.05, st.hand);
    if (view === 'mid') {
      const p1 = byPage(0);
      check(`${tag}: title and first two lines done, third line half written, fourth untouched`, frac(p1[0]) > 0.999 && frac(p1[1]) > 0.999 && frac(p1[2]) > 0.999 && frac(p1[3]) > 0.3 && frac(p1[3]) < 0.7 && frac(p1[4]) < 0.001, p1.map(frac));
      check(`${tag}: pen is on the board while it writes`, st.hand.alpha > 0.9, st.hand);
    }
    check(`${tag}: paused on the fixed moment`, st.paused && Math.abs(st.time - ({ page1: st.marks.pageDone[0], page2: st.marks.pageDone[1], mid: st.marks.mid }[view])) < 0.01, { time: st.time });

    // item 5: everything on the board is inside the frame and big enough to read
    check(`${tag}: frame is fully on screen`, inside(m.frame, { x: 0, y: 0, w: m.innerWidth, h: m.innerHeight }, 0.5), m.frame);
    const out1 = m.chars.filter((c) => !inside(c.rect, m.frame, TOL));
    check(`${tag}: all ${m.chars.length} characters of the visible page are inside the frame`, m.chars.length > 20 && out1.length === 0, out1.slice(0, 3));
    const out2 = m.doodles.filter((d) => !inside(d.rect, m.frame, TOL + 3));
    check(`${tag}: ${m.doodles.length} doodles are inside the frame`, m.doodles.length > 0 && out2.length === 0, out2.slice(0, 3));
    check(`${tag}: body text on screen is at least ${MIN_BODY_PX}px and title at least ${MIN_TITLE_PX}px`, m.bodyPx >= MIN_BODY_PX && m.titlePx >= MIN_TITLE_PX, { body: +m.bodyPx.toFixed(1), title: +m.titlePx.toFixed(1) });

    // item 6: controls do not cover the board and do not cover each other
    const bad = [];
    for (const c of m.controls) {
      if (!inside(c, { x: 0, y: 0, w: m.innerWidth, h: m.innerHeight }, 0.5)) bad.push(['off screen', c.id]);
      if (overlap(c, m.frame, 0.5)) bad.push(['covers the board', c.id]);
      if (SIZES[size].hasTouch && c.id !== 'prog' && !/prog/.test(c.id) && c.h < MIN_TOUCH_PX - 0.5) bad.push([`only ${c.h.toFixed(0)}px tall`, c.id]);
    }
    for (let i = 0; i < m.controls.length; i++) for (let j = i + 1; j < m.controls.length; j++) if (overlap(m.controls[i], m.controls[j], 1)) bad.push(['overlaps', m.controls[i].id + ' / ' + m.controls[j].id]);
    check(`${tag}: ${m.controls.length} controls on screen, apart, clear of the board${SIZES[size].hasTouch ? ', touch-sized' : ''}`, m.controls.length >= 6 && bad.length === 0, bad);
    if (m.head) check(`${tag}: header line clear of the board`, !overlap(m.head, m.frame, 0.5), m.head);

    // item 5/6: there is really ink on the board (writing + red doodles), and the three views differ the way they should
    check(`${tag}: board has writing ink`, im.text > (view === 'mid' ? 0.004 : 0.008), { text: +im.text.toFixed(4), marker: +im.marker.toFixed(4) });
    check(`${tag}: board has red doodle ink`, im.marker > 0.0005, { marker: +im.marker.toFixed(5) });
    await ctx.close();
  }
  // the long-scroll variant of a fixed view: &mode=flow
  for (const size of SIZE_LIST) {
    const { ctx, page, errors } = await open('?view=page2&mode=flow', size), tag = `${size} page2&mode=flow`;
    await page.waitForTimeout(300);
    const st = await state(page), m = await measure(page);
    const lastRect = await page.evaluate(() => { const ls = [...document.querySelectorAll('.line')]; return [...ls[ls.length - 1].querySelectorAll('.ch')].map((c) => { const b = c.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }); });
    await page.screenshot({ path: path.join(out, `${size}-page2-flow.png`) });
    check(`${tag}: long-scroll mode, paused at the end of page 2, last line written and inside the frame`, st.mode === 'flow' && st.paused && st.lines[st.lines.length - 1].revealed > st.lines[st.lines.length - 1].chars - 0.01 && lastRect.every((c) => inside(c, m.frame, TOL)), { mode: st.mode, time: st.time });
    check(`${tag}: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }

  // same view, same moment on every screen; mid is partial next to page1
  for (const view of ['page1', 'page2', 'mid']) {
    const vals = Object.values(seen[view]), ref = vals[0];
    check(`${view}: same timeline moment on all five screens`, vals.every((v) => Math.abs((view === 'mid' ? v.mid : v.pageDone[view === 'page1' ? 0 : 1]) - (view === 'mid' ? ref.mid : ref.pageDone[view === 'page1' ? 0 : 1])) < 1e-6), seen[view]);
  }
  for (const size of SIZE_LIST) {
    const k = inkBy[size];
    check(`${size}: mid has less writing ink than page1, but more than a third of it`, k.mid.text < k.page1.text * 0.9 && k.mid.text > k.page1.text * 0.33, { page1: +k.page1.text.toFixed(4), mid: +k.mid.text.toFixed(4) });
  }

  if (QUICK) { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(failed ? `${failed} of ${report.checks.length} checks failed (quick)` : `all ${report.checks.length} checks passed (quick)`); process.exit(failed ? 1 : 0); }

  // ===== 2. controls from the normal entry, on every screen (item 7) =====
  for (const size of Object.keys(SIZES)) {
    const { ctx, page, errors } = await open('', size), touch = !!SIZES[size].hasTouch;
    const tapFrame = () => (touch ? page.locator('#frame').tap() : page.locator('#frame').click());
    const timeOf = async () => (await state(page)).time;
    const tag = `${size} controls`;
    await page.waitForTimeout(700);
    let a = await timeOf(); await page.waitForTimeout(500); let b = await timeOf();
    check(`${tag}: plays by itself, about 1x`, b - a > 0.35 && b - a < 0.7, { dt: +(b - a).toFixed(2) });
    await tapFrame(); await page.waitForTimeout(150); a = await timeOf(); await page.waitForTimeout(600); b = await timeOf();
    const pausedSt = await state(page);
    check(`${tag}: a tap on the board pauses it`, pausedSt.paused && Math.abs(b - a) < 0.02, { paused: pausedSt.paused, dt: +(b - a).toFixed(3) });
    const hasPP = (await page.locator('#playpause').count()) > 0;
    check(`${tag}: there is a pause / resume button, and it says 继续 while paused`, hasPP && (await page.locator('#playpause').textContent()).includes('继续'), hasPP);
    await tapFrame(); await page.waitForTimeout(150); a = await timeOf(); await page.waitForTimeout(600); b = await timeOf();
    check(`${tag}: a second tap resumes`, !(await state(page)).paused && b - a > 0.3, { dt: +(b - a).toFixed(2) });
    if (hasPP) {
      await page.locator('#playpause').click(); await page.waitForTimeout(150);
      check(`${tag}: the pause button pauses too`, (await state(page)).paused);
      await page.locator('#playpause').click(); await page.waitForTimeout(150);
      check(`${tag}: and resumes`, !(await state(page)).paused);
    }
    if (!touch) {
      await page.keyboard.press('Space'); await page.waitForTimeout(150);
      check(`${tag}: space pauses`, (await state(page)).paused);
      await page.keyboard.press('Space'); await page.waitForTimeout(150);
      check(`${tag}: space resumes`, !(await state(page)).paused);
    }
    await page.selectOption('#speed', '2'); await page.waitForTimeout(150);
    a = await timeOf(); await page.waitForTimeout(1000); b = await timeOf();
    check(`${tag}: 2x runs the timeline about twice as fast`, (await state(page)).speed === 2 && b - a > 1.6 && b - a < 2.4, { dt: +(b - a).toFixed(2) });
    await page.selectOption('#speed', '1');
    await page.locator('#replay').click(); await page.waitForTimeout(400);
    const rp = await state(page);
    check(`${tag}: replay starts over and plays`, rp.time < 1.2 && !rp.paused && rp.pageLabel === '1 / 2', { time: +rp.time.toFixed(2), label: rp.pageLabel });
    // replay after a finished run: label goes back to 1 / 2
    await page.evaluate(() => window.__handBoard.seek(window.__handBoard.state().marks.pageDone[1])); await page.waitForTimeout(100);
    check(`${tag}: label shows 2 / 2 on the last page`, (await state(page)).pageLabel === '2 / 2');
    await page.locator('#replay').click(); await page.waitForTimeout(500);
    check(`${tag}: replay from the last page goes back to 1 / 2`, (await state(page)).pageLabel === '1 / 2', (await state(page)).pageLabel);

    // after the last page the button offers a second run, and a tap starts it
    await page.evaluate(() => window.__handBoard.seek(window.__handBoard.duration())); await page.waitForTimeout(100);
    const en = await state(page);
    check(`${tag}: at the very end the button reads 再看一遍`, en.ended && hasPP && (await page.locator('#playpause').textContent()).includes('再看一遍'), { ended: en.ended });
    await tapFrame(); await page.waitForTimeout(400);
    const again = await state(page);
    check(`${tag}: a tap after the end plays it again from the start`, again.time < 1.2 && !again.paused && !again.ended, { time: +again.time.toFixed(2) });

    // the page number changes when the old page has been wiped away, not a second later when the new title starts
    await page.evaluate((t) => window.__handBoard.seek(window.__handBoard.state().marks.pageDone[0] + t), C.CFG.pageHold + C.CFG.pageTurn + 0.05); await page.waitForTimeout(100);
    const wiped = await state(page), wm = await measure(page);
    check(`${tag}: once page 1 has wiped away the label already says 2 / 2`, wm.curPageIndex !== 0 && wiped.pageLabel === '2 / 2' && wiped.lines.filter((l) => l.page === 1).every((l) => l.revealed < 0.01), { label: wiped.pageLabel, shown: wm.curPageIndex });

    // page mode off = flow mode: the board scrolls to follow the pen
    await page.evaluate(() => { const hb = window.__handBoard; hb.seek(hb.state().marks.pageDone[0] * 0.5); hb.play(); }); await page.waitForTimeout(100);
    const before = await state(page);
    await page.locator('#pagemode').uncheck(); await page.waitForTimeout(300);
    const flow = await state(page);
    check(`${tag}: turning page mode off switches to flow and keeps the place (${before.progress.toFixed(2)} -> ${flow.progress.toFixed(2)})`, flow.mode === 'flow' && Math.abs(flow.progress - before.progress) < 0.06 && !flow.paused, { mode: flow.mode, before: before.progress, after: flow.progress });
    await page.evaluate(() => window.__handBoard.seek(window.__handBoard.state().marks.pageDone[1])); await page.waitForTimeout(150);
    const fm = await measure(page), fs2 = await state(page);
    const lastLine = fs2.lines[fs2.lines.length - 1];
    const lastChars = await page.evaluate(() => { const ls = [...document.querySelectorAll('.line')]; return [...ls[ls.length - 1].querySelectorAll('.ch')].map((c) => { const b = c.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }); });
    check(`${tag}: in flow mode the last line (written ${lastLine.revealed.toFixed(0)}/${lastLine.chars}) has scrolled into the frame`, lastLine.revealed > lastLine.chars - 0.01 && lastChars.every((c) => inside(c, fm.frame, TOL)), lastChars.filter((c) => !inside(c, fm.frame, TOL)).slice(0, 2));
    await page.screenshot({ path: path.join(out, `${size}-flow-end.png`) });
    await page.locator('#pagemode').check(); await page.waitForTimeout(300);
    check(`${tag}: page mode back on`, (await state(page)).mode === 'page');

    // font menu: only fonts this device has are offered; picking one redraws the writing in it and keeps the place
    const opts = await page.$$eval('#font option', (os) => os.map((o) => ({ label: o.textContent, value: o.value, disabled: o.disabled })));
    check(`${tag}: font menu lists the bundled font and keeps unavailable ones switched off`, opts[0].value === '"Long Cang"' && !opts[0].disabled && opts.length >= 3, opts);
    const other = opts.find((o) => !o.disabled && o.value !== '"Long Cang"');
    check(`${tag}: at least one system handwriting font is available here to try`, !!other, opts.map((o) => o.label + (o.disabled ? ' (off)' : '')));
    if (other) {
      await page.evaluate(() => window.__handBoard.seek(window.__handBoard.state().marks.pageDone[0])); await page.waitForTimeout(100);
      const p0 = (await state(page)).progress;
      await page.selectOption('#font', other.value); await page.waitForTimeout(500);
      const f1 = await platformFonts(ctx, page, '.ch:not(.lat)'), s1 = await state(page);
      check(`${tag}: picking ${other.label} redraws the writing in it (not Long Cang) and keeps the place`, !Object.keys(f1.agg).some((k) => k.startsWith('Long Cang')) && Math.abs(s1.progress - p0) < 0.03 && s1.font === other.value, { fonts: f1.agg, p0, p1: s1.progress });
      const mm = await measure(page);
      check(`${tag}: ${other.label} still fits the frame`, mm.chars.every((c) => inside(c.rect, mm.frame, TOL)) && mm.doodles.every((d) => inside(d.rect, mm.frame, TOL + 3)), mm.chars.filter((c) => !inside(c.rect, mm.frame, TOL)).slice(0, 2));
      await page.screenshot({ path: path.join(out, `${size}-font-other.png`) });
      await page.selectOption('#font', '"Long Cang"'); await page.waitForTimeout(500);
      const f2 = await platformFonts(ctx, page, '.ch:not(.lat)');
      check(`${tag}: back to Long Cang`, Object.keys(f2.agg).join() === 'Long Cang|custom', f2.agg);
    }
    check(`${tag}: no page errors while using the controls`, errors.length === 0, errors);
    await ctx.close();
  }

  // ===== 2b. the window changes shape while it plays (phone turned sideways, desktop window made narrow) =====
  for (const [size, to, shape] of [['phone', { width: 844, height: 390 }, 'landscape'], ['desktop', { width: 500, height: 900 }, 'portrait']]) {
    const { ctx, page, errors } = await open('', size), tag = `${size} -> ${to.width}x${to.height}`;
    await page.waitForTimeout(1500);
    const before = await state(page);
    await page.setViewportSize(to); await page.waitForTimeout(700);
    const after = await state(page), m = await measure(page);
    check(`${tag}: board shape ${before.layout} -> ${shape}, and it keeps playing from about the same place`, after.layout === shape && !after.paused && after.progress > before.progress - 0.01 && after.progress < before.progress + 0.08, { before: [before.layout, +before.progress.toFixed(3)], after: [after.layout, +after.progress.toFixed(3)] });
    check(`${tag}: frame on screen, page needs no scrolling, controls clear of the board`, inside(m.frame, { x: 0, y: 0, w: m.innerWidth, h: m.innerHeight }, 0.5) && m.scrollW <= m.docW + 1 && m.scrollH <= m.docH + 1 && m.controls.every((c) => !overlap(c, m.frame, 0.5)), { frame: m.frame, scroll: [m.scrollW, m.scrollH, m.docW, m.docH] });
    check(`${tag}: every character of the visible page is inside the frame`, m.chars.every((c) => inside(c.rect, m.frame, TOL)), m.chars.filter((c) => !inside(c.rect, m.frame, TOL)).slice(0, 3));
    await page.screenshot({ path: path.join(out, `resize-${size}-${shape}.png`) });
    await page.setViewportSize(SIZES[size].viewport); await page.waitForTimeout(700);
    const back = await state(page);
    check(`${tag}: and back to ${before.layout}`, back.layout === before.layout && !back.paused, back.layout);
    check(`${tag}: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }

  // ===== 2c. the font menu greys out a font the device does not have (simulated with a font name nobody has) =====
  {
    const ctx = await browser.newContext(SIZES.desktop), page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const o = document.createElement('option'); o.value = '"Handwriting Nobody Has 9"'; o.textContent = '没有的字体'; document.getElementById('font').appendChild(o);
    }));
    await page.goto(base);
    await page.waitForFunction(() => window.__handBoard && window.__handBoard.ready, null, { polling: 100, timeout: 20000 });
    const opts = await page.$$eval('#font option', (os) => os.map((o) => ({ label: o.textContent, value: o.value, disabled: o.disabled })));
    const fake = opts.find((o) => o.value.includes('Nobody'));
    check('font menu: a font the device does not have is greyed out and labelled', !!fake && fake.disabled && fake.label.includes('本机没有'), fake);
    check('font menu: Long Cang and at least one installed system font stay selectable', !opts[0].disabled && opts.slice(1).some((o) => !o.disabled && !o.value.includes('Nobody')), opts.map((o) => o.label + (o.disabled ? ' (off)' : '')));
    check('font menu: no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ===== 3. opening 30 seconds as a visitor sees it, desktop and phone (item 8) =====
  for (const size of ['desktop', 'phone']) {
    const { ctx, page, errors } = await open('', size);
    const marks = [0.5, 2, 4, 6, 8, 12, 20, 30], frames = [], startAt = Date.now();
    for (const m of marks) {
      const wait = startAt + m * 1000 - Date.now(); if (wait > 0) await page.waitForTimeout(wait);
      const st = await state(page);
      await page.screenshot({ path: path.join(out, `open-${size}-${String(m).padStart(4, '0')}s.png`) });
      frames.push({ at: m, t: +st.time.toFixed(1), paused: st.paused, label: st.pageLabel, written: +st.lines.reduce((a, l) => a + l.revealed, 0).toFixed(1), doodles: st.doodles.filter((d) => d.drawn > 0.99).length, hand: +st.hand.alpha.toFixed(2) });
    }
    report.runs.push({ size, opening: frames });
    check(`${size} opening: starts on its own and runs at 1x`, frames[1].t > 1 && frames[1].t < 2.6 && !frames[1].paused && frames[7].t > 27 && frames[7].t < 31.5, frames.map((f) => f.t));
    check(`${size} opening: the first characters are on the board within 2 s`, frames[1].written > 0.9, frames[1]);
    check(`${size} opening: the first red circle or line is drawn by 8 s`, frames[4].doodles >= 1, frames[4]);
    check(`${size} opening: page 1 is finished and the page has turned by 30 s`, frames[7].label === '2 / 2' || frames[7].doodles >= 4, frames[7]);
    check(`${size} opening: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }

  // ===== 4. cost (item 9) =====
  for (const size of ['desktop', 'phone']) {
    const { ctx, page } = await open('', size);
    await page.waitForTimeout(1500);
    const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
    const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const m0 = await metric();
    const d = await page.evaluate(() => new Promise((res) => { const gaps = []; let last = performance.now(); const t0 = last; const f = (now) => { gaps.push(now - last); last = now; if (now - t0 < 4000) requestAnimationFrame(f); else res(gaps); }; requestAnimationFrame(f); }));
    const m1 = await metric(), busyMs = (m1.TaskDuration - m0.TaskDuration) * 1000 / (d.length || 1);   // main-thread work per frame
    d.shift(); d.sort((x, y) => x - y);
    const mean = d.reduce((a, b) => a + b, 0) / d.length, p95 = d[Math.floor(d.length * 0.95)], max = d[d.length - 1];
    const m = await measure(page), st = await state(page);
    const bytes = m.resources.reduce((a, r) => a + r.bytes, 0);
    report.runs.push({ size, cost: { frames: d.length, meanMs: mean, p95Ms: p95, maxMs: max, busyMs, readyMs: st.readyMs, bytes, resources: m.resources } });
    check(`${size} cost: main thread busy ${busyMs.toFixed(2)} ms per frame`, busyMs < BUSY_MS, { busyMs });
    check(`${size} cost: frame gap mean ${mean.toFixed(1)} ms, 95th percentile ${p95.toFixed(1)} ms over ${d.length} frames`, mean < 18.5 && p95 < 25, { mean, p95, max });
    check(`${size} cost: ready in ${st.readyMs} ms, ${bytes} bytes fetched`, st.readyMs < READY_MS && bytes < WIRE_BUDGET, { readyMs: st.readyMs, bytes, resources: m.resources });
    await ctx.close();
  }

  // ===== 5. double-clicking index.html (file protocol): informational, reported not enforced =====
  {
    const ctx = await browser.newContext(SIZES.desktop), page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file:' + '//' + path.resolve(__dirname, '..', 'index.html'));
    const ok = await page.waitForFunction(() => window.__handBoard && window.__handBoard.ready, null, { polling: 100, timeout: 8000 }).then(() => true, () => false);
    const fonts = ok ? await page.evaluate(() => [...document.fonts].map((f) => f.family + ':' + f.status)) : null;
    report.runs.push({ fileProtocol: { ready: ok, fonts, errors } });
    console.log('info file protocol:', JSON.stringify({ ready: ok, fonts, errors: errors.slice(0, 3) }));
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(failed ? `${failed} of ${report.checks.length} checks failed` : `all ${report.checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
