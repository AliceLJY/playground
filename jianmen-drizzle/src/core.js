/* 细雨剑门 logic: angles in degrees, time in seconds; no renderer, DOM, audio or wall clock.
   Yaw 0 looks toward -Z and grows to the right (+X); pitch grows upward. */
(function(root){
'use strict';
const STEP=1/60;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=a=>{a=((a+180)%360+360)%360-180;return a===-180?180:a;};
const rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;

// Every number SPEC.md promises lives here and nowhere else.
const FEEL={
  dwell:1.0,        // seconds of steady looking that count as "seen"
  decay:2.0,        // dwell progress lost per second when looking away
  hintAfter:25,     // seconds without a new find before a hint shows
  endDelay:2.5,     // seconds between the fourth find and the ending turn
  endTurn:4.0,      // seconds the ending spends turning back to the gate
  pitchMin:-75, pitchMax:75,
  fovMin:35, fovMax:85, fovStart:88, fovRest:72,   // field of view across the shorter screen side
  fovStartPortrait:74, fovRestPortrait:60,          // a portrait phone at 60 sees the gate above and the path below, like the scroll
  compassSpan:100,  // the compass bar shows this many degrees either side of the view
  startYaw:19, startPitch:8,
  neck:0.06         // eye distance in front of the neck pivot (scene units)
};

const TARGETS=[
  {id:'path', yaw:8,   pitch:-40, r:16, line:0, text:'衣上征尘杂酒痕', hint:'低头，看看来时的路', mark:'路'},
  {id:'far',  yaw:-90, pitch:-5,  r:20, line:1, text:'远游无处不消魂', hint:'往左望，云海那边', mark:'云'},
  {id:'back', yaw:180, pitch:10,  r:30, line:2, text:'此身合是诗人未', hint:'转过身去', note:'这一面，高剑父没有画', mark:'身后'},
  {id:'gate', yaw:19,  pitch:47,  r:11,  line:3, text:'细雨骑驴入剑门', hint:'抬头，关楼在雨里', mark:'关'}
];

function dir(yaw,pitch){const y=rad(yaw),p=rad(pitch);return [Math.sin(y)*Math.cos(p),Math.sin(p),-Math.cos(y)*Math.cos(p)];}
// Great-circle angle between two view directions, degrees.
function angle(y1,p1,y2,p2){const a=dir(y1,p1),b=dir(y2,p2);return deg(Math.acos(clamp(a[0]*b[0]+a[1]*b[1]+a[2]*b[2],-1,1)));}

function create(){
  const s={t:0,phase:'look',found:{},order:[],dwell:{},lastFind:0,hint:null,endAt:null,doneAt:null};
  for(const g of TARGETS)s.dwell[g.id]=0;
  return s;
}

// look = {yaw, pitch}. Returns events: {type:'found', id, line, text, note} | {type:'hint', id, text} | {type:'hintOff'} | {type:'ending'} | {type:'done'}
function step(s,look,dt){
  const ev=[];
  s.t+=dt;
  if(s.phase==='look'){
    for(const g of TARGETS){
      if(s.found[g.id])continue;
      const on=angle(look.yaw,look.pitch,g.yaw,g.pitch)<=g.r;
      s.dwell[g.id]=on?s.dwell[g.id]+dt:Math.max(0,s.dwell[g.id]-FEEL.decay*dt);
      if(s.dwell[g.id]>=FEEL.dwell){
        s.found[g.id]=s.t; s.order.push(g.id); s.lastFind=s.t; s.dwell[g.id]=FEEL.dwell;
        ev.push({type:'found',id:g.id,line:g.line,text:g.text,note:g.note||null});
        if(s.hint){s.hint=null;ev.push({type:'hintOff'});}
      }
    }
    if(s.order.length===TARGETS.length){s.phase='ending';s.endAt=s.t+FEEL.endDelay;ev.push({type:'ending'});}
    else if(!s.hint&&s.t-s.lastFind>=FEEL.hintAfter){
      const g=nearestUnfound(s,look);
      s.hint=g.id; ev.push({type:'hint',id:g.id,text:g.hint});
    }
  }else if(s.phase==='ending'&&s.t>=s.endAt+FEEL.endTurn){
    s.phase='done';s.doneAt=s.t;ev.push({type:'done'});
  }
  return ev;
}

function nearestUnfound(s,look){
  let best=null,bd=1e9;
  for(const g of TARGETS){if(s.found[g.id])continue;const d=angle(look.yaw,look.pitch,g.yaw,g.pitch);if(d<bd){bd=d;best=g;}}
  return best;
}

// Progress of the dwell ring for whatever target the view is on (0..1), or 0.
function ring(s){let m=0;for(const g of TARGETS)if(!s.found[g.id])m=Math.max(m,s.dwell[g.id]/FEEL.dwell);return m;}

// Compass bar: where each target sits relative to the view. dx is degrees to turn (right +), clipped to the bar;
// side says which edge an out-of-range target is pinned to; level says whether to look up or down for it.
function compass(s,look){
  const span=FEEL.compassSpan;
  return TARGETS.map(g=>{
    const dx=wrap(g.yaw-look.yaw), dp=g.pitch-look.pitch;
    return {id:g.id,mark:g.mark,found:!!s.found[g.id],dx:clamp(dx,-span,span),side:dx>span?1:dx<-span?-1:0,
      level:dp>20?'up':dp<-20?'down':'level'};
  });
}

// Steer an aim toward the next unfound target (or the gate once ending) at `speed` deg/s.
function autopilot(s,aim,dt,opt={}){
  const speed=opt.speed??90;
  let goal=null;
  if(s.phase==='look'){const order=opt.order||TARGETS.map(g=>g.id);for(const id of order)if(!s.found[id]){goal=TARGETS.find(g=>g.id===id);break;}}
  else goal=TARGETS.find(g=>g.id==='gate');
  if(!goal)return aim;
  const dy=wrap(goal.yaw-aim.yaw), dp=goal.pitch-aim.pitch, d=Math.hypot(dy,dp), k=d>1e-6?Math.min(1,speed*dt/d):0;
  return {yaw:wrap(aim.yaw+dy*k),pitch:clamp(aim.pitch+dp*k,FEEL.pitchMin,FEEL.pitchMax),fov:aim.fov};
}

// Hand shake around an aim: a mean-reverting wobble whose spread settles at `sigma` degrees.
function shaker(sigma,rnd){
  const g=()=>{let u=0,v=0;while(!u)u=rnd();while(!v)v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  let oy=0,op=0;const a=0.92,b=Math.sqrt(1-a*a)*sigma;
  return aim=>{oy=a*oy+b*g();op=a*op+b*g();return {yaw:wrap(aim.yaw+oy),pitch:clamp(aim.pitch+op,FEEL.pitchMin,FEEL.pitchMax),fov:aim.fov};};
}

function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

const api={STEP,FEEL,TARGETS,clamp,wrap,dir,angle,create,step,ring,nearestUnfound,compass,autopilot,shaker,rng};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.JianmenCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
