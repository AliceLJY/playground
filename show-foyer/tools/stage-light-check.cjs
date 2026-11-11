// 点灯要让整台亮起来：幕布区域平均亮度随台前灯数单调上升（0 < 1 < 3 < 5 盏），且换灯数有过渡、不是一下跳满。
//   NODE_PATH="$(npm root -g)" node tools/stage-light-check.cjs <page-url> <out-dir>
// 采样：固定机位 ?view=first&t=6（种子 11，没有回放、灯数从 0 起），真实 act(0) 落座、act(1) 点灯，
// 用页面自己的 step() 推进 3 秒让过渡走完再读画布像素。区域 = 幕布内 x 10%–90%、y 20%–95%（相对幕布高 0.72×台高），
// 亮度 = sRGB 的 0.2126R + 0.7152G + 0.0722B 均值（0–255）。阈值取自 SPEC「点灯」条：每档至少 +3，5 盏比 0 盏至少 +25。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('用法：node tools/stage-light-check.cjs <page-url> <out-dir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const STEP_MIN = 3, SPAN_MIN = 25;
(async () => {
  const b = await chromium.launch();
  let fail = 0;
  for (const [tag, w, h, dpr, touch] of [['desktop-1440x810', 1440, 810, 1, false], ['iphone-390x664', 390, 664, 2, true]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch });
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const u = new URL(url); u.searchParams.set('view', 'first'); u.searchParams.set('t', '6'); u.searchParams.set('mute', '1');
    await p.goto(u.href);
    await p.waitForFunction(() => window.__foyer && window.__foyer.ready, null, { polling: 100 });
    const lum = () => p.evaluate(() => {
      const cv = document.getElementById('scene'), r = cv.getBoundingClientRect(), k = cv.width / r.width;
      const stageH = r.height < 330 ? r.height * 0.3 : Math.min(r.height * 0.36, 230), ch = stageH * 0.72;
      const x0 = Math.round(r.width * 0.1 * k), x1 = Math.round(r.width * 0.9 * k), y0 = Math.round(ch * 0.2 * k), y1 = Math.round(ch * 0.95 * k);
      const d = cv.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data; let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return Math.round(s / (d.length / 4) * 10) / 10;
    });
    await p.evaluate(() => { __foyer.act(0); __foyer.step(3000); });
    const read = {}; let mid = null, before1 = null;
    for (const n of [0, 1, 3, 5]) {
      const have = await p.evaluate(() => __foyer.snapshot().lamps);
      for (let i = have; i < n; i++) {
        if (n === 1) before1 = await lum();
        await p.evaluate(() => { __foyer.act(1); __foyer.step(120); });
        if (n === 1) mid = await lum();
      }
      await p.evaluate(() => __foyer.step(3000));
      const s = await p.evaluate(() => __foyer.snapshot());
      if (s.lamps !== n) { errors.push(`lamps=${s.lamps}, expected ${n}`); }
      read[n] = await lum();
      await p.screenshot({ path: path.join(out, `${tag}-lamps${n}.png`) });
    }
    const checks = {
      monotonic: read[0] < read[1] && read[1] < read[3] && read[3] < read[5],
      eachStepVisible: read[1] - read[0] >= STEP_MIN && read[3] - read[1] >= STEP_MIN && read[5] - read[3] >= STEP_MIN,
      spanVisible: read[5] - read[0] >= SPAN_MIN,
      // 过渡：点第一盏后 120 ms，亮度已经开始上升，但还没到稳态
      transition: mid !== null && mid > before1 && mid < read[1],
      noPageErrors: errors.length === 0,
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (bad.length) fail++;
    console.log(`${bad.length ? 'FAIL' : 'ok  '} ${tag}  亮度 0/1/3/5 盏 = ${read[0]} / ${read[1]} / ${read[3]} / ${read[5]}  过渡 ${before1}→${mid}→${read[1]}${bad.length ? '  ← ' + bad.join(', ') : ''}${errors.length ? '  errors: ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  await b.close();
  console.log(fail ? `stage-light-check: ${fail} 个视口失败` : 'stage-light-check: 2/2 视口通过');
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
