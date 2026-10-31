// 开局 30 秒 · 真实输入走一遍（AGENTS.md §3）：390×664，不带固定机位参数，用真实点击：
// 落座 → 点灯 → 鼓掌 → 点戏台拍照 → 翻节目单 → 离席 → 再落座，看「你 · 刚才」有没有坐进来 → 给它递茶 → 试听锣 → 合影
// → 快进到一铃、二铃（场灯暗）、三铃开演（幕布拉开、覆盖层）→ 等下一场。
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
  // 点戏台拍照（真实点击画布上半部），再点台口左侧的节目单翻两页
  const rect = await p.$eval('#scene', (c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const stageH = Math.min(rect.h * 0.36, 230);
  await p.mouse.click(rect.x + rect.w / 2, rect.y + stageH * 0.4); await p.waitForTimeout(500); const s3b = await shot('03b-snap');
  await p.mouse.click(rect.x + 8 + 17, rect.y + stageH * 0.72 + 8 + 12); await p.waitForTimeout(400); const s3c = await shot('03c-programme');
  await p.click('#progNext'); await p.waitForTimeout(250); await p.click('#progNext'); await p.waitForTimeout(250); const s3d = await shot('03d-programme-p3');
  await p.click('[data-close="programmeOverlay"]'); await p.waitForTimeout(200);
  await tap(4); await p.waitForTimeout(1800); const s5 = await shot('05-leave-and-reenter');
  await tap(0); await p.waitForTimeout(700); const s6 = await shot('06-sit-again');
  const teaEnabled = await p.$eval('#bar button[data-act="3"]', (el) => !el.disabled);
  if (teaEnabled) { await tap(3); await p.waitForTimeout(1200); }
  const s7 = await shot('07-tea');
  await p.click('#gongBtn'); await p.waitForTimeout(500); const s8 = await shot('08-gong');
  await p.click('[data-close="gongOverlay"]'); await p.waitForTimeout(200);
  await p.click('#btnPhoto'); await p.waitForTimeout(600); const s9 = await shot('09-photo');
  await p.click('[data-close="photoOverlay"]'); await p.waitForTimeout(200);
  // 快进：开演前 183 秒 → 3 秒后一铃；前 62 秒 → 二铃，场灯开始暗；前 1 秒 → 三铃开演，幕布拉开，覆盖层
  await p.evaluate(() => window.__foyer.jumpTo(183)); await p.waitForTimeout(3600); const s10 = await shot('10-bell1');
  await p.evaluate(() => window.__foyer.jumpTo(62)); await p.waitForTimeout(2600); const s11 = await shot('11-bell2-dim');
  await p.evaluate(() => window.__foyer.jumpTo(1)); await p.waitForTimeout(1600); const s12 = await shot('12-curtain-up');
  await p.waitForTimeout(2600); const s13 = await shot('13-curtain-overlay');
  const buttonsOff = await p.$$eval('#bar button[data-act]', (els) => els.every((e) => e.disabled));
  await p.click('#nextShowBtn'); await p.waitForTimeout(500); const s14 = await shot('14-next-show');
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
    '03b 点戏台拍照：拍舞台 1 张，有快门声名': s3b.snaps === 1 && s3b.lastSound === 'shutter',
    '03c 点台口节目单：翻开在第 1 页': s3c.programmeOpen === true && s3c.programmePage === 0,
    '03d 翻两页到「英歌是什么」': s3d.programmePage === 2 && s3d.programmeTitle === '英歌是什么',
    '10 一铃：bells=[1]，场灯还亮': s10.bells.length === 1 && s10.bells[0] === 1 && s10.light === 1,
    '11 二铃：bells=[1,2]，场灯变暗': s11.bells.length === 2 && s11.bells[1] === 2 && s11.light < 1,
    '12 三铃开演：phase=curtain，幕布拉开，来访已记下（2 次）': s12.phase === 'curtain' && s12.curtainOpen === true && s12.visits === 2,
    '13 开演覆盖层打开，五个动作按钮全部不可按': s13.curtainOverlay === true && buttonsOff === true,
    '14 等下一场：重新进厅，shows=1，「你 · 刚才」在座': s14.phase === 'door' && s14.shows === 1 && s14.ghostsHere === 2 && s14.curtainOverlay === false,
    '页面无报错': errors.length === 0,
  };
  const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, report, errors }, null, 2));
  for (const [k, v] of Object.entries(checks)) console.log((v ? 'ok  ' : 'FAIL') + ' ' + k);
  console.log(bad.length ? `${bad.length}/${Object.keys(checks).length} 未过` : `全部 ${Object.keys(checks).length} 项通过`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
