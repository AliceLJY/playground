// Place the supplied evaluation frame beside each fixed desktop camera.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'playwright'))); }
const shots = path.resolve(__dirname,'../shots');
const data = file => 'data:image/png;base64,' + fs.readFileSync(path.join(shots,file)).toString('base64');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:530}});
  for (const view of ['hero','wide','edge']) {
    await page.setContent(`<style>body{margin:0;background:#080b14;color:#eee4d8;font:14px sans-serif}header{height:58px;display:flex;align-items:center;justify-content:space-around}.pair{display:flex;align-items:center;height:450px}img{width:720px;max-height:450px;object-fit:contain}</style><header><span>Evaluation case 9 · supplied disruption frame</span><span>This implementation · ${view} camera</span></header><div class="pair"><img src="${data('reference-carbon.png')}"><img src="${data('desktop-'+view+'.png')}"></div>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image=>image.decode())));
    await page.screenshot({path:path.join(shots,'compare-'+view+'.png')});
  }
  await browser.close();
})();
