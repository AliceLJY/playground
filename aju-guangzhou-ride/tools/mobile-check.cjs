// NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs <source-or-built-url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs');
const [base,out]=process.argv.slice(2);if(!base||!out)throw Error('URL and output directory required');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});let failed=0;const reports=[];
 for(const [w,h] of [[390,664],[320,568],[844,340],[844,300],[1365,900]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:w<1000,isMobile:w<1000,deviceScaleFactor:w<1000?2:1}),p=await ctx.newPage(),checks=[],errors=[];
  p.on('pageerror',e=>errors.push(String(e)));const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});if(!ok)failed++;console.log(`${ok?'PASS':'FAIL'} ${w}x${h} ${name}`);};
  if(h<=340)await p.setViewportSize({width:390,height:664});
  await p.goto(base);await p.waitForFunction(()=>window.__ride?.ready,null,{polling:100});
  const meta=await p.evaluate(()=>{const c=document.querySelector('#world canvas'),g=c.getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return {renderer:g.getParameter(e.UNMASKED_RENDERER_WEBGL),dpr:devicePixelRatio,renderRatio:c.width/innerWidth,three:THREE.REVISION};});
  await p.locator('#start').click();if(h<=340)await p.setViewportSize({width:w,height:h});
  if(w<1000){
   const pre=await p.evaluate(()=>__ride.state);await p.waitForTimeout(500);const after=await p.evaluate(()=>__ride.state);
   const confirm=await p.locator('#modal').isVisible()&&await p.locator('#dialog-action').textContent()==='知道了，出发';
   check('touch departure waits for confirmation',confirm&&pre.phase==='intro'&&after.distance===0&&after.speed===0,{pre:pre.phase,after:after.phase,distance:after.distance});
   const copy=confirm?await p.locator('#dialog-content').innerText():await p.locator('#toast').innerText();
   check('touch copy explains pedalling and separate navigation',copy.includes('车会自己前行')&&copy.includes('不会自己转弯')&&copy.includes('左下')&&copy.includes('自动导航')&&!/Shift|↑/.test(copy),copy);
   if(confirm)check('confirmation and close targets are >=44px',await p.locator('#dialog-action,#dialog-x').evaluateAll(els=>els.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
   await p.screenshot({path:`${out}/${w}x${h}-departure.png`});
   if(confirm){await p.locator('#dialog-x').click();await p.waitForTimeout(100);check('dismissal does not start the bike',(await p.evaluate(()=>__ride.state.phase))==='intro');if(h<=340)await p.setViewportSize({width:390,height:664});await p.locator('#start').click();if(h<=340)await p.setViewportSize({width:w,height:h});await p.locator('#dialog-action').click();}
  }
  await p.waitForFunction(()=>__ride.state.phase==='ride',null,{polling:100});
  await p.screenshot({path:`${out}/${w}x${h}-ride.png`});
  const layout=await p.evaluate(()=>{
   const r=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,visible:!!e.getClientRects().length};};
   const pairs=[['#route-map','.speed-readout'],['#route-map','.boost-meter'],['#route-map','.touch-controls>div:last-child'],['.bottom-bar','.touch-controls>div:last-child'],['.boost-meter','.touch-controls>div:last-child']];
   return {map:r('#route-map'),speed:r('.speed-readout'),boost:r('.boost-meter'),overlaps:pairs.filter(([a,b])=>{a=r(a);b=r(b);return a.visible&&b.visible&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}),buttons:[...document.querySelectorAll('.touch-controls button')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return {w:b.width,h:b.height,hit:e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),inside:b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight};})};
  });
  check('map and readouts leave driving controls clear',layout.overlaps.length===0,layout);
  if(h<=340){check('landscape map collapses to a corner button',layout.map.w<=90&&layout.map.h<=60);check('speed and boost share a row',Math.abs(layout.speed.y-layout.boost.y)<10);}
  check('touch driving targets remain >=44px and reachable',layout.buttons.every(b=>b.w>=44&&b.h>=44&&b.hit&&b.inside),layout.buttons);
  const mapHit=await p.locator('#route-map').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});check('map button center is reachable',mapHit);
  if(mapHit)await p.locator('#route-map').click();else await p.locator('#route-map').evaluate(e=>e.click());await p.waitForFunction(()=>__ride.state.phase==='map',null,{polling:100});
  const frozen=await p.evaluate(()=>__ride.state);await p.waitForTimeout(500);const later=await p.evaluate(()=>__ride.state);
  check('expanded map pauses the simulation',frozen.distance===later.distance&&frozen.x===later.x&&frozen.z===later.z);
  await p.screenshot({path:`${out}/${w}x${h}-map.png`});
  await p.locator('#dialog-x').click();check('closing map restores ride',(await p.evaluate(()=>__ride.state.phase))==='ride');
  check('zero page errors',errors.length===0,errors);reports.push({w,h,meta,checks});await ctx.close();
 }
 await browser.close();fs.writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exit(1);});
