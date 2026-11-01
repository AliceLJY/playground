// Pixel colours from the normal render, projected regions from the identical audit build.
// NODE_PATH="$(npm root -g)" node tools/r5-check.cjs <out-dir> <audit-url>
const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
(async()=>{
 const out=path.resolve(process.argv[2]||'shots/r5/metrics'),base=process.argv[3]||'file://'+path.resolve('shots/r5/audit.html');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={base,browser:browser.version(),samples:[],checks:[],errors:[]};
 try{const pg=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 pg.on('pageerror',e=>report.errors.push(e.message));await pg.clock.install();
 for(const view of ['hero','bridge']){
  await pg.goto(base+'?view='+view+'&h=0');await pg.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await pg.waitForTimeout(3000);await pg.clock.pauseAt(new Date(Date.now()+100));
  const state=await pg.evaluate(()=>({state:window.__huacheng.state(),info:window.__huacheng.info(),subjects:window.__huacheng.subjectBoxes()}));if(state.state.view!==view)throw Error('wrong view');
  const regions=await pg.evaluate(()=>window.__r5Regions());await pg.evaluate(()=>{window.__r5Mask=window.__flowerAudit();window.__r5Struct=window.__r5Structure();});
  const png=await pg.screenshot({path:path.join(out,view+'.png')});
  const pixels=await pg.evaluate(async({b64,regions})=>{
   const mask=window.__r5Mask,structure=window.__r5Struct;
   const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();const c=document.createElement('canvas');c.width=1440;c.height=900;const g=c.getContext('2d');g.drawImage(im,0,0,c.width,c.height);const d=g.getImageData(0,0,c.width,c.height).data;
   const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};
   const inside=(x,y,p)=>{let ok=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!=(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])ok=!ok;}return ok;};
   const inBox=(x,y,b)=>x>=Math.ceil(b.x0*1440)&&x<Math.floor(b.x1*1440)&&y>=Math.ceil(b.y0*900)&&y<Math.floor(b.y1*900);
   let total=0,neutral=0,structurePixels=0,structureAny=0,flower=0;const water=[[],[],[]],bg=[[],[],[]],tower=[];
   for(let y=0;y<900;y++)for(let x=0;x<1440;x++){
    const i=y*1440+x,r=d[i*4],gr=d[i*4+1],b=d[i*4+2],ma=Math.max(r,gr,b),mi=Math.min(r,gr,b),s=ma?(ma-mi)/ma:0,l=(.2126*r+.7152*gr+.0722*b)/255;
    const delta=ma-mi;let hue=delta===0?0:ma===r?60*((gr-b)/delta%6):ma===gr?60*((b-r)/delta+2):60*((r-gr)/delta+4);hue=(hue+360)%360;
    if(inBox(x,y,regions.bridge)){total++;if(structure[i])structureAny++;if(s<=.12&&l>=.35)neutral++;if(structure[i]&&s<=.16&&l>=.3)structurePixels++;if(mask.mask[i]===2&&(hue>=285||hue<=65)&&s>=.18&&ma>=41)flower++;}
    if(inBox(x,y,regions.canton))tower.push(l);
    if(inside(x,y,regions.water)&&mask.mask[i]===0){water[0].push(r);water[1].push(gr);water[2].push(b);}
    if(x>=420&&x<520&&y>=40&&y<100){bg[0].push(r);bg[1].push(gr);bg[2].push(b);}
   }
   const w=water.map(mean),background=bg.map(mean);
   return {bridge:{pixels:total,structureGeometry:structureAny/total,structureColour:structurePixels/total,neutralColour:neutral/total,flowerColour:flower/total},water:{pixels:water[0].length,rgb:w,background,distance:Math.hypot(...w.map((v,i)=>v-background[i]))},tower:{pixels:tower.length,sd:sd(tower)}};
  },{b64:png.toString('base64'),regions});
  report.samples.push({view,...state,regions,pixels});
  const check=(id,pass,detail)=>report.checks.push({id,pass,detail});
  // Thresholds recalibrated 2026-11-02 by the director: structure geometry can cover at most ~18 % (hero) / ~13 % (bridge) of this box,
  // so the original 30 % was unreachable. ca58b02 read 4.10 % / 1.08 %, round 5 17.48 % / 12.59 %. Flower density is judged in the close view.
  check('R5-bridge-'+view,pixels.bridge.structureColour>=.10&&pixels.bridge.flowerColour>=(view==='bridge'?.25:.10),pixels.bridge);
  if(view==='hero'){
   const inv=state.info.inventory,n=name=>inv.find(m=>m.name===name)?.count||0,leaves=n('flower-vine-leaves'),petals=n('bougainvillea-bracts'),leafShare=leaves/(leaves+petals);check('R5-leaf-mix',leafShare>=.28&&leafShare<=.32,{leaves,petals,leafShare});
   const cars=await pg.evaluate(()=>window.__r5Cars());check('R5-cars',cars.length<=6&&cars.every(c=>c.size[0]>=4.4&&c.size[0]<=4.6&&c.size[1]>=1.40&&c.size[1]<=1.50&&c.size[2]>=1.75&&c.size[2]<=1.90),cars);
   const w=pixels.water;check('R5-blue-river',w.pixels>=1000&&w.rgb[2]>w.rgb[0]&&w.distance>=25,w);
   check('R5-tower-contrast',pixels.tower.sd>=.065,pixels.tower);
   const width=state.subjects.base.x1-state.subjects.base.x0;check('R5-board-width',width>=.55&&width<=.68,{width});
   await pg.mouse.move(1000,450);await pg.mouse.wheel(0,-100);await pg.clock.runFor(250);
   const zoomed=await pg.evaluate(()=>window.__huacheng.subjectBoxes().base),zoomRatio=(zoomed.x1-zoomed.x0)/width;check('hero-wheel-visible-zoom',zoomRatio>1.04,{zoomRatio});
  }await pg.clock.resume();
 }
 report.checks.push({id:'errors',pass:report.errors.length===0,detail:report.errors});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));for(const c of report.checks)console.log(`${c.pass?'PASS':'FAIL'} ${c.id} ${JSON.stringify(c.detail)}`);if(report.checks.some(c=>!c.pass))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
