// Browser acceptance for 撸猫撸了一手毛, run by hand (not part of CI). Needs a Playwright install; uses its bundled Chromium.
//   python3 -m http.server 8972 --bind 127.0.0.1            (inside lumao/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [page-url]
// page-url defaults to http://127.0.0.1:8972/index.html; online it is https://aliceljy.github.io/playground/lumao/
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails. Read the screenshots: green here
// only means the page runs, lays out and reacts to a real drag; how the fur feels and the purr sounds still needs a person.
const {chromium}=require('playwright');
const fs=require('fs');
const out=process.argv[2]||'check-out',base=process.argv[3]||'http://127.0.0.1:8972/index.html';
const page0=new URL(base),dir=page0.pathname.replace(/[^/]*$/,'');
const rel=u=>{const x=new URL(u);return x.origin===page0.origin&&x.pathname.startsWith(dir)?x.pathname.slice(dir.length):null;};
const ALLOWED=new Set(['','index.html','src/core.js','src/body.js','src/game.js']);
fs.mkdirSync(out,{recursive:true});
// interaction runs at 1× pixels: on a software renderer (SwiftShader) 3× makes one stroke take ~8 s, far from a person's pace
const SIZES={iphone1x:{viewport:{width:390,height:664},deviceScaleFactor:1,hasTouch:true,isMobile:true},android1x:{viewport:{width:412,height:700},deviceScaleFactor:1,hasTouch:true,isMobile:true},
  iphone:{viewport:{width:390,height:664},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  android:{viewport:{width:412,height:700},deviceScaleFactor:2.625,hasTouch:true,isMobile:true},
  desktop:{viewport:{width:1280,height:720},deviceScaleFactor:1}};
const report={base,checks:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail));};
const url=q=>base.replace(/[?#].*$/,'')+q;
const inside=(r,vw,vh,m)=>r.x>=m&&r.y>=m&&r.x+r.w<=vw-m&&r.y+r.h<=vh-m;
const overlap=(a,b)=>!!(a&&b&&a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h);

(async()=>{
  const browser=await chromium.launch();report.browser=browser.version();
  async function open(query,size){
    const ctx=await browser.newContext(SIZES[size]),page=await ctx.newPage(),errors=[],stray=[];
    page.on('pageerror',e=>errors.push(e.message));
    // Chromium refuses navigator.vibrate until the first tap; that console line is expected, everything else counts
    page.on('console',m=>{if(m.type()==='error'&&!/vibrate/.test(m.text()))errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(u.startsWith('data:'))return;const p=rel(u);if(p==null||!ALLOWED.has(p))stray.push(u);});
    await page.goto(url(query));
    await page.waitForFunction(()=>window.__lumao&&window.__lumao.ready,null,{polling:100,timeout:30000});
    return{ctx,page,errors,stray};
  }
  const probe=p=>p.evaluate(()=>window.__lumao.probe());
  const box=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};},sel);
  // body units → css px, with the same spine bow as the page (BEND 0.07)
  const toCss=(l,x,y)=>({X:l.ox+(x+0.07*Math.sin(Math.PI*Math.min(1,Math.max(0,(y-0.05)/0.9))))*l.Lc,Y:l.oy+y*l.Lc});
  async function drag(page,l,x0,y0,x1,y1,steps,shot){
    const a=toCss(l,x0,y0),b=toCss(l,x1,y1);await page.mouse.move(a.X,a.Y);await page.mouse.down();
    for(let k=1;k<=steps;k++){const t=k/steps;await page.mouse.move(a.X+(b.X-a.X)*t,a.Y+(b.Y-a.Y)*t);await page.waitForTimeout(16);
      if(shot&&k===Math.round(steps*0.66))await page.screenshot({path:shot});}
    await page.mouse.up();await page.waitForTimeout(120);
  }

  // layout on three viewports: the whole cat inside the visible area; hand + label, hint and sound button clear of her
  for(const size of ['iphone','android','desktop']){
    const {ctx,page,errors,stray}=await open('?view=hero',size);
    const pr=await probe(page),l=pr.layout,cat=l.cat;
    check(`${size}: whole cat inside the viewport`,inside(cat,l.VW,l.VH,4),cat);
    check(`${size}: hand and its label clear of the cat`,!overlap(l.hand,cat)&&!overlap(l.label,cat)&&inside(l.label,l.VW,l.VH,2),{hand:l.hand,label:l.label,cat});
    const hint=await box(page,'#hint'),snd=await box(page,'#sound');
    check(`${size}: hint shown on a fresh page and below the cat`,pr.hint&&hint&&hint.y>=cat.y+cat.h-6,{hint,catBottom:cat.y+cat.h});
    check(`${size}: sound button clear of the cat`,!overlap(snd,cat),{snd,cat});
    report[size]={renderer:await page.evaluate(()=>window.__lumao.renderer()),cat,hand:l.hand,Lc:l.Lc};
    await page.screenshot({path:`${out}/hero-${size}.png`});
    check(`${size}: no page errors`,!errors.length,errors);check(`${size}: no outside requests`,!stray.length,stray);
    await ctx.close();
  }

  // real input with the grain (down the back): combs her, makes her happy, puts hair on the hand; tapping the hand claps it off
  {
    const {ctx,page,errors}=await open('','iphone1x');
    const l=(await probe(page)).layout,before=await probe(page);
    await drag(page,l,0.28,0.33,0.28,0.7,18,`${out}/drag-mid.png`);
    const one=await probe(page);
    check('real drag: the hint goes away after the first stroke',!one.hint,one.hint);
    for(let i=0;i<8;i++)await drag(page,l,0.25+(i%3)*0.03,0.33,0.25+(i%3)*0.03,0.7,18);
    const after=await probe(page);
    check('real drag: the back is flatter and shinier',after.backMess<before.backMess-0.05&&after.backShine>before.backShine+0.1,{before:[before.backMess,before.backShine],after:[after.backMess,after.backShine]});
    check('real drag: nine strokes with the grain make her happy',after.happy&&after.state==='happy',after.state);
    check('real drag: hair stuck to the hand',after.hairsCore>0,after.hairsCore);
    await page.waitForTimeout(1800);
    const landed=await probe(page);
    check('loose hair flies to the hand in the corner',landed.hairsShown>0&&landed.hairsShown<=landed.hairsCore,{shown:landed.hairsShown,core:landed.hairsCore});
    await page.screenshot({path:`${out}/after-strokes.png`});
    await page.mouse.click(l.hand.x+l.hand.w*0.5,l.hand.y+l.hand.h*0.6);await page.waitForTimeout(150);
    const clap=await probe(page);
    check('tapping the hand claps the hair off',clap.hairsShown===0&&clap.hairsCore===0&&clap.airborne>0,{shown:clap.hairsShown,core:clap.hairsCore,airborne:clap.airborne});
    await page.screenshot({path:`${out}/clap-real.png`});
    check('with-the-grain page: no page errors',!errors.length,errors);
    await ctx.close();
  }
  // real input against the grain: the fur stands up and she looks back; the space key strokes her with the grain
  {
    const {ctx,page,errors}=await open('','android1x');
    const l=(await probe(page)).layout;
    for(let i=0;i<3;i++)await drag(page,l,0.24,0.7,0.24,0.34,16);
    await page.waitForTimeout(400);
    const pr=await probe(page);
    check('real drag against the grain: fur stands up and she looks back',pr.look&&pr.backMess>0.25,{look:pr.look,state:pr.state,mess:pr.backMess});
    await page.screenshot({path:`${out}/against-real.png`});
    await page.keyboard.press('Space');await page.waitForTimeout(700);
    const k=await probe(page);
    check('space key strokes her with the grain',k.backMess<pr.backMess,{before:pr.backMess,after:k.backMess});
    check('against-the-grain page: no page errors',!errors.length,errors);
    await ctx.close();
  }
  // fixed views report the state they were asked for
  const want={hero:p=>p.state==='idle',smooth:p=>p.state==='happy'&&p.backShine>0.6,ruffle:p=>p.look&&p.backMess>0.3,warn:p=>p.state==='warn',bite:p=>p.state==='bite',
    furry:p=>p.handLevel>=3,clap:p=>p.hairsShown===0&&p.airborne>0};
  for(const v of Object.keys(want)){
    const {ctx,page,errors}=await open('?view='+v,'iphone');const pr=await probe(page);
    check(`view ${v}: reached`,pr.view===v&&want[v](pr),{state:pr.state,look:pr.look,mess:pr.backMess,shine:pr.backShine,hand:pr.handLevel,shown:pr.hairsShown,air:pr.airborne});
    await page.waitForTimeout(200);await page.screenshot({path:`${out}/view-${v}.png`});
    check(`view ${v}: no page errors`,!errors.length,errors);await ctx.close();
  }
  await browser.close();
  report.failed=failed;fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
  console.log(failed?`${failed} check(s) failed`:'all checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
