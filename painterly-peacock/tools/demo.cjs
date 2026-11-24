// 油彩孔雀 · 竖屏演示片的录制（手动跑，不进 CI、不改页面）：手机视口 540×960、2 倍像素截成 1080×1920，页面铺满，不套手机外框。
// 照 suisui/tools/demo.cjs 的做法：加载前接管页面时钟（performance.now、Date.now、rAF、setTimeout、setInterval、Math.random、
// CSS 动画同钟步进），每帧推进 1/30 秒（两步 1/60）；页面的 Web Audio 换成同钟的 OfflineAudioContext，录完离线渲出声音。
// 操作全是 CDP 发的真实鼠标事件，悬停开屏、跟着走、点尾羽、点底部按钮都由页面自己的事件处理响应，没有调 __PLAYTEST__ 的动作钩子
// （只读 snapshot() / featherAt() 找孔雀和眼斑在屏幕上的位置）。鼠标画成白圆点：悬停是空心圈，按下变实心、抬起扩散。
// 页面把 WebGL 像素比限在 1.75，画布按 945×1680 渲、由浏览器放大到 1080×1920；文字和按钮是 2 倍。
//   node tools/serve.cjs . 8981                                  （在 painterly-peacock/ 里）
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <输出目录> --endcard <署名页模板目录> [--base URL] [--seed 7] [--dry] [--stills 3,9.5]
// 署名页模板在作者本机 video-director 技能的 references/signature-endcard。
// 产物：<输出目录>/video.mp4（无声：实录＋署名页）、page.wav（实录段页面自己的声音）、cues.json（每个动作的时刻、孔雀状态轨迹）。
// 配乐与合成见 tools/demo-sound.py。--dry 不出视频，只打印每半秒的状态；--stills 在这几个时刻另存原尺寸静帧（--dry 时也存）。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; }, has = (n) => args.includes('--' + n);
const out = args[0]; if (!out || out.startsWith('--')) { console.error('usage: demo.cjs <输出目录> --endcard <模板目录>'); process.exit(2); }
const base = flag('base', 'http://127.0.0.1:8981/dist/index.html'), seed = flag('seed', '7'), endDir = flag('endcard', ''), DRY = has('dry');
const STILLS = (flag('stills', '') || '').split(',').filter(Boolean).map(Number);
if (!DRY && !endDir) { console.error('缺 --endcard <署名页模板目录>'); process.exit(2); }
const W = 540, H = 960, DPR = 2, FPS = 30, SUB = 2, STEP = 1000 / (FPS * SUB), SETTLE = 12;
const BEAT = 0.75;   // 80 拍：点击都落在拍点上，配乐卡同一张网格
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
  let seed = 20261125; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  class RecordingAudioContext extends OfflineAudioContext {
    constructor() { super(2, 48000 * 90, 48000); this._t0 = vnow; window.__rec.audio = this; window.__rec.audioStart = vnow; }
    get currentTime() { return (vnow - this._t0) / 1000; }
    get state() { return 'running'; }
    resume() { return Promise.resolve(); }
  }
  window.AudioContext = RecordingAudioContext; window.webkitAudioContext = RecordingAudioContext;
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
const mj = (s) => { s = cl(s); return s * s * s * (10 - 15 * s + 6 * s * s); };   // 最小加加速度：慢-快-慢，像手
const tremor = (t, k) => [0.6 * Math.sin(2 * Math.PI * 1.7 * t + k) + 0.35 * Math.sin(2 * Math.PI * 3.3 * t + 2 * k), 0.6 * Math.sin(2 * Math.PI * 1.3 * t + 1.7 * k) + 0.35 * Math.sin(2 * Math.PI * 2.9 * t + 0.5 * k)];

// 透视投影（和页面同一组相机参数），世界坐标 → CSS 像素
function projector(camState) {
  const [ex, ey, ez] = camState.position, [tx, ty, tz] = camState.target;
  let f = [tx - ex, ty - ey, tz - ez]; const fl = Math.hypot(...f); f = f.map((v) => v / fl);
  let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0]; const rl = Math.hypot(...r); r = r.map((v) => v / rl);   // f × up
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const k = 1 / Math.tan(camState.fov * Math.PI / 360), aspect = W / H;
  return (p) => { const d = [p[0] - ex, p[1] - ey, p[2] - ez], z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2], x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2], y = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    return [(1 + x / z * k / aspect) / 2 * W, (1 - y / z * k) / 2 * H]; };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await ctx.addInitScript(takeOverClock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?seed=${seed}`);
  const ready = () => page.evaluate(() => !!(window.__PLAYTEST__ && window.__PLAYTEST__.ready));
  for (let i = 0; i < 900 && !(await ready()); i++) { await page.evaluate((ms) => window.__rec.step(ms), STEP); await page.waitForTimeout(10); }
  if (!(await ready())) throw new Error('页面没有就绪');
  // 声音默认关：开录前把「声音」按钮点开（这一下不在片里），页面的合成音效就进 OfflineAudioContext
  await page.evaluate(() => document.getElementById('b-sound').click());
  await page.evaluate(() => {
    const css = document.createElement('style');
    css.textContent = `.fdot{position:fixed;left:0;top:0;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;pointer-events:none;z-index:99999;opacity:0;
      border:2.5px solid rgba(255,255,255,.97);box-shadow:0 0 0 1.5px rgba(42,32,20,.55),inset 0 0 0 1px rgba(42,32,20,.25),0 2px 10px rgba(0,0,0,.35)}
      .fdot.down{background:radial-gradient(circle,rgba(255,255,255,.75) 0%,rgba(255,255,255,.45) 60%,rgba(255,255,255,.25) 100%)}
      .fdot.up{background:rgba(255,255,255,.16)}`;
    document.head.appendChild(css);
    const d = document.createElement('div'); d.className = 'fdot up'; d.id = 'fdot'; document.body.appendChild(d);
  });
  for (let i = 0; i < 30; i++) { await page.evaluate((ms) => window.__rec.step(ms), STEP); await page.waitForTimeout(8); }
  const cdp = await ctx.newCDPSession(page);
  const snap = () => page.evaluate(() => window.__PLAYTEST__.snapshot());
  let st = await snap();
  const project = projector(st.camera);
  const elCenter = (sel) => page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
  const BTN = { fan: await elCenter('#b-fan'), near: await elCenter('#b-near'), back: await elCenter('#b-back'), jump: await elCenter('#b-jump') };
  console.log('按钮中心', JSON.stringify(BTN));

  // ---- 鼠标 ----
  const P = { x: W + 30, y: H * 0.6, down: false, shown: false, tShow: -9, tHide: -9, tDown: -9, tUp: -9, beh: null };
  const mouse = (type, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x: P.x, y: P.y, button: P.down || type !== 'mouseMoved' ? 'left' : 'none', buttons: P.down ? 1 : 0, clickCount: 1, pointerType: 'mouse', ...extra });
  let tick = 0; const now = () => tick * STEP / 1000;
  const cues = [], track = [];
  const cue = (name, extra) => { cues.push({ name, t: +now().toFixed(3), ...extra }); console.log(`[${now().toFixed(2)}s] ${name}${extra ? ' ' + JSON.stringify(extra) : ''}`); };
  async function substep() {
    const t = now();
    if (P.beh) { const b = P.beh, lt = t - b.t0; const p = b.update(cl(lt / b.dur), lt); P.x = p[0]; P.y = p[1]; await mouse('mouseMoved'); if (lt >= b.dur) P.beh = null; }
    const r = await page.evaluate(([ms, tid]) => { window.__rec.step(ms); const s = window.__PLAYTEST__.snapshot(); const e = tid >= 0 ? s.eyes.find((q) => q.id === tid) : null; return { eye: e && [e.x, e.y], time: s.time, action: s.action, owners: s.owners, hover: s.hover, fan: s.peacock.fan, pos: s.peacock.position, lift: s.peacock.lift, pickup: s.pickup, counts: s.counts, screenBox: s.screenBox, integrity: s.integrity, feathers: s.feathers }; }, [STEP, P.track ?? -1]);
    st = r; if (r.eye) P.trackPt = [r.eye[0] * W, r.eye[1] * H]; tick++;
  }
  let frame = 0, lastLog = -1;
  const enc = DRY ? null : encoder(path.join(out, 'video.mp4'));
  async function videoFrame() {
    for (let i = 0; i < SUB; i++) await substep();
    const t = now(), still = STILLS.find((s) => Math.abs(s - t) < 0.5 / FPS);
    const { feathers, ...lite } = st; track.push({ t: +t.toFixed(3), ...lite, mouse: [+P.x.toFixed(1), +P.y.toFixed(1), P.down ? 1 : 0] });
    if (!DRY || still !== undefined) {
      const d = P.shown ? (P.down ? { o: cl((t - P.tShow) / 0.12), s: 0.82, cls: 'down' } : { o: 0.95 * cl((t - P.tShow) / 0.12), s: 1 + 0.35 * Math.max(0, 1 - (t - P.tUp) / 0.25) * (t - P.tUp < 0.25 ? 1 : 0), cls: 'up' }) : { o: 0.95 * (1 - cl((t - P.tHide) / 0.25)), s: 1, cls: 'up' };
      await page.evaluate(([d, x, y]) => { const el = document.getElementById('fdot'); el.className = 'fdot ' + d.cls; el.style.opacity = d.o; el.style.transform = `translate(${x}px,${y}px) scale(${d.s})`; }, [d, P.x, P.y]);
      await page.waitForTimeout(SETTLE);
      const jpg = await page.screenshot({ type: 'jpeg', quality: 93 });
      if (enc) await enc.write(jpg);
      if (still !== undefined) fs.writeFileSync(path.join(out, `still-${still.toFixed(2)}.jpg`), jpg);
    }
    frame++;
    if (Math.floor(t * 2) !== lastLog) { lastLog = Math.floor(t * 2);
      const sb = st.screenBox; console.log(`t=${t.toFixed(1)} ${st.action} hover=${st.hover} fan=${st.fan.toFixed(2)} pos=(${st.pos[0].toFixed(2)},${st.pos[2].toFixed(2)}) lift=${st.lift.toFixed(2)} pick=${st.pickup ? st.pickup.id + ':' + st.pickup.phase : '-'} box=[${sb.x0.toFixed(2)},${sb.x1.toFixed(2)},${sb.y0.toFixed(2)},${sb.y1.toFixed(2)}] mouse=(${P.x.toFixed(0)},${P.y.toFixed(0)})`); }
  }
  const at = async (sec) => { while (now() < sec - 1e-6) await videoFrame(); };
  const wait = (sec) => at(now() + sec);
  const nextBeat = (t = now()) => Math.ceil((t + 0.05) / BEAT) * BEAT;
  const until = async (pred, maxSec, name) => { const end = now() + maxSec; while (now() < end && !pred(st)) await videoFrame(); if (!pred(st)) console.log('UNTIL-TIMEOUT', name); };
  // 目标：孔雀身体中心、某根羽毛的眼斑、按钮、屏幕上的一点（按比例）
  const body = () => project([st.pos[0], 0.72 + st.lift, st.pos[2]]);
  // 眼斑在屏幕上的位置；尾屏开着时相邻眼斑挨得近，挑周围 ±4 像素都点得到它自己的那根（featherAt 是页面自己的命中函数，只读）
  async function eye(id) {
    const s = await snap(), e = s.eyes.find((q) => q.id === id);
    return [e.x * W, e.y * H];
  }
  async function solidEye(cands) {
    for (const id of cands) {
      const p = await eye(id);
      const hits = await page.evaluate(([x, y]) => [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]].map(([dx, dy]) => window.__PLAYTEST__.featherAt(x + dx, y + dy)), p);
      if (hits.every((h) => h === id)) return { id, p };
      console.log(`羽毛 ${id} 的眼斑周围点到的是 ${hits.join(',')}，换一根`);
    }
    throw new Error('没有点得准的眼斑');
  }
  // 点羽毛：最后几帧手停稳在眼斑上再按，按下前用页面的命中函数核一遍
  async function pluckAt(f, name) {
    const c = P.trackPt || f.p;
    const best = await page.evaluate(([x, y, id]) => { const ok = []; for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) if (window.__PLAYTEST__.featherAt(x + dx, y + dy) === id) ok.push([dx, dy]); if (!ok.length) return null; const mx = ok.reduce((a, q) => a + q[0], 0) / ok.length, my = ok.reduce((a, q) => a + q[1], 0) / ok.length; return [x + mx, y + my, ok.length]; }, [c[0], c[1], f.id]);
    if (!best) throw new Error(`按下前核对：${c} 附近点不到 ${f.id}`);
    const jump = Math.hypot(best[0] - P.x, best[1] - P.y);
    P.x = best[0]; P.y = best[1]; await mouse('mouseMoved');
    const hit = await page.evaluate(([x, y]) => window.__PLAYTEST__.featherAt(x, y), [P.x, P.y]);
    if (hit !== f.id) throw new Error(`按下前核对：点到的是 ${hit}，不是 ${f.id}`);
    console.log(`  点 ${f.id}：命中区 ${best[2]} 格，手最后挪了 ${jump.toFixed(1)} 像素`);
    P.track = -1; P.trackPt = null;
    await press(name, { id: f.id });
  }
  // 滑过去：to 是函数时每一步都重新取（跟着会动的目标），最后到点
  function glide(to, dur, k = 0) {
    const from = [P.x, P.y];
    P.beh = { t0: now(), dur, update(u, lt) { const q = typeof to === 'function' ? to() : to, e = mj(u), tr = tremor(lt, k); return [from[0] + (q[0] - from[0]) * e + tr[0] * (1 - e * 0.6), from[1] + (q[1] - from[1]) * e + tr[1] * (1 - e * 0.6)]; } };
    return wait(dur);
  }
  function hover(dur, k = 1) {   // 停在原处，手微微晃
    const c = [P.x, P.y];
    P.beh = { t0: now(), dur, update(u, lt) { const tr = tremor(lt, k), q = P.track >= 0 && P.trackPt ? P.trackPt : c; return [q[0] + tr[0] * 1.4, q[1] + tr[1] * 1.4]; } };
    return wait(dur);
  }
  function show(x, y) { P.x = x; P.y = y; P.shown = true; P.tShow = now(); return mouse('mouseMoved'); }
  function hide() { P.shown = false; P.tHide = now(); }
  async function press(name, extra) { P.down = true; P.tDown = now(); await mouse('mousePressed'); cue('press:' + name, extra); await wait(0.1); P.down = false; P.tUp = now(); await mouse('mouseReleased'); }
  // 点击：先在 dur 秒里滑到目标，按下正好落在 tHit
  async function clickAt(tHit, to, dur, name, extra) { await at(tHit - dur - 0.08); await glide(to, dur); await at(tHit - 0.02); await press(name, extra); }

  // ================= 动作编排 =================
  const A = (flag('featherA', '16,15,17,14,18')).split(',').map(Number), B = (flag('featherB', '6,7,5,8,4,9')).split(',').map(Number);
  const videoStart = await page.evaluate(() => window.__rec.now), t0wall = Date.now();
  cue('start', { action: st.action });
  // 1. 鼠标从右边进来，在地上划一道：孔雀跟着走
  await at(0.4); await show(W * 0.88, H * 0.57); cue('enter');
  await glide([W * 0.26, H * 0.625], 1.9, 2);
  await hover(0.5, 1);
  // 2. 停到它身上：开屏、抖头，转向镜头；屏开满后手挪到一根尾羽的眼斑上
  await glide(body, 0.8, 3); cue('onBird', { hover: st.hover });
  await hover(1.7, 4);
  const fa = await solidEye(A); P.track = fa.id; P.trackPt = fa.p;
  await glide(() => P.trackPt, 0.9, 5); await hover(0.5, 5);
  // 3. 点这根尾羽：掉下、走过去、低头衔起、转身插回原处。手点完就不动（屏一直开着）
  await at(nextBeat(now()) - 0.01); await pluckAt(fa, 'pluck'); hide();
  const pick = async (id) => {
    await until((s) => s.feathers[id].state === 'grounded', 4, 'land'); cue('landed', { id });
    await until((s) => s.pickup && s.pickup.phase === 'grip', 6, 'grip'); cue('grip', { id });
    await until((s) => s.pickup && s.pickup.phase === 'insert', 6, 'insert'); cue('insert', { id });
    await until((s) => !s.pickup, 6, 'return'); cue('returned', { id });
  };
  await pick(fa.id);
  // 4. 再点另一边的一根，点完手移开：收着屏去捡
  await wait(0.3); await show(P.x, P.y);
  const fb = await solidEye(B); P.track = fb.id; P.trackPt = fb.p;
  await glide(() => P.trackPt, 0.7, 6); await hover(0.3, 6);
  await at(nextBeat(now()) - 0.01); await pluckAt(fb, 'pluck');
  await glide([W * 0.2, H * 0.56], 0.9, 7); hide(); cue('offBird');
  await pick(fb.id);
  // 5. 手回到地上划到右后方：它跟着走过去
  await wait(0.2); await show(P.x, P.y);
  await glide([W * 0.7, H * 0.6], 1.3, 8); cue('lead');
  await hover(0.6, 8);
  // 6. 底部按钮：走近（走一步、狠狠啄一下）、后退、跳两下
  { const t = nextBeat(now() + 0.5); await clickAt(t, BTN.near, 0.5, 'near'); }
  await hover(1.5, 9);
  { const t = nextBeat(now() + 0.3); await clickAt(t, BTN.back, 0.35, 'back'); }
  await hover(1.0, 10);
  { const t = nextBeat(now() + 0.3); await clickAt(t, BTN.jump, 0.4, 'jump'); }
  await hover(0.9, 11);
  { const t = nextBeat(now()); await clickAt(t, BTN.jump, 0.2, 'jump'); }
  await hover(0.8, 12);
  // 7. 收尾：再停到它身上，满屏朝着镜头
  { const t = nextBeat(now() + 0.9); await at(t - 1.0); await glide(body, 1.0, 13); cue('onBirdFinal', { hover: st.hover }); }
  await hover(1.4, 14);
  await glide([P.x + 60, P.y - 70], 0.6, 15);    // 手往旁边让开一点（还在尾屏上），别挡住胸口
  await hover(1.6, 16); hide(); cue('end');
  await wait(Number(flag('tail', '0.9')));

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
  title: "油彩孔雀",
  accounts: ["公众号：我的AI小木屋", "微博 · 快手 · 全民K歌：安闲静雅"],
  notes: [
    ["玩法", "鼠标停在它身上就开屏；点一根尾羽，它把掉下的羽毛衔回原处；还会走近啄一下、跳"],
    ["画面", "网页实机逐帧录制，鼠标是模拟的真实操作；孔雀与油画笔触全部由代码生成，示意造型"],
    ["声音", "脚步、开屏、啄与插回的声音是页面当场合成的；配乐也由代码合成，没有采样素材"],
    ["借鉴", "三维渲染用开源 Three.js（MIT）"],
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
