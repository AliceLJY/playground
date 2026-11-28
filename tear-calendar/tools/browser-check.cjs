// Browser acceptance for 手撕日历, run by hand (not part of CI). Needs a Playwright install; uses its bundled Chromium.
//   python3 -m http.server 8971 --bind 127.0.0.1            (inside tear-calendar/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [page-url]
// page-url defaults to http://127.0.0.1:8971/index.html; online it is https://aliceljy.github.io/playground/tear-calendar/
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails. Read the screenshots: green here
// only means the page runs, lays out and tears; how the paper feels and sounds still needs a person.
const {chromium}=require('playwright');
const fs=require('fs');
const out=process.argv[2]||'check-out',base=process.argv[3]||'http://127.0.0.1:8971/index.html';
const page0=new URL(base),dir=page0.pathname.replace(/[^/]*$/,'');
const rel=u=>{const x=new URL(u);return x.origin===page0.origin&&x.pathname.startsWith(dir)?x.pathname.slice(dir.length):null;};
const ALLOWED=new Set(['','index.html','src/almanac.js','src/core.js','src/game.js']);
fs.mkdirSync(out,{recursive:true});
const SIZES={iphone:{viewport:{width:390,height:664},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  android:{viewport:{width:412,height:700},deviceScaleFactor:2.625,hasTouch:true,isMobile:true},
  desktop:{viewport:{width:1280,height:720},deviceScaleFactor:1}};
const report={base,checks:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail));};
const url=q=>base.replace(/[?#].*$/,'')+q;

(async()=>{
  const browser=await chromium.launch();report.browser=browser.version();
  async function open(query,size,state){
    const ctx=await browser.newContext(SIZES[size]),page=await ctx.newPage(),errors=[],stray=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(u.startsWith('data:'))return;const p=rel(u);if(p==null||!ALLOWED.has(p))stray.push(u);});
    await page.goto(url(query));
    await page.waitForFunction(s=>window.__tearcal&&window.__tearcal.state===s,state,{polling:100,timeout:20000});
    return{ctx,page,errors,stray};
  }
  const probe=p=>p.evaluate(()=>window.__tearcal.probe());
  const box=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};},sel);

  // 8. layout: page, header and nail inside the visible area on three viewports; buttons and hint do not cover the page
  for(const size of Object.keys(SIZES)){
    const {ctx,page,errors,stray}=await open('?date=2026-11-28&view=hero',size,'hero-ready');
    const pr=await probe(page),l=pr.layout;
    check(`${size}: board top and page bottom inside the viewport`,l.boardTop>=0&&l.pageBottom+16<=l.vh,l);
    const r=await page.evaluate(()=>{const g=document.getElementById('gl');return g.width+'x'+g.height;});
    const hint=await box(page,'#hint'),snd=await box(page,'#sound');
    check(`${size}: hint shown on a fresh page`,pr.hint==='捏住页脚，往下撕'&&hint,pr.hint);
    check(`${size}: hint does not cover the page`,hint&&hint.y>=l.pageBottom-2,{hint,pageBottom:l.pageBottom});
    check(`${size}: sound button above the board`,snd&&snd.y+snd.h<=l.perfY-l.PW*0.30+4||snd&&snd.x>l.vw/2+l.PW/2,{snd,perfY:l.perfY});
    const gli=await page.evaluate(()=>{const g=document.getElementById('gl').getContext('webgl'),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'?';});
    report[size]={renderer:gli,canvas:r,fps:pr.fps};
    await page.screenshot({path:`${out}/hero-${size}.png`});
    check(`${size}: no page errors`,!errors.length,errors);check(`${size}: no outside requests`,!stray.length,stray);
    await ctx.close();
  }

  // real input: a touch-like drag with the mouse from the bottom-right corner down tears the page; hint changes then goes away
  {
    const {ctx,page,errors}=await open('?date=2026-11-28',"iphone",'play');
    const l=(await probe(page)).layout,x0=(l.vw-l.PW)/2,X=x0+l.PW*0.9,Y=l.perfY+l.PW*1.1;
    await page.mouse.move(X,Y);await page.mouse.down();
    await page.mouse.move(X-4,Y+20,{steps:4});
    const mid=await probe(page);
    check('real drag: hint switches once the page is held',mid.hint==='往下拽，撕开它',mid.hint);
    for(let k=1;k<=30;k++){await page.mouse.move(X-k*2,Y+20+k*6);await page.waitForTimeout(16);}
    await page.waitForTimeout(250);
    const held=await probe(page);
    await page.screenshot({path:`${out}/drag-held.png`});
    await page.mouse.up();await page.waitForTimeout(400);
    const after=await probe(page);
    check('real drag: the page tore off and the next day is on top',after.torn===1&&after.ymd==='2026-11-29',{held,after});
    check('real drag: hint is gone after the first tear',after.hint==='',after.hint);
    check('real drag: counter and back-to-today appear',!!(await box(page,'#count'))&&!!(await box(page,'#today')));
    await page.screenshot({path:`${out}/drag-after.png`});
    await page.click('#today');await page.waitForTimeout(100);
    check('back to today returns to the start date',(await probe(page)).ymd==='2026-11-28');
    check('real drag: no page errors',!errors.length,errors);
    await ctx.close();
  }

  // keyboard: space tears a page too
  {
    const {ctx,page}=await open('?date=2026-12-21',"desktop",'play');
    await page.focus('#gl');await page.keyboard.press('Space');await page.waitForTimeout(1500);
    const p=await probe(page);
    check('keyboard: space tears a page (12-21 -> 12-22, 冬至)',p.ymd==='2026-12-22'&&p.torn===1,p);
    await page.screenshot({path:`${out}/winter-solstice.png`});
    await ctx.close();
  }

  // 9. fixed views reach the states they claim
  for(const [view,expect] of [['lift',p=>p.broken===0&&p.lift>0.2],['torn',p=>p.broken>=6&&!p.free],['fall',p=>p.torn===1&&p.falling===1]]){
    const {ctx,page}=await open(`?date=2026-11-28&view=${view}`,'iphone',`${view}-ready`);
    const p=await probe(page);check(`view=${view} reaches its state`,expect(p),p);
    await page.screenshot({path:`${out}/view-${view}.png`});await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,1));
  console.log(failed?`${failed} check(s) failed`:'all checks passed');process.exit(failed?1:0);
})();
