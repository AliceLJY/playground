// 开局 30 秒 · 真实输入走一遍（AGENTS.md §3）：390×664，不带固定机位参数，用真实点击：
// 落座 → 点灯 → 鼓掌 → 递茶（没邻座，提示先温着）→ 离席 → 再落座，看「你 · 刚才」有没有坐进来 → 给它递茶 → 试听锣 → 合影。
// 每步拍图写进 out 目录，report.json 记状态。
//   NODE_PATH="$(npm root -g)" node tools/walkthrough.cjs <page-url> <out-dir>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const [url, out] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const report = [];
  const snap = () => p.evaluate(() => window.__foyer.snapshot());
  const shot = async (name) => { await p.screenshot({ path: path.join(out, name + '.png') }); const s = await snap(); report.push({ step: name, ...s }); return s; };
  const tap = (code) => p.click(`#bar button[data-act="${code}"]`);
  await p.goto(url + (url.includes('?') ? '&' : '?') + 'mute=1');
  await p.evaluate(() => localStorage.removeItem('show-foyer-visits'));
  await p.reload();
  await p.waitForFunction(() => window.__foyer && window.__foyer.ready, null, { polling: 100 });
  await p.waitForTimeout(400);
  const s0 = await shot('00-door');
  await tap(0); await p.waitForTimeout(700); const s1 = await shot('01-sit');
  await tap(1); await p.waitForTimeout(600); const s2 = await shot('02-lamp');
  await tap(2); await p.waitForTimeout(400); const s3 = await shot('03-clap');
  const teaDisabled = await p.$eval('#bar button[data-act="3"]', (el) => el.disabled);
  await tap(4); await p.waitForTimeout(1800); const s5 = await shot('05-leave-and-reenter');
  await tap(0); await p.waitForTimeout(700); const s6 = await shot('06-sit-again');
  const teaEnabled = await p.$eval('#bar button[data-act="3"]', (el) => !el.disabled);
  if (teaEnabled) { await tap(3); await p.waitForTimeout(1200); }
  const s7 = await shot('07-tea');
  await p.click('#gongBtn'); await p.waitForTimeout(500); const s8 = await shot('08-gong');
  await p.click('[data-close="gongOverlay"]'); await p.waitForTimeout(200);
  await p.click('#btnPhoto'); await p.waitForTimeout(600); const s9 = await shot('09-photo');
  const checks = {
    '00 进门站着，顶栏有位': s0.phase === 'door' && /有位/.test(s0.hallTag),
    '01 落座后在第 1 厅，三个灰影陪坐': s1.phase === 'seated' && s1.hall === 1 && s1.residents === 3 && s1.lastSound === 'sit',
    '02 点灯：灯数 1，台前有灯': s2.lamps === 1 && s2.lastSound === 'lamp',
    '03 鼓掌：掌声 1，有涟漪': s3.claps === 1 && s3.lastSound === 'clap',
    '04 没邻座时递茶按钮不可按': teaDisabled === true,
    '05 离席后来访记了 1 次并重新进厅': s5.visits === 1 && s5.phase === 'door',
    '06 再落座：「你 · 刚才」坐进来，灰影减到 2': s6.phase === 'seated' && s6.ghostsHere === 1 && s6.residents === 2,
    '07 回放坐在邻座，递茶按钮可按并递出一杯': teaEnabled === true && s7.teas === 1,
    '08 锣：覆盖层打开，有锣声名': s8.gongOpen === true && s8.lastSound === 'gong',
    '09 合影：覆盖层打开': s9.photoOpen === true,
    '页面无报错': errors.length === 0,
  };
  const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, report, errors }, null, 2));
  for (const [k, v] of Object.entries(checks)) console.log((v ? 'ok  ' : 'FAIL') + ' ' + k);
  console.log(bad.length ? `${bad.length}/${Object.keys(checks).length} 未过` : `全部 ${Object.keys(checks).length} 项通过`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
