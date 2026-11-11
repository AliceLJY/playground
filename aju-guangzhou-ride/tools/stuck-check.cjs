// NODE_PATH="$(npm root -g)" node tools/stuck-check.cjs <source-or-built-url> <out-dir> [seconds=50]
// A visitor who never steers: Start, tell the calico "今天只想兜风", then touch nothing. Auto-forward is on, navigation is
// off, so the bike rides straight into the first building. It may fall; what it may not do is stand at 0 km/h afterwards.
// Samples every 250 ms on the real map with the real colliders and fails on any ride-phase standstill longer than 3 s.
// Written 2026-11-11 against a build that stood against the arcade wall for good after its first fall.
const {chromium}=require('playwright'),fs=require('node:fs');
const [base,out,secs='50']=process.argv.slice(2);if(!base||!out)throw Error('URL and output directory required');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});
 const ctx=await browser.newContext({viewport:{width:1365,height:900}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(base);await p.waitForFunction(()=>window.__ride?.ready,null,{polling:100});await p.locator('#start').click();
 const samples=[];let stuck=0,worst=0,worstAt=null,declined=false,shot=false;const t0=Date.now();
 while(Date.now()-t0<Number(secs)*1000){
  await p.waitForTimeout(250);const s=await p.evaluate(()=>__ride.state),t=(Date.now()-t0)/1000;
  if(s.phase==='challenge'&&!declined){await p.locator('#dialog-secondary').click();declined=true;continue;}
  samples.push({t:+t.toFixed(2),phase:s.phase,speed:+s.speed.toFixed(2),x:+s.x.toFixed(1),z:+s.z.toFixed(1),heading:+s.heading.toFixed(2),collisions:s.collisions});
  if(s.phase==='ride'&&s.speed===0){stuck+=.25;if(stuck>worst){worst=stuck;worstAt=samples.at(-1);}if(stuck>=3&&!shot){shot=true;await p.screenshot({path:`${out}/stuck.png`});}}else stuck=0;
 }
 await p.screenshot({path:`${out}/end.png`});
 const last=samples.at(-1),falls=last.collisions,moved=samples.reduce((d,s,i)=>i?d+Math.hypot(s.x-samples[i-1].x,s.z-samples[i-1].z):0,0);
 const checks=[
  ['the calico was met and declined',declined],
  ['the run contains at least one real fall',falls>=1,{falls}],
  ['never stands at 0 km/h in the ride phase for 3 s',worst<3,{worst,worstAt}],
  ['still rolling in the last 10 s',samples.filter(s=>s.t>Number(secs)-10).some(s=>s.speed>3)],
  ['no page errors',errors.length===0,errors],
 ];
 let failed=0;for(const [name,ok,data] of checks){if(!ok)failed++;console.log(`${ok?'PASS':'FAIL'} ${name}${data?' '+JSON.stringify(data):''}`);}
 console.log(`falls ${falls}, path ${moved.toFixed(0)} m in ${secs} s`);
 fs.writeFileSync(`${out}/stuck-report.json`,JSON.stringify({base,checkedAt:new Date().toISOString(),checks:checks.map(([name,ok,data])=>({name,ok:!!ok,data})),samples},null,1));
 await browser.close();process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
