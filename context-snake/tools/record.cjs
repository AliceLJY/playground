// 竖屏演示片（给人看，不是验收）：标题 → 开局吃东西 → 派子 agent、收汇报 → 故意多派一个撞 429 → 压缩 → 中段快进 → 撞上自己 → 结算 → 署名页。
//
//   在 context-snake/ 里 python3 -m http.server 8982 --bind 127.0.0.1，然后
//   NODE_PATH="$(npm root -g)" node tools/record.cjs http://127.0.0.1:8982/ <输出目录> <署名页模板目录>
//   署名页模板在作者本机 video-director 技能的 references/signature-endcard。
//   产出：frames/*.jpg（1080×1920，30 帧）和 events.json（吃到、汇报、429、压缩、撞上、剪辑点的成片时间），
//   再用 tools/demo-sound.py 按 events.json 合成声音，最后 ffmpeg 合成（命令见 demo-sound.py 文件头）。
// 录法同 later-whack/tools/record.cjs：page.clock 接管时钟，每帧推进 1/30 秒（快进时多推几倍）再按设备像素截图。
// 所有操作都是真实触摸：往哪拐、什么时候按技能由游戏自带的自动驾驶出主意（window.__snake.suggest），脚本照着点屏幕上的按钮。
// 本游戏的 CSS 动画只有压缩按钮的粉框呼吸，逐帧录制会按真实时间走，录片时关掉；Math.random 换成带种子的，录出来每次一样。
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
  await page.addInitScript(() => { let a = 20261104; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await page.clock.install({ time: 0 });
  await page.goto(url);
  await page.waitForFunction(() => window.__snake && window.__snake.ready, null, { polling: 50 });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  // 录片专用：关掉按真实时间走的呼吸动画（粉框照样亮），加一个快进角标；都不改游戏
  await page.evaluate(() => {
    const st = document.createElement('style'); st.textContent = '#skills button.hint{animation:none!important;box-shadow:0 0 0 3px #ff3d7f66}'; document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'ff'; d.hidden = true; d.textContent = '▶▶ 快进 ×3';
    d.style.cssText = 'position:fixed;left:50%;top:0;transform:translateX(-50%);padding:3px 12px;border-radius:999px;background:#1c1f28e6;color:#ffd75a;font:700 14px "PingFang SC",sans-serif;pointer-events:none;z-index:9';
    document.body.appendChild(d);
    // sit on the bottom edge of the board, clear of the banners that appear at its top
    const f = window.__snake.probe().layout.field; d.style.top = (f.y + f.h - 30) + 'px';
  });
  const probe = () => page.evaluate(() => window.__snake.probe());
  const shot = async (mult = 1) => {
    await page.clock.runFor(Math.round((1000 / FPS) * mult));
    await page.screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: 1920 / DPR } });
  };
  const hold = async (sec, mult = 1) => { for (let i = 0; i < Math.round(sec * FPS); i++) await shot(mult); };
  const tap = async (sel) => { const b = await page.locator(sel).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
  const BTN = { up: '#dpad .u', right: '#dpad .r', down: '#dpad .d', left: '#dpad .l', compress: '#btn-compress', dispatch: '#btn-dispatch' };

  section('title'); await hold(2.6);
  await tap('#start-btn'); mark('start');
  section('play');
  // beats, each one waits for the game to really get there:
  //   report  (x1) one sub-agent out, wait for its report
  //   grow    (x3) no skills until turns lag and the compress button glows, then x1 for a beat and press it
  //   grow2   (x3) no skills until 19 segments, then x1: three out, and a fourth into 429
  //   ff      (x3) the precise autopilot plays on for 15 game seconds
  //   end     (x1) no skills; once 5 long, turn right every cell and bite itself
  let beat = 'report', mult = 1, prev = null, mark0 = 0;
  const setBadge = (txt) => page.evaluate((t) => { const d = document.getElementById('ff'); d.hidden = !t; if (t) d.textContent = t; }, txt);
  const speed = async (m, label, name) => { mult = m; section(name); await setBadge(m > 1 ? '▶▶ 快进 ×' + m : ''); };
  for (let i = 0; i < FPS * 200; i++) {
    const p = await probe();
    if (p.screen !== 'play') break;
    const s = p.state;
    if (prev) {
      const d = k => s.stats[k] - prev.stats[k], e = s.stats.eaten, pe = prev.stats.eaten;
      for (let k = 0; k < e.file + e.web + e.log - pe.file - pe.web - pe.log; k++) mark('eat');
      if (d('reports')) mark('report'); if (d('bursts')) mark('burst'); if (d('compress')) mark('compress'); if (d('dispatched') && !d('bursts')) mark('dispatch');
    }
    prev = s;
    const hint = await page.evaluate(() => document.getElementById('btn-compress').classList.contains('hint'));
    let acts = await page.evaluate((lv) => window.__snake.suggest(lv), 'precise');
    acts = acts.filter(a => a !== 'compress' && a !== 'dispatch');   // skills are pressed by the beats below, never by the autopilot
    if (beat === 'report') {
      if (s.stats.dispatched === 0 && s.len >= 7) acts.push('dispatch');
      if (s.stats.reports >= 1) { beat = 'grow'; await speed(3, '', 'grow'); }
    } else if (beat === 'grow') {
      if (hint && mult > 1) { await speed(1, '', 'glow'); mark0 = s.t; }
      if (hint && mult === 1 && s.t - mark0 >= 1.2) acts = ['compress'];
      if (s.stats.compress > 0) { beat = 'grow2'; await speed(3, '', 'grow2'); }
    } else if (beat === 'grow2') {
      if (s.len >= 19 && mult > 1) await speed(1, '', 'dispatch3');
      if (mult === 1 && s.len >= 7) acts = ['dispatch'];   // refused during the 1.5 s cooldown, so it simply retries each frame
      if (s.stats.bursts > 0) { beat = 'ff'; mark0 = s.t; await speed(3, '', 'ff'); }
    } else if (beat === 'ff') {
      acts = await page.evaluate((lv) => window.__snake.suggest(lv), 'precise');
      if (s.t - mark0 >= 15 || s.t >= 105) { beat = 'end'; await speed(1, '', 'finale'); }
    } else {
      if (s.len >= 5 && s.queue === 0) acts = [['right', 'down', 'left', 'up'][s.dir]];
    }
    for (const a of acts) await tap(BTN[a]);
    await shot(mult);
  }
  const r = (await probe()).state.result;
  section('result'); mark('result', { reason: r.reason });
  await hold(5);
  await ctx.close();

  // ---- 署名页：模板单独渲染，逐帧接在片尾 ----
  const ed = path.join(outDir, 'endcard'); fs.mkdirSync(ed, { recursive: true });
  for (const f of ['endcard.html', 'endcard.js']) fs.copyFileSync(path.join(endDir, f), path.join(ed, f));
  fs.writeFileSync(path.join(ed, 'config.js'), `// 每支片改这里：片名、系列、做法五行。GitHub 行与落款是固定的。
window.ENDCARD = {
  series: "playground 小游戏",
  title: "上下文蛇",
  accounts: ["公众号：我的AI小木屋", "微博 · 快手 · 全民K歌：安闲静雅"],
  notes: [
    ["玩法", "贪吃蛇：吃东西变长，越长拐弯越慢，撞到自己就输；能剪短尾巴，也能甩一截出去帮你吃"],
    ["画面", "网页逐帧录制，画面全是代码画的，没用 AI 生图"],
    ["声音", "音效与铺底都由代码按画面里的事件时间合成，没有采样素材"],
    ["难度", "四档自动玩家各跑 40 局测过：慢速下手抖的那档平均撑 90 秒"],
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
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify({ fps: FPS, frames: n, seconds, result: r, marks, sections, errors }, null, 2));
  console.log(`\n${n} 帧，${seconds.toFixed(2)} 秒；结果 ${r.reason}，第 ${r.t} 秒，汇报 ${r.stats.reports}，429 ${r.stats.bursts} 次，页面报错 ${errors.length} 条`);
})().catch((e) => { console.error(e); process.exit(1); });
