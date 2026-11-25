// Memories written more than a year ago (Duet 2026-11-25 #9). The daily sample has not drawn one yet, so this check
// serves the page a copy of src/library.js with three extra rows (365, 400 and 520 days old) and does not touch the file.
// For each: the time slider keeps min <= max and starts on 「今天」, it can still move past today, the curve, the
// playhead dot and the library dot stay inside the plot, and the page has no errors.
// Usage: NODE_PATH="$(npm root -g)" node tools/old-memory-check.cjs <base-url>
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8793/memory-fade/';
const AGES = [365, 400, 520];
let fails = 0;
const check = (name, pass, detail) => { if (!pass) fails++; console.log(pass ? 'ok  ' : 'FAIL', name, JSON.stringify(detail)); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.route('**/src/library.js', async (route) => {
      const res = await route.fetch(); let body = await res.text();
      // a working-tier event recalled twice, last 30 days ago, so its curve still moves after today
      const extra = AGES.map((a) => `["events",0.5,${a},2,30,"w",0]`).join(',');
      body = body.replace('"rows":[', `"rows":[${extra},`);
      await route.fulfill({ response: res, body });
    });
    await page.goto(base); await page.waitForFunction(() => window.__PLAYTEST__?.ready);
    const injected = await page.evaluate(() => window.__fade.library.slice(0, 3).map((m) => m.age));
    check(`${w} injected rows reached the page`, JSON.stringify(injected) === JSON.stringify(AGES), injected);
    for (let i = 0; i < AGES.length; i++) {
      const r = await page.evaluate((i) => {
        const F = window.__fade, m = F.library[i]; F.select(m, false);
        const s = document.getElementById('scrub');
        const today = { min: +s.min, max: +s.max, value: +s.value, day: F.day, label: document.getElementById('day').textContent };
        // move the slider to its far end the way a user would
        s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true }));
        const end = { value: +s.value, day: F.day, label: document.getElementById('day').textContent };
        const xs = (document.getElementById('curve').getAttribute('d').match(/[ML](-?[\d.]+),/g) || []).map((t) => +t.slice(1, -1));
        const dot = +document.getElementById('dot').getAttribute('cx');
        const lib = +document.getElementById('selring').getAttribute('cx');
        return { age: m.age, today, end, curvePoints: xs.length, curveMin: Math.min(...xs), curveMax: Math.max(...xs), dot, lib };
      }, i);
      const x0 = 34, x1 = 346, tag = `${w} age ${r.age}`;
      check(`${tag}: slider min <= max`, r.today.min <= r.today.max, r.today);
      check(`${tag}: slider starts on today`, r.today.value === r.age && r.today.day === r.age && r.today.label === '今天', r.today);
      check(`${tag}: slider can go past today`, r.end.day > r.age && r.end.value === r.end.day && /天后/.test(r.end.label), r.end);
      check(`${tag}: curve drawn inside the plot`, r.curvePoints > 1 && r.curveMin >= x0 - 0.5 && r.curveMax <= x1 + 0.5, { n: r.curvePoints, min: r.curveMin, max: r.curveMax });
      check(`${tag}: playhead dot and library dot inside the plot`, r.dot >= x0 - 0.5 && r.dot <= x1 + 0.5 && r.lib >= x0 - 0.5 && r.lib <= x1 + 0.5, { dot: r.dot, lib: r.lib });
    }
    check(`${w} no page errors`, errors.length === 0, errors);
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'all passed');
  process.exit(fails ? 1 : 0);
})();
