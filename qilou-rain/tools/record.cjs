// 竖屏演示片（给人看，不是验收）：标题 → 开局 → 自动驾驶真实打完一局（赶路的段落快进）→ 结算 → 署名页。
// 用法：NODE_PATH="$(npm root -g)" node tools/record.cjs <页面地址> <输出目录> <署名页模板目录> [种子]
//   署名页模板在作者本机 video-director 技能的 references/signature-endcard。
//   输出 frames/*.jpg 与 events.json；再用 tools/demo-sound.py 合成声音、ffmpeg 合成（命令见 demo-sound.py 文件头）。
// 录法：page.clock 接管页面时钟，每帧推进 1/30 秒再按设备像素截图；CSS 过渡不跟页面时钟，录片时全关。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [url, outDir, endDir, seedArg] = process.argv.slice(2), seed = seedArg || '3';
const FPS = 30, W = 540, H = 960, DPR = 2;
const frames = path.join(outDir, 'frames'); fs.mkdirSync(frames, { recursive: true });
let n = 0; const marks = [], now = () => n / FPS;
const mark = (name, extra) => marks.push({ name, t: +now().toFixed(3), ...extra });
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto(url + '?q=high&seed=' + seed);
  await page.clock.runFor(1500);
  await page.waitForFunction(() => window.__PLAYTEST__ && window.__PLAYTEST__.ready, null, { polling: 50 });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  await page.evaluate(() => {
    const st = document.createElement('style'); st.textContent = '*{transition:none!important;animation:none!important} .legend{display:none!important}'; document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'ff'; d.hidden = true; d.textContent = '▶▶ 赶路快进';
    d.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);padding:4px 14px;border-radius:999px;background:rgba(9,11,16,.8);color:#ffb020;font:700 14px "PingFang SC",sans-serif;z-index:9';
    document.body.appendChild(d); window.__evlog = [];
  });
  const shot = async () => {
    await page.clock.runFor(Math.round(1000 / FPS));
    await page.screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    const ev = await page.evaluate(() => { const e = window.__evlog.slice(); window.__evlog.length = 0; return e; });
    for (const [type, kind] of ev) mark(type, kind ? { kind } : undefined);
  };
  mark('section:title');
  for (let i = 0; i < FPS * 3.2; i++) await shot();
  await page.click('[data-act="start"]');
  await page.evaluate(() => window.__qilou.setAuto('precise'));
  mark('section:play');
  let fast = false, firing = false, guard = 0, fastFor = 0;
  for (;;) {
    const s = await page.evaluate(() => { const q = window.__qilou, s = q.sim, p = s.player; let near = 99; for (const e of s.enemies) if (!e.dead) near = Math.min(near, Math.hypot(e.x - p.x, e.z - p.z)); return { mode: q.app.mode, state: s.state, near, sealing: !!s.near, firing: p.firing, t: s.t }; });
    if (s.state !== 'play' || guard++ > FPS * 150) break;
    const want = s.t > 4 && (s.sealing ? s.near > 9 : s.near > 12);
    fastFor = want ? fastFor + 1 : 0;
    const f = fastFor > 8;
    if (f !== fast) { fast = f; await page.evaluate(v => { document.getElementById('ff').hidden = !v; }, fast); mark(fast ? 'ff-on' : 'ff-off'); }
    if (s.firing !== firing) { firing = s.firing; mark(firing ? 'spray-on' : 'spray-off'); }
    if (fast) await page.evaluate(() => window.__PLAYTEST__.step(100));
    await shot();
  }
  if (firing) mark('spray-off');
  await page.evaluate(() => { document.getElementById('ff').hidden = true; });
  const result = await page.evaluate(() => { const s = window.__qilou.sim; return { state: s.state, t: +s.t.toFixed(1), kills: s.stats.kills, damage: Math.round(s.stats.damage) }; });
  mark('section:end');
  for (let i = 0; i < FPS * 4; i++) await shot();
  await ctx.close();
  // ---- 署名页 ----
  const ed = path.join(outDir, 'endcard'); fs.mkdirSync(ed, { recursive: true });
  for (const f of ['endcard.html', 'endcard.js']) fs.copyFileSync(path.join(endDir, f), path.join(ed, f));
  fs.writeFileSync(path.join(ed, 'config.js'), `window.ENDCARD = {
  series: "playground 小游戏",
  title: "骑楼雨夜",
  accounts: ["公众号：我的AI小木屋", "微博 · 快手 · 全民K歌：安闲静雅"],
  notes: [
    ["玩法", "第一人称：远的用杀虫喷雾，贴脸用凉拖，盖回三个沙井盖再去渡口上船"],
    ["画面", "网页实机逐帧录制；街、雨、倒影、蟑螂全是代码生成，没有图片和模型，没用 AI 生图"],
    ["声音", "雨声、喷雾和配乐由代码按画面里的事件时间合成，没有采样素材"],
    ["试玩", "片中是自动玩家打的一整局，赶路的段落做了快进"],
    ["构思", "小试AI · 与 Claude Code 协作完成"],
  ],
};
`);
  const ectx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 }), ep = await ectx.newPage();
  await ep.goto('file://' + path.join(ed, 'endcard.html'));
  await ep.waitForFunction(() => window.__ready, null, { polling: 50 });
  const dur = await ep.evaluate(() => window.__duration());
  mark('section:outro');
  for (let i = 0; i < Math.round(dur * FPS); i++) { await ep.evaluate(t => window.__seek(t), i / FPS); await ep.locator('#c').screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify({ fps: FPS, frames: n, seconds: n / FPS, result, marks, errors }, null, 1));
  console.log(`${n} 帧，${(n / FPS).toFixed(1)} 秒；结果 ${JSON.stringify(result)}；页面报错 ${errors.length} 条`);
})().catch(e => { console.error(e); process.exit(1); });
