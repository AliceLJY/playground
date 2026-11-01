// Twenty real simulation seconds: approach at 28 s, arrive 30, dwell 16 s, reverse 46–48.
// The hook advances time, while each encoded frame is exactly 1/30 s. No time compression.
const fs=require('fs'),path=require('path'),{chromium}=require('playwright'),{spawn}=require('child_process');
(async()=>{const out=path.resolve(process.argv[2]||'shots/r6'),base=process.argv[3]||'file://'+path.resolve('dist/index.html');fs.mkdirSync(out,{recursive:true});
 const b=await chromium.launch({channel:'chrome',headless:true}),states=[],errors=[];
 try{const pg=await b.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});pg.on('pageerror',e=>errors.push(e.message));await pg.clock.install();await pg.goto(base+'?view=pagoda&record=1&t=28');await pg.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await pg.clock.pauseAt(new Date(Date.now()+100));
 await pg.evaluate(()=>{window.__huacheng.setCamera([52,12,26],[44,2,-1]);document.querySelector('.ui').style.display='none';const d=document.createElement('div');d.id='caption';d.style.cssText='position:fixed;bottom:20px;left:28px;color:#27363f;background:#f7f5e8dd;padding:10px 16px;font:18px system-ui;border-radius:3px';document.body.append(d);});
 const ff=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-vcodec','png','-r','30','-i','-','-an','-c:v','libx264','-pix_fmt','yuv420p','-crf','19','-movflags','+faststart',path.join(out,'tram-cycle.mp4')],{stdio:['pipe','ignore','pipe']});let fferr='';ff.stderr.on('data',d=>fferr+=d);const done=new Promise((resolve,reject)=>{ff.on('error',reject);ff.on('exit',c=>c?reject(Error(fferr)):resolve());});
 const picks=new Set([0,60,180,360,540,599]);
 for(let i=0;i<600;i++){
  const time=28+i/30,state=await pg.evaluate(time=>{window.__huacheng.setTime(time);let s=window.__huacheng.state();document.getElementById('caption').textContent=`${time.toFixed(1)} s · ${s.tram.stopped?'到站停靠 · 16 秒':s.tram.dir===1?'平滑进站':'反向驶回广州塔站'}`;return {time,x:s.tram.x,dir:s.tram.dir,stopped:s.tram.stopped,view:s.view};},time);
  const png=await pg.screenshot();if(!ff.stdin.write(png))await new Promise(r=>ff.stdin.once('drain',r));if(picks.has(i)){fs.writeFileSync(path.join(out,`tram-frame-${i}.png`),png);states.push({frame:i,...state});}if(i%120===0)console.log('recorded',i,'/600');
 }
 ff.stdin.end();await done;fs.writeFileSync(path.join(out,'tram-cycle.json'),JSON.stringify({duration:20,fps:30,simulation:[28,48],states,errors},null,2));if(errors.length)throw Error(errors.join('\n'));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
