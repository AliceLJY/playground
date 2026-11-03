// NODE_PATH="$(npm root -g)" node tools/spring-check.cjs [http://127.0.0.1:3191/] [out-dir]
// Start tools/preview.cjs first. Stops the demo on the frames where the springs move (a landing squash, the wave,
// a sheet swinging on the board) and checks every logical pixel there is a solid 2×2 block: no half-pixel smear.
// Runs a desktop, an iPhone viewport (390×664 at DPR 3), reduced motion, and the guest feed. No office writes.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const fixture=require('../tests/fixtures/state-scene.json');
const base=process.argv[2]||'http://127.0.0.1:3191/',out=process.argv[3]||path.join(__dirname,'shots','spring');
const report={checkedAt:new Date().toISOString(),base,checks:[]};
const check=(name,passed,details)=>{report.checks.push({name,passed:!!passed,details});assert.ok(passed,name+': '+JSON.stringify(details));};

// Share of 2×2 device blocks inside a logical rectangle that are one solid colour (the canvas is 2× the logical grid).
const solidBlocks=(page,box)=>page.evaluate(({x,y,w,h})=>{
  const g=document.querySelector('#office').getContext('2d'),d=g.getImageData(x*2,y*2,w*2,h*2).data,W=w*2;let solid=0,total=0;
  const px=(i,j)=>{const k=(j*W+i)*4;return d[k]<<24|d[k+1]<<16|d[k+2]<<8|d[k+3];};
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){total++;const a=px(2*i,2*j);if(a===px(2*i+1,2*j)&&a===px(2*i,2*j+1)&&a===px(2*i+1,2*j+1))solid++;}
  return solid/total;
},box);

(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});report.browser=browser.version();
  const runs=[
    {name:'desktop',viewport:{width:960,height:1000},dpr:2},
    {name:'iphone',viewport:{width:390,height:664},dpr:3,mobile:true},
    {name:'landscape',viewport:{width:1455,height:782},dpr:2},
    {name:'calm',viewport:{width:960,height:1000},dpr:2,reduced:true},
  ];
  for(const run of runs){
    const context=await browser.newContext({viewport:run.viewport,deviceScaleFactor:run.dpr,isMobile:!!run.mobile,hasTouch:!!run.mobile,reducedMotion:run.reduced?'reduce':'no-preference'});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('https://**/*',r=>r.abort());
    await page.clock.install({time:new Date('2026-11-01T02:00:00Z')});
    await page.goto(new URL('?demo=1',base).href);await page.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100,timeout:20000});
    let swing=[0,0];
    const step=async ms=>{const s=await page.evaluate(ms=>window.__PLAYTEST__.step(ms),ms);for(const v of s.sheetSway)swing=[Math.min(swing[0],v),Math.max(swing[1],v)];return s;};
    let s=await step(0);check(run.name+' reduced-motion flag reaches the page',s.calm===!!run.reduced,s.calm);
    // 1. Done hops: walk the demo frame by frame until somebody lands (deepest squash), then look at that frame.
    let landing=null,maxSquash=0,lifted=0;
    for(let i=0;i<30*240&&!landing;i++){
      s=await step(1000/30);
      for(const a of s.actors){if(!a.hop)continue;lifted=Math.max(lifted,a.hop.lift);maxSquash=Math.max(maxSquash,Math.abs(a.hop.squash));if(a.hop.squash>=2&&!run.reduced)landing=a;}
      if(run.reduced&&lifted>=5&&s.elapsed>60000)break;
    }
    if(run.reduced){check('calm: hops still happen, never squash',lifted>=5&&maxSquash===0,{lifted,maxSquash});}
    else {
      check(run.name+' a landing squashes 2–3 rows',landing&&landing.hop.squash<=3,landing);
      const x=Math.round(landing.x),y=Math.round(landing.y);
      await page.screenshot({path:path.join(out,run.name+'-landing.png')});
      // Body of the squashing actor, from the hair to the feet, clear of the name chip and the desk-0 badge text.
      const solid=await solidBlocks(page,{x:x-10,y:y-30,w:17,h:34});
      check(run.name+' squashed actor is whole pixels',solid===1,{solid,actor:landing.id,hop:landing.hop});
      const shot=await page.evaluate(({x,y})=>{const c=document.querySelector('#office'),o=document.createElement('canvas');o.width=o.height=160;const g=o.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(c,(x-20)*2,(y-36)*2,40*2,40*2,0,0,160,160);return o.toDataURL();},{x,y});
      await fs.writeFile(path.join(out,run.name+'-landing-zoom.png'),Buffer.from(shot.split(',')[1],'base64'));
    }
    // 2. The wave: press 拍张合照, the arm springs past the top, everyone perks up.
    await page.locator('#pose').click();let armPeak=0,perkPeak=0,waveShot=false;
    for(let i=0;i<40;i++){s=await step(1000/30);if(!s.greetPose)continue;armPeak=Math.max(armPeak,s.greetPose.arm);perkPeak=Math.max(perkPeak,s.greetPose.perk);
      if(!waveShot&&s.greetPose.arm>1.1){waveShot=true;await page.screenshot({path:path.join(out,run.name+'-wave.png')});
        const a=s.actors.find(a=>a.status==='busy'&&!a.moving&&!a.activity);
        if(a)check(run.name+' waving actor is whole pixels',await solidBlocks(page,{x:Math.round(a.x)-10,y:Math.round(a.y)-26,w:20,h:30})===1,a.id);}}
    if(run.reduced)check('calm: the wave does not overshoot',armPeak<=1+1e-9&&armPeak>.9,armPeak);
    else check(run.name+' the wave overshoots and everyone perks up',armPeak>1.08&&perkPeak>=2,{armPeak,perkPeak});
    // 3. A sheet goes up on the notice board while the page is open: it swings, and stays on the pixel grid.
    let sheetShot=false;
    for(let i=0;i<30*120&&!(swing[0]<0&&swing[1]>0)&&!(run.reduced&&swing[1]>0);i++){
      s=await step(1000/30);for(const v of s.sheetSway){
        if(v>=2&&!sheetShot){sheetShot=true;await page.screenshot({path:path.join(out,run.name+'-sheet.png')});
          check(run.name+' swinging sheets are whole pixels',await solidBlocks(page,{x:234,y:38,w:86,h:30})>.995,'board');}}}
    if(run.reduced)check('calm: a new sheet nudges once and never swings back',swing[0]===0&&swing[1]>=1,swing);
    else check(run.name+' a new sheet swings both ways',swing[0]<0&&swing[1]>=2,swing);
    check(run.name+' no page errors',!errors.length,errors);
    await context.close();
  }
  // 4. The guest feed (what the public page shows when the office answers): renders, hops are computed, the wave works.
  {
    const context=await browser.newContext({viewport:{width:390,height:664},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const feed={...structuredClone(fixture),guest:true,notices:[]};
    await page.route('**/api/state',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(feed)}));
    await page.route('https://**/*',r=>r.abort());
    await page.goto(base);await page.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100,timeout:20000});
    let s=await page.evaluate(()=>window.__PLAYTEST__.snapshot());check('guest feed is the live (not demo) page',!s.demo,s.demo);
    await page.locator('#pose').click();let arm=0;
    for(let i=0;i<20;i++){s=await page.evaluate(()=>window.__PLAYTEST__.step(1000/30));arm=Math.max(arm,s.greetPose?.arm||0);}
    await page.screenshot({path:path.join(out,'guest-wave.png')});
    check('guest page waves with the spring',arm>1.08,arm);check('guest no page errors',!errors.length,errors);
    await context.close();
  }
  await browser.close();report.result='passed';
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,1));
  console.log(JSON.stringify({result:'passed',checks:report.checks.length}));
})().catch(async e=>{report.result='failed';report.error=String(e.stack||e);await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,1));console.log(JSON.stringify({result:'failed',checks:report.checks.length,error:report.error}));process.exit(1);});
