// 真实浏览器、真实输入的验收。用法：NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <页面地址>
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2]; let pass = 0, fail = 0; const errors = [];
  const ok = (cond, name, detail = '') => { cond ? pass++ : fail++; console.log(cond ? 'ok  ' : 'FAIL', name, detail); };
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const snap = page => page.evaluate(() => window.__sf.snapshot());
  const settle = async page => { await page.waitForFunction(() => !window.__sf.snapshot().tween, null, { polling: 100, timeout: 8000 }); await page.waitForTimeout(150); };
  const open = async (ctx, q = '') => { const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); await page.goto(url + '?still' + q); await page.waitForFunction(() => window.__sf && window.__sf.ready, null, { polling: 100, timeout: 30000 }); return page; };

  // ===== 桌面 1440×900 =====
  { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await open(ctx);
    const gpu = await page.evaluate(() => window.__sf.gpu()); ok(!/SwiftShader|llvmpipe/i.test(gpu), 'D01 真实 GPU', gpu);
    let s = await snap(page); ok(s.zone === 'out' && s.mode === 'orbit' && s.extVisible && !s.intVisible, 'D02 开场在外面、轨道模式');
    const c = await page.evaluate(() => window.__sf.counts); ok(c.towers === 18 && c.columns >= 40 && c.windows > 120, 'D03 场景规模', JSON.stringify(c));
    // 拖动旋转、滚轮缩放
    const az0 = s.orbit.az, d0 = s.orbit.dist; await page.mouse.move(500, 450); await page.mouse.down(); await page.mouse.move(700, 430, { steps: 8 }); await page.mouse.up(); await page.mouse.wheel(0, -600); await page.waitForTimeout(200);
    s = await snap(page); ok(Math.abs(s.orbit.az - az0) > 0.5, 'D04 拖动能旋转', `az ${az0}→${s.orbit.az}`); ok(s.orbit.dist < d0 * 0.7, 'D05 滚轮能拉近', `${d0}→${s.orbit.dist}`);
    // 逐个点视点：外部 10 个
    const views = await page.evaluate(() => window.__sf.C.VIEWS.map(v => ({ id: v.id, zone: v.zone, mode: v.mode, pos: v.pos, cn: v.cn })));
    let reached = 0, capOK = 0;
    for (const zone of ['out', 'in']) {
      await page.click(`#tabs button[data-zone="${zone}"]`);
      for (const v of views.filter(q => q.zone === zone)) {
        await page.click(`#list button[data-view="${v.id}"]`); await settle(page); s = await snap(page);
        const dist = Math.hypot(s.cam[0] - v.pos[0], s.cam[1] - v.pos[1], s.cam[2] - v.pos[2]);
        const good = s.view === v.id && s.zone === v.zone && s.mode === v.mode && dist < 0.6 && s.intVisible === (v.zone === 'in') && s.extVisible === (v.zone === 'out');
        if (good) reached++; else console.log('   视点没到位', v.id, JSON.stringify({ view: s.view, zone: s.zone, mode: s.mode, dist: +dist.toFixed(2) }));
        if ((await page.textContent('#capT')).includes(v.cn) && (await page.textContent('#capP')).length > 15) capOK++;
      }
    }
    ok(reached === views.length, 'D06 点视点清单，镜头飞到位、里外显示对', `${reached}/${views.length}`); ok(capOK === views.length, 'D07 每个视点底部出说明文字', `${capOK}/${views.length}`);
    s = await snap(page); ok(s.light === 'evening' && s.glass[1] > 0.6, 'D08 暮光彩窗顺带切到傍晚光', JSON.stringify(s.glass));
    // 光：早晨 ↔ 傍晚
    await page.click('#lights button[data-light="morning"]'); await page.waitForTimeout(2600); const gm = (await snap(page)).glass;
    await page.click('#lights button[data-light="evening"]'); await page.waitForTimeout(2600); const ge = (await snap(page)).glass;
    ok(gm[0] > 0.9 && gm[1] < 0.3 && ge[1] > 0.9 && ge[0] < 0.3, 'D09 早晨冷色亮、傍晚暖色亮', `早 ${gm} 晚 ${ge}`);
    // 步行：真实按键
    await page.click('#list button[data-view="nave"]'); await settle(page); s = await snap(page); const z0 = s.fp.z;
    await page.mouse.click(500, 300); await page.keyboard.down('w'); await page.waitForTimeout(1500); await page.keyboard.up('w'); s = await snap(page);
    ok(z0 - s.fp.z > 2.5 && z0 - s.fp.z < 7, 'D10 按住 W 往前走', `走了 ${(z0 - s.fp.z).toFixed(2)} 米`);
    // 撞墙：面朝 +X 侧墙一直走
    await page.evaluate(() => window.__sf.teleport(17.5, 20.5, -Math.PI / 2)); await page.keyboard.down('w'); await page.waitForTimeout(3500); await page.keyboard.up('w'); s = await snap(page);
    ok(s.fp.x < 21.81 && s.fp.x > 21.3 && s.zone === 'in', 'D11 走到侧墙被挡住', `x=${s.fp.x}`);
    // 柱子挡人
    await page.evaluate(() => window.__sf.teleport(7.5, 14, 0)); await page.keyboard.down('w'); await page.waitForTimeout(2500); await page.keyboard.up('w'); s = await snap(page);
    ok(Math.hypot(s.fp.x - 7.5, s.fp.z - 9) > 1.15, 'D12 柱子穿不过去', `离柱心 ${Math.hypot(s.fp.x - 7.5, s.fp.z - 9).toFixed(2)} 米`);
    // 从荣耀门外走进去
    await page.evaluate(() => window.__sf.teleport(0, 53, 0)); s = await snap(page); const outOK = s.zone === 'out' && s.extVisible;
    await page.keyboard.down('Shift'); await page.keyboard.down('w'); await page.waitForTimeout(2600); await page.keyboard.up('w'); await page.keyboard.up('Shift'); s = await snap(page);
    ok(outOK && s.zone === 'in' && s.intVisible && !s.extVisible && s.fp.z < 44, 'D13 从荣耀门走进去，里外自动切换', `z=${s.fp.z}`);
    // 飞行
    await page.click('#modes button[data-mode="fly"]'); const y0 = (await snap(page)).fp.y; await page.keyboard.down(' '); await page.waitForTimeout(1000); await page.keyboard.up(' '); s = await snap(page);
    ok(s.mode === 'fly' && s.fp.y - y0 > 8, 'D14 飞行模式空格上升', `升了 ${(s.fp.y - y0).toFixed(1)} 米`);
    await page.click('#modes button[data-mode="walk"]'); s = await snap(page); ok(s.mode === 'walk' && Math.abs(s.fp.y - 1.65) < 0.01, 'D15 切回漫游落回地面', `y=${s.fp.y}`);
    await page.click('#modes button[data-mode="orbit"]'); await settle(page); s = await snap(page); ok(s.mode === 'orbit' && s.zone === 'out' && s.view === 'whole', 'D16 在里面点轨道回到外面全景');
    // 平面图点一下
    const box = await page.locator('#map').boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.78); await settle(page); s = await snap(page);
    ok(s.zone === 'in', 'D17 点平面图上的圆点能过去', s.view);
    await page.waitForTimeout(1200); s = await snap(page); ok(s.fps >= 30, 'D18 内部帧率', `${s.fps} fps ${s.calls} 次绘制 ${s.tris} 三角面`);
    await page.click('#resetBtn'); await settle(page); await page.click('#modes button[data-mode="orbit"]'); await settle(page); await page.waitForTimeout(1200); s = await snap(page); ok(s.fps >= 30, 'D19 外部帧率', `${s.fps} fps ${s.calls} 次绘制 ${s.tris} 三角面`);
    await page.click('#infoBtn'); ok(await page.isVisible('#info'), 'D20 依据面板能打开'); await page.click('#infoClose');
    await ctx.close(); }

  // ===== 手机 390×664（屏幕减掉浏览器栏），触屏 =====
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }); const page = await open(ctx);
    const lay = await page.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); const all = [...document.querySelectorAll('#top button')].map(b => b.getBoundingClientRect()).filter(b => b.width); return { overflow: document.documentElement.scrollWidth > innerWidth, btnIn: all.every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight), minH: Math.min(...all.map(b => b.height)), cap: r('cap'), stage: r('stage') }; });
    ok(!lay.overflow && lay.btnIn, 'P01 顶栏按钮都在屏幕里、无横向溢出'); ok(lay.minH >= 28, 'P02 按钮够高', lay.minH + 'px'); ok(lay.cap.bottom <= lay.stage.bottom + 1 && lay.cap.right <= 390, 'P03 说明卡片不出画');
    await page.tap('#drawerBtn'); await page.waitForTimeout(400); await page.tap('#tabs button[data-zone="in"]'); await page.tap('#list button[data-view="nave"]'); await settle(page);
    let s = await snap(page); ok(s.zone === 'in' && s.mode === 'walk', 'P04 抽屉里点视点能进中殿'); ok(!(await page.evaluate(() => document.getElementById('side').classList.contains('open'))), 'P05 选完抽屉自动收起');
    // 摇杆：左下角按住往上推
    const cdp = await ctx.newCDPSession(page), z0 = s.fp.z, T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await T('touchStart', [{ x: 80, y: 520, id: 1 }]); await T('touchMove', [{ x: 80, y: 470, id: 1 }]); await page.waitForTimeout(1500);
    // 边走边用另一根手指拖动转头
    const yaw0 = (await snap(page)).fp.yaw; await T('touchMove', [{ x: 80, y: 470, id: 1 }, { x: 300, y: 300, id: 2 }]).catch(() => {}); await T('touchStart', [{ x: 80, y: 470, id: 1 }, { x: 300, y: 300, id: 2 }]).catch(() => {});
    for (let i = 1; i <= 6; i++) await T('touchMove', [{ x: 80, y: 470, id: 1 }, { x: 300 - i * 12, y: 300, id: 2 }]);
    await page.waitForTimeout(300); s = await snap(page); await T('touchEnd', []); await page.waitForTimeout(300); const s2 = await snap(page); await page.waitForTimeout(400); const s3 = await snap(page);
    ok(z0 - s.fp.z > 2.5, 'P06 摇杆能走', `走了 ${(z0 - s.fp.z).toFixed(2)} 米`); ok(Math.abs(s.fp.yaw - yaw0) > 0.2, 'P07 边走边拖能转头', `yaw ${yaw0}→${s.fp.yaw}`); ok(Math.hypot(s3.fp.x - s2.fp.x, s3.fp.z - s2.fp.z) < 0.01, 'P08 松手即停');
    await page.tap('#lights button[data-light="evening"]'); await page.waitForTimeout(2600); s = await snap(page); ok(s.glass[1] > 0.9, 'P09 手机上能切傍晚光'); ok(s.fps >= 30, 'P10 手机视口帧率（桌面芯片模拟）', s.fps + ' fps');
    await ctx.close(); }

  ok(errors.length === 0, 'E01 页面无报错', errors.slice(0, 3).join(' | '));
  console.log(`\n${pass} 项通过，${fail} 项失败`); await browser.close(); process.exit(fail ? 1 : 0);
})();
