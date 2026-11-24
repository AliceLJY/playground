// 竖屏演示片录制（给人看，不是验收；手动跑，不进 CI）。页面铺满 1080×1920，不套手机外框：
// 按 360×640 的手机视口、3 倍像素打开 dist 页面（页面自己的手机竖屏布局：标题、动物清单、说明、机位按钮都在），
// 录的是页面自己的「一键连播」。页面代码一行没改，录制时只在页面外做两件事（都用 addInitScript 注入）：
//   1. 拦住 requestAnimationFrame，页面自己的循环不跑；改由脚本调 window.__PLAYTEST__.step(ms) 每帧推进 1/30 秒、画一帧、截一张，
//      所以画面和浏览器快慢无关，不会掉帧；连播的镜头只由场景时间决定（core.js tourPose），按钮文字仍是「连播中」「Ⅱ 暂停」。
//   2. 页面把渲染像素比封顶在 1.5（手机上省电），按 3 倍录会是 540×960 放大成 1080×1920，发虚。
//      这里只把 Math.min(devicePixelRatio, 1.5) 这一处放开，三维画面按 1080×1920 原生渲染；真手机上看到的比片里略软。
//   node tools/serve.cjs . 8961
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <输出目录> [--base http://127.0.0.1:8961/dist/index.html]
//     [--segments 4-48]       录哪几段场景时间（秒，逗号分隔多段；段与段之间直接跳，只该在黑场处接）。
//                             默认从全景机位第 4 秒录到火山口收尾（连播一轮 48 秒），共 44 秒；配乐按 120 拍、每机位 4 小节对齐
//     [--dry]                 不出视频，只每半秒打印一行状态
//     [--stills 3,9.5,20]     这几个视频时刻另存原尺寸静帧（--dry 时也存）
// 产物：<输出目录>/screen.mp4（1080×1920、30 fps，无声）、timeline.json（每帧的场景时间、机位、黑场，配乐对时用）。
// 配乐、接署名页见 tools/demo-sound.py。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; }, has = n => args.includes('--' + n);
const out = args[0]; if (!out || out.startsWith('--')) { console.error('usage: demo.cjs <输出目录> [--segments a-b,c-d] [--dry] [--stills t1,t2]'); process.exit(2); }
const base = flag('base', 'http://127.0.0.1:8961/dist/index.html'), DRY = has('dry');
const SEGMENTS = flag('segments', '4-48').split(',').map(s => s.split('-').map(Number));
const STILLS = (flag('stills', '') || '').split(',').filter(Boolean).map(Number);
const W = 360, H = 640, DPR = 3, FPS = 30, SETTLE = 12;
fs.mkdirSync(out, { recursive: true });

const encoder = file => {   // 截图是全范围 JPEG：转有限范围 BT.709、yuv420p 并打标
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
  return { write: async jpg => { if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r)); }, end: () => { ff.stdin.end(); return done; } };
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    window.requestAnimationFrame = () => 0;           // 页面自己的循环不跑，只靠 __PLAYTEST__.step 出帧
    const min = Math.min;                              // 只放开 Math.min(devicePixelRatio || 1, 1.5) 这一处
    Math.min = function (a, b) { return arguments.length === 2 && b === 1.5 && a === window.devicePixelRatio ? a : min.apply(Math, arguments); };
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  await page.waitForFunction(() => !!(window.__PLAYTEST__ && window.__PLAYTEST__.step));
  let snap = await page.evaluate(() => window.__PLAYTEST__.reset());
  for (let i = 0; i < 5 && !snap.ready; i++) snap = await page.evaluate(() => window.__PLAYTEST__.step(0));
  const canvas = await page.evaluate(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; });
  console.log('渲染器', snap.renderer, '像素比', snap.pixelRatio, '画布', canvas.join('×'));
  if (/swiftshader|llvmpipe/i.test(snap.renderer)) throw new Error('没拿到硬件 GPU：' + snap.renderer);

  const enc = DRY ? null : encoder(path.join(out, 'screen.mp4'));
  const frames = [];
  let frame = 0, lastLog = -1;
  for (const [a, b] of SEGMENTS) {
    snap = await page.evaluate(ms => window.__PLAYTEST__.step(ms), (a - snap.time) * 1000);   // 跳到段首（第一段即开场）
    const n = Math.round((b - a) * FPS);
    for (let k = 0; k < n; k++) {
      if (k) snap = await page.evaluate(ms => window.__PLAYTEST__.step(ms), 1000 / FPS);
      const t = frame / FPS, still = STILLS.find(s => Math.abs(s - t) < 0.5 / FPS);
      frames.push({ t: +t.toFixed(4), scene: +snap.time.toFixed(4), shot: snap.shot, fade: +snap.fade.toFixed(3) });
      if (!DRY || still !== undefined) {
        await page.waitForTimeout(SETTLE);
        const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
        if (enc) await enc.write(jpg);
        if (still !== undefined) fs.writeFileSync(path.join(out, `still-${still.toFixed(2)}.jpg`), jpg);
      }
      if (Math.floor(t * 2) !== lastLog) { lastLog = Math.floor(t * 2); console.log(`t=${t.toFixed(1)} 场景=${snap.time.toFixed(2)} 机位=${snap.shot} 黑场=${snap.fade.toFixed(2)} 绘制=${snap.drawCalls}`); }
      frame++;
    }
  }
  if (enc) await enc.end();
  const dur = frame / FPS;
  fs.writeFileSync(path.join(out, 'timeline.json'), JSON.stringify({ fps: FPS, dur, segments: SEGMENTS, renderer: snap.renderer, canvas, frames }, null, 0));
  console.log(`共 ${frame} 帧 ${dur.toFixed(2)} 秒；页面错误 ${errors.length}`, errors.slice(0, 5));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
