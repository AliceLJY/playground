// Portrait demo v4, shot list by the director (Claude Code) after Alice turned down v3:
// "其实需要有细节放大的……花啊，桥啊，有些角度要有变化，现在咋都是远景呢".
// Wide establishing shots stay aerial; the close-ups go to what holds up near the lens
// (bougainvillea curtain, silk floss blossom, the arch framing Canton Tower). The tram only
// appears side-on or driving away, never nose-first (her v1 note).
// NODE_PATH="$(npm root -g)" node tools/director.cjs <media-dir> --stills|--render
const fs=require('node:fs'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const {openRecording,sheet,SHOTS:V3}=require('./record.cjs');
const FPS=30,DURATION=45,DISSOLVE=.8;
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((n,i)=>n+(b[i]-n)*u);
let tramX=()=>{throw Error('core not loaded');};
const v3=id=>V3.find(s=>s.id===id);
// sim: scene seconds at shot start/end (tram period 60 s: west stop 0–16, eastbound 16–30, east stop 30–46, westbound 46–60).
// v9 merges Muse's and Grok's reviews of v8 (review-v8/ beside the media). Alice picked Grok's spine:
// "one bridge through one dusk" — open on the flowers, follow the tram until it has gone, change the light
// inside a shot (never across a cut), lamps lag the sky, Canton Tower stays in the last frame.
// h = sky hour at shot start/end, lamps = street/window/tower light level (decoupled from h in ?record=1).
const SHOTS=[
 {id:'curtain',start:0,end:5,from:[14,13,-12],to:[14,13.5,-4],look:[-6,4.5,-1],lookTo:[-6,4.8,2],fov:30,shift:0,sim:[32,37],title:true,h:[0,.02],lamps:[0,0]},
 // Follow the eastbound tram from behind-left: it slides under the curtain and on, and the cut waits until it has gone.
 {id:'tram',start:5,end:13,follow:{offset:[-24,20,-24],look:[10,1,1]},fov:30,shift:0,sim:[18.2,26.2],h:[.02,.08],lamps:[0,0]},
 // Push into the arch; the sky warms inside the shot and lamps come up only in the last seconds.
 {id:'arch',start:13,end:20,dissolve:2,from:[34,3.6,-11.2],to:[28,3.4,-11.2],look:[-67,17,-7],lookTo:[-67,17,-7],fov:28,shift:0,sim:[38,45],h:[.12,.48],lamps:[0,.3],lampsFrom:.55},
 // Same high road-side view of the bridge; dusk falls to night inside the shot while the westbound tram crosses.
 {id:'dusk',start:20,end:29,dissolve:1.5,from:[34,22,30],to:[27,21,29],look:[-22,9,-4],lookTo:[-25,9,-4],fov:30,shift:.1,sim:[47,56],h:[.48,.86],lamps:[.3,.9]},
 // Night: slow orbit and push on the lit Canton Tower, camera kept on the south bank.
 {id:'tower',start:29,end:37,dissolve:2,orbit:[-62,-6],radius:84,radiusTo:70,height:24,heightTo:22,angles:[70,44],look:[-64,20,-5],fov:32,shift:.15,sim:[38,46],h:[.86,.9],lamps:[.9,1]},
 // v11: a dissolve from the tower close-up to the wide doubled the tower, so the camera flies straight out instead:
 // the pull starts exactly where the tower orbit ends (no cut), then a short orbit of the whole board.
 {id:'pull',start:37,end:41,dissolve:0,from:[-13.37,22.00,44.35],to:[111.39,58.00,9.71],look:[-64,20,-5],lookTo:[-10,9,-2],fov:32,shift:.15,shiftTo:0,sim:[46,50],h:[.9,.91],lamps:[1,1]},
 {id:'wide',start:41,end:45,dissolve:0,orbit:[0,-2],radius:112,height:58,angles:[84,74],look:[-10,9,-2],fov:32,shift:0,sim:[50,54],h:[.91,.92],lamps:[1,1]},
];
function lampAt(s,lin){const k=s.lampsFrom?clamp((lin-s.lampsFrom)/(1-s.lampsFrom)):lin;return s.lamps[0]+(s.lamps[1]-s.lamps[0])*ease(k);}
function travel(u){u=clamp(u);const r=.2;if(u<r)return u*u/(2*r*(1-r));if(u>1-r)return 1-(1-u)**2/(2*r*(1-r));return (u-r/2)/(1-r);}
function frameOf(s,t){
 const u=travel((t-s.start)/(s.end-s.start));let pos;
 let target=s.look?mix(s.look,s.lookTo||s.look,u):null;
 if(s.follow){const lin0=clamp((t-s.start)/(s.end-s.start)),x=tramX(s.sim[0]+(s.sim[1]-s.sim[0])*lin0);pos=[x+s.follow.offset[0],s.follow.offset[1],s.follow.offset[2]];target=[x+s.follow.look[0],s.follow.look[1],s.follow.look[2]];}
 else if(s.orbit){const a=(s.angles[0]+(s.angles[1]-s.angles[0])*u)*Math.PI/180,r=s.radius+((s.radiusTo??s.radius)-s.radius)*u,y=s.height+((s.heightTo??s.height)-s.height)*u;pos=[s.orbit[0]+r*Math.sin(a),y,s.orbit[1]+r*Math.cos(a)];}
 else pos=mix(s.from,s.to,u);
 const lin=clamp((t-s.start)/(s.end-s.start));
 return{shot:s.id,pos,target,fov:s.fov,shift:s.shift+((s.shiftTo??s.shift)-s.shift)*u,seconds:s.sim[0]+(s.sim[1]-s.sim[0])*lin,
  day:s.h[0]+(s.h[1]-s.h[0])*ease(lin),lamps:lampAt(s,lin),title:s.title?1-ease((t-3.2)/1):0,credit:0,fade:0};
}
function sample(t){
 t=Math.max(0,Math.min(DURATION-1e-6,t));
 // Alice on v9/v10: cuts into Canton Tower felt abrupt (night, then its first appearance at the arch) — slow dissolves
 // on every cut that changes subject and height; the curtain-to-tram cut keeps the short default.
 for(let i=1;i<SHOTS.length;i++){const b=SHOTS[i].start,d=SHOTS[i].dissolve??DISSOLVE;if(t>=b-d/2&&t<b+d/2)return{current:frameOf(SHOTS[i],t),previous:frameOf(SHOTS[i-1],t),blend:ease((t-b+d/2)/d)};}
 const s=SHOTS.find(s=>t<s.end)||SHOTS.at(-1);return{current:frameOf(s,t),previous:null,blend:1};
}
async function show(page,s){await page.evaluate(s=>window.__huacheng.recordFrame(s.current,s.previous,s.blend),s);await page.evaluate(async()=>{const im=document.querySelector('#record-dissolve');if(+im.style.opacity>0)await im.decode();});}
async function main(){
 const core=await import(require('node:url').pathToFileURL(path.join(__dirname,'../src/core.js')).href);tramX=t=>core.tramAt(t).x;
 const OUT=path.resolve(process.argv[2]||''),mode=process.argv[3];
 if(!process.argv[2]||!['--stills','--render'].includes(mode))throw Error('usage: director.cjs <media-dir> --stills|--render');
 fs.mkdirSync(OUT,{recursive:true});
 const {browser,page,errors}=await openRecording(OUT);
 try{
  if(mode==='--stills'){
   const cells=[],facing=[];
   for(const s of SHOTS)for(const k of [.08,.5,.92]){const at=s.start+(s.end-s.start)*k,smp=sample(at);await show(page,smp);
    const m=await page.evaluate(f=>window.__huacheng.recordMeasure(f),smp.current);facing.push({shot:s.id,at:+at.toFixed(2),tramVisible:m.tramVisible,tramFacingDot:+m.tramFacingDot.toFixed(3),pagodaTilt:m.towerAxes.pagoda.visible?+m.towerAxes.pagoda.tilt.toFixed(1):null,cantonTilt:m.towerAxes.canton.visible?+m.towerAxes.canton.tilt.toFixed(1):null});
    const png=await page.screenshot({scale:'device'});fs.mkdirSync(path.join(OUT,'stills'),{recursive:true});fs.writeFileSync(path.join(OUT,'stills',s.id+'-'+at.toFixed(1)+'.png'),png);cells.push({label:s.id+' '+at.toFixed(1)+' s',data:png.toString('base64')});}
   await sheet(page,cells,path.join(OUT,'stills.png'));fs.writeFileSync(path.join(OUT,'stills.json'),JSON.stringify(facing,null,1));
   console.log(JSON.stringify(facing.filter(f=>f.tramVisible&&f.tramFacingDot>.35)),'tilt>6:',JSON.stringify(facing.filter(f=>(f.pagodaTilt??0)>6||(f.cantonTilt??0)>6)));
  }else{
   const scene=path.join(OUT,'scene-v12-silent.mp4');
   const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',scene],{stdio:['pipe','ignore','inherit']});
   const done=new Promise((ok,no)=>ff.once('close',c=>c===0?ok():no(Error('ffmpeg '+c))));
   for(let i=0;i<DURATION*FPS;i++){await page.clock.runFor(1000/FPS);await show(page,sample(i/FPS));const png=await page.screenshot({scale:'device'});if(!ff.stdin.write(png))await new Promise(r=>ff.stdin.once('drain',r));if(i%150===0)console.log('frame',i,'/',DURATION*FPS);}
   ff.stdin.end();await done;if(errors.length)throw Error('page errors: '+errors.join('; '));
   const endcard=path.join(OUT,'endcard/endcard.mp4');
   execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',scene,'-i',endcard,'-filter_complex','[0:v]setsar=1,fps=30,format=yuv420p[a];[1:v]setsar=1,fps=30,format=yuv420p,tpad=start_mode=clone:start_duration=1[b];[a][b]xfade=transition=fade:duration=1:offset='+(DURATION-1)+'[v]','-map','[v]','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-r','30','-an','-movflags','+faststart',path.join(OUT,'huacheng-demo-v12-silent-1080x1920.mp4')]);
   console.log('done',path.join(OUT,'huacheng-demo-v12-silent-1080x1920.mp4'));
  }
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
