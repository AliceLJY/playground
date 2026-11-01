// Sustained real-rAF measurements, sequential GPU use; no page-clock or recording overhead.
// NODE_PATH="$(npm root -g)" node tools/performance-check.cjs [out-dir] [base-url]
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const out=path.resolve(process.argv[2]||'shots/r5/performance'),base=process.argv[3]||'file://'+path.resolve(__dirname,'../dist/index.html');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={base,browser:browser.version(),date:new Date().toISOString(),samples:[],errors:[]};
 try{for(const config of [{name:'default-day-full-route',query:'',dpr:2,frames:3600},{name:'default-dusk-full-route',query:'?h=.55',dpr:2,frames:3600},{name:'default-night-full-route',query:'?h=1',dpr:2,frames:3600}]){
  const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:config.dpr}),page=await ctx.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(base+config.query);await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await page.waitForTimeout(10000);
  const sample=await page.evaluate(frames=>new Promise(resolve=>{const intervals=[],states=[];let start,prev;
   function frame(t){if(start===undefined)start=prev=t;else{intervals.push(t-prev);prev=t;}if(intervals.length%60===0){const s=window.__huacheng.state(),i=window.__huacheng.info();states.push({u:s.u,calls:i.calls,pixelRatio:i.pixelRatio,scaleIdx:i.scaleIdx});}
    if(intervals.length<frames)requestAnimationFrame(frame);else{const sorted=intervals.slice().sort((a,b)=>a-b);resolve({frames,seconds:(t-start)/1000,meanFps:frames*1000/(t-start),p95ms:sorted[Math.floor(frames*.95)],p99ms:sorted[Math.floor(frames*.99)],maxMs:sorted.at(-1),above34ms:intervals.filter(x=>x>34).length,states,info:window.__huacheng.info()});}}
   requestAnimationFrame(frame);
  }),config.frames);
  report.samples.push({...config,...sample});console.log(JSON.stringify({name:config.name,meanFps:sample.meanFps,p95ms:sample.p95ms,p99ms:sample.p99ms,maxMs:sample.maxMs,above34ms:sample.above34ms,calls:Math.max(...sample.states.map(s=>s.calls)),pixelRatios:[...new Set(sample.states.map(s=>s.pixelRatio))]}));await ctx.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));report.checks=report.samples.map(s=>({name:s.name,pass:!s.info.renderer.includes('SwiftShader')&&s.meanFps>=55&&s.states.every(i=>i.calls<=160&&i.pixelRatio>=1.5),fps:s.meanFps,minPixelRatio:Math.min(...s.states.map(i=>i.pixelRatio)),maxCalls:Math.max(...s.states.map(i=>i.calls))}));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(report.errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
