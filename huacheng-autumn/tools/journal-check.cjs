// Real UI on source or build. GPU checks run sequentially.
// NODE_PATH="$(npm root -g)" node tools/journal-check.cjs <out-dir> <base-url> [--contrast-only]
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const {hourContrast}=require('../tests/hour-contrast.cjs');
const {inspectLayout}=require('./layout.cjs');
const out=path.resolve(process.argv[2]),base=process.argv[3];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={base,browser:browser.version(),checks:[],errors:[],views:[]};
 const check=(id,pass,detail)=>{report.checks.push({id,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${id}`);};
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:664},deviceScaleFactor:2,isMobile:true,hasTouch:true}),page=await ctx.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  for(const view of ['hero','bridge','arch','pagoda'])for(const h of [0,.55,1]){
   await page.goto(`${base}?view=${view}&h=${h}`);await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});
   const values=await hourContrast(page);
   check(`time-contrast-${view}-${h}`,values.length===3&&values.every(v=>v.minimum>=4.5),values);
   await page.screenshot({path:path.join(out,`contrast-${view}-${h}.png`)});
  }
  await ctx.close();
  if(!process.argv.includes('--contrast-only'))for(const [width,height,first] of [[390,664,'pagoda'],[320,568,'bridge'],[844,340,'pagoda'],[1365,900,'bridge']]){
   const label=`${width}x${height}`,phone=width<900;
   const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:phone,hasTouch:phone});
   const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
   page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${new URL(r.url()).pathname}`);});
   await page.clock.install();await page.goto(base+'?intro=skip');await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});
   await page.clock.pauseAt(new Date(Date.now()+100));
   // Advance the actual animation loop, never setView / setTime / journal state.
   const state=()=>page.evaluate(()=>window.__huacheng.state());
   const press=async selector=>{if(phone)await page.locator(selector).tap();else {await page.locator(selector).focus();await page.keyboard.press(selector.includes('capture')?'Space':'Enter');}};
   const until=async fn=>{for(let i=0;i<480;i++){if(await fn())return;await page.clock.runFor(250);}throw Error(`Timed out in ${label}: ${JSON.stringify(await state())}`);};
   const shot=async name=>{
    const layout=await inspectLayout(page),s=await state();
    check(`layout-${label}-${name}`,layout.pass&&layout.boxes.filter(b=>b.clickable).every(b=>b.w>=44&&b.h>=44),layout);
    report.views.push({label,name,state:s,info:await page.evaluate(()=>window.__huacheng.info())});
    await page.screenshot({path:path.join(out,`${label}-${name}.png`)});
   };
   const visit=async name=>{await press(`[data-place=${name}]`);await until(async()=>{const s=await state();return s.destination===name&&s.mode==='manual';});};
   const initial=await state();check(`optional-default-${label}`,initial.auto&&initial.hour===0&&!initial.frozen&&initial.journal.phase==='idle',initial);
   await shot('default');await press('#journal-start');await shot('choose');
   await press(`[data-place=${first}]`);check(`no-early-stamp-${label}`,(await state()).journal.stamps.length===0,await state());
   await until(async()=>(await state()).mode==='manual');await shot('first-stamp');
   if(first==='pagoda')await visit('bridge');
   await until(()=>page.locator('[data-journal=capture]').isEnabled());
   if(width===390){
    const before=await state();await shot('miss-window');await page.clock.runFor(4500);
    const missed=await state();check(`miss-retains-stamps-${label}`,missed.journal.missed===1&&!missed.journal.moment&&JSON.stringify(missed.journal.stamps)===JSON.stringify(before.journal.stamps)&&missed.t>before.t+4,{before,missed});
    await shot('missed');await until(()=>page.locator('[data-journal=capture]').isEnabled());
   }
   const a=await page.evaluate(()=>({state:window.__huacheng.state(),bounds:window.__huacheng.tramGeometryBounds()}));
   await page.clock.runFor(600);
   const b=await page.evaluate(()=>({state:window.__huacheng.state(),bounds:window.__huacheng.tramGeometryBounds()}));
   check(`real-moving-tram-${label}`,!b.state.frozen&&b.state.t>a.state.t+.5&&Math.abs(b.bounds.min[0]-a.bounds.min[0])>1&&JSON.stringify(a.state.cam)===JSON.stringify(b.state.cam),{a,b});
   await shot('tram-window');await press('[data-journal=capture]');
   check(`capture-${label}`,!!(await state()).journal.moment,await state());
   if(first==='bridge')await visit('pagoda');
   check(`two-stamps-${label}`,(await state()).journal.stamps.join(',')===[first,first==='bridge'?'pagoda':'bridge'].join(','),await state());
   await press('[data-hour="1000"]');check(`early-night-${label}`,(await state()).journal.phase==='night',await state());
   await visit('arch');await shot('night-goal');check(`arrival-does-not-finish-${label}`,(await state()).journal.phase==='night',await state());
   await press('[data-hour="0"]');
   const slider=await page.locator('#hour').boundingBox();
   if(phone){
    const cdp=await ctx.newCDPSession(page),y=slider.y+slider.height/2,x=slider.x+8;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:0}]});
    for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(slider.width-16)*i/8,y,id:0}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else {await page.locator('#hour').focus();await page.keyboard.press('End');}
   await page.clock.runFor(100);const done=await state();
   check(`complete-with-real-time-input-${label}`,done.journal.phase==='done'&&done.hour>=.95,done);
   check(`completion-remembers-visit-${label}`,await page.evaluate(()=>localStorage.getItem('huacheng-autumn:visited')==='1'),null);
   const text=await page.locator('#journal').textContent();check(`card-${label}`,['花桥','塔下','电车一刻','花窗里的广州塔'].every(s=>text.includes(s)),text);
   await shot('card');await press('[data-journal=exit]');await page.clock.runFor(3400);
   const resumed=await state();check(`clean-return-${label}`,resumed.auto&&resumed.mode==='auto'&&resumed.destination===null&&resumed.journal.phase==='idle'&&resumed.journal.stamps.length===0&&!resumed.journal.moment&&!resumed.journal.missed&&resumed.hour===done.hour,resumed);
   await shot('returned');await press('#journal-start');
   check(`fresh-restart-${label}`,(await state()).journal.stamps.length===0&&!(await state()).journal.moment,await state());
   await visit('bridge');await press('[data-act=reset]');const reset=await state();
   check(`reset-clears-${label}`,reset.journal.phase==='idle'&&reset.journal.stamps.length===0&&reset.auto,reset);
   await press('#journal-start');await press('[data-journal=exit]');await page.clock.runFor(3400);
   check(`cancel-${label}`,(await state()).journal.phase==='idle'&&(await state()).mode==='auto',await state());
   // Finish once more and reload directly from the card: completion itself must
   // persist, independently of the skip/exit button.
   await page.evaluate(()=>localStorage.clear());await press('#journal-start');
   await visit('bridge');await until(()=>page.locator('[data-journal=capture]').isEnabled());
   await press('[data-journal=capture]');await visit('pagoda');await visit('arch');await press('[data-hour="1000"]');
   check(`complete-before-reload-${label}`,(await state()).journal.phase==='done',await state());
   await page.clock.resume();await page.goto(base);await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});
   const revisited=await state();check(`completed-revisit-${label}`,revisited.journal.phase==='idle'&&revisited.auto&&revisited.hour===0,revisited);
   await ctx.close();
  }
  check('page-errors',report.errors.length===0,report.errors);
  report.summary={pass:report.checks.filter(c=>c.pass).length,fail:report.checks.filter(c=>!c.pass).length};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(report.summary);
  if(report.summary.fail)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
