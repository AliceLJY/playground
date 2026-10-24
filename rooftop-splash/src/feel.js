/* Game feel: springs, trauma shake, hit-stop and per-event weights. No renderer, DOM or wall clock;
   the browser layer feeds it core events and reads offsets back, so Node tests drive the same code. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rng(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

/* Damped spring toward 0. k stiffness, c damping. */
class Spring{
  constructor(k=160,c=16){this.x=0;this.v=0;this.k=k;this.c=c;}
  impulse(v){this.v+=v;}
  update(dt){const a=-this.k*this.x-this.c*this.v;this.v+=a*dt;this.x+=this.v*dt;return this.x;}
  reset(){this.x=0;this.v=0;}
}

/* Feedback is layered by event weight: own shot lightest, a hit lands, a soak-out or balloon is heaviest. */
const WEIGHTS={
  shot:{trauma:0,kick:1},
  hitConfirm:{trauma:0,marker:.16},
  soak:{trauma:.32,marker:.32,hitStop:.055},
  hurt:{trauma:.22,flinch:1},
  soaked:{trauma:.5},
  splash:{trauma:.45}
};
const TRAUMA_DECAY=1.6;      // per second, linear
const SHAKE_MAX=.022;        // radians at trauma 1 (trauma is squared before use)
const HITSTOP_MAX=.07;       // seconds; stacking never freezes play longer than this
const PITCH_JITTER=.06;      // ±6 % so repeated sounds do not machine-gun

function create(seed=1){
  return{
    rand:rng(seed),trauma:0,hitStop:0,time:0,
    camKick:new Spring(520,46),flinch:new Spring(120,12),landing:new Spring(170,14),
    gunZ:new Spring(260,20),gunPitch:new Spring(240,18),gunRoll:new Spring(200,16),
    marker:0,markerKill:false,hurtDir:null,hurtT:0
  };
}
function addTrauma(f,amount){f.trauma=clamp(f.trauma+amount,0,1);}
/* Shake offsets from trauma², driven by accumulated game time so pauses and tests are reproducible. */
function shake(f){
  const s=f.trauma*f.trauma*SHAKE_MAX,t=f.time*31;
  return{pitch:s*(Math.sin(t*1.7)*.6+Math.sin(t*3.1+1.3)*.4),yaw:s*(Math.sin(t*1.3+2.1)*.6+Math.sin(t*2.7+.4)*.4),roll:s*.6*Math.sin(t*2.3+.8)};
}
function pitchJitter(f){return 1+(f.rand()*2-1)*PITCH_JITTER;}
/* Weapon kick per shot; heavier blasters kick harder. */
const KICK=[{z:1.1,pitch:2.2,cam:.55},{z:2.6,pitch:6,cam:2.4},{z:1.4,pitch:3,cam:.8}];
function react(f,type,opts={}){
  const w=WEIGHTS[type];if(!w)return;
  if(w.trauma)addTrauma(f,w.trauma*(opts.scale??1));
  if(type==='shot'){const k=KICK[opts.weapon|0]||KICK[0];f.gunZ.impulse(k.z);f.gunPitch.impulse(k.pitch);f.gunRoll.impulse((f.rand()*2-1)*k.pitch*.4);f.camKick.impulse(k.cam);}
  if(w.marker){f.marker=Math.max(f.marker,w.marker);if(type==='soak')f.markerKill=true;}
  if(w.hitStop)f.hitStop=Math.min(HITSTOP_MAX,f.hitStop+w.hitStop);
  if(w.flinch){f.flinch.impulse(3.5*(opts.scale??1));f.hurtDir=opts.dir??null;f.hurtT=.9;}
}
function land(f,speed){if(speed>3)f.landing.impulse(-Math.min(speed,14)*.12);}
/* Advance with real time; returns the game-time step after hit-stop so only play freezes, not camera or UI. */
function step(f,dt){
  f.time+=dt;f.trauma=Math.max(0,f.trauma-TRAUMA_DECAY*dt);
  for(const s of [f.camKick,f.flinch,f.landing,f.gunZ,f.gunPitch,f.gunRoll])s.update(dt);
  f.marker=Math.max(0,f.marker-dt);if(f.marker===0)f.markerKill=false;f.hurtT=Math.max(0,f.hurtT-dt);
  if(f.hitStop>0){const frozen=Math.min(f.hitStop,dt);f.hitStop-=frozen;return dt-frozen;}
  return dt;
}
function reset(f){f.trauma=0;f.hitStop=0;f.marker=0;f.markerKill=false;f.hurtT=0;f.hurtDir=null;for(const s of [f.camKick,f.flinch,f.landing,f.gunZ,f.gunPitch,f.gunRoll])s.reset();}

const api={Spring,create,react,step,shake,land,reset,addTrauma,pitchJitter,WEIGHTS,TRAUMA_DECAY,SHAKE_MAX,HITSTOP_MAX,PITCH_JITTER};
if(typeof module!=='undefined')module.exports=api;root.SplashFeel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
