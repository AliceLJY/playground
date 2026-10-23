// 入口版式检查（2026-10-23 Alice 手机上「看不到入画在哪」）：一组矮屏幕逐个打开，
// 「入画」按钮要完整落在可视区里，而且按钮中心点下去点到的就是它（没被别的东西盖住）。
//   NODE_PATH="$(npm root -g)" node tools/layout.cjs <base-url> [outdir]
// 视口高度按「屏幕减掉浏览器地址栏和底栏」取，比裸屏幕矮。
const { chromium } = require('playwright');
const fs = require('node:fs');

const VIEWPORTS = [
  ['iPhone SE 竖（Safari 有栏）', 375, 553, true],
  ['老 iPhone SE 竖', 320, 460, true],
  ['iPhone 14 竖（有栏）', 390, 664, true],
  ['安卓 Chrome 竖（有栏）', 412, 700, true],
  ['折叠屏外屏竖', 344, 660, true],
  ['折叠屏展开', 860, 930, true],
  ['手机横放', 844, 340, true],
  ['手机横放（宽）', 915, 412, true],
  ['矮窗口电脑', 1280, 600, false],
  ['电脑', 1440, 900, false],
];

(async () => {
  const [base, outdir] = process.argv.slice(2);
  if (!base) { console.error('usage: layout.cjs <base-url> [outdir]'); process.exit(2); }
  if (outdir) fs.mkdirSync(outdir, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  let failed = 0;
  for (const [name, w, h, touch] of VIEWPORTS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 3 : 1, isMobile: touch, hasTouch: touch });
    const p = await ctx.newPage();
    await p.goto(base);
    await p.waitForFunction(() => window.__jianmen && (window.__jianmen.ready || window.__jianmen.error), null, { polling: 250, timeout: 90000 });
    const r = await p.evaluate(() => {
      const e = document.getElementById('enter'), b = e.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2, hit = document.elementFromPoint(cx, cy);
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), vw: innerWidth, vh: innerHeight, hit: hit === e, enabled: !e.disabled };
    });
    const inside = r.top >= 0 && r.left >= 0 && r.bottom <= r.vh && r.right <= r.vw;
    const ok = inside && r.hit && r.enabled;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${w}×${h}: 按钮 y ${r.top}–${r.bottom} / 可视高 ${r.vh}，x ${r.left}–${r.right} / ${r.vw}${r.hit ? '' : '，点不到（被盖住）'}${r.enabled ? '' : '，还是灰的'}`);
    if (outdir) await p.screenshot({ path: `${outdir}/${w}x${h}.png` });
    await ctx.close();
  }
  await b.close();
  console.log(failed ? `\n${failed} 个视口按钮看不全或点不到` : '\n所有视口按钮都完整可点');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
