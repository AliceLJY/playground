// Browser acceptance for 推到以后, run by hand (not part of CI). Needs a Playwright install; uses its bundled Chromium.
//   python3 -m http.server 8963 --bind 127.0.0.1            (inside later-whack/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [page-url]
// page-url defaults to http://127.0.0.1:8963/index.html; online it is https://aliceljy.github.io/playground/later-whack/
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'check-out',base=process.argv[3]||'http://127.0.0.1:8963/index.html';
const page0=new URL(base),dir=page0.pathname.replace(/[^/]*$/,'');   // the page's own folder: '/' locally, '/playground/later-whack/' online
const rel=u=>{const x=new URL(u);return x.origin===page0.origin&&x.pathname.startsWith(dir)?x.pathname.slice(dir.length):null;};
const ALLOWED=new Set(['','index.html','src/core.js','src/game.js']);
fs.mkdirSync(out,{recursive:true});
const SIZES={iphone:{viewport:{width:390,height:664},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  android:{viewport:{width:412,height:700},deviceScaleFactor:2.625,hasTouch:true,isMobile:true},
  desktop:{viewport:{width:1280,height:720},deviceScaleFactor:1}};
const report={base,checks:[],runs:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail));};
const url=q=>base.replace(/[?#].*$/,'')+q;

(async()=>{
  const browser=await chromium.launch();report.browser=browser.version();
  async function open(query,size){
    const ctx=await browser.newContext(SIZES[size]),page=await ctx.newPage(),errors=[],stray=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(u.startsWith('data:'))return;const p=rel(u);if(p==null||!ALLOWED.has(p))stray.push(u);});
    await page.goto(url(query));
    await page.waitForFunction(()=>window.__later&&window.__later.ready&&window.__PLAYTEST__.ready,null,{polling:100,timeout:20000});
    return{ctx,page,errors,stray};
  }
  const probe=page=>page.evaluate(()=>window.__later.probe());

  // 1. title and the four fixed views on three screens
  const expect={title:p=>p.screen==='title',hero:p=>p.view==='hero'&&p.frozen&&new Set(p.state.ents.filter(e=>e.state==='up').map(e=>e.kind)).size===3,
    stress:p=>p.view==='stress'&&p.frozen&&p.state.up>=5,over:p=>p.view==='over'&&p.screen==='result'&&p.state.result.reason==='pile',
    win:p=>p.view==='win'&&p.screen==='result'&&p.state.result.reason==='time'};
  for(const size of Object.keys(SIZES))for(const name of Object.keys(expect)){
    const {ctx,page,errors,stray}=await open(name==='title'?'':'?view='+name,size);await page.waitForTimeout(400);
    const p=await probe(page);await page.screenshot({path:path.join(out,size+'-'+name+'.png')});
    report.runs.push({size,name,probe:{...p,state:p.state&&{...p.state,ents:p.state.ents.length}},errors,stray});
    check(`${size} ${name}: no page errors, nothing fetched outside its own files`,errors.length===0&&stray.length===0,{errors,stray});
    check(`${size} ${name}: the view reports the state it was asked for`,expect[name](p),{screen:p.screen,view:p.view,up:p.state&&p.state.up});
    const fit=Math.abs(150*p.frame.scale-p.css[0])<1.5||Math.abs(266*p.frame.scale-p.css[1])<1.5;
    check(`${size} ${name}: frame fills one screen axis exactly`,fit,p.frame);
    if(name==='title'||name==='over'||name==='win'){
      const sel=name==='title'?'#start':'#retry';
      const box=await page.locator(sel).boundingBox(),vp=SIZES[size].viewport;
      const inside=box&&box.x>=0&&box.y>=0&&box.x+box.width<=vp.width&&box.y+box.height<=vp.height&&box.height>=44;
      const hitsIt=box&&await page.evaluate(([x,y,s])=>document.elementFromPoint(x,y)===document.querySelector(s),[box.x+box.width/2,box.y+box.height/2,sel]);
      check(`${size} ${name}: ${sel} button fully inside the visible area and on top`,inside&&hitsIt,box);
    }
    await ctx.close();
  }

  // 2. real taps from the normal entry: start button, a tail, a 等她, an observer; then frame cost under autopilot
  for(const size of ['iphone','desktop']){
    const {ctx,page,errors}=await open('',size),touch=!!SIZES[size].hasTouch;
    const tapAt=async(x,y)=>{if(touch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);};
    const b=await page.locator('#start').boundingBox();await tapAt(b.x+b.width/2,b.y+b.height/2);
    check(`${size} default: the start button starts a round`,(await probe(page)).screen==='play');
    // opening seconds, recorded as stills while playing for real
    const shots=[];
    const firstSeen=new Map();   // tap only things that came up recently, so they cannot start leaving between the probe and the tap
    const tapKind=async kind=>{const until=Date.now()+40000;while(Date.now()<until){const p=await probe(page);for(const q of p.state.ents)if(q.state==='up'&&!firstSeen.has(q.id))firstSeen.set(q.id,p.state.t);
      const e=p.state.ents.find(q=>q.kind===kind&&q.state==='up'&&p.state.t-firstSeen.get(q.id)<(kind==='tail'?0.4:1.2));
      if(p.screen!=='play'){report.runs.push({size,name:'round-ended-while-looking-for-'+kind,state:{t:p.state.t,pile:p.state.pile}});return null;}
      if(e&&p.state.t<p.state.lockUntil){await page.waitForTimeout(40);continue;}
      if(e){const before=p.state;await tapAt(e.tapX,e.tapY);await page.waitForTimeout(30);return{before,after:(await probe(page)).state,e};}
      const tail=kind!=='tail'&&p.state.ents.find(q=>q.kind==='tail'&&q.state==='up');   // keep fixing tails for real so the round lasts
      if(tail){await tapAt(tail.tapX,tail.tapY);await page.waitForTimeout(260);continue;}
      await page.waitForTimeout(40);}return null;};
    const t1=await tapKind('tail');
    await page.screenshot({path:path.join(out,size+'-open-first-hit.png')});shots.push('open-first-hit');
    check(`${size} default: a real tap on a tail knocks it down and scores`,t1&&t1.after.stats.fixed===t1.before.stats.fixed+1&&t1.after.score>t1.before.score,t1&&{before:t1.before.score,after:t1.after.score});
    for(const sec of [3,6]){await page.waitForFunction(t=>window.__later.probe().state.t>=t,sec,{polling:50});await page.screenshot({path:path.join(out,size+'-open-'+sec+'s.png')});}
    const tw=await tapKind('wait');
    if(tw)check(`${size} default: a real tap on 等她 costs points and the combo`,tw.after.stats.wrong===tw.before.stats.wrong+1&&tw.after.combo===0,{before:tw.before.score,after:tw.after.score});
    const to=await tapKind('observer');
    if(to){await page.screenshot({path:path.join(out,size+'-bounce.png')});check(`${size} default: a real tap on an observer bounces, score unchanged`,to.after.stats.bounced===to.before.stats.bounced+1&&to.after.score===to.before.score,{before:to.before.score,after:to.after.score,stats:to.after.stats,lockUntil:to.before.lockUntil,t:to.before.t});}
    report.runs.push({size,name:'real-taps',sawWait:!!tw,sawObserver:!!to,shots});
    check(`${size} default: 等她 or an observer showed up within the round to be tapped`,!!(tw||to),{tw:!!tw,to:!!to});
    await page.evaluate(()=>{window.__later.start(11);window.__later.autopilot('human');});
    const m0=await page.evaluate(()=>({...window.__later.metrics}));await page.waitForTimeout(8000);
    const m=await page.evaluate(()=>({...window.__later.metrics}));await page.screenshot({path:path.join(out,size+'-autopilot.png')});
    const frames=m.frames-m0.frames,avg=(m.sumMs-m0.sumMs)/Math.max(1,frames);
    report.runs.push({size,name:'frame-cost',frames,avgMs:+avg.toFixed(3),maxMs:m.maxMs});
    check(`${size} default: draw cost within budget (avg <= 6 ms, max <= 16 ms)`,avg<=6&&m.maxMs<=16,{frames,avg:+avg.toFixed(3),max:+m.maxMs.toFixed(2)});
    check(`${size} default: no page errors while playing`,errors.length===0,errors);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
  console.log(failed?failed+' check(s) failed':'all checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
