// NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <source-or-built-url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs');
const [base,out]=process.argv.slice(2);if(!base||!out)throw Error('URL and output directory required');fs.mkdirSync(out,{recursive:true});
const withView=view=>base+(base.includes('?')?'&':'?')+'view='+view;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});
 const checks=[],errors=[];let meta=null;
 const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});console.log(`${ok?'PASS':'FAIL'} ${name}${data===undefined?'':' '+JSON.stringify(data)}`);};
 const watch=p=>p.on('pageerror',e=>errors.push(String(e)));
 const open=async(context,url)=>{const p=await context.newPage();watch(p);await p.goto(url);await p.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100,timeout:30000});return p;};
 const context=await browser.newContext({viewport:{width:1365,height:900}});
 let page=await open(context,withView('title'));
 check('title view reports its actual state',(await page.evaluate(()=>__PLAYTEST__.snapshot().view))==='title');
 meta=await page.evaluate(()=>{const g=document.querySelector('#world canvas').getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return {renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'unavailable',dpr:devicePixelRatio,renderRatio:document.querySelector('#world canvas').width/innerWidth,three:THREE.REVISION};});
 const composition=await page.evaluate(()=>{const s=__PLAYTEST__.snapshot(),left=Math.min(...s.title.map(b=>b.x)),right=Math.max(...s.title.map(b=>b.x+b.width));return {riderHeight:s.rider.height/innerHeight,buildingsWidth:(right-left)/innerWidth,buildings:s.title,rider:s.rider};});
 check('title rider is 25–35% of viewport height',composition.riderHeight>=.25&&composition.riderHeight<=.35,composition);
 check('title buildings span 60–80% of viewport width',composition.buildingsWidth>=.60&&composition.buildingsWidth<=.80,composition.buildingsWidth);
 await page.screenshot({path:`${out}/title.png`});
 // Sample a whole beat (~16 x 50 ms = 800 ms; one beat at 100-110 BPM is ~550-600 ms): a single 150 ms pair can land on a bounce peak and read as still.
 async function beat(){const frames=[];for(let k=0;k<16;k++){frames.push(await page.evaluate(()=>__PLAYTEST__.titleBounds()));await page.waitForTimeout(50);}return frames;}
 function swing(frames){return frames[0].map((b,i)=>{const hs=frames.map(f=>f[i].height);return {id:b.id,ratio:(Math.max(...hs)-Math.min(...hs))/Math.min(...hs),peakAt:hs.indexOf(Math.max(...hs))};});}
 const danceFrames=await beat();const dancing=swing(danceFrames);
 const phaseSplit=danceFrames.slice(1).some((f,k)=>new Set(f.map((b,i)=>Math.sign(b.height-danceFrames[k][i].height)).filter(Boolean)).size>1);
 check('acceptance 6: every building swings at least 4% of its height within one beat',dancing.every(b=>b.ratio>=.04),dancing);
 check('acceptance 6: buildings are out of phase (some frame has one rising while another falls)',phaseSplit,dancing);
 await page.close();
 const reduced=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});page=await open(reduced,withView('title'));
 const quietFrames=await beat();
 const quiet=swing(quietFrames).map(b=>b.ratio);check('acceptance 6: reduced-motion breathing stays below 1% within one beat',quiet.every(v=>v<.01),quiet);await reduced.close();
 page=await open(context,withView('hotspot'));
 await page.waitForFunction(()=>__PLAYTEST__.snapshot().view==='hotspot',null,{polling:100,timeout:60000});
 const hotspot=await page.evaluate(()=>({snapshot:__PLAYTEST__.snapshot(),distance:__ride.state.distance,route:__ride.state.routeNav?.status,metrics:__ride.metrics}));
 check('hotspot view is reached by real navigation',hotspot.distance>0&&hotspot.route==='arrived'&&hotspot.snapshot.dialog==='qilou-rain',hotspot);
 check('hotspot rings, glow and sign atlas use at most 3 draw calls',hotspot.metrics.hotspotDrawCalls<=3,hotspot.metrics.hotspotDrawCalls);
 await page.screenshot({path:`${out}/hotspot.png`});await page.close();
 page=await open(context,withView('map'));await page.waitForFunction(()=>__PLAYTEST__.snapshot().view==='map',null,{polling:100});
 check('map view selects Thirteen Hongs and draws a route',await page.locator('[data-place="thirteen-hongs"]').getAttribute('aria-pressed')==='true'&&/约 \d+ 游戏米/.test(await page.locator('#route-summary').innerText()));
 await page.screenshot({path:`${out}/map.png`});await page.close();
 await context.close();

 const saveContext=await browser.newContext({viewport:{width:1365,height:900}});page=await open(saveContext,base);await page.locator('#start').click();
 await page.locator('#route-map').click();await page.locator('[data-place="qilou-rain"]').click();await page.locator('#dialog-action').click();
 await page.waitForFunction(()=>['challenge','hotspot'].includes(__PLAYTEST__.snapshot().phase),null,{polling:100,timeout:30000});if((await page.evaluate(()=>__PLAYTEST__.snapshot().phase))==='challenge')await page.locator('#dialog-secondary').click();
 await page.waitForFunction(()=>__PLAYTEST__.snapshot().phase==='hotspot',null,{polling:100,timeout:60000});
 const parked=await page.evaluate(()=>__PLAYTEST__.snapshot());
 const expected=new URL('../qilou-rain/',base).href,requestPromise=page.waitForRequest(r=>r.url()===expected);await page.route(expected,route=>route.fulfill({status:204,body:''}));await page.locator('#dialog-action').click();const request=await requestPromise;
 check('acceptance 5: main button targets ../qilou-rain/ without leaving',request.url()===expected&&new URL(page.url()).href===new URL(base).href,{expected,actual:request.url(),page:page.url()});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('xiaoju-city/v1')));check('acceptance 5: leaving saves position and journal visit',saved&&saved.visits.includes('qilou-rain')&&Number.isFinite(saved.x),saved);
 await page.goto(base);await page.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100});
 check('acceptance 5: reload offers resume and fresh start',(await page.locator('#start').innerText()).includes('回到刚才的地方')&&await page.locator('#fresh').isVisible());
 check('acceptance 5: both title actions are at least 44 px',await page.locator('#start,#fresh').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=44)));
 await page.locator('#start').click();await page.waitForFunction(()=>__PLAYTEST__.snapshot().phase==='ride',null,{polling:100});const restored=await page.evaluate(()=>__PLAYTEST__.snapshot());
 const restoreDistance=Math.hypot(restored.x-saved.x,restored.z-saved.z);check('acceptance 5: resume restores within 2 game metres',restoreDistance<2,{restoreDistance,parked:{x:parked.x,z:parked.z},restored:{x:restored.x,z:restored.z}});
 await page.waitForFunction(()=>document.querySelector('#stamp-count').textContent==='1 / 14',null,{polling:50,timeout:2000});check('journal button increments from 0 / 14 to 1 / 14 after one entrance',(await page.locator('#stamp-count').innerText())==='1 / 14',await page.locator('#journal').innerText());
 await page.locator('#journal').click();check('journal records one of 14 exhibit visits',(await page.locator('.journal-heading').innerText()).includes('1 / 14'));await saveContext.close();

 const blocked=await browser.newContext({viewport:{width:1365,height:900}});await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('disabled','SecurityError');}}));page=await open(blocked,base);
 check('acceptance 5: unavailable storage starts fresh without resume',await page.locator('#start').isVisible()&&!(await page.locator('#fresh').isVisible()));await page.locator('#start').click();await page.waitForFunction(()=>__PLAYTEST__.snapshot().phase==='ride',null,{polling:100});check('acceptance 5: unavailable storage still enters the ride',(await page.evaluate(()=>__PLAYTEST__.snapshot().phase))==='ride');await blocked.close();

 const first=await browser.newContext({viewport:{width:1365,height:900}});page=await open(first,base);await page.locator('#start').click();await page.keyboard.down('ArrowUp');const started=Date.now();let firstHint=null;
 while(Date.now()-started<45000){const text=await page.locator('#toast').innerText();if(text.includes('停一下就能进')){firstHint={seconds:(Date.now()-started)/1000,text};break;}await page.waitForTimeout(50);}await page.keyboard.up('ArrowUp');check('acceptance 7: holding only Up reveals an entrance hint within 45 seconds',firstHint&&firstHint.seconds<=45,firstHint);await first.close();
 check('no browser page errors',errors.length===0,errors);
 const report={base,checkedAt:new Date().toISOString(),meta,checks};fs.writeFileSync(`${out}/browser-report.json`,JSON.stringify(report,null,2));await browser.close();process.exitCode=checks.some(c=>!c.ok)?1:0;
})().catch(e=>{console.error(e);process.exit(1);});
