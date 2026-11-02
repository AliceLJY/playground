// Native 1080x1920, 30 fps page-clock recording; no downloaded media/dependencies.
// NODE_PATH="$(npm root -g)" node tools/record.cjs <media-dir> --preview|--render|--check
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync,spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const ROOT=path.resolve(__dirname,'..'),FPS=30,DURATION=52;
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((n,i)=>n+(b[i]-n)*u);
function travel(u){u=clamp(u);const r=.15;if(u<r)return u*u/(2*r*(1-r));if(u>1-r)return 1-(1-u)**2/(2*r*(1-r));return (u-r/2)/(1-r);}
// Long-lens v3 score. Horizontal train-to-camera heading replaces the v2 optical-axis rule.
// Both visible layers of every dissolve are audited independently.
const SHOTS=[
 {
  "id": "bank",
  "start": 0,
  "end": 6,
  "label": "东端长焦慢推",
  "from": [
   148.87189792,
   117.75781691,
   28.58091594
  ],
  "to": [
   146.87189792,
   117.75781691,
   28.58091594
  ],
  "look": [
   5,
   14,
   -2
  ],
  "lookTo": [
   3,
   14,
   -2
  ],
  "fov": 32,
  "shift": 0,
  "simOffset": 30
 },
 {
  "id": "station",
  "start": 6,
  "end": 16,
  "label": "江侧斜看白鹤翼站台",
  "from": [
   -100.11348337,
   86.27681404,
   -61.02769619
  ],
  "to": [
   -98.11348337,
   86.27681404,
   -61.02769619
  ],
  "look": [
   -25,
   4,
   2
  ],
  "lookTo": [
   -23,
   4,
   2
  ],
  "fov": 28,
  "shift": 0.1
 },
 {
  "id": "bridge",
  "start": 16,
  "end": 26,
  "label": "花桥侧移，电车远去",
  "from": [
   80.33760758,
   72.72276229,
   12.06368902
  ],
  "to": [
   80.33760758,
   72.72276229,
   14.06368902
  ],
  "look": [
   -5.5,
   5,
   0
  ],
  "lookTo": [
   -5.5,
   5,
   2
  ],
  "fov": 28,
  "shift": -0.2,
  "simOffset": 30
 },
 {
  "id": "arch",
  "start": 26,
  "end": 33,
  "label": "花拱长焦远眺",
  "from": [
   101.5395759,
   71.64445491,
   -1.2282706
  ],
  "to": [
   103.5395759,
   71.64445491,
   -1.2282706
  ],
  "look": [
   19,
   7,
   -7
  ],
  "lookTo": [
   21,
   7,
   -7
  ],
  "fov": 28,
  "shift": -0.1,
  "simOffset": 30
 },
 {
  "id": "pagoda",
  "start": 33,
  "end": 42,
  "label": "赤岗塔与花树",
  "look": [
   41,
   8,
   -4
  ],
  "lookTo": [
   41,
   8,
   -4
  ],
  "fov": 28,
  "shift": -0.22,
  "orbit": [
   41,
   -4
  ],
  "radius": 54.63694682335585,
  "height": 73.11377767,
  "angles": [
   70,
   74
  ],
  "simRange": [
   54.4,
   58.5
  ]
 },
 {
  "id": "blue",
  "start": 42,
  "end": 52,
  "label": "长焦蓝调全景",
  "from": [
   147.27332127,
   116.60495228,
   28.24112799
  ],
  "to": [
   152.86833953,
   120.63997849,
   29.43038583
  ],
  "look": [
   5,
   14,
   -2
  ],
  "lookTo": [
   5,
   14,
   -2
  ],
  "fov": 32,
  "shift": 0
 }
];
const SIM=[[0,10],[6,15],[8,16],[16,20.5],[26,23.4],[33,24.4],[42,39],[50,45],[52,45]];
function curve(keys,t){let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;const h=keys[i+1][0]-keys[i][0],u=clamp((t-keys[i][0])/h);const slope=k=>{if(k===0||k===keys.length-1)return 0;const a=(keys[k][1]-keys[k-1][1])/(keys[k][0]-keys[k-1][0]),b=(keys[k+1][1]-keys[k][1])/(keys[k+1][0]-keys[k][0]);return a*b<=0?0:2*a*b/(a+b);};return(2*u**3-3*u*u+1)*keys[i][1]+(u**3-2*u*u+u)*h*slope(i)+(-2*u**3+3*u*u)*keys[i+1][1]+(u**3-u*u)*h*slope(i+1);}
function shotFrame(s,t){const u=travel((t-s.start)/((s.id==='blue'?50:s.end)-s.start));let pos;if(s.orbit){const a=(s.angles[0]+(s.angles[1]-s.angles[0])*u)*Math.PI/180;pos=[s.orbit[0]+s.radius*Math.sin(a),s.height,s.orbit[1]+s.radius*Math.cos(a)];}else pos=mix(s.from,s.to,u);return{shot:s.id,pos,target:mix(s.look,s.lookTo||s.look,u),fov:s.fov+((s.fovTo??s.fov)-s.fov)*u,shift:s.shift,seconds:s.simRange?s.simRange[0]+(s.simRange[1]-s.simRange[0])*u:curve(SIM,Math.min(t,50))+(s.simOffset||0),day:.80*ease((t-42)/8),title:t<6?1-ease((t-4.5)/1):0,credit:0,fade:0};}
function sample(t){t=Math.max(0,Math.min(DURATION,t));for(let i=1;i<SHOTS.length;i++){const b=SHOTS[i].start;if(Math.abs(t-b)<.4-1e-9)return{current:shotFrame(SHOTS[i],t),previous:shotFrame(SHOTS[i-1],t),blend:ease((t-b+.4)/.8)};}const s=SHOTS.find(s=>t<s.end)||SHOTS.at(-1);return{current:shotFrame(s,t),previous:null,blend:1};}
const KEY_TIMES=[0,3,5.6,6.4,11,15.6,16.4,21,25.6,26.4,29.5,32.6,33.4,37.5,41.6,42.4,47,52];
const distanceBox=(p,b)=>Math.hypot(...p.map((n,i)=>Math.max(b.min[i]-n,n-b.max[i],0)));
const round=x=>Number(x.toFixed(6));
async function openRecording(OUT){
 const {chromium}=require('playwright'),{build}=require('../node_modules/esbuild');
 const bundled=await build({entryPoints:[path.join(ROOT,'src/main.js')],bundle:true,minify:true,format:'iife',target:'es2020',write:false,legalComments:'inline'});
 const html=fs.readFileSync(path.join(ROOT,'index.template.html'),'utf8').replace('<!--BUNDLE-->',()=>'<script>'+bundled.outputFiles[0].text.replace(/<\/script/g,'<\\/script')+'</script>');
 const buildPath=path.join(OUT,'record-page.html');fs.writeFileSync(buildPath,html);
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});
 try{const ctx=await browser.newContext({viewport:{width:360,height:640},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.clock.install({time:0});await page.goto(pathToFileURL(buildPath).href+'?view=hero&record=1');
 await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});await page.clock.pauseAt(await page.evaluate(()=>Date.now()+50));await page.evaluate(()=>document.fonts.ready);
 const info=await page.evaluate(()=>window.__huacheng.info());console.log('renderer',info.renderer);assert.ok(!/SwiftShader/.test(info.renderer),'hardware GPU required');return{browser,page,errors,info};
 }catch(e){await browser.close();throw e;}
}
async function sheet(page,cells,dest,cols=3){
 const png=await page.evaluate(async({cells,cols})=>{const w=270,h=480,label=30,gap=12,c=document.createElement('canvas');c.width=cols*w+(cols+1)*gap;c.height=Math.ceil(cells.length/cols)*(h+label+gap)+gap;const g=c.getContext('2d');g.fillStyle='#151b21';g.fillRect(0,0,c.width,c.height);g.font='18px Helvetica';g.imageSmoothingQuality='high';for(let i=0;i<cells.length;i++){const im=new Image();im.src='data:image/png;base64,'+cells[i].data;await im.decode();if(im.width!==1080||im.height!==1920)throw Error('Wrong native screenshot size');const x=gap+(i%cols)*(w+gap),y=gap+Math.floor(i/cols)*(h+label+gap);g.drawImage(im,x,y,w,h);g.fillStyle='#e8edf1';g.fillText(cells[i].label,x+5,y+h+22);}return c.toDataURL('image/png').split(',')[1];},{cells,cols});fs.writeFileSync(dest,Buffer.from(png,'base64'));
}
async function audit(page,info,errors,OUT,browser,draft){
 const inventory=await page.evaluate(()=>window.__huacheng.recordInventory()),raw=[];
 const samples=Array.from({length:DURATION*FPS+1},(_,i)=>({at:i/FPS,...sample(i/FPS)}));
 for(let start=0;start<samples.length;start+=120)raw.push(...await page.evaluate(batch=>batch.map(s=>({at:s.at,blend:s.blend,layers:[...(s.previous?[{role:'previous',weight:1-s.blend,shot:s.previous.shot,...window.__huacheng.recordMeasure(s.previous)}]:[]),{role:'current',weight:s.blend,shot:s.current.shot,...window.__huacheng.recordMeasure(s.current)}]})),samples.slice(start,start+120)));
 const minima={},perShot={};let bridgePass=false,stationDeparture=false;
 for(const row of raw)for(const l of row.layers){assert.equal(l.view,'record');const s=perShot[l.shot]||(perShot[l.shot]={altitudeMin:Infinity,altitudeMax:0,distance:Infinity,angleMin:Infinity,angleMax:0,pitchMin:Infinity,pitchMax:0,tramWidth:0,bridgeWidthMin:Infinity,pagodaHeightMin:Infinity,pagodaHeightMax:0});
 for(const [key,v,mode] of [['altitudeMin',l.groundHeightLowerBound,'min'],['altitudeMax',l.cam[1],'max'],['angleMin',l.opticalAxisAngle,'min'],['angleMax',l.opticalAxisAngle,'max'],['pitchMin',l.pitch,'min'],['pitchMax',l.pitch,'max'],['tramWidth',l.tramWidth,'max'],['bridgeWidthMin',Math.max(0,Math.min(1,l.subjects.bridge.x1)-Math.max(0,l.subjects.bridge.x0)),'min'],['pagodaHeightMin',l.subjects.pagoda.height,'min'],['pagodaHeightMax',l.subjects.pagoda.height,'max']])s[key]=Math[mode](s[key],v);
 for(const o of [...inventory.static,...l.objects]){const d=distanceBox(l.cam,o);s.distance=Math.min(s.distance,d);if(!minima[o.id]||d<minima[o.id].distance)minima[o.id]={id:o.id,distance:d,at:row.at,shot:l.shot};}
 const tr=l.objects.find(o=>o.id==='tram');if(l.shot==='bridge'&&tr.min[0]<-5.5&&tr.max[0]>-5.5)bridgePass=true;if(l.shot==='station'&&tr.max[0]>-28)stationDeparture=true;delete l.objects;
 }
 const all=Object.values(perShot),coverage=[];
 // Every 10 video frames and the exact last frame. At dissolves, audit each real
 // contributing image independently and report the alpha-weighted displayed fraction.
 const times=draft?KEY_TIMES:samples.filter((_,i)=>i%10===0).map(s=>s.at);
 for(const at of times){const s=sample(at),layers=[];for(const [frame,weight] of [...(s.previous?[[s.previous,1-s.blend]]:[]),[s.current,s.blend]]){const p=await page.evaluate(f=>window.__huacheng.recordCoverage(f),frame);layers.push({shot:frame.shot,weight,...p,minBoard:['bank','blue'].includes(frame.shot)?.30:.50});}const displayed={};for(const k of ['board','sky','water','empty','other'])displayed[k]=layers.reduce((n,l)=>n+l[k]*l.weight,0);coverage.push({at,layers,displayed,pass:layers.every(l=>l.board>=l.minBoard&&l.empty<=.45)});if(coverage.length%20===0)console.log('pixel coverage',coverage.length,'/',times.length);}
 const baseline=[];const previousPath=path.join(OUT,'record-step1.cjs');if(fs.existsSync(previousPath)){const previous=require(previousPath);for(const at of [0,21]){const p=await page.evaluate(f=>window.__huacheng.recordCoverage(f),previous.sample(at).current);baseline.push({at,...p,exposesSparseFrame:p.board<.5||p.empty>.45});}assert.ok(baseline.some(r=>r.exposesSparseFrame),'Coverage check must detect the previous distant framing');}
 const layers=raw.flatMap(r=>r.layers.map(l=>({...l,at:r.at})));
 const visibleTrams=layers.filter(l=>l.tramVisible),towerReadings=Object.fromEntries(['pagoda','canton'].map(id=>[id,layers.filter(l=>l.towerAxes[id].visible).map(l=>({at:l.at,shot:l.shot,tilt:l.towerAxes[id].tilt}))]));
 const checks={telephotoFov:{threshold:'24–32 degrees vertical',min:Math.min(...layers.map(l=>l.fov)),max:Math.max(...layers.map(l=>l.fov)),pass:layers.every(l=>l.fov>=24&&l.fov<=32)},towerAxisTilt:{threshold:'<=6 degrees in screen pixels whenever tower intersects view; both dissolve layers',towers:Object.fromEntries(Object.entries(towerReadings).map(([k,a])=>[k,{visibleSamples:a.length,worst:a.reduce((p,r)=>r.tilt>p.tilt?r:p,{tilt:-1})}])),pass:Object.values(towerReadings).every(a=>a.length>0&&a.every(r=>r.tilt<=6))},tramHeadingAway:{threshold:'horizontal heading dot horizontal tram-to-camera <=0.35 whenever tram intersects view',visibleSamples:visibleTrams.length,max:Math.max(...visibleTrams.map(l=>l.tramFacingDot)),pass:visibleTrams.length>0&&visibleTrams.every(l=>l.tramFacingDot<=.35)},whiteRoofArea:{threshold:'<=12% of screen; clipped real triangle area sum is conservative upper bound',maxUpperBound:Math.max(...layers.map(l=>l.whiteRoofUpperBound)),maxVisiblePixels:Math.max(...coverage.flatMap(r=>r.layers.map(l=>l.whiteRoof))),pass:layers.every(l=>l.whiteRoofUpperBound<=.12)&&coverage.every(r=>r.layers.every(l=>l.whiteRoof<=.12))},altitude:{threshold:'>=10 m above highest terrain; v3 telephoto pullback supersedes v2 height ceilings',pass:all.every(s=>s.altitudeMin>=10)},objectDistance:{threshold:'>=10 m from conservative surface bounds',pass:all.every(s=>s.distance>=10)},tramScreenWidth:{threshold:'<=45%, full unclipped geometry when visible',pass:all.every(s=>s.tramWidth<=.45)},pitch:{threshold:'35–55 deg',pass:all.every(s=>s.pitchMin>=35&&s.pitchMax<=55)},bridgeScreenWidth:{threshold:'>=60%',pass:perShot.bridge.bridgeWidthMin>=.60},pagodaScreenHeight:{threshold:'35–55%',pass:perShot.pagoda.pagodaHeightMin>=.35&&perShot.pagoda.pagodaHeightMax<=.55},bridgeTramPass:{pass:bridgePass},stationDeparture:{pass:stationDeparture},boardPixels:{threshold:'>=50%; title and final ascent >=30%',pass:coverage.every(r=>r.layers.every(l=>l.board>=l.minBoard))},emptyPixels:{threshold:'pure sky + pure river <=45%',pass:coverage.every(r=>r.layers.every(l=>l.empty<=.45))},finalHour:{actual:sample(52).current.day,pass:sample(52).current.day===.8},finalHold:{threshold:'50–52 s all state held',pass:JSON.stringify(sample(50))===JSON.stringify(sample(52))},pageErrors:{pass:errors.length===0}};
 return{version:'3.0',legacyOpticalAxis:{status:'superseded by user v3 horizontal heading-to-camera rule; retained as per-shot diagnostic',min:Math.min(...all.map(s=>s.angleMin)),max:Math.max(...all.map(s=>s.angleMax))},generatedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),mode:draft?'DRAFT only':'full audit',sampling:{fps:FPS,geometryFrames:raw.length,coverageEveryFrames:draft?null:10,coverageFrames:coverage.length,dissolveSeconds:.8},capture:{browser:browser.version(),viewport:[360,640],dpr:3,pixels:[1080,1920],info},method:{...inventory,angle:'Legacy optical-axis angle plus v3 horizontal train-to-camera heading dot. Tower axis uses base/top world points projected to 1080x1920 pixels; visibility uses clipped bounds.',roof:'Every frame clips the rendered roof triangles against all six frustum planes and sums absolute projected areas. This upper bound includes hidden and self-overlapping geometry. GPU ID sampling separately counts visible roof pixels.',pixels:'1080x1920 native GPU ID pass, same camera/vertex programs/wind/instancing/depth. Transparent glass and decals omitted; postprocessing not classified. Near land/plants/buildings red, sky green, river blue. Distant bank/city and vehicles excluded from board count. Each dissolve layer separately passes; displayed fractions are alpha weighted.'},baseline,perShot,perObjectMinima:Object.values(minima).map(o=>({...o,pass:o.distance>=10})).sort((a,b)=>a.distance-b.distance),checks,shots:SHOTS,keyTimes:KEY_TIMES,coverage,samples:raw,errors};
}
async function main(){
 const OUT=path.resolve(process.argv[2]||''),args=process.argv.slice(3),render=args.includes('--render'),checkOnly=args.includes('--check'),draft=args.includes('--draft');
 if(!process.argv[2]||OUT===path.resolve(ROOT,'..')||OUT.startsWith(path.resolve(ROOT,'..')+path.sep))throw Error('Supply a media output directory outside the repository');
 if(args.some(a=>!['--check','--preview','--render','--draft'].includes(a)))throw Error('Unknown option');fs.mkdirSync(OUT,{recursive:true});
 const {browser,page,errors,info}=await openRecording(OUT);
 try{
 const report=await audit(page,info,errors,OUT,browser,draft);
 if(!checkOnly){const dest=path.join(OUT,'keyframes-v3');fs.mkdirSync(dest,{recursive:true});report.keyframes=[];const cells=[];
 for(let i=0;i<KEY_TIMES.length;i++){const at=KEY_TIMES[i],s=sample(at),state=await page.evaluate(s=>window.__huacheng.recordFrame(s.current,s.previous,s.blend),s);assert.deepEqual(state.cam,s.current.pos);const file=String(i+1).padStart(2,'0')+'-'+at.toFixed(2)+'s.png',png=await page.screenshot({path:path.join(dest,file),scale:'device'});report.keyframes.push({at,shot:s.current.shot,file,state});cells.push({label:(Math.floor(i/3)+1)+' / '+at.toFixed(2)+' s',data:png.toString('base64')});console.log('keyframe',i+1,'/',KEY_TIMES.length);}
 await sheet(page,cells,path.join(OUT,'keyframes-v3.png'));
 report.timingCheck=[];for(const at of [3,6,50]){const s=sample(at);await page.evaluate(s=>window.__huacheng.recordFrame(s.current,s.previous,s.blend),s);await page.evaluate(async()=>{const im=document.querySelector('#record-dissolve');if(im.src)await im.decode();});const a=await page.screenshot();await new Promise(r=>setTimeout(r,1000));const b=await page.screenshot();
 const delta=await page.evaluate(async([a,b])=>{const read=async s=>{const im=new Image();im.src='data:image/png;base64,'+s;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,c.width,c.height).data;};const p=await read(a),q=await read(b);let n=0,changed=0,max=0;for(let i=0;i<p.length;i+=4){const d=Math.abs(p[i]-q[i])+Math.abs(p[i+1]-q[i+1])+Math.abs(p[i+2]-q[i+2]);if(d>0)changed++;if(d>24)n++;max=Math.max(max,d);}return{significantFraction:n/(p.length/4),anyDifferenceFraction:changed/(p.length/4),maxRgbDelta:max};},[a.toString('base64'),b.toString('base64')]);
 fs.writeFileSync(path.join(OUT,'timing-'+at+'-immediate.png'),a);fs.writeFileSync(path.join(OUT,'timing-'+at+'-delayed.png'),b);
 report.timingCheck.push({at,...delta,threshold:'sum RGB delta >24 in <0.05% of native pixels',pass:delta.significantFraction<.0005});}report.checks.pageClockDeterminism={pass:report.timingCheck.every(r=>r.pass)};
 }
 report.allPassed=Object.values(report.checks).every(c=>c.pass);fs.writeFileSync(path.join(OUT,'camera-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({perShot:report.perShot,checks:report.checks,nearest:report.perObjectMinima.slice(0,3),coverage:report.coverage.map(r=>({at:r.at,...r.displayed}))},null,2));
 if(render){assert.ok(report.allPassed,'Camera checks must all pass before full recording');assert.ok(!draft,'No draft render');
 const sceneFile=path.join(OUT,'huacheng-scene-v3-silent.mp4');const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',sceneFile],{stdio:['pipe','ignore','pipe']});let fferr='';ff.stderr.on('data',b=>fferr+=b);ff.stdin.on('error',()=>{});const completed=new Promise((resolve,reject)=>{ff.once('error',reject);ff.once('close',c=>c===0?resolve():reject(Error('ffmpeg: '+fferr)));});
 for(let i=0;i<DURATION*FPS;i++){await page.clock.runFor(1000/FPS);const s=sample(i/FPS);await page.evaluate(s=>window.__huacheng.recordFrame(s.current,s.previous,s.blend),s);await page.evaluate(async()=>{const im=document.querySelector('#record-dissolve');if(+im.style.opacity>0)await im.decode();});const png=await page.screenshot({scale:'device'});if(!ff.stdin.write(png))await Promise.race([new Promise(r=>ff.stdin.once('drain',r)),completed.then(()=>{throw Error('Encoder ended early');})]);if(i%90===0)console.log('recorded',i,'/',DURATION*FPS);}
 ff.stdin.end();await completed;assert.deepEqual(errors,[]);
 // Exact adjoining cut retains every frame of the approved, immutable endcard.
 const endcard=path.join(OUT,'endcard/endcard.mp4'),total=DURATION+5.6;
 execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',sceneFile,'-i',endcard,'-filter_complex','[0:v]setsar=1,setpts=PTS-STARTPTS[a];[1:v]setsar=1,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-r','30','-an','-movflags','+faststart',path.join(OUT,'huacheng-demo-v3-silent-1080x1920.mp4')]);
 fs.writeFileSync(path.join(OUT,'events-v3.json'),JSON.stringify({seconds:total,sceneSeconds:DURATION,endcardSeconds:5.6,endcardAt:DURATION,cues:{bridge:16,arch:26,lights:47,signature:52,seal:53.8,fingerprint:54.8},shots:SHOTS},null,2));console.log('silent scene + endcard complete',total);
 }
 }finally{await browser.close();}
}
module.exports={sample,shotFrame,SHOTS,KEY_TIMES,FPS,DURATION,openRecording,sheet,distanceBox};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
