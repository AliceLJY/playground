// NODE_PATH="$(npm root -g)" node tools/entry-check.cjs <base-url> <out-dir>
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const [base,out]=process.argv.slice(2),checks=[];fs.mkdirSync(out,{recursive:true});
const check=(name,pass)=>{checks.push({name,pass});assert.ok(pass,name);};
(async()=>{
 const browser=await chromium.launch({args:['--enable-gpu','--ignore-gpu-blocklist']});
 try{
  for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<900?2:1,hasTouch:width<900});
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await p.clock.install({time:new Date('2026-11-03T12:15:00Z')});
   const ready=()=>p.waitForFunction(()=>window.__foyer?.ready,null,{polling:50});
   const snap=()=>p.evaluate(()=>__foyer.snapshot());
   const shot=async name=>{await p.clock.runFor(34);await p.screenshot({path:path.join(out,`${width}-${name}.png`)});};
   const fit=selector=>p.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
   await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await ready();await p.clock.pauseAt(new Date('2026-11-03T12:15:02Z'));
   check(`${width}: no history starts tea gift in ordinary foyer`,(await snap()).gift.phase==='door');
   check(`${width}: direct waiting skip visible >=44px`,await fit('#giftSkip')&&await p.locator('#giftSkip').innerText()==='直接候场');await shot('first');
   await p.locator('#btnSit').click();await p.clock.runFor(24000);
   check(`${width}: no early usher`,!(await snap()).usher);
   await p.clock.runFor(1200);let s=await snap();
   check(`${width}: usher arrives naturally after 25 seconds`,s.gift.phase==='invited'&&s.usher?.label==='领位人 · 非真人'&&s.humans===1);
   await shot('invited');
   if(width<900)await p.locator('#btnTea').tap();else await p.keyboard.press('4');
   s=await snap();check(`${width}: tea earns original seat ticket`,s.gift.phase==='done'&&s.teas===1&&s.gift.ticket.seat===s.seat);await shot('ticket');
   check(`${width}: no history before normal end`,await p.evaluate(()=>FOYER.decodeVisits(localStorage.getItem('show-foyer-visits')||'[]').length===0));
   await p.locator('#btnLeave').click();await p.clock.runFor(1500);
   check(`${width}: ordinary leave stores tea but no usher or ticket`,await p.evaluate(()=>{const v=FOYER.decodeVisits(localStorage.getItem('show-foyer-visits'));return v.length===1&&v[0].acts.some(a=>a[1]===3)&&!JSON.stringify(v).includes('领位人')&&!JSON.stringify(v).includes('ticket');}));
   await p.reload();await ready();s=await snap();check(`${width}: returning history suppresses automatic usher`,s.gift.phase==='off'&&!s.usher);await shot('return');
   await p.locator('#infoBtn').click();await p.locator('#giftStart').click();
   check(`${width}: original menu replay remains`,(await snap()).gift.phase==='door');
   await p.locator('#infoBtn').click();await p.locator('#giftExit').click();
   await p.evaluate(()=>localStorage.clear());await p.reload();await ready();
   await p.locator('#btnSit').click();await p.evaluate(()=>__foyer.step(26000));
   const before=await snap();await p.locator('#giftSkip').click();s=await snap();
   check(`${width}: skip preserves seat and current visit`,s.phase==='seated'&&s.seat===before.seat&&s.gift.phase==='off'&&!s.usher&&await p.evaluate(()=>__foyer.state.visit!==null));await shot('skip');
   await p.locator('#btnLeave').click();await p.clock.runFor(1500);await p.reload();await ready();
   check(`${width}: skipped normal visit also returns with history`,(await snap()).gift.phase==='off');
   await p.evaluate(()=>localStorage.clear());await p.reload();await ready();await p.locator('#giftSkip').click();await p.reload();await ready();
   check(`${width}: without any saved visit reload remains first visit`,(await snap()).gift.phase==='door');
   await p.locator('#btnSit').click();await p.evaluate(()=>__foyer.step(26000));await p.keyboard.press('4');
   await p.evaluate(()=>__foyer.jumpTo(.01));await p.clock.runFor(2900);
   check(`${width}: curtain saves normal tea visit too`,await p.evaluate(()=>FOYER.decodeVisits(localStorage.getItem('show-foyer-visits')).some(v=>v.acts.some(a=>a[1]===3))));
   await p.locator('#curtainPhotoBtn').click();await p.locator('#photoGiftExit').click();
   check(`${width}: exiting automatic gift after curtain keeps next-show route`,(await snap()).curtainOverlay&&await fit('#nextShowBtn'));
   await p.locator('#nextShowBtn').click();check(`${width}: next show uses new history`,(await snap()).gift.phase==='off');
   await p.addInitScript(()=>{Storage.prototype.getItem=Storage.prototype.setItem=()=>{throw new Error('storage unavailable');};});
   await p.reload();await ready();check(`${width}: blocked storage is first visit`,(await snap()).gift.phase==='door');
   await p.locator('#btnSit').click();await p.evaluate(()=>__foyer.step(26000));await p.locator('#btnTea').click();await p.locator('#btnLeave').click();await p.reload();await ready();
   check(`${width}: failed write reloads first visit without crashing`,(await snap()).gift.phase==='door');
   const fixed=new URL(base);fixed.searchParams.set('view','first');await p.goto(fixed.href);await ready();
   check(`${width}: fixed view retains old state`,(await snap()).gift.phase==='off');
   check(`${width}: zero errors`,errors.length===0);await context.close();
  }
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({browser:browser.version(),checks},null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
