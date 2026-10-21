// Browser acceptance for 打回乐池, run by hand (not part of CI).
// Needs an existing Playwright install and Google Chrome; this repository installs neither.
//   python3 -m http.server 8951 --bind 127.0.0.1          (inside yingge-pit/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [base-url]
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'check-out',base=process.argv[3]||'http://127.0.0.1:8951/index.html',origin=new URL(base).origin;
fs.mkdirSync(out,{recursive:true});
const SIZES={
  phone:{viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  portrait:{viewport:{width:540,height:960},deviceScaleFactor:2,hasTouch:true,isMobile:true},
  landscape:{viewport:{width:960,height:540},deviceScaleFactor:2,hasTouch:true,isMobile:true},
  phoneland:{viewport:{width:844,height:390},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  fold:{viewport:{width:720,height:800},deviceScaleFactor:2,hasTouch:true,isMobile:true},
  desktop:{viewport:{width:1280,height:720},deviceScaleFactor:1}};
const VIEWS=['title','hero','feint','stress','duo','ball','win','result','lose'];
const report={base,checks:[],runs:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail).slice(0,300));};
const overlap=(a,b)=>a&&b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const inside=(r,w,h)=>r.x>=-1&&r.y>=-1&&r.x+r.w<=w+1&&r.y+r.h<=h+1;

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  async function open(query,size){
    const ctx=await browser.newContext(SIZES[size]),page=await ctx.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(!u.startsWith(origin)&&!u.startsWith('data:'))external.push(u);});
    await page.goto(base+query);
    await page.waitForFunction(()=>window.__yingge&&window.__yingge.ready,null,{polling:100,timeout:30000});
    return{ctx,page,errors,external};
  }
  const probe=page=>page.evaluate(()=>window.__yingge.probe());
  // brightness of the game canvas along a lit rod, sampled between the hand and the part that sticks out of the pit
  const rodLight=(page,arm)=>page.evaluate(a=>{
    const c=document.getElementById('stage'),g=c.getContext('2d'),d=window.devicePixelRatio>2?2:window.devicePixelRatio,p=window.__yingge.probe().boss;let bright=0,n=0;
    for(let i=1;i<=12;i++){const k=i/13,x=(a.hand.x+(a.tip.x-a.hand.x)*k)*d,y=(a.hand.y+(a.tip.y-a.hand.y)*k)*d;if(y/d>=p.panel-2)continue;
      const px=g.getImageData(Math.round(x),Math.round(y),1,1).data;n++;if(0.299*px[0]+0.587*px[1]+0.114*px[2]>=200)bright++;}
    return{bright,n};},arm);

  // 1. fixed views on six screen shapes
  for(const size of Object.keys(SIZES))for(const name of VIEWS){
    const {ctx,page,errors,external}=await open(name==='title'?'':'?view='+name,size);await page.waitForTimeout(300);
    const p=await probe(page);await page.screenshot({path:path.join(out,size+'-'+name+'.png')});
    const [W,H]=p.css;report.runs.push({size,name,probe:{...p,texts:p.texts.length},errors,external});
    check(`${size} ${name}: no page errors, nothing fetched off-site`,errors.length===0&&external.length===0,{errors,external});
    check(`${size} ${name}: all images loaded`,Object.values(p.assets).every(Boolean),p.assets);
    if(name==='title')continue;
    check(`${size} ${name}: the stage opening is fully on screen`,inside(p.stage,W,H),p.stage);
    if(['hero','feint','stress','duo','ball','lose'].includes(name)){
      check(`${size} ${name}: every pad on screen and at least 44 x 44 css px`,p.pads.every(r=>inside(r,W,H)&&r.w>=44&&r.h>=44),p.pads.map(r=>[r.x|0,r.y|0,r.w|0,r.h|0]));
      const g=p.gong;check(`${size} ${name}: the gong is on screen and clear of the pads`,g.x-g.r>=0&&g.x+g.r<=W&&g.y+g.r<=H&&p.pads.every(r=>!overlap({x:g.x-g.r,y:g.y-g.r,w:2*g.r,h:2*g.r},r)),g);
      // captions (banners, hints, the boss's speech) never sit on a puppet
      const caps=p.texts.filter(t=>['banner','speech','hint'].includes(t.tag)),hits=[];
      for(const c of caps)p.puppets.forEach((b,i)=>{if(overlap(c,b))hits.push({text:c.text,lane:i});});
      check(`${size} ${name}: no caption covers a puppet`,hits.length===0,{captions:caps.map(c=>c.text),hits});
    }
    if(name==='duo')check(`${size} duo: 阿爸's pads are all in the left half, 心远's all in the right half`,
      p.pads.every(r=>r.player===0?r.x+r.w<=W/2+1:r.x>=W/2-1),p.pads.map(r=>({player:r.player,x:r.x|0,w:r.w|0})));
    if(['hero','stress','duo'].includes(name)){
      const lit=Object.values(p.boss.arms).filter(a=>a.lit);
      check(`${size} ${name}: a rod is lit, tip and hand on screen`,lit.length>=(name==='stress'?2:1)&&lit.every(a=>a.tip.x>=0&&a.tip.x<=W&&a.tip.y>=0&&a.tip.y<=H),lit);
      for(const a of lit){const r=await rodLight(page,a);check(`${size} ${name}: the lit rod reads bright on screen (pixels along it)`,r.n>=4&&r.bright/r.n>=0.7,r);}
    }
    await ctx.close();
  }

  // 1b. calibration: the same brightness test on a rod that is NOT lit (a feint's fake wind-up) must read dark
  for(const size of ['phone','landscape']){
    const {ctx,page}=await open('?view=feint',size);await page.waitForTimeout(200);const p=await probe(page);
    const fake=Object.values(p.boss.arms).find(a=>a.lane!=null&&!a.lit);
    const r=fake?await rodLight(page,fake):null;
    check(`${size} feint: an unlit wound-up rod reads dark with the same test (calibration)`,!!r&&r.n>=4&&r.bright/r.n<=0.3,r);
    await ctx.close();
  }

  // 1c. a sweep through whole real rounds: every 0.05 s render a frame and check that no caption (wave banner, hint,
  //     the boss's speech) lands on a puppet, and that every lit rod reads bright. Two seeds x solo/duo x two skill levels.
  for(const size of ['portrait','landscape']){
    const {ctx,page,errors}=await open('',size);
    const res=await page.evaluate(async()=>{
      const h=window.__yingge,ov=(a,b)=>a&&b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
      const c=document.getElementById('stage'),g=c.getContext('2d'),d=Math.min(window.devicePixelRatio,2);
      const out={frames:0,captionFrames:0,hits:[],capHits:[],popFrames:0,popHits:0,litFrames:0,darkRods:[]};
      for(const [seed,mode,level] of [[2,'solo','precise'],[3,'solo','human'],[4,'duo','human'],[6,'duo','precise']]){
        h.start(seed,mode).autopilot(level,seed);h.freeze(true);
        for(let i=0;i<2400;i++){
          h.advance(0.05);h.render();const p=h.probe();out.frames++;if(!p.state||p.state.phase==='over')break;
          const caps=p.texts.filter(t=>['banner','speech','hint'].includes(t.tag));if(caps.length)out.captionFrames++;
          for(const t of caps)p.puppets.forEach((b,k)=>{if(ov(t,b)&&out.hits.length<10)out.hits.push({seed,t:p.state.t,text:t.text,lane:k});});
          for(let a=0;a<caps.length;a++)for(let b=a+1;b<caps.length;b++)if(ov(caps[a],caps[b])&&out.capHits.length<10)out.capHits.push({seed,t:p.state.t,a:caps[a].text,b:caps[b].text});
          const pops=p.texts.filter(t=>t.tag==='pop');if(pops.length){out.popFrames++;if(pops.some(t=>p.puppets.some(b=>ov(t,b))))out.popHits++;}
          for(const a of Object.values(p.boss.arms))if(a.lit){out.litFrames++;let n=0,br=0;
            for(let k=1;k<=12;k++){const x=(a.hand.x+(a.tip.x-a.hand.x)*k/13)*d,y=(a.hand.y+(a.tip.y-a.hand.y)*k/13)*d;if(y/d>=p.boss.panel-2)continue;
              const px=g.getImageData(Math.round(x),Math.round(y),1,1).data;n++;if(0.299*px[0]+0.587*px[1]+0.114*px[2]>=200)br++;}
            if(n<4||br/n<0.7)out.darkRods.push({seed,t:p.state.t,n,br});}
        }
      }
      return out;
    });
    report.runs.push({size,name:'sweep',...res});
    check(`${size} sweep: captions were on screen in many frames (the check had something to check)`,res.captionFrames>=100,{frames:res.frames,captionFrames:res.captionFrames});
    check(`${size} sweep: no caption ever covers a puppet`,res.hits.length===0,res.hits);
    check(`${size} sweep: captions never overlap each other`,res.capHits.length===0,res.capHits);
    check(`${size} sweep: every lit rod reads bright on screen`,res.litFrames>=200&&res.darkRods.length===0,{litFrames:res.litFrames,dark:res.darkRods.slice(0,5)});
    check(`${size} sweep: score pops rarely touch a puppet (at most 10% of pop frames)`,res.popFrames>50&&res.popHits/res.popFrames<=0.1,{popFrames:res.popFrames,popHits:res.popHits});
    check(`${size} sweep: no page errors`,errors.length===0,errors);
    await ctx.close();
  }

  // 2. player default: a real tap on the pad of the lit lane makes that puppet hit; then real-time play for frame cost
  for(const size of ['phone','portrait','landscape','desktop']){
    const {ctx,page,errors}=await open('',size),p0=await probe(page),touch=!!SIZES[size].hasTouch;
    const tapAt=async(x,y)=>touch?page.touchscreen.tap(x,y):page.mouse.click(x,y);
    await tapAt(p0.css[0]/2,p0.css[1]*0.45);
    await page.waitForFunction(()=>{const p=window.__yingge.probe();return p.state&&p.state.threats.includes('lit');},null,{polling:16,timeout:15000});
    const p=await probe(page),lane=p.state.threats.indexOf('lit'),pad=p.pads.find(r=>r.lane===lane);
    await tapAt(pad.x+pad.w/2,pad.y+pad.h/2);await page.waitForTimeout(120);
    const log=await page.evaluate(()=>window.__yingge.log.slice());
    check(`${size} default: a real tap on the lit lane's pad lands a hit`,log.some(e=>e.type==='hit'&&e.lane===lane),log.slice(-4));
    await page.evaluate(()=>window.__yingge.autopilot('human',3));await page.waitForTimeout(9000);
    const m=await page.evaluate(()=>window.__yingge.metrics);await page.screenshot({path:path.join(out,size+'-default-play.png')});
    report.runs.push({size,name:'default-play',metrics:m,errors});
    check(`${size} default: draw cost within budget (avg <= 6 ms, max <= 16 ms)`,m.avgFrameMs<=6&&m.maxFrameMs<=16,m);
    check(`${size} default: no page errors while playing`,errors.length===0,errors);
    await ctx.close();
  }

  // 3. two thumbs at once: one touch on 阿爸's left pad and one on 心远's right pad in the same event
  for(const size of ['portrait','landscape']){
    const {ctx,page,errors}=await open('?mode=duo',size);
    await page.evaluate(()=>window.__yingge.start(9,'duo'));await page.waitForTimeout(2200);
    const p=await probe(page),a=p.pads.find(r=>r.player===0&&r.lane===0),b=p.pads.find(r=>r.player===1&&r.lane===2);
    const cdp=await ctx.newCDPSession(page),pt=(r,id)=>({x:r.x+r.w/2,y:r.y+r.h/2,id});
    await page.evaluate(()=>{window.__yingge.log.length=0;});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(a,1),pt(b,2)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(100);
    const log=await page.evaluate(()=>window.__yingge.log.slice());
    const left=log.find(e=>e.lane===0&&e.player===0),right=log.find(e=>e.lane===2&&e.player===1);
    check(`${size} duo: two thumbs pressed together both register, each for its own player`,!!left&&!!right&&Math.abs(left.t-right.t)<0.02,log);
    check(`${size} duo: no page errors`,errors.length===0,errors);
    await ctx.close();
  }

  // 4. the screen changes shape mid-round (phone turns, fold opens): layout follows, stage and pads stay on screen
  {const {ctx,page,errors}=await open('','phone');await page.evaluate(()=>window.__yingge.start(5,'duo').autopilot('human',5));await page.waitForTimeout(1500);
    for(const [w,h] of [[844,390],[720,800],[390,844]]){
      await page.setViewportSize({width:w,height:h});await page.waitForTimeout(400);const p=await probe(page);
      await page.screenshot({path:path.join(out,'reshape-'+w+'x'+h+'.png')});
      check(`reshape to ${w}x${h}: ${p.land?'landscape':'portrait'} layout, stage and pads on screen`,p.css[0]===w&&p.land===(w/h>=1.15)&&inside(p.stage,w,h)&&p.pads.every(r=>inside(r,w,h)),{land:p.land,stage:p.stage});
    }
    check('reshape: no page errors',errors.length===0,errors);await ctx.close();}

  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();console.log(failed?failed+' check(s) failed':'all checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
