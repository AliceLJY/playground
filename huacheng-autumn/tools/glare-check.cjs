// Blown-out highlight check (B8). Round 3 had two white streaks along the bridge handrails:
// metallic rails caught the sun and the bridge light, and bloom smeared them across the frame.
// Counts bright warm-white pixels inside the footbridge's projected box (rails, deck, hanging flowers).
// Lamps and tram windows sit elsewhere; the page copy never overlaps the bridge in these views.
// NODE_PATH="$(npm root -g)" node tools/glare-check.cjs [base-url]   — renders pagoda view + phone hero
const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const LIMIT=0.0012;// share of the bridge box. Calibrated 2026-11-01: metallic rails (round 3) 0.30 % pagoda / 0.17 % phone, matte rails 0.09 % / 0.08 %
async function share(page,b64,box){return page.evaluate(async({b64,box})=>{
 const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();
 const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
 const cl=v=>Math.min(1,Math.max(0,v)),x0=Math.floor(cl(box.x0)*im.width),x1=Math.ceil(cl(box.x1)*im.width),y0=Math.floor(cl(box.y0)*im.height),y1=Math.ceil(cl(box.y1)*im.height);
 const d=g.getImageData(x0,y0,Math.max(1,x1-x0),Math.max(1,y1-y0)).data;let n=0;
 for(let i=0;i<d.length;i+=4)if(d[i]>240&&d[i+1]>220&&d[i+2]>150)n++;return n/(d.length/4);},{b64,box});}
(async()=>{const args=process.argv.slice(2);
 const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
 try{
  {const base=args[0]||'file://'+path.resolve(__dirname,'../dist/index.html');
   for(const [name,query,w,h,dpr] of [['pagoda-day','?view=pagoda&h=0',1440,900,1],['pagoda-dusk','?view=pagoda&h=.55',1440,900,1],['phone-day','?view=hero&h=0',390,664,2],['phone-dusk','?view=hero&h=.55',390,664,2]]){
    const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr,isMobile:w<600,hasTouch:w<600}),page=await ctx.newPage();
    await page.goto(base+query);await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100,timeout:30000});await page.waitForTimeout(1200);
    const view=await page.evaluate(()=>window.__huacheng.state().view);if(view!==new URLSearchParams(query).get('view'))throw Error('view '+view);
    const box=await page.evaluate(()=>window.__huacheng.subjectBoxes().bridge);
    results.push({name,box,share:await share(page,(await page.screenshot()).toString('base64'),box)});await ctx.close();}}
 }finally{await browser.close();}
 for(const r of results)r.pass=r.share<=LIMIT;console.log(JSON.stringify({limit:LIMIT,results}));if(results.some(r=>!r.pass))process.exitCode=1;})();
