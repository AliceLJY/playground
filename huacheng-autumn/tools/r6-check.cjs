// Actual rendered geometry, measured at every simulation frame, independently of descriptor tests.
const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
(async()=>{const out=path.resolve(process.argv[2]||'shots/r6/circulation'),base=process.argv[3]||'file://'+path.resolve('dist/index.html'),baseline=process.argv.includes('--baseline');fs.mkdirSync(out,{recursive:true});
 const b=await chromium.launch({channel:'chrome',headless:true}),report={base,baseline,checks:[],errors:[]};
 try{const pg=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});pg.on('pageerror',e=>report.errors.push(e.message));await pg.goto(base+'?view=hero&t=0');await pg.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await pg.screenshot({path:path.join(out,'boundary.png')});
 const result=await pg.evaluate(baseline=>{
  const h=window.__huacheng,inside=(x,z)=>Math.hypot(Math.max(Math.abs(x)-(baseline?20:58),0),Math.max(Math.abs(z)-(baseline?14.5:18),0))<=2;
  const failures=[],intersects=(a,b)=>a.min.every((v,i)=>v<b.max[i]&&a.max[i]>b.min[i]);let samples=0,minBoundary=Infinity,maxModelError=0;
  for(let frame=0;frame<=(baseline?0:120*60);frame++){
   const time=frame/60,actual=baseline?[{id:'tram',...h.tramGeometryBounds()}]:h.trafficGeometryAt(time),model=baseline?[]:h.traffic(time);
   for(const a of actual){samples++;for(const x of [a.min[0],a.max[0]])for(const z of [a.min[2],a.max[2]])if(!inside(x,z)&&failures.length<5)failures.push({kind:'outside',time,id:a.id,x,z});
    const m=model.find(x=>x.id===a.id);if(m)for(let k=0;k<3;k++){const e=Math.max(m.min[k]-a.min[k],a.max[k]-m.max[k],0);maxModelError=Math.max(maxModelError,e);if(e>.001&&failures.length<5)failures.push({kind:'model-underbounds',time,id:a.id,axis:k,error:e});}
    minBoundary=Math.min(minBoundary,(baseline?22:60)-Math.max(Math.abs(a.min[0]),Math.abs(a.max[0])),(baseline?16.5:20)-Math.max(Math.abs(a.min[2]),Math.abs(a.max[2])));
   }
   for(let i=0;i<actual.length;i++)for(let j=i+1;j<actual.length;j++)if(intersects(actual[i],actual[j])&&failures.length<5)failures.push({kind:'intersection',time,ids:[actual[i].id,actual[j].id]});
  }return {samples,frames:baseline?1:7201,minBoundary,maxModelError,failures};
 },baseline);
 report.checks.push({id:'actual-full-cycle-geometry',pass:result.failures.length===0,detail:result});
 if(!baseline){
  await pg.evaluate(()=>window.__huacheng.setView('arch'));
  const arch=await pg.evaluate(()=>{let h=window.__huacheng,s=h.state(),b=h.worldSubjects().canton,c=s.cam,pts=[];for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]]){const f=(15-c[0])/(x-c[0]),q=[15,c[1]+(y-c[1])*f,c[2]+(z-c[2])*f];pts.push(q);}return {view:s.view,cam:c,apertureHits:pts,pass:s.view==='arch'&&pts.every(p=>p[1]>.4&&Math.abs(p[2]+11)<3.4&&(p[1]<6||Math.hypot(p[1]-6,p[2]+11)<3.4))};});
  report.checks.push({id:'flower-arch-frames-whole-tower',pass:arch.pass,detail:arch});await pg.screenshot({path:path.join(out,'arch.png')});
 }
 report.checks.push({id:'errors',pass:report.errors.length===0,detail:report.errors});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));for(const c of report.checks)console.log(c.id,c.pass,JSON.stringify(c.detail));if(report.checks.some(c=>!c.pass))process.exitCode=1;
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
