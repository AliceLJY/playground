// 推到以后 rules: spawning at nine desks, taps, combo, the pile of things left for later. No DOM, no drawing; runs in Node for tests.
// Logical frame is 150 x 266; y grows downward. Every number here is in SPEC.md and awaits human playtesting.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LaterCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const LW=150,LH=266,COLS=[25,75,125],ROWS=[76,136,196],CELL=50;
const CFG={
  duration:60,
  warn:0.4,              // desk flickers this long before something rises
  rise:0.12,sink:0.15,
  tailUp:[1.6,0.8],     // seconds a tail stays fully up, start of round -> end
  interval:[1.0,0.34],  // seconds between pop-ups, start -> end (plus jitter)
  jitter:0.2,
  maxLive:[2,6],
  burst2:0.8,burst3:0.45, // chance of a second / third at once, reached at the end of the round
  share:{wait:0.085,observer:0.17},
  waitAfter:6,observerAfter:5,
  waitUp:[1.8,2.4],observerUp:[2.6,3.4],
  kidShare:0.45,         // of the 等她 signs, how many 无忧 / 无虑 hold up
  lockObserver:0.7,lockWhiff:0.25,lockWrong:0.25,
  points:{tail:10,wait:-50},
  pileMax:3,comboClear:10,
  step:1/120
};
const TAILS=['下次顺手','等下个窗口再说','先这样吧','回头再修','明天再看','改天统一处理','先记一笔','以后再优化','有空再弄','先放着'];
const OBSERVE='观察中',WAIT='等她';
const SHIRTS=['#6f9fd8','#d9845a','#7fb069','#c773a8','#e0b84a','#5aa6a0','#a58ad6','#d66a6a'];
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const multiplier=combo=>combo>=12?8:combo>=8?4:combo>=4?2:1;
const cellXY=c=>({x:COLS[c%3],y:ROWS[Math.floor(c/3)]});
// the sign each pop-up holds, in logical units; the renderer draws exactly these rectangles
function signRect(e,t){
  const {x,y}=cellXY(e.cell);
  if(e.kind==='tail'){const w=Math.min(CELL-2,e.text.length*6+6),wob=Math.round(Math.sin((t||0)*9+e.id)*1);return{x:x-w/2+wob,y:y-45,w,h:11};}
  if(e.kind==='wait')return{x:x-11,y:y-48,w:22,h:22};
  return{x:x-12,y:y-50,w:24,h:24};
}
// the tappable box of a desk: much larger than the little person
const hitBox=c=>{const {x,y}=cellXY(c);return{x:x-CELL/2,y:y-50,w:CELL,h:60};};
function cellAt(px,py){for(let c=0;c<9;c++){const b=hitBox(c);if(px>=b.x&&px<b.x+b.w&&py>=b.y&&py<b.y+b.h)return c;}return -1;}

function create(opts){
  opts=opts||{};
  const rand=rng(opts.seed==null?1:opts.seed);
  const s={t:0,phase:'play',ents:[],score:0,combo:0,bestCombo:0,pile:[],lockUntil:0,nextSpawn:0.8,nextId:1,
    stats:{fixed:0,missed:0,wrong:0,bounced:0,whiffs:0,cleared:0,spawned:{tail:0,wait:0,observer:0}},events:[],result:null,peakLive:0,cellFree:new Array(9).fill(0),seen:{}};
  const emit=e=>{s.events.push(e);};
  const p=()=>clamp(s.t/CFG.duration,0,1);
  const live=()=>s.ents.filter(e=>e.state!=='gone').length;
  function pickKind(){
    if(s.t<4)return'tail';
    const r=rand();
    if(s.t>=CFG.waitAfter&&r<CFG.share.wait)return'wait';
    if(s.t>=CFG.observerAfter&&r<CFG.share.wait+CFG.share.observer)return'observer';
    return'tail';
  }
  function spawn(at){
    const free=[];for(let c=0;c<9;c++)if(s.t>=s.cellFree[c]&&!s.ents.some(e=>e.cell===c&&e.state!=='gone'))free.push(c);
    if(!free.length)return;
    const cell=free[Math.floor(rand()*free.length)],kind=pickKind();
    const up=kind==='tail'?lerp(CFG.tailUp[0],CFG.tailUp[1],p()):kind==='wait'?lerp(CFG.waitUp[0],CFG.waitUp[1],rand()):lerp(CFG.observerUp[0],CFG.observerUp[1],rand());
    let holder='adult';if(kind==='wait'&&rand()<CFG.kidShare)holder=rand()<0.5?'wuyou':'wulv';
    const born=at,upAt=born+CFG.warn,fullAt=upAt+CFG.rise,leaveAt=fullAt+up;
    const e={id:s.nextId++,kind,cell,born,upAt,fullAt,leaveAt,goneAt:leaveAt+CFG.sink,state:'warn',holder,
      text:kind==='tail'?TAILS[Math.floor(rand()*TAILS.length)]:kind==='wait'?WAIT:OBSERVE,shirt:SHIRTS[Math.floor(rand()*SHIRTS.length)],hitAt:null,tapped:0,
      hint:kind!=='tail'&&!s.seen[kind]};   // the first blue and the first green of a round carry a picture hint (don't hit / leave it)
    s.seen[kind]=true;
    s.ents.push(e);s.stats.spawned[kind]++;emit({type:'warn',id:e.id,cell,kind});
  }
  function finish(reason){
    if(s.result)return;
    s.phase='over';s.result={reason,score:s.score,bestCombo:s.bestCombo,time:+s.t.toFixed(3),pile:s.pile.slice(),...s.stats,spawned:{...s.stats.spawned}};
    emit({type:'over',reason});
  }
  function step(dt){
    if(s.phase==='over')return;
    s.t+=dt;
    if(s.t>=CFG.duration){finish('time');return;}
    if(s.t>=s.nextSpawn){
      const k=p(),cap=Math.round(lerp(CFG.maxLive[0],CFG.maxLive[1],k));
      let n=1+(rand()<CFG.burst2*k?1:0)+(rand()<CFG.burst3*k?1:0);n=Math.min(n,cap-live());
      for(let i=0;i<n;i++)spawn(s.t+i*0.12);
      s.nextSpawn=s.t+lerp(CFG.interval[0],CFG.interval[1],Math.pow(k,0.8))+rand()*CFG.jitter;
    }
    for(const e of s.ents){
      if(e.state==='gone')continue;
      if(e.state==='hit'){if(s.t>=e.hitAt+0.3){e.state='gone';s.cellFree[e.cell]=s.t+0.25;}continue;}
      if(e.state==='warn'&&s.t>=e.upAt){e.state='up';emit({type:'up',id:e.id,kind:e.kind,cell:e.cell});}
      if(e.state==='up'&&s.t>=e.leaveAt){
        e.state='leaving';
        if(e.kind==='tail'){
          s.stats.missed++;s.combo=0;s.pile.push(e.text);emit({type:'miss',id:e.id,cell:e.cell,text:e.text,pile:s.pile.length});
          if(s.pile.length>=CFG.pileMax){finish('pile');return;}
        }
      }
      if(e.state==='leaving'&&s.t>=e.goneAt){e.state='gone';s.cellFree[e.cell]=s.t+0.25;}
    }
    if(s.ents.length>40)s.ents=s.ents.filter(e=>e.state!=='gone');
    const l=live();if(l>s.peakLive)s.peakLive=l;
  }
  const hittable=e=>e.state==='up';
  // one slipper tap in logical units; returns what happened
  function tap(px,py){
    if(s.phase==='over')return{type:'over'};
    if(s.t<s.lockUntil){emit({type:'locked',x:px,y:py});return{type:'locked'};}
    const cell=cellAt(px,py),e=cell<0?null:s.ents.find(x=>x.cell===cell&&hittable(x));
    if(!e){
      s.stats.whiffs++;s.combo=0;s.lockUntil=s.t+CFG.lockWhiff;emit({type:'whiff',x:px,y:py,cell});return{type:'whiff',cell};
    }
    e.tapped++;
    if(e.kind==='tail'){
      e.state='hit';e.hitAt=s.t;s.stats.fixed++;
      s.combo++;if(s.combo>s.bestCombo)s.bestCombo=s.combo;
      const mult=multiplier(s.combo),pts=CFG.points.tail*mult;s.score+=pts;
      emit({type:'hit',id:e.id,cell,x:px,y:py,pts,mult,combo:s.combo});
      if(s.combo%CFG.comboClear===0&&s.pile.length){const text=s.pile.pop();s.stats.cleared++;emit({type:'cleared',text,pile:s.pile.length});}
      return{type:'hit',pts};
    }
    if(e.kind==='wait'){
      s.score=Math.max(0,s.score+CFG.points.wait);s.combo=0;s.stats.wrong++;s.lockUntil=s.t+CFG.lockWrong;
      emit({type:'wrong',id:e.id,cell,x:px,y:py,pts:CFG.points.wait});return{type:'wrong'};
    }
    s.stats.bounced++;s.lockUntil=s.t+CFG.lockObserver;emit({type:'bounce',id:e.id,cell,x:px,y:py});return{type:'bounce'};
  }
  return{state:s,step,tap,finish};
}

// Autopilots used by tests and the fixed views.
//  precise: sees everything correctly, reacts in 0.22 s, never misreads.
//  human:   reacts late (normal ~0.5 s), moves its thumb between desks, aims with error, sometimes misreads a sign.
//  reckless: taps whatever has been up longest, whatever it is, as fast as it can.
function pilot(level,seed){
  const rand=rng(((seed==null?7:seed)*2654435761)>>>0),seen=new Map();
  const gauss=()=>{let u=0;while(u===0)u=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(6.2831853*rand());};
  let next=0,lastCell=4;
  return function(game){
    const s=game.state;if(s.phase==='over'||s.t<next)return;
    const up=s.ents.filter(e=>e.state==='up');
    let target=null;
    if(level==='reckless'){
      for(const e of up)if(s.t-e.upAt>=0.15&&(!target||e.upAt<target.upAt))target=e;
    }else{
      for(const e of up){
        if(!seen.has(e.id)){
          const misread=level==='human'&&e.kind!=='tail'&&rand()<(e.kind==='wait'?0.12:0.16);
          seen.set(e.id,{react:level==='human'?Math.max(0.28,0.5+0.13*gauss()):0.22,go:e.kind==='tail'||misread});
        }
        const v=seen.get(e.id);
        if(!v.go||e.tapped||s.t-e.upAt<v.react)continue;
        if(!target||e.leaveAt<target.leaveAt)target=e;
      }
    }
    if(!target){next=s.t+0.03;return;}
    const {x,y}=cellXY(target.cell),err=level==='human'?8:0;
    const r=game.tap(x+err*gauss(),y-20+err*gauss());
    if(level==='human'){const d=Math.abs(target.cell%3-lastCell%3)+Math.abs(Math.floor(target.cell/3)-Math.floor(lastCell/3));next=s.t+Math.max(0.16,0.27+0.06*d+0.06*gauss());}
    else next=s.t+(level==='reckless'?0.12:0.14);
    lastCell=target.cell;
    if(r.type==='locked'&&level!=='reckless')next=s.lockUntil;
  };
}
function run(seed,level,watch,limit){
  const g=create({seed}),pl=level?pilot(level,seed):null;let n=0;
  while(g.state.phase!=='over'&&n++<(limit||120*70)){if(pl)pl(g);g.step(CFG.step);if(watch)watch(g.state);g.state.events.length=0;}
  return g.state;
}
return{LW,LH,COLS,ROWS,CELL,CFG,TAILS,WAIT,OBSERVE,create,pilot,run,rng,multiplier,cellXY,signRect,hitBox,cellAt};
});
