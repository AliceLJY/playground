// Browser acceptance for 小黑煤球盖广州, run by hand (not part of CI). Needs a Playwright install; uses its bundled Chromium.
//   python3 -m http.server 8971 --bind 127.0.0.1            (inside coal-build/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [page-url]
// page-url defaults to http://127.0.0.1:8971/index.html; online it is https://aliceljy.github.io/playground/coal-build/
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails. Read the screenshots afterwards.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'check-out',base=process.argv[3]||'http://127.0.0.1:8971/index.html';
const page0=new URL(base),dir=page0.pathname.replace(/[^/]*$/,'');
const rel=u=>{const x=new URL(u);return x.origin===page0.origin&&x.pathname.startsWith(dir)?x.pathname.slice(dir.length):null;};
const ALLOWED=new Set(['','index.html','src/core.js','src/buildings.js','src/game.js','assets/qilou.webp','assets/chenjiaci.webp','assets/zhenhailou.webp']);
fs.mkdirSync(out,{recursive:true});
const SIZES={iphone:{viewport:{width:390,height:664},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  android:{viewport:{width:412,height:700},deviceScaleFactor:2.625,hasTouch:true,isMobile:true},
  desktop:{viewport:{width:1280,height:720},deviceScaleFactor:1}};
const report={base,checks:[],shots:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail).slice(0,300));};
const url=q=>base.replace(/[?#].*$/,'')+q;
const center=r=>[r.x+r.w/2,r.y+r.h/2];

(async()=>{
  const browser=await chromium.launch();report.browser=browser.version();
  async function open(query,size,keepStorage){
    const ctx=await browser.newContext(SIZES[size]),page=await ctx.newPage(),errors=[],stray=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(u.startsWith('data:'))return;const p=rel(u);if(p==null||!ALLOWED.has(p))stray.push(u);});
    await page.goto(url(query));
    await page.waitForFunction(()=>window.__coalbuild&&window.__coalbuild.ready&&window.__PLAYTEST__.ready,null,{polling:100,timeout:20000});
    return{ctx,page,errors,stray};
  }
  const probe=page=>page.evaluate(()=>window.__coalbuild.probe());
  const shot=async(page,name)=>{const f=path.join(out,name+'.png');await page.screenshot({path:f});report.shots.push(name);};
  const tap=async(page,size,r)=>{const p=await probe(page);const [x,y]=center(r);if(SIZES[size].hasTouch)await page.touchscreen.tap(x+p.ox,y);else await page.mouse.click(x+p.ox,y);await page.waitForTimeout(60);};

  // 1. fixed views on three screens
  const expect={'':p=>p.screen==='title',hero:p=>p.view==='hero'&&p.frozen&&p.stage===0&&p.laid>100,stage:p=>p.view==='stage'&&p.stage===1,
    done:p=>p.view==='done'&&p.phase==='done'&&p.done.length===1,album:p=>p.view==='album'&&p.phase==='album'&&p.done.length===3};
  for(const size of Object.keys(SIZES))for(const name of Object.keys(expect)){
    const {ctx,page,errors,stray}=await open(name?'?view='+name:'',size);await page.waitForTimeout(name==='done'?2200:900);
    const p=await probe(page);await shot(page,size+'-'+(name||'title'));
    check(`${size} ${name||'title'}: no page errors, nothing fetched outside its own files`,errors.length===0&&stray.length===0,{errors,stray});
    check(`${size} ${name||'title'}: the view reports the state it was asked for`,expect[name](p),{screen:p.screen,view:p.view,phase:p.phase,stage:p.stage,laid:p.laid});
    const vp=SIZES[size].viewport,L=p.layout;
    const rects=[...L.cards,L.skill,L.album,L.button];
    check(`${size} ${name||'title'}: every button inside the visible area`,rects.every(r=>r.x+p.ox>=0&&r.y>=0&&r.x+p.ox+r.w<=vp.width&&r.y+r.h<=vp.height),null);
    await ctx.close();
  }

  // 2. the first minute from the normal entry with real taps
  for(const size of ['iphone','android']){
    const {ctx,page,errors}=await open('',size);
    let p=await probe(page);await tap(page,size,p.layout.button);
    p=await probe(page);check(`${size}: 开工 starts the game`,p.screen==='play',{screen:p.screen});
    check(`${size}: first hint tells the player to tap the building`,p.hint.target==='building'&&/点楼/.test(p.hint.text),p.hint);
    await shot(page,size+'-first-0s');
    const R=p.layout.building,laid0=p.laid;
    for(let i=0;i<6;i++){await tap(page,size,{x:R.x+R.w*0.5,y:R.y+R.h*0.8,w:0,h:0});await page.waitForTimeout(120);}
    p=await probe(page);check(`${size}: tapping the building lays bricks right away`,p.laid-laid0>=6,{laid0,laid:p.laid});
    await shot(page,size+'-first-taps');
    await page.waitForFunction(()=>window.__coalbuild.probe().coins>=8,null,{polling:100,timeout:20000});
    p=await probe(page);check(`${size}: after five taps the hint moves to the 招煤球 card`,p.hint.target==='hire',p.hint);
    await shot(page,size+'-first-hire-hint');
    const balls0=p.balls;await tap(page,size,p.layout.cards[0]);p=await probe(page);
    check(`${size}: tapping 招煤球 hires one more coal ball`,p.balls===balls0+1,{balls0,balls:p.balls});
    // skill: wait for it in real time (it unlocks at 25 s), then tap it
    await page.evaluate(()=>window.__PLAYTEST__.step(Math.max(0,25500-window.__coalbuild.probe().t*1000)));
    p=await probe(page);check(`${size}: skill ready at 25 s and the hint says so`,p.skillReady,{t:p.t,hint:p.hint});
    await shot(page,size+'-skill-ready');
    const laidS=p.laid;await tap(page,size,p.layout.skill);p=await probe(page);
    check(`${size}: tapping the skill lays a burst of bricks`,p.laid-laidS>=30&&!p.skillReady,{laidS,laid:p.laid});
    // tea cart: arrives at 40 s
    await page.evaluate(()=>{while(!window.__coalbuild.probe().event&&window.__coalbuild.probe().t<60)window.__PLAYTEST__.step(250);});
    await page.waitForTimeout(400);p=await probe(page);
    check(`${size}: the tea cart arrives and the hint points at it`,p.event&&p.event.kind==='tea'&&p.hint.target==='event',{event:p.event,hint:p.hint});
    await shot(page,size+'-tea');
    const c0=p.coins;await tap(page,size,p.eventRect);p=await probe(page);
    check(`${size}: tapping the tea cart collects it`,!p.event&&p.coins>c0,{c0,coins:p.coins});
    check(`${size}: no page errors through the first minute`,errors.length===0,errors);
    await ctx.close();
  }

  // 3. autopilot builds the first building on a phone screen; screenshots along the way; then the next building opens with a real tap
  {
    const size='iphone',{ctx,page,errors}=await open('?seed=5',size);
    let p=await probe(page);await tap(page,size,p.layout.button);
    const marks=[30,60,90,120];let k=0,frames=[];
    while(true){
      p=await page.evaluate(()=>window.__coalbuild.autoplay('normal',10));
      await page.waitForTimeout(250);
      if(k<marks.length&&p.t>=marks[k]){await shot(page,size+'-auto-'+marks[k]+'s');k++;}
      if(p.phase!=='play')break;
      if(p.t>900)break;
    }
    frames.push((await probe(page)).frameMs);
    check(`autopilot finished 骑楼 on a phone screen`,p.phase==='done'&&p.done[0]==='qilou',{phase:p.phase,t:p.t,laid:p.laid});
    await page.waitForTimeout(2200);await shot(page,size+'-auto-done');
    p=await probe(page);await tap(page,size,p.layout.button);p=await probe(page);
    check(`tapping 收进图鉴，开下一栋 opens 陈家祠`,p.phase==='play'&&p.bi===1&&p.laid===0,{phase:p.phase,bi:p.bi});
    await page.evaluate(()=>window.__coalbuild.autoplay('normal',150));await page.waitForTimeout(900);await shot(page,size+'-chenjiaci-mid');
    p=await probe(page);
    // save survives a reload; the title offers 接着盖
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    await page.reload();await page.waitForFunction(()=>window.__coalbuild&&window.__coalbuild.ready,null,{polling:100,timeout:20000});
    const q=await probe(page);check(`progress is kept across a reload`,q.bi===1&&q.done.length===1&&Math.abs(q.laid-p.laid)<=p.total*0.2,{before:{bi:p.bi,laid:p.laid},after:{bi:q.bi,laid:q.laid}});
    await shot(page,size+'-reload-title');
    await tap(page,size,q.layout.button);
    await page.evaluate(()=>{const pr=()=>window.__coalbuild.probe();while(pr().phase==='play'&&pr().bi===1)window.__coalbuild.autoplay('normal',20);});
    await page.waitForTimeout(2200);p=await probe(page);await tap(page,size,p.layout.button);
    await page.evaluate(()=>window.__coalbuild.autoplay('normal',200));await page.waitForTimeout(900);await shot(page,size+'-zhenhailou-mid');
    p=await probe(page);check(`镇海楼 opens and builds`,p.bi===2&&p.laid>0,{bi:p.bi,laid:p.laid});
    check(`no page errors through three buildings`,errors.length===0,errors);
    await ctx.close();
  }

  // 4. frame cost while playing (desktop Chromium, default settings)
  {
    const {ctx,page}=await open('?seed=3','desktop');let p=await probe(page);await tap(page,'desktop',p.layout.button);
    await page.evaluate(()=>window.__coalbuild.autoplay('normal',150));await page.waitForTimeout(4000);p=await probe(page);
    check(`average draw time ≤ 6 ms during play`,p.frameMs>0&&p.frameMs<=6,{frameMs:+p.frameMs.toFixed(2),flights:p.flights});
    report.frameMs=p.frameMs;await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
  console.log(failed?`${failed} check(s) failed`:'all browser checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
