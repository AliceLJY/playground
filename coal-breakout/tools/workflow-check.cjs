// Existing Playwright only. Real touch / keyboard events drive winning rounds; extra loss checks use the diagnostic driver.
// NODE_PATH="$(npm root -g)" node tools/workflow-check.cjs <base-url> <output-dir>
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8936/';
const out = process.argv[3] || path.join(__dirname, 'shots/workflows');
fs.mkdirSync(out, { recursive: true });
const report = { base, checks: [], runs: [] };
const sizes = [[390, 664], [320, 568], [844, 340], [1365, 900]];
function check(name, pass, detail) {
  report.checks.push({ name, pass: !!pass, detail });
  assert.ok(pass, name + ': ' + JSON.stringify(detail));
}
async function layout(page, name) {
  const buttons = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => !b.disabled && b.getClientRects().length && !b.closest('[hidden]')).map(b => {
    const r = b.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const covered = !b.closest('.veil') && [...document.querySelectorAll('.veil')].some(v => !v.hidden);
    return { label: b.textContent, width: r.width, height: r.height, pass: covered || r.x >= 0 && r.y >= 0 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5 && r.width >= 44 && r.height >= 44 && (top === b || b.contains(top)) };
  }));
  check(name + ' buttons visible/clickable/44px', buttons.every(b => b.pass), buttons);
  if (await page.locator('#title').isVisible()) {
    const text = await page.evaluate(() => {
      const brief = document.querySelector('.brief').getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(document.querySelector('#brief-text'));
      const content = range.getBoundingClientRect(), rule = document.querySelector('.title-rule');
      return { bottom: content.bottom, boxBottom: brief.bottom, nextTop: rule.getClientRects().length ? rule.getBoundingClientRect().top : innerHeight };
    });
    check(name + ' briefing does not overlap following content', text.bottom <= text.boxBottom + .5 && text.bottom <= text.nextTop + .5, text);
  }
}
async function shot(page, name) {
  const state = await page.evaluate(() => __PLAYTEST__.snapshot());
  await page.screenshot({ path: path.join(out, name + '.png') });
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(state, null, 2));
}
async function clean(page, name, level = 1) {
  const s = await page.evaluate(() => __PLAYTEST__.snapshot());
  const extra = await page.evaluate(() => { const g = __PLAYTEST__.state(); return [g.chosenCount, g.revives, g.autoCard, g.autoUntil]; });
  check(name, s.workflow === '' && s.phase === 'play' && s.level === level && s.rank === 1 && s.hp === 6 && s.cards.every(n => n === 0) && extra.join() === '0,0,-1,0', { s, extra });
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  report.browser = browser.version();
  try {
    for (const [width, height] of sizes) for (const workflow of ['clear', 'sustain']) {
      const name = `${width}x${height}-${workflow}`, touch = width < 1000;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
      const url = new URL(base); url.searchParams.set('test', '1'); url.searchParams.set('seed', '2');
      await page.goto(url.href);
      await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50 });
      // A future fixed instant avoids racing the host clock by a few milliseconds.
      await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
      if (!report.renderer) report.renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'), ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable'; });
      const option = page.locator(`[data-workflow="${workflow}"]`);
      if (touch) await option.tap(); else { await option.focus(); await page.keyboard.press('Enter'); }
      check(name + ' shared button intent', await option.getAttribute('aria-pressed') === 'true');
      await layout(page, name + ' menu'); await shot(page, name + '-menu');
      if (touch) await page.locator('#start').tap(); else { await page.locator('#start').focus(); await page.keyboard.press('Enter'); }
      check(name + ' selection reaches simulation', await page.evaluate(w => __PLAYTEST__.snapshot().workflow === w, workflow));
      await page.click('#pause-button'); await page.click('#resume');
      check(name + ' pause retains preference', await page.evaluate(w => __PLAYTEST__.snapshot().workflow === w, workflow));
      await page.evaluate(() => { window.drive = CoalPilot.create('precise', 2); });
      const cdp = await context.newCDPSession(page), box = await page.locator('#game').boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      let held = [], pointer = false, sawUpgrade = false, sawAuto = false, lastAuto = 0, moved = 0, steps = 0, state;
      const awards = [];
      async function release() {
        if (pointer) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); pointer = false; }
        for (const key of held) await page.keyboard.up(key);
        held = [];
      }
      for (; steps < 950; steps++) {
        const data = await page.evaluate(() => {
          const g = __PLAYTEST__.state();
          return { state: __PLAYTEST__.snapshot(), input: Array.from(drive(g)), autoUntil: g.autoUntil, autoCard: g.autoCard, offers: Array.from(g.offer) };
        });
        state = data.state;
        if (data.autoUntil > lastAuto) {
          lastAuto = data.autoUntil; awards.push({ card: data.autoCard, offers: data.offers, tick: state.tick });
          if (!sawAuto) { await shot(page, name + '-auto'); sawAuto = true; }
        }
        if (state.phase === 'won' || state.phase === 'dead') break;
        if (state.phase === 'levelup') {
          await release();
          if (!sawUpgrade) { await layout(page, name + ' manual upgrade'); await shot(page, name + '-upgrade'); sawUpgrade = true; }
          const card = data.input[2] < 0 ? page.locator('#skip') : page.locator('.card').nth(data.input[2]);
          if (touch) await card.tap(); else { await card.focus(); await page.keyboard.press('Enter'); }
          continue;
        }
        if (touch) {
          await release();
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); pointer = true;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + data.input[0] * 28, y: y + data.input[1] * 28 }] });
        } else {
          const a = Math.round(Math.atan2(data.input[1], data.input[0]) / (Math.PI / 4)) * Math.PI / 4;
          const dx = Math.round(Math.cos(a)), dy = Math.round(Math.sin(a));
          const next = [dx < 0 ? 'ArrowLeft' : dx > 0 ? 'ArrowRight' : '', dy < 0 ? 'ArrowUp' : dy > 0 ? 'ArrowDown' : ''].filter(Boolean);
          // Manual choices clear game's key set, so press the intended keys again after each choice.
          for (const k of held) if (!next.includes(k)) await page.keyboard.up(k);
          for (const k of next) if (!held.includes(k)) await page.keyboard.down(k);
          held = next;
        }
        await page.clock.runFor(steps % 3 === 0 ? 334 : 333);
        const after = await page.evaluate(() => __PLAYTEST__.snapshot());
        moved += Math.hypot(after.x - state.x, after.y - state.y);
      }
      await release();
      check(name + ' real input round won', state.phase === 'won', state);
      check(name + ' sampled actual movement, manual choices and auto awards', moved > 1000 && sawUpgrade && sawAuto && awards.length >= 2, { moved, awards });
      const group = workflow === 'clear' ? [1, 2] : [4, 5];
      check(name + ' sampled preference actually awarded', awards.some(a => group.includes(a.card)), awards);
      await layout(page, name + ' result'); await shot(page, name + '-result');
      report.runs.push({ name, input: touch ? 'CDP touch' : 'keyboard', state, awards, moved, steps });
      // Exercise exits from a finished optional run; each browser context keeps progression separate.
      if (workflow === 'clear') {
        await page.click('#next'); await clean(page, name + ' next stage defaults', 2);
      } else { await page.click('#retry'); await clean(page, name + ' result retry defaults'); }
      await page.click('#pause-button'); await page.click('#back-title');
      check(name + ' menu defaults', await page.locator('[data-workflow=""]').getAttribute('aria-pressed') === 'true');
      await page.locator(`[data-workflow="${workflow}"]`).click(); await page.click('#start');
      // Wrong steering is a real simulation; this extra lifecycle check uses the existing diagnostic driver.
      const dead = await page.evaluate(() => __PLAYTEST__.simulate(16000, 'reckless'));
      check(name + ' reckless death', dead.phase === 'dead' && dead.hits >= 6, dead);
      await page.click('#result-home'); await page.click('#start'); await clean(page, name + ' death home defaults', workflow === 'clear' ? 2 : 1);
      await page.click('#pause-button'); await page.click('#back-title');
      await page.locator(`[data-workflow="${workflow}"]`).click(); await page.click('#start');
      await page.click('#pause-button'); await page.click('#pause-retry'); await clean(page, name + ' pause retry defaults', workflow === 'clear' ? 2 : 1);
      check(name + ' zero page errors', !errors.length, errors);
      console.log(name, 'PASS', JSON.stringify({ seconds: state.seconds, cards: state.cards, hits: state.hits, kills: state.kills, awards: awards.length }));
      await context.close();
    }
  } finally {
    await browser.close(); fs.writeFileSync(path.join(out, 'workflow-report.json'), JSON.stringify(report, null, 2));
  }
  console.log(`${report.checks.length} checks; 0 failures`);
})().catch(e => { console.error(e); process.exitCode = 1; });
