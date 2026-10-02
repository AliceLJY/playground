// Browser acceptance for 灯影守夜, run by hand (not part of CI or the build).
// Needs an existing Playwright install and Google Chrome; this repository does not install either.
//   python3 -m http.server 8917 --bind 127.0.0.1          (inside shadow-gong/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [base-url] [--full]
// Writes screenshots and report.json into <output-dir>. --full also plays a whole match in real time (about 3 minutes).
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2),full=args.includes('--full'),pos=args.filter(a=>!a.startsWith('--'));
const out=pos[0]||'browser-check',base=pos[1]||'http://127.0.0.1:8917/index.html',origin=new URL(base).origin;
fs.mkdirSync(out,{recursive:true});
const shot=name=>path.join(out,name+'.png');

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const report={base,browser:browser.version(),runs:[]};
  async function open(query,options={}){
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,...options});
    const page=await ctx.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(!u.startsWith(origin)&&!u.startsWith('data:'))external.push(u);});
    await page.goto(base+query);
    await page.waitForFunction(()=>window.__duel&&window.__duel.ready,null,{polling:100,timeout:20000});
    return{ctx,page,errors,external};
  }
  const read=page=>page.evaluate(()=>({metrics:window.__duel.metrics,probe:window.__duel.probe()}));

  // 1. fixed camera views (adaptive resolution locked, nothing else changed)
  for(const [name,query] of [['view-hero','?view=hero'],['view-hero-plain','?view=hero&plain=1'],['view-wide','?view=wide'],['view-stress','?view=stress']]){
    const {ctx,page,errors,external}=await open(query);await page.waitForTimeout(1300);
    const r=await read(page);await page.screenshot({path:shot(name)});
    report.runs.push({name,query,viewport:'1280x720',...r,errors,external});await ctx.close();
  }

  // 2. player default: no URL parameters, device pixel ratio 2, adaptive resolution on, real key presses
  {
    const {ctx,page,errors,external}=await open('',{deviceScaleFactor:2});
    await page.screenshot({path:shot('default-menu')});
    await page.click('#start');
    await page.evaluate(()=>window.__duel.freezeOn('parry',90,ev=>ev.perfect));
    let last=0,frozen=false;const t0=Date.now();
    while(Date.now()-t0<45000&&!frozen){
      const eta=await page.evaluate(()=>{const s=window.__duel.state;let best=null;
        for(const e of s.enemies){if(e.state!=='attack')continue;e.move.strikes.forEach((st,k)=>{if(e.tel[k]&&!e.done[k]){const t=(st.hit-e.clock)/e.rate;if(best===null||t<best)best=t;}});}return best;});
      if(eta!==null&&eta<.11&&Date.now()-last>500){await page.keyboard.down('k');last=Date.now();setTimeout(()=>page.keyboard.up('k').catch(()=>{}),180);}
      frozen=await page.evaluate(()=>window.__duel.frozen);
    }
    const r=await read(page),stats=await page.evaluate(()=>window.__duel.state.stats);
    await page.screenshot({path:shot('default-perfect-parry')});
    await page.evaluate(()=>{window.__duel.unfreeze();window.__duel.freezeOn('telegraph',120);});
    for(let i=0;i<200&&!(await page.evaluate(()=>window.__duel.frozen));i++)await page.waitForTimeout(100);
    await page.screenshot({path:shot('default-telegraph')});
    // mouse: right button guards, left button swings
    await page.evaluate(()=>window.__duel.unfreeze());
    await page.mouse.move(640,300);await page.mouse.down({button:'right'});await page.waitForTimeout(150);
    const guardByMouse=await page.evaluate(()=>window.__duel.state.player.state);
    await page.mouse.up({button:'right'});await page.waitForTimeout(400);
    await page.mouse.down({button:'left'});await page.waitForTimeout(60);
    const swingByMouse=await page.evaluate(()=>window.__duel.state.player.state);await page.mouse.up({button:'left'});
    report.runs.push({name:'default',viewport:'1280x720',keyboardPerfectParry:frozen,stats,guardByMouse,swingByMouse,...r,errors,external});
    await ctx.close();
  }

  // 3. touch on a phone-sized screen, landscape and portrait
  for(const [name,width,height] of [['touch-landscape',852,393],['touch-portrait',390,844]]){
    const {ctx,page,errors,external}=await open('',{viewport:{width,height},deviceScaleFactor:3,hasTouch:true,isMobile:true});
    await page.tap('#start');await page.waitForTimeout(3200);
    const cdp=await ctx.newCDPSession(page),tap=async(key,ms)=>{const b=await page.locator(`#touch button[data-key="${key}"]`).boundingBox();
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await page.waitForTimeout(ms);};
    const release=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await tap('block',120);const guardByTouch=await page.evaluate(()=>window.__duel.state.player.state);await release();await page.waitForTimeout(300);
    const x0=await page.evaluate(()=>window.__duel.state.player.x);await tap('right',500);await release();
    const walked=await page.evaluate(()=>window.__duel.state.player.x)-x0;
    const overflow=await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight}));
    const orientationTip=await page.locator('#orientation').isVisible();
    await page.screenshot({path:shot(name)});
    report.runs.push({name,viewport:`${width}x${height}`,guardByTouch,walked,overflow,orientationTip,metrics:await page.evaluate(()=>window.__duel.metrics),errors,external});
    await ctx.close();
  }

  // 4. optional: a whole match in real time with the in-page shaky autopilot, then a loss with no input
  if(full){
    const {ctx,page,errors,external}=await open('',{deviceScaleFactor:2});
    await page.click('#start');await page.evaluate(()=>window.__duel.autopilot(true,{human:true}));
    const t0=Date.now();let phase='',fps=[],pr=new Set();
    while(Date.now()-t0<420000){const s=await page.evaluate(()=>({phase:window.__duel.state.phase,m:window.__duel.metrics}));phase=s.phase;if(s.m.fps)fps.push(s.m.fps);pr.add(s.m.pixelRatio);if(phase==='won'||phase==='lost')break;await page.waitForTimeout(1000);}
    await page.waitForTimeout(2200);
    const seconds=(Date.now()-t0)/1000,title=await page.textContent('#result-title'),stats=await page.textContent('#result-stats');
    await page.screenshot({path:shot('full-result')});
    await page.click('#again');await page.evaluate(()=>window.__duel.autopilot(false));
    for(let i=0;i<240&&(await page.evaluate(()=>window.__duel.state.phase))!=='lost';i++)await page.waitForTimeout(1000);
    await page.waitForTimeout(2000);
    const lost=await page.textContent('#result-title'),retry=await page.textContent('#again');
    fps.sort((a,b)=>a-b);
    report.runs.push({name:'full-match',phase,seconds,title,stats,lost,retry,fpsMin:fps[0],fpsMedian:fps[fps.length>>1],pixelRatios:[...pr],errors,external});
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
  console.log(JSON.stringify(report,null,1));
})().catch(e=>{console.error(e);process.exit(1);});
