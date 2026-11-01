// B8/B9: same screenshot ROI and actual geometry projections on r2 and r3.
// NODE_PATH="$(npm root -g)" node tools/refinement-check.cjs <out-dir> [base-url]
const fs=require('node:fs'),path=require('node:path');
const ROI={x:420,y:690,w:200,h:110},MAX_SD=.008;
const intersects=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0;
async function waterStats(page,png,roi=ROI){
 return page.evaluate(async({b64,roi})=>{
  const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();
  const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
  const g=c.getContext('2d');g.drawImage(im,0,0);
  const a=g.getImageData(roi.x,roi.y,roi.w,roi.h).data;let sum=0,sq=0;
  for(let i=0;i<a.length;i+=4){const y=(.2126*a[i]+.7152*a[i+1]+.0722*a[i+2])/255;sum+=y;sq+=y*y;}
  const n=a.length/4,mean=sum/n;
  return{roi,pixels:n,mean,sd:Math.sqrt(Math.max(0,sq/n-mean*mean)),width:im.width,height:im.height};
 },{b64:png.toString('base64'),roi});
}
async function checkWater(page,png,subjects){
 const roi={...ROI,x:Math.min(ROI.x,Math.floor(subjects.base.x0*1440)-ROI.w-20)};
 const d=await waterStats(page,png,roi);
 // Entire ROI is left of the board's projected bounds, below the text and above controls.
 const outsideBoard=(roi.x+roi.w)/1440<subjects.base.x0;
 return{id:'B8-calm-water',pass:d.width===1440&&d.height===900&&outsideBoard&&d.sd<MAX_SD,detail:{...d,maxSd:MAX_SD,outsideBoard}};
}
function checkTowers(subjects){
 const a=subjects.pagoda,b=subjects.canton;
 const overlapArea=Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));
 const gap=Math.max(b.x0-a.x1,a.x0-b.x1);
 return{id:'B9-separated-towers',pass:a.front&&b.front&&!intersects(a,b),detail:{pagoda:a,canton:b,overlapArea,gapPx:gap*1440}};
}
module.exports={checkWater,checkTowers};
if(require.main===module)(async()=>{
 const {chromium}=require('playwright'),out=path.resolve(process.argv[2]||'shots/r3/refinement'),base=process.argv[3]||'file://'+path.resolve(__dirname,'../dist/index.html');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={base,browser:browser.version(),checks:[],errors:[]};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  for(const view of ['hero','pagoda']){
   await page.goto(base+'?view='+view+'&t=13&h=0.55');await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await page.waitForTimeout(600);
   const state=await page.evaluate(()=>window.__huacheng.state());if(state.view!==view)throw Error('Wrong view: '+state.view);
   const subjects=await page.evaluate(()=>window.__huacheng.subjectBoxes()),png=await page.screenshot({path:path.join(out,view+'.png')});
   report.checks.push(view==='hero'?await checkWater(page,png,subjects):checkTowers(subjects));
  }
  report.checks.push({id:'page-errors',pass:report.errors.length===0,detail:report.errors});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));for(const c of report.checks)console.log(`${c.pass?'PASS':'FAIL'} ${c.id}: ${JSON.stringify(c.detail)}`);
  if(report.checks.some(c=>!c.pass))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
