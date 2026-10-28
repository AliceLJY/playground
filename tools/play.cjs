// 通用试玩：用真实浏览器和真实按键把一串玩家操作跑一遍，每拍一张图就记一份游戏状态、空白画面粗判和页面报错。
// 钩子约定见 AGENTS.md 第 3 节：新玩意挂 window.__PLAYTEST__ = { ready, snapshot(), reset(), setSeed(n), step(ms) }，都可选；
// 旧玩意用 --hook __qilou 这类旧名字，有 ready / snapshot 就用，没有就只拍图。
// 借鉴 WhiteTowerAI/ohmygame 的 game_use（Apache-2.0，只借约定与空白判据，代码自写）。
//
//   NODE_PATH="$(npm root -g)" node tools/play.cjs <url> <out-dir> '<动作 JSON 数组>' [--hook __名字] [--viewport 960x600]
//
// 动作（一次给一串，按顺序执行）：
//   {"click":"#start"}  {"click":[x,y]}       点选择器或画面坐标
//   {"press":"Space"}   {"press":"KeyW","hold":1400,"shots":[300,700,1400]}  按住若干毫秒，按住期间按时间点拍图
//   {"down":"KeyW"}  {"up":"KeyW"}  {"wait":500}
//   {"shot":"名字"}                            拍图 + 记状态
//   {"bridge":"reset"}  {"bridge":"setSeed","value":3}  {"bridge":"step","value":500}
// 输出：<out-dir>/<序号>-<名字>.png 和 report.json；画面疑似空白或页面报错时退出码 1。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const hook = opt('--hook', '__PLAYTEST__');
const [vw, vh] = opt('--viewport', '960x600').split('x').map(Number);
const [url, out, script] = args;
if (!url || !out || !script) { console.error('用法见文件头注释'); process.exit(2); }
const actions = JSON.parse(script);
fs.mkdirSync(out, { recursive: true });

// 抽样约 1 万个像素算亮度方差；方差 < 1 或几乎全透明判疑似空白。纯色加载页也会被判空白、花屏也可能过关，只当警告。
const BLANK = `async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, n = d.length / 4, stride = Math.max(1, Math.floor(n / 10000));
  let k = 0, opaque = 0, sum = 0, sq = 0;
  for (let i = 0; i < n; i += stride) { const o = i * 4, l = 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]; k++; if (d[o + 3] > 8) opaque++; sum += l; sq += l * l; }
  const mean = sum / k, variance = Math.max(0, sq / k - mean * mean);
  return { mean: +mean.toFixed(1), variance: +variance.toFixed(1), likelyBlank: opaque / k < 0.01 || variance < 1 };
}`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: vw, height: vh } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url().split('?')[0]));

  const report = { url: url.split('?')[0], hook, viewport: `${vw}x${vh}`, shots: [], errors };
  await page.goto(url);
  const hasHook = await page.waitForFunction((h) => window[h] && (window[h].ready === undefined || window[h].ready || window[h].error), hook, { polling: 200, timeout: 90000 })
    .then(() => true, () => false);
  report.hookFound = hasHook;
  report.bridge = hasHook ? await page.evaluate((h) => ['snapshot', 'reset', 'setSeed', 'step'].filter((m) => typeof window[h][m] === 'function'), hook) : [];

  let n = 0;
  const shot = async (name) => {
    const file = `${String(++n).padStart(2, '0')}-${name}.png`;
    const buf = await page.screenshot({ path: path.join(out, file) });
    const frame = await page.evaluate(`(${BLANK})(${JSON.stringify(buf.toString('base64'))})`);
    const state = report.bridge.includes('snapshot')
      ? await page.evaluate((h) => { try { return JSON.parse(JSON.stringify(window[h].snapshot())); } catch (e) { return { snapshotError: String(e) }; } }, hook)
      : undefined;
    report.shots.push({ file, ...frame, ...(state !== undefined ? { state } : {}) });
  };

  for (const a of actions) {
    if (a.click !== undefined) {
      if (Array.isArray(a.click)) await page.mouse.click(a.click[0], a.click[1]); else await page.click(a.click);
      await page.waitForTimeout(100);
    } else if (a.press !== undefined) {
      const hold = a.hold || 0;
      if (!hold) { await page.keyboard.press(a.press); await page.waitForTimeout(100); continue; }
      await page.keyboard.down(a.press);
      let t = 0;
      for (const at of (a.shots || []).filter((s) => s <= hold).sort((x, y) => x - y)) { await page.waitForTimeout(at - t); t = at; await shot(`${a.press}-${at}ms`); }
      await page.waitForTimeout(hold - t);
      await page.keyboard.up(a.press);
    } else if (a.down !== undefined) await page.keyboard.down(a.down);
    else if (a.up !== undefined) await page.keyboard.up(a.up);
    else if (a.wait !== undefined) await page.waitForTimeout(a.wait);
    else if (a.shot !== undefined) await shot(a.shot);
    else if (a.bridge !== undefined) {
      if (!report.bridge.includes(a.bridge)) throw new Error(`钩子 ${hook} 没有 ${a.bridge}()`);
      await page.evaluate(([h, m, v]) => window[h][m](v), [hook, a.bridge, a.value]);
      await page.waitForTimeout(50);
    } else throw new Error('不认识的动作：' + JSON.stringify(a));
  }

  await browser.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  const blank = report.shots.filter((s) => s.likelyBlank).map((s) => s.file);
  console.log(JSON.stringify({ hookFound: report.hookFound, bridge: report.bridge, shots: report.shots.length, blank, errors: errors.slice(0, 8) }, null, 1));
  console.log(`截图和 report.json 在 ${out}，拍完要打开图逐张看：这个脚本只负责把玩家操作跑出来，画面对不对得靠读图判断`);
  process.exit(blank.length || errors.length ? 1 : 0);
})();
