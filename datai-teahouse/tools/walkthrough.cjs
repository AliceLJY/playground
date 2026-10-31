// 开局 30 秒 · 真实输入走一遍（AGENTS.md §3）：390×664，不带固定机位参数，用真实点击：
// 落座 → 斟茶 → 翻报纸 → 夹一件 → 揭盖 → 等加水 → 离席 → 再落座，看「刚才的你」有没有坐进来，
// 再等灰影斟茶后叩指。每步拍图写进 out 目录，report.json 记状态。
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
  const snap = () => p.evaluate(() => window.__datai.snapshot());
  const shot = async (name) => { await p.screenshot({ path: path.join(out, name + '.png') }); const s = await snap(); report.push({ step: name, ...s }); return s; };
  const tap = (code) => p.click(`#bar button[data-act="${code}"]`);
  await p.goto(url + '?mute=1');
  await p.waitForFunction(() => window.__datai && window.__datai.ready, null, { polling: 100 });
  await p.waitForTimeout(400);
  const s0 = await shot('00-door');
  await tap(0); await p.waitForTimeout(900); const s1 = await shot('01-sit');
  await tap(1); await p.waitForTimeout(700); const s2 = await shot('02-pour');
  await tap(4); await p.waitForTimeout(500); await shot('03-paper');
  await tap(5); await p.waitForTimeout(800); const s4 = await shot('04-pick');
  await tap(1); await tap(1); await tap(1); await p.waitForTimeout(300); const s5 = await shot('05-pot-empty');
  await tap(3); await p.waitForTimeout(400); await shot('06-lid');
  await p.waitForTimeout(3600); const s7 = await shot('07-refilled');
  await tap(6); await p.waitForTimeout(600); const s8 = await shot('08-left');
  await tap(0); await p.waitForTimeout(900); const s9 = await shot('09-sit-again');
  // 等桌上有人给你斟茶（灰影或刚才的你），最多 45 秒，然后叩指
  const got = await p.waitForFunction(() => window.__datai.snapshot().knockOpen, null, { polling: 200, timeout: 45000 }).then(() => true).catch(() => false);
  const s10 = await shot('10-someone-poured');
  if (got) { await tap(2); await p.waitForTimeout(400); }
  const s11 = await shot('11-knock');
  const checks = {
    '进门时站着、人数牌 1 桌 0 人以外的自己': s0.phase === 'door',
    '落座后 1/4': s1.phase === 'seated' && s1.where.includes('1 / 4'),
    '斟茶后杯满、有茶流': s2.myCup === 1 && s2.lastSound === 'pour',
    '夹一件后碟里有一件、笼里少一件': s4.myPlate === 1 && s4.steamer === 2,
    '连斟四巡后壶空': s5.pot.level < 0.01,
    '揭盖 3.5 秒后加满': s7.pot.level === 1 && s7.pot.lidOff === false,
    '离席后记了一次来访、回到门口': s8.phase === 'door' && s8.visits === 1,
    '再落座时刚才的你在大堂里（别人 ≥ 1 或别桌有人）': s9.others.length + s9.tables.reduce((a, t) => a + t.count, 0) >= 2,
    '有人给你斟了茶': got,
    '叩指后窗口关闭、画面有叩指': !got || (s11.knockOpen === false && s11.effects.includes('knock')),
    '零报错': errors.length === 0,
  };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, errors, report }, null, 1));
  const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(bad.length ? '✖ 未过：' + bad.join('、') : '✔ 开局流程全过', JSON.stringify({ s9tables: s9.tables, s9others: s9.others, s10hint: s10.hint, errors }));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
