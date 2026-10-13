// Browser acceptance for 凉拖拍蟑螂, run by hand (not part of CI).
// Needs an existing Playwright install and Google Chrome; this repository installs neither.
//   python3 -m http.server 8931 --bind 127.0.0.1          (inside slipper-smash/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [base-url]
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'check-out',base=process.argv[3]||'http://127.0.0.1:8931/index.html',origin=new URL(base).origin;
fs.mkdirSync(out,{recursive:true});
const SIZES={phone:{viewport:{width:390,height:844},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  fold:{viewport:{width:720,height:800},deviceScaleFactor:2,hasTouch:true,isMobile:true},
  desktop:{viewport:{width:1280,height:720},deviceScaleFactor:1}};
const report={base,checks:[],runs:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail));};

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  async function open(query,size){
    const ctx=await browser.newContext(SIZES[size]),page=await ctx.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(!u.startsWith(origin)&&!u.startsWith('data:'))external.push(u);});
    await page.goto(base+query);
    await page.waitForFunction(()=>window.__slipper&&window.__slipper.ready,null,{polling:100,timeout:20000});
    return{ctx,page,errors,external};
  }
  const probe=page=>page.evaluate(()=>window.__slipper.probe());
  const fits=p=>p.view.W*p.view.scale<=p.canvas[0]+1&&1000*p.view.scale<=p.canvas[1]+1&&(Math.abs(p.view.W*p.view.scale-p.canvas[0])<2||Math.abs(1000*p.view.scale-p.canvas[1])<2);

  // 1. title and the four fixed views, on three screen shapes
  for(const size of Object.keys(SIZES))for(const [name,query] of [['title',''],['hero','?view=hero'],['stress','?view=stress'],['boss','?view=boss'],['win','?view=win']]){
    const {ctx,page,errors,external}=await open(query,size);await page.waitForTimeout(500);
    const p=await probe(page);await page.screenshot({path:path.join(out,size+'-'+name+'.png')});
    report.runs.push({size,name,probe:p,errors,external});
    check(size+' '+name+': no page errors, nothing fetched off-site',errors.length===0&&external.length===0,{errors,external});
    check(size+' '+name+': all four images loaded',Object.values(p.assets).every(Boolean),p.assets);
    check(size+' '+name+': world fits the screen exactly on one axis',fits(p),p.view);
    if(name==='stress')check(size+' stress: 5 to 8 things in the air',p.state.live>=5&&p.state.live<=8,p.state.live);
    if(name==='boss')check(size+' boss: boss on screen with health left',p.state.phase==='boss'&&p.state.boss.hp>0&&p.state.boss.x-p.state.boss.r*0.9>=0&&p.state.boss.x+p.state.boss.r*0.9<=p.css[0],p.state.boss);
    if(name==='win')check(size+' win: result card after beating the boss',p.screen==='result'&&p.state.result.reason==='win',p.state.result);
    await ctx.close();
  }

  // 2. player default: real pointer strokes land, then a stretch of real-time play for frame cost
  for(const size of ['phone','desktop']){
    const {ctx,page,errors}=await open('',size);
    await page.evaluate(()=>window.__slipper.start(5));
    await page.waitForFunction(()=>window.__slipper.probe().state.ents.some(e=>e.kind==='roach'&&e.y>200&&e.y<window.innerHeight-150),null,{polling:16,timeout:8000});
    let landed=false;
    for(let i=0;i<6&&!landed;i++){
      const e=(await probe(page)).state.ents.find(x=>x.kind==='roach');if(!e){await page.waitForTimeout(120);continue;}
      await page.mouse.move(e.x-70,e.y-10);await page.mouse.down();await page.mouse.move(e.x,e.y,{steps:2});await page.mouse.move(e.x+70,e.y+40,{steps:2});await page.mouse.up();
      landed=(await probe(page)).state.kills>0;
    }
    check(size+' default: a real drag across a roach flattens it',landed,(await probe(page)).state.kills);
    await page.evaluate(()=>window.__slipper.autopilot('human'));await page.waitForTimeout(9000);
    const p=await probe(page),m=await page.evaluate(()=>window.__slipper.metrics);await page.screenshot({path:path.join(out,size+'-default-play.png')});
    report.runs.push({size,name:'default-play',probe:p,metrics:m,errors});
    check(size+' default: draw cost within budget (avg <= 6 ms, max <= 16 ms)',m.avgFrameMs<=6&&m.maxFrameMs<=16,m);
    check(size+' default: no page errors while playing',errors.length===0,errors);
    await ctx.close();
  }

  // 3. the screen changes shape mid-game (fold opens, phone turns): the world must still fit
  {const {ctx,page,errors}=await open('','phone');await page.evaluate(()=>window.__slipper.start(5).autopilot('human'));await page.waitForTimeout(1500);
    for(const [w,h] of [[844,390],[720,800],[390,844]]){
      await page.setViewportSize({width:w,height:h});await page.waitForTimeout(400);const p=await probe(page);
      await page.screenshot({path:path.join(out,'reshape-'+w+'x'+h+'.png')});
      check('reshape to '+w+'x'+h+': world still fits',fits(p)&&p.css[0]===w,p.view);
    }
    check('reshape: no page errors',errors.length===0,errors);await ctx.close();}

  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();console.log(failed?failed+' check(s) failed':'all checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
