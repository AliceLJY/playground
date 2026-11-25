// Readability checks for two chapter-2 HUD items Duet flagged on 2026-11-25.
// Usage: NODE_PATH="$(npm root -g)" node tools/town-readable-check.cjs <url-to-index> <out-dir>
//  1. The route arrow after a real 60° turn: it must point where the route is, and its glyph must read one way only.
//     The old glyph was a near-equilateral triangle, so turned by ±60° it looked like ▼ and by ±120° like ▲.
//     Measured on pixels: overlap of the cream glyph with itself turned 120°. Calibrated on the real glyphs: the old
//     triangle scores 0.79–0.85 at the angles tried, a notched dart about 0.6, so the bar is 0.7;
//     and the farthest glyph pixel from the centre must lie in the direction the arrow is meant to point.
//  2. Every chapter-2 hint, in each viewport: a line may only end after punctuation (，。、：；) — never inside a word.
const { chromium } = require('playwright');
const [url, out] = process.argv.slice(2);
const results = []; const ok = (name, pass, info) => { results.push({ name, pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };
const wrapDeg = a => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };

// analyse a PNG of the arrow element: tip direction (degrees, 0 = up, clockwise) and 120° self-overlap
async function glyph(page, png) {
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height, cx = W / 2, cy = H / 2;
    const cream = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return false; const i = (y * W + x) * 4; return d[i] > 220 && d[i + 1] > 190 && d[i + 2] > 170; };
    let n = 0, far = 0, tip = null; const both = [0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cream(x, y)) {
      n++; const r = Math.hypot(x - cx, y - cy); if (r > far) { far = r; tip = [x - cx, y - cy]; }
      [120, -120].forEach((a, k) => { const t = a * Math.PI / 180, rx = cx + (x - cx) * Math.cos(t) - (y - cy) * Math.sin(t), ry = cy + (x - cx) * Math.sin(t) + (y - cy) * Math.cos(t); if (cream(rx, ry)) both[k]++; });
    }
    return { pixels: n, tipDeg: Math.atan2(tip[0], -tip[1]) * 180 / Math.PI, overlap120: Math.max(both[0], both[1]) / n };
  }, png.toString('base64'));
}

(async () => {
  const b = await chromium.launch({ headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });

  // ---------- 1. route arrow after a real turn ----------
  for (const [name, w, h, touch] of [['desktop', 1280, 800, false], ['phone-touch', 390, 664, true], ['phone-notouch', 390, 664, false]]) {
    for (const [key, side] of [['KeyD', 'right'], ['KeyA', 'left']]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(url + '?ch=2&seed=3'); await p.waitForTimeout(1200);
      await p.keyboard.press('KeyW'); await p.waitForTimeout(4500);   // 开跑 with a tap of ↑, then the count and the opening swing
      const h0 = (await p.evaluate(() => window.XJT_TOWNVIEW.snapshot().h)) * 180 / Math.PI;
      await p.keyboard.down(key);
      for (let i = 0; i < 80; i++) { await p.waitForTimeout(25); const hh = (await p.evaluate(() => window.XJT_TOWNVIEW.snapshot().h)) * 180 / Math.PI; if (Math.abs(wrapDeg(hh - h0)) >= 60) break; }
      await p.keyboard.up(key); await p.waitForTimeout(900);
      const st = await p.evaluate(() => {
        const V = window.XJT_TOWNVIEW, s = V.snapshot(), sp = V.route().steer, m = getComputedStyle(document.getElementById('t-arrow')).transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
        return { h: s.h, camYaw: s.camYaw, arrow: Math.atan2(m[1], m[0]) * 180 / Math.PI, want: (Math.atan2(sp.x - s.x, -(sp.z - s.z)) - s.camYaw) * 180 / Math.PI };
      });
      const turned = wrapDeg(st.h * 180 / Math.PI - h0);
      ok(`${name} 按 ${key} 转 ${Math.round(turned)}°：箭头角度就是路线下一段相对镜头的方向`, Math.abs(wrapDeg(st.arrow - st.want)) < 3, `arrow ${st.arrow.toFixed(1)}° want ${wrapDeg(st.want).toFixed(1)}°`);
      const png = await (await p.$('#t-arrow')).screenshot({ scale: 'device' });
      const big = await ctx.newPage(); const gl = await glyph(big, png); await big.close();
      ok(`${name} 转向${side === 'right' ? '右' : '左'}后箭头画出来的尖朝着它该指的方向（±15°）`, Math.abs(wrapDeg(gl.tipDeg - st.arrow)) <= 15, `tip ${gl.tipDeg.toFixed(1)}° vs ${st.arrow.toFixed(1)}°`);
      ok(`${name} 转向${side === 'right' ? '右' : '左'}后箭头只读得出一个方向（转 120° 与自己重合 < 0.7）`, gl.overlap120 < 0.7, `overlap ${gl.overlap120.toFixed(2)}`);
      await p.screenshot({ path: `${out}/readable-arrow-${name}-${side}60.png` });
      require('fs').writeFileSync(`${out}/readable-arrow-${name}-${side}60-glyph.png`, png);
      ok(`${name} ${key} 零页面报错`, errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
  }

  // ---------- 2. hints never break inside a word ----------
  const vps = [['desktop', 1280, 800, false], ['phone-touch', 390, 664, true], ['phone-notouch', 390, 664, false], ['landscape-664', 664, 390, true], ['landscape-844', 844, 390, true], ['android', 412, 700, true]];
  for (const [name, w, h, touch] of vps) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url + '?ch=2&seed=3'); await p.waitForTimeout(1200);
    const go = await (await p.$('#t-go')).boundingBox();
    if (touch) await p.touchscreen.tap(go.x + go.width / 2, go.y + go.height / 2); else await p.click('#t-go');
    await p.waitForTimeout(4300);
    const shown = await p.evaluate(() => window.XJT_TOWNVIEW.snapshot().hint);
    ok(`${name}: 3-2-1 之后真的出了开局提示`, shown === 'start', String(shown));
    await p.screenshot({ path: `${out}/readable-hint-${name}-start.png` });
    for (const id of ['start', 'dock', 'ride', 'nobike', 'grass', 'stop']) {
      const r = await p.evaluate(id => {
        const el = document.getElementById('hint'); el.hidden = false; el.innerHTML = window.XJT_TOWNVIEW.hintText(id);
        const lines = []; let top = null;
        const walk = n => { if (n.nodeType === 3) { for (let i = 0; i < n.length; i++) { const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1); const q = rg.getClientRects()[0]; if (!q || !q.width) continue; const t = Math.round(q.top); if (top === null || Math.abs(t - top) > 4) { lines.push(''); top = t; } lines[lines.length - 1] += n.data[i]; } } else n.childNodes.forEach(walk); };
        walk(el); const b = el.getBoundingClientRect();
        // no other piece of the HUD may sit under the hint
        const others = ['.t-card', '#t-map', '.key.act', '.key.up', '.key.left', '.key.right', '.key.down'].map(s => document.querySelector(s)).filter(e => e && !e.closest('[hidden]')).map(e => e.getBoundingClientRect())
          .filter(o => o.width && o.left < b.right && b.left < o.right && o.top < b.bottom && b.top < o.bottom).length;
        return { lines: lines.map(s => s.trim()).filter(Boolean), box: { x: b.x, y: b.y, w: b.width, h: b.height }, vw: innerWidth, vh: innerHeight, others };
      }, id);
      const badBreaks = r.lines.slice(0, -1).filter(l => !/[，。、：；！？]$/.test(l));
      const inView = r.box.x >= 0 && r.box.y >= 0 && r.box.x + r.box.w <= r.vw + 0.5 && r.box.y + r.box.h <= r.vh + 0.5;
      ok(`${name}: 提示「${id}」只在标点后折行，在屏内、不压别的读数和按键`, badBreaks.length === 0 && inView && r.others === 0, JSON.stringify(r.lines) + (inView ? '' : ' 出屏') + (r.others ? ` 压住 ${r.others} 个` : ''));
    }
    ok(`${name}: 零页面报错`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  const fails = results.filter(r => !r.pass);
  console.log(`${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
