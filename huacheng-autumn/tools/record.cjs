// Offline portrait score. Media/builds never go in the repository.
// NODE_PATH="$(npm root -g)" node tools/record.cjs <out-dir> [--preview | --check | --range 30:46]
// Existing Chrome / Playwright / esbuild / ffmpeg only; source and normal page are unchanged visually.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright'),{build}=require('../node_modules/esbuild');
const ROOT=path.resolve(__dirname,'..'),OUT=path.resolve(process.argv[2]||''),FPS=30,DURATION=58;
if(!process.argv[2]||OUT===path.resolve(ROOT,'..')||OUT.startsWith(path.resolve(ROOT,'..')+path.sep))throw Error('Supply a media output directory outside the repository');
const preview=process.argv.includes('--preview'),checkOnly=process.argv.includes('--check');
const rangeIndex=process.argv.indexOf('--range'),range=rangeIndex<0?null:(process.argv[rangeIndex+1]||'').split(':').map(Number);
if(range&&!(range.length===2&&range.every(Number.isFinite)&&range[0]>=0&&range[1]<=DURATION&&range[1]>range[0]))throw Error('--range requires START:END within 0:58');
if(range)for(let i=0;i<DURATION*FPS;i++)assert.ok(fs.existsSync(path.join(OUT,'frames',String(i).padStart(5,'0')+'.jpg')),'Partial retake requires an existing complete sequence');
const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
// Monotone cubic interpolation, C1 across the keys, no position overshoot at turns.
function curve(keys,t){
 let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;
 const h=keys[i+1][0]-keys[i][0],u=Math.max(0,Math.min(1,(t-keys[i][0])/h));
 const slope=k=>{if(k===0||k===keys.length-1)return 0;const a=(keys[k][1]-keys[k-1][1])/(keys[k][0]-keys[k-1][0]),b=(keys[k+1][1]-keys[k][1])/(keys[k+1][0]-keys[k][0]);return a*b<=0?0:2*a*b/(a+b);};
 return (2*u**3-3*u*u+1)*keys[i][1]+(u**3-2*u*u+u)*h*slope(i)+(-2*u**3+3*u*u)*keys[i+1][1]+(u**3-u*u)*h*slope(i+1);
}
(async()=>{
 const core=await import(pathToFileURL(path.join(ROOT,'src/core.js')));
 const sim=v=>curve([[0,50],[10,60],[16,76],[24,84],[28,86],[40,90],[56,106],[58,106]],Math.min(v,56));
 const existing=name=>core.pathAt(core.VIEWS[name]);
 const hero={pos:[95,55,52],target:[0,12,-12]},arch=existing('arch'),wide={pos:[104,70,46],target:[-1,10,-13]};
 // time, position, target, vertical FOV, vertical lens shift. Only the lens differs from the normal mobile layout.
 const keys=[
  [0,hero.pos,hero.target,80,.18],[4,[93,54,52],hero.target,80,.12],
  [9,[-21,23,36],[-53,16,-3],72,0],[12,[-28,18,25],[-53,16,-3],72,0],
  [14,[-54,16,20],[-46,5,0],76,0],[16,[-63,6.5,7],[-43,3,0],76,0],
  ...[17.5,19,22,24,26].map(v=>[v,[core.tramAt(sim(v)).x-18,3.4,-.15],[core.tramAt(sim(v)).x+8,3.5,0],76,0]),
  [28,[18,14,-3],[31,7,-14],76,0],[30,[32,12,-18],[16,8,-35],70,0],
  [32,arch.pos,arch.target,64,0],[34,[28.5,3.3,-12],arch.target,64,0],
  [36,[32,23,-24],[-2,12,-6],72,0],[38,[64,27,-18],[44,12,-6],74,0],[40,[66,18,24],[43,9,-4],70,0],
  [43,[63,18,30],[42,9,-4],72,0],[44,[66,24,40],[28,10,-4],76,0],
  [50,[99,62,47],wide.target,78,0],[54,wide.pos,wide.target,78,0],
  [56,wide.pos,wide.target,78,0],[58,wide.pos,wide.target,78,0]
 ];
 // Interpolate heading/pitch rather than a target passing close to the camera (which can whip-pan).
 const angles=[];for(const k of keys){const d=k[2].map((n,j)=>n-k[1][j]),len=Math.hypot(...d);let yaw=Math.atan2(d[0],d[2]);if(angles.length){const last=angles.at(-1)[1];while(yaw-last>Math.PI)yaw-=2*Math.PI;while(yaw-last<-Math.PI)yaw+=2*Math.PI;}angles.push([k[0],yaw,Math.asin(d[1]/len)]);}
 const pose=v=>{const pos=[0,1,2].map(j=>curve(keys.map(k=>[k[0],k[1][j]]),v)),yaw=curve(angles.map(k=>[k[0],k[1]]),v),pitch=curve(angles.map(k=>[k[0],k[2]]),v);return{pos,target:pos.map((n,j)=>n+100*[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)][j])};};
 const sample=v=>({...pose(v),fov:curve(keys.map(k=>[k[0],k[3]]),v),shift:curve(keys.map(k=>[k[0],k[4]]),v),seconds:sim(v),day:ease((v-46)/9),title:1-ease((v-3.5)/1.0),credit:ease((v-55.2)/.8),fade:ease((v-57)/.95)});
 const layout=core.makeLayout(core.SEED,true),solids=layout.obstacles.filter(b=>b.id!=='tram-range');
 let nearest={distance:Infinity},maxStep=0,previous=sample(0).pos,bridgePass=false;
 for(let i=0;i<DURATION*FPS;i++){
  const v=i/FPS,f=sample(v);maxStep=Math.max(maxStep,core.dist(previous,f.pos));previous=f.pos;
  for(const b of [...solids,...core.trafficAt(f.seconds)]){const d=core.distanceBox(f.pos,b);if(d<nearest.distance)nearest={distance:d,object:b.id,at:v,pos:f.pos};}
  if(f.pos[0]>-7.4&&f.pos[0]<-3.6&&f.pos[1]<5.15)bridgePass=true;
 }
 assert.ok(maxStep<1.2,'camera position discontinuity');assert.ok(bridgePass,'camera must actually travel under bridge');
 fs.mkdirSync(OUT,{recursive:true});
 const manifest={fps:FPS,seconds:DURATION,viewport:[390,693],deviceScaleFactor:1080/390,output:[1080,1920],recordRender:'native DPR locked to 1080/390; same mobile geometry, FXAA, half-resolution GTAO, lighting and materials',simulation:'monotone time score: west arrival 10s, leave 16s, east arrival 40s; night freeze 56s',cues:{bridge:23,arch:32,lights:51,outro:56},shots:[1,10,23,25.5,32.5,41,51,56.5],route:{nearest,maxStep,bridgePass},keys};
 fs.writeFileSync(path.join(OUT,'events.json'),JSON.stringify(manifest,null,2));console.log('route',manifest.route);
 if(checkOnly){assert.ok(nearest.distance>.5,'camera intersects scene: '+JSON.stringify(nearest));return;}
 assert.ok(nearest.distance>.5,'camera intersects scene: '+JSON.stringify(nearest));
 const bundled=await build({entryPoints:[path.join(ROOT,'src/main.js')],bundle:true,minify:true,format:'iife',target:'es2020',write:false,legalComments:'inline'});
 const html=fs.readFileSync(path.join(ROOT,'index.template.html'),'utf8').replace('<!--BUNDLE-->',()=>'<script>'+bundled.outputFiles[0].text.replace(/<\/script/g,'<\\/script')+'</script>');
 const buildPath=path.join(OUT,'record-page.html');fs.writeFileSync(buildPath,html);
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:693},deviceScaleFactor:1080/390,isMobile:true,hasTouch:true});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.clock.install({time:0});await page.goto(pathToFileURL(buildPath).href+'?view=hero&record=1');
  await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await page.clock.pauseAt(await page.evaluate(()=>Date.now()+50));
  await page.evaluate(()=>document.fonts.ready);
  const frame=async v=>{await page.clock.runFor(1000/FPS);return page.evaluate(f=>window.__huacheng.recordFrame(f),sample(v));};
  const info=await page.evaluate(()=>window.__huacheng.info());console.log('renderer',info.renderer,'DPR',info.pixelRatio);
  assert.ok(!/SwiftShader/.test(info.renderer),'hardware GPU required for this recording');
  // B11: same page time immediately / after one REAL second. Image decoding does not need virtual timers.
  const b11=[];
  for(const v of [4,32,55.6,57.3]){
   await frame(v);const a=await page.screenshot();await new Promise(r=>setTimeout(r,1000));const b=await page.screenshot();
   const difference=await page.evaluate(async([a,b])=>{const read=async s=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,c.width,c.height).data;};const p=await read(a),q=await read(b);let n=0;for(let i=0;i<p.length;i+=4)if(Math.abs(p[i]-q[i])+Math.abs(p[i+1]-q[i+1])+Math.abs(p[i+2]-q[i+2])>24)n++;return n/(p.length/4);},[a.toString('base64'),b.toString('base64')]);
   b11.push({at:v,difference});assert.ok(difference<.0005,'B11 screenshot timing difference');
  }
  const dest=path.join(OUT,preview?'preview':'frames');fs.mkdirSync(dest,{recursive:true});
  const states=[],times=preview?manifest.shots:Array.from({length:DURATION*FPS},(_,i)=>i/FPS).filter(v=>!range||(v>=range[0]&&v<range[1]));
  for(let i=0;i<times.length;i++){
   const v=times[i],state=await frame(v),file=path.join(dest,String(preview?i:Math.round(v*FPS)).padStart(5,'0')+(preview?'.png':'.jpg'));
   await page.screenshot({path:file,type:preview?'png':'jpeg',quality:preview?undefined:95,scale:'device'});
   if(preview||i%FPS===0)states.push({frame:Math.round(v*FPS),videoTime:v,...state});
   if(i%150===0)console.log('frames',i,'/',times.length,'video',v.toFixed(2));
  }
  const reportPath=path.join(OUT,preview?'preview-report.json':'record-report.json');if(range&&!preview){const old=JSON.parse(fs.readFileSync(reportPath,'utf8'));states.push(...old.states.filter(s=>s.videoTime<range[0]||s.videoTime>=range[1]));states.sort((a,b)=>a.videoTime-b.videoTime);}fs.writeFileSync(reportPath,JSON.stringify({browser:browser.version(),info,b11,states,errors,retake:range},null,2));assert.deepEqual(errors,[],'page errors');
 }finally{await browser.close();}
 if(!preview){
  execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-framerate',String(FPS),'-i',path.join(OUT,'frames/%05d.jpg'),'-vf','scale=1080:1920:in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited:flags=lanczos,format=yuv420p,setsar=1,setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709','-c:v','libx264','-preset','slow','-crf','18','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-an','-movflags','+faststart',path.join(OUT,'huacheng-demo-silent-1080x1920.mp4')],{stdio:'inherit'});
 }
 console.log(preview?'preview complete':'silent video complete');
})().catch(e=>{console.error(e);process.exitCode=1;});
