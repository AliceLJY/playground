// 药性配对 rules: herb table, spawning, falling, filing into the four baskets, scoring, explanation cards, autopilots.
// No DOM, no drawing; runs in Node for tests. World units: height is always 1000, width is 1000 * aspect. y grows downward.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HerbCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const H=1000;
const CFG={
  round:75,              // seconds in a round
  maxLive:4,             // herbs falling at once
  herbR:58,              // body radius used for spacing and hit tests
  box:{half:62,top:66,bottom:98},  // a herb's drawn extent around its centre, name plate under the body included
  spawnY:212,            // herbs pop out just below the score bar (box top 146 > hudBottom), never pass under it
  popIn:0.18,            // seconds a new herb takes to pop out; it cannot be filed during that time
  missY:700,             // a herb whose centre passes this line lands on the floor (box bottom 798, above the basket rims): missed
  fallTime:[4.6,2.3],    // seconds from spawn to the miss line, start of round -> end of round
  gap:[1.7,0.72],        // seconds between spawns, start -> end, plus up to gapJitter
  gapJitter:0.3,
  margin:8,              // side margin of the basket row
  spanMax:900,           // the basket row and the falling lane are never wider than this
  basketGap:6,
  basketTop:800,basketBottom:948,
  tapTop:760,            // taps from here down to the bottom edge choose the basket under the finger
  hudBottom:140,
  comboStep:5,maxMult:4,points:10,quickBonus:5,quickY:450,
  card:{w:236,h:270,ys:[290,150,470],tallH:310,tallYs:[290,150,430],life:2.8,maxWait:1.6,pad:6},
  step:1/120
};
// The four natures (四气), cold to hot. 微寒/大寒 count as 寒, 微温 as 温, 大热 as 热: degree words inside one nature.
const NATURES=[{key:'han',label:'寒'},{key:'liang',label:'凉'},{key:'wen',label:'温'},{key:'re',label:'热'}];
// Every entry: 性味 as written in the sources listed in SPEC.md; note is the one line shown when it is missed or misfiled.
const HERBS=[
  {id:'huanglian',name:'黄连',taste:'苦，寒',nature:0,note:'「哑巴吃黄连」的那个黄连，苦，性寒。'},
  {id:'jinyinhua',name:'金银花',taste:'甘，寒',nature:0,note:'闻着清香，性却是寒的。'},
  {id:'juhua',name:'菊花',taste:'甘、苦，微寒',nature:0,note:'微寒也算寒；泡得再烫，也是寒性。'},
  {id:'shigao',name:'石膏',taste:'甘、辛，大寒',nature:0,note:'大寒比寒还重一档，也进寒篓。'},
  {id:'bohe',name:'薄荷',taste:'辛，凉',nature:1,note:'凉比寒轻一档，薄荷是凉不是寒。'},
  {id:'gegen',name:'葛根',taste:'甘、辛，凉',nature:1,note:'和薄荷一样是辛凉的，性凉。'},
  {id:'luohanguo',name:'罗汉果',taste:'甘，凉',nature:1,note:'吃着甜，性是凉的。'},
  {id:'dongguapi',name:'冬瓜皮',taste:'甘，凉',nature:1,note:'冬瓜外面那层绿皮，性凉。'},
  {id:'shengjiang',name:'生姜',taste:'辛，微温',nature:2,note:'微温也算温；晒成干姜才是热。'},
  {id:'chenpi',name:'陈皮',taste:'辛、苦，温',nature:2,note:'晒干放陈的橘子皮，性温。'},
  {id:'dazao',name:'大枣',taste:'甘，温',nature:2,note:'红枣甜甜的，性温。'},
  {id:'aiye',name:'艾叶',taste:'辛、苦，温；有小毒',nature:2,note:'端午挂的艾草，叶子性温。'},
  {id:'fuzi',name:'附子',taste:'辛、甘，大热；有毒',nature:3,note:'大热进热篓；有毒，不能自己乱用。'},
  {id:'rougui',name:'肉桂',taste:'辛、甘，大热',nature:3,note:'卷成筒的树皮，大热；桂枝才是温。'},
  {id:'ganjiang',name:'干姜',taste:'辛，热',nature:3,note:'同一块姜晒干后，从微温变成热。'},
  {id:'hujiao',name:'胡椒',taste:'辛，热',nature:3,note:'厨房里那瓶胡椒，性热。'}
];
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t;
function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const multiplier=combo=>Math.min(CFG.maxMult,1+Math.floor(combo/CFG.comboStep));

// Basket row and falling lane for a world of width W.
function layout(W){
  const span=Math.min(W-2*CFG.margin,CFG.spanMax),x0=(W-span)/2,g=CFG.basketGap,bw=(span-3*g)/4;
  const baskets=NATURES.map((n,i)=>{const x=x0+i*(bw+g);return{i,x,y:CFG.basketTop,w:bw,h:CFG.basketBottom-CFG.basketTop,cx:x+bw/2,cy:(CFG.basketTop+CFG.basketBottom)/2};});
  return{span,x0,x1:x0+span,bw,baskets,laneMin:x0+CFG.box.half,laneMax:x0+span-CFG.box.half};
}
// Which basket a tap or a drop at (x,y) means. Neighbouring regions meet halfway across the gap, so there is no dead strip.
function basketAt(L,x,y){
  if(y<CFG.tapTop||y>H+40)return-1;
  const g=CFG.basketGap/2;
  for(const b of L.baskets)if(x>=b.x-g&&x<b.x+b.w+g)return b.i;
  return-1;
}

function create(opts){
  opts=opts||{};
  const aspect=clamp(opts.aspect||0.5625,0.45,1.9),W=H*aspect,rand=rng(opts.seed==null?1:opts.seed),L=layout(W);
  const s={W,H,aspect,L,t:0,phase:'play',herbs:[],nextSpawn:0.6,deck:[],last:-1,nextId:1,
    score:0,combo:0,bestCombo:0,filed:0,correct:0,wrong:0,missed:0,quick:0,
    perNature:NATURES.map(()=>({seen:0,ok:0})),slips:[],seen:HERBS.map(()=>0),
    cards:[],cardQueue:[],cardsShown:0,cardsDropped:0,peakLive:0,events:[],result:null};
  const emit=e=>{s.events.push(e);};
  const p=()=>clamp(s.t/CFG.round,0,1);

  function draw(){
    if(!s.deck.length){
      const d=HERBS.map((h,i)=>i);for(let i=d.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
      if(d[d.length-1]===s.last)[d[0],d[d.length-1]]=[d[d.length-1],d[0]];
      s.deck=d;
    }
    return s.last=s.deck.pop();
  }
  // x ranges no new herb may use: other herbs' columns and the columns of cards that are up or waiting for a slot
  function blocked(){
    const B=CFG.box.half,out=s.herbs.map(h=>[h.x-2*B-10,h.x+2*B+10]);
    for(const c of s.cards.concat(s.cardQueue.map(q=>sideRect(q.side))))out.push([c.x-B-CFG.card.pad,c.x+c.w+B+CFG.card.pad]);
    return out;
  }
  function spawn(){
    if(s.herbs.length>=CFG.maxLive)return false;
    const bl=blocked(),free=[];
    for(let x=L.laneMin;x<=L.laneMax+0.01;x+=8)if(bl.every(b=>x<b[0]||x>b[1]))free.push(x);
    if(!free.length)return false;
    const x=free[Math.floor(rand()*free.length)],k=draw(),T=lerp(CFG.fallTime[0],CFG.fallTime[1],p());
    s.herbs.push({id:s.nextId++,k,x,y:CFG.spawnY,vy:(CFG.missY-CFG.spawnY)/T,born:s.t,rot:(rand()-0.5)*0.3,wob:rand()*6.28,grabbed:false});
    s.seen[k]++;s.perNature[HERBS[k].nature].seen++;
    if(s.herbs.length>s.peakLive)s.peakLive=s.herbs.length;
    emit({type:'spawn',k,x});return true;
  }

  // ----- explanation cards (药签): never placed over a herb, nor in the path a falling herb will take while the card is up -----
  // narrow screens shrink the card so one herb in the middle of the lane can never block both sides at once
  // wide screens have room beside the lane, so the card grows there (up to 1.6x) and stays readable on a landscape phone
  const side=(W-L.span)/2-2*CFG.margin,cardK=side>=CFG.card.w?Math.min(1.6,side/CFG.card.w):1;
  const cardW=cardK>1?Math.floor(CFG.card.w*cardK):Math.min(CFG.card.w,Math.floor((W-2*CFG.margin)/2-CFG.box.half-CFG.card.pad-4));
  // a narrow card cannot get wider without blocking both sides at once, so it gets taller to keep its text readable
  const tall=cardK===1&&cardW<200,cardH=tall?CFG.card.tallH:Math.round(CFG.card.h*cardK);
  const cardYs=cardK>1?[Math.round(CFG.hudBottom+10+(CFG.basketTop-60-CFG.hudBottom-10-cardH)/2)]:tall?CFG.card.tallYs:CFG.card.ys;s.cardW=cardW;s.cardH=cardH;s.cardK=cardK;
  function sideRect(side,y){const x=side<0?CFG.margin:W-CFG.margin-cardW;return{x,y:y==null?cardYs[0]:y,w:cardW,h:cardH};}
  function clearOf(rect){
    const B=CFG.box,c=CFG.card;
    if(s.cards.some(o=>o.x<rect.x+rect.w&&rect.x<o.x+o.w))return false;
    for(const h of s.herbs){
      if(h.x+B.half+c.pad<=rect.x||h.x-B.half-c.pad>=rect.x+rect.w)continue;
      const yEnd=h.grabbed?h.y:Math.min(CFG.missY,h.y+h.vy*c.life);
      if(h.y-B.top-c.pad<rect.y+rect.h&&yEnd+B.bottom+c.pad>rect.y)return false;
    }
    return true;
  }
  function enqueueCard(h,chosen){
    const count=side=>{const rc=sideRect(side);return(s.cards.some(c=>c.x===rc.x)?100:0)+s.herbs.filter(o=>o!==h&&o.x+CFG.box.half>rc.x&&o.x-CFG.box.half<rc.x+rc.w).length;};
    const away=h.x<W/2?1:-1,side=count(-away)<count(away)?-away:away;
    s.cardQueue.push({k:h.k,chosen,x:h.x,at:s.t,id:h.id,side});
  }
  function placeCards(){
    for(let i=0;i<s.cardQueue.length;i++){
      const q=s.cardQueue[i];let placed=null;
      for(const side of[q.side,-q.side]){for(const y of cardYs){const rc=sideRect(side,y);if(clearOf(rc)){placed=rc;break;}}if(placed)break;}
      if(placed){s.cardQueue.splice(i--,1);const card=Object.assign({k:q.k,chosen:q.chosen,born:s.t,id:q.id},placed);s.cards.push(card);s.cardsShown++;emit({type:'card',card});}
      else if(s.t-q.at>CFG.card.maxWait){s.cardQueue.splice(i--,1);s.cardsDropped++;}
    }
  }

  function finish(){
    if(s.result)return;
    s.phase='over';s.herbs.length=0;s.cardQueue.length=0;
    s.result={score:s.score,filed:s.filed,correct:s.correct,wrong:s.wrong,missed:s.missed,bestCombo:s.bestCombo,quick:s.quick,
      accuracy:s.filed+s.missed?s.correct/(s.filed+s.missed):0,slips:s.slips.slice(),time:s.t};
    emit({type:'over'});
  }

  function step(dt){
    if(s.phase==='over')return;
    s.t+=dt;
    if(s.t>=CFG.round){finish();return;}
    if(s.t>=s.nextSpawn){
      if(spawn())s.nextSpawn=s.t+lerp(CFG.gap[0],CFG.gap[1],p())+rand()*CFG.gapJitter;
      else s.nextSpawn=s.t+0.2;
    }
    for(let i=0;i<s.herbs.length;i++){
      const h=s.herbs[i];if(h.grabbed)continue;
      h.y+=h.vy*dt;
      if(h.y>=CFG.missY){
        s.herbs.splice(i--,1);s.missed++;s.combo=0;s.slips.push({k:h.k,chosen:-1});
        enqueueCard(h,-1);emit({type:'drop',k:h.k,x:h.x,y:h.y,id:h.id});
      }
    }
    for(let i=s.cards.length-1;i>=0;i--)if(s.t-s.cards[i].born>=CFG.card.life)s.cards.splice(i,1);
    placeCards();
  }

  function fileHerb(h,b){
    const i=s.herbs.indexOf(h);if(i<0)return null;s.herbs.splice(i,1);
    const herb=HERBS[h.k],ok=herb.nature===b;s.filed++;
    if(ok){
      s.combo++;if(s.combo>s.bestCombo)s.bestCombo=s.combo;s.correct++;s.perNature[b].ok++;
      const quick=h.y<CFG.quickY,mult=multiplier(s.combo),pts=CFG.points*mult+(quick?CFG.quickBonus:0);if(quick)s.quick++;
      s.score+=pts;emit({type:'file',ok:true,k:h.k,b,x:h.x,y:h.y,id:h.id,pts,combo:s.combo,mult,quick});
    }else{
      s.combo=0;s.wrong++;s.slips.push({k:h.k,chosen:b});
      enqueueCard(h,b);emit({type:'file',ok:false,k:h.k,b,x:h.x,y:h.y,id:h.id,pts:0,combo:0,mult:1});
      placeCards();
    }
    return ok;
  }
  // the herb nearest the baskets (and not held by a finger) is the one a basket tap files
  const front=()=>{let best=null;for(const h of s.herbs)if(!h.grabbed&&s.t-h.born>=CFG.popIn&&(!best||h.y>best.y))best=h;return best;};
  function tapBasket(b){if(s.phase==='over'||b<0)return null;const h=front();return h?fileHerb(h,b):null;}
  function tapAt(x,y){return tapBasket(basketAt(L,x,y));}
  // dragging: pick up the herb under the finger, carry it, drop it on a basket (or anywhere else to let it fall again)
  function herbAt(x,y){let best=null,bd=1e9;for(const h of s.herbs){const d=Math.hypot(h.x-x,h.y-y);if(d<CFG.herbR*1.25&&d<bd){bd=d;best=h;}}return best;}
  function grab(x,y){if(s.phase==='over')return null;const h=herbAt(x,y);if(h){h.grabbed=true;h.gx=h.x;h.gy=h.y;}return h;}
  function carry(h,x,y){if(h&&h.grabbed){h.x=clamp(x,CFG.herbR*0.5,W-CFG.herbR*0.5);h.y=clamp(y,CFG.spawnY,H);}}
  function release(h,x,y){
    if(!h||!h.grabbed)return null;h.grabbed=false;
    const b=basketAt(L,x,y);if(b>=0&&s.herbs.includes(h))return fileHerb(h,b);
    // let go somewhere else: it goes back to its own column and keeps falling, no higher than where it was picked up
    h.x=h.gx;h.y=Math.max(h.gy,Math.min(h.y,CFG.missY-1));return null;
  }
  return{state:s,step,tapBasket,tapAt,grab,carry,release,finish};
}

// Autopilots for tests, fixed views and the recording.
//  precise: reacts quickly, always knows, taps the middle of the basket.
//  human:   reacts like a first-time player, knows about 3 in 4, taps a little off centre.
//  shaky:   same knowledge and reaction as human, but the hand shakes (taps land far off centre) and sometimes double-taps.
const PILOTS={
  precise:{react:[0.35,0],know:1,noise:[0,0],gap:[0.22,0],double:0},
  human:{react:[1.5,0.4],know:0.75,noise:[12,10],gap:[0.4,0.1],double:0},
  shaky:{react:[1.6,0.45],know:0.75,noise:[42,28],gap:[0.45,0.15],double:0.12}
};
function pilot(level,seed){
  const P=PILOTS[level];if(!P)throw new Error('unknown pilot '+level);
  const rand=rng(((seed==null?7:seed)*2654435761+level.length*97)>>>0),react=new Map(),pick=new Map();
  const gauss=()=>{let u=0;while(u===0)u=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(6.2831853*rand());};
  let next=0,again=null;
  const tap=(game,b)=>{const B=game.state.L.baskets[b];game.tapAt(B.cx+P.noise[0]*gauss(),B.cy+P.noise[1]*gauss());};
  return function(game){
    const s=game.state;if(s.phase==='over')return;
    if(again&&s.t>=again.at){const b=again.b;again=null;tap(game,b);}
    if(s.t<next)return;
    let h=null;for(const x of s.herbs)if(!x.grabbed&&(!h||x.y>h.y))h=x;
    if(!h)return;
    if(!react.has(h.id))react.set(h.id,Math.max(0.3,P.react[0]+P.react[1]*gauss()));
    if(s.t-h.born<react.get(h.id))return;
    if(!pick.has(h.id)){
      const n=HERBS[h.k].nature;let b=n;
      if(rand()>=P.know){const near=n^1;b=rand()<0.7?near:[0,1,2,3].filter(i=>i!==n&&i!==near)[Math.floor(rand()*2)];}
      pick.set(h.id,b);
    }
    const b=pick.get(h.id);tap(game,b);
    if(P.double&&rand()<P.double)again={at:s.t+0.12,b};
    next=s.t+Math.max(0.15,P.gap[0]+P.gap[1]*gauss());
  };
}
return{H,CFG,NATURES,HERBS,PILOTS,create,pilot,rng,layout,basketAt,multiplier};
});
