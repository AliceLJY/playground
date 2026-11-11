// Fourth-round comparisons use browser Canvas and the measured sky-row colours.
// node tools/palette-shots.cjs [base-url] [--montage-only]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(require.resolve('playwright', {paths: [process.env.NODE_PATH || '/opt/homebrew/lib/node_modules']}));
const {renderSkyScenarios} = require('./sky-render.cjs');

async function main() {
  const root = path.resolve(__dirname, '..');
  const before = path.join(root, 'shots/r4-before'), after = path.join(root, 'shots/r4-after');
  if (!process.argv.includes('--montage-only')) {
    const base = process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'file://' + path.join(root, 'dist/index.html');
    for (const [url, out] of [['file://' + path.join(root, 'shots/r4-baseline.html'), before], [base, after]]) {
      const report = await renderSkyScenarios({base: url, out});
      assert.deepEqual(report.errors, []);
    }
  }
  const report = JSON.parse(fs.readFileSync(path.join(after, 'metrics.json'), 'utf8'));
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage();
    for (const name of ['default', 'hero', 'noon', 'night']) {
      const images = [before, after].map(dir => 'data:image/png;base64,' + fs.readFileSync(path.join(dir, name + '.png')).toString('base64'));
      const rows = report.scenarios.find(s => s.name === name).metrics.rows;
      const png = await page.evaluate(async ({images, rows, name}) => {
        const width = 1440, height = 900, header = 44;
        const canvas = document.createElement('canvas');
        canvas.width = width * 2 + 88;
        canvas.height = height + header;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#102233';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 23px system-ui';
        for (let i = 0; i < 2; i++) {
          const image = new Image();
          image.src = images[i];
          await image.decode();
          ctx.drawImage(image, i * width, header);
          ctx.fillStyle = '#fff2de';
          ctx.fillText((i === 0 ? 'BEFORE' : 'AFTER') + ' / ' + name.toUpperCase(), i * width + 18, 30);
        }
        for (let y = 0; y < height; y++) {
          ctx.fillStyle = rows[y].hex;
          ctx.fillRect(width * 2 + 16, header + y, 56, 1);
        }
        ctx.font = '13px system-ui';
        ctx.fillStyle = '#fff2de';
        ctx.fillText('SKY', width * 2 + 28, 29);
        return canvas.toDataURL('image/png').split(',')[1];
      }, {images, rows, name});
      const file = path.join(root, 'shots/r4-compare-' + name + '.png');
      fs.writeFileSync(file, Buffer.from(png, 'base64'));
      console.log(file);
    }
  } finally {
    await browser.close();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
