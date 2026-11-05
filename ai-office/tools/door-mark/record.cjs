// 门标透明帧：node record.cjs <输出目录>（默认 ./frames），1080×1920，24fps，2.3 秒；只录 ?m=b（像素门开缝煤球探头，11-06 Alice 定）
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => { const out = path.resolve(process.argv[2] || 'frames'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('file://' + path.join(__dirname, 'door-mark.html') + '?m=b'); await p.waitForFunction('window.__ready');
  for (let i = 0; i < Math.round(2.3 * 24); i++) { await p.evaluate(t => __seek(t), i / 24);
    await p.locator('canvas').screenshot({ path: `${out}/${String(i).padStart(4, '0')}.png`, omitBackground: true }); }
  await b.close(); })();
