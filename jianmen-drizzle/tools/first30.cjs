// 开局 30 秒录屏（AGENTS.md 第 3 节）：正常入口进，点「入画」，然后做玩家最先会做的事：向右拖、向左拖、向上拖、滚轮拉近。
//   NODE_PATH="$(npm root -g)" node tools/first30.cjs http://127.0.0.1:8871/ out/
// 输出 out/first30.webm 和每次操作前后的朝向，用来核对「向右拖 = 画面跟着手往右走 = 视线往左转」。
const { chromium } = require('playwright');
const fs = require('node:fs');
(async () => {
  const [base, outdir = 'out'] = process.argv.slice(2); fs.mkdirSync(outdir, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: outdir, size: { width: 1280, height: 800 } } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const t0 = Date.now(), log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} s  ${s}`);
  await p.goto(base); await p.waitForFunction(() => window.__jianmen.ready, null, { polling: 250, timeout: 90000 });
  const look = async () => { const l = (await p.evaluate(() => window.__jianmen.info())).look; return `yaw ${l.yaw.toFixed(1)}  pitch ${l.pitch.toFixed(1)}  fov ${l.fov.toFixed(1)}`; };
  log('ready, click 入画'); await p.click('#enter'); await p.waitForTimeout(4000); log('after intro: ' + await look());
  const drag = async (dx, dy, steps = 30) => { await p.mouse.move(640, 400); await p.mouse.down(); for (let i = 1; i <= steps; i++) { await p.mouse.move(640 + dx * i / steps, 400 + dy * i / steps); await p.waitForTimeout(25); } await p.mouse.up(); await p.waitForTimeout(700); };
  await drag(300, 0); log('drag right 300px: ' + await look());
  await drag(-600, 0); log('drag left 600px: ' + await look());
  await drag(0, 250); log('drag down 250px: ' + await look());
  await p.mouse.move(640, 400); for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(80); } await p.waitForTimeout(900); log('wheel in: ' + await look());
  await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(1200); await p.keyboard.up('ArrowLeft'); await p.waitForTimeout(500); log('ArrowLeft 1.2 s: ' + await look());
  const left = 30000 - (Date.now() - t0); if (left > 0) await p.waitForTimeout(left);
  log('info ' + JSON.stringify(await p.evaluate(() => window.__jianmen.info())) + ' errors ' + JSON.stringify(errs));
  await ctx.close(); await b.close();
  const v = fs.readdirSync(outdir).filter((f) => f.endsWith('.webm')).map((f) => ({ f, t: fs.statSync(`${outdir}/${f}`).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  if (v) { fs.renameSync(`${outdir}/${v.f}`, `${outdir}/first30.webm`); console.log('video', `${outdir}/first30.webm`); }
})();
