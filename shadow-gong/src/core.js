/* 灯影守夜 simulation: seconds and world units; no renderer, DOM, audio or wall clock.
   Game logic runs on scaled simulation time. Hit-stop and slow-motion envelopes run on real time. */
(function(root){
'use strict';
const STEP=1/120;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),sign=v=>v>0?1:v<0?-1:0;

// Feel table: every number the spec promises lives here and nowhere else.
const FEEL={
  parryWindow:.16,spamSpan:.4,parryPose:.42,minGuard:.2,counter:1,counterDmg:1.5,counterPosture:1.8,
  lead:.4,leadRed:.55,
  maxAttackers:2,grantGap:.7,hitGap:.35,
  stopScale:.02,
  perfect:{hitstop:.12,slow:{f:.4,dur:.45,in:.04,out:.16},sparks:28,shake:.010,push:.04,flare:.55,sound:'gong'},
  block:{hitstop:.05,sparks:7,shake:.004,sound:'thud'},
  hit:{hitstop:.045,sparks:5,shake:.003,sound:'slap'},
  counterHit:{hitstop:.08,sparks:9,shake:.006,push:.015,sound:'slapBig'},
  deflect:{hitstop:.06,sparks:10,shake:.005,sound:'clang'},
  hurt:{hitstop:.07,shake:.008,flare:-.28,sound:'hurt'},
  execute:{hitstop:.16,slow:{f:.5,dur:.35,in:.03,out:.15},sparks:40,shake:.014,push:.05,flare:.7,sound:'gongBig'},
  nearMiss:{slow:{f:.6,dur:.18,in:.02,out:.08},sound:'whoosh'},
  bossDown:{hitstop:.2,slow:{f:.3,dur:1.4,in:.05,out:.6},sparks:60,shake:.02,push:.06,flare:.9,sound:'gongBig'}
};
const PLAYER={
  hp:100,posture:100,walk:3.4,guardWalk:1.5,clamp:6.9,
  dodge:{dur:.38,i0:.04,i1:.30,dist:2.4,cool:.12},
  hurt:.32,down:.9,broken:1.1,
  exec:{dur:.55,hit:.24,reach:2,heal:6},
  postureRegen:20,guardRegen:9,postureDelay:.9,
  attacks:[
    {dur:.34,hit:.12,reach:1.75,dmg:1,posture:8,lunge:.22,chain:.18},
    {dur:.34,hit:.12,reach:1.75,dmg:1,posture:8,lunge:.22,chain:.18},
    {dur:.48,hit:.2,reach:1.95,dmg:1.6,posture:14,lunge:.35,chain:Infinity}
  ],
  buffer:.22,waveHeal:15
};
const S=(hit,reach,dmg,posture,extra)=>Object.assign({hit,reach,dmg,posture,lead:FEEL.lead},extra);
const KINDS={
  moth:{hp:2,posture:30,speed:3.2,rate:1,flying:true,keep:2.3,wait:3.6,clamp:6.2,cool:[1.3,2.3],gain:999,stun:1.5,regen:30,width:.9,
    moves:{pounce:{dur:1.15,type:'dive',strikes:[S(.64,1.05,7,14)]}}},
  scissors:{hp:6,posture:100,speed:1.7,rate:.92,keep:1.8,wait:3.4,clamp:6.6,cool:[1.1,1.9],gain:35,stun:1.8,regen:14,width:.6,
    moves:{
      snip:{dur:1.95,type:'melee',strikes:[S(.72,1.95,11,18,{lunge:.5}),S(1.44,1.95,11,18,{lunge:.5})]},
      thrust:{dur:1.05,type:'melee',range:[2.2,3.4],strikes:[S(.56,2.05,13,22,{lunge:1.2})]}}},
  // the boss carries three lamp-oil marks; only an execution puts one out
  rat:{hp:3,posture:140,speed:1.5,rate:1,keep:2.2,wait:2.4,clamp:5.6,cool:[.8,1.5],gain:18,stun:2.2,regen:10,width:1.1,boss:true,marks:true,
    moves:{
      ladle:{dur:2.5,type:'melee',strikes:[S(.74,2.45,13,20,{lunge:.35}),S(1.26,2.45,13,20,{lunge:.3}),S(2,2.45,14,22,{lunge:.45,finisher:true})]},
      fling:{dur:1.5,type:'fling',strikes:[S(.95,3.4,22,0,{unblockable:true,lead:FEEL.leadRed})]},
      leap:{dur:1.6,type:'leap',range:[3.6,99],strikes:[S(1,1.9,16,26,{gain:28,finisher:true})]}}}
};
const WAVES=[
  {title:'第一场',name:'扑灯',spawns:[['moth',-1,.6],['moth',1,2.4],['moth',-1,4.2],['moth',1,9]]},
  {title:'第二场',name:'咔嚓',spawns:[['scissors',1,.5],['scissors',-1,1.7],['scissors',1,9]]},
  {title:'第三场',name:'灯下乱',spawns:[['scissors',1,.5],['moth',-1,1.3],['moth',1,2.9],['scissors',-1,7],['moth',-1,9],['moth',1,11],['moth',-1,13]]},
  {title:'第四场',name:'鼠王',boss:true,spawns:[['rat',1,.3]]}
];
const INTRO=2.4,BREATHER=3.5,BOSS_INTRO=2.4;

function rng(seed){let n=seed>>>0;return()=>{n=n+0x6D2B79F5>>>0;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const freshFeel=()=>({hitstop:0,pulses:[],shake:0,push:0,pushRate:0,pushAt:{x:0,y:1.6},flare:0});
const freshStats=()=>({perfect:0,block:0,hurt:0,exec:0,kills:0,chain:0,bestChain:0,evade:0,dmgTaken:0,time:0});
function makePlayer(){
  return{x:0,y:0,face:1,hp:PLAYER.hp,maxHp:PLAYER.hp,posture:0,maxPosture:PLAYER.posture,postureT:-9,
    state:'idle',st:0,stateDur:0,walkPhase:0,blockDown:false,blockPressT:-99,pressWindow:FEEL.parryWindow,guardUntil:-99,presses:[],
    attackPressT:-99,dodgePressT:-99,dodgeWant:0,dodgeDir:1,dodgeDur:PLAYER.dodge.dur,dodgeEnd:-99,
    combo:0,attackDur:0,attackHit:0,attackDone:false,counterUntil:-99,recoil:0,execTarget:0,execDone:false,hits:[]};
}
function create(options={}){
  const seed=(options.seed>>>0)||1;
  return{seed,rand:rng(seed),time:0,real:0,acc:0,phase:'menu',paused:false,phaseTime:0,
    wave:-1,waveTime:0,spawnIdx:0,startWave:0,winAt:0,loseAt:0,bossReached:false,
    player:makePlayer(),enemies:[],nextId:1,tokens:{holders:[],lastGrant:-99},
    feel:freshFeel(),events:[],pending:{blockPressed:false,attackPressed:false,dodgePressed:false},stats:freshStats()};
}
function start(s,opts={}){
  const wave=clamp(opts.wave|0,0,WAVES.length-1);
  Object.assign(s,{time:0,acc:0,phase:'intro',paused:false,phaseTime:0,wave:-1,waveTime:0,spawnIdx:0,startWave:wave,winAt:0,loseAt:0,
    player:makePlayer(),enemies:[],tokens:{holders:[],lastGrant:-99},feel:freshFeel(),events:[{type:'intro',wave}],stats:freshStats()});
  s.pending={blockPressed:false,attackPressed:false,dodgePressed:false};
  s.bossReached=wave===WAVES.length-1;   // a fresh start from the first scene forgets the checkpoint
}
function retry(s){start(s,{wave:s.bossReached?WAVES.length-1:0});}
function pause(s,on){if(['intro','fight','breather'].includes(s.phase))s.paused=on===undefined?!s.paused:!!on;return s.paused;}
const setState=(o,state,dur=0)=>{o.state=state;o.st=0;o.stateDur=dur;};

// ---- feel: hit-stop and slow motion live on real time --------------------------------------
function addFeel(s,fx,at){
  const f=s.feel;
  if(fx.hitstop)f.hitstop=Math.max(f.hitstop,fx.hitstop);
  if(fx.slow)f.pulses.push({...fx.slow,u:-(fx.hitstop||0)});
  if(fx.shake)f.shake=Math.max(f.shake,fx.shake);
  if(fx.push){f.push=Math.max(f.push,fx.push);f.pushRate=fx.push/.35;if(at)f.pushAt={x:at.x,y:at.y};}
  if(fx.flare)f.flare=clamp(f.flare+fx.flare,-.5,.9);
}
function envelope(p){
  if(p.u<0)return 1;
  if(p.u<p.in)return 1+(p.f-1)*p.u/p.in;
  if(p.u<p.dur-p.out)return p.f;
  return p.f+(1-p.f)*clamp((p.u-(p.dur-p.out))/p.out,0,1);
}
function timeScale(s){
  if(s.feel.hitstop>0)return FEEL.stopScale;
  let k=1;for(const p of s.feel.pulses)k=Math.min(k,envelope(p));return k;
}
function advanceReal(s,dt){
  const f=s.feel;s.real+=dt;
  f.hitstop=Math.max(0,f.hitstop-dt);
  for(const p of f.pulses)p.u+=dt;
  f.pulses=f.pulses.filter(p=>p.u<p.dur);
  f.shake*=Math.exp(-dt/.09);if(f.shake<1e-4)f.shake=0;
  f.push=Math.max(0,f.push-dt*f.pushRate);
  f.flare*=Math.exp(-dt/.13);if(Math.abs(f.flare)<1e-3)f.flare=0;
}
// One rendered frame: scale real time, run fixed simulation steps, then advance the real-time envelopes.
function run(s,realDt,input={}){
  realDt=clamp(realDt||0,0,.1);
  if(s.paused||s.phase==='menu')return 0;
  s.acc+=realDt*timeScale(s);
  const edges={blockPressed:!!input.blockPressed||s.pending.blockPressed,attackPressed:!!input.attackPressed||s.pending.attackPressed,dodgePressed:!!input.dodgePressed||s.pending.dodgePressed};
  let steps=0;
  while(s.acc>=STEP-1e-12){
    step(s,steps===0?{...input,...edges}:{...input,blockPressed:false,attackPressed:false,dodgePressed:false},STEP);
    s.acc-=STEP;if(++steps>30){s.acc=0;break;}
  }
  s.pending=steps?{blockPressed:false,attackPressed:false,dodgePressed:false}:edges;
  advanceReal(s,realDt);
  return steps;
}

// ---- tokens: how many enemies may be mid-attack at once --------------------------------------
function plannedHits(s,e,move,fromClock){
  const out=[];for(const st of move.strikes)if(st.hit>=fromClock)out.push(s.time+(st.hit-fromClock)/e.rate);return out;
}
function requestToken(s,e,move){
  const T=s.tokens;
  if(T.holders.includes(e.id))return true;
  if(T.holders.length>=FEEL.maxAttackers||s.time-T.lastGrant<FEEL.grantGap)return false;
  const mine=plannedHits(s,e,move,0);
  for(const id of T.holders){
    const o=s.enemies.find(x=>x.id===id);if(!o||o.state!=='attack')continue;
    const theirs=o.move.strikes.filter((st,k)=>!o.done[k]).map(st=>s.time+(st.hit-o.clock)/o.rate);
    for(const a of mine)for(const b of theirs)if(Math.abs(a-b)<FEEL.hitGap)return false;
  }
  T.holders.push(e.id);T.lastGrant=s.time;
  s.events.push({type:'token',id:e.id,t:s.time,holders:T.holders.length});
  return true;
}
function releaseToken(s,e){const T=s.tokens;T.holders=T.holders.filter(id=>id!==e.id);}

// ---- spawning and the director ------------------------------------------------------------
function spawn(s,kind,side,opts={}){
  const K=KINDS[kind];
  const e={id:s.nextId++,kind,x:opts.x!==undefined?opts.x:side*(kind==='rat'?4.6:8.9),y:K.flying?2.3:0,face:-side,side,
    hp:K.hp,maxHp:K.hp,posture:0,maxPosture:K.posture,postureT:-9,state:kind==='rat'?'intro':'enter',st:0,stateDur:0,
    rate:K.rate,cool:.5+s.rand()*.6,walkPhase:s.rand()*6,flap:s.rand()*6,move:null,clock:0,prevClock:0,tel:[],done:[],telT:[],
    lockX:0,lockY:0,startX:0,startY:0,landX:0,depth:kind==='rat'?1:0,hover:K.flying?1.9+s.rand()*.6:0,phase2:false,gone:false,parries:0};
  if(opts.state){e.state=opts.state;e.depth=0;}
  s.enemies.push(e);s.events.push({type:'spawn',id:e.id,kind,side});
  return e;
}
function beginWave(s,i){
  s.wave=i;s.phase='fight';s.phaseTime=0;s.waveTime=0;s.spawnIdx=0;
  if(WAVES[i].boss)s.bossReached=true;
  s.events.push({type:'wave',index:i,title:WAVES[i].title,name:WAVES[i].name});
}
function director(s,dt){
  if(s.phase==='intro'){if(s.phaseTime>=INTRO)beginWave(s,s.startWave);return;}
  if(s.phase==='breather'){if(s.phaseTime>=BREATHER)beginWave(s,s.wave+1);return;}
  if(s.phase!=='fight')return;
  if(s.loseAt&&s.time>=s.loseAt){s.phase='lost';s.events.push({type:'lost'});return;}
  if(s.winAt&&s.time>=s.winAt){s.phase='won';setState(s.player,'won');s.stats.time=s.time;s.events.push({type:'won'});return;}
  const w=WAVES[s.wave];s.waveTime+=dt;
  while(s.spawnIdx<w.spawns.length&&s.waveTime>=w.spawns[s.spawnIdx][2]){const [k,side]=w.spawns[s.spawnIdx++];spawn(s,k,side);}
  if(!s.winAt&&!s.loseAt&&s.spawnIdx>=w.spawns.length&&!s.enemies.length&&s.wave<WAVES.length-1){
    s.phase='breather';s.phaseTime=0;const p=s.player;p.hp=Math.min(p.maxHp,p.hp+PLAYER.waveHeal);
    s.events.push({type:'breather',next:s.wave+1});
  }
}

// ---- player ---------------------------------------------------------------------------
const canGuard=p=>['idle','walk','guard','parry','attack','bounced'].includes(p.state);
const alive=e=>!['dead','intro','enter'].includes(e.state)&&!e.gone;
function nextStrike(e){if(e.state!=='attack')return-1;for(let k=0;k<e.move.strikes.length;k++)if(!e.done[k])return k;return-1;}
function threatSide(s){
  const p=s.player;let best=null;
  for(const e of s.enemies){const k=nextStrike(e);if(k<0)continue;const tth=(e.move.strikes[k].hit-e.clock)/e.rate;if(tth<=.7&&(!best||tth<best.tth))best={e,tth};}
  if(best)return-best.e.face||sign(best.e.x-p.x);
  let near=null;for(const e of s.enemies)if(alive(e)){const d=Math.abs(e.x-p.x);if(d<3.2&&(!near||d<near.d))near={e,d};}
  return near?sign(near.e.x-p.x)||p.face:0;
}
function pressBlock(s,p){
  const recent=p.presses.filter(t=>s.time-t<FEEL.spamSpan-1e-9).length;
  p.presses=p.presses.filter(t=>s.time-t<1).concat(s.time);
  if(!canGuard(p))return;
  p.blockPressT=s.time;p.pressWindow=FEEL.parryWindow/(1+recent);p.guardUntil=s.time+FEEL.minGuard;p.attackPressT=-99;  // a guard press cancels a buffered swing
  const side=threatSide(s);if(side)p.face=side;
  if(p.state!=='parry'&&p.state!=='guard')setState(p,'guard');
  s.events.push({type:'press',t:s.time,window:p.pressWindow});
}
function executableNear(s,p){
  let best=null;for(const e of s.enemies){if(e.state!=='stun')continue;const d=Math.abs(e.x-p.x);if(d<=PLAYER.exec.reach&&(!best||d<best.d))best={e,d};}
  return best&&best.e;
}
function startAttack(s,p,combo){
  const A=PLAYER.attacks[combo];setState(p,'attack');p.combo=combo;p.attackDur=A.dur;p.attackHit=A.hit;p.attackDone=false;p.attackPressT=-99;
  let near=null;for(const e of s.enemies)if(alive(e)){const d=Math.abs(e.x-p.x);if(d<3&&(!near||d<near.d))near={e,d};}
  if(near)p.face=sign(near.e.x-p.x)||p.face;
  s.events.push({type:'swing',combo});
}
function updatePlayer(s,inp,dt){
  const p=s.player;p.st+=dt;p.recoil=Math.max(0,p.recoil-dt/.3);
  if(p.state==='dead'||p.state==='won')return;
  if(inp.blockPressed)pressBlock(s,p);
  if(inp.attackPressed)p.attackPressT=s.time;
  const dir=(inp.right?1:0)-(inp.left?1:0);
  if(inp.dodgePressed){p.dodgePressT=s.time;p.dodgeWant=dir;}
  p.blockDown=!!inp.blockDown||!!inp.blockPressed;
  const holding=p.blockDown||s.time<p.guardUntil;
  // timed states
  if(['hurt','down','broken','bounced'].includes(p.state)&&p.st>=p.stateDur)setState(p,holding?'guard':'idle');
  if(p.state==='parry'&&p.st>=FEEL.parryPose)setState(p,holding?'guard':'idle');
  if(p.state==='guard'&&!holding)setState(p,'idle');
  if(p.state==='dodge'){
    const D=PLAYER.dodge;p.x+=p.dodgeDir*D.dist/D.dur*dt*(p.st<D.dur*.8?1.15:.4);
    if(p.st>=p.dodgeDur){setState(p,holding?'guard':'idle');p.dodgeEnd=s.time;}
  }
  if(p.state==='attack'){
    const A=PLAYER.attacks[p.combo];
    if(p.st<A.hit)p.x+=p.face*A.lunge/A.hit*dt;
    if(!p.attackDone&&p.st>=A.hit){p.attackDone=true;playerStrike(s,p,A);}
    if(s.time-p.attackPressT<=PLAYER.buffer&&p.st>=A.chain&&p.combo<2)startAttack(s,p,p.combo+1);
    else if(p.st>=A.dur)setState(p,holding?'guard':'idle');
  }
  if(p.state==='execute'){
    if(!p.execDone&&p.st>=PLAYER.exec.hit){p.execDone=true;resolveExecute(s,p);}
    if(p.st>=PLAYER.exec.dur)setState(p,'idle');
  }
  // free to act: dodge > execute > attack > guard
  const free=['idle','walk','guard','parry'].includes(p.state)||(p.state==='attack'&&p.attackDone);
  if(free){
    if(s.time-p.dodgePressT<=PLAYER.buffer&&s.time-p.dodgeEnd>=PLAYER.dodge.cool){
      setState(p,'dodge');p.dodgeDur=PLAYER.dodge.dur;p.dodgeDir=p.dodgeWant||-p.face;p.dodgePressT=-99;s.events.push({type:'dodge'});
    }else if(s.time-p.attackPressT<=PLAYER.buffer&&p.state!=='attack'){
      const ex=executableNear(s,p);
      if(ex){setState(p,'execute');p.execTarget=ex.id;p.execDone=false;p.face=sign(ex.x-p.x)||p.face;p.attackPressT=-99;ex.execBy=true;s.events.push({type:'executeStart',id:ex.id});}
      else startAttack(s,p,0);
    }else if(holding&&p.state!=='guard'&&p.state!=='parry'&&p.state!=='attack')setState(p,'guard');
  }
  // walking
  if(['idle','walk','guard'].includes(p.state)){
    const speed=p.state==='guard'?PLAYER.guardWalk:PLAYER.walk;
    p.x+=dir*speed*dt;
    if(p.state!=='guard'){if(dir){p.face=dir;if(p.state!=='walk')setState(p,'walk');p.walkPhase+=dt*speed*2.6;}else if(p.state==='walk')setState(p,'idle');}
  }
  // bodies do not walk through each other; a dodge rolls through, and a stunned opponent can be stepped up to
  if(p.state!=='dodge')for(const e of s.enemies){
    const K=KINDS[e.kind];if(!alive(e)||K.flying||e.state==='stun')continue;
    const gap=.45+K.width*.8,d=p.x-e.x;if(Math.abs(d)<gap)p.x=e.x+(sign(d)||-e.face)*gap;
  }
  p.x=clamp(p.x,-PLAYER.clamp,PLAYER.clamp);
  // posture recovers when the guard is not being pressed
  if(s.time-p.postureT>PLAYER.postureDelay)p.posture=Math.max(0,p.posture-dt*(p.state==='guard'?PLAYER.guardRegen:PLAYER.postureRegen));
}
function playerStrike(s,p,A){
  let target=null,best=Infinity;
  for(const e of s.enemies){
    if(!alive(e)||(e.depth||0)>.2)continue;
    const K=KINDS[e.kind],dx=(e.x-p.x)*p.face;
    if(dx<-.35||dx-K.width>A.reach)continue;
    const lo=K.flying?e.y-.4:e.y,hi=K.flying?e.y+.4:e.y+(e.kind==='rat'?4:2.2);
    if(hi<.4||lo>2.9)continue;
    if(dx<best){best=dx;target=e;}
  }
  if(!target){s.events.push({type:'whiff'});return;}
  const e=target,counter=s.time<=p.counterUntil,at={x:e.x-p.face*.2*KINDS[e.kind].width,y:KINDS[e.kind].flying?e.y:1.6};
  // Only an opened opponent takes the drumstick: after a perfect parry, while stunned or recoiling,
  // or in the recovery after its last strike. Otherwise moths flit away and blades turn the blow.
  if(!isOpen(s,e)){
    if(e.kind==='moth'){e.x+=p.face*.9;e.y=Math.min(3,e.y+.4);s.events.push({type:'flit',id:e.id,at});return;}
    setState(p,'bounced',.25);p.x-=p.face*.3;   // a turned blow costs offense, never the guard
    s.events.push({type:'deflect',id:e.id,kind:e.kind,at,...FEEL.deflect});addFeel(s,FEEL.deflect,at);return;
  }
  const dmg=A.dmg*(counter?FEEL.counterDmg:1),post=A.posture*(counter?FEEL.counterPosture:1);
  if(counter)p.counterUntil=-99;                    // the bonus is for the first answer only
  if(!KINDS[e.kind].marks)e.hp-=dmg;                 // the boss only loses marks to executions
  addPosture(s,e,post);
  const fx=counter?FEEL.counterHit:FEEL.hit;
  s.events.push({type:'hit',id:e.id,kind:e.kind,counter,dmg,at,...fx});addFeel(s,fx,at);
  if(e.kind==='rat')checkPhase2(s,e);
  if(e.hp<=0){kill(s,e);return;}
  if(e.state==='attack'&&!e.tel.some(Boolean)&&e.kind!=='rat'){endMove(s,e);setState(e,'recoil',.35);}  // flinch before committing
  else if(e.kind==='moth'&&e.state!=='stun'&&e.state!=='attack'){setState(e,'recoil',.35);e.x+=p.face*.8;}
}
function isOpen(s,e){
  if(s.time<=s.player.counterUntil||e.state==='stun'||e.state==='recoil')return true;
  if(e.state!=='attack')return false;
  if(nextStrike(e)<0)return true;                     // recovering after its last strike
  return e.kind==='moth'&&e.tel[0];                    // a committed dive can be met head-on
}
function resolveExecute(s,p){
  const e=s.enemies.find(x=>x.id===p.execTarget);if(e)e.execBy=false;if(!e||e.state!=='stun')return;
  const at={x:e.x,y:KINDS[e.kind].flying?e.y:1.7};s.stats.exec++;p.hp=Math.min(p.maxHp,p.hp+PLAYER.exec.heal);
  if(e.kind==='rat'){
    e.hp-=1;e.execBy=false;
    if(e.hp<=0){kill(s,e);return;}
    e.posture=0;setState(e,'recoil',.9);e.x+=p.face*.9;checkPhase2(s,e);
    s.events.push({type:'execute',id:e.id,kind:e.kind,at,...FEEL.execute});addFeel(s,FEEL.execute,at);
  }else{s.events.push({type:'execute',id:e.id,kind:e.kind,at,...FEEL.execute});addFeel(s,FEEL.execute,at);kill(s,e,true);}
}

// ---- enemies ---------------------------------------------------------------------------
function addPosture(s,e,v){
  e.posture+=v;e.postureT=s.time;
  if(e.posture>=e.maxPosture&&e.state!=='stun'&&e.state!=='dead'){stun(s,e);return true;}
  return false;
}
function stun(s,e){
  const K=KINDS[e.kind];endMove(s,e);setState(e,'stun',K.stun);e.posture=e.maxPosture;
  if(K.flying){e.fallFrom=e.y;e.fallFromX=e.x;e.fallToX=clamp(e.x-e.face*1.4,-K.clamp,K.clamp);}   // knocked back the way it came, landing in front of the hero
  s.events.push({type:'stun',id:e.id,kind:e.kind});
}
function endMove(s,e){releaseToken(s,e);if(e.state==='attack'){const K=KINDS[e.kind];e.cool=K.cool[0]+s.rand()*(K.cool[1]-K.cool[0]);}}
function kill(s,e,quiet){
  releaseToken(s,e);setState(e,'dead');e.hp=0;s.stats.kills++;
  s.events.push({type:'death',id:e.id,kind:e.kind,quiet:!!quiet});
  if(KINDS[e.kind].boss){
    s.winAt=s.time+1.6;addFeel(s,FEEL.bossDown,{x:e.x,y:2});
    s.events.push({type:'bossDown',id:e.id,at:{x:e.x,y:2},...FEEL.bossDown});
    for(const o of s.enemies)if(o!==e&&o.state!=='dead'){releaseToken(s,o);setState(o,'dead');}
  }
}
function checkPhase2(s,e){
  if(e.phase2||e.hp>1)return;
  e.phase2=true;e.rate=1.12;s.events.push({type:'phase2',id:e.id});
  spawn(s,'moth',-1);spawn(s,'moth',1);
}
function chooseMove(s,e,dist){
  if(e.kind==='moth')return dist<=3.1?'pounce':null;
  if(e.kind==='scissors'){if(dist<=2.15)return'snip';if(dist<=3.4&&s.rand()<.5)return'thrust';return null;}
  if(dist>3.6)return'leap';
  if(s.rand()<(e.phase2?.34:.22))return dist<=3.2?'fling':null;
  return dist<=2.6?'ladle':null;
}
function startMove(s,e,name){
  const m=KINDS[e.kind].moves[name];
  setState(e,'attack');e.move={name,...m};e.moveT=s.time;e.clock=0;e.prevClock=0;e.tel=[];e.done=[];e.telT=[];
  e.startX=e.x;e.startY=e.y;e.lockX=s.player.x;e.lockY=1.35;e.landX=e.x;
  s.events.push({type:'moveStart',id:e.id,kind:e.kind,move:name});
}
function inReach(s,e,st){
  const p=s.player,t=e.move.type,dx=(p.x-e.x)*e.face;
  if(t==='dive'||t==='leap')return Math.abs(p.x-e.x)<=st.reach&&dx>=-st.reach;
  if(t==='fling')return dx>=-.2&&dx<=st.reach;
  return dx>=-.3&&dx<=st.reach;
}
function resolveStrike(s,e,k){
  const st=e.move.strikes[k],p=s.player;
  const ev={type:'strike',id:e.id,kind:e.kind,move:e.move.name,strike:k,t:s.time,telT:e.telT[k],unblockable:!!st.unblockable};
  if(p.state==='dead'||!inReach(s,e,st)){ev.outcome='whiff';s.events.push(ev);return;}
  const at={x:p.x+p.face*.85,y:e.kind==='moth'?Math.max(1.2,e.y):1.7};ev.at=at;
  const D=PLAYER.dodge;
  if(p.state==='execute'){ev.outcome='evade';s.events.push(ev);return;}   // a deathblow is never interrupted
  if(p.state==='dodge'&&p.st>=D.i0&&p.st<=D.i1){
    ev.outcome='evade';s.stats.evade++;s.events.push(ev);
    if(st.unblockable||p.st<.2){s.events.push({type:'nearMiss',at,...FEEL.nearMiss});addFeel(s,FEEL.nearMiss,at);}
    return;
  }
  const facing=p.face===-e.face,guarding=(p.state==='parry'||p.state==='guard')&&facing;
  if(guarding&&!st.unblockable){
    const delta=s.time-p.blockPressT,perfect=p.state==='parry'||delta<=p.pressWindow+1e-9;
    ev.outcome=perfect?'perfect':'block';ev.delta=delta;s.events.push(ev);
    if(perfect)perfectParry(s,e,st,at);else normalBlock(s,e,st,at);
    return;
  }
  ev.outcome='hurt';s.events.push(ev);hurt(s,e,st,at);
}
function perfectParry(s,e,st,at){
  const p=s.player;
  if(p.state!=='parry')setState(p,'parry');
  p.counterUntil=s.time+FEEL.counter;s.stats.perfect++;s.stats.chain++;s.stats.bestChain=Math.max(s.stats.bestChain,s.stats.chain);
  s.events.push({type:'parry',perfect:true,id:e.id,kind:e.kind,move:e.move.name,at,...FEEL.perfect});addFeel(s,FEEL.perfect,at);
  e.parries++;
  if(e.kind==='moth'){stun(s,e);return;}
  const broke=addPosture(s,e,st.gain||KINDS[e.kind].gain);
  if(!broke&&st.finisher){endMove(s,e);setState(e,'recoil',.7);e.x-=e.face*.5;}
}
function normalBlock(s,e,st,at){
  const p=s.player;s.stats.block++;
  p.posture+=st.posture;p.postureT=s.time;p.recoil=1;p.x-=p.face*.3;
  const broken=p.posture>=p.maxPosture;
  s.events.push({type:'parry',perfect:false,broken,id:e.id,kind:e.kind,move:e.move.name,at,...FEEL.block});addFeel(s,FEEL.block,at);
  if(broken){p.posture=0;setState(p,'broken',PLAYER.broken);}
}
function hurt(s,e,st,at){
  const p=s.player;s.stats.hurt++;s.stats.chain=0;s.stats.dmgTaken+=st.dmg;
  p.hp-=st.dmg;p.posture=Math.min(p.maxPosture-1,p.posture+st.dmg*.5);p.postureT=s.time;p.x-=p.face*.5;
  s.events.push({type:'hurt',id:e.id,kind:e.kind,dmg:st.dmg,at,...FEEL.hurt});addFeel(s,FEEL.hurt,at);
  if(p.hp<=0){p.hp=0;setState(p,'dead');s.loseAt=s.time+1.2;for(const o of s.enemies)releaseToken(s,o);return;}
  setState(p,st.unblockable||st.dmg>=16?'down':'hurt',st.unblockable||st.dmg>=16?PLAYER.down:PLAYER.hurt);
}
function think(s,e,dt){
  const p=s.player,K=KINDS[e.kind],dx=p.x-e.x,dist=Math.abs(dx);
  if(dist>.05)e.face=sign(dx);
  e.cool-=dt;
  if(e.cool<=0&&p.state!=='dead'){
    const m=chooseMove(s,e,dist);
    if(m&&requestToken(s,e,K.moves[m])){startMove(s,e,m);return;}
  }
  // hold a slot on our side of the player; queue up behind allies on the same side
  const side=sign(e.x-p.x)||e.side;
  const mates=s.enemies.filter(o=>alive(o)&&o!==e&&o.kind!=='rat'&&sign(o.x-p.x)===side&&Math.abs(o.x-p.x)<Math.abs(e.x-p.x)).length;
  const want=(e.cool<=.35&&s.tokens.holders.length<FEEL.maxAttackers?K.keep:K.wait)+mates*1.15*(e.kind==='rat'?0:1);
  const target=clamp(p.x+side*want,-K.clamp,K.clamp),go=target-e.x;
  const v=Math.abs(go)>.08?sign(go)*Math.min(K.speed,Math.abs(go)*3):0;
  e.x+=v*dt;
  if(K.flying)e.y+=(e.hover-e.y)*Math.min(1,dt*2);
  const moving=Math.abs(v)>.2;
  if(!K.flying){if(moving){e.walkPhase+=dt*Math.abs(v)*2.4;if(e.state!=='walk')setState(e,'walk');}else if(e.state!=='idle')setState(e,'idle');}
  else if(e.state!=='idle')setState(e,'idle');
}
function updateAttack(s,e,dt){
  const m=e.move,p=s.player;e.prevClock=e.clock;e.clock+=dt*e.rate;
  for(let k=0;k<m.strikes.length;k++){
    const st=m.strikes[k],tel=st.hit-st.lead*e.rate;
    if(!e.tel[k]&&e.clock>=tel){
      e.tel[k]=true;e.telT[k]=s.time;e.lockX=p.x;e.lockY=clamp(p.y+1.35,1.1,1.6);
      if(Math.abs(p.x-e.x)>.05)e.face=sign(p.x-e.x);
      if(m.type==='leap')e.landX=clamp(e.lockX-e.face*(.6+KINDS[e.kind].width*.8),-KINDS[e.kind].clamp,KINDS[e.kind].clamp);
      s.events.push({type:'telegraph',id:e.id,kind:e.kind,move:m.name,strike:k,t:s.time,hitAt:s.time+(st.hit-e.clock)/e.rate,unblockable:!!st.unblockable});
    }
    if(!e.done[k]&&e.clock>=st.hit){e.done[k]=true;resolveStrike(s,e,k);if(e.state!=='attack')return;}
  }
  const K=KINDS[e.kind],u=e.clock;
  if(m.type==='melee'){
    const k=nextStrike(e),st=m.strikes[Math.max(0,k)];
    if(k>=0&&!e.tel[k]){const want=p.x-e.face*K.keep*.9;e.x+=clamp(want-e.x,-1,1)*K.speed*.45*dt;if(Math.abs(p.x-e.x)>.05)e.face=sign(p.x-e.x);}
    else if(k>=0&&u>st.hit-.14){const room=Math.max(0,(e.lockX-e.x)*e.face-(.55+K.width*.7));e.x+=e.face*Math.min(room,st.lunge/.14*dt*e.rate);}  // stop short of the body, never on top of it
  }else if(m.type==='dive'){
    const st=m.strikes[0],tel=st.hit-st.lead*e.rate;
    if(u<tel){e.y+=(e.hover+.35-e.y)*Math.min(1,dt*4);e.x-=e.face*.4*dt;e.startX=e.x;e.startY=e.y;}
    else if(u<st.hit){const k=(u-tel)/(st.hit-tel),ease=k*k;e.x=e.startX+(e.lockX-e.startX)*ease;e.y=e.startY+(e.lockY-e.startY)*ease;}
    else{e.y+=(e.hover-e.y)*Math.min(1,dt*2.5);e.x-=e.face*1.6*dt;}
  }else if(m.type==='leap'){
    const st=m.strikes[0],t0=.45;
    if(!e.tel[0])e.landX=clamp(p.x-e.face*(.6+K.width*.8),-K.clamp,K.clamp);
    if(u<t0)e.startX=e.x;
    else if(u<st.hit){const k=(u-t0)/(st.hit-t0);e.x=e.startX+(e.landX-e.startX)*k;e.y=1.5*Math.sin(Math.PI*k);}
    else e.y=0;
  }
  e.x=clamp(e.x,-K.clamp-.4,K.clamp+.4);
  if(e.clock>=m.dur){e.y=K.flying?e.y:0;endMove(s,e);setState(e,'idle');}
}
function updateEnemy(s,e,dt){
  const K=KINDS[e.kind];e.st+=dt;e.flap+=dt*(e.state==='attack'?15:10);
  switch(e.state){
    case 'intro':
      e.depth=Math.max(0,1-e.st/(BOSS_INTRO*.8));
      if(e.st>=BOSS_INTRO){e.depth=0;setState(e,'idle');s.events.push({type:'bossReady',id:e.id});}
      return;
    case 'enter':{
      const tx=sign(e.x)*Math.min(Math.abs(e.x),K.clamp-.5),go=tx-e.x;
      e.x+=sign(go)*Math.min(Math.abs(go),K.speed*dt);e.walkPhase+=dt*K.speed*2.4;
      if(K.flying)e.y+=(e.hover-e.y)*Math.min(1,dt*2);
      if(Math.abs(go)<.05)setState(e,'idle');
      return;}
    case 'idle':case 'walk':think(s,e,dt);break;
    case 'attack':updateAttack(s,e,dt);break;
    case 'recoil':if(e.st>=e.stateDur)setState(e,'idle');break;
    case 'stun':
      if(K.flying){const k=Math.min(1,e.st/.35),q=1-(1-k)*(1-k);e.y=Math.max(.45,e.fallFrom-(e.fallFrom-.45)*k);e.x=e.fallFromX+(e.fallToX-e.fallFromX)*q;}
      if(e.st>=e.stateDur&&!e.execBy){e.posture=e.maxPosture*.6;e.postureT=s.time;setState(e,'idle');if(K.flying)e.y=.6;}
      break;
    case 'dead':
      e.depth=Math.min(1,e.st/.8);if(K.flying)e.y=Math.max(.2,e.y-dt*1.5);
      if(e.st>=.9)e.gone=true;
      break;
  }
  if(e.state!=='stun'&&e.state!=='dead'&&s.time-e.postureT>1.2)e.posture=Math.max(0,e.posture-K.regen*dt);
}

// ---- one fixed simulation step ----------------------------------------------------------
function step(s,input,dt){
  if(s.paused||s.phase==='menu')return;
  s.time+=dt;s.phaseTime+=dt;
  director(s,dt);
  if(s.phase==='won'||s.phase==='lost'){
    s.player.st+=dt;for(const e of s.enemies){e.st+=dt;if(e.state==='dead'){e.depth=Math.min(1,e.st/.8);if(e.st>=.9)e.gone=true;}}
    s.enemies=s.enemies.filter(e=>!e.gone);return;
  }
  updatePlayer(s,input||{},dt);
  for(const e of s.enemies.slice())updateEnemy(s,e,dt);
  s.enemies=s.enemies.filter(e=>!e.gone);
  s.tokens.holders=s.tokens.holders.filter(id=>s.enemies.some(e=>e.id===id&&e.state==='attack'));
}

// ---- autopilot: presses keys like a player who watches every telegraph ---------------------
// opts.human: press timing drawn from a normal distribution (mean .13 s before the hit, sd .09 s),
// which lands roughly 55% perfect, 35% plain blocks and 10% late presses.
function autopilot(s,opts={}){
  const p=s.player,ap=s.ap||(s.ap={holdUntil:-1,last:-9,swing:-9,plan:{},rand:rng(s.seed*7919+13)});
  const input={left:false,right:false,blockDown:false,blockPressed:false,attackPressed:false,dodgePressed:false};
  if(!['intro','fight','breather'].includes(s.phase)||p.state==='dead')return input;
  let threat=null;
  for(const e of s.enemies){const k=nextStrike(e);if(k<0||!e.tel[k])continue;const st=e.move.strikes[k],tth=(st.hit-e.clock)/e.rate;if(!threat||tth<threat.tth)threat={e,st,tth};}
  if(threat){
    const {e,st,tth}=threat,from=-e.face;
    if(st.unblockable){if(tth<=.2&&p.state!=='dodge'){input.dodgePressed=true;const away=-sign(e.x-p.x)||-p.face;input[away>0?'right':'left']=true;}}
    else{
      const key=e.id+':'+e.moveT+':'+e.move.strikes.indexOf(st);
      if(ap.plan[key]===undefined){let lead=.06;if(opts.human){const g=Math.sqrt(-2*Math.log(1-ap.rand()))*Math.cos(2*Math.PI*ap.rand());lead=clamp(.13+.09*g,-.06,.38);}ap.plan[key]=lead;}
      const lead=ap.plan[key];
      if(tth<=lead&&s.time-ap.last>.3&&canGuard(p)&&(p.state!=='parry'||p.face!==from)){input.blockPressed=true;ap.last=s.time;ap.holdUntil=s.time+Math.max(0,tth)+.1;}
    }
  }
  if(s.time<ap.holdUntil){input.blockDown=true;return input;}
  if(input.dodgePressed)return input;
  const soon=s.enemies.some(e=>{const k=nextStrike(e);return k>=0&&(e.move.strikes[k].hit-e.clock)/e.rate<.5;});
  const ex=executableNear(s,p);
  if(ex){if(s.time-ap.swing>.1){input.attackPressed=true;ap.swing=s.time;}return input;}
  let near=null;for(const e of s.enemies)if(alive(e)){const d=Math.abs(e.x-p.x);if(!near||d<near.d)near={e,d};}
  if(!near)return input;
  if(near.e.state==='stun'){input[near.e.x>p.x?'right':'left']=true;return input;}
  const reach=near.e.kind==='rat'?2.2:1.8;
  if(near.d<=reach&&isOpen(s,near.e)&&(!soon||s.time<=p.counterUntil)){if(s.time-ap.swing>.4){input.attackPressed=true;ap.swing=s.time;}}
  else if(near.d>1.7&&!soon)input[near.e.x>p.x?'right':'left']=true;
  return input;
}
// Run real frames with the autopilot until a condition on this frame's events holds.
function runUntil(s,cond,seconds,opts){
  for(let i=0;i<seconds*60;i++){s.events.length=0;run(s,1/60,autopilot(s,opts));if(s.events.some(ev=>cond(ev,s))||cond(null,s))return true;}
  return false;
}
// Fixed camera scenarios for screenshots: deterministic seeds, real simulation, then frozen.
function scenario(name,seed=11){
  const s=create({seed});
  if(name==='hero'){start(s,{wave:1});runUntil(s,ev=>ev&&ev.type==='parry'&&ev.perfect&&ev.kind==='scissors'&&ev.move==='snip',120);}
  else if(name==='wide'){start(s,{wave:2});runUntil(s,ev=>ev&&ev.type==='telegraph'&&ev.kind==='moth',120);}
  else if(name==='heroPlain'){  // the same blade, met with a held guard instead of a timed press
    start(s,{wave:1});let first=true;
    for(let i=0;i<60*120;i++){s.events.length=0;run(s,1/60,{blockDown:true,blockPressed:first});first=false;if(s.events.some(ev=>ev.type==='parry'&&!ev.perfect&&ev.kind==='scissors'))break;}
  }
  else if(name==='stress'){
    start(s,{wave:WAVES.length-1});runUntil(s,ev=>ev&&ev.type==='bossReady',30);
    const rat=s.enemies.find(e=>e.kind==='rat');if(rat){rat.hp=1;checkPhase2(s,rat);}
    runUntil(s,(ev,st)=>ev&&ev.type==='telegraph'&&st.tokens.holders.length===2&&st.enemies.some(e=>e.phase2),240);
  }
  s.view=name;return s;
}
const api={STEP,FEEL,PLAYER,KINDS,WAVES,INTRO,BREATHER,create,start,retry,pause,step,run,timeScale,advanceReal,addFeel,
  spawn,startMove,requestToken,releaseToken,beginWave,autopilot,runUntil,scenario,nextStrike,setState,executableNear};
if(typeof module!=='undefined')module.exports=api;root.GongCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
