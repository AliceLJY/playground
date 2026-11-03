// Browser acceptance for 凭证扫雷, run by hand (not part of CI). Needs an existing Playwright install with Chromium.
//   python3 -m http.server 8941 --bind 127.0.0.1          (in the repository root)
//   NODE_PATH="$(npm root -g)" node secret-sweeper/tools/browser-check.cjs <out-dir> [page-url]
// page-url defaults to http://127.0.0.1:8941/secret-sweeper/index.html; pass the live URL to re-check after publishing.
// Writes screenshots and report.json into <out-dir>; exits 1 when any check fails. Read every screenshot afterwards.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'check-out',url=process.argv[3]||'http://127.0.0.1:8941/secret-sweeper/index.html';
const origin=new URL(url).origin;
fs.mkdirSync(out,{recursive:true});
const VIEWS={phone:{viewport:{width:390,height:664},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  small:{viewport:{width:320,height:568},deviceScaleFactor:2,hasTouch:true,isMobile:true},
  landscape:{viewport:{width:844,height:340},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  desktop:{viewport:{width:1365,height:900},deviceScaleFactor:1}};
const report={url,checks:[],runs:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail).slice(0,300));};

(async()=>{
  const browser=await chromium.launch();report.browser=browser.version();
  async function open(q,v){
    const ctx=await browser.newContext(VIEWS[v]),page=await ctx.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(!u.startsWith(origin)&&!u.startsWith('data:'))external.push(u);});
    await page.goto(url+q);
    await page.waitForFunction(()=>window.__sweeper&&window.__sweeper.ready&&window.__PLAYTEST__&&window.__PLAYTEST__.ready,null,{polling:100,timeout:20000});
    return{ctx,page,errors,external};
  }
  const probe=p=>p.evaluate(()=>window.__sweeper.probe());
  const center=(p,i)=>p.evaluate(i=>window.__sweeper.center(i),i);
  // a button is usable when it is at least 44 px, fully on screen and the element under its centre is the button itself
  const usable=(p,sel)=>p.evaluate(sel=>{const e=document.querySelector(sel);if(!e||e.hidden||e.offsetParent===null&&getComputedStyle(e).position!=='fixed')return{ok:false,why:'hidden'};const r=e.getBoundingClientRect();
    const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return{ok:r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.right<=innerWidth+0.5&&r.bottom<=innerHeight+0.5&&!!hit&&(hit===e||e.contains(hit)),r:[r.x|0,r.y|0,r.width|0,r.height|0],hit:hit&&hit.id};},sel);

  // 1. fixed views on four screen shapes: the hook must report the state it was asked for
  const want={hero:{status:'play',level:'normal',seed:3},boom:{status:'lost',level:'normal',seed:5,card:true},win:{status:'won',level:'easy',seed:3,card:true},stress:{status:'play',level:'hard',seed:7}};
  for(const v of Object.keys(VIEWS)){
    {const {ctx,page,errors,external}=await open('',v);await page.waitForTimeout(300);await page.screenshot({path:path.join(out,v+'-title.png')});
      for(const b of ['[data-level=easy]','[data-level=normal]','[data-level=hard]']){const u=await usable(page,b);check(`${v} title: ${b} usable`,u.ok,u);}
      check(`${v} title: no errors, nothing fetched off-site`,!errors.length&&!external.length,{errors,external});await ctx.close();}
    for(const [name,w] of Object.entries(want)){
      const {ctx,page,errors,external}=await open('?view='+name,v);await page.waitForTimeout(250);
      const p=await probe(page);await page.screenshot({path:path.join(out,v+'-'+name+'.png')});report.runs.push({v,name,probe:{...p,state:p.state&&{...p.state,open:undefined,flag:undefined,mine:undefined,n:undefined}}});
      check(`${v} ${name}: hook reports the requested state`,p.state&&p.state.status===w.status&&p.level===w.level&&p.seed===w.seed&&(!w.card||p.card),{status:p.state&&p.state.status,level:p.level,seed:p.seed,card:p.card});
      check(`${v} ${name}: no errors, nothing fetched off-site`,!errors.length&&!external.length,{errors,external});
      for(const b of ['#mode','#restart','#menu']){const u=await usable(page,b);check(`${v} ${name}: ${b} usable`,u.ok,u);}
      if(w.card){for(const b of ['#again','#levels-btn','#close']){const u=await usable(page,b);check(`${v} ${name}: card ${b} usable`,u.ok||b==='#close'&&u.r&&u.r[2]>=40,u);}
        if(name==='boom'){const t=p.cardText;check(`${v} boom: card tells a story and the never-back line`,/真事一则/.test(t)&&/写进记录就收不回来了/.test(t),t);}
        if(name==='win')check(`${v} win: card says look before acting`,/先看线索再动手/.test(p.cardText),p.cardText);}
      await ctx.close();
    }
  }

  // 2. real input on the phone: tap opens, long press flags, flag mode turns a tap into a flag, restart works with the card up
  {const {ctx,page,errors}=await open('','phone');
    await page.locator('[data-level=normal]').tap();
    let p=await probe(page);check('phone: level button starts a game',p.screen==='play'&&p.state.status==='ready',p.screen);
    const mid=5*8+4;const c=await center(page,mid);await page.screenshot({path:path.join(out,'first-00-ready.png')});
    const t0=Date.now();await page.touchscreen.tap(c.x,c.y);
    await page.waitForFunction(()=>window.__sweeper.probe().state.opened>0,null,{polling:16,timeout:2000});const lag=Date.now()-t0;
    p=await probe(page);check('phone: a real tap opens the first cell and an area around it',p.state.status==='play'&&p.state.opened>=4,p.state.opened);
    check('phone: tap-to-open shows within 250 ms (incl. driver overhead)',lag<=250,lag);
    await page.screenshot({path:path.join(out,'first-01-opened.png')});
    // long press on a cell the solver knows is a leak
    const flagTarget=await page.evaluate(()=>{const g=window.__sweeper.probe().state;for(let i=0;i<g.N;i++)if(!g.open[i]&&g.mine[i])return i;return -1;});
    const cdp=await ctx.newCDPSession(page),fc=await center(page,flagTarget);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:fc.x,y:fc.y}]});await page.waitForTimeout(200);
    await page.screenshot({path:path.join(out,'first-02-holding.png')});
    await page.waitForTimeout(450);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(80);
    p=await probe(page);check('phone: a real long press flags the cell (and does not open it)',p.state.flag[flagTarget]===1&&!p.state.open[flagTarget]&&p.state.status==='play',{flag:p.state.flag[flagTarget],pose:p.pose});
    check('phone: the clerk reacts to the flag',p.pose==='flag',p.pose);
    await page.screenshot({path:path.join(out,'first-03-flagged.png')});
    // a short tap must not flag; a drag must not open
    const safe=await page.evaluate(()=>{const g=window.__sweeper.probe().state;for(let i=0;i<g.N;i++)if(!g.open[i]&&!g.mine[i]&&!g.flag[i])return i;return -1;});
    const sc=await center(page,safe);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sc.x,y:sc.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sc.x+40,y:sc.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(80);p=await probe(page);check('phone: dragging off a cell opens nothing',!p.state.open[safe],p.state.open[safe]);
    // flag mode: the same tap now flags
    await page.locator('#mode').tap();p=await probe(page);check('phone: flag-mode button switches mode',p.flagMode===true,p.flagMode);
    await page.touchscreen.tap(sc.x,sc.y);await page.waitForTimeout(60);p=await probe(page);check('phone: in flag mode a tap flags',p.state.flag[safe]===1&&!p.state.open[safe],p.state.flag[safe]);
    await page.touchscreen.tap(sc.x,sc.y);await page.waitForTimeout(60);p=await probe(page);check('phone: tapping again removes the flag',p.state.flag[safe]===0,p.state.flag[safe]);
    await page.locator('#mode').tap();
    // lose for real: tap a leak
    const leak=await page.evaluate(()=>{const g=window.__sweeper.probe().state;for(let i=0;i<g.N;i++)if(!g.open[i]&&g.mine[i]&&!g.flag[i])return i;return -1;});
    const lc=await center(page,leak);await page.touchscreen.tap(lc.x,lc.y);await page.waitForTimeout(250);
    p=await probe(page);check('phone: tapping a leak loses and the clerk jumps',p.state.status==='lost'&&p.pose==='boom',{s:p.state.status,pose:p.pose});
    await page.screenshot({path:path.join(out,'first-04-boom.png')});
    const bar=await usable(page,'#restart');check('phone: restart stays reachable right after losing',bar.ok,bar);
    await page.waitForTimeout(1100);await page.screenshot({path:path.join(out,'first-05-card.png')});
    p=await probe(page);check('phone: the story card shows after the reaction',p.card,p.card);
    const r2=await usable(page,'#restart');check('phone: restart stays reachable with the card up',r2.ok,r2);
    await page.locator('#close').tap();p=await probe(page);check('phone: the card can be put away to see the board',!p.card,p.card);
    await page.locator('#peek').tap();p=await probe(page);check('phone: and brought back',p.card,p.card);
    await page.locator('#again').tap();p=await probe(page);check('phone: one tap on the card starts a clean game',p.state.status==='ready'&&p.state.opened===0&&p.state.flags===0&&!p.card&&p.pose==='idle',{s:p.state.status,o:p.state.opened,f:p.state.flags,card:p.card,pose:p.pose});
    // play a whole game with real taps, following the solver, and measure drawing cost
    await page.evaluate(()=>window.__PLAYTEST__.setSeed(21));
    for(let k=0;k<400;k++){
      const mv=await page.evaluate(()=>{const s=window.__sweeper.probe().state;if(s.status==='won'||s.status==='lost')return null;if(s.status==='ready')return{op:'reveal',i:Math.floor(s.N/2)};
        // ask the rules which move is forced, but perform it as a real tap below
        return window.__sweeper.next();});
      if(!mv)break;
      const pc=await center(page,mv.i);
      if(mv.op==='flag'){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pc.x,y:pc.y}]});await page.waitForTimeout(500);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
      else await page.touchscreen.tap(pc.x,pc.y);
      await page.waitForTimeout(30);
    }
    p=await probe(page);check('phone: a whole game played with real taps and long presses is won',p.state.status==='won',{s:p.state.status,o:p.state.opened,f:p.state.flags});
    await page.waitForTimeout(1200);await page.screenshot({path:path.join(out,'first-06-won.png')});
    p=await probe(page);check('phone: win card and cheering clerk',p.card&&p.pose==='win',{card:p.card,pose:p.pose});
    check('phone: draw cost avg <= 4 ms, max <= 16 ms',p.metrics.avgDrawMs<=4&&p.metrics.maxDrawMs<=16,p.metrics);
    check('phone: no page errors during real play',!errors.length,errors);
    report.runs.push({v:'phone',name:'real-play',metrics:p.metrics});
    await ctx.close();}

  // 3. desktop: right click flags, left click opens
  {const {ctx,page,errors}=await open('','desktop');await page.click('[data-level=easy]');
    const c=await center(page,31);await page.mouse.click(c.x,c.y);let p=await probe(page);check('desktop: left click opens',p.state.opened>0,p.state.opened);
    const t=await page.evaluate(()=>{const g=window.__sweeper.probe().state;for(let i=0;i<g.N;i++)if(!g.open[i])return i;return -1;});
    const tc=await center(page,t);await page.mouse.click(tc.x,tc.y,{button:'right'});p=await probe(page);check('desktop: right click flags',p.state.flag[t]===1,p.state.flag[t]);
    check('desktop: no errors',!errors.length,errors);await ctx.close();}

  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();console.log(failed?failed+' check(s) failed':'all checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
