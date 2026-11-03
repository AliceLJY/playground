// NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs <source-or-built-url> <out-dir>
const {chromium}=require('playwright');
const fs=require('node:fs');
const [base,out]=process.argv.slice(2);if(!base||!out)throw Error('URL and output directory required');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});
 const reports=[];let failed=0;
 for(const [w,h] of [[390,664],[320,568],[844,340],[844,300],[1365,900]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:w<1000,isMobile:w<1000,deviceScaleFactor:w<1000?2:1});
  const p=await ctx.newPage(),errors=[],checks=[];p.on('pageerror',e=>errors.push(String(e)));
  const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});if(!ok)failed++;console.log(`${ok?'PASS':'FAIL'} ${w}x${h} ${name}`);};
  const url=new URL(base);url.searchParams.set('intro','skip');await p.goto(url.href);await p.waitForFunction(()=>window.__race?.ready,null,{polling:100});
  const meta=await p.evaluate(()=>{const c=document.querySelector('#world canvas'),g=c.getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return {renderer:g.getParameter(e.UNMASKED_RENDERER_WEBGL),dpr:devicePixelRatio,renderRatio:c.width/innerWidth,three:THREE.REVISION};});
  await p.evaluate(()=>{window.lastInput={};const step=RaceCore.step;RaceCore.step=(s,i,dt)=>{lastInput={...i};return step(s,i,dt);};});
  await p.locator('#start').click();await p.waitForFunction(()=>__race.state.phase==='racing',null,{polling:100});
  await p.waitForTimeout(1200);await p.screenshot({path:`${out}/${w}x${h}-race.png`});
  const layout=await p.evaluate(()=>{
   const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,visible:!!e.getClientRects().length};};
   const pairs=[['.speedometer','.map-wrap'],['.speedometer','.race-buttons'],['#leaderboard','.steering'],['.nitro-panel','.speedometer'],['.nitro-panel','.touch-actions']];
   return {overlaps:pairs.filter(([a,b])=>{a=rect(a);b=rect(b);return a.visible&&b.visible&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}),board:rect('#leaderboard'),map:rect('.map-wrap'),buttons:[...document.querySelectorAll('#touch button,.race-buttons button')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:e.id||e.dataset.control,w:r.width,h:r.height,inside:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:e.contains(hit)};})};
  });
  check('HUD avoids map, steering and actions',layout.overlaps.length===0,layout);
  check('visible controls are reachable (touch >=44px)',layout.buttons.every(b=>(w>=1000||b.w>=44&&b.h>=44)&&b.inside&&b.hit),layout.buttons);
  if(h<=340){check('full leaderboard leaves short landscape',!layout.board.visible);check('small landscape map',layout.map.w<=110);}
  check('manual mode supplies no automatic throttle',await p.evaluate(()=>!lastInput.forward&&!lastInput.autoPedal));
  await p.locator('#pause').click();await p.waitForFunction(()=>__race.state.phase==='paused',null,{polling:100});await p.locator('#pause-overlay').waitFor({state:'visible'});
  const auto=p.locator('#auto-pedal-paused'),hasAuto=await auto.count();
  if(w<1000){check('optional auto pedal is off initially',hasAuto&&!(await auto.isChecked()));}
  const recover=p.locator('#recover-resume'),hasRecover=await recover.count();check('pause offers recover and continue',hasRecover&&await recover.isVisible());
  if(h<=340)check('pause contains all six standings',await p.locator('#pause-leaderboard .leader-row').count()===6);
  check('pause actions fit and can be hit',await p.locator('#pause-overlay button').evaluateAll(els=>els.filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})));
  await p.screenshot({path:`${out}/${w}x${h}-pause.png`});
  if(w===390&&hasAuto&&hasRecover){
   await auto.check();await p.locator('#resume').click();await p.waitForTimeout(1600);
   check('enabled auto pedal accelerates',(await p.evaluate(()=>__race.state.riders[0].speed))>8);
   await p.evaluate(()=>{window.lastInput={};const step=RaceCore.step;RaceCore.step=(s,i,dt)=>{lastInput={...i};return step(s,i,dt);};});
   for(const release of ['pointerup','pointercancel','lostpointercapture','blur','visibilitychange']){
    const b=p.locator('[data-control="brake"]'),box=await b.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.waitForTimeout(80);
    check(`${release}: touch sends brake`,await p.evaluate(()=>lastInput.brake===true));
    if(release==='blur')await p.evaluate(()=>dispatchEvent(new Event('blur')));
    else if(release==='visibilitychange')await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
    else await b.dispatchEvent(release,{pointerId:1});
    await p.mouse.up();await p.waitForTimeout(80);check(`${release}: brake is cleared`,await p.evaluate(()=>!lastInput.brake));
    if(await p.evaluate(()=>__race.state.phase==='paused')){await p.locator('#resume').click();await p.locator('[data-control=brake]').waitFor({state:'visible'});}
   }
   await p.keyboard.down('ArrowDown');await p.waitForTimeout(1200);check('keyboard brake stops auto pedal',(await p.evaluate(()=>__race.state.riders[0].speed))===0);await p.keyboard.up('ArrowDown');
   await p.locator('#pause').click();await auto.uncheck();
   await p.evaluate(()=>{const recover=RaceCore.recover;RaceCore.recover=s=>{window.recoveryBefore={progress:s.riders[0].progress,gate:s.riders[0].gate};recover(s);window.recoveryAfter={...s.riders[0],distance:RaceCore.nearest(s.riders[0].x,s.riders[0].z).distance};};});
   await recover.click();await p.waitForTimeout(150);
   const r=await p.evaluate(()=>({before:recoveryBefore,after:recoveryAfter,phase:__race.state.phase}));check('recover preserves race progress and resumes on road',r.phase==='racing'&&r.after.distance<.01&&r.after.speed===0&&r.after.progress===r.before.progress&&r.after.gate===r.before.gate,r);
  }
  check('zero page errors',errors.length===0,errors);reports.push({w,h,meta,checks});await ctx.close();
 }
 await browser.close();fs.writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exit(1);});
