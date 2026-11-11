// node tools/browser-check.cjs [base-page-url] [--record]
// Uses installed Playwright and Chrome; a single GPU browser runs sequentially.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { measureClarity } = require('./clarity-check.cjs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright'))); }
const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'shots');
fs.mkdirSync(shots, { recursive: true });
const report = { date: new Date().toISOString(), checks: [], views: [], stages: [], gpuSamples: [], errors: [] };
let server, browser;
function check(name, condition, details) {
  report.checks.push({ name, pass: Boolean(condition), details });
  console.log((condition ? 'PASS ' : 'FAIL ') + name + (details ? ' ' + JSON.stringify(details) : ''));
}
const snapshot = (page) => page.evaluate(() => __PLAYTEST__.snapshot());
async function go(page, base, query = '') {
  const url = new URL(base);
  url.search = query;
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 40 });
  await page.waitForTimeout(120);
}
function half(value) {
  const exponent = (value >> 10) & 31;
  const fraction = value & 1023;
  const sign = value & 32768 ? -1 : 1;
  return sign * (exponent ? 2 ** (exponent - 15) * (1 + fraction / 1024) : 2 ** -14 * fraction / 1024);
}
function region(image, left, top, right, bottom) {
  let sum = 0, count = 0, dark = 0, blue = 0;
  for (let y = Math.floor(top * image.height); y < bottom * image.height; y++) {
    for (let x = Math.floor(left * image.width); x < right * image.width; x++) {
      const offset = ((image.height - 1 - y) * image.width + x) * 4;
      const r = half(image.pixels[offset]), g = half(image.pixels[offset + 1]), b = half(image.pixels[offset + 2]);
      const luminance = .2126 * r + .7152 * g + .0722 * b;
      sum += luminance; count++;
      if (luminance < .01) dark++;
      if (luminance > .1 && b > r * .85) blue++;
    }
  }
  return { mean: sum / count, darkFraction: dark / count, blue, count };
}
async function layout(page, name) {
  const result = await page.evaluate(() => {
    const selectors = 'button,select,#timeline,.time,#quality-readout';
    const items = [...document.querySelectorAll(selectors)].filter(element => element.getClientRects().length).map(element => {
      const box = element.getBoundingClientRect();
      return { name: element.id || element.textContent.trim(), x: box.x, y: box.y, width: box.width, height: box.height, control: element.matches('button,select') };
    });
    const outside = items.filter(box => box.x < -.5 || box.y < -.5 || box.x + box.width > innerWidth + .5 || box.y + box.height > innerHeight + .5);
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1) overlaps.push([a.name, b.name]);
    }
    return { outside, overlaps, small: items.filter(box => box.control && (box.width < 43 || box.height < 43)) };
  });
  check('A5 layout ' + name, !result.outside.length && !result.overlaps.length && !result.small.length, result);
}
async function readParticles(page) { return page.evaluate(() => __TDE_TEST__.particles()); }
async function main() {
  let base = process.argv.find(value => /^https?:/.test(value));
  if (!base) {
    server = spawn(process.execPath, [path.join(__dirname, 'serve.cjs'), root, '0']);
    base = await new Promise((resolve, reject) => {
      server.stdout.on('data', chunk => { const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0] + '/dist/index.html'); });
      server.once('error', reject);
      server.once('exit', code => reject(new Error('server exit ' + code)));
    });
  }
  report.base = base;
  browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' });
  report.browser = browser.version();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  const page = await desktop.newPage();
  const requests = [];
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
  // Source entry is tested when the checker owns its local development server.
  if (server) {
    await go(page, new URL('/dev.html', base).href, 'view=hero&test');
    check('A8 source entry ready', (await snapshot(page)).stage === 5);
    await page.screenshot({ path: path.join(shots, 'source-hero.png') });
    const clarity = await measureClarity(page, new URL('/dev.html', base).href, 'source');
    for (const view of clarity.views) check('A9 source clarity ' + view.view, view.pass, view.metrics);
    report.errors.push(...clarity.errors);
  }
  requests.length = 0;
  await go(page, base, 'view=hero&test');
  check('A8 single-file resources', requests.every(url => url.startsWith('data:') || new URL(url).pathname === new URL(base).pathname), requests.map(url => new URL(url).pathname));
  for (const view of ['hero', 'wide', 'edge']) {
    await go(page, base, 'view=' + view + '&test');
    const state = await snapshot(page);
    report.views.push({ name: 'desktop-' + view, ...state });
    check('A4 actual desktop view ' + view, state.view === view && state.time === (view === 'wide' ? 8 : 82));
    await page.screenshot({ path: path.join(shots, 'desktop-' + view + '.png') });
  }
  for (const [index, time, slug] of [[1,8,'approach'],[2,32,'stretching'],[3,46,'disruption'],[4,64,'collisions'],[5,82,'disk'],[6,102,'aftermath']]) {
    await page.evaluate(index => __TDE_TEST__.view(index === 1 || index === 3 ? 'wide' : 'hero'), index);
    await page.evaluate(time => __TDE_TEST__.seek(time), time);
    const state = await snapshot(page);
    report.stages.push(state);
    check('A1 actual stage ' + index, state.stage === index);
    await page.screenshot({ path: path.join(shots, `stage-${index}-${slug}.png`) });
  }
  await page.evaluate(() => __TDE_TEST__.view('edge'));
  const lensed = await page.evaluate(() => __TDE_TEST__.pixels());
  await page.evaluate(() => __TDE_TEST__.lensing(false));
  const straight = await page.evaluate(() => __TDE_TEST__.pixels());
  await page.screenshot({ path: path.join(shots, 'edge-lensing-disabled.png') });
  let changed = 0, pixels = 0;
  for (let y = Math.floor(lensed.height * .25); y < lensed.height * .70; y++) for (let x = Math.floor(lensed.width * .25); x < lensed.width * .85; x++) {
    const i = (y * lensed.width + x) * 4;
    if (Math.abs(half(lensed.pixels[i]) - half(straight.pixels[i])) > .02) changed++;
    pixels++;
  }
  const upper = region(lensed,.47,.27,.63,.39);
  const lower = region(lensed,.47,.53,.63,.63);
  const shadow = region(lensed,.51,.39,.59,.44);
  check('A2 lensed image and bent disk above/below', changed / pixels > .03 && upper.mean > .03 && lower.mean > .03 && shadow.darkFraction > .70, { changedFraction: changed / pixels, upper, lower, shadow });
  await page.evaluate(() => { __TDE_TEST__.lensing(true); __TDE_TEST__.view('hero'); __TDE_TEST__.seek(64); });
  const collisionImage = await page.evaluate(() => __TDE_TEST__.pixels());
  const collisionStats = await page.evaluate(() => __TDE_TEST__.collisions());
  const thermal = region(collisionImage,.20,.15,.92,.78);
  check('A3 GPU crossings heat to blue-white', collisionStats.crossingPixels > 10 && thermal.blue > 5, { ...collisionStats, bluePixels: thermal.blue });
  let maxOutside = 0, maxExtent = 0;
  for (const seed of [19,73,211]) {
    await page.evaluate(seed => __PLAYTEST__.setSeed(seed), seed);
    for (const time of [8,29,46,64,82,102]) {
      await page.evaluate(time => __TDE_TEST__.seek(time), time);
      const data = await readParticles(page);
      let outside = 0, min = 100, max = -100;
      for (let i = 0; i < data.length; i += 4) {
        if (!data.slice(i,i+4).every(Number.isFinite)) throw new Error('non-finite GPU particle');
        if (Math.abs(data[i]) > 24 || Math.abs(data[i+2]) > 24) outside++;
        min = Math.min(min, data[i]); max = Math.max(max, data[i]);
      }
      maxOutside = Math.max(maxOutside, outside / (data.length / 4));
      if (time === 46) maxExtent = Math.max(maxExtent,max-min);
    }
  }
  check('A3 finite GPU trajectories across three seeds', maxOutside < .1 && maxExtent > 5.76, { maxOutside, disruptionExtent: maxExtent });
  await page.evaluate(() => { __PLAYTEST__.setSeed(19); __TDE_TEST__.seek(94); });
  const first = await readParticles(page);
  await page.evaluate(() => __TDE_TEST__.seek(94.05));
  const second = await readParticles(page);
  let inner = 0, outer = 0, ni = 0, no = 0, maxDelta = 0;
  for (let i = 0; i < first.length; i += 4) {
    const r = Math.hypot(first[i],first[i+2]);
    const angle = Math.abs(Math.atan2(first[i]*second[i+2]-first[i+2]*second[i],first[i]*second[i]+first[i+2]*second[i+2]))/.05;
    if (r < 4) { inner += angle; ni++; }
    if (r > 8) { outer += angle; no++; }
    maxDelta = Math.max(maxDelta,Math.hypot(second[i]-first[i],second[i+2]-first[i+2]));
  }
  // Analytic ring coordinates rotate continuously, with the orbital phase also retained.
  check('A3 real GPU differential rotation and continuity', inner/ni > 1.5*(outer/no) && maxDelta < 1, { inner:inner/ni, outer:outer/no, maxDelta });
  await page.evaluate(() => __TDE_TEST__.seek(94));
  check('A1 deterministic backward seek', JSON.stringify(first) === JSON.stringify(await readParticles(page)));
  for (let tier = 0; tier <= 2; tier++) {
    await page.evaluate(tier => __TDE_TEST__.quality(tier),tier);
    const state = await snapshot(page);
    check('A6 actual quality tier ' + tier, state.tier === tier && state.particleCount === [4096,9216,16384][tier] && state.raySteps === [96,144,192][tier] && state.drawCalls <= 4 && state.triangles <= 34000 && state.rayResolution[0] === Math.round(1440*state.dpr*state.resolutionScale), state);
  }
  await go(page, base, 'view=hero&test');
  await page.locator('#play').click();
  await page.waitForTimeout(800);
  let before = await snapshot(page);
  await page.waitForTimeout(650);
  const after = await snapshot(page);
  check('A5 play advances time', after.time > before.time + .4);
  await page.locator('#play').click();
  await page.waitForTimeout(100);
  before = await snapshot(page);
  await page.waitForTimeout(500);
  check('A7 static pause stops rendering', (await snapshot(page)).frames === before.frames);
  const slider = await page.locator('#timeline').boundingBox();
  await page.mouse.click(slider.x + slider.width*.60,slider.y+slider.height/2);
  check('A5 real timeline pointer seek', Math.abs((await snapshot(page)).time - 64.8) < 1.5);
  await page.locator('#speed').selectOption('2');
  check('A5 speed control', (await snapshot(page)).speed === 2);
  await page.locator('[data-view=wide]').click();
  check('A5 view controls preserve time', Math.abs((await snapshot(page)).time - 64.8) < 1.5 && (await snapshot(page)).view === 'wide');
  const cameraBefore = (await snapshot(page)).camera;
  await page.mouse.move(790,350); await page.mouse.down(); await page.mouse.move(900,400,{steps:8}); await page.mouse.up();
  await page.mouse.wheel(0,150);
  const cameraAfter = (await snapshot(page)).camera;
  check('A5 real drag and zoom', cameraAfter.yaw !== cameraBefore.yaw && cameraAfter.distance > cameraBefore.distance);
  await page.locator('#physics').click();
  check('A5 physics panel opens', await page.locator('#panel').isVisible());
  await page.screenshot({ path:path.join(shots,'desktop-physics.png') });
  await page.locator('#close-panel').click();
  await page.locator('#play').click();
  // Exercise the actual IntersectionObserver path by removing the canvas from layout.
  await page.evaluate(() => document.querySelector('canvas').style.display='none');
  await page.waitForTimeout(250);
  before = await snapshot(page);
  await page.waitForTimeout(400);
  check('A7 invisible canvas stops frames', !before.visible && (await snapshot(page)).frames === before.frames);
  await page.evaluate(() => document.querySelector('canvas').style.display='block');
  await page.waitForTimeout(250);
  check('A7 visible canvas resumes', (await snapshot(page)).frames > before.frames);
  // Headless Chrome keeps background tabs visible; explicitly exercise visibilitychange.
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange')); });
  before = await snapshot(page);
  await page.waitForTimeout(400);
  const hiddenState = await snapshot(page);
  check('A7 visibilitychange stops frames', hiddenState.frames === before.frames && !hiddenState.visible);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(250);
  check('A7 visibility resume has no time jump', (await snapshot(page)).time - before.time < .8);
  const down = await page.evaluate(() => __TDE_TEST__.adaptive(55,45,100000));
  const up = await page.evaluate(() => __TDE_TEST__.adaptive(12,240,120000));
  check('A7 integrated adaptive downgrade/recovery', down.tier === 0 && up.tier === 1 && down.changes === 1 && up.changes === 1, {down,up});
  // Fresh normal entry, default settings and hardware GPU frame-time samples.
  await go(page,base);
  await page.waitForTimeout(1500);
  before = await snapshot(page);
  const start = performance.now();
  for (let i = 0; i < 10; i++) { await page.waitForTimeout(500); report.gpuSamples.push(await snapshot(page)); }
  const perf = await snapshot(page);
  report.performance = { ...perf, measuredFps:(perf.frames-before.frames)*1000/(performance.now()-start) };
  check('A6 default performance budget', perf.drawCalls <= 4 && perf.dpr <= 1.5 && perf.jsP95 < 8 && (perf.softwareRenderer || report.performance.measuredFps >= 26), report.performance);
  await page.screenshot({path:path.join(shots,'desktop-default.png')});
  await page.locator('#play').click();
  const clarity = await measureClarity(page, base);
  for (const view of clarity.views) check('A9 default clarity ' + view.view, view.pass, view.metrics);
  report.errors.push(...clarity.errors);
  await go(page,base,'view=hero&test');
  await page.locator('#play').click();
  await page.waitForTimeout(1000);
  const diskStart=await snapshot(page), diskWall=performance.now();
  await page.waitForTimeout(5000);
  const diskEnd=await snapshot(page);
  report.diskPerformance={...diskEnd,measuredFps:(diskEnd.frames-diskStart.frames)*1000/(performance.now()-diskWall)};
  check('A6 forming-disk performance budget',diskEnd.drawCalls<=4&&diskEnd.jsP95<8&&(diskEnd.softwareRenderer||report.diskPerformance.measuredFps>=26),report.diskPerformance);
  await desktop.close();
  const touch = await browser.newContext({ viewport:{width:390,height:664},deviceScaleFactor:2,isMobile:true,hasTouch:true });
  const phone = await touch.newPage();
  phone.on('pageerror',error=>report.errors.push(error.message));
  phone.on('console',message=>{if(message.type()==='error')report.errors.push(message.text())});
  for (const view of ['hero','wide','edge']) {
    await go(phone,base,'view='+view+'&test');
    const state=await snapshot(phone);
    report.views.push({name:'mobile-'+view,...state});
    check('A4 actual mobile view '+view,state.view===view&&state.dpr<=1.25);
    await layout(phone,'390x664 '+view);
    await phone.screenshot({path:path.join(shots,'mobile-'+view+'.png')});
  }
  await phone.locator('#physics').tap();
  await layout(phone,'390x664 physics');
  await phone.screenshot({path:path.join(shots,'mobile-physics.png')});
  await phone.locator('#close-panel').tap();
  const cdp=await touch.newCDPSession(phone);
  const touchPoint=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2,force:1});
  const initial=(await snapshot(phone)).camera;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint(0,180,270)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touchPoint(0,225,295)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const dragged=(await snapshot(phone)).camera;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint(0,130,280),touchPoint(1,230,280)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touchPoint(0,120,280),touchPoint(1,240,280)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touchPoint(0,100,280),touchPoint(1,260,280)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check('A5 real touch orbit and pinch',dragged.yaw!==initial.yaw&&(await snapshot(phone)).camera.distance<dragged.distance);
  for(const size of [{width:412,height:700},{width:700,height:390}]){
    await phone.setViewportSize(size);await phone.waitForTimeout(150);await layout(phone,size.width+'x'+size.height);
    await phone.screenshot({path:path.join(shots,`layout-${size.width}x${size.height}.png`)});
  }
  await touch.close();
  await playThrough(base);
  if(process.argv.includes('--record')) await recordOpening(base);
  check('A8 zero page and shader errors',report.errors.length===0,report.errors);
}
async function playThrough(base) {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  await go(page,base);
  await page.locator('#speed').selectOption('4');
  const stages=new Set(), trace=[];
  for(let sample=0;sample<18;sample++) {
    const state=await snapshot(page);
    stages.add(state.stage);trace.push(state);
    if(!state.playing)break;
    await page.waitForTimeout(2000);
  }
  const ending=await snapshot(page);
  check('A1 real-input complete 108-second sequence',ending.time===108&&!ending.playing&&stages.size===6,{stages:[...stages],time:ending.time});
  await page.screenshot({path:path.join(shots,'complete-sequence.png')});
  await page.locator('#play').click();
  const replay=await snapshot(page);
  check('A1 real replay restores playback',replay.playing&&replay.time<1);
  fs.writeFileSync(path.join(shots,'sequence-trace.json'),JSON.stringify(trace,null,2));
  await context.close();
}
async function recordOpening(base) {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:shots,size:{width:960,height:600}}});
  const page=await context.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  await go(page,base);
  const trace=[];
  for(let second=0;second<30;second++){
    if(second===2){await page.mouse.move(840,400);await page.mouse.down();await page.mouse.move(910,435,{steps:10});await page.mouse.up();}
    if(second===8)await page.mouse.wheel(0,-130);
    if(second===13)await page.locator('[data-view=wide]').click();
    if(second===20)await page.locator('[data-view=hero]').click();
    trace.push(await snapshot(page));
    await page.waitForTimeout(1000);
  }
  const video=page.video();
  await context.close();
  const videoPath=await video.path();
  fs.renameSync(videoPath,path.join(shots,'opening-30s.webm'));
  fs.writeFileSync(path.join(shots,'opening-trace.json'),JSON.stringify(trace,null,2));
  check('A8 opening operations recorded',trace.at(-1).time>=28&&trace.at(-1).time<35,{seconds:trace.at(-1).time,frames:trace.at(-1).frames});
}
main().catch(error=>{report.errors.push(error.message);console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  if(server)server.kill();
  fs.writeFileSync(path.join(shots,'browser-report.json'),JSON.stringify(report,null,2));
  if(report.checks.some(item=>!item.pass)||report.errors.length)process.exitCode=1;
});
