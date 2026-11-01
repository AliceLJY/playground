// Actual screenshot regression for flowing tower colours and the flashing red beacon.
// NODE_PATH="$(npm root -g)" node tools/night-check.cjs [out-dir] [base-url]
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
(async()=>{
 const out=path.resolve(process.argv[2]||'shots/r2/night'),base=process.argv[3]||'file://'+path.resolve(__dirname,'../dist/index.html');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],shots=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
  let box;
  for(const t of [13,13.6,33]){await page.goto(base+'?view=hero&h=1&t='+t);await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await page.waitForTimeout(350);box=await page.evaluate(()=>window.__huacheng.subjectBoxes().canton);shots.push((await page.screenshot({path:path.join(out,'night-'+t+'.png')})).toString('base64'));}
  const data=await page.evaluate(async({shots,box})=>{
   const images=await Promise.all(shots.map(async s=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,c.width,c.height).data;}));
   const x0=Math.floor(box.x0*1440),x1=Math.ceil(box.x1*1440),y0=Math.floor(box.y0*900),y1=Math.ceil(box.y1*900),beacons=[0,0],coloured=[0,0];let changed=0,area=0;
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const i=(y*1440+x)*4;
    if(y<y0+9)for(let k=0;k<2;k++){const d=images[k];if(d[i]>140&&d[i]>d[i+1]*1.8&&d[i]>d[i+2]*1.8)beacons[k]++;}
    if(y>y0+60){area++;const a=images[0],b=images[2];if(Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k])))>30)changed++;for(const [j,d] of [a,b].entries())if(Math.max(d[i],d[i+1],d[i+2])>150&&Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])>30)coloured[j]++;}
   }
   return {beacons,coloured,changed,area,changedShare:changed/area};
  },{shots,box});
  const checks=[{id:'tower-colour-flow',pass:data.changedShare>.08&&data.coloured.every(n=>n>300)},{id:'red-beacon-blink',pass:data.beacons[0]>0&&data.beacons[1]<data.beacons[0]},{id:'night-errors',pass:errors.length===0}];
  const report={checks,data,errors};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(checks.some(c=>!c.pass))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
