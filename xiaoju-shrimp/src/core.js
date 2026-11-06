// 小橘偷虾记 · rules: level 1 (living room, 三花's patrol and sight), level 2 (hallway, the child who listens),
// level 3 (dinner table, red-light-green-light with the owner), the cat's moves, the safe-route table and three autopilots.
// No DOM, no drawing; runs in Node for tests and in the page as window.SneakCore.
// Grid: column c grows right, row r grows down. Directions: 0 N, 1 E, 2 S, 3 W. Logic advances in ticks of 0.1 s.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SneakCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const DC=[0,1,0,-1],DR=[-1,0,1,0];
const CFG={
  tick:0.1,      // seconds per logic tick
  catMove:4,     // ticks per cell for the cat (0.4 s)
  sanMove:5,     // ticks per cell for 三花 (0.5 s)
  sanLook:6,     // ticks 三花 looks back down the side she just walked, at every corner
  sanTurn:6,     // ticks 三花 stands at a corner already facing the new way (the warning before her sight sweeps)
  hiss:12,       // ticks of the 「哈！」 freeze after the cat is seen
  sight:4,       // cells of sight straight ahead
  exit:15,       // ticks of the exit shot after the cat reaches the door (Alice's first playtest: show the level is over)
  kidMove:3,     // ticks per cell for the child (0.3 s, faster than the cat)
  kidHuh:5,      // ticks the child freezes with 「咦？」 after hearing a step, before she gets up
  kidLook:15,    // ticks she stands looking round where she heard it
  hear:5,        // cells (walking distance on the grid, Manhattan) she hears a step on wood
  // her toy plays in uneven bursts (she hears nothing while it plays) with uneven quiet gaps between:
  // [ticks on, ticks quiet] pairs, looped; each game starts at a seeded point in the loop, so the gaps cannot be learned
  toy:[[16,30],[12,44],[20,24],[14,52],[18,34],[12,40],[22,28],[15,48]],
  dragMove:6,    // ticks per cell while dragging the shrimp (0.6 s)
  ownerWarn:6,   // ticks her chopsticks stop before she turns her head (the warning)
  // the owner at dinner: [ticks eating with her head down, ticks looking at the table], looped, seeded start
  owner:[[32,14],[48,18],[24,12],[40,20],[28,16],[54,14],[36,18]],
  dash:10        // ticks the cat has after 「住手！」 to get the shrimp off the table
};
// '.' floor (wood: a step on it makes a sound in level 2), '~' rug (silent), '#' blocks the way and the sight,
// 'T' coffee table (cat can hide under it, blocks sight), 'N' start, 'D' door (goal), 'F' cat treat (optional),
// 'K' where the child sits playing (level 2).
const LEVELS=[
  {id:'living',title:'第 1 关 · 客厅躲三花',
    map:[
      '......D',
      '#.....#',
      '#.###.#',
      '#.###.#',
      '#.TTT.#',
      '#.TTT.#',
      '#....F#',
      '....##.',
      'N...##.'],
    labels:[{c:0,r:1,w:1,h:6,text:'电视柜'},{c:6,r:1,w:1,h:6,text:'书柜'},{c:2,r:2,w:3,h:2,text:'鱼缸'},{c:2,r:4,w:3,h:2,text:'茶几'},{c:4,r:7,w:2,h:2,text:'沙发'}],
    // clockwise loop round the fish tank and coffee table, starting at the top-left corner
    patrol:{start:{c:1,r:1},legs:[[1,4],[2,5],[3,4],[0,5]]},
    startName:'窝',doorName:'出口',exitText:'溜出客厅！'},
  {id:'hall',type:'sound',title:'第 2 关 · 走廊躲孩子',
    map:[
      '####D##',
      '#.~..##',
      '#F...##',
      '#~..###',
      'K....##',
      '#.~.###',
      '#~...##',
      '#....##',
      '#.N..##'],
    labels:[{c:5,r:0,w:2,h:9,text:'卫生间'},{c:4,r:3,w:1,h:1,text:'鞋柜'},{c:4,r:5,w:1,h:1,text:'鞋柜'},{c:0,r:0,w:4,h:1,text:'墙'}],
    startName:'客厅',doorName:'饭厅',exitText:'溜过走廊！'},
  {id:'table',type:'still',title:'第 3 关 · 饭桌偷虾',
    // '=' table top, 'P' the plate of shrimp, 'D' the table edge to jump down with it, '#' dishes and the owner's side
    map:[
      '......N',
      '.##....',
      '.......',
      'D....##',
      '..##...',
      '.......',
      '...P..F',
      '.......',
      '#######'],
    labels:[{c:1,r:1,w:2,h:1,text:'汤锅'},{c:5,r:3,w:2,h:1,text:'饭锅'},{c:2,r:4,w:2,h:1,text:'菜'}],
    owner:{c:3,r:8},
    startName:'窗台',doorName:'跳下桌',exitText:'叼走啦！'}
];

function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function gauss(R){let u=0,v=0;while(u===0)u=R();while(v===0)v=R();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}

// Everything about a level that never changes: walls, the patrol timeline, what 三花 sees at every tick of her loop.
function build(def){
  const rows=def.map.length,cols=def.map[0].length,N=cols*rows;
  const kind=new Array(N);let nest=-1,door=-1,treat=-1;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const ch=def.map[r][c],i=r*cols+c;kind[i]=ch;
    if(ch==='N')nest=i;if(ch==='D')door=i;if(ch==='F')treat=i;
  }
  const inB=(c,r)=>c>=0&&r>=0&&c<cols&&r<rows;
  const walk=i=>kind[i]!=='#';                       // the cat can stand here
  const nbr=i=>{const c0=i%cols,r0=(i/cols)|0,out=[];for(let d=0;d<4;d++){const cc=c0+DC[d],rr=r0+DR[d];if(inB(cc,rr)&&walk(rr*cols+cc))out.push([d,rr*cols+cc]);}return out;};
  const doorDist=new Int32Array(N).fill(-1);{const q=[door];doorDist[door]=0;while(q.length){const i=q.shift();for(const [,j] of nbr(i))if(doorDist[j]<0){doorDist[j]=doorDist[i]+1;q.push(j);}}}
  const base={def,cols,rows,N,kind,nest,door,treat,walk,nbr,doorDist,type:def.type||'sight'};
  if(def.type==='still'){
    let shrimp=-1;for(let i=0;i<N;i++)if(kind[i]==='P')shrimp=i;
    // owner timeline: 0 eating, 1 chopsticks stopped (warning), 2 looking at the table
    const st=[];for(const [eat,look] of CFG.owner){for(let t=0;t<eat;t++)st.push(0);for(let t=0;t<CFG.ownerWarn;t++)st.push(1);for(let t=0;t<look;t++)st.push(2);}
    const P=st.length,ph=p=>((p%P)+P)%P;
    const owner=p=>st[ph(p)];
    const moveBan=p=>st[ph(p)]===2;
    const shrimpDist=new Int32Array(N).fill(-1);{const q=[shrimp];shrimpDist[shrimp]=0;while(q.length){const i=q.shift();for(const [,j] of nbr(i))if(shrimpDist[j]<0){shrimpDist[j]=shrimpDist[i]+1;q.push(j);}}}
    return Object.assign(base,{shrimp,P,owner,moveBan,danger:()=>false,noisy:null,shrimpDist,opaque:()=>false});
  }
  if(def.type==='sound'){
    let kid=-1;for(let i=0;i<N;i++)if(kind[i]==='K')kid=i;
    const man=(a,b)=>Math.abs(a%cols-b%cols)+Math.abs(((a/cols)|0)-((b/cols)|0));
    const wood=i=>walk(i)&&kind[i]!=='~';
    const sched=[];for(const [on,off] of CFG.toy){for(let t=0;t<on;t++)sched.push(on-t);for(let t=0;t<off;t++)sched.push(0);}
    const lens=[];{let cur=0;for(let p=0;p<sched.length;p++){if(sched[p]>0&&(p===0||sched[p-1]===0))cur=sched[p];lens.push(sched[p]>0?cur:0);}}
    const P=sched.length,ph=p=>((p%P)+P)%P;
    const toyOn=p=>sched[ph(p)]>0;
    const toyLeft=p=>sched[ph(p)];        // ticks of play left in the current burst (0 when quiet)
    const toyLen=p=>lens[ph(p)];          // length of the current burst
    // while she sits at her spot: the cells next to her are always unsafe (she reaches out), and a step on wood
    // within earshot is unsafe whenever the toy is quiet
    // a cat lying on a rug is hidden even right next to her (playtest 4: 「我躲进去了呀，为什么还会被孩子抓到呢」)
    const danger=(i,p)=>man(i,kid)<=1&&kind[i]!=='~';
    const noisy=(j,p)=>wood(j)&&man(j,kid)<=CFG.hear&&!toyOn(p);
    const hearZone=[];for(let i=0;i<N;i++)if(wood(i)&&man(i,kid)<=CFG.hear&&i!==kid)hearZone.push(i);
    return Object.assign(base,{kid,man,wood,P,toyOn,toyLeft,toyLen,danger,noisy,hearZone,opaque:()=>false});
  }
  const opaque=i=>kind[i]==='#'||kind[i]==='T';      // stops 三花's sight; a cat under the table is hidden
  // patrol timeline: one entry per tick of the loop
  const tl=[];let c=def.patrol.start.c,r=def.patrol.start.r;
  const legs=def.patrol.legs;
  legs.forEach((leg,li)=>{
    const [d,n]=leg;
    for(let k=0;k<n;k++){
      const fc=c,fr=r,tc=c+DC[d],tr=r+DR[d];
      for(let t=1;t<=CFG.sanMove;t++){
        const occ=(t*2>=CFG.sanMove)?tr*cols+tc:fr*cols+fc;
        tl.push({occ,face:d,from:fr*cols+fc,to:tr*cols+tc,prog:t/CFG.sanMove});
      }
      c=tc;r=tr;
    }
    const nd=legs[(li+1)%legs.length][0];
    // at a corner she first looks back the way she came, then turns to the new way; both are standing still
    for(let t=0;t<CFG.sanLook;t++)tl.push({occ:r*cols+c,face:(d+2)&3,from:r*cols+c,to:r*cols+c,prog:1,look:true});
    for(let t=0;t<CFG.sanTurn;t++)tl.push({occ:r*cols+c,face:nd,from:r*cols+c,to:r*cols+c,prog:1,turn:true});
  });
  if(c!==def.patrol.start.c||r!==def.patrol.start.r)throw new Error('patrol of '+def.id+' does not close');
  const P=tl.length;
  // line of sight: every cell strictly between the two centres must be see-through, and the target itself too
  function clear(a,b){
    const ac=a%cols,ar=(a/cols)|0,bc=b%cols,br=(b/cols)|0;
    if(opaque(b))return false;
    const steps=Math.max(Math.abs(bc-ac),Math.abs(br-ar))*4;
    for(let s=1;s<steps;s++){
      const x=ac+(bc-ac)*s/steps,y=ar+(br-ar)*s/steps;
      const i=Math.round(y)*cols+Math.round(x);
      if(i!==a&&i!==b&&opaque(i))return false;
    }
    return true;
  }
  function cone(occ,face){
    const oc=occ%cols,or=(occ/cols)|0,out=[];
    for(let d=1;d<=CFG.sight;d++){
      const spread=d>=2?1:0;
      for(let s=-spread;s<=spread;s++){
        const cc=oc+DC[face]*d+(face%2===0?s:0),rr=or+DR[face]*d+(face%2===1?s:0);
        if(!inB(cc,rr))continue;
        const i=rr*cols+cc;
        if(clear(occ,i))out.push(i);
      }
    }
    return out;
  }
  const seen=tl.map(e=>{const set=new Uint8Array(N);for(const i of cone(e.occ,e.face))set[i]=1;return set;});
  const danger=(i,p)=>seen[p][i]===1||tl[p].occ===i;
  return Object.assign(base,{opaque,tl,P,seen,danger,noisy:null,cone});
}

// Can the cat step from i to j starting at phase p without being caught? It is in i for the first half of the
// move and in j for the second; on a sound level the step lands (and makes its sound) the tick it enters j.
// On the dinner table the owner sees any cat that is moving while she looks (red-light-green-light).
const LAND=Math.ceil(CFG.catMove/2);
function moveOk(L,i,j,p,M){
  M=M||CFG.catMove;const P=L.P;
  for(let k=1;k<=M;k++){const occ=(k*2>=M)?j:i;if(L.danger(occ,(p+k)%P))return false;if(L.moveBan&&L.moveBan(p+k))return false;}
  if(L.noisy&&L.noisy(j,(p+Math.ceil(M/2))%P))return false;
  return true;
}
// Fewest ticks from (cell, patrol phase) to a goal cell without ever being seen, for every cell and phase.
// The patrol is periodic, so this is a fixed point over (cell, phase mod P); Infinity means no safe way from there.
function safeTable(L,goal,Mv){
  const {N,P,danger,nbr,walk}=L,INF=Infinity,M=Mv||CFG.catMove;
  const dist=new Float64Array(N*P).fill(INF);
  for(let p=0;p<P;p++)dist[goal*P+p]=0;
  let changed=true,passes=0;
  while(changed&&passes<400){
    changed=false;passes++;
    for(let i=0;i<N;i++){
      if(!walk(i)||i===goal)continue;
      for(let p=0;p<P;p++){
        let best=dist[i*P+p];
        const p1=(p+1)%P;
        if(!danger(i,p1)&&dist[i*P+p1]+1<best)best=dist[i*P+p1]+1;
        for(const [,j] of nbr(i)){
          if(!moveOk(L,i,j,p,M))continue;
          const v=dist[j*P+(p+M)%P]+M;
          if(v<best)best=v;
        }
        if(best<dist[i*P+p]){dist[i*P+p]=best;changed=true;}
      }
    }
  }
  return {dist,get:(i,p)=>dist[i*P+(p%P+P)%P]};
}
// The move (or wait) that keeps the fewest-ticks promise from (cell, phase); null when there is no safe way.
function bestAction(L,T,i,p,Mv){
  const {P,danger,nbr}=L,M=Mv||CFG.catMove;p=((p%P)+P)%P;const here=T.get(i,p);
  if(!isFinite(here))return null;
  if(here===0)return {wait:true};
  let best=null,bv=Infinity;
  for(const [d,j] of nbr(i)){
    if(!moveOk(L,i,j,p,M))continue;
    const v=T.get(j,p+M)+M;if(v<bv){bv=v;best={dir:d};}
  }
  const w=danger(i,(p+1)%P)?Infinity:T.get(i,p+1)+1;
  if(w<bv)return {wait:true};
  return best||(isFinite(w)?{wait:true}:null);
}

// Every (cell, patrol phase) the cat can be in, starting idle at (i, p), without ever being seen.
function reachable(L,i,p,Mv){
  const {N,P,danger,nbr}=L,M=Mv||CFG.catMove,seenS=new Uint8Array(N*P),q=[[i,((p%P)+P)%P]];
  seenS[i*P+q[0][1]]=1;
  while(q.length){
    const [c,ph]=q.pop(),p1=(ph+1)%P;
    if(!danger(c,p1)&&!seenS[c*P+p1]){seenS[c*P+p1]=1;q.push([c,p1]);}
    for(const [,j] of nbr(c)){
      const ok=moveOk(L,c,j,ph,M),pj=(ph+M)%P;
      if(ok&&!seenS[j*P+pj]){seenS[j*P+pj]=1;q.push([j,pj]);}
    }
  }
  return seenS;
}

const cache={};
function level(n){if(!cache[n]){const L=build(LEVELS[n]);
  if(L.type==='still'){L.toShrimp=safeTable(L,L.shrimp);L.toDoor=safeTable(L,L.door,CFG.dragMove);}
  else L.toDoor=safeTable(L,L.door);
  L.toTreat=L.treat>=0?safeTable(L,L.treat):null;cache[n]=L;}return cache[n];}

// One game. Input: setTarget(i) walk there by the shortest way, stop() halt after this cell, stepDir(d) one cell.
function create(opt){
  const L=level(opt.level||0),seed=opt.seed||1,R=rng(seed);
  const s={L,seed,tick:0,phase:'play',hissed:0,treat:false,underTable:0,
    san:{p:Math.floor(R()*L.P)},
    cat:{at:L.nest,move:null,target:-1},
    hissT:0,exitT:-1,clearTick:-1,events:[],noise:null,carry:false,dashT:0,dashWins:0,plateLost:0};
  // san.p is the level clock: 三花's place on her loop in level 1, the toy's place in its on/off cycle in level 2
  const kidHome=()=>({at:L.kid,move:null,state:'play',target:-1,t:0});
  if(L.type==='sound')s.kid=kidHome();
  const kidOcc=()=>{const m=s.kid.move;if(!m)return s.kid.at;return (m.k*2>=CFG.kidMove)?m.to:m.from;};
  s.kidOcc=kidOcc;
  const occ=()=>{const m=s.cat.move;if(!m)return s.cat.at;return (m.k*2>=m.n)?m.to:m.from;};
  s.catOcc=occ;
  function path(from,to,avoid){ // spatial BFS over cells the cat can stand on, never through `avoid`
    if(from===to)return [];
    const prev=new Int32Array(L.N).fill(-1),q=[from];prev[from]=from;
    while(q.length){const i=q.shift();if(i===to)break;for(const [,j] of L.nbr(i))if(prev[j]<0&&j!==avoid){prev[j]=i;q.push(j);}}
    if(prev[to]<0)return null;
    const out=[];for(let i=to;i!==from;i=prev[i])out.push(i);return out.reverse();
  }
  const canAct=()=>s.phase==='play'||s.phase==='dash';
  s.setTarget=i=>{if(!canAct()||i<0||i>=L.N||!L.walk(i))return false;s.cat.target=i;return true;};
  s.stop=()=>{s.cat.target=-1;s.cat.queued=null;};
  s.stepDir=d=>{if(!canAct())return false;s.cat.target=-1;s.cat.queued=d;return true;};
  // dragging the shrimp is slow; after 「住手！」 the cat runs with it in its mouth
  const moveLen=()=>s.carry&&s.phase!=='dash'?CFG.dragMove:CFG.catMove;
  function startMove(){
    const c=s.cat;let next=-1;
    if(c.queued!=null){const cc=c.at%L.cols+DC[c.queued],rr=((c.at/L.cols)|0)+DR[c.queued];c.queued=null;
      if(cc>=0&&rr>=0&&cc<L.cols&&rr<L.rows&&L.walk(rr*L.cols+cc))next=rr*L.cols+cc;}
    else if(c.target>=0){const p=path(c.at,c.target);if(p&&p.length)next=p[0];else c.target=-1;}
    if(next>=0)c.move={from:c.at,to:next,k:0,n:moveLen()};
  }
  s.step=()=>{
    s.events.length=0;
    if(s.phase==='cleared')return;
    s.tick++;
    if(s.phase==='exit'){s.exitT++;if(s.exitT>=CFG.exit){s.phase='cleared';s.events.push('clear');}return;}
    if(s.phase==='hiss'){
      if(--s.hissT<=0){s.phase='play';s.cat={at:L.nest,move:null,target:-1};s.carry=false;if(s.kid)s.kid=kidHome();s.events.push('back');}
      return;
    }
    if(!s.cat.move)startMove();
    let landed=-1;const moving=!!s.cat.move;
    if(s.cat.move){const m=s.cat.move;m.k++;if(m.k===Math.ceil(m.n/2))landed=m.to;if(m.k>=m.n){s.cat.at=m.to;s.cat.move=null;if(s.cat.target===s.cat.at)s.cat.target=-1;}}
    if(L.type==='still'){stillStep(moving);return;}
    const wasOn=s.kid?L.toyOn(s.san.p):false;
    s.san.p=(s.san.p+1)%L.P;
    if(s.kid){
      const k=s.kid;
      if(L.toyOn(s.san.p)!==wasOn)s.events.push(wasOn?'toyOff':'toyOn');
      if(landed>=0&&L.kind[landed]==='~')s.events.push('rug');
      if(landed>=0&&L.wood(landed)){
        s.noise={cell:landed,tick:s.tick};s.events.push('step');
        const busy=k.state==='play'&&L.toyOn(s.san.p);
        if(!busy&&L.man(landed,kidOcc())<=CFG.hear){
          k.target=landed;s.events.push('heard');
          if(k.state==='play'){k.state='huh';k.t=CFG.kidHuh;}else if(k.state!=='huh'){k.state='walk';}
        }
      }
      kidStep();
      if(L.man(occ(),kidOcc())<=1&&L.kind[occ()]!=='~'){s.phase='hiss';s.hissT=CFG.hiss;s.hissed++;s.cat.target=-1;s.cat.queued=null;s.events.push('hug');return;}
      if(!s.cat.move&&s.cat.at===L.door){s.phase='exit';s.exitT=0;s.clearTick=s.tick;s.cat.target=-1;s.events.push('door');}
      const o2=occ();if(o2===L.treat&&!s.treat){s.treat=true;s.events.push('treat');}
      return;
    }
    const o=occ();
    if(L.kind[o]==='T'){if(!s.wasUnder){s.underTable++;s.events.push('under');}s.wasUnder=true;}else s.wasUnder=false;
    if(o===L.treat&&!s.treat){s.treat=true;s.events.push('treat');}
    if(L.danger(o,s.san.p)){s.phase='hiss';s.hissT=CFG.hiss;s.hissed++;s.cat.target=-1;s.cat.queued=null;s.events.push('hiss');return;}
    if(!s.cat.move&&s.cat.at===L.door){s.phase='exit';s.exitT=0;s.clearTick=s.tick;s.cat.target=-1;s.events.push('door');}
  };
  // the child: 「咦？」, walks to where she heard the step, looks round, walks back to her toy
  function kidStep(){
    const k=s.kid;
    if(k.move){k.move.k++;if(k.move.k>=CFG.kidMove){k.at=k.move.to;k.move=null;}else return;}
    if(k.state==='play')return;
    if(k.state==='huh'){if(--k.t<=0)k.state='walk';return;}
    if(k.state==='look'){if(--k.t<=0){k.state='return';k.target=L.kid;}return;}
    const goal=k.state==='return'?L.kid:k.target;
    if(k.at===goal){if(k.state==='return'){k.state='play';k.target=-1;}else{k.state='look';k.t=CFG.kidLook;}return;}
    // she walks round a cat lying on a rug (she does not know it is there; the rug is a promise to the player)
    const o=occ(),hide=L.kind[o]==='~'?o:-1;
    const pth=path(k.at,goal,hide);if(pth&&pth.length)k.move={from:k.at,to:pth[0],k:0};
  }
  // the dinner table: grab the shrimp, drag it to the edge; moving while she looks gets you seen
  function stillStep(moving){
    if(s.phase==='dash'){
      s.dashT--;
      if(!s.cat.move&&s.cat.at===L.door){s.dashWins++;s.caughtWin=true;s.phase='exit';s.exitT=0;s.clearTick=s.tick;s.cat.target=-1;s.events.push('dashWin','door');return;}
      if(s.dashT<=0){s.phase='hiss';s.hissT=CFG.hiss;s.hissed++;s.plateLost++;s.carry=false;s.cat.target=-1;s.cat.queued=null;s.events.push('plate');}
      return;
    }
    const was=L.owner(s.san.p);
    s.san.p=(s.san.p+1)%L.P;
    const now=L.owner(s.san.p);
    if(now!==was)s.events.push(now===1?'warn':now===2?'look':'eat');
    const o=occ();
    if(!s.carry&&o===L.shrimp){s.carry=true;s.events.push('grab');}
    if(o===L.treat&&!s.treat){s.treat=true;s.events.push('treat');}
    if(now===2&&moving){
      s.cat.queued=null;
      if(s.carry){s.phase='dash';s.dashT=CFG.dash;s.cat.target=L.door;s.events.push('stop');}
      else{s.phase='hiss';s.hissT=CFG.hiss;s.hissed++;s.cat.target=-1;s.events.push('shoo');}
      return;
    }
    if(!s.cat.move&&s.cat.at===L.door){
      if(s.carry){s.phase='exit';s.exitT=0;s.clearTick=s.tick;s.cat.target=-1;s.events.push('door');}
      else if(!s.toldShrimp){s.toldShrimp=true;s.events.push('needShrimp');}
    }
  }
  s.time=()=>(s.clearTick>=0?s.clearTick:s.tick)*CFG.tick;
  s.stepsLeft=()=>{const o=occ();if(L.type==='still'&&!s.carry){const a=L.shrimpDist[o],b=L.doorDist[L.shrimp];return a<0?0:a+b;}const d=L.doorDist[o];return d<0?0:d;};
  return s;
}

// Autopilots drive a game only through stepDir / waiting, like a player would.
// which table and move length the cat is planning with right now (level 3: to the shrimp, then dragging it to the edge)
function plan(s){
  const L=s.L;
  if(L.type==='still')return s.carry?[L.toDoor,CFG.dragMove]:[L.toShrimp,CFG.catMove];
  return [L.toDoor,CFG.catMove];
}
function precise(s,goalTable){
  return ()=>{
    if(s.phase==='dash'){if(s.cat.target!==s.L.door)s.setTarget(s.L.door);return;}
    if(s.phase!=='play'||s.cat.move)return;
    const [T,M]=goalTable?[goalTable,CFG.catMove]:plan(s);
    const a=bestAction(s.L,T,s.cat.at,s.san.p,M);
    if(a&&a.dir!=null)s.stepDir(a.dir);
  };
}
// Knows the way but misjudges the timing. Level 1: guesses 三花's phase off by N(0, sd) ticks (she has to be predicted).
// Level 2: the toy's bar is plain to read, so the error is mostly reaction — it acts on what it saw `lag` ticks ago,
// starting late and stopping late (Alice's playtest 2026-11-06: level 2 felt far easier than level 1).
function human(s,seed,opt){
  const def=s.L.type==='sight'?{sd:3,lag:0}:{sd:1,lag:4}; // level 3: the chopsticks are a plain warning too
  const o=Object.assign({look:20},def,opt||{}),R=rng(seed*7919+13);let wait=o.look,guess=null;
  return ()=>{
    if(s.phase==='dash'){if(s.cat.target!==s.L.door)s.setTarget(s.L.door);return;}
    if(s.phase!=='play'){guess=null;wait=Math.max(wait,4);return;}
    if(s.cat.move)return;
    if(wait>0){wait--;return;}
    if(guess===null)guess=Math.round(gauss(R)*o.sd)-o.lag;
    const [T,M]=plan(s);
    // at the table a person does not step off while (as far as they saw) her chopsticks have stopped or she looks
    if(s.L.type==='still'&&s.L.owner(s.san.p+guess)!==0)return;
    const a=bestAction(s.L,T,s.cat.at,s.san.p+guess,M);
    if(a&&a.dir!=null){s.stepDir(a.dir);guess=null;}
    else if(!a)guess=null;
    else if(R()<0.15)guess=null; // looks again now and then while waiting
  };
}
// Ignores 三花 and runs the shortest way to the door.
function reckless(s){return ()=>{
  if(s.phase!=='play'&&s.phase!=='dash')return;
  const goal=s.L.type==='still'&&!s.carry?s.L.shrimp:s.L.door;
  if(!s.cat.move&&s.cat.target!==goal)s.setTarget(goal);
};}

function run(s,pilot,maxTicks,watch){for(let n=0;n<maxTicks&&s.phase!=='cleared';n++){pilot();s.step();if(watch&&watch(s))break;}return s;}

return {CFG,LEVELS,DC,DR,build,level,safeTable,bestAction,reachable,create,precise,human,reckless,run,rng};
});
