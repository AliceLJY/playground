// Usage: NODE_PATH="$(npm root -g)" node tools/b3-check.cjs <out-dir> <base-url>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const out = process.argv[2], base = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const checks = [], check = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); console.log(pass ? 'ok' : 'FAIL', name); };
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const [width, height] of [[390,664], [1365,900], [320,568], [844,340]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.install(); await page.clock.pauseAt(new Date());
    await page.goto(base);
    await page.waitForFunction(() => window.__agentEngine?.ready, null, { polling: 50 });
    const state = () => page.evaluate(() => window.__agentEngine.state());
    for (const scene of [2, 3, 6]) {
      await page.locator(`#steps button:nth-child(${scene})`).click();
      await page.locator('#play').click(); await page.clock.runFor(550);
      await page.locator('#play').click();
      const a = await state();
      await page.clock.runFor(2000); const b = await state();
      const part = {2:'chat',3:'loop',6:'life'}[scene];
      check(`${width} scene ${scene}: pause freezes events`, JSON.stringify(a[part]) === JSON.stringify(b[part]), {a:a[part], b:b[part]});
      if (scene === 3 && width >= 390 && height > 600) await page.screenshot({ path: path.join(out, `${width}-paused.png`) });
      await page.locator('#play').click(); const c = await state();
      check(`${width} scene ${scene}: resume does not replay`, JSON.stringify(b[part]) === JSON.stringify(c[part]), {b:b[part], c:c[part]});
      await page.clock.runFor(scene === 6 ? 900 : 600);
      const d = await state();
      check(`${width} scene ${scene}: pending event resumes at remaining delay`, JSON.stringify(c[part]) !== JSON.stringify(d[part]), d[part]);
    }
    // A pause near the dwell boundary must preserve the remaining delay as well.
    await page.locator('#steps button:nth-child(5)').click(); await page.locator('#play').click();
    const dwell = (await state()).dwell[4];
    await page.clock.runFor(dwell - 1000); await page.locator('#play').click();
    await page.clock.runFor(5000); check(`${width}: dwell stays paused`, (await state()).view === 5);
    await page.locator('#play').click(); await page.clock.runFor(1100);
    check(`${width}: dwell resumes with one second remaining`, (await state()).view === 6);
    await page.locator('#steps button:nth-child(4)').click();
    for (const card of await page.locator('.fc').all()) await card.click();
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 1250); });
    await page.clock.runFor(100);
    if (width <= 844) {
      const nav = await page.evaluate(() => {
        const n = document.querySelector('.compact-nav'); if (!n) return null;
        const r = n.getBoundingClientRect();
        return {text:n.textContent, top:r.top, bottom:r.bottom, width:r.width, buttons:[...n.querySelectorAll('button')].map(b=> {const r=b.getBoundingClientRect();return {w:r.width,h:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b};})};
      });
      check(`${width}: scrolled chapter title and 44px navigation remain reachable`, nav && /4\/6/.test(nav.text) && nav.top >= 0 && nav.bottom <= height && nav.buttons.every(b=>b.w>=44&&b.h>=44&&b.hit), nav);
      await page.screenshot({ path:path.join(out, `${width}-navigation.png`) });
      if (nav) { await page.locator('#compact-next').click(); check(`${width}: sticky next changes chapter`, (await state()).view === 5); }
    }
    check(`${width}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`${width}: no page errors`, errors.length === 0, errors);
    await page.close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({browser:browser.version(), checks}, null, 2));
  await browser.close(); if (checks.some(c=>!c.pass)) process.exitCode = 1;
})();
