// R4 style metrics, same instrumentation and definitions for d1bcc77 and the revision.
const fs=require('fs'),path=require('path'),{chromium}=require('playwright'),coverage=require('./flower-coverage.cjs');
(async()=>{
 const out=path.resolve(process.argv[2]||'shots/r5/architecture'),base=process.argv[3]||'file://'+path.resolve('shots/r5/audit.html'),baseline=process.argv.includes('--baseline');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={base,browser:browser.version(),checks:[],hours:[],errors:[]};
 try{
  const pg=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});pg.on('pageerror',e=>report.errors.push(e.message));await pg.clock.install();
  for(const h of [0,.55]){
   await pg.goto(base+'?view=hero&t=13&h='+h);await pg.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await pg.waitForTimeout(3000);
   // Latch the attained normal quality for paired counterfactual renders; do not force a scale.
   // Otherwise a shader-compile stall can trigger adaptive resizing between on/off screenshots.
   await pg.clock.pauseAt(new Date(Date.now()+100));
   const renderConfig=await pg.evaluate(()=>{const i=window.__huacheng.info();return{w:i.w,h:i.h,dpr:i.dpr,pixelRatio:i.pixelRatio,scaleIdx:i.scaleIdx,msaa:i.msaa,shadowMap:i.shadowMap};});
   const dir=path.join(out,'h-'+h);fs.mkdirSync(dir,{recursive:true});const state=await pg.evaluate(()=>window.__huacheng.state());if(state.view!=='hero'||state.hour!==h)throw Error('wrong state');
   const c=await coverage(pg,dir);fs.writeFileSync(path.join(dir,'flower-mask.png'),Buffer.from(c.maskPng.split(',')[1],'base64'));delete c.maskPng;
   const floor=await pg.evaluate(()=>window.__archFloor());const normal=await pg.screenshot({path:path.join(dir,'normal.png')});
   await pg.evaluate(()=>window.__archShadow(false));await pg.waitForTimeout(250);const unshadowed=await pg.screenshot({path:path.join(dir,'no-shadow.png')});await pg.evaluate(()=>window.__archShadow(true));
   await pg.evaluate(()=>window.__archAO?.(false));const noAO=await pg.screenshot({path:path.join(dir,'no-ao.png')});await pg.evaluate(()=>window.__archAO?.(true));
   const shadow=await pg.evaluate(async({a,b,ao,floor})=>{
    const read=async s=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,c.width,c.height).data;};
    const [d,e,f]=await Promise.all([read(a),read(b),read(ao)]),{width:w,height:ht,mask}=floor,values=[],spots=[],contacts=[];const lum=(p,i)=>(.2126*p[i*4]+.7152*p[i*4+1]+.0722*p[i*4+2])/255;
    // Ground-only pixels, 1px eroded; paired counterfactual avoids different material colours.
    for(let y=1;y<ht-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(![-w-1,-w,-w+1,-1,0,1,w-1,w,w+1].every(k=>mask[i+k]))continue;const light=lum(e,i),shade=lum(d,i);if(light<.12)continue;const aoLight=lum(f,i);if(aoLight>.12&&(aoLight-shade)/aoLight>=.03)contacts.push([x,y,(aoLight-shade)/aoLight]);const contrast=(light-shade)/light;values.push(contrast);if(contrast>=.15)spots.push([x,y,shade,light,contrast]);}
    values.sort((a,b)=>a-b);return{contactSamples:contacts.length,contactExamples:contacts.filter((_,i)=>i%Math.max(1,Math.floor(contacts.length/8))===0).slice(0,8),groundSamples:values.length,shadowSamples:spots.length,shadowShare:spots.length/values.length,p95Contrast:values[Math.floor(values.length*.95)],samples:spots.filter((_,i)=>i%Math.max(1,Math.floor(spots.length/12))===0).slice(0,12)};
   },{a:normal.toString('base64'),b:unshadowed.toString('base64'),ao:noAO.toString('base64'),floor});
   report.hours.push({h,renderConfig,colour:c,shadow});await pg.clock.resume();
  }
  const ref='/Volumes/ColdData/产出/2026-11-01-花城海珠-三维场景/原帖视频/frames/f1.jpg';
  report.reference=await pg.evaluate(async b64=>{const im=new Image();im.src='data:image/jpeg;base64,'+b64;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);const d=g.getImageData(0,0,c.width,c.height).data;
   // Hand-traced scene silhouette in supplied f1, omitting the neutral surrounding floor/sky.
   const polygon=[[0,327],[67,244],[319,154],[431,65],[627,61],[868,102],[967,173],[1275,265],[1255,460],[1010,719],[563,719],[165,474]];
   const inside=(x,y)=>{let ok=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y)!=(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])ok=!ok;}return ok;};let n=0,sum=0;
   for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(inside(x,y)){const i=(y*im.width+x)*4,ma=Math.max(d[i],d[i+1],d[i+2]),mi=Math.min(d[i],d[i+1],d[i+2]);sum+=ma?(ma-mi)/ma:0;n++;}return {file:'f1.jpg',polygon,pixels:n,meanSaturation:sum/n};
  },fs.readFileSync(ref).toString('base64'));
  const day=report.hours[0];
  report.checks.push({id:'B7-flower-area',pass:day.colour.share>=.06&&day.colour.share<=.14,detail:day.colour.share});
  report.checks.push({id:'B7-bridge-focus',pass:day.colour.bridgeColourShare>=.10,detail:day.colour.bridgeColourShare});
  // Interval is fixed after baseline/reference calibration, before the visual implementation.
  report.checks.push({id:'B10-saturation',pass:day.colour.meanSaturation>=.10&&day.colour.meanSaturation<=.28,detail:day.colour.meanSaturation});
  report.checks.push({id:'B11-ground-shadow',pass:day.shadow.p95Contrast>=.15&&day.shadow.shadowSamples>=150,detail:day.shadow});
  report.checks.push({id:'B11-contact-AO',pass:day.shadow.contactSamples>=100,detail:day.shadow.contactSamples});
  report.checks.push({id:'errors',pass:report.errors.length===0,detail:report.errors});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.checks.some(c=>!c.pass)&&!baseline)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
