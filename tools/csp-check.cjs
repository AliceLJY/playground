#!/usr/bin/env node
// 带 CSP 的单文件页面在真浏览器里会不会被自己的策略拦住：逐页打开，记下每一次 CSP 违规、每一个不是 data: / blob: / 页面本身的请求、
// 页面报错，最后截一张图。2026-11-21 随 tools/csp.mjs 一起立。
// 用法（先在各页目录跑 node tools/build.mjs 生成 dist/，再在仓库根目录起静态服务）：
//   python3 -m http.server 8932 --bind 127.0.0.1 &
//   NODE_PATH="$(npm root -g)" node tools/csp-check.cjs http://127.0.0.1:8932/ /tmp/csp-shots [只查这几页的名字…]
// 读法：每页 csp=1、violations 为空、external 为空才算过；errs 列出页面自己的报错（可能与 CSP 无关，要看内容）。
// 校准：tools/csp-check-bad.html 是故意违规的页（联网 fetch + 外部图片），它必须报出违规，否则脚本本身失灵。
const { chromium } = require('playwright');
const fs = require('fs');
const [base, out, ...only] = process.argv.slice(2);
const all = [
  ['_bad-control', 'tools/csp-check-bad.html'],
  ['dino-craft', 'dino-craft/dist/'], ['diorama-walk', 'diorama-walk/dist/'], ['floorplan-walk', 'floorplan-walk/dist/'],
  ['gz-roach', 'gz-roach/dist/'], ['huacheng-autumn', 'huacheng-autumn/dist/'], ['lens-lab', 'lens-lab/dist/'],
  ['lingnan-garden', 'lingnan-garden/dist/'], ['mac-mini-teardown', 'mac-mini-teardown/dist/'], ['orbital-station', 'orbital-station/dist/'], ['qilou-rain', 'qilou-rain/dist/'],
  ['sacred-heart', 'sacred-heart-cathedral/dist/'], ['sagrada-familia', 'sagrada-familia/dist/'], ['sky-citadel', 'sky-citadel/dist/'],
  ['prehistoric-island', 'prehistoric-island/dist/'],
  ['painterly-peacock', 'painterly-peacock/dist/'],
  ['snowline-cabin', 'snowline-cabin/dist/'], ['thirteen-hongs', 'thirteen-hongs/dist/index.html'],
  ['thirteen-webgpu', 'thirteen-hongs/dist/webgpu.html'], ['tidal-disruption', 'tidal-disruption/dist/'],
];
const pages = only.length ? all.filter(([n]) => n === '_bad-control' || only.includes(n)) : all;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const report = {};
  for (const [name, p] of pages) {
    const url = base + p;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const external = [], errs = [];
    await page.addInitScript(() => {
      window.__cspv = [];
      document.addEventListener('securitypolicyviolation', e => window.__cspv.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    page.on('request', r => { const u = r.url(); if (!/^(data|blob):/.test(u) && u.split('#')[0] !== url && u !== url.replace(/\/$/, '/index.html')) external.push(u.slice(0, 120)); });
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    page.on('worker', w => w.on('console', m => { if (m.type() === 'error') errs.push('[worker] ' + m.text().slice(0, 160)); }));
    try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); } catch (e) { errs.push('goto: ' + String(e).slice(0, 120)); }
    await sleep(8000);
    await page.mouse.click(195, 600).catch(() => {}); // 点一下：有的页要点开始才会起音频、Worker
    await sleep(4000);
    const violations = await page.evaluate(() => window.__cspv).catch(() => ['(evaluate failed)']);
    const csp = await page.evaluate(() => document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length).catch(() => -1);
    await page.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
    report[name] = { csp, violations: [...new Set(violations)], external: [...new Set(external)], errs: [...new Set(errs)].slice(0, 6) };
    console.log(name, JSON.stringify(report[name]));
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  const bad = report['_bad-control'];
  const fails = Object.entries(report).filter(([n, r]) => n !== '_bad-control' && (r.csp !== 1 || r.violations.length || r.external.length)).map(([n]) => n);
  if (!bad || !bad.violations.length) { console.log('CONTROL FAILED: the deliberately bad page reported no violation, the check is blind'); process.exit(2); }
  console.log(fails.length ? 'FAIL: ' + fails.join(', ') : `PASS: ${Object.keys(report).length - 1} pages, control caught ${bad.violations.length} violation(s)`);
  process.exit(fails.length ? 1 : 0);
})();
