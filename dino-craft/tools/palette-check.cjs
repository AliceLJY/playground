// Local GPU check. --before captures the frozen old C, --default checks the new palette.
// --perf measures old/new views serially. Optional final argument is the page URL.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawn, execFileSync} = require('node:child_process');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(execFileSync('npm', ['root', '-g'], {encoding:'utf8'}).trim(), 'playwright'))); }
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'shots');
fs.mkdirSync(out, {recursive:true});
const mode = process.argv.includes('--before') ? 'before' : process.argv.includes('--perf') ? 'perf' : 'default';
const customBase = process.argv.find(x => /^https?:/.test(x));
const base = customBase || 'http://127.0.0.1:8968/dist/index.html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = {mode, date:new Date().toISOString(), scenes:[], errors:[], checks:[], load:{}};
let server;
function chromeLoad() {
  const rows = execFileSync('ps', ['-axo', 'pcpu,comm'], {encoding:'utf8'}).split('\n').filter(s => /Chromium|Google Chrome/.test(s));
  return {processes:rows.length, activeOverOnePercent:rows.filter(s => parseFloat(s)>=1).length,
    totalCpuPercent:+rows.reduce((sum,s) => sum+parseFloat(s), 0).toFixed(1)};
}
async function main() {
  const {paletteFailures} = await import('../src/palette-metrics.mjs');
  report.load.beforeOwnBrowser = chromeLoad();
  if (!customBase) {
    server = spawn(process.execPath, [path.join(__dirname, 'serve.cjs'), root, '8968'], {stdio:'ignore'});
    await sleep(400);
  }
  const browser = await chromium.launch({headless:true, channel:'chromium', args:process.platform==='darwin'?['--use-angle=metal']:[]});
  try {
    const ctx = await browser.newContext({viewport:{width:1440, height:900}, deviceScaleFactor:2});
    const page = await ctx.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if(m.type()==='error')report.errors.push(m.text()); });
    page.on('requestfailed', r => report.errors.push(r.failure().errorText));
    let jobs = ['hero','wide','night'].map(view => ({view}));
    if (mode==='perf') jobs = ['before','after'].flatMap(phase => ['hero','wide','night','play'].map(view => ({phase, view})));
    for (const job of jobs) {
      console.log(mode, JSON.stringify(job));
      const u = new URL(base);
      if (mode==='before'||job.phase==='before') u.pathname = u.pathname.replace(/dist\/index.html$/, 'shots/r4-before.html');
      u.search = 'test=1'+(job.view==='play'?'':'&view='+job.view);
      await page.goto(u.href);
      await page.waitForFunction(() => __PLAYTEST__?.ready, null, {polling:100, timeout:60000});
      if (job.view==='play') await page.locator('#start').click();
      await sleep(600);
      await page.evaluate(() => __PLAYTEST__.clearPerformance());
      await sleep(mode==='perf'?3200:1000);
      const state = await page.evaluate(() => __PLAYTEST__.snapshot());
      assert.equal(state.view, job.view);
      assert.equal(state.dead, false);
      const item = {...job, state};
      if (mode!=='perf') {
        item.metrics = await page.evaluate(() => __PLAYTEST__.paletteAudit());
        item.camera = (await page.evaluate(() => __PLAYTEST__.renderAudit())).camera;
        const phase = mode==='before'?'before':'after';
        await page.screenshot({path:path.join(out, `r4-${phase}-${job.view}.png`)});
      }
      report.scenes.push(item);
    }
    if (mode==='default'&&fs.existsSync(path.join(out, 'r4-before-report.json'))) {
      const before = JSON.parse(fs.readFileSync(path.join(out, 'r4-before-report.json')));
      for (const item of report.scenes) {
        const old = before.scenes.find(s => s.view===item.view);
        assert.deepEqual(item.camera, old.camera, 'matched camera');
        assert.deepEqual(item.state.quality, old.state.quality, 'matched default rendering settings');
        assert.equal(item.state.time, old.state.time, 'matched simulation time');
        await compose(page, [
          {label:'OLD C / '+item.view, data:fs.readFileSync(path.join(out, `r4-before-${item.view}.png`)).toString('base64')},
          {label:'SUNLIT ISLAND / '+item.view, data:fs.readFileSync(path.join(out, `r4-after-${item.view}.png`)).toString('base64')}
        ], 2, `r4-compare-${item.view}.png`);
      }
    }
    if (mode==='perf') {
      for (const view of ['hero','wide','night','play']) {
        const old = report.scenes.find(s => s.phase==='before'&&s.view===view).state;
        const now = report.scenes.find(s => s.phase==='after'&&s.view===view).state;
        const failures = [];
        if(now.swiftShader||old.swiftShader) failures.push('hardware renderer required for FPS comparison');
        if(now.drawCalls>110||now.triangles>300000) failures.push('render budget exceeded');
        if(now.performance.fps<(view==='play'?59:29)) failures.push('existing FPS cap not reached');
        if(now.performance.jsP95>12) failures.push('main-thread JS exceeds budget');
        if(now.quality.scale!==old.quality.scale||now.quality.dpr!==old.quality.dpr) failures.push('render quality differs');
        report.checks.push({view, passed:!failures.length, failures});
      }
    } else {
      const failures = paletteFailures(report.scenes);
      report.checks.push({passed:!failures.length, failures});
    }
    await ctx.close();
  } finally { await browser.close(); }
  report.load.afterOwnBrowser = chromeLoad();
  report.passed = !report.errors.length&&report.checks.every(c => c.passed);
  if (!report.passed) process.exitCode = 1;
}
async function compose(page,tiles,cols,file){
 const png=await page.evaluate(async({tiles,cols})=>{
  const images=await Promise.all(tiles.map(async t=>{const im=new Image();im.src='data:image/png;base64,'+t.data;await im.decode();return {...t,im};}));
  const w=1080,h=675,label=44,c=document.createElement('canvas');c.width=w*cols;c.height=(h+label)*Math.ceil(images.length/cols);const g=c.getContext('2d');g.fillStyle='#142529';g.fillRect(0,0,c.width,c.height);g.font='bold 21px sans-serif';
  images.forEach(({im,label:text},i)=>{const x=i%cols*w,y=Math.floor(i/cols)*(h+label);g.drawImage(im,x,y+label,w,h);});g.fillStyle='#f0e3c7';images.forEach(({label:text},i)=>g.fillText(text,i%cols*w+16,Math.floor(i/cols)*(h+label)+29));return c.toDataURL('image/png').split(',')[1];
 },{tiles,cols});fs.writeFileSync(path.join(out,file),Buffer.from(png,'base64'));
}
main().catch(e => {report.errors.push(e.stack); process.exitCode=1;}).finally(() => {
  if(server)server.kill();
  fs.writeFileSync(path.join(out, `r4-${mode}-report.json`), JSON.stringify(report,null,2));
  console.log(JSON.stringify({mode,passed:report.passed,checks:report.checks,errors:report.errors,load:report.load},null,2));
});
