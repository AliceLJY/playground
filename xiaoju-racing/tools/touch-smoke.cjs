// Record the first 30 seconds using real touch input and default graphics.
// NODE_PATH="$(npm root -g)" node tools/touch-smoke.cjs <built-url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const [base,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});
 const ctx=await b.newContext({viewport:{width:390,height:664},hasTouch:true,isMobile:true,deviceScaleFactor:2,recordVideo:{dir:out,size:{width:390,height:664}}}),p=await ctx.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(String(e)));const url=new URL(base);url.searchParams.set('intro','skip');await p.goto(url.href);await p.waitForFunction(()=>window.__race?.ready,null,{polling:100});
 const started=Date.now();await p.locator('#auto-pedal').check();await p.tap('#start');await p.waitForFunction(()=>__race.state.phase==='racing',null,{polling:100});await p.waitForTimeout(1800);
 const cdp=await ctx.newCDPSession(p),points=async selectors=>Promise.all(selectors.map(async(s,id)=>{const r=await p.locator(s).boundingBox();return {id,x:r.x+r.width/2,y:r.y+r.height/2};}));
 const before=await p.evaluate(()=>__race.state.riders[0]);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:await points(['[data-control=left]','[data-control=drift]'])});await p.waitForTimeout(700);
 const drifting=await p.evaluate(()=>__race.state.riders[0]);assert.ok(drifting.charge>before.charge+8,'two fingers must charge drift while auto pedalling');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(60);assert.ok((await p.evaluate(()=>__race.state.riders[0].mini))>0,'releasing drift gives existing mini boost');
 await p.tap('#touch-boost');await p.waitForTimeout(300);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:await points(['[data-control=brake]'])});await p.waitForTimeout(1500);const stopped=await p.evaluate(()=>__race.state.riders[0].speed);assert.equal(stopped,0);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.tap('#camera');await p.waitForTimeout(500);
 await p.tap('#pause');await p.locator('#pause-overlay').waitFor({state:'visible'});await p.locator('#auto-pedal-paused').uncheck();await p.tap('#recover-resume');await p.locator('[data-control=forward]').waitFor({state:'visible'});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:await points(['[data-control=forward]'])});await p.waitForTimeout(1500);assert.ok((await p.evaluate(()=>__race.state.riders[0].speed))>8,'manual throttle still works');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await p.waitForTimeout(Math.max(0,30000-(Date.now()-started)));await p.screenshot({path:`${out}/last-frame.png`});assert.deepEqual(errors,[]);
 const report={driftCharge:drifting.charge-before.charge,stopped,seconds:(Date.now()-started)/1000,errors,video:await p.video().path()};await ctx.close();await b.close();fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(report);
})().catch(e=>{console.error(e);process.exit(1);});
