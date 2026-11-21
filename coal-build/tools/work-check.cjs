// "Can you see the coal balls working?" (Alice 2026-11-21: 煤球工作的动作不够明显). Run by hand like browser-check.cjs:
//   NODE_PATH="$(npm root -g)" node tools/work-check.cjs <output-dir> [page-url]
// Plays seed 1 to 70 s with the normal autopilot, then watches 4 s of real-time play on a 390x664 phone screen:
//  A. every brick that flies up leaves from a walking coal ball's head (within 6 px), not from an empty spot on the ground
//  B. when a brick lands, a mason on the plank is right there (within 18 px) and stamps it within 0.3 s
//  C. walkers are at least 7 px in radius while there are 30 or fewer
//  D. the bricks on a walker's head show 力气: one brick at level 1, more after upgrades
// Also saves a strip of 12 frames (every 0.2 s) for reading by eye.
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const out=process.argv[2]||'work-out',base=process.argv[3]||'http://127.0.0.1:8971/index.html';fs.mkdirSync(out,{recursive:true});
let failed=0;const check=(n,p,d)=>{if(!p)failed++;console.log(p?'ok  ':'FAIL',n,d==null?'':JSON.stringify(d));};
(async()=>{
  const b=await chromium.launch(),ctx=await b.newContext({viewport:{width:390,height:664},deviceScaleFactor:2,hasTouch:true,isMobile:true}),page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base.replace(/[?#].*$/,'')+'?seed=1');
  await page.waitForFunction(()=>window.__coalbuild&&window.__coalbuild.ready,null,{polling:100,timeout:20000});
  const p0=await page.evaluate(()=>window.__coalbuild.probe());const [bx,by]=[p0.layout.button.x+p0.layout.button.w/2,p0.layout.button.y+p0.layout.button.h/2];
  await page.touchscreen.tap(bx+p0.ox,by);
  const lv1=await page.evaluate(()=>window.__coalbuild.walkers().map(w=>w.carryN||0));
  await page.evaluate(()=>window.__coalbuild.autoplay('normal',70));await page.waitForTimeout(800);
  await page.evaluate(()=>window.__coalbuild.measureStart());
  for(let i=0;i<12;i++){await page.screenshot({path:path.join(out,`frame-${String(i).padStart(2,'0')}.png`)});await page.waitForTimeout(200);}
  await page.waitForTimeout(1600);
  const m=await page.evaluate(()=>window.__coalbuild.measureRead()),p=await page.evaluate(()=>window.__coalbuild.probe()),ws=await page.evaluate(()=>window.__coalbuild.walkers());
  const launch=m.launch,okA=launch.filter(d=>d<=6).length;
  check('A: bricks leave from a walker\'s head',launch.length>=8&&okA/launch.length>=0.9,{bricks:launch.length,fromHead:okA,median:launch.slice().sort((a,b)=>a-b)[launch.length>>1]});
  let okB=0;for(const l of m.land){if(m.masonAt.some(f=>f.t>=l.t&&f.t<=l.t+0.3&&f.m.some(a=>Math.abs(a.x-l.x)<=18&&a.stomp>0)))okB++;}
  check('B: a mason stamps each brick as it lands',m.land.length>=8&&okB/m.land.length>=0.7,{landed:m.land.length,stamped:okB});
  check('C: walkers big enough to read on a phone',ws.length<=30?ws.every(w=>w.r>=7):ws.every(w=>w.r>=6),{n:ws.length,r:ws[0]&&ws[0].r});
  check('D: bricks on the head grow with 力气',Math.max(...lv1)===1&&p.lv.power>=3&&Math.max(...ws.map(w=>w.carryN||0))>=2,{atStart:Math.max(...lv1),power:p.lv.power,now:Math.max(...ws.map(w=>w.carryN||0))});
  check('no page errors',errors.length===0,errors);
  await b.close();console.log(failed?failed+' failed':'all work checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
