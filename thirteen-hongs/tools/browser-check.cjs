// 真实输入检查：正常入口进、键盘与触屏各走一段、名场面 ×4 实时走完一遍。
// 用法：NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <基准地址> <输出目录>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const results = []; let fail = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name, detail); };
(async () => {
  const base = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--enable-features=WebGPU'] });
  const ready = p => p.waitForFunction(() => window.__hong && window.__hong.ready, null, { polling: 100, timeout: 30000 });
  const snap = p => p.evaluate(() => window.__PLAYTEST__.snapshot());

  // ---- 桌面：正常入口 → 走进去 → 按住 W → 拖动转头 → 开局录 6 帧 ----
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base + '?mute'); await ready(page);
  console.log('后端', await page.evaluate(() => window.__hong.backend));
  const white = await page.evaluate(() => window.__hong.uncoloured());
  check('人物没有漏上色的部件（都不是默认的纯白）', white.length === 0, white.join(',') || '全部上了色');
  check('桌面 GPU 不是软渲染', !/SwiftShader/i.test(await page.evaluate(() => window.__hong.gpu())), await page.evaluate(() => window.__hong.gpu()));
  await page.screenshot({ path: path.join(out, 'desk-intro.png') });
  await page.click('#goWalk'); await page.waitForTimeout(400);
  const a = await snap(page);
  check('点「走进去」进入步行', a.mode === 'walk');
  const tw = Date.now(); await page.keyboard.down('w');
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, `desk-open-${i}.png`) }); }
  await page.keyboard.up('w'); const secs = (Date.now() - tw) / 1000;
  const b = await snap(page), moved = Math.hypot(b.walk.x - a.walk.x, b.walk.z - a.walk.z);
  check('按住 W 的步速在 2.0–2.8 米每秒', moved / secs > 2.0 && moved / secs < 2.8, `${moved.toFixed(2)} m / ${secs.toFixed(2)} s`);
  const yaw0 = await page.evaluate(() => window.__hong.S.walk.yaw);
  await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(900, 420, { steps: 8 }); await page.mouse.up();
  const yaw1 = await page.evaluate(() => window.__hong.S.walk.yaw);
  check('拖动鼠标转头', Math.abs(yaw1 - yaw0) > 0.5, (yaw1 - yaw0).toFixed(2) + ' rad');
  // 顶着墙走不穿进商馆
  await page.evaluate(() => { const S = window.__hong.S; S.walk.x = 0; S.walk.z = -58; S.walk.yaw = 0; });
  await page.keyboard.down('w'); await page.waitForTimeout(2500); await page.keyboard.up('w');
  const c = await snap(page);
  check('顶着帝国馆立面走不进墙', c.walk.z > -62, 'z=' + c.walk.z);
  // 冲向江里走不下水
  await page.evaluate(() => { const S = window.__hong.S; S.walk.x = 60; S.walk.z = -6; S.walk.yaw = Math.PI; });
  await page.keyboard.down('w'); await page.waitForTimeout(3500); await page.keyboard.up('w');
  const d = await snap(page);
  check('朝江走停在岸边', d.walk.z <= 0 && d.walk.z > -1.5, 'z=' + d.walk.z);
  for (const k of ['tea', 'porter', 'merchant', 'hawker', 'sedan', 'official', 'monk', 'sampan', 'junk']) { await page.click(`[data-follow=${k}]`); await page.waitForTimeout(300); const s = await snap(page); check('点跟随 ' + k, s.mode === 'follow' && s.follow === k); }
  await page.click('#tod'); await page.waitForTimeout(300); const td1 = (await snap(page)).tod; await page.click('#tod'); const td2 = (await snap(page)).tod; await page.waitForTimeout(2500); await page.screenshot({ path: path.join(out, 'desk-night.png') }); await page.click('#tod');
  check('天色按钮依次切到黄昏、入夜、再回午后', td1 === 'dusk' && td2 === 'night' && (await snap(page)).tod === 'day', td1 + '>' + td2);
  await page.click('[data-mode=top]'); await page.waitForTimeout(1500);
  const top = await snap(page);
  check('桌面俯瞰帧率 ≥ 30', top.fps >= 30, top.fps + ' fps / ' + top.calls + ' 次绘制 / ' + top.tris + ' 三角面');
  check('绘制次数 ≤ 300', top.calls <= 300, String(top.calls));
  const where = await (await page.click('[data-follow=official]'), await page.waitForTimeout(700), page.textContent('#where'));
  check('跟随时顶上显示这个人在做什么', /官员/.test(where) && where.length > 6, where);
  await page.click('[data-mode=top]');

  // ---- 名场面：×4 实时走完一整遍，每个阶段拍一张 ----
  await page.click('#speed'); await page.click('#event');
  const seen = []; const t0 = Date.now();
  while (Date.now() - t0 < 110000) {
    const s = await snap(page);
    if (seen[seen.length - 1] !== s.stage) { seen.push(s.stage); await page.waitForTimeout(s.stage === 'load' ? 9000 : 1500); await page.click('#event'); await page.waitForTimeout(600); await page.screenshot({ path: path.join(out, `event-${seen.length}-${s.stage}.png`) }); }
    if (s.cycles >= 1 && s.stage === 'arrive') break;
    await page.waitForTimeout(250);
  }
  const fin = await snap(page);
  check('名场面六个阶段依次发生', ['arrive', 'inspect', 'load', 'hoist', 'depart', 'wait'].every(x => seen.includes(x)), seen.join('>'));
  check('名场面走完一整遍并开始下一遍', fin.cycles >= 1, 'cycles=' + fin.cycles + '，用时 ' + ((Date.now() - t0) / 1000).toFixed(0) + ' 秒（×4）');
  check('桌面全程无页面报错', errs.length === 0, errs[0] || '');
  await ctx.close();

  // ---- 手机 390×664：开场按钮在可视区、摇杆走动、拖动转头 ----
  ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); page = await ctx.newPage(); const errs2 = [];
  page.on('pageerror', e => errs2.push(String(e)));
  await page.goto(base + '?mute'); await ready(page);
  await page.screenshot({ path: path.join(out, 'phone-intro.png') });
  for (const id of ['goTop', 'goWalk']) { const r = await page.locator('#' + id).boundingBox(); check(`手机开场按钮 ${id} 完整在可视区且够大`, r && r.x >= 0 && r.y >= 0 && r.x + r.width <= 390 && r.y + r.height <= 664 && r.height >= 44, JSON.stringify(r)); }
  await page.tap('#goWalk'); await page.waitForTimeout(400);
  const m0 = await snap(page); check('手机点「走进去」进入步行', m0.mode === 'walk');
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  await touch('touchStart', [[90, 480, 1]]); for (let i = 1; i <= 6; i++) await touch('touchMove', [[90, 480 - i * 9, 1]]);
  await page.waitForTimeout(1500); await page.screenshot({ path: path.join(out, 'phone-joystick.png') });
  // 摇杆按住的同时另一根手指拖动转头
  const y0 = await page.evaluate(() => window.__hong.S.walk.yaw);
  await touch('touchStart', [[90, 426, 1], [300, 300, 2]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[90, 426, 1], [300 - i * 12, 300, 2]]);
  await page.waitForTimeout(800); await touch('touchEnd', []);
  const m1 = await snap(page), mv = Math.hypot(m1.walk.x - m0.walk.x, m1.walk.z - m0.walk.z), y1 = await page.evaluate(() => window.__hong.S.walk.yaw);
  check('手机摇杆走出 3 米以上', mv > 3, mv.toFixed(2) + ' m');
  check('手机边走边拖动转头', Math.abs(y1 - y0) > 0.3, (y1 - y0).toFixed(2) + ' rad');
  await page.waitForTimeout(500); const m2 = await snap(page), m3 = (await page.waitForTimeout(600), await snap(page));
  check('松手后停下（不粘键）', Math.hypot(m3.walk.x - m2.walk.x, m3.walk.z - m2.walk.z) < 0.05);
  for (const sel of ['[data-mode=top]', '[data-mode=walk]', '#tod', '#event', '#speed', '#mute', '#infoBtn']) { const r = await page.locator(sel).boundingBox(); check('手机按钮在可视区 ' + sel, r && r.y + r.height <= 664 && r.x >= 0 && r.x + r.width <= 390 && r.height >= 38, JSON.stringify(r)); }
  const txt = await page.evaluate(() => { const b = document.querySelector('#event'), s = b.querySelector('span'); s.textContent = '名场面｜挑夫落货 15/15'; return { over: s.getBoundingClientRect().right > b.getBoundingClientRect().right - 4, t: s.textContent }; });
  check('手机名场面条文字不被截断', !txt.over, txt.t);
  await page.tap('[data-mode=top]'); await page.waitForTimeout(1500); await page.screenshot({ path: path.join(out, 'phone-top.png') });
  const pt = await snap(page); check('手机视口俯瞰帧率 ≥ 30', pt.fps >= 30, pt.fps + ' fps');
  check('手机全程无页面报错', errs2.length === 0, errs2[0] || '');
  await ctx.close(); await browser.close();
  fs.writeFileSync(path.join(out, 'check.json'), JSON.stringify(results, null, 1));
  console.log(fail ? `\n${fail} 项未过` : `\n全部 ${results.length} 项通过`); process.exit(fail ? 1 : 0);
})();
