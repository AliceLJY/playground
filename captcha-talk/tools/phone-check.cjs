// 手机上从头点到尾、再回到开头：用触屏点按（真实时间，不用 headless），检查三件事——
// 1. 每点一下右侧都往前翻一步，能一路翻到最后的资料页；
// 2. 屏幕上有看得见的翻页按钮（至少 44×44 CSS 像素、完整在可视区内）；
// 3. 到了资料页，能退回收尾，也能一下回到第一步。
// 起因：2026-11-27 Alice 用手机「非常艰难的翻完」，到最后「好像回不去」。
// 用法：NODE_PATH="$(npm root -g)" node tools/phone-check.cjs <页面地址> [输出目录]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, out = '/tmp/captcha-phone'] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__talk && window.__talk.ready, null, { timeout: 60000, polling: 200 });
  const n = await page.evaluate(() => window.__talk.steps);
  const idx = () => page.evaluate(() => window.__talk.info().index);
  const fails = [];
  // 1. 点右侧一路翻
  for (let i = 1; i < n; i++) {
    await page.touchscreen.tap(330, 330); await page.waitForTimeout(350);
    const k = await idx(); if (k !== i) { fails.push(`第 ${i} 次点右侧后停在第 ${k} 步（应为第 ${i} 步）`); break; }
  }
  await page.screenshot({ path: out + '/end.png' });
  // 2. 看得见的翻页按钮
  const nav = await page.evaluate(() => [...document.querySelectorAll('[data-nav]')].filter(b => { const s = getComputedStyle(b); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > .3; })
    .map(b => { const r = b.getBoundingClientRect(); return { k: b.dataset.nav, w: r.width, h: r.height, in: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; }));
  if (!nav.length) fails.push('资料页上没有看得见的翻页按钮');
  for (const b of nav) if (b.w < 44 || b.h < 44 || !b.in) fails.push(`按钮 ${b.k} 太小或出了屏幕：${Math.round(b.w)}×${Math.round(b.h)}，在屏内=${b.in}`);
  // 3. 退回收尾、回到开头
  const tapNav = async k => { const r = await page.evaluate(k => { const b = [...document.querySelectorAll(`[data-nav="${k}"]`)].find(b => b.offsetParent); if (!b) return null; const q = b.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }, k); if (!r) return false; await page.touchscreen.tap(r[0], r[1]); await page.waitForTimeout(350); return true; };
  if (!(await tapNav('prev'))) fails.push('资料页上找不到「上一步」'); else if ((await idx()) !== n - 2) fails.push(`点「上一步」后在第 ${await idx()} 步，应回到收尾第 ${n - 2} 步`);
  await page.evaluate(n => window.__talk.go(n - 1), n); await page.waitForTimeout(300);
  if (!(await tapNav('restart'))) fails.push('资料页上找不到「从头再看」'); else if ((await idx()) !== 0) fails.push(`点「从头再看」后在第 ${await idx()} 步，应回到第 0 步`);
  await page.screenshot({ path: out + '/restart.png' });
  // 4. 往左滑也能往前翻
  const before = await idx();
  await page.evaluate(() => { const c = document.getElementById('stage'); const ev = (t, x) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: 330, pointerType: 'touch', bubbles: true })); ev('pointerdown', 330); ev('pointerup', 120); });
  await page.waitForTimeout(300); if ((await idx()) !== before + 1) fails.push('往左滑没有翻到下一步');
  console.log(`steps ${n}  errors ${errors.length}  fails ${fails.length}`); fails.forEach(f => console.log('  fail:', f)); errors.slice(0, 3).forEach(e => console.log('  error:', e));
  await browser.close(); process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
