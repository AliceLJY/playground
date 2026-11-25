// 2026-11-25 Duet 巡检复核：提示左右跟着朝向、「声」按钮大小、切走窗口后方向键松开
// NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <base-url> [screenshot-dir]   （base-url 指向构建出的 dist/）
const { chromium } = require('playwright');
const path = require('node:path');
const [base, shots] = process.argv.slice(2);
if (!base) throw new Error('Provide base URL of dist/');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
  let fails = 0;
  const check = (name, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
  const hintState = (page) => page.evaluate(() => {
    const a = getComputedStyle(document.getElementById('arrow')).transform; const m = a.match(/matrix\(([^)]+)\)/);
    const cos = m ? Number(m[1].split(',')[0]) : null; // 箭头基准朝右，旋转后 cos>0 = 指右
    return { hint: __jianmen.info().hint, text: document.getElementById('hint').textContent, on: document.getElementById('hint').classList.contains('on'), arrowRight: cos === null ? null : cos > 0, yaw: Math.round(__jianmen.info().look.yaw) };
  });
  const sideOf = (t) => (t.includes('往左') ? 'left' : t.includes('往右') ? 'right' : null);
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true], [390, 664, false]]) {
    const tag = `${w} hasTouch=${touch}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: w < 900 ? 2 : 1 });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.__jianmen?.ready, null, { polling: 100, timeout: 90000 });
    await page.click('#enter');
    await page.waitForTimeout(2500);
    const snd = await page.locator('#sound').boundingBox();
    check(`${tag} sound button >=44px`, snd && snd.width >= 44 && snd.height >= 44, snd);
    // 切走窗口时按着的方向键要松开
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(200);
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    // 视线有缓动，松开后还会追上已转到的位置；等 0.6 秒追完再量 0.6 秒，不该再转
    await page.waitForTimeout(600);
    const y0 = await page.evaluate(() => __jianmen.info().look.yaw); await page.waitForTimeout(600);
    const y1 = await page.evaluate(() => __jianmen.info().look.yaw);
    check(`${tag} held arrow key stops turning after window blur`, Math.abs(y1 - y0) < 0.5, { y0, y1 });
    await page.keyboard.up('ArrowRight');
    // 先转身找到「身后」，然后不动，等提示
    await page.evaluate(() => __jianmen.look(180, 10));
    await page.waitForFunction(() => __jianmen.info().found.includes('back'), null, { polling: 100, timeout: 10000 });
    await page.waitForFunction(() => __jianmen.info().hint, null, { polling: 250, timeout: 40000 });
    await page.waitForTimeout(300);
    const a = await hintState(page);
    if (shots) await page.screenshot({ path: path.join(shots, `jianmen-${w}-touch${touch}-hint-after-back.png`) });
    check(`${tag} hint side agrees with the arrow after turning round`, a.hint !== 'far' || (sideOf(a.text) === (a.arrowRight ? 'right' : 'left')), a);
    // 再转回正面（不对着任何目标），提示应跟着换边
    await page.evaluate(() => __jianmen.look(0, 25)); await page.waitForTimeout(400);
    const b = await hintState(page);
    if (shots) await page.screenshot({ path: path.join(shots, `jianmen-${w}-touch${touch}-hint-facing-front.png`) });
    check(`${tag} hint side follows the view when the player turns`, b.hint !== 'far' || (sideOf(b.text) === (b.arrowRight ? 'right' : 'left')), b);
    check(`${tag} zero page errors`, errors.length === 0, errors);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'ALL PASS');
  process.exitCode = fails ? 1 : 0;
})();
