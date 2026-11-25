// 说明页滚到一半时「关闭」不浮在正文上（2026-11-25 Duet 巡检）。
// 「关闭」粘在说明页底部（验收 6：不用滚动就够得到），但粘住的只能是一整条底栏：正文从它下面滚过去时，
// 和按钮同一高度的那几行字不许还露在按钮旁边。判法：把说明页滚到中间，取正文每一行字的矩形，
// 凡是和「关闭」所在那一条（按钮上下各加 6 px）在竖直方向重叠的行，在行里取几个点用 elementFromPoint 看最上面是谁——
// 是正文自己就说明字露在按钮旁边，算报错。手机尺寸，带触屏与不带触屏各一遍。
//   python3 -m http.server 8972 --bind 127.0.0.1          (inside gear-repair/)
//   NODE_PATH="$(npm root -g)" node tools/info-scroll-check.cjs <output-dir> [base-url]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'check-out', base = process.argv[3] || 'http://127.0.0.1:8972/index.html';
fs.mkdirSync(out, { recursive: true });
const SIZES = [
  ['phone-touch', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }],
  ['phone-mouse', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: false }],
  ['small-touch', { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }],
  ['landscape-touch', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }],
];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let failed = 0;
  for (const [name, opts] of SIZES) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + (base.includes('?') ? '&' : '?') + 'view=hero');
    await page.waitForFunction(() => window.__gearRepair, null, { polling: 100 });
    await page.click('#b-info'); await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const info = document.getElementById('info'), close = document.getElementById('info-close');
      const scrollable = info.scrollHeight > info.clientHeight + 1;
      info.scrollTop = Math.round((info.scrollHeight - info.clientHeight) / 2);
      const ir = info.getBoundingClientRect(), cr = close.getBoundingClientRect();
      const band = [cr.top - 6, cr.bottom + 6];
      const lines = [];
      const walker = document.createTreeWalker(info, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        if (!n.textContent.trim() || close.contains(n)) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        for (const q of range.getClientRects()) {
          if (q.bottom <= band[0] || q.top >= band[1] || q.bottom <= ir.top || q.top >= ir.bottom) continue;
          const y = (Math.max(q.top, band[0]) + Math.min(q.bottom, band[1])) / 2;
          const xs = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => q.left + q.width * f);
          const shown = xs.filter((x) => { const el = document.elementFromPoint(x, y); return el && n.parentElement.contains(el); });
          if (shown.length) lines.push({ text: n.textContent.trim().slice(0, 16), y: Math.round(y), shownAt: shown.map(Math.round) });
        }
      }
      return { scrollable, scrollTop: info.scrollTop, close: [Math.round(cr.top), Math.round(cr.bottom)], info: [Math.round(ir.top), Math.round(ir.bottom)], lines };
    });
    await page.screenshot({ path: path.join(out, `info-scrolled-${name}.png`) });
    // 滚到底，「关闭」仍在说明页可见范围内、点得到
    const end = await page.evaluate(() => { const info = document.getElementById('info'); info.scrollTop = info.scrollHeight; const c = document.getElementById('info-close').getBoundingClientRect(), i = info.getBoundingClientRect(); const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2); return { inside: c.top >= i.top - 0.5 && c.bottom <= i.bottom + 0.5, hit: hit && hit.id === 'info-close' }; });
    await page.click('#info-close'); await page.waitForTimeout(100);
    const closed = await page.evaluate(() => document.getElementById('info').hidden);
    const ok = (!r.scrollable || r.lines.length === 0) && end.inside && end.hit && closed && errors.length === 0;
    if (!ok) failed++;
    console.log(ok ? 'ok  ' : 'FAIL', name, JSON.stringify({ scrollable: r.scrollable, close: r.close, info: r.info, textBesideClose: r.lines, closeAtEnd: end, closed, errors }));
    await ctx.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
