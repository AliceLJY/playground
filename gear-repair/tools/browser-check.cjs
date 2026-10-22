// Browser acceptance for 齿轮返修 (SPEC 验收 5–10), run by hand, not part of CI.
// Needs an existing Playwright install and Google Chrome; this repository installs neither.
//   python3 -m http.server 8972 --bind 127.0.0.1          (inside gear-repair/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [base-url]
// Writes screenshots, opening-30-seconds frames and report.json into <output-dir>; exits 1 when any check fails.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'check-out', base = process.argv[3] || 'http://127.0.0.1:8972/index.html', origin = new URL(base).origin;
fs.mkdirSync(out, { recursive: true });

const SIZES = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  big: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  fold: { viewport: { width: 720, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const VERSIONS = ['original', 'repaired'], VIEWS = ['hero', 'mesh', 'mesh-cd'];
const T = 0.2;                                  // 固定画面停在模拟时刻 0.2 秒（A 转了 0.28 弧度），两个版本同一时刻，前后可对照
const report = { base, browser: null, checks: [], runs: [], requests: {} };
let failed = 0;
const check = (name, pass, detail) => {
  report.checks.push({ name, pass: !!pass, detail });
  if (!pass) failed++;
  console.log(pass ? 'ok  ' : 'FAIL', name, detail == null ? '' : JSON.stringify(detail).slice(0, 260));
};

// 构图检查：全景要求四个轮子的外缘整个在画面里、不被顶栏底栏（或打开的说明）压住；特写要求啮合点在安全区里。
// 返回问题列表，空表示通过。校准时拿已知的坏状态喂它，它必须报问题。
function layoutProblems(pr, view) {
  const { w, h } = pr.viewport, probs = [], m = 4;
  if (view === 'hero') {
    for (const k of ['A', 'B', 'C', 'D']) {
      const c = pr.centers[k], b = pr.bboxes[k];
      if (!(c.x > 0 && c.x < w && c.y > 0 && c.y < h)) probs.push(`${k} 中心出画 (${Math.round(c.x)}, ${Math.round(c.y)})`);
      if (b.x0 < m || b.x1 > w - m || b.y0 < m || b.y1 > h - m) probs.push(`${k} 外缘出画`);
      for (const r of pr.hud) if (!(b.x1 < r.x0 || b.x0 > r.x1 || b.y1 < r.y0 || b.y0 > r.y1)) probs.push(`${k} 被 #${r.id} 压住`);
    }
  } else {
    const c = pr.mesh[view];
    if (!(c.x > 0 && c.x < w && c.y > pr.safe.y0 && c.y < pr.safe.y1)) probs.push(`${view} 啮合点不在安全区 (${Math.round(c.x)}, ${Math.round(c.y)})`);
  }
  return probs;
}

// 说明页必须夹在顶栏和底栏之间，不盖住它们
const infoProblems = (r) => {
  const probs = [];
  if (r.info.y0 < r.top.y1 - 0.5) probs.push(`说明页盖住了顶栏（说明页上沿 ${Math.round(r.info.y0)}，顶栏下沿 ${Math.round(r.top.y1)}）`);
  if (r.info.y1 > r.bottom.y0 + 0.5) probs.push(`说明页盖住了底栏（说明页下沿 ${Math.round(r.info.y1)}，底栏上沿 ${Math.round(r.bottom.y0)}）`);
  if (r.info.x0 < 0 || r.info.x1 > r.vw) probs.push('说明页横向出画');
  if (r.close.y1 > r.info.y1 + 0.5 || r.close.y0 < r.info.y0 - 0.5) probs.push(`「关闭」按钮不在说明页可见范围内，要滚动才够得到（按钮 ${Math.round(r.close.y0)}–${Math.round(r.close.y1)}，说明页 ${Math.round(r.info.y0)}–${Math.round(r.info.y1)}）`);
  return probs;
};
const infoRects = (page) => page.evaluate(() => {
  const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }; };
  return { info: rect('info'), close: rect('info-close'), top: rect('top'), bottom: rect('bottom'), vw: innerWidth };
});

// 顶栏、底栏里同一行相邻的元素，横向间距至少 8 px（挤在一起读不清，也容易点错）
const barGaps = (page) => page.evaluate(() => {
  const out = [];
  const groups = { top: ['#top .titles', '#chip span', '#ver'], bottom: ['#readout', '#views', '.ctrls'] };
  for (const [bar, sels] of Object.entries(groups)) {
    const items = sels.map((q) => document.querySelector(q)).filter((e) => e && e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { q: e.id || e.className || e.tagName, x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }; });
    for (let i = 0; i < items.length; i++) for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const a = items[i], b = items[j];
      const sameRow = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 4;
      if (sameRow && b.x0 >= a.x0 && b.x0 < a.x1 + 8) out.push({ bar, a: a.q, b: b.q, gap: Math.round(b.x0 - a.x1) });
    }
  }
  return out;
});

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  report.browser = browser.version();
  const seen = new Set();

  async function open(query, size) {
    const ctx = await browser.newContext(SIZES[size]), page = await ctx.newPage();
    const errors = [], external = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url().slice(0, 120)));
    page.on('request', (r) => {
      const u = r.url();
      if (u.startsWith(origin)) seen.add(new URL(u).pathname);
      else if (!u.startsWith('data:') && !u.startsWith('blob:')) external.push(u.split('?')[0]);
    });
    await page.goto(base + query);
    await page.waitForFunction(() => window.__gearRepair && window.__gearRepair.ready, null, { polling: 100, timeout: 20000 });
    await page.waitForTimeout(300);
    return { ctx, page, errors, external };
  }
  const state = (page) => page.evaluate(() => window.__gearRepair.state());
  const domInfo = (page) => page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), x0: r.left, x1: r.right, y0: r.top, y1: r.bottom }; });
    const inside = btns.every((b) => b.x0 >= 0 && b.x1 <= vw && b.y0 >= 0 && b.y1 <= vh);
    const bars = ['top', 'bottom'].map((id) => { const e = document.getElementById(id); return { id, overflow: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1, h: e.getBoundingClientRect().height }; });
    return {
      chip: document.getElementById('chip-text').textContent, readout: document.getElementById('readout').innerText,
      buttonsInside: inside, nButtons: btns.length, bars, hScroll: document.documentElement.scrollWidth > vw + 1,
      pressedVersion: [...document.querySelectorAll('#ver button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.version,
      pressedView: [...document.querySelectorAll('#views button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.view,
      bodyVersion: document.body.dataset.version,
    };
  });

  // ================= 1. 两个版本 × 三个机位 × 五种尺寸的固定画面（验收 5–7、8） =================
  for (const size of Object.keys(SIZES)) for (const version of VERSIONS) for (const view of VIEWS) {
    const tag = `${size} ${version} ${view}`;
    const { ctx, page, errors, external } = await open(`?version=${version}&view=${view}&t=${T}`, size);
    const st = await state(page), dom = await domInfo(page), pr = await page.evaluate(() => window.__gearRepair.probe());
    const mk = await page.evaluate(() => window.__gearRepair.markerScreen());
    const spots = [pr.mesh.mesh, pr.mesh['mesh-cd']];
    const an = await page.evaluate(([s, r]) => window.__gearRepair.analyze(s, r), [spots, view === 'hero' ? 40 : 70]);
    const cycle = await page.evaluate((v) => window.__gearRepair.measureCycle(v), version);
    await page.screenshot({ path: path.join(out, `${size}-${version}-${view}.png`) });
    const probs = layoutProblems(pr, view);
    const inView = mk.filter((p) => p.x > 0 && p.x < pr.viewport.w && p.y > pr.safe.y0 && p.y < pr.safe.y1).length;
    report.runs.push({ size, version, view, state: st, dom, probs, ink: an.ink, red: an.red, markersInView: inView, cycle });

    check(`${tag}: no page errors`, errors.length === 0, errors);
    check(`${tag}: no external requests`, external.length === 0, external);
    check(`${tag}: canvas is drawn`, an.ink > 0.06, { ink: +an.ink.toFixed(3) });
    check(`${tag}: state matches URL`, st.version === version && st.view === view && !st.playing && Math.abs(st.t - T) < 1e-9 && dom.pressedVersion === version && dom.pressedView === view && dom.bodyVersion === version, { version: st.version, view: st.view, pv: dom.pressedVersion, pw: dom.pressedView });
    check(`${tag}: layout (${view === 'hero' ? 'four gears inside the frame, clear of the bars' : 'mesh point inside the safe area'})`, probs.length === 0, probs);
    const gaps = await barGaps(page);
    check(`${tag}: neighbours in the top and bottom bars keep ≥ 8 px apart`, gaps.length === 0, gaps);
    check(`${tag}: buttons inside viewport, bars do not overflow, no horizontal scroll`, dom.buttonsInside && dom.bars.every((b) => !b.overflow) && !dom.hScroll, dom);
    check(`${tag}: chip names the version and its 60-frame result`, dom.chip.includes(version === 'original' ? '原版' : '返修后') && dom.chip.includes(version === 'original' ? '60 帧穿模' : '0 帧穿模') && !dom.chip.includes('检测中'), dom.chip);
    check(`${tag}: page's own 60-frame cycle = ${version === 'original' ? '60/60' : '0/60'}`, cycle.frames === 60 && cycle.bad === (version === 'original' ? 60 : 0), cycle);
    if (version === 'original') {
      check(`${tag}: both pairs penetrate at t=${T}`, st.penetration.AB.count > 0 && st.penetration.CD.count > 0 && st.penetration.penetrating, st.penetration);
      check(`${tag}: readout shows the same counts as state`, dom.readout.includes(`A–B ${st.penetration.AB.count}`) && dom.readout.includes(`C–D ${st.penetration.CD.count}`), { readout: dom.readout });
      check(`${tag}: red markers exist = crossings + penetrating vertices`, st.markers === st.penetration.count, { markers: st.markers, count: st.penetration.count });
      if (view === 'hero') check(`${tag}: red pixels at both mesh points`, an.red[0] >= 15 && an.red[1] >= 15, an.red);
      else check(`${tag}: ≥ 20 red markers in view, red pixels at the mesh point`, inView >= 20 && an.red[view === 'mesh' ? 0 : 1] >= 40, { inView, red: an.red });
    } else {
      check(`${tag}: zero penetration, zero markers, no red pixels`, st.penetration.count === 0 && !st.penetration.penetrating && st.markers === 0 && an.red.every((n) => n <= 2) && dom.readout.includes('A–B 0') && dom.readout.includes('C–D 0'), { pen: st.penetration, markers: st.markers, red: an.red });
    }
    check(`${tag}: draw calls ≤ 40`, st.drawCalls <= 40, st.drawCalls);
    await ctx.close();
  }

  // ================= 2. 校准：构图检查必须抓得到已知的坏状态（桌面+手机） =================
  for (const size of ['phone', 'desktop']) {
    const { ctx, page } = await open('?view=hero', size);
    const good = layoutProblems(await page.evaluate(() => window.__gearRepair.probe()), 'hero');
    check(`calibration ${size}: current hero layout passes`, good.length === 0, good);
    if (size === 'phone') {        // dsh 原版的机位只在手机竖屏下是坏的（桌面横屏它本来就装得下），所以只在手机上拿它校准
      await page.evaluate(() => window.__gearRepair.legacyLayout());
      const bad = layoutProblems(await page.evaluate(() => window.__gearRepair.probe()), 'hero');
      await page.screenshot({ path: path.join(out, 'calibration-phone-dsh-original-layout.png') });
      check('calibration phone: dsh original camera/layout is flagged, gear A out of frame', bad.some((p) => p.startsWith('A ')), bad);
    }
    await page.evaluate(() => window.__gearRepair.setView('hero'));
    await page.evaluate(() => window.__gearRepair.openInfo(true));
    const covered = layoutProblems(await page.evaluate(() => window.__gearRepair.probe()), 'hero');
    check(`calibration ${size}: an open info sheet over the gears is flagged`, covered.some((p) => p.includes('#info')), covered);
    await page.evaluate(() => window.__gearRepair.openInfo(false));
    if (size === 'phone') {        // 说明页最初的写法（居中、只限制整屏高度）在手机上盖住了顶栏的徽标，拿它校准 infoProblems
      await page.addStyleTag({ content: '#info{top:50% !important;transform:translate(-50%,-50%) !important;max-height:calc(100% - 24px) !important}' });
      await page.evaluate(() => window.__gearRepair.openInfo(true));
      const old = infoProblems(await infoRects(page));
      await page.screenshot({ path: path.join(out, 'calibration-phone-old-info-sheet.png') });
      check('calibration phone: the first version of the info sheet (centred, full-height) is flagged for covering the bars', old.length > 0, old);
    }
    await ctx.close();
  }

  {   // 校准：720 宽时最初的断点（宽度 < 700 才算窄屏）下，标题、徽标、版本切换挤在一起，间距只有 4 px，这条检查必须抓到
    const { ctx, page } = await open('?view=hero', 'fold');
    const okGaps = await barGaps(page);
    await page.evaluate(() => document.body.classList.remove('narrow', 'compact'));
    const badGaps = await barGaps(page);
    check('calibration fold: current layout has no crowded neighbours', okGaps.length === 0, okGaps);
    check('calibration fold: the first breakpoint (narrow only below 700 px) is flagged as crowded', badGaps.length >= 2 && badGaps.every((g) => g.gap < 8), badGaps);
    await ctx.close();
  }

  {   // 校准：「关闭」按钮最初不是粘在说明页底部的，手机上要滚到最下面才够得到；这条检查必须抓到
    const { ctx, page } = await open('?view=hero', 'phone');
    await page.evaluate(() => window.__gearRepair.openInfo(true));
    const now = infoProblems(await infoRects(page));
    await page.addStyleTag({ content: '#info .close{position:static !important;box-shadow:none !important}' });
    const old = infoProblems(await infoRects(page));
    check('calibration phone: current info sheet keeps 关闭 inside its visible box', now.length === 0, now);
    check('calibration phone: the first version (按钮 not sticky) is flagged, 关闭 only reachable by scrolling', old.some((p) => p.includes('关闭')), old);
    await ctx.close();
  }

  // ================= 3. 切换、控件、说明页（验收 5） =================
  for (const size of ['desktop', 'phone']) {
    const { ctx, page, errors } = await open('', size);
    const first = await state(page);
    check(`switch ${size}: default entry is original, playing, hero`, first.version === 'original' && first.playing && first.view === 'hero', { v: first.version, p: first.playing });
    // 播放中连采 12 次：原版每次都穿模
    let allBad = true; const seenCounts = new Set();
    for (let i = 0; i < 12; i++) { const s = await state(page); if (!s.penetration.penetrating) allBad = false; seenCounts.add(s.penetration.count); await page.waitForTimeout(90); }
    check(`switch ${size}: original penetrates in every one of 12 live samples, and the count changes as the gears turn`, allBad && seenCounts.size > 1, { distinct: seenCounts.size });
    await page.click('#ver button[data-version=repaired]');
    await page.waitForTimeout(250);
    let s = await state(page), d = await domInfo(page);
    await page.screenshot({ path: path.join(out, `switch-${size}-repaired.png`) });
    let zero = true; for (let i = 0; i < 12; i++) { const x = await state(page); if (x.penetration.count !== 0) zero = false; await page.waitForTimeout(90); }
    check(`switch ${size}: clicking 返修后 switches version, URL, buttons, chip; zero penetration in 12 live samples`, s.version === 'repaired' && d.pressedVersion === 'repaired' && d.bodyVersion === 'repaired' && d.chip.includes('返修后') && page.url().includes('version=repaired') && zero, { v: s.version, chip: d.chip, url: page.url().replace(/^https?:\/\/[^/]+/, '') });
    await page.click('#ver button[data-version=original]');
    await page.waitForTimeout(250);
    s = await state(page);
    check(`switch ${size}: and back to 原版 penetrates again`, s.version === 'original' && s.penetration.count > 0, s.penetration);
    // 标红开关
    await page.click('#b-hl'); await page.waitForTimeout(150);
    const off = await state(page);
    await page.click('#b-hl'); await page.waitForTimeout(150);
    const on = await state(page);
    check(`switch ${size}: 标红 off removes the red markers but the count stays (it is a display switch)`, off.markers === 0 && !off.highlight && off.penetration.count > 0 && on.markers > 0 && on.highlight, { off: off.markers, on: on.markers });
    // 暂停 / 播放 / 慢放
    await page.click('#b-play'); await page.waitForTimeout(120);
    const p1 = await state(page); await page.waitForTimeout(400); const p2 = await state(page);
    check(`switch ${size}: 暂停 freezes time`, !p1.playing && p1.t === p2.t, { t1: p1.t, t2: p2.t });
    await page.click('#b-play'); await page.waitForTimeout(100);
    const n0 = await state(page); await page.waitForTimeout(1000); const n1 = await state(page);
    await page.click('#b-slow'); await page.waitForTimeout(100);
    const s0 = await state(page); await page.waitForTimeout(1000); const s1 = await state(page);
    const rN = n1.t - n0.t, rS = s1.t - s0.t;
    check(`switch ${size}: 慢放 runs at about 0.2× (measured ${(rS / rN).toFixed(2)}×)`, s1.slow && rN > 0.5 && rS / rN > 0.1 && rS / rN < 0.35, { normal: rN, slow: rS });
    await page.click('#b-slow');
    // 说明页
    await page.click('#b-info'); await page.waitForTimeout(150);
    const info = await page.evaluate(() => { const r = document.getElementById('info').getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, w: innerWidth, h: innerHeight, open: !document.getElementById('info').hidden, text: document.getElementById('info').innerText.length }; });
    await page.screenshot({ path: path.join(out, `info-${size}.png`) });
    const infoProbs = infoProblems(await infoRects(page));
    check(`switch ${size}: 说明 opens, fits inside the viewport and sits between the top and bottom bars`, info.open && info.x0 >= 0 && info.x1 <= info.w && info.y0 >= 0 && info.y1 <= info.h && info.text > 200 && infoProbs.length === 0, { info, infoProbs });
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    check(`switch ${size}: Esc closes 说明`, !(await state(page)).infoOpen);
    // 机位按钮
    await page.click('#views button[data-view=mesh]'); await page.waitForTimeout(1000);
    s = await state(page);
    const dist = Math.hypot(...s.camera.position.map((v, i) => v - s.camera.target[i]));
    check(`switch ${size}: A–B 特写 button flies the camera in (distance ${dist.toFixed(1)})`, s.view === 'mesh' && dist < 40 && page.url().includes('view=mesh'), { view: s.view, dist });
    check(`switch ${size}: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }

  // ================= 4. 横竖屏切换：转屏后整组重新构图 =================
  {
    const { ctx, page, errors } = await open('?view=hero', 'phone');
    check('rotate: portrait start is portrait', (await state(page)).portrait === true);
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(500);
    let s = await state(page), probs = layoutProblems(await page.evaluate(() => window.__gearRepair.probe()), 'hero');
    await page.screenshot({ path: path.join(out, 'rotate-to-landscape.png') });
    check('rotate: after turning to landscape the layout is recomposed and passes', !s.portrait && probs.length === 0, probs);
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
    s = await state(page); probs = layoutProblems(await page.evaluate(() => window.__gearRepair.probe()), 'hero');
    check('rotate: and back to portrait passes', s.portrait && probs.length === 0, probs);
    check('rotate: no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ================= 5. 正常入口的开局 30 秒（验收 10）：桌面和手机各录一遍，中间做玩家最先会做的几件事 =================
  for (const size of ['desktop', 'phone']) {
    const { ctx, page, errors, external } = await open('', size);
    const marks = [0.5, 2, 4, 6, 8, 10, 12, 14, 16, 20, 22, 24, 26, 30], frames = [];
    const actions = { 8: () => page.click('#views button[data-view=mesh]'), 14: () => page.click('#ver button[data-version=repaired]'), 22: () => page.click('#views button[data-view=hero]'), 23: async () => { const b = await page.$eval('canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.width / 2, y: r.height / 2 }; }); await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x + 90, b.y + 40, { steps: 6 }); await page.mouse.up(); } };
    const startAt = Date.now() - 300;       // open() 已经等了 300 ms
    for (const m of marks) {
      for (const [at, fn] of Object.entries(actions)) if (+at > (frames.length ? frames[frames.length - 1].at : 0) && +at <= m && !actions[at].done) { actions[at].done = true; const w = startAt + +at * 1000 - Date.now(); if (w > 0) await page.waitForTimeout(w); await fn(); }
      const wait = startAt + m * 1000 - Date.now(); if (wait > 0) await page.waitForTimeout(wait);
      const st = await state(page), dom = await domInfo(page);
      await page.screenshot({ path: path.join(out, `open-${size}-${String(m).padStart(4, '0')}s.png`) });
      const dist = Math.hypot(...st.camera.position.map((v, i) => v - st.camera.target[i]));
      const dirv = st.camera.position.map((v, i) => (v - st.camera.target[i]) / dist);
      frames.push({ at: m, t: +st.t.toFixed(2), playing: st.playing, version: st.version, view: st.view, count: st.penetration.count, angleA: +st.angles.A.toFixed(2), dist: +dist.toFixed(1), dir: dirv, userMoved: st.userMoved, chip: dom.chip });
    }
    const stats = await page.evaluate(() => window.__gearRepair.drawStats());
    // 帧率：数 3 秒内的 requestAnimationFrame
    const fps = await page.evaluate(() => new Promise((res) => { const ts = []; const f = (t) => { ts.push(t); if (t - ts[0] < 3000) requestAnimationFrame(f); else { const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b); res({ fps: 1000 / d[d.length >> 1], p95ms: d[Math.floor(d.length * 0.95)] }); } }; requestAnimationFrame(f); }));
    report.runs.push({ size, opening: frames, drawStats: stats, fps });
    const at = (m) => frames.find((f) => f.at === m);
    check(`${size} opening: plays on its own from the plain URL (original, hero) and time moves forward`, frames[0].playing && frames[0].version === 'original' && frames[0].view === 'hero' && at(30).t > at(2).t + 20, { t2: at(2).t, t30: at(30).t });
    check(`${size} opening: within 2 s the chip carries the 60-frame result and the live count is > 0`, at(2).count > 0 && at(2).chip.includes('60 帧穿模'), at(2));
    check(`${size} opening: the gears actually turn (A moves > 0.5 rad between 2 s and 4 s)`, Math.abs(at(4).angleA - at(2).angleA) > 0.5, { a2: at(2).angleA, a4: at(4).angleA });
    check(`${size} opening: tapping A–B 特写 at 8 s brings the camera close by 10 s`, at(10).view === 'mesh' && at(10).dist < at(6).dist * 0.5, { far: at(6).dist, near: at(10).dist });
    check(`${size} opening: tapping 返修后 at 14 s gives zero penetration at 16 s and 20 s`, at(16).version === 'repaired' && at(16).count === 0 && at(20).count === 0, { c16: at(16).count, c20: at(20).count });
    const cosA = at(26).dir.reduce((a, v, i) => a + v * at(6).dir[i], 0), turned = Math.acos(Math.min(1, cosA)) * 180 / Math.PI;
    check(`${size} opening: back to 全景 at 22 s, then dragging at 23 s orbits the camera (turned ${turned.toFixed(1)}° away from the preset direction, userMoved)`, at(26).view === 'hero' && at(26).dist > at(10).dist * 1.5 && at(26).userMoved && !at(6).userMoved && turned > 3, { d10: at(10).dist, d26: at(26).dist, turned });
    check(`${size} opening: no page errors, no external requests`, errors.length === 0 && external.length === 0, { errors, external });
    check(`${size}: detection per frame (both pairs) median < 2 ms, P95 < 5 ms`, stats.detect.median < 2 && stats.detect.p95 < 5, stats.detect);
    check(`${size}: JS time per frame median < 6 ms`, stats.frame.median < 6, stats.frame);
    if (size === 'desktop') check('desktop: ≥ 45 fps measured over 3 s (headless Chrome)', fps.fps >= 45, fps);
    else check('phone size: rendering loop keeps ≥ 24 fps in headless Chrome on this machine (not a real phone)', fps.fps >= 24, fps);
    await ctx.close();
  }

  // ================= 6. 没有 WebGL 时给一句说明，不留白屏 =================
  {
    const nogl = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-webgl', '--disable-3d-apis', '--disable-gpu'] });
    const page = await nogl.newPage({ viewport: { width: 390, height: 844 } });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(base); await page.waitForTimeout(1500);
    const msg = await page.evaluate(() => { const e = document.getElementById('nogl'); return e ? e.textContent : null; });
    await page.screenshot({ path: path.join(out, 'no-webgl.png') });
    check('no WebGL: a plain message is shown instead of a blank page, the only error is the WebGL one', !!msg && msg.includes('WebGL') && errs.length === 1 && /WebGL/i.test(errs[0]), { msg, errs });
    await nogl.close();
  }

  report.requests = [...seen].sort();
  check('all requests were this page\'s own files', report.requests.every((p) => /^\/(index\.html|src\/[\w-]+\.js|vendor\/[\w.-]+|favicon\.ico)?$/.test(p) || p === '/'), report.requests);
  await browser.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(failed ? `${failed} check(s) failed of ${report.checks.length}` : `all ${report.checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
