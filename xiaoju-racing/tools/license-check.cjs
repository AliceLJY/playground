// NODE_PATH="$(npm root -g)" node tools/license-check.cjs <source-or-built-url> <out-dir> [--no-screens]
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const drive=require('./license-pilot.cjs');
const [base,out,...flags]=process.argv.slice(2);if(!base||!out)throw Error('URL and output directory required');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});
 const reports=[];
 try{for(const [w,h] of [[390,664],[320,568],[844,340],[1365,900]]){
  const touch=w<1000,ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1,...(w===390&&!flags.includes('--no-screens')?{recordVideo:{dir:out,size:{width:w,height:h}}}:{})});
  const p=await ctx.newPage(),errors=[],checks=[],shots=[];p.on('pageerror',e=>errors.push(String(e)));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});assert.ok(ok,`${w}x${h}: ${name} ${JSON.stringify(data)}`);};
  await p.clock.install({time:new Date('2026-11-03T04:00:00Z')});
  await p.goto(base);await p.waitForFunction(()=>window.__race?.ready,null,{polling:100});
  await p.clock.pauseAt(new Date('2026-11-03T04:01:00Z'));
  const shot=async name=>{if(flags.includes('--no-screens'))return;const file=`${w}x${h}-${name}.png`;await p.screenshot({path:`${out}/${file}`,scale:'css'});shots.push({file,state:await p.evaluate(()=>__race.state)});};
  const buttons=async selectors=>p.evaluate(selectors=>selectors.flatMap(s=>[...document.querySelectorAll(s)]).filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {id:e.id||e.dataset.control,w:r.width,h:r.height,inside:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}),selectors);
  const fits=async(name,selectors)=>{const b=await buttons(selectors);check(name,b.length>0&&b.every(r=>r.w>=44&&r.h>=44&&r.inside&&r.hit),b);};
  const click=async selector=>{const r=await p.locator(selector).boundingBox();if(touch)await p.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);else await p.mouse.click(r.x+r.width/2,r.y+r.height/2);await p.clock.runFor(100);};
  const meta=await p.evaluate(()=>{const c=document.querySelector('#world canvas'),g=c.getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return {browser:navigator.userAgent,renderer:g.getParameter(e.UNMASKED_RENDERER_WEBGL),dpr:devicePixelRatio,renderRatio:c.width/innerWidth,three:THREE.REVISION,quality:document.querySelector('#quality').textContent};});
  check('normal defaults retained',await p.evaluate(()=>__race.state.laps===2&&__race.state.difficulty==='normal'&&!__race.state.license&&!document.querySelector('#auto-pedal').checked));
  // Menu may scroll on short landscape; entry must be reachable without offscreen clicks.
  await p.locator('#license-open').scrollIntoViewIfNeeded();await fits('exam menu button reachable',['#license-open']);await shot('menu');
  if(touch)await p.locator('#auto-pedal').check();
  await click('#license-open');await fits('intro actions reachable',['#license-start','#license-back']);await shot('intro');
  await click('#license-start');await p.clock.runFor(3100);
  check('solo exam entered',await p.evaluate(()=>__race.state.phase==='racing'&&__race.state.riders.length===1&&!!__race.state.license));
  await fits('exam controls reachable',['.race-buttons button',...(touch?['#touch button']:[])]);
  await p.evaluate(src=>{window.examDrive=(0,eval)('('+src+')');window.examEvents=[];window.lastInput={};const step=RaceCore.step;RaceCore.step=(s,i,dt)=>{lastInput={...i};step(s,i,dt);examEvents.push(...s.events.map(e=>({...e,time:s.time,stamps:s.license?.stamps})));};},drive.toString());
  const cdp=touch?await ctx.newCDPSession(p):null,keys={forward:'ArrowUp',left:'ArrowLeft',right:'ArrowRight',drift:'ShiftLeft'},coords={};let held={};
  if(touch)for(const [id,action]of Object.keys(keys).entries()){const r=await p.locator(`[data-control=${action}]`).boundingBox();coords[action]={id,x:r.x+r.width/2,y:r.y+r.height/2};}
  async function input(next){
   if(touch){const old=Object.keys(keys).filter(k=>held[k]),now=Object.keys(keys).filter(k=>next[k]),remaining=old.filter(k=>next[k]);
    if(old.some(k=>!next[k]))await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:remaining.map(k=>coords[k])});
    if(now.some(k=>!held[k]))await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:now.map(k=>coords[k])});
   }else for(const [action,key]of Object.entries(keys)){if(held[action]&&!next[action])await p.keyboard.up(key);else if(!held[action]&&next[action])await p.keyboard.down(key);}
   held=next;
  }
  let sawDrift=false,sawRetry=false,earned=false,maxCalls=0;
  for(let i=0;i<500;i++){
   const s=await p.evaluate(()=>__race.state);if(s.phase==='result')break;
   const next=s.license.stamps===1&&s.license.retries===0?{forward:!touch,right:true}:await p.evaluate(autoPedal=>examDrive(RaceCore,__race.state,{autoPedal}),touch);
   await input(next);await p.clock.runFor(100);const after=await p.evaluate(()=>({state:__race.state,metrics:__race.metrics}));maxCalls=Math.max(maxCalls,after.metrics.drawCalls);
   if(!sawDrift&&after.state.riders[0].drift>.32){sawDrift=true;await shot('drift');}
   if(!earned&&after.state.license.stamps===1){earned=true;await shot('first-stamp');if(w===390){await input({});await click('#camera');}}
   if(!sawRetry&&after.state.license.retries>0){sawRetry=true;check('hit retains first stamp',after.state.license.stamps===1&&!after.state.license.mini);check('retry feedback refreshes immediately',await p.evaluate(()=>document.querySelector('#license-cue').textContent.includes('碰到护栏')&&Number(document.querySelector('#speed').textContent)<10));await shot('retry');}
  }
  await input({});await p.clock.runFor(150);
  const end=await p.evaluate(()=>({state:__race.state,events:examEvents}));
  check('real controls complete exam',end.state.phase==='result'&&end.state.license.outcome==='pass'&&end.state.license.stamps===3,end.state.license);
  check('samples contain minis, rail hit and three stamps',sawDrift&&sawRetry&&end.events.filter(e=>e.type==='mini').length>=3&&end.events.some(e=>e.type==='hit')&&end.events.filter(e=>e.type==='license-stamp').length===3);
  await fits('result actions reachable',['#license-restart','#license-menu']);await shot('pass');
  await click('#license-restart');await p.clock.runFor(3100);
  check('retest clears stamps and retry count',await p.evaluate(()=>__race.state.license.stamps===0&&__race.state.license.retries===0));
  await click('#pause');const paused=await p.evaluate(()=>__race.state.time);await p.clock.runFor(1500);check('pause preserves exam time',await p.evaluate(()=>__race.state.time)===paused);
  await fits('exam pause actions reachable',['#pause-overlay button']);await shot('pause');
  await click('#recover-resume');check('pause recovery retries this bend and resumes',await p.evaluate(()=>__race.state.phase==='racing'&&__race.state.license.retries===1&&__race.state.license.stamps===0&&document.querySelector('#license-cue').textContent.includes('扶正重试')));
  await p.keyboard.press('KeyR');await p.clock.runFor(100);check('keyboard recovery uses the same retry intent',await p.evaluate(()=>__race.state.license.retries===2&&__race.state.license.stamps===0));await click('#pause');
  await click('#exit');await click('#license-open');await click('#license-start');await p.clock.runFor(3100);
  if(touch){await click('#pause');await p.locator('#auto-pedal-paused').uncheck();await click('#resume');}
  await p.clock.runFor(45500);
  check('idle exam ends with an honest incomplete result',await p.evaluate(()=>__race.state.phase==='result'&&__race.state.license.outcome==='timeout'&&__race.state.license.stamps===0&&document.querySelector('#license-title').textContent==='还差 3 弯'));
  await shot('timeout');await click('#license-menu');
  if(touch)await p.locator('#auto-pedal').uncheck();await click('#start');await p.clock.runFor(3200);
  const normal=await p.evaluate(()=>({state:__race.state,input:lastInput,licenseHud:!document.querySelector('#license-hud').hidden,metrics:__race.metrics}));
  check('return starts original race without exam or held-input residue',normal.state.riders.length===6&&!normal.state.license&&normal.state.laps===2&&normal.state.difficulty==='normal'&&!normal.licenseHud&&!normal.input.forward&&!normal.input.drift&&!normal.input.left&&!normal.input.right&&!normal.input.autoPedal,normal.input);
  check('solo rendering does not exceed the cup draw calls',maxCalls<=normal.metrics.drawCalls,{exam:maxCalls,cup:normal.metrics.drawCalls});
  await shot('normal-race');check('zero page errors',errors.length===0,errors);
  reports.push({w,h,meta,checks,shots,events:end.events,finishTime:end.state.time,video:p.video()?await p.video().path():null});fs.writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(`PASS ${w}x${h}: ${checks.length} checks, ${end.state.time.toFixed(2)} s, ${meta.renderer}`);await ctx.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
