// 2026-11-25 Duet 巡检复核：三维不等图片、标签页高度与语义、日照说明与数据一致、标题区不重复且说明面积是估算
// NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <page-url> [screenshot-dir]
const { chromium } = require('playwright');
const path = require('node:path');
const [base, shots] = process.argv.slice(2);
if (!base) throw new Error('Provide page URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let fails = 0;
  const check = (name, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
  const lit = (page) => page.evaluate(() => {
    const c = document.getElementById('c3d'); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    if (!c.width) return 0; const x = t.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, t.width, t.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && Math.abs(d[i] - 22) + Math.abs(d[i + 1] - 22) + Math.abs(d[i + 2] - 27) > 40) n++; /* 没画过的画布是全透明，不算 */ return n;
  });
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true], [390, 664, false]]) {
    const tag = `${w} hasTouch=${touch}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: w < 900 ? 2 : 1 });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // 图片拖 4 秒才回：三维应该不等它们
    await page.route(/\/assets\/.*\.(png|jpg)$/, async (route) => { await new Promise((r) => setTimeout(r, 4000)); await route.continue(); });
    await page.goto(base, { waitUntil: 'commit' });
    await page.waitForTimeout(1500);
    const early = await lit(page);
    const imgsDone = await page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    check(`${tag} 3D draws before the images arrive`, !imgsDone && early > 2000, { litPixels: early, imagesDone: imgsDone });
    if (shots) await page.screenshot({ path: path.join(shots, `floorplan-${w}-touch${touch}-1500ms-slow-images.png`) });
    await page.waitForFunction(() => window.__ready, null, { polling: 100, timeout: 30000 });
    const tabs = await page.evaluate(() => [...document.querySelectorAll('nav button')].map((b) => ({ id: b.id, role: b.getAttribute('role'), sel: b.getAttribute('aria-selected'), h: Math.round(b.getBoundingClientRect().height) })));
    const list = await page.evaluate(() => document.querySelector('nav').getAttribute('role'));
    check(`${tag} tabs are >=44px and marked as tabs`, list === 'tablist' && tabs.every((t) => t.h >= 44 && t.role === 'tab') && tabs.filter((t) => t.sel === 'true').map((t) => t.id).join() === 'tab-three', { list, tabs });
    await page.locator('#tab-sun').click();
    const sel = await page.evaluate(() => [...document.querySelectorAll('nav button[aria-selected="true"]')].map((b) => b.id).join());
    check(`${tag} aria-selected follows the clicked tab`, sel === 'tab-sun', sel);
    const rule = await page.locator('.rule').innerText();
    const rooms = await page.evaluate(() => [...document.querySelectorAll('#sunlist .srow')].map((r) => r.innerText.replace(/\s+/g, ' ')));
    check(`${tag} sun rule does not claim every room beats every point (储藏间/家庭室 0 h, 过道 0.75 h < 1.08 h)`, !rule.includes('比任一点都长') && rule.trim().endsWith('。'), { rule, rooms });
    if (shots) await page.screenshot({ path: path.join(shots, `floorplan-${w}-touch${touch}-sun.png`), fullPage: true });
    const head = await page.locator('header').innerText();
    const counts = (head.match(/8 个房间|八间房/g) || []).length;
    check(`${tag} header states the room count once and calls the area an estimate`, counts === 1 && head.includes('估算'), head);
    check(`${tag} zero page errors`, errors.length === 0, errors);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'ALL PASS');
  process.exitCode = fails ? 1 : 0;
})();
