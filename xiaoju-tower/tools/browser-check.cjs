// Browser checks for 小橘爬塔. Usage: NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <url> <out-dir>
// Runs a GPU (headful) Chrome: software rendering changes frame timing and gives false results.
const { chromium } = require('playwright');
const [url, out] = process.argv.slice(2);
const results = []; const ok = (name, pass, info) => { results.push({ name, pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
async function rects(p) {
  return p.evaluate(() => {
    const r = s => { const e = document.querySelector(s); if (!e || e.hidden || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return null; const b = e.getBoundingClientRect(); return b.width ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; };
    return { meter: r('.meter'), stats: r('.stats'), brace: r('.key.brace'), up: r('.key.up'), left: r('.key.left'), right: r('.key.right'), down: r('.key.down'), hint: r('#hint'), gust: r('#gust-bar'), kite: r('#kite-bar'), vw: innerWidth, vh: innerHeight };
  });
}
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  const viewports = [['desktop', 1280, 760, false], ['phone-portrait', 390, 664, true], ['phone-landscape', 844, 390, true], ['android-portrait', 412, 700, true]];
  for (const [name, w, h, touch] of viewports) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url + '?seed=5'); await p.waitForTimeout(2500);
    const start = await p.evaluate(() => { const b = document.getElementById('start').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight, hit: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === document.getElementById('start') || document.getElementById('start').contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)) }; });
    ok(`${name}: 开始按钮完整可点`, start.x >= 0 && start.y >= 0 && start.x + start.w <= start.vw && start.y + start.h <= start.vh && start.hit, JSON.stringify(start));
    await p.screenshot({ path: `${out}/${name}-intro.png` });
    const introHidden = await p.evaluate(() => ['hud', 'pad'].map(id => getComputedStyle(document.getElementById(id)).display));
    ok(`${name}: 开场时 HUD 和按键真的藏起来`, introHidden.every(d => d === 'none'), introHidden.join(','));
    await p.evaluate(() => window.__PLAYTEST__.start());
    // force a visible hint + gust warning to test the worst-case layout
    await p.evaluate(() => { document.getElementById('kite-bar').classList.add('on'); const g = document.getElementById('gust-bar'); g.classList.add('on'); const h = document.getElementById('hint'); h.hidden = false; h.innerHTML = '起风了！按住 <b>抓紧</b>，扛过去再松开'; });
    await p.waitForTimeout(500);
    const R = await rects(p);
    const names = ['meter', 'stats', 'brace', 'up', 'left', 'right', 'down', 'hint', 'gust', 'kite'];
    const bad = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (!(names[i] === 'gust' && names[j] === 'kite') && overlap(R[names[i]], R[names[j]])) bad.push(names[i] + '×' + names[j]);
    ok(`${name}: 按钮、读数、提示互不重叠`, bad.length === 0, bad.join(', '));
    const inside = names.every(n => !R[n] || (R[n].x >= 0 && R[n].y >= 0 && R[n].x + R[n].w <= R.vw + 0.5 && R[n].y + R[n].h <= R.vh + 0.5));
    ok(`${name}: 界面元素都在可视区内`, inside);
    const keys = ['brace', 'up', 'left', 'right', 'down'].map(k => R[k]).filter(Boolean);
    ok(`${name}: 触控键不小于 44px`, keys.every(k => k.w >= 44 && k.h >= 44), keys.map(k => Math.round(k.w) + 'x' + Math.round(k.h)).join(' '));
    // hint must not cover the cat: the cat sits around 50–70% of the screen height, centred
    const catBox = { x: R.vw * 0.42, y: R.vh * 0.45, w: R.vw * 0.16, h: R.vh * 0.3 };
    ok(`${name}: 提示不挡小橘`, !overlap(R.hint, catBox));
    await p.screenshot({ path: `${out}/${name}-hud.png` });
    // touch input sends the same intent
    if (touch) {
      await p.evaluate(() => { const h = document.getElementById('hint'); h.hidden = true; document.getElementById('gust-bar').classList.remove('on'); });
      const up = R.up; await p.touchscreen.tap(up.x + up.w / 2, up.y + up.h / 2);
      const k = await p.$('.key.up'); const bb = await k.boundingBox();
      await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(1200);
      const s1 = await p.evaluate(() => window.__PLAYTEST__.snapshot()); await p.mouse.up(); await p.waitForTimeout(200);
      const s2 = await p.evaluate(() => window.__PLAYTEST__.snapshot());
      ok(`${name}: 按住屏幕 ↑ 真的往上爬，松开就停`, s1.y > 1.5 && !s2.input.up, `y=${s1.y} 松开后 up=${s2.input.up}`);
    }
    ok(`${name}: 页面零报错`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  // black kite with real keys: the warning shows, ← moves off the locked column, the dive misses
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url + '?seed=5&time=day'); await p.waitForTimeout(2000);
    await p.evaluate(() => { window.__PLAYTEST__.start(); window.__PLAYTEST__.teleport(20 / 46, 0); window.__PLAYTEST__.jumpToKite(); });
    await p.waitForTimeout(900);
    const warn = await p.evaluate(() => ({ s: window.__PLAYTEST__.snapshot(), bar: getComputedStyle(document.getElementById('kite-bar')).opacity, hint: document.getElementById('hint').textContent }));
    await p.screenshot({ path: `${out}/kite-warn.png` });
    await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(150); await p.keyboard.up('ArrowLeft'); await p.waitForTimeout(1800);
    const ev = await p.evaluate(() => window.__PLAYTEST__.hits());
    await p.screenshot({ path: `${out}/kite-after.png` });
    ok('黑鸢：预警条亮、提示出现，按 ← 换柱后扑空', warn.s.kite === 'warn' && +warn.bar > 0.5 && warn.hint.includes('黑鸢') && ev.includes('kite-dodged') && !ev.includes('kite-hit'), JSON.stringify({ kite: warn.s.kite, bar: warn.bar, ev: ev.filter(x => x.startsWith('kite')) }));
    ok('黑鸢页零报错', errs.length === 0, errs.join(' | '));
    await ctx.close(); }
  // let go = rest, with real keys
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage();
    await p.goto(url + '?seed=5&time=day'); await p.waitForTimeout(2000);
    await p.evaluate(() => window.__PLAYTEST__.start());
    await p.keyboard.down('KeyW'); await p.waitForTimeout(3000); await p.keyboard.up('KeyW');
    const a = await p.evaluate(() => window.__PLAYTEST__.snapshot());
    await p.waitForTimeout(700);   // read while still refilling: a full bar switches the label back
    const r = await p.evaluate(() => ({ s: window.__PLAYTEST__.snapshot(), label: document.querySelector('.stamina span').textContent, glow: document.querySelector('.stamina').classList.contains('resting') }));
    const onRing = Math.abs(r.s.y / (454 / 46) - Math.round(r.s.y / (454 / 46))) < 0.02;
    ok('松手就抓最近的横梁歇：没退回塔脚、体力在涨、体力条写「歇脚中」', onRing && r.s.y > 5 && r.s.stamina > a.stamina && r.label.includes('歇脚') && r.glow, JSON.stringify({ before: [a.y, a.stamina], after: [r.s.y, r.s.stamina], label: r.label }));
    await p.screenshot({ path: `${out}/rest.png` });
    await ctx.close(); }
  // ending: teleport just below the top and climb
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url + '?seed=5'); await p.waitForTimeout(2000);
  await p.evaluate(() => { window.__PLAYTEST__.start(); window.__PLAYTEST__.teleport(0.985, 3); });
  await p.keyboard.down('KeyW'); await p.waitForTimeout(3500); await p.keyboard.up('KeyW');
  let s = await p.evaluate(() => window.__PLAYTEST__.snapshot());
  ok('登顶后进入结尾', s.done && s.ended, JSON.stringify({ y: s.y, done: s.done, ended: s.ended }));
  await p.waitForTimeout(3000); await p.screenshot({ path: `${out}/ending-show.png` });
  await p.waitForTimeout(3000); await p.screenshot({ path: `${out}/ending-panel.png` });
  const panel = await p.evaluate(() => !document.getElementById('ending').hidden);
  const endHidden = await p.evaluate(() => ['hud', 'pad'].map(id => getComputedStyle(document.getElementById(id)).display));
  ok('结尾时 HUD 和按键真的藏起来', endHidden.every(d => d === 'none'), endHidden.join(','));
  ok('结算面板出现', panel);
  await p.click('#again'); await p.waitForTimeout(800);
  s = await p.evaluate(() => window.__PLAYTEST__.snapshot());
  ok('再爬一次回到塔脚', s.y < 1 && s.playing && !s.ended, JSON.stringify({ y: s.y, playing: s.playing }));
  ok('结尾页零报错', errs.length === 0, errs.join(' | '));
  await b.close();
  const fails = results.filter(r => !r.pass).length; console.log(`\n${results.length - fails}/${results.length} passed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(2); });
