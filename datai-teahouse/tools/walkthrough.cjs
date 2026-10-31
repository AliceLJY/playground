// 开局 30 秒 · 真实输入走一遍（AGENTS.md §3）：390×664，不带固定机位参数，用真实点击：
// 落座 → 斟茶 → 翻报纸 → 夹一件 → 等点心车 → 从车上夹一样 → 揭盖 → 等加水 → 离席 → 茶单 → 再开一市 → 再落座，
// 看「刚才的你」有没有坐进来，再等有人斟茶后叩指。每步拍图写进 out 目录，report.json 记状态。
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
  // 伙计问饮乜茶：拣普洱，等壶上桌
  await p.click('#cart button[data-tea="puer"]'); await p.waitForTimeout(300); const s1b = await shot('01b-tea');
  await p.waitForFunction(() => window.__datai.snapshot().potHere, null, { polling: 200, timeout: 8000 });
  await tap(1); await p.waitForTimeout(900); const s1c = await shot('01c-rinse');
  await tap(1); await p.waitForTimeout(700); const s2 = await shot('02-pour');
  await tap(4); await p.waitForTimeout(500); await shot('03-paper');
  // 唔该 → 点心纸勾两样落单
  await tap(8); await p.waitForTimeout(400); const so = await shot('03b-order');
  await p.click('#orderGrid .item[data-kind="siu"]'); await p.click('#orderGrid .item[data-kind="rice"]'); await p.click('#orderGo'); await p.waitForTimeout(400); const so2 = await shot('03c-ordered');
  await tap(5); await p.waitForTimeout(500); const s4 = await shot('04-pick-nothing-yet');
  // 点心车第一趟 10–15 秒到；等它来，从车上要一笼
  const cartCame = await p.waitForFunction(() => window.__datai.snapshot().cartShown, null, { polling: 200, timeout: 20000 }).then(() => true).catch(() => false);
  const sc = await shot('04b-cart');
  if (cartCame) { await p.click('#cart button:not([disabled])'); await p.waitForTimeout(500); }
  const sc2 = await shot('04c-cart-basket');
  await tap(5); await p.waitForTimeout(500); const sc3 = await shot('04d-eat');
  // 等厨房出品第一样（落单后 18–30 秒）
  const served = await p.waitForFunction(() => window.__datai.snapshot().orders === 1 && window.__datai.snapshot().kitchen <= 1, null, { polling: 300, timeout: 40000 }).then(() => true).catch(() => false);
  const sv = await shot('04e-served');
  await tap(1); await tap(1); await p.waitForTimeout(300); const s5 = await shot('05-pot-empty');
  await tap(3); await p.waitForTimeout(400); await shot('06-lid');
  await p.waitForTimeout(3600); const s7 = await shot('07-refilled');
  await tap(6); await p.waitForTimeout(600); const s8 = await shot('08-bill');
  await p.click('#again'); await p.waitForTimeout(500); const s8b = await shot('08b-door-again');
  await tap(0); await p.waitForTimeout(600); await p.click('#cart button[data-tea="puer"]'); await p.waitForFunction(() => window.__datai.snapshot().potHere, null, { polling: 200, timeout: 8000 }); await tap(1); await p.waitForTimeout(400); const s9 = await shot('09-sit-again');
  // 等桌上有人给你斟茶（灰影或刚才的你），最多 45 秒，然后叩指
  const got = await p.waitForFunction(() => window.__datai.snapshot().knockOpen, null, { polling: 200, timeout: 45000 }).then(() => true).catch(() => false);
  const s10 = await shot('10-someone-poured');
  if (got) { await tap(2); await p.waitForTimeout(400); }
  const s11 = await shot('11-knock');
  const checks = {
    '进门时站着': s0.phase === 'door',
    '落座后 1/4、伙计问饮乜茶、壶还没来': s1.phase === 'seated' && s1.where.includes('1 / 4') && s1.askTea && !s1.potHere,
    '拣了普洱、几秒后壶上桌': s1b.tea === 'puer' && s1c.potHere,
    '头泡洗杯，不算一巡': s1c.rinsed && s1c.tally.pours === 0 && s1c.myCup === 0,
    '第二泡才是斟茶、杯满': s2.myCup === 1 && s2.tally.pours === 1,
    '唔该拿到点心纸、勾两样落单后纸收起、厨房排两样': so.orderShown && !so2.orderShown && so2.orders === 1 && so2.kitchen === 2,
    '桌上没点心时夹一件夹不到': s4.myPlate === 0,
    '点心车在 20 秒内到了、三样可选': cartCame && sc.cartChips === 3,
    '从车上要到一笼：桌上有笼、茶单计了一笼': sc2.baskets.length === 1 && Object.values(sc2.tally.baskets).reduce((a, b) => a + b, 0) === 1,
    '从笼里夹一件到碟': sc3.myPlate === 1 && sc3.plateKinds.length === 1 && sc3.baskets[0][1] === sc2.baskets[0][1] - 1,
    '厨房 40 秒内出了品': served && sv.baskets.length >= 2,
    '斟满四巡后壶空': s5.pot.level < 0.01,
    '揭盖 3.5 秒后加满': s7.pot.level === 1 && s7.pot.lidOff === false,
    '离席出埋单六行、记了一次来访': s8.phase === 'bill' && s8.visits === 1 && s8.billShown && s8.bill && s8.bill.length === 6,
    '埋单写了茶位普洱、笼数、合计': s8.bill[2].startsWith('茶位 普洱 ¥6') && /笼/.test(s8.bill[4]) && /^合计 ¥\d+$/.test(s8.bill[5]),
    '再开一市后回到门口': s8b.phase === 'door',
    '再落座时刚才的你在大堂里': s9.others.length + s9.tables.reduce((a, t) => a + t.count, 0) >= 2,
    '有人给你斟了茶': got,
    '叩指后窗口关闭、茶单记了一次谢': !got || (s11.knockOpen === false && s11.tally.knocksGiven === 1),
    '零报错': errors.length === 0,
  };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, errors, report }, null, 1));
  const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(bad.length ? '✖ 未过：' + bad.join('、') : '✔ 开局流程全过', JSON.stringify({ cart: sc.cart, served: sv.baskets, bill: s8.bill, s9tables: s9.tables, s9others: s9.others, s10hint: s10.hint, errors }));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
