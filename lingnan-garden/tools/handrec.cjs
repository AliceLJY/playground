// 手机竖屏「手在屏幕上操作」的录屏（手动跑，不进 CI）。页面直接铺满 1080×1920 整个画幅，不套手机外框
// （Alice 2026-11-11：「竖屏你不用套手机的那个屏幕啊，这样显得画面太小了」）：按 360×640 的手机视口打开，3 倍像素截图。
// 做法照 video-director production-routing「网页互动页手机操作演示」：按手机视口打开页面（界面全在，不加 ?capture），
// 手指动作用 CDP 的真实触摸事件发进页面，镜头和人怎么动全由页面自己的摇杆、拖动、按钮响应；脚本只接管时钟逐帧推进并截图。
//   node tools/serve.cjs . 8993
//   NODE_PATH="$(npm root -g)" node tools/handrec.cjs <输出目录> [--base http://127.0.0.1:8993/dist/index.html] [--dry]
// 产物：<输出目录>/screen.mp4（1080×1920）、ambience.wav（页面环境声，同钟离线渲染）、cues.json（每个手势的起止时刻）。
// 配乐、接署名页见 tools/handrec-music.py。--dry 不截图，只打印每个手势开始时人在哪、朝哪，排手势时用。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; }, has = n => args.includes('--' + n);
const out = args[0]; if (!out || out.startsWith('--')) { console.error('usage: handrec.cjs <输出目录>'); process.exit(2); }
const base = flag('base', 'http://127.0.0.1:8993/dist/index.html'), DRY = has('dry');
const W = 360, H = 640, DPR = 3, FPS = 30, SUB = 2, STEP = 1000 / (FPS * SUB);   // 每帧推进两步：页面按 60 帧跑（角标显示 60 fps），触摸采样也是 60 Hz
const SETTLE = 12;                 // 截图前等合成器把这一帧的网页文字层交上去（production-routing 记过的坑）
const LOOK = 0.0065, PITCH = 0.004, JOY_R = 46;   // 与页面一致：触屏拖动每像素转多少、摇杆半径
fs.mkdirSync(out, { recursive: true });

const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mj = s => { s = cl(s); return s * s * s * (10 - 15 * s + 6 * s * s); };   // 最小加加速度：手起落都是慢-快-慢
const lerp = (a, b, s) => a + (b - a) * s;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const tremor = (t, k) => [0.6 * Math.sin(2 * Math.PI * 1.7 * t + k) + 0.35 * Math.sin(2 * Math.PI * 3.3 * t + 2 * k), 0.6 * Math.sin(2 * Math.PI * 1.3 * t + 1.7 * k) + 0.35 * Math.sin(2 * Math.PI * 2.9 * t + 0.5 * k)];

// ---- 开录前人站在哪（上一次走到的地方；页面切到明信片机位不会改它）----
const PRE = { x: -6.75, z: 8.3, yaw: -0.3, pitch: -0.05 };
// ---- 左手拇指：推摇杆沿这条路走。池西岸往北 → 檐廊西头的踏步 → 上檐廊 → 进门 → 屋里 ----
const WP = [[-6.85, 2.6], [-6.95, -0.75], [-6.55, -1.5], [-4.6, -1.47], [-4.57, -3.35], [-2.2, -4.4]];
const THUMB = [80, 486];
// ---- 右手：手势按顺序做。t＝固定时刻；after＝等某件事发生（走起来、到某个路点、到屋里、开始逛、切俯瞰）；其余接在上一个手势后面 gap 秒 ----
const G = [
  { kind: 'drag', p0: [326, 613], p1: [222, 613], dur: 0.28, t: 0.4, settle: 220, name: '把底栏往左划一点，露出「对照原图」' },
  { kind: 'tap', el: 'bRef', gap: 0.22, expect: 'refOn', name: '点「对照原图」' },
  { kind: 'tap', el: 'ref', gap: 0.5, expect: 'refBig', name: '点小图放大' },
  { kind: 'tap', el: 'bRef', gap: 0.75, expect: 'refOff', name: '收起原图' },
  { kind: 'tap', el: 'bWalk', gap: 0.3, expect: 'walk', sets: 'walk', name: '点「走进去」' },
  { kind: 'lookTo', yaw: -0.92, pitch: -0.16, dur: 0.40, after: 'walk', gap: 0.75, c: [266, 344], name: '转头看荷池和对岸的敞厅' },
  { kind: 'lookTo', yaw: -1.28, pitch: -0.24, dur: 0.36, gap: 0.55, c: [261, 376], name: '低头看栏杆的陶瓶和荷花' },
  { kind: 'lookTo', yaw: -0.2, pitch: 0.03, dur: 0.42, gap: 0.5, c: [266, 328], name: '回头看前面的山墙和炮仗花' },
  { kind: 'lookTo', yaw: -1.5, pitch: -0.03, dur: 0.36, after: 'wp1', gap: -0.2, c: [264, 352], name: '转向踏步' },
  { kind: 'lookTo', yaw: -0.8, pitch: -0.02, dur: 0.3, after: 'wp2', gap: 0.22, c: [262, 336], name: '上檐廊，先转一半' },
  { kind: 'lookTo', yaw: -0.02, pitch: -0.02, dur: 0.32, after: 'wp3', gap: -0.12, c: [262, 344], name: '转向门' },
  { kind: 'lookTo', yaw: -1.15, pitch: -0.03, dur: 0.36, after: 'wp4', gap: -0.05, c: [264, 360], name: '进屋往里看' },
  // 屋里：手快速连甩五下，原地转一圈多（每划 225 像素约 84 度，五下约 420 度）。
  // 试过把扫过满洲窗那半圈放慢成两笔长拖（约每秒 75 度）：质检的频闪筛查报得更久（2.9 秒对 1.8 秒），手也不利索了，所以还是快甩
  { kind: 'swipe', d: [-225, 12], dur: 0.25, after: 'arr', gap: 0.18, c: [236, 352], name: '屋里甩第一下' },
  { kind: 'swipe', d: [-225, -8], dur: 0.24, gap: 0.17, c: [234, 376], name: '甩第二下' },
  { kind: 'swipe', d: [-225, 6], dur: 0.24, gap: 0.16, c: [238, 340], name: '甩第三下' },
  { kind: 'swipe', d: [-225, -10], dur: 0.24, gap: 0.16, c: [236, 384], name: '甩第四下' },
  { kind: 'swipe', d: [-225, 8], dur: 0.25, gap: 0.17, c: [236, 356], name: '甩第五下' },
  { kind: 'swipe', d: [118, -22], dur: 0.42, gap: 0.22, c: [234, 344], name: '往回带一点，抬头' },
  { kind: 'tap', el: 'bTour', gap: 0.35, expect: 'tour', sets: 'tour', name: '点「带我逛一圈」' },
  { kind: 'swipe', d: [125, -8], dur: 0.34, after: 'tour', gap: 1.4, c: [252, 344], expect: 'paused', name: '逛着的时候一拖：停下' },
  { kind: 'swipe', d: [-160, 10], dur: 0.4, gap: 0.3, c: [240, 364], name: '停着随便看' },
  { kind: 'tap', el: 'bTour', gap: 0.35, expect: 'resumed', name: '点「继续逛」' },
  { kind: 'tap', el: 'bTop', gap: 1.05, expect: 'top', sets: 'top', name: '点「俯瞰」' },
  { kind: 'drag', p0: [296, 336], p1: [108, 374], dur: 0.75, after: 'top', gap: 0.42, bulge: 14, name: '拖着转' },
  { kind: 'pinch', c: [183, 344], d0: 100, d1: 190, a0: -0.62, a1: -0.48, dur: 0.6, gap: 0.2, name: '双指张开放大' },
  { kind: 'drag', p0: [108, 404], p1: [306, 330], dur: 0.9, gap: 0.2, bulge: -16, name: '放大了再转半圈' },
  { kind: 'pinch', c: [185, 352], d0: 200, d1: 140, a0: -0.55, a1: -0.7, dur: 0.55, gap: 0.2, name: '捏回一点' },
];
const TAIL = 0.7;   // 最后一个手势后停多久

function takeOverClock() {   // 在页面脚本之前执行：时钟、rAF、定时器、随机数、音频上下文都换成脚本控制的
  let vnow = 0, queue = [], nextId = 1, timers = []; const wall = Date.now();
  performance.now = () => vnow; Date.now = () => wall + vnow;
  window.requestAnimationFrame = cb => { const id = nextId++; queue.push({ id, cb }); return id; };
  window.cancelAnimationFrame = id => { queue = queue.filter(q => q.id !== id); };
  window.setTimeout = (cb, ms = 0, ...a) => { const id = nextId++; timers.push({ id, due: vnow + ms, cb: () => (typeof cb === 'function' ? cb(...a) : 0) }); return id; };
  window.clearTimeout = id => { timers = timers.filter(t => t.id !== id); };
  let seed = 20261112; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  class RecordingAudioContext extends OfflineAudioContext {
    constructor() { super(2, 48000 * 120, 48000); this._t0 = vnow; window.__rec.audio = this; window.__rec.audioStart = vnow; }
    get currentTime() { return (vnow - this._t0) / 1000; }
    get state() { return 'running'; }
    resume() { return Promise.resolve(); }
  }
  window.AudioContext = RecordingAudioContext; window.webkitAudioContext = RecordingAudioContext;
  window.__rec = {
    audio: null, audioStart: 0, get now() { return vnow; },
    step(ms) {
      vnow += ms;
      const due = timers.filter(t => t.due <= vnow); timers = timers.filter(t => t.due > vnow); for (const t of due) { try { t.cb(); } catch (e) { console.error(e); } }
      const q = queue; queue = []; for (const { cb } of q) { try { cb(vnow); } catch (e) { console.error(e); } }
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
const encoder = file => {   // 截图是全范围 BT.601 的 JPEG，转成有限范围 BT.709 并打标
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
  return { write: async jpg => { if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r)); }, end: () => { ff.stdin.end(); return done; } };
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await ctx.addInitScript(takeOverClock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  const ready = () => page.evaluate(() => !!(window.__garden && window.__garden.ready));
  for (let i = 0; i < 900 && !await ready(); i++) { await page.evaluate(ms => window.__rec.step(ms), STEP); await page.waitForTimeout(15); }
  if (!await ready()) throw new Error('页面没有就绪');
  // 手指：半透明白圆点，按下浮现、抬起扩散淡出（照齿轮录屏的画法；这页底色浅，加一圈深色描边）
  await page.evaluate(() => {
    const css = document.createElement('style');
    css.textContent = `.fdot{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
      background:radial-gradient(circle,rgba(255,255,255,.62) 0%,rgba(255,255,255,.36) 55%,rgba(255,255,255,.18) 100%);
      border:1.5px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(20,18,14,.42),0 2px 9px rgba(0,0,0,.45);pointer-events:none;z-index:99999;opacity:0}
      #bar .row{scroll-behavior:auto}`;
    document.head.appendChild(css);
    for (const i of [0, 1, 2]) { const d = document.createElement('div'); d.className = 'fdot'; d.id = 'fdot' + i; document.body.appendChild(d); }
  });
  // 开录前：进到明信片机位（真实点击入口按钮），人放在上一次走到的池边
  await page.evaluate(pre => { document.getElementById('goCard').click(); Object.assign(window.__garden.S.walk, pre); const g = window.__garden; g.S.walk.y = g.C.groundY(pre.x, pre.z); }, PRE);
  for (let i = 0; i < 48; i++) { await page.evaluate(ms => window.__rec.step(ms), STEP); await page.waitForTimeout(20); }   // 预热，角标的帧率也稳到 60
  console.log('渲染器', await page.evaluate(() => window.__garden.gpu()));
  const cdp = await ctx.newCDPSession(page);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 11, radiusY: 11, force: 1 })) });
  const rectOf = id => page.evaluate(id => { const b = document.getElementById(id).getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }, id);
  const stateOf = () => page.evaluate(() => { const g = window.__garden, S = g.S, r = document.getElementById('ref'); return { x: S.walk.x, z: S.walk.z, yaw: S.walk.yaw, pitch: S.walk.pitch, mode: S.mode, tour: S.tour.on, paused: S.tour.paused, refOn: r.style.display === 'block', refBig: r.classList.contains('big'), az: S.top.az, dist: S.top.dist }; });
  const EXPECT = { refOn: s => s.refOn, refBig: s => s.refOn && s.refBig, refOff: s => !s.refOn, walk: s => s.mode === 'walk' && !s.tour, tour: s => s.tour && !s.paused, paused: s => s.tour && s.paused, resumed: s => s.tour && !s.paused, top: s => s.mode === 'top' };

  const T = {}, cues = [];                       // 事件时刻（秒）
  let st = await stateOf(), prevIds = [], lastPts = [];
  const vis = [0, 1, 2].map(() => ({ down: false, x: 0, y: 0, tDown: -9, tUp: -9 }));
  // ---- 右手 ----
  let gi = 0, cur = null, prevEnd = 0;
  const startOf = g => g.t != null ? g.t : g.after ? (T[g.after] == null ? null : Math.max(T[g.after] + (g.gap || 0), prevEnd + 0.06)) : prevEnd + (g.gap || 0);
  async function plan(g, ts) {
    if (g.kind === 'tap') { const r = await rectOf(g.el); g.p = [cl(r[0] + r[2] / 2, 12, W - 12), r[1] + r[3] / 2]; if (r[0] < 2 || r[0] + r[2] > W - 2) console.log('CLIPPED', g.el, r.map(v => v.toFixed(0)).join(',')); }
    if (g.kind === 'lookTo' || g.kind === 'swipe') {
      let dx = g.kind === 'swipe' ? g.d[0] : cl(-wrap(g.yaw - st.yaw) / LOOK, -235, 235); const dy = g.kind === 'swipe' ? g.d[1] : cl(-(g.pitch - st.pitch) / PITCH, -160, 160);
      // 起点要落在屏幕里、摇杆区外面（左下那块按下去会被页面当成摇杆）；终点可以划进去
      let x0 = g.c[0] - dx / 2; if (dx < 0) x0 = Math.min(W - 14, x0); else { x0 = Math.max(W * 0.45 + 10, x0); dx = Math.min(dx, W - 12 - x0); }
      g.p0 = [x0, g.c[1] - dy / 2]; g.p1 = [x0 + dx, g.c[1] + dy / 2];
    }
    if (g.p0 && st.mode === 'walk' && g.p0[0] < W * 0.45 + 6 && g.p0[1] > H * 0.35) console.log('IN-JOY-ZONE', g.name, g.p0.map(v => v.toFixed(0)).join(','));   // 起点落进摇杆区会被页面当成摇杆
    console.log(ts.toFixed(2), g.name, `| 人在 ${st.x.toFixed(2)},${st.z.toFixed(2)} 朝向 ${(st.yaw * 180 / Math.PI).toFixed(0)}° ${st.mode}${st.tour ? (st.paused ? ' 逛·停' : ' 逛') : ''}`);
  }
  function rightPts(g, tau, ts) {
    const tr = tremor(ts, g.t0);
    if (g.kind === 'tap') return [{ id: 0, x: g.p[0] + tr[0] * 0.3, y: g.p[1] + tr[1] * 0.3 }];
    if (g.kind === 'pinch') { const s = mj(tau), d = lerp(g.d0, g.d1, s), a = lerp(g.a0, g.a1, s), c = [g.c[0] + tr[0], g.c[1] + tr[1]]; return [{ id: 0, x: c[0] + d / 2 * Math.cos(a), y: c[1] + d / 2 * Math.sin(a) }, { id: 2, x: c[0] - d / 2 * Math.cos(a), y: c[1] - d / 2 * Math.sin(a) }]; }
    const s = mj(tau), dx = g.p1[0] - g.p0[0], dy = g.p1[1] - g.p0[1], L = Math.hypot(dx, dy) || 1, b = (g.bulge ?? 9) * Math.sin(Math.PI * s);   // 手划出来是带一点弧的
    return [{ id: 0, x: lerp(g.p0[0], g.p1[0], s) - dy / L * b + tr[0] * 0.5, y: lerp(g.p0[1], g.p1[1], s) + dx / L * b + tr[1] * 0.5 }];
  }
  // ---- 左手拇指 ----
  let wi = 0, thumbOn = false, thumbUpAt = null, thumb = [0, 0], thumbT0 = 0;
  function thumbPt(ts) {
    if (T.walk == null || T.arr != null && thumbUpAt != null && ts >= thumbUpAt) return null;
    if (ts < T.walk) return null;
    if (!thumbOn) { thumbOn = true; thumbT0 = ts; thumb = [0, 0]; cues.push({ t: ts, type: 'thumbDown' }); }
    let want = [0, 0];
    if (T.arr == null) {
      let [wx, wz] = WP[wi], d = Math.hypot(wx - st.x, wz - st.z);
      while (d < (wi === WP.length - 1 ? 0.22 : 0.42)) { T['wp' + wi] = ts; cues.push({ t: ts, type: 'wp' + wi }); wi++; if (wi >= WP.length) { T.arr = ts; thumbUpAt = ts + 0.14; cues.push({ t: ts, type: 'arrive' }); break; } [wx, wz] = WP[wi]; d = Math.hypot(wx - st.x, wz - st.z); }
      if (T.arr == null) {
        const ux = (wx - st.x) / d, uz = (wz - st.z) / d, sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
        const iy = -sy * ux - cy * uz, ix = cy * ux - sy * uz, mag = Math.min(1, 0.2 + (ts - thumbT0) / 0.22) * (wi === WP.length - 1 ? cl(0.35 + d / 0.9, 0, 1) : 1);
        want = [ix * (JOY_R + 5) * mag, -iy * (JOY_R + 5) * mag];
      }
    }
    thumb = [thumb[0] + (want[0] - thumb[0]) * 0.3, thumb[1] + (want[1] - thumb[1]) * 0.3];   // 拇指跟得上但不是瞬移
    const tr = tremor(ts, 7.7);
    return { id: 1, x: THUMB[0] + thumb[0] + tr[0] * 0.4, y: THUMB[1] + thumb[1] + tr[1] * 0.4 };
  }

  async function substep(ts) {
    // 右手：结束当前手势
    let endedTap = null, endedG = null;
    if (cur && ts >= cur.t0 + cur.dur) { endedG = cur; if (cur.kind === 'tap') endedTap = cur; prevEnd = ts; cues.push({ t: cur.t0, end: ts, type: cur.kind, name: cur.name }); cur = null; gi++; }
    if (!cur && gi < G.length) { const t0 = startOf(G[gi]); if (t0 != null && ts >= t0) { cur = G[gi]; cur.t0 = ts; if (cur.kind === 'tap' && cur.dur == null) cur.dur = 0.1; await plan(cur, ts); } }
    const pts = [];
    const tp = thumbPt(ts); if (tp) pts.push(tp);
    if (cur) pts.push(...rightPts(cur, (ts - cur.t0) / cur.dur, ts));
    // 发触摸。CDP 不能只抬起其中一根手指（实测：少报一个点不会抬手），所以有手指抬起时先全抬、再把还按着的按回去；
    // 拇指按回去时先落在摇杆原点、同一步里再移到当前位置，页面看到的摇杆方向不变。
    const ids = pts.map(p => p.id).sort().join(), removed = prevIds.some(id => !pts.find(p => p.id === id)), added = pts.some(p => !prevIds.includes(p.id));
    if (!pts.length) { if (prevIds.length) await send('touchEnd', []); }
    else if (removed) {
      await send('touchEnd', []);
      await send('touchStart', pts.map(p => p.id === 1 ? { id: 1, x: THUMB[0], y: THUMB[1] } : p));
      if (pts.find(p => p.id === 1)) await send('touchMove', pts);
    } else if (added) {
      await send('touchStart', pts.map(p => (p.id === 1 && !prevIds.includes(1)) ? { id: 1, x: THUMB[0], y: THUMB[1] } : p));
      if (pts.find(p => p.id === 1) && !prevIds.includes(1)) await send('touchMove', pts);
    } else await send('touchMove', pts);
    for (const v of vis) v._seen = false;
    for (const p of pts) { const v = vis[p.id]; if (!v.down) { v.down = true; v.tDown = ts; } v.x = p.x; v.y = p.y; v._seen = true; }
    for (const v of vis) if (v.down && !v._seen) { v.down = false; v.tUp = ts; }
    if (thumbOn && !tp) { thumbOn = false; cues.push({ t: ts, type: 'thumbUp' }); }
    prevIds = pts.map(p => p.id); lastPts = pts;
    if (endedG && endedG.settle) await page.waitForTimeout(endedG.settle);   // 底栏的原生滚动要一点真实时间
    if (endedTap) await page.waitForTimeout(70);                              // 点按变成 click 要一点真实时间
    st = await page.evaluate(ms => { window.__rec.step(ms); const g = window.__garden, S = g.S, r = document.getElementById('ref'); return { x: S.walk.x, z: S.walk.z, yaw: S.walk.yaw, pitch: S.walk.pitch, mode: S.mode, tour: S.tour.on, paused: S.tour.paused, refOn: r.style.display === 'block', refBig: r.classList.contains('big'), az: S.top.az, dist: S.top.dist }; }, STEP);
    if (endedG && endedG.expect) {
      let ok = EXPECT[endedG.expect](st);
      if (!ok && endedG.kind === 'tap') { await page.waitForTimeout(120); st = await stateOf(); ok = EXPECT[endedG.expect](st); }
      if (!ok && endedG.kind === 'tap') { console.log('TAP-FALLBACK', endedG.name); await page.evaluate(id => document.getElementById(id).click(), endedG.el); st = await stateOf(); ok = EXPECT[endedG.expect](st); fallbacks++; }
      if (!ok) { console.log('EXPECT-FAIL', endedG.name, JSON.stringify(st)); fails++; }
    }
    if (endedG && endedG.sets && T[endedG.sets] == null) { T[endedG.sets] = ts + (endedG.sets === 'walk' ? 0.28 : 0); cues.push({ t: ts, type: endedG.sets }); }
  }
  let fallbacks = 0, fails = 0;
  const dotStyle = (v, t) => v.down ? (k => ({ x: v.x, y: v.y, o: k, s: 0.75 + 0.25 * k }))(cl((t - v.tDown) / 0.08)) : (k => ({ x: v.x, y: v.y, o: 1 - k, s: 1 + 0.4 * k }))(cl((t - v.tUp) / 0.22));

  const enc = DRY ? null : encoder(path.join(out, 'screen.mp4'));
  const videoStart = await page.evaluate(() => window.__rec.now), t0wall = Date.now();
  let f = 0, endAt = null; const track = [];
  for (; ; f++) {
    const t = f / FPS;
    for (let k = 0; k < SUB; k++) await substep(t + k / (FPS * SUB));
    track.push({ t: +t.toFixed(3), yaw: +st.yaw.toFixed(4), x: +st.x.toFixed(2), z: +st.z.toFixed(2), mode: st.mode });
    if (endAt == null && gi >= G.length && !cur) endAt = t + TAIL;
    if (!DRY) {
      await page.evaluate(dots => dots.forEach((d, i) => { const el = document.getElementById('fdot' + i); el.style.opacity = d.o; el.style.transform = `translate(${d.x}px,${d.y}px) scale(${d.s})`; }), vis.map(v => dotStyle(v, t)));
      await page.waitForTimeout(SETTLE);
      await enc.write(await page.screenshot({ type: 'jpeg', quality: 94 }));
    }
    if (endAt != null && t >= endAt) { f++; break; }
    if (t > 40) { console.log('超过 40 秒还没做完，停'); f++; break; }
  }
  if (enc) await enc.end();
  const dur = f / FPS, snap = await page.evaluate(() => window.__garden.snapshot());
  console.log(`正片 ${dur.toFixed(2)} 秒，${f} 帧，用时 ${((Date.now() - t0wall) / 1000).toFixed(0)} 秒；回退点击 ${fallbacks} 次，预期不符 ${fails} 处；${errors.length ? '页面报错 ' + errors[0] : '页面零报错'}`);
  console.log('事件', Object.entries(T).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  '));
  if (!DRY) {
    const videoEnd = await page.evaluate(() => window.__rec.now), len = await page.evaluate(([a, b]) => window.__rec.renderPcm(a, b), [videoStart, videoEnd]);
    const parts = []; for (let i = 0; i < len; i += 4e6) parts.push(await page.evaluate(([a, b]) => window.__rec.b64.slice(a, b), [i, i + 4e6]));
    const raw = Buffer.from(parts.join(''), 'base64'), n = raw.length / 4, wav = Buffer.alloc(44 + raw.length);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + raw.length, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(48000 * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(raw.length, 40); raw.copy(wav, 44);
    fs.writeFileSync(path.join(out, 'ambience.wav'), wav);
    console.log('环境声', (n / 48000).toFixed(2), '秒');
  }
  fs.writeFileSync(path.join(out, DRY ? 'cues-dry.json' : 'cues.json'), JSON.stringify({ fps: FPS, dur: +dur.toFixed(3), frames: f, events: T, cues, track, snap, fallbacks, fails, errors }, null, 1));
  await browser.close();
  if (fails) process.exit(3);
})().catch(e => { console.error(e); process.exit(1); });
