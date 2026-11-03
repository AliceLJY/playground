// 竖屏演示片（给人看，不是验收）：标题 → 第 1 关完整打完 → 合影 → 第 5 关认人、认错一次、用一次提示、快进 → 全员合影 → 署名页。
//
//   NODE_PATH="$(npm root -g)" node tools/record.cjs <tools/demo-stage.html 的地址> <输出目录> <署名页模板目录>
//   例：在仓根 python3 -m http.server 8766，然后
//       node tools/record.cjs http://127.0.0.1:8766/pixel-match/tools/demo-stage.html /Volumes/ColdData/产出/<日期>-像素连连看演示 \
//            ~/Downloads/sync-bridge/cc-skills/video-director/references/signature-endcard
//   产出：frames/*.jpg（1080×1920，30 帧）和 events.json（每次消牌、认错、提示、剪辑点的成片时间），
//   再用 tools/demo-music.py 按 events.json 合成卡点配乐，最后 ffmpeg 合成（命令在文件末尾打印）。
// 录法同 coal-breakout/tools/demo.cjs：page.clock 接管时钟，每帧推进 1/30 秒（快进时多推几倍）再按设备像素截图。
// 外框 demo-stage.html 上面是字幕带、下面 iframe 是真实游戏；所有点按都是真实触摸，点哪一对由脚本从当前盘面挑。
// 本游戏没有 CSS 过渡和动画，逐帧录制不会拍到过渡中间态。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [stage, outDir, endDir] = process.argv.slice(2);
if (!stage || !outDir || !endDir) { console.error('用法见文件头'); process.exit(2); }
const FPS = 30, W = 390, H = 694, DPR = 1080 / 390, BAND = 110;
const frames = path.join(outDir, 'frames');
fs.mkdirSync(frames, { recursive: true }); for (const f of fs.readdirSync(frames)) fs.unlinkSync(path.join(frames, f));
let n = 0; const marks = [], sections = [];
const now = () => n / FPS;
const mark = (name, extra) => { marks.push({ name, t: +now().toFixed(3), ...extra }); console.log(name, now().toFixed(2), extra ? JSON.stringify(extra) : ''); };
const section = (kind) => { sections.push({ kind, t: +now().toFixed(3) }); mark('section:' + kind); };
let rs = 12345; const rnd = () => { rs = (rs * 1103515245 + 12345) % 2147483648; return rs / 2147483648; };

async function session(browser, game) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto(stage + '?band=' + BAND + '&game=' + encodeURIComponent(game));
  await page.waitForFunction(() => { const f = document.getElementById('game'); return f.contentWindow && f.contentWindow.__pixelMatch && f.contentWindow.__pixelMatch.ready; }, null, { polling: 50 });
  const frame = page.frames().find((f) => f.url().includes('index.html'));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  const S = { page, frame, errors, tap: null, tapAge: 99, speed: null, cap: '' };
  S.shot = async (mult = 1) => {
    S.tapAge++;
    await page.evaluate((o) => window.__stage(o), {
      cap: S.cap, speed: S.speed,
      tap: S.tap && S.tapAge < 9 ? { x: S.tap.x, y: S.tap.y, a: 1 - S.tapAge / 9, s: 26 + S.tapAge * 5 } : null,
    });
    await page.clock.runFor(Math.round((1000 / FPS) * mult));
    await page.screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: 1920 / DPR } });
  };
  S.hold = async (sec, mult = 1) => { for (let i = 0; i < Math.round(sec * FPS); i++) await S.shot(mult); };
  S.tapAt = async (x, y) => { S.tap = { x, y }; S.tapAge = 0; await page.touchscreen.tap(x, y); };
  S.tapCell = async (c) => S.tapAt(c.x, c.y + BAND);
  S.tapButton = async (name, exact = false) => { const b = await frame.getByRole('button', { name, exact }).boundingBox(); await S.tapAt(b.x + b.width / 2, b.y + b.height / 2); };
  S.probe = () => frame.evaluate(() => { const p = window.__pixelMatch.probe(); return { mode: p.mode, matches: p.matches, mistakes: p.mistakes, remaining: p.remaining, hints: p.hints, autoShuffles: p.autoShuffles, types: p.types, grid: p.grid }; });
  // 从当前盘面挑一对能连的：ring = 优先挑要绕外圈的；否则多半挑隔开的（线更好看）。
  S.pick = (ring) => frame.evaluate(({ ring, r }) => {
    const C = window.PixelMatchCore, p = window.__pixelMatch.probe(), R = p.grid.length, Cn = p.grid[0].length;
    const ms = C.allMoves(p.grid).map(([a, b]) => ({ a, b, path: C.findPath(p.grid, a, b) }));
    if (!ms.length) return null;
    const outside = ms.filter((m) => m.path.some((q) => q.r < 0 || q.c < 0 || q.r >= R || q.c >= Cn));
    const apart = ms.filter((m) => Math.abs(m.a.r - m.b.r) + Math.abs(m.a.c - m.b.c) > 1);
    const pool = ring && outside.length ? outside : apart.length && r < 0.75 ? apart : ms;
    const m = pool[Math.floor(r * 997) % pool.length];
    return [m.a, m.b].map((c) => ({ ...window.__pixelMatch.cellCenter(c.r, c.c), r: c.r, c: c.c, t: c.t }));
  }, { ring, r: rnd() });
  S.cellsOf = (id) => frame.evaluate((id) => { const p = window.__pixelMatch.probe(), t = p.types.indexOf(id), out = []; p.grid.forEach((row, r) => row.forEach((v, c) => { if (v === t) out.push({ ...window.__pixelMatch.cellCenter(r, c), r, c }); })); return out; }, id);
  // 点一对：先停一会儿（想），点第一张，再停，点第二张。
  S.pair = async (move, think = 0.45, gap = 0.32, mult = 1) => {
    await S.hold(think / mult, mult); await S.tapCell(move[0]);
    await S.hold(gap / mult, mult); const before = (await S.probe()).matches; await S.tapCell(move[1]);
    await S.shot(mult);
    const p = await S.probe();
    if (p.matches > before) mark('match', { left: p.remaining / 2, fast: mult > 1 }); else mark('miss');
    if (p.autoShuffles) mark('deadlock-check', { autoShuffles: p.autoShuffles });
    return p;
  };
  return S;
}

(async () => {
  const browser = await chromium.launch();

  // ---- 第一段：标题 → 第 1 关 → 合影 ----
  let S = await session(browser, 'seed=21');
  section('title'); S.cap = '像素办公室的十三位，来玩连连看'; await S.hold(2.2);
  await S.tapButton('开始玩'); mark('tap'); await S.hold(0.4);
  section('intro'); S.cap = '第 1 关：先认识四位'; await S.hold(1.8);
  await S.tapButton('开始', true); mark('start');
  section('play'); S.cap = '点两张一样的，线拐不超过两个弯就消掉';
  let p = await S.probe(), k = 0;
  while (p.remaining > 0 && k++ < 30) {
    if (k === 4) S.cap = '线可以绕到棋盘外面一圈';
    if (k === 8) S.cap = '消掉的两个人会挥手、跳一下';
    const mv = await S.pick(k === 4 || k === 5); if (!mv) { await S.hold(0.3); p = await S.probe(); continue; }
    p = await S.pair(mv, k === 1 ? 0.7 : 0.42, 0.3);
  }
  await S.hold(0.9);
  section('photo'); S.cap = '过关！大家出来合个影'; mark('photo');
  await S.hold(3.0);
  const err1 = S.errors; await S.page.context().close();

  // ---- 第二段：第 5 关 ----
  S = await session(browser, 'level=5&seed=8');
  section('cut'); mark('cut');
  section('intro5'); S.cap = '第 5 关：十三位全员上场，有几对长得特别像'; await S.hold(2.4);
  await S.tapButton('开始', true); mark('start');
  section('play5'); S.cap = '第 5 关：十三位全员';
  for (let i = 0; i < 2; i++) await S.pair(await S.pick(false), 0.5, 0.32);
  // 认错一次：老板和 CC
  const boss = await S.cellsOf('boss'), cc = await S.cellsOf('director');
  S.cap = '老板和 CC，衬衫只差一点点……';
  await S.hold(0.5); await S.tapCell(boss[0]); await S.hold(0.45); await S.tapCell(cc[0]); mark('wrong');
  await S.hold(1.4);
  S.cap = '认不出来？点「提示」'; await S.hold(0.4);
  await S.tapButton('提示'); mark('hint'); await S.hold(1.1);
  // 提示那一对：从游戏状态读（probe 不带 hint，直接读 core 给的第一步，同 useHint 的选法）
  const hinted = await S.frame.evaluate(() => { const C = window.PixelMatchCore, p = window.__pixelMatch.probe(), m = C.firstMove(p.grid); return [m[0], m[1]].map((c) => ({ ...window.__pixelMatch.cellCenter(c.r, c.c), r: c.r, c: c.c })); });
  await S.pair(hinted, 0.2, 0.35);
  S.cap = '剩下的快进'; S.speed = '▶▶ ×4'; mark('ff');
  section('ff');
  p = await S.probe(); k = 0;
  while (p.remaining > 4 && k++ < 40) { const mv = await S.pick(false); if (!mv) { await S.hold(0.2, 4); p = await S.probe(); continue; } p = await S.pair(mv, 0.45, 0.3, 4); }
  S.speed = null; S.cap = '最后两对'; section('play5b'); mark('ff-end');
  while (p.remaining > 0 && k++ < 50) { const mv = await S.pick(false); if (!mv) { await S.hold(0.3); p = await S.probe(); continue; } p = await S.pair(mv, 0.5, 0.32); }
  await S.hold(0.9);
  section('final'); S.cap = '全员到齐！'; mark('final');
  await S.hold(3.6);
  const err2 = S.errors; await S.page.context().close();

  // ---- 署名页：模板单独渲染，逐帧接在片尾 ----
  const ed = path.join(outDir, 'endcard'); fs.mkdirSync(ed, { recursive: true });
  for (const f of ['endcard.html', 'endcard.js']) fs.copyFileSync(path.join(endDir, f), path.join(ed, f));
  fs.writeFileSync(path.join(ed, 'config.js'), `// 每支片改这里：片名、系列、做法五行。GitHub 行与落款是固定的。
window.ENDCARD = {
  series: "playground 小游戏",
  title: "像素连连看",
  accounts: ["公众号：我的AI小木屋", "微博 · 快手 · 全民K歌：安闲静雅"],
  notes: [
    ["玩法", "最普通的连连看：两张一样、线拐不超过两个弯就消；越往后长得越像"],
    ["画面", "网页逐帧录制，Canvas 纯代码绘制；小人原样取自像素办公室的绘制代码，没有用 AI 生图"],
    ["声音", "配乐由代码按消牌时间点合成，没有采样素材"],
    ["难度", "两个小人像不像，用牌面上一眼可见的差异像素来量"],
    ["构思", "小试AI · 与 Claude Code 协作完成"],
  ],
};
`);
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const ep = await ctx.newPage();
  await ep.goto('file://' + path.join(ed, 'endcard.html'));
  await ep.waitForFunction(() => window.__ready, null, { polling: 50 });
  const dur = await ep.evaluate(() => window.__duration());
  section('outro'); mark('endcard');
  for (let i = 0; i < Math.round(dur * FPS); i++) {
    await ep.evaluate((t) => window.__seek(t), i / FPS);
    await ep.locator('#c').screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
  }
  await ctx.close(); await browser.close();

  const seconds = n / FPS;
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify({ fps: FPS, frames: n, seconds, marks, sections, errors: [...err1, ...err2] }, null, 2));
  console.log(`\n${n} 帧，${seconds.toFixed(2)} 秒；页面报错 ${err1.length + err2.length} 条`);
  console.log(`配乐：~/.venv-kokoro/bin/python3 tools/demo-music.py "${outDir}/events.json" "${outDir}/music-raw.wav"`);
})().catch((e) => { console.error(e); process.exit(1); });
