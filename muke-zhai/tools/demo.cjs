// 竖屏演示片（给人看，不是验收）：戏单引子 → 自动玩家（精准档）真实打完一整局 → 并肩亮相、结尾字幕 → 署名页。
// 用法：NODE_PATH="$(npm root -g)" node tools/demo.cjs <页面地址> <输出目录> <署名页模板目录> [种子=3]
//   署名页模板在作者本机 video-director 技能的 references/signature-endcard。
//   输出 frames/*.jpg 与 events.json；再用 tools/demo-sound.py 合成锣鼓、ffmpeg 合成（命令见 demo-sound.py 文件头）。
// 录法同 qilou-rain/tools/record.cjs：page.clock 接管页面时钟，每帧推进 1/30 秒再按设备像素截图；CSS 过渡不跟页面时钟，录片时全关。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [url, outDir, endDir, seedArg] = process.argv.slice(2), seed = seedArg || '3';
const FPS = 30, W = 540, H = 960, DPR = 2;
const frames = path.join(outDir, 'frames'); fs.mkdirSync(frames, { recursive: true });
let n = 0; const marks = [], now = () => n / FPS;
const mark = (name, extra) => marks.push({ name, t: +now().toFixed(3), ...extra });
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto(url + (url.includes('?') ? '&' : '?') + `story=1&tutorial=0&seed=${seed}&auto=precise`);
  for (let i = 0; i < 300; i++) { if (await page.evaluate(() => self.__PLAYTEST__ && self.__PLAYTEST__.ready)) break; await page.clock.runFor(100); await page.waitForTimeout(30); }
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  await page.evaluate(() => {
    const st = document.createElement('style'); st.textContent = '*{transition:none!important;animation:none!important}'; document.head.appendChild(st);
    self.__evlog = [];
  });
  const shot = async () => {
    await page.clock.runFor(1000 / FPS);
    await page.screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    const ev = await page.evaluate(() => { const e = self.__evlog.slice(); self.__evlog.length = 0; return e; });
    for (const e of ev) mark(e.type, { kind: e.kind, stage: e.stage, phase: e.phase });
  };
  // 引子：戏单三行，停 4 秒再点掉
  mark('section:intro');
  for (let i = 0; i < FPS * 4; i++) await shot();
  await page.mouse.click(W / 2, H / 2);
  mark('section:play');
  let stage = 1, phase = 'play', endSeen = null, guard = 0;
  for (;;) {
    await shot();
    const s = await page.evaluate(() => self.__PLAYTEST__.snapshot());
    if (s.stage !== stage) { stage = s.stage; mark('section:stage' + stage); }
    if (s.phase !== phase) { phase = s.phase; mark('phase:' + phase); }
    if (phase === 'end' && endSeen === null) endSeen = n;
    // 结尾第二行字幕在收场后约 6 秒出，留够它读完
    if (endSeen !== null && n - endSeen > FPS * 6.5) break;
    if (guard++ > FPS * 150) { console.error('超过 150 秒还没打完'); break; }
  }
  const result = await page.evaluate(() => { const s = self.__PLAYTEST__.snapshot(); return { stage: s.stage, phase: s.phase, qi: s.qi, meter: s.meter }; });
  await ctx.close();
  // ---- 署名页 ----
  const ed = path.join(outDir, 'endcard'); fs.mkdirSync(ed, { recursive: true });
  for (const f of ['endcard.html', 'endcard.js']) fs.copyFileSync(path.join(endDir, f), path.join(ed, f));
  fs.writeFileSync(path.join(ed, 'config.js'), `window.ENDCARD = {
  series: "playground 小游戏",
  title: "穆柯寨 · 不打不相识",
  accounts: ["公众号：我的AI小木屋", "微博 · 快手 · 全民K歌：安闲静雅"],
  notes: [
    ["玩法", "京剧《穆柯寨》一段的横版动作：先打掉孟良三顶金盔，再和杨宗保对枪，攒满心动收场"],
    ["画面", "网页实机逐帧录制；三位角色照京剧剧照定扮相，AI 生图后用 Grok 生成动作再抠成帧"],
    ["声音", "锣鼓由代码按画面里的事件时间合成，没有采样素材"],
    ["试玩", "片中是自动玩家打的一整局，没有剪辑"],
    ["构思", "小试AI · 与 Claude Code 协作完成"],
  ],
};
`);
  const ectx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 }), ep = await ectx.newPage();
  await ep.goto('file://' + path.join(ed, 'endcard.html'));
  await ep.waitForFunction(() => window.__ready, null, { polling: 50 });
  const dur = await ep.evaluate(() => window.__duration());
  mark('section:outro');
  for (let i = 0; i < Math.round(dur * FPS); i++) { await ep.evaluate((t) => window.__seek(t), i / FPS); await ep.locator('#c').screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify({ fps: FPS, seconds: n / FPS, result, marks }, null, 1));
  console.log(JSON.stringify({ frames: n, seconds: +(n / FPS).toFixed(2), result, errors: errors.slice(0, 5) }));
})();
