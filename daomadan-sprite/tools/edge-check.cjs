// 刀马旦精灵 · 台边出枪检查（Duet 2026-11-25 第 1 条）。用法（先在仓根或本目录起 http.server）：
//   NODE_PATH="$(npm root -g)" node tools/edge-check.cjs http://127.0.0.1:8790/ <截图目录>
// 真实键盘：按住 Shift+→ 跑到最右、按 J 出枪；再按住 Shift+← 跑到最左、按 J 出枪。出枪每一帧的枪尖位置 =
// 角色锚点 x ± 这一帧在图集里离锚点最远的不透明像素（从 assets/attack.webp 现量，不抄常数），要求整杆枪在舞台 0–960 内。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const base = process.argv[2], out = process.argv[3] || 'shots';
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const check = (ok, msg, detail) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg} ${JSON.stringify(detail)}`); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => self.__PLAYTEST__ && self.__PLAYTEST__.ready, null, { polling: 100, timeout: 20000 });
  // 每一帧最右的不透明像素相对锚点的距离（alpha > 16）
  const reach = await page.evaluate(async () => {
    const clip = self.DMD_CLIPS.attack, im = new Image(); im.src = 'assets/attack.webp'; await im.decode();
    const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const out = [];
    for (let f = 0; f < clip.count; f++) {
      const sx = (f % clip.cols) * clip.cell[0], sy = Math.floor(f / clip.cols) * clip.cell[1]; let r = -Infinity;
      for (let y = 0; y < clip.cell[1]; y++) for (let x = 0; x < clip.cell[0]; x++) if (d[((sy + y) * cv.width + sx + x) * 4 + 3] > 16) r = Math.max(r, x + 1 - clip.anchor[0]);
      out.push(r);
    }
    return out;
  });
  const width = await page.evaluate(() => document.getElementById('stage').width);
  await page.locator('#play').scrollIntoViewIfNeeded();
  for (const [dir, key] of [['right', 'ArrowRight'], ['left', 'ArrowLeft']]) {
    await page.keyboard.down('Shift'); await page.keyboard.down(key);
    await page.waitForTimeout(4000);                       // 跑速 0.3 px/ms，4 秒足够跑过整个舞台
    await page.keyboard.up(key); await page.keyboard.up('Shift');
    await page.waitForTimeout(100);
    const at = await page.evaluate(() => self.__PLAYTEST__.snapshot());
    await page.keyboard.press('j');
    // 出枪开始后改由钩子逐 16 ms 推进，逐帧记位置（真实时间里 rAF 会跳帧）
    let tipMin = Infinity, tipMax = -Infinity, frames = 0, worst = null;
    for (let i = 0; i < 400; i++) {
      const s = await page.evaluate(() => self.__PLAYTEST__.snapshot());
      if (s.state !== 'attack') { if (frames) break; await page.evaluate(() => self.__PLAYTEST__.step(16)); continue; }
      frames++;
      const tip = s.x + s.face * reach[s.frame];
      tipMin = Math.min(tipMin, tip); tipMax = Math.max(tipMax, tip);
      if (!worst || (s.face > 0 ? tip > worst.tip : tip < worst.tip)) {   // 枪伸得最远的那一帧留截图
        worst = { tip, frame: s.frame, x: s.x, face: s.face };
        await page.locator('#stage').screenshot({ path: path.join(out, `edge-${dir}-attack.png`) });
      }
      await page.evaluate(() => self.__PLAYTEST__.step(16));
    }
    check(frames > 0, `[${dir}] 走到台边后按 J 真的出了枪`, { x: at.x, frames });
    check(tipMin >= 0 && tipMax <= width, `[${dir}] 出枪每一帧枪尖都在舞台 0–${width} 内`, { standAt: at.x, face: at.face, tipMin: +tipMin.toFixed(1), tipMax: +tipMax.toFixed(1), worst });
    // 交回实时循环：重新载入页面，避免 step() 留下的暂停影响下一轮真实键盘输入
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => self.__PLAYTEST__ && self.__PLAYTEST__.ready, null, { polling: 100, timeout: 20000 });
    await page.locator('#play').scrollIntoViewIfNeeded();
  }
  check(errs.length === 0, '页面无报错', errs);
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
