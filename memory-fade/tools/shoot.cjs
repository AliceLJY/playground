// 固定状态截图（SPEC 验收 7）：node tools/shoot.cjs <输出目录>，需先在本目录起 http.server 8790。
// 另外真点一次卡片、拖一次曲线，确认手势走的是同一条规则，并收集控制台报错。
const { chromium } = require('playwright');
const out = process.argv[2] || 'check-out';
const BASE = 'http://localhost:8790/';
const STATES = [
  ['day0', '?day=0&imp=0.5'],
  ['day120-plain', '?day=120&imp=0.5'],
  ['day120-recalled', '?day=120&recalls=20,45,70,100&imp=0.5'],
  ['day200-pinned', '?day=200&imp=0.5&pin=1'],
];
(async () => {
  require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  for (const [w, h, tag] of [[390, 844, 'phone'], [1280, 800, 'desk']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
    for (const [name, q] of STATES) {
      await page.goto(BASE + q); await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: true });
    }
    // 手势：从第 0 天开，拖曲线到大约第 180 天，再点卡片
    await page.goto(BASE + '?day=0&imp=0.5'); await page.waitForTimeout(200);
    const box = await page.locator('#plot').boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5); await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.53, box.y + box.height * 0.5, { steps: 8 }); await page.mouse.up();
    const d = await page.evaluate(() => window.__fade.day);
    const before = await page.textContent('#factor');
    await page.locator('#card .paper').click(); await page.waitForTimeout(120);
    const mid = await page.screenshot({ path: `${out}/${tag}-tap-bounce.png` });
    await page.waitForTimeout(1400);
    const after = await page.textContent('#factor');
    const st = await page.evaluate(() => ({ recalls: window.__fade.mem.recalls, x: window.__fade.card.x, y: window.__fade.yOf(1) }));
    console.log(`${tag}: 拖到第 ${d} 天 ${before} → 点卡片后 ${after}，recalls=${JSON.stringify(st.recalls)}，卡片 y=${st.x.toFixed(1)}（倍率 1 对应 ${st.y}）`);
    await page.screenshot({ path: `${out}/${tag}-after-tap.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
  console.log(errors.length ? '报错：\n' + errors.join('\n') : '控制台零报错');
})();
