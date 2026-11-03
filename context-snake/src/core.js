// 上下文蛇 rules: grid, moves, delayed turns, eating, compaction, sub-agents, the 429 burst, autopilots.
// No DOM, no drawing; runs in Node for tests. Grid cells, y grows downward, the board wraps at every edge.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SnakeCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CFG={
  cols:13,rows:17,
  startLen:3,
  roundTime:120,          // seconds in one session; surviving it ends the round well
  // seconds per cell at the start and at the end of the round, per speed setting; slow is the default
  speeds:{slow:[0.30,0.24],normal:[0.22,0.17],fast:[0.17,0.13]},
  speedDefault:'slow',
  chatEvery:7,            // the conversation itself adds one segment this often (seconds)
  delayStep:8,            // every this many segments past delayFree, turns take one more cell to land
  delayFree:8,
  delayMax:3,
  queueMax:3,
  items:{file:{grow:2,pts:10,w:0.40},web:{grow:2,pts:15,w:0.25},log:{grow:1,pts:5,w:0.35}},
  itemsStart:3,itemsMax:5,itemsEvery:40,itemRespawn:0.4,itemMinDist:3,
  compressCd:10,          // seconds
  compressMinLen:5,       // shorter than this, compaction does nothing and costs nothing
  dispatchCut:4,          // segments a sub-agent takes from the tail
  dispatchMinLen:7,
  dispatchCd:1.5,
  subMax:3,               // a 4th one while 3 are out: every one of them hits 429
  lockout429:8,           // seconds dispatch stays locked after a 429
  subMove:0.2,subWork:9,subReturnMax:5,
  reportBase:10,reportMult:2,
  surviveBonus:100,
  step:1/60
};
const DX=[0,1,0,-1],DY=[-1,0,1,0];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const turnDelay=len=>clamp(Math.floor(Math.max(0,len-CFG.delayFree)/CFG.delayStep),0,CFG.delayMax);
const compressCut=len=>len<CFG.compressMinLen?0:Math.max(2,Math.floor((len-3)/2));
const speedOf=n=>CFG.speeds[n]?n:CFG.speedDefault;
const moveInterval=(t,speed)=>{const [a,b]=CFG.speeds[speedOf(speed)];return a+(b-a)*clamp(t/CFG.roundTime,0,1);};
const wrapX=x=>(x+CFG.cols)%CFG.cols,wrapY=y=>(y+CFG.rows)%CFG.rows;
function wdist(ax,ay,bx,by){const dx=Math.abs(ax-bx),dy=Math.abs(ay-by);return Math.min(dx,CFG.cols-dx)+Math.min(dy,CFG.rows-dy);}
// one step along the shorter way round toward (bx,by)
function stepToward(ax,ay,bx,by,prefer){
  let dx=bx-ax,dy=by-ay;
  if(Math.abs(dx)>CFG.cols/2)dx-=Math.sign(dx)*CFG.cols;
  if(Math.abs(dy)>CFG.rows/2)dy-=Math.sign(dy)*CFG.rows;
  if(dx===0&&dy===0)return prefer;
  if(Math.abs(dx)>=Math.abs(dy))return dx>0?1:3;
  return dy>0?2:0;
}

function create(opts){
  opts=opts||{};
  const rand=rng(opts.seed==null?1:opts.seed);
  const cx=Math.floor(CFG.cols/2),cy=Math.floor(CFG.rows*0.62);
  const s={speed:speedOf(opts.speed),t:0,phase:'play',dir:0,moves:0,moveAcc:0,body:[],kinds:[],grow:0,queue:[],items:[],respawn:[],nextChat:CFG.chatEvery,
    pendingKinds:[],score:0,subs:[],compressReady:0,dispatchReady:0,lockUntil:0,nextId:1,events:[],result:null,
    stats:{eaten:{file:0,web:0,log:0},chat:0,compress:0,cutTotal:0,dispatched:0,reports:0,reportChars:[],subPeak:[],lost429:0,bursts:0,peakLen:CFG.startLen,maxDelay:0}};
  for(let i=0;i<CFG.startLen;i++){s.body.push({x:cx,y:cy+i});s.kinds.push(i===0?'head':'chat');}
  const emit=e=>{s.events.push(Object.assign({t:s.t},e));};
  const len=()=>s.body.length;

  function occupied(x,y,skipTail){
    const n=s.body.length-(skipTail?1:0);
    for(let i=0;i<n;i++)if(s.body[i].x===x&&s.body[i].y===y)return true;
    return false;
  }
  function itemAt(x,y){return s.items.findIndex(it=>it.x===x&&it.y===y);}
  function spawnItem(){
    const free=[];const h=s.body[0];
    for(let y=0;y<CFG.rows;y++)for(let x=0;x<CFG.cols;x++){
      if(occupied(x,y)||itemAt(x,y)>=0)continue;
      if(s.subs.some(b=>b.body.some(c=>c.x===x&&c.y===y)))continue;
      if(wdist(x,y,h.x,h.y)<CFG.itemMinDist)continue;
      free.push({x,y});
    }
    if(!free.length)return null;
    const c=free[Math.floor(rand()*free.length)];
    let r=rand(),kind='log';
    for(const k of Object.keys(CFG.items)){if(r<CFG.items[k].w){kind=k;break;}r-=CFG.items[k].w;}
    const it={id:s.nextId++,x:c.x,y:c.y,kind,born:s.t};s.items.push(it);return it;
  }
  const targetItems=()=>Math.min(CFG.itemsMax,CFG.itemsStart+Math.floor(s.t/CFG.itemsEvery));
  for(let i=0;i<CFG.itemsStart;i++)spawnItem();

  // ---- player intents (the page, keys, buttons and swipes all call these) ----
  function lastDir(){return s.queue.length?s.queue[s.queue.length-1].dir:s.dir;}
  function turn(d){
    if(s.phase!=='play'||d==null||d<0||d>3)return false;
    const last=lastDir();
    if(d===last||d===(last+2)%4||s.queue.length>=CFG.queueMax)return false;
    const delay=turnDelay(len());
    const at=Math.max(s.moves+delay,s.queue.length?s.queue[s.queue.length-1].at+1:0);
    s.queue.push({dir:d,at,asked:s.t});emit({type:'turnQueued',dir:d,at,delay});
    return true;
  }
  function compress(){
    if(s.phase!=='play'||s.t<s.compressReady)return false;
    const n=len(),cut=compressCut(n);
    if(!cut)return false;
    // the oldest context sits at the tail: drop it and leave one summary chip in its place
    s.body.length=n-cut;s.kinds.length=n-cut;
    s.kinds[s.kinds.length-1]='summary';
    s.grow=Math.min(s.grow,2);s.pendingKinds.length=Math.min(s.pendingKinds.length,s.grow);
    s.compressReady=s.t+CFG.compressCd;s.stats.compress++;s.stats.cutTotal+=cut;
    emit({type:'compress',cut,len:len()});return true;
  }
  function dispatch(){
    if(s.phase!=='play'||s.t<s.dispatchReady||s.t<s.lockUntil)return false;
    if(len()<CFG.dispatchMinLen)return false;
    const k=CFG.dispatchCut,n=len();
    const cells=s.body.slice(n-k),chips=s.kinds.slice(n-k);
    s.body.length=n-k;s.kinds.length=n-k;
    s.dispatchReady=s.t+CFG.dispatchCd;s.stats.dispatched++;
    if(s.subs.length>=CFG.subMax){
      // too many out at once: the whole batch is rate limited and nothing comes back
      const lost=s.subs.length+1;
      emit({type:'burst429',lost,at:s.subs.map(b=>({x:b.body[0].x,y:b.body[0].y})).concat([{x:cells[0].x,y:cells[0].y}])});
      s.subs.length=0;s.stats.lost429+=lost;s.stats.bursts++;s.lockUntil=s.t+CFG.lockout429;
      return true;
    }
    const sub={id:s.nextId++,body:cells.map(c=>({x:c.x,y:c.y})),chips,phase:'work',born:s.t,acc:0,dir:(s.dir+2)%4,eaten:[],tokens:0,grow:0};
    s.subs.push(sub);emit({type:'dispatch',id:sub.id,out:s.subs.length});return true;
  }

  // ---- simulation ----
  function moveSnake(){
    // turns land when their move comes up; one per move
    if(s.queue.length&&s.queue[0].at<=s.moves){const q=s.queue.shift();if(q.dir!==(s.dir+2)%4){s.dir=q.dir;emit({type:'turn',dir:q.dir,lag:s.t-q.asked});}}
    const h=s.body[0],nx=wrapX(h.x+DX[s.dir]),ny=wrapY(h.y+DY[s.dir]);
    const growing=s.grow>0;
    if(occupied(nx,ny,!growing)){
      s.phase='over';s.result=finish('pollution',{x:nx,y:ny});return;
    }
    s.body.unshift({x:nx,y:ny});
    if(growing){s.grow--;s.kinds.splice(1,0,s.pendingKinds.length?s.pendingKinds.shift():'chat');}
    else s.body.pop();
    s.moves++;
    const ii=itemAt(nx,ny);
    if(ii>=0){
      const it=s.items[ii],def=CFG.items[it.kind];s.items.splice(ii,1);s.respawn.push(s.t+CFG.itemRespawn);
      s.score+=def.pts;s.stats.eaten[it.kind]++;s.grow+=def.grow;
      s.pendingKinds.push(...Array(def.grow).fill(it.kind));
      emit({type:'eat',kind:it.kind,x:nx,y:ny,pts:def.pts});
    }
    s.stats.peakLen=Math.max(s.stats.peakLen,len()+s.grow);
    s.stats.maxDelay=Math.max(s.stats.maxDelay,turnDelay(len()));
  }
  function moveSub(b,dt){
    b.acc+=dt;
    while(b.acc>=CFG.subMove){
      b.acc-=CFG.subMove;
      const h=b.body[0];let d=b.dir;
      if(b.phase==='work'){
        let best=null,bd=1e9;for(const it of s.items){const dd=wdist(h.x,h.y,it.x,it.y);if(dd<bd){bd=dd;best=it;}}
        if(best)d=stepToward(h.x,h.y,best.x,best.y,b.dir);
      }else{const m=s.body[0];d=stepToward(h.x,h.y,m.x,m.y,b.dir);}
      if(d===(b.dir+2)%4)d=(d+1)%4;
      b.dir=d;
      const nx=wrapX(h.x+DX[d]),ny=wrapY(h.y+DY[d]);
      b.body.unshift({x:nx,y:ny});
      if(b.grow>0)b.grow--;else b.body.pop();
      if(b.phase==='work'){
        const ii=itemAt(nx,ny);
        if(ii>=0){const it=s.items[ii];s.items.splice(ii,1);s.respawn.push(s.t+CFG.itemRespawn);b.eaten.push(it.kind);b.grow+=1;b.chips.unshift(it.kind);
          // its own context swells while it reads: shown on the sub-agent, never added to the main body
          b.tokens+=3+Math.floor(rand()*3);emit({type:'subEat',id:b.id,kind:it.kind,x:nx,y:ny});}
      }else if(wdist(nx,ny,s.body[0].x,s.body[0].y)<=1){deliver(b);return;}
    }
  }
  function deliver(b){
    const pts=CFG.reportBase+CFG.reportMult*b.eaten.reduce((a,k)=>a+CFG.items[k].pts,0);
    const chars=Math.min(588,205+45*b.eaten.length+Math.floor(rand()*30));   // the real reports ran 205 to 588 characters
    s.score+=pts;s.stats.reports++;s.stats.reportChars.push(chars);s.stats.subPeak.push(b.tokens);
    s.subs.splice(s.subs.indexOf(b),1);
    emit({type:'report',id:b.id,pts,chars,tokens:b.tokens,x:s.body[0].x,y:s.body[0].y});
  }
  function finish(reason,at){
    if(reason==='done')s.score+=CFG.surviveBonus;
    return{reason,at:at||null,t:+s.t.toFixed(3),score:s.score,len:len(),stats:JSON.parse(JSON.stringify(s.stats)),subsOut:s.subs.length};
  }
  function step(dt){
    if(s.phase!=='play')return;
    s.t+=dt;
    if(s.t>=CFG.roundTime){s.phase='over';s.result=finish('done');emit({type:'done'});return;}
    if(s.t>=s.nextChat){s.nextChat+=CFG.chatEvery;s.grow++;s.pendingKinds.push('chat');s.stats.chat++;emit({type:'chat'});}
    for(let i=s.respawn.length-1;i>=0;i--)if(s.t>=s.respawn[i]){s.respawn.splice(i,1);}
    while(s.items.length+s.respawn.length<targetItems())if(!spawnItem())break;
    for(const b of s.subs.slice()){
      if(b.phase==='work'&&s.t-b.born>=CFG.subWork){b.phase='return';b.returnAt=s.t;emit({type:'subReturn',id:b.id});}
      if(b.phase==='return'&&s.t-b.returnAt>=CFG.subReturnMax){deliver(b);continue;}
      moveSub(b,dt);
    }
    s.moveAcc+=dt;
    const iv=moveInterval(s.t,s.speed);
    if(s.moveAcc>=iv){s.moveAcc-=iv;moveSnake();}
  }
  // where the snake will be when a turn asked now lands: the cell the page marks with the bend arrow
  function project(){
    let x=s.body[0].x,y=s.body[0].y,d=s.dir,q=s.queue.slice();
    const delay=turnDelay(len());const target=Math.max(s.moves+delay,q.length?q[q.length-1].at+1:0);
    const marks=[];
    for(let m=s.moves;m<target;m++){
      if(q.length&&q[0].at<=m){const t=q.shift();if(t.dir!==(d+2)%4)d=t.dir;}
      x=wrapX(x+DX[d]);y=wrapY(y+DY[d]);marks.push({x,y});
    }
    const bends=s.queue.map(t=>{let px=s.body[0].x,py=s.body[0].y,pd=s.dir;const qq=s.queue.slice();
      for(let m=s.moves;m<t.at;m++){if(qq.length&&qq[0].at<=m){const u=qq.shift();if(u.dir!==(pd+2)%4)pd=u.dir;}px=wrapX(px+DX[pd]);py=wrapY(py+DY[pd]);}
      return{x:px,y:py,dir:t.dir};});
    return{x,y,dir:d,delay,path:marks,bends};
  }
  return{state:s,step,turn,compress,dispatch,project,
    get len(){return len();},get delay(){return turnDelay(len());}};
}

// ---- autopilots: used by tests and the fixed views. They only call turn / compress / dispatch, like a player. ----
function flood(s,sx,sy,blocked,limit){
  const seen=new Set([sx+','+sy]),st=[[sx,sy]];let n=0;
  while(st.length&&n<limit){const [x,y]=st.pop();n++;
    for(let d=0;d<4;d++){const nx=wrapX(x+DX[d]),ny=wrapY(y+DY[d]),k=nx+','+ny;if(seen.has(k)||blocked.has(k))continue;seen.add(k);st.push([nx,ny]);}}
  return n;
}
function pilot(level,seed){
  if(!level||level==='idle')return null;
  const r=rng((seed||1)*7919+13);
  let lastMoves=-1,react=0;
  return function(g){
    const s=g.state;if(s.phase!=='play')return;
    if(s.moves===lastMoves)return;          // decide once per cell, right after a move
    lastMoves=s.moves;
    const len=s.body.length;
    if(level==='reckless'){
      const h=s.body[0];let best=null,bd=1e9;for(const it of s.items){const d=wdist(h.x,h.y,it.x,it.y);if(d<bd){bd=d;best=it;}}
      if(best)g.turn(stepToward(h.x,h.y,best.x,best.y,s.dir));return;
    }
    const human=level==='human';
    // skills first
    if(!human){
      if(g.delay>=1||len>=11)g.compress();
      if(len>=CFG.dispatchMinLen+1&&s.subs.length<CFG.subMax)g.dispatch();
    }else{
      if((g.delay>=1||len>=13)&&r()<0.1)g.compress();
      if(len>=CFG.dispatchMinLen+1&&r()<0.06&&(s.subs.length<CFG.subMax||r()<0.1))g.dispatch();
    }
    if(human){
      if(react>0){react--;return;}
      if(r()<0.1){react=1+Math.floor(r()*2);}  // looked away for a cell or two
    }
    // plan from where a new turn would land (the human forgets the lag half the time)
    const aware=!human||r()<0.8;
    const p=aware?g.project():{x:s.body[0].x,y:s.body[0].y,dir:s.queue.length?s.queue[s.queue.length-1].dir:s.dir,path:[]};
    const delay=aware?p.path.length:0;
    const blocked=new Set();
    for(let i=0;i<s.body.length-delay;i++)blocked.add(s.body[i].x+','+s.body[i].y);
    for(const c of p.path)blocked.add(c.x+','+c.y);
    let best=null,bestScore=-1e9;const open=[];
    for(let d=0;d<4;d++){
      if(d===(p.dir+2)%4)continue;
      const nx=wrapX(p.x+DX[d]),ny=wrapY(p.y+DY[d]);
      if(blocked.has(nx+','+ny))continue;
      open.push(d);
      const room=flood(s,nx,ny,blocked,len+20);
      let near=1e9;for(const it of s.items)near=Math.min(near,wdist(nx,ny,it.x,it.y));
      let score=(room>=len+4?1000:room*20)-near*3+(d===p.dir?1:0);
      if(human)score+=r()*6;
      if(score>bestScore){bestScore=score;best=d;}
    }
    if(human&&open.length&&r()<0.03)best=open[Math.floor(r()*open.length)];   // a careless pick: not into a wall of body, just not the smart way
    if(best!=null&&best!==p.dir)g.turn(best);
  };
}
return{CFG,DX,DY,rng,create,pilot,turnDelay,compressCut,moveInterval,wdist};
});
