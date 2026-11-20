// 竖屏演示片（给人看，不是验收）：外部高处环绕 → 正立面仰看 → 从广场走上台阶、穿过中门进中殿 → 中殿抬头看拱顶、看色光 → 同一机位上午转傍晚 → 署名页。
// 用法：NODE_PATH="$(npm root -g)" node tools/film.cjs <dist/index.html 地址> <输出目录> <署名页模板目录> [probe=秒,秒,…]
//   署名页模板在作者本机 video-director 技能的 references/signature-endcard。
//   输出 frames/*.jpg 与 events.json；再用 tools/demo-sound.py 合成配乐、ffmpeg 合成（命令见 demo-sound.py 文件头）。
//   probe=…：只按给的时间点各出一张 probe-<秒>.jpg，用来对镜头。
// 录法：page.clock 冻住页面的 requestAnimationFrame，镜头和光由这里按时间算好，经 window.__sf.pose / mix / tick 一帧一帧画，再截图。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [url, outDir, endDir, probeArg] = process.argv.slice(2);
const probe = probeArg && probeArg.startsWith('probe=') ? probeArg.slice(6).split(',').map(Number) : null;
const FPS = 30, W = 1080, H = 1920;
const EYE = 1.62, GROUND = -0.75;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sm = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
// 梯形速度：前 a 加速、后 d 减速，中间匀速；返回走过的比例 0…1
const trap = (k, a, d) => { k = clamp(k); const v = 1 / (1 - a / 2 - d / 2); if (k < a) return v * k * k / (2 * a); if (k < 1 - d) return v * (a / 2 + k - a); const r = 1 - k; return 1 - v * r * r / (2 * d); };
// 地面高度：照 src/core.js 的 groundY（中线上：院子 -0.75，台阶 41.3→38.9 升到 0，堂内 0）
const groundOnAxis = z => z > 38.7 ? GROUND * clamp((z - 38.9) / 2.4) : 0;

// ---------- 时间线（秒） ----------
// nave 只是字幕的时间点（进门后约半秒），镜头在 walk 段里连续走进去
const T = { open: 0, facade: 7.5, walk: 14, nave: 25, vault: 30, glass: 34.5, light: 38.5, lightEnd: 46.5 };
// 光变化的机位：站在中殿偏西，看东边一排束柱和上面的高侧窗——上午那排窗亮，傍晚这排窗暗下去，西窗的色光落到这一侧的墙和柱子上
const GLASS_POS = [-2.5, EYE, 22], GLASS_LOOK = [6, 9, 12];
const MORNING = [0, 1.0, 0.12, 0.3], EVENING = [1, 0.12, 1.0, 0.25];
// 每一刻的镜头 {pos, look, fov} 与光
function at(t) {
  let cam, lightMix = MORNING, dip = 0;
  if (t < T.facade) {                                    // A 外部高处环绕：东南上方，慢慢转向正面
    const k = (t - T.open) / (T.facade - T.open), e = sm(k) * 0.7 + k * 0.3;
    const az = lerp(0.9, 0.35, e), pol = lerp(1.18, 1.28, e), dist = lerp(122, 106, e), tg = [0, 22, 16];
    cam = { pos: [tg[0] + dist * Math.sin(pol) * Math.sin(az), tg[1] + dist * Math.cos(pol), tg[2] + dist * Math.sin(pol) * Math.cos(az)], look: tg, fov: 52 };
  } else if (t < T.walk) {                               // B 正立面仰看：广场南端，镜头慢慢抬到塔尖
    const k = sm((t - T.facade) / (T.walk - T.facade));
    cam = { pos: [0, GROUND + EYE, lerp(90, 83, k)], look: [0, lerp(20, 30, k), 38], fov: 66 };
  } else if (t < T.vault) {                              // C 从广场走上台阶、穿过中门进中殿，在中殿里慢下来
    const k = (t - T.walk) / (T.vault - T.walk), z = lerp(76, 25, trap(k, 0.1, 0.28));
    const y = groundOnAxis(z) + EYE;
    const lookY = z > 50 ? lerp(y + 6, y + 14, clamp((z - 50) / 26)) : lerp(y + 2.2, y + 6, clamp((z - 31) / 19));
    cam = { pos: [0, y, z], look: [0, lookY, z - 20], fov: 64 };
    // 门里没画堂内（外面看门洞是黑的）：走到门口压暗，进门后再亮起来
    dip = z >= 38 ? clamp((43.5 - z) / 3.5) : clamp((z - 34.5) / 3.5);
  } else if (t < T.glass) {                              // D2 停住抬头看肋拱
    const k = sm((t - T.vault) / (T.glass - T.vault)), z = 25 - 0.6 * k;
    const lk = lerp3([0, EYE + 2.2, z - 20], [0, 28, z - 6], k);
    cam = { pos: [0, EYE, z], look: lk, fov: 64 };
  } else if (t < T.light) {                              // D3 低头，挪到中殿偏西，转去看东边一排束柱和上面的高侧窗
    const k = sm((t - T.glass) / (T.light - T.glass));
    cam = { pos: lerp3([0, EYE, 24.4], GLASS_POS, k), look: lerp3([0, 28, 18.4], GLASS_LOOK, k), fov: lerp(64, 66, k) };
  } else {                                               // E 同一机位从上午转到傍晚
    const k = sm((t - T.light - 1.2) / (T.lightEnd - T.light - 2.4));
    cam = { pos: GLASS_POS, look: lerp3(GLASS_LOOK, [6, 9.6, 11.6], (t - T.light) / (T.lightEnd - T.light)), fov: 66 };
    lightMix = [lerp(0, 1, k), lerp(1, 0.12, k), lerp(0.12, 1, k), lerp(0.3, 0.25, k)];
  }
  // 段落之间短暂压暗（A→B、B→C）
  for (const c of [T.facade, T.walk]) dip = Math.max(dip, clamp(1 - Math.abs(t - c) / 0.28));
  return { cam, lightMix, dip };
}
// 字幕：[起, 止, 主行, 小字]
const CAPS = [
  [T.facade + 0.6, T.walk - 0.6, '墙、柱、塔全是花岗岩', '1863 年奠基 · 1888 年落成'],
  [T.walk + 0.8, T.walk + 5.6, '从一德路的大门走进去', ''],
  [T.walk + 6.4, T.nave - 0.4, '上五级台阶，穿过中门', ''],
  [T.nave + 0.3, T.vault + 0.3, '两排束柱，左右各十根', ''],
  [T.vault + 0.8, T.glass + 0.2, '尖形肋拱，拱顶高 28.2 米', '肋是石，拱面是红砖'],
  [T.glass + 0.8, T.light + 2.2, '上午，东边的窗亮', '太阳在东'],
  [T.light + 4.6, T.lightEnd + 0.2, '傍晚，换成西边的窗亮', '色光转到东边这一侧 · 彩窗图案为示意'],
];
const DUR_FILM = T.lightEnd + 0.4;

const frames = path.join(outDir, 'frames'); fs.mkdirSync(frames, { recursive: true });
let n = 0; const marks = [], mark = (name, t) => marks.push({ name, t: +t.toFixed(3) });
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time: 0 });
  await page.goto(url + '?q=high&still&noauto&light=morning');
  for (let i = 0; i < 300; i++) { if (await page.evaluate(() => window.__sf && window.__sf.ready)) break; await page.waitForTimeout(100); }
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = `*{transition:none!important;animation:none!important}
      #top,#side,#foot,#cap,#hint,#hero,#joy,#info,#fade{display:none!important}
      #stage{left:0!important;top:0!important;right:0!important;bottom:0!important}
      #film-shade{position:fixed;left:0;right:0;top:0;height:760px;background:linear-gradient(#0a0906a6,#0a090600);z-index:20;pointer-events:none;opacity:0}
      #film-dip{position:fixed;inset:0;background:#0b0a07;opacity:0;z-index:20;pointer-events:none}
      #film-title{position:fixed;left:90px;right:90px;top:250px;text-align:center;z-index:21;color:#fff;text-shadow:0 2px 24px #000a,0 1px 3px #0008}
      #film-title h1{margin:0;font:600 104px/1.15 "Songti SC","STSong",serif;letter-spacing:.08em}
      #film-title p{margin:26px 0 0;font:400 40px/1.4 "PingFang SC",sans-serif;letter-spacing:.2em;color:#f6ecd2}
      #film-title i{display:block;width:120px;height:3px;margin:30px auto 0;background:#e8cf8a}
      #film-cap{position:fixed;left:90px;right:90px;bottom:${1920 - 1460}px;text-align:center;z-index:21;color:#fff;text-shadow:0 2px 18px #000c,0 1px 3px #000c}
      #film-cap b{display:block;font:600 58px/1.3 "Songti SC","STSong",serif;letter-spacing:.06em}
      #film-cap span{display:block;margin-top:14px;font:400 36px/1.4 "PingFang SC",sans-serif;letter-spacing:.08em;color:#f3e6c4}`;
    document.head.appendChild(st);
    document.body.insertAdjacentHTML('beforeend', '<div id="film-dip"></div><div id="film-shade"></div><div id="film-title"><h1>石室圣心大教堂</h1><p>广州一德路 · 纯代码搭建</p><i></i></div><div id="film-cap"><b></b><span></span></div>');
    dispatchEvent(new Event('resize'));
  });
  const render = async t => {
    const { cam, lightMix, dip } = at(t);
    const tA = clamp((t - 0.6) / 0.8) * clamp((T.facade - 0.5 - t) / 0.6);
    const c = CAPS.find(q => t >= q[0] && t < q[1]);
    const cA = c ? clamp((t - c[0]) / 0.45) * clamp((c[1] - t) / 0.45) : 0;
    await page.evaluate(([cam, lm, dip, tA, cap, cA]) => {
      const sf = window.__sf; sf.mix(...lm); sf.pose(cam.pos, cam.look, cam.fov); sf.tick(1 / 30);
      document.getElementById('film-dip').style.opacity = dip;
      document.getElementById('film-title').style.opacity = tA; document.getElementById('film-shade').style.opacity = tA;
      const fc = document.getElementById('film-cap'); fc.style.opacity = cA;
      if (cap) { fc.firstChild.textContent = cap[2]; fc.lastChild.textContent = cap[3]; fc.lastChild.style.display = cap[3] ? 'block' : 'none'; }
    }, [cam, lightMix, dip, tA, c || null, cA]);
  };
  // 光和阴影第一次要多画几帧才稳定
  await render(0); for (let i = 0; i < 6; i++) await page.evaluate(() => window.__sf.tick(1 / 30));
  if (probe) {
    for (const t of probe) { await render(t); await render(t); await page.screenshot({ path: path.join(outDir, `probe-${t}.jpg`), type: 'jpeg', quality: 90 }); console.log('probe', t, JSON.stringify(await page.evaluate(() => { const s = window.__sf.snapshot(); return { zone: s.zone, cam: s.cam, fps: s.fps, calls: s.calls }; }))); }
    await browser.close(); console.log('errors', errors.length, errors.slice(0, 3)); return;
  }
  let lastZone = null;
  for (const [name, t] of Object.entries(T)) if (name !== 'lightEnd') mark('section:' + name, t);
  mark('bell', 0.15);
  for (let i = 0; i < Math.round(DUR_FILM * FPS); i++) {
    const t = i / FPS; await render(t);
    const z = await page.evaluate(() => window.__sf.S.zone); if (z !== lastZone) { if (lastZone) mark('zone:' + z, t); lastZone = z; }
    await page.screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 });
    if (i % 150 === 0) console.log('frame', i, t.toFixed(1) + 's', z);
  }
  mark('lightEnd', T.lightEnd);
  await ctx.close();
  // ---- 署名页（模板原样，只改 config） ----
  const ed = path.join(outDir, 'endcard'); fs.mkdirSync(ed, { recursive: true });
  for (const f of ['endcard.html', 'endcard.js']) fs.copyFileSync(path.join(endDir, f), path.join(ed, f));
  fs.writeFileSync(path.join(ed, 'config.js'), `window.ENDCARD = {
  series: "playground 建筑导览",
  title: "石室圣心大教堂",
  accounts: ["公众号：我的AI小木屋", "微博 · 快手 · 全民K歌：安闲静雅"],
  notes: [
    ["资料", "资料来自中英文维基等公开来源；开间与标高照实拍照片量比例，不是测绘"],
    ["画面", "网页实机逐帧录制；教堂、彩窗、光影全是 Three.js 代码生成，没有图片和模型，没用 AI 生图"],
    ["声音", "管风琴感的长音与钟声都由代码合成，没有采样素材"],
    ["说明", "彩窗图案、堂内陈设与院外的楼都是示意，不对应真物"],
    ["构思", "小试AI · 与 Claude Code 协作完成"],
  ],
};
`);
  const ectx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 }), ep = await ectx.newPage();
  await ep.goto('file://' + path.join(ed, 'endcard.html'));
  await ep.waitForFunction(() => window.__ready, null, { polling: 50 });
  const dur = await ep.evaluate(() => window.__duration());
  mark('section:outro', n / FPS);
  for (let i = 0; i < Math.round(dur * FPS); i++) { await ep.evaluate(t => window.__seek(t), i / FPS); await ep.locator('#c').screenshot({ path: path.join(frames, String(n++).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 }); }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify({ fps: FPS, frames: n, seconds: n / FPS, T, marks, errors }, null, 1));
  console.log(`${n} 帧，${(n / FPS).toFixed(1)} 秒；页面报错 ${errors.length} 条`);
})().catch(e => { console.error(e); process.exit(1); });
