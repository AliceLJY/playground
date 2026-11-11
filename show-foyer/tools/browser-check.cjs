// 浏览器验收（README 验收 3、4、5、6、8）：四个视口 × 三个固定机位，截图 + 读钩子。
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <page-url> <out-dir>
// 视口按「扣掉浏览器栏」的手机尺寸：iPhone Safari 390×664、安卓 Chrome 412×700、横屏 844×340，加一档电脑 1280×720。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const [url, out] = process.argv.slice(2);
  if (!url) { console.error('用法：node tools/browser-check.cjs <page-url> <out-dir>'); process.exit(2); }
  fs.mkdirSync(out || 'check-out', { recursive: true });
  const VPS = [['iphone-390x664', 390, 664], ['android-412x700', 412, 700], ['landscape-844x340', 844, 340], ['desktop-1280x720', 1280, 720]];
  const VIEWS = ['first', 'busy', 'full'];
  const b = await chromium.launch();
  let fail = 0;
  const sep = url.includes('?') ? '&' : '?';
  for (const [tag, w, h] of VPS) {
    for (const view of VIEWS) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 900 });
      const p = await ctx.newPage();
      const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await p.goto(`${url}${sep}view=${view}&t=6&mute=1`);
      await p.waitForFunction(() => window.__foyer && window.__foyer.ready, null, { polling: 100 });
      await p.waitForTimeout(200);
      // 入门状态先验，再落座，防止座椅标签遮住自己的圆环和名签。
      const door = await p.evaluate(() => {
        const canvas = document.getElementById('scene'), c = canvas.getContext('2d');
        const originalText = c.fillText, originalArc = c.arc, labels = [], rings = [];
        const kx = canvas.width / __foyer.geometry.canvas.width, ky = canvas.height / __foyer.geometry.canvas.height;
        c.fillText = function (text, x, y, ...args) {
          if (this.globalAlpha > 0.15 && (text === '我' || text === '身影 · 非真人' || text.startsWith('你 · '))) {
            const m = this.measureText(text), t = this.getTransform();
            labels.push({ text, left: (t.a * (x - m.actualBoundingBoxLeft) + t.e) / kx, right: (t.a * (x + m.actualBoundingBoxRight) + t.e) / kx, top: (t.d * (y - m.actualBoundingBoxAscent) + t.f) / ky, bottom: (t.d * (y + m.actualBoundingBoxDescent) + t.f) / ky });
          }
          return originalText.call(this, text, x, y, ...args);
        };
        c.arc = function (x, y, radius, start, end, ...args) {
          if (this.strokeStyle === '#f7dc9a' && this.lineWidth === 2 && end - start >= Math.PI * 2 - 0.001) {
            const t = this.getTransform(), r = radius + this.lineWidth / 2;
            rings.push({ left: (t.a * (x - r) + t.e) / kx, right: (t.a * (x + r) + t.e) / kx, top: (t.d * (y - r) + t.f) / ky, bottom: (t.d * (y + r) + t.f) / ky });
          }
          return originalArc.call(this, x, y, radius, start, end, ...args);
        };
        try { __foyer.step(0); } finally { c.fillText = originalText; c.arc = originalArc; }
        const markers = [...rings, ...labels.filter(b => b.text === '我')];
        const audience = labels.filter(b => b.text !== '我');
        const clashes = audience.filter(b => markers.some(a => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)));
        return { phase: __foyer.snapshot().phase, rings, labels, clashes };
      });
      fs.writeFileSync(path.join(out, `${tag}-${view}-door.json`), JSON.stringify(door, null, 2));
      await p.screenshot({ path: path.join(out, `${tag}-${view}-door.png`) });
      // 固定机位里先落座，再读状态
      await p.evaluate(() => { window.__foyer.act(0); window.__foyer.step(100); });
      const r = await p.evaluate(() => {
        const btns = [...document.querySelectorAll('#bar button')].map((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { text: el.textContent, box: r.toJSON(), hit: hit === el, disabled: el.disabled }; });
        const canvas = document.getElementById('scene').getBoundingClientRect();
        return { btns, canvas: canvas.toJSON(), vw: innerWidth, vh: innerHeight, scrollable: document.documentElement.scrollHeight > innerHeight + 1 || document.body.scrollHeight > innerHeight + 1, snap: window.__foyer.snapshot() };
      });
      await p.screenshot({ path: path.join(out, `${tag}-${view}.png`) });
      // 动作响应：按鼓掌，100 ms 内画面状态要变、要有音效名
      const before = r.snap.frameStamp;
      await p.evaluate(() => { window.__foyer.pause(false); });
      await p.click('#bar button[data-act="2"]');
      await p.waitForTimeout(100);
      const after = await p.evaluate(() => window.__foyer.snapshot());
      const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      let anyOverlap = false;
      for (let i = 0; i < r.btns.length; i++) for (let j = i + 1; j < r.btns.length; j++) if (overlap(r.btns[i].box, r.btns[j].box)) anyOverlap = true;
      const halls = r.snap.halls.map((t) => [t.no, t.count]);
      const expect = { first: { halls: [[1, 1]], hall: 1, residents: 3 }, busy: { halls: [[1, 12], [2, 1]], hall: 2, residents: 3 }, full: { halls: [[1, 10]], hall: 1, residents: 0 } }[view];
      const checks = {
        doorMarkerSampled: door.phase === 'door' && door.rings.length === 1 && door.labels.some(b => b.text === '我') && (view === 'full' || door.labels.filter(b => b.text === '身影 · 非真人').length === 3),
        doorMarkerNoLabelOverlap: door.clashes.length === 0,
        noPageErrors: errors.length === 0,
        notScrollable: !r.scrollable,
        buttonsInside: r.btns.every((x) => x.box.left >= -1 && x.box.right <= r.vw + 1 && x.box.top >= -1 && x.box.bottom <= r.vh + 1),
        buttonsHit: r.btns.every((x) => x.hit),
        buttonsNoOverlap: !anyOverlap,
        sixButtons: r.btns.length === 6,
        canvasTall: r.canvas.height >= Math.min(260, r.vh * 0.45),
        seatedHall: r.snap.phase === 'seated' && r.snap.hall === expect.hall,
        hallsMatch: JSON.stringify(halls) === JSON.stringify(expect.halls),
        residentsMatch: r.snap.residents === expect.residents,
        clapResponds: after.frameStamp > before && after.claps === r.snap.claps + 1 && after.lastSound === 'clap' && after.effects.includes('ripple'),
      };
      if (view === 'full') {
        await p.goto(`${url}${sep}view=full&t=9.1&mute=1`);
        await p.waitForFunction(() => window.__foyer && window.__foyer.ready, null, { polling: 100 });
        await p.click('#bar button[data-act="0"]');
        const labels = await p.evaluate(() => {
          const canvas = document.getElementById('scene'), c = canvas.getContext('2d'), original = c.fillText, boxes = [];
          const scale = canvas.width / __foyer.geometry.canvas.width;
          c.fillText = function (text, x, y, ...args) {
            if (this.globalAlpha > 0.15) {
              const m = this.measureText(text), t = this.getTransform();
              boxes.push({ text, left: (t.a * (x - m.actualBoundingBoxLeft) + t.e) / scale, right: (t.a * (x + m.actualBoundingBoxRight) + t.e) / scale, top: (t.d * (y - m.actualBoundingBoxAscent) + t.f) / scale, bottom: (t.d * (y + m.actualBoundingBoxDescent) + t.f) / scale });
            }
            return original.call(this, text, x, y, ...args);
          };
          try { __foyer.step(0); } finally { c.fillText = original; }
          const clashes = [];
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) clashes.push([a.text, b.text]);
          }
          return { boxes, clashes, geometry: __foyer.geometry };
        });
        checks.bubbleSampled = labels.boxes.some(b => b.text === '👏');
        checks.canvasLabelsNoOverlap = labels.clashes.length === 0;
        checks.canvasLabelsInside = labels.boxes.every(b => b.left >= -0.5 && b.right <= labels.geometry.canvas.width + 0.5 && b.top >= -0.5 && b.bottom <= labels.geometry.canvas.height + 0.5);
        fs.writeFileSync(path.join(out, `${tag}-labels.json`), JSON.stringify(labels, null, 2));
        await p.screenshot({ path: path.join(out, `${tag}-labels.png`) });
      }
      const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      if (bad.length) fail++;
      console.log(`${bad.length ? 'FAIL' : 'ok  '} ${tag} ${view}  halls=${JSON.stringify(halls)} residents=${r.snap.residents} lamps=${r.snap.lamps}${bad.length ? '  ← ' + bad.join(', ') : ''}${errors.length ? '  errors: ' + errors.join(' | ') : ''}`);
      await ctx.close();
    }
  }
  // 第 13 组：手机竖屏 + full 机位，时间线推到 301 秒——三遍铃都补上、幕布拉开、场灯最暗、动作按钮全禁
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, hasTouch: true });
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`${url}${sep}view=full&t=301&mute=1`);
    await p.waitForFunction(() => window.__foyer && window.__foyer.ready, null, { polling: 100 });
    await p.waitForTimeout(3000);
    const r = await p.evaluate(() => ({ snap: window.__foyer.snapshot(), off: [...document.querySelectorAll('#bar button[data-act]')].every((e) => e.disabled) }));
    await p.screenshot({ path: path.join(out, 'iphone-390x664-curtain.png') });
    const checks = { noPageErrors: errors.length === 0, bellsAll: JSON.stringify(r.snap.bells) === '[1,2,3]', curtainPhase: r.snap.phase === 'curtain' && r.snap.curtainOpen, lightLow: r.snap.light === 0.2, buttonsOff: r.off, overlay: r.snap.curtainOverlay };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (bad.length) fail++;
    console.log(`${bad.length ? 'FAIL' : 'ok  '} iphone-390x664 curtain(t=301)  bells=${JSON.stringify(r.snap.bells)} light=${r.snap.light}${bad.length ? '  ← ' + bad.join(', ') : ''}`);
    await ctx.close();
  }
  await b.close();
  console.log(fail ? `${fail} 组未过` : `全部 ${VPS.length * VIEWS.length + 1} 组通过`);
  process.exit(fail ? 1 : 0);
})();
