// Real first visits and reloads; completion persistence is also exercised by journal-check.cjs.
// NODE_PATH="$(npm root -g)" node tools/first-visit-check.cjs <out-dir> <base-url>
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const {inspectLayout}=require('./layout.cjs');
const out=path.resolve(process.argv[2]),base=process.argv[3],key='huacheng-autumn:visited';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={base,browser:browser.version(),checks:[],errors:[],views:[]};
 const check=(id,pass,detail)=>{report.checks.push({id,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${id}`);};
 try{
  for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
   const label=`${width}x${height}`,phone=width<900;
   const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:phone,hasTouch:phone});
   const page=await ctx.newPage();
   page.on('pageerror',e=>report.errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
   page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${new URL(r.url()).pathname}`);});
   await page.clock.install();
   const ready=()=>page.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100});
   const state=()=>page.evaluate(()=>window.__huacheng.state());
   const open=async query=>{const url=new URL(base);url.search=query||'';await page.clock.resume();await page.goto(url.href);await ready();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));};
   const reload=async()=>{await page.clock.resume();await page.reload();await ready();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));};
   const press=async selector=>{if(phone)await page.locator(selector).tap();else {await page.locator(selector).focus();await page.keyboard.press('Enter');}};
   const shot=async name=>{
    const layout=await inspectLayout(page),snapshot=await page.evaluate(()=>window.__PLAYTEST__.snapshot());
    check(`${label}-${name}-layout`,layout.pass&&layout.boxes.filter(b=>b.clickable).every(b=>b.w>=44&&b.h>=44),layout);
    report.views.push({label,name,...snapshot});
    await page.screenshot({path:path.join(out,`${label}-${name}.png`)});
   };
   await open('intro=skip');await page.evaluate(()=>localStorage.clear());await open();
   const initial=await state();
   const first=initial.journal.phase==='visiting'&&!initial.auto&&!initial.frozen&&initial.hour===0&&initial.journal.stamps.length===0;
   check(`${label}-first-visit`,first,initial);await shot('first');
   // The pre-fix version stops here, leaving evidence for all four viewports.
   if(!first){await ctx.close();continue;}
   check(`${label}-choose-place`,/花桥/.test(await page.locator('#journal-goal').textContent())&&/塔下/.test(await page.locator('#journal-goal').textContent()),null);
   const placement=await page.evaluate(()=>{
    const r=document.querySelector('#journal').getBoundingClientRect(),b=window.__huacheng.subjectBoxes().base;
    return{panel:{x0:r.left/innerWidth,x1:r.right/innerWidth,y0:r.top/innerHeight,y1:r.bottom/innerHeight},board:b};
   });
   const {panel:p,board:b}=placement;
   check(`${label}-opening-keeps-scene`,b.front&&!(p.x0<b.x1&&p.x1>b.x0&&p.y0<b.y1&&p.y1>b.y0),placement);
   await reload();check(`${label}-unfinished-is-first`,(await state()).journal.phase==='visiting',await state());
   check(`${label}-skip-label`,await page.locator('[data-journal=exit]').textContent()==='随便逛逛',null);
   await press('[data-journal=exit]');await page.clock.runFor(3400);
   let s=await state();
   check(`${label}-skip-to-tour`,s.auto&&s.mode==='auto'&&s.journal.phase==='idle'&&await page.evaluate(k=>localStorage.getItem(k)==='1',key),s);
   await shot('skipped');await reload();s=await state();
   check(`${label}-returning-tour`,s.auto&&s.journal.phase==='idle'&&s.hour===0,s);await shot('returning');
   check(`${label}-original-entry`,await page.locator('#journal-start').isVisible()&&await page.locator('[data-place]').count()===3,null);
   await press('#journal-start');check(`${label}-menu-reopens`,(await state()).journal.phase==='visiting',await state());await shot('menu');
   await page.evaluate(()=>localStorage.clear());await open();
   await page.evaluate(()=>window.__PLAYTEST__.reset());await page.clock.runFor(500);
   s=await state();check(`${label}-playtest-reset`,s.auto&&s.journal.phase==='idle'&&!await page.evaluate(k=>localStorage.getItem(k),key),s);
   for(const query of ['view=hero','view=bridge','intro=skip','record=1']){
    await open(query);s=await state();
    check(`${label}-bypass-${query}`,s.journal.phase==='idle'&&(query.startsWith('view=')?s.view===query.slice(5):s.auto)&&!await page.evaluate(k=>localStorage.getItem(k),key),s);
   }
   await open();await page.evaluate(()=>window.__huacheng.setView('pagoda'));await page.clock.runFor(500);
   s=await state();check(`${label}-view-hook`,s.view==='pagoda'&&s.journal.phase==='idle',s);
   // Inject read failures, write failures and a blocked storage getter separately.
   await page.addInitScript(()=>{
     const failure=new URLSearchParams(location.search).get('testStorage');
     if(failure==='storage')Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage blocked','SecurityError');}});
     else if(failure)Storage.prototype[failure]=()=>{throw new DOMException('Storage blocked','SecurityError');};
   });
   for(const failure of ['getItem','setItem','storage']){
    await open('intro=skip');await page.evaluate(()=>localStorage.clear());
    await open(`testStorage=${failure}`);check(`${label}-${failure}-first`,(await state()).journal.phase==='visiting',await state());
    await press('[data-journal=exit]');await page.clock.runFor(3400);
    check(`${label}-${failure}-skip`,(await state()).journal.phase==='idle'&&(await state()).auto,await state());
    await reload();check(`${label}-${failure}-revisit`,(await state()).journal.phase==='visiting',await state());
   }
   await ctx.close();
  }
  check('page-errors',report.errors.length===0,report.errors);
  report.summary={pass:report.checks.filter(c=>c.pass).length,fail:report.checks.filter(c=>!c.pass).length};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(report.summary);
  if(report.summary.fail)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
