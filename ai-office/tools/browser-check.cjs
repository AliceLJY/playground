// Uses the existing global Playwright install. No browser downloads or dependencies.
// NODE_PATH="$(npm root -g)" node tools/browser-check.cjs [http://127.0.0.1:3091/]
const { chromium } = require('playwright');
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:3091/';
const root = path.resolve(__dirname,'..'), out = path.join(__dirname,'shots');
const report = { checkedAt: new Date().toISOString(), base, checks: [], runs: [] };
const check = (name, passed, details) => {report.checks.push({name,passed:!!passed,details});assert.ok(passed,name+': '+JSON.stringify(details));};
let browser, staticServer;
(async()=>{
  await fs.mkdir(out,{recursive:true});
  browser = await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome',args:['--use-gl=angle','--use-angle=metal']}:{})});report.browser=browser.version();
  async function open(url,viewport={width:390,height:664},clock=false){
    const context=await browser.newContext({viewport,deviceScaleFactor:2,hasTouch:viewport.width<701,isMobile:viewport.width<701});
    const page=await context.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',req=>{if(!req.url().startsWith(new URL(url).origin)&&!req.url().startsWith('data:'))external.push(req.url());});
    if(clock)await page.clock.install({time:new Date('2026-11-01T06:00:00Z')});
    await page.goto(url);await page.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100,timeout:15000});
    return {context,page,errors,external};
  }
  async function save(run,name){
    const snapshot=await run.page.evaluate(()=>window.__PLAYTEST__.snapshot());
    const layout=await run.page.evaluate(()=>{
      const box=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom,right:b.right};};
      const g=document.querySelector('canvas').getContext('2d'),p=g.getImageData(0,0,720,840).data;let ink=0,total=0;
      for(let i=3;i<p.length;i+=4*41){total++;if(p[i]>100)ink++;}
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,canvas:box(document.querySelector('canvas')),drawer:box(document.querySelector('#drawer')),toggle:box(document.querySelector('#drawer-toggle')),banner:document.querySelector('#mode').textContent,ink:ink/total};
    });
    check(name+' no page errors',run.errors.length===0,run.errors);
    check(name+' no external requests',run.external.length===0,run.external);
    check(name+' canvas painted',layout.ink>.8,layout.ink);
    check(name+' no horizontal overflow',layout.scrollWidth<=layout.width,layout);
    check(name+' drawer inside viewport',layout.drawer.x>=0&&layout.drawer.right<=layout.width+.5&&layout.drawer.bottom<=layout.height+.5,layout.drawer);
    await run.page.screenshot({path:path.join(out,name+'.png')});
    report.runs.push({name,snapshot,layout});return snapshot;
  }
  for(const [name,query,actual]of [['hero','?demo=1&view=hero','hero'],['queue','?view=queue','queue'],['notice','?view=notice','notice'],['hero-live','?view=hero',null]]){
    const run=await open(new URL(query,base).href),s=await save(run,name);
    if(actual)check(name+' actual state',s.actualView===actual&&s.demo,s);
    if(name==='hero-live')check('live service uses real data',!s.demo,s);
    if(name==='notice'){
      check('paper readable and on-screen',await run.page.locator('#paper').isVisible());
      await run.page.locator('#board-tab').click();await save(run,'notice-board');
    }
    await run.context.close();
  }
  const run=await open(new URL('?demo=1',base).href,undefined,true);
  const phases=new Set();let moved=0,previous;
  for(let s=0;s<=30;s++){
    if(s)await run.page.clock.runFor(1000);
    const snap=await run.page.evaluate(()=>window.__PLAYTEST__.snapshot());
    if(previous&&snap.actors.some((a,i)=>Math.hypot(a.x-previous[i].x,a.y-previous[i].y)>.1))moved++;
    previous=snap.actors;snap.actors.forEach(a=>phases.add(a.status));
    await run.page.screenshot({path:path.join(out,`opening-${String(s).padStart(2,'0')}.png`)});
  }
  check('normal 30 seconds actually animates',moved>12,{moved,phases:[...phases]});
  check('normal timeline has work, completion, waiting and departure',['busy','done','waiting','away'].every(s=>phases.has(s)));
  const defaultState=await save(run,'default');
  await run.page.locator('#drawer-toggle').click();await save(run,'drawer');
  for(const row of await run.page.locator('.member').all()){
    await row.scrollIntoViewIfNeeded();const b=await row.boundingBox();const hit=await row.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));});check('drawer row reachable',b.y>=0&&b.y+b.height<=664&&hit,b);
  }
  await run.context.close();
  const realClock=await open(new URL('?demo=1',base).href);
  await realClock.page.waitForTimeout(2000);
  const perf=await save(realClock,'default-real-clock');
  check('real clock render cost below spec',perf.renderP95Ms>0&&perf.renderP95Ms<12,perf.renderP95Ms);
  report.renderer=await realClock.page.evaluate(()=>{const g=document.createElement('canvas').getContext('webgl');if(!g)return 'No WebGL context (scene is Canvas 2D)';const e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'Renderer unavailable';});
  await realClock.context.close();
  for(const viewport of [{width:320,height:568},{width:412,height:700},{width:844,height:390},{width:1280,height:800}]){
    const run=await open(new URL('?demo=1&view=hero',base).href,viewport);await save(run,`${viewport.width}x${viewport.height}`);await run.context.close();
  }
  // Publish exactly these five source assets; test the subdirectory path and missing API.
  const assets=new Map([['index.html','text/html'],['office.js','text/javascript'],['office-core.js','text/javascript'],['style.css','text/css'],['demo-script.json','application/json']]);
  staticServer=http.createServer(async(req,res)=>{
    const file=new URL(req.url,'http://localhost').pathname.replace(/^\/playground\/ai-office\//,'')||'index.html';
    if(!assets.has(file)){res.writeHead(404);res.end('not found');return;}
    res.setHeader('content-type',assets.get(file));res.end(await fs.readFile(path.join(root,file)));
  });
  await new Promise(resolve=>staticServer.listen(0,'127.0.0.1',resolve));
  const fallback=await open(`http://127.0.0.1:${staticServer.address().port}/playground/ai-office/`);
  const s=await save(fallback,'static-fallback');check('missing API enters labelled demo',s.demo&&(await fallback.page.locator('#mode').textContent()).includes('演示模式 · 模拟数据'));
  await fallback.context.close();
  // Contact sheets for human inspection, using only the installed browser's Canvas.
  for(const first of [0,16]){
    const frames=[];for(let i=first;i<Math.min(31,first+16);i++)frames.push({name:`${i}s`,url:'data:image/png;base64,'+(await fs.readFile(path.join(out,`opening-${String(i).padStart(2,'0')}.png`))).toString('base64')});
    const p=await browser.newPage({viewport:{width:1240,height:1456}});
    const data=await p.evaluate(async frames=>{const c=document.createElement('canvas');c.width=1240;c.height=1456;const g=c.getContext('2d');g.fillStyle='#eee9dd';g.fillRect(0,0,c.width,c.height);for(let j=0;j<frames.length;j++){const im=new Image();im.src=frames[j].url;await im.decode();const x=j%4*310,y=Math.floor(j/4)*364;g.drawImage(im,85,260,610,690,x,y+18,305,345);g.fillStyle='#253334';g.font='12px monospace';g.fillText(frames[j].name,x+4,y+13);}return c.toDataURL('image/png').split(',')[1];},frames);
    await fs.writeFile(path.join(out,`opening-contact-${first/16+1}.png`),Buffer.from(data,'base64'));await p.close();
  }
  report.result='passed';
})().catch(e=>{report.result='failed';report.error=e.message;console.error(e.message);process.exitCode=1;}).finally(async()=>{
  await browser?.close();if(staticServer)await new Promise(resolve=>staticServer.close(resolve));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({result:report.result,checks:report.checks.length,runs:report.runs.length,error:report.error}));
});
