// 打回乐池 rules: three lanes, the boss's climb, telegraphs, taps, the gong, three waves and the ball. No DOM, no drawing;
// runs in Node for tests. Coordinates are the short film's 1080 x 1920 portrait frame, y grows downward; time in seconds.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.YinggeCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const STEP=1/120;
// Where things stand. The stage floor and lanterns come from the film; the pit is deepened to 1312-1500 for the boss to climb in.
const GEO={
  floorY:1272,pitTop:1312,panelTop:1500,panelBottom:1609,
  lanes:[{x:306,foot:1272,h:318,rig:'A'},{x:540,foot:1264,h:300,rig:'B'},{x:774,foot:1272,h:312,rig:'C'}],
  // boss head top = head0 - level * notch: level 0 is under the panel, about 7 peeks over the stage edge, 10 stands on the stage
  boss:{x:540,head0:1530,notch:40,headH:104,shoulderDy:134,shoulderDx:70,sleeve:150},
  gong:{x:540,y:1652,r:66},
  ball:{r:46}
};
const CFG={
  top:10,                 // 台口顶: the boss reaches the stage and takes it
  start:[6,7,8],          // boss level at the start of each wave
  hitDrop:0.5,            // a hit knocks it back half a notch (一截)
  missClimb:1,            // every strike that lands lifts it one notch (一格)
  gongDrop:2,             // 大英歌 knocks it back two notches
  meter:8,                // 锣鼓槽: consecutive hits to light the gong; a perfect counts two, a whiff takes one back, a miss empties it
  tiredAfter:22,          // after this long in one wave the boss is out of breath and every hit knocks it back a whole notch
  earlyGrace:0.06,        // a tap this much before the iron rod lights still counts
  grace:0.08,             // ... and this much after the strike lands
  perfect:0.16,           // 妙: within this before the strike (up to 0.06 after)
  recover:0.24,           // a puppet that swung cannot swing again for this long
  echo:0.35,              // a second tap on a lane just hit is a harmless joint swing, not a whiff
  down:3,                 // a puppet knocked flat gets up after this
  dizzy:{whiffs:3,span:2,dur:1.6},   // three swings at air within two seconds: that puppet is dizzy
  waves:[
    {name:'探头',gap:[0.80,1.05],pre:0.32,window:0.50,feint:0,double:0},
    {name:'虚晃',gap:[0.62,0.85],pre:0.30,window:0.44,feint:0.42,fake:0.40,double:0},
    {name:'两道齐抽',gap:[0.55,0.75],pre:0.28,window:0.36,feint:0.15,fake:0.36,double:0.5}
  ],
  intro:1.6,sink:1.0,interlude:4.2,stun:1.4,firstGap:0.35,
  winHold:7.2,loseHold:3.4,
  points:{hit:100,perfect:50,gong:300,ball:80,win:1000}
};
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function gaussFrom(rand){return function(){let u=0;while(u===0)u=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(6.2831853*rand());};}

// ---- geometry shared by the page and the tests ----
const headTop=level=>GEO.boss.head0-level*GEO.boss.notch;
function shoulder(level,arm){const B=GEO.boss;return{x:B.x+(arm==='L'?-1:1)*B.shoulderDx,y:headTop(level)+B.shoulderDy};}
// where the iron rod meets a puppet's drumsticks: where its hands are when it swings, nudged toward the middle
function contact(lane){const L=GEO.lanes[lane];return{x:L.x+(540-L.x)*0.1,y:L.foot-L.h*0.6};}
// The arm as a line: shoulder -> hand (end of the white sleeve) -> rod tip. reach 0..1 is how far the rod is pushed out toward the contact.
// cock tilts the arm away from the target (radians) while it winds up; minRod keeps a wound-up rod long enough to see.
function armLine(level,arm,lane,reach,cock,minRod){
  const sh=shoulder(level,arm),c=contact(lane),B=GEO.boss;
  const ang=Math.atan2(c.y-sh.y,c.x-sh.x)+(cock||0)*(arm==='L'?-1:1);   // positive cock swings the arm outward
  const full=Math.hypot(c.x-sh.x,c.y-sh.y);let len=Math.max(B.sleeve+(minRod||30),full*clamp(reach,0,1.05));
  // a wound-up rod pokes at least minRod above the pit front even when the boss is deep in the pit
  if(minRod){const up=-Math.sin(ang);if(up>0.2)len=Math.max(len,(sh.y-(GEO.panelTop-minRod))/up);}
  const hx=sh.x+Math.cos(ang)*B.sleeve,hy=sh.y+Math.sin(ang)*B.sleeve;
  return{sx:sh.x,sy:sh.y,hx,hy,tx:sh.x+Math.cos(ang)*len,ty:sh.y+Math.sin(ang)*len,ang};
}
// What one of the boss's arms is doing at time t: which lane it aims at, how far the rod is out, how far it is cocked back,
// how puffed the sleeve is and whether the rod is lit. null = hanging idle. Shared by the page and the tests.
const ease=t=>1-Math.pow(1-clamp(t,0,1),3),W01=(t,a,b)=>clamp((t-a)/(b-a),0,1);
function armState(s,arm,t){
  for(const a of s.attacks){
    if(a.fake&&a.fake.arm===arm&&t>=a.onset&&t<a.switchAt)return{lane:a.fake.lane,reach:0.5,cock:0.75,puff:ease((t-a.onset)/0.2),glow:0,minRod:200};
    const k=a.arms.indexOf(arm);if(k<0||t<a.preAt)continue;const lane=a.lanes[k],res=a.res[k],at=a.at[k];
    if(res==null){
      if(t<a.lightAt)return{lane,reach:0.5,cock:0.75-0.15*ease((t-a.preAt)/(a.lightAt-a.preAt)),puff:ease((t-a.preAt)/0.18),glow:0,minRod:200};
      const u=(t-a.lightAt)/(a.hitAt-a.lightAt);return{lane,reach:0.58+0.1*u,cock:0.55-0.3*u,puff:1,glow:1,u,minRod:240};
    }
    if(res==='hit'){const u=t-at;if(u<0.6)return{lane,reach:u<0.05?lerp(0.7,1,u/0.05):1-0.4*ease(W01(u,0.05,0.5)),cock:0.9*ease(W01(u,0.04,0.3)),puff:1-u,glow:0,knocked:1-u/0.6};}
    if(res==='miss'){const u=t-at;if(u<0.7)return{lane,reach:u<0.06?lerp(0.7,1.04,u/0.06):lerp(1.04,0.4,ease(W01(u,0.15,0.7))),cock:0,puff:1-u,glow:0};}
    if(res==='cancel'){const u=t-(a.doneAt||t);if(u<0.5)return{lane,reach:0.5-0.2*u,cock:0.8*ease(u/0.3),puff:0,glow:0};}
  }
  return null;
}
// The red ball's path in an interlude: in from one side, a bounce on each puppet's head, out the other side.
function ballKeys(dir){
  const L=GEO.lanes,head=i=>L[i].foot-L[i].h-GEO.ball.r*0.55,order=dir>0?[0,1,2]:[2,1,0],side=x=>dir>0?x:1080-x;
  return[[side(-90),760,0.35,-1],[L[order[0]].x,head(order[0]),1.05,order[0]],[L[order[1]].x,head(order[1]),1.72,order[1]],
    [L[order[2]].x,head(order[2]),2.39,order[2]],[side(1170),860,3.1,-1]];
}
function ballAt(keys,t){
  if(t<keys[0][2]||t>keys[keys.length-1][2])return null;
  for(let i=0;i<keys.length-1;i++){
    const [x0,y0,t0]=keys[i],[x1,y1,t1]=keys[i+1];
    if(t>=t0&&t<=t1){const u=(t-t0)/(t1-t0),apex=Math.min(y0,y1)-230;return{x:lerp(x0,x1,u),y:(1-u)*(1-u)*y0+2*u*(1-u)*apex+u*u*y1,u,seg:i};}
  }
  return null;
}

function create(opts){
  opts=opts||{};
  const mode=opts.mode==='duo'?'duo':'solo',rand=rng(opts.seed==null?1:opts.seed);
  const freshPuppet=i=>({lane:i,downAt:-9,downUntil:-9,swingUntil:-9,dizzyUntil:-9,whiffAt:[],lastHit:-9,swingAt:-9});
  const perPlayer=()=>[0,0];
  const s={mode,seed:opts.seed==null?1:opts.seed,t:0,phase:'intro',phaseT:0,wave:0,level:CFG.start[0],meter:0,streak:0,bestStreak:0,
    attacks:[],nextAttack:0,tired:false,nextId:1,midArm:'R',recent:[],bonk:0,ball:null,
    puppets:[0,1,2].map(freshPuppet),
    score:perPlayer(),stats:{hits:perPlayer(),perfects:perPlayer(),whiffs:perPlayer(),fooled:perPlayer(),gongs:perPlayer(),balls:perPlayer(),
      misses:[0,0,0],strikes:0,feints:0,doubles:0,attacksPerWave:[0,0,0]},
    peakLevel:CFG.start[0],waveStart:[0,-1,-1],result:null,events:[]};
  const emit=e=>{e.t=s.t;s.events.push(e);};
  const W=()=>CFG.waves[s.wave];

  function enter(phase){s.phase=phase;s.phaseT=0;emit({type:'phase',phase,wave:s.wave});}
  function finish(outcome){
    if(outcome==='win'){s.score[0]+=CFG.points.win*(s.mode==='duo'?0.5:1);if(s.mode==='duo')s.score[1]+=CFG.points.win*0.5;}
    s.result={outcome,time:+s.t.toFixed(3),wave:s.wave+1,level:s.level,score:s.score.slice(),total:s.score[0]+s.score[1],
      hits:s.stats.hits.slice(),perfects:s.stats.perfects.slice(),whiffs:s.stats.whiffs.slice(),gongs:s.stats.gongs.slice(),balls:s.stats.balls.slice(),
      misses:s.stats.misses.reduce((a,b)=>a+b,0),bestStreak:s.bestStreak};
    enter(outcome==='win'?'won':'lost');emit({type:outcome});
  }
  function cleared(){
    for(const a of s.attacks)a.res.forEach((r,i)=>{if(r==null)a.res[i]='cancel';}),a.done=true;
    if(s.wave<CFG.waves.length-1){enter('sink');emit({type:'sunk',wave:s.wave});}
    else finish('win');
  }
  function free(i,at){return s.puppets[i].downUntil<=at-0.05;}
  function armFor(lanes,i){
    if(lanes.length===2){const [a,b]=lanes;return lanes[i]===Math.min(a,b)?'L':'R';}
    if(lanes[0]===0)return'L';if(lanes[0]===2)return'R';
    s.midArm=s.midArm==='L'?'R':'L';return s.midArm;
  }
  function launch(){
    const w=W(),lead=w.pre+w.window,feint=w.feint>0&&rand()<w.feint,fake=feint?w.fake:0,hitAt=s.t+fake+lead;
    const avail=[0,1,2].filter(i=>free(i,hitAt));
    if(!avail.length){s.nextAttack=s.t+0.2;return;}
    let lanes;
    if(!feint&&w.double>0&&avail.length>=2&&rand()<w.double){
      const pool=avail.slice(),a=pool.splice(Math.floor(rand()*pool.length),1)[0],b=pool[Math.floor(rand()*pool.length)];lanes=[a,b].sort();
    }else{
      // the same lane three times running is dull: weight down the lanes of the last two strikes
      const wts=avail.map(i=>s.recent.slice(-2).filter(r=>r===i).length===2?0.15:s.recent[s.recent.length-1]===i?0.6:1);
      let r=rand()*wts.reduce((x,y)=>x+y,0),pick=avail[0];for(let k=0;k<avail.length;k++){r-=wts[k];if(r<=0){pick=avail[k];break;}}
      lanes=[pick];
    }
    const a={id:s.nextId++,wave:s.wave,lanes,arms:lanes.map((_,i)=>armFor(lanes,i)),fake:null,onset:s.t,switchAt:s.t+fake,
      preAt:s.t+fake,lightAt:s.t+fake+w.pre,hitAt,res:lanes.map(()=>null),at:lanes.map(()=>-1),by:lanes.map(()=>-1),perfect:lanes.map(()=>false),done:false,doneAt:-1};
    if(feint){const others=[0,1,2].filter(i=>i!==lanes[0]),fl=others[Math.floor(rand()*others.length)];a.fake={lane:fl,arm:fl===0?'L':fl===2?'R':(lanes[0]===0?'R':'L')};s.stats.feints++;}
    if(lanes.length===2)s.stats.doubles++;
    s.stats.strikes+=lanes.length;s.stats.attacksPerWave[s.wave]++;
    lanes.forEach(l=>s.recent.push(l));if(s.recent.length>4)s.recent.splice(0,s.recent.length-4);
    s.attacks.push(a);emit({type:'attack',id:a.id,lanes:lanes.slice(),fake:a.fake?a.fake.lane:null});
  }
  function settle(a){
    if(a.done||a.res.some(r=>r==null))return;
    a.done=true;a.doneAt=s.t;
    if(s.phase==='wave'){const w=W();s.nextAttack=s.t+w.gap[0]+rand()*(w.gap[1]-w.gap[0]);}
  }
  function miss(a,k){
    const lane=a.lanes[k],p=s.puppets[lane];
    a.res[k]='miss';a.at[k]=s.t;p.downUntil=s.t+CFG.down;p.downAt=s.t;p.dizzyUntil=-9;
    s.level=Math.min(CFG.top,s.level+CFG.missClimb);s.meter=0;s.streak=0;s.stats.misses[lane]++;
    if(s.level>s.peakLevel)s.peakLevel=s.level;
    emit({type:'miss',lane,id:a.id,arm:a.arms[k],level:s.level});
    if(s.level>=CFG.top){finish('lose');return;}
    settle(a);
  }

  function step(dt){
    if(s.phase==='over')return;
    s.t+=dt;s.phaseT+=dt;
    if(s.phase==='intro'){if(s.phaseT>=CFG.intro){enter('wave');s.waveStart[s.wave]=s.t;s.tired=false;s.nextAttack=s.t+CFG.firstGap;}}
    else if(s.phase==='wave'){
      if(!s.tired&&s.phaseT>=CFG.tiredAfter){s.tired=true;emit({type:'tired',wave:s.wave});}
      for(const a of s.attacks)for(let k=0;k<a.lanes.length;k++)if(a.res[k]==null&&s.t>a.hitAt+CFG.grace){miss(a,k);if(s.phase!=='wave')return;}
      s.attacks=s.attacks.filter(a=>!a.done||s.t-a.doneAt<0.8);
      if(!s.attacks.some(a=>!a.done)&&s.t>=s.nextAttack)launch();
    }
    else if(s.phase==='sink'){if(s.phaseT>=CFG.sink){enter('interlude');s.ball={keys:ballKeys(s.wave%2===0?1:-1),t0:s.t,smack:null,bounced:0};}}
    else if(s.phase==='interlude'){
      const b=s.ball;
      if(b&&!b.smack){const p=ballAt(b.keys,s.t-b.t0);if(p&&p.seg>b.bounced){b.bounced=p.seg;emit({type:'bounce',x:b.keys[p.seg][0],y:b.keys[p.seg][1],lane:b.keys[p.seg][3]});}}
      if(s.phaseT>=CFG.interlude){
        s.wave++;s.level=Math.max(2,CFG.start[s.wave]-s.bonk);s.bonk=0;s.ball=null;s.attacks.length=0;
        for(const p of s.puppets){p.downUntil=Math.min(p.downUntil,s.t);p.dizzyUntil=-9;}
        enter('intro');
      }
    }
    else if(s.phase==='won'||s.phase==='lost'){if(s.phaseT>=(s.phase==='won'?CFG.winHold:CFG.loseHold))enter('over');}
  }

  // A tap on a lane by a player (0 = 阿爸 or the only player, 1 = 心远). Returns what happened.
  function tap(lane,player){
    player=player?1:0;if(lane<0||lane>2)return'none';
    // two players on one phone: 阿爸 has the left and middle lanes, 心远 the middle and right
    if(s.mode==='duo'&&(lane===0&&player===1||lane===2&&player===0))return'none';
    const p=s.puppets[lane];
    if(s.phase!=='wave'){if(s.t>=p.swingUntil&&s.t>=p.downUntil){p.swingUntil=s.t+CFG.recover;p.swingAt=s.t;emit({type:'swing',lane,player});}return'idle';}
    if(s.t<p.downUntil||s.t<p.dizzyUntil){emit({type:'stuck',lane,player});return'stuck';}
    if(s.t<p.swingUntil)return'busy';
    for(const a of s.attacks){
      if(a.done)continue;
      const k=a.lanes.indexOf(lane);
      if(k<0||a.res[k]!=null)continue;
      if(s.t>=a.hitAt-CFG.waves[a.wave].window-CFG.earlyGrace&&s.t<=a.hitAt+CFG.grace){
        const perfect=s.t>=a.hitAt-CFG.perfect&&s.t<=a.hitAt+0.06;
        a.res[k]='hit';a.at[k]=s.t;a.by[k]=player;a.perfect[k]=perfect;p.swingUntil=s.t+CFG.recover;p.swingAt=s.t;p.lastHit=s.t;
        s.level=Math.max(0,s.level-CFG.hitDrop*(s.tired?2:1));s.meter=Math.min(CFG.meter,s.meter+(perfect?2:1));s.streak++;if(s.streak>s.bestStreak)s.bestStreak=s.streak;
        s.score[player]+=CFG.points.hit+(perfect?CFG.points.perfect:0);s.stats.hits[player]++;if(perfect)s.stats.perfects[player]++;
        emit({type:'hit',lane,player,perfect,id:a.id,arm:a.arms[k],level:s.level,meter:s.meter,late:s.t-a.hitAt});
        if(s.level<=0){cleared();return'hit';}
        settle(a);return'hit';
      }
    }
    p.swingUntil=s.t+CFG.recover;p.swingAt=s.t;
    if(s.t-p.lastHit<CFG.echo){emit({type:'swing',lane,player,echo:true});return'echo';}
    // a swing at air: say why, take one off the gong meter, and count it toward dizziness
    let why='air';
    for(const a of s.attacks){if(a.done)continue;
      if(a.fake&&a.fake.lane===lane&&s.t<a.switchAt+0.15){why='fooled';break;}
      if(a.lanes.includes(lane)&&s.t>=a.preAt&&s.t<a.hitAt)why='early';}
    s.meter=Math.max(0,s.meter-1);s.streak=0;s.stats.whiffs[player]++;if(why==='fooled')s.stats.fooled[player]++;
    p.whiffAt.push(s.t);p.whiffAt=p.whiffAt.filter(x=>s.t-x<=CFG.dizzy.span);
    emit({type:'whiff',lane,player,why});
    if(p.whiffAt.length>=CFG.dizzy.whiffs){p.dizzyUntil=s.t+CFG.dizzy.dur;p.whiffAt.length=0;emit({type:'dizzy',lane,player});}
    return why;
  }
  // The gong at the stage front: only when the 锣鼓槽 is full. Returns true if 大英歌 went off.
  function gong(player){
    player=player?1:0;
    if(s.phase!=='wave'||s.meter<CFG.meter){emit({type:'gongDull',player});return false;}
    s.meter=0;s.level=Math.max(0,s.level-CFG.gongDrop);s.score[player]+=CFG.points.gong;s.stats.gongs[player]++;
    for(const a of s.attacks){a.res.forEach((r,i)=>{if(r==null)a.res[i]='cancel';});if(!a.done){a.done=true;a.doneAt=s.t;}}
    for(const p of s.puppets){p.downUntil=Math.min(p.downUntil,s.t);p.dizzyUntil=-9;p.swingAt=s.t;p.swingUntil=s.t+0.5;}
    s.nextAttack=s.t+CFG.stun;
    emit({type:'gong',player,level:s.level});
    if(s.level<=0)cleared();
    return true;
  }
  // A tap at a point during an interlude: smack the red ball if it is there. Half the smacked balls land on the boss's head
  // and it comes back up one notch lower.
  function tapBall(x,y,player){
    player=player?1:0;const b=s.ball;
    if(s.phase!=='interlude'||!b||b.smack)return false;
    const p=ballAt(b.keys,s.t-b.t0);if(!p||Math.hypot(p.x-x,p.y-y)>GEO.ball.r*1.6)return false;
    const bonk=rand()<0.5;b.smack={t:s.t,x:p.x,y:p.y,bonk,player};if(bonk)s.bonk=1;
    s.score[player]+=CFG.points.ball;s.stats.balls[player]++;
    emit({type:'ball',player,x:p.x,y:p.y,bonk});
    return true;
  }
  // What each lane shows right now, for drawing and for the hooks: 'none' | 'fake' | 'pre' | 'lit'.
  function threat(lane){
    for(const a of s.attacks){if(a.done)continue;
      if(a.fake&&a.fake.lane===lane&&s.t>=a.onset&&s.t<a.switchAt)return{kind:'fake',a,k:(s.t-a.onset)/(a.switchAt-a.onset)};
      const i=a.lanes.indexOf(lane);if(i<0||a.res[i]!=null||s.t<a.preAt)continue;
      if(s.t<a.lightAt)return{kind:'pre',a,i,k:(s.t-a.preAt)/(a.lightAt-a.preAt)};
      return{kind:'lit',a,i,k:clamp((s.t-a.lightAt)/(a.hitAt-a.lightAt),0,1.2)};
    }
    return{kind:'none'};
  }
  return{state:s,step,tap,gong,tapBall,threat};
}

// ---- autopilots for tests, fixed views and the recording ----
// 'precise': taps every strike 0.1 s before it lands, never falls for a feint, rings the gong the moment it lights.
// 'human' (手抖档): reacts to the iron rod lighting after a normally distributed delay (mean 0.30 s, sd 0.12 s); the second
//   lane of a double comes 0.15 +- 0.07 s after the first; falls for 35% of feints; 4% of taps slip to the next lane;
//   rings a full gong after 0.8 +- 0.3 s; goes for 60% of the balls.
// 'spam': hammers all three lanes in turn every 0.12 s and the gong every 0.5 s without looking.
// In duo mode lane 0 is 阿爸's, lane 2 is 心远's, and both go for the middle lane.
function pilot(level,seed,opts){
  opts=Object.assign({react:0.30,sd:0.12,second:0.15,secondSd:0.07,fool:0.35,slip:0.04,gongDelay:0.8,ball:0.6},opts||{});
  const rand=rng(((seed==null?7:seed)*2654435761)>>>0),gauss=gaussFrom(rand),queue=[],planned=new Set();
  let gongAt=-1,ballFor=null,spamNext=0,spamLane=0;
  const push=(at,kind,lane,player)=>queue.push({at,kind,lane,player});
  return function(game){
    const s=game.state,duo=s.mode==='duo';
    if(level==='spam'){
      if(s.t>=spamNext){spamNext=s.t+0.12;spamLane=(spamLane+1)%3;game.tap(spamLane,duo&&spamLane===2?1:0);
        if(Math.round(s.t/0.12)%4===0)game.gong(0);
        if(s.ball)game.tapBall(1080*rand(),700+500*rand(),0);}
      return;
    }
    const players=lane=>duo?(lane===0?[0]:lane===2?[1]:[0,1]):[0];
    for(const a of s.attacks){
      if(planned.has(a.id)||s.t<a.onset)continue;planned.add(a.id);
      if(level==='precise'){a.lanes.forEach(l=>players(l).forEach(pl=>push(a.hitAt-0.1,'tap',l,pl)));continue;}
      if(a.fake&&rand()<opts.fool)push(a.onset+Math.max(0.12,0.28+0.08*gauss()),'tap',a.fake.lane,players(a.fake.lane)[0]);
      let first=null;
      a.lanes.forEach((l,i)=>{
        for(const pl of players(l)){
          const at=i===1&&!duo?first+Math.max(0.03,opts.second+opts.secondSd*gauss()):a.lightAt+Math.max(0.06,opts.react+opts.sd*gauss());
          if(first==null)first=at;
          // a slip lands on a neighbouring lane; with two players, only on one of the slipping thumb's own lanes
          const lane=rand()<opts.slip?(duo?(l===1?(pl===0?0:2):1):(l===1?(rand()<0.5?0:2):1)):l;
          push(at,'tap',lane,pl);
        }
      });
    }
    if(s.phase==='wave'&&s.meter>=CFG.meter&&gongAt<0)gongAt=s.t+(level==='precise'?0:Math.max(0.2,opts.gongDelay+0.3*gauss()));
    if(gongAt>=0&&s.t>=gongAt){game.gong(0);gongAt=-1;}
    if(s.ball&&!s.ball.smack&&ballFor!==s.ball){
      ballFor=s.ball;
      if(level==='precise'||rand()<opts.ball){const keys=s.ball.keys,t0=keys[1][2]+(level==='precise'?0.3:(keys[3][2]-keys[1][2])*rand());
        push(s.ball.t0+t0,'ball',0,duo&&rand()<0.5?1:0);}
    }
    for(let i=0;i<queue.length;i++){
      const q=queue[i];if(s.t<q.at)continue;queue.splice(i--,1);
      if(q.kind==='tap')game.tap(q.lane,q.player);
      else if(q.kind==='ball'&&s.ball){const p=ballAt(s.ball.keys,s.t-s.ball.t0);if(p){const e=level==='precise'?0:25;game.tapBall(p.x+e*gauss(),p.y+e*gauss(),q.player);}}
    }
  };
}
return{STEP,GEO,CFG,create,pilot,rng,headTop,shoulder,contact,armLine,armState,ballKeys,ballAt};
});
