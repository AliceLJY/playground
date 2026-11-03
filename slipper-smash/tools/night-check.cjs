// Test the actual published files, real native buttons and pointer strokes.
// NODE_PATH="$(npm root -g)" node tools/night-check.cjs <base-url> <out-dir> [--record]
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const [base,out]=process.argv.slice(2),record=process.argv.includes('--record');
const report={base,checks:[],runs:[],errors:[]};
fs.mkdirSync(out,{recursive:true});
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)throw new Error(name+': '+JSON.stringify(detail));};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
 try{for(const [w,h] of [[390,664],[320,568],[844,340],[1365,900]]){
  const recording=record&&w===390,context=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:w===1365?1:2,hasTouch:w!==1365,isMobile:w!==1365,...(recording?{recordVideo:{dir:path.join(out,'video'),size:{width:w,height:h}}}:{})});
  const page=await context.newPage(),errors=[];
  await page.addInitScript(()=>{
    window.__nightLayout={comboSamples:0,overlaps:[]};
    const fill=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){
      if(this.canvas.id==='stage'&&(/连拍|^保住 |^凉拖拍蟑螂$/.test(text))){
        const m=this.measureText(text),tr=this.getTransform(),d=Math.min(devicePixelRatio,2);
        const a={x:(tr.a*(x-m.actualBoundingBoxLeft)+tr.e)/d,y:(tr.d*(y-m.actualBoundingBoxAscent)+tr.f)/d,w:tr.a*(m.actualBoundingBoxLeft+m.actualBoundingBoxRight)/d,h:tr.d*(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)/d};
        if(/^\d+ 连拍/.test(text))window.__nightLayout.comboSamples++;
        for(const id of ['night-entry','night-hud','night-result-controls']){
          const el=document.getElementById(id);if(!el||el.hidden)continue;
          const b=el.getBoundingClientRect();
          if(a.x<b.right&&a.x+a.w>b.x&&a.y<b.bottom&&a.y+a.h>b.y&&window.__nightLayout.overlaps.length<20)window.__nightLayout.overlaps.push({text,id,a,b:b.toJSON()});
        }
      }
      return fill.call(this,text,x,y,...args);
    };
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(!r.url().startsWith(new URL(base).origin)&&!r.url().startsWith('data:'))errors.push('External request: '+r.url());});
  const q=()=>page.evaluate(()=>window.__slipper.probe());
  const shot=n=>page.screenshot({path:path.join(out,`${w}x${h}-${n}.png`)});
  const usable=sel=>page.locator(sel).evaluate(e=>{const r=e.getBoundingClientRect();return !e.hidden&&r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
  await page.clock.install();await page.goto(base);await page.waitForFunction(()=>window.__slipper?.ready,null,{polling:100});await shot('title');
  check(`${w}: entry is visible, reachable, >=44px`,await usable('#night-entry'));
  // Use touch on phones, native keyboard activation on desktop.
  if(w===1365){await page.focus('#night-entry');await page.keyboard.press('Enter');}
  else await page.tap('#night-entry');
  check(`${w}: optional menu opens without starting casual play`,(await q()).screen==='nightMenu');
  check(`${w}: menu buttons fit and are >=44px`,await usable('#night-start')&&await usable('#night-back'));await shot('menu');
  if(w===1365)await page.keyboard.press('Enter');else await page.tap('#night-start');
  check(`${w}: actual activation enters night mode`,(await q()).state.mode==='night');
  let controlled=false;
  async function useClock(){if(!controlled){await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));controlled=true;}}
  if(!recording)await useClock();
  const step=async ms=>controlled?page.clock.runFor(ms):page.waitForTimeout(ms);
  let strokes=0,boss=false,lastTime=-1,stalled=0,thirty=false;
  // These are real pointer events, not the game's autopilot or state setters.
  for(let i=0;i<1000;i++){
    const p=await q(),s=p.state;
    if(p.screen==='result')break;
    stalled=s.phase!=='over'&&s.t===lastTime?stalled+1:0;lastTime=s.t;
    if(stalled>=10)check(`${w}: no stuck input window`,false,s);
    if(s.phase==='boss'&&!boss){boss=true;await shot('boss');}
    if(s.t>=30&&!thirty){thirty=true;await shot('30seconds');if(recording)await useClock();}
    const teas=s.ents.filter(e=>e.kind==='tea'),scale=p.view.scale/p.dpr;
    const safe=e=>teas.every(t=>Math.hypot(t.x-e.x,t.y-e.y)>t.r+60*scale);
    const target=s.ents.find(e=>e.kind!=='tea'&&e.x>12&&e.x<w-12&&e.y>Math.max(110,h*.29)&&e.y<h-40&&safe(e))||(s.phase==='boss'&&safe(s.boss)?s.boss:null);
    // A flying bug can pass behind the pause button; hit-test the actual page before tapping.
    const onCanvas=target&&await page.evaluate(({x,y})=>[-2,0,2].every(dx=>document.elementFromPoint(x+dx,y)?.id==='stage'),target);
    if(onCanvas&&s.phase!=='over'){
      // Native taps and mouse strokes both reach game.swipe through the existing handlers.
      if(w!==1365)await page.touchscreen.tap(target.x,target.y);
      else{await page.mouse.move(target.x-2,target.y);await page.mouse.down();await page.mouse.move(target.x+2,target.y);await page.mouse.up();}
      strokes++;
    }
    await step(100);
  }
  await step(1000);const won=await q();
  check(`${w}: real swipes actually kill and complete night watch`,strokes>20&&won.state.kills>0&&boss&&won.screen==='result'&&won.state.result.reason==='win',{strokes,result:won.state.result});
  check(`${w}: retry and return are visible and >=44px`,await usable('#night-retry')&&await usable('#night-return'));await shot('win');
  const layout=await page.evaluate(()=>window.__nightLayout);
  check(`${w}: actual combo, title and result text clear new controls`,layout.comboSamples>0&&layout.overlaps.length===0,layout);
  await page.click('#night-return');check(`${w}: win returns to title without old state`,(await q()).screen==='title'&&(await q()).state===null);
  await page.keyboard.press('Enter');const casual=await q();
  check(`${w}: keyboard starts clean original mode`,casual.state.mode==='casual'&&casual.state.night===null&&casual.state.lives===3&&casual.state.kills===0&&!casual.paused&&!casual.gestureActive);
  // A deterministic challenge fixture separately exercises both penalties and the pause fixes.
  await page.evaluate(()=>window.__slipper.start(5,'night'));
  await page.clock.runFor(4000);await shot('misses');
  await page.click('#pause-btn');const paused=await q();await page.clock.runFor(1500);
  check(`${w}: pause freezes all challenge state`,JSON.stringify((await q()).state)===JSON.stringify(paused.state));
  check(`${w}: pause and sound buttons remain >=44px`,await usable('#resume')&&await usable('#pause-mute'));
  await page.click('#pause-mute');check(`${w}: mute works while paused`,(await q()).muted!==paused.muted&&(await q()).paused);await shot('pause');
  await page.click('#resume');
  let spilled=false,stolen=false;
  for(let i=0;i<300&&(await q()).screen!=='result';i++){
    const p=await q(),s=p.state;stolen ||= s.night.stolen>0;
    const cup=s.ents.find(e=>e.kind==='tea'&&e.y>h*.3&&e.y<h-30);
    if(cup&&!spilled){await page.mouse.click(cup.x,cup.y);spilled=(await q()).state.night.spilled>0;}
    if(stolen&&!report.runs.some(r=>r.width===w&&r.name==='theft')){await shot('theft');report.runs.push({width:w,name:'theft',probe:await q()});}
    await page.clock.runFor(100);
  }
  await page.clock.runFor(1000);const lost=await q();
  check(`${w}: actual spill and escaped bugs both cost cups`,spilled&&stolen&&lost.state.night.spilled>0&&lost.state.night.stolen>0,lost.state);
  check(`${w}: empty cups produce a loss`,lost.screen==='result'&&lost.state.lives===0&&lost.state.result.reason!=='win');await shot('loss');
  await page.keyboard.press('Space');const retry=await q();
  check(`${w}: keyboard retry clears challenge counters`,retry.screen==='play'&&retry.state.mode==='night'&&retry.state.lives===3&&retry.state.night.pending===0&&retry.state.night.stolen===0&&retry.state.night.spilled===0);
  await page.clock.runFor(20000);await page.click('#night-return');await page.mouse.click(w/2,h*.4);
  const normal=await q();check(`${w}: loss also returns to casual with no gesture`,normal.state.mode==='casual'&&normal.state.night===null&&!normal.gestureActive&&!normal.paused);
  await page.clock.runFor(20000);check(`${w}: original casual misses still do not cost cups`,(await q()).state.misses>=9&&(await q()).state.lives===3);await shot('casual');
  report.runs.push({width:w,height:h,name:'win',probe:won,strokes},{width:w,height:h,name:'loss',probe:lost});report.errors.push(...errors);
  check(`${w}: zero page and console errors`,errors.length===0,errors);
  const video=recording?page.video():null;await context.close();if(video)report.video=await video.path();
  console.log(`${w}x${h}: complete`);
 }}finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 for(const c of report.checks)console.log(`${c.pass?'PASS':'FAIL'} ${c.name}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
