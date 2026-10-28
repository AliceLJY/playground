// Frame-exact vertical demo of 凸透镜成像: the whole lesson from the question to the answer, run by hand
// (not part of CI or the build). Needs an existing Playwright install, Google Chrome and ffmpeg.
//   node tools/build.mjs
//   NODE_PATH="$(npm root -g)" node tools/record.cjs <output.mp4> [--size 540x960] [--dpr 2]
// Same method as snowline-cabin/tools/record.cjs: the page clock is taken over before load, so every video frame advances
// the page by exactly 1/30 s. Every move is a real mouse drag or click on the page, with a finger ring drawn where it
// lands; nothing is set through the hook. The page's chime is not captured: the video is silent, and the times of the
// finds are written next to it as <output>.events.json for tools/demo-music.py.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const out = args.find((a) => a.endsWith('.mp4')); if (!out) { console.error('usage: record.cjs <output.mp4> [--size WxH] [--dpr N]'); process.exit(2); }
const [W, H] = flag('size', '540x960').split('x').map(Number), DPR = +flag('dpr', 2);
const base = 'file://' + path.resolve(__dirname, '../dist/index.html'), FPS = 30, FRAME = 1000 / FPS;
const L = 40, F = 10, Y0 = 18;

function takeOverClock() {            // runs in the page before any of its scripts
  let vnow = 0, queue = [], timers = [], nextId = 1; const wall = Date.now();
  performance.now = () => vnow; Date.now = () => wall + vnow;
  window.requestAnimationFrame = (cb) => { const id = nextId++; queue.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { queue = queue.filter((q) => q.id !== id); };
  window.setTimeout = (cb, ms = 0) => { const id = nextId++; timers.push({ id, at: vnow + ms, cb }); return id; };
  window.clearTimeout = (id) => { timers = timers.filter((q) => q.id !== id); };
  window.setInterval = (cb, ms) => { const id = nextId++; const tick = () => { cb(); timers.push({ id, at: vnow + ms, cb: tick }); }; timers.push({ id, at: vnow + ms, cb: tick }); return id; };
  window.clearInterval = window.clearTimeout;
  const seen = new WeakMap();
  window.__rec = { get now() { return vnow; },
    step(ms) {
      vnow += ms;
      const due = timers.filter((q) => q.at <= vnow); timers = timers.filter((q) => q.at > vnow); for (const q of due) { try { q.cb(); } catch (e) { console.error(e); } }
      const q = queue; queue = []; for (const { cb } of q) { try { cb(vnow); } catch (e) { console.error(e); } }
      for (const a of document.getAnimations()) { if (!seen.has(a)) { seen.set(a, vnow); a.pause(); } a.currentTime = vnow - seen.get(a); }
    },
    finger(x, y, down) { let d = document.getElementById('rec-finger');
      if (!d) { d = document.createElement('div'); d.id = 'rec-finger'; d.style.cssText = 'position:fixed;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;pointer-events:none;z-index:99;transition:none'; document.body.appendChild(d); }
      d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.display = x == null ? 'none' : 'block';
      d.style.border = '2.5px solid rgba(31,42,68,.9)'; d.style.background = down ? 'rgba(226,131,42,.45)' : 'rgba(255,255,255,.35)'; d.style.transform = down ? 'scale(.82)' : 'scale(1)'; },
  };
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await ctx.addInitScript(takeOverClock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  const step = () => page.evaluate((ms) => window.__rec.step(ms), FRAME);
  for (let i = 0; i < 300 && !await page.evaluate(() => !!(window.__lens && window.__lens.ready)); i++) { await step(); await page.waitForTimeout(10); }
  for (let i = 0; i < 20; i++) await step();
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', String(FPS), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  let frames = 0; const events = { found: {}, marks: [] };
  const t = () => +(frames / FPS).toFixed(2);
  const mark = (label) => events.marks.push({ t: t(), label });
  const S = () => page.evaluate(() => window.__lens.state());
  let known = new Set();
  const frame = async () => {
    const jpg = await page.screenshot({ type: 'jpeg', quality: 92 }); if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
    frames++; await step();
    const s = await S(); const all = [...s.found, ...(s.focusFound ? ['focus'] : [])];
    for (const k of all) if (!known.has(k)) { known.add(k); events.found[k] = t(); }
  };
  const hold = async (sec) => { for (let i = 0; i < Math.round(sec * FPS); i++) await frame(); };
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const finger = (x, y, down) => page.evaluate(([a, b, c]) => window.__rec.finger(a, b, c), [x, y, down]);
  const P = (x, y) => page.evaluate(([a, b]) => window.__lens.project(a, b), [x, y]);
  // glide the finger in, press, drag along the ruler with easing, release, lift away
  const drag = async (from, to, grabY, sec) => {
    const a = await P(from, grabY), b = await P(to, grabY);
    await finger(a.x, a.y, false); await hold(0.25);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await finger(a.x, a.y, true); await hold(0.15);
    const n = Math.round(sec * FPS);
    for (let i = 1; i <= n; i++) { const k = ease(i / n), x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k; await page.mouse.move(x, y); await finger(x, y, true); await frame(); }
    await page.mouse.up(); await finger(b.x, b.y, false); await hold(0.2); await finger(null, null, false);
  };
  const tap = async (sel, sec = 0.35) => {
    const r = await page.locator(sel).boundingBox(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    await finger(x, y, false); await hold(sec); await finger(x, y, true); await hold(0.12);
    await page.mouse.click(x, y); await finger(x, y, false); await hold(0.2); await finger(null, null, false);
  };
  const until = async (fn, maxS = 8) => { for (let i = 0; i < maxS * FPS; i++) { if (await page.evaluate(fn)) return true; await frame(); } return false; };
  const scrollPanel = async (to, sec) => { const from = await page.evaluate(() => document.querySelector('aside').scrollTop); const n = Math.round(sec * FPS);
    for (let i = 1; i <= n; i++) { await page.evaluate((v) => { document.querySelector('aside').scrollTop = v; }, from + (to - from) * ease(i / n)); await frame(); } };
  const best = (u) => L + (u * F) / (u - F);

  mark('question'); await hold(3.0);
  // 1. parallel light, screen to the focal point
  mark('sun'); await tap('#sun'); await hold(0.8);
  let s = await S(); await drag(s.screen, L + F, Y0 - 13, 1.6);
  await until(() => window.__lens.state().focusFound, 3); mark('focus'); await hold(2.6);
  // 2. guess: the common wrong answer, so the experiment has something to overturn
  await until(() => !window.__lens.state().sun, 3);
  mark('guess'); await hold(1.2); await tap('#guess button:nth-child(1)', 0.6); await hold(1.6);
  // 3. far: candle already at u = 30; the screen goes past the sharp spot and back
  mark('far'); s = await S(); await drag(s.screen, best(30) + 9, Y0 - 13, 1.0); await hold(0.4);
  await drag(best(30) + 9, best(30), Y0 - 13, 1.0);
  await until(() => window.__lens.state().found.includes('far'), 3); await hold(3.0);
  // 4. 2f: the candle clicks on
  mark('two'); s = await S(); await drag(s.candle, L - 20.3, Y0 - 6, 1.0); await hold(0.3);
  s = await S(); await drag(s.screen, best(20), Y0 - 13, 0.9);
  await until(() => window.__lens.state().found.includes('two'), 3); await hold(2.4);
  // 5. between f and 2f
  mark('mid'); s = await S(); await drag(s.candle, L - 15, Y0 - 6, 0.9); await hold(0.3);
  s = await S(); await drag(s.screen, best(15), Y0 - 13, 0.9);
  await until(() => window.__lens.state().found.includes('mid'), 3); await hold(2.6);
  // 6. on the focal point: sweep the screen, nothing sharpens
  mark('focal'); s = await S(); await drag(s.candle, L - F - 0.3, Y0 - 6, 0.9); await hold(0.3);
  s = await S(); await drag(s.screen, 52, Y0 - 13, 1.3); await drag(52, 86, Y0 - 13, 1.6);
  await until(() => window.__lens.state().found.includes('focal'), 3); await hold(2.4);
  // 7. inside f: the screen has nothing; look through the lens
  mark('near'); s = await S(); await drag(s.candle, L - 6, Y0 - 6, 0.9); await hold(1.4);
  await tap('#eye', 0.5); await until(() => window.__lens.state().found.includes('near'), 3); await hold(3.0);
  // 8. the answer: scroll the panel down to the rule and the recap of the guess
  mark('answer'); await hold(0.8);
  const y = await page.evaluate(() => { const a = document.querySelector('aside'), r = document.getElementById('answer').getBoundingClientRect(), ar = a.getBoundingClientRect(); return a.scrollTop + r.top - ar.top - 8; });
  await scrollPanel(y, 1.6); await hold(5.5);
  mark('end');
  ff.stdin.end(); await done; await browser.close();
  const st = { out, size: `${W * DPR}x${H * DPR}`, seconds: t(), frames, errors, ...events };
  fs.writeFileSync(out.replace(/\.mp4$/, '.events.json'), JSON.stringify(st, null, 1));
  console.log(JSON.stringify(st, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
