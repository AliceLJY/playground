// 本地浏览器回归：NODE_PATH="$(npm root -g)" node tools/shoot.cjs <基准 URL> <仓外输出目录>
// 扣栏视口、真实输入与触屏滚动；失败写进 report.json 并返回非零。数据按特征选，不绑定每日行号。
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.argv[2], out = process.argv[3];
if (!BASE || !out) throw new Error('Usage: node tools/shoot.cjs <base-url> <output-dir>');
const report = { base: BASE, checks: [], errors: [], screenshots: [], environments: [] };
const viewports = [[390, 664], [412, 700], [320, 568], [844, 340], [1365, 900]];
const state = (page) => page.evaluate(() => {
  const f = window.__fade, s = window.FADE.stateAt(f.mem, f.day);
  return { index: f.mem.index, day: f.day, age: f.mem.age, count: s.count, factor: s.factor, pinned: f.mem.pinned, recalls: [...f.mem.recalls] };
});
async function check(name, fn) {
  try { report.checks.push({ name, pass: true, detail: await fn() }); console.log('PASS ' + name); }
  catch (e) { report.checks.push({ name, pass: false, error: e.message }); console.log('FAIL ' + name + ': ' + e.message); }
}
async function shot(page, name) {
  const file = path.join(out, name + '.png');
  await page.screenshot({ path: file }); // 只截当前可视区；长截图不能证明同屏。
  report.screenshots.push({ file, state: await state(page) });
}
async function open(page, query = '') {
  await page.goto(BASE + query);
  await page.waitForFunction(() => !!window.__fade, null, { polling: 50 });
  await page.waitForTimeout(query ? 180 : 3400);
}
async function tapCard(page, touch = true) {
  await page.locator('#card').scrollIntoViewIfNeeded();
  const r = await page.locator('#card .paper').boundingBox();
  // aria-disabled 的卡片仍可拖；用实际坐标验证禁用状态确实挡住召回。
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}
async function boxes(page, ids = ['#card .paper', '#scrub', '#play', '#recall', '#pin', '#another']) {
  return page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
    const el = document.querySelector(id), r = el.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y);
    return [id, { x: r.x, y: r.y, width: r.width, height: r.height,
      visible: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      hit: !!hit && (hit === el || el.contains(hit) || (id === '#card .paper' && document.querySelector('#card').contains(hit))) }];
  })), ids);
}
function assertVisible(b) {
  for (const [id, r] of Object.entries(b)) {
    assert.ok(r.visible && r.hit, `${id} 不完整可见或中心被挡：${JSON.stringify(r)}`);
    if (id !== '#card .paper') assert.ok(r.height >= 44, `${id} 点击区不足 44px`);
  }
}
async function visibleDuringBounce(page) {
  const samples = [];
  for (let i = 0; i < 14; i++) { samples.push(await boxes(page)); await page.waitForTimeout(70); }
  samples.forEach(assertVisible);
  return { samples: samples.length, cardTop: Math.min(...samples.map((s) => s['#card .paper'].y)) };
}
async function swipe(cdp, page, x, y, dx, dy) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 12, y: y + dy * i / 12 }] });
    await page.waitForTimeout(22);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
}
async function cancelInput(page, target, kind) {
  await page.evaluate(({ target, kind }) => {
    if (kind === 'blur') window.dispatchEvent(new Event('blur'));
    else if (kind === 'hidden') {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;
    } else document.querySelector(target).dispatchEvent(new PointerEvent(kind, { pointerId: 1, bubbles: true }));
  }, { target, kind });
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  report.browser = browser.version();
  try {
    for (const [width, height] of viewports) {
      const tag = `${width}x${height}`;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: width < 1000, isMobile: width < 1000 });
      const page = await context.newPage();
      page.on('pageerror', (e) => report.errors.push(tag + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') report.errors.push(tag + ': ' + m.text()); });
      await open(page);
      report.environments.push(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, renderer: 'SVG / browser default' })));
      await shot(page, tag + '-default');
      await check(tag + ' 默认入口主操作与卡片同屏', async () => {
        const b = await boxes(page); assertVisible(b);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '页面横向溢出');
        return b;
      });
      const fixtures = await page.evaluate(() => {
        const { library } = window.__fade, F = window.FADE;
        return {
          low: library.findIndex((m) => F.stateAt(m, 365).factor < 0.451),
          same: library.findIndex((m) => m.history && m.history.last === m.age)
        };
      });
      assert.ok(fixtures.low >= 0 && fixtures.same >= 0, '当前库必须确实有地板附近和同日召回样本');
      const lowQuery = `?pick=${fixtures.low}&ahead=365`;
      await open(page, lowQuery);
      await shot(page, tag + '-floor');
      await check(tag + ' 0.45 端卡片与滑块按钮同屏', async () => {
        const s = await state(page); assert.ok(Math.abs(s.factor - 0.45) < 0.001);
        const b = await boxes(page); assertVisible(b); return { state: s, boxes: b };
      });
      await check(tag + ' 真实按钮召回：计数加一、倍率回 1、弹跳同屏', async () => {
        const before = await state(page);
        await page.locator('#recall').click();
        const bounce = await visibleDuringBounce(page), after = await state(page);
        assert.equal(after.count, before.count + 1); assert.equal(after.factor, 1);
        assert.equal(await page.locator('#recall').isDisabled(), true);
        return { before, after, bounce };
      });
      await shot(page, tag + '-recall');
      await open(page, lowQuery);
      await check(tag + ' 真实钉住：倍率回 1、弹跳同屏', async () => {
        await page.locator('#pin').click();
        const bounce = await visibleDuringBounce(page), s = await state(page);
        assert.equal(s.pinned, true); assert.equal(s.factor, 1);
        return { state: s, bounce };
      });
      await shot(page, tag + '-pinned');
      await open(page, lowQuery);
      await check(tag + ' 滑块键盘与指针真实改变日期', async () => {
        await page.locator('#scrub').focus(); await page.keyboard.press('Home');
        let s = await state(page); assert.equal(s.day, s.age);
        await page.keyboard.press('ArrowRight'); s = await state(page); assert.equal(s.day, s.age + 1);
        const r = await page.locator('#scrub').boundingBox();
        await page.mouse.click(r.x + r.width * 0.72, r.y + r.height / 2);
        const after = await state(page); assert.ok(after.day > s.day + 5, '指针选日没有生效');
        assertVisible(await boxes(page)); return after;
      });
      await open(page, `?pick=${fixtures.same}`);
      await check(tag + ' 同日历史记录：按钮、卡片、Enter、Space 都不再加次数', async () => {
        const before = await state(page); assert.equal(await page.locator('#recall').isDisabled(), true);
        await tapCard(page, width < 1000);
        await page.locator('#card').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
        const after = await state(page); assert.equal(after.count, before.count); assert.deepEqual(after.recalls, []);
        assert.match(await page.locator('#cardbody').textContent(), /入库样本/);
        return { before, after };
      });
      await check(tag + ' 统一试玩钩子回报实际 URL 状态', async () => {
        const actual = await state(page);
        const snapshot = await page.evaluate(() => {
          if (!window.__PLAYTEST__?.ready) return null;
          return window.__PLAYTEST__.snapshot();
        });
        assert.ok(snapshot, '缺少已就绪的 __PLAYTEST__.snapshot()');
        assert.equal(snapshot.index, fixtures.same); assert.equal(snapshot.day, actual.age);
        for (const key of ['index', 'day', 'count', 'factor', 'pinned']) assert.equal(snapshot[key], actual[key]);
        return { requested: { index: fixtures.same, ahead: 0 }, actual: snapshot };
      });
      if (width === 390) {
        const cdp = await context.newCDPSession(page);
        await check('卡片真实触屏拖拽后松手回位、不滚页也不召回', async () => {
          await open(page, lowQuery);
          const r = await page.locator('#card .paper').boundingBox(), before = await state(page);
          const x = r.x + r.width / 2, y = r.y + r.height / 2;
          const start = await page.evaluate(() => ({ card: window.__fade.card.x, scroll: scrollY }));
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 30 }] });
          const pulled = await page.evaluate(() => window.__fade.card.x);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 140 }] });
          await page.waitForTimeout(50);
          const paper = await page.locator('#card .paper').boundingBox(), stage = await page.locator('#stage').boundingBox();
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          assert.ok(pulled < start.card - 10, '卡片实际没有跟手移动');
          assert.ok(paper.y + paper.height <= stage.y + stage.height, '下拉卡片被舞台裁切');
          await page.waitForTimeout(1400);
          assert.deepEqual(await state(page), before);
          const end = await page.evaluate(() => ({ card: window.__fade.card.x, target: window.__fade.card.target, scroll: scrollY }));
          assert.equal(end.scroll, start.scroll); assert.ok(Math.abs(end.card - end.target) < 1);
          return { start, pulled, end };
        });
        for (const target of ['stage', 'plot']) {
          await check('触屏纵划 ' + target + '：页面滚动且日期/样本/召回不变', async () => {
            await open(page, `?pick=${fixtures.low}`);
            const selector = '#' + target;
            if (target === 'plot') await page.locator(selector).scrollIntoViewIfNeeded();
            const r = await page.locator(selector).boundingBox(), before = await state(page);
            const y0 = await page.evaluate(() => scrollY);
            const x = target === 'stage' ? r.x + 12 : r.x + r.width * 0.6;
            const y = Math.min(height - 20, r.y + r.height * 0.8);
            await swipe(cdp, page, x, y, 4, -Math.min(180, y - 25));
            const y1 = await page.evaluate(() => scrollY), after = await state(page);
            assert.ok(y1 > y0 + 60, `纵划应滚动 >60px，实际 ${y0}→${y1}`);
            assert.deepEqual(after, before, '纵划误触选日/选点/召回');
            return { scrollBefore: y0, scrollAfter: y1, before, after };
          });
        }
        await check('曲线触屏横拖真实改变日期，点样本真实换卡片', async () => {
          await open(page, `?pick=${fixtures.low}`);
          await page.locator('#plot').scrollIntoViewIfNeeded();
          const r = await page.locator('#plot').boundingBox(), before = await state(page);
          await swipe(cdp, page, r.x + r.width * 0.55, r.y + r.height * 0.6, r.width * 0.35, 0);
          const after = await state(page); assert.ok(after.day > before.day + 10, '曲线横拖选日未生效');
          // 找不重叠的另一条散点，避免随机点正好被其他点盖住。
          const point = await page.evaluate(() => {
            const dots = [...document.querySelectorAll('#lib circle')].map((el, i) => ({ i, x: +el.getAttribute('cx'), y: +el.getAttribute('cy') }));
            const p = dots.find((p) => p.i !== window.__fade.mem.index && dots.every((q) => p === q || Math.hypot(p.x - q.x, p.y - q.y) > 3));
            const r = document.querySelector('#plot').getBoundingClientRect();
            return p && { index: p.i, x: r.x + p.x * r.width / 360, y: r.y + p.y * r.height / 178 };
          });
          assert.ok(point, '要真有不重叠的散点才能验换样本');
          await page.touchscreen.tap(point.x, point.y);
          const selected = await state(page); assert.equal(selected.index, point.index); assert.notEqual(selected.index, after.index);
          return { before, after, selected };
        });
        for (const target of ['#card', '#plot']) for (const kind of ['pointercancel', 'lostpointercapture', 'blur', 'hidden']) {
          await check(`${target} ${kind} 清掉手势，不会续拖或误召回`, async () => {
            await open(page, lowQuery);
            await page.locator(target).scrollIntoViewIfNeeded();
            const r = await page.locator(target).boundingBox(), before = await state(page);
            const x = r.x + r.width / 2, y = r.y + r.height / 2;
            const cardBefore = await page.evaluate(() => window.__fade.card.x);
            await page.mouse.move(x, y); await page.mouse.down();
            await cancelInput(page, target, kind);
            await page.mouse.move(x + 45, y - 20, { steps: 4 });
            const cardAfter = await page.evaluate(() => window.__fade.card.x);
            await page.mouse.up();
            if (target === '#card') assert.ok(Math.abs(cardAfter - cardBefore) < 1, '取消后仍拖动了卡片');
            const after = await state(page); assert.deepEqual(after, before, '已取消的手势继续改变了状态');
            await page.waitForTimeout(1100);
            assert.equal(await page.evaluate(() => Math.abs(window.__fade.card.x - window.__fade.card.target) < 1), true, '卡片没有回到落点');
            return { before, after };
          });
        }
        await check('新召回同一天三入口互斥，隔天仍能用键盘/触屏召回', async () => {
          await open(page, `?pick=${fixtures.low}&ahead=20`);
          const before = await state(page);
          await page.locator('#card').focus(); await page.keyboard.press('Enter');
          await page.keyboard.press('Space'); await page.waitForTimeout(1100);
          await tapCard(page);
          let s = await state(page); assert.equal(s.count, before.count + 1); assert.equal(s.factor, 1);
          assert.equal(await page.locator('#recall').isDisabled(), true);
          await page.locator('#scrub').focus(); await page.keyboard.press('ArrowRight');
          assert.equal(await page.locator('#recall').isDisabled(), false);
          await page.locator('#card').focus(); await page.keyboard.press('Space');
          s = await state(page); assert.equal(s.count, before.count + 2);
          await page.locator('#scrub').focus(); await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(1100); await tapCard(page);
          s = await state(page); assert.equal(s.count, before.count + 3);
          return { before, after: s };
        });
      }
      await context.close();
    }
    await check('全部视口页面零错误', async () => { assert.deepEqual(report.errors, []); return report.errors; });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${report.checks.filter((c) => c.pass).length}/${report.checks.length} passed`);
  if (report.checks.some((c) => !c.pass)) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
