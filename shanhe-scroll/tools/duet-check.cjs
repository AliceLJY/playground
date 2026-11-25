// 2026-11-25 Duet 巡检复核：印章跟章节、手机卡片不出屏、点按区 44px、键盘可用、触屏拖动环视
// NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <page-url> [screenshot-dir]
const { chromium } = require('playwright');
const path = require('node:path');
const [base, shots] = process.argv.slice(2);
if (!base) throw new Error('Provide page URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let fails = 0;
  const check = (name, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
  const CN = ['一', '二', '三', '四'];
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true], [390, 664, false]]) {
    const tag = `${w} hasTouch=${touch}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: w < 900 ? 2 : 1 });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => document.querySelectorAll('.node').length === 4, null, { polling: 50 });
    const nodes = await page.evaluate(async () => { const { CHAPTERS } = await import(new URL('./data/timeline.js', location.href)); return CHAPTERS.flatMap((c, ci) => c.nodes.map((n) => ({ id: n.id, ci }))); });
    // 印章：每张卡片写所在章的序号
    const seals = [];
    for (const n of nodes) {
      await page.locator(`.node[data-id="${n.id}"]`).evaluate((el) => el.scrollIntoView({ inline: 'center' }));
      await page.locator(`.node[data-id="${n.id}"]`).click();
      seals.push({ id: n.id, seal: await page.locator('#card-seal').textContent(), want: CN[n.ci] });
      const geo = await page.evaluate(() => { const c = document.getElementById('card').getBoundingClientRect(), x = document.getElementById('card-close').getBoundingClientRect(); return { card: { l: Math.round(c.left), r: Math.round(c.right) }, close: { l: Math.round(x.left), r: Math.round(x.right), w: Math.round(x.width), h: Math.round(x.height) }, vw: innerWidth }; });
      if (n.ci === 0) {
        check(`${tag} card stays inside the screen with the × whole`, geo.card.l >= 0 && geo.card.r <= geo.vw && geo.close.r <= geo.vw, geo);
        check(`${tag} card × is >=44px`, geo.close.w >= 44 && geo.close.h >= 44, geo.close);
        const btns = await page.evaluate(() => ['card-enter', 'card-skip'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, h: Math.round(r.height) }; }));
        check(`${tag} card buttons are >=44px tall`, btns.every((b) => b.h >= 44), btns);
        if (shots && n.id === 'humen') await page.screenshot({ path: path.join(shots, `shanhe-${w}-touch${touch}-card.png`) });
      }
      await page.locator('#card-close').click();
    }
    check(`${tag} card seal follows the chapter`, seals.every((s) => s.seal === s.want), seals);
    // 红点点按区：圆点中心左右各 18px 处仍点得到这个节点
    const hits = await page.evaluate(() => [...document.querySelectorAll('.node')].map((el) => { el.scrollIntoView({ inline: 'center' }); const d = el.querySelector('.dot').getBoundingClientRect(), cx = d.x + d.width / 2, cy = d.y + d.height / 2; return [[-18, 0], [18, 0], [0, -18], [0, 18]].every(([dx, dy]) => el.contains(document.elementFromPoint(cx + dx, cy + dy))); }));
    check(`${tag} timeline dots have a 44px hit area`, hits.every(Boolean), hits);
    if (!touch) {
      // 键盘：Tab 能到红点，回车打开卡片，Esc 关上
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      let reached = false;
      for (let i = 0; i < 12 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => !!document.activeElement?.closest('.node')); }
      check(`${tag} Tab reaches a timeline dot`, reached, await page.evaluate(() => document.activeElement?.id || document.activeElement?.className));
      if (reached) { await page.keyboard.press('Enter'); }
      const opened = await page.locator('#card').evaluate((e) => e.classList.contains('show'));
      await page.keyboard.press('Escape');
      const closed = !(await page.locator('#card').evaluate((e) => e.classList.contains('show')));
      check(`${tag} Enter opens the card and Escape closes it`, reached && opened && closed, { opened, closed });
    }
    // 场景里的按钮
    await page.locator(`.node[data-id="${nodes[0].id}"]`).click();
    await page.locator('#card-enter').click();
    await page.waitForTimeout(1200);
    await page.locator('#opts .opt').first().click();
    const nx = await page.locator('#scene-next').boundingBox();
    check(`${tag} scene「继续前行」is >=44px tall`, nx && nx.height >= 44, nx);
    if (touch) {
      // 手指拖动环视：画面要转，松手后不能卡在拖动状态
      await page.locator('#btn-fold').click(); await page.waitForTimeout(300);
      const cdp = await ctx.newCDPSession(page);
      const before = await page.evaluate(() => document.getElementById('gl').toDataURL('image/png').length);
      const shot0 = await page.locator('#gl').screenshot();
      const ta = await page.evaluate(() => getComputedStyle(document.getElementById('gl')).touchAction);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300 }] });
      for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - i * 15, y: 300 + i * 4 }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
      const stuck = await page.evaluate(() => document.getElementById('gl').classList.contains('dragging'));
      const shot1 = await page.locator('#gl').screenshot();
      // idle 自转在按下后已停；比较拖动前后同一画布的截图差异
      let diff = 0; for (let i = 0; i < Math.min(shot0.length, shot1.length); i += 97) if (shot0[i] !== shot1[i]) diff++;
      check(`${tag} finger drag turns the view and releases`, !stuck && diff > 50, { touchAction: ta, stuckDragging: stuck, sampledBytesChanged: diff, before });
      if (shots) await page.screenshot({ path: path.join(shots, `shanhe-${w}-touch${touch}-after-drag.png`) });
    }
    check(`${tag} zero page errors`, errors.length === 0, errors);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'ALL PASS');
  process.exitCode = fails ? 1 : 0;
})();
