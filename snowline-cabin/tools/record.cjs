// Frame-exact recording of a guided tour of 雪线小木屋, run by hand (not part of CI or the build).
// Needs an existing Playwright install, Google Chrome and ffmpeg; this folder installs none of them.
//   node tools/build.mjs
//   NODE_PATH="$(npm root -g)" node tools/record.cjs <output.mp4> [--size 1280x720] [--dpr 1.5] [--part all|tour|finale]
// --size is the CSS viewport and --dpr the pixel ratio; the video is size x dpr. Vertical 1080x1920: --size 540x960 --dpr 2.
// Same method as shadow-gong/tools/record.cjs: the page's clock is taken over before it loads, so every video frame
// advances the page by exactly 1/60 s whatever the machine's speed; timers and CSS transitions run on that clock too.
// The page has no sound, so the video is silent. Two takes are joined: the tour, and the finale (opened with six lamps lit).
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const out = args.find((a) => a.endsWith('.mp4')); if (!out) { console.error('usage: record.cjs <output.mp4> [--size WxH] [--dpr N] [--part all|tour|finale]'); process.exit(2); }
const [W, H] = flag('size', '1280x720').split('x').map(Number), DPR = +flag('dpr', 1.5), PART = flag('part', 'all');
const base = 'file://' + path.resolve(__dirname, '../dist/index.html'), FPS = 60, FRAME = 1000 / FPS;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'snowline-rec-'));

function takeOverClock() {            // runs in the page before any of its scripts
  let vnow = 0, queue = [], timers = [], nextId = 1; const wall = Date.now();
  performance.now = () => vnow; Date.now = () => wall + vnow;
  window.requestAnimationFrame = (cb) => { const id = nextId++; queue.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { queue = queue.filter((q) => q.id !== id); };
  window.setTimeout = (cb, ms = 0) => { const id = nextId++; timers.push({ id, at: vnow + ms, cb }); return id; };
  window.clearTimeout = (id) => { timers = timers.filter((q) => q.id !== id); };
  const seen = new WeakMap();
  window.__rec = { get now() { return vnow; },
    step(ms) {
      vnow += ms;
      const due = timers.filter((q) => q.at <= vnow); timers = timers.filter((q) => q.at > vnow); for (const q of due) { try { q.cb(); } catch (e) { console.error(e); } }
      const q = queue; queue = []; for (const { cb } of q) { try { cb(vnow); } catch (e) { console.error(e); } }
      for (const a of document.getAnimations()) { if (!seen.has(a)) { seen.set(a, vnow); a.pause(); } a.currentTime = vnow - seen.get(a); }
    },
    // a ring where a finger lands, so the viewer can see what was tapped
    tap(x, y) { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;border:2px solid rgba(255,235,205,.95);background:rgba(255,220,170,.22);pointer-events:none;z-index:99;animation:rectap .7s ease-out forwards`; document.body.appendChild(d); window.setTimeout(() => d.remove(), 720); },
  };
  document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); // Headless screenshots drop the contents of a backdrop-filter panel on some frames while it repaints (about one frame
    // in eight during a slider sweep, measured 2026-10-11), so the recording uses a plain, slightly denser panel instead.
    st.textContent = '@keyframes rectap{0%{transform:scale(.35);opacity:1}100%{transform:scale(1.5);opacity:0}}' +
      '.glass,.badge,.tools button{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;background:rgba(14,20,34,.6)!important}'; document.head.appendChild(st); });
}

async function take(name, query, script) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  await ctx.addInitScript(takeOverClock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + query);
  const step = () => page.evaluate((ms) => window.__rec.step(ms), FRAME);
  for (let i = 0; i < 500 && !await page.evaluate(() => !!(window.__cabin && window.__cabin.ready)); i++) { await step(); await page.waitForTimeout(15); }
  for (let i = 0; i < 40; i++) await step();
  await page.evaluate(() => window.__cabin.rig.jump(0));        // every take opens on the opening view
  const file = path.join(work, name + '.mp4');
  // Screenshots are full-range BT.601 JPEG; convert to limited-range BT.709 and tag it (see shadow-gong/VERIFICATION.md).
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  let frames = 0; const marks = [];
  const T = {
    page,
    mark: (label) => { marks.push({ t: +(frames / FPS).toFixed(2), label }); },
    frame: async () => { const jpg = await page.screenshot({ type: 'jpeg', quality: 93 }); if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r)); frames++; await step(); },
    hold: async (s) => { for (let i = 0; i < Math.round(s * FPS); i++) await T.frame(); },
    until: async (fn, arg, maxS = 20) => { for (let i = 0; i < maxS * FPS; i++) { if (await page.evaluate(fn, arg)) return true; await T.frame(); } return false; },
    tap: async (x, y) => { await page.evaluate(([a, b]) => window.__rec.tap(a, b), [x, y]); await T.hold(0.12); await page.mouse.click(x, y); },
    // tap a summit where it is on screen; if it is hidden or under a panel, ask the page directly
    summit: async (id) => {
      const p = await page.evaluate((i) => window.__cabin.summitOnScreen(i), id);
      const el = p.front && p.x > 20 && p.x < W - 20 && p.y > 70 && p.y < H - 20 ? await page.evaluate(([a, b]) => document.elementFromPoint(a, b)?.id || '', [p.x, p.y]) : '';
      if (el === 'scene') await T.tap(p.x, p.y);
      if (await page.evaluate(() => window.__cabin.state().focus) !== id) await page.evaluate((i) => window.__cabin.focus(i), id);
      T.mark('tap ' + id); await T.until((i) => window.__cabin.state().lit.includes(i), id, 14);
    },
    click: async (sel) => { const b = await page.locator(sel).boundingBox(); await T.tap(b.x + b.width / 2, b.y + b.height / 2); },
    hour: async (to, s) => { const from = await page.evaluate(() => +document.getElementById('hour').value); const n = Math.round(s * FPS);
      for (let i = 1; i <= n; i++) { const k = i / n, e = k * k * (3 - 2 * k); await page.evaluate((v) => { const el = document.getElementById('hour'); el.value = String(v); el.dispatchEvent(new Event('input')); }, Math.round(from + (to * 1000 - from) * e)); await T.frame(); } },
    look: async (dx, dy, s) => { const n = Math.round(s * FPS), x0 = W * 0.5, y0 = H * 0.42; await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x0 + 12, y0);   // past the tap threshold first
      for (let i = 1; i <= n; i++) { const k = i / n, e = k * k * (3 - 2 * k); await page.mouse.move(x0 + 12 + dx * e, y0 + dy * e); await T.frame(); } await page.mouse.up(); },
    ring: async (i) => { const p = await page.evaluate((q) => window.__cabin.spotOnScreen(q), i); const ok = p.front && p.x > 30 && p.x < W - 30 && p.y > 80 && p.y < H - 30 && await page.evaluate(([a, b]) => document.elementFromPoint(a, b)?.id === 'scene', [p.x, p.y]);
      if (ok) await T.tap(p.x, p.y); if (await page.evaluate((q) => window.__cabin.state().spot !== ['fire', 'window', 'table'][q], i)) await page.evaluate((q) => window.__cabin.goSpot(q), i); T.mark('spot ' + i + (ok ? ' (tapped)' : ' (hook)')); },
  };
  await script(T);
  ff.stdin.end(); await done; await browser.close();
  return { file, frames, seconds: +(frames / FPS).toFixed(2), errors, marks };
}

const tour = async (T) => {
  T.mark('opening'); await T.hold(4.2);
  await T.summit('beacon'); await T.hold(3.6);
  await T.summit('red-hut'); await T.hold(3.4);
  await T.click('#back'); T.mark('back'); await T.until(() => window.__cabin.state().mode === 'auto', null, 9); await T.hold(1.2);
  await T.page.evaluate(() => window.__cabin.rig.setAuto(false));        // stand still while the hour changes
  T.mark('hour'); await T.hour(0, 3.2); await T.hold(1.4); await T.hour(1, 4.6); await T.hold(1.8); await T.hour(0.5, 3.0); await T.hold(0.8);
  T.mark('enter'); await T.click('[data-act="enter"]'); await T.until(() => window.__cabin.state().inside, null, 3); await T.hold(1.6);
  await T.look(-Math.min(W, H) * 0.16, 0, 2.6); await T.hold(0.5);
  await T.look(Math.min(W, H) * 0.62, Math.min(W, H) * 0.05, 2.4); await T.ring(1); await T.hold(3.4);
  await T.look(Math.min(W, H) * 0.5, Math.min(W, H) * 0.06, 2.2); await T.ring(2); await T.hold(3.0);
  T.mark('leave'); await T.click('#leave'); await T.until(() => !window.__cabin.state().inside, null, 3); await T.hold(1.8);
};
const finale = async (T) => {
  T.mark('six lit'); await T.hold(2.2);
  await T.summit('hamlet-east'); T.mark('seventh');
  await T.until(() => window.__cabin.state().finale >= 0, null, 8); T.mark('finale');
  await T.until(() => window.__cabin.state().finale === -2, null, 16); await T.hold(3.5);
};

(async () => {
  const takes = [];
  if (PART !== 'finale') takes.push(await take('tour', '', tour));
  if (PART !== 'tour') takes.push(await take('finale', '?lit=red-hut,white-porch,bare-lantern,beacon,hamlet-north,cairn', finale));
  const list = path.join(work, 'list.txt'); fs.writeFileSync(list, takes.map((t) => `file '${t.file}'`).join('\n'));
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('concat failed');
  console.log(JSON.stringify({ out, size: `${W * DPR}x${H * DPR}`, takes: takes.map((t) => ({ seconds: t.seconds, frames: t.frames, errors: t.errors, marks: t.marks })), work }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
