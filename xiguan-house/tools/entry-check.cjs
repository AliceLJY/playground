// NODE_PATH="$(npm root -g)" node tools/entry-check.cjs <base-url> <out-dir>
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const [base, out] = process.argv.slice(2), checks = [];
fs.mkdirSync(out, { recursive: true });
const check = (name, pass) => { checks.push({ name, pass }); assert.ok(pass, name); };
async function fit(p, selector) {
  return p.locator(selector).evaluateAll(bs => bs.length > 0 && bs.every(b => {
    const r = b.getBoundingClientRect();
    return r.width >= 44 && r.height >= 44 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  }));
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const [width, height] of [[390,664],[320,568],[844,340],[1365,900]]) {
      const context = await browser.newContext({ viewport:{ width, height }, deviceScaleFactor:width < 900 ? 2 : 1, hasTouch:width < 900 });
      const p = await context.newPage(), errors = [];
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      const ready = () => p.waitForFunction(() => window.__xiguan?.ready, null, { polling:50 });
      const open = () => p.waitForFunction(() => __xiguan.s === 3.4 && !__xiguan.busy, null, { polling:50 });
      const shot = name => p.screenshot({ path:path.join(out, `${width}-${name}.png`) });
      await p.goto(base); await p.evaluate(() => localStorage.clear()); await p.reload(); await ready();
      check(`${width}: first visit starts closed hunt`, await p.evaluate(() => __xiguan.s === 0 && __xiguan.hunt.phase === 'finding' && document.querySelector('#hunt-dialog').open));
      check(`${width}: three targets and direct-open fit`, await fit(p, '#hunt-dialog button') && await p.locator('#hunt-exit').innerText() === '直接打开');
      await shot('first');
      await p.locator('#hunt-canvas').click({ position:{x:8,y:8} });
      check(`${width}: other house clicks explain the choice`, await p.evaluate(() => __xiguan.s === 0 && document.querySelector('#hunt-feedback').textContent === '先找三件头，或点直接打开'));
      await p.locator('#hunt-exit').click(); await open(); await shot('skip');
      await p.reload(); await ready();
      check(`${width}: skipped visit returns to original click-to-open`, await p.evaluate(() => __xiguan.hunt.phase === 'idle' && __xiguan.s === 0));
      await p.locator('#scene').click({position:{x:width / 2,y:height / 2}}); await open();
      check(`${width}: original menu remains visible and usable`, await fit(p, '#hunt-start'));
      await p.locator('#hunt-start').click();
      check(`${width}: original menu restarts hunt`, await p.evaluate(() => __xiguan.hunt.phase === 'finding' && __xiguan.hunt.count === 0));
      await p.keyboard.press('Escape');
      await p.evaluate(() => localStorage.clear()); await p.reload(); await ready();
      for (const id of ['jiaomen','tanglong','damen']) await p.locator(`[data-gate="${id}"]`).click();
      await open(); await shot('completed');
      await p.reload(); await ready();
      check(`${width}: completed visit returns to original mode`, await p.evaluate(() => __xiguan.hunt.phase === 'idle' && __xiguan.s === 0));
      await shot('return');
      await p.addInitScript(() => { Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('storage unavailable'); }; });
      await p.reload(); await ready();
      check(`${width}: blocked storage starts new default`, await p.evaluate(() => __xiguan.hunt.phase === 'finding'));
      await p.locator('#hunt-exit').click(); await open(); await p.reload(); await ready();
      check(`${width}: blocked storage repeats new default`, await p.evaluate(() => __xiguan.hunt.phase === 'finding'));
      const fixed = new URL(base); fixed.searchParams.set('view', 'open'); await p.goto(fixed.href); await ready();
      check(`${width}: fixed view bypasses intro`, await p.evaluate(() => __xiguan.s === 3.4 && __xiguan.hunt.phase === 'idle'));
      check(`${width}: zero page errors`, errors.length === 0);
      await context.close();
    }
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ browser:browser.version(), checks }, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
