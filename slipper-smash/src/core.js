// Slipper Smash rules: spawning, flight, swipe hits, combo, the boss. No DOM, no drawing; runs in Node for tests.
// World units: height is always 1000, width is 1000 * aspect. y grows downward.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SlipperCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const H=1000;
const CFG={
  gravity:1500,          // units / s^2
  waveTime:45,           // seconds of ordinary waves before the boss
  bossEnter:1.4,         // seconds the boss takes to walk in (cannot be hit)
  bossTime:25,           // seconds to beat the boss before it leaves
  bossHp:28,
  bossHitGap:0.2,        // one stroke cannot land twice inside this window
  lives:3,               // cups of milk tea
  comboGap:1.2,          // seconds between kills that keep a combo alive
  maxLive:8,             // readable ceiling for things on screen during waves
  blade:16,              // half width of the slipper stroke
  radius:{roach:60,flyer:50,gold:52,tea:56},
  points:{roach:10,flyer:30,gold:50,boss:15,bossDown:300,secondLeft:10},
  step:1/120
};
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function segDist(px,py,x0,y0,x1,y1){
  const dx=x1-x0,dy=y1-y0,l2=dx*dx+dy*dy;
  let t=l2>0?((px-x0)*dx+(py-y0)*dy)/l2:0;t=clamp(t,0,1);
  return Math.hypot(px-(x0+dx*t),py-(y0+dy*t));
}
const multiplier=combo=>Math.min(5,1+Math.floor(Math.max(0,combo-1)/4));

function create(opts){
  opts=opts||{};
  const aspect=clamp(opts.aspect||0.5625,0.42,2.2),W=H*aspect,rand=rng(opts.seed==null?1:opts.seed);
  const s={W,H,aspect,t:0,phase:'waves',ents:[],queue:[],nextWave:0.9,score:0,combo:0,bestCombo:0,lastKill:-9,
    kills:0,misses:0,lives:CFG.lives,boss:null,bossT:0,events:[],spawned:{roach:0,flyer:0,gold:0,tea:0},result:null,nextId:1,peakLive:0};
  const emit=e=>{s.events.push(e);};
  const liveCount=()=>s.ents.length+s.queue.length;

  function add(e){e.id=s.nextId++;e.born=s.t;e.rot=(rand()-0.5)*0.6;e.r=CFG.radius[e.kind];e.minY=e.y;e.apexX=e.x;s.ents.push(e);s.spawned[e.kind]++;return e;}
  // tossed up from below the screen: pick where it comes back down, then solve the launch speed for that arc
  function toss(kind){
    const x0=W*(0.14+0.72*rand()),apexX=(x0+W*(0.1+0.8*rand()))/2;   // lands back inside the screen, not off the side
    const vy=kind==='gold'?1440+rand()*90:1180+rand()*330,up=vy/CFG.gravity;
    return add({kind,x:x0,y:H+70,vx:(apexX-x0)/up,vy:-vy,vr:(rand()-0.5)*(kind==='tea'?2.2:5)});
  }
  // the flying kind crosses the screen sideways on a wave, no gravity
  function fly(){
    const dir=rand()<0.5?1:-1,speed=(W+160)/(2.3+rand()*0.8);
    return add({kind:'flyer',x:dir>0?-80:W+80,y:0,vx:dir*speed,vy:0,vr:0,baseY:H*(0.22+0.38*rand()),amp:H*(0.04+0.05*rand()),om:3+rand()*2,ph:rand()*6.28});
  }
  // thrown by the boss: lobbed from its hands, landing spot chosen inside the screen
  function lob(kind){
    const b=s.boss,vy=520+rand()*300,y0=b.y+b.r*0.4,g=CFG.gravity;
    const fall=(vy+Math.sqrt(vy*vy+2*g*(H+70-y0)))/g,target=W*(0.12+0.76*rand());
    return add({kind,x:b.x,y:y0,vx:(target-b.x)/fall,vy:-vy,vr:(rand()-0.5)*5});
  }
  function pickKind(p,teaAllowed){
    const r=rand(),tea=s.t>4&&teaAllowed?0.09+0.07*p:0,flyer=s.t>8?0.12+0.08*p:0,gold=s.t>10?0.04:0;
    if(r<tea)return'tea';if(r<tea+flyer)return'flyer';if(r<tea+flyer+gold)return'gold';return'roach';
  }
  function wave(){
    const p=clamp(s.t/CFG.waveTime,0,1);
    let n=1+Math.floor(rand()*(1.6+2.2*p));n=Math.min(n,CFG.maxLive-liveCount());
    let tea=false;
    for(let i=0;i<n;i++){
      let kind=pickKind(p,!tea&&n>1);if(kind==='tea')tea=true;
      s.queue.push({at:s.t+i*0.14,kind});
    }
    s.nextWave=s.t+lerp(1.35,0.8,p)+rand()*0.3;
  }
  function finish(reason){
    if(s.result)return;
    s.phase='over';s.result={reason,score:s.score,bestCombo:s.bestCombo,kills:s.kills,misses:s.misses,lives:s.lives,time:s.t};
    emit({type:'over',reason});
  }

  function step(dt){
    if(s.phase==='over')return;
    s.t+=dt;
    if(s.phase==='waves'){
      if(s.t>=CFG.waveTime){s.phase='bossIn';s.queue.length=0;const r=Math.min(170,W*0.3);
        s.boss={x:W/2,y:-r-90,r,hp:CFG.bossHp,maxHp:CFG.bossHp,lastHit:-9,flinch:0,enter:0,nextThrow:1.1,home:185+r*1.5};emit({type:'boss'});}
      else if(s.t>=s.nextWave)wave();
    }
    for(let i=0;i<s.queue.length;i++){const q=s.queue[i];if(s.t>=q.at){s.queue.splice(i--,1);q.kind==='flyer'?fly():toss(q.kind);}}
    const b=s.boss;
    if(s.phase==='bossIn'){b.enter+=dt;const k=clamp(b.enter/CFG.bossEnter,0,1),e=1-(1-k)*(1-k);b.y=lerp(-b.r-90,b.home,e);if(k>=1){s.phase='boss';s.bossT=0;}}
    else if(s.phase==='boss'){
      s.bossT+=dt;b.flinch=Math.max(0,b.flinch-dt);
      b.x=W/2+Math.sin(s.bossT*0.9)*Math.max(0,Math.min(W*0.2,W/2-b.r*1.4));b.y=b.home+Math.sin(s.bossT*1.7)*30;
      b.nextThrow-=dt;
      if(b.nextThrow<=0){
        const p=clamp(s.bossT/CFG.bossTime,0,1),n=Math.min(1+(rand()<0.45?1:0),7-s.ents.length);
        for(let i=0;i<n;i++)lob(i===0&&rand()<0.16?'tea':'roach');
        b.nextThrow=lerp(1.5,1.0,p)+rand()*0.25;
      }
      if(s.bossT>=CFG.bossTime){finish('escaped');return;}
    }
    for(let i=0;i<s.ents.length;i++){
      const e=s.ents[i];let gone=false;
      if(e.kind==='flyer'){
        e.x+=e.vx*dt;const a=(s.t-e.born)*e.om+e.ph;e.y=e.baseY+Math.sin(a)*e.amp;e.vy=Math.cos(a)*e.amp*e.om;
        gone=e.vx>0?e.x>W+90:e.x<-90;
      }else{
        e.vy+=CFG.gravity*dt;e.x+=e.vx*dt;e.y+=e.vy*dt;e.rot+=e.vr*dt;
        if(e.y<e.minY){e.minY=e.y;e.apexX=e.x;}
        gone=e.vy>0&&e.y>H+120;
      }
      if(gone){s.ents.splice(i--,1);if(e.kind!=='tea'){s.misses++;s.combo=0;emit({type:'miss',kind:e.kind,x:e.x});}}
    }
    if(s.ents.length>s.peakLive)s.peakLive=s.ents.length;
  }

  function kill(e,index,sx,sy){
    s.ents.splice(index,1);
    if(e.kind==='tea'){
      s.lives--;s.combo=0;emit({type:'tea',x:e.x,y:e.y,lives:s.lives});
      if(s.lives<=0)finish('tea');
      return;
    }
    s.combo=s.t-s.lastKill<=CFG.comboGap?s.combo+1:1;s.lastKill=s.t;if(s.combo>s.bestCombo)s.bestCombo=s.combo;
    const mult=multiplier(s.combo),pts=CFG.points[e.kind]*mult;s.score+=pts;s.kills++;
    emit({type:'hit',kind:e.kind,x:e.x,y:e.y,rot:e.rot,vx:e.vx,vy:e.vy,sx,sy,pts,combo:s.combo,mult});
  }
  // one stroke segment of the slipper, in world units. Returns how many things it hit.
  function swipe(x0,y0,x1,y1){
    if(s.phase==='over')return 0;
    let hits=0;const sx=x1-x0,sy=y1-y0,tap=Math.hypot(sx,sy)<4?10:0;
    for(let i=s.ents.length-1;i>=0;i--){
      const e=s.ents[i];
      if(segDist(e.x,e.y,x0,y0,x1,y1)<=e.r*0.92+CFG.blade+tap){kill(e,i,sx,sy);hits++;if(s.phase==='over')return hits;}
    }
    const b=s.boss;
    if(s.phase==='boss'&&b&&s.t-b.lastHit>=CFG.bossHitGap&&segDist(b.x,b.y,x0,y0,x1,y1)<=b.r*0.85+CFG.blade+tap){
      b.lastHit=s.t;b.hp--;b.flinch=0.22;hits++;
      s.combo=s.t-s.lastKill<=CFG.comboGap?s.combo+1:1;s.lastKill=s.t;if(s.combo>s.bestCombo)s.bestCombo=s.combo;
      const mult=multiplier(s.combo),pts=CFG.points.boss*mult;s.score+=pts;
      emit({type:'bossHit',x:b.x,y:b.y,sx,sy,pts,combo:s.combo,mult,hp:b.hp});
      if(b.hp<=0){
        const left=Math.ceil(CFG.bossTime-s.bossT),bonus=CFG.points.bossDown+left*CFG.points.secondLeft;s.score+=bonus;
        emit({type:'bossDown',x:b.x,y:b.y,bonus,left});finish('win');
      }
    }
    return hits;
  }
  return{state:s,step,swipe,finish};
}

// Autopilot used by tests and the fixed views. 'precise' never errs; 'human' reacts late, aims with error and sometimes slips.
function pilot(level,seed){
  const rand=rng((seed==null?7:seed)*2654435761>>>0),human=level==='human',react=new Map();
  const gauss=()=>{let u=0;while(u===0)u=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(6.2831853*rand());};
  let next=0;
  return function(game){
    const s=game.state;if(s.phase==='over'||s.t<next)return;
    const onScreen=e=>e.x>20&&e.x<s.W-20&&e.y>50&&e.y<s.H-30;
    const teas=s.ents.filter(e=>e.kind==='tea');
    const safe=(x0,y0,x1,y1,margin)=>teas.every(t=>segDist(t.x,t.y,x0,y0,x1,y1)>t.r*0.92+CFG.blade+margin);
    let target=null,urgency=-1e9;
    for(const e of s.ents){
      if(e.kind==='tea'||!onScreen(e))continue;
      if(!react.has(e.id))react.set(e.id,human?Math.max(0.3,0.6+0.2*gauss()):0.22);
      if(s.t-e.born<react.get(e.id))continue;
      const u=e.kind==='flyer'?(e.vx>0?e.x:s.W-e.x)*2:e.y+e.vy*0.4;
      if(u>urgency){urgency=u;target=e;}
    }
    const b=s.boss;
    if(!target&&s.phase==='boss'&&s.t-b.lastHit>=CFG.bossHitGap)target=b;
    if(!target)return;
    const err=human?50:0,cx=target.x+err*gauss(),cy=target.y+err*gauss(),len=target===b?b.r*0.7:64;
    const careless=human&&rand()<0.12;
    for(const a of[0.35,1.92,1.13,2.7]){
      const dx=Math.cos(a)*len,dy=Math.sin(a)*len;
      if(careless||safe(cx-dx,cy-dy,cx+dx,cy+dy,human?0:14)){
        game.swipe(cx-dx,cy-dy,cx+dx,cy+dy);next=s.t+(human?Math.max(0.16,0.34+0.09*gauss()):0.14);return;
      }
    }
    next=s.t+0.05;
  };
}
return{H,CFG,create,pilot,rng,segDist,multiplier};
});
