// 竖屏演示录屏（1080×1920）：上方标题、下方逐段讲解；光标点屋子真速推开、合上各一次，再慢放一遍逐段讲，最后落款页。
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <page-url> <out-dir>
// 做法同 nanchan-temple/tools/demo.cjs：接管页面时钟，每帧推进 1/30 s 再截图；逐帧记下事件时间写 events.json，
// 配乐由 tools/demo-music.py 按它合成。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
(async () => {
  const [url, outDir] = process.argv.slice(2);
  const frames = path.join(outDir, 'frames'); fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
  const W = 1240, H = Math.round(1240 * 16 / 9), dpr = 1080 / 1240;
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto(url);
  await page.clock.runFor(800);
  await page.waitForFunction(() => window.__xiguan && window.__xiguan.ready, null, { polling: 100 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.addStyleTag({ content: `
    .bar{display:none!important}
    .note{top:230px!important;left:0!important;right:0!important;max-width:none!important;text-align:center;color:#2c3833!important;letter-spacing:.04em!important}
    .note h1{font-size:76px;line-height:1.25;margin:0 0 22px;font-weight:700;letter-spacing:.08em}
    .note p{font-size:38px;margin:0;color:rgba(44,56,51,.62);letter-spacing:.12em}
    .vid-foot{position:fixed;left:0;right:0;top:1560px;text-align:center;color:#2c3833;font-family:"Noto Serif SC","Songti SC",serif}
    .vid-foot .k{font-size:58px;font-weight:700;color:#9e3b2b;margin:0 0 18px;letter-spacing:.1em}
    .vid-foot .t{font-size:40px;line-height:1.5;margin:0;letter-spacing:.06em}
    .vid-cursor{position:fixed;left:0;top:0;width:44px;height:44px;z-index:99;pointer-events:none;transform:translate(-5px,-3px)}
    .vid-cursor.down{transform:translate(-5px,-3px) scale(.85)}
    #endcard{position:fixed;inset:0;z-index:120;opacity:0;pointer-events:none}
    #endcard svg{width:100%;height:100%}
  `});
  await page.evaluate(() => {
    const note = document.querySelector('.note');
    note.innerHTML = '<h1>西关大屋，推开看</h1><p>广州 · 门官厅 · 天井 · 正厅</p>';
    const foot = document.createElement('div'); foot.className = 'vid-foot'; foot.setAttribute('data-reserve-bottom', '');
    foot.innerHTML = '<p class="k"></p><p class="t"></p>';
    document.body.appendChild(foot);
    const c = document.createElement('div'); c.className = 'vid-cursor';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="44" height="44"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.2 L17.5 13.2 Z" fill="#fff" stroke="#1a1410" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    // 落款页（同小木屋室友 ep01 的 endcard：手写「我的AI小木屋」+ 红色「小试AI」印章 + 小黑煤球指纹）
    const ec = document.createElement('div'); ec.id = 'endcard';
    let ridges = '';
    for (let k = 0; k < 11; k++) { const rx = 14 + k * 10, ry = 10 + k * 9.3, dx = Math.sin(k * 1.7) * 3, dy = Math.cos(k * 1.3) * 3, gap = (k * 47) % 360; ridges += `<ellipse cx="${dx}" cy="${8 + dy}" rx="${rx}" ry="${ry}" stroke-dasharray="${rx * 5.2} 14" stroke-dashoffset="${gap}" transform="rotate(${-20 + k * 4})"/>`; }
    ec.innerHTML = `<svg viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" font-family="Noto Serif SC,Songti SC,serif">
      <rect width="1080" height="1920" fill="#efe9dc"/>
      <rect x="40" y="40" width="1000" height="1840" fill="none" stroke="#2c3833" stroke-width="6"/>
      <text x="540" y="330" font-size="44" text-anchor="middle" fill="#7a6a55" font-weight="700">playground · 等距线稿</text>
      <text x="540" y="450" font-size="100" text-anchor="middle" font-weight="900" fill="#1a1a1a">西关大屋，推开看</text>
      <path d="M290 510 h500" stroke="#1a1a1a" stroke-width="5"/>
      <g font-size="31" fill="#333" text-anchor="middle">
        <text x="540" y="610">作者：小试AI（与 Claude Code 协作完成）</text>
        <text x="540" y="668">画面：代码按尺寸算出的等距线稿，无 AI 生图</text>
        <text x="540" y="726">配乐与音效：代码合成，无配音</text>
        <text x="540" y="784">资料：西关民俗馆介绍、新快报等，出处见页面 facts.md</text>
        <text x="540" y="842">灵感：Ian (@ianneo_ai) 的折叠庭院小屋</text>
        <text x="540" y="912" font-size="25" fill="#8a7a65">在线玩：aliceljy.github.io/playground/xiguan-house</text>
      </g>
      <g transform="translate(505,1250)">
        <text id="ecHand" x="-40" y="34" font-size="62" text-anchor="end" font-family="Kaiti SC,STKaiti,serif" font-weight="700" fill="#1a1a1a" opacity="0">我的AI小木屋</text>
        <g id="seal" transform="translate(-20,0)" opacity="0"><g id="sealS">
          <rect x="-10" y="-80" width="150" height="150" rx="10" fill="#C8352B"/>
          <rect x="0" y="-70" width="130" height="130" rx="6" fill="none" stroke="#efe9dc" stroke-width="4"/>
          <text x="65" y="-12" font-size="54" text-anchor="middle" font-family="Kaiti SC,STKaiti,serif" font-weight="900" fill="#efe9dc">小试</text>
          <text x="65" y="48" font-size="54" text-anchor="middle" font-family="Kaiti SC,STKaiti,serif" font-weight="900" fill="#efe9dc">AI</text>
        </g></g>
      </g>
      <g id="thumb" transform="translate(540,1560)" opacity="0"><g id="thumbS">
        <clipPath id="tclip"><circle cx="0" cy="0" r="100"/></clipPath>
        <circle cx="0" cy="0" r="100" fill="#C8352B" opacity=".18"/>
        <g clip-path="url(#tclip)" fill="none" stroke="#C8352B" stroke-width="7" stroke-linecap="round">${ridges}</g>
        <path d="M0 -100 q-4 -50 16 -90" stroke="#C8352B" stroke-width="7" fill="none" stroke-linecap="round"/>
        <circle cx="16" cy="-196" r="17" fill="#C8352B"/>
        <path d="M-30 96 l-6 50 M30 96 l6 50" stroke="#C8352B" stroke-width="7" stroke-linecap="round"/>
      </g></g>
    </svg>`;
    document.body.appendChild(ec);
    window.dispatchEvent(new Event('resize'));
  });
  await page.clock.runFor(100);

  const fps = 30; let n = 0;
  const ev = { fps, T: 3.4, runs: [], clicks: [], end: null, seal: null, thumb: null };
  let cur = { x: 980, y: 1500 };
  const caption = (k, t) => page.evaluate(([k, t]) => { const f = document.querySelector('.vid-foot'); f.querySelector('.k').textContent = k; f.querySelector('.t').textContent = t; }, [k, t]);
  const setCursor = (p, down, hide) => page.evaluate(([x, y, d, h]) => { const c = document.querySelector('.vid-cursor'); c.style.left = x + 'px'; c.style.top = y + 'px'; c.classList.toggle('down', d); c.style.opacity = h ? 0 : 1; }, [p.x, p.y, !!down, !!hide]);
  const shot = async () => { await page.clock.runFor(1000 / fps); await page.waitForTimeout(5); await page.screenshot({ path: path.join(frames, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); n++; };
  const hold = async (s) => { for (let i = 0; i < Math.round(s * fps); i++) await shot(); };
  const moveTo = async (p, s) => {
    const a = { ...cur }, k = Math.round(s * fps);
    for (let i = 1; i <= k; i++) { const t = i / k, e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; await setCursor({ x: a.x + (p.x - a.x) * e, y: a.y + (p.y - a.y) * e }); await shot(); }
    cur = { ...p };
  };
  // 屋子的屏幕位置：取合上时屋身中间
  const house = await page.evaluate(() => { const p = window.__xiguan.project([60, 420, 260]); return { x: p[0], y: p[1] }; });
  // 点一下：光标按下，再逐帧把时间线推到对应位置（不靠页面自己的计时，截图会把假时钟带快）
  const run = async (dir, speed, captions) => {
    const t0 = n / fps;
    ev.runs.push({ t: t0, dir, speed });
    const T = 3.4, k = Math.round((T / speed) * fps);
    for (let i = 0; i <= k; i++) {
      const s0 = Math.min(T, (i / fps) * speed), s = dir === 'open' ? s0 : T - s0;
      if (captions) { const st = captions.filter((x) => s0 >= x[0]).pop(); await caption(st[1], st[2]); }
      await page.evaluate((v) => window.__xiguan.set(v), s);
      if (i === 1 && cur.pressed) { await setCursor(cur, false); cur.pressed = false; }
      await shot();
    }
  };
  const clickHouse = async (dir) => {
    await setCursor(cur, true); cur.pressed = true;
    ev.clicks.push(n / fps);
    await run(dir, 1);
  };
  // 1. 合上的样子
  await caption('广州 · 西关大屋', '门口三件头：脚门、趟栊、大门');
  await setCursor(cur); await hold(2.4);
  // 2. 真速推开
  await moveTo(house, 0.8);
  await caption('点一下', '整座屋子沿着铰链打开');
  await clickHouse('open');
  await caption('门官厅 · 天井 · 正厅', '神楼、八仙桌、通到阁楼的楼梯，都露出来');
  await hold(2.4);
  // 3. 真速合上
  await caption('再点一下', '沿同一条时间线合上');
  await clickHouse('close');
  await hold(0.6);
  await moveTo({ x: 1000, y: 1560 }, 0.5); await setCursor(cur, false, true);
  // 4. 慢放一遍，逐段讲
  await caption('慢放一遍', ''); await hold(0.7);
  const SLOW = 0.4;
  const stages = [[0, '趟栊 · 13 根圆木', '横着拉进墙里的槽；粤语「双」音近「丧」，取单数'], [0.5, '大门 · 厚约 8 厘米', '朝里推开，贴到墙上'], [1.05, '屋面', '前坡翻过来扣到后坡上，再整块掀到后面'], [1.95, '前墙、山墙', '前墙往前倒，两面山墙往外倒'], [2.8, '满洲窗', '套色蚀刻玻璃，往上推开']];
  await run('open', SLOW, stages);
  await caption('13 级楼梯', '和趟栊的圆木一样多，也取单数');
  await hold(3.0);
  // 5. 落款页
  ev.end = n / fps; ev.seal = ev.end + 1.4; ev.thumb = ev.end + 2.4;
  for (let i = 0; i < Math.round(5.2 * fps); i++) {
    const t = i / fps;
    await page.evaluate((t) => {
      const cl = (x) => Math.max(0, Math.min(1, x)), ease = (x) => (x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
      document.getElementById('endcard').style.opacity = cl(t / 0.5);
      document.getElementById('ecHand').setAttribute('opacity', cl((t - 0.5) / 0.5));
      const stamp = (id, t0) => { const f = cl((t - t0) / 0.22); const sc = t < t0 ? 0 : 1.6 - 0.6 * ease(f); document.getElementById(id).setAttribute('transform', `scale(${sc}) rotate(${-6 * (1 - f)})`); };
      stamp('sealS', 1.4); document.getElementById('seal').setAttribute('opacity', t >= 1.4 ? 1 : 0);
      stamp('thumbS', 2.4); document.getElementById('thumb').setAttribute('opacity', t >= 2.4 ? 0.92 : 0);
    }, t);
    await shot();
  }
  await b.close();
  ev.seconds = n / fps;
  const XG = require(path.join(__dirname, '..', 'src', 'model.js'));
  ev.timeline = XG.TIMELINE;
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify(ev, null, 2));
  const mp4 = path.join(outDir, 'xiguan-demo-silent.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-vf', 'scale=1080:1920:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  console.log(JSON.stringify({ frames: n, seconds: n / fps, mp4, errors: errors.slice(0, 5) }));
})();
