// 竖屏演示片（给人看，不是验收），第二版（按 Muse 冷读审片重剪，意见见产出目录 Muse审片.md）：
//   开场钩子 2 秒（第 3 关停火→火力爆发实机 + 大字片名）→ 标题页 0.8 秒（声音已开）→ 第 1 关完整流程（每次选卡停 ≥2.5 秒、
//   自动升级按 1 倍速放 ≥1.6 秒、首领、结算）→ 第 3 关标题页 → 跳过开局（画面角标写明跳过几秒）→ 额度重置红条预警、停火、爆发 → 收住 →
//   过渡字 1 秒 → 署名尾页。
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <base-url> <out-dir> <endcard-dir>   （DEMO_COMPOSE_ONLY=1 只用已录分段重新拼片）
//   同时拼两版：frames/ + events.json（长版，视频号）与 frames-short/ + events-short.json（精简版，抖音/快手）。
//   base-url 例 http://127.0.0.1:8936/coal-breakout/ ；endcard-dir 里放 endcard.html/endcard.js/config.js（署名尾页模板副本）。
// 录法同 jianmen-drizzle/tools/demo.cjs：page.clock 接管时钟，每帧推进（倍速 × 1/30 s）再按设备像素截图。
// 画面是真实游戏运行：输入是 CDP 触摸拖动（方向由 src/pilot.js 的 precise 模式算，只产输入），选卡和按钮都是真实点按。
// 快进只靠每帧多推进页面时钟，快进时角落常驻「▶▶ ×N」角标，正常速度时消失；第 3 关开局整段不录，回来时角标写明跳过了几秒。
// 手指圆点、角标都是不拦截事件的页面元素（不进游戏状态），每帧由脚本直接设定，不用 CSS 过渡。本页面没有 CSS 过渡/动画（index.html 只有 :active 位移）。
// 分段各自录进 seg/<名>/，最后按成片顺序硬链接进 frames/，逐帧事件按成片时间写 events.json，tools/demo-music.py 按它合成卡点配乐。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [base = 'http://127.0.0.1:8936/coal-breakout/', outDir = 'demo-out', endDir] = process.argv.slice(2);
const FPS = 30, W = 390, H = 694, DPR = 1080 / 390;
const TITLE = '煤球突围', TAGLINE = 'AI 的坏日子，单指就能扛', BRIDGE = ['02、03 关的首领', '等你来打'];
const CARD_DWELL = 2.6, AUTO_TAIL = 30;            // seconds on every card screen; the 150-tick auto-upgrade notice runs at 1× until its last 30 ticks
// (it can begin up to one fast frame — 28 ticks at ×14 — before we see it, so at least 92 ticks ≈ 1.5 s are at normal speed)
const reset = d => { fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(d)) fs.unlinkSync(path.join(d, f)); return d; };

function segment(name) {
  const dir = reset(path.join(outDir, 'seg', name)); const seg = { name, dir, n: 0, marks: [] };
  seg.mark = (m, extra) => { const t = seg.n / FPS; seg.marks.push({ name: m, t, ...extra }); console.log(`[${name}]`, m, t.toFixed(2), extra ? JSON.stringify(extra) : ''); };
  seg.file = () => path.join(dir, String(seg.n++).padStart(5, '0') + '.jpg');
  return seg;
}

async function overlay(page, box) {
  await page.evaluate((box) => {
    const mk = (id, css) => { const d = document.createElement('div'); d.id = id; d.style.cssText = 'position:fixed;pointer-events:none;z-index:99;display:none;' + css; document.body.append(d); return d; };
    mk('demo-anchor', 'border-radius:50%;transform:translate(-50%,-50%);width:58px;height:58px;border:2px solid rgba(244,241,222,.35);');
    mk('demo-finger', 'border-radius:50%;transform:translate(-50%,-50%);width:34px;height:34px;background:rgba(244,241,222,.42);border:2px solid rgba(244,241,222,.8);');
    mk('demo-tap', 'border-radius:50%;transform:translate(-50%,-50%);width:44px;height:44px;border:3px solid rgba(114,241,196,.9);');
    // below the boss meter, inside the field's top-left corner: never over the clock, hearts or HUD buttons
    mk('demo-speed', `left:${box.x + 6}px;top:${box.y + 18}px;padding:3px 7px;background:rgba(11,20,36,.86);border:1px solid #72f1c4;color:#72f1c4;font:900 13px ui-monospace,monospace;letter-spacing:1px;border-radius:3px;white-space:nowrap;`);
    window.__demoDraw = (o) => {
      for (const [id, v] of Object.entries(o)) { const d = document.getElementById(id); if (!v) { d.style.display = 'none'; continue; }
        d.style.display = 'block'; if (v.text !== undefined) d.textContent = v.text; if (v.x !== undefined) { d.style.left = v.x + 'px'; d.style.top = v.y + 'px'; }
        d.style.opacity = v.a ?? 1; if (v.s) { d.style.width = d.style.height = v.s + 'px'; } }
    };
  }, box);
}

async function session(browser, seg, { seed, init, url = '' }) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto(base + '?test&seed=' + seed + url);
  await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50 });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  const canvasBox = await page.locator('#game').boundingBox(); seg.box = canvasBox;
  await overlay(page, canvasBox);
  await page.evaluate((seed) => { window.__pilot = CoalPilot.create('precise', seed); }, seed);
  const cdp = await ctx.newCDPSession(page);
  const S = { page, ctx, errors, seg, held: false, origin: null, finger: null, tap: null, tapAge: 99, badge: null };
  S.st = () => page.evaluate(() => { const s = __PLAYTEST__.state(); return { tick: s.tick, phase: s.phase, level: s.level, xp: s.xp, nextXP: s.nextXP, boss: s.boss, bossHP: s.boss >= 0 ? s.eHP[s.boss] : 0, bossMax: s.stage.bossHP, dur: s.stage.duration, warning: s.warning, off: s.off, burst: s.burst, autoCard: s.autoCard, autoUntil: s.autoUntil, hp: s.hp, kills: s.kills, stage: s.stageIndex }; });
  S.shot = async (mult = 1, capture = true) => {
    S.tapAge++;
    if (capture) await page.evaluate(o => __demoDraw(o), {
      'demo-anchor': S.held && S.origin ? { x: S.origin.x, y: S.origin.y, a: .9 } : null,
      'demo-finger': S.held && S.finger ? { x: S.finger.x, y: S.finger.y, a: 1 } : null,
      'demo-tap': S.tap && S.tapAge < 10 ? { x: S.tap.x, y: S.tap.y, a: 1 - S.tapAge / 10, s: 30 + S.tapAge * 5 } : null,
      'demo-speed': S.badge ? { text: S.badge } : null });
    await page.clock.runFor(Math.round(1000 / FPS * mult));
    if (capture) await page.screenshot({ path: seg.file(), type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: 1920 / DPR } });
  };
  S.hold = async (sec, capture = true) => { for (let i = 0; i < Math.round(sec * FPS); i++) await S.shot(1, capture); };
  S.tapAt = async (x, y) => { S.tap = { x, y }; S.tapAge = 0; await page.touchscreen.tap(x, y); };
  S.tapSel = async (sel) => { const b = await page.locator(sel).boundingBox(); await S.tapAt(b.x + b.width / 2, b.y + b.height / 2); };
  S.touchEnd = async () => { if (S.held) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); S.held = false; } };
  const home = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height * .78 };
  S.steer = async () => {
    const a = await page.evaluate(() => { const o = __pilot(__PLAYTEST__.state()); return [o[0], o[1]]; });
    if (!S.held) { S.origin = { ...home }; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: S.origin.x, y: S.origin.y }] }); S.held = true; }
    S.finger = { x: S.origin.x + a[0] * 40, y: S.origin.y + a[1] * 40 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: S.finger.x, y: S.finger.y }] });
  };
  S.soundOn = async () => {   // before the first captured frame, so the title shows 声音：开
    await S.tapSel('#title-sound'); await page.clock.runFor(100); S.tapAge = 99;
    const label = await page.locator('#title-sound').textContent();
    if (!label.includes('开 ·')) throw new Error('sound did not turn on: ' + label);
  };
  return S;
}

// One play loop. target(s) → desired speed (1 = normal); capture(s) → whether this frame goes into the film; stop(s) ends it.
async function play(S, target, stop, capture = () => true) {
  const seg = S.seg; let last = await S.st(), speed = 1, autoSeen = false, hidden = null;
  for (let guard = 0; guard < 30000; guard++) {
    const s = await S.st();
    if (s.phase === 3) throw new Error('died at tick ' + s.tick);
    const cap = capture(s);
    if (!cap && hidden === null) hidden = s.tick;
    if (cap && hidden !== null) { const sec = Math.round((s.tick - hidden) / 60); seg.mark('skipped', { from: hidden, to: s.tick, seconds: sec }); S.skipNote = { text: `⏭ 跳过开局 ${sec} 秒`, until: seg.n + 45 }; hidden = null; speed = 1; S.tapAge = 99; }
    if (cap) {
      if (s.boss >= 0 && last.boss < 0) seg.mark('boss', { tick: s.tick });
      if (s.warning > 0 && last.warning === 0) seg.mark('warning', { tick: s.tick });
      if (s.off > 0 && last.off === 0) seg.mark('off', { tick: s.tick });
      if (s.burst > 0 && last.burst === 0) seg.mark('burst', { tick: s.tick });
      if (s.burst === 0 && last.burst > 0) seg.mark('burstEnd', { tick: s.tick });
      if (s.autoCard >= 0 && s.autoUntil !== last.autoUntil) { seg.mark(autoSeen ? 'autoMore' : 'auto', { tick: s.tick, card: s.autoCard }); autoSeen = true; }
      if (s.phase === 2 && last.phase !== 2) seg.mark('won', { tick: s.tick });
    }
    last = s;
    if (stop(s)) return;
    if (s.phase === 1) {
      await S.touchEnd(); S.badge = null; speed = 1;
      if (cap) seg.mark('levelup', { tick: s.tick, rank: s.level });
      await S.hold(cap ? CARD_DWELL : 0, cap);
      const i = await S.page.evaluate(() => __pilot(__PLAYTEST__.state())[2]);
      await S.tapSel(`.card >> nth=${Math.max(0, i)}`);
      await S.hold(cap ? .3 : .05, cap);
      if ((await S.st()).phase === 1) throw new Error('card tap did not register');
      if (cap) seg.mark('picked', { card: i });
      continue;
    }
    if (s.phase === 0) await S.steer();
    const want = target(s);
    if (want === 1 && s.autoCard >= 0 && s.tick < s.autoUntil) speed = 1;          // the auto-upgrade notice: snap to normal speed
    speed += (want - speed) * (want < speed ? .5 : .12); if (Math.abs(want - speed) < .03) speed = want;
    S.badge = speed > 1.15 ? `▶▶ ×${want > 1 ? want : Math.round(speed)}` : null;
    if (S.skipNote && seg.n < S.skipNote.until) S.badge = S.skipNote.text;
    await S.shot(speed, cap);
  }
  throw new Error('play loop guard');
}

// A still-image page that renders the hook title over game frames and the 1-second bridge card, at 1080×1920.
async function compositor(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
  await page.setContent('<html><body style="margin:0;background:#000"><canvas id="c" width="1080" height="1920"></canvas></body></html>');
  await page.evaluate(() => document.fonts.load('900 60px "PingFang SC"'));
  return {
    async hook(src, dst, k) {   // k = 0..1 through the hook
      const data = fs.readFileSync(src).toString('base64');
      await page.evaluate(async ({ data, title, tag, k }) => {
        const c = document.getElementById('c'), g = c.getContext('2d'), img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/jpeg;base64,' + data; });
        g.drawImage(img, 0, 0, 1080, 1920);
        const y = 760, grad = g.createLinearGradient(0, y - 260, 0, y + 260);
        grad.addColorStop(0, 'rgba(9,15,25,0)'); grad.addColorStop(.3, 'rgba(9,15,25,.82)'); grad.addColorStop(.7, 'rgba(9,15,25,.82)'); grad.addColorStop(1, 'rgba(9,15,25,0)');
        g.fillStyle = grad; g.fillRect(0, y - 260, 1080, 520);
        const s = 1 + .04 * (1 - Math.min(1, k * 4));   // a small settle, no fade: legible from frame 0
        g.save(); g.translate(540, y); g.scale(s, s); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.font = '1000 170px "PingFang SC",sans-serif'; g.fillStyle = '#3e3050'; g.fillText(title, 10, 10); g.fillStyle = '#f4f1de'; g.fillText(title, 0, 0);
        g.font = '800 58px "PingFang SC",sans-serif'; g.fillStyle = '#72f1c4'; g.fillText(tag, 0, 110);
        g.restore();
        window.__out = c.toDataURL('image/jpeg', .92).split(',')[1];
      }, { data, title: TITLE, tag: TAGLINE, k });
      fs.writeFileSync(dst, Buffer.from(await page.evaluate(() => window.__out), 'base64'));
    },
    async label(src, dst, text, box) {   // the same corner and style as the in-page speed badge, for edit cuts in the short cut
      const data = fs.readFileSync(src).toString('base64');
      await page.evaluate(async ({ data, text, box, dpr }) => {
        const g = document.getElementById('c').getContext('2d'), img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/jpeg;base64,' + data; });
        g.drawImage(img, 0, 0, 1080, 1920);
        g.textAlign = 'left'; g.font = `900 ${13 * dpr}px "PingFang SC",sans-serif`; const w = g.measureText(text).width + 14 * dpr, h = 22 * dpr, x = (box.x + 6) * dpr, y = (box.y + 18) * dpr;
        g.fillStyle = 'rgba(11,20,36,.86)'; g.fillRect(x, y, w, h); g.strokeStyle = '#72f1c4'; g.lineWidth = dpr; g.strokeRect(x, y, w, h);
        g.fillStyle = '#72f1c4'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x + 7 * dpr, y + h / 2 + dpr);
        window.__out = g.canvas.toDataURL('image/jpeg', .92).split(',')[1];
      }, { data, text, box, dpr: DPR });
      fs.writeFileSync(dst, Buffer.from(await page.evaluate(() => window.__out), 'base64'));
    },
    async bridge(dst, k) {
      await page.evaluate(({ lines, k }) => {
        const g = document.getElementById('c').getContext('2d');
        g.fillStyle = '#101827'; g.fillRect(0, 0, 1080, 1920); g.strokeStyle = '#24394A'; g.lineWidth = 2;
        for (let x = 0; x < 1080; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1920); g.stroke(); }
        for (let y = 0; y < 1920; y += 54) { g.beginPath(); g.moveTo(0, y); g.lineTo(1080, y); g.stroke(); }
        g.strokeStyle = '#72F1C4'; g.lineWidth = 6; g.strokeRect(60, 60, 960, 1800);
        const dy = (1 - Math.min(1, k * 5)) * 24; g.textAlign = 'center';
        g.font = '900 96px "PingFang SC",sans-serif'; g.fillStyle = '#f4f1de'; g.fillText(lines[0], 540, 880 + dy);
        g.font = '900 128px "PingFang SC",sans-serif'; g.fillStyle = '#ff6fa8'; g.fillText(lines[1], 540, 1060 + dy);
        g.font = '700 40px ui-monospace,monospace'; g.fillStyle = '#72F1C4'; g.fillText('TINY COAL / BIG TROUBLE', 540, 1200);
        window.__out = g.canvas.toDataURL('image/jpeg', .92).split(',')[1];
      }, { lines: BRIDGE, k });
      fs.writeFileSync(dst, Buffer.from(await page.evaluate(() => window.__out), 'base64'));
    }
  };
}


// music sections start at these marks (tools/demo-music.py reads ev.sections, accents from ev.marks)
const SECTION = { hook: 'off', hookBurst: 'burst', title: 'title', title3: 'title', start: 'groove', boss: 'boss', won: 'result', skipped: 'groove',
  warning: 'warning', off: 'off', burst: 'burst', burstEnd: 'groove', bridge: 'result', endcard: 'outro' };
const saveSeg = seg => fs.writeFileSync(path.join(seg.dir, 'marks.json'), JSON.stringify({ n: seg.n, marks: seg.marks, box: seg.box }, null, 2));
const loadSeg = name => { const dir = path.join(outDir, 'seg', name), j = JSON.parse(fs.readFileSync(path.join(dir, 'marks.json'), 'utf8')); return { name, dir, ...j }; };
const fname = (dir, i) => path.join(dir, String(i).padStart(5, '0') + '.jpg');

async function record(browser) {
  // The page clock is fixed but CDP touch events land between animation frames on their own schedule, so two takes of the same seed
  // differ (boss fights took 9–30 s). Each level is retaken (next seed) until it fits: level 1 ≤ L1_MAX s, and no card screen
  // interrupting the level-3 quota-reset sequence.
  const L1_MAX = 51;
  for (const seed of [7, 11, 5, 3, 13, 17]) {
    const L1 = segment('level1');
    const A = await session(browser, L1, { seed });
    try {
      await A.soundOn();
      L1.mark('title', { seed }); await A.hold(.8);
      await A.tapSel('#start'); L1.mark('start'); await A.hold(.3);
      await play(A, s => {
        if (s.tick < 210) return 1;                                                   // opening: movement and first shots at normal speed
        if (s.autoCard >= 0 && s.tick < s.autoUntil - AUTO_TAIL) return 1;             // every auto-upgrade notice ≥1.5 s at 1×
        if (s.boss < 0) return s.tick > s.dur - 90 ? 1 : 14;                          // slow down 1.5 s before the boss arrives
        return s.tick - s.dur < 100 || s.bossHP / s.bossMax < .08 ? 1 : 8;            // boss entrance and finish at normal speed
      }, s => s.phase === 2 || L1.n / FPS > L1_MAX);
      await A.touchEnd(); A.badge = null;
      L1.mark('result'); await A.hold(2.8);
      if (A.errors.length) throw new Error('page errors level 1: ' + A.errors.join('; '));
      if (L1.n / FPS > L1_MAX + 2.8) throw new Error(`take too long: ${(L1.n / FPS).toFixed(1)} s`);
      await A.ctx.close(); saveSeg(L1); break;
    } catch (e) { console.log('[level1] retake, seed', seed, e.message); await A.ctx.close(); if (seed === 17) throw e; }
  }

  // ---------- level 3 「额度重置」, progress pre-set so it is unlocked; the opening is played but not filmed
  for (const seed of [7, 11, 5, 3, 13, 17]) {
    const L3 = segment('level3');
    const B = await session(browser, L3, { seed, init: () => { try { localStorage.setItem('coal-breakout-progress-v1', '3'); } catch (_) {} } });
    try {
      await B.soundOn();
      await B.tapSel('#levels button >> nth=2'); await B.page.clock.runFor(100); B.tapAge = 99;
      L3.mark('title3', { seed }); await B.hold(.8);
      await B.tapSel('#start'); await B.hold(.1, false);
      const FILM_FROM = 2220 - 45;                    // 0.75 s before the red warning bar
      let endAt = null;
      await play(B, s => s.tick < FILM_FROM ? 12 : 1,
        s => { if (s.tick >= FILM_FROM && s.phase === 1) throw new Error('card screen inside the quota-reset sequence');
          if (s.tick > 2700 && s.burst === 0 && endAt === null) endAt = s.tick + 24; /* ~0.4 s after the burst: the bar is back to the level hint */ return endAt !== null && s.tick >= endAt; },
        s => s.tick >= FILM_FROM);
      const tail = await B.st(); L3.mark('l3end', { tick: tail.tick, autoNotice: tail.autoCard >= 0 && tail.tick < tail.autoUntil, phase: tail.phase });
      if (B.errors.length) throw new Error('page errors level 3: ' + B.errors.join('; '));
      await B.ctx.close(); saveSeg(L3); break;
    } catch (e) { console.log('[level3] retake, seed', seed, e.message); await B.ctx.close(); if (seed === 17) throw e; }
  }
}

async function compose(browser) {
  const L1 = loadSeg('level1'), L3 = loadSeg('level3'), comp = await compositor(browser);
  const at = (seg, name) => { const m = seg.marks.find(m => m.name === name); if (!m) throw new Error(`${seg.name} has no ${name}`); return m.t; };
  // hook: the last second of the cease-fire into the burst, from the level-3 footage, with the title over it
  const HOOK = segment('hook'), hookFrom = Math.round((at(L3, 'burst') - 1.0) * FPS), hookLen = 2 * FPS;
  HOOK.mark('hook');
  for (let i = 0; i < hookLen; i++) await comp.hook(fname(L3.dir, hookFrom + i), HOOK.file(), i / hookLen);
  HOOK.marks.push({ name: 'hookBurst', t: 1.0 });
  const BR = segment('bridge'); BR.mark('bridge');
  for (let i = 0; i < FPS; i++) await comp.bridge(BR.file(), i / FPS);
  // signature endcards from the template copy: full length for the long cut, ~4 s for the short one (all stamps land by 3.0 s)
  const endcard = async (name, dur) => {
    const seg = segment(name), page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
    await page.goto('file://' + path.resolve(endDir, 'endcard.html'));
    await page.waitForFunction(() => window.__ready, null, { polling: 50 });
    if (dur === null) dur = await page.evaluate(() => __duration()) + .4;
    seg.mark('endcard', { seconds: dur });
    for (let i = 0; i < Math.round(dur * FPS); i++) { await page.evaluate(t => __seek(t), i / FPS); await page.locator('#c').screenshot({ path: seg.file(), type: 'jpeg', quality: 92 }); }
    await page.context().close(); return seg;
  };
  const END = await endcard('endcard', null), END4 = await endcard('endcard4', 4.0);
  const whole = seg => ({ seg, from: 0, to: seg.n / FPS });

  // part = { seg, from, to (seconds on the segment), label? (edit-cut note drawn for 1 s) }
  async function film(name, parts) {
    const frames = reset(path.join(outDir, name === 'long' ? 'frames' : 'frames-' + name));
    const ev = { fps: FPS, marks: [], sections: [], parts: [] }; let n = 0;
    for (const p of parts) {
      const i0 = Math.round(p.from * FPS), i1 = Math.min(p.seg.n, Math.round(p.to * FPS)), t0 = n / FPS;
      ev.parts.push({ seg: p.seg.name, from: p.from, to: i1 / FPS, t: t0 });
      const before = p.seg.marks.filter(m => SECTION[m.name] && m.t <= p.from + 1e-6).pop();      // the section already running at the cut-in
      if (before) ev.sections.push({ t: t0, kind: SECTION[before.name] });
      for (const m of p.seg.marks) if (m.t >= p.from - 1e-6 && m.t < i1 / FPS) { ev.marks.push({ ...m, t: t0 + m.t - p.from }); if (SECTION[m.name]) ev.sections.push({ t: t0 + m.t - p.from, kind: SECTION[m.name] }); }
      if (p.label) ev.marks.push({ name: 'cut', t: t0, label: p.label });
      for (let i = i0; i < i1; i++, n++) {
        const dst = fname(frames, n);
        if (p.label && i - i0 < FPS) await comp.label(fname(p.seg.dir, i), dst, p.label, p.seg.box); else fs.linkSync(fname(p.seg.dir, i), dst);
      }
    }
    ev.sections = ev.sections.filter((s, k, a) => !a[k + 1] || a[k + 1].t > s.t + 1e-6);
    ev.seconds = n / FPS; ev.frames = n;
    fs.writeFileSync(path.join(outDir, name === 'long' ? 'events.json' : `events-${name}.json`), JSON.stringify(ev, null, 2));
    console.log(name, JSON.stringify({ frames: n, seconds: ev.seconds.toFixed(2), parts: ev.parts }));
  }
  // long cut (视频号): hook → title + level 1 → level 3 title, skipped opening, quota reset → bridge → endcard
  // level 3 ends ~0.4 s after the burst
  const bEnd = at(L3, 'burstEnd'), autoNear = L3.marks.some(m => (m.name === 'auto' || m.name === 'autoMore') && m.t > bEnd - 2.5);
  const L3part = { seg: L3, from: 0, to: autoNear ? bEnd : L3.n / FPS };   // an auto-upgrade notice would take over the bar for a split second: cut as the burst ends
  await film('long', [whole(HOOK), whole(L1), L3part, whole(BR), whole(END)]);
  // short cut (抖音/快手): hook → opening with one card and the first auto-upgrade → boss from 1 s before it arrives to the kill → 1.5 s result → 4 s endcard
  const autoT = at(L1, 'auto'), bossT = at(L1, 'boss'), wonT = at(L1, 'won'), nextCard = L1.marks.filter(m => m.name === 'levelup' && m.t > autoT)[0];
  // cut in 2.5 s before the boss, but never inside a card screen: then start just after that card was picked
  const lastPick = L1.marks.filter(m => m.name === 'picked' && m.t < bossT).pop(), bossFrom = Math.max(bossT - 2.5, lastPick ? lastPick.t + .35 : 0);
  await film('short', [whole(HOOK), { seg: L1, from: at(L1, 'start') - .2, to: Math.min(autoT + 3.7, nextCard ? nextCard.t - .1 : 1e9) }, { seg: L1, from: bossFrom, to: wonT, label: '▶▶ 快进到首领' },
    { seg: L1, from: wonT, to: wonT + 1.5 }, whole(END4)]);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  if (!process.env.DEMO_COMPOSE_ONLY) await record(browser);
  await compose(browser);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
