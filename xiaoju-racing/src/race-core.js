/* Arcade race simulation. Metres, seconds; independent of rendering. */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const lerp=(a,b,t)=>a+(b-a)*t;
const knots=[[0,0],[0,-84],[-38,-147],[-109,-164],[-179,-128],[-198,-63],[-170,7],[-110,62],[-43,73],[14,53],[27,29],[4,17]];
function makeTrack(points){
 const pts=[],n=points.length,get=i=>points[(i+n)%n];
 for(let i=0;i<n;i++)for(let j=0;j<32;j++){
  const t=j/32,a=get(i-1),b=get(i),c=get(i+1),d=get(i+2);
  const cat=k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t);
  pts.push({x:cat(0),z:cat(1)});
 }
 pts.push({...pts[0]});let length=0;
 pts.forEach((p,i)=>{if(i)length+=Math.hypot(p.x-pts[i-1].x,p.z-pts[i-1].z);p.s=length;});
 return {pts,length,width:8.2};
}
const track=makeTrack(knots),L=track.length;
function elevation(s){const t=((s%L)+L)%L/L;return t>.61&&t<.79?Math.sin((t-.61)/.18*Math.PI)*5.6:0;}
function at(s,lateral=0){
 s=(s%L+L)%L;let lo=0,hi=track.pts.length-1;
 while(hi-lo>1){const m=(hi+lo)>>1;if(track.pts[m].s<=s)lo=m;else hi=m;}
 const a=track.pts[lo],b=track.pts[hi],t=(s-a.s)/(b.s-a.s||1),heading=Math.atan2(-(b.x-a.x),-(b.z-a.z));
 return {x:lerp(a.x,b.x,t)+Math.cos(heading)*lateral,z:lerp(a.z,b.z,t)-Math.sin(heading)*lateral,y:elevation(s),heading};
}
function nearest(x,z){
 let best={distance:Infinity};
 for(let i=1;i<track.pts.length;i++){
  const a=track.pts[i-1],b=track.pts[i],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),px=a.x+dx*t,pz=a.z+dz*t,d=Math.hypot(x-px,z-pz);
  if(d<best.distance){const heading=Math.atan2(-dx,-dz);best={x:px,z:pz,distance:d,s:lerp(a.s,b.s,t),heading,lateral:(x-px)*Math.cos(heading)-(z-pz)*Math.sin(heading)};}
 }
 return best;
}
const pads=[{s:L*.085,lane:-3},{s:L*.345,lane:3},{s:L*.555,lane:-2.5},{s:L*.84,lane:2.5}];
const names=['小橘','三花','乌云','奶盖','阿狸','银条'];
const colors=['#ef9d48','#f0eee4','#485060','#e7d7b8','#b77648','#aab1b8'];
function rider(i){
 const progress=-7-Math.floor(i/2)*4.5,lateral=(i%2?1:-1)*2.25,p=at(progress,lateral);
 return {id:i,name:names[i],color:colors[i],x:p.x,z:p.z,y:p.y,heading:p.heading,velocityHeading:p.heading,speed:0,progress,lap:1,nextGate:L/8,gate:0,lateral,pedal:0,charge:0,nitro:i===0?1:0,boost:0,mini:0,drift:0,driftSide:0,drifting:false,lastDrift:false,steer:0,hit:0,collisions:0,jumpY:0,jumpV:0,jumpReady:true,finished:false,finishTime:null,lastPad:-100,trail:0};
}
function create(options={}){
 const laps=[1,2,3].includes(Number(options.laps))?Number(options.laps):2;
 const difficulty=['easy','normal','hard'].includes(options.difficulty)?options.difficulty:'normal';
 return {phase:'menu',resumePhase:null,laps,difficulty,time:0,countdown:3,go:0,riders:names.map((_,i)=>rider(i)),events:[],lapTime:0,lastLapTime:null,bestLap:null,rank:1,finishOrder:[],finishDelay:0};
}
function start(s){if(s.phase!=='menu'&&s.phase!=='result')return false;s.phase='countdown';return true;}
function pause(s){if(s.phase==='paused'){s.phase=s.resumePhase;s.resumePhase=null;}else if(['racing','countdown'].includes(s.phase)){s.resumePhase=s.phase;s.phase='paused';}}
function reset(s){const fresh=create({laps:s.laps,difficulty:s.difficulty});Object.assign(s,fresh);start(s);}
function recover(s){
 if(s.phase!=='racing'||s.riders[0].finished)return;const r=s.riders[0],n=nearest(r.x,r.z),p=at(n.s,0);r.x=p.x;r.z=p.z;r.y=p.y;r.heading=p.heading;r.velocityHeading=p.heading;r.speed=0;r.drifting=false;r.drift=0;r.jumpY=0;r.jumpV=0;r.hit=.5;
}
function emit(s,type,text){s.events.push({type,text});}
function boost(s){const r=s.riders[0];if(s.phase!=='racing'||r.finished||r.nitro<1||r.boost>0)return false;r.nitro--;r.boost=2.2;emit(s,'boost','氮气冲刺');return true;}
function updateProgress(s,r,oldS,newS,dt){
 let delta=newS-oldS;if(delta>L/2)delta-=L;if(delta<-L/2)delta+=L;
 // Physics already bounds world travel in 1/90 s steps. At inside bends the
 // nearest centreline can advance much farther than the wheel; keep that distance.
 const previous=r.progress;r.progress+=delta;
 const crossedAt=distance=>s.time-dt+clamp((distance-previous)/(delta||1),0,1)*dt;
 while(r.progress>=r.nextGate){r.gate++;r.nextGate+=L/8;}
 const lap=Math.max(r.lap,Math.min(s.laps,Math.floor(Math.max(0,r.progress)/L)+1));
 if(lap>r.lap&&r.id===0){const time=crossedAt((lap-1)*L);s.lastLapTime=time-s.lapTime;s.bestLap=s.bestLap===null?s.lastLapTime:Math.min(s.bestLap,s.lastLapTime);s.lapTime=time;emit(s,'lap',lap===s.laps?'最后一圈':'第 '+lap+' 圈');}
 r.lap=lap;
 if(r.progress>=s.laps*L&&r.gate>=s.laps*8&&!r.finished){
  r.finished=true;r.finishTime=crossedAt(s.laps*L);s.finishOrder.push(r.id);r.boost=0;r.drifting=false;
  if(r.id===0){s.lastLapTime=r.finishTime-s.lapTime;s.bestLap=s.bestLap===null?s.lastLapTime:Math.min(s.bestLap,s.lastLapTime);s.finishDelay=1.8;}
 }
}
function botInput(s,r){
 const n=nearest(r.x,r.z),ahead=at(n.s+9+r.speed*.32,Math.sin(s.time*.42+r.id*2.1)*2.6),desired=Math.atan2(-(ahead.x-r.x),-(ahead.z-r.z)),error=wrap(desired-r.heading),curvature=Math.abs(wrap(at(n.s+18).heading-n.heading));
 const pace={easy:16.5,normal:19.6,hard:22.2}[s.difficulty]+(r.id%3)*.45;
 return {throttle:true,steer:clamp(-error*2.8,-1,1),target:pace*(1-Math.min(.32,curvature*.34)),drift:curvature>.46&&r.speed>13,boost:(Math.sin(s.time*.45+r.id*5)>.94&&curvature<.28),brake:false,jump:false};
}
function integrate(s,r,input,dt){
 if(r.finished){r.speed*=Math.exp(-dt*1.8);return;}
 const old=nearest(r.x,r.z),steer=clamp(Number(input.steer)||0,-1,1),accel=!!input.throttle;
 r.hit=Math.max(0,r.hit-dt);r.boost=Math.max(0,r.boost-dt);r.mini=Math.max(0,r.mini-dt);r.steer+= (steer-r.steer)*(1-Math.exp(-dt*9));
 const wasDrifting=r.drifting;r.drifting=!!input.drift&&Math.abs(steer)>.14&&r.speed>7.5&&!input.brake&&r.jumpY<.1;
 if(r.drifting){r.driftSide=Math.sign(steer);r.drift=Math.min(2.8,r.drift+dt);r.charge+=dt*(16+Math.min(18,r.drift*8));if(r.charge>=100){r.charge-=100;r.nitro=Math.min(2,r.nitro+1);if(r.id===0)emit(s,'nitro','获得氮气');}}
 else if(wasDrifting){if(r.drift>.32){r.mini=.8+Math.min(.45,r.drift*.15);if(r.id===0)emit(s,'mini',r.drift>1.3?'完美出弯 · 小喷':'出弯小喷');}r.drift=0;}
 if(input.boost&&r.id>0)r.boost=.45;
 const nitro=r.boost>0,mini=r.mini>0,target=input.brake?0:accel?(input.target||22)+(nitro?12:0)+(mini?6:0):0;
 const acceleration=input.brake?26:accel?((nitro?14:9)*(1-.42*clamp(r.speed/36,0,1))):4;
 if(r.speed<target)r.speed=Math.min(target,r.speed+acceleration*dt);else r.speed=Math.max(target,r.speed-(input.brake?26:5)*dt);
 if(r.drifting&&!nitro)r.speed=Math.max(0,r.speed-dt*1.05);
 const turnRate=(.85+Math.min(r.speed,25)*.025)*(r.drifting?1.38:1);
 r.heading=wrap(r.heading-r.steer*turnRate*dt*clamp(r.speed/2,0,1));
 // Grip recovers progressively after releasing a drift, leaving a readable slide.
 r.velocityHeading=wrap(r.velocityHeading+wrap(r.heading-r.velocityHeading)*(1-Math.exp(-dt*(r.drifting?3.4:10))));
 if(input.jump&&r.jumpReady&&r.jumpY===0){r.jumpV=5.2;r.jumpReady=false;}if(!input.jump)r.jumpReady=true;
 if(r.jumpY>0||r.jumpV>0){r.jumpV-=dt*13.8;r.jumpY+=r.jumpV*dt;if(r.jumpY<0){r.jumpY=0;r.jumpV=0;}}
 r.x-=Math.sin(r.velocityHeading)*r.speed*dt;r.z-=Math.cos(r.velocityHeading)*r.speed*dt;
 let n=nearest(r.x,r.z);const bound=track.width-.65;
 if(Math.abs(n.lateral)>bound){
  const p=at(n.s,Math.sign(n.lateral)*bound);r.x=p.x;r.z=p.z;
  const impact=Math.abs(Math.sin(wrap(r.velocityHeading-n.heading)))*r.speed;
  if(r.hit===0&&impact>2){r.collisions++;r.speed*=.55;r.hit=.65;if(r.id===0)emit(s,'hit','擦碰护栏');}
  r.heading=wrap(r.heading+wrap(n.heading-r.heading)*Math.min(1,dt*5));r.velocityHeading=wrap(r.velocityHeading+wrap(n.heading-r.velocityHeading)*Math.min(1,dt*9));
  n=nearest(r.x,r.z);
 }
 r.y=elevation(n.s);r.lateral=n.lateral;r.pedal+=r.speed*dt*1.45;
 for(const pad of pads){let d=Math.abs(n.s-pad.s);d=Math.min(d,L-d);if(d<3&&Math.abs(n.lateral-pad.lane)<1.45&&s.time-r.lastPad>1.6){r.mini=Math.max(r.mini,1.15);r.lastPad=s.time;if(r.id===0)emit(s,'pad','加速带');}}
 updateProgress(s,r,old.s,n.s,dt);
}
function substep(s,input,dt){
 if(s.phase==='countdown'){s.countdown-=dt;if(s.countdown<=0){s.phase='racing';s.go=1;emit(s,'go','出发！');}return;}
 if(s.phase!=='racing')return;
 s.time+=dt;s.go=Math.max(0,s.go-dt);
 const controls={throttle:!!input.forward,brake:!!input.brake,steer:(input.right?1:0)-(input.left?1:0),drift:!!input.drift,jump:!!input.jump};
 const wasFinished=s.riders[0].finished;
 for(const r of s.riders)integrate(s,r,r.id===0?controls:botInput(s,r),dt);
 s.finishOrder.sort((a,b)=>s.riders[a].finishTime-s.riders[b].finishTime);
 // Soft body contacts: small separation and speed transfer, no teleporting or deadlock.
 for(let i=0;i<s.riders.length;i++)for(let j=i+1;j<s.riders.length;j++){
  const a=s.riders[i],b=s.riders[j];if(a.finished||b.finished||Math.abs(a.jumpY-b.jumpY)>.7)continue;
  const dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);
  if(d<.78&&d>.001){const push=(.78-d)*.45;a.x+=dx/d*push;a.z+=dz/d*push;b.x-=dx/d*push;b.z-=dz/d*push;const dv=(a.speed-b.speed)*.03;a.speed-=dv;b.speed+=dv;}
 }
 s.rank=order(s).findIndex(r=>r.id===0)+1;
 if(!wasFinished&&s.riders[0].finished)emit(s,'finish',s.rank===1?'小橘夺冠！':'冲线！');
 if(s.riders[0].finished){s.finishDelay-=dt;if(s.finishDelay<=0)s.phase='result';}
}
function step(s,input,dt){
 s.events=[];if(!Number.isFinite(dt)||dt<=0)return;
 // Hidden tabs are paused by the view. Clamp catch-up so a stalled frame cannot skip gates.
 let remaining=Math.min(dt,.12);while(remaining>1e-8){const h=Math.min(remaining,1/90);substep(s,input,h);remaining-=h;}
}
function order(s){return [...s.riders].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress);}
const api={track,L,at,nearest,elevation,pads,names,create,start,pause,reset,recover,boost,step,order,clamp,wrap};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RaceCore=api;
})(typeof window!=='undefined'?window:globalThis);
