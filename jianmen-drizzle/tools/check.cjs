// 浏览器验收（SPEC.md 第 7 节第 6–10 条）：真实 Chrome + GPU 截图，像素读数在页面里算。
//   node tools/build.mjs && (cd dist && python3 -m http.server 8871 --bind 127.0.0.1) &
//   NODE_PATH="$(npm root -g)" node tools/check.cjs http://127.0.0.1:8871/ out/
// 只报数和截图，不改任何东西；阈值见 SPEC.md。
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const [base, outdir = 'out'] = process.argv.slice(2);
if (!base) { console.error('usage: check.cjs <base-url> [outdir]'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });
const CLEAN = 'still=1&hud=0&rain=0';
const results = [];
const record = (name, value, pass, note = '') => { results.push({ name, value, pass, note }); console.log(`${pass === null ? '  ·' : pass ? 'PASS' : 'FAIL'}  ${name}: ${value}${note ? '  (' + note + ')' : ''}`); };

async function open(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, deviceScaleFactor: opts.dpr || 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  const page = await ctx.newPage(); const errors = []; let bytes = 0;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', async (r) => { try { const b = await r.body(); bytes += b.length; } catch {} });
  await page.goto(base + url);
  await page.waitForFunction(() => window.__jianmen && (window.__jianmen.ready || window.__jianmen.error), null, { polling: 250, timeout: 120000 });
  const err = await page.evaluate(() => window.__jianmen.error);
  if (err) throw new Error(err);
  return { ctx, page, errors, bytes: () => bytes };
}
const settle = (page, ms = 1500) => page.waitForTimeout(ms);

// Pixel metrics, computed in a scratch page from the PNG bytes.
async function metrics(browser, png, kind, arg) {
  const p = await browser.newPage();
  const r = await p.evaluate(async ([b64, kind, arg]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0); const W = c.width, H = c.height;
    const lumAt = (d, i) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    if (kind === 'dark') {                     // share of ink-dark pixels in the centre box (arg = box fraction)
      const bw = Math.round(W * arg), bh = Math.round(H * arg), d = x.getImageData((W - bw) >> 1, (H - bh) >> 1, bw, bh).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (lumAt(d, i) < 0.25) n++; return n / (bw * bh);
    }
    if (kind === 'seam') {                     // ?view=back puts the seam on the centre column: peak adjacent-column difference there / median over the frame
      const d = x.getImageData(0, 0, W, H).data, col = new Float64Array(W - 1);
      for (let xx = 0; xx < W - 1; xx++) { let s = 0; for (let y = 0; y < H; y += 2) { const i = (y * W + xx) * 4; s += Math.abs(lumAt(d, i) - lumAt(d, i + 4)); } col[xx] = s / (H / 2); }
      const sorted = [...col].sort((a, b) => a - b), med = sorted[sorted.length >> 1];
      let peak = 0, at = 0; for (let xx = (W >> 1) - 8; xx <= (W >> 1) + 8; xx++) if (col[xx] > peak) { peak = col[xx]; at = xx; }
      // a hard cut is one column standing out from its neighbours; texture (rock, water streaks) is spread out
      let nb = 0, nn = 0; for (let k = 3; k <= 12; k++) for (const xx of [at - k, at + k]) if (xx >= 0 && xx < W - 1) { nb += col[xx]; nn++; }
      return { ratio: peak / med, spike: peak / (nb / nn), at };
    }
    return null;
  }, [png.toString('base64'), kind, arg]);
  await p.close(); return r;
}
async function diffRatio(browser, a, b) {
  const p = await browser.newPage();
  const r = await p.evaluate(async ([A, B]) => {
    const load = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const da = await load(A), db = await load(B); let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) n++;
    return n / (da.length / 4);
  }, [a.toString('base64'), b.toString('base64')]);
  await p.close(); return r;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const shot = async (page, name) => { const b = await page.screenshot({ path: path.join(outdir, name + '.png') }); return b; };
  try {
    // 9. default entry: errors, bytes; 8. motion after entering
    {
      const { ctx, page, errors, bytes } = await open(browser, '');
      await shot(page, 'intro');
      await page.click('#enter'); await settle(page, 5200);
      const a = await shot(page, 'default-a'); await page.waitForTimeout(400); const b = await shot(page, 'default-b');
      const info = await page.evaluate(() => window.__jianmen.info());
      record('首屏下载量 MB', (bytes() / 1048576).toFixed(1), bytes() <= 15 * 1048576, '≤ 15');
      record('默认入口两帧差（雨 + 云）', (await diffRatio(browser, a, b) * 100).toFixed(2) + '%', (await diffRatio(browser, a, b)) > 0.01, '> 1%');
      record('默认档像素比 / 画布', `${info.pixelRatio} / ${info.size.join('×')}`, null);
      record('默认入口报错', errors.length, errors.length === 0, errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    // 8b. mist alone (no rain): still moving?
    {
      const { ctx, page } = await open(browser, '?view=hero&hud=0&rain=0'); await settle(page, 1500);
      const a = await shot(page, 'mist-a'); await page.waitForTimeout(1500); const b = await shot(page, 'mist-b');
      record('只看云雾（关雨）1.5 s 两帧差', (await diffRatio(browser, a, b) * 100).toFixed(2) + '%', null, '参考值');
      await ctx.close();
    }
    // 6. gate really in the gate direction (hero as the counter-example)
    for (const v of ['gate', 'hero']) {
      const { ctx, page, errors } = await open(browser, `?view=${v}&${CLEAN}`); await settle(page);
      const png = await shot(page, `view-${v}`); const d = await metrics(browser, png, 'dark', 0.12);
      record(`?view=${v} 中心方框深墨占比`, (d * 100).toFixed(2) + '%', v === 'gate' ? d >= 0.03 : null, v === 'gate' ? '≥ 3%' : '反例，应明显低于 gate');
      if (errors.length) record(`?view=${v} 报错`, errors.length, false, errors[0]);
      await ctx.close();
    }
    // 7. seam veiled (seam=off is the known-bad calibration)
    const seam = {};
    for (const s of ['on', 'off']) {
      const { ctx, page } = await open(browser, `?view=back&${CLEAN}${s === 'off' ? '&seam=off' : ''}`); await settle(page);
      const png = await shot(page, `back-seam-${s}`); seam[s] = await metrics(browser, png, 'seam');
      await ctx.close();
    }
    // 判定用「正中列差 / 全图中位数」。「突出邻列」2026-10-23 校准时坏例只有 1.89 倍，分不清有缝没缝，只作参考。
    record('接缝断口（关遮挡，已知坏例）', `全图中位数的 ${seam.off.ratio.toFixed(2)} 倍（突出邻列 ${seam.off.spike.toFixed(2)} 倍）@x=${seam.off.at}`, seam.off.ratio >= 2, '坏例应 ≥ 2，否则这条检查测不出接缝');
    record('接缝断口（开遮挡）', `全图中位数的 ${seam.on.ratio.toFixed(2)} 倍（突出邻列 ${seam.on.spike.toFixed(2)} 倍）@x=${seam.on.at}`, seam.on.ratio < 1.0, '< 1.0');
    // 10. fps
    {
      const { ctx, page } = await open(browser, '?view=hero', { viewport: { width: 1920, height: 1080 } }); await settle(page, 9000);
      const info = await page.evaluate(() => window.__jianmen.info());
      record('桌面帧率中位数（1920×1080，?view=hero）', info.fps, info.fps >= 55, '≥ 55');
      await ctx.close();
    }
    // 1 (in the browser). autopilot to the outro
    {
      const { ctx, page, errors } = await open(browser, '?auto=1');
      await page.waitForFunction(() => window.__jianmen.info().outro, null, { polling: 500, timeout: 150000 });
      await settle(page, 2200); await shot(page, 'auto-outro');
      const info = await page.evaluate(() => window.__jianmen.info());
      record('自动驾驶走到结尾', info.found.join(' → '), info.found.length === 4 && info.outro);
      if (errors.length) record('自动驾驶报错', errors.length, false, errors[0]);
      await ctx.close();
    }
    // phone portrait layout (default entry)
    {
      const { ctx, page, errors, bytes } = await open(browser, '', { viewport: { width: 390, height: 844 }, dpr: 3, mobile: true });
      await shot(page, 'phone-intro'); await page.tap('#enter'); await settle(page, 5200); await shot(page, 'phone-play');
      const info = await page.evaluate(() => window.__jianmen.info());
      const hud = await page.evaluate(() => {
        const c = document.getElementById('compass').getBoundingClientRect();
        const marks = [...document.querySelectorAll('#compass .mk')].map((m) => m.getBoundingClientRect());
        return { ghost: document.querySelectorAll('#jian .ch').length, inked: document.querySelectorAll('#jian .ch.on').length,
          marks: marks.length, inside: marks.every((r) => r.left >= c.left - 1 && r.right <= c.right + 1 && r.width > 0), vw: innerWidth };
      });
      record('手机竖屏：诗笺描红字 / 方位标记', `${hud.ghost} 个字（已上墨 ${hud.inked}）/ ${hud.marks} 个标记${hud.inside ? '，都在条内' : '，有标记出了条'}`, hud.ghost === 28 && hud.marks === 4 && hud.inside, '28 / 4，都在条内');
      record('手机竖屏像素比 / 画布 / 场景', `${info.pixelRatio} / ${info.size.join('×')} / ${info.scene}`, info.scene.endsWith('scene-lite.sog'), '触屏应自动用轻量场景');
      record('手机首屏下载量 MB', (bytes() / 1048576).toFixed(1), bytes() <= 8 * 1048576, '≤ 8');
      record('手机竖屏报错', errors.length, errors.length === 0, errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outdir, 'results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.pass === false);
  console.log(failed.length ? `\n${failed.length} 条没过` : '\n全部判定条目通过');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
