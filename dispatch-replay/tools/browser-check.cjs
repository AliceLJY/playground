// Browser acceptance for 派活回放 (SPEC §9.9–9.10), run by hand, not part of CI.
// Needs an existing Playwright install and Google Chrome; this repository installs neither.
//   python3 -m http.server 8963 --bind 127.0.0.1          (inside dispatch-replay/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [base-url]
// Writes screenshots, opening frames and report.json into <output-dir>; exits 1 when any check fails.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'check-out', base = process.argv[3] || 'http://127.0.0.1:8963/index.html', origin = new URL(base).origin;
fs.mkdirSync(out, { recursive: true });
const SIZES = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  big: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  fold: { viewport: { width: 720, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const report = { base, checks: [], runs: [] }; let failed = 0;
const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, detail }); if (!pass) failed++; console.log(pass ? 'ok  ' : 'FAIL', name, detail == null ? '' : JSON.stringify(detail).slice(0, 240)); };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); report.browser = browser.version();
  async function open(query, size) {
    const ctx = await browser.newContext(SIZES[size]), page = await ctx.newPage(), errors = [], external = [];
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith('data:')) external.push(u); });
    await page.goto(base + query);
    await page.waitForFunction(() => window.__replay && window.__replay.ready, null, { polling: 100, timeout: 20000 });
    return { ctx, page, errors, external };
  }
  // share of canvas pixels that differ from the background, sampled on a grid
  const inked = (page) => page.evaluate(() => {
    const c = document.getElementById('stage'), g = c.getContext('2d'), { width: w, height: h } = c;
    const d = g.getImageData(0, 0, w, h).data; let n = 0, s = 0;
    for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) { const i = (y * w + x) * 4; s++; if (d[i] + d[i + 1] + d[i + 2] > 120) n++; }
    return n / s;
  });

  // 1. three fixed views on five screen shapes (§9.9)
  for (const size of Object.keys(SIZES)) for (const view of ['hero', 'wide', 'end']) {
    const { ctx, page, errors, external } = await open('?view=' + view, size);
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => window.__replay.state()), ink = await inked(page);
    const dom = await page.evaluate(() => ({
      caption: getComputedStyle(document.getElementById('caption')).opacity > 0.5 ? document.getElementById('caption').textContent : '',
      summary: document.getElementById('summary').hidden ? '' : document.getElementById('summary').innerText,
      counters: document.getElementById('counters').innerText,
      headerOverflow: document.querySelector('header').scrollHeight > document.querySelector('header').clientHeight + 2,
      summaryTop: document.getElementById('summary').hidden ? null : document.getElementById('summary').getBoundingClientRect().top,
    }));
    const file = path.join(out, `${size}-${view}.png`); await page.screenshot({ path: file });
    report.runs.push({ size, view, state: st, ink, dom });
    check(`${size} ${view}: no page errors`, errors.length === 0, errors);
    check(`${size} ${view}: no external requests`, external.length === 0, external);
    check(`${size} ${view}: canvas is drawn`, ink > 0.01, { ink: +ink.toFixed(3) });
    check(`${size} ${view}: counters readable`, /在跑/.test(dom.counters) && /已交回/.test(dom.counters), dom.counters);
    check(`${size} ${view}: header fits`, !dom.headerOverflow);
    if (view === 'end') {
      check(`${size} end: summary shown`, st.summaryShown && /分钟里/.test(dom.summary), dom.summary);
      check(`${size} end: summary text clears the ruler line`, dom.summaryTop >= st.layout.endRulerY + 2, { summaryTop: dom.summaryTop, ruler: st.layout.endRulerY });
    }
    else check(`${size} ${view}: caption on screen`, dom.caption.length > 0, dom.caption);
    if (view === 'hero') check(`${size} hero: peak concurrency`, st.counters.running === st.maxConcurrent, { running: st.counters.running, max: st.maxConcurrent });
    await ctx.close();
  }

  // 2. normal entry, opening 30 seconds as a visitor sees it (§9.10), plus draw cost while playing
  for (const size of ['desktop', 'phone']) {
    const { ctx, page, errors } = await open('', size);
    const marks = [0.5, 2, 4, 6, 8, 12, 20, 30], frames = [];
    const startAt = Date.now();
    for (const m of marks) {
      const wait = startAt + m * 1000 - Date.now(); if (wait > 0) await page.waitForTimeout(wait);
      const st = await page.evaluate(() => window.__replay.state());
      await page.screenshot({ path: path.join(out, `open-${size}-${String(m).padStart(4, '0')}s.png`) });
      frames.push({ at: m, t: +st.t.toFixed(1), playing: st.playing, sent: st.counters.dispatched, caption: st.caption });
    }
    const stats = await page.evaluate(() => window.__replay.drawStats());
    report.runs.push({ size, opening: frames, drawStats: stats });
    const by30 = frames[frames.length - 1];
    check(`${size} opening: playing on its own`, frames[1].playing, frames[1]);
    check(`${size} opening: first batch dispatched within 30 s`, by30.sent >= 5, by30);
    check(`${size} opening: no page errors`, errors.length === 0, errors);
    if (size === 'desktop') check('desktop: median draw < 4 ms', stats.median < 4, stats);
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
  process.exit(failed ? 1 : 0);
})();
