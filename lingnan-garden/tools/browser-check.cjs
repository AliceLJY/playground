// 真实输入检查：正常入口进、键盘与触屏各走一段、撞水撞墙、上踏步、明信片机位、自动逛一圈。
// 用法：NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <页面地址> <输出目录>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const results = []; let fail = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name, detail); };
(async () => {
  const base = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ready = p => p.waitForFunction(() => window.__garden && window.__garden.ready, null, { polling: 100, timeout: 40000 });
  const snap = p => p.evaluate(() => window.__garden.snapshot());
  const put = (p, x, z, yaw) => p.evaluate(([x, z, yaw]) => { const g = window.__garden; Object.assign(g.S.walk, { x, z, yaw, pitch: 0, y: g.C.groundY(x, z) }); }, [x, z, yaw]);
  const hold = async (p, key, ms) => { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); await p.waitForTimeout(120); };

  // ---- 桌面 ----
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } }), page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base + '?mute'); await ready(page);
  const gpu = await page.evaluate(() => window.__garden.gpu());
  check('桌面 GPU 不是软渲染', !/SwiftShader|llvmpipe/i.test(gpu), gpu);
  check('开场页显示着', await page.isVisible('#intro'));
  await page.screenshot({ path: path.join(out, 'desk-intro.png') });
  await page.click('#goCard'); await page.waitForTimeout(500);
  let s = await snap(page); const PC = await page.evaluate(() => window.__garden.C.POSTCARD);
  check('点「先看同一个机位」到明信片机位', s.mode === 'card' && Math.abs(s.cam[0] - PC.x) < 0.01 && Math.abs(s.cam[1] - PC.y) < 0.01 && Math.abs(s.cam[2] - PC.z) < 0.01, JSON.stringify(s.cam));
  check('16:9 下明信片机位的纵向视角等于设定值', Math.abs(s.fov - PC.fov) < 0.5, s.fov + '°');
  await page.click('#bRef'); await page.waitForTimeout(200);
  const ref = await page.evaluate(() => { const i = document.querySelector('#ref img'); return { shown: getComputedStyle(document.getElementById('ref')).display, w: i.naturalWidth, h: i.naturalHeight }; });
  check('「对照原图」弹出内嵌的起始图', ref.shown === 'block' && ref.w > 800, `${ref.w}×${ref.h}`);
  await page.screenshot({ path: path.join(out, 'desk-card-with-ref.png') });
  await page.click('#bRef');
  await page.click('#bWalk'); await page.waitForTimeout(400);
  const a = await snap(page); check('点「走进去」进入步行', a.mode === 'walk');
  const t0 = Date.now(); await page.keyboard.down('w'); await page.waitForTimeout(1500); await page.keyboard.up('w'); const secs = (Date.now() - t0) / 1000; await page.waitForTimeout(120);
  const b = await snap(page), moved = Math.hypot(b.x - a.x, b.z - a.z);
  check('按住 W 的步速在 2.0–2.8 米每秒', moved / secs > 2.0 && moved / secs < 2.8, `${moved.toFixed(2)} m / ${secs.toFixed(2)} s`);
  await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(900, 420, { steps: 8 }); await page.mouse.up();
  const c = await snap(page); check('拖动鼠标转头', Math.abs(c.yaw - b.yaw) > 0.5, (c.yaw - b.yaw).toFixed(2) + ' rad');
  // 朝荷塘走：停在岸上
  await put(page, 2.0, 11.6, 0); await hold(page, 'w', 2500); s = await snap(page);
  check('朝荷塘走停在岸上', !(await page.evaluate(([x, z]) => window.__garden.C.inPond(x, z), [s.x, s.z])) && s.z > 10.2 && s.z < 11.4, `z=${s.z}`);
  await page.screenshot({ path: path.join(out, 'desk-shore.png') });
  // 顶着月洞门旁的白墙走：过不去；对准门洞：过得去
  const G = await page.evaluate(() => ({ ...window.__garden.C.GATE, wz: window.__garden.C.WALL_Z }));
  await put(page, G.x - 3, 3.6, 0); await hold(page, 'w', 2200); s = await snap(page);
  check('顶着白墙走不过去', s.z > G.wz + 0.3, `z=${s.z}`);
  await put(page, G.x, 3.6, 0); await hold(page, 'w', 2600); s = await snap(page);
  check('对准月洞门走得过去', s.z < G.wz - 0.8 && s.place === '月洞门内 · 竹院', `z=${s.z} ${s.place}`);
  // 上踏步进前廊，再进屋
  const foot = await page.evaluate(() => { const C = window.__garden.C; return [C.pavToWorld(-3.27, C.PAV.zFront + C.PAV.stepsLen + 0.8), C.pavToWorld(-3.0, 1.5), C.PAV.rot]; });
  await put(page, foot[0].x, foot[0].z, foot[2]); await hold(page, 'w', 1500); s = await snap(page);
  check('走踏步上到前廊', s.place === '水榭 · 前廊' && Math.abs(s.y - 0.85) < 0.06, `${s.place} y=${s.y}`);
  await put(page, foot[1].x, foot[1].z, foot[2]); await hold(page, 'w', 1100); s = await snap(page);
  check('从门洞进到屋里', s.place === '水榭 · 屋内', s.place);
  await page.screenshot({ path: path.join(out, 'desk-inside.png') });
  await hold(page, 'w', 2500); s = await snap(page);
  check('屋里顶着后墙走不出去', s.place === '水榭 · 屋内', s.place);
  // 从草地顶平台侧面：上不去
  const side = await page.evaluate(() => { const C = window.__garden.C; return C.pavToWorld(-C.PAV.halfL - 1.6, 1.5); });
  await put(page, side.x, side.z, foot[2] - Math.PI / 2); await hold(page, 'w', 2000); s = await snap(page);
  check('从草地顶平台侧面上不去', s.y < 0.05, `y=${s.y} ${s.place}`);
  // 自动逛一圈：快进到结束，看经过了哪些地方
  await page.click('#bTour'); await page.waitForTimeout(300);
  check('点「带我逛一圈」开始自动走', (await snap(page)).tour === true);
  const places = new Set(); let maxY = 0, ended = false;
  for (let i = 0; i < 400 && !ended; i++) { const r = await page.evaluate(() => { window.__garden.step(500); return window.__garden.snapshot(); }); places.add(r.place); maxY = Math.max(maxY, r.y); ended = !r.tour; }
  s = await snap(page); const ST = await page.evaluate(() => window.__garden.C.START);
  check('自动逛一圈走完并回到起点附近', ended && Math.hypot(s.x - ST.x, s.z - ST.z) < 0.6, `(${s.x}, ${s.z})`);
  check('一圈经过屋内、曲廊、石矶、北岸、石拱桥、东岸、石桌', ['水榭 · 屋内', '曲廊', '曲廊 · 石矶', '石拱桥', '东岸竹径', '石桌旁'].every(p => places.has(p)) && [...places].some(p => p === '北岸' || p === '假山下'), [...places].join('、'));
  check('过桥时脚下到过桥顶高度', maxY > 1.0, maxY.toFixed(2));
  // 自动走的时候拖动只改视线、不打断；按方向键才接手
  await page.click('#bTour'); await page.waitForTimeout(600); const ty0 = await snap(page);
  await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(520, 400, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(700); const ty1 = await snap(page);
  check('自动走时拖动只改视线，人还在往前走', ty1.tour === true && Math.abs(ty1.yaw - ty0.yaw) > 0.4 && Math.hypot(ty1.x - ty0.x, ty1.z - ty0.z) > 0.8, `yaw ${(ty1.yaw - ty0.yaw).toFixed(2)} rad，走了 ${Math.hypot(ty1.x - ty0.x, ty1.z - ty0.z).toFixed(2)} m`);
  await page.waitForTimeout(4200); const ty2 = await snap(page);
  check('放手三秒后视线转回前进方向', ty2.tour === true && Math.abs(ty2.yaw - ty1.yaw) > 0.25, `yaw 又变了 ${(ty2.yaw - ty1.yaw).toFixed(2)} rad`);
  await hold(page, 's', 300);
  check('自动走时按方向键就接手', (await snap(page)).tour === false);
  await page.click('#bTop'); await page.waitForTimeout(1600); s = await snap(page);
  check('点「俯瞰」', s.mode === 'top'); await page.screenshot({ path: path.join(out, 'desk-top.png') });
  await page.click('#bCard'); await page.waitForTimeout(2600); s = await snap(page);
  check('桌面明信片机位帧率 ≥ 30', s.fps >= 30, `${s.fps} fps / ${s.calls} 次绘制 / ${s.tris} 三角面`);
  await page.click('#infoBtn'); check('「说明」写明起始图是 AI 画的', /AI 画/.test(await page.innerText('#info'))); await page.click('#infoClose');
  check('桌面全程无页面报错', errs.length === 0, errs[0] || '');
  await ctx.close();

  // ---- 手机 390×664，触屏 ----
  ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); page = await ctx.newPage(); const errs2 = [];
  page.on('pageerror', e => errs2.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs2.push(m.text()); });
  await page.goto(base + '?mute'); await ready(page);
  await page.screenshot({ path: path.join(out, 'phone-intro.png') });
  check('手机开场页三个按钮都在屏幕内', await page.evaluate(() => [...document.querySelectorAll('#intro button')].every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })));
  await page.tap('#goWalk'); await page.waitForTimeout(400);
  const p0 = await snap(page); check('手机点「走进去」进入步行', p0.mode === 'walk');
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  await touch('touchStart', [[80, 520, 1]]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[80, 520 - i * 8, 1]]); await page.waitForTimeout(16); }
  check('按下左下角出现摇杆', await page.evaluate(() => getComputedStyle(document.getElementById('joy')).display === 'block'));
  await page.waitForTimeout(1500);
  const p1 = await snap(page); check('摇杆往前推能走', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 2.2, Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2) + ' m');
  await touch('touchStart', [[80, 472, 1], [300, 300, 2]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[80, 472, 1], [300 - i * 12, 300, 2]]); await page.waitForTimeout(16); }
  const p2 = await snap(page); check('边走边用另一根手指转头', Math.abs(p2.yaw - p1.yaw) > 0.4 && Math.hypot(p2.x - p1.x, p2.z - p1.z) > 0.1, (p2.yaw - p1.yaw).toFixed(2) + ' rad');
  await touch('touchEnd', []); await page.waitForTimeout(300); const p3 = await snap(page); await page.waitForTimeout(500); const p4 = await snap(page);
  check('松手即停，摇杆收起', Math.hypot(p4.x - p3.x, p4.z - p3.z) < 0.02 && await page.evaluate(() => getComputedStyle(document.getElementById('joy')).display === 'none'));
  await page.screenshot({ path: path.join(out, 'phone-walk.png') });
  await page.tap('#bCard'); await page.waitForTimeout(2600); s = await snap(page);
  check('竖屏明信片机位把纵向视角放大', s.fov > PC.fov + 5, s.fov + '°');
  check('手机帧率 ≥ 30（桌面芯片上的模拟视口）', s.fps >= 30, `${s.fps} fps / ${s.calls} 次绘制`);
  check('手机没有横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.tap('#bRef'); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, 'phone-card-with-ref.png') });
  check('手机上对照图不超出屏幕', await page.evaluate(() => { const r = document.getElementById('ref').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
  check('手机全程无页面报错', errs2.length === 0, errs2[0] || '');
  await ctx.close(); await browser.close();
  fs.writeFileSync(path.join(out, 'browser-check.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.length - fail}/${results.length} 项通过`); process.exit(fail ? 1 : 0);
})();
