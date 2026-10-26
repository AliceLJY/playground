// 推开一次，数帧率；再合上，确认回到原位。NODE_PATH="$(npm root -g)" node tools/perf.cjs <url>
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2];
  const b = await chromium.launch();
  for (const [tag, vp, dpr] of [['desk', { width: 1920, height: 1080 }, 1], ['phone', { width: 390, height: 664 }, 3]]) {
    const p = await (await b.newContext({ viewport: vp, deviceScaleFactor: dpr })).newPage();
    const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(url); await p.waitForFunction(() => window.__xiguan && window.__xiguan.ready, null, { polling: 100 });
    const r = await p.evaluate(async () => {
      const X = window.__xiguan, f0 = X.frames, t0 = performance.now();
      document.getElementById('toggle').click();
      const again = X.trigger(); // 动画中再按一次应被忽略
      await new Promise((res) => { const w = () => (X.busy ? setTimeout(w, 30) : res()); w(); });
      const open = { frames: X.frames - f0, sec: (performance.now() - t0) / 1000, s: X.s, ignored: again === false, label: document.getElementById('toggle').textContent };
      const k = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }); window.dispatchEvent(k);
      await new Promise((res) => { const w = () => (X.busy ? setTimeout(w, 30) : res()); setTimeout(w, 50); });
      return { open, closedS: X.s, label: document.getElementById('toggle').textContent };
    });
    console.log(tag, JSON.stringify({ ...r, fps: +(r.open.frames / r.open.sec).toFixed(1), errors }));
  }
  await b.close();
})();
