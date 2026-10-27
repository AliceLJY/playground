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
    #notes{position:fixed;inset:0;z-index:110;opacity:0;pointer-events:none;background:#efe9dc;font-family:"Noto Serif SC","Songti SC",serif;color:#2c3833}
    #notes h2{margin:330px 0 0;text-align:center;font-size:64px;letter-spacing:.16em;font-weight:700}
    #notes .rule{width:200px;height:3px;background:#9e3b2b;margin:26px auto 70px}
    #notes .row{display:flex;gap:34px;margin:0 110px 50px;opacity:0}
    #notes .lab{flex:0 0 auto;font-size:42px;font-weight:700;color:#9e3b2b;letter-spacing:.08em}
    #notes .body{font-size:38px;line-height:1.55;letter-spacing:.03em}
    #notes .foot{position:absolute;left:0;right:0;bottom:250px;text-align:center;font-size:32px;color:rgba(44,56,51,.62);letter-spacing:.06em}
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
      <text x="540" y="590" font-size="44" text-anchor="middle" fill="#7a6a55" font-weight="700">playground · 等距线稿</text>
      <text x="540" y="710" font-size="100" text-anchor="middle" font-weight="900" fill="#1a1a1a">西关大屋，推开看</text>
      <path d="M290 770 h500" stroke="#1a1a1a" stroke-width="5"/>
      <text id="ecHand" x="540" y="1140" font-size="64" text-anchor="middle" font-family="Kaiti SC,STKaiti,serif" font-weight="700" fill="#1a1a1a" opacity="0">我的AI小木屋</text>
      <g id="seal" transform="translate(540,1262)" opacity="0"><g id="sealS">
        <rect x="-75" y="-75" width="150" height="150" rx="10" fill="#C8352B"/>
        <rect x="-65" y="-65" width="130" height="130" rx="6" fill="none" stroke="#efe9dc" stroke-width="4"/>
        <text x="0" y="-7" font-size="54" text-anchor="middle" font-family="Kaiti SC,STKaiti,serif" font-weight="900" fill="#efe9dc">小试</text>
        <text x="0" y="53" font-size="54" text-anchor="middle" font-family="Kaiti SC,STKaiti,serif" font-weight="900" fill="#efe9dc">AI</text>
      </g></g>
      <g id="thumb" transform="translate(540,1630)" opacity="0"><g id="thumbS">
        <!-- 小黑煤球（照 IP 母版 content-publisher/assets/ip/cobbler.png）：黑圆身、白圆眼、短横白嘴、直天线粉球、两条细腿、白色贴纸描边；身上一层淡指纹暗纹 -->
        <g fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round">
          <circle cx="0" cy="0" r="100"/><path d="M0 -100 V-136 M-28 92 V144 M28 92 V144"/><circle cx="0" cy="-152" r="17"/>
        </g>
        <circle cx="0" cy="0" r="100" fill="#111111"/>
        <clipPath id="tclip"><circle cx="0" cy="0" r="96"/></clipPath>
        <g clip-path="url(#tclip)" fill="none" stroke="#1e1e1e" stroke-width="3.5" stroke-linecap="round">${ridges}</g>
        <path d="M0 -100 V-136" stroke="#111111" stroke-width="5" stroke-linecap="round"/>
        <circle cx="0" cy="-152" r="17" fill="#FF5DA2"/>
        <path d="M-28 92 V144 M28 92 V144" stroke="#111111" stroke-width="5" stroke-linecap="round"/>
        <circle cx="-32" cy="144" r="4.5" fill="#111111"/><circle cx="32" cy="144" r="4.5" fill="#111111"/>
        <circle cx="-47" cy="-4" r="9" fill="#ffffff"/><circle cx="47" cy="-4" r="9" fill="#ffffff"/>
        <rect x="-10" y="0" width="20" height="4.5" rx="2.25" fill="#ffffff"/>
      </g></g>
    </svg>`;
    document.body.appendChild(ec);
    const nt = document.createElement('div'); nt.id = 'notes';
    const NOTES = [
      ['资料', '门口三件头、趟栊 13 根圆木、大门厚约 8 厘米、花岗岩石脚与石门夹，取自西关民俗馆介绍和新快报报道；查不到的尺寸都标「示意」'],
      ['画面', '代码按尺寸算出的等距线稿，每个部件挂在自己的铰链上；每一帧都检查过零件互不穿插'],
      ['配乐', '原创五声小曲，高胡唱主旋律、扬琴伴奏；滑动、落地、玻璃声跟着动作卡点'],
      ['借鉴', 'Ian（@ianneo_ai）的折叠庭院小屋，他参考了 Akshat Singh 的 404 页'],
      ['构思', '小试AI · 与 AI 协作完成'],
    ];
    nt.innerHTML = '<h2>推开手记</h2><div class="rule"></div>' + NOTES.map(([l, b]) => `<div class="row"><div class="lab">${l}</div><div class="body">${b}</div></div>`).join('') + '<div class="foot">网页可以自己点：aliceljy.github.io/playground/xiguan-house</div>';
    document.body.appendChild(nt);
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
  // 5. 推开手记（落款前的技术介绍页，停够读完）
  ev.notes = n / fps;
  for (let i = 0; i < Math.round(7.0 * fps); i++) {
    const t = i / fps;
    await page.evaluate((t) => {
      const cl = (x) => Math.max(0, Math.min(1, x));
      document.getElementById('notes').style.opacity = cl(t / 0.5);
      document.querySelectorAll('#notes .row').forEach((r, k) => { r.style.opacity = cl((t - 0.5 - k * 0.25) / 0.5); });
    }, t);
    await shot();
  }
  // 6. 落款页
  ev.end = n / fps; ev.seal = ev.end + 1.4; ev.thumb = ev.end + 2.4;
  for (let i = 0; i < Math.round(5.2 * fps); i++) {
    const t = i / fps;
    await page.evaluate((t) => {
      const cl = (x) => Math.max(0, Math.min(1, x)), ease = (x) => (x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
      document.getElementById('endcard').style.opacity = cl(t / 0.5);
      document.getElementById('ecHand').setAttribute('opacity', cl((t - 0.5) / 0.5));
      const stamp = (id, t0) => { const f = cl((t - t0) / 0.22); const sc = t < t0 ? 0 : 1.6 - 0.6 * ease(f); document.getElementById(id).setAttribute('transform', `scale(${sc}) rotate(${-6 * (1 - f)})`); };
      stamp('sealS', 1.4); document.getElementById('seal').setAttribute('opacity', t >= 1.4 ? 1 : 0);
      stamp('thumbS', 2.4); document.getElementById('thumb').setAttribute('opacity', t >= 2.4 ? 1 : 0);
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
