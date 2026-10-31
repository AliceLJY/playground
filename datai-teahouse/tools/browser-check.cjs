// 浏览器验收（README 验收 3、4、5、6）：四个视口 × 三个固定机位，截图 + 读钩子。
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
      await p.waitForFunction(() => window.__datai && window.__datai.ready, null, { polling: 100 });
      await p.waitForTimeout(200);
      const r = await p.evaluate(() => {
        const btns = [...document.querySelectorAll('#bar button')].map((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { text: el.textContent, box: r.toJSON(), hit: hit === el, disabled: el.disabled }; });
        const canvas = document.getElementById('scene').getBoundingClientRect();
        return { btns, canvas: canvas.toJSON(), vw: innerWidth, vh: innerHeight, scrollable: document.documentElement.scrollHeight > innerHeight + 1 || document.body.scrollHeight > innerHeight + 1, snap: window.__datai.snapshot() };
      });
      await p.screenshot({ path: path.join(out, `${tag}-${view}.png`) });
      // 动作响应：按斟茶，100 ms 内画面状态要变、要有音效名
      const before = r.snap.frameStamp;
      await p.evaluate(() => { window.__datai.pause(false); });
      await p.click('#bar button[data-act="1"]');
      await p.waitForTimeout(100);
      const after = await p.evaluate(() => window.__datai.snapshot());
      const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      let anyOverlap = false;
      for (let i = 0; i < r.btns.length; i++) for (let j = i + 1; j < r.btns.length; j++) if (overlap(r.btns[i].box, r.btns[j].box)) anyOverlap = true;
      const tables = r.snap.tables.map((t) => [t.no, t.count]);
      const expect = { first: { tables: [[1, 1]], me: 1, residents: 2 }, busy: { tables: [[1, 4], [2, 3]], me: 2, residents: 0 }, full: { tables: [[1, 4]], me: 1, residents: 0 } }[view];
      const checks = {
        '8 个按钮都整块在可视区内': r.btns.length === 8 && r.btns.every((x) => x.box.left >= 0 && x.box.right <= r.vw + 0.5 && x.box.top >= 0 && x.box.bottom <= r.vh + 0.5),
        '按钮中心点到的是它本身': r.btns.every((x) => x.hit),
        '按钮不重叠': !anyOverlap,
        '按钮高度 ≥ 44': r.btns.every((x) => x.box.height >= 44),
        '页面不可滚动': !r.scrollable,
        '画布高度 ≥ 可视区 55%': r.canvas.height >= r.vh * 0.55,
        [`分桌：${JSON.stringify(expect.tables)}，我在第 ${expect.me} 桌`]: JSON.stringify(tables) === JSON.stringify(expect.tables) && r.snap.me.table === expect.me,
        [`灰影 ${expect.residents} 个`]: r.snap.residents.length === expect.residents,
        '已落座、人数牌对得上': r.snap.phase === 'seated' && r.snap.where.includes(`${expect.tables.find((t) => t[0] === expect.me)[1]} / 4`),
        '斟茶 100 ms 内画面与状态变了': after.frameStamp > before && after.myCup === 1 && after.effects.includes('pour'),
        '斟茶有音效名': after.lastSound === 'pour',
        '零报错': errors.length === 0,
      };
      const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      if (bad.length) fail++;
      console.log(`${bad.length ? '✖' : '✔'} ${tag} ${view}`, bad.length ? '未过：' + bad.join('、') : '', bad.length ? JSON.stringify({ tables, me: r.snap.me, residents: r.snap.residents.length, where: r.snap.where, btns: r.btns.map((x) => [x.text, Math.round(x.box.top), Math.round(x.box.bottom)]), vh: r.vh, errors }) : '');
      await ctx.close();
    }
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
