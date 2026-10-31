// 浏览器验收（README 验收 3、4、5、6）：四个视口 × 三个固定机位，截图 + 读钩子。
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <page-url> <out-dir>
// 视口按「扣掉浏览器栏」的手机尺寸：iPhone Safari 390×664、安卓 Chrome 412×700、横屏 844×340，加一档电脑 1280×720。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const DATAI = require('../src/core.js');
const D_N = (kind) => DATAI.dimsum(kind).n;
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
      await p.waitForFunction(() => window.__datai && window.__datai.ready, null, { polling: 100 });
      await p.waitForTimeout(200);
      const r = await p.evaluate(() => {
        const btns = [...document.querySelectorAll('#bar button[data-act]')].map((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { text: el.textContent, box: r.toJSON(), hit: hit === el, disabled: el.disabled }; });
        const canvas = document.getElementById('scene').getBoundingClientRect();
        const mute = document.getElementById('mute').getBoundingClientRect().toJSON();
        return { btns, mute, canvas: canvas.toJSON(), vw: innerWidth, vh: innerHeight, scrollable: document.documentElement.scrollHeight > innerHeight + 1 || document.body.scrollHeight > innerHeight + 1, snap: window.__datai.snapshot() };
      });
      await p.screenshot({ path: path.join(out, `${tag}-${view}.png`) });
      // 动作响应：按斟茶，100 ms 内画面状态要变、要有音效名
      const before = r.snap.frameStamp;
      await p.evaluate(() => { window.__datai.pause(false); });
      await p.click('#bar button[data-act="1"]');
      await p.waitForTimeout(100);
      const after = await p.evaluate(() => window.__datai.snapshot());
      const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      let anyOverlap = false;
      for (let i = 0; i < r.btns.length; i++) for (let j = i + 1; j < r.btns.length; j++) if (overlap(r.btns[i].box, r.btns[j].box)) anyOverlap = true;
      const tables = r.snap.tables.map((t) => [t.no, t.count]);
      const expect = { first: { tables: [[1, 1]], me: 1, residents: 2 }, busy: { tables: [[1, 4], [2, 3]], me: 2, residents: 0 }, full: { tables: [[1, 4]], me: 1, residents: 0 } }[view];
      const clockOk = /^早市 7:0[0-9] · /.test(r.snap.hallText);
      const checks = {
        '8 个动作按钮都整块在可视区内': r.btns.length === 8 && r.btns.every((x) => x.box.left >= 0 && x.box.right <= r.vw + 0.5 && x.box.top >= 0 && x.box.bottom <= r.vh + 0.5),
        '按钮中心点到的是它本身': r.btns.every((x) => x.hit),
        '按钮不重叠': !anyOverlap,
        '按钮高度 ≥ 44': r.btns.every((x) => x.box.height >= 44),
        '页面不可滚动': !r.scrollable,
        '画布高度 ≥ 可视区 55%': r.canvas.height >= r.vh * 0.55,
        [`分桌：${JSON.stringify(expect.tables)}，我在第 ${expect.me} 桌`]: JSON.stringify(tables) === JSON.stringify(expect.tables) && r.snap.me.table === expect.me,
        [`灰影 ${expect.residents} 个`]: r.snap.residents.length === expect.residents,
        '已落座、人数牌对得上': r.snap.phase === 'seated' && r.snap.where.includes(`${expect.tables.find((t) => t[0] === expect.me)[1]} / 4`),
        '斟茶 100 ms 内画面与状态变了（头泡是洗杯）': after.frameStamp > before && (after.effects.includes('rinse') || after.effects.includes('pour')) && after.rinsed === true,
        '斟茶有音效名': after.lastSound === 'pour',
        '顶栏有早市时钟': clockOk,
        '拣了普洱、壶已到桌、茶色是普洱': r.snap.tea === 'puer' && r.snap.potHere === true,
        '静音键在顶栏且整块可见': r.mute && r.mute.right <= r.vw + 0.5 && r.mute.left >= 0,
        '零报错': errors.length === 0,
      };
      const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      if (bad.length) fail++;
      console.log(`${bad.length ? '✖' : '✔'} ${tag} ${view}`, bad.length ? '未过：' + bad.join('、') : '', bad.length ? JSON.stringify({ tables, me: r.snap.me, residents: r.snap.residents.length, where: r.snap.where, btns: r.btns.map((x) => [x.text, Math.round(x.box.top), Math.round(x.box.bottom)]), vh: r.vh, errors }) : '');
      await ctx.close();
    }
  }
  // 点心车（t=14 车在桌边）与收市（t=301 茶单）：两个手机视口各看一次
  for (const [tag, w, h] of VPS.slice(0, 2)) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await p.goto(`${url}${sep}view=first&t=14&mute=1`);
    await p.waitForFunction(() => window.__datai && window.__datai.ready, null, { polling: 100 });
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => {
      const chips = [...document.querySelectorAll('#cart button')].map((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent, box: r.toJSON(), hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el, disabled: el.disabled }; });
      const bar = document.getElementById('bar').getBoundingClientRect(), top = document.querySelector('.top').getBoundingClientRect();
      return { chips, barTop: bar.top, topBottom: top.bottom, vw: innerWidth, vh: innerHeight, snap: window.__datai.snapshot() };
    });
    await p.screenshot({ path: path.join(out, `${tag}-cart.png`) });
    const first = r.chips.find((c) => !c.disabled);
    let took = null;
    if (first) { await p.evaluate(() => { window.__datai.pause(false); }); await p.click('#cart button:not([disabled])'); await p.waitForTimeout(150); took = await p.evaluate(() => window.__datai.snapshot()); }
    await p.goto(`${url}${sep}view=first&t=301&mute=1`);
    await p.waitForFunction(() => window.__datai && window.__datai.ready, null, { polling: 100 });
    await p.waitForTimeout(300);
    const c = await p.evaluate(() => { const btn = document.getElementById('again').getBoundingClientRect(); const img = document.getElementById('billImg'); return { btn: btn.toJSON(), imgW: img.naturalWidth, imgH: img.naturalHeight, imgBox: img.getBoundingClientRect().toJSON(), vw: innerWidth, vh: innerHeight, snap: window.__datai.snapshot() }; });
    await p.screenshot({ path: path.join(out, `${tag}-bill.png`) });
    await p.click('#again'); await p.waitForTimeout(300);
    const after = await p.evaluate(() => window.__datai.snapshot());
    const checks = {
      '14 秒时点心车在桌边、三个选择片可见': r.snap.cart && r.chips.length === 3 && r.chips.every((x) => x.box.left >= 0 && x.box.right <= r.vw + 0.5 && x.box.bottom <= r.barTop + 0.5 && x.hit),
      '选择片不压顶栏也不压按钮栏': r.chips.every((x) => x.box.bottom <= r.barTop + 0.5 && x.box.top >= r.topBottom - 0.5),
      '点一样阿姨搁下一笼、茶单记了一笼': !!took && took.baskets.length === 1 && took.tally && Object.values(took.tally.baskets).reduce((a, b) => a + b, 0) === 1,
      '301 秒收市：茶单弹出、六行、图 1080 宽': c.snap.phase === 'bill' && c.snap.billShown && c.snap.bill && c.snap.bill.length === 6 && c.imgW === 1080,
      '茶单写着坐到收市、11:00': c.snap.bill && c.snap.bill[1].includes('坐到收市') && c.snap.bill[1].startsWith('11:00'),
      '「再开一市」按钮整块可见': c.btn.left >= 0 && c.btn.right <= c.vw && c.btn.top >= 0 && c.btn.bottom <= c.vh,
      '再开一市后回到门口、时钟回 7:00、刚才那趟成了幽灵': after.phase === 'door' && after.clock === '7:00' && !after.closed && after.tables.reduce((a, t) => a + t.count, 0) >= 2,
      '零报错': errors.length === 0,
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (bad.length) fail++;
    console.log(`${bad.length ? '✖' : '✔'} ${tag} cart+bill`, bad.length ? '未过：' + bad.join('、') : '', bad.length ? JSON.stringify({ chips: r.chips.map((x) => x.text), cart: r.snap.cart, took: took && { plate: took.myPlate, pieces: took.tally && took.tally.pieces }, bill: c.snap.bill, after: { phase: after.phase, clock: after.clock, tables: after.tables }, errors }) : '');
    await ctx.close();
  }
  // 拣茶条（ask=1）、点心纸、厨房出品：两个手机视口各看一次
  for (const [tag, w, h] of VPS.slice(0, 2)) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await p.goto(`${url}${sep}view=first&ask=1&t=1&mute=1`);
    await p.waitForFunction(() => window.__datai && window.__datai.ready, null, { polling: 100 });
    await p.waitForTimeout(200);
    const tea = await p.evaluate(() => {
      const chips = [...document.querySelectorAll('#cart button')].map((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent, box: r.toJSON(), hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el }; });
      const top = document.querySelector('.top').getBoundingClientRect();
      return { chips, topBottom: top.bottom, vw: innerWidth, snap: window.__datai.snapshot() };
    });
    await p.screenshot({ path: path.join(out, `${tag}-tea.png`) });
    await p.evaluate(() => { window.__datai.pause(false); });
    await p.click('#cart button[data-tea="tgy"]'); await p.waitForTimeout(200);
    const chosen = await p.evaluate(() => window.__datai.snapshot());
    // 唔该 → 点心纸
    await p.click('#bar button[data-act="8"]'); await p.waitForTimeout(300);
    const card = await p.evaluate(() => {
      const items = [...document.querySelectorAll('#orderGrid .item')].map((el) => ({ kind: el.dataset.kind, box: el.getBoundingClientRect().toJSON(), img: el.querySelector('img').naturalWidth }));
      const sheet = document.querySelector('#order .sheet').getBoundingClientRect().toJSON(), go = document.getElementById('orderGo').getBoundingClientRect().toJSON();
      return { items, sheet, go, vw: innerWidth, vh: innerHeight, snap: window.__datai.snapshot() };
    });
    await p.screenshot({ path: path.join(out, `${tag}-order.png`) });
    await p.click('#orderGrid .item[data-kind="har"]'); await p.click('#orderGrid .item[data-kind="feet"]'); await p.click('#orderGrid .item[data-kind="cake"]');
    const picked = await p.evaluate(() => ({ on: [...document.querySelectorAll('#orderGrid .item.on')].map((e) => e.dataset.kind), fourthDisabled: document.querySelector('#orderGrid .item[data-kind="tart"]').disabled, note: document.getElementById('orderNote').textContent }));
    await p.click('#orderGo'); await p.waitForTimeout(300);
    const ordered = await p.evaluate(() => window.__datai.snapshot());
    // 把时间推 32 秒，第一样该出品了
    await p.evaluate(() => { for (let i = 0; i < 64; i++) window.__datai.step(500); });
    const served = await p.evaluate(() => window.__datai.snapshot());
    await p.click('#bar button[data-act="5"]'); await p.waitForTimeout(150);
    const ate = await p.evaluate(() => window.__datai.snapshot());
    await p.screenshot({ path: path.join(out, `${tag}-served.png`) });
    const checks = {
      '落座后伙计问饮乜茶：五个茶片在顶栏下、可点': tea.snap.askTea && tea.chips.length === 5 && tea.chips.every((c) => c.hit && c.box.top >= tea.topBottom - 0.5 && c.box.right <= tea.vw + 0.5),
      '拣茶前壶不在桌、斟茶不可按': tea.snap.potHere === false && tea.snap.tea === null,
      '拣了铁观音、伙计去拎壶': chosen.tea === 'tgy' && chosen.askTea === false,
      '点心纸：十四样、每样有图、整张在可视区内、落单键可见': card.snap.orderShown && card.items.length === 14 && card.items.every((i) => i.img > 0) && card.sheet.bottom <= card.vh + 0.5 && card.sheet.top >= 0 && card.go.bottom <= card.vh + 0.5,
      '最多勾三样，第四样灰掉勾不上': picked.on.length === 3 && picked.fourthDisabled && picked.note.includes('合计 ¥'),
      '落单后厨房排了三样、纸收起': ordered.orders === 1 && ordered.kitchen === 3 && !ordered.orderShown,
      '32 秒后至少出了一样到桌上': served.baskets.length >= 1 && served.kitchen <= 2,
      '夹一件：碟上多一件、笼里少一件、茶单计件': ate.myPlate === 1 && ate.plateKinds.length === 1 && ate.baskets[0][1] === D_N(ate.baskets[0][0]) - 1 && Object.values(ate.tally.pieces).reduce((a, b) => a + b, 0) === 1 && Object.values(ate.tally.baskets).reduce((a, b) => a + b, 0) >= 1,
      '零报错': errors.length === 0,
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (bad.length) fail++;
    console.log(`${bad.length ? '✖' : '✔'} ${tag} tea+order`, bad.length ? '未过：' + bad.join('、') : '', bad.length ? JSON.stringify({ teaChips: tea.chips.map((c) => c.text), potHere: tea.snap.potHere, chosen: chosen.tea, items: card.items.length, sheet: card.sheet, picked, ordered: { orders: ordered.orders, kitchen: ordered.kitchen }, served: served.baskets, ate: { plate: ate.myPlate, baskets: ate.baskets, tally: ate.tally }, errors }) : '');
    await ctx.close();
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
