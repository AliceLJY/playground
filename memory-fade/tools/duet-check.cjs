// Checks from the 2026-11-25 Duet review: the 「之前没记全」 label does not sit on the sample dots; recalling a card that was
// already recalled today says why nothing happened; the experiment prompt names the button by its real text.
// Usage: NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <base-url>
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8793/memory-fade/';
let fails = 0;
const check = (name, pass, detail) => { if (!pass) fails++; console.log(pass ? 'ok  ' : 'FAIL', name, pass ? '' : JSON.stringify(detail)); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    await page.goto(base); await page.waitForFunction(() => window.__PLAYTEST__?.ready);
    // 1. every sample old enough to show the label: no sample dot under it
    const hits = await page.evaluate(() => {
      const out = [], lab = document.getElementById('pastlabel');
      for (const m of window.__fade.library.filter((x) => x.age > 40)) {
        window.__fade.select(m, false);
        const r = lab.getBoundingClientRect();
        const n = [...document.querySelectorAll('#lib circle')].filter((c) => { const q = c.getBoundingClientRect(); return q.right > r.left && q.left < r.right && q.bottom > r.top && q.top < r.bottom; }).length;
        if (n) out.push({ age: m.age, dots: n });
      }
      return { checked: window.__fade.library.filter((x) => x.age > 40).length, hits: out.length, first: out.slice(0, 3) };
    });
    check(`${w} 「之前没记全」 covers no sample dot (${hits.checked} memories)`, hits.hits === 0, hits);
    // 2. second recall on the same day through the card gives feedback
    await page.evaluate(() => window.__fade.select(window.__fade.library.find((m) => m.category !== 'patterns' && !m.orig.pinned) || window.__fade.library[0], false));
    await page.click('#recall'); await page.waitForTimeout(100);
    await page.evaluate(() => { const t = document.getElementById('toast'); t.classList.remove('on'); t.textContent = ''; });
    await page.locator('#card').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
    const toast = await page.evaluate(() => ({ on: document.getElementById('toast').classList.contains('on'), text: document.getElementById('toast').textContent }));
    check(`${w} recalling the card again on the same day shows a reason`, toast.on && /同一天/.test(toast.text), toast);
    // 3. the experiment prompt names the real button
    await page.click('#open-experiment'); await page.waitForTimeout(200);
    const input = page.locator('#experiment-scrub');
    await input.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
    const msg = await page.evaluate(() => { const b = document.getElementById('experiment-add'); const m = [...document.querySelectorAll('[aria-live], .experiment-message, #experiment-message')].map((e) => e.textContent).find((t) => t.includes('选中第')); return { button: b.textContent.trim(), msg: m || '' }; });
    const quoted = (msg.msg.match(/「(.+?)」/) || [])[1];
    check(`${w} experiment prompt quotes the button text`, quoted === msg.button, msg);
    await page.close();
  }
  await browser.close();
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
