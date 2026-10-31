// 浏览器验收（README 验收 3、4、5、6、8）：四个视口 × 三个固定机位，截图 + 读钩子。
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <page-url> <out-dir>
// 视口按「扣掉浏览器栏」的手机尺寸：iPhone Safari 390×664、安卓 Chrome 412×700、横屏 844×340，加一档电脑 1280×720。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const [url, out] = process.argv.slice(2);
  if (!url) { console.error('用法：node tools/browser-check.cjs <page-url> <out-dir>'); process.exit(2); }
  fs.mkdirSync(out || 'check-out', { recursive: true });
  const VPS = [['iphone-390x664', 390, 664], ['android-412x700', 412, 700], ['landscape-844x340', 844, 340], ['desktop-1280x720', 1280, 720]];
  const VIEWS = ['first', 'busy', 'full'];
  const b = await chromium.launch();
  let fail = 0;
  const sep = url.includes('?') ? '&' : '?';
  for (const [tag, w, h] of VPS) {
    for (const view of VIEWS) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 900 });
      const p = await ctx.newPage();
      const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await p.goto(`${url}${sep}view=${view}&t=6&mute=1`);
      await p.waitForFunction(() => window.__foyer && window.__foyer.ready, null, { polling: 100 });
      await p.waitForTimeout(200);
      // 固定机位里先落座，再读状态
      await p.evaluate(() => { window.__foyer.act(0); window.__foyer.step(100); });
      const r = await p.evaluate(() => {
        const btns = [...document.querySelectorAll('#bar button')].map((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { text: el.textContent, box: r.toJSON(), hit: hit === el, disabled: el.disabled }; });
        const canvas = document.getElementById('scene').getBoundingClientRect();
        return { btns, canvas: canvas.toJSON(), vw: innerWidth, vh: innerHeight, scrollable: document.documentElement.scrollHeight > innerHeight + 1 || document.body.scrollHeight > innerHeight + 1, snap: window.__foyer.snapshot() };
      });
      await p.screenshot({ path: path.join(out, `${tag}-${view}.png`) });
      // 动作响应：按鼓掌，100 ms 内画面状态要变、要有音效名
      const before = r.snap.frameStamp;
      await p.evaluate(() => { window.__foyer.pause(false); });
      await p.click('#bar button[data-act="2"]');
      await p.waitForTimeout(100);
      const after = await p.evaluate(() => window.__foyer.snapshot());
      const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      let anyOverlap = false;
      for (let i = 0; i < r.btns.length; i++) for (let j = i + 1; j < r.btns.length; j++) if (overlap(r.btns[i].box, r.btns[j].box)) anyOverlap = true;
      const halls = r.snap.halls.map((t) => [t.no, t.count]);
      const expect = { first: { halls: [[1, 1]], hall: 1, residents: 3 }, busy: { halls: [[1, 12], [2, 1]], hall: 2, residents: 3 }, full: { halls: [[1, 10]], hall: 1, residents: 0 } }[view];
      const checks = {
        noPageErrors: errors.length === 0,
        notScrollable: !r.scrollable,
        buttonsInside: r.btns.every((x) => x.box.left >= -1 && x.box.right <= r.vw + 1 && x.box.top >= -1 && x.box.bottom <= r.vh + 1),
        buttonsHit: r.btns.every((x) => x.hit),
        buttonsNoOverlap: !anyOverlap,
        sixButtons: r.btns.length === 6,
        canvasTall: r.canvas.height >= Math.min(260, r.vh * 0.45),
        seatedHall: r.snap.phase === 'seated' && r.snap.hall === expect.hall,
        hallsMatch: JSON.stringify(halls) === JSON.stringify(expect.halls),
        residentsMatch: r.snap.residents === expect.residents,
        clapResponds: after.frameStamp > before && after.claps === r.snap.claps + 1 && after.lastSound === 'clap' && after.effects.includes('ripple'),
      };
      const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      if (bad.length) fail++;
      console.log(`${bad.length ? 'FAIL' : 'ok  '} ${tag} ${view}  halls=${JSON.stringify(halls)} residents=${r.snap.residents} lamps=${r.snap.lamps}${bad.length ? '  ← ' + bad.join(', ') : ''}${errors.length ? '  errors: ' + errors.join(' | ') : ''}`);
      await ctx.close();
    }
  }
  await b.close();
  console.log(fail ? `${fail} 组未过` : `全部 ${VPS.length * VIEWS.length} 组通过`);
  process.exit(fail ? 1 : 0);
})();
