// 手撕日历 core: the paper sheet (position-based constraints, soft pins on the perforation),
// tearing, falling, plus the day model (almanac lookup, Cantonese saying of the day).
// No DOM, no drawing; runs in Node for tests. Every number is in SPEC.md and awaits human playtesting.
// Page space: unit page width, x right, y down from the perforation, z toward the viewer.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TearCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CFG={
  nx:13,ny:15,w:1,h:1.18,
  sub:3,iters:12,passes:2,
  stretch:1,shear:0.9,bend:0.35,
  pin:0.4,            // soft pin pull per iteration (fraction of the gap)
  breakDist:0.022,    // a pin breaks when its node is pulled this far from the hole
  breakGap:0.03,      // seconds between two breaks, so a hard yank still tears in steps
  breakTravel:0.018,  // the finger must keep moving this far per break: stop pulling and the tear stops
  tip:1.6,spin:0.9,   // on coming free the page tips toward the viewer and turns a little, so the air can catch it
  gust:2.2,gustHz:0.55, // side wind on a falling page: acceleration amplitude, cycles per second
  lagBreak:0.09,      // finger-to-paper gap that counts as a tearing pull (a plain lift stays under 0.04)
  grabR:0.17,grab:0.35,grabCap:0.03,
  gAttached:1.2,gFree:1.5,
  press:3.5,curl:4.5,          // attached paper leans back onto the stack (acceleration toward z=0)
  friction:0.55,frictionTorn:0.97,settle:0.02,   // a half-torn page left alone slides and droops on its remaining pins
      // in-plane velocity kept per substep while lying on the stack
  damp:0.992,zSoft:0.8,airNormal:6,airAll:0.8,
};

function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}

// ---------- the sheet ----------
function createSheet(opt){
  const o=Object.assign({},CFG,opt||{}),{nx,ny,w,h}=o,n=nx*ny;
  const P=new Float32Array(n*3),Q=new Float32Array(n*3),R=new Float32Array(n*3),N=new Float32Array(n*3);
  const dx=w/(nx-1),dy=h/(ny-1);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=(j*nx+i)*3;P[k]=R[k]=Q[k]=i*dx;P[k+1]=R[k+1]=Q[k+1]=j*dy;P[k+2]=R[k+2]=Q[k+2]=0;N[k+2]=1;}
  const cons=[];
  const add=(a,b,k,kind)=>{const ax=R[a*3]-R[b*3],ay=R[a*3+1]-R[b*3+1];cons.push({a,b,r:Math.hypot(ax,ay),k,kind});};
  const id=(i,j)=>j*nx+i;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    if(i+1<nx)add(id(i,j),id(i+1,j),o.stretch,'s');
    if(j+1<ny)add(id(i,j),id(i,j+1),o.stretch,'s');
    if(i+1<nx&&j+1<ny){add(id(i,j),id(i+1,j+1),o.shear,'d');add(id(i+1,j),id(i,j+1),o.shear,'d');}
    if(i+2<nx)add(id(i,j),id(i+2,j),o.bend,'b');
    if(j+2<ny)add(id(i,j),id(i,j+2),o.bend,'b');
  }
  const pins=[];for(let i=0;i<nx;i++)pins.push({node:i,ok:true,x:R[i*3]});
  const s={o,nx,ny,n,P,Q,R,N,cons,pins,broken:0,free:false,grab:null,target:[0,0,0],cool:0,travel:0,t:0,freeT:0,seed:Math.random()*6.28,events:[],order:[],maxStrain:0,maxStrainFree:0};
  s.grabAt=(u,v)=>grabAt(s,u,v);
  s.moveTo=(x,y,z)=>{const t=s.target;s.travel+=Math.hypot(x-t[0],y-t[1],z-t[2]);t[0]=x;t[1]=y;t[2]=z;};
  s.release=()=>{s.grab=null;};
  s.step=dt=>step(s,dt);
  return s;
}

// Pinch a small patch around the finger. Weights fall off as (1-d/R)^2; the patch keeps its layout and follows the finger.
function grabAt(s,u,v){
  const {P,n,o}=s,patch=[];
  for(let i=0;i<n;i++){
    const d=Math.hypot(P[i*3]-u,P[i*3+1]-v);
    if(d<o.grabR){const w=(1-d/o.grabR)**2;patch.push({i,w,ox:P[i*3]-u,oy:P[i*3+1]-v,oz:P[i*3+2]});}
  }
  if(!patch.length){let best=0,bd=1e9;for(let i=0;i<n;i++){const d=Math.hypot(P[i*3]-u,P[i*3+1]-v);if(d<bd){bd=d;best=i;}}patch.push({i:best,w:1,ox:0,oy:0,oz:0});}
  s.grab={patch,u,v};s.target[0]=u;s.target[1]=v;s.target[2]=0;s.travel=o.breakTravel;
  return patch.length;
}

function normals(s){
  const {P,N,nx,ny}=s;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const k=(j*nx+i)*3,l=(j*nx+Math.max(0,i-1))*3,r=(j*nx+Math.min(nx-1,i+1))*3,u=(Math.max(0,j-1)*nx+i)*3,d=(Math.min(ny-1,j+1)*nx+i)*3;
    const ax=P[r]-P[l],ay=P[r+1]-P[l+1],az=P[r+2]-P[l+2],bx=P[d]-P[u],by=P[d+1]-P[u+1],bz=P[d+2]-P[u+2];
    // a runs along +x, b along +y (down); a×b is +z, toward the viewer, for the flat sheet
    let cx=ay*bz-az*by,cy=az*bx-ax*bz,cz=ax*by-ay*bx;const m=Math.hypot(cx,cy,cz)||1;
    N[k]=cx/m;N[k+1]=cy/m;N[k+2]=cz/m;
  }
}

function step(s,dt){
  dt=Math.min(dt,1/30);
  const {o,P,Q,R,N,n,cons,pins}=s,sd=dt/o.sub;
  s.t+=dt;
  for(let it=0;it<o.sub;it++){
    normals(s);
    const g=s.free?o.gFree:o.gAttached;
    const wind=s.free?o.gust*Math.sin(s.freeT*6.2832*o.gustHz+s.seed)*Math.min(1,s.freeT*2):0;
    for(let i=0;i<n;i++){
      const k=i*3;
      let vx=(P[k]-Q[k])*o.damp,vy=(P[k+1]-Q[k+1])*o.damp,vz=(P[k+2]-Q[k+2])*o.damp;
      if(s.free){
        // air resists motion along the paper's normal much more than motion along it: that is what makes a leaf glide and flip
        const vn=vx*N[k]+vy*N[k+1]+vz*N[k+2],f=Math.min(1,o.airNormal*sd);
        vx-=N[k]*vn*f;vy-=N[k+1]*vn*f;vz-=N[k+2]*vn*f;
        const a=1-o.airAll*sd;vx*=a;vy*=a;vz*=a;
      }else if(P[k+2]<=0.0015){const f=s.broken&&!s.grab?o.frictionTorn:o.friction;vx*=f;vy*=f;}
      Q[k]=P[k];Q[k+1]=P[k+1];Q[k+2]=P[k+2];
      // a torn flap keeps a little of the curl it got while being pulled: lift the free top edge off the stack
      let curl=0;if(s.broken&&!s.free){const col=i%s.nx,row=(i-col)/s.nx;if(row<4&&!pins[col].ok)curl=o.curl*(1-row/4);}
      P[k]+=vx+wind*sd*sd;P[k+1]+=vy+g*sd*sd;P[k+2]+=vz+((s.free?0:-o.press)+curl)*sd*sd;
    }
    for(let r=0;r<o.iters;r++){
      // finger and pins first, the paper's own constraints last: the sheet gets the final word and does not stretch
      if(s.grab){
        const t=s.target;
        // a finger is not a vice: cap each correction so a far-off target cannot stretch the patch
        for(const p of s.grab.patch){const k=p.i*3,f=o.grab*p.w;
          let ex=(t[0]+p.ox-P[k])*f,ey=(t[1]+p.oy-P[k+1])*f,ez=(t[2]+p.oz-P[k+2])*f;
          const m=Math.hypot(ex,ey,ez),cap=o.grabCap*p.w*(s.free?0.45:1);if(m>cap){ex*=cap/m;ey*=cap/m;ez*=cap/m;}
          P[k]+=ex;P[k+1]+=ey;P[k+2]+=ez;}
      }
      for(const p of pins){if(!p.ok)continue;const k=p.node*3;
        P[k]+=(R[k]-P[k])*o.pin;P[k+1]+=(R[k+1]-P[k+1])*o.pin;P[k+2]+=(R[k+2]-P[k+2])*o.pin;}
      for(let pass=0;pass<o.passes;pass++)for(let c=0;c<cons.length;c++){
        const q=cons[c],a=q.a*3,b=q.b*3;
        const dx=P[b]-P[a],dy=P[b+1]-P[a+1],dz=P[b+2]-P[a+2],d=Math.hypot(dx,dy,dz)||1e-9;
        const m=(d-q.r)/d*0.5*q.k;
        P[a]+=dx*m;P[a+1]+=dy*m;P[a+2]+=dz*m;P[b]-=dx*m;P[b+1]-=dy*m;P[b+2]-=dz*m;
      }
      // an untorn page left alone slides back onto its place on the stack
      if(!s.grab&&!s.free&&s.broken===0)for(let i=0;i<n*3;i++)P[i]+=(R[i]-P[i])*o.settle;
      for(let i=0;i<n;i++){const k=i*3+2;if(P[k]<0)P[k]=0;else if(P[k]>o.zSoft)P[k]-=(P[k]-o.zSoft)*0.15;}
    }
    // strain on the yarn-free sheet: track the worst structural stretch for the tests
    for(const q of cons){if(q.kind!=='s')continue;const a=q.a*3,b=q.b*3;
      const e=Math.hypot(P[b]-P[a],P[b+1]-P[a+1],P[b+2]-P[a+2])/q.r-1;if(s.free){if(e>s.maxStrainFree)s.maxStrainFree=e;}else if(e>s.maxStrain){s.maxStrain=e;s.strainAt=[q.a,q.b];}}
    // how far the paper under the finger trails the finger: the felt tension of the pull
    if(s.grab){let lag=0,ws=0;const t=s.target;for(const p of s.grab.patch){const k=p.i*3;
        lag+=p.w*Math.hypot(t[0]+p.ox-P[k],t[1]+p.oy-P[k+1],t[2]+p.oz-P[k+2]);ws+=p.w;}s.lag=lag/ws;}else s.lag=0;
    s.cool-=sd;if(s.free)s.freeT+=sd;
    if(!s.free&&s.cool<=0&&(!s.grab||s.travel>=o.breakTravel)){
      // a page hanging by itself needs a harder load to tear than one being pulled
      let worst=null,wd=o.breakDist*(s.grab?1:1.8);
      // the finger pulling well past where the paper can follow also tears: the most loaded pin goes first
      const yank=s.grab&&s.lag>o.lagBreak;if(yank)wd=0;
      // while a finger pulls, the tear starts on its side, the way a hand peels a page
      const fx=s.grab?Math.max(0,Math.min(1,s.target[0])):0.5;let best=-1;
      for(const p of pins){if(!p.ok)continue;const k=p.node*3,d=Math.hypot(P[k]-R[k],P[k+1]-R[k+1],P[k+2]-R[k+2]);
        const score=s.grab?d*(1+2*(1-Math.abs(p.x-fx))):d;if(d>wd&&score>best){best=score;worst=p;}}
      if(yank&&worst){const k=worst.node*3;wd=Math.max(Math.hypot(P[k]-R[k],P[k+1]-R[k+1],P[k+2]-R[k+2]),o.breakDist*s.lag/o.lagBreak);}
      if(worst){
        worst.ok=false;s.broken++;s.order.push(pins.indexOf(worst));s.cool=o.breakGap;s.travel=0;
        s.events.push({type:'rip',pin:pins.indexOf(worst),x:worst.x,load:wd/o.breakDist});
        if(s.broken===pins.length){s.free=true;s.events.push({type:'free'});kick(s);}
      }
    }
  }
  normals(s);
  for(let i=0;i<P.length;i++)if(!Number.isFinite(P[i]))throw new Error('sheet went non-finite');
}

// Coming free: tip the top toward the viewer and turn the sheet a little in its plane.
function kick(s){
  const {P,Q,n,o}=s,c=centroid(s),sd=1/60/o.sub;
  for(let i=0;i<n;i++){const k=i*3,dy=P[k+1]-c[1],dx=P[k]-c[0];
    Q[k+2]-=-dy*o.tip*sd;Q[k]-=-dy*o.spin*sd*0.5;Q[k+1]-=dx*o.spin*sd*0.5;}
}
function bounds(s){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z1=0;const P=s.P;
  for(let i=0;i<s.n;i++){const k=i*3;x0=Math.min(x0,P[k]);x1=Math.max(x1,P[k]);y0=Math.min(y0,P[k+1]);y1=Math.max(y1,P[k+1]);z1=Math.max(z1,P[k+2]);}
  return{x0,x1,y0,y1,z1};}
function centroid(s){let x=0,y=0,z=0;for(let i=0;i<s.n;i++){x+=s.P[i*3];y+=s.P[i*3+1];z+=s.P[i*3+2];}return[x/s.n,y/s.n,z/s.n];}

// ---------- autopilot: a scripted finger, used by fixed views, the keyboard and tests ----------
// moves the pinch from (u,v,0) to (x,y,z) over `dur` seconds, then holds for `hold`.
function drive(s,from,to,dur,hold,dt,watch){
  dt=dt||1/60;s.grabAt(from[0],from[1]);
  const T=dur+(hold||0);let t=0;
  while(t<T){
    const k=Math.min(1,t/dur),e=k*k*(3-2*k);
    s.moveTo(from[0]+(to[0]-from[0])*e,from[1]+(to[1]-from[1])*e,(to[2]||0)*e);
    s.step(dt);t+=dt;if(watch)watch(s,t);
  }
  return s;
}
function run(s,secs,dt,watch){dt=dt||1/60;for(let t=0;t<secs;t+=dt){s.step(dt);if(watch)watch(s,t);}return s;}

// ---------- the day ----------
const SAYINGS=[
  ['食得是福','能吃就是福气，胃口好就是好日子'],
  ['心急食唔到热豆腐','心急吃不了热豆腐，慢慢来'],
  ['一样米养百样人','同样的米，养出各种各样的人'],
  ['有麝自然香','真有本事，不用自己吹'],
  ['船到桥头自然直','事情到了跟前，自然有办法'],
  ['慢慢嚟，比较快','慢慢来，反而更快'],
  ['唔怕慢，最怕站','不怕走得慢，就怕停下来'],
  ['饮啖汤先','先喝口汤，别着急'],
  ['得闲饮茶','有空一起喝茶'],
  ['好天斩埋落雨柴','晴天就把下雨天要烧的柴砍好：未雨绸缪'],
  ['有早知，冇乞儿','要是能早知道，就没人当乞丐了：后悔没有用'],
  ['冇咁大个头，唔好戴咁大顶帽','没那么大的头，别戴那么大的帽：量力而行'],
  ['赢粒糖，输间厂','赢了一颗糖，输掉一间厂：因小失大'],
  ['隔篱饭香','总觉得邻居家的饭更香'],
  ['天跌落嚟当被冚','天塌下来就当被子盖：用不着慌'],
  ['人有三衰六旺','人总有走运和倒霉的时候'],
  ['姜系老嘅辣','姜还是老的辣'],
  ['小心驶得万年船','小心谨慎，船才开得长久'],
  ['一理通，百理明','一个道理想通了，别的也跟着明白'],
  ['牛唔饮水唔撳得牛头低','牛不想喝水，按不下它的头：勉强不来'],
  ['讲就天下无敌，做就有心无力','说起来天下无敌，做起来有心无力'],
  ['有理唔怕讲','有道理就不怕说出来'],
  ['鸡同鸭讲','鸡跟鸭说话：说不到一块儿去'],
  ['执输行头，惨过败家','起步落在后头，比败家还惨：别拖'],
  ['一个铜钱敲唔响','一个铜钱敲不响：一个巴掌拍不响'],
  ['三岁定八十','三岁看到老'],
  ['十年唔逢一闰','十年都碰不上一回闰月：难得'],
  ['朝见口，晚见面','早晚都碰面：天天打照面的人'],
  ['唔经唔觉','不知不觉'],
  ['人情还人情，数还数','人情归人情，账要算清'],
  ['水浸眼眉','水淹到眉毛：火烧眉毛'],
  ['饮水思源','喝水不忘挖井人'],
  ['千拣万拣，拣着个烂灯盏','挑来挑去，挑了个破灯盏：太挑反而挑坏'],
  ['识食识叹','会吃，也会享受'],
  ['叹番杯茶','好好享受一杯茶'],
  ['有碗话碗，有碟话碟','有什么说什么，实话实说'],
  ['摸门钉','上门扑了个空'],
  ['执生','见机行事，随机应变'],
  ['搏到尽','拼尽全力'],
  ['好眉好貌生沙虱','外表好看，里头有毛病'],
  ['有姿势，冇实际','只有架势，没有实际'],
  ['猪笼入水','财源从四面八方流进来'],
  ['平安就系福','平平安安就是福'],
];
const SPECIAL={
  '冬至':['冬大过年','冬至比过年还要紧：广府人这天要回家吃饭'],
  '除夕':['年晚煎堆，人有我有','过年炸煎堆，别人家有，我家也有'],
  '春节':['猪笼入水','新年财源从四面八方流进来'],
};
const WEEK=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
const WEEK_EN=['SUN','MON','TUE','WED','THU','FRI','SAT'];

function parse(ymd){const [y,m,d]=ymd.split('-').map(Number);return Date.UTC(y,m-1,d);}
function ymdOf(ms){const t=new Date(ms);return t.getUTCFullYear()+'-'+String(t.getUTCMonth()+1).padStart(2,'0')+'-'+String(t.getUTCDate()).padStart(2,'0');}
function indexOf(A,ymd){const i=Math.round((parse(ymd)-parse(A.start))/864e5);return Math.max(0,Math.min(A.days.length-1,i));}
// Fixed shuffled cycle: no saying repeats within one pass through the list.
function sayingFor(A,i){
  const d=A.days[i];
  for(const k of [d.jq,...d.f])if(SPECIAL[k])return SPECIAL[k];
  const r=rng(20261128),order=SAYINGS.map((_,j)=>j);
  for(let j=order.length-1;j>0;j--){const k=Math.floor(r()*(j+1));[order[j],order[k]]=[order[k],order[j]];}
  return SAYINGS[order[i%order.length]];
}
function dayModel(A,i){
  const d=A.days[i],ms=parse(d.d),t=new Date(ms),wd=t.getUTCDay();
  const red=d.h==='休'||(d.h!=='班'&&(wd===0||wd===6));
  return{
    i,ymd:d.d,year:t.getUTCFullYear(),month:t.getUTCMonth()+1,day:t.getUTCDate(),
    week:WEEK[wd],weekEn:WEEK_EN[wd],red,
    lunar:(d.leap?'闰':'')+d.lm+d.ld,lunarMonth:(d.leap?'闰':'')+d.lm,lunarDay:d.ld,
    ganzhi:d.y+'年 '+d.m+'月 '+d.g+'日',yearGz:d.y,zodiac:d.z,
    term:d.jq,fest:d.f,holiday:d.h,holidayName:d.hn,
    yi:d.yi.length?d.yi:['诸事不宜'],ji:d.ji.length?d.ji:['无'],
    chong:'冲'+d.c,sha:'煞'+d.sha,
    saying:sayingFor(A,i),
    // remaining pages until the year's last page, for the stack thickness
    left:Math.round((Date.UTC(t.getUTCFullYear(),11,31)-ms)/864e5),
  };
}

return{CFG,rng,createSheet,grabAt,step,bounds,centroid,drive,run,SAYINGS,SPECIAL,dayModel,indexOf,parse,ymdOf,sayingFor};
});
