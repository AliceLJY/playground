const skipIntro = url => { const u = new URL(url); u.searchParams.set('intro', 'skip'); return u.href; };
// F1: ending return paths, actual audio control, and every overlay's touch targets.
// NODE_PATH="$(npm root -g)" node tools/regression.cjs <page-url> <out-dir>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [url, out] = process.argv.slice(2);
if (!url || !out) throw new Error('Expected page URL and output directory');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], layouts: [], environment: [] };
function check(name, pass, detail) { report.checks.push({ name, pass: !!pass, detail }); console.log(pass ? 'OK' : 'FAIL', name); }
(async () => {
  const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  report.browser = browser.version();
  for (const [width, height] of [[390, 664], [320, 568], [844, 340], [1365, 900]]) {
    const tag = `${width}x${height}`, errors = [];
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 1365 ? 1 : 2, hasTouch: width !== 1365 });
    // Observe the real WebAudio context, without replacing audio nodes or their behavior.
    await context.addInitScript(() => {
      const Native = window.AudioContext;
      window.AudioContext = class extends Native { constructor(...args) { super(...args); window.observedAudio = this; } };
    });
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.clock.install({ time: new Date('2026-11-03T12:15:00Z') });
    await p.goto(skipIntro(url));
    await p.waitForFunction(() => window.__foyer?.ready, null, { polling: 50 });
    report.environment.push(await p.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl'), ext = gl?.getExtension('WEBGL_debug_renderer_info');
      const c = document.querySelector('#scene');
      return { viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, canvas: [c.width, c.height], renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable' };
    }));
    const shot = name => p.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
    async function layout(name, selector) {
      const rows = [];
      for (const b of await p.locator(selector).all()) {
        if (!(await b.isVisible()) || !(await b.isEnabled())) continue;
        await b.evaluate(el => el.scrollIntoView({ block: 'nearest' }));
        rows.push(await b.evaluate(el => {
          const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          const book = el.closest('.book')?.getBoundingClientRect();
          return { id: el.id || el.textContent, w: r.width, h: r.height, visible: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5,
            hit: hit === el || el.contains(hit), onPaper: !book || (r.left >= book.left && r.right <= book.right && r.top >= book.top && r.bottom <= book.bottom) };
        }));
      }
      const pass = rows.length > 0 && rows.every(r => r.w >= 44 && r.h >= 44 && r.visible && r.hit && r.onPaper);
      check(`${tag} ${name}: >=44px, visible, hit at centre, inside paper`, pass, rows);
      report.layouts.push({ tag, name, rows });
    }
    await p.click('#btnSit'); await p.clock.runFor(100);
    await layout('normal controls', '.top button, #bar button'); await shot('default');
    await p.click('#infoBtn');
    const sound = p.getByRole('button', { name: /^声音：/ });
    const toggleSound = () => width === 1365 ? sound.click() : sound.tap();
    const exists = await sound.count() === 1;
    check(`${tag} phone sound entry`, exists);
    if (exists) {
      await toggleSound();
      await p.waitForTimeout(80);
      check(`${tag} click mutes live audio and stores preference`, await p.evaluate(() => observedAudio.state === 'suspended' && localStorage.getItem('show-foyer-muted') === '1'));
      await p.keyboard.press('m'); await p.waitForTimeout(80);
      check(`${tag} M uses same sound state and resumes`, await p.evaluate(() => observedAudio.state === 'running' && localStorage.getItem('show-foyer-muted') === '0') && await sound.textContent() === '声音：开');
      await toggleSound(); await p.reload();
      await p.waitForFunction(() => window.__foyer?.ready, null, { polling: 50 });
      await p.click('#infoBtn');
      check(`${tag} muted choice survives reload`, await sound.textContent() === '声音：关' && await p.evaluate(() => !window.observedAudio));
    }
    for (let page = 0; page < 5; page++) {
      await layout(`programme page ${page + 1}`, '#programmeOverlay button');
      await shot(`programme-${page + 1}`);
      if (page < 4) await p.click('#progNext');
    }
    await p.click('[data-close="programmeOverlay"]');
    await p.click('#gongBtn'); await layout('gong', '#gongOverlay button'); await shot('gong');
    await p.click('[data-close="gongOverlay"]');
    await p.click('#btnPhoto'); await layout('waiting photo', '#photoOverlay button'); await shot('photo');
    await p.click('[data-close="photoOverlay"]');
    check(`${tag} waiting photo does not open ending`, !(await p.evaluate(() => __foyer.snapshot().curtainOverlay)));
    for (const branch of ['photo-close', 'photo-escape', 'ending-escape']) {
      await p.evaluate(() => { __foyer.nextShow(); });
      await p.click('#btnSit');
      await p.evaluate(() => __foyer.jumpTo(.01));
      await p.clock.runFor(100); await p.clock.fastForward(2800);
      await layout(`${branch} ending`, '#curtainOverlay button');
      if (branch !== 'ending-escape') await p.click('#curtainPhotoBtn');
      if (branch === 'photo-close') await p.click('[data-close="photoOverlay"]'); else await p.keyboard.press('Escape');
      const s = await p.evaluate(() => __foyer.snapshot());
      check(`${tag} ${branch}: next show stays reachable`, s.phase === 'curtain' && !s.photoOpen && s.curtainOverlay, s);
      await shot(branch);
      if (s.curtainOverlay) {
        await p.click('#nextShowBtn'); await p.click('#btnSit');
        check(`${tag} ${branch}: next show can seat again`, await p.evaluate(() => __foyer.snapshot().phase === 'seated'));
      }
    }
    await p.evaluate(() => __foyer.nextShow());
    await p.click('#infoBtn'); for (let i = 0; i < 4; i++) await p.click('#progNext');
    await layout('programme with saved visits', '#programmeOverlay button');
    await p.click('#progClear'); await layout('clear confirmation', '#programmeOverlay button'); await shot('clear-confirmation');
    check(`${tag} zero page errors`, !errors.length, errors);
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter(c => !c.pass).length;
  console.log(`${report.checks.length} checks; ${failed} failures`); process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
