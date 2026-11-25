// Controls check (2026-11-25 Duet review): Space and the arrow keys keep driving the replay after a button was clicked
// with the mouse or the task list was closed; a keyboard user who tabs to a button still activates it with Space;
// the detail card does not claim "paused" while the replay runs; the chosen length survives switching datasets.
// Usage: NODE_PATH="$(npm root -g)" node tools/controls-check.cjs <base-url>
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8793/dispatch-replay/';
let fails = 0;
const check = (name, pass, detail) => { if (!pass) fails++; console.log(pass ? 'ok  ' : 'FAIL', name, pass ? '' : JSON.stringify(detail)); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    const st = () => page.evaluate(() => window.__replay.state());
    const open = async (q) => { await page.goto(base + q); await page.waitForFunction(() => window.__replay?.ready); };
    // 1. click 重来 with the mouse, then Space pauses instead of restarting again
    await open('?t=600');
    await page.click('#restart'); await page.waitForTimeout(400);
    const a = await st();
    await page.keyboard.press('Space'); await page.waitForTimeout(200);
    const b = await st();
    check(`${w} Space after clicking 重来 pauses (no second restart)`, a.playing && !b.playing && b.t >= a.t - 0.01, { before: [a.playing, a.t], after: [b.playing, b.t] });
    const t0 = (await st()).t; await page.keyboard.press('ArrowRight'); const t1 = (await st()).t;
    check(`${w} ArrowRight after clicking 重来 seeks forward 3%`, t1 - t0 > b.endT * 0.025, { moved: t1 - t0 });
    // 2. open and close the task list with the mouse, then Space plays and the list stays closed
    await open('?t=600');
    await page.click('#tasks'); await page.click('#tasks-close'); await page.waitForTimeout(200);
    const c = await st();
    await page.keyboard.press('Space'); await page.waitForTimeout(200);
    const d = await st(), reopened = await page.evaluate(() => document.getElementById('task-dialog').open);
    check(`${w} Space after closing the task list toggles play and leaves the list closed`, !reopened && d.playing !== c.playing, { reopened, before: c.playing, after: d.playing });
    // 3. a keyboard user tabbing to 任务 still opens it with Space
    if (!touch) {
      await open('?t=600');
      await page.locator('#tasks').focus();
      await page.evaluate(() => document.body.focus());
      for (let i = 0; i < 12 && !(await page.evaluate(() => document.activeElement.id === 'tasks')); i++) await page.keyboard.press('Tab');
      const onTasks = await page.evaluate(() => document.activeElement.id === 'tasks');
      await page.keyboard.press('Space'); await page.waitForTimeout(200);
      const opened = await page.evaluate(() => document.getElementById('task-dialog').open);
      check(`${w} Tab to 任务 then Space opens the list`, onTasks && opened, { onTasks, opened });
    }
    // 4. the detail card while the replay runs
    await open('?t=600');
    const cell = (await st()).cells[0];
    await page.mouse.click(cell.x, cell.y);
    await page.click('#play'); await page.waitForTimeout(300);
    const e = await st(), hint = await page.evaluate(() => document.querySelector('#detail .d-hint')?.textContent || '');
    check(`${w} detail card does not say 已暂停 while playing`, e.playing && !hint.includes('已暂停'), { playing: e.playing, hint });
    // 5. the chosen length survives switching datasets
    await open('');
    await page.selectOption('#speed', '180');
    await page.selectOption('#dataset', 'yingge-1021');
    await page.waitForFunction(() => window.__replay?.ready && location.search.includes('yingge'));
    const f = await st(), sel = await page.$eval('#speed', (x) => x.value);
    check(`${w} 3-minute length survives switching to 英歌短片`, f.playback === 180 && sel === '180', { playback: f.playback, sel });
    await page.close();
  }
  await browser.close();
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
