// 浏览器验收：多视口布局 + 推开合上一来一回 + 控制台。
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <page-url>
// 判据：①任何时刻模型外框都在可视区内、不压到底部按钮栏 ②按钮整块在可视区内、中心点点到的是它
// ③推开后 s=T、再合上回到 0，动画期间重复触发被忽略 ④整段动作里机位不动（同一点的屏幕坐标不变）⑤零报错
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2];
  const VPS = [['1920x1080', 1920, 1080], ['1280x720', 1280, 720], ['iPhone Safari 390x664', 390, 664], ['Android 412x700', 412, 700], ['横屏 844x390', 844, 390]];
  const b = await chromium.launch();
  let fail = 0;
  for (const [tag, w, h] of VPS) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 900 })).newPage();
    const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await p.goto(url); await p.waitForFunction(() => window.__xiguan && window.__xiguan.ready, null, { polling: 100 });
    const r = await p.evaluate(async () => {
      const X = window.__xiguan, bar = document.querySelector('.bar').getBoundingClientRect(), btn = document.getElementById('toggle').getBoundingClientRect();
      const probe = [0, 0, 0], at0 = X.project(probe);
      let worst = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }, drift = 0;
      const barTop = Math.min(...[...document.querySelectorAll('.bar > *')].map((e) => e.getBoundingClientRect().top));
      for (let t = 0; t <= X.T + 1e-9; t += 0.05) {
        X.set(t);
        const bx = X.screenBox();
        worst = { left: Math.min(worst.left, bx.x0), right: Math.max(worst.right, bx.x1), top: Math.min(worst.top, bx.y0), bottom: Math.max(worst.bottom, bx.y1) };
        const q = X.project(probe); drift = Math.max(drift, Math.hypot(q[0] - at0[0], q[1] - at0[1]));
      }
      X.set(0);
      const cx = btn.left + btn.width / 2, cy = btn.top + btn.height / 2, hit = document.elementFromPoint(cx, cy);
      const noteBottom = document.querySelector('.note').getBoundingClientRect().bottom;
      return { worst, drift, barTop, noteBottom, btn: btn.toJSON(), btnHit: hit && hit.id, vw: innerWidth, vh: innerHeight };
    });
    // 真实点击按钮推开，动画中再点画面应被忽略，然后按空格合上
    await p.click('#toggle');
    await p.waitForTimeout(300);
    const sMid = await p.evaluate(() => window.__xiguan.s);
    await p.mouse.click(r.vw / 2, r.vh / 3);
    await p.waitForFunction(() => !window.__xiguan.busy, null, { polling: 50 });
    const sOpen = await p.evaluate(() => window.__xiguan.s);
    await p.keyboard.press('Space');
    await p.waitForTimeout(100);
    await p.waitForFunction(() => !window.__xiguan.busy, null, { polling: 50 });
    const sClosed = await p.evaluate(() => window.__xiguan.s);
    const checks = {
      模型在可视区内: r.worst.left >= 0 && r.worst.right <= r.vw && r.worst.top >= 0,
      模型不压顶部说明: r.worst.top >= r.noteBottom,
      模型不压按钮栏: r.worst.bottom <= r.barTop,
      按钮完整可见: r.btn.left >= 0 && r.btn.right <= r.vw && r.btn.top >= 0 && r.btn.bottom <= r.vh,
      按钮中心点到按钮: r.btnHit === 'toggle',
      机位不动: r.drift < 1e-6,
      推开到底: Math.abs(sOpen - 3.4) < 1e-9 && sMid > 0,
      合上归零: sClosed === 0,
      零报错: errors.length === 0,
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (bad.length) fail++;
    console.log(`${bad.length ? '✖' : '✔'} ${tag}`, bad.length ? '未过：' + bad.join('、') : '', JSON.stringify({ worst: Object.fromEntries(Object.entries(r.worst).map(([k, v]) => [k, Math.round(v)])), barTop: Math.round(r.barTop), errors }));
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
