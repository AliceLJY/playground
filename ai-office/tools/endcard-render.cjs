// 把定版署名页（video-director/references/signature-endcard）按一份 config.js 渲成竖屏 mp4（无声）。
//   NODE_PATH="$(npm root -g)" node tools/endcard-render.cjs <config.js> <out.mp4>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { execFileSync } = require('node:child_process');
const [cfg, out] = process.argv.slice(2);
if (!cfg || !out) { console.error('usage: endcard-render.cjs <config.js> <out.mp4>'); process.exit(2); }
const tpl = path.join(os.homedir(), 'Downloads/sync-bridge/cc-skills/video-director/references/signature-endcard');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'endcard-')), frames = path.join(dir, 'frames'); fs.mkdirSync(frames);
for (const f of ['endcard.html', 'endcard.js']) fs.copyFileSync(path.join(tpl, f), path.join(dir, f));
fs.copyFileSync(cfg, path.join(dir, 'config.js'));
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const ep = await ctx.newPage(); await ep.goto('file://' + path.join(dir, 'endcard.html'));
  await ep.waitForFunction(() => window.__ready, null, { polling: 50 });
  const dur = await ep.evaluate(() => window.__duration());
  for (let i = 0; i < Math.round(dur * 30); i++) { await ep.evaluate(t => window.__seek(t), i / 30); await ep.locator('#c').screenshot({ path: path.join(frames, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); }
  await browser.close();
  execFileSync('ffmpeg', ['-nostdin', '-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(frames, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', out]);
  fs.rmSync(dir, { recursive: true, force: true }); console.log('wrote', out, dur.toFixed(2) + 's');
})();
