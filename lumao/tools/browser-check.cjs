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
const STATES={stand:['purr','look','warn','bite','lick'],belly:['purr','look','warn','bite','lick'],sleep:['drowsy','awake','purr','look','warn','bite','lick']};
const ALLOWED=new Set(['','index.html','src/core.js','src/cat-data.js','src/game.js','src/core.js?v=20261128c','src/cat-data.js?v=20261128c','src/game.js?v=20261128c',
  ...Object.entries(STATES).flatMap(([p,ss])=>[`assets/${p}/cat-base.webp`,`assets/${p}/cat-masks.png`,...ss.map(s=>`assets/${p}/cat-${s}.webp`)])]);
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
    await page.goto(url(query),{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__lumao&&window.__lumao.ready,null,{polling:100,timeout:30000});
    return{ctx,page,errors,stray};
  }
  const probe=p=>p.evaluate(()=>window.__lumao.probe());
  const box=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};},sel);
  // fur units (x across the side back→belly, y along head→tail) → css px, through the page's own mapping
  const toCss=(page,x,y)=>page.evaluate(([x,y])=>{const p=window.__lumao.coreToCss(x,y);return{X:p[0],Y:p[1]};},[x,y]);
  async function drag(page,l,x0,y0,x1,y1,steps,shot){
    const a=await toCss(page,x0,y0),b=await toCss(page,x1,y1);await page.mouse.move(a.X,a.Y);await page.mouse.down();
    for(let k=1;k<=steps;k++){const t=k/steps;await page.mouse.move(a.X+(b.X-a.X)*t,a.Y+(b.Y-a.Y)*t);await page.waitForTimeout(16);
      if(shot&&k===Math.round(steps*0.66))await page.screenshot({path:shot});}
    await page.mouse.up();await page.waitForTimeout(120);
  }

  // layout on three viewports: the whole cat inside the visible area; hand + label, hint and sound button clear of her
  for(const pose of ['stand','belly','sleep'])for(const size of ['iphone','android','desktop']){
    const {ctx,page,errors,stray}=await open(`?pose=${pose}&view=hero`,size);
    const pr=await probe(page),l=pr.layout,cat=l.cat;
    const tag=`${pose}/${size}`;
    check(`${tag}: reports the pose it was asked for`,pr.pose===pose,pr.pose);
    check(`${tag}: whole cat inside the viewport`,inside(cat,l.VW,l.VH,4),cat);
    check(`${tag}: hand and its label clear of the cat`,!overlap(l.hand,cat)&&!overlap(l.label,cat)&&inside(l.label,l.VW,l.VH,2),{hand:l.hand,label:l.label,cat});
    const hint=await box(page,'#hint'),snd=await box(page,'#sound'),bar=await box(page,'#poses');
    check(`${tag}: hint shown on a fresh page and below the cat`,pr.hint&&hint&&hint.y>=cat.y+cat.h-6,{hint,catBottom:cat.y+cat.h});
    check(`${tag}: sound button clear of the cat`,!overlap(snd,cat),{snd,cat});
    check(`${tag}: pose buttons inside the viewport, clear of the cat and the hint`,bar&&inside(bar,l.VW,l.VH,2)&&!overlap(bar,cat)&&!overlap(bar,hint),{bar,hint});
    check(`${tag}: she starts as she should (${pose==='sleep'?'asleep':'awake, calm'})`,pose==='sleep'?pr.state==='sleep'&&pr.head==='base':pr.state==='idle'&&pr.head==='base',[pr.state,pr.head]);
    report[tag]={renderer:await page.evaluate(()=>window.__lumao.renderer()),cat,hand:l.hand,Lc:l.Lc};
    await page.screenshot({path:`${out}/hero-${pose}-${size}.png`});
    check(`${tag}: no page errors`,!errors.length,errors);check(`${tag}: no outside requests`,!stray.length,stray);
    await ctx.close();
  }

  // real input with the grain (down the back): combs her, makes her happy, puts hair on the hand; tapping the hand claps it off
  {
    const {ctx,page,errors}=await open('','iphone1x');
    const l=(await probe(page)).layout,before=await probe(page);
    check('fresh page: she stands in profile, calm',before.head==='base'&&before.state==='idle',[before.head,before.state]);
    await drag(page,l,0.14,0.12,0.14,0.9,18,`${out}/drag-mid.png`);
    const one=await probe(page);
    check('real drag: the hint goes away after the first stroke',!one.hint,one.hint);
    for(let i=0;i<8;i++)await drag(page,l,0.1+(i%3)*0.06,0.12,0.1+(i%3)*0.06,0.9,18);
    const after=await probe(page);
    check('real drag: the back is flatter and shinier',after.backMess<before.backMess-0.05&&after.backShine>before.backShine+0.1,{before:[before.backMess,before.backShine],after:[after.backMess,after.backShine]});
    check('real drag: nine strokes with the grain make her happy (eyes shut)',after.happy&&after.state==='happy'&&after.head==='purr',[after.state,after.head]);
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
    for(let i=0;i<2;i++)await drag(page,l,0.12,0.9,0.12,0.15,16);
    await page.waitForTimeout(400);
    const pr=await probe(page);
    check('real drag against the grain: fur stands up and she looks back',pr.look&&pr.head==='look'&&pr.backMess>0.25,{look:pr.look,state:pr.state,mess:pr.backMess});
    await page.screenshot({path:`${out}/against-real.png`});
    await page.keyboard.press('Space');await page.waitForTimeout(700);
    const k=await probe(page);
    check('space key strokes her with the grain',k.backMess<pr.backMess,{before:pr.backMess,after:k.backMess});
    check('against-the-grain page: no page errors',!errors.length,errors);
    await ctx.close();
  }
  // haptics: with the sound switched off, a purring cat under a moving finger still buzzes, long enough to feel (>= 25 ms each)
  {
    const ctx=await browser.newContext(SIZES.android1x),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.__vib=[];navigator.vibrate=p=>{window.__vib.push(p);return true;};});
    await page.goto(url(''),{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__lumao&&window.__lumao.ready,null,{polling:100,timeout:60000});
    await page.click('#sound');
    const l=(await probe(page)).layout;
    for(let i=0;i<8&&!(await probe(page)).happy;i++)await drag(page,l,0.12+(i%3)*0.06,0.12,0.12+(i%3)*0.06,0.9,12);
    // keep the finger down and moving while she purrs
    const a=await toCss(page,0.15,0.2),b=await toCss(page,0.15,0.85);await page.mouse.move(a.X,a.Y);await page.mouse.down();
    for(let k=0;k<60;k++){const f=(k%20)/20;await page.mouse.move(a.X+(b.X-a.X)*f,a.Y+(b.Y-a.Y)*f);await page.waitForTimeout(30);}
    await page.mouse.up();
    const vib=await page.evaluate(()=>window.__vib);const purrs=vib.filter(p=>Array.isArray(p)&&p.length>=5);
    check('haptics: sound off, purring under the finger still buzzes',purrs.length>=1,{calls:vib.length,purrs:purrs.length});
    check('haptics: every buzz is at least 25 ms',vib.every(p=>(Array.isArray(p)?p.filter((_,i)=>i%2===0):[p]).every(ms=>ms>=25)),vib.slice(0,4));
    await page.mouse.click(l.hand.x+l.hand.w*0.5,l.hand.y+l.hand.h*0.6);await page.waitForTimeout(100);
    const after=await page.evaluate(()=>window.__vib);
    check('haptics: clapping the hair off buzzes',after.length>vib.length,{before:vib.length,after:after.length});
    check('haptics page: no page errors',!errors.length,errors);await ctx.close();
  }
  // the pose buttons switch her; asleep, gentle real strokes wake her through half-awake; one stroke against the grain wakes her at once
  {
    const {ctx,page,errors}=await open('','iphone1x');
    await page.click('#poses button[data-pose="sleep"]');
    await page.waitForFunction(()=>window.__lumao.ready&&window.__lumao.probe().pose==='sleep',null,{polling:100,timeout:30000});
    let pr=await probe(page);const l=pr.layout;
    check('pose button: 睡着 switches to the sleeping cat, asleep',pr.pose==='sleep'&&pr.state==='sleep'&&pr.head==='base'&&pr.hint,[pr.pose,pr.state,pr.head]);
    const seen=new Set();
    for(let i=0;i<2;i++){await drag(page,l,0.12+i*0.06,0.12,0.12+i*0.06,0.9,18);seen.add((await probe(page)).state);}
    pr=await probe(page);
    check('asleep: two gentle strokes and she is still asleep',pr.state==='sleep',[pr.state,pr.sleep]);
    for(let i=0;i<10&&['sleep','drowsy'].includes((await probe(page)).state);i++){await drag(page,l,0.1+(i%3)*0.06,0.12,0.1+(i%3)*0.06,0.9,18);const q=await probe(page);seen.add(q.state);if(q.state==='drowsy')await page.screenshot({path:`${out}/sleep-drowsy-real.png`});}
    pr=await probe(page);
    check('asleep: more gentle strokes wake her, through half-awake',seen.has('drowsy')&&!['sleep','drowsy'].includes(pr.state)&&pr.sleep<0.15,{seen:[...seen],state:pr.state,sleep:pr.sleep});
    await page.screenshot({path:`${out}/sleep-awake-real.png`});
    check('sleep page: no page errors',!errors.length,errors);
    await ctx.close();
  }
  {
    const {ctx,page,errors}=await open('?pose=sleep','android1x');const l=(await probe(page)).layout;
    await drag(page,l,0.12,0.9,0.12,0.15,16);await page.waitForTimeout(300);
    const pr=await probe(page);
    check('asleep: one stroke against the grain wakes her at once',pr.sleep<0.15&&!['sleep','drowsy'].includes(pr.state),[pr.state,pr.sleep]);
    check('rude-wake page: no page errors',!errors.length,errors);await ctx.close();
  }
  // on her back the belly is a trap: real non-stop strokes get her purring, then the warning, then the grab
  {
    const {ctx,page,errors}=await open('?pose=belly','iphone1x');const l=(await probe(page)).layout;const seen=new Set();let warnShot=false;
    for(let i=0;i<30&&(await probe(page)).bites===0;i++){await drag(page,l,0.1+(i%3)*0.06,0.12,0.1+(i%3)*0.06,0.9,12);const q=await probe(page);seen.add(q.state);if(q.happy)seen.add('purred');
      if(q.state==='warn'&&!warnShot){warnShot=true;await page.screenshot({path:`${out}/belly-warn-real.png`});}}
    const pr=await probe(page);
    check('belly: purrs first, warns, then grabs',seen.has('purred')&&seen.has('warn')&&pr.bites>=1,{seen:[...seen],bites:pr.bites});
    await page.screenshot({path:`${out}/belly-after-real.png`});
    check('belly page: no page errors',!errors.length,errors);await ctx.close();
  }
  // fixed views report the state they were asked for
  const want={hero:p=>p.state==='idle'&&p.head==='base',smooth:p=>p.state==='happy'&&p.head==='purr'&&p.backShine>0.6,rump:p=>p.butt>20&&p.arch>10,ruffle:p=>p.look&&p.head==='look'&&p.backMess>0.25,
    warn:p=>p.state==='warn'&&p.head==='warn'&&p.crouch>5,bite:p=>p.state==='bite'&&p.head==='bite',
    furry:p=>p.handLevel>=3,clap:p=>p.hairsShown===0&&p.airborne>0};
  want['sleep:hero']=p=>p.state==='sleep'&&p.head==='base';want['sleep:drowsy']=p=>p.state==='drowsy'&&p.head==='drowsy';
  want['sleep:awake']=p=>!['sleep','drowsy'].includes(p.state)&&p.sleep<0.15;want['sleep:ruffle']=p=>p.look&&p.head==='look';
  want['belly:warn']=p=>p.state==='warn'&&p.head==='warn';want['belly:bite']=p=>p.state==='bite'&&p.head==='bite';
  for(const key of Object.keys(want)){
    const [pose,v]=key.includes(':')?key.split(':'):['stand',key];
    const {ctx,page,errors}=await open(`?pose=${pose}&view=${v}`,'iphone');const pr=await probe(page);
    check(`view ${key}: reached`,pr.view===v&&pr.pose===pose&&want[key](pr),{state:pr.state,look:pr.look,mess:pr.backMess,shine:pr.backShine,hand:pr.handLevel,shown:pr.hairsShown,air:pr.airborne});
    await page.waitForTimeout(200);await page.screenshot({path:`${out}/view-${pose}-${v}.png`});
    check(`view ${key}: no page errors`,!errors.length,errors);await ctx.close();
  }
  await browser.close();
  report.failed=failed;fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
  console.log(failed?`${failed} check(s) failed`:'all checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
