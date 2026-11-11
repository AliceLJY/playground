// 导览片录制（手动跑，不进 CI）。做法照 thirteen-hongs/tools/film.cjs：接管页面时钟，每帧推进 1/30 秒再截图，
// 页面自己的 Web Audio 换成离线上下文同钟渲染。镜头是这份脚本排的，场景是页面实时算的。
//   node tools/serve.cjs . 8991
//   NODE_PATH="$(npm root -g)" node tools/film.cjs <输出目录> [--landscape] [--base http://127.0.0.1:8991/dist/index.html]
//        [--ref <起始图原图>] [--endcard <署名页目录>] [--only 镜头名,…] [--stills]
// 默认竖屏 1080×1920；--landscape 出横屏 1920×1080（机位和排版另排，不是裁切）。
// --stills：每个镜头只在开头、中间、结尾各截一张存 <输出目录>/stills/，排机位时用。
// 产物：<输出目录>/shots/*.mp4、ambience.wav、film-silent.mp4、timeline.json。配乐与合轨见 tools/film-music.py。
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; }, has = n => args.includes('--' + n);
const out = args[0]; if (!out || out.startsWith('--')) { console.error('usage: film.cjs <输出目录>'); process.exit(2); }
const base = flag('base', 'http://127.0.0.1:8991/dist/index.html'), endcardDir = flag('endcard', ''), only = flag('only', ''), refFile = flag('ref', ''), LAND = has('landscape'), STILLS = has('stills');
const FPS = 30, FRAME = 1000 / FPS, DPR = 2, XF = 1.0;
const W = LAND ? 960 : 540, H = LAND ? 540 : 960;
// 竖屏第一镜（v2，Alice 11-11「竖屏……这样显得画面太小了」）：起始图等比放大到高度占满、铺满整幅，从图右侧（八角亭、壁山）横移到敞厅和荷池，
// 停稳后溶成实景。PAN 是画幅中线落在图宽的哪个比例上：0.80 → 0.45；溶接时相机朝向按 0.45 这一条对应的方向摆。
const PAN = { c0: 0.80, c1: 0.45, t1: 3.4, imgW: H * 16 / 9 };
const panLeft = c => W / 2 - c * PAN.imgW;
fs.mkdirSync(path.join(out, STILLS ? 'stills' : 'shots'), { recursive: true });

// ---- 镜头表。text：[起, 止, 文字] 的小字；title 只在第一镜 ----
const SHOTS = [
  { name: 'card', dur: 9, title: ['岭南园林一角', '一张图，搭成能走进去的院子'], tag: [0.5, LAND ? 3.0 : 3.3, '这张图是 AI 画的'], text: [LAND ? 5.0 : 5.3, LAND ? 8.2 : 8.3, LAND ? '同一个机位，换成浏览器里实时算的场景' : '同一个方向，换成浏览器里实时算的场景'] },
  { name: 'pond', dur: 6, text: [0.9, 5.0, 'Three.js 纯代码 · 没有模型和贴图'] },
  { name: 'hall', dur: 6 },
  { name: 'inside', dur: 16 },   // 实际时长由转身的角度表定，见 installFilm
  { name: 'bridge', dur: 6 },
  { name: 'rock', dur: 6 },
  { name: 'finale', dur: 8, text: [3.2, 9, '浏览器打开就能走进去\naliceljy.github.io/playground'] },
];

function installFilm(opt) {   // 在页面里执行一次
  const G = window.__garden, C = G.C, LAND = opt.land, W = innerWidth, H = innerHeight;
  const ease = u => u * u * (3 - 2 * u), cl = (v, a, b) => Math.max(a, Math.min(b, v)), mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const eye = (x, z) => C.groundY(x, z) + C.EYE;
  const along = (pts, d) => { for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d <= L || i === pts.length - 1) { const k = cl(d / L, 0, 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; } d -= L; } };
  const P = C.POSTCARD, cp = Math.cos(P.pitch), dir = [-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp];
  const cardP = [P.x, P.y, P.z];
  // 竖屏：图铺满时画幅只看得到图的一竖条，相机朝那一条的中线转过去（图中线偏左多少，就往左转 atan(偏移 × 图的半宽正切)）
  const yawOff = LAND ? 0 : Math.atan((0.5 - opt.pan.c1) * 2 * Math.tan(P.fov * Math.PI / 360) * 16 / 9), y2 = P.yaw + yawOff;
  const dir2 = [-Math.sin(y2) * cp, Math.sin(P.pitch), -Math.cos(y2) * cp], cardL = cardP.map((v, i) => v + (LAND ? dir : dir2)[i] * 20);
  // 明信片机位的视场：横屏就是起始图的 50°；竖屏图的高度占满画幅，所以纵向视场也是 50°
  const cardFov = P.fov;
  const state = {};
  // 屋里转身的角度表（每 1/30 秒一格）：前 145° 对着窗，每秒 15°（实测每秒 29° 和 18° 质检都报频闪，15° 不报）；其余每秒 38°；两头缓起缓停
  const turn = []; { const D2R = Math.PI / 180, sm = (x) => { x = cl(x, 0, 1); return x * x * (3 - 2 * x); }; let th = 0, tt = 0;
    while (th < 360 && turn.length < 30 * 40) { turn.push(th * D2R); const sp = 15 + 23 * sm((th - 145) / 30) * (1 - sm((th - 330) / 25)); th += sp * Math.min(1, 0.12 + tt / 1.2) * cl((360 - th) / 9, 0.12, 1) / 30; tt += 1 / 30; }
    turn.push(2 * Math.PI); }
  window.__film = {
    cardFov,
    card(u, t) {   // 先停在明信片机位，图化成场景后往前推，落到人眼高度
      const k = ease(cl((t - (LAND ? 4.4 : 4.9)) / (LAND ? 4.6 : 4.1), 0, 1));
      return { p: mix(cardP, [-7.3, 1.95, 10.9], k), l: mix(cardL, [1.2, 1.5, -2.0], k), fov: cardFov + ((LAND ? 58 : 72) - cardFov) * k };
    },
    pond(u, t) {   // 沿荷池西岸往北走，看砖墩陶瓶栏杆和荷花
      const z = 11.2 - t * 0.95, x = -6.75, k = ease(u);
      return { p: [x, eye(x, z) + Math.sin(t * 6.6) * 0.012, z], l: [-2.6 + 1.2 * k, 0.25, z - 4.6 - 1.0 * k], fov: LAND ? 58 : 72 };
    },
    hall(u, t) {   // 池南岸隔水看敞厅一排满洲窗，慢慢横移加推近
      const k = ease(u);
      return { p: mix([-4.6, 1.75, 9.3], [0.8, 1.7, 8.7], k), l: mix([-3.6, 2.0, -2.4], [-0.6, 2.0, -2.4], k), fov: (LAND ? 40 : 58) - 4 * k };
    },
    inside(u, t) {   // 站在屋里转一整圈。对着满洲窗那半边慢（细格转快了会频闪），转过砖墙那半边快一点
      const a = turn[Math.min(turn.length - 1, Math.round(t * 30))];
      return { p: [-1.5, C.DECK_Y + C.EYE, -4.3], yaw: Math.PI + 1.25 - a, pitch: -0.05, fov: LAND ? 66 : 78 };
    },
    bridge(u, t) {   // 池南岸看廊桥和石拱，横移着往桥那边靠
      const k = ease(u);
      return { p: mix([-0.9, 1.7, 9.3], [2.2, 1.78, 8.3], k), l: mix([5.6, 1.7, 2.6], [6.4, 1.9, 2.2], k), fov: (LAND ? 44 : 62) - 3 * k };
    },
    rock(u, t) {   // 八角池边看亭子和英石壁山上的跌水，镜头慢慢抬
      const k = ease(u);
      return { p: mix([7.3, 1.6, 10.2], [8.9, 1.75, 9.2], k), l: mix([12.2, 1.7, 5.4], [14.4, 3.1, 5.0], k), fov: LAND ? 52 : 70 };
    },
    finale(u, t) {   // 从庭院东南角升起来回望全院
      const k = ease(u);
      return { p: mix([6.2, 1.7, 13.2], [10.5, 8.2, 18.6], k), l: mix([-1.5, 1.6, 2.0], [0.5, 0.8, 1.5], k), fov: LAND ? 52 : 70 };
    },
    state,
  };
  // ---- 叠层：起始图（按明信片机位的横向视场摆，和场景对齐）、纸色底、片名、小字。透明度只由脚本给，不用 CSS 过渡 ----
  const hf = Math.tan(P.fov * Math.PI / 360) * 16 / 9, imgW = LAND ? W * hf / (Math.tan(cardFov * Math.PI / 360) * W / H) : H * 16 / 9, imgH = imgW * 9 / 16;
  const el = document.createElement('div');
  const serif = "'Songti SC',STSong,serif", sans = "'PingFang SC',sans-serif";
  el.innerHTML =
    `<div id="fBg" style="position:fixed;inset:0;background:#e9e2d0;z-index:18"></div>`
    + `<div id="fImgWrap" style="position:fixed;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;z-index:19">`
    + `<img id="fImg" src="${opt.ref}" style="position:absolute;left:${LAND ? (W - imgW) / 2 : 0}px;top:${(H - imgH) / 2}px;width:${imgW}px;height:${imgH}px;max-width:none;transform-origin:0 0">`
    + `<div id="fTag" style="position:absolute;left:${LAND ? 34 : 48}px;top:${LAND ? (H + imgH) / 2 - 58 : 226}px;font:600 ${LAND ? 15 : 14}px/1 ${sans};letter-spacing:.08em;color:#2c2620;background:#f3ecd9e8;border-radius:14px;padding:8px 14px"></div></div>`
    + (LAND
      ? `<div id="fT" style="position:fixed;left:44px;top:40px;color:#fbf5e4;text-shadow:0 2px 10px #000a,0 0 2px #000c;z-index:20"><div id="fT1" style="font:900 46px/1.15 ${serif};letter-spacing:.06em"></div><div id="fT2" style="font:600 17px/1.5 ${sans};letter-spacing:.14em;margin-top:8px"></div></div>`
      : `<div id="fT" style="position:fixed;left:48px;right:48px;top:104px;z-index:20"><div id="fT1" style="font:900 56px/1.15 ${serif};letter-spacing:.05em"></div><div id="fT2" style="font:600 18px/1.5 ${sans};letter-spacing:.12em;margin-top:10px"></div></div>`)
    + `<div id="fS" style="position:fixed;left:0;right:0;top:${LAND ? 448 : 650}px;text-align:center;z-index:20"><span id="fS1" style="display:inline-block;white-space:pre-line;font:600 ${LAND ? 16 : 18}px/1.5 ${sans};letter-spacing:.08em;color:#2c2620;background:#f3ecd9e8;border-radius:18px;padding:8px 20px"></span></div>`;
  document.body.appendChild(el);
  const $ = id => document.getElementById(id);
  window.__layer = (L) => {
    $('fBg').style.opacity = L.bg; $('fBg').style.display = L.bg > 0 ? 'block' : 'none';
    $('fImgWrap').style.opacity = L.img; $('fImgWrap').style.display = L.img > 0 ? 'block' : 'none'; $('fImg').style.transform = LAND ? `scale(${L.zoom || 1})` : `translateX(${L.panX || 0}px)`;
    $('fTag').style.opacity = L.tagA; if (L.tag) $('fTag').textContent = L.tag;
    $('fT').style.opacity = L.titleA; if (L.title) { $('fT1').textContent = L.title[0]; $('fT2').textContent = L.title[1]; }
    // 片名压在纸色底上时用深色字，底退掉后压在画面上用浅色字加阴影
    if (!LAND) { const dark = L.bg > 0.5; $('fT').style.color = dark ? '#2c2620' : '#fbf5e4'; $('fT').style.textShadow = dark ? 'none' : '0 2px 10px #000a,0 0 2px #000c'; }
    $('fS').style.opacity = L.textA; if (L.text) $('fS1').textContent = L.text;
  };
  return { imgW, imgH, images: document.images.length, insideDur: turn.length / 30 };
}

function takeOverClock() {   // 在页面脚本之前执行
  let vnow = 0, queue = [], nextId = 1; const wall = Date.now();
  performance.now = () => vnow; Date.now = () => wall + vnow;
  window.requestAnimationFrame = cb => { const id = nextId++; queue.push({ id, cb }); return id; };
  window.cancelAnimationFrame = id => { queue = queue.filter(q => q.id !== id); };
  let seed = 20261111; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };   // 鸟叫和风铃的时机每次录都一样
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
    async renderPcm(videoStart, videoEnd) {
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
const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function layers(s, t) {   // 这一帧各叠层的透明度
  const L = { bg: 0, img: 0, tagA: 0, tag: null, titleA: 0, title: null, textA: 0, text: null };
  if (s.name === 'card') {
    L.bg = 0;                                              // v2：竖屏不再垫纸色底，图直接铺满
    L.img = LAND ? cl(1 - (t - 3.2) / 1.6) : cl(1 - (t - 3.7) / 1.5);   // 把图化掉，露出同一视线方向的场景（竖屏等横移停稳再化）
    if (!LAND) { const u = cl(t / PAN.t1), e = 1 - Math.pow(1 - u, 3); L.panX = panLeft(PAN.c0) + (panLeft(PAN.c1) - panLeft(PAN.c0)) * e; }   // 横移：先快后慢，停稳
    L.tag = s.tag[2]; L.tagA = cl(Math.min((t - s.tag[0]) / 0.4, (s.tag[1] - t) / 0.4));
    L.title = s.title; L.titleA = cl((5.2 - t) / 0.7);            // 第一帧就在（平台常拿第一帧当封面）
    L.zoom = 1 + 0.05 * Math.pow(cl(1 - t / 3.4), 2);       // 起始图开头略放大，慢慢收到正好和场景对齐，免得开头一秒多是死的
  }
  if (s.text) { L.text = s.text[2]; L.textA = cl(Math.min((t - s.text[0]) / 0.45, (s.text[1] - t) / 0.45)); }
  return L;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const shots = SHOTS.filter(s => !only || only.split(',').includes(s.name)), timeline = [];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await ctx.addInitScript(takeOverClock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '?capture');
  const ready = () => page.evaluate(() => !!(window.__garden && window.__garden.ready));
  for (let i = 0; i < 900 && !await ready(); i++) { await page.evaluate(ms => window.__rec.step(ms), FRAME); await page.waitForTimeout(15); }
  if (!await ready()) throw new Error('页面没有就绪');
  const ref = refFile ? 'data:image/' + (refFile.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(refFile).toString('base64') : await page.evaluate(() => document.querySelector('#ref img').src);
  const info = await page.evaluate(installFilm, { land: LAND, ref, pan: PAN });
  { const sh = SHOTS.find(x => x.name === 'inside'); sh.dur = Math.ceil((info.insideDur + 0.6) * FPS) / FPS; }   // 转完一圈再停半秒
  await page.waitForFunction(() => { const i = document.getElementById('fImg'); return i.complete && i.naturalWidth > 0; }, null, { polling: 100, timeout: 20000 });
  console.log('渲染器', await page.evaluate(() => window.__garden.gpu()), `画幅 ${W * DPR}×${H * DPR}`, `起始图摆成 ${Math.round(info.imgW * DPR)}×${Math.round(info.imgH * DPR)}`);
  await page.evaluate(() => window.__garden.audio.start());
  const hidden = { bg: 0, img: 0, tagA: 0, titleA: 0, textA: 0 };
  const warm = async (name, n) => { for (let i = 0; i < n; i++) await page.evaluate(([name, ms, L]) => { window.__garden.free(window.__film[name](0, 0)); window.__layer(L); window.__rec.step(ms); }, [name, FRAME, hidden]); };
  await warm('card', 24);   // 上传贴图、编译着色器
  const videoStart = await page.evaluate(() => window.__rec.now);
  let clock = 0;
  for (const s of shots) {
    await warm(s.name, 10);   // 每镜预热：阴影每四帧更新一次、倒影要一两帧才稳
    if (STILLS) {
      for (const [tag, u] of [['a', 0], ['b', 0.5], ['c', 1]]) {
        const t = u * s.dur;
        for (let i = 0; i < 5; i++) await page.evaluate(([name, u, t, L, ms]) => { window.__garden.free(window.__film[name](u, t)); window.__layer(L); window.__rec.step(ms); }, [s.name, u, t, layers(s, t), FRAME]);
        fs.writeFileSync(path.join(out, 'stills', `${LAND ? 'h' : 'v'}-${s.name}-${tag}.jpg`), await page.screenshot({ type: 'jpeg', quality: 88 }));
      }
      console.log('stills', s.name); continue;
    }
    const n = Math.round(s.dur * FPS), enc = encoder(path.join(out, 'shots', s.name + '.mp4'));
    for (let f = 0; f < n; f++) {
      const t = f / FPS, u = f / (n - 1);
      await page.evaluate(([name, u, t, L, ms]) => { window.__garden.free(window.__film[name](u, t)); window.__layer(L); window.__rec.step(ms); }, [s.name, u, t, layers(s, t), FRAME]);
      await enc.write(await page.screenshot({ type: 'jpeg', quality: 94 }));
    }
    await enc.end();
    const snap = await page.evaluate(() => window.__garden.snapshot());
    timeline.push({ name: s.name, start: clock, dur: s.dur, frames: n, calls: snap.calls, tris: snap.tris });
    console.log(s.name, `${s.dur}s`, `${snap.calls} 次绘制`, `${snap.tris} 三角面`);
    clock += s.dur;
  }
  if (STILLS) { await browser.close(); console.log(errors.length ? '页面报错 ' + errors[0] : '页面零报错'); return; }
  // 镜头之间有预热帧，环境声按画面帧数切，所以这里取整段再按每镜的实际起点切
  const videoEnd = await page.evaluate(() => window.__rec.now), len = await page.evaluate(([a, b]) => window.__rec.renderPcm(a, b), [videoStart, videoEnd]);
  const parts = []; for (let i = 0; i < len; i += 4e6) parts.push(await page.evaluate(([a, b]) => window.__rec.b64.slice(a, b), [i, i + 4e6]));
  const raw = Buffer.from(parts.join(''), 'base64'), pcm = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
  await ctx.close();

  // ---- 署名页（可选）----
  let endDur = 0;
  if (endcardDir && !only) {
    const c2 = await browser.newContext({ viewport: { width: W * DPR, height: H * DPR }, deviceScaleFactor: 1 }), p2 = await c2.newPage();
    await p2.goto('file://' + path.resolve(endcardDir, 'endcard.html')); await p2.waitForFunction(() => window.__ready, null, { polling: 100 });
    endDur = await p2.evaluate(() => window.__duration()); const enc = encoder(path.join(out, 'shots', 'endcard.mp4'));
    for (let f = 0; f < Math.round(endDur * FPS); f++) { await p2.evaluate(t => window.__seek(t), f / FPS); await enc.write(await p2.screenshot({ type: 'jpeg', quality: 94 })); }
    await enc.end(); await c2.close();
  }
  await browser.close();

  // ---- 环境声：按镜头切开（跳过每镜前的 10 帧预热），再用和画面同样长的交叉淡化接起来 ----
  const SR = 48000, xf = Math.round(XF * SR), warmN = Math.round(10 / FPS * SR), segs = []; let at = 0;
  for (const s of timeline) { at += warmN; const n = Math.round(s.dur * SR); segs.push(pcm.subarray(at * 2, (at + n) * 2)); at += n; }
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
    fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify({ fps: FPS, xfade: XF, landscape: LAND, total: +(total / SR).toFixed(2), endcardAt: endDur ? cuts[cuts.length - 1] : null, cuts, shots: timeline, errors }, null, 1));
    console.log('总长', (total / SR).toFixed(2), '秒；各镜起点', cuts.join(', '), errors.length ? '；页面报错 ' + errors[0] : '；页面零报错');
  } else console.log(JSON.stringify(timeline), errors);
})().catch(e => { console.error(e); process.exit(1); });
