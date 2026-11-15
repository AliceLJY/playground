// 浏览器验收：SPEC.md 的 B1–B7。手动运行，需要全局 Playwright 和 Google Chrome。单进程跑（并行会抢 GPU）。
//   node tools/build.mjs
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <输出目录> [页面地址]
// 不给地址就打开本地 dist/index.html。把 report.json 和截图写进输出目录。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const out = path.resolve(process.argv[2] || 'browser-check');
const base = process.argv[3] || 'file://' + path.resolve(__dirname, '../dist/index.html');
fs.mkdirSync(out, { recursive: true });
const pageUrl = base.split('?')[0];
// 比对请求路径按页面所在目录换算（本地在 dist/，线上在 /playground/mac-mini-teardown/）
const isExternal = (u) => !(u.startsWith('data:') || u.startsWith('blob:')) && (base.startsWith('file:') ? u.split('?')[0] !== pageUrl : new URL(u).origin !== new URL(base).origin || !new URL(u).pathname.startsWith(new URL(base).pathname.replace(/[^/]*$/, '')));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  const report = { base, browser: browser.version(), when: new Date().toISOString(), checks: [] };
  const check = (id, name, pass, detail) => { report.checks.push({ id, name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name} — ${detail}`); };
  const errors = [], external = [];
  const open = async (query, w, h, dpr = 1) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 600, isMobile: w < 600 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${query} ${w}x${h}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${query} ${w}x${h}: ${m.type()} ${m.text()}`); });
    page.on('request', (r) => { if (isExternal(r.url())) external.push(r.url()); });
    await page.goto(base + query);
    await page.waitForFunction(() => window.__mini && window.__mini.ready, null, { polling: 100, timeout: 20000 });
    return { ctx, page };
  };
  const rects = (page, sels) => page.evaluate((ss) => ss.map((s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || +cs.opacity < 0.05) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { s, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom } : null; }).filter(Boolean), sels);
  const inter = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

  // B2 走完导览：每 2 秒定格一次，机器主体（屏幕包围盒，不含螺丝盘与已拿走的零件）在画面内，被界面挡住不超过 15%
  // 手机档不带 ?capture（那是录片版式）；录片竖屏 540×960 另量一档
  for (const [w, h, dpr, tag, q] of [[1365, 900, 1, 'desk', '?capture'], [390, 664, 2, 'phone', '?at=0'], [540, 960, 1, 'film-tall', '?capture']]) {
    const { ctx, page } = await open(q, w, h, dpr);
    const T = await page.evaluate(() => window.__mini.TOUR_S);
    const bad = []; let worst = 0, n = 0;
    for (let t = 0; t < T; t += 2) {
      await page.evaluate((x) => window.__mini.render(x), t);
      const { s, view } = await page.evaluate(() => window.__mini.state());
      if (view.includes('show') || s >= 22) continue; // SSD 特写与总结：主角是悬起来的 SSD 或总结卡，不量机身
      const b = await page.evaluate(() => window.__mini.box());
      const box = { x0: b.x0 * w, x1: b.x1 * w, y0: b.y0 * h, y1: b.y1 * h }, area = (box.x1 - box.x0) * (box.y1 - box.y0);
      const ui = await rects(page, ['.title h1', '.cards', '.dialbox', '.stepbar', '.side', '.desc', '.narr']);
      // 视口外那部分也算「看不到」
      const vis = inter(box, { x0: 0, y0: 0, x1: w, y1: h });
      const cover = ui.reduce((a, r) => a + inter(box, r), 0) + (area - vis);
      const frac = cover / area; worst = Math.max(worst, frac); n++;
      if (frac > 0.15) bad.push(`t=${t} ${(frac * 100).toFixed(0)}%`);
    }
    check('B2', `${tag} ${w}×${h} 走完导览，机器主体被界面挡住或出框不超过 15%`, bad.length === 0, `量了 ${n} 帧，最差 ${(worst * 100).toFixed(1)}%${bad.length ? '；超标 ' + bad.join(', ') : ''}`);
    await page.screenshot({ path: path.join(out, `B2-${tag}-end.png`) });
    await ctx.close();
  }

  // B3 第 0 帧：整台机器与读数卡都在（分享卡、录片封面）
  for (const [w, h, dpr, tag] of [[1365, 900, 1, 'desk'], [540, 960, 2, 'film-tall'], [1920, 1080, 1, 'film-wide']]) {
    const { ctx, page } = await open('?capture', w, h, dpr);
    await page.evaluate(() => window.__mini.render(0));
    const b = await page.evaluate(() => window.__mini.box()), st = await page.evaluate(() => window.__mini.state());
    const cards = await rects(page, ['.cards']);
    const inside = b.x0 > 0.02 && b.x1 < 0.98 && b.y0 > 0.02 && b.y1 < 0.98;
    check('B3', `${tag} 第 0 帧就有整台机器和读数卡`, inside && cards.length === 1 && st.counters.steps === 0, `机器框 x ${b.x0.toFixed(2)}–${b.x1.toFixed(2)} y ${b.y0.toFixed(2)}–${b.y1.toFixed(2)}，读数卡${cards.length ? '在' : '不在'}`);
    await page.screenshot({ path: path.join(out, `B3-${tag}.png`) });
    await ctx.close();
  }

  // B9 读数卡「步数」与步骤栏步号、旋钮中间的数在每个旁白节拍上一致（读的是页面上实际显示的字）
  {
    const { ctx, page } = await open('?capture', 1365, 900, 1);
    const beats = await page.evaluate(() => window.__mini.beats()); const bad = [];
    for (const b of beats) {
      const t = +(b + 0.6).toFixed(2);
      const v = await page.evaluate((x) => { window.__mini.render(x); const n = (sel) => parseInt(document.querySelector(sel).textContent, 10); return { card: n('#cSteps .v span'), bar: n('#stepNo'), dial: n('#dialNo') }; }, t);
      if (v.card !== v.bar || v.dial !== v.bar) bad.push(`t=${t} 卡 ${v.card} 栏 ${v.bar} 钮 ${v.dial}`);
    }
    check('B9', '读数卡步数、步骤栏步号、旋钮的数在每个节拍上一致', bad.length === 0, bad.length ? `对不上 ${bad.length}/${beats.length} 处：` + bad.slice(0, 4).join('；') : `${beats.length} 个节拍都一致`);
    await ctx.close();
  }

  // 录片竖屏安全区：要读的字只在 y 84–740 CSS（×2 = 168–1480），右侧 x>465 且 y 440–750 不放字
  {
    const { ctx, page } = await open('?capture', 540, 960, 2);
    const T = await page.evaluate(() => window.__mini.TOUR_S); const bad = [];
    for (let t = 0; t < T; t += 1) {
      await page.evaluate((x) => window.__mini.render(x), t);
      const rs = await rects(page, ['.kicker', '.title h1', '.foot', '.cards', '.narr', '.stepbar', '#tag1', '#tag2', '.summary']);
      for (const r of rs) {
        if (r.y0 < 84 || r.y1 > 740) bad.push(`t=${t} ${r.s} y ${r.y0.toFixed(0)}–${r.y1.toFixed(0)}`);
        if ((r.s === '#tag1' || r.s === '#tag2') && r.x1 > 465 && r.y1 > 440 && r.y0 < 750) bad.push(`t=${t} ${r.s} 进了右侧按钮栏`);
      }
    }
    check('B8', '录片竖屏：文字都在 y 84–740 CSS 的安全区里，标注不进右侧按钮栏', bad.length === 0, bad.length ? bad.slice(0, 6).join('；') : '逐秒查了全片');
    await ctx.close();
  }

  // B4 玩家默认档：导览自己在走；点「下一步」接管、读数跟着变；静置后回到导览（?idle=6 缩短等待）
  {
    const { ctx, page } = await open('?idle=6', 1365, 900, 1);
    await page.waitForTimeout(1500);
    const a = await page.evaluate(() => window.__mini.state());
    check('B4', '无参数入口导览自己在走', a.mode === 'tour' && a.tourClock > 0.5, `mode=${a.mode} tourClock=${a.tourClock.toFixed(2)}`);
    const info = await page.evaluate(() => window.__mini.info());
    report.renderer = info.renderer; report.drawCalls = info.calls; report.pixelRatio = info.pixelRatio;
    check('B7', '绘制调用不超过 400；渲染器不是软件渲染', info.calls <= 400 && !/SwiftShader/i.test(info.renderer), `${info.calls} calls · ${info.renderer}`);
    await page.click('#next'); await page.waitForTimeout(150);
    const b = await page.evaluate(() => window.__mini.state());
    await page.click('#next'); await page.click('#next'); await page.waitForTimeout(2500);
    const c = await page.evaluate(() => window.__mini.state());
    check('B4', '点「下一步」接管，进度往前走', b.mode === 'live' && c.s > b.s + 0.5 && c.target >= 3, `接管后 mode=${b.mode} s ${b.s.toFixed(2)} → ${c.s.toFixed(2)}，目标 ${c.target.toFixed(0)}`);
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(1500);
    const d = await page.evaluate(() => window.__mini.state());
    check('B4', '← 往回拆（装回去）', d.s < c.s, `s ${c.s.toFixed(2)} → ${d.s.toFixed(2)}`);
    await page.waitForTimeout(6800);
    const e = await page.evaluate(() => window.__mini.state());
    check('B4', '静置超过交还时间回到导览', e.mode === 'tour', `mode=${e.mode}`);
    // 旋钮：拖到右下末端，目标应接近拆完
    const r = (await rects(page, ['#dial']))[0];
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    await page.mouse.move(cx, cy - 30); await page.mouse.down(); await page.mouse.move(cx + 30, cy + 25, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(200);
    const f = await page.evaluate(() => window.__mini.state());
    check('B4', '拖旋钮设定进度并吸附到整步', f.mode === 'live' && f.target >= 17 && Number.isInteger(f.target), `目标 ${f.target}`);
    await ctx.close();
  }

  // B5 手机视口：控件命中区至少 44×44，中心点得中；底栏在屏内
  for (const [w, h] of [[390, 664], [412, 700], [360, 600]]) {
    const { ctx, page } = await open('', w, h, 2);
    await page.waitForTimeout(400);
    const res = await page.evaluate(() => ['#prev', '#next', '#dial'].map((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { s, w: r.width, h: r.height, in: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, hit: !!hit && (hit === e || e.contains(hit)) }; }));
    const bad = res.filter((x) => x.w < 44 || x.h < 44 || !x.in || !x.hit);
    // 读数卡、步骤栏、控件互不重叠
    const rs = await rects(page, ['.cards', '.stepbar', '.dialbox', '.title h1']); const ov = [];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (inter(rs[i], rs[j]) > 1) ov.push(rs[i].s + '×' + rs[j].s);
    check('B5', `手机 ${w}×${h}：上一步 / 下一步 / 旋钮至少 44×44、在屏内、点得中；面板互不重叠`, bad.length === 0 && ov.length === 0, res.map((x) => `${x.s} ${x.w.toFixed(0)}×${x.h.toFixed(0)}${x.hit ? '' : ' 点不中'}${x.in ? '' : ' 出屏'}`).join('，') + (ov.length ? '；重叠 ' + ov.join(' ') : ''));
    await page.screenshot({ path: path.join(out, `B5-${w}x${h}.png`) });
    await ctx.close();
  }

  // B6 录片只取决于时间：?capture 下跳到某一刻立刻截与等 1 秒再截，差异像素 < 0.05%
  {
    const { ctx, page } = await open('?capture', 540, 960, 1);
    let worst = 0;
    for (const [from, to] of [[6.0, 7.7], [24.0, 25.1], [33.0, 35.3], [47.0, 48.2]]) {
      await page.evaluate((x) => window.__mini.render(x), from); await page.waitForTimeout(500);
      await page.evaluate((x) => window.__mini.render(x), to); const a = await page.screenshot();
      await page.waitForTimeout(1000); const b = await page.screenshot();
      const diff = await page.evaluate(async ([x, y]) => { const load = async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
        const p = await load(x), q = await load(y); let n = 0; for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 24) n++; return n / (p.length / 4); }, [a.toString('base64'), b.toString('base64')]);
      worst = Math.max(worst, diff);
    }
    check('B6', '录片模式下画面只取决于时间', worst < 0.0005, `四处跳转，最大差异像素 ${(worst * 100).toFixed(3)}%`);
    await ctx.close();
  }

  if (base.startsWith('file:')) { const kb = fs.statSync(pageUrl.replace('file://', '')).size / 1024; check('B7', '单文件小于 1 MB', kb < 1024, `${kb.toFixed(0)} KB`); }
  check('B1', '页面无报错、不向外部请求任何东西', errors.length === 0 && external.length === 0, `报错 ${errors.length} 条${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}；外部请求 ${external.length} 个${external.length ? '：' + external.slice(0, 3).join(' ') : ''}`);
  report.errors = errors; report.external = external;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.pass).length;
  console.log(failed ? `${failed} 项未通过` : '全部通过');
  await browser.close(); process.exit(failed ? 1 : 0);
})();
