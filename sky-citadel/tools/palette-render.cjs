const fs=require('node:fs'),path=require('node:path');
const {measurePixels}=require('./palette-metrics.cjs');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'/opt/homebrew/lib/node_modules']}));
async function capture(pg,dir,name){
 const frames=await pg.evaluate(()=>window.__SKY_DEBUG__.capturePalette());
 fs.mkdirSync(dir,{recursive:true});
 await pg.screenshot({path:path.join(dir,name+'.png')});
 const metrics=await pg.evaluate(async({frames,fn})=>{
  const images={};let width,height;
  for(const [k,src]of Object.entries(frames)){const im=new Image();im.src=src;await im.decode();const c=document.createElement('canvas');c.width=width=im.width;c.height=height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);images[k]=g.getImageData(0,0,width,height).data;}
  return(0,eval)('('+fn+')')({...images,width,height});
 },{frames,fn:measurePixels.toString()});
 for(const k of ['mask','subject','background'])fs.writeFileSync(path.join(dir,name+'-'+k+'.png'),Buffer.from(frames[k].split(',')[1],'base64'));
 return metrics;
}
async function renderViews({base,out,query='',views=['hero','night','wide'],periods=false}){
 const browser=await chromium.launch({channel:'chrome',headless:true});const report={date:new Date().toISOString(),browser:browser.version(),base,query,views:[],errors:[]};
 try{for(const view of views){const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1}),pg=await ctx.newPage();pg.on('pageerror',e=>report.errors.push(e.message));pg.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  const url=new URL(base);url.searchParams.set('debug','1');url.searchParams.set('view',view);for(const[k,v]of new URLSearchParams(query))url.searchParams.set(k,v);
  await pg.goto(url.href);await pg.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100,timeout:60000});await pg.waitForTimeout(650);
  const metrics=await capture(pg,out,view),snapshot=await pg.evaluate(()=>window.__PLAYTEST__.snapshot());report.views.push({view,metrics,snapshot});
  if(periods&&view==='hero'){report.periods=[];for(const [name,hour]of [['dawn',0],['noon',1],['dusk',2],['night',3]]){await pg.click('[data-time="'+hour+'"]');await pg.waitForTimeout(550);report.periods.push({name,metrics:await capture(pg,out,'time-'+name),snapshot:await pg.evaluate(()=>window.__PLAYTEST__.snapshot())});}}
  await ctx.close();
 }}finally{await browser.close();}
 fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(report,null,2));return report;
}
if(require.main===module)renderViews({base:process.argv[2]||'file://'+path.resolve(__dirname,'../dist/index.html'),out:process.argv[3]||'shots/r3-current',query:process.argv[4]||''}).then(r=>console.log(JSON.stringify(r.views.map(v=>({view:v.view,...v.metrics})),null,2))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={capture,renderViews};
