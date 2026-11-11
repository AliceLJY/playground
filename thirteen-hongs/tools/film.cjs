// 竖屏演示片录制（手动跑，不进 CI）。逐帧接管页面时钟：每帧推进 1/30 秒再按设备像素截图，
// 页面自己的 Web Audio 换成离线上下文同钟渲染，所以声音和画面对得上。镜头是这份脚本排的，场景和人都是页面实时算的。
//   node tools/serve.cjs . 8947
//   NODE_PATH="$(npm root -g)" node tools/film.cjs <输出目录> [--base http://127.0.0.1:8947/dist/index.html] [--endcard <署名页目录>] [--only 镜头名,…] [--pace 1.5]
// 产物：<输出目录>/shots/*.mp4（每镜一段）、ambience.wav（页面环境声，已按叠化接好）、film-silent.mp4、timeline.json。
// 配乐与合轨见 tools/film-music.py。
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const out = args[0]; if (!out || out.startsWith('--')) { console.error('usage: film.cjs <输出目录>'); process.exit(2); }
const base = flag('base', 'http://127.0.0.1:8947/dist/index.html'), endcardDir = flag('endcard', ''), only = flag('only', '');
const PACE = Number(flag('pace', 1));   // 节奏：1.5 就是每个镜头缩到三分之二长、镜头走得快一半；人和船还是原来的速度
const FPS = 30, FRAME = 1000 / FPS, W = 540, H = 960, DPR = 2, XF = PACE > 1 ? 0.7 : 1.0;   // XF：镜头之间叠化的秒数
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });

// ---- 镜头表。cam 在页面里执行：u 是本镜进度 0–1，t 是本镜秒数；返回机位 p、注视点 l、视场 fov ----
const SHOTS = [
  { name: 'aerial', dur: 7, title: ['十三行江岸', '约 1805 年 · 广州商馆区江岸'], sub: '全部由代码生成，没有模型和图片素材' },
  { name: 'tea', dur: 8, sub: '江上：运茶的西瓜扁进港' },
  { name: 'walk', dur: 8.5, sub: '第一人称走上岸' },
  { name: 'sedan', dur: 6.5, sub: '跟着一顶轿子走一段' },
  { name: 'faces', dur: 6.5, skip: 6, sub: '近看：脸和衣服是开场时现画的' },
  { name: 'handover', dur: 9, skip: 8.5, sub: '茶箱落艇：一箱箱递上去' },
  { name: 'lane', dur: 7, skip: 5, sub: '走进靖远街' },
  { name: 'night', dur: 10.5, tod: [[0.6, 'dusk'], [5.0, 'night']], sub: '天色从黄昏到入夜', link: [6.6, '浏览器打开就能走进去\naliceljy.github.io/playground'] },
];
for (const s of SHOTS) { s.dur0 = s.dur; s.dur = Math.round(s.dur / PACE * FPS) / FPS; if (s.tod) s.tod = s.tod.map(([at, k]) => [at / PACE, k]); if (s.link) s.link = [s.link[0] / PACE, s.link[1]]; }
function installFilm() {   // 在页面里执行一次
  const H = window.__hong, C = H.C, ease = u => u * u * (3 - 2 * u), mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const along = (pts, d) => { for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d <= L || i === pts.length - 1) { const k = Math.min(1, d / L); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; } d -= L; } };
  const state = {};
  window.__film = {
    aerial(u) { const k = ease(u); return { p: mix([128, 104, 290], [64, 40, 150], k), l: mix([4, 0, -36], [24, 6, -26], k), fov: 44 }; },
    tea(u) { const b = H.where('tea'), k = ease(u), d = 30 - 11 * k; return { p: [b.x + d * 0.78, 5.5 - 1.5 * k, b.z + d * 0.6], l: [b.x - 6, 2.4, b.z - 9], fov: 42 }; },
    walk(u, t) {
      const P = [[26.2, -1.5], [26.2, -17], [29.8, -29], [28, -44]], [x, z] = along(P, t * 2.9), [ax, az] = along(P.concat([[26, -56]]), t * 2.9 + 6);
      if (!C.walkable(x, z, 0.3)) state.blocked = (state.blocked || 0) + 1;
      const k = ease(Math.min(1, u * 1.4));
      return { p: [x, 1.62 + Math.sin(t * 9.3) * 0.022, z], l: [ax + (40 - ax) * 0.35 * k, 1.6 + 2.6 * k, az + (-62 - az) * 0.45 * k], fov: 62 };
    },
    sedan(u) { const b = H.where('sedan'), fx = Math.sin(b.h), fz = Math.cos(b.h), k = ease(u), side = 7.4 - 1.2 * k, f = 3.6 - 1.8 * k; return { p: [b.x + fx * f - fz * side, 1.6, b.z + fz * f + fx * side], l: [b.x, 1.3, b.z], fov: 44 }; },
    faces(u, t) {   // 在一位行商斜前方倒退着走，看脸和衣服；朝向做了平滑，他拐弯时镜头不甩
      const b = H.where('merchant'); let d = b.h - (state.fh ?? b.h); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; state.fh = (state.fh ?? b.h) + d * 0.14;
      const fx = Math.sin(state.fh), fz = Math.cos(state.fh), k = ease(u), f = 2.7 - 0.8 * k, side = 1.3 - 0.5 * k;
      return { p: [b.x + fx * f - fz * side, b.y + 0.02, b.z + fz * f + fx * side], l: [b.x, b.y - 0.3, b.z], fov: 36 };
    },
    handover(u) { const k = ease(u); return { p: mix([34.9, 2.0, 8.2], [36.0, 1.7, 10.2], k), l: [41.5, 0.95, 15.4], fov: 40 }; },
    lane(u, t) { const x = C.LANES[0].cx, z = -63.5 - t * 2.3, sway = Math.sin(t * 0.9) * 2.6; if (!C.walkable(x, z, 0.3)) state.blocked = (state.blocked || 0) + 1; return { p: [x, 1.62 + Math.sin(t * 8.4) * 0.02, z], l: [x + sway, 1.75, z - 9], fov: 64 }; },
    night(u) { const k = ease(u); return { p: mix([-38, 3.6, 24], [-74, 15, 74], k), l: mix([-22, 6, -55], [-34, 7, -46], k), fov: 47 }; },
    state,
  };
  // 字幕层：只用页面时间算透明度，不用 CSS 过渡
  const el = document.createElement('div');
  el.innerHTML = '<div id="fT" style="position:fixed;left:44px;top:132px;right:44px;color:#fbf5e4;text-shadow:0 2px 10px #0009,0 0 2px #000a;font-family:\'Songti SC\',STSong,serif;z-index:20"><div id="fT1" style="font:900 62px/1.15 \'Songti SC\',serif;letter-spacing:.14em"></div><div id="fT2" style="font:600 19px/1.6 \'PingFang SC\',sans-serif;letter-spacing:.12em;margin-top:8px"></div></div>'
    + '<div id="fS" style="position:fixed;left:0;right:0;top:662px;text-align:center;z-index:20"><span id="fS1" style="display:inline-block;font:600 19px/1.5 \'PingFang SC\',sans-serif;letter-spacing:.08em;color:#2c2620;background:#f3ecd9e8;border-radius:18px;padding:6px 16px;max-width:460px;white-space:pre-line"></span></div>';
  document.body.appendChild(el);
  window.__caption = (title, sub, aT, aS) => {
    const $ = id => document.getElementById(id);
    $('fT').style.opacity = aT; if (title) { $('fT1').textContent = title[0]; $('fT2').textContent = title[1]; }
    $('fS').style.opacity = aS; if (sub) $('fS1').textContent = sub;
  };
  window.__caption(null, null, 0, 0);
}
function takeOverClock() {   // 在页面脚本之前执行
  let vnow = 0, queue = [], nextId = 1; const wall = Date.now();
  performance.now = () => vnow; Date.now = () => wall + vnow;
  window.requestAnimationFrame = cb => { const id = nextId++; queue.push({ id, cb }); return id; };
  window.cancelAnimationFrame = id => { queue = queue.filter(q => q.id !== id); };
  class RecordingAudioContext extends OfflineAudioContext {
    constructor() { super(2, 48000 * 150, 48000); this._t0 = vnow; window.__rec.audio = this; window.__rec.audioStart = vnow; }
    get currentTime() { return (vnow - this._t0) / 1000; }
    get state() { return 'running'; }
    resume() { return Promise.resolve(); }
  }
  window.AudioContext = RecordingAudioContext; window.webkitAudioContext = RecordingAudioContext;
  window.__rec = {
    audio: null, audioStart: 0, get now() { return vnow; },
    step(ms) { vnow += ms; const q = queue; queue = []; for (const { cb } of q) { try { cb(vnow); } catch (e) { console.error(e); } } },
    async renderPcm(videoStart, videoEnd) {   // 离线渲染后取与第一帧对齐的双声道 16 位 PCM，分块用 base64 取回
      const ctx = window.__rec.audio, sr = 48000, lead = Math.max(0, Math.round((window.__rec.audioStart - videoStart) / 1000 * sr)), n = Math.round((videoEnd - videoStart) / 1000 * sr);
      const buf = ctx ? await ctx.startRendering() : null, L = buf && buf.getChannelData(0), R = buf && buf.getChannelData(1);
      const pcm = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) { const j = i - lead, l = L && j >= 0 && j < L.length ? L[j] : 0, r = R && j >= 0 && j < R.length ? R[j] : 0; pcm[i * 2] = Math.max(-1, Math.min(1, l)) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, r)) * 32767; }
      const bytes = new Uint8Array(pcm.buffer); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      window.__rec.b64 = btoa(s); return window.__rec.b64.length;
    },
  };
}
const encoder = file => {   // 截图是全范围 BT.601 的 JPEG，转成有限范围 BT.709 并打标
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
  return { write: async jpg => { if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r)); }, end: () => { ff.stdin.end(); return done; } };
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const shots = SHOTS.filter(s => !only || only.split(',').includes(s.name)), timeline = [];
  // ---- 场景镜头 ----
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await ctx.addInitScript(takeOverClock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '?capture&t=40');
  const ready = () => page.evaluate(() => !!(window.__hong && window.__hong.ready));
  for (let i = 0; i < 600 && !await ready(); i++) { await page.evaluate(ms => window.__rec.step(ms), FRAME); await page.waitForTimeout(15); }
  if (!await ready()) throw new Error('页面没有就绪');
  console.log('渲染器', await page.evaluate(() => window.__hong.gpu()));
  await page.evaluate(installFilm);
  await page.evaluate(() => window.__hong.audio.start());
  for (let i = 0; i < 20; i++) await page.evaluate(ms => { window.__hong.free(window.__film.aerial(0)); window.__rec.step(ms); }, FRAME);   // 预热：上传贴图、编译着色器
  const videoStart = await page.evaluate(() => window.__rec.now);
  let clock = 0, lag = Number(flag('presim', 0));   // --presim：单拍某一镜试机位时，先把模拟推进到它在整片里开拍的时刻   // lag：镜头缩短后少走的模拟时间，下一镜开拍前补上，每一镜开始时场上的事和原节奏一样
  for (const s of shots) {
    if (s.skip || lag > 0.01) await page.evaluate(sec => window.__hong.skip(sec), (s.skip || 0) + lag);
    lag = s.dur0 - s.dur;
    const n = Math.round(s.dur * FPS), enc = encoder(path.join(out, 'shots', s.name + '.mp4')), todDone = new Set();
    const simStart = await page.evaluate(() => window.__hong.sim.t);
    for (let f = 0; f < n; f++) {
      const t = f / FPS, u = f / (n - 1);
      for (const [at, key] of s.tod || []) if (t >= at && !todDone.has(key)) { todDone.add(key); await page.evaluate(k => window.__hong.setTod(k), key); }
      const fade = Math.min(1, t / 0.5, (s.dur - t) / 0.5), aT = s.title ? Math.max(0, Math.min(1, (t - 0.4) / 0.6, (s.dur - 0.9 - t) / 0.6)) : 0;
      const link = s.link && t >= s.link[0], sub = link ? s.link[1] : s.sub, aS = link ? Math.min(1, (t - s.link[0]) / 0.4, (s.dur - t) / 0.3 + 1) : s.link ? Math.max(0, Math.min(fade, (s.link[0] - 0.3 - t) / 0.4)) : Math.max(0, Math.min(1, (t - 0.9) / 0.5, (s.dur - 1.1 - t) / 0.5));
      await page.evaluate(([name, u, t, title, sub, aT, aS, ms]) => { window.__hong.free(window.__film[name](u, t)); window.__caption(title, sub, aT, aS); window.__rec.step(ms); }, [s.name, u, t * PACE, s.title || null, sub, aT, aS, FRAME]);
      await enc.write(await page.screenshot({ type: 'jpeg', quality: 94 }));
    }
    await enc.end();
    const snap = await page.evaluate(() => ({ sim: +window.__hong.sim.t.toFixed(1), stage: window.__hong.sim.event.stage, loaded: window.__hong.sim.event.loaded, blocked: window.__film.state.blocked || 0, q: window.__PLAYTEST__.snapshot() }));
    timeline.push({ name: s.name, start: clock, dur: s.dur, frames: n, simStart: +simStart.toFixed(1), simEnd: snap.sim, stage: snap.stage, loaded: snap.loaded, blocked: snap.blocked, reflect: snap.q.reflect, shadows: snap.q.shadows });
    console.log(s.name, `${s.dur}s`, `模拟 ${simStart.toFixed(1)}→${snap.sim}`, snap.stage, `已落 ${snap.loaded} 箱`, snap.blocked ? `机位进了不可走的地方 ${snap.blocked} 帧` : '');
    clock += s.dur;
  }
  const videoEnd = await page.evaluate(() => window.__rec.now), len = await page.evaluate(([a, b]) => window.__rec.renderPcm(a, b), [videoStart, videoEnd]);
  const parts = []; for (let i = 0; i < len; i += 4e6) parts.push(await page.evaluate(([a, b]) => window.__rec.b64.slice(a, b), [i, i + 4e6]));
  const raw = Buffer.from(parts.join(''), 'base64'), pcm = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
  await ctx.close();

  // ---- 署名页（可选）----
  let endDur = 0;
  if (endcardDir && !only) {
    const c2 = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 }), p2 = await c2.newPage();
    await p2.goto('file://' + path.resolve(endcardDir, 'endcard.html')); await p2.waitForFunction(() => window.__ready, null, { polling: 100 });
    endDur = await p2.evaluate(() => window.__duration()); const enc = encoder(path.join(out, 'shots', 'endcard.mp4'));
    for (let f = 0; f < Math.round(endDur * FPS); f++) { await p2.evaluate(t => window.__seek(t), f / FPS); await enc.write(await p2.screenshot({ type: 'jpeg', quality: 94 })); }
    await enc.end(); await c2.close();
  }
  await browser.close();

  // ---- 环境声：按镜头切开，再用和画面同样长的交叉淡化接起来 ----
  const SR = 48000, xf = Math.round(XF * SR), segs = []; let at = 0;
  for (const s of timeline) { const n = Math.round(s.dur * SR); segs.push(pcm.subarray(at * 2, (at + n) * 2)); at += n; }
  const total = segs.reduce((a, s) => a + s.length / 2, 0) - xf * (segs.length - 1) + Math.round(Math.max(0, endDur - XF) * SR), mixed = new Float32Array(total * 2); let pos = 0;
  segs.forEach((seg, i) => { const n = seg.length / 2; for (let k = 0; k < n; k++) { let g = 1; if (i > 0 && k < xf) g = k / xf; if (i < segs.length - 1 && k >= n - xf) g *= (n - k) / xf; if (i === segs.length - 1 && endDur && k >= n - xf * 2) g *= Math.max(0, (n - k) / (xf * 2)); mixed[(pos + k) * 2] += seg[k * 2] / 32768 * g; mixed[(pos + k) * 2 + 1] += seg[k * 2 + 1] / 32768 * g; } pos += n - xf; });
  const wav = Buffer.alloc(44 + total * 4); wav.write('RIFF', 0); wav.writeUInt32LE(36 + total * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(total * 4, 40);
  for (let i = 0; i < total * 2; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mixed[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(path.join(out, 'ambience.wav'), wav);

  // ---- 画面：各镜头用叠化接起来 ----
  if (!only) {
    const files = timeline.map(s => path.join(out, 'shots', s.name + '.mp4')).concat(endDur ? [path.join(out, 'shots', 'endcard.mp4')] : []), durs = timeline.map(s => s.dur).concat(endDur ? [endDur] : []);
    let graph = '', prev = '[0:v]', offset = 0;
    for (let i = 1; i < files.length; i++) { offset += durs[i - 1] - XF; graph += `${prev}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${offset.toFixed(3)}[v${i}];`; prev = `[v${i}]`; }
    const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...files.flatMap(f => ['-i', f]), '-filter_complex', graph.slice(0, -1), '-map', prev, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', String(FPS), path.join(out, 'film-silent.mp4')], { stdio: 'inherit' });
    if (r.status) throw new Error('拼接失败');
    let cut = 0; const cuts = durs.map((d, i) => { const c = cut; cut += d - XF; return +c.toFixed(2); });
    fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify({ fps: FPS, xfade: XF, total: +(total / SR).toFixed(2), endcardAt: endDur ? cuts[cuts.length - 1] : null, cuts, shots: timeline, errors }, null, 1));
    console.log('总长', (total / SR).toFixed(2), '秒；各镜起点', cuts.join(', '), errors.length ? '；页面报错 ' + errors[0] : '；页面零报错');
  } else console.log(JSON.stringify(timeline), errors);
})().catch(e => { console.error(e); process.exit(1); });
