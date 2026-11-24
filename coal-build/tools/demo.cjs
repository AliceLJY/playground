// 竖屏演示片（给人看，不是验收）：开工 → 手指点楼、照提示买卡 → 加速看煤球自己把骑楼从地基砌到屋脊，每砌满一段亮出那段画 →
// 盖完亮出整幅画、停在结算卡。页面铺满 1080×1920（360×640 手机视口 ×3），不套手机外框。
// 用法（手动跑，不进 CI）：
//   python3 -m http.server 8971 --bind 127.0.0.1          （在 coal-build/ 里）
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <输出目录> <署名页模板目录> [--base http://127.0.0.1:8971/index.html] [--seed 7] [--kmax 7.5] [--dry]
//   署名页模板在作者本机 video-director 技能的 references/signature-endcard。
// 产物：<输出目录>/screen.mp4（游戏部分，无声）、endcard.mp4（署名页 5.6 秒）、events.json（每帧的视频时间、游戏事件、手指点按、速度）。
// 配乐与合成见 tools/demo-sound.py。--dry 不截图，只跑一遍打印时间线，调速度曲线用。
// 录法：init script 在页面脚本之前接管 performance.now、Date.now、rAF、setTimeout，每视频帧推进两步 1/60 秒；截图前等 12 ms 让合成器交上这一帧。
// 提速不靠快放成片：?demo=1 时页面开放 demoSpeed(k, v)，k 是规则每真实秒推进几秒，v 是走路动画的倍速；横幅、飞砖、泥瓦匠踩实仍按真实时间播。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; }, has = n => args.includes('--' + n);
const out = args[0], endDir = args[1];
if (!out || !endDir || out.startsWith('--')) { console.error('usage: demo.cjs <输出目录> <署名页模板目录> [--base url] [--seed n] [--kmax k] [--dry]'); process.exit(2); }
const base = flag('base', 'http://127.0.0.1:8971/index.html'), SEED = +flag('seed', '7'), KMAX = +flag('kmax', '16'), KLATE = +flag('klate', '10'), KWAIT = +flag('kwait', '24'), DRY = has('dry');
const W = 360, H = 640, DPR = 3, FPS = 30, SUB = 2, STEP = 1000 / (FPS * SUB), SETTLE = 12;
const K0 = 1.4, KEND = 1.3, VCAP = 2.6, RAMP_AT = 3.4, RAMP = 2.0, SLOW = 0.6, HOLD = 4.3;   // HOLD：盖完到收片（亮光 1.4 + 结算卡淡入 0.4 + 读 2.5）
// 收尾两种：默认最后 8% 放慢到 2 倍，手放开看煤球自己砌完（只接糖水担）；--reserve 时楼过某进度后不放大招，留到剩下的砖不多于一发时减速、点「齐心一砌」砌完（试过，提示「点左边圆钮」会晾五六秒，没用）。
const CARDGAP = +flag('cardgap', '0.36');
const RESERVE = +flag('reserve', '1'), TAIL = +flag('tail', '0.08'), KTAIL = +flag('ktail', '2');   // 默认不留大招：最后 8% 放慢到 2 倍看煤球自己砌完；--reserve 0.35 是留大招收尾的旧方案
const skillAmount = p => { const pw = 1 + (p.lv.power - 1) * 0.5; return Math.max(30, Math.round(p.balls * pw / 1 / 6 * 20)); };
fs.mkdirSync(out, { recursive: true });
const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = s => { s = cl(s); return s * s * (3 - 2 * s); };

function takeOverClock() {
  let vnow = 0, queue = [], nextId = 1, timers = []; const wall = Date.UTC(2026, 10, 22, 12, 0, 0);   // 周日中午，画面里本来也不显示钟点
  performance.now = () => vnow; Date.now = () => wall + vnow;
  window.requestAnimationFrame = cb => { const id = nextId++; queue.push({ id, cb }); return id; };
  window.cancelAnimationFrame = id => { queue = queue.filter(q => q.id !== id); };
  window.setTimeout = (cb, ms = 0, ...a) => { const id = nextId++; timers.push({ id, due: vnow + ms, cb: () => (typeof cb === 'function' ? cb(...a) : 0) }); return id; };
  window.clearTimeout = id => { timers = timers.filter(t => t.id !== id); };
  let seed = 20261124; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  window.__rec = {
    get now() { return vnow; },
    step(ms) {
      vnow += ms;
      const due = timers.filter(t => t.due <= vnow); timers = timers.filter(t => t.due > vnow); for (const t of due) { try { t.cb(); } catch (e) { console.error(e); } }
      const q = queue; queue = []; for (const { cb } of q) { try { cb(vnow); } catch (e) { console.error(e); } }
    },
  };
}
const encoder = file => {   // 截图是全范围 BT.601 的 JPEG，转成有限范围 BT.709 的 yuv420p 并打标
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
  return { write: async jpg => { if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r)); }, end: () => { ff.stdin.end(); return done; } };
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await ctx.addInitScript(takeOverClock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base.replace(/[?#].*$/, '') + `?demo=1&seed=${SEED}`);
  const ready = () => page.evaluate(() => !!(window.__coalbuild && window.__coalbuild.ready && window.__coalbuild.demoSpeed));
  for (let i = 0; i < 900 && !await ready(); i++) { await page.evaluate(ms => window.__rec.step(ms), STEP); await page.waitForTimeout(10); }
  if (!await ready()) throw new Error('页面没有就绪（要带 ?demo=1 的版本）');
  await page.evaluate(() => {
    const css = document.createElement('style');
    css.textContent = `.fdot{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
      background:radial-gradient(circle,rgba(255,255,255,.62) 0%,rgba(255,255,255,.36) 55%,rgba(255,255,255,.18) 100%);
      border:1.5px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(20,18,14,.42),0 2px 9px rgba(0,0,0,.45);pointer-events:none;z-index:99999;opacity:0}`;
    document.head.appendChild(css);
    const d = document.createElement('div'); d.className = 'fdot'; d.id = 'fdot'; document.body.appendChild(d);
  });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 0, radiusX: 11, radiusY: 11, force: 1 }] });
  const probe = () => page.evaluate(() => window.__coalbuild.probe());
  const step = () => page.evaluate(ms => window.__rec.step(ms), STEP);

  // 开工：录制开始前真实点一下「开工」，第 0 帧就是工地
  let p = await probe(); const b = p.layout.button;
  await touch('touchStart', b.x + b.w / 2 + p.ox, b.y + b.h / 2); await step(); await touch('touchEnd'); await step();
  p = await probe(); if (p.screen !== 'play') throw new Error('开工没点上');
  await page.evaluate(() => window.__coalbuild.demoLog());   // 清掉开工前的日志

  const enc = DRY ? null : encoder(path.join(out, 'screen.mp4'));
  const log = { fps: FPS, seed: SEED, kmax: KMAX, frames: [], events: [], taps: [] };
  const finger = { down: false, x: 0, y: 0, tDown: -9, tUp: -9, upAt: null };
  let natural = false, waitT = null, stage1T = null, finaleTap = null, f = 0, nextAct = 0.25, introTaps = 0, slowT = null, doneT = null, k = K0, gameT0 = p.t;
  const rng = (() => { let a = SEED * 9301 + 49297; return () => (a = (a * 9301 + 49297) % 233280) / 233280; })();
  const center = r => [r.x + r.w / 2 + p.ox, r.y + r.h / 2];
  for (;;) {
    const t = f / FPS;
    p = await probe();
    // ---- 速度 ----
    const progress = p.laid / p.total;
    const amt = skillAmount(p), rem = p.total - p.laid;
    if (slowT == null && p.phase === 'play' && progress > RESERVE && rem <= 1.8 * amt && p.skillReady) slowT = t;
    if (slowT == null && p.phase === 'play' && RESERVE >= 1 && rem <= TAIL * p.total) { slowT = t; natural = true; }
    if (stage1T == null && p.stage >= 1) stage1T = t;   // 柱廊砌好后放慢一档，后面几段亮画留够看的时间
    // 大招已好、留着收尾用的那几秒，画面提示一直指着它：这段跑快，别让提示晾太久
    if (waitT == null && p.phase === 'play' && progress > RESERVE && p.skillReady) waitT = t;
    let target = t < RAMP_AT ? K0 : slowT != null ? (natural ? KTAIL : rem > 0.95 * amt ? 5 : KEND) : waitT != null ? KWAIT : stage1T != null ? KLATE : KMAX;
    if (p.phase !== 'play') target = 1;
    k = t < RAMP_AT + RAMP && slowT == null && waitT == null ? K0 + (target - K0) * smooth((t - RAMP_AT) / RAMP) : k + (target - k) * 0.09;
    await page.evaluate(([k, v]) => window.__coalbuild.demoSpeed(k, v), [k, Math.min(k, VCAP)]);
    // ---- 手：开头连点楼五下，之后照画面提示点；加速段手基本放开，只接大招、糖水和偶尔一张卡 ----
    if (finger.down && t >= finger.upAt) { await touch('touchEnd'); finger.down = false; finger.tUp = t; }
    if (!finger.down && p.phase === 'play' && slowT != null && !finaleTap && k < 1.8 && rem <= 0.95 * amt) {   // 收尾的大招
      const [x, y] = center(p.layout.skill); await touch('touchStart', x, y);
      Object.assign(finger, { down: true, x, y, tDown: t, upAt: t + 0.09 }); log.taps.push({ t: +t.toFixed(3), target: 'skill', finale: true }); finaleTap = t;
    }
    if (!finger.down && p.phase === 'play' && t >= nextAct && (slowT == null || natural && p.hint.target === 'event')) {
      const h = p.hint, L = p.layout; let target = null, r = null;
      if (h.target === 'skill' && progress > RESERVE) h.target = null;
      if (introTaps < 5 || h.target === 'building') {
        const R = L.building, y = cl(p.frontRowY - 8, R.y + 20, L.ground - 12);
        target = 'building'; r = { x: R.x + R.w * (0.3 + 0.4 * rng()) - p.ox, y, w: 0, h: 0 }; introTaps++;
      } else if (h.target === 'event' && p.eventRect) { target = 'event'; r = p.eventRect; }
      else if (h.target === 'skill') { target = 'skill'; r = L.skill; }
      else if (['hire', 'shed', 'power', 'wage'].includes(h.target)) { target = h.target; r = L.cards.find(c => c.kind === h.target); }
      if (target) {
        const [x, y] = r.w ? center(r) : [r.x + p.ox, r.y];
        await touch('touchStart', x, y);
        Object.assign(finger, { down: true, x, y, tDown: t, upAt: t + 0.09 });
        log.taps.push({ t: +t.toFixed(3), target });
        const fast = t >= RAMP_AT;
        nextAct = t + (target === 'building' ? 0.24 : !fast ? 0.42 : target === 'skill' || target === 'event' ? 0.4 : CARDGAP);
      } else if (t >= RAMP_AT) nextAct = t + 0.2;
    }
    // ---- 推进一帧 ----
    for (let i = 0; i < SUB; i++) await step();
    const ev = await page.evaluate(() => window.__coalbuild.demoLog());
    for (const e of ev) log.events.push({ t: +t.toFixed(3), ...e });
    if (doneT == null && ev.some(e => e.type === 'built')) doneT = t;
    const q = await page.evaluate(() => { const s = window.__coalbuild.probe(); return { laid: s.laid, stage: s.stage, t: s.t, phase: s.phase, balls: s.balls, coins: s.coins }; });
    log.frames.push({ t: +t.toFixed(3), k: +k.toFixed(3), gt: +(q.t - gameT0).toFixed(2), laid: q.laid, stage: q.stage, balls: q.balls });
    if (!DRY) {
      const v = finger.down ? (s => ({ o: s, sc: 0.75 + 0.25 * s }))(cl((t - finger.tDown) / 0.08)) : (s => ({ o: 1 - s, sc: 1 + 0.4 * s }))(cl((t - finger.tUp) / 0.22));
      await page.evaluate(([x, y, o, sc]) => { const el = document.getElementById('fdot'); el.style.opacity = o; el.style.transform = `translate(${x}px,${y}px) scale(${sc})`; }, [finger.x, finger.y, v.o, v.sc]);
      await page.waitForTimeout(SETTLE);
      await enc.write(await page.screenshot({ type: 'jpeg', quality: 93 }));
    }
    f++;
    if (DRY && f % 60 === 0) console.log(`t=${t.toFixed(1)} k=${k.toFixed(2)} game=${(q.t - gameT0).toFixed(1)} laid=${q.laid}/${p.total} stage=${q.stage} balls=${q.balls}`);
    if (doneT != null && t - doneT >= HOLD) break;
    if (t > 80) { console.error('80 秒还没盖完，速度不够'); break; }
  }
  if (enc) await enc.end();
  log.seconds = f / FPS; log.doneT = doneT; log.slowT = slowT; log.finaleTap = finaleTap; log.stage1T = stage1T; log.waitT = waitT; log.klate = KLATE;
  log.stages = log.events.filter(e => e.type === 'stage').map(e => ({ t: e.t, name: e.name }));
  log.errors = errors;
  await ctx.close();

  // ---- 署名页（固定模板，单独渲 5.6 秒）----
  if (!DRY) {
    const ed = path.join(out, 'endcard'); fs.mkdirSync(ed, { recursive: true });
    for (const fn of ['endcard.html', 'endcard.js']) fs.copyFileSync(path.join(endDir, fn), path.join(ed, fn));
    fs.writeFileSync(path.join(ed, 'config.js'), `window.ENDCARD = {
  series: "playground 小游戏",
  title: "小黑煤球盖广州",
  accounts: ["公众号：我的AI小木屋", "微博 · 快手 · 全民K歌：安闲静雅"],
  notes: [
    ["玩法", "放置建造：煤球顶砖把骑楼从地基砌到屋脊，砌满一段亮出那段画"],
    ["资料", "骑楼、陈家祠、镇海楼的外形与小知识参考维基百科和广州市政府网；建筑画是艺术化表现，不是测绘复原"],
    ["画面", "网页实机逐帧录制，盖楼一条到底没有删减，中段最快加速约 ${Math.round(KMAX)} 倍；三张建筑画由网页版 GPT 生成后按画切成砖格"],
    ["声音", "配乐由代码按画面里的事件合成，没有采样素材"],
    ["借鉴", "放置建造的思路借自喵老弟的蚂蚁搬山微信小游戏"],
    ["构思", "小试AI · 与 Claude Code 协作完成"],
  ],
};
`);
    const ectx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 }), ep = await ectx.newPage();
    await ep.goto('file://' + path.join(ed, 'endcard.html'));
    await ep.waitForFunction(() => window.__ready, null, { polling: 50 });
    const dur = await ep.evaluate(() => window.__duration()), e2 = encoder(path.join(out, 'endcard.mp4'));
    for (let i = 0; i < Math.round(dur * FPS); i++) { await ep.evaluate(t => window.__seek(t), i / FPS); await e2.write(await ep.locator('#c').screenshot({ type: 'jpeg', quality: 93 })); }
    await e2.end(); log.endcard = dur; await ectx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify(log, null, 1));
  const cnt = {}; for (const e of log.events) cnt[e.type + (e.src ? ':' + e.src : '')] = (cnt[e.type + (e.src ? ':' + e.src : '')] || 0) + 1;
  console.log(JSON.stringify({ seconds: +log.seconds.toFixed(2), doneT, slowT, finaleTap, stages: log.stages, taps: log.taps.length, counts: cnt, gameSecs: log.frames.at(-1).gt, errors: errors.slice(0, 5) }));
})().catch(e => { console.error(e); process.exit(1); });
