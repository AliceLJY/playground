// 竖屏演示录屏（1080×1920）：电脑版布局整张卡片居中，上下加标题和一句话；画一个光标依次去按 11 步，搭到第 9 步后切黑夜，再拆开、装回。
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <page-url> <out-dir>
// 做法同 jianmen-drizzle/tools/demo.cjs：接管页面时钟，每帧推进 1/30 s 再截图；同时逐帧记事件时间写 events.json，配乐由 tools/demo-music.py 按它合成。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
(async () => {
  const [url, outDir] = process.argv.slice(2);
  const frames = path.join(outDir, 'frames'); fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
  const W = 1240, H = Math.round(1240 * 16 / 9), dpr = 1080 / 1240;
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.clock.install({ time: 0 });
  await page.goto(url);
  await page.clock.runFor(1500); await page.waitForTimeout(1500);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.addStyleTag({ content: `
    html,body{height:100%;overflow:hidden}
    body{display:flex;flex-direction:column;justify-content:center}
    .iso-page{margin:0 auto}
    .vid-head,.vid-foot{width:1160px;margin:0 auto;color:var(--nc-ink);font-family:"Noto Serif SC","Songti SC",serif}
    .vid-head{padding:0 0 46px}
    .vid-head h1{font-size:64px;line-height:1.3;margin:0 0 18px;font-weight:700;letter-spacing:.02em}
    .vid-head p{font-size:32px;margin:0;opacity:.7}
    .vid-foot{padding:40px 0 0;min-height:330px}
    .vid-foot .k{font-size:46px;font-weight:700;color:#c0492f;margin:0 0 14px}
    .vid-foot .t{font-size:38px;line-height:1.5;margin:0}
    .vid-foot b{color:#c0492f}
    .vid-head p{color:var(--anatomy-muted)}
    .vid-cursor{position:fixed;left:0;top:0;width:34px;height:34px;z-index:99;pointer-events:none;transform:translate(-4px,-2px)}
    .vid-cursor.down{transform:translate(-4px,-2px) scale(.85)}
    .iso-figure > :not(.iso-plate){display:none}
  `});
  await page.evaluate(() => {
    const main = document.querySelector('.iso-page');
    const head = document.createElement('div'); head.className = 'vid-head';
    head.innerHTML = '<h1>中国现存最古老的木构建筑，<br>是怎么一层层搭起来的？</h1><p>山西五台 · 南禅寺大殿 · 唐建中三年（782 年）</p>';
    const foot = document.createElement('div'); foot.className = 'vid-foot';
    foot.innerHTML = '<p class="k"></p><p class="t"></p>';
    main.parentNode.insertBefore(head, main); main.parentNode.insertBefore(foot, main.nextSibling);
    const c = document.createElement('div'); c.className = 'vid-cursor';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.2 L17.5 13.2 Z" fill="#fff" stroke="#1a1410" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  });
  const plate = await page.evaluate(() => { const r = document.querySelector('.iso-plate').getBoundingClientRect(); return [r.top, r.bottom]; });
  console.log('plate', plate, 'viewport', W, H);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));

  const fps = 30; let n = 0;
  const ev = { fps, steps: [], night: null };
  let cur = { x: 900, y: 1500 };
  const setCursor = (p, down) => page.evaluate(([x, y, d]) => { const c = document.querySelector('.vid-cursor'); c.style.left = x + 'px'; c.style.top = y + 'px'; c.classList.toggle('down', d); }, [p.x, p.y, !!down]);
  let ending = false;
  const mirror = () => page.evaluate((end) => {
    const f = document.querySelector('.vid-foot'), k = f.querySelector('.k'), t = f.querySelector('.t');
    if (end) { k.textContent = '一座殿，只用一把尺子：材'; t.textContent = '柱高、出檐、斗栱，全按「分」来算。'; return; }
    const on = document.querySelector('.nc-step[aria-current], .nc-step.is-running, .nc-step.on');
    const tip = (document.querySelector('[data-tip]') || {}).textContent || '';
    const clean = tip.trim();
    if (window.__vidStep === '天黑了') { k.textContent = '天黑了'; t.textContent = '同一座殿，换成夜里的配色。接下来把它拆开。'; return; }
    if (clean && !/^下一步|^搭好了|^先把地基/.test(clean)) window.__lastTip = clean;
    k.textContent = window.__vidStep || '南禅寺大殿'; t.textContent = window.__vidStep ? (window.__lastTip || '') : '一块空地。按下第一步，开始盖。';
  }, ending);
  const shot = async () => { await mirror(); await page.clock.runFor(1000 / fps); await page.waitForTimeout(8); await page.screenshot({ path: path.join(frames, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); n++; };
  const hold = async (s) => { for (let i = 0; i < Math.round(s * fps); i++) await shot(); };
  const centerOf = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.6 }; }, sel);
  const moveTo = async (p, s) => {
    const a = { ...cur }, k = Math.round(s * fps);
    for (let i = 1; i <= k; i++) { const t = i / k, e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; await setCursor({ x: a.x + (p.x - a.x) * e, y: a.y + (p.y - a.y) * e }); await shot(); }
    cur = { ...p };
  };
  const press = async (sel) => { await setCursor(cur, true); await page.evaluate((s) => document.querySelector(s).click(), sel); const t = n / fps; await shot(); await shot(); await shot(); await setCursor(cur, false); return t; };
  const waitNext = async (i, max) => { for (let k = 0; k < max * fps; k++) { const ok = await page.evaluate((j) => { const b = document.querySelectorAll('.nc-step')[j]; return !!b && !b.disabled; }, i); if (ok) return; await shot(); } };

  await setCursor(cur); await hold(2.0);
  for (let i = 0; i < 11; i++) {
    if (i === 9) {                                       // 搭完，切黑夜
      await moveTo(await centerOf('[data-theme-set="dark"]'), 0.6);
      await page.evaluate(() => { window.__vidStep = '天黑了'; });
      ev.night = await press('[data-theme-set="dark"]'); await hold(1.4);
    }
    await moveTo(await centerOf(`.nc-step[data-i="${i}"]`), i === 0 ? 0.8 : 0.5);
    await page.evaluate(([j, name]) => { window.__vidStep = `第 ${j + 1} 步 · ${name}`; }, [i, await page.evaluate((j) => document.querySelectorAll('.nc-step .nc-name')[j].textContent, i)]);
    ev.steps.push(await press(`.nc-step[data-i="${i}"]`));
    if (i < 10) await waitNext(i + 1, 12);
    await hold(i === 9 ? 2.2 : i === 10 ? 0 : 0.5);
  }
  await hold(3.2);
  ending = true; ev.ending = n / fps; await moveTo({ x: 1150, y: 2150 }, 0.4); await hold(4.0);
  await b.close();
  ev.seconds = n / fps; fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify(ev, null, 2));
  const mp4 = path.join(outDir, 'nanchan-demo-silent.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-vf', 'scale=1080:1920:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  console.log(JSON.stringify({ frames: n, seconds: n / fps, events: ev, mp4, errors: errors.slice(0, 5) }));
})();
