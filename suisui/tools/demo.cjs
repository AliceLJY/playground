// 碎碎平安 · 竖屏演示片的录制（手动跑，不进 CI、不改玩法）：手机视口 540×960、2 倍像素截成 1080×1920，页面铺满，不套手机外框。
// 照 video-director production-routing「网页小游戏实录」「网页互动页手机操作演示」两节：加载前接管页面时钟
// （performance.now、Date.now、rAF、setTimeout、setInterval、Math.random、CSS 动画与过渡同钟步进），每帧推进 1/30 秒（两次 1/60 的触摸采样）；
// 手指是 CDP 真实触摸，点、按住、划都由页面自己的手势判定响应；页面的 Web Audio 换成同钟的 OfflineAudioContext，录完离线渲出声音。
//   python3 -m http.server 8971 --bind 127.0.0.1          （在 suisui/ 里）
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <输出目录> --endcard <署名页模板目录> [--base URL] [--seed 1881] [--dry]
// 署名页模板在作者本机 video-director 技能的 references/signature-endcard。
// 产物：<输出目录>/video.mp4（无声：实录＋5.6 秒署名页）、page.wav（实录段页面自己的声音）、cues.json（每个动作的时刻与命中）。
// 配乐与合成见 tools/demo-score.py。--dry 不截图，只打印每个动作落在哪一格、有没有扑空，排时间线用。
// 页面只用 ?solo=1 单人版：不连线上房间，同一种子每次录出来一样。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; }, has = (n) => args.includes('--' + n);
const out = args[0]; if (!out || out.startsWith('--')) { console.error('usage: demo.cjs <输出目录> --endcard <模板目录>'); process.exit(2); }
const base = flag('base', 'http://127.0.0.1:8971/index.html'), seed = flag('seed', '1881'), endDir = flag('endcard', ''), DRY = has('dry');
if (!DRY && !endDir) { console.error('缺 --endcard <署名页模板目录>'); process.exit(2); }
const W = 540, H = 960, DPR = 2, FPS = 30, SUB = 2, STEP = 1000 / (FPS * SUB);
const SETTLE = 12;          // 截图前等合成器把这一帧的网页文字层交上去（production-routing 记过的坑）
const TAIL = 1.0;           // 最后一个动作之后留多久再接署名页
fs.mkdirSync(out, { recursive: true });

// ---------------- 时间线（秒，按 120 拍的八分音符排，配乐卡在同一张网格上） ----------------
// t 是「碎」的那一刻：点＝抬手，划＝抬手，按住＝蓄满自己炸开（按下后 280 ms 起蓄、蓄 1 秒）。
// at 是想砸哪一格（3 列 × 4 行，0 在左上）；那一格还在碎或在补货，就就近换一格空着的。香炉不单点（见 README）。
const SWIPE = { ru: [150, -60], lu: [-150, -60], r: [165, 10], l: [-165, 12], u: [20, -160], rd: [140, 70] };
const T = [];
const tap = (t, at) => T.push({ kind: 'tap', t, at });
const swipe = (t, at, d) => T.push({ kind: 'swipe', t, at, d: SWIPE[d] });
const hold = (t, at) => T.push({ kind: 'hold', t, at });
const button = (t, sel, name) => T.push({ kind: 'button', t, sel, name });
// 开场：又快又狠点一串
[[0.25, 2], [0.5, 4], [0.75, 8], [1.0, 3], [1.25, 7], [1.5, 1], [1.75, 6]].forEach(([t, a]) => tap(t, a));
swipe(2.0, 11, 'ru'); swipe(2.375, 10, 'lu');
hold(4.0, 9);
// 补上来的接着砸
[4.5, 4.75, 5.0, 5.25, 5.5, 5.75, 6.0].forEach((t, k) => tap(t, [2, 8, 4, 3, 7, 1, 6][k]));
swipe(6.5, 11, 'r'); swipe(6.875, 10, 'u'); swipe(7.25, 9, 'l');
// 架上的烦心事烧掉，再自己写一张、贴上、烧掉
tap(7.75, 5); tap(8.25, 0);
button(9.0, '#write', '写烦心事');
T.push({ kind: 'type', t: 9.5, text: '方案又被打回', every: 0.15 });
button(10.75, '#noteForm button[type=submit]', '贴上去');
T.push({ kind: 'tap', t: 12.5, note: '方案又被打回' });
button(13.0, '#all', '全砸了');
// 补满了再来一轮
[17.0, 17.25, 17.5, 17.75].forEach((t, k) => tap(t, [2, 4, 8, 6][k]));
swipe(18.0, 10, 'ru'); tap(18.25, 3); tap(18.5, 7); swipe(18.75, 11, 'lu');
hold(20.5, 1);
[21.0, 21.25, 21.5, 21.75].forEach((t, k) => tap(t, [2, 8, 6, 4][k]));
swipe(22.0, 10, 'r'); tap(22.25, 3);
hold(23.75, 7);
// 收尾：最快的一串，最后按住一个大的
[24.25, 24.375, 24.5, 24.75, 24.875, 25.0, 25.25, 25.5, 25.75, 26.0].forEach((t, k) => tap(t, [0, 5, 11, 9, 2, 8, 6, 4, 10, 3][k]));
hold(28.0, 4);
const END = 28.0 + 0.12 + TAIL;   // 实录段在哪一秒结束（之后接署名页）

const PRESS = { tap: 0.07, swipe: 0.15, button: 0.09, hold: 1.0 + 0.28 + 0.02 };
for (const a of T) if (a.kind !== 'type') { a.down = a.t - PRESS[a.kind]; a.up = a.kind === 'hold' ? a.t + 0.12 : a.t; }
{ const acts = T.filter((a) => a.kind !== 'type'); for (let i = 1; i < acts.length; i++) if (acts[i].down < acts[i - 1].up + 0.03) throw new Error(`第 ${i} 个动作和上一个叠在一起（${acts[i].t}）`); }

// ---------------- 页面时钟 ----------------
function takeOverClock() {   // 在页面脚本之前执行
  let vnow = 0, queue = [], nextId = 1, timers = []; const wall = Date.now();
  performance.now = () => vnow; Date.now = () => wall + vnow;
  window.requestAnimationFrame = (cb) => { const id = nextId++; queue.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { queue = queue.filter((q) => q.id !== id); };
  const addTimer = (cb, ms, a, every) => { const id = nextId++; timers.push({ id, due: vnow + Math.max(0, +ms || 0), every, cb: () => (typeof cb === 'function' ? cb(...a) : 0) }); return id; };
  window.setTimeout = (cb, ms = 0, ...a) => addTimer(cb, ms, a, 0);
  window.setInterval = (cb, ms = 0, ...a) => addTimer(cb, ms, a, Math.max(1, +ms || 1));
  window.clearTimeout = window.clearInterval = (id) => { timers = timers.filter((t) => t.id !== id); };
  let seed = 20261124; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  class RecordingAudioContext extends OfflineAudioContext {
    constructor() { super(2, 48000 * 60, 48000); this._t0 = vnow; window.__rec.audio = this; window.__rec.audioStart = vnow; }
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
      for (;;) {   // 到点的定时器按到期先后跑，跑的过程中新加的也照样参与
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
const encoder = (file) => {   // 截图是全范围 JPEG，转成有限范围 BT.709 的 yuv420p 并打标（交付检查认 yuv420p）
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  return { write: async (jpg) => { if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r)); }, end: () => { ff.stdin.end(); return done; } };
};

const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const tremor = (t, k) => [0.5 * Math.sin(2 * Math.PI * 1.7 * t + k) + 0.3 * Math.sin(2 * Math.PI * 3.3 * t + 2 * k), 0.5 * Math.sin(2 * Math.PI * 1.3 * t + 1.7 * k) + 0.3 * Math.sin(2 * Math.PI * 2.9 * t + 0.5 * k)];
// 每个动作在格子里落点的小变化，固定下来，重录一样
const jit = (k, j) => { const x = Math.sin(k * 12.9898 + j * 78.233) * 43758.5453; return x - Math.floor(x); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await ctx.addInitScript(takeOverClock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?solo=1&seed=${seed}`);
  const ready = () => page.evaluate(() => !!(window.__suisui && window.__suisui.ready));
  for (let i = 0; i < 900 && !(await ready()); i++) { await page.evaluate((ms) => window.__rec.step(ms), STEP); await page.waitForTimeout(15); }
  if (!(await ready())) throw new Error('页面没有就绪');
  // 手指：半透明白圆点，按下浮现、抬起扩散淡出。弹窗在浏览器顶层，弹窗开着时把圆点挪进弹窗里，才不会被压在下面。
  await page.evaluate(() => {
    const css = document.createElement('style');
    css.textContent = `.fdot{position:fixed;left:0;top:0;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;
      background:radial-gradient(circle,rgba(255,255,255,.66) 0%,rgba(255,255,255,.38) 55%,rgba(255,255,255,.18) 100%);
      border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(20,14,10,.45),0 2px 10px rgba(0,0,0,.5);pointer-events:none;z-index:99999;opacity:0}
      button{-webkit-tap-highlight-color:transparent}`;
    document.head.appendChild(css);
    const d = document.createElement('div'); d.className = 'fdot'; d.id = 'fdot'; document.body.appendChild(d);
  });
  for (let i = 0; i < 40; i++) { await page.evaluate((ms) => window.__rec.step(ms), STEP); await page.waitForTimeout(10); }
  const cdp = await ctx.newCDPSession(page);
  const send = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 0, radiusX: 12, radiusY: 12, force: 1 }] : [] });
  const shelfState = () => page.evaluate(() => {
    const p = window.__suisui.probe();
    return p.slots.map((s, i) => { const r = window.__suisui.rect(i); return { i, kind: s.kind, text: s.text, busy: s.busy, shown: s.shown, r: [r.x, r.y, r.w, r.h] }; });
  });
  const elRect = (sel) => page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }, sel);

  // 选格：想砸的那格空着就砸它，不然挑最近的一格空着的；最近 0.5 秒点过的、香炉都不挑
  const lastHit = new Map();
  function pick(slots, a, ts) {
    if (a.note) return slots.find((s) => s.kind === 'note' && s.text === a.note && !s.busy && s.shown) || null;
    const ok = (s) => !s.busy && s.shown && s.kind !== 'censer' && !(ts - (lastHit.get(s.i) ?? -9) < 0.5);
    const want = slots[a.at];
    if (want && ok(want)) return want;
    const cx = want.r[0] + want.r[2] / 2, cy = want.r[1] + want.r[3] / 2;
    return slots.filter(ok).sort((p, q) => Math.hypot(p.r[0] - cx, p.r[1] - cy) - Math.hypot(q.r[0] - cx, q.r[1] - cy))[0] || null;
  }

  const cues = [], misses = [];
  let finger = null, prevDown = false, ai = 0, cur = null, typed = null;
  const dot = { down: false, x: 0, y: 0, tDown: -9, tUp: -9 };
  const acts = T.filter((a) => a.kind !== 'type'), types = T.filter((a) => a.kind === 'type');
  async function plan(a, ts) {
    a.k = acts.indexOf(a);
    if (a.kind === 'button') { const r = await elRect(a.sel); a.p0 = [r[0] + r[2] * (0.46 + 0.08 * jit(a.k, 1)), r[1] + r[3] * (0.42 + 0.16 * jit(a.k, 2))]; a.p1 = a.p0; a.slot = null; }
    else {
      const slots = await shelfState(), s = pick(slots, a, ts);
      if (!s) { a.skip = true; misses.push({ t: a.t, kind: a.kind, at: a.at ?? a.note }); console.log('扑空', a.t.toFixed(2), a.kind, a.at ?? a.note); return; }
      lastHit.set(s.i, ts); a.slot = s.i; a.target = s.kind;
      const [x, y, w, h] = s.r;
      a.p0 = [x + w * (0.36 + 0.28 * jit(a.k, 1)), y + h * (0.32 + 0.3 * jit(a.k, 2))];
      a.p1 = a.kind === 'swipe' ? [a.p0[0] + a.d[0], a.p0[1] + a.d[1]] : a.p0;
    }
    if (DRY) console.log(a.t.toFixed(3), a.kind.padEnd(6), a.kind === 'button' ? a.name : `格 ${a.slot} ${a.target}${a.slot !== a.at && a.at != null ? `（想砸 ${a.at}）` : ''}`);
  }
  function fingerAt(a, ts) {
    const tau = cl((ts - a.down) / (a.up - a.down)), tr = tremor(ts, a.k);
    if (a.kind !== 'swipe') return { x: a.p0[0] + tr[0] * 0.4, y: a.p0[1] + tr[1] * 0.4 };
    const s = tau * tau;   // 甩：越划越快，抬手时速度最大
    const dx = a.p1[0] - a.p0[0], dy = a.p1[1] - a.p0[1], L = Math.hypot(dx, dy) || 1, b = 10 * Math.sin(Math.PI * s);
    return { x: a.p0[0] + dx * s - dy / L * b + tr[0] * 0.5, y: a.p0[1] + dy * s + dx / L * b + tr[1] * 0.5 };
  }
  let lastCount = 0;
  async function substep(ts) {
    // 打字：一个字一个字进弹窗的输入框
    for (const ty of types) { const n = Math.min(Array.from(ty.text).length, Math.floor((ts - ty.t) / ty.every) + 1); ty.n = ty.n || 0; if (ts >= ty.t && n > ty.n) { const ch = Array.from(ty.text).slice(ty.n, n).join(''); await page.keyboard.insertText(ch); ty.n = n; cues.push({ t: +ts.toFixed(3), type: 'type', ch }); } }
    let ended = null;
    if (cur && ts >= cur.up) { ended = cur; cur = null; ai++; }
    if (!cur && ai < acts.length && ts >= acts[ai].down) { cur = acts[ai]; await plan(cur, ts); if (cur.skip) { cur = null; ai++; } }
    finger = cur ? fingerAt(cur, ts) : null;
    if (finger && !prevDown) await send('touchStart', finger);
    else if (finger) await send('touchMove', finger);
    else if (prevDown) await send('touchEnd', null);
    if (finger) { if (!dot.down) { dot.down = true; dot.tDown = ts; } dot.x = finger.x; dot.y = finger.y; } else if (dot.down) { dot.down = false; dot.tUp = ts; }
    prevDown = !!finger;
    if (ended && ended.kind === 'button') await page.waitForTimeout(70);   // 触摸变成 click 要一点真实时间
    const pr = await page.evaluate((ms) => { window.__rec.step(ms); const p = window.__suisui.probe(); return { count: p.count, active: p.active, busy: p.slots.filter((s) => s.busy).length, dlg: document.getElementById('dlg').open }; }, STEP);
    if (ended) cues.push({ t: ended.t, kind: ended.kind, slot: ended.slot, target: ended.target, name: ended.name });
    if (pr.count !== lastCount) { cues.push({ t: +ts.toFixed(3), type: 'count', count: pr.count, add: pr.count - lastCount }); lastCount = pr.count; }
    return pr;
  }
  const dotStyle = (t) => (dot.down ? ((k) => ({ x: dot.x, y: dot.y, o: k, s: 0.72 + 0.28 * k }))(cl((t - dot.tDown) / 0.06)) : ((k) => ({ x: dot.x, y: dot.y, o: 1 - k, s: 1 + 0.45 * k }))(cl((t - dot.tUp) / 0.22)));

  const enc = DRY ? null : encoder(path.join(out, 'video.mp4'));
  const videoStart = await page.evaluate(() => window.__rec.now), t0wall = Date.now();
  let f = 0; const track = [];
  for (; ; f++) {
    const t = f / FPS;
    if (t >= END) break;
    let pr; for (let k = 0; k < SUB; k++) pr = await substep(t + k / (FPS * SUB));
    track.push({ t: +t.toFixed(3), ...pr });
    if (!DRY) {
      const d = dotStyle(t);
      await page.evaluate((d) => { const el = document.getElementById('fdot'), dlg = document.getElementById('dlg'), home = dlg.open ? dlg : document.body; if (el.parentNode !== home) home.appendChild(el); el.style.opacity = d.o; el.style.transform = `translate(${d.x}px,${d.y}px) scale(${d.s})`; }, d);
      await page.waitForTimeout(SETTLE);
      await enc.write(await page.screenshot({ type: 'jpeg', quality: 93 }));
    }
    if (f % (FPS * 5) === 0) process.stdout.write(`  ${t.toFixed(0)} 秒，已砸 ${pr.count}\n`);
  }
  const liveSec = f / FPS, final = await page.evaluate(() => window.__suisui.probe());
  console.log(`实录 ${liveSec.toFixed(2)} 秒 ${f} 帧，用时 ${((Date.now() - t0wall) / 1000).toFixed(0)} 秒；砸了 ${final.count} 件，扑空 ${misses.length} 次；${errors.length ? '页面报错 ' + errors[0] : '页面零报错'}`);
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
  series: "playground 小游戏",
  title: "碎碎平安",
  accounts: ["公众号：我的AI小木屋", "微博 · 快手 · 全民K歌：安闲静雅"],
  notes: [
    ["玩法", "解压博古架：点一下按材质碎掉，按住蓄力炸开，划一下甩飞；写下烦心事贴上去再烧掉"],
    ["画面", "网页实机逐帧录制，手指是模拟的真实触摸；架上藏品是网页版 ChatGPT 生成的写实棚拍图"],
    ["声音", "砸碎声是页面自己当场合成的；垫底的配乐也由代码合成，没有采样素材"],
    ["借鉴", "碎裂粒子移植自开源项目 rs-4/dissolve（MIT）"],
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
    fs.writeFileSync(path.join(out, 'cues.json'), JSON.stringify({ fps: FPS, seed, live: +liveSec.toFixed(3), endcard: +(nEnd / FPS).toFixed(3), total: +((f + nEnd) / FPS).toFixed(3), acts: T, cues, misses, track, errors }, null, 1));
    console.log(`署名页 ${(nEnd / FPS).toFixed(2)} 秒；全片 ${((f + nEnd) / FPS).toFixed(2)} 秒`);
  } else fs.writeFileSync(path.join(out, 'cues-dry.json'), JSON.stringify({ acts: T, cues, misses, track, errors }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
