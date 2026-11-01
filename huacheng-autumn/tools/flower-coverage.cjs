// Visible flower colour / visible foreground silhouette, excluding sky, river and opposite bank.
// The normal screenshot supplies colours; the second render supplies ownership + occlusion.
const fs=require('fs'),path=require('path');
async function coverage(pg,out,reference){
 const shot=await pg.screenshot({path:path.join(out,'flower-colour.png')});
 const mask=await pg.evaluate(()=>window.__flowerAudit());
 return pg.evaluate(async({b64,width,height,mask,reference})=>{
  const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();
  const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');g.drawImage(im,0,0,width,height);const d=g.getImageData(0,0,width,height).data;
  let changedPixels=0;
  if(reference){const ref=new Image();ref.src='data:image/png;base64,'+reference;await ref.decode();g.drawImage(ref,0,0,width,height);const rd=g.getImageData(0,0,width,height).data;for(let i=0;i<rd.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(d[i+k]-rd[i+k])))>2)changedPixels++;}
  let board=0,flowers=0,colour=0;const map=g.createImageData(width,height);
  for(let i=0;i<mask.length;i++){
   const n=i*4,r=d[n]/255,gr=d[n+1]/255,b=d[n+2]/255,ma=Math.max(r,gr,b),mi=Math.min(r,gr,b),delta=ma-mi;
   let h=delta===0?0:ma===r?60*((gr-b)/delta%6):ma===gr?60*((b-r)/delta+2):60*((r-gr)/delta+4);h=(h+360)%360;
   // Pink/rose (285–360), orange/gold (0–65). Low-lit petals remain measurable.
   const warm=(h>=285||h<=65)&&delta/ma>=.18&&ma>=.16;
   if(mask[i])board++;if(mask[i]===2)flowers++;if(mask[i]===2&&warm)colour++;
   map.data[n]=mask[i]===2&&warm?255:0;map.data[n+1]=mask[i]===1?100:0;map.data[n+3]=255;
  }
  g.putImageData(map,0,0);return {changedPixels,sceneDifference:changedPixels/(width*height),boardPixels:board,visibleFlowerPixels:flowers,flowerColourPixels:colour,share:colour/board,geometryShare:flowers/board,maskPng:c.toDataURL('image/png')};
 },{b64:shot.toString('base64'),reference:reference?.toString('base64'),...mask});
}
module.exports=coverage;
if(require.main===module)(async()=>{
 const {chromium}=require('playwright'),base=process.argv[2],out=process.argv[3];fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});await page.goto(base+'?view=hero&h=0.55');await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await page.waitForTimeout(700);
  const r=await coverage(page,out,process.argv[4]?fs.readFileSync(process.argv[4]):undefined);fs.writeFileSync(path.join(out,'flower-mask.png'),Buffer.from(r.maskPng.split(',')[1],'base64'));delete r.maskPng;r.pass=r.share>=.18;
  fs.writeFileSync(path.join(out,'flower-coverage.json'),JSON.stringify(r,null,2));console.log(JSON.stringify(r));if(!r.pass)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
