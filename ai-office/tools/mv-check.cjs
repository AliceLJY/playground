// MV 录片检查（照 gz-roach/tools/browser-check.cjs 的 B11）：画面只取决于页面时间，不受截图快慢影响。
//   NODE_PATH="$(npm root -g)" node tools/mv-check.cjs [秒,秒,…]
// 每个时刻：推进到那一刻立刻截一张，等 1 秒真实时间再截一张，所有通道逐像素一致（阈值 0）。
// 默认挑字幕淡入、镜头推进、打招呼、灯光转换、关灯淡出这些最容易被真实时间带偏的时刻。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..');
const times = (process.argv[2] || '0.6,10.7,14,20,24.2,25.4,26.1,27.2,28,29.7,31.4,32.5,34,36.2,39,43,46,49.9,53.8,58.5,61.6,64.8,66.7,70.5,74,76.8,78.1,79.5,81.3,84.1,86,89.9,92.3,95.5,99,102.7,105.5,106.1,106.5,107.9').split(',').map(Number);
const out = process.argv[3]; if(out) fs.mkdirSync(out,{recursive:true});
const report={checks:[],frames:[],errors:[]};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
(async () => {
  const server = await new Promise(ok => { const s = http.createServer((req, res) => { const f = path.join(root, new URL(req.url, 'http://x').pathname); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0, '127.0.0.1', () => ok(s)); });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })).newPage();
  const errors = report.errors; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: Date.parse('2026-11-01T01:00:00Z') });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mv=1&hold=1`);
  for (let i = 0; i < 300 && !(await page.evaluate(() => window.__PLAYTEST__?.ready)); i++) { await page.clock.runFor(100); await page.waitForTimeout(30); }
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  const diff = async (a, b) => page.evaluate(async ([x, y]) => {
    const load = async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const p = await load(x), q = await load(y); let n = 0; for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 0 || p[i+3] !== q[i+3]) n++; return n / (p.length / 4);
  }, [a.toString('base64'), b.toString('base64')]);
  let at = 0, failed = 0;
  for (const t of times.sort((p, q) => p - q)) {
    await page.evaluate(ms => window.__PLAYTEST__.step(ms), (t - at) * 1000); at = t;
    const a = await page.screenshot(); await page.waitForTimeout(1000); const b = await page.screenshot();
    const d = await diff(a, b), state = await page.evaluate(() => window.__PLAYTEST__.snapshot()), snap=state.mv, ok = d === 0;
    report.frames.push({t,state});report.checks.push({name:'B11',t,changedFraction:d,passed:ok});
    const check=(name,passed,details)=>{report.checks.push({name,t,passed:!!passed,details});if(!passed){failed++;console.log('FAIL',name,JSON.stringify(details));}};
    if(out){fs.writeFileSync(path.join(out,`shot-${t}.png`),a);}
    if([14,53.8,78.1,86].includes(t)){
      const actors=state.actors.filter(a=>t===14?!!a.game:t===53.8?a.activity==='reception':t===78.1?a.activity==='melon':a.activity==='meeting');
      const cam=snap.camera, scale=3*cam.z;
      const measured=actors.map(a=>{const p=state.nameplates.find(p=>p.id===a.id);return {id:a.id,p,box:p&&{x:540+(p.x-cam.cx)*scale,y:588+(p.y-cam.cy)*scale,w:p.w*scale,h:p.h*scale},textPixels:7*scale};});
      check('key names fit camera and text >=35px',measured.every(m=>m.p&&m.textPixels>=34.99&&m.box.x>=0&&m.box.x+m.box.w<=1080&&m.box.y>=0&&m.box.y+m.box.h<=1176),measured);
    }
    if([25.4,26.1].includes(t)) {
      const e=state.handoffWalk,cc=state.actors.find(a=>a.activity==='handoff-walk'),to=state.actors.find(a=>a.id===e?.id),c=snap.camera,s=3*c.z;
      check('real handoff, no booth or flying folder',e && ['pat','reply'].includes(e.phase) && !state.flights.length && Math.hypot(cc.x-to.x,cc.y-to.y)<=20.1,{e,cc,to});
      const boxes=[...state.speechBoxes,{x:cc.x-18,y:cc.y-26,w:36,h:44},{x:to.x-9,y:to.y-26,w:18,h:44}].map(b=>({x:540+(b.x-c.cx)*s,y:588+(b.y-c.cy)*s,w:b.w*s,h:b.h*s}));
      check('handoff bodies and dialogue fit close-up',boxes.every(b=>b.x>=0&&b.x+b.w<=1080&&b.y>=0&&b.y+b.h<=1176),boxes);
      if(t===26.1)check('recipient really replies',state.handoffSpeech.some(b=>b.text==='收到'),state.handoffSpeech);
    }
    if([31.4,32.5].includes(t))check('CC is back home after delivery; no delayed flight',!state.handoffWalk&&!state.flights.length&&state.actors.some(a=>a.desk===0&&a.x===65&&a.y===139),state.handoffWalk);
    if(t===86)check('two actual seated listeners',state.visitors.filter(v=>v.listening&&!v.moving&&Math.abs(v.y-664)<1).length===2,state.visitors);
    if(t===102.7)check('completed patrol green lamp',state.scene.guard?.phase==='done'&&state.scene.guard.ok===true,state.guard);
    if(t===53.8)check('pitch handshake with two idle hosts',state.reception?.kind==='pitch'&&state.reception.phase==='handshake'&&state.reception.hosts.length===2,state.reception);
    if(t===61.6)check('radar count and real boss response',state.radarCard?.n===7&&state.eventSpeech.some(b=>b.id==='boss'&&b.text==='有意思'),state.eventSpeech);
    if(t===64.8)check('Grok delivers cloud candy after papers',state.souvenir?.phase==='delivering'&&state.food.some(f=>f.kind==='papers')&&state.food.some(f=>f.kind==='cloud'),state.food);
    if(t===70.5)check('quota wall reached',state.actors.some(a=>a.id==='artist'&&a.activity==='quota'&&!a.moving),state.quota);
    if(t===79.5){
      const a=state.actors.find(a=>a.id===state.argue?.ids[0]),c=snap.camera,s=3*c.z;
      const box=a&&{x:540+(a.x-55-c.cx)*s,y:588+(a.y-50-c.cy)*s,w:110*s,h:78*s};
      check('two real actors in smoke; star/slipper envelope fits close-up',state.argue?.phase==='smoke'&&state.argue.ids.length===2&&state.melon?.ids.length===3&&box.x>=0&&box.x+box.w<=1080&&box.y>=0&&box.y+box.h<=1176,{box,argue:state.argue});
    }
    if(t===92.3)check('supper without patrol signal paints and thanks guard',!!state.supper&&state.eventSpeech.some(b=>b.text==='谢谢大哥')&&state.food.some(f=>f.kind==='noodles'),state.food);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} B11 t=${t}s 立刻截与等 1 秒再截，差异像素 ${(d * 100).toFixed(3)}%  （${snap.clock}，字幕「${snap.subtitle?.text || ''}」${snap.subtitle ? ' α=' + snap.subtitle.alpha.toFixed(2) : ''}，镜头 z=${snap.camera.z.toFixed(2)}，暗 ${snap.darkness.toFixed(2)}）`);
  }
  // Regression for the first v5 take: a seated caller must actually animate, not hold a 1.2s still.
  const phoneScript=structuredClone(require('../tests/fixtures/mv-v5-script.json'));
  for(const e of phoneScript.events)if(e.scene?.call)e.scene.call.kind='consult';
  await page.route('**/mv-script.json',route=>route.fulfill({json:phoneScript}));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mv=1&hold=1&from=28`);
  for(let i=0;i<100 && !(await page.evaluate(()=>window.__PLAYTEST__?.ready));i++){await page.clock.runFor(50);await page.waitForTimeout(20);}
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+20));
  let previous=await page.screenshot();
  for(let i=1;i<=8;i++){
    await page.evaluate(()=>window.__PLAYTEST__.step(100));const next=await page.screenshot(),changed=await diff(previous,next),passed=changed>0;
    report.checks.push({name:'consult visible mouth/receiver motion',scriptSeconds:28+i*.1,changedFraction:changed,passed});
    if(!passed)failed++;previous=next;
  }
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'page errors: 0');
  report.result=failed||errors.length?'FAIL':'PASS';if(out)fs.writeFileSync(path.join(out,'mv-check.json'),JSON.stringify(report,null,2));
  await browser.close(); server.close(); process.exit(failed || errors.length ? 1 : 0);
})();
