#!/usr/bin/env node
// 没有 WebGL 的浏览器里各三维页面有没有给出看得清的说明；顺带确认有 WebGL 时不受影响。
// 2026-11-11 立：十来个页面在打不开 WebGL 的浏览器里直接抛错、卡在空白或「载入中」。
// 用法（先把带 tools/build.mjs 的页面各自打包出 dist/，再在仓库根目录起一个静态服务）：
//   python3 -m http.server 8931 --bind 127.0.0.1 &
//   NODE_PATH="$(npm root -g)" node tools/nogl-check.cjs http://127.0.0.1:8931/ /tmp/nogl-shots
// 读法：nogl 档每页要么有 #nogl 盖层（top:true 表示它确实盖在最上面），要么 loadline / loadLabel 写明了原因；
//       gl 档每页 nogl 为 null、errs 为空。脚本只出读数和截图，拍完要看图。
const { chromium } = require('playwright');
const fs = require('fs');
const base = process.argv[2], out = process.argv[3];
const pages = [['lens-lab','lens-lab/dist/'],['floorplan-walk','floorplan-walk/dist/'],['thirteen-hongs','thirteen-hongs/dist/index.html'],['thirteen-webgpu','thirteen-hongs/dist/webgpu.html'],['lingnan-garden','lingnan-garden/dist/'],['sacred-heart','sacred-heart-cathedral/dist/'],['sagrada-familia','sagrada-familia/dist/'],['diorama-walk','diorama-walk/dist/'],['jianmen-drizzle','jianmen-drizzle/dist/'],['qilou-brawl','qilou-brawl/dist/'],['clockwork','clockwork/'],['shanhe-scroll','shanhe-scroll/'],['floorplan','floorplan/']];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const report = {};
  for (const mode of ['nogl', 'gl']) {
    const args = mode === 'nogl' ? ['--disable-3d-apis', '--disable-gpu'] : ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    const browser = await chromium.launch({ args });
    for (const [name, path] of pages) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage(); const errs = [];
      page.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
      await page.goto(base + path, { waitUntil: 'load', timeout: 60000 }).catch(e => errs.push('goto: ' + e.message.slice(0, 80)));
      const waitMs = mode === 'gl' ? (name === 'qilou-brawl' || name === 'jianmen-drizzle' ? 30000 : 6000) : 3000;
      await sleep(waitMs);
      const r = await page.evaluate(() => {
        const probe = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
        const q = (s) => document.querySelector(s);
        const n = q('#nogl'); let nogl = null;
        if (n) { const cs = getComputedStyle(n), b = n.getBoundingClientRect(); nogl = { text: n.textContent.slice(0, 20), color: cs.color, bg: cs.backgroundColor, w: Math.round(b.width), h: Math.round(b.height), top: document.elementFromPoint(195, 420) === n }; }
        const txt = (s) => q(s) ? q(s).textContent.trim().slice(0, 60) : undefined;
        const lc = q('#labels-container');
        const hint = q('#hint'); const hr = hint ? hint.getBoundingClientRect() : null;
        return { webgl: probe, nogl, loadline: txt('#loadline'), loadLabel: txt('#load-label'),
          labels: lc ? { vis: getComputedStyle(lc).visibility, pos: [...document.querySelectorAll('.gear-label')].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)]; }) } : undefined,
          hint: hr ? { left: Math.round(hr.left), right: Math.round(hr.right), w: Math.round(hr.width), display: getComputedStyle(hint).display } : undefined,
          scrollW: document.documentElement.scrollWidth, jm: window.__jianmen && { ready: window.__jianmen.ready, err: (window.__jianmen.error || '').slice(0, 60) }, ql: window.__qilou && { ready: window.__qilou.ready, err: (window.__qilou.error || '').slice(0, 60) } };
      }).catch(e => ({ evalError: e.message.slice(0, 100) }));
      r.errs = errs.slice(0, 3);
      await page.screenshot({ path: `${out}/${mode}-${name}.png` });
      report[`${mode}/${name}`] = r; console.log(mode, name, JSON.stringify(r));
      await ctx.close();
    }
    await browser.close();
  }
  fs.writeFileSync(out + '/report.json', JSON.stringify(report, null, 1));
})();
