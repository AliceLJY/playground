// 一条消息的旅程 · rules: boards, rotation, the cat's route, the solver and three autopilots.
// No DOM, no drawing; runs in Node for tests and in the page as window.PipeCore.
// Grid coordinates: column c grows right, row r grows down. Sides: 0 N, 1 E, 2 S, 3 W; a pipe is a 4-bit mask (N=1 E=2 S=4 W=8).
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipeCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const DC=[0,1,0,-1],DR=[-1,0,1,0],MOVE={N:0,E:1,S:2,W:3};
const BASE={I:0b0101,L:0b0011,X:0b1111};
const CFG={
  speed:5,        // cells per second while the cat rides
  failHold:2.2,   // seconds the failure note stays up after the cat stops (the timer keeps running)
  step:1/60
};
// Five real workflows, easy to hard. Station names stay at most four characters so they fit on a tile.
// `moves` is the intended route from the start terminal; `traps` are extra routes built into the board on purpose.
const LEVELS=[
  {id:'chat',title:'一句话的往返',cols:4,rows:5,
    start:{c:0,r:4,label:'手机'},end:{c:3,r:4,label:'手机'},
    moves:'NNNEEESSS',traps:[],
    stations:[{c:0,r:1,name:'消息桥'},{c:3,r:1,name:'AI'}],
    time:35,minSteps:[4,9],fill:11,
    lesson:'这一圈防的是：AI 没回话时，你分不清是它没答，还是中间哪一段断了。'},
  {id:'article',title:'写一篇公众号',cols:5,rows:6,
    start:{c:0,r:5,label:'一个念头'},end:{c:4,r:0,label:'发出去'},
    moves:'NNNNEESSWSEENNNEN',traps:['NNNNEENESEN'],
    stations:[{c:0,r:4,name:'选题'},{c:1,r:1,name:'取材'},{c:1,r:4,name:'核实'},{c:3,r:2,name:'打磨'},{c:4,r:1,name:'成文'}],
    time:60,minSteps:[10,18],fill:23,
    lesson:'核实排在打磨前面，防的是：文章写得很漂亮，事实却是错的。'},
  {id:'dispatch',title:'派活与读回',cols:5,rows:7,
    start:{c:0,r:0,label:'要办的事'},end:{c:2,r:6,label:'确认完成'},
    moves:'EEEESSWWSWSSES',traps:['EEEESSWWSESSWS'],
    stations:[{c:1,r:0,name:'写说明'},{c:4,r:1,name:'派出去'},{c:3,r:2,name:'对方干活'},{c:2,r:3,name:'交回'},{c:1,r:4,name:'验货',verify:true}],
    time:60,minSteps:[10,18],fill:37,
    lesson:'验货这一站防的是：对方说做完了，文件根本没生成。'},
  {id:'bugfix',title:'先复现再修',cols:5,rows:7,
    start:{c:0,r:6,label:'发现问题'},end:{c:4,r:6,label:'关单'},
    moves:'NNNEENWNNEESSSSWSEES',traps:['NNNEESWSSENEES'],
    stations:[{c:0,r:4,name:'复现'},{c:1,r:1,name:'定位'},{c:3,r:2,name:'修改'},{c:2,r:5,name:'重跑'}],
    time:80,minSteps:[14,24],fill:41,
    lesson:'先复现再修，防的是：修完分不清是真修好了，还是碰巧好了。'},
  {id:'push',title:'推送之前',cols:5,rows:7,
    start:{c:0,r:0,label:'改好了'},end:{c:4,r:3,label:'上线'},
    moves:'EESSSSENNWWSSSEEENN',traps:['EESSSSWWSSENEEENN'],
    stations:[{c:2,r:1,name:'跑测试'},{c:1,r:2,name:'拉最新'},{c:3,r:5,name:'推送'},{c:4,r:4,name:'线上看'}],
    time:75,minSteps:[12,22],fill:53,
    lesson:'先拉最新，防的是把别人刚做完的东西盖掉；推完看线上，防的是本地好、线上坏。'}
];

const opp=d=>(d+2)&3;
const rotMask=(m,k)=>{k&=3;for(let i=0;i<k;i++)m=((m<<1)|(m>>3))&15;return m;};
function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

// Build the fixed board layout of a level: piece types from the intended route and the traps, random filler elsewhere.
function layout(def){
  const {cols,rows}=def,cells=[];
  for(let i=0;i<cols*rows;i++)cells.push({type:null,rot:0,fixed:false,station:-1});
  const at=(c,r)=>cells[r*cols+c];
  const s=at(def.start.c,def.start.r);s.type='S';s.fixed=true;
  const e=at(def.end.c,def.end.r);e.type='E';e.fixed=true;
  const routes=[def.moves].concat(def.traps||[]);
  routes.forEach((mv,ri)=>{
    let c=def.start.c,r=def.start.r;const own=new Map();
    const first=MOVE[mv[0]];
    if(ri===0)s.open=first;else if(s.open!==first)throw new Error(def.id+': trap leaves the start on another side');
    for(let i=0;i<mv.length;i++){
      const d=MOVE[mv[i]];c+=DC[d];r+=DR[d];
      if(c<0||r<0||c>=cols||r>=rows)throw new Error(def.id+': route leaves the grid');
      const inSide=opp(d);
      if(i===mv.length-1){
        if(c!==def.end.c||r!==def.end.r)throw new Error(def.id+': route '+ri+' does not finish on the end terminal');
        if(ri===0)e.open=inSide;else if(e.open!==inSide)throw new Error(def.id+': trap reaches the end from another side');
        break;
      }
      const out=MOVE[mv[i+1]],t=inSide===opp(out)?'I':'L',cell=at(c,r),key=r*cols+c;
      if(cell.type==='S'||cell.type==='E')throw new Error(def.id+': route runs through a terminal');
      if(own.has(key)){
        if(own.get(key)==='I'&&t==='I'){cell.type='X';own.set(key,'X');continue;}
        throw new Error(def.id+': route reuses a cell it cannot cross');
      }
      own.set(key,t);
      if(cell.type&&cell.type!==t&&!(cell.type==='X'))throw new Error(def.id+': routes disagree at '+c+','+r);
      if(!cell.type)cell.type=t;
    }
  });
  def.stations.forEach((st,k)=>{
    const cell=at(st.c,st.r);
    if(!cell.type||cell.type==='S'||cell.type==='E')throw new Error(def.id+': station '+st.name+' is not on a pipe');
    cell.station=k;
  });
  const fill=rng(def.fill);
  for(const cell of cells)if(!cell.type)cell.type=fill()<0.55?'L':'I';
  return cells;
}

function maskOf(cell){
  if(cell.type==='S'||cell.type==='E')return 1<<cell.open;
  return rotMask(BASE[cell.type],cell.rot);
}
// rotations (clockwise taps) that turn `cell` so it joins sides a and b; Infinity if it cannot
function costTo(cell,a,b){
  if(cell.type==='X')return a===opp(b)?0:Infinity;
  const want=(1<<a)|(1<<b);let best=Infinity;
  for(let k=0;k<4;k++)if(rotMask(BASE[cell.type],cell.rot+k)===want)best=Math.min(best,k);
  return best;
}

// Follow the pipe from the start terminal exactly as the cat would. Returns the physical chain and the first rule broken on it.
function trace(def,cells){
  const {cols,rows}=def,at=(c,r)=>cells[r*cols+c];
  let c=def.start.c,r=def.start.r,dir=at(c,r).open,next=0;
  const steps=[],seen=new Set();let outcome=null;
  for(let guard=0;guard<cols*rows*2+4;guard++){
    const nc=c+DC[dir],nr=r+DR[dir],inSide=opp(dir);
    if(nc<0||nr<0||nc>=cols||nr>=rows){outcome={kind:'break',c,r,side:dir};break;}
    const cell=at(nc,nr),m=maskOf(cell);
    if(!(m&(1<<inSide))||cell.type==='S'){outcome={kind:'break',c,r,side:dir};break;}
    if(cell.type==='E'){
      steps.push({c:nc,r:nr,inSide,out:-1});
      const missing=def.stations.map((s,k)=>k).filter(k=>k>=next);
      if(!missing.length)outcome={kind:'delivered'};
      else if(missing.some(k=>def.stations[k].verify))outcome={kind:'emptybox',station:missing.find(k=>def.stations[k].verify)};
      else outcome={kind:'missing',station:missing[0]};
      break;
    }
    const out=cell.type==='X'?opp(inSide):[0,1,2,3].find(d=>d!==inSide&&(m&(1<<d)));
    const key=(nr*cols+nc)*2+(out&1);
    if(seen.has(key)){outcome={kind:'break',c,r,side:dir};break;}
    seen.add(key);
    if(cell.station>=0){
      if(cell.station!==next){outcome={kind:'order',station:next,at:cell.station,c:nc,r:nr,side:inSide};break;}
      next++;
    }
    steps.push({c:nc,r:nr,inSide,out});
    c=nc;r=nr;dir=out;
  }
  if(outcome.kind==='break')outcome.station=next<def.stations.length?next:-1;
  return {steps,outcome,visited:next};
}

// Fewest taps that make a route from start to end passing `seq` (station indices, in order) and no other station.
// Depth-first over the cat's possible routes with branch and bound. Returns {cost, taps:[cell index...], cells:[...]} or null.
function solve(def,cells,seq){
  const {cols,rows}=def,at=(c,r)=>cells[r*cols+c];
  seq=seq||def.stations.map((s,k)=>k);
  const used=new Uint8Array(cols*rows*2);let best=null,bestCost=Infinity;const pick=[];
  function go(c,r,dir,ns,cost){
    const nc=c+DC[dir],nr=r+DR[dir];
    if(nc<0||nr<0||nc>=cols||nr>=rows)return;
    const idx=nr*cols+nc,cell=cells[idx],inSide=opp(dir);
    if(cell.type==='S')return;
    if(cell.type==='E'){
      if(cell.open===inSide&&ns===seq.length&&cost<bestCost){bestCost=cost;best=pick.slice();}
      return;
    }
    let ns2=ns;
    if(cell.station>=0){if(cell.station!==seq[ns])return;ns2=ns+1;}
    const outs=cell.type==='L'?[(inSide+1)&3,(inSide+3)&3]:[opp(inSide)];
    for(const out of outs){
      const k=costTo(cell,inSide,out);if(k===Infinity||cost+k>=bestCost)continue;
      const slot=idx*2+(cell.type==='X'?(out&1):0);
      if(used[slot]||(cell.type!=='X'&&used[idx*2+1]))continue;
      if(cell.type!=='X'){used[idx*2]=1;used[idx*2+1]=1;}else used[slot]=1;
      pick.push({idx,k,out});
      go(nc,nr,out,ns2,cost+k);
      pick.pop();
      if(cell.type!=='X'){used[idx*2]=0;used[idx*2+1]=0;}else used[slot]=0;
    }
  }
  go(def.start.c,def.start.r,at(def.start.c,def.start.r).open,0,0);
  if(!best)return null;
  const taps=[];for(const p of best)for(let i=0;i<p.k;i++)taps.push(p.idx);
  return {cost:bestCost,taps,cells:best.map(p=>p.idx)};
}

// A fresh scrambled board: random rotations, redrawn until the fewest taps to solve it lands inside the level's range.
function scramble(def,seed){
  const base=layout(def),rand=rng(seed*7919+def.fill);
  for(let attempt=1;attempt<=400;attempt++){
    const cells=base.map(x=>({...x,rot:x.fixed?0:Math.floor(rand()*4)}));
    const sol=solve(def,cells);
    if(sol&&sol.cost>=def.minSteps[0]&&sol.cost<=def.minSteps[1]&&trace(def,cells).outcome.kind!=='delivered')return {cells,min:sol.cost,attempts:attempt};
  }
  throw new Error(def.id+': no scramble inside the step range for seed '+seed);
}

// One level in play. phase: play → ride → (play again after a failed ride) → cleared | timeout.
function create(opts){
  opts=opts||{};
  const level=opts.level||0,def=LEVELS[level],seed=opts.seed==null?1:opts.seed;
  const sc=scramble(def,seed);
  const s={level,def,seed,cells:sc.cells,min:sc.min,t:0,timeLeft:def.time,steps:0,phase:'play',ride:null,fail:null,rides:0,fails:0,events:[],result:null};
  const emit=e=>s.events.push(e);
  function tap(idx){
    if(s.phase!=='play')return false;
    const cell=s.cells[idx];if(!cell||cell.fixed)return false;
    cell.rot=(cell.rot+1)&3;s.steps++;emit({type:'tap',idx});return true;
  }
  function dispatch(){
    if(s.phase!=='play')return false;
    const tr=trace(def,s.cells),pts=routePoints(def,tr);
    s.phase='ride';s.rides++;s.fail=null;
    s.ride={trace:tr,pts,len:pts.total,stop:pts.stop,pos:0,done:false};
    emit({type:'dispatch',outcome:tr.outcome.kind});return true;
  }
  function step(dt){
    if(s.phase==='cleared'||s.phase==='timeout')return;
    s.t+=dt;s.timeLeft=Math.max(0,s.timeLeft-dt);
    if(s.phase==='ride'){
      const rd=s.ride;rd.pos=Math.min(rd.stop,rd.pos+CFG.speed*dt);
      if(rd.pos>=rd.stop){
        const o=rd.trace.outcome;
        if(o.kind==='delivered'){s.phase='cleared';s.result={win:true,time:s.t,steps:s.steps,min:s.min,rides:s.rides,timeLeft:s.timeLeft};emit({type:'cleared'});return;}
        s.fails++;s.fail={...o,text:failText(def,o),until:s.t+CFG.failHold,pos:rd.pos};s.phase='play';rd.done=true;emit({type:'fail',kind:o.kind});
      }
    }
    if(s.fail&&s.t>=s.fail.until){s.fail=null;s.ride=null;}
    if(s.timeLeft<=0&&s.phase!=='cleared'){s.phase='timeout';s.result={win:false,time:s.t,steps:s.steps,min:s.min,rides:s.rides};emit({type:'timeout'});}
  }
  s.tap=tap;s.dispatch=dispatch;s.step=step;
  return s;
}

// Notes lead with the station numbers (①②③…), which is all a player needs; the names that follow are only flavour.
const NUM='①②③④⑤⑥⑦⑧⑨';
function failText(def,o){
  const tag=k=>NUM[k]+' '+def.stations[k].name;
  if(o.kind==='break')return o.station>=0?'这里断了，下一站是 '+tag(o.station):'这里断了，还没接到终点';
  if(o.kind==='order')return '先到 '+tag(o.station)+'，再到 '+tag(o.at);
  if(o.kind==='missing')return '还差 '+tag(o.station)+' 没经过';
  if(o.kind==='emptybox')return '箱子是空的！先过 '+tag(o.station)+' 再到终点';
  return '';
}
// Does the pipe from the start physically reach the end, whatever the stations say? (lights the send button)
function reaches(def,cells){
  const {cols,rows}=def;let c=def.start.c,r=def.start.r,dir=cells[r*cols+c].open;
  for(let g=0;g<cols*rows*2+4;g++){
    const nc=c+DC[dir],nr=r+DR[dir],inSide=opp(dir);
    if(nc<0||nr<0||nc>=cols||nr>=rows)return false;
    const cell=cells[nr*cols+nc],m=maskOf(cell);
    if(!(m&(1<<inSide))||cell.type==='S')return false;
    if(cell.type==='E')return true;
    dir=cell.type==='X'?opp(inSide):[0,1,2,3].find(d=>d!==inSide&&(m&(1<<d)));c=nc;r=nr;
  }
  return false;
}

// The cat's polyline in cell units (cell centre = c+0.5, r+0.5): through each entry edge and each centre.
// `stop` is how far it gets: broken edge, just before an out-of-order station, or the end terminal.
function routePoints(def,tr){
  const st=def.start,pts=[[st.c+0.5,st.r+0.5]];
  const edge=(c,r,side)=>[c+0.5+DC[side]*0.5,r+0.5+DR[side]*0.5];
  for(const sp of tr.steps){pts.push(edge(sp.c,sp.r,sp.inSide));pts.push([sp.c+0.5,sp.r+0.5]);}
  const o=tr.outcome;let tail=null;
  if(o.kind==='break'){const last=tr.steps.length?tr.steps[tr.steps.length-1]:{c:st.c,r:st.r};tail=edge(last.c,last.r,o.side);pts.push(tail);}
  if(o.kind==='order'){tail=edge(o.c,o.r,o.side);pts.push([tail[0]-DC[o.side]*0.18,tail[1]-DR[o.side]*0.18]);}
  let total=0;const cum=[0];
  for(let i=1;i<pts.length;i++){total+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);cum.push(total);}
  pts.total=total;pts.cum=cum;pts.stop=total;
  return pts;
}
function pointAt(pts,d){
  const cum=pts.cum;d=Math.max(0,Math.min(pts.total,d));
  for(let i=1;i<pts.length;i++)if(d<=cum[i]||i===pts.length-1){
    const seg=cum[i]-cum[i-1]||1,f=(d-cum[i-1])/seg;
    return {x:pts[i-1][0]+(pts[i][0]-pts[i-1][0])*f,y:pts[i-1][1]+(pts[i][1]-pts[i-1][1])*f,dx:pts[i][0]-pts[i-1][0],dy:pts[i][1]-pts[i-1][1]};
  }
  return {x:pts[0][0],y:pts[0][1],dx:1,dy:0};
}

// Human model for the duration tests (SPEC 5): seconds of thought before each needed tap, its spread, extra per level, mis-tap chance.
const HUMAN={think:1.7,perLevel:0.2,spread:0.8,misTap:0.15};
// Autopilots drive a level through tap()/dispatch() only. precise: knows the answer, 0.25 s a tap.
// human: knows where it is heading but thinks between taps, mis-taps, and sometimes sends the cat too early.
// reckless: never thinks, taps at random and keeps sending the cat.
function pilot(mode,seed){
  const rand=rng((seed||1)*104729+17);
  const normal=(m,sd)=>{let u=0,v=0;while(!u)u=rand();while(!v)v=rand();return m+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  let plan=null,wait=0,early=null,stat={misTaps:0,earlyRides:0};
  return {stat,drive(s,dt){
    if(s.phase!=='play')return;
    if(s.fail&&mode!=='reckless'){return;}  // reads the note before touching anything
    if(!plan){
      plan=solve(s.def,s.cells).taps.slice();
      wait=mode==='precise'?0.4:mode==='human'?Math.max(1.5,normal(3+s.def.stations.length*0.6,1.2)):0.2;
      early=mode==='human'&&rand()<0.35?Math.floor(plan.length*(0.5+0.3*rand())):null;
    }
    wait-=dt;if(wait>0)return;
    if(mode==='reckless'){
      if(rand()<0.18)s.dispatch();else{const free=s.cells.map((c,i)=>c.fixed?-1:i).filter(i=>i>=0);s.tap(free[Math.floor(rand()*free.length)]);}
      wait=0.3;return;
    }
    if(early!=null&&plan.length<=early){early=null;stat.earlyRides++;s.dispatch();wait=0.4;return;}
    if(!plan.length){s.dispatch();wait=1;return;}
    if(mode==='human'&&rand()<HUMAN.misTap){
      const free=s.cells.map((c,i)=>c.fixed?-1:i).filter(i=>i>=0),idx=free[Math.floor(rand()*free.length)];
      s.tap(idx);stat.misTaps++;
      plan=solve(s.def,s.cells).taps.slice();   // looks again and finds the new shortest fix
    }else s.tap(plan.shift());
    wait=mode==='precise'?0.25:Math.min(6,Math.max(0.4,normal(HUMAN.think+HUMAN.perLevel*s.level,HUMAN.spread)));
  }};
}
function run(level,seed,mode,boardSeed){
  const s=create({level,seed:boardSeed==null?seed:boardSeed}),p=pilot(mode,seed);
  for(let n=0;n<60*400&&s.phase!=='cleared'&&s.phase!=='timeout';n++){p.drive(s,CFG.step);s.step(CFG.step);s.events.length=0;}
  return {state:s,stat:p.stat};
}

return {NUM,reaches,CFG,HUMAN,LEVELS,DC,DR,BASE,rotMask,maskOf,rng,layout,trace,solve,scramble,create,routePoints,pointAt,failText,pilot,run,costTo};
});
