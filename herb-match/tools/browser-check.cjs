// Browser acceptance for 药性配对, run by hand (not part of CI). Adapted from slipper-smash/tools/browser-check.cjs.
// Needs an existing Playwright install and Google Chrome; this repository installs neither.
//   python3 -m http.server 8941 --bind 127.0.0.1          (inside herb-match/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [base-url]
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'check-out',base=process.argv[3]||'http://127.0.0.1:8941/index.html',origin=new URL(base).origin;
fs.mkdirSync(out,{recursive:true});
const SIZES={
  portrait:{viewport:{width:540,height:960},deviceScaleFactor:2,hasTouch:true,isMobile:true},
  phone:{viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  landscape:{viewport:{width:844,height:390},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  fold:{viewport:{width:720,height:800},deviceScaleFactor:2,hasTouch:true,isMobile:true},
  desktop:{viewport:{width:1280,height:720},deviceScaleFactor:1}
};
const report={base,checks:[],runs:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail).slice(0,300));};
const overlap=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  async function open(query,size){
    const ctx=await browser.newContext(SIZES[size]),page=await ctx.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(!u.startsWith(origin)&&!u.startsWith('data:'))external.push(u);});
    await page.goto(base+query);
    await page.waitForFunction(()=>window.__herb&&window.__herb.ready,null,{polling:100,timeout:20000});
    return{ctx,page,errors,external};
  }
  const probe=page=>page.evaluate(()=>window.__herb.probe());
  const fits=p=>p.view.W*p.view.scale<=p.canvas[0]+1&&1000*p.view.scale<=p.canvas[1]+1&&(Math.abs(p.view.W*p.view.scale-p.canvas[0])<2||Math.abs(1000*p.view.scale-p.canvas[1])<2);
  const inside=(r,p)=>r.x>=-1&&r.y>=-1&&r.x+r.w<=p.css[0]+1&&r.y+r.h<=p.css[1]+1;
  // cards against herbs, both as the page draws them (herb box includes the name plate)
  const clear=p=>{const s=p.state;if(!s)return true;for(const c of s.cards)for(const h of s.herbs)if(!h.grabbed&&overlap(c,h))return false;return true;};

  // 1. title, the four fixed views and the herb sheet on five screen shapes
  for(const size of Object.keys(SIZES))for(const [name,query] of [['title',''],['hero','?view=hero'],['flip','?view=flip'],['stress','?view=stress'],['result','?view=result'],['sheet','?view=sheet'],['cards','?view=cards']]){
    const {ctx,page,errors,external}=await open(query,size);await page.waitForTimeout(400);
    const p=await probe(page);await page.screenshot({path:path.join(out,size+'-'+name+'.png')});
    report.runs.push({size,name,probe:p,errors,external});
    check(size+' '+name+': no page errors, nothing fetched off-site',errors.length===0&&external.length===0,{errors,external});
    check(size+' '+name+': world fits the screen exactly on one axis',fits(p),p.view);
    check(size+' '+name+': all four baskets fully on screen',p.baskets.every(b=>inside(b,p)),p.baskets);
    if(p.state){
      check(size+' '+name+': every falling herb and card on screen',p.state.herbs.every(h=>h.y+h.h<0||inside({...h,y:Math.max(0,h.y),h:h.h-Math.max(0,-h.y)},p))&&p.state.cards.every(c=>inside(c,p)),{herbs:p.state.herbs,cards:p.state.cards});
      check(size+' '+name+': no card covers a herb or its name plate',clear(p),{herbs:p.state.herbs,cards:p.state.cards});
    }
    if(name==='hero')check(size+' hero: two or more herbs falling, a combo going',p.state.herbs.length>=2&&p.state.combo>=3,{live:p.state.live,combo:p.state.combo});
    if(name==='flip')check(size+' flip: an explanation card turned over',p.state.cards.some(c=>c.flip>=0.34),p.state.cards);
    if(name==='stress')check(size+' stress: at least three herbs on screen',p.state.herbs.length>=3,p.state.live);
    if(name==='result')check(size+' result: the closing card',p.screen==='result'&&p.state.result&&p.state.result.filed>0,p.state.result);
    await ctx.close();
  }

  // 1b. every herb's card back, at the narrowest card (390-wide phone) and the full width: text ends above the divider
  {const {ctx,page}=await open('','phone');const fit=await page.evaluate(()=>window.__herb.cardFit());
    const bad=fit.filter(f=>f.bottom>f.divider-6);report.cardFit=fit;
    check('card text fits above the divider for all 16 herbs at every card width',bad.length===0,bad);
    check('the last line of a card (what was chosen) stays at 15 card units or larger',fit.every(f=>f.lastLine>=15),fit.map(f=>f.lastLine));
    check('card notes stay at 16 card units or larger',fit.every(f=>f.noteSize>=16),fit.filter(f=>f.noteSize<16));await ctx.close();}

  // 1c. captions (score pops, 不是X, 漏接了) are drawn under the herbs: put one on a herb's face and the face must not change
  for(const size of ['portrait','landscape']){
    const {ctx,page}=await open('',size);
    await page.evaluate(()=>{window.__herb.start(5).advance(3).freeze();});await page.waitForTimeout(150);
    const h=await page.evaluate(()=>{const p=window.__herb.probe(),h=p.state.herbs[0],s=p.view.scale/p.dpr;return{cx:h.cx,cy:h.cy,wx:(h.cx*p.dpr-p.view.ox)/p.view.scale,wy:(h.cy*p.dpr-p.view.oy)/p.view.scale,name:h.name,s};});
    const clip={x:h.cx-8,y:h.cy-8,width:16,height:16};
    const before=await page.screenshot({clip});await page.evaluate(([x,y])=>window.__herb.popAt('不是热',x,y),[h.wx,h.wy]);await page.waitForTimeout(150);
    const withPop=await page.screenshot({clip});await page.evaluate(()=>window.__herb.clearPops());
    check(size+' a caption placed on '+h.name+'\'s face leaves the face unchanged (herbs drawn above captions)',before.equals(withPop),{herb:h.name});
    await ctx.close();
  }

  // 2. player default (no parameters, default pixel ratio): a real tap on the right basket, a real drag into it, then play for frame cost
  for(const size of ['portrait','phone','landscape','desktop']){
    const {ctx,page,errors}=await open('',size),touch=!!SIZES[size].hasTouch;
    await page.evaluate(()=>window.__herb.start(5));
    const nature=name=>page.evaluate(n=>window.HerbCore.HERBS.find(h=>h.name===n).nature,name);
    const front=async()=>{await page.waitForFunction(()=>window.__herb.probe().state.herbs.some(h=>h.age>0.4),null,{polling:16,timeout:8000});
      const p=await probe(page);return{p,h:p.state.herbs.filter(h=>!h.grabbed&&h.age>0.2).sort((a,b)=>b.cy-a.cy)[0]};};
    let {p,h}=await front();const b=p.baskets[await nature(h.name)],cx=b.x+b.w/2,cy=b.y+b.h/2;
    if(touch)await page.touchscreen.tap(cx,cy);else await page.mouse.click(cx,cy);
    const afterTap=(await probe(page)).state;
    check(size+' default: a real tap on the right basket files the lowest herb correctly',afterTap.correct===1&&afterTap.filed===1,{herb:h.name,correct:afterTap.correct,filed:afterTap.filed});
    ({p,h}=await front());const b2=p.baskets[await nature(h.name)];
    await page.mouse.move(h.cx,h.cy);await page.mouse.down();await page.mouse.move((h.cx+b2.x+b2.w/2)/2,(h.cy+b2.y)/2,{steps:4});
    await page.mouse.move(b2.x+b2.w/2,b2.y+b2.h*0.4,{steps:4});await page.mouse.up();
    const afterDrag=(await probe(page)).state;
    check(size+' default: dragging a herb into its basket files it',afterDrag.correct===2&&afterDrag.filed===2,{herb:h.name,correct:afterDrag.correct,filed:afterDrag.filed});
    await page.evaluate(()=>window.__herb.autopilot('human',5));await page.waitForTimeout(9000);
    const q=await probe(page),m=await page.evaluate(()=>window.__herb.metrics);await page.screenshot({path:path.join(out,size+'-default-play.png')});
    report.runs.push({size,name:'default-play',probe:q,metrics:m,errors});
    check(size+' default: draw cost within budget (avg <= 6 ms, max <= 16 ms)',m.avgFrameMs<=6&&m.maxFrameMs<=16,m);
    check(size+' default: no card covers a herb during play',clear(q),q.state.cards);
    check(size+' default: no page errors while playing',errors.length===0,errors);
    await ctx.close();
  }

  // 3. the screen changes shape mid-round (phone turns, fold opens): the world must still fit
  {const {ctx,page,errors}=await open('','phone');await page.evaluate(()=>window.__herb.start(5).autopilot('human',5));await page.waitForTimeout(1500);
    for(const [w,h] of [[844,390],[720,800],[390,844]]){
      await page.setViewportSize({width:w,height:h});await page.waitForTimeout(400);const p=await probe(page);
      await page.screenshot({path:path.join(out,'reshape-'+w+'x'+h+'.png')});
      check('reshape to '+w+'x'+h+': world still fits, baskets on screen',fits(p)&&p.css[0]===w&&p.baskets.every(b=>inside(b,p)),p.view);
    }
    check('reshape: no page errors',errors.length===0,errors);await ctx.close();}

  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();console.log(failed?failed+' check(s) failed':'all checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
