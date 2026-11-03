// Real UI actions on source or release, with phone browser bars deducted.
// NODE_PATH="$(npm root -g)" node tools/controls-check.cjs <out-dir> <base-url>
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const {inspectLayout}=require('./layout.cjs');
const out=path.resolve(process.argv[2]),base=process.argv[3];
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
(async()=>{
 const core=await import('../src/core.js');
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={base,browser:browser.version(),checks:[],errors:[],views:[]};
 const check=(id,pass,detail)=>{report.checks.push({id,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${id}`);};
 try{
  for(const [width,height] of [[390,664],[320,568],[844,340],[844,390],[1365,900]]){
   const label=`${width}x${height}`,phone=width<900;
   const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:phone,hasTouch:phone});
   const page=await ctx.newPage();
   page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
   page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${new URL(r.url()).pathname}`);});
   await page.goto(base+'?intro=skip');await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});
   const state=()=>page.evaluate(()=>window.__huacheng.state());
   const tap=async selector=>{if(phone)await page.locator(selector).tap();else await page.locator(selector).click();};
   const layout=await inspectLayout(page);
   const targets=await page.locator('[data-place], [data-act=auto], [data-hour], #hour').evaluateAll(els=>els.map(el=>{
    const r=el.getBoundingClientRect();return{id:el.id||el.dataset.place||el.dataset.hour||'auto',w:r.width,h:r.height,text:el.textContent.trim()};
   }));
   const hasPlaces=await page.locator('[data-place]').count()===3;
   const hasHours=await page.locator('[data-hour]').count()===3;
   check(`F4-places-${label}`,hasPlaces&&targets.some(t=>t.id==='auto'&&t.text.includes('自动游览')),targets);
   check(`F4-time-targets-${label}`,hasHours&&targets.every(t=>t.w>=44&&t.h>=44),targets);
   check(`F4-layout-${label}`,layout.pass,layout);
   report.views.push({label,...await page.evaluate(()=>window.__PLAYTEST__.snapshot())});
   await page.screenshot({path:path.join(out,`default-${label}.png`)});
   if(hasHours){
    const hours=[];for(const value of [550,1000,0]){await tap(`[data-hour="${value}"]`);await page.waitForTimeout(120);hours.push((await state()).hour);}
    const slider=await page.locator('#hour').boundingBox();
    // Off the visible 2 px line, still inside the transparent 44 px target.
    const x=slider.x+slider.width*.75,y=slider.y+5;
    if(phone)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
    const h=(await state()).hour;
    check(`F4-time-input-${label}`,hours.join(',')==='0.55,1,0'&&h>.65&&h<.85,{hours,offLineHour:h});
    await tap('[data-hour="0"]');
   }
   if(hasPlaces&&(width===390||width===1365)){
    for(const name of ['bridge','arch','pagoda']){
     // Measure either side of the same native click. A Playwright click can
     // wait several frames before dispatch while the normal tour keeps moving.
     await page.evaluate(()=>{
      const places=document.querySelector('#places');let before;window.__f4Navigation=null;
      places.addEventListener('click',()=>{before=window.__huacheng.state();},{capture:true,once:true});
      // Observe the first rendered pose as well, so an instant camera jump
      // cannot hide between the click handler and the next animation frame.
      places.addEventListener('click',()=>{requestAnimationFrame(()=>{window.__f4Navigation={before,selected:window.__huacheng.state()};});},{once:true});
     });
     await tap(`[data-place=${name}]`);await page.waitForFunction(()=>window.__f4Navigation!==null,null,{polling:20});
     const {before,selected}=await page.evaluate(()=>window.__f4Navigation);
     await page.waitForTimeout(250);const moving=await state();
     await page.waitForFunction(()=>window.__huacheng.state().mode==='manual',null,{polling:100,timeout:60000});
     const arrived=await state();await page.waitForTimeout(8000);const held=await state();
     const expected=core.pathAt(core.VIEWS[name]);
     check(`F4-destination-${name}-${label}`,!selected.auto&&!selected.frozen&&distance(before.cam,selected.cam)<1&&distance(before.cam,moving.cam)>.001&&held.t>arrived.t+7&&distance(arrived.cam,held.cam)<1e-8&&distance(held.cam,expected.pos)<1e-6&&distance(held.target,expected.target)<1e-6&&held.mode==='manual'&&held.destination===name,{before,selected,moving,arrived,held,expected});
     check(`F4-stay-label-${name}-${label}`,(await page.locator('[data-act=auto]').textContent()).includes('留在这里'),null);
     const copyVisible=await page.locator('.copy').evaluate(el=>el.checkVisibility({checkVisibilityCSS:true}));
     check(`F4-detail-copy-${name}-${label}`,!copyVisible,{copyVisible});
     await page.screenshot({path:path.join(out,`${name}-${label}.png`)});
    }
    // Wait for the existing dwell to end. Measure actual rendered tram bounds during camera hold.
    await page.waitForFunction(()=>{const s=window.__huacheng.state();return s.t%30>17&&s.t%30<24;},null,{polling:100,timeout:35000});
    const a=await page.evaluate(()=>({state:window.__huacheng.state(),bounds:window.__huacheng.tramGeometryBounds()}));
    await page.waitForTimeout(1500);
    const b=await page.evaluate(()=>({state:window.__huacheng.state(),bounds:window.__huacheng.tramGeometryBounds()}));
    check(`F4-live-tram-${label}`,distance(a.state.cam,b.state.cam)<1e-8&&Math.abs(a.bounds.min[0]-b.bounds.min[0])>1,{a,b});
    await tap('[data-act=auto]');await page.waitForFunction(()=>window.__huacheng.state().mode==='auto',null,{polling:100,timeout:12000});
    const resumed=await state();await page.waitForTimeout(1000);const touring=await state();
    check(`F4-resume-${label}`,touring.auto&&distance(resumed.cam,touring.cam)>1,{resumed,touring});
    // Native buttons share click handlers for keyboard and touch.
    await page.locator('[data-place=bridge]').focus();await page.keyboard.press('Enter');
    check(`F4-keyboard-place-${label}`,!(await state()).auto,(await state()));
    await page.locator('[data-hour="550"]').focus();await page.keyboard.press('Space');
    check(`F4-keyboard-hour-${label}`,(await state()).hour===.55,(await state()).hour);
    await tap('[data-act=auto]');await tap('[data-act=auto]');
    const stopped=await state();await page.waitForTimeout(600);check(`F4-stop-in-flight-${label}`,!(await state()).auto&&distance(stopped.cam,(await state()).cam)<1e-8,null);
    await tap('[data-act=reset]');check(`F4-reset-${label}`,(await state()).auto&&(await state()).u<.05,await state());
    const releases=[];
    for(const event of ['pointerup','lostpointercapture','blur','visibilitychange']){
     if(event==='lostpointercapture')await page.evaluate(()=>{
      window.__f4Captured=null;
      document.querySelector('#scene').addEventListener('gotpointercapture',e=>window.__f4Captured=e.pointerId,{once:true});
     });
     await page.mouse.move(width*.6,height*.4);await page.mouse.down();
     const held=(await state()).held;
     if(event==='pointerup')await page.mouse.up();
     else if(event==='lostpointercapture'){
      // Releasing pending capture before gotpointercapture emits no lost event.
      await page.mouse.move(width*.6+1,height*.4+1);
      await page.waitForFunction(()=>window.__f4Captured!==null,null,{polling:50,timeout:2000});
      await page.evaluate(()=>document.querySelector('#scene').releasePointerCapture(window.__f4Captured));
      await page.mouse.move(width*.6+2,height*.4+2);
     }else await page.evaluate(event=>(event==='blur'?window:document).dispatchEvent(new Event(event)),event);
     await page.waitForTimeout(60);releases.push({event,held,released:!(await state()).held});await page.mouse.up();
    }
    const cdp=await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width*.6,y:height*.4,id:0}]});
    const held=(await state()).held;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(60);
    releases.push({event:'pointercancel',held,released:!(await state()).held});
    check(`F4-pointer-release-${label}`,releases.every(r=>r.held&&r.released),releases);
   }
   await ctx.close();
  }
  check('F4-page-errors',report.errors.length===0,report.errors);
  report.summary={pass:report.checks.filter(c=>c.pass).length,fail:report.checks.filter(c=>!c.pass).length};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(report.summary);
  if(report.summary.fail)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
