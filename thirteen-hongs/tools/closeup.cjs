// 贴近看人：每个对象拍一张脸（约 1 米）、一张腰胯、一张斜侧全身，再从侧面连拍 6 帧看动态。
// 全身机位看不出白鼻子和打滑，所以每改一次人物都跑这个，拍完逐张读图。
// 用法：NODE_PATH="$(npm root -g)" node tools/closeup.cjs <页面地址> <输出目录> [对象,对象…] [天色]
//   对象可以是跟随键（merchant、porter…），也可以写「kind:序号」（如 foreigner:0、coolie:5）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const base = process.argv[2], out = process.argv[3];
  const who = (process.argv[4] || 'merchant,porter,hawker,official,monk,foreigner:0,sailor:0,clerk:0,linguist:0,coolie:7,boatwoman:0').split(',');
  const tod = process.argv[5] || 'day';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--enable-features=WebGPU'] });
  const page = await (await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 })).newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?mute&capture&t=40&tod=${tod}`);
  await page.waitForFunction(() => window.__hong && window.__hong.ready, null, { polling: 100, timeout: 30000 });
  // 机位：相对这个人的朝向，ang 是绕到他哪一侧（0 正前，π/2 左侧），dist 是距离，cy 是相机高，ly 是看向的高度
  const aim = (key, ang, dist, cy, ly, fov = 40) => page.evaluate(([key, ang, dist, cy, ly, fov]) => {
    const H = window.__hong, w = H.where(key); if (!w) return null;
    const a = w.h + ang, gy = w.y - 1.5 * (w.scale || 1);
    H.free({ p: [w.x + Math.sin(a) * dist, gy + cy, w.z + Math.cos(a) * dist], l: [w.x, gy + ly, w.z], fov });
    return { kind: w.kind, pose: w.pose };
  }, [key, ang, dist, cy, ly, fov]);
  const report = [];
  for (const key of who) {
    const tag = key.replace(':', '');
    const shot = async (name, ...args) => { const r = await aim(key, ...args); if (!r) return null; await page.waitForTimeout(120); await aim(key, ...args); await page.waitForTimeout(60); await page.screenshot({ path: path.join(out, `${tag}-${name}.png`) }); return r; };
    const r = await shot('face', 0.25, 0.95, 1.58, 1.56, 30);
    if (!r) { console.log('没有这个对象', key); continue; }
    await shot('hip', 0.3, 1.5, 1.0, 0.9, 40);
    await shot('body', 0.6, 3.2, 1.45, 0.95, 40);
    await shot('back', Math.PI - 0.5, 2.6, 1.5, 1.05, 40);
    for (let i = 0; i < 6; i++) { await aim(key, Math.PI / 2, 3.0, 0.95, 0.9, 40); await page.waitForTimeout(110); await aim(key, Math.PI / 2, 3.0, 0.95, 0.9, 40); await page.waitForTimeout(30); await page.screenshot({ path: path.join(out, `${tag}-side${i}.png`) }); }
    report.push({ key, ...r }); console.log(key, r.kind || '', r.pose || '');
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ errors, report }, null, 1));
  if (errors.length) console.log('页面报错', errors.slice(0, 3));
  await browser.close();
})();
