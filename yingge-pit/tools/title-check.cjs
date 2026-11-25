// Title screen: the 单人 / 双人 choices are inside the viewport and a real click on each one selects it.
// Desktop landscape sizes come from the 2026-11-25 Duet report (buttons cut off below the screen).
// NODE_PATH="$(npm root -g)" node tools/title-check.cjs <base-url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const [base,out]=process.argv.slice(2);if(!base||!out)throw Error('base URL and output directory required');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch(),checks=[],errors=[];
 const check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}${pass?'':' '+JSON.stringify(detail)}`);};
 try{for(const [w,h,touch] of [[1280,720,false],[1366,768,false],[1440,800,false],[1440,900,false],[1024,700,false],[844,390,true],[390,844,true],[390,664,true]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:touch?2:1,hasTouch:touch,isMobile:touch});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.evaluate(()=>{try{localStorage.removeItem('yingge-mode');}catch(e){}});await page.reload();
  await page.waitForFunction(()=>window.__yingge?.ready,null,{polling:100});await page.waitForTimeout(150);
  await page.screenshot({path:path.join(out,`${w}x${h}-title.png`)});
  const p=await page.evaluate(()=>window.__yingge.probe());
  if(w>h)for(const m of p.modes||[])check(`${w}x${h}: landscape ${m.mode} box is at least 44x44 CSS px and inside`,m.w>=44&&m.h>=44&&m.x>=0&&m.y>=0&&m.x+m.w<=w&&m.y+m.h<=h,m);
  for(const label of ['单人','双人']){
   const b=p.texts.find(t=>t.text===label);
   const inside=b&&b.x>=0&&b.y>=0&&b.x+b.w<=w&&b.y+b.h<=h;
   check(`${w}x${h}: title choice ${label} inside the viewport`,inside,b||'not drawn');
   if(!inside)continue;
   const want=label==='单人'?'solo':'duo';
   if(touch)await page.touchscreen.tap(b.x+b.w/2,b.y+b.h/2);else await page.mouse.click(b.x+b.w/2,b.y+b.h/2);
   await page.waitForTimeout(80);const after=await page.evaluate(()=>window.__yingge.probe());
   check(`${w}x${h}: clicking ${label} selects ${want} and stays on title`,after.mode===want&&after.screen==='title',{mode:after.mode,screen:after.screen});
  }
  await ctx.close();
 }
 check('zero page errors',errors.length===0,errors);
 }finally{await browser.close();fs.writeFileSync(path.join(out,'title-report.json'),JSON.stringify({checks,errors},null,2));}
 const failed=checks.filter(c=>!c.pass).length;console.log(`${checks.length-failed}/${checks.length} passed`);
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
