/* 骑楼擂台 simulation: seconds and world units (metres); no renderer, DOM, audio or wall clock.
   Ground plane is x (across the street) and z (along the street, the stage is at +z).
   Facing is an angle a: forward = (sin a, cos a). */
(function(root){
'use strict';
const STEP=1/60;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
const len=(x,z)=>Math.hypot(x,z);

// Feel table: every number SPEC.md promises lives here and nowhere else.
const FEEL={
  chainWindow:.35,buffer:.25,
  hitArc:75*Math.PI/180,
  roll:{dur:.5,i0:.05,i1:.35,dist:3.0,cool:.15},
  block:{arc:120*Math.PI/180,cut:.8,posture:15,maxPosture:100,broken:1.0,regen:25},
  hitstop:{hit:.05,heavy:.10},
  gong:{perHit:4,perHurt:-6,max:100,dur:8,rate:1.3,dmg:1.5},
  maxAttackers:2,grantGap:.8,
  hurt:.45,down:1.25,getup:1.0,waveHeal:30
};
// Attack moves. dur/hit are in move seconds; the renderer maps each move to a clip and playback rate.
// lead = how early the telegraph (tint flash) shows before the hit, enemies only.
const MOVES={
  jab:  {dur:.42,hit:.16,reach:1.45,dmg:6, lunge:.25,next:'cross'},
  cross:{dur:.46,hit:.18,reach:1.5, dmg:7, lunge:.3, next:'upper'},
  upper:{dur:.62,hit:.26,reach:1.5, dmg:11,lunge:.35,heavy:true},
  kick: {dur:.62,hit:.30,reach:1.7, dmg:9, lunge:.2, next:'spin'},
  spin: {dur:.86,hit:.42,reach:1.85,dmg:15,lunge:.25,heavy:true,arc:Math.PI},
  // enemies
  slap: {dur:.9, hit:.5, reach:1.4, dmg:5, lunge:.35,lead:.32},
  belly:{dur:1.5,hit:1.05,reach:1.3,dmg:12,lunge:4.2,lead:.6,heavy:true,charge:true},
  bite: {dur:1.0,hit:.55,reach:1.7, dmg:8, lunge:.6, lead:.4},
  sweep:{dur:1.3,hit:.75,reach:2.1, dmg:11,lunge:.3, lead:.5,heavy:true,arc:Math.PI*1.2},
  leap: {dur:1.6,hit:1.1,reach:1.6, dmg:14,lunge:5.0,lead:.6,heavy:true,charge:true}
};
const PLAYER={hp:100,walk:2.2,run:4.6,turn:14};
const KINDS={
  apo:      {hp:42, speed:2.6,keep:1.25,turn:9,moves:['slap'],cool:[.8,1.6],radius:.35,poise:0},
  baozugong:{hp:85, speed:1.7,keep:2.4, turn:5,moves:['belly'],cool:[1.6,2.6],radius:.5,heavyBody:true,poise:1.4},
  lionhead: {hp:340,speed:2.3,keep:1.7, turn:7,moves:['bite','sweep','leap'],cool:[.9,1.7],radius:.55,heavyBody:true,boss:true,poise:2.5}
};
// Waves walk the player down the street: each wave owns a stretch of z; clearing it opens the next.
const WAVES=[
  {name:'街口',z0:0, z1:12,foes:[['apo',-2,8],['apo',2,9],['apo',0,11],['apo',-1,11.5]]},
  {name:'骑楼下',z0:12,z1:26,foes:[['apo',-2,21],['apo',2,22],['apo',0,23],['baozugong',0,24.5]]},
  {name:'擂台前',z0:26,z1:40,foes:[['baozugong',-1.5,36],['baozugong',1.5,37],['apo',-2.5,38],['apo',2.5,38]]},
  {name:'擂台',z0:40,z1:52,foes:[['lionhead',0,49]],boss:true}
];
const HALF_W=3.6;

function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}

function create({seed=1}={}){
  const s={seed,rand:rng(seed),t:0,phase:'title',wave:-1,clear:false,enemies:[],nextId:1,
    player:{id:0,kind:'player',x:0,z:1,a:0,hp:PLAYER.hp,state:'idle',st:0,move:null,hitDone:false,
      buffered:null,bufT:0,chainT:0,lastMove:null,inv:false,rollCool:0,posture:0,guard:false,speed:0},
    gong:0,gongT:0,combo:0,comboT:0,kills:0,hitstop:0,
    tokens:{holders:[],lastGrant:-9},events:[],stats:{dmgTaken:0,hitsLanded:0,maxAttackers:0}};
  return s;
}
function start(s,{wave=0}={}){s.phase='fight';beginWave(s,wave);}
function beginWave(s,i){
  s.wave=i;s.clear=false;const w=WAVES[i];
  for(const [k,x,z] of w.foes)spawn(s,k,x,z);
  s.events.push({type:'wave',wave:i,name:w.name});
}
// Lost: start the current wave again with full health (a checkpoint, not a full restart).
function retry(s){
  const p=s.player,w=WAVES[s.wave];s.retries=(s.retries||0)+1;
  s.enemies=s.enemies.filter(e=>e.dead);s.tokens.holders.length=0;s.combo=0;s.gongT=0;s.hitstop=0;
  Object.assign(p,{hp:PLAYER.hp,x:0,z:w.z0+1,a:0,posture:0,inv:false,buffered:null});setState(p,'idle');
  s.phase='fight';s.clear=false;for(const [k,x,z] of w.foes)spawn(s,k,x,z);s.events.push({type:'retry',wave:s.wave});
}
function spawn(s,kind,x,z){
  const K=KINDS[kind];
  const e={id:s.nextId++,kind,x,z,a:Math.PI,hp:K.hp,maxHp:K.hp,state:'idle',st:0,move:null,hitDone:false,
    cool:.6+s.rand()*K.cool[1],side:s.rand()<.5?-1:1,phase2:false,dead:false};
  s.enemies.push(e);return e;
}
const alive=s=>s.enemies.filter(e=>!e.dead);
function setState(o,st,move=null){o.state=st;o.st=0;o.move=move;o.hitDone=false;}

function bounds(s){const w=WAVES[Math.max(0,s.wave)];return{z0:s.wave>0?WAVES[s.wave-1].z1-2:-1,z1:s.clear&&s.wave<WAVES.length-1?WAVES[s.wave+1].z1:w.z1};}

// ---------- player ----------
function playerStep(s,inp,dt){
  const p=s.player;p.st+=dt;p.rollCool=Math.max(0,p.rollCool-dt);
  if(p.bufT>0){p.bufT-=dt;if(p.bufT<=0)p.buffered=null;}
  for(const k of['punch','kick','roll'])if(inp[k]){p.buffered=k;p.bufT=FEEL.buffer;}
  if(inp.gong&&s.gong>=FEEL.gong.max&&s.gongT<=0){s.gongT=FEEL.gong.dur;s.gong=0;s.events.push({type:'gong'});}
  const rate=s.gongT>0?FEEL.gong.rate:1;
  const mx=inp.mx||0,mz=inp.mz||0,m=Math.min(1,len(mx,mz));
  if(p.state==='dead'||p.state==='win')return;
  if(p.state==='hurt'&&p.st<FEEL.hurt)return;
  if(p.state==='down'){if(p.st>=FEEL.down)setState(p,'getup');return;}
  if(p.state==='getup'){p.inv=true;if(p.st>=FEEL.getup){p.inv=false;setState(p,'idle');}return;}
  if(p.state==='broken'){if(p.st>=FEEL.block.broken)setState(p,'idle');return;}
  if(p.state==='roll'){
    const R=FEEL.roll;p.inv=p.st>=R.i0&&p.st<=R.i1;
    const v=R.dist/R.dur;p.x+=Math.sin(p.a)*v*dt;p.z+=Math.cos(p.a)*v*dt;
    if(p.st>=R.dur){p.inv=false;p.rollCool=R.cool;setState(p,'idle');}
    return;
  }
  if(p.state==='attack'){
    const M=MOVES[p.move];p.st+=dt*(rate-1);
    if(p.st<M.hit){const v=M.lunge/M.hit;p.x+=Math.sin(p.a)*v*dt;p.z+=Math.cos(p.a)*v*dt;}
    if(!p.hitDone&&p.st>=M.hit){p.hitDone=true;playerStrike(s,M);}
    if(p.st>=M.dur){p.lastMove=p.move;p.chainT=FEEL.chainWindow;setState(p,'idle');}
    else return;
  }
  p.chainT=Math.max(0,p.chainT-dt);
  // facing: auto-aim the nearest foe in front cone when attacking
  if(p.buffered==='roll'&&p.rollCool<=0){
    if(m>.1)p.a=Math.atan2(mx,mz);
    p.buffered=null;setState(p,'roll');s.events.push({type:'roll'});return;
  }
  if(p.buffered==='punch'||p.buffered==='kick'){
    const want=p.buffered;p.buffered=null;
    let mv=want==='punch'?'jab':'kick';
    if(p.chainT>0&&p.lastMove&&MOVES[p.lastMove].next){
      const nx=MOVES[p.lastMove].next;
      if((want==='punch'&&(nx==='cross'||nx==='upper'))||(want==='kick'&&nx==='spin'))mv=nx;
    }
    if(m>.1)p.a=Math.atan2(mx,mz);
    const tgt=nearestFoe(s,p,3.2);if(tgt)p.a=Math.atan2(tgt.x-p.x,tgt.z-p.z);
    p.guard=false;setState(p,'attack',mv);s.events.push({type:'swing',move:mv});return;
  }
  p.guard=!!inp.block;
  if(p.guard){p.state='block';p.speed=0;const t=nearestFoe(s,p,4);if(t)p.a=turnTo(p.a,Math.atan2(t.x-p.x,t.z-p.z),PLAYER.turn*dt);p.posture=Math.max(0,p.posture-FEEL.block.regen*.3*dt);return;}
  p.posture=Math.max(0,p.posture-FEEL.block.regen*dt);
  if(m>.1){
    const sp=(inp.walk?PLAYER.walk:PLAYER.run)*m*rate;p.a=turnTo(p.a,Math.atan2(mx,mz),PLAYER.turn*dt);
    p.x+=mx/m*sp*m*dt;p.z+=mz/m*sp*m*dt;p.speed=sp;if(p.state!=='move')setState(p,'move');
  }else{p.speed=0;if(p.state!=='idle')setState(p,'idle');}
}
function turnTo(a,b,max){const d=wrap(b-a);return a+clamp(d,-max,max);}
function nearestFoe(s,o,r){let best=null,bd=r;for(const e of alive(s)){const d=len(e.x-o.x,e.z-o.z);if(d<bd){bd=d;best=e;}}return best;}
function inArc(o,t,reach,arc){const dx=t.x-o.x,dz=t.z-o.z,d=len(dx,dz);if(d>reach+(KINDS[t.kind]?KINDS[t.kind].radius:.35))return false;return Math.abs(wrap(Math.atan2(dx,dz)-o.a))<=arc/2;}
function playerStrike(s,M){
  const p=s.player;let n=0;
  for(const e of alive(s)){
    if(e.dying||!inArc(p,e,M.reach,M.arc||FEEL.hitArc))continue;
    const dmg=M.dmg*(s.gongT>0?FEEL.gong.dmg:1);
    e.hp-=dmg;n++;s.stats.hitsLanded++;
    s.combo++;s.comboT=2.2;s.gong=Math.min(FEEL.gong.max,s.gong+FEEL.gong.perHit);
    const heavy=M.heavy||e.hp<=0;
    // knockback
    const dx=e.x-p.x,dz=e.z-p.z,d=len(dx,dz)||1;const kb=heavy?1.0:.35;e.x+=dx/d*kb;e.z+=dz/d*kb;
    releaseToken(s,e);
    if(e.hp<=0){e.hp=0;setState(e,'down');e.dying=true;s.kills++;s.events.push({type:'ko',id:e.id,kind:e.kind});}
    else{
      const K=KINDS[e.kind];
      if(heavy&&!K.boss&&!(K.heavyBody&&M!==MOVES.spin&&M!==MOVES.upper)){setState(e,'down');}
      else if((K.boss?heavy:true)&&(e.hurtCool||0)<=0){setState(e,'hurt');e.hurtCool=K.poise||0;}
    }
    s.events.push({type:'hit',id:e.id,dmg,heavy:!!heavy,move:p.move});
  }
  if(n)s.hitstop=Math.max(s.hitstop,M.heavy?FEEL.hitstop.heavy:FEEL.hitstop.hit);
  else s.events.push({type:'whiff',move:p.move});
}
function hurtPlayer(s,e,M){
  const p=s.player;
  if(p.inv||p.state==='dead'||p.state==='down'||p.state==='getup')return s.events.push({type:'dodged',id:e.id});
  const facing=Math.abs(wrap(Math.atan2(e.x-p.x,e.z-p.z)-p.a))<=FEEL.block.arc/2;
  if(p.state==='block'&&facing){
    const d=M.dmg*(1-FEEL.block.cut);p.hp-=d;s.stats.dmgTaken+=d;p.posture+=FEEL.block.posture*(M.heavy?2:1);
    s.events.push({type:'blocked',id:e.id});s.hitstop=Math.max(s.hitstop,.04);
    if(p.posture>=FEEL.block.maxPosture){p.posture=0;setState(p,'broken');s.events.push({type:'guardbreak'});}
  }else{
    p.hp-=M.dmg;s.stats.dmgTaken+=M.dmg;s.combo=0;s.gong=Math.max(0,s.gong+FEEL.gong.perHurt);
    setState(p,M.heavy?'down':'hurt');s.hitstop=Math.max(s.hitstop,.07);
    s.events.push({type:'hurt',id:e.id,dmg:M.dmg,heavy:!!M.heavy});
  }
  if(p.hp<=0){p.hp=0;setState(p,'dead');s.phase='lose';s.events.push({type:'lose'});}
}

// ---------- enemies ----------
function releaseToken(s,e){const h=s.tokens.holders,i=h.indexOf(e.id);if(i>=0)h.splice(i,1);}
function enemyStep(s,e,dt){
  const K=KINDS[e.kind],p=s.player;e.st+=dt;e.hurtCool=Math.max(0,(e.hurtCool||0)-dt);
  if(e.dead)return;
  if(K.boss&&!e.phase2&&!e.dying&&e.hp<=e.maxHp/2){e.phase2=true;s.events.push({type:'phase2',id:e.id});spawn(s,'apo',-3,WAVES[s.wave].z1-1);spawn(s,'apo',3,WAVES[s.wave].z1-1);}
  if(e.state==='down'){
    if(e.dying){if(e.st>=1.6){e.dead=true;s.events.push({type:'gone',id:e.id});}return;}
    if(e.st>=FEEL.down)setState(e,'getup');return;
  }
  if(e.state==='getup'){if(e.st>=FEEL.getup)setState(e,'idle');return;}
  if(e.state==='hurt'){if(e.st>=FEEL.hurt)setState(e,'idle');return;}
  const rate=e.phase2?1.15:1;
  const dx=p.x-e.x,dz=p.z-e.z,d=len(dx,dz),toP=Math.atan2(dx,dz);
  if(e.state==='attack'){
    const M=MOVES[e.move];e.st+=dt*(rate-1);
    if(e.st<M.hit){
      if(!M.charge||e.st<M.hit-.45)e.a=turnTo(e.a,toP,K.turn*dt*(M.charge?.3:1));
      if(e.st>=M.hit-M.lead&&!e.warned){e.warned=true;s.events.push({type:'tell',id:e.id,move:e.move});}
      const t0=M.charge?M.hit-.45:0;
      if(e.st>=t0){const v=M.lunge/(M.hit-t0);const step=Math.min(v*dt,Math.max(0,d-.6));e.x+=Math.sin(e.a)*step;e.z+=Math.cos(e.a)*step;}
    }
    if(!e.hitDone&&e.st>=M.hit){e.hitDone=true;if(inArc(e,p,M.reach,M.arc||FEEL.hitArc))hurtPlayer(s,e,M);else s.events.push({type:'miss',id:e.id});}
    if(e.st>=M.dur){releaseToken(s,e);e.warned=false;e.cool=K.cool[0]+s.rand()*(K.cool[1]-K.cool[0]);setState(e,'idle');}
    return;
  }
  e.cool-=dt;e.a=turnTo(e.a,toP,K.turn*dt);
  if(p.state==='dead'){setState(e,'idle');return;}
  const h=s.tokens.holders;
  const canAttack=e.cool<=0&&d<K.keep+1.2&&(h.length<FEEL.maxAttackers)&&s.t-s.tokens.lastGrant>=FEEL.grantGap;
  if(canAttack){
    const pool=K.moves.filter(m=>m!=='leap'||e.phase2||d>2.5);
    const mv=pool[Math.floor(s.rand()*pool.length)];
    h.push(e.id);s.tokens.lastGrant=s.t;s.stats.maxAttackers=Math.max(s.stats.maxAttackers,h.length);
    e.warned=false;setState(e,'attack',mv);return;
  }
  // approach to keep distance, circle a little when waiting
  let vx=0,vz=0;const keep=h.includes(e.id)?K.keep*.6:K.keep+(e.cool>0?.4:0);
  if(d>keep+.15){vx=dx/d;vz=dz/d;}else if(d<keep-.3){vx=-dx/d*.6;vz=-dz/d*.6;}
  else{vx=dz/d*e.side*.45;vz=-dx/d*e.side*.45;if(s.rand()<dt*.4)e.side*=-1;}
  // separation
  for(const o of alive(s))if(o!==e){const ox=e.x-o.x,oz=e.z-o.z,od=len(ox,oz);const r=K.radius+KINDS[o.kind].radius+.15;if(od<r&&od>1e-4){vx+=ox/od*1.5;vz+=oz/od*1.5;}}
  const vm=len(vx,vz);
  if(vm>.05){const sp=K.speed*rate*Math.min(1,vm);e.x+=vx/vm*sp*dt;e.z+=vz/vm*sp*dt;e.moving=true;}else e.moving=false;
  e.state=e.moving?'move':'idle';
}

function step(s,inp,dt){
  s.events.length=0;
  if(s.phase!=='fight')return s;
  if(s.hitstop>0){s.hitstop=Math.max(0,s.hitstop-dt);return s;}
  s.t+=dt;if(s.gongT>0)s.gongT=Math.max(0,s.gongT-dt);
  if(s.comboT>0){s.comboT-=dt;if(s.comboT<=0)s.combo=0;}
  playerStep(s,inp||{},dt);
  for(const e of s.enemies)enemyStep(s,e,dt);
  // keep everyone inside the street and the current stretch; bodies don't overlap the player
  const b=bounds(s),p=s.player;
  for(const o of[p,...alive(s)]){o.x=clamp(o.x,-HALF_W,HALF_W);o.z=clamp(o.z,b.z0,b.z1);}
  for(const e of alive(s)){if(e.state==='down')continue;const dx=e.x-p.x,dz=e.z-p.z,d=len(dx,dz),r=KINDS[e.kind].radius+.35;if(d<r&&d>1e-4){e.x=p.x+dx/d*r;e.z=p.z+dz/d*r;}}
  if(!s.clear&&s.wave>=0&&alive(s).length===0){
    s.clear=true;s.events.push({type:'clear',wave:s.wave});p.hp=Math.min(PLAYER.hp,p.hp+FEEL.waveHeal);
    if(s.wave===WAVES.length-1){s.phase='win';setState(p,'win');s.events.push({type:'win'});}
  }
  if(s.clear&&s.wave<WAVES.length-1&&p.z>=WAVES[s.wave+1].z0+1)beginWave(s,s.wave+1);
  return s;
}

// ---------- autopilot: drives tests, soak and fixed camera views ----------
// skill 1 = precise; lower adds reaction delay and sloppy timing (normal-distributed jitter).
function makeBot(seed=7,skill=1){
  const r=rng(seed);let react=0,plan=null;
  const gauss=()=>{let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  return function(s){
    const p=s.player,inp={mx:0,mz:0};
    if(s.phase!=='fight')return inp;
    const foes=alive(s).filter(e=>!e.dying);
    if(!foes.length){inp.mz=1;return inp;}
    if(s.gong>=FEEL.gong.max)inp.gong=true;
    let t=null,bd=1e9;for(const e of foes){const d=len(e.x-p.x,e.z-p.z);if(d<bd){bd=d;t=e;}}
    // threat: someone attacking and about to land
    const threat=foes.find(e=>e.state==='attack'&&e.st>MOVES[e.move].hit-MOVES[e.move].lead&&e.st<MOVES[e.move].hit&&len(e.x-p.x,e.z-p.z)<MOVES[e.move].reach+2);
    if(threat){
      if(react<=0)react=Math.max(0,(1-skill)*.25+gauss()*(1-skill)*.12);
      react-=STEP;
      if(react<=0){react=0;
        if(MOVES[threat.move].heavy){const ax=threat.x-p.x,az=threat.z-p.z,d=len(ax,az)||1;inp.mx=-az/d;inp.mz=ax/d;inp.roll=true;}
        else inp.block=true;
        return inp;}
    }else react=0;
    const dx=t.x-p.x,dz=t.z-p.z;
    if(bd>1.35){inp.mx=dx/bd;inp.mz=dz/bd;return inp;}
    if(p.state==='idle'||p.state==='move'||p.state==='block'){
      plan=(plan==='punch'&&p.lastMove==='upper')||(r()<.3)?'kick':'punch';
      if(skill<1&&r()<(1-skill)*.3)return inp;
      inp[plan]=true;
    }
    return inp;
  };
}
function run(s,bot,maxT=900){let n=0;while(s.phase==='fight'&&s.t<maxT&&n<maxT/STEP*2){step(s,bot(s),STEP);n++;}return s;}

const api={STEP,FEEL,MOVES,PLAYER,KINDS,WAVES,HALF_W,create,start,beginWave,spawn,retry,step,alive,makeBot,run,bounds,setState,wrap};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.QilouCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
