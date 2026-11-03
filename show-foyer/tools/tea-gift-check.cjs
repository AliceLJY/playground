const skipIntro = url => { const u = new URL(url); u.searchParams.set('intro', 'skip'); return u.href; };
// Optional tea gift: real touch/keyboard inputs, real RAF under the page clock.
// NODE_PATH="$(npm root -g)" node tools/tea-gift-check.cjs <page-url> <out-dir>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [url, out] = process.argv.slice(2);
if (!url || !out) throw new Error('Expected page URL and output directory');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], shots: [], environment: [] };
function check(name, pass, detail) { report.checks.push({ name, pass: !!pass, detail }); console.log(pass ? 'OK' : 'FAIL', name); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
(async () => {
  const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  report.browser = browser.version();
  for (const [width, height] of [[390, 664], [320, 568], [844, 340], [1365, 900]]) {
    const tag = `${width}x${height}`, errors = [];
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 1365 ? 1 : 2, hasTouch: width !== 1365 });
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // Observe actual photo drawing calls and pixels, without replacing rendering.
    await context.addInitScript(() => {
      window.photoTexts = [];
      const fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
        if (!this.canvas.id) photoTexts.push(text);
        return fill.call(this, text, ...args);
      };
    });
    await p.clock.install({ time: new Date('2026-11-03T12:15:00Z') });
    await p.goto(skipIntro(url)); await p.waitForFunction(() => window.__foyer?.ready, null, { polling: 50 });
    await p.clock.pauseAt(new Date('2026-11-03T12:15:01Z'));
    const snap = () => p.evaluate(() => __foyer.snapshot());
    const touch = async selector => {
      const b = p.locator(selector); await b.scrollIntoViewIfNeeded();
      if (width === 1365) await b.click(); else await b.tap();
    };
    const shot = async name => {
      await p.clock.runFor(34); // Capture the new state only after a real rendered frame.
      await p.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
      report.shots.push({ tag, name, state: await snap() });
    };
    const layout = async (name, selector) => {
      const rows = [];
      for (const b of await p.locator(selector).all()) {
        if (!await b.isVisible() || !await b.isEnabled()) continue;
        await b.scrollIntoViewIfNeeded();
        rows.push(await b.evaluate(el => {
          const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { text: el.textContent, width: r.width, height: r.height, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5, hit: hit === el || el.contains(hit) };
        }));
      }
      check(`${tag} ${name} buttons reachable >=44px`, rows.length > 0 && rows.every(r => r.width >= 44 && r.height >= 44 && r.inside && r.hit), rows);
    };
    report.environment.push(await p.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl'), ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return { viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, canvas: [scene.width, scene.height], renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable' };
    }));
    await touch('#btnSit'); await p.evaluate(() => __foyer.step(30000));
    let s = await snap();
    check(`${tag} intro=skip retains original foyer after 30s`, s.gift.phase === 'off' && s.residents === 3 && !s.usher && !s.gift.ticket && await p.locator('#btnTea').isDisabled(), s);
    // Save a real ordinary visit before the optional round, then prove no history changes.
    await touch('#btnLeave'); await p.clock.runFor(1500);
    const stored = await p.evaluate(() => localStorage.getItem('show-foyer-visits'));
    await touch('#infoBtn'); await layout('entry', '#giftStart'); await shot('menu'); await touch('#giftStart');
    await p.evaluate(() => __foyer.step(30000)); s = await snap();
    check(`${tag} door waiting does not count`, s.gift.phase === 'door' && s.gift.elapsed === 0 && !s.usher);
    // Before invitation: early tea is a no-op; leaving resets only the optional round.
    await touch('#btnSit'); await p.evaluate(() => __foyer.step(24000)); await p.keyboard.press('4'); s = await snap();
    check(`${tag} early tea gives no reward or penalty`, s.gift.phase === 'waiting' && !s.gift.ticket && s.teas === 0 && s.gift.elapsed >= 23.9);
    await touch('#btnLeave'); s = await snap();
    check(`${tag} leave resets optional timer`, s.gift.phase === 'door' && s.gift.elapsed === 0 && !s.gift.ticket && !s.usher);
    await touch('#btnSit'); await p.clock.runFor(1000);
    check(`${tag} retry does not inherit old wait`, (await snap()).gift.phase === 'waiting');
    await p.clock.runFor(24200); s = await snap();
    const occupants = await p.evaluate(() => __foyer.state.residents.map(r => r.seat).concat(__foyer.state.me.seat));
    check(`${tag} real invitation happens in an unoccupied neighbour seat`, s.gift.phase === 'invited' && s.usher?.label === '领位人 · 非真人' && s.humans === 1 && new Set(occupants).size === 4 && await p.evaluate(() => FOYER.adjacent(__foyer.state.me.seat, __foyer.state.usher.seat)), s);
    await shot('invitation'); await p.clock.runFor(3000);
    check(`${tag} no input does not complete`, !(await snap()).gift.ticket);
    if (width === 1365) await p.keyboard.press('4'); else await touch('#btnTea');
    await p.clock.runFor(1600); s = await snap();
    check(`${tag} real tea input earns exactly one ticket`, s.gift.phase === 'done' && s.teas === 1 && s.gift.ticket.seat === s.seat, s);
    await p.keyboard.press('4'); check(`${tag} duplicate tea cannot repeat reward`, (await snap()).teas === 1);
    await shot('reward'); await p.evaluate(() => { photoTexts.length = 0; }); await touch('#btnPhoto');
    await layout('reward photo', '#photoOverlay button'); await shot('photo');
    const drawn = await p.evaluate(async () => {
      const img = document.querySelector('#photoImg'); await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      // Interior paper area must really be cream coloured, well away from AA/text edges.
      const pixel = Array.from(x.getImageData(164, c.height - 218, 1, 1).data);
      return { pixel, text: photoTexts.slice(), data: img.src.split(',')[1] };
    });
    check(`${tag} photo really draws paper, identity and seat stamp`, drawn.pixel.join(',') === '239,230,210,255' && drawn.text.includes('一杯茶的回礼') && drawn.text.includes('领位人 · 非真人') && drawn.text.includes('二排二座'), { pixel: drawn.pixel, text: drawn.text });
    fs.writeFileSync(path.join(out, `${tag}-saved-photo.png`), Buffer.from(drawn.data, 'base64'));
    await touch('[data-close="photoOverlay"]');
    await p.evaluate(() => __foyer.jumpTo(.01)); await p.clock.runFor(2900); await touch('#curtainPhotoBtn');
    check(`${tag} ending photo retains earned ticket`, (await snap()).gift.ticket !== null);
    await shot('ending-photo'); await p.keyboard.press('Escape');
    check(`${tag} photo Escape retains next-show entry`, (await snap()).curtainOverlay);
    await touch('#nextShowBtn'); s = await snap();
    check(`${tag} next show clears gift and preserves original history`, s.gift.phase === 'off' && !s.gift.ticket && !s.usher && s.phase === 'door' && await p.evaluate(() => localStorage.getItem('show-foyer-visits')) === stored, s);
    await touch('#btnSit'); await touch('#btnClap');
    check(`${tag} normal actions work after completion`, (await snap()).claps === 1);
    // The first completion above uses continuous real RAF; accelerate only this extra
    // keyboard-only completion and the no-input/early-error branches, plus the immediate photo exit route.
    await p.keyboard.press('b'); await p.locator('#giftStart').focus(); await p.keyboard.press('Enter');
    await p.keyboard.press('1'); await p.evaluate(() => __foyer.step(25200)); await p.keyboard.press('4');
    check(`${tag} keyboard-only completion`, (await snap()).gift.phase === 'done');
    await p.keyboard.press('p'); await touch('#photoGiftExit'); s = await snap();
    check(`${tag} immediate return clears all optional state`, s.gift.phase === 'off' && !s.usher && !s.gift.ticket && s.teas === 0 && s.phase === 'door');
    await shot('returned');
    await touch('#infoBtn'); await touch('#giftStart'); await touch('#btnSit');
    await p.evaluate(() => __foyer.jumpTo(.01)); await p.clock.runFor(2900);
    check(`${tag} missed invitation never awards a ticket`, (await snap()).gift.phase === 'missed' && !(await snap()).gift.ticket);
    await layout('ending retry', '#curtainOverlay button'); await shot('missed-ending');
    await p.keyboard.press('b'); await layout('retry and exit', '#giftStart, #giftExit');
    await p.keyboard.press('Escape'); await touch('#curtainGiftBtn');
    check(`${tag} missed round is retryable`, (await snap()).gift.phase === 'door');
    await touch('#infoBtn'); await touch('#giftExit');
    check(`${tag} menu exit restores normal entry`, (await snap()).gift.phase === 'off');
    check(`${tag} zero page errors`, errors.length === 0, errors);
    await context.close();
  }
  await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter(c => !c.pass).length;
  console.log(`${report.checks.length} checks; ${failed} failures`); process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
