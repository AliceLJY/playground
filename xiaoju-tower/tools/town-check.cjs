// Browser checks for chapter 2 「下塔进城」. Usage: NODE_PATH="$(npm root -g)" node tools/town-check.cjs <url-to-index> <out-dir>
// Headful GPU Chrome (software rendering skews timing). Every flow below uses real key presses or real clicks;
// the __PLAYTEST__ hooks only jump to a place or read state.
const { chromium } = require('playwright');
const [url, out] = process.argv.slice(2);
const results = []; const ok = (name, pass, info) => { results.push({ name, pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const snap = p => p.evaluate(() => window.__PLAYTEST__.snapshot());
const town = (p, fn, ...a) => p.evaluate(([fn, a]) => window.XJT_TOWNVIEW[fn](...a), [fn, a]);
async function rects(p) {
  return p.evaluate(() => {
    const r = s => { const e = document.querySelector(s); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return b.width ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; };
    return { card: r('.t-card'), map: r('#t-map'), act: r('.key.act'), up: r('.key.up'), left: r('.key.left'), right: r('.key.right'), down: r('.key.down'), hint: r('#hint'), brace: r('.key.brace'), vw: innerWidth, vh: innerHeight };
  });
}
async function hold(p, key, ms) { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); }
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  // ---------- layout in four viewports ----------
  const viewports = [['desktop', 1280, 760, false], ['phone-portrait', 390, 664, true], ['phone-landscape', 844, 390, true], ['android-portrait', 412, 700, true]];
  for (const [name, w, h, touch] of viewports) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url + '?ch=2&seed=3'); await p.waitForTimeout(900);
    const rd = await p.evaluate(() => { const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }; return { card: r('.t-ready-card'), count: r('#t-count'), shown: !document.getElementById('t-ready').hidden, vw: innerWidth, vh: innerHeight }; });
    const inV = b => b.x >= 0 && b.y >= 0 && b.x + b.w <= rd.vw + 0.5 && b.y + b.h <= rd.vh + 0.5;
    ok(`${name}: 开局说明卡和 3-2-1 都在可视区内`, rd.shown && inV(rd.card) && inV(rd.count) && !overlap(rd.card, rd.count), JSON.stringify(rd.card));
    await p.screenshot({ path: `${out}/town-${name}-ready.png` });
    await p.waitForTimeout(3600);
    // worst case: the longest hint up, standing on a dock so the E key is lit
    await p.evaluate(() => { const V = window.XJT_TOWNVIEW, d = V.docks()[0]; V.teleport(d.x, d.z, 0); const h = document.getElementById('hint'); h.hidden = false; h.innerHTML = '这是共享单车点：按 <b>E</b> 扫一辆，路上快很多（海心桥不让骑车：按 <b>E</b> 锁车，走过去）'; });
    await p.waitForTimeout(400);
    const R = await rects(p), names = ['card', 'map', 'act', 'up', 'left', 'right', 'down', 'hint'], bad = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (overlap(R[names[i]], R[names[j]])) bad.push(names[i] + '×' + names[j]);
    ok(`${name}: 打卡清单、小地图、提示、五个键互不重叠`, bad.length === 0, bad.join(', '));
    ok(`${name}: 都在可视区内`, names.every(n => R[n] && R[n].x >= 0 && R[n].y >= 0 && R[n].x + R[n].w <= R.vw + 0.5 && R[n].y + R[n].h <= R.vh + 0.5), names.filter(n => !R[n]).join(','));
    ok(`${name}: 触控键不小于 44px，抓紧键在第二章藏起来`, ['act', 'up', 'left', 'right', 'down'].every(k => R[k].w >= 44 && R[k].h >= 44) && !R.brace);
    ok(`${name}: ← → 和 E 在左半边、↑ ↓ 在右半边（两只拇指分工）`, [R.left, R.right, R.act].every(b => b.x + b.w <= R.vw / 2) && [R.up, R.down].every(b => b.x >= R.vw / 2), [R.left.x, R.right.x, R.act.x, R.up.x].map(Math.round).join(','));
    const catBox = { x: R.vw * 0.4, y: R.vh * 0.5, w: R.vw * 0.2, h: R.vh * 0.28 };
    ok(`${name}: 提示不挡小橘`, !overlap(R.hint, catBox), JSON.stringify(R.hint));
    await p.screenshot({ path: `${out}/town-${name}-hud.png` });
    // touch: the on-screen E really scans, the on-screen ↑ really moves
    if (touch) {
      const a = R.act; await p.touchscreen.tap(a.x + a.w / 2, a.y + a.h / 2); await p.waitForTimeout(150);
      const s1 = await snap(p);
      ok(`${name}: 点屏幕上的「扫车」真的开始扫码`, s1.mode === 'scan', s1.mode);
      await p.waitForTimeout(2400);
      const s2 = await snap(p); ok(`${name}: 扫完骑上车`, s2.riding, String(s2.riding));
      await p.screenshot({ path: `${out}/town-${name}-ride.png` });
    }
    ok(`${name}: 零页面报错`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // ---------- desktop: real keys through the chapter ----------
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url + '?ch=2&seed=3'); await p.waitForTimeout(500);
  const c0 = await snap(p);
  await hold(p, 'KeyW', 1500);
  const c1 = await snap(p);
  ok('倒数期间按 W 不动、计时不走、三花姐也不动', Math.hypot(c1.x - c0.x, c1.z - c0.z) < 0.01 && c1.time === c0.time && Math.hypot(c1.rival.x - c0.rival.x, c1.rival.z - c0.rival.z) < 0.01 && await p.evaluate(() => !document.getElementById('t-ready').hidden), `time ${c0.time}→${c1.time}`);
  await p.screenshot({ path: `${out}/town-countdown.png` });
  await p.waitForTimeout(2400);
  ok('倒数结束说明卡收起', await p.evaluate(() => document.getElementById('t-ready').hidden && window.XJT_TOWNVIEW.countdown() <= 0));
  ok('进第二章后网址带上 ?ch=2（刷新还在第二章）', await p.evaluate(() => new URLSearchParams(location.search).get('ch') === '2'));
  // the guide follows the route: at the start it points west towards the bridge, not north across the river
  const rt = await p.evaluate(() => { const V = window.XJT_TOWNVIEW, s = window.__PLAYTEST__.snapshot(), r = V.route(), st = V.stops()[1]; const v = new THREE.Vector3(r.steer.x, 1, r.steer.z).project(window.XJT_ENGINE.camera); return { len: r.len, straight: Math.hypot(st.x - s.x, st.z - s.z), steerX: r.steer.x, screenX: v.x, text: document.getElementById('t-next').textContent }; });
  ok('开局指路按路线：往西去海心桥（指向画面左边），路程比直线长', rt.steerX < -5 && rt.screenX < 0 && rt.len > rt.straight * 1.2, JSON.stringify(rt));
  const gpu = await p.evaluate(() => { const gl = document.querySelector('#world canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); });
  ok('渲染器不是 SwiftShader', !/swiftshader/i.test(gpu), gpu);
  const s0 = await snap(p);
  ok('开场提示在、说清按什么', s0.hint === 'start' && /↑/.test(await p.textContent('#hint')), s0.hint);
  await p.screenshot({ path: `${out}/town-open.png` });
  await hold(p, 'KeyW', 1500);
  const s1 = await snap(p);
  ok('按住 W 往前跑（真实按键）', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 8 && !s1.riding, `${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(1)} 米`);
  // ← turns her to the screen's left, as seen by the real camera right after the press
  for (const [key, want] of [['KeyA', -1], ['KeyD', 1]]) {
    await p.evaluate(() => window.XJT_TOWNVIEW.teleport(0, -40, 0)); await p.waitForTimeout(600);
    await p.keyboard.down(key); await p.waitForTimeout(260);
    const sx = await p.evaluate(() => { const s = window.__PLAYTEST__.snapshot(), E = window.XJT_ENGINE, v = new THREE.Vector3(s.x + Math.sin(s.h) * 10, 1, s.z - Math.cos(s.h) * 10).project(E.camera); return v.x; });
    await p.keyboard.up(key);
    ok(`按 ${key === 'KeyA' ? 'A（←）' : 'D（→）'} 她朝屏幕${want < 0 ? '左' : '右'}边转（按真实机位投影）`, sx * want > 0.02, `前方 10 米在屏幕 x=${sx.toFixed(3)}`);
  }
  await p.screenshot({ path: `${out}/town-turn.png` });
  // the first dock hint, a real E to scan, ride on a road, a real E to lock
  const dock = await p.evaluate(() => { const V = window.XJT_TOWNVIEW; let best = null; for (const d of V.docks()) { const k = Math.hypot(d.x, d.z + 40); if (!best || k < best.k) best = { x: d.x, z: d.z, a: d.a, k }; } return best; });
  await p.evaluate(d => window.XJT_TOWNVIEW.teleport(d.x, d.z, 0), dock); await p.waitForTimeout(500);
  const sd = await snap(p);
  ok('走到单车点，「扫一辆」提示出现、E 键亮', sd.hint === 'dock' && sd.action === 'scan' && await p.evaluate(() => document.querySelector('.key.act').classList.contains('ready')), sd.hint);
  await p.keyboard.press('KeyE'); await p.waitForTimeout(200);
  ok('按 E 开始扫码（2 秒）', (await snap(p)).mode === 'scan');
  await p.screenshot({ path: `${out}/town-scan.png` });
  await p.waitForTimeout(2100);
  const road = await p.evaluate(() => { const V = window.XJT_TOWNVIEW, T = window.XJTOWN, G = T.decodeGrid(window.XJT_TOWN); for (const r of window.XJT_TOWN.roads) if (r.k === 'secondary') for (let i = 0; i + 3 < r.p.length; i += 2) { const x = r.p[i], z = r.p[i + 1], L = Math.hypot(r.p[i + 2] - x, r.p[i + 3] - z); if (L > 60 && V.surf(x, z) === 1 && !V.blocked(x, z, true)) return { x, z, h: Math.atan2(r.p[i + 2] - x, -(r.p[i + 3] - z)) }; } });
  await p.evaluate(r => window.XJT_TOWNVIEW.teleport(r.x, r.z, r.h), road);
  await hold(p, 'KeyW', 3500);
  const sr = await snap(p);
  ok('骑上车，路上真的比跑快（>10 m/s，跑最高 9.5）', sr.riding && sr.speed > 10, `${sr.speed} m/s`);
  await p.screenshot({ path: `${out}/town-riding.png` });
  await p.keyboard.press('KeyE'); await p.waitForTimeout(900);
  ok('再按 E 锁车，回到跑步', !(await snap(p)).riding);
  // 海心桥: ride up to the south bridge head and get stopped with the hint
  const head = await p.evaluate(() => { const V = window.XJT_TOWNVIEW; for (let z = -60; z > -700; z--) for (let x = -620; x < 0; x++) if (V.surf(x, z) === 6 && V.surf(x, z + 3) !== 6 && !V.blocked(x, z + 5, true)) return { x, z: z + 5 }; });
  await p.evaluate(() => { const V = window.XJT_TOWNVIEW, d = V.docks()[0]; V.teleport(d.x, d.z, 0); }); await p.keyboard.press('KeyE'); await p.waitForTimeout(2300);
  await p.evaluate(h => window.XJT_TOWNVIEW.teleport(h.x, h.z, 0), head);
  await hold(p, 'KeyW', 2500);
  const sb = await snap(p);
  ok('骑到海心桥头被挡住，提示「按 E 锁车」', sb.hint === 'nobike' && sb.riding && await p.evaluate(() => window.XJT_TOWNVIEW.surf(window.__PLAYTEST__.snapshot().x, window.__PLAYTEST__.snapshot().z)) !== 6, sb.hint);
  await p.screenshot({ path: `${out}/town-bridge-nobike.png` });
  await p.keyboard.press('KeyE'); await p.waitForTimeout(800);
  // being stopped may have slid her sideways into the bank; walk on from the middle of the bridge mouth, as a player would steer
  await p.evaluate(h => window.XJT_TOWNVIEW.teleport(h.x, h.z, 0), head); await p.waitForTimeout(300);
  const z0 = (await snap(p)).z; let onDeckSeen = false;
  await p.keyboard.down('KeyW');
  for (let i = 0; i < 15; i++) { await p.waitForTimeout(200); onDeckSeen = onDeckSeen || await p.evaluate(() => { const s = window.__PLAYTEST__.snapshot(); return window.XJT_TOWNVIEW.surf(s.x, s.z) === 6; }); }
  await p.keyboard.up('KeyW');
  const sw = await snap(p);
  ok('锁车后走上海心桥（途中踩到桥面、往北走了 15 米以上）', !sw.riding && onDeckSeen && z0 - sw.z > 15, JSON.stringify([sw.x, sw.z, z0]));
  await p.screenshot({ path: `${out}/town-bridge-walk.png` });
  // a stop: run into the ring for the stamp
  await p.evaluate(() => window.XJT_TOWNVIEW.jump(1)); await p.waitForTimeout(400);
  await hold(p, 'KeyW', 1400);
  const ss = await snap(p);
  ok('跑进西塔的红圈，盖章（真实按键）', ss.stamps.includes(1), JSON.stringify(ss.stamps));
  await p.screenshot({ path: `${out}/town-stamp.png` });
  ok('打卡清单里西塔变成已盖章', await p.evaluate(() => document.querySelectorAll('#t-stops li')[1].classList.contains('done')));
  // 三花姐's frames follow her facing as the camera sees it (left and right drawn separately, never mirrored)
  const camYaw = (await snap(p)).camYaw;
  const facings = [];
  for (const [dh, want] of [[0, 'Back'], [Math.PI, 'Front'], [Math.PI / 2, 'Right'], [-Math.PI / 2, 'Left']]) {
    await p.evaluate(([y, dh]) => window.XJT_TOWNVIEW.rivalAt(Math.sin(y) * 12, -Math.cos(y) * 12, y + dh, 8, 0.6), [camYaw, dh]);
    await p.waitForTimeout(150);
    const fr = await p.evaluate(() => window.XJT_ENGINE.rivalFrame);
    facings.push(fr + (fr.includes(want) ? '' : '≠' + want));
  }
  ok('三花姐跑起来按镜头里的朝向换前、后、左、右帧', facings.every(f => !f.includes('≠')), facings.join(','));
  await p.evaluate(([y]) => window.XJT_TOWNVIEW.rivalAt(Math.sin(y) * 10 + 3, -Math.cos(y) * 10, y + Math.PI / 2, 8, 0.6), [camYaw]);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${out}/town-rival-side.png` });
  // the end: stamp the rest, the end panel, its buttons, and a real click on 再跑一次
  await p.evaluate(() => { const V = window.XJT_TOWNVIEW; V.rivalFinish(window.__PLAYTEST__.snapshot().time - 200); V.stampAll(); }); await p.waitForTimeout(2600);
  const verdict = await p.textContent('#t-verdict');
  ok('输了好几分钟，结尾写清早了多少（不再一律写「先到一步」）', /早你 \d+:\d\d/.test(verdict) && !/一步/.test(verdict), verdict);
  const end = await p.evaluate(() => ['#t-save', '#t-again', '#t-tower'].map(s => { const e = document.querySelector(s), b = e.getBoundingClientRect(), c = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { s, x: b.x, y: b.y, w: b.width, h: b.height, hit: e.contains(c) }; }));
  ok('三处盖完出结尾面板，三个按钮完整可点', !(await p.evaluate(() => document.getElementById('t-end').hidden)) && end.every(e => e.hit && e.h >= 44 && e.x >= 0 && e.y + e.h <= 760), JSON.stringify(end.map(e => e.hit)));
  await p.screenshot({ path: `${out}/town-end.png` });
  await p.click('#t-again'); await p.waitForTimeout(600);
  const sa = await snap(p);
  ok('点「再跑一次」回到塔脚、清单清空', sa.stamps.length === 0 && Math.hypot(sa.x, sa.z + 40) < 3, JSON.stringify([sa.x, sa.z, sa.stamps]));
  // performance at street level, looking up the 花城广场 axis
  await p.evaluate(() => window.XJT_TOWNVIEW.teleport(0, -760, 0)); await p.waitForTimeout(2500);
  const perf = await p.evaluate(() => ({ calls: window.XJT_ENGINE.renderer.info.render.calls, tris: window.XJT_ENGINE.renderer.info.render.triangles }));
  const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
  ok('街区 draw call ≤ 80、三角形 ≤ 80 万', perf.calls <= 80 && perf.tris <= 800000, `${perf.calls} calls, ${perf.tris} tris, ${fps.toFixed(1)} fps（${gpu}）`);
  await p.screenshot({ path: `${out}/town-axis.png` });
  ok('桌面这一轮零页面报错', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ---------- entering from chapter 1: the intro button and the postcard button ----------
  const c2 = await b.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
  const q = await c2.newPage(); const e2 = []; q.on('pageerror', e => e2.push(e.message));
  await q.goto(url + '?seed=5'); await q.waitForTimeout(2000);
  await q.click('#to-town2'); await q.waitForTimeout(800);
  ok('开场面板点「第二章 · 下塔进城」进到第二章', await q.evaluate(() => window.__PLAYTEST__.chapter()) === 2 && !(await q.evaluate(() => document.getElementById('t-hud').hidden)));
  await q.click('#t-tower').catch(() => {});
  await q.evaluate(() => { window.XJT_TOWNVIEW.exit(); window.XJT_ENGINE.backToTower(); }); await q.waitForTimeout(500);
  ok('回塔上：回到第一章开场，网址去掉 ch', await q.evaluate(() => window.__PLAYTEST__.chapter()) === 1 && !(await q.evaluate(() => document.getElementById('intro').hidden)) && await q.evaluate(() => !new URLSearchParams(location.search).has('ch')));
  await q.evaluate(() => { const T = window.__PLAYTEST__; T.start(); T.teleport(0.999, 0); T.step(200); });
  await q.waitForTimeout(5200);
  await q.click('#ride-tram'); await q.waitForTimeout(13000);
  const pcShown = await q.evaluate(() => !document.getElementById('postcard').hidden);
  await q.click('#to-town'); await q.waitForTimeout(800);
  ok('第一章明信片上点「下塔进城」进到第二章，先出说明卡倒数', pcShown && await q.evaluate(() => window.__PLAYTEST__.chapter()) === 2 && await q.evaluate(() => !document.getElementById('t-ready').hidden));
  await q.reload(); await q.waitForTimeout(1500);
  ok('在第二章里刷新，还是第二章', await q.evaluate(() => window.__PLAYTEST__.chapter()) === 2);
  ok('章节切换零页面报错', e2.length === 0, e2.join(' | '));
  await c2.close();
  await b.close();
  const fails = results.filter(r => !r.pass);
  console.log(`${results.length - fails.length}/${results.length} passed`);
  require('fs').writeFileSync(`${out}/town-check.json`, JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
})();
