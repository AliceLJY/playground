// 录屏与自动检查段：每个候选在 390×664、2 倍像素的手机视口里，用假时钟逐帧推进 3 秒，
// 按候选自己写的 __LAB__.demo 发 CDP 真实触摸，逐帧截图 → 3 秒 mp4、预览 gif、6 格联系表、首帧截图，
// 再用 ffmpeg 逐帧求差算 C8 响应 / C9 落定 / C10 动过，连同源码静态检查写进 checks.json（检查表见 SPEC.md）。
// 用法：NODE_PATH="$(npm root -g)" node tools/record.cjs <candidates 目录> <媒体输出目录> [slug ...]
//   截图、联系表、checks.json 写回各候选目录；mp4、gif 写进媒体目录；逐帧图建在媒体目录同一个卷上，用完挪进那个卷的废纸篓（外接盘是 /Volumes/<盘>/.Trashes/<uid>，跨卷 mv 等于复制、会把内置盘填回去）。
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const FPS = 30, DUR = 3, SUB = 2, W = 390, H = 664, DPR = 2;
// 帧差：相邻两帧按 390×664 灰度比，px = 亮度差超过 16 的像素个数。
// 不用 ffmpeg signalstats：它对 RGB 输入的差图给出过「均值大于最大值」的读数（2026-11-03 好样本静止帧报 YAVG 9.6、YMAX 3）。
const CHANGED = (d) => d.px >= 40;
const STILL = (d) => d.px < 20;

function trashFor(dir) {
  const m = path.resolve(dir).match(/^\/Volumes\/[^/]+/);
  return m ? path.join(m[0], '.Trashes', String(process.getuid())) : path.join(os.homedir(), '.Trash');
}

function staticChecks(src) {
  const out = {};
  let params = null;
  const m = src.match(/<script[^>]*id=["']lab-params["'][^>]*>([\s\S]*?)<\/script>/);
  try { params = m && JSON.parse(m[1]); } catch { params = null; }
  out['C3-params'] = { pass: !!(params && params.name && params.kind), detail: params ? `name=${params.name} kind=${params.kind}` : '缺 #lab-params 或不是合法 JSON' };
  const hasSpring = /function\s+springStep\s*\(/.test(src) && /h\s*=\s*1\s*\/\s*240/.test(src);
  out['C4-spring'] = { pass: hasSpring, detail: hasSpring ? 'springStep 固定 1/240 步长' : '没找到照抄的 springStep（h = 1 / 240）' };
  const css = [];
  for (const mm of src.matchAll(/transition(?:-property|-duration)?\s*:\s*([^;}"']*)/g)) if (!/^\s*none\b/.test(mm[1])) css.push(`transition: ${mm[1].trim().slice(0, 40)}`);
  if (/@keyframes/.test(src)) css.push('@keyframes');
  if (/\.animate\s*\(/.test(src)) css.push('.animate(');
  if (/animation(?:-name)?\s*:\s*(?!none)[a-z]/i.test(src)) css.push('animation:');
  out['C5-css-motion'] = { pass: css.length === 0, detail: css.length ? `用了 CSS 或 WAAPI 动画：${css.join('；')}` : '无' };
  return { checks: out, params };
}

function frameDiffs(framesDir) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, '%04d.png'),
    '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  return diffRaw(raw, W * H);   // diffs[k] = 第 k 帧与第 k+1 帧之差
}

function diffRaw(raw, size) {
  const n = Math.floor(raw.length / size), diffs = [];
  for (let k = 0; k + 1 < n; k++) {
    let px = 0;
    for (let i = 0, a = k * size, b = a + size; i < size; i++) if (Math.abs(raw[a + i] - raw[b + i]) > 16) px++;
    diffs.push({ px });
  }
  return diffs;
}

function judgeMotion(diffs, downs) {
  const res = {};
  const per = downs.map((f) => {
    const win = [f - 1, f, f + 1].filter((k) => k >= 0 && k < diffs.length);
    const hit = win.findIndex((k) => CHANGED(diffs[k]));
    return { frame: f, respondedWithinFrames: hit < 0 ? null : hit + 1 };
  });
  res['C8-response'] = { pass: per.length > 0 && per.every((p) => p.respondedWithinFrames !== null),
    detail: per.length ? per.map((p) => `第${p.frame}帧按下→${p.respondedWithinFrames ? `${p.respondedWithinFrames}帧内有变化` : '100ms 内没变化'}`).join('；') : 'demo 里没有按下' };
  const tail = diffs.slice(-Math.ceil(0.25 * FPS));
  res['C9-settle'] = { pass: tail.length > 0 && tail.every(STILL), detail: `最后 0.25 秒相邻帧最多变了 ${Math.max(...tail.map((d) => d.px))} 像素（阈值 <20）` };
  const peak = Math.max(...diffs.map((d) => d.px));
  res['C10-moved'] = { pass: peak >= 500, detail: `3 秒里相邻帧最多变了 ${peak} 像素（阈值 ≥500）` };
  return res;
}

async function recordOne(browser, dir, mediaDir) {
  const slug = path.basename(dir), file = path.join(dir, 'index.html');
  const src = fs.readFileSync(file, 'utf8');
  const { checks, params } = staticChecks(src);
  const errors = [], external = [];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    external.push(u.replace(/\?.*$/, '?<QUERY-REDACTED>')); return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.addInitScript(() => {
    let now = 0, seq = 0; const raf = []; const timers = new Map();
    performance.now = () => now;
    const t0 = Date.now(); Date.now = () => t0 + now;
    window.requestAnimationFrame = (cb) => { raf.push(cb); return raf.length; };
    window.cancelAnimationFrame = () => {};
    window.setTimeout = (cb, ms, ...a) => { const id = ++seq; timers.set(id, { t: now + (ms || 0), cb, a }); return id; };
    window.setInterval = (cb, ms, ...a) => { const id = ++seq; const iv = Math.max(1, ms || 0); timers.set(id, { t: now + iv, cb, a, iv }); return id; };
    window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
    window.__rec = { tick(dt) {
      now += dt * 1000;
      for (const [id, x] of [...timers]) if (x.t <= now) { if (x.iv) x.t += x.iv; else timers.delete(id); if (typeof x.cb === 'function') x.cb(...x.a); }
      const q = raf.splice(0); for (const cb of q) cb(now);
    } };
  });
  await page.goto('file://' + file, { waitUntil: 'load' });
  for (let i = 0; i < 10 && !(await page.evaluate(() => !!(window.__LAB__ && window.__LAB__.ready))); i++) await page.evaluate(() => window.__rec.tick(1 / 30));
  const lab = await page.evaluate(() => window.__LAB__ ? { ready: !!window.__LAB__.ready, demo: window.__LAB__.demo || [] } : null);
  const demo = (lab && Array.isArray(lab.demo)) ? lab.demo : [];
  const inTime = demo.every((g) => g.t >= 0 && g.t + (g.dur || 0.1) <= DUR);
  checks['C6-hook'] = { pass: !!(lab && lab.ready && demo.length && inTime), detail: lab ? `ready=${lab.ready}，${demo.length} 个手势${inTime ? '' : '，有手势超出 3 秒'}` : '没挂 window.__LAB__' };
  const targets = await page.evaluate((names) => names.map((n) => {
    const el = document.querySelector(`[data-lab-target="${n}"]`);
    if (!el) return { n, ok: false, w: 0, h: 0 };
    const b = el.getBoundingClientRect(); return { n, ok: b.width >= 44 && b.height >= 44, w: Math.round(b.width), h: Math.round(b.height), cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  }), [...new Set(demo.map((g) => g.target))]);
  checks['C7-targets'] = { pass: targets.length > 0 && targets.every((t) => t.ok), detail: targets.map((t) => `${t.n} ${t.w}×${t.h}${t.ok ? '' : '（不足 44 或不存在）'}`).join('；') || '无' };

  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: 0, radiusX: 11, radiusY: 11, force: 1 })) });
  const center = Object.fromEntries(targets.map((t) => [t.n, t]));
  const gs = demo.map((g) => ({ ...g, dur: g.type === 'drag' ? (g.dur || 0.4) : 0.1, state: 0 }));
  fs.mkdirSync(mediaDir, { recursive: true });
  const frames = fs.mkdtempSync(path.join(mediaDir, `.frames-${slug}-`));
  const downs = [];
  const N = DUR * FPS;
  for (let f = 0; f < N; f++) {
    for (let k = 0; k < SUB; k++) {
      const ts = (f + k / SUB) / FPS;
      for (const g of gs) {
        if (!center[g.target] || !center[g.target].cx) continue;
        // 按下那一刻现量目标位置：前一个手势可能已经把它挪走了（2026-11-03 drag-snap 第二下按空）
        if (g.state === 0 && ts >= g.t) g.at = await page.evaluate((n) => { const b = document.querySelector(`[data-lab-target="${n}"]`).getBoundingClientRect(); return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; }, g.target);
        const c = g.at || center[g.target];
        const s = Math.min(1, Math.max(0, (ts - g.t) / g.dur)), ease = 1 - Math.pow(1 - s, 3);
        const p = { x: c.cx + (g.dx || 0) * (g.type === 'drag' ? ease : 0), y: c.cy + (g.dy || 0) * (g.type === 'drag' ? ease : 0) };
        if (g.state === 0 && ts >= g.t) { await touch('touchStart', [p]); g.state = 1; downs.push(f); }
        else if (g.state === 1 && ts >= g.t + g.dur) { if (g.type === 'drag') await touch('touchMove', [p]); await touch('touchEnd', []); g.state = 2; }
        else if (g.state === 1 && g.type === 'drag') await touch('touchMove', [p]);
      }
    }
    await page.evaluate(() => window.__rec.tick(1 / 30));
    await page.waitForTimeout(8);
    await page.screenshot({ path: path.join(frames, String(f).padStart(4, '0') + '.png') });
  }
  Object.assign(checks, judgeMotion(frameDiffs(frames), [...new Set(downs)]));
  checks['C1-errors'] = { pass: errors.length === 0, detail: errors.length ? errors.slice(0, 3).join(' | ') : '无' };
  checks['C2-offline'] = { pass: external.length === 0, detail: external.length ? external.slice(0, 3).join(' ') : '无' };
  await ctx.close();

  const inp = ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frames, '%04d.png')];
  const mp4 = path.join(mediaDir, `${slug}.mp4`), gif = path.join(mediaDir, `${slug}.gif`);
  execFileSync('ffmpeg', [...inp, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]);
  execFileSync('ffmpeg', [...inp, '-vf', 'fps=15,scale=260:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse', gif]);
  execFileSync('ffmpeg', [...inp, '-vf', `select='not(mod(n\\,8))',scale=200:-1,tile=6x2:padding=4:color=white`, '-frames:v', '1', path.join(dir, 'contact.png')]);
  fs.copyFileSync(path.join(frames, '0000.png'), path.join(dir, 'shot.png'));
  const trash = trashFor(mediaDir); fs.mkdirSync(trash, { recursive: true });
  fs.renameSync(frames, path.join(trash, `lab${path.basename(frames)}-${Date.now()}`));

  const ids = Object.keys(checks).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  const ordered = Object.fromEntries(ids.map((k) => [k, checks[k]]));
  const result = { slug, params, demo, allPass: ids.every((k) => checks[k].pass), checks: ordered, media: { mp4, gif } };
  fs.writeFileSync(path.join(dir, 'checks.json'), JSON.stringify(result, null, 2));
  return result;
}

module.exports = { staticChecks, judgeMotion, diffRaw, trashFor, CHANGED, STILL };

if (require.main === module) (async () => {
  const [candArg, mediaArg, ...only] = process.argv.slice(2);
  const candDir = candArg && path.resolve(candArg), mediaDir = mediaArg && path.resolve(mediaArg);
  if (!candDir || !mediaDir) { console.error('用法: node tools/record.cjs <candidates 目录> <媒体输出目录> [slug ...]'); process.exit(2); }
  const slugs = (only.length ? only : fs.readdirSync(candDir)).filter((s) => fs.existsSync(path.join(candDir, s, 'index.html')));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  let bad = 0;
  for (const s of slugs) {
    try {
      const r = await recordOne(browser, path.join(candDir, s), mediaDir);
      const fails = Object.entries(r.checks).filter(([, v]) => !v.pass).map(([k]) => k);
      console.log(`${s}: ${r.allPass ? '全过' : '未过 ' + fails.join(' ')}`);
    } catch (e) { bad++; console.log(`${s}: 录制失败 ${String(e).slice(0, 300)}`); }
  }
  await browser.close();
  console.log(`共 ${slugs.length} 个，录制失败 ${bad} 个`);
  process.exit(bad ? 1 : 0);
})();
