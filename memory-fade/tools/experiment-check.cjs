// 可选实验的真实输入回归；与 shoot.cjs 顺序运行，输出目录放仓外。
// NODE_PATH="$(npm root -g)" node tools/experiment-check.cjs <base-url> <output-dir>
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('Usage: node tools/experiment-check.cjs <base-url> <output-dir>');
const report = { base, checks: [], screenshots: [], errors: [], environments: [] };
const state = (page) => page.evaluate(() => window.__PLAYTEST__.snapshot().experiment);
const normal = (page) => page.evaluate(() => {
  const f = window.__fade;
  return { index: f.mem.index, day: f.day, ...window.FADE.stateAt(f.mem, f.day), importance: f.mem.importance,
    pinned: f.mem.pinned, recalls: [...f.mem.recalls] };
});
async function check(name, fn) {
  const detail = await fn();
  report.checks.push({ name, pass: true, detail }); console.log('PASS ' + name);
}
async function shot(page, tag) {
  const file = path.join(out, tag + '.png');
  await page.screenshot({ path: file });
  const s = await state(page);
  // 截图记录实际状态；曲线逐点对照另验，避免每张图重复 181 点。
  if (s?.result) delete s.result.curves;
  report.screenshots.push({ file, state: s });
}
async function visible(page, selector) {
  const r = await page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { x: r.x, y: r.y, width: r.width, height: r.height,
      visible: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      hit: hit === el || el.contains(hit) };
  });
  assert.ok(r.visible && r.hit, selector + ' 出框或中心被挡：' + JSON.stringify(r));
  assert.ok(r.width >= 44 && r.height >= 44, selector + ' 不足 44 CSS px');
  return r;
}
async function press(page, selector, touch, key) {
  const button = page.locator(selector);
  await button.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const r = await visible(page, selector);
  if (key) { await button.focus(); await page.keyboard.press(key); }
  else if (touch) await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  else await button.click();
}
async function chooseDay(page, day) {
  await page.locator('#experiment-scrub').focus();
  await page.keyboard.press(day > 90 ? 'End' : 'Home');
  for (let i = 0; i < (day > 90 ? 179 - day : day); i++) await page.keyboard.press(day > 90 ? 'ArrowLeft' : 'ArrowRight');
  assert.equal((await state(page)).day, day, '真实 range 键盘没有选择请求的日子');
}
async function plan(page, days, touch) {
  for (const day of days) { await chooseDay(page, day); await press(page, '#experiment-add', touch); }
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => {
    const dialog = document.querySelector('#experiment');
    return document.documentElement.scrollWidth <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
  }), true, '页面或实验横向溢出');
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  report.browser = browser.version();
  try {
    for (const [width, height] of [[390, 664], [320, 568], [844, 340], [1365, 900]]) {
      const tag = `${width}x${height}`, touch = width < 1000;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
      const page = await context.newPage();
      page.on('pageerror', (e) => report.errors.push(tag + ': ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') report.errors.push(tag + ': ' + m.text()); });
      await page.goto(base);
      await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50 });
      await page.waitForTimeout(3400);
      report.environments.push(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, renderer: 'SVG / browser default' })));
      assert.equal(await state(page), null, '默认入口不能自动进入实验');

      // 留下非初始状态，证明关闭实验不通过重置默认玩法来伪装清理成功。
      await page.locator('#scrub').focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
      await page.locator('#card').focus(); await page.keyboard.press('Enter');
      await press(page, '#pin', touch);
      await page.locator('#importance').focus(); await page.keyboard.press('ArrowLeft');
      const before = await normal(page);
      await press(page, '#open-experiment', touch);
      await check(tag + ' 可选菜单打开，原状态暂停且实验未钉住', async () => {
        const s = await state(page);
        assert.equal(s.phase, 'plan'); assert.deepEqual(s.days, []); assert.equal(s.remaining, 3); assert.equal(s.pinned, false);
        assert.deepEqual(await normal(page), before);
        assert.equal(await page.evaluate(() => window.__PLAYTEST__.snapshot().playing), false);
        await noOverflow(page); await visible(page, '#close-experiment');
        assert.match(await page.locator('#experiment-disclaimer').textContent(), /不是人类记忆训练法/);
        return s;
      });
      await shot(page, tag + '-plan');
      await check(tag + ' 滑块触屏或鼠标可选日，不改原推演', async () => {
        await page.locator('#experiment-scrub').evaluate((el) => el.scrollIntoView({ block: 'center' }));
        const r = await visible(page, '#experiment-scrub');
        const x = r.x + r.width * 0.65, y = r.y + r.height / 2;
        if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
        const s = await state(page);
        assert.ok(s.day > 50 && s.day < 160, '实际指针选日未发生');
        assert.deepEqual(await normal(page), before);
        return { selectedDay: s.day };
      });
      await check(tag + ' 同日不扣第二枚，撤回返还，未满三次不能揭晓', async () => {
        assert.equal(await page.locator('#experiment-reveal').isDisabled(), true);
        await chooseDay(page, 0);
        await press(page, '#experiment-add', touch, 'Enter');
        await press(page, '#experiment-add', touch, 'Space');
        assert.deepEqual((await state(page)).days, [0]); assert.equal((await state(page)).remaining, 2);
        assert.match(await page.locator('#experiment-message').textContent(), /不消耗/);
        await press(page, '#experiment-token-0', touch);
        assert.deepEqual((await state(page)).days, []); assert.equal((await state(page)).remaining, 3);
        await plan(page, [0, 1, 2], touch);
        assert.equal(await page.locator('#experiment-add').isDisabled(), true);
        assert.equal(await page.locator('#experiment-reveal').isDisabled(), false);
        await noOverflow(page);
      });
      await shot(page, tag + '-scheduled');
      await press(page, '#experiment-reveal', touch);
      await check(tag + ' 太早确实未达目标，两份独立推演及解释可见', async () => {
        const s = await state(page), r = s.result;
        assert.equal(s.phase, 'result'); assert.equal(r.success, false);
        assert.ok(r.yours.factor < 1 && r.yours.factor > r.plain.factor);
        assert.equal(r.yours.count - r.plain.count, 3);
        assert.equal(await page.locator('#experiment-yours').textContent(), '×' + r.yours.factor.toFixed(2));
        assert.equal(await page.locator('#experiment-plain').textContent(), '×' + r.plain.factor.toFixed(2));
        assert.match(await page.locator('#experiment-timing').textContent(), /七天豁免已结束/);
        // SVG 的两个真实路径逐点对应已验证的模型，非只验配置常量。
        for (const [id, key] of [['planned', 'yours'], ['plain', 'plain']]) {
          const points = (await page.locator('#experiment-' + id + '-curve').getAttribute('d')).match(/[ML][^ML]+/g);
          assert.equal(points.length, 181);
          points.forEach((point, i) => {
            const [x, y] = point.slice(1).split(',').map(Number);
            assert.ok(Math.abs(x - (34 + i / 180 * 312)) < 0.006);
            assert.ok(Math.abs(y - (140 - (r.curves[i][key] - 0.45) / 0.55 * 124)) < 0.006);
          });
        }
        await noOverflow(page);
        return { yourFactor: r.yours.factor, plainFactor: r.plain.factor, gap: r.gap };
      });
      await shot(page, tag + '-early-result');
      await page.locator('#experiment-retry').evaluate((el) => el.scrollIntoView({ block: 'end' }));
      await visible(page, '#experiment-retry'); await visible(page, '#close-experiment');
      await shot(page, tag + '-early-explanation');
      await press(page, '#experiment-retry', touch);
      assert.deepEqual((await state(page)).days, []); assert.equal((await state(page)).remaining, 3);
      await plan(page, [0, 60, 174], touch);
      await press(page, '#experiment-reveal', touch, 'Enter');
      await check(tag + ' 重试后真实操作完成，第 174 天的想起覆盖终点', async () => {
        const s = await state(page), r = s.result;
        assert.deepEqual(s.days, [0, 60, 174]); assert.equal(s.remaining, 0);
        assert.equal(r.success, true); assert.equal(r.yours.factor, 1); assert.ok(r.plain.factor < 1);
        assert.match(await page.locator('#experiment-timing').textContent(), /第 181 天起恢复衰减/);
        await noOverflow(page);
        return { days: s.days, yourFactor: r.yours.factor, plainFactor: r.plain.factor, gap: r.gap };
      });
      await shot(page, tag + '-success-result');
      await page.locator('#experiment-retry').evaluate((el) => el.scrollIntoView({ block: 'end' }));
      await visible(page, '#experiment-retry'); await visible(page, '#close-experiment');
      await shot(page, tag + '-success-explanation');
      await press(page, '#close-experiment', touch);
      await page.waitForFunction(() => window.__PLAYTEST__.snapshot().experiment === null, null, { polling: 50 });
      await check(tag + ' 完成后返回原状态，原同日规则与隔日召回仍可用', async () => {
        assert.deepEqual(await normal(page), before);
        await page.locator('#card').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
        assert.deepEqual(await normal(page), before, '同一天不能再加');
        await page.locator('#scrub').focus(); await page.keyboard.press('ArrowRight');
        await page.locator('#card').focus(); await page.keyboard.press('Enter');
        assert.equal((await normal(page)).count, before.count + 1, '返回后隔日可继续正常玩法');
        assert.equal(await page.locator('#recall').isDisabled(), true);
        await press(page, '#open-experiment', touch);
        assert.deepEqual((await state(page)).days, []);
        await plan(page, [0], touch);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.__PLAYTEST__.snapshot().experiment === null, null, { polling: 50 });
        await press(page, '#open-experiment', touch);
        assert.deepEqual((await state(page)).days, []); assert.equal((await state(page)).remaining, 3);
        await press(page, '#close-experiment', touch);
        await page.waitForFunction(() => window.__PLAYTEST__.snapshot().experiment === null, null, { polling: 50 });
      });
      await page.evaluate(() => scrollTo(0, 0));
      await shot(page, tag + '-returned');
      await context.close();
    }
    await check('四视口页面与控制台零错误', async () => { assert.deepEqual(report.errors, []); });
  } catch (e) {
    report.checks.push({ name: '运行阻断', pass: false, error: e.stack });
    console.error(e); process.exitCode = 1;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${report.checks.filter((c) => c.pass).length}/${report.checks.length} passed`);
})();
