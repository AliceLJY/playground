// 软糖熊 · 竖屏演示片的录制（手动跑，不进 CI、不改页面）：手机视口 540×960、2 倍像素截成 1080×1920，页面铺满，不套手机外框。
// 照 suisui/tools/demo.cjs 的做法：加载前接管页面时钟（performance.now、Date.now、rAF、setTimeout、setInterval、Math.random、
// CSS 动画同钟步进），每帧推进 1/30 秒（两步 1/60，页面每步正好走一步物理）；页面的 Web Audio 换成同钟的 OfflineAudioContext，
// 录完离线渲出页面自己合成的「啵」「啾」「嘣」。
// 手指是 CDP 发的真实触摸：抓、拉、甩、点「再倒一些」都由页面自己的指针事件响应，没有调 __PLAYTEST__ 的动作钩子
// （只读 snapshot() / pointScreen() 找熊在屏幕上的位置）。手指画成半透明白圆点，按下浮现、抬起扩散淡出。
// 手机视口下页面自动用低画质档（没有折射、熊最多 18 只、像素比上限 1.75），录的就是手机上看到的样子。
// 已知问题：熊被往下按时表面会起皱，所以片里只拉、甩、倒，不往下按。
//   node tools/serve.cjs . 8982                                  （在 gummy-bears/ 里）
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <输出目录> --endcard <署名页模板目录> [--base URL] [--seed 7] [--dry] [--stills 3,9.5]
// 署名页模板在作者本机 video-director 技能的 references/signature-endcard。
// 产物：<输出目录>/video.mp4（无声：实录＋署名页）、page.wav（实录段页面自己的声音）、cues.json（每个动作的时刻、拉伸读数轨迹）。
// 配乐与合成见 tools/demo-sound.py。--dry 不出视频，只打印每半秒的状态；--stills 在这几个时刻另存原尺寸静帧（--dry 时也存）。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; }, has = (n) => args.includes('--' + n);
const out = args[0]; if (!out || out.startsWith('--')) { console.error('usage: demo.cjs <输出目录> --endcard <模板目录>'); process.exit(2); }
const base = flag('base', 'http://127.0.0.1:8982/dist/index.html'), seed = flag('seed', '7'), endDir = flag('endcard', ''), DRY = has('dry');
const STILLS = (flag('stills', '') || '').split(',').filter(Boolean).map(Number);
if (!DRY && !endDir) { console.error('缺 --endcard <署名页模板目录>'); process.exit(2); }
const W = 540, H = 960, DPR = 2, FPS = 30, SUB = 2, STEP = 1000 / (FPS * SUB), SETTLE = 12;
const BEAT = 0.5;   // 120 拍：抓、放、点按钮都落在拍点上，配乐卡同一张网格
fs.mkdirSync(out, { recursive: true });

// ---------------- 页面时钟（同 suisui） ----------------
function takeOverClock() {
  let vnow = 0, queue = [], nextId = 1, timers = []; const wall = Date.now();
  performance.now = () => vnow; Date.now = () => wall + vnow;
  window.requestAnimationFrame = (cb) => { const id = nextId++; queue.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { queue = queue.filter((q) => q.id !== id); };
  const addTimer = (cb, ms, a, every) => { const id = nextId++; timers.push({ id, due: vnow + Math.max(0, +ms || 0), every, cb: () => (typeof cb === 'function' ? cb(...a) : 0) }); return id; };
  window.setTimeout = (cb, ms = 0, ...a) => addTimer(cb, ms, a, 0);
  window.setInterval = (cb, ms = 0, ...a) => addTimer(cb, ms, a, Math.max(1, +ms || 1));
  window.clearTimeout = window.clearInterval = (id) => { timers = timers.filter((t) => t.id !== id); };
  let seed = 20261126; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  class RecordingAudioContext extends OfflineAudioContext {
    constructor() { super(2, 48000 * 90, 48000); this._t0 = vnow; window.__rec.audio = this; window.__rec.audioStart = vnow; }
    get currentTime() { return (vnow - this._t0) / 1000; }
    get state() { return 'running'; }
    resume() { return Promise.resolve(); }
  }
  window.AudioContext = RecordingAudioContext; window.webkitAudioContext = RecordingAudioContext;
  // 页面同时最多 8 个声部，靠振荡器的 onended 计数；离线渲染要等录完才放 ended，计数会一直涨、后面的声音全被丢掉。
  // 所以录制时在振荡器该停的那一刻（同一个页面时钟）先替它发一次 ended，页面看到的就和实时播放一样。
  const realStop = AudioScheduledSourceNode.prototype.stop;
  AudioScheduledSourceNode.prototype.stop = function (when = 0) {
    realStop.call(this, when);
    if (this.context instanceof RecordingAudioContext && !this.__endSent) { this.__endSent = true; const node = this; window.setTimeout(() => node.dispatchEvent(new Event('ended')), Math.max(0, (when - this.context.currentTime) * 1000)); }
  };
  const seen = new WeakMap();
  window.__rec = {
    audio: null, audioStart: 0, get now() { return vnow; },
    step(ms) {
      vnow += ms;
      for (;;) {
        timers.sort((a, b) => a.due - b.due || a.id - b.id);
        const t = timers[0]; if (!t || t.due > vnow) break;
        if (t.every) t.due += t.every; else timers.shift();
        try { t.cb(); } catch (e) { console.error(e); }
      }
      const q = queue; queue = []; for (const { cb } of q) { try { cb(vnow); } catch (e) { console.error(e); } }
      for (const a of document.getAnimations()) { if (!seen.has(a)) { seen.set(a, vnow); a.pause(); } a.currentTime = vnow - seen.get(a); }
    },
    async renderPcm(videoStart, videoEnd) {
      const ctx = window.__rec.audio, sr = 48000, skip = Math.round((videoStart - window.__rec.audioStart) / 1000 * sr), n = Math.round((videoEnd - videoStart) / 1000 * sr);
      const buf = ctx ? await ctx.startRendering() : null, L = buf && buf.getChannelData(0), R = buf && buf.getChannelData(1);
      const pcm = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) { const j = i + skip, l = L && j >= 0 && j < L.length ? L[j] : 0, r = R && j >= 0 && j < R.length ? R[j] : 0; pcm[i * 2] = Math.max(-1, Math.min(1, l)) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, r)) * 32767; }
      const bytes = new Uint8Array(pcm.buffer); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      window.__rec.b64 = btoa(s); return window.__rec.b64.length;
    },
  };
}
const encoder = (file) => {
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=1080:1920:in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  return { write: async (jpg) => { if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r)); }, end: () => { ff.stdin.end(); return done; } };
};

const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mj = (s) => { s = cl(s); return s * s * s * (10 - 15 * s + 6 * s * s); };
const tremor = (t, k) => [0.6 * Math.sin(2 * Math.PI * 1.7 * t + k) + 0.35 * Math.sin(2 * Math.PI * 3.3 * t + 2 * k), 0.6 * Math.sin(2 * Math.PI * 1.3 * t + 1.7 * k) + 0.35 * Math.sin(2 * Math.PI * 2.9 * t + 0.5 * k)];

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await ctx.addInitScript(takeOverClock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?seed=${seed}`);
  const ready = () => page.evaluate(() => !!(window.__PLAYTEST__ && window.__PLAYTEST__.ready));
  for (let i = 0; i < 900 && !(await ready()); i++) { await page.evaluate((ms) => window.__rec.step(ms), STEP); await page.waitForTimeout(10); }
  if (!(await ready())) throw new Error('页面没有就绪');
  await page.evaluate(() => {
    const css = document.createElement('style');
    css.textContent = `.fdot{position:fixed;left:0;top:0;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;
      background:radial-gradient(circle,rgba(255,255,255,.7) 0%,rgba(255,255,255,.42) 55%,rgba(255,255,255,.2) 100%);
      border:2px solid rgba(255,255,255,.97);box-shadow:0 0 0 1.5px rgba(40,34,26,.5),0 2px 10px rgba(0,0,0,.35);pointer-events:none;z-index:99999;opacity:0}
      button{-webkit-tap-highlight-color:transparent}`;
    document.head.appendChild(css);
    const d = document.createElement('div'); d.className = 'fdot'; d.id = 'fdot'; document.body.appendChild(d);
  });
  // 开录前让熊在桌上躺稳（这段不截）
  for (let i = 0; i < 60; i++) { await page.evaluate((ms) => window.__rec.step(ms), STEP); await page.waitForTimeout(6); }
  const cdp = await ctx.newCDPSession(page);
  const snap = () => page.evaluate(() => window.__PLAYTEST__.snapshot());
  const elCenter = (sel) => page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
  const BTN = { pour: await elCenter('#pour') };
  console.log('按钮中心', JSON.stringify(BTN), '画质', (await snap()).render.quality);

  // ---- 手指 ----
  const F = { x: 0, y: 0, down: false, tDown: -9, tUp: -9, beh: null };
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: F.x, y: F.y, id: 0, radiusX: 12, radiusY: 12, force: 1 }] });
  let tick = 0; const now = () => tick * STEP / 1000;
  const cues = [], track = [];
  let st = null;
  const cue = (name, extra) => { cues.push({ name, t: +now().toFixed(3), ...extra }); console.log(`[${now().toFixed(2)}s] ${name}${extra ? ' ' + JSON.stringify(extra) : ''}`); };
  async function substep() {
    const t = now();
    if (F.beh) { const b = F.beh, lt = t - b.t0; const p = b.update(cl(lt / b.dur), lt); F.x = p[0]; F.y = p[1]; if (F.down) await send('touchMove'); if (lt >= b.dur) F.beh = null; }
    st = await page.evaluate((ms) => { window.__rec.step(ms); const s = window.__PLAYTEST__.snapshot(); return { time: s.time, count: s.count, pending: s.pending, grabbing: s.grabbing, stretch: s.stretch, maxStretch: s.maxStretch, bounce: s.bounce,
      bears: s.bears.map((b) => ({ id: b.id, flavor: b.flavor, centre: b.centre, screen: b.screen, box: b.box, speed: b.speed, asleep: b.asleep, volume: b.volume })) }; }, STEP);
    tick++;
    if (st.grabbing) peak = Math.max(peak, st.stretch); else if (!F.down) peak = 1;
  }
  let frame = 0, lastLog = -1;
  const enc = DRY ? null : encoder(path.join(out, 'video.mp4'));
  async function videoFrame() {
    for (let i = 0; i < SUB; i++) await substep();
    const t = now(), still = STILLS.find((s) => Math.abs(s - t) < 0.5 / FPS);
    track.push({ t: +t.toFixed(3), count: st.count, pending: st.pending, grabbing: st.grabbing, stretch: st.stretch, bounce: st.bounce, moving: st.bears.filter((b) => !b.asleep && b.speed > 0.25).length, minVolume: Math.min(...st.bears.map((b) => b.volume)), finger: [+F.x.toFixed(1), +F.y.toFixed(1), F.down ? 1 : 0] });
    if (!DRY || still !== undefined) {
      const d = F.down ? ((k) => ({ o: k, s: 0.72 + 0.28 * k }))(cl((t - F.tDown) / 0.06)) : ((k) => ({ o: 1 - k, s: 1 + 0.45 * k }))(cl((t - F.tUp) / 0.22));
      await page.evaluate(([d, x, y]) => { const el = document.getElementById('fdot'); el.style.opacity = d.o; el.style.transform = `translate(${x}px,${y}px) scale(${d.s})`; }, [d, F.x, F.y]);
      await page.waitForTimeout(SETTLE);
      const jpg = await page.screenshot({ type: 'jpeg', quality: 93 });
      if (enc) await enc.write(jpg);
      if (still !== undefined) fs.writeFileSync(path.join(out, `still-${still.toFixed(2)}.jpg`), jpg);
    }
    frame++;
    if (Math.floor(t * 2) !== lastLog) { lastLog = Math.floor(t * 2);
      console.log(`t=${t.toFixed(1)} 熊 ${st.count}+${st.pending} 抓 ${st.grabbing ? st.grabbing.bear + ':' + st.grabbing.particle : '-'} 拉伸 ×${st.stretch.toFixed(2)} 最大 ×${st.maxStretch.toFixed(2)} 弹跳 ${st.bounce.toFixed(2)} 在动 ${st.bears.filter((b) => !b.asleep && b.speed > 0.25).length} 最小体积比 ${Math.min(...st.bears.map((b) => b.volume)).toFixed(2)} 手 (${F.x.toFixed(0)},${F.y.toFixed(0)})${F.down ? ' 按着' : ''}`); }
  }
  const at = async (sec) => { while (now() < sec - 1e-6) await videoFrame(); };
  const wait = (sec) => at(now() + sec);
  const nextBeat = (t = now()) => Math.ceil((t + 0.02) / BEAT) * BEAT;
  const until = async (pred, maxSec, name) => { const end = now() + maxSec; while (now() < end && !pred(st)) await videoFrame(); if (!pred(st)) console.log('UNTIL-TIMEOUT', name); };
  const toScreen = (p) => page.evaluate((p) => { const q = window.__PLAYTEST__.pointScreen(p); return [q.x, q.y]; }, p);
  // 一开始那一排的抓点：同一个种子、同一档画质，在 Node 里照样建一个 World、走同样多步，取头、耳朵那颗粒子的位置，
  // 再用页面自己的 pointScreen 投到屏幕上（开录前熊已经躺稳睡着，两边逐位一致，下面核对重心）。
  // 倒出来以后熊的朝向不定，就抓重心在屏幕上的那一点（页面自己投影的 centre，熊身体里一定有粒子）
  const { World } = await import(require('url').pathToFileURL(path.resolve(__dirname, '../src/physics.js')).href);
  const twin = new World({ seed: Number(seed), quality: 'low' }), s0 = await snap();
  for (let i = 0, n = Math.round(s0.time * 60); i < n; i++) twin.step();
  const drift = Math.max(...s0.bears.map((b, i) => Math.hypot(...b.position.map((v, k) => v - twin.snapshot().bears[i].position[k]))));
  console.log(`Node 里的同一排和页面差 ${drift.toFixed(5)}（页面走了 ${Math.round(s0.time * 60)} 步）`);
  if (drift > 0.01) throw new Error('Node 里的熊和页面对不上');
  const partAt = (bear, part) => { const o = (bear * twin.n + twin.partParticle[part]) * 3; return toScreen([twin.x[o], twin.x[o + 1], twin.x[o + 2]]); };
  const ROW = { red: { head: await partAt(0, 'head'), earR: await partAt(0, 'earR') }, orange: { head: await partAt(1, 'head') }, yellow: { head: await partAt(2, 'head'), earR: await partAt(2, 'earR') }, green: { head: await partAt(3, 'head') }, pine: { head: await partAt(4, 'head') } };
  console.log('抓点', JSON.stringify(ROW));
  const centreOf = (id) => st.bears[id].centre;
  const TOP = 128;   // 手往上拉最高到这里（CSS 像素）：再往上就进了平台顶部的遮挡区，也会压到标题
  const upTo = (dy) => Math.max(dy, TOP - F.y);
  // 手的动作
  function handPath(fn, dur) { F.beh = { t0: now(), dur, update: (u, lt) => fn(u, lt) }; return wait(dur); }
  async function touch(p, name, extra) {
    F.x = p[0]; F.y = p[1]; F.down = true; F.tDown = now(); await send('touchStart');
    await wait(1 / FPS);
    cue('touch:' + name, { grab: st.grabbing, ...extra });
    if (!st.grabbing && name !== 'button') console.log('  扑空：手下面没有熊');
  }
  let peak = 1;
  async function lift(name) { F.down = false; F.tUp = now(); await send('touchEnd'); cue('lift:' + name, { stretch: st.stretch, peak: +peak.toFixed(3) }); }
  // 从 p 拉到 p + d（像素），dur 秒，慢-快-慢
  function pull(d, dur, k = 1) { const p0 = [F.x, F.y]; return handPath((u, lt) => { const e = mj(u), tr = tremor(lt, k); return [p0[0] + d[0] * e + tr[0] * 0.6, p0[1] + d[1] * e + tr[1] * 0.6]; }, dur); }
  // 拉着不放，轻轻来回晃
  function wobble(dur, amp = [10, 6], hz = 1.6, k = 2) { const c = [F.x, F.y]; return handPath((u, lt) => { const s = Math.sin(2 * Math.PI * hz * lt) * Math.min(1, lt / 0.25), tr = tremor(lt, k); return [c[0] + amp[0] * s + tr[0] * 0.6, c[1] + amp[1] * s + tr[1] * 0.6]; }, dur); }
  // 甩：加速划出去，抬手时速度最大
  function flick(d, dur) { const p0 = [F.x, F.y]; return handPath((u) => { const s = u * u; return [p0[0] + d[0] * s, p0[1] + d[1] * s]; }, dur); }
  async function tapButton(sel, name) {
    const r = await page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }, sel);
    const p = [r[0] + r[2] * 0.47, r[1] + r[3] * 0.5];
    F.x = p[0]; F.y = p[1]; F.down = true; F.tDown = now(); await send('touchStart'); cue('tap:' + name);
    await wait(0.09); F.down = false; F.tUp = now(); await send('touchEnd');
    await page.waitForTimeout(70);   // 触摸变成 click 要一点真实时间
  }

  // ================= 动作编排 =================
  const videoStart = await page.evaluate(() => window.__rec.now), t0wall = Date.now();
  await wait(1 / FPS);
  cue('start', { count: st.count });
  // 1. 捏住红熊的头猛地往上一拎：脖子先伸长，身子被拖着拉成长条；拎着晃两下，松手弹回去
  await at(0.9 - 1 / FPS); await touch(ROW.red.head, 'stretch', { bear: 0 });
  await pull([-20, upTo(-190)], 0.28, 1); await wobble(1.3, [14, 6], 1.3, 2);
  await at(3.0); await lift('stretch');
  // 2. 黄熊的右耳往右拽：耳朵那一段变细拉长
  await at(4.0 - 1 / FPS); await touch(ROW.yellow.earR, 'ear', { bear: 2 });
  await pull([95, -45], 0.6, 3); await wobble(0.7, [5, 3], 1.8, 4);
  await at(5.5); await lift('ear');
  // 3. 绿熊：捏住头往上提一点，猛地往右上一甩，飞出去、落地压扁、再弹
  await at(6.5 - 1 / FPS); await touch(ROW.green.head, 'fling', { bear: 3 });
  await pull([20, -110], 0.5, 5); await wait(0.2);
  await flick([170, -170], 0.14); await lift('fling');
  await wait(1.6);
  // 4. 菠萝色那只：一把拎起来马上松手，拉长一下就「嘣」地弹回去
  { const t = nextBeat(now() + 0.3); await at(t - 1 / FPS); }
  await touch(ROW.pine.head, 'yank', { bear: 4 });
  await pull([10, -150], 0.2, 6); await wobble(0.3, [6, 3], 2.2, 7);
  await lift('yank');
  // 5. 连点三下「再倒一些」：一把一把倒下来，堆成一堆，第三下倒满 18 只
  for (let k = 0; k < 3; k++) { const t = nextBeat(now() + (k ? 1.2 : 0.8)); await at(t - 1 / FPS); await tapButton('#pour', 'pour'); await wait(0.3); }
  await until((s) => !s.pending && s.bears.filter((b) => !b.asleep && b.speed > 0.25).length <= 2, 6, 'pile');
  cue('piled', { count: st.count });
  // 6. 从堆里拎一只往上拉：身子被别的熊压着，拉得最长；松手弹回去。再甩一只出去
  const used = new Set();
  const inPile = () => { const bs = st.bears.filter((b) => !used.has(b.id) && b.id >= 5); const cx = bs.reduce((a, b) => a + b.centre[0], 0) / bs.length, cy = bs.reduce((a, b) => a + b.centre[1], 0) / bs.length;
    return bs.sort((a, b) => Math.hypot(a.centre[0] - cx, a.centre[1] - cy) - Math.hypot(b.centre[0] - cx, b.centre[1] - cy))[0].id; };
  const topBear = () => st.bears.filter((b) => !used.has(b.id)).sort((a, b) => b.box.max[1] - a.box.max[1])[0].id;
  { const t = nextBeat(now() + 0.3); await at(t - 1 / FPS); }
  let tb = inPile(); used.add(tb); await touch(centreOf(tb), 'pileStretch', { bear: tb });
  await pull([-15, upTo(-140)], 0.25, 8); await wobble(1.0, [12, 6], 1.4, 9);
  { const t = nextBeat(now()); await at(t); } await lift('pileStretch');
  await wait(1.0);
  tb = topBear(); used.add(tb); { const t = nextBeat(now() + 0.3); await at(t - 1 / FPS); }
  await touch(centreOf(tb), 'pileFling', { bear: tb });
  await pull([0, upTo(-80)], 0.4, 10); await wait(0.15);
  await flick([-190, -150], 0.14); await lift('pileFling');
  await wait(1.8);
  // 7. 收尾：再从堆里猛拎一只拉长，晃着，松手「嘣」
  tb = inPile(); used.add(tb); { const t = nextBeat(now() + 0.3); await at(t - 1 / FPS); }
  await touch(centreOf(tb), 'finale', { bear: tb });
  await pull([25, upTo(-150)], 0.25, 11); await wobble(1.0, [10, 6], 1.5, 12);
  { const t = nextBeat(now()); await at(t); } await lift('finale');
  // 8. 最后再甩一只往右上飞出去，落地压扁、弹两下，整堆跟着抖
  await wait(0.6);
  tb = topBear(); used.add(tb); { const t = nextBeat(now() + 0.3); await at(t - 1 / FPS); }
  await touch(centreOf(tb), 'lastFling', { bear: tb });
  await pull([0, upTo(-90)], 0.4, 13); await wait(0.15);
  await flick([180, -150], 0.14); await lift('lastFling');
  cue('end');
  await wait(Number(flag('tail', '2.2')));

  const liveSec = frame / FPS;
  console.log(`实录 ${liveSec.toFixed(2)} 秒 ${frame} 帧，用时 ${((Date.now() - t0wall) / 1000).toFixed(0)} 秒；${errors.length ? '页面报错 ' + errors[0] : '页面零报错'}`);
  if (!DRY) {
    const videoEnd = await page.evaluate(() => window.__rec.now), len = await page.evaluate(([a, b]) => window.__rec.renderPcm(a, b), [videoStart, videoEnd]);
    const parts = []; for (let i = 0; i < len; i += 4e6) parts.push(await page.evaluate(([a, b]) => window.__rec.b64.slice(a, b), [i, i + 4e6]));
    const raw = Buffer.from(parts.join(''), 'base64'), wav = Buffer.alloc(44 + raw.length);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + raw.length, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(48000 * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(raw.length, 40); raw.copy(wav, 44);
    fs.writeFileSync(path.join(out, 'page.wav'), wav);
    await ctx.close();
    // ---- 署名页：固定模板，只换 config ----
    const ed = path.join(out, 'endcard'); fs.mkdirSync(ed, { recursive: true });
    for (const name of ['endcard.html', 'endcard.js']) fs.copyFileSync(path.join(endDir, name), path.join(ed, name));
    fs.writeFileSync(path.join(ed, 'config.js'), `window.ENDCARD = {
  series: "playground 三维展页",
  title: "软糖熊",
  accounts: ["公众号：我的AI小木屋", "微博 · 快手 · 全民K歌：安闲静雅"],
  notes: [
    ["玩法", "捏住一只熊往外拉，松手弹回；用力一甩飞出去、落地压扁再弹；「再倒一些」倒成一堆"],
    ["画面", "网页实机逐帧录制，手指是模拟的真实触摸；熊的造型、软体物理全部由代码生成"],
    ["声音", "「啵」「啾」「嘣」是页面当场合成的；配乐也由代码合成，没有采样素材"],
    ["借鉴", "三维渲染用开源 Three.js（MIT）；软体是自己写的位置式物理"],
    ["构思", "小试AI · 与 Claude Code 协作完成"],
  ],
};
`);
    const ectx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 }), ep = await ectx.newPage();
    await ep.goto('file://' + path.resolve(ed, 'endcard.html'));
    await ep.waitForFunction(() => window.__ready, null, { polling: 50 });
    const dur = await ep.evaluate(() => window.__duration());
    const nEnd = Math.round(dur * FPS);
    for (let i = 0; i < nEnd; i++) { await ep.evaluate((t) => window.__seek(t), i / FPS); await enc.write(await ep.locator('#c').screenshot({ type: 'jpeg', quality: 93 })); }
    await enc.end();
    fs.writeFileSync(path.join(out, 'cues.json'), JSON.stringify({ fps: FPS, seed, beat: BEAT, live: +liveSec.toFixed(3), endcard: +(nEnd / FPS).toFixed(3), total: +((frame + nEnd) / FPS).toFixed(3), cues, track, errors }, null, 1));
    console.log(`署名页 ${(nEnd / FPS).toFixed(2)} 秒；全片 ${((frame + nEnd) / FPS).toFixed(2)} 秒`);
  } else fs.writeFileSync(path.join(out, 'cues-dry.json'), JSON.stringify({ live: frame / FPS, cues, track, errors }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
