// 竖屏体验片（1080×1920）：真点击走完一市——进门、拣茶、洗杯、斟茶、翻报、唔该下单、点心车要笼、夹件、出品、揭盖、
// 邻座斟茶后叩指、离席埋单、再开一市看见「刚才的你」——最后接署名页。
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <page-url> <out-dir> <endcard.js 路径>
// 做法：暂停页面自己的动画循环，用钩子 step(1000/30) 一帧一帧推游戏时间再截图（page.clock 只管 Date，拿来算「你 · 昨天」）；
// 等菜等车的空档只推不拍。每帧之后读游戏的音效日志，按视频时间记进 events.json，配乐由 tools/demo-music.py 按它合成。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
(async () => {
  const [url, outDir, endcardJs] = process.argv.slice(2);
  const frames = path.join(outDir, 'frames'); fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
  const W = 540, H = 960, dpr = 2; // 手机版式，直接 2 倍像素出 1080×1920
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, hasTouch: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-31T07:00:00+08:00') });
  // 预埋两次来访：昨天、三天前，各坐过一阵、斟过茶叩过指，这样一进门桌上就有「你 · 昨天」
  await page.addInitScript(() => {
    if (location.search.includes('view=')) return;
    const day = 86400000, now = Date.now();
    const v = (at, dur, acts) => ({ v: 1, at, dur, acts });
    localStorage.setItem('datai-visits', JSON.stringify([
      v(now - 3 * day, 150, [[4, 1], [9, 4], [16, 2], [30, 5], [41, 1], [60, 5], [75, 2], [92, 4], [110, 1]]),
      v(now - day, 180, [[6, 1], [13, 4], [20, 5], [25, 2], [45, 1], [58, 4], [72, 5], [80, 2], [99, 1], [120, 4], [140, 1]]),
    ]));
    localStorage.setItem('datai-muted', '1');
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__datai && window.__datai.ready, null, { polling: 100 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.addStyleTag({ content: `
    .vid-tap{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid rgba(199,83,47,.9);background:rgba(199,83,47,.18);z-index:99;pointer-events:none;opacity:0;transform:scale(.6)}
    .vid-title{position:fixed;inset:0;z-index:120;background:#f3ead6;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:"Noto Serif SC","Songti SC",serif;color:#2a2118;opacity:0;pointer-events:none}
    .vid-title h1{font-size:46px;letter-spacing:.2em;margin:0 0 14px;font-weight:700}
    .vid-title p{font-size:18px;letter-spacing:.14em;margin:0;color:rgba(42,33,24,.65)}
    .vid-title .sub{margin-top:36px;font-size:15px;letter-spacing:.1em;color:rgba(42,33,24,.5)}
    #vid-endcard{position:fixed;inset:0;z-index:130;opacity:0;pointer-events:none;background:#efe9dc}
    #vid-endcard canvas{width:100%;height:100%;display:block}
  `});
  if (endcardJs) await page.addScriptTag({ path: endcardJs });
  await page.evaluate(() => {
    const tap = document.createElement('div'); tap.className = 'vid-tap'; document.body.appendChild(tap);
    const tt = document.createElement('div'); tt.className = 'vid-title';
    tt.innerHTML = '<h1>搭台</h1><p>广州茶楼早市 · 和陌生人拼一张桌</p><p class="sub">没有聊天框 · 只有八个动作</p>';
    document.body.appendChild(tt);
    const ec = document.createElement('div'); ec.id = 'vid-endcard'; ec.innerHTML = '<canvas width="1080" height="1920"></canvas>'; document.body.appendChild(ec);
    window.ENDCARD = {
      series: 'playground · 有别人在',
      title: '搭台 · 茶楼早市',
      notes: [
        ['资料', '茶位、头泡洗杯、点心纸五档盖印、点心车、叩指谢茶、揭盖加水，都是广州茶楼本来就有的事；价钱取中档茶楼大概数'],
        ['画面', '纯代码二维画布，十四样点心各画各的；桌上的别人是浏览器记着的你自己前几次来访的回放，灰色身影标明不是真人'],
        ['声音', '页面里的声音全部 Web Audio 合成，没有音频文件；片中配乐与音效由代码合成，原创五声小曲，按游戏日志卡点'],
        ['借鉴', '满桌开新桌、新人进最满的桌，这两条规则抽自一座韩国线上静修站的分殿做法；只取规则，不取皮'],
        ['构思', '小试AI · 与 Claude Code 协作完成'],
      ],
    };
  });
  const fps = 30; let n = 0;
  const ev = { fps, taps: [], marks: {}, skips: [], sounds: [] };
  let seen = 0;
  await page.evaluate(() => window.__datai.pause(true));
  const pollSounds = async (keep) => { const list = await page.evaluate(() => window.__datai.sounds); for (let i = seen; i < list.length; i++) if (keep) ev.sounds.push([n / fps, list[i][1]]); seen = list.length; };
  const snap = () => page.evaluate(() => window.__datai.snapshot());
  const shot = async () => {
    await page.evaluate((ms) => window.__datai.step(ms), 1000 / fps); await page.clock.runFor(1000 / fps);
    await pollSounds(true);
    await page.screenshot({ path: path.join(frames, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    n++;
  };
  const hold = async (s) => { for (let i = 0; i < Math.round(s * fps); i++) await shot(); };
  // 推进时钟不拍帧（等菜、等车）；直到条件满足或到时
  const skipUntil = async (cond, maxS) => {
    const t0 = n / fps; const tau0 = await page.evaluate(() => window.__datai.state.tau);
    for (let i = 0; i < Math.round(maxS * fps); i++) { await page.evaluate((ms) => window.__datai.step(ms), 1000 / fps); if (i % 6 === 0 && await page.evaluate(cond)) break; }
    const tau1 = await page.evaluate(() => window.__datai.state.tau);
    await pollSounds(false);
    ev.skips.push({ at: t0, from: tau0, to: tau1 });
  };
  const tapAt = async (sel, label) => {
    const box = await page.locator(sel).first().boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.evaluate(([x, y]) => { const t = document.querySelector('.vid-tap'); t.style.left = x + 'px'; t.style.top = y + 'px'; t.style.opacity = 1; t.style.transform = 'scale(1)'; }, [x, y]);
    ev.taps.push({ t: n / fps, label });
    await shot();
    await page.click(sel);
    for (let i = 0; i < 5; i++) { await page.evaluate((k) => { const t = document.querySelector('.vid-tap'); t.style.opacity = 1 - k; t.style.transform = `scale(${1 + k * 1.2})`; }, (i + 1) / 5); await shot(); }
  };
  const act = (code) => `#bar button[data-act="${code}"]`;

  // 0. 片头
  ev.marks.title = 0;
  for (let i = 0; i < Math.round(2.6 * fps); i++) { const t = i / fps; await page.evaluate((o) => { document.querySelector('.vid-title').style.opacity = o; }, t < 0.4 ? t / 0.4 : t > 2.1 ? Math.max(0, 1 - (t - 2.1) / 0.5) : 1); await shot(); }
  await page.evaluate(() => { document.querySelector('.vid-title').style.opacity = 0; });
  // 1. 门口：看一眼大堂，伙计指桌
  await hold(1.6);
  await tapAt(act(0), '落座'); await hold(1.0);
  // 2. 饮乜茶：拣普洱，等壶到，头泡洗杯
  await hold(0.8); await tapAt('#cart button[data-tea="puer"]', '普洱');
  await skipUntil(() => window.__datai.snapshot().potHere, 4); await hold(0.8);
  await tapAt(act(1), '洗杯'); await hold(2.2);
  await tapAt(act(1), '斟茶'); await hold(1.8);
  await tapAt(act(4), '翻报纸'); await hold(1.4);
  // 3. 点心车来了（要停够 6 秒才拍），要一笼，夹一件
  await skipUntil(() => { const S = window.__datai.state; return !!S.cart && S.cart.leaveAt - S.tau > 6; }, 60); await hold(1.0);
  await tapAt('#cart button:not([disabled])', '要一笼'); await hold(1.4);
  await tapAt(act(5), '夹一件'); await hold(1.6);
  // 4. 唔该 → 点心纸勾三样 → 落单
  await tapAt(act(8), '唔该'); await hold(1.0);
  await tapAt('#orderGrid .item[data-kind="har"]', '虾饺'); await hold(0.35);
  await tapAt('#orderGrid .item[data-kind="feet"]', '凤爪'); await hold(0.35);
  await tapAt('#orderGrid .item[data-kind="roll"]', '肠粉'); await hold(0.6);
  await tapAt('#orderGo', '落单'); await hold(1.2);
  // 5. 厨房出品：等第一样，再夹
  await skipUntil(() => window.__datai.snapshot().baskets.length >= 2, 45); await hold(1.6);
  await tapAt(act(5), '夹一件'); await hold(1.2);
  await tapAt(act(5), '夹一件'); await hold(1.0);
  // 6. 斟到壶空，揭盖，等加水
  // 桌上的人也在斟，壶可能已经见底：有水就先斟一两巡，再按一下让它空
  { const lvl = (await snap()).pot.level; if (lvl >= 0.49) { await tapAt(act(1), '斟茶'); await hold(1.0); } if (lvl >= 0.24) { await tapAt(act(1), '斟茶'); await hold(0.6); } }
  await tapAt(act(1), '壶空了'); await hold(1.0);
  await tapAt(act(3), '揭盖'); await skipUntil(() => window.__datai.snapshot().pot.level === 1, 5); await hold(1.4);
  // 7. 等邻座给你斟茶，叩指
  await skipUntil(() => window.__datai.snapshot().knockOpen, 60); await hold(1.3);
  await tapAt(act(2), '叩指'); await hold(1.6);
  // 8. 离席埋单
  await tapAt(act(6), '离席'); await hold(4.2);
  await tapAt('#again', '再开一市'); await hold(2.2);
  await tapAt(act(0), '再落座'); await hold(2.4);
  // 9. 署名页
  ev.marks.end = n / fps;
  const EC = await page.evaluate(() => window.SignatureEndcard ? { dur: window.SignatureEndcard.DURATION, sfx: window.SignatureEndcard.SFX_AT } : null);
  if (EC) {
    ev.marks.seal = ev.marks.end + EC.sfx[0]; ev.marks.thumb = ev.marks.end + EC.sfx[1];
    for (let i = 0; i < Math.round((EC.dur + 0.4) * fps); i++) {
      const t = i / fps;
      await page.evaluate((t) => { const el = document.getElementById('vid-endcard'); el.style.opacity = Math.min(1, t / 0.4); const c = el.querySelector('canvas').getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); window.SignatureEndcard.draw(c, Math.max(0, t - 0.2), window.ENDCARD); }, t);
      await shot();
    }
  }
  ev.seconds = n / fps;
  await b.close();
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify(ev));
  const mp4 = path.join(outDir, 'datai-demo-silent.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  console.log(JSON.stringify({ frames: n, seconds: n / fps, skips: ev.skips.length, taps: ev.taps.length, sounds: ev.sounds.length, mp4, errors: errors.slice(0, 5) }));
})();
