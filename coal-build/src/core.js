// 小黑煤球盖广州 rules: economy, upgrades, bricks, stages, events, the skill, hints and the screen layout.
// No DOM, no drawing; runs in Node for tests. Every number is in SPEC.md section 3 and awaits human playtesting.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CoalCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CFG={
  startBalls:3,startCap:5,trip:6,                 // seconds for one round trip, bricks per trip starts at 1
  tapGap:0.1,tapSecs:0.3,           // a tap lays at least this many seconds of the crew's output
  hire:{base:8,grow:1.22},shed:{base:25,grow:1.65,add:3},
  power:{base:18,grow:1.75,add:0.5},wage:{base:30,grow:1.8,add:0.3},
  skill:{first:25,cool:90,secs:20,min:30},
  event:{first:40,gap:[45,75],teaLife:10,teaCoinSecs:15,teaSpeed:1.5,teaBuff:15,windSpeed:2,windBuff:10,bricksSecs:10},
  stageBonus:0.1,lastShare:0.1,step:1/30
};
const KINDS=['hire','shed','power','wage'];
const LABEL={hire:'招煤球',shed:'扩工棚',power:'力气',wage:'工钱'};
function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const fmt=n=>{n=Math.floor(n);if(n<10000)return String(n);if(n<1e8)return (n/1e4).toFixed(n<1e5?2:1).replace(/\.?0+$/,'')+'万';return (n/1e8).toFixed(2).replace(/\.?0+$/,'')+'亿';};

// buildings: [{id,name,total,price,stages:[{name,upTo}],fact}]
function create(opts){
  opts=opts||{};
  const B=opts.buildings;if(!B||!B.length)throw new Error('create() needs buildings');
  const seed=opts.seed==null?1:opts.seed;
  const s={seed,t:0,phase:'play',coins:0,earned:0,bi:0,laid:0,frac:0,balls:CFG.startBalls,
    lv:{hire:0,shed:1,power:1,wage:1},lastTap:-9,taps:0,
    skillAt:CFG.skill.first,nextEventAt:CFG.event.first,eventN:0,event:null,buff:{mul:1,until:0,kind:null},
    stage:0,done:[],buildTimes:[],buildStart:0,
    stats:{tap:0,skill:0,tea:0,teaMissed:0,wind:0,bricks:0,stages:0,buy:{hire:0,shed:0,power:0,wage:0}},
    events:[]};
  const r=rng(seed*7919+13);
  const g={state:s,buildings:B};
  const cur=()=>B[s.bi];
  g.building=cur;
  g.cap=()=>CFG.startCap+(s.lv.shed-1)*CFG.shed.add;
  g.power=()=>1+(s.lv.power-1)*CFG.power.add;
  g.wageMul=()=>1+(s.lv.wage-1)*CFG.wage.add;
  g.speed=()=>s.t<s.buff.until?s.buff.mul:1;
  g.weight=()=>cur()&&cur().weight||1;                     // heavier bricks: a trip carries power/weight bricks
  g.rate=()=>s.balls*g.power()/g.weight()/CFG.trip*g.speed();   // bricks per second without taps
  g.coinPerBrick=()=>(cur()?cur().price:1)*g.wageMul();
  g.cost=k=>Math.ceil(k==='hire'?CFG.hire.base*Math.pow(CFG.hire.grow,s.lv.hire):CFG[k].base*Math.pow(CFG[k].grow,s.lv[k]-1));
  g.full=()=>s.balls>=g.cap();
  g.tapBricks=()=>Math.max(1,Math.round(Math.max(g.power()/g.weight(),g.rate()*CFG.tapSecs)));
  g.canBuy=k=>s.phase==='play'&&!(k==='hire'&&g.full())&&s.coins>=g.cost(k);
  g.remaining=()=>cur()?cur().total-s.laid:0;
  g.skillReady=()=>s.phase==='play'&&s.t>=s.skillAt;
  g.skillAmount=()=>Math.max(CFG.skill.min,Math.round(g.rate()*CFG.skill.secs));
  const emit=e=>{e.t=s.t;s.events.push(e);};
  function lay(n,src){
    if(s.phase!=='play'||n<=0)return 0;
    const b=cur();n=Math.min(n,b.total-s.laid);if(n<=0)return 0;
    const from=s.laid;s.laid+=n;
    const c=n*g.coinPerBrick();s.coins+=c;s.earned+=c;
    emit({type:'lay',from,n,src,coins:c});
    while(s.stage<b.stages.length&&s.laid>=b.stages[s.stage].upTo){
      const st=b.stages[s.stage],prev=s.stage?b.stages[s.stage-1].upTo:0;
      const bonus=Math.round((st.upTo-prev)*b.price*CFG.stageBonus*g.wageMul());
      s.coins+=bonus;s.earned+=bonus;s.stats.stages++;
      emit({type:'stage',index:s.stage,name:st.name,bonus});s.stage++;
    }
    if(s.laid>=b.total){s.phase='done';s.buildTimes.push(s.t-s.buildStart);s.done.push(b.id);s.event=null;emit({type:'built',id:b.id,name:b.name});}
    return n;
  }
  g.tap=function(){
    if(s.phase!=='play'||s.t-s.lastTap<CFG.tapGap-1e-9)return false;
    s.lastTap=s.t;s.taps++;s.stats.tap++;lay(g.tapBricks(),'tap');return true;
  };
  g.buy=function(k){
    if(!g.canBuy(k))return false;
    s.coins-=g.cost(k);s.lv[k]++;s.stats.buy[k]++;
    if(k==='hire')s.balls++;
    emit({type:'buy',kind:k,lv:s.lv[k]});return true;
  };
  g.useSkill=function(){
    if(!g.skillReady())return false;
    const n=g.skillAmount();s.skillAt=s.t+CFG.skill.cool;s.stats.skill++;
    emit({type:'skill',n});lay(n,'skill');return true;
  };
  g.collect=function(){
    const e=s.event;if(!e||e.kind!=='tea'||s.phase!=='play')return false;
    const c=Math.round(g.rate()*CFG.event.teaCoinSecs*g.coinPerBrick())+5;
    s.coins+=c;s.earned+=c;s.buff={mul:CFG.event.teaSpeed,until:s.t+CFG.event.teaBuff,kind:'tea'};
    s.event=null;s.stats.tea++;emit({type:'tea',coins:c});return true;
  };
  g.next=function(){                  // after a building is done: file it in the album and open the next one
    if(s.phase!=='done')return false;
    s.bi++;s.laid=0;s.frac=0;s.stage=0;s.buildStart=s.t;
    if(s.bi>=B.length){s.phase='album';emit({type:'album'});}
    else{s.phase='play';s.skillAt=Math.min(s.skillAt,s.t+10);s.nextEventAt=Math.max(s.nextEventAt,s.t+20);emit({type:'open',id:cur().id});}
    return true;
  };
  function startEvent(){
    s.eventN++;
    const roll=r(),kind=s.eventN===1?'tea':roll<0.45?'tea':roll<0.75?'wind':'bricks';
    if(kind==='tea'){s.event={kind,start:s.t,end:s.t+CFG.event.teaLife,dir:r()<0.5?1:-1};emit({type:'event',kind});}
    else if(kind==='wind'){s.buff={mul:CFG.event.windSpeed,until:s.t+CFG.event.windBuff,kind:'wind'};s.stats.wind++;emit({type:'event',kind});}
    else{const n=Math.max(8,Math.round(g.rate()*CFG.event.bricksSecs));s.stats.bricks++;emit({type:'event',kind,n});lay(n,'event');}
    s.nextEventAt=s.t+CFG.event.gap[0]+r()*(CFG.event.gap[1]-CFG.event.gap[0]);
  }
  g.step=function(dt){
    if(s.phase!=='play'){s.t+=dt;return;}         // the clock runs (cooldowns tick) while a result card is open
    s.t+=dt;
    s.frac+=g.rate()*dt;
    const n=Math.floor(s.frac);if(n>0){s.frac-=n;lay(n,'balls');}
    if(s.event&&s.t>=s.event.end){s.event=null;s.stats.teaMissed++;emit({type:'eventGone',kind:'tea'});}
    if(s.phase==='play'&&!s.event&&s.t>=s.nextEventAt)startEvent();
  };
  g.hint=function(){return hint(g);};
  g.goal=function(){
    const b=cur();if(!b)return{text:'三栋都盖好了',last:false,stageName:'',stageDone:0,stageSize:0,stageUpTo:0,progress:1};const rem=b.total-s.laid;
    const st=b.stages[Math.min(s.stage,b.stages.length-1)],prev=s.stage?b.stages[Math.min(s.stage,b.stages.length)-1].upTo:0;
    return{text:rem<=0?'盖好了！':rem<=Math.ceil(b.total*CFG.lastShare)?`最后 ${rem} 块！`:`还剩 ${rem} 块`,last:rem<=Math.ceil(b.total*CFG.lastShare),
      stageName:st.name,stageDone:Math.max(0,Math.min(s.laid,st.upTo)-prev),stageSize:st.upTo-prev,stageUpTo:st.upTo,
      progress:s.laid/b.total};
  };
  g.save=function(){const o=JSON.parse(JSON.stringify(s));delete o.events;o.v=1;return o;};
  g.load=function(o){
    if(!o||o.v!==1||typeof o.coins!=='number'||!o.lv||o.bi>B.length)return false;
    for(const k of Object.keys(s))if(k!=='events'&&o[k]!==undefined)s[k]=o[k];
    s.event=null;if(s.phase==='title')s.phase='play';return true;
  };
  return g;
}

function hint(g){
  const s=g.state;
  if(s.phase==='done')return{text:'盖好了！点下面的按钮收进图鉴',target:'next'};
  if(s.phase!=='play')return{text:'',target:null};
  if(s.event&&s.event.kind==='tea')return{text:'糖水担来了！点它，煤球喝了跑得快',target:'event'};
  if(s.taps<5&&s.t<60)return{text:'点楼，帮煤球砌一块',target:'building'};
  if(g.skillReady())return{text:'「齐心一砌」好了，点左边圆钮',target:'skill'};
  if(g.full()&&g.canBuy('shed'))return{text:'工棚住满了，点「扩工棚」',target:'shed'};
  if(g.canBuy('hire'))return{text:'人手不够，点「招煤球」',target:'hire'};
  if(g.canBuy('power'))return{text:g.weight()>1?`这里的砖重 ×${g.weight()}，升「力气」搬得动`:'升「力气」，一趟多搬半块',target:'power'};
  if(g.canBuy('wage'))return{text:'升「工钱」，每块赚更多',target:'wage'};
  if(g.full()&&!g.canBuy('shed'))return{text:`工棚住满了，「扩工棚」还差 ${fmtNeed(g,'shed')}`,target:null};
  const k=cheapest(g);return{text:`攒工钱中，「${LABEL[k]}」还差 ${fmtNeed(g,k)}，点楼也能砌`,target:null};
}
const fmtNeed=(g,k)=>fmt(Math.max(1,Math.ceil(g.cost(k)-g.state.coins)));
function cheapest(g){let best=null;for(const k of KINDS){if(k==='hire'&&g.full())continue;if(best==null||g.cost(k)<g.cost(best))best=k;}return best;}

// what a card's price pill says: {kind:'buy'|'short'|'full'|'idle', lead, cost}
const num=v=>Math.abs(v-Math.round(v))<1e-6?String(Math.round(v)):v.toFixed(1);
function cardLabel(g,k){
  const s=g.state;
  if(k==='hire'&&g.full())return{kind:'full',lead:'工棚住满了',cost:null};
  const p=g.power(),cpb=g.coinPerBrick(),price=g.building()?g.building().price:1;
  const eff=k==='hire'?'+1 只':k==='shed'?'+3 床位':k==='power'?`一趟 ${num(p)}→${num(p+CFG.power.add)} 块`:`每块 ${num(cpb)}→${num(price*(g.wageMul()+CFG.wage.add))}`;
  const cost=g.cost(k);
  if(s.phase!=='play')return{kind:'idle',lead:eff,cost};
  if(s.coins>=cost)return{kind:'buy',lead:eff,cost};
  return{kind:'short',lead:`还差 ${fmt(Math.ceil(cost-s.coins))} 工钱`,cost:null};
}

// Autopilot players for tests and fixed views. level: 'normal' (taps 1.5/s, buys late and picks at random), 'idle' (never taps, shops every 20 s)
function pilot(level,seed){
  const r=rng(seed*31+7);let nextTap=0,nextShop=level==='idle'?20:2,nextSkill=null,teaAt=null,nextAt=null;
  const gauss=()=>{let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  return function(g){
    const s=g.state;
    if(s.phase==='done'){if(nextAt==null)nextAt=s.t+3;if(s.t>=nextAt){nextAt=null;g.next();}return;}
    if(s.phase!=='play')return;
    if(level==='normal'){
      if(s.t>=nextTap){g.tap();const rate=s.t-s.buildStart<120?1.5:0.6;nextTap=s.t+Math.max(0.12,(1/rate)*(1+0.3*gauss()));}
      if(s.event&&s.event.kind==='tea'){if(teaAt==null)teaAt=s.t+1.5+r()*3+(r()<0.25?20:0);if(s.t>=teaAt){g.collect();teaAt=null;}}else teaAt=null;
    }
    if(g.skillReady()){if(nextSkill==null)nextSkill=s.t+(level==='idle'?Math.max(0,nextShop-s.t):2+r()*4);if(s.t>=nextSkill){g.useSkill();nextSkill=null;}}
    if(s.t>=nextShop){
      if(level==='idle'){let k;while((k=cheapestBuyable(g)))g.buy(k);nextShop=s.t+20;}
      else{const ok=KINDS.filter(k=>g.canBuy(k));if(ok.length){const h=g.hint();const pick=ok.includes(h.target)&&r()<0.6?h.target:ok[Math.floor(r()*ok.length)];g.buy(pick);}nextShop=s.t+3*(0.6+0.8*r());}
    }
  };
}
function cheapestBuyable(g){let best=null;for(const k of KINDS)if(g.canBuy(k)&&(best==null||g.cost(k)<g.cost(best)))best=k;return best;}
function run(buildings,seed,level,opts){
  opts=opts||{};const g=create({buildings,seed}),pl=level?pilot(level,seed):null;
  const until=opts.until||(st=>st.phase==='album'),limit=opts.limit||3600*2;
  while(!until(g.state,g)&&g.state.t<limit){if(pl)pl(g);g.step(CFG.step);if(opts.watch)opts.watch(g.state,g);g.state.events.length=0;}
  return g;
}

// Screen layout in CSS pixels. aspect = building image width / height. Everything the player can tap is a rect here.
function layout(w,h,aspect,safeB){
  safeB=safeB||0;const pad=10,gap=8,cardH=74;
  const top={x:0,y:0,w,h:52},goal={x:0,y:52,w,h:50};
  const cardsTop=h-safeB-pad-cardH*2-gap;
  const cw=(w-pad*2-gap)/2;
  const cards=['hire','shed','power','wage'].map((k,i)=>({kind:k,x:pad+(i%2)*(cw+gap),y:cardsTop+Math.floor(i/2)*(cardH+gap),w:cw,h:cardH}));
  const stage={x:0,y:102,w,h:cardsTop-8-102};
  const ground=stage.y+stage.h-22;
  let bh=(ground-stage.y-14)*0.92,bw=bh*aspect;
  if(bw>w*0.86){bw=w*0.86;bh=bw/aspect;}
  const bx=(w-bw)/2+(w-bw>150?18:0),building={x:bx,y:ground-bh,w:bw,h:bh};
  const skill={x:8,y:stage.y+8,w:64,h:64};
  const album={x:w-50,y:4,w:44,h:44};
  const ov={w:Math.min(w-32,360)};ov.x=(w-ov.w)/2;
  const button={x:(w-220)/2,y:h-safeB-pad-56-24,w:220,h:56},noteY=cardsTop-11;
  return{w,h,top,goal,stage,ground,building,skill,album,cards,button,noteY,overlay:ov,pile:{x:Math.max(6,bx-58),y:ground-26,w:46,h:26}};
}
// where the 糖水 cart is right now (tap target), or null
function eventRect(L,s){
  const e=s.event;if(!e||e.kind!=='tea')return null;
  return eventParts(L,s).hit;
}
function eventParts(L,s){
  const e=s.event;if(!e||e.kind!=='tea')return null;
  const p=Math.min(1,Math.max(0,(s.t-e.start)/(e.end-e.start))),span=L.w-16-84;
  const x=e.dir>0?8+span*p:L.w-8-84-span*p;          // left edge of the whole thing
  const cart={x:x+8,y:L.ground-52,w:68,h:56},bubble={x:x+2,y:L.ground-90,w:80,h:24};
  return{cart,bubble,hit:{x,y:L.ground-94,w:84,h:98}};
}
function placeLabel(L,lineY,w,avoid){
  const R=L.building,above=Math.max(L.stage.y+2,lineY-24),below=Math.min(L.ground-22,lineY+4);
  const right=Math.max(4,Math.min(L.w-w-4,R.x+R.w-w+8)),left=Math.max(4,Math.min(L.w-w-4,R.x-8)),higher=Math.max(L.stage.y+2,lineY-48);
  const ys=[above,below,higher,...(avoid||[]).filter(Boolean).map(r=>Math.max(L.stage.y+2,r.y-24))];
  const xs=[right,left,L.w-w-4,4],cands=[];for(const y of ys)for(const x of xs)cands.push({x,y,w,h:20});
  for(const c of cands)if(!(avoid||[]).some(a=>a&&overlaps(a,c))&&!overlaps(c,L.skill))return c;
  return cands[0];
}
function overlaps(a,b){return a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;}

return{CFG,KINDS,LABEL,create,pilot,run,layout,eventRect,eventParts,placeLabel,cardLabel,overlaps,rng,fmt,hint};
});
