// Browser checks for 小橘爬塔. Usage: NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <url> <out-dir>
// Runs a GPU (headful) Chrome: software rendering changes frame timing and gives false results.
const { chromium } = require('playwright');
const [url, out] = process.argv.slice(2);
const results = []; const ok = (name, pass, info) => { results.push({ name, pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
async function rects(p) {
  return p.evaluate(() => {
    const r = s => { const e = document.querySelector(s); if (!e || e.hidden || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return null; const b = e.getBoundingClientRect(); return b.width ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; };
    return { choice: r('#choice'), opt1: r('#choice .opt[data-pick="1"]'), opt2: r('#choice .opt[data-pick="2"]'), race: r('#h-race'), meter: r('.meter'), stats: r('.stats'), brace: r('.key.brace'), up: r('.key.up'), left: r('.key.left'), right: r('.key.right'), down: r('.key.down'), hint: r('#hint'), gust: r('#gust-bar'), kite: r('#kite-bar'), vw: innerWidth, vh: innerHeight };
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
    ok(`${name}: 比赛读数在高度表里、看得见`, R.race && R.race.w > 60 && R.race.y >= R.meter.y && R.race.y + R.race.h <= R.meter.y + R.meter.h, JSON.stringify(R.race));
    await p.screenshot({ path: `${out}/${name}-hud.png` });
    // the stair / snack choice panel, with both warning bars up
    for (const [where, k] of [['栈道岔路', 17], ['餐厅点心', 43]]) {
      await p.evaluate(k => { const T = window.__PLAYTEST__; T.calm(); T.teleport(k / 46, 0); document.getElementById('hint').hidden = true; }, k);
      await p.waitForTimeout(300);
      await p.evaluate(() => { document.getElementById('kite-bar').classList.add('on'); document.getElementById('gust-bar').classList.add('on'); });
      const Q = await rects(p);
      const bad2 = []; for (const n of ['meter', 'stats', 'brace', 'up', 'left', 'right', 'down', 'gust', 'kite']) if (overlap(Q.choice, Q[n])) bad2.push('choice×' + n);
      if (overlap(Q.opt1, Q.opt2)) bad2.push('opt1×opt2');
      const inside2 = Q.choice && Q.choice.x >= 0 && Q.choice.y >= 0 && Q.choice.x + Q.choice.w <= Q.vw && Q.choice.y + Q.choice.h <= Q.vh;
      ok(`${name}: ${where}面板出现、不压按键读数、两个选项 ≥44px`, !!Q.choice && bad2.length === 0 && inside2 && Q.opt1.h >= 44 && Q.opt2.h >= 44, bad2.join(', ') + ' ' + JSON.stringify(Q.choice));
      if (k === 17) await p.screenshot({ path: `${out}/${name}-fork.png` });
    }
    // ending panel with the two rides, then the postcard panel: buttons whole and on screen
    await p.evaluate(() => { const T = window.__PLAYTEST__; T.teleport(0.999, 0); });
    await p.evaluate(() => window.__PLAYTEST__.step(200));
    await p.waitForTimeout(5200);
    const E = await p.evaluate(() => ['#ride-tram', '#ride-drop', '#again'].map(s => { const b = document.querySelector(s).getBoundingClientRect(); const c = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { s, x: b.x, y: b.y, w: b.width, h: b.height, hit: document.querySelector(s).contains(c) }; }));
    const inV = b => b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h && b.h >= 44 && b.hit;
    ok(`${name}: 结算面板的摩天轮、极速云霄、再爬一次完整可点`, E.every(inV) && !overlap(E[0], E[1]), JSON.stringify(E.map(b => [b.s, Math.round(b.y), Math.round(b.h), b.hit])));
    await p.screenshot({ path: `${out}/${name}-ending.png` });
    await p.click('#ride-tram'); await p.evaluate(() => window.__PLAYTEST__.step(12000)); await p.waitForTimeout(600);
    const PC = await p.evaluate(() => ['#pc-save', '#again2', '#pc-img'].map(s => { const b = document.querySelector(s).getBoundingClientRect(); const c = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { s, x: b.x, y: b.y, w: b.width, h: b.height, hit: document.querySelector(s).contains(c) }; }));
    ok(`${name}: 明信片面板：图和两个按钮都在屏内`, PC.slice(0, 2).every(inV) && PC[2].w > 120 && PC[2].y >= 0 && PC[2].y + PC[2].h <= PC[0].y, JSON.stringify(PC.map(b => [b.s, Math.round(b.y), Math.round(b.h), Math.round(b.w)])));
    await p.screenshot({ path: `${out}/${name}-postcard.png` });
    await p.click('#again2'); await p.waitForTimeout(400);   // back to the foot of the tower for the touch test
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
  // race with real keys: 三花姐 climbs on the column to the screen-left, the gap readout follows
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url + '?seed=5&time=day'); await p.waitForTimeout(2000);
    await p.click('#vs-race'); await p.click('#start');
    await p.keyboard.down('KeyW'); await p.waitForTimeout(3000); await p.keyboard.up('KeyW'); await p.waitForTimeout(300);
    const a = await p.evaluate(() => ({ s: window.__PLAYTEST__.snapshot(), txt: document.getElementById('h-race').textContent, shown: !document.getElementById('h-race').hidden }));
    await p.screenshot({ path: `${out}/race-start.png` });
    const side = await p.evaluate(() => { const T = window.__PLAYTEST__; T.calm(); T.teleport(12 / 46, 0); T.rivalAt(6); return true; });
    await p.waitForTimeout(700);
    const b2 = await p.evaluate(() => ({ s: window.__PLAYTEST__.snapshot(), txt: document.getElementById('h-race').textContent }));
    await p.screenshot({ path: `${out}/race-together.png` });
    ok('比赛（真实按键）：三花姐也在爬、在左边那根柱子，读数写着她高你多少', a.shown && a.s.rivalY > 2 && a.s.rivalCol === 1 && a.txt.includes('三花姐') && side && b2.s.gap > 3 && b2.txt.includes('+' + Math.round(b2.s.gap)) && b2.txt.includes('在你上面'), JSON.stringify({ rivalY: a.s.rivalY, txt: a.txt, after: b2.txt }));
    ok('比赛页零报错', errs.length === 0, errs.join(' | '));
    await ctx.close(); }
  // solo: no rival, no readout
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage();
    await p.goto(url + '?seed=5&time=day'); await p.waitForTimeout(1800);
    await p.click('#vs-solo'); await p.click('#start'); await p.keyboard.down('KeyW'); await p.waitForTimeout(1500); await p.keyboard.up('KeyW');
    const s = await p.evaluate(() => ({ s: window.__PLAYTEST__.snapshot(), hidden: getComputedStyle(document.getElementById('h-race')).display }));
    ok('自己爬：没有三花姐，也没有比赛读数', s.s.race === false && s.s.rivalY === null && s.hidden === 'none', JSON.stringify({ race: s.s.race, d: s.hidden }));
    await ctx.close(); }
  // the Spider Walk with the real E key: wind blows past, nothing happens
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url + '?seed=5&time=day'); await p.waitForTimeout(1800);
    await p.click('#start'); await p.evaluate(() => window.__PLAYTEST__.teleport(17 / 46, 0)); await p.waitForTimeout(500);
    const c0 = await p.evaluate(() => window.__PLAYTEST__.snapshot().choice);
    await p.keyboard.press('KeyE'); await p.waitForTimeout(300);
    await p.keyboard.down('KeyW'); await p.waitForTimeout(1500);
    const frames = new Set(); for (let i = 0; i < 12; i++) { frames.add(await p.evaluate(() => window.__PLAYTEST__.snapshot().frame)); await p.waitForTimeout(80); }
    const g = await p.evaluate(() => { const T = window.__PLAYTEST__, s = T.snapshot(); return s; });
    await p.screenshot({ path: `${out}/stairs.png` });
    await p.keyboard.up('KeyW');
    await p.evaluate(() => window.__PLAYTEST__.step(40000));        // ride out several gusts inside
    const s2 = await p.evaluate(() => ({ s: window.__PLAYTEST__.snapshot(), ev: window.__PLAYTEST__.hits() }));
    ok('栈道上是跑台阶的姿势，不是攀爬帧（Alice 11-23：「不是爬楼梯么，应该是跑的姿势啊」）', [...frames].every(f => f.startsWith('run')) && frames.size >= 3, [...frames].join(','));
    ok('蜘蛛侠栈道（真实按键 E）：岔路出现，进了栈道往上走，里面刮风不掉', c0 === 'fork' && g.mode === 'stairs' && g.y > 170 && s2.ev.includes('stairs-in') && !s2.ev.includes('gust-fall') && s2.s.gustFalls === 0, JSON.stringify({ c0, mode: g.mode, y: g.y, falls: s2.s.gustFalls }));
    ok('栈道页零报错', errs.length === 0, errs.join(' | '));
    await ctx.close(); }
  // revolving restaurant: tap 虾饺, the stamina cap goes up
  { const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
    await p.goto(url + '?seed=5&time=dusk'); await p.waitForTimeout(1800);
    await p.evaluate(() => { const T = window.__PLAYTEST__; T.start(); T.calm(); T.teleport(43 / 46, 0); }); await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/restaurant.png` });
    await p.tap('#choice .opt[data-pick="2"]'); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/restaurant-eating.png` });
    await p.waitForTimeout(1800);
    const s = await p.evaluate(() => ({ s: window.__PLAYTEST__.snapshot(), label: document.querySelector('.stamina span').textContent }));
    ok('旋转餐厅（手机点按）：点「虾饺」吃完，体力上限 130，体力条写 +30', s.s.ate === 'xiajiao' && s.s.staminaMax === 130 && s.s.stamina > 120 && s.label.includes('+30'), JSON.stringify({ ate: s.s.ate, max: s.s.staminaMax, st: s.s.stamina, label: s.label }));
    await ctx.close(); }
  // both finishes with real clicks, then the postcard with the three OSM names, then climb again
  for (const kind of ['tram', 'drop']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url + '?seed=5&time=night'); await p.waitForTimeout(1800);
    await p.evaluate(() => { const T = window.__PLAYTEST__; T.start(); T.calm(); T.teleport(0.985, 3); });
    await p.keyboard.down('KeyW'); await p.waitForTimeout(3500); await p.keyboard.up('KeyW');
    await p.waitForTimeout(5200);
    await p.click('#ride-' + kind); await p.waitForTimeout(kind === 'tram' ? 3000 : 4500);
    await p.screenshot({ path: `${out}/ride-${kind}.png` });
    const mid = await p.evaluate(() => window.__PLAYTEST__.snapshot());
    await p.waitForTimeout(kind === 'tram' ? 9000 : 5500);
    const s = await p.evaluate(() => ({ s: window.__PLAYTEST__.snapshot(), shown: !document.getElementById('postcard').hidden, src: document.getElementById('pc-img').src.slice(0, 22) }));
    await p.screenshot({ path: `${out}/postcard-${kind}.png` });
    const img = await p.evaluate(() => document.getElementById('pc-img').src); require('fs').writeFileSync(`${out}/card-${kind}.png`, Buffer.from(img.split(',')[1], 'base64'));
    const L = s.s.postcard ? s.s.postcard.labels : [];
    const names = L.filter(l => l.inside).map(l => l.label).sort().join(',');
    let lb = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (overlap(L[i].box, L[j].box)) lb.push(L[i].label + '×' + L[j].label);
    ok(`收尾 ${kind === 'tram' ? '摩天轮' : '极速云霄'}（真实点击）：坐完上 488 米，明信片标出海心沙、西塔、东塔，标签不叠`, (mid.finale === 'ride' || mid.finale === 'falling') && s.shown && s.src === 'data:image/png;base64,' && names === '东塔,海心沙,西塔' && lb.length === 0, JSON.stringify({ mid: mid.finale, names, lb }));
    await p.click('#again2'); await p.waitForTimeout(800);
    const r = await p.evaluate(() => window.__PLAYTEST__.snapshot());
    ok(`收尾 ${kind}：明信片上的「再爬一次」回到塔脚`, r.y < 1 && r.playing && !r.ended && r.finale === null, JSON.stringify({ y: r.y, playing: r.playing, finale: r.finale }));
    ok(`收尾 ${kind} 页零报错`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
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
