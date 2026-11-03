// 竖屏演示片（给人看，不是验收）：标题页 → 出发 → 第 1 关（拖动走位、选卡、自动升级、首领、结算）→ 第 3 关额度重置高光 → 署名尾页。
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <base-url> <out-dir> [endcard-dir]
//   base-url 例 http://127.0.0.1:8936/coal-breakout/ ；endcard-dir 里放 endcard.html/endcard.js/config.js（署名尾页模板副本）。
// 录法同 jianmen-drizzle/tools/demo.cjs：page.clock 接管时钟，每帧推进（倍速 × 1/30 s）再按设备像素截图。
// 画面是真实游戏运行：输入是 CDP 触摸拖动（方向由 src/pilot.js 的 human 模式算，只产输入），选卡是真实点按。
// 加速只靠每帧多推进页面时钟；关键时刻（选卡、自动升级、首领、额度重置）回到 1 倍。
// 手指位置用一个不拦截事件的圆点画在页面上（不进游戏状态），位置与透明度每帧由脚本直接设定，不用 CSS 过渡。
// 逐帧事件时间写进 events.json，tools/demo-music.py 按它合成卡点配乐。本页面没有 CSS 过渡/动画（index.html 只有 :active 位移）。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [base = 'http://127.0.0.1:8936/coal-breakout/', outDir = 'demo-out', endDir] = process.argv.slice(2);
const FPS = 30, W = 390, H = 694, DPR = 1080 / 390;
const frames = path.join(outDir, 'frames'); fs.mkdirSync(frames, { recursive: true });
for (const f of fs.readdirSync(frames)) fs.unlinkSync(path.join(frames, f));
let n = 0; const ev = { fps: FPS, marks: [] }, log = [];
const mark = (name, extra) => { const t = n / FPS; ev.marks.push({ name, t, ...extra }); console.log(name, t.toFixed(2), extra ? JSON.stringify(extra) : ''); };

async function overlay(page) {
  await page.evaluate(() => {
    const mk = (id, css) => { const d = document.createElement('div'); d.id = id; d.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:99;border-radius:50%;display:none;transform:translate(-50%,-50%);' + css; document.body.append(d); return d; };
    mk('demo-anchor', 'width:58px;height:58px;border:2px solid rgba(244,241,222,.35);');
    mk('demo-finger', 'width:34px;height:34px;background:rgba(244,241,222,.42);border:2px solid rgba(244,241,222,.8);');
    mk('demo-tap', 'width:44px;height:44px;border:3px solid rgba(114,241,196,.9);');
    window.__demoDraw = (o) => {
      for (const [id, v] of Object.entries(o)) { const d = document.getElementById(id); if (!v) { d.style.display = 'none'; continue; }
        d.style.display = 'block'; d.style.left = v.x + 'px'; d.style.top = v.y + 'px'; d.style.opacity = v.a ?? 1; if (v.s) { d.style.width = d.style.height = v.s + 'px'; } }
    };
  });
}

async function session(browser, { level, seed, init }, plan) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto(base + '?test&seed=' + seed);
  await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50 });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  await overlay(page);
  await page.evaluate((seed) => { window.__pilot = CoalPilot.create('human', seed); }, seed);
  const cdp = await ctx.newCDPSession(page);
  let speed = 1, held = false, origin = null, finger = null, tap = null, tapAge = 99;
  const st = () => page.evaluate(() => { const s = __PLAYTEST__.state(); return { tick: s.tick, phase: s.phase, level: s.level, xp: s.xp, nextXP: s.nextXP, boss: s.boss, bossHP: s.boss >= 0 ? s.eHP[s.boss] : 0, bossMax: s.stage.bossHP, dur: s.stage.duration, warning: s.warning, off: s.off, burst: s.burst, autoCard: s.autoCard, autoUntil: s.autoUntil, hp: s.hp, kills: s.kills, x: s.x, y: s.y, stage: s.stageIndex }; });
  const draw = async () => {
    tapAge++;
    await page.evaluate(o => __demoDraw(o), {
      'demo-anchor': held && origin ? { x: origin.x, y: origin.y, a: .9 } : null,
      'demo-finger': held && finger ? { x: finger.x, y: finger.y, a: 1 } : null,
      'demo-tap': tap && tapAge < 10 ? { x: tap.x, y: tap.y, a: 1 - tapAge / 10, s: 30 + tapAge * 5 } : null });
  };
  const shot = async (mult = 1) => {
    await draw();
    await page.clock.runFor(Math.round(1000 / FPS * mult));
    await page.screenshot({ path: path.join(frames, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: 1920 / DPR } });
    n++; if (n % 300 === 0) console.log('frame', n);
  };
  const hold = async (sec) => { for (let i = 0; i < Math.round(sec * FPS); i++) await shot(1); };
  const tapAt = async (x, y) => { tap = { x, y }; tapAge = 0; await page.touchscreen.tap(x, y); };
  const tapSel = async (sel) => { const b = await page.locator(sel).boundingBox(); await tapAt(b.x + b.width / 2, b.y + b.height / 2); };
  const touchEnd = async () => { if (held) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); held = false; } };
  const canvasBox = await page.locator('#game').boundingBox();
  const home = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height * .78 };
  const steer = async () => {
    const a = await page.evaluate(() => { const o = __pilot(__PLAYTEST__.state()); return [o[0], o[1]]; });
    if (!held) { origin = { ...home }; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: origin.x, y: origin.y }] }); held = true; }
    finger = { x: origin.x + a[0] * 40, y: origin.y + a[1] * 40 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: finger.x, y: finger.y }] });
  };
  return { page, cdp, errors, st, shot, hold, tapAt, tapSel, touchEnd, steer, ctx,
    get speed() { return speed; }, set speed(v) { speed = v; } };
}

// One play loop; target(state) returns desired speed; stop(state) ends it. Card picks: first one dwells, later ones quick.
async function play(S, target, stop, opts = {}) {
  let picks = 0, last = await S.st(), speed = 1, autoSeen = false;
  for (let guard = 0; guard < 20000; guard++) {
    const s = await S.st();
    if (s.phase === 3) throw new Error('died at tick ' + s.tick);
    if (s.boss >= 0 && last.boss < 0) mark('boss', { tick: s.tick, stage: s.stage });
    if (s.warning > 0 && last.warning === 0) mark('warning', { tick: s.tick });
    if (s.off > 0 && last.off === 0) mark('off', { tick: s.tick });
    if (s.burst > 0 && last.burst === 0) mark('burst', { tick: s.tick });
    if (s.burst === 0 && last.burst > 0) mark('burstEnd', { tick: s.tick });
    if (s.autoCard >= 0 && s.autoUntil !== last.autoUntil) { mark(autoSeen ? 'autoQuiet' : 'auto', { tick: s.tick, card: s.autoCard }); autoSeen = true; }
    if (s.phase === 2 && last.phase !== 2) { mark('won', { tick: s.tick, stage: s.stage }); }
    last = s;
    if (stop(s)) return;
    if (s.phase === 1) {
      await S.touchEnd();
      const first = picks === 0 && opts.dwellFirst;
      mark(first ? 'levelup' : 'levelupQuick', { tick: s.tick, rank: s.level });
      await S.hold(first ? opts.dwellFirst : .5);
      const i = await S.page.evaluate(() => __pilot(__PLAYTEST__.state())[2]);
      await S.tapSel(`.card >> nth=${Math.max(0, i)}`);
      await S.hold(first ? .4 : .15);
      const after = await S.st(); if (after.phase === 1) throw new Error('card tap did not register');
      mark('picked', { card: i }); picks++; speed = 1; continue;
    }
    if (s.phase === 0) await S.steer();
    const want = target(s);
    speed += (want - speed) * (want < speed ? .5 : .12); if (Math.abs(want - speed) < .03) speed = want;
    await S.shot(speed);
  }
  throw new Error('play loop guard');
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  // ---------- Part A: normal entry, level 1, seed 7
  const A = await session(browser, { level: 0, seed: 7 });
  mark('title'); await A.hold(2.6);
  await A.tapSel('#start'); mark('start'); await A.hold(.3);
  let firstAuto = true;
  await play(A, s => {
    if (s.tick < 420) return 1;                                         // opening at normal speed
    if (firstAuto && s.level === 2 && s.xp >= s.nextXP - 3) return 1;   // the first auto-upgrade at normal speed
    if (firstAuto && s.autoCard >= 0 && s.tick < s.autoUntil + 30) return 1;
    if (s.autoCard >= 0 && s.tick >= s.autoUntil + 30) firstAuto = false;
    if (s.boss < 0) return s.tick > s.dur - 150 ? 1 : 6;                // slow down before the boss arrives
    const frac = s.bossHP / s.bossMax, since = s.tick - s.dur;
    return since < 180 || frac < .22 ? 1 : 3;                            // entrance and finish at normal speed
  }, s => s.phase === 2, { dwellFirst: 2.8 });
  await A.touchEnd();
  mark('result'); await A.hold(3.4);
  if (A.errors.length) throw new Error('page errors A ' + A.errors.join('; '));
  await A.ctx.close();

  // ---------- Part B: level 3 「额度重置」 highlight, progress pre-set so the level is unlocked
  const B = await session(browser, { level: 2, seed: 7, init: () => { try { localStorage.setItem('coal-breakout-progress-v1', '3'); } catch (_) {} } });
  mark('title3'); await B.hold(.7);
  await B.tapSel('#levels button >> nth=2'); await B.hold(1.1);
  await B.tapSel('#start'); mark('start3'); await B.hold(.3);
  let endAt = null;
  await play(B, s => (s.tick < 150 || s.tick > 2120) ? 1 : 6, s => { if (s.burst === 0 && s.tick > 2700 && endAt === null) endAt = s.tick + 30; return endAt !== null && s.tick >= endAt; }, { dwellFirst: .8 });
  if (B.errors.length) throw new Error('page errors B ' + B.errors.join('; '));
  await B.ctx.close();

  // ---------- Part C: signature endcard, rendered from the template copy, 1080×1920
  if (endDir) {
    const page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
    await page.goto('file://' + path.resolve(endDir, 'endcard.html'));
    await page.waitForFunction(() => window.__ready, null, { polling: 50 });
    const dur = await page.evaluate(() => __duration()) + 1.2;
    mark('endcard', { seconds: dur });
    for (let i = 0; i < Math.round(dur * FPS); i++) {
      await page.evaluate(t => __seek(t), i / FPS);
      await page.locator('#c').screenshot({ path: path.join(frames, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); n++;
    }
  }
  await browser.close();
  ev.seconds = n / FPS; ev.frames = n;
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify(ev, null, 2));
  console.log(JSON.stringify({ frames: n, seconds: ev.seconds }));
})().catch(e => { console.error(e); process.exit(1); });
