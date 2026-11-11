const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(require.resolve('playwright', {paths: [process.env.NODE_PATH || '/opt/homebrew/lib/node_modules']}));
const {measureSky} = require('./sky-metrics.cjs');

async function renderSkyScenarios({base, out}) {
  fs.mkdirSync(out, {recursive: true});
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const report = {date: new Date().toISOString(), browser: browser.version(), base, errors: [], scenarios: []};
  try {
    for (const [name, view, hour] of [
      ['default', 'default', 2], ['hero', 'hero', 2], ['wide', 'wide', 2],
      ['dawn', 'hero', 0], ['noon', 'hero', 1], ['night', 'night', 3]
    ]) {
      const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      // The no-query entry uses the normal camera, clock and adaptive quality.
      // This development flag only exposes the existing observation hook.
      await page.addInitScript(() => { window.__SKY_TEST_CAPTURE__ = true; });
      const time = new Date('2026-11-11T10:00:00Z');
      await page.clock.install({time});
      await page.clock.pauseAt(time);
      const url = new URL(base);
      if (view !== 'default') url.searchParams.set('view', view);
      await page.goto(url.href);
      await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, {polling: 100, timeout: 60000});
      await page.addStyleTag({content: '.loading { transition: none; }'});
      if (hour !== 2) await page.click('[data-time="' + hour + '"]');
      if (view === 'default') await page.clock.runFor(12000);
      // A paused page clock needs a draw after a real time-button click.
      // Otherwise its HUD changes while the screenshot still shows dusk.
      await page.evaluate(() => window.__PLAYTEST__.step(0));
      const screen = await page.screenshot({path: path.join(out, name + '.png')});
      const frames = await page.evaluate(() => window.__SKY_DEBUG__.capturePalette());
      // Re-display the actual GPU sky behind the real CSS veil. This catches
      // colour contamination introduced after WebGL, including the old brown
      // lower-edge overlay. All HUD elements are hidden for this paired sample.
      await page.evaluate(async src => {
        const image = document.createElement('img');
        image.id = 'sky-sample';
        image.src = src;
        image.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;';
        await image.decode();
        document.body.prepend(image);
        const style = document.createElement('style');
        style.id = 'sky-sample-style';
        style.textContent = 'body > :not(.veil):not(#sky-sample) {visibility:hidden!important}';
        document.head.append(style);
      }, frames.sky);
      const display = await page.screenshot({path: path.join(out, name + '-sky-display.png')});
      await page.evaluate(() => {
        document.querySelector('#sky-sample').remove();
        document.querySelector('#sky-sample-style').remove();
      });
      const metrics = await page.evaluate(async ({sources, measure}) => {
        const images = {};
        let width, height;
        for (const [key, src] of Object.entries(sources)) {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = width = image.width;
          canvas.height = height = image.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0);
          images[key] = ctx.getImageData(0, 0, width, height).data;
        }
        return (0, eval)('(' + measure + ')')({...images, width, height});
      }, {sources: {data: 'data:image/png;base64,' + display.toString('base64'),
        screen: 'data:image/png;base64,' + screen.toString('base64'),
        background: frames.background, rawSky: frames.sky}, measure: measureSky.toString()});
      fs.writeFileSync(path.join(out, name + '-sky.png'), Buffer.from(frames.sky.split(',')[1], 'base64'));
      const snapshot = await page.evaluate(() => window.__PLAYTEST__.snapshot());
      assert.equal(snapshot.view, view, 'requested scene actually entered');
      assert.equal(snapshot.hour, hour, 'requested time actually entered');
      if (view === 'default') assert.equal(new URL(page.url()).search, '', 'default entry has no parameters');
      report.scenarios.push({name, url: url.href, snapshot, metrics});
      console.log('SKY ' + name + ' ' + JSON.stringify({minSaturation: metrics.minSaturation,
        minimumRow: metrics.minimumRow, khakiFraction: metrics.khakiFraction,
        greyValleyRows: metrics.greyValleyRows, cloudPixels: metrics.cloudPixels,
        brownCloudFraction: metrics.brownCloudFraction, renderer: snapshot.renderer,
        samples: metrics.samples.map(r => r.hex)}));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  renderSkyScenarios({base: process.argv[2] || 'file://' + path.resolve(__dirname, '../dist/index.html'),
    out: process.argv[3] || 'shots/r4-after'}).catch(e => { console.error(e); process.exitCode = 1; });
}
module.exports = {renderSkyScenarios};
