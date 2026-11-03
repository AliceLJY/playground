const skipIntro = url => { const u = new URL(url); u.searchParams.set('intro', 'skip'); return u.href; };
// 推开一次，数帧率；再合上，确认回到原位。NODE_PATH="$(npm root -g)" node tools/perf.cjs <url>
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2];
  const b = await chromium.launch();
  for (const [tag, vp, dpr] of [['desk', { width: 1920, height: 1080 }, 1], ['phone', { width: 390, height: 664 }, 3]]) {
    const p = await (await b.newContext({ viewport: vp, deviceScaleFactor: dpr })).newPage();
    const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(skipIntro(url)); await p.waitForFunction(() => window.__xiguan && window.__xiguan.ready, null, { polling: 100 });
    const r = await p.evaluate(async () => {
      const X = window.__xiguan, f0 = X.frames, t0 = performance.now();
      document.getElementById('toggle').click();
      const again = X.trigger(); // 动画中再按一次应被忽略
      await new Promise((res) => { const w = () => (X.busy ? setTimeout(w, 30) : res()); w(); });
      const open = { frames: X.frames - f0, sec: (performance.now() - t0) / 1000, s: X.s, ignored: again === false, label: document.getElementById('toggle').textContent };
      return { open };
    });
    // Use browser input, so the event target follows the normal DOM path.
    await p.keyboard.press('Space');
    await p.waitForFunction(() => !__xiguan.busy, null, { polling: 50 });
    Object.assign(r, await p.evaluate(() => ({ closedS: __xiguan.s, label: document.getElementById('toggle').textContent })));
    console.log(tag, JSON.stringify({ ...r, fps: +(r.open.frames / r.open.sec).toFixed(1), errors }));
    if (errors.length || r.open.s !== 3.4 || !r.open.ignored || r.closedS !== 0) process.exitCode = 1;
  }
  await b.close();
})();
