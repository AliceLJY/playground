// Browser acceptance for 上下文蛇 (SPEC 7.11 and 7.12), run by hand, not part of CI.
// Needs an existing Playwright install; this repository installs none.
//   python3 -m http.server 8977 --bind 127.0.0.1          (inside context-snake/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [base-url]
// base-url is the page itself, e.g. http://127.0.0.1:8977/ or https://aliceljy.github.io/playground/context-snake/
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'check-out',base=process.argv[3]||'http://127.0.0.1:8977/';
const origin=new URL(base).origin;
fs.mkdirSync(out,{recursive:true});
const PHONE={deviceScaleFactor:3,hasTouch:true,isMobile:true};
const SIZES={
  'p390x664':{viewport:{width:390,height:664},...PHONE},     // iPhone with Safari bars
  'p320x568':{viewport:{width:320,height:568},...PHONE},     // small phone
  'p412x700':{viewport:{width:412,height:700},...PHONE},     // Android Chrome with bars
  'l844x390':{viewport:{width:844,height:390},...PHONE},     // phone turned sideways
  'd1280x720':{viewport:{width:1280,height:720},deviceScaleFactor:1}
};
const report={base,checks:[],runs:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail));};

(async()=>{
  const browser=await chromium.launch();report.browser=browser.version();
  async function open(query,size){
    const ctx=await browser.newContext(SIZES[size]),page=await ctx.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(!u.startsWith(origin)&&!u.startsWith('data:'))external.push(u);});
    await page.goto(base+query);
    await page.waitForFunction(()=>window.__snake&&window.__snake.ready,null,{polling:100,timeout:20000});
    return{ctx,page,errors,external};
  }
  const probe=page=>page.evaluate(()=>window.__snake.probe());
  // a button counts only if it is at least 44 px, fully on screen and its centre hits the button itself
  async function buttonOk(page,sel){
    return page.evaluate(sel=>{const b=document.querySelector(sel);if(!b||b.hidden)return{sel,ok:false,why:'missing'};
      const r=b.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2,hit=document.elementFromPoint(cx,cy);
      const inside=r.x>=0&&r.y>=0&&r.right<=innerWidth+0.5&&r.bottom<=innerHeight+0.5;
      const ok=r.width>=44&&r.height>=44&&inside&&(hit===b||b.contains(hit));
      return{sel,ok,w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)};},sel);
  }
  const overlap=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;

  for(const size of Object.keys(SIZES)){
    // 1. title page
    {const {ctx,page,errors,external}=await open('',size);await page.waitForTimeout(300);
      await page.screenshot({path:path.join(out,size+'-title.png')});
      const btns=[await buttonOk(page,'#start-btn'),await buttonOk(page,'#mute-btn')];
      check(size+' title: start and sound buttons usable',btns.every(b=>b.ok),btns);
      // 2. start with a real click, then check the board and the controls
      await page.click('#start-btn');await page.waitForTimeout(150);
      const p=await probe(page),f=p.layout.field,pad=p.layout.pad;
      check(size+' play: board fully on screen',f.x>=0&&f.y>=0&&f.x+f.w<=p.css[0]&&f.y+f.h<=p.css[1],f);
      check(size+' play: board clear of the control area',!overlap({x:f.x-4,y:f.y-4,w:f.w+8,h:f.h+8},pad),{f,pad});
      check(size+' play: board below the score bar',f.y-4>=p.layout.hud-2,{y:f.y,hud:p.layout.hud});
      check(size+' play: cell at least 14 px',p.layout.cell>=14,p.layout.cell);
      const pb=[];for(const s of ['#dpad .u','#dpad .d','#dpad .l','#dpad .r','#btn-compress','#btn-dispatch','#pause-btn'])pb.push(await buttonOk(page,s));
      check(size+' play: arrows, skills and pause usable',pb.every(b=>b.ok),pb.filter(b=>!b.ok).length?pb:pb.length);
      // a real key press turns
      await page.evaluate(()=>window.__snake.start(4));
      await page.keyboard.press('ArrowLeft');await page.waitForTimeout(500);
      check(size+' real key: ArrowLeft turns the snake left',(await probe(page)).state.dir===3,(await probe(page)).state.dir);
      // a real on-screen arrow
      if(SIZES[size].hasTouch){const r=pb[2];await page.touchscreen.tap(r.x+r.w/2+12,r.y+r.h/2);}else await page.click('#dpad .u');
      await page.evaluate(()=>window.__snake.start(4));
      const bb=await page.evaluate(()=>{const r=document.querySelector('#dpad .r').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
      if(SIZES[size].hasTouch)await page.touchscreen.tap(bb.x,bb.y);else await page.mouse.click(bb.x,bb.y);
      await page.waitForTimeout(500);
      check(size+' real button: the right arrow turns the snake right',(await probe(page)).state.dir===1,(await probe(page)).state.dir);
      // a real drag on the board
      await page.evaluate(()=>window.__snake.start(4));
      const sx=f.x+f.w*0.5,sy=f.y+f.h*0.4;
      await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx+40,sy+2,{steps:4});await page.mouse.up();
      await page.waitForTimeout(500);
      check(size+' real swipe: dragging right turns the snake right',(await probe(page)).state.dir===1,(await probe(page)).state.dir);
      await page.evaluate(()=>window.__snake.start(3).autopilot('precise'));await page.waitForTimeout(2500);
      await page.screenshot({path:path.join(out,size+'-default-play.png')});
      check(size+' default entry: no page errors, nothing fetched off-site',errors.length===0&&external.length===0,{errors,external});
      report.runs.push({size,name:'default',probe:await probe(page)});
      await ctx.close();}
    // 3. the four fixed views must really reach their declared state
    for(const [name,want] of [['hero',p=>p.screen==='play'&&p.state.t>=22&&p.state.subs.length>=2],
      ['long',p=>p.screen==='play'&&p.state.len>=17&&p.state.queue>0&&p.state.delay>=1],
      ['burst',p=>p.screen==='play'&&p.state.stats.bursts>0],
      ['end',p=>p.screen==='result'&&p.state.result&&p.state.result.reason==='pollution']]){
      const {ctx,page,errors,external}=await open('?view='+name,size);await page.waitForTimeout(300);
      const p=await probe(page);await page.screenshot({path:path.join(out,size+'-'+name+'.png')});
      report.runs.push({size,name,probe:{screen:p.screen,state:p.state&&{t:p.state.t,len:p.state.len,delay:p.state.delay,queue:p.state.queue,subs:p.state.subs.length,stats:p.state.stats,result:p.state.result}}});
      check(size+' view '+name+': reached its declared state',want(p),p.state&&{t:p.state.t,len:p.state.len,queue:p.state.queue,subs:p.state.subs.length,bursts:p.state.stats.bursts,screen:p.screen});
      check(size+' view '+name+': no page errors, nothing fetched off-site',errors.length===0&&external.length===0,{errors,external});
      if(name==='end'){const bs=[await buttonOk(page,'#again-btn'),await buttonOk(page,'#home-btn')];check(size+' end: result buttons usable',bs.every(b=>b.ok),bs);
        // the story box must end above the buttons
        const gap=await page.evaluate(()=>document.querySelector('#result-sheet').getBoundingClientRect().y);
        check(size+' end: result text ends above the buttons',p.resultBottom==null||p.resultBottom<=gap,{resultBottom:p.resultBottom,buttonsTop:gap});}
      await ctx.close();
    }
  }
  // 4. draw cost on the default entry, phone and desktop
  for(const size of ['p390x664','d1280x720']){
    const {ctx,page,errors}=await open('',size);await page.click('#start-btn');
    await page.evaluate(()=>window.__snake.start(3).autopilot('precise'));await page.waitForTimeout(8000);
    const m=await page.evaluate(()=>window.__snake.metrics);
    check(size+' draw cost within budget (avg <= 4 ms, max <= 16 ms)',m.avgFrameMs<=4&&m.maxFrameMs<=16,m);
    check(size+' no page errors while playing',errors.length===0,errors);
    report.runs.push({size,name:'perf',metrics:m});await ctx.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();console.log(failed?failed+' check(s) failed':'all checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
