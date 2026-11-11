// Old on the left, new on the right; exact same ROIs enlarged 3x without smoothing.
const fs = require('node:fs');
const path = require('node:path');
const { playwright, REGIONS } = require('./clarity-check.cjs');
const shots = path.resolve(__dirname, '../shots');
(async () => {
  const browser = await playwright().chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    for (const view of ['hero', 'edge']) {
      const images = ['old', 'new'].map(kind => 'data:image/png;base64,' + fs.readFileSync(path.join(shots, `r3-${kind}-${view}.png`)).toString('base64'));
      const image = await page.evaluate(async ({ images, regions, view }) => {
        const decoded = await Promise.all(images.map(async src => { const img = new Image(); img.src = src; await img.decode(); return img; }));
        const canvas = document.createElement('canvas'); canvas.width = 2160; canvas.height = 1550;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#080b14'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f3e8da'; ctx.font = '28px sans-serif';
        for (let i = 0; i < 2; i++) {
          const x = i * 1080;
          ctx.fillText(`${view} · 82s · ${i ? 'NEW 0.75 / 1024²' : 'OLD 0.40 / 512²'}`, x + 26, 43);
          ctx.drawImage(decoded[i], x, 64, 1080, 675);
          let row = 775;
          for (const [name, bounds] of Object.entries(regions)) {
            const [left, top, right, bottom] = bounds.map((v, n) => Math.floor(v * (n % 2 ? decoded[i].height : decoded[i].width)));
            const w = right - left, h = bottom - top;
            ctx.fillStyle = '#f3e8da'; ctx.fillText(`${name === 'ring' ? 'Photon ring' : 'Inner-disk filaments'} · 3× physical pixels`, x + 26, row);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(decoded[i], left, top, w, h, x + (1080 - w * 3) / 2, row + 16, w * 3, h * 3);
            ctx.imageSmoothingEnabled = true;
            row += 390;
          }
          // Mark the measured crop positions on the full frame.
          ctx.strokeStyle = '#87c8eb'; ctx.lineWidth = 2;
          for (const bounds of Object.values(regions)) ctx.strokeRect(x + bounds[0] * 1080, 64 + bounds[1] * 675, (bounds[2] - bounds[0]) * 1080, (bounds[3] - bounds[1]) * 675);
        }
        return canvas.toDataURL('image/png');
      }, { images, regions: REGIONS[view], view });
      fs.writeFileSync(path.join(shots, `r3-compare-${view}.png`), Buffer.from(image.split(',')[1], 'base64'));
      console.log(`shots/r3-compare-${view}.png`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
