// Same normal rendering path and adaptive DPR as the released page; sequential GPU use.
const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
(async()=>{const out=path.resolve(process.argv[2]||'shots/r6'),base=process.argv[3]||'file://'+path.resolve('dist/index.html');fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{for(const [w,h] of [[1440,900],[390,664],[412,700]]){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:w<600,hasTouch:w<600}),pg=await ctx.newPage(),errors=[];pg.on('pageerror',e=>errors.push(e.message));await pg.goto(base+'?view=hero');await pg.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await pg.waitForTimeout(2000);
for(const [view,hour,name] of w===1440?[...['hero','station','bridge','arch','pagoda','wide'].map(v=>[v,0,v]),['hero',.55,'hero-dusk'],['hero',1,'hero-night']]:[['hero',0,`phone-${w}x${h}`]]){
await pg.evaluate(({view,hour})=>{const a=window.__huacheng;a.setHour(hour);a.setView(view);a.setTime(13);},{view,hour});await pg.waitForTimeout(250);let data=await pg.evaluate(()=>({state:window.__huacheng.state(),info:window.__huacheng.info(),subjects:window.__huacheng.subjectBoxes(),ui:window.__huacheng.uiBoxes()}));if(data.state.view!==view)throw Error('view mismatch');await pg.screenshot({path:path.join(out,name+'.png')});report.push({name,...data,errors});console.log(name,data.info.calls,data.info.pixelRatio);}
await ctx.close();}
fs.writeFileSync(path.join(out,'shots.json'),JSON.stringify(report,null,2));}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
