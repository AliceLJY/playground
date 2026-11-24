// 竖屏演示片录制（给人看，不是验收；手动跑，不进 CI）。页面铺满 1080×1920，不套手机外框：
// 按 360×640 的手机视口、3 倍像素打开 dist 页面（游戏自己的手机竖屏布局、HUD 全在），两根拇指用 CDP 真实触摸操作，
// 摇杆、看向区、挖掘 / 开火 / 放置 / 跳跃按钮和头灯都是页面自己的控件在响应。手指画成半透明白圆点。
// 页面带 ?rec=1 时不跑自己的 rAF 循环（见 src/main.js 末尾 __REC__）：脚本每帧推进两步 1/60 秒的模拟，
// 等地形 Worker 把这一帧要的区块都交回来、接进场景后再画、再截图，所以 Worker 出网格的快慢不影响画面，也不会有空洞。
//   node tools/serve.cjs . 8954
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <输出目录> [--base http://127.0.0.1:8954/dist/index.html] [--seed 731]
//     [--dry]                 不出视频，只每半秒打印一行状态（排动作用）
//     [--stills 3,9.5,20]     这几个时刻另存原尺寸静帧（--dry 时也存）
// 产物：<输出目录>/screen.mp4（1080×1920、30 fps）、events.json（画面里发生的事和它的视频时刻，配乐配音效用）。
// 配乐、音效、接署名页见 tools/demo-sound.py。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; }, has = n => args.includes('--' + n);
const out = args[0]; if (!out || out.startsWith('--')) { console.error('usage: demo.cjs <输出目录> [--dry] [--stills t1,t2]'); process.exit(2); }
const base = flag('base', 'http://127.0.0.1:8954/dist/index.html'), seed = flag('seed', '731'), DRY = has('dry');
const STILLS = (flag('stills', '') || '').split(',').filter(Boolean).map(Number);
const W = 360, H = 640, DPR = 3, FPS = 30, SUB = 2, DT = 1 / (FPS * SUB), SETTLE = 12;
const LOOK = 0.006;                       // 页面：看向区每拖 1 像素转 0.006 弧度
const LOOK_BOX = [170, 196, 350, 410];    // 右手在看向区里能划的范围（避开右下角四个动作键）
fs.mkdirSync(out, { recursive: true });

const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mj = s => { s = cl(s); return s * s * s * (10 - 15 * s + 6 * s * s); };   // 最小加加速度：慢-快-慢
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const tremor = (t, k) => [0.7 * Math.sin(2 * Math.PI * 1.7 * t + k) + 0.4 * Math.sin(2 * Math.PI * 3.3 * t + 2 * k), 0.7 * Math.sin(2 * Math.PI * 1.3 * t + 1.7 * k) + 0.4 * Math.sin(2 * Math.PI * 2.9 * t + 0.5 * k)];

const encoder = file => {   // 截图是全范围 JPEG：转有限范围 BT.709、yuv420p 并打标
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
  return { write: async jpg => { if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r)); }, end: () => { ff.stdin.end(); return done; } };
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?rec=1&seed=${seed}`);
  await page.waitForFunction(() => !!window.__REC__);
  const settle = async () => { for (let i = 0; i < 400; i++) { if (await page.evaluate(() => window.__REC__.settled)) return; await page.waitForTimeout(4); } throw new Error('地形 Worker 一直没交回网格'); };
  // 开录前：真实点「进入荒野」，把出生点周围的区块全接进来（这段不截）
  await page.evaluate(() => { document.getElementById('start').click(); });
  await settle(); await page.evaluate(() => window.__REC__.draw(0)); await settle(); await page.evaluate(() => window.__REC__.draw(0.2));   // 0.2：先让 HUD 的数字刷一遍
  // 手指：半透明白圆点，按下浮现、抬起扩散淡出
  await page.evaluate(() => {
    const css = document.createElement('style');
    css.textContent = `.fdot{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
      background:radial-gradient(circle,rgba(255,255,255,.6) 0%,rgba(255,255,255,.34) 55%,rgba(255,255,255,.16) 100%);
      border:1.5px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(20,18,14,.4),0 2px 9px rgba(0,0,0,.45);pointer-events:none;z-index:99999;opacity:0}
      button{-webkit-tap-highlight-color:transparent}`;
    document.head.appendChild(css);
    for (const i of [0, 1]) { const d = document.createElement('div'); d.className = 'fdot'; d.id = 'fdot' + i; document.body.appendChild(d); }
  });
  const rect = sel => page.evaluate(sel => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
  const BTN = { mine: await rect('[data-intent=mine]'), fire: await rect('[data-intent=fire]'), place: await rect('[data-intent=place]'), jump: await rect('[data-intent=jump]'), lamp: await rect('#lamp'), stick: await rect('#stick') };
  console.log('按钮中心', JSON.stringify(BTN));
  const cdp = await ctx.newCDPSession(page);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 11, radiusY: 11, force: 1 })) });

  const enc = DRY ? null : encoder(path.join(out, 'screen.mp4'));
  let tick = 0, st = null, clockRate = 0;            // tick：已推进的 1/60 秒步数；clockRate：每过 1 秒视频额外拨快多少秒游戏钟
  const now = () => tick * DT, events = [], cues = [];
  const cue = (name, extra) => { cues.push({ name, t: +now().toFixed(3), ...extra }); console.log(`[${now().toFixed(2)}s] ${name}`); };
  const F = { L: { id: 0, down: false, x: 0, y: 0, tUp: -9, beh: null }, R: { id: 1, down: false, x: 0, y: 0, tUp: -9, beh: null } };
  const state = () => page.evaluate(() => { const s = window.__REC__.state(); return { time: s.time, night: s.night, dead: s.dead, p: s.player, inv: s.inventory, stats: s.stats, headlamp: s.headlamp, spin: s.spin, sheltered: s.sheltered, cr: s.creatures, edits: s.edits, chunks: s.chunks }; });
  st = await state();

  // ---- 手的动作：每个动作占一根手指，update(t) 给出这一刻手指在不在、在哪 ----
  function stick(dur, dir) {   // dir：[左右, 前后]，长度 1 是推到边（会冲刺），0.75 是走
    return { dur, update(t, s) { const k = mj(t / 0.15), [dx, dz] = typeof dir === 'function' ? dir(t, s) : dir, [jx, jy] = tremor(t, 3); return [BTN.stick[0] + dx * 35 * k + jx * 0.6, BTN.stick[1] - dz * 35 * k + jy * 0.6]; } };
  }
  function hold(btn, dur, k = 1) { const c = Array.isArray(btn) ? btn : BTN[btn]; return { dur, update(t) { const [jx, jy] = tremor(t, k); return [c[0] + 2 + jx * 0.5, c[1] + 3 + jy * 0.5]; } }; }
  function lookTo(yaw, pitch, dur, from) {   // 一笔划到指定朝向（绝对角度）
    let p0, d;
    return { dur, update(t, s) {
      if (!d) { const dy = wrap(yaw - s.p.yaw), dp = pitch - s.p.pitch; d = [-dy / LOOK, -dp / LOOK];
        p0 = from || [d[0] < 0 ? LOOK_BOX[2] - 8 : LOOK_BOX[0] + 8, cl(300 - d[1] / 2, LOOK_BOX[1], LOOK_BOX[3])];
        if (Math.abs(d[0]) > 300 || p0[1] + d[1] < LOOK_BOX[1] - 30 || p0[1] + d[1] > LOOK_BOX[3] + 60) console.log('LONG-STROKE', d.map(v => v.toFixed(0)).join(','));
      }
      const e = mj(t / dur), [jx, jy] = tremor(t, 1.3);
      return [p0[0] + d[0] * e + jx * 0.5, p0[1] + d[1] * e + jy * 0.5];
    } };
  }
  // 盯住目标：每一步按准星和目标的偏差挪一点（像拇指在微调），拇指快划出看向区就抬起来重新按。
  // target(s) 返回 [yaw, pitch]；creature(id) / point(x, y, z) 生成这样的函数
  function aim(target, dur, from, gain = 0.3, maxStep = 7) {
    let p = null;
    return { dur, update(t, s) {
      if (!p) p = [...(from || [262, 300])];
      const a = target(s);
      if (a) { const ey = wrap(a[0] - s.p.yaw), ep = a[1] - s.p.pitch; p[0] += cl(-ey / LOOK * gain, -maxStep, maxStep); p[1] += cl(-ep / LOOK * gain, -maxStep, maxStep); }
      if (p[0] < LOOK_BOX[0] - 4 || p[0] > LOOK_BOX[2] + 4 || p[1] < LOOK_BOX[1] - 20 || p[1] > LOOK_BOX[3] + 30) { p = [...(from || [262, 300])]; return null; }   // 抬手，下一步重按
      return [...p];
    } };
  }
  const point = (x, y, z) => s => { const dx = x - s.p.x, dz = z - s.p.z; return [Math.atan2(-dx, -dz), Math.atan2(y - s.p.y - 1.62, Math.hypot(dx, dz))]; };
  const creature = (id, lift = null) => s => { const e = s.cr.find(c => c.id === id); if (!e || e.dead) return null; return point(e.x, e.y + (lift ?? (e.type === 'rex' ? 2 : e.type === 'grazer' ? 0.9 : 0)), e.z)(s); };
  function start(f, beh) { beh.t0 = now() + (F[f].down ? DT : 0); F[f].beh = beh; }   // 手指还按着就先抬一步再按，免得瞬移成一大笔拖动

  async function substep() {
    const t = now(), before = Object.values(F).map(f => ({ id: f.id, down: f.down, x: f.x, y: f.y }));
    for (const f of Object.values(F)) {
      const b = f.beh; let pos = null;
      if (b) { const lt = t - b.t0; if (lt > b.dur) { f.beh = null; } else if (lt >= -1e-9) pos = b.update(Math.max(0, lt), st); }
      if (pos) { if (!f.down) f.tDown = t; f.down = true; f.x = pos[0]; f.y = pos[1]; } else if (f.down) { f.down = false; f.tUp = t; }
    }
    // CDP 的 touchStart / touchEnd 只列这一次按下 / 抬起的那几根手指（列进去的就是变化的点），touchMove 列所有按着的
    const pt = f => ({ id: f.id, x: f.x, y: f.y });
    const lifted = before.filter(b => b.down && !Object.values(F).find(f => f.id === b.id).down);
    const added = Object.values(F).filter(f => f.down && !before.find(b => b.id === f.id).down);
    if (lifted.length) await send('touchEnd', lifted.map(pt));
    if (added.length) await send('touchStart', added.map(pt));
    const downs = Object.values(F).filter(f => f.down);
    if (downs.length) await send('touchMove', downs.map(pt));
    const r = await page.evaluate(([dt, clock]) => { const ev = window.__REC__.step(dt, clock); const s = window.__REC__.state(); return { ev, s: { time: s.time, night: s.night, dead: s.dead, p: s.player, inv: s.inventory, stats: s.stats, headlamp: s.headlamp, spin: s.spin, sheltered: s.sheltered, cr: s.creatures, edits: s.edits } }; }, [DT, clockRate * DT]);
    st = r.s;
    for (const e of r.ev) events.push({ ...e, t: +now().toFixed(4) });
    tick++;
  }
  let frame = 0, lastLog = -1;
  async function videoFrame() {
    for (let i = 0; i < SUB; i++) await substep();
    const t = now(), still = STILLS.find(s => Math.abs(s - t) < 0.5 / FPS);
    await settle();
    await page.evaluate(dt => window.__REC__.draw(dt), 1 / FPS);
    if (!DRY || still !== undefined) {
      await page.evaluate(([fs2, t]) => {
        for (const f of fs2) {
          const el = document.getElementById('fdot' + f.id);
          if (f.down) { const k = Math.min(1, (t - f.tDown) / 0.08); el.style.opacity = (0.9 * k).toFixed(3); el.style.transform = `translate(${f.x}px,${f.y}px) scale(${(0.85 + 0.15 * k).toFixed(3)})`; }
          else { const k = (t - f.tUp) / 0.28; el.style.opacity = k < 1 ? (0.9 * (1 - k)).toFixed(3) : '0'; el.style.transform = `translate(${f.x}px,${f.y}px) scale(${(1 + 0.7 * Math.min(1, k)).toFixed(3)})`; }
        }
      }, [Object.values(F).map(f => ({ id: f.id, down: f.down, x: f.x, y: f.y, tDown: f.tDown, tUp: f.tUp })), t]);
      await page.waitForTimeout(SETTLE);
      const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (enc) await enc.write(jpg);
      if (still !== undefined) fs.writeFileSync(path.join(out, `still-${still.toFixed(2)}.jpg`), jpg);
    }
    frame++;
    if (Math.floor(t * 2) !== lastLog) { lastLog = Math.floor(t * 2);
      const rex = st.cr.filter(c => c.type === 'rex' && !c.dead).map(c => `${c.id}:${Math.hypot(c.x - st.p.x, c.z - st.p.z).toFixed(1)}`).join(' ');
      console.log(`t=${t.toFixed(1)} game=${st.time.toFixed(1)}${st.night ? '夜' : ''} p=(${st.p.x.toFixed(1)},${st.p.y.toFixed(1)},${st.p.z.toFixed(1)}) yaw=${st.p.yaw.toFixed(2)} pitch=${st.p.pitch.toFixed(2)} hp=${st.p.hp} rex[${rex}] kills=${st.stats.kills} mined=${st.stats.mined} placed=${st.stats.placed} plank=${st.inv.plank} lamp=${st.headlamp}`); }
  }
  const wait = async sec => { const end = now() + sec - 1e-6; while (now() < end) await videoFrame(); };
  const until = async (pred, maxSec, name) => { const end = now() + maxSec; while (now() < end && !pred(st)) await videoFrame(); if (!pred(st)) console.log('UNTIL-TIMEOUT', name); };
  const nearestRex = s => s.cr.filter(c => c.type === 'rex' && !c.dead).sort((a, b) => Math.hypot(a.x - s.p.x, a.z - s.p.z) - Math.hypot(b.x - s.p.x, b.z - s.p.z))[0];

  // ================= 动作编排 =================
  await require('./demo-script.cjs')({ start, wait, until, stick, hold, lookTo, aim, point, creature, cue, nearestRex, get st() { return st; }, rect, probe: (y, p) => page.evaluate(([y, p]) => window.__REC__.probe(y, p), [y, p]), block: (x, y, z) => page.evaluate(([x, y, z]) => window.__REC__.block(x, y, z), [x, y, z]), setClock: r => { clockRate = r; }, now, F });
  // 最后松开所有手指，让圆点淡出
  for (const f of Object.values(F)) f.beh = null;
  await wait(0.35);
  if (enc) await enc.end();
  const dur = frame / FPS;
  fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify({ fps: FPS, dur, seed: Number(seed), cues, events, final: { time: st.time, hp: st.p.hp, stats: st.stats, inv: st.inv } }, null, 1));
  console.log(`共 ${frame} 帧 ${dur.toFixed(2)} 秒；事件 ${events.length} 条；页面错误 ${errors.length}`, errors.slice(0, 5));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
