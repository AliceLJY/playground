// 刀马旦精灵 · 浏览器验收。用法（先在本目录起 http.server）：
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8790/ <截图目录>
// 线上复验把地址换成 https://aliceljy.github.io/playground/daomadan-sprite/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const base = process.argv[2], out = process.argv[3] || 'shots';
fs.mkdirSync(out, { recursive: true });
const VIEWS = [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'iphone-safari', width: 390, height: 664, mobile: true },
  { name: 'android-chrome', width: 412, height: 700, mobile: true },
];
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

(async () => {
  const browser = await chromium.launch();
  for (const v of VIEWS) {
    const page = await browser.newPage({ viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    const bad = [];
    page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => self.__PLAYTEST__ && self.__PLAYTEST__.ready, null, { polling: 100, timeout: 20000 });
    check(errs.length === 0, `[${v.name}] 页面无报错 ${errs.join(' | ')}`);
    check(bad.length === 0, `[${v.name}] 资源全部加载 ${bad.join(' | ')}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(overflow <= 0, `[${v.name}] 没有横向滚动（溢出 ${overflow}px）`);

    // 原画区与动作小窗都画出了东西（ready 之后至少等两帧再读，ready 那一刻还没画第一帧）
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    const painted = await page.evaluate(() => [...document.querySelectorAll('canvas[data-clip]')].map((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n / (c.width * c.height);
    }));
    check(painted.length === 5 && painted.every((r) => r > 0.08), `[${v.name}] 五个动作小窗都有角色（覆盖率 ${painted.map((r) => r.toFixed(2)).join(',')}）`);
    await page.locator('#stills').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `${v.name}-stills.png`) });
    await page.locator('#actions').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `${v.name}-actions.png`) });

    // 舞台：按钮完整在可视区内，且点中心点到的是它
    await page.locator('#play').scrollIntoViewIfNeeded();
    await page.locator('.pad').scrollIntoViewIfNeeded();
    const btns = await page.evaluate(() => [...document.querySelectorAll('.pad button')].map((b) => {
      const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { k: b.dataset.k, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, hit: hit === b };
    }));
    check(btns.every((b) => b.inView && b.hit), `[${v.name}] 六个按钮都在可视区且点得到 ${JSON.stringify(btns.filter((b) => !(b.inView && b.hit)))}`);

    // 真实输入：键盘（桌面）或按住按钮（手机）
    const snap = () => page.evaluate(() => self.__PLAYTEST__.snapshot());
    const s0 = await snap();
    if (v.mobile) {
      const box = await page.locator('.pad button[data-k="right"]').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await page.waitForTimeout(700);
      const mid = await snap(); await page.mouse.up();
      check(mid.state === 'walk' && mid.x > s0.x, `[${v.name}] 按住 → 按钮会往右走（x ${s0.x}→${mid.x}，状态 ${mid.state}）`);
      await page.waitForTimeout(200);
      check((await snap()).state === 'idle', `[${v.name}] 松开按钮回到待机`);
      await page.locator('.pad button[data-k="attack"]').dispatchEvent('pointerdown');
    } else {
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700);
      const mid = await snap(); await page.keyboard.up('ArrowRight');
      check(mid.state === 'walk' && mid.face === 1 && mid.x > s0.x, `[${v.name}] 按住 → 往右走（x ${s0.x}→${mid.x}）`);
      await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300);
      check((await snap()).face === -1, `[${v.name}] 按 ← 转身朝左`);
      await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(150);
      await page.keyboard.press('j');
    }
    await page.waitForTimeout(250);
    const atk = await snap();
    check(atk.state === 'attack', `[${v.name}] 出枪生效（状态 ${atk.state}）`);
    await page.locator('#stage').screenshot({ path: path.join(out, `${v.name}-attack.png`) });
    await page.waitForTimeout(900);
    check((await snap()).state === 'idle', `[${v.name}] 出枪收招后回到待机`);
    if (!v.mobile) {
      await page.keyboard.press('k'); await page.waitForTimeout(350);
      check((await snap()).state === 'jump', `[${v.name}] K 起跳`);
      await page.locator('#stage').screenshot({ path: path.join(out, `${v.name}-jump.png`) });
    }
    await page.close();
  }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} 项未过` : '\n全部通过');
  process.exit(fails.length ? 1 : 0);
})();
