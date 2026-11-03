// Local browser regression for controls and small viewports. No online writes.
// NODE_PATH="$(npm root -g)" node tools/controls-check.cjs <base-url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const ying=path.basename(path.dirname(__dirname))==='yingge-pit',hook=ying?'__yingge':'__slipper';
(async()=>{
 const [base,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome'}),report={browser:browser.version(),checks:[],runs:[],errors:[]};
 const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,detail});
 try{for(const [w,h] of [[390,664],[320,568],[844,340],[1365,900]]){
  const context=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:w===1365?1:2,hasTouch:w!==1365,isMobile:w!==1365});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.addInitScript(()=>{window.__drawnText=[];const f=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(s,...a){window.__drawnText.push(s);if(window.__drawnText.length>300)window.__drawnText.shift();return f.call(this,s,...a);};});
  const probe=()=>page.evaluate(k=>window[k].probe(),hook);
  const shot=n=>page.screenshot({path:path.join(out,`${w}x${h}-${n}.png`)});
  const usable=sel=>page.locator(sel).evaluateAll(els=>els.length>0&&els.every(e=>{const r=e.getBoundingClientRect();return !e.hidden&&r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
  await page.goto(base);await page.waitForFunction(k=>window[k]?.ready,hook,{polling:100});await page.waitForTimeout(100);await shot('title');
  if(!ying)check(`${w}: title explains misses and tea`,await page.evaluate(()=>window.__drawnText.some(s=>/漏掉.*断连拍.*误拍奶茶.*扣命/.test(s))));
  if(ying)await page.keyboard.press('2');
  await page.mouse.click(w*.5,h*.4);await page.waitForTimeout(2100);const playing=await probe();report.runs.push(playing);await shot('play');
  if(ying)for(const b of playing.pads)check(`${w}: pad ${b.lane}/${b.player} has 48px height,44px width,8px bottom room`,b.h>=48-.001&&b.w>=44&&b.x>=0&&b.x+b.w<=w+.001&&b.y+b.h<=h-8+.001,b);
  if(ying&&w!==1365){
    const a=playing.pads.find(p=>p.player===0&&p.lane===0),b=playing.pads.find(p=>p.player===1&&p.lane===2);
    const cdp=await context.newCDPSession(page),pt=(p,id)=>({x:p.x+p.w/2,y:p.y+p.h/2,id});
    await page.evaluate(()=>{window.__yingge.log.length=0;});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(a,1),pt(b,2)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(60);
    const log=await page.evaluate(()=>window.__yingge.log.slice()),left=log.find(e=>e.lane===0&&e.player===0),right=log.find(e=>e.lane===2&&e.player===1);
    check(`${w}: both native touch pads issue their players' strikes`,left&&right&&Math.abs(left.t-right.t)<.02,log);
  }
  check(`${w}: visible 44px pause`,await usable('#pause-btn'));
  if(ying&&await usable('#pause-btn')){const b=await page.locator('#pause-btn').boundingBox();const hits=playing.texts.filter(t=>t.tag==='hud'&&b.x<t.x+t.w&&b.x+b.width>t.x&&b.y<t.y+t.h&&b.y+b.height>t.y);check(`${w}: pause does not cover scores or wave labels`,hits.length===0,hits);}
  if(await usable('#pause-btn')){
    const state=JSON.stringify((await probe()).state);await page.click('#pause-btn');const paused=await probe();await page.waitForTimeout(250);
    check(`${w}: pause freezes round`,JSON.stringify((await probe()).state)===JSON.stringify(paused.state),{before:state,paused});
    check(`${w}: pause mute and continue reachable`,await usable('#resume')&&await usable('#pause-mute'));await shot('pause');
    const muted=paused.muted;await page.click('#pause-mute');check(`${w}: sound toggles without resuming`,(await probe()).muted!==muted&&(await probe()).paused);await page.click('#pause-mute');
    await page.keyboard.press(ying?'a':'Space');await page.mouse.click(4,h/2);check(`${w}: paused attacks ignored`,JSON.stringify((await probe()).state)===JSON.stringify(paused.state));
    await page.click('#resume');
    if(ying){await page.waitForTimeout(700);check(`${w}: three-beat count freezes round`,(await probe()).state.t===paused.state.t);await shot('count');await page.waitForTimeout(1200);}else await page.waitForTimeout(100);
    check(`${w}: explicit continue advances same round`,(await probe()).state.t>paused.state.t);
    // Hold a real pointer across focus loss; the next move after continuing must not form a swipe.
    await page.mouse.move(15,h/2);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    const blurred=await probe();await page.waitForTimeout(180);check(`${w}: blur freezes`,(await probe()).paused&&(await probe()).state.t===blurred.state.t);
    await page.mouse.up();await page.click('#resume');await page.waitForTimeout(ying?1850:100);
    if(!ying)check(`${w}: unfinished swipe cleared`,!(await probe()).gestureActive);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    const hidden=await probe();await page.waitForTimeout(160);check(`${w}: hidden freezes`,(await probe()).paused&&(await probe()).state.t===hidden.state.t);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(150);check(`${w}: returning waits for explicit continue`,(await probe()).paused&&(await probe()).state.t===hidden.state.t);
  }
  if(ying){
    await page.evaluate(k=>window[k].start(4,'duo').autopilot('precise').advance(100).render(),hook);await page.waitForTimeout(50);
    const end=await probe();check(`${w}: result copy matches return to title`,end.screen==='result'&&end.texts.some(t=>t.text==='点一下返回开场'));await shot('result');
    await page.mouse.click(w/2,h*.88);check(`${w}: genuine result click returns to title retaining duo`,(await probe()).screen==='title'&&(await probe()).mode==='duo');
    await page.mouse.click(w/2,h*.4);check(`${w}: title click starts another round`,(await probe()).screen==='play');
  }
  await context.close();
 }
 check('zero page and console errors',report.errors.length===0,report.errors);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 for(const c of report.checks)console.log(`${c.pass?'PASS':'FAIL'} ${c.name}`);
 if(report.checks.some(c=>!c.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
