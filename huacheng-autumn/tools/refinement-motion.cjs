// Real rendered glint changes and the normal auto route around the pagoda (no camera teleport).
// NODE_PATH="$(npm root -g)" node tools/refinement-motion.cjs [out-dir] [base-url]
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const {checkTowers}=require('./refinement-check.cjs');
(async()=>{
 const out=path.resolve(process.argv[2]||'shots/r3/motion'),base=process.argv[3]||'file://'+path.resolve(__dirname,'../dist/index.html');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={base,checks:[],errors:[]};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),shots=[];
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  const open=async q=>{await page.goto(base+q);await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});};
  for(const [t,h] of [[13,.55],[16.3,.55],[13,1]]){await open(`?view=hero&t=${t}&h=${h}`);await page.waitForTimeout(300);shots.push((await page.screenshot({path:path.join(out,`water-${t}-${h}.png`)})).toString('base64'));}
  const water=await page.evaluate(async shots=>{
   const imgs=await Promise.all(shots.map(async b64=>{const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();const c=document.createElement('canvas');c.width=1440;c.height=900;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(920,800,85,90).data;}));
   let changed=0;const bright=[0,0,0];for(let i=0;i<imgs[0].length;i+=4){if(Math.max(...[0,1,2].map(k=>Math.abs(imgs[0][i+k]-imgs[1][i+k])))>20)changed++;imgs.forEach((d,j)=>{if(d[i]>150&&d[i]-d[i+2]>50)bright[j]++;});}
   return{roi:{x:920,y:800,w:85,h:90},changed,bright};
  },shots);
  // A sparse near-water patch may fade out between samples; require visible glints in the sampled pair, actual pixel changes, and none at night.
  report.water=water;report.checks.push({id:'sun-glints-twinkle-and-disappear-at-night',pass:water.changed>20&&Math.max(water.bright[0],water.bright[1])>20&&water.bright[2]===0});
  await open('?view=pagoda');const centre=await page.evaluate(()=>window.__huacheng.state().u);
  await open('');
  await page.evaluate(centre=>{
   window.__routeSamples=[];function sample(){const s=window.__huacheng.state();if(Math.abs(s.u-centre)<=.025)window.__routeSamples.push({u:s.u,mode:s.mode,boxes:window.__huacheng.subjectBoxes(),calls:window.__huacheng.info().calls});if(s.u<=centre+.03)requestAnimationFrame(sample);else window.__routeDone=true;}requestAnimationFrame(sample);
  },centre);
  for(const [label,u] of [['before',centre-.025],['centre',centre],['after',centre+.025]]){
   await page.waitForFunction(u=>window.__huacheng.state().u>=u,u,{polling:100,timeout:45000});await page.screenshot({path:path.join(out,`route-${label}.png`)});
  }
  await page.waitForFunction(()=>window.__routeDone,null,{polling:100});
  const samples=await page.evaluate(()=>window.__routeSamples);
  report.route={centre,samples:samples.length,minGapPx:Math.min(...samples.map(s=>checkTowers(s.boxes).detail.gapPx)),maxCalls:Math.max(...samples.map(s=>s.calls)),failures:samples.filter(s=>s.mode!=='auto'||!checkTowers(s.boxes).pass)};
  report.checks.push({id:'auto-route-separated-towers',pass:samples.length>=80&&report.route.failures.length===0&&report.route.maxCalls<=160});
  report.checks.push({id:'page-errors',pass:report.errors.length===0});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.checks.some(c=>!c.pass))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
