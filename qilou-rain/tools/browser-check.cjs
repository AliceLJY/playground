// 真实浏览器检查：正常入口进、键鼠与触屏各走一段、固定机位逐个进、整局自动打通。
// 用法：NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <页面地址> <输出目录>
//   本地打包产物 http://127.0.0.1:8947/dist/index.html ，线上 https://aliceljy.github.io/playground/qilou-rain/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const results = []; let fail = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail) }); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name, detail); };
(async () => {
  const base = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const origin = new URL(base).origin, dir = new URL('.', base).pathname;
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ready = p => p.waitForFunction(() => window.__PLAYTEST__ && window.__PLAYTEST__.ready, null, { polling: 100, timeout: 40000 });
  const snap = p => p.evaluate(() => window.__PLAYTEST__.snapshot());
  const open = async (query, vp, touch) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: !!touch, isMobile: !!touch, deviceScaleFactor: touch ? 2 : 1 }), page = await ctx.newPage();
    page.errs = []; page.ext = [];
    page.on('pageerror', e => page.errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') page.errs.push(m.text()); });
    page.on('request', r => { const u = new URL(r.url()); if (u.origin !== origin || !u.pathname.startsWith(dir)) page.ext.push(r.url()); });
    await page.goto(base + query); await ready(page);
    return page;
  };

  // ---- 桌面：标题页 → 开始 → 走、看、喷、拍、暂停 ----
  let page = await open('?seed=7', { width: 1440, height: 810 });
  const info = await page.evaluate(() => window.__qilou.info());
  console.log('GPU', info.gpu, '画质', info.quality.name, 'dpr', info.dpr);
  check('不是软渲染', !/SwiftShader/i.test(info.gpu), info.gpu);
  check('标题页不向页面目录以外发请求', page.ext.length === 0, page.ext.slice(0, 3).join(' '));
  await page.waitForTimeout(1500); await page.screenshot({ path: path.join(out, 'title.png') });
  const t0 = Date.now(); await page.click('[data-act="start"]'); await page.waitForFunction(() => window.__PLAYTEST__.snapshot().mode === 'play', null, { polling: 50, timeout: 5000 });
  const a = await snap(page);
  check('点「开始」进入游戏', a.mode === 'play' && a.sealed === 0 && a.hp === 100, JSON.stringify(a));
  await page.keyboard.down('w');
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, `open-${i}.png`) }); }
  await page.keyboard.up('w');
  const b = await snap(page), secs = (b.t - a.t);
  check('按住 W 朝南走，步速 3.6–4.6 米每秒', b.z > a.z + 8 && (b.z - a.z) / secs > 3.6 && (b.z - a.z) / secs < 4.6, `${(b.z - a.z).toFixed(1)} m / ${secs.toFixed(2)} s，x 偏 ${(b.x - a.x).toFixed(2)}`);
  check('直走不跑偏', Math.abs(b.x - a.x) < 0.5, 'x ' + (b.x - a.x).toFixed(2));
  await page.mouse.move(700, 400); await page.mouse.down(); await page.waitForTimeout(150);
  const f0 = await snap(page);
  await page.mouse.move(860, 400, { steps: 8 }); await page.waitForTimeout(600);
  const f1 = await snap(page);
  check('按下左键 150 毫秒内开始喷', f0.firing, 'firing=' + f0.firing);
  check('拖动转头', Math.abs(f1.yaw - f0.yaw) > 0.2, (f1.yaw - f0.yaw).toFixed(2) + ' rad');
  check('喷的时候药量在掉', f1.tank < 100, 'tank ' + f1.tank);
  await page.mouse.up(); await page.waitForTimeout(100);
  check('松开就停', !(await snap(page)).firing);
  const s0 = await page.evaluate(() => window.__qilou.sim.stats.slaps); await page.keyboard.press('f'); await page.waitForTimeout(120);
  check('按 F 拍一下', await page.evaluate(() => window.__qilou.sim.stats.slaps) === s0 + 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Esc 暂停，时间不走', (await snap(page)).mode === 'paused');
  const p0 = (await snap(page)).t; await page.waitForTimeout(500); const p1 = (await snap(page)).t;
  check('暂停期间模拟时间不动', p0 === p1, p0 + ' → ' + p1);
  await page.click('[data-act="resume"]'); await page.waitForTimeout(200);
  check('继续回到游戏', (await snap(page)).mode === 'play');
  check('到这里页面零报错', page.errs.length === 0, page.errs.slice(0, 3).join(' | '));
  // 顶墙不穿
  await page.evaluate(() => { const q = window.__qilou; q.sim.player.x = 8; q.sim.player.z = -50; q.look.yaw = -Math.PI / 2; });
  await page.keyboard.down('w'); await page.waitForTimeout(1500); await page.keyboard.up('w');
  check('顶着铺面墙走不进去', (await snap(page)).x < 9, 'x=' + (await snap(page)).x);
  await page.context().close();

  // ---- 固定机位：请求的状态必须真的进到了 ----
  for (const v of ['signs', 'nest', 'bite', 'flyer', 'charger', 'stun', 'alley', 'pier', 'ferry', 'won']) {
    page = await open('?view=' + v, { width: 1440, height: 810 });
    await page.waitForTimeout(1200);
    const i = await page.evaluate(() => window.__qilou.info());
    check(`机位 ${v} 进到了`, i.view && i.view.entered === v, JSON.stringify(i.view));
    check(`机位 ${v} 零报错、绘制 ${i.calls} 次`, i.errors.length === 0 && page.errs.length === 0 && i.calls < 400, i.errors.concat(page.errs).slice(0, 2).join(' | '));
    const shot = await page.screenshot({ path: path.join(out, `view-${v}.png`) });
    check(`机位 ${v} 画面不是空的`, shot.length > 120000, shot.length + ' 字节');
    if (v === 'nest') console.log('帧率', i.fps, '绘制', i.calls, '三角面', i.tris);
    await page.context().close();
  }

  // ---- 整局：精准档自动驾驶在页面里打通，结算页能再来 ----
  page = await open('?auto=precise&seed=3&q=low', { width: 1280, height: 720 });
  let s = await snap(page), guard = 0;
  while (s.mode === 'play' && guard++ < 200) { await page.evaluate(() => window.__PLAYTEST__.step(3000)); s = await snap(page); }
  check('页面里整局打通', s.state === 'won' && s.sealed === 3, JSON.stringify(s));
  await page.waitForTimeout(900);
  check('结算页出来了', await page.evaluate(() => document.getElementById('menu').dataset.s === 'won' && document.querySelector('[data-f="w-rate"]').textContent.length > 1));
  await page.screenshot({ path: path.join(out, 'won.png') });
  await page.evaluate(() => window.__qilou.setAuto(null));
  await page.click('.s-won [data-act="restart"]'); await page.waitForTimeout(300);
  s = await snap(page);
  check('再玩一次：状态全部归零', s.mode === 'play' && s.sealed === 0 && s.kills === 0 && s.hp === 100 && s.t < 1, JSON.stringify(s));
  check('整局零报错', page.errs.length === 0, page.errs.slice(0, 3).join(' | '));
  await page.context().close();

  // ---- 手机：几种带浏览器栏的视口，标题页按钮点得到；触屏走、看、喷 ----
  for (const [w, h] of [[390, 664], [412, 700], [360, 600], [844, 390], [700, 340], [1200, 616]]) {
    page = await open('', { width: w, height: h }, w < 900);
    const r = await page.evaluate(() => [...document.querySelectorAll('.s-title .btn')].map(b => { const q = b.getBoundingClientRect(), e = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { t: b.textContent, in: q.top >= 0 && q.bottom <= innerHeight && q.left >= 0 && q.right <= innerWidth, hit: b.contains(e), h: q.height }; }));
    check(`${w}×${h} 标题页三个按钮都在屏内、点得到、高度够`, r.length === 3 && r.every(x => x.in && x.hit && x.h >= 44), JSON.stringify(r.filter(x => !(x.in && x.hit))));
    const ov = await page.evaluate(() => { const h1 = document.querySelector('h1').getBoundingClientRect(); return h1.right <= innerWidth + 1 && document.querySelector('.s-title').scrollWidth <= innerWidth + 1; });
    check(`${w}×${h} 标题不出屏`, ov);
    if (w === 390 || w === 844) {
      await page.screenshot({ path: path.join(out, `phone-title-${w}.png`) });
      await page.tap('[data-act="start"]'); await page.waitForTimeout(400);
      const m0 = await snap(page);
      const cdp = await page.context().newCDPSession(page), T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
      const lx = w * 0.2, ly = h * 0.6;
      await T('touchStart', [{ x: lx, y: ly, id: 1 }]); await T('touchMove', [{ x: lx, y: ly - 60, id: 1 }]); await page.waitForTimeout(1500);
      const m1 = await snap(page);
      check(`${w}×${h} 左半屏往上推是往前走`, m1.z > m0.z + 3, `z ${m0.z} → ${m1.z}`);
      await T('touchMove', [{ x: lx, y: ly - 60, id: 1 }, { x: w * 0.7, y: h * 0.4, id: 2 }]).catch(() => {});
      await T('touchStart', [{ x: lx, y: ly - 60, id: 1 }, { x: w * 0.7, y: h * 0.4, id: 2 }]); await T('touchMove', [{ x: lx, y: ly - 60, id: 1 }, { x: w * 0.7 + 70, y: h * 0.4, id: 2 }]); await page.waitForTimeout(200);
      const m2 = await snap(page);
      check(`${w}×${h} 右半屏拖动是转头`, Math.abs(m2.yaw - m1.yaw) > 0.15, (m2.yaw - m1.yaw).toFixed(2));
      await T('touchEnd', []); await page.waitForTimeout(300);
      const m3 = await snap(page); await page.waitForTimeout(400); const m4 = await snap(page);
      check(`${w}×${h} 松手后停下`, Math.abs(m4.z - m3.z) < 0.6 && Math.abs(m4.x - m3.x) < 0.6, `${(m4.z - m3.z).toFixed(2)}`);
      const fb = await page.evaluate(() => { const q = document.getElementById('b-fire').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, in: q.bottom <= innerHeight && q.right <= innerWidth && q.width >= 44 }; });
      check(`${w}×${h}「喷」按钮在屏内`, fb.in);
      await T('touchStart', [{ x: fb.x, y: fb.y, id: 3 }]); await page.waitForTimeout(250);
      check(`${w}×${h} 按住「喷」在喷`, (await snap(page)).firing);
      await page.screenshot({ path: path.join(out, `phone-play-${w}.png`) });
      await T('touchEnd', []); await page.waitForTimeout(150);
      check(`${w}×${h} 松开「喷」就停`, !(await snap(page)).firing);
      const hud = await page.evaluate(() => { const R = s => document.querySelector(s).getBoundingClientRect(), o = (a, b) => !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top); const btns = ['#b-fire', '#b-slap', '#b-jump', '#b-reload', '#b-pause'].map(R); return { over: [R('.ammo'), R('.hp'), R('.obj')].some(a => btns.some(b => o(a, b))), pair: btns.some((a, i) => btns.some((b, j) => i < j && o(a, b))) }; });
      check(`${w}×${h} 按钮之间、按钮与读数之间不重叠`, !hud.over && !hud.pair, JSON.stringify(hud));
      check(`${w}×${h} 零报错`, page.errs.length === 0, page.errs.slice(0, 2).join(' | '));
    }
    await page.context().close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, at: new Date().toISOString(), info, results }, null, 1));
  console.log(`\n${results.length - fail} / ${results.length} 通过`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
