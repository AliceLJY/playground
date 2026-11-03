// 竖屏演示片（给人看，不是验收）：标题 → 开局敲小尾巴 → 故意敲一次蓝牌、一次绿牌 → 中段快进 → 最后几秒 → 下班结算 → 署名页。
//
//   在 later-whack/ 里 python3 -m http.server 8963 --bind 127.0.0.1，然后
//   NODE_PATH="$(npm root -g)" node tools/record.cjs http://127.0.0.1:8963/index.html <输出目录> <署名页模板目录>
//   署名页模板：~/Downloads/sync-bridge/cc-skills/video-director/references/signature-endcard
//   产出：frames/*.jpg（1080×1920，30 帧）和 events.json（每次敲中、敲错、弹开、漏掉、剪辑点的成片时间），
//   再用 tools/demo-music.py 按 events.json 合成配乐，最后 ffmpeg 合成：
//     ffmpeg -i music-raw.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 music.wav
//     ffmpeg -framerate 30 -i frames/%05d.jpg -i music.wav -vf "scale=1080:1920:flags=lanczos,setsar=1" -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -b:a 192k -movflags +faststart 片子.mp4
//   （游戏帧截出来是 1080×1919，要缩放到 1920 高，不然 x264 拒绝奇数高度）
// 录法同 pixel-match/tools/record.cjs：page.clock 接管时钟，每帧推进 1/30 秒（快进时多推几倍）再按设备像素截图。
// 所有点按都是真实触摸；点哪个由脚本按当前画面挑（只敲刚冒头一会儿的小尾巴，像真人一样有反应时间）。
// 本游戏没有 CSS 过渡和动画，逐帧录制不会拍到过渡中间态。Math.random 换成带种子的，录出来每次一样。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [url, outDir, endDir] = process.argv.slice(2);
if (!url || !outDir || !endDir) { console.error('用法见文件头'); process.exit(2); }
const FPS = 30, W = 390, H = 694, DPR = 1080 / 390;
const frames = path.join(outDir, 'frames');
fs.mkdirSync(frames, { recursive: true }); for (const f of fs.readdirSync(frames)) fs.unlinkSync(path.join(frames, f));
let n = 0; const marks = [], sections = [];
const now = () => n / FPS;
const mark = (name, extra) => { marks.push({ name, t: +now().toFixed(3), ...extra }); };
const section = (kind) => { sections.push({ kind, t: +now().toFixed(3) }); mark('section:' + kind); console.log(kind, now().toFixed(2)); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 种子挑过：这一局第 6 秒冒观察型、第 7 秒无虑举蓝牌，开局就能演两条反着来的规则
  await page.addInitScript(() => { let a = 20261107; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await page.clock.install({ time: 0 });
  await page.goto(url);
  await page.waitForFunction(() => window.__later && window.__later.ready, null, { polling: 50 });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  // 快进角标：只在录片里加，不改游戏
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'ff'; d.hidden = true; d.textContent = '▶▶ 快进 ×4';
    d.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);padding:4px 12px;border-radius:999px;background:#253334e6;color:#ffd75a;font:700 15px "PingFang SC",sans-serif;pointer-events:none';
    document.body.appendChild(d); });
  const probe = () => page.evaluate(() => window.__later.probe());
  const shot = async (mult = 1) => {
    await page.clock.runFor(Math.round((1000 / FPS) * mult));
    await page.screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: 1920 / DPR } });
  };
  const hold = async (sec, mult = 1) => { for (let i = 0; i < Math.round(sec * FPS); i++) await shot(mult); };

  section('title'); await hold(2.4);
  const b = await page.locator('#start').boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); mark('start');
  section('play');
  const seen = new Map(); let lastTap = -9, wrongDone = false, bounceDone = false, prev = null, mult = 1, ffOn = false, ffOff = false;
  for (let i = 0; i < FPS * 80; i++) {
    const p = await probe();
    if (p.screen !== 'play') break;
    const s = p.state;
    // 两条反着来的规则都演过再快进
    if (!ffOn && (s.t >= 22 || (wrongDone && bounceDone && s.t >= 9))) { ffOn = true; mult = 4; section('ff'); await page.evaluate(() => { document.getElementById('ff').hidden = false; }); }
    if (ffOn && !ffOff && s.t >= 51) { ffOff = true; mult = 1; section('finale'); await page.evaluate(() => { document.getElementById('ff').hidden = true; }); }
    if (prev) {
      const d = k => s.stats[k] - prev.stats[k];
      for (let k = 0; k < d('fixed'); k++) mark('hit', { combo: s.combo, mult: ffOn && !ffOff ? 4 : 1 });
      if (d('wrong')) mark('wrong'); if (d('bounced')) mark('bounce'); if (d('missed')) mark('miss'); if (d('cleared')) mark('cleared');
    }
    prev = s;
    for (const e of s.ents) if (e.state === 'up' && !seen.has(e.id)) seen.set(e.id, s.t);
    const age = e => s.t - seen.get(e.id);
    if (s.t >= s.lockUntil && s.t - lastTap >= 0.24) {
      let target = null;
      const up = s.ents.filter(e => e.state === 'up');
      // 演示两条反着来的规则：第一个蓝牌、第一个绿牌各故意敲一下
      if (!wrongDone && !ffOn) target = up.find(e => e.kind === 'wait' && age(e) > 0.6);
      if (!target && !bounceDone && !ffOn) target = up.find(e => e.kind === 'observer' && age(e) > 0.6);
      if (target) { if (target.kind === 'wait') wrongDone = true; else bounceDone = true; }
      else target = up.filter(e => e.kind === 'tail' && age(e) > 0.32).sort((a, c) => seen.get(a.id) - seen.get(c.id))[0];
      if (target) { await page.touchscreen.tap(target.tapX, target.tapY); lastTap = s.t; }
    }
    await shot(mult);
  }
  section('result'); mark('result', { reason: (await probe()).state.result.reason });
  await hold(3.2);
  const final = (await probe()).state.result;
  await ctx.close();

  // ---- 署名页：模板单独渲染，逐帧接在片尾 ----
  const ed = path.join(outDir, 'endcard'); fs.mkdirSync(ed, { recursive: true });
  for (const f of ['endcard.html', 'endcard.js']) fs.copyFileSync(path.join(endDir, f), path.join(ed, f));
  fs.writeFileSync(path.join(ed, 'config.js'), `// 每支片改这里：片名、系列、做法五行。GitHub 行与落款是固定的。
window.ENDCARD = {
  series: "playground 小游戏",
  title: "办公室打地鼠",
  accounts: ["公众号：我的AI小木屋", "微博 · 快手 · 全民K歌：安闲静雅"],
  notes: [
    ["玩法", "打地鼠：橙色方牌敲掉，蓝色圆牌别敲，绿色菱牌不用管；漏掉 3 个就结束"],
    ["画面", "网页逐帧录制，Canvas 纯代码画的像素小人，照像素办公室的画法重画，没有用 AI 生图"],
    ["声音", "配乐由代码按每次敲中的时间点合成，没有采样素材"],
    ["难度", "三档自动玩家跨几十局测过：手抖的那档大约六成能撑满 60 秒"],
    ["构思", "小试AI · 与 Claude Code 协作完成"],
  ],
};
`);
  const ectx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const ep = await ectx.newPage();
  await ep.goto('file://' + path.join(ed, 'endcard.html'));
  await ep.waitForFunction(() => window.__ready, null, { polling: 50 });
  const dur = await ep.evaluate(() => window.__duration());
  section('outro'); mark('endcard');
  for (let i = 0; i < Math.round(dur * FPS); i++) {
    await ep.evaluate((t) => window.__seek(t), i / FPS);
    await ep.locator('#c').screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
  }
  await ectx.close(); await browser.close();
  const seconds = n / FPS;
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify({ fps: FPS, frames: n, seconds, result: final, marks, sections, errors }, null, 2));
  console.log(`\n${n} 帧，${seconds.toFixed(2)} 秒；结果 ${final.reason}，敲中 ${final.fixed}，页面报错 ${errors.length} 条`);
})().catch((e) => { console.error(e); process.exit(1); });
