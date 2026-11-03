// Short phone viewports including browser chrome. Desktop Chrome emulation, not real devices.
// NODE_PATH="$(npm root -g)" node tools/layout.cjs [out-dir] [base-url]
const fs=require('node:fs'),path=require('node:path');
async function inspectLayout(page){
 return page.evaluate(()=>{
  const selectors=['.brand','.badge','.copy h1','.copy p','.credit','.tele','.tools button','[data-place]','.hour span','[data-hour]','#hour','#journal-start','#journal-title','#journal-stamps','#journal-goal','#journal-memory','.journal button'];
  const boxes=selectors.flatMap(s=>Array.from(document.querySelectorAll(s)).filter(el=>el.checkVisibility({checkVisibilityCSS:true})).map((el,i)=>{
   const r=el.getBoundingClientRect(),clickable=el.matches('button,input'),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   return{id:s+'['+i+']',x:r.x,y:r.y,w:r.width,h:r.height,inside:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:!clickable||hit===el||el.contains(hit),clickable};
  }));
  const clashes=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)clashes.push([a.id,b.id]);}
  const board=window.__huacheng.subjectBoxes().base,copy=document.querySelector('.copy').getBoundingClientRect();
  const copyVisible=getComputedStyle(document.querySelector('.copy')).visibility==='visible';
  const boardAboveCopy=innerWidth/innerHeight>=.8||!copyVisible||(board.front&&board.y1*innerHeight<=copy.top);
  return{boxes,clashes,copyVisible,boardAboveCopy,boardBottom:board.y1*innerHeight,copyTop:copy.top,pass:boxes.every(b=>b.inside&&b.hit)&&clashes.length===0&&boardAboveCopy};
 });
}
async function sampleFrames(page){
 return page.evaluate(()=>new Promise(resolve=>{const intervals=[];let start,prev;function tick(t){if(start===undefined)start=prev=t;else{intervals.push(t-prev);prev=t;}if(intervals.length<180)requestAnimationFrame(tick);else resolve({frames:180,seconds:(t-start)/1000,meanFps:180000/(t-start),p95ms:intervals.sort((a,b)=>a-b)[171]});}requestAnimationFrame(tick);}));
}
module.exports={inspectLayout,sampleFrames};
if(require.main===module)(async()=>{
 const {chromium}=require('playwright'),out=path.resolve(process.argv[2]||'shots/r3/mobile'),base=process.argv[3]||'file://'+path.resolve(__dirname,'../dist/index.html');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={base,browser:browser.version(),emulation:true,views:[],errors:[]};
 try{for(const [w,h] of [[390,664],[412,700]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true}),page=await ctx.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  for(const query of ['?view=hero','']){
   await page.goto(base+query);await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});
   const layout=await inspectLayout(page),performanceSample=await sampleFrames(page),endLayout=await inspectLayout(page);
   const data=await page.evaluate(()=>({state:window.__huacheng.state(),info:window.__huacheng.info()}));
   const name=(query?'phone-':'default-')+w+'x'+h;await page.screenshot({path:path.join(out,name+'.png')});
   const r={name,w,h,layout,endLayout,performanceSample,...data,pass:layout.pass&&endLayout.pass&&data.info.calls<=160};report.views.push(r);
   console.log(JSON.stringify({name,pass:r.pass,clashes:[layout.clashes,endLayout.clashes],boardBottom:endLayout.boardBottom,copyTop:endLayout.copyTop,performanceSample,renderer:data.info.renderer,pixelRatio:data.info.pixelRatio,scaleIdx:data.info.scaleIdx}));
  }await ctx.close();
 }fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(report.errors.length||report.views.some(r=>!r.pass))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
