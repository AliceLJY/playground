// Portrait demo v4, shot list by the director (Claude Code) after Alice turned down v3:
// "其实需要有细节放大的……花啊，桥啊，有些角度要有变化，现在咋都是远景呢".
// Wide establishing shots stay aerial; the close-ups go to what holds up near the lens
// (bougainvillea curtain, silk floss blossom, the arch framing Canton Tower). The tram only
// appears side-on or driving away, never nose-first (her v1 note).
// NODE_PATH="$(npm root -g)" node tools/director.cjs <media-dir> --stills|--render
const fs=require('node:fs'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const {openRecording,sheet,SHOTS:V3}=require('./record.cjs');
const FPS=30,DURATION=52,DISSOLVE=.6;
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((n,i)=>n+(b[i]-n)*u);
const v3=id=>V3.find(s=>s.id===id);
// sim: scene seconds at shot start/end (tram period 60 s: west stop 0–16, eastbound 16–30, east stop 30–46, westbound 46–60).
const SHOTS=[
 {id:'open',start:0,end:4,from:v3('bank').from,to:v3('bank').to,look:v3('bank').look,lookTo:v3('bank').lookTo,fov:32,shift:0,sim:[42,46],title:true},
 // v5 note from Alice: more medium shots — play up what the build does well, keep its weak spots out of frame.
 // Medium: the east curtain with deck and rails, Canton Tower beyond (replaces the petal close-up).
 {id:'bridge',start:4,end:10,from:[14,13,-12],to:[14,13.5,-2],look:[-6,4.5,-1],lookTo:[-6,4.8,3],fov:30,shift:0,sim:[32,38]},
 {id:'under',start:10,end:16,from:[-52,30,-28],to:[-48,30.5,-27],look:[-5.5,3.5,1.5],lookTo:[-2,3.5,1.5],fov:30,shift:0,sim:[19.2,25.2]},
 {id:'blossom',start:16,end:22,from:[70,7,-46],to:[66,7.5,-43],look:[44,11,-7],lookTo:[44,11.5,-6.5],fov:30,shift:.2,sim:[31,37]},
 {id:'arch',start:22,end:28,from:[34,3.6,-11.2],to:[28.5,3.4,-11.2],look:[-67,17,-7],lookTo:[-67,17,-7],fov:28,shift:0,sim:[38,44]},
 {id:'road',start:28,end:34,from:[34,22,30],to:[28,21,29],look:[-22,9,-4],lookTo:[-24,9,-4],fov:30,shift:.1,sim:[49,55]},
 // Medium, night: lit footbridge and lamps over the river, reflections, Canton Tower lit behind.
 {id:'river-night',start:34,end:40,from:[-50,26,-34],to:[-44,26.5,-33],look:[-2,3.5,0],lookTo:[2,3.5,0],fov:32,shift:.05,sim:[32,38]},
 // Medium, night: the white-crane platform roof and the lit Canton Tower.
 {id:'tower-night',start:40,end:45,orbit:[-62,-6],radius:88,height:24,angles:[128,110],look:[-64,20,-5],fov:32,shift:.15,sim:[38,43]},
 {id:'orbit',start:45,end:52,orbit:[0,-2],radius:112,height:58,angles:[78,52],look:[-6,9,-2],fov:32,shift:0,sim:[40,47]},
];
// Day at the start, golden late afternoon by the arch (~25 s), dusk ~31 s, lamps and blue night from ~36 s.
const DAY=[[0,0],[5,.04],[14,.24],[24,.44],[31,.6],[36,.82],[44,.9],[52,.92]];
function dayAt(t){let i=0;while(i<DAY.length-2&&t>DAY[i+1][0])i++;const [a,x]=DAY[i],[b,y]=DAY[i+1];return x+(y-x)*ease((t-a)/(b-a));}
function travel(u){u=clamp(u);const r=.2;if(u<r)return u*u/(2*r*(1-r));if(u>1-r)return 1-(1-u)**2/(2*r*(1-r));return (u-r/2)/(1-r);}
function frameOf(s,t){
 const u=travel((t-s.start)/(s.end-s.start));let pos;
 if(s.orbit){const a=(s.angles[0]+(s.angles[1]-s.angles[0])*u)*Math.PI/180;pos=[s.orbit[0]+s.radius*Math.sin(a),s.height,s.orbit[1]+s.radius*Math.cos(a)];}
 else pos=mix(s.from,s.to,u);
 const lin=clamp((t-s.start)/(s.end-s.start));
 return{shot:s.id,pos,target:mix(s.look,s.lookTo||s.look,u),fov:s.fov,shift:s.shift,seconds:s.sim[0]+(s.sim[1]-s.sim[0])*lin,
  day:dayAt(t),title:s.title?1-ease((t-3.6)/1):0,credit:0,fade:0};
}
function sample(t){
 t=Math.max(0,Math.min(DURATION-1e-6,t));
 for(let i=1;i<SHOTS.length;i++){const b=SHOTS[i].start;if(t>=b-DISSOLVE/2&&t<b+DISSOLVE/2)return{current:frameOf(SHOTS[i],t),previous:frameOf(SHOTS[i-1],t),blend:ease((t-b+DISSOLVE/2)/DISSOLVE)};}
 const s=SHOTS.find(s=>t<s.end)||SHOTS.at(-1);return{current:frameOf(s,t),previous:null,blend:1};
}
async function show(page,s){await page.evaluate(s=>window.__huacheng.recordFrame(s.current,s.previous,s.blend),s);await page.evaluate(async()=>{const im=document.querySelector('#record-dissolve');if(+im.style.opacity>0)await im.decode();});}
async function main(){
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
   const scene=path.join(OUT,'scene-v6-silent.mp4');
   const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',scene],{stdio:['pipe','ignore','inherit']});
   const done=new Promise((ok,no)=>ff.once('close',c=>c===0?ok():no(Error('ffmpeg '+c))));
   for(let i=0;i<DURATION*FPS;i++){await page.clock.runFor(1000/FPS);await show(page,sample(i/FPS));const png=await page.screenshot({scale:'device'});if(!ff.stdin.write(png))await new Promise(r=>ff.stdin.once('drain',r));if(i%150===0)console.log('frame',i,'/',DURATION*FPS);}
   ff.stdin.end();await done;if(errors.length)throw Error('page errors: '+errors.join('; '));
   const endcard=path.join(OUT,'endcard/endcard.mp4');
   execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',scene,'-i',endcard,'-filter_complex','[0:v]setsar=1,setpts=PTS-STARTPTS[a];[1:v]setsar=1,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-r','30','-an','-movflags','+faststart',path.join(OUT,'huacheng-demo-v6-silent-1080x1920.mp4')]);
   console.log('done',path.join(OUT,'huacheng-demo-v6-silent-1080x1920.mp4'));
  }
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
