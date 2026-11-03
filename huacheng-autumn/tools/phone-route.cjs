// Every rendered frame of the phone tour: visible introductory text must not cover the board.
// The page clock advances real rAF updates; this is layout coverage, never a performance benchmark.
// NODE_PATH="$(npm root -g)" node tools/phone-route.cjs [out-dir] [base-url] [duration-seconds]
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const out=path.resolve(process.argv[2]||'shots/r3/phone-route'),base=process.argv[3]||'file://'+path.resolve(__dirname,'../dist/index.html'),duration=Number(process.argv[4]||40);fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={base,duration,views:[],errors:[]};
 try{for(const [w,h] of [[390,664],[412,700]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true}),page=await ctx.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.clock.install();await page.goto(base+'?intro=skip');await page.clock.runFor(120);
  await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});
  await page.evaluate(()=>{
   window.__phoneTour={samples:0,visible:0,hidden:0,clashes:[],minGap:Infinity};
   function sample(){const r=window.__phoneTour,el=document.querySelector('.copy'),s=window.__huacheng.state();r.samples++;
    if(getComputedStyle(el).visibility==='visible'){
     r.visible++;const bottom=window.__huacheng.subjectBoxes().base.y1*innerHeight,gap=el.getBoundingClientRect().top-bottom;
     r.minGap=Math.min(r.minGap,gap);if(gap<0)r.clashes.push({t:s.t,u:s.u,gap});
    }else r.hidden++;requestAnimationFrame(sample);
   }requestAnimationFrame(sample);
  });
  for(let second=1;second<=duration;second++){await page.clock.runFor(1000);if([6,31].includes(second))await page.screenshot({path:path.join(out,`${w}x${h}-${second}s.png`)});}
  const tour=await page.evaluate(()=>window.__phoneTour),r={w,h,...tour,pass:tour.samples>=duration*50&&tour.visible>100&&tour.clashes.length===0};report.views.push(r);
  console.log(JSON.stringify({...r,clashes:r.clashes.slice(0,3),clashCount:r.clashes.length}));await ctx.close();
 }fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(report.errors.length||report.views.some(v=>!v.pass))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
