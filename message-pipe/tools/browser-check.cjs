// Browser acceptance for 一条消息的旅程, run by hand (not part of CI). Needs Playwright and Google Chrome on the machine.
//   python3 -m http.server 8942 --bind 127.0.0.1          (inside message-pipe/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [page-url]
// page-url defaults to the local server; for the live check pass https://aliceljy.github.io/playground/message-pipe/
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails. Read the screenshots afterwards.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'check-out',page0=process.argv[3]||'http://127.0.0.1:8942/index.html';
const base=page0.replace(/index\.html$/,''),origin=new URL(base).origin;
const url=q=>base+(q?'?'+q:'');
fs.mkdirSync(path.join(out,'opening'),{recursive:true});
const SIZES={phone:{viewport:{width:390,height:664},deviceScaleFactor:2,hasTouch:true,isMobile:true},
  small:{viewport:{width:320,height:568},deviceScaleFactor:2,hasTouch:true,isMobile:true},
  landscape:{viewport:{width:844,height:390},deviceScaleFactor:2,hasTouch:true,isMobile:true},
  desktop:{viewport:{width:1280,height:800},deviceScaleFactor:1}};
const report={page:page0,checks:[],runs:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail));};

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  async function open(q,size){
    const ctx=await browser.newContext(SIZES[size]),page=await ctx.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(!u.startsWith(origin)&&!u.startsWith('data:'))external.push(u.split('?')[0]);});
    await page.goto(url(q));
    await page.waitForFunction(()=>window.__pipe&&window.__pipe.ready&&window.__PLAYTEST__,null,{polling:100,timeout:20000});
    await page.waitForTimeout(250);
    return {ctx,page,errors,external};
  }
  const probe=p=>p.evaluate(()=>window.__pipe.probe());
  const visible=async(page,sel)=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return {ok:false};const r=e.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,hit=document.elementFromPoint(cx,cy);
    return {ok:r.width>=44&&r.height>=44&&r.left>=0&&r.top>=0&&r.right<=innerWidth+0.5&&r.bottom<=innerHeight+0.5&&!!hit&&(hit===e||e.contains(hit)),w:r.width,h:r.height,top:r.top,bottom:r.bottom};},sel);
  async function tapCell(page,size,idx){const p=await page.evaluate(i=>window.__pipe.cellCenter(i),idx);
    if(SIZES[size].hasTouch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);}

  // 1. the four fixed views on four screen shapes: state matches the request, board and button fit, nothing fetched off-site
  const WANT={start:{level:0,phase:'play'},emptybox:{level:2,fail:'emptybox'},ride:{level:4,phase:'ride'},clear:{level:1,phase:'cleared'}};
  for(const size of Object.keys(SIZES))for(const v of Object.keys(WANT)){
    const {ctx,page,errors,external}=await open('view='+v,size);
    const p=await probe(page);await page.screenshot({path:path.join(out,size+'-'+v+'.png')});
    const got=p.snap.view||{},w=WANT[v];
    check(`${size} ${v}: hook reports the requested state`,got.view===v&&got.level===w.level&&(!w.phase||got.phase===w.phase)&&(!w.fail||got.fail===w.fail),got);
    check(`${size} ${v}: no page errors, nothing fetched off-site`,errors.length===0&&external.length===0,{errors,external});
    const [cl,ct,cw,ch]=p.geo.canvas,lv=[4,5,7,7,7][w.level],cols=w.level===0?4:5;
    const gridOk=p.geo.ox>=0&&p.geo.oy>=0&&p.geo.ox+p.geo.ts*cols<=cw+0.5&&p.geo.oy+p.geo.ts*(w.level===0?5:w.level===1?6:7)<=ch+0.5&&cl>=0&&ct>=0&&cl+cw<=p.viewport[0]+0.5&&ct+ch<=p.viewport[1]+0.5;
    check(`${size} ${v}: the whole board is inside the screen`,gridOk,p.geo);
    if(size!=='desktop')check(`${size} ${v}: tiles at least 44 CSS px`,p.geo.ts>=44,p.geo.ts);
    if(v!=='clear'){const g=await visible(page,'#go');check(`${size} ${v}: 发车 button whole, ≥44 px and hit at its centre`,g.ok,g);}
    else{const g=await visible(page,'#c-go');check(`${size} clear: 下一关 button whole and hittable`,g.ok,g);}
    report.runs.push({size,v,probe:p,errors,external});
    await ctx.close();
  }

  // 2. default entry with real taps: title → intro → solve level 1 by tapping → 发车 → cleared card
  for(const size of ['phone','desktop']){
    const {ctx,page,errors,external}=await open('',size);
    const s0=await page.evaluate(()=>window.__pipe.snapshot());
    check(size+' default entry opens on the title card',s0.card==='title',s0.card);
    await page.screenshot({path:path.join(out,size+'-title.png')});
    await page.click('#c-go');await page.waitForTimeout(150);
    check(size+' 开始 shows the level intro',(await page.evaluate(()=>window.__pipe.snapshot().card))==='intro');
    await page.click('#c-go');await page.waitForTimeout(150);
    const taps=await page.evaluate(()=>window.__pipe.solution());
    // response: the tap is in the state before the next frame
    const before=(await page.evaluate(()=>window.__pipe.snapshot())).steps;
    await tapCell(page,size,taps[0]);
    const lag=await page.evaluate(()=>new Promise(r=>{const t=performance.now();requestAnimationFrame(()=>r(performance.now()-t));}));
    const after=(await page.evaluate(()=>window.__pipe.snapshot())).steps;
    check(size+' a real tap turns the pipe at once (spec 6: under 100 ms)',after===before+1&&lag<100,{before,after,lag});
    for(const i of taps.slice(1)){await tapCell(page,size,i);await page.waitForTimeout(60);}
    const s1=await page.evaluate(()=>window.__pipe.snapshot());
    check(size+' tapping the solution connects the route',s1.outcome==='delivered'&&s1.steps===taps.length,s1);
    await page.screenshot({path:path.join(out,size+'-connected.png')});
    await page.click('#go');
    await page.waitForFunction(()=>window.__pipe.snapshot().card==='cleared',null,{polling:100,timeout:15000}).catch(()=>{});
    const s2=await page.evaluate(()=>window.__pipe.snapshot());
    check(size+' 发车 delivers and shows the lesson card',s2.phase==='cleared'&&s2.card==='cleared',s2);
    await page.screenshot({path:path.join(out,size+'-cleared.png')});
    const p=await probe(page);
    check(size+' draw time (spec 6: mean ≤ 4 ms, worst ≤ 16 ms)',p.drawMean<=4&&p.drawMax<=16,{mean:+p.drawMean.toFixed(2),max:+p.drawMax.toFixed(2)});
    check(size+' no page errors, nothing fetched off-site',errors.length===0&&external.length===0,{errors,external});
    await ctx.close();
  }

  // 3. level 3 with real taps: build the shortcut that skips 验货, send the cat, it comes back with an empty box
  {
    const {ctx,page,errors}=await open('',"phone");
    await page.evaluate(()=>window.__pipe.start(2,3));
    for(const i of await page.evaluate(()=>window.__pipe.bypass())){await tapCell(page,'phone',i);await page.waitForTimeout(40);}
    await page.click('#go');
    await page.waitForFunction(()=>{const s=window.__pipe.snapshot();return s.fail&&s.fail.kind;},null,{polling:50,timeout:15000}).catch(()=>{});
    const s=await page.evaluate(()=>window.__pipe.snapshot());
    check('phone level 3 shortcut ends in the empty box and lights 验货',s.fail&&s.fail.kind==='emptybox'&&s.fail.station===4,s.fail);
    const chip=await page.evaluate(()=>{const c=document.querySelector('.chip.alert');return c&&c.textContent;});
    check('phone the 验货 chip turns red, the note is on screen',chip&&chip.includes('验货')&&(await page.textContent('#msg')).includes('空箱子'),chip);
    await page.screenshot({path:path.join(out,'phone-emptybox-real.png')});
    check('phone level 3: no page errors',errors.length===0,errors);
    await ctx.close();
  }

  // 4. pause on hide: clock stops, nothing moves; 继续 resumes; timeout card retries cleanly
  {
    const {ctx,page,errors}=await open('','phone');
    await page.evaluate(()=>window.__pipe.start(1,5));await page.waitForTimeout(400);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
    const a=await page.evaluate(()=>window.__pipe.snapshot());await page.waitForTimeout(1200);const b=await page.evaluate(()=>window.__pipe.snapshot());
    check('phone hiding the page pauses the clock',a.paused&&a.card==='pause'&&a.timeLeft===b.timeLeft,{a:a.timeLeft,b:b.timeLeft});
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});});
    await page.click('#c-go');await page.waitForTimeout(600);const c=await page.evaluate(()=>window.__pipe.snapshot());
    check('phone 继续 resumes the clock',!c.paused&&c.card===null&&c.timeLeft<b.timeLeft,{c:c.timeLeft});
    await page.evaluate(()=>window.__pipe.advance(70));await page.waitForTimeout(300);
    const d=await page.evaluate(()=>window.__pipe.snapshot());const g=await visible(page,'#c-go');
    check('phone running out of time shows the timeout card with a whole retry button',d.phase==='timeout'&&d.card==='timeout'&&g.ok,{phase:d.phase,card:d.card,g});
    await page.screenshot({path:path.join(out,'phone-timeout.png')});
    await page.click('#c-go');await page.waitForTimeout(200);const e=await page.evaluate(()=>window.__pipe.snapshot());
    check('phone 再来一次 starts clean',e.phase==='play'&&e.steps===0&&e.rides===0&&e.timeLeft>59&&e.card===null,e);
    check('phone pause/timeout: no page errors',errors.length===0,errors);
    await ctx.close();
  }

  // 5. the first 30 seconds from the normal entry, real taps at a human pace, one frame a second (AGENTS 3)
  {
    const {ctx,page,errors}=await open('','phone');
    await page.click('#c-go');await page.waitForTimeout(800);await page.click('#c-go');
    const taps=await page.evaluate(()=>window.__pipe.solution());const t0=Date.now();let k=0,frame=0,sent=false;
    while(Date.now()-t0<30000){
      const el=Date.now()-t0;
      if(el>frame*1000){await page.screenshot({path:path.join(out,'opening',String(frame).padStart(2,'0')+'.png')});frame++;}
      if(el>2500+k*1600&&k<taps.length){await tapCell(page,'phone',taps[k]);k++;}
      else if(k>=taps.length&&!sent&&el>2500+k*1600){await page.click('#go');sent=true;}
      await page.waitForTimeout(80);
      if((await page.evaluate(()=>window.__pipe.snapshot().card))==='cleared'){await page.screenshot({path:path.join(out,'opening','cleared.png')});break;}
    }
    const s=await page.evaluate(()=>window.__pipe.snapshot());
    check('phone first 30 s of real play clears level 1',s.phase==='cleared',{phase:s.phase,frames:frame,taps:k});
    check('phone opening: no page errors',errors.length===0,errors);
    await ctx.close();
  }

  await browser.close();
  report.failed=failed;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
  console.log(failed?failed+' check(s) failed':'all checks passed');process.exit(failed?1:0);
})();
