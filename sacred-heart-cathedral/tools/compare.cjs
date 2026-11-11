// 与实拍同视角的五组对照。用法：NODE_PATH="$(npm root -g)" node tools/compare.cjs <页面地址> <实拍目录> <输出目录>
// 每组：左边实拍、右边这里的截图，等高并排；最后再拼一张总表。
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
(async () => {
  const [base, refDir, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  // [编号-名字, 实拍文件, 视口宽, 视口高, 光, 机位, 看向]
  const jobs = [
    ['1-正立面', '正立面-dllu-2026.jpg', 620, 1100, 'noon', [0, 62, 330], [0, 27.5, 38], 13],
    ['2-侧面', '西侧面-TimWu-B.jpg', 1200, 800, 'evening', [-78, 34, -6], [-3, 17, 4]],
    ['3-中殿', '中殿-方人也-2023.jpg', 734, 1100, 'morning', [0, 1.62, 6.5], [0, 9.5, -34]],
    ['4-拱顶', '拱顶-veronicakkk.jpg', 1200, 900, 'morning', [-8.6, 1.62, 15.5], [-1.5, 22, 8.5]],
    ['5-彩窗', '彩窗-veronicakkk.jpg', 825, 1100, 'morning', [-9.2, 1.62, 22.6], [-13.8, 6.2, 21.75]],
  ];
  const made = [];
  for (const [name, ref, vw, vh, light, pos, look, fov] of jobs) {
    const ctx = await browser.newContext({ viewport: { width: vw + 336, height: vh + 88 }, deviceScaleFactor: 1 }), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${base}?view=whole&light=${light}&still`); await page.waitForFunction(() => window.__sf && window.__sf.ready, null, { polling: 100, timeout: 30000 });
    await page.addStyleTag({ content: '#hero,#cap,#hint{display:none!important}' });
    await page.evaluate(([p, l, li, f]) => { if (f) window.__sf.world.city.visible = false; window.__sf.shot(p, l, f); window.__sf.setLight(li); }, [pos, look, light, fov]);   // 长焦那一组把院外的方盒楼藏起来，免得挡镜头 await page.waitForTimeout(2200);
    const mine = path.join(out, `我们-${name}.png`), pair = path.join(out, `对照-${name}.jpg`); await page.locator('#stage').screenshot({ path: mine });
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(refDir, ref), '-i', mine, '-filter_complex', '[0:v]scale=-2:900[a];[1:v]scale=-2:900[b];[a][b]hstack=inputs=2', '-q:v', '3', pair]);
    const s = await page.evaluate(() => window.__sf.snapshot()); console.log(name, s.zone, s.fps + 'fps', errs[0] || ''); made.push(pair); await ctx.close();
  }
  const args = ['-loglevel', 'error', '-y']; made.forEach(f => args.push('-i', f));
  execFileSync('ffmpeg', [...args, '-filter_complex', made.map((_, i) => `[${i}:v]scale=-2:520[v${i}]`).join(';') + ';' + made.map((_, i) => `[v${i}]`).join('') + `hstack=inputs=${made.length}`, '-q:v', '3', path.join(out, '对照-五组总表.jpg')]);
  await browser.close();
})();
