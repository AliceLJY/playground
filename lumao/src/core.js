// 撸猫撸了一手毛 core: the fur state map (direction, messiness, loose hair), the brush that writes it,
// the spring under the finger, the cat's mood, and the hair stuck on the hand.
// No DOM, no drawing; runs in Node for tests. Every number is in SPEC.md and awaits human playtesting.
// Body space: x right, y down (head at small y, tail at large y), unit = body length; x runs 0..aspect.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LumaoCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CFG={
  nx:56,ny:100,aspect:0.56,     // the map: 56×100 texels over a body box 0.56 wide, 1 long
  R:0.08,                       // brush radius (body lengths)
  comb:9,                       // how fast a stroke turns hair toward its own direction, per body length under full weight
  smooth:7,ruffle:6,across:1.2, // messiness change per body length: down with the grain, up against it, a little up across it
  pick:0.35,                    // loose hair picked up per body length under full weight
  lift:1.6,looseCap:1,          // going against the grain loosens undercoat
  hairsPerUnit:0.65,            // hairs on the hand per unit of loose fur taken off the map (summed over texels): about 5 per stroke
  relaxMess:25,relaxDir:40,     // seconds: untouched fur slowly settles back
  baseMess:0.14,
  trailN:8,trailTau:0.12,trailHz:3.2,minMove:0.004,
  // mood
  contentGain:0.45,contentDecay:0.06,contentHold:1.2,happyOn:0.8,happyOff:0.45,
  annoyGain:1.2,annoyDecay:0.15,lookOn:0.5,lookOff:0.25,lookMin:1.2,
  overWith:0.08,overAgainst:0.35,overAcross:0.15,overRest:0.1,overRestWarn:0.2,restAfter:0.4,
  warnOn:0.7,biteAt:1.0,warnMin:1.5,biteDur:0.9,biteLock:0.6,lickDur:1.6,biteCool:4,
};

function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}

// Natural grain: from the head toward the tail, splaying a little away from the spine.
function defaultFlow(x,y,o){const sx=(x/o.aspect-0.5)*0.7;const m=Math.hypot(sx,1);return[sx/m,1/m];}

// ---------- the fur map ----------
function createFur(opt){
  const o=Object.assign({},CFG,opt||{}),{nx,ny}=o,n=nx*ny,r=rng(o.seed||7);
  const flow=o.flow||defaultFlow,mask=o.mask||(()=>1);
  const F=new Float32Array(n*2),D=new Float32Array(n*2),M=new Float32Array(n),L=new Float32Array(n),K=new Float32Array(n);
  const cell=o.aspect/nx;   // texels are square: ny*cell should be ~1
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const k=j*nx+i,x=(i+0.5)*cell,y=(j+0.5)/ny,f=flow(x,y,o),inside=mask(x,y);
    K[k]=inside;F[k*2]=f[0];F[k*2+1]=f[1];
    const a=(r()-0.5)*0.5;const c=Math.cos(a),s=Math.sin(a);
    D[k*2]=f[0]*c-f[1]*s;D[k*2+1]=f[0]*s+f[1]*c;
    M[k]=inside?o.baseMess+r()*0.1:0;
    L[k]=inside?0.45+r()*0.4:0;
  }
  const fur={o,nx,ny,n,cell,F,D,M,L,K,picked:0,lifted:0,looseStart:0,trail:[],t:0,lastMove:-1e9,dirty:null,
    hand:{hairs:0,acc:0,total:0},events:[]};
  for(let i=0;i<n;i++)fur.looseStart+=L[i];
  return fur;
}
const idx=(fur,x,y)=>{const i=Math.floor(x/fur.cell),j=Math.floor(y*fur.ny);return(i<0||j<0||i>=fur.nx||j>=fur.ny)?-1:j*fur.nx+i;};
const texel=(fur,k)=>[((k%fur.nx)+0.5)*fur.cell,(Math.floor(k/fur.nx)+0.5)/fur.ny];

// Average grain under the brush: decides whether a stroke goes with or against the fur.
function grainAt(fur,x,y){
  let gx=0,gy=0;const R=fur.o.R;
  forDisc(fur,x,y,R,(k,w)=>{if(fur.K[k]){gx+=fur.F[k*2]*w;gy+=fur.F[k*2+1]*w;}});
  const m=Math.hypot(gx,gy);return m?[gx/m,gy/m]:null;
}
function forDisc(fur,x,y,R,cb){
  const {nx,ny,cell}=fur,i0=Math.max(0,Math.floor((x-R)/cell)),i1=Math.min(nx-1,Math.floor((x+R)/cell)),
    j0=Math.max(0,Math.floor((y-R)*ny)),j1=Math.min(ny-1,Math.floor((y+R)*ny));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const tx=(i+0.5)*cell,ty=(j+0.5)/ny,d=Math.hypot(tx-x,ty-y);if(d<R)cb(j*nx+i,(1-d/R)**2,d);}
}

// One finger move from (x0,y0) to (x1,y1). Writes only texels within R of the segment end-region it sweeps.
// Returns {kind, len, picked(hairs)}; kind is 'with' | 'against' | 'across' | 'off' (not on the cat) | 'still'.
function stroke(fur,x0,y0,x1,y1){
  const o=fur.o,dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy);
  if(len<1e-6)return{kind:'still',len:0,picked:0};
  // long jumps are cut into brush-sized steps so a fast swipe writes a continuous track
  const steps=Math.max(1,Math.ceil(len/(o.R*0.4)));let kind=null,picked=0,on=0;
  const ux=dx/len,uy=dy/len,sl=len/steps;
  for(let s=0;s<steps;s++){
    const cx=x0+dx*(s+1)/steps,cy=y0+dy*(s+1)/steps,g=grainAt(fur,cx,cy);
    if(!g)continue;on++;
    const dot=ux*g[0]+uy*g[1],k=dot>0.3?'with':dot<-0.3?'against':'across';
    if(!kind||k==='against')kind=k;   // a stroke that went against the grain anywhere counts as against
    forDisc(fur,cx,cy,o.R,(t,w)=>{
      if(!fur.K[t])return;
      const a=w*sl;
      // direction: with the grain or across, hair follows the hand; against it, hair flips up and over (pointing back at the hand)
      const tx=ux,ty=uy,c=Math.min(1,o.comb*a);
      let qx=fur.D[t*2]*(1-c)+tx*c,qy=fur.D[t*2+1]*(1-c)+ty*c;const m=Math.hypot(qx,qy)||1;fur.D[t*2]=qx/m;fur.D[t*2+1]=qy/m;
      if(k==='with')fur.M[t]=Math.max(0,fur.M[t]-o.smooth*a);
      else if(k==='against'){fur.M[t]=Math.min(1,fur.M[t]+o.ruffle*a);const add=Math.min(o.looseCap-fur.L[t],o.lift*a*0.25);if(add>0){fur.L[t]+=add;fur.lifted+=add;}}
      else fur.M[t]=Math.min(1,fur.M[t]+o.across*a);
      const p=Math.min(fur.L[t],o.pick*a);fur.L[t]-=p;picked+=p;
      markDirty(fur,t);
    });
  }
  if(!on)return{kind:'off',len,picked:0};
  // hair accounting: every bit of loose fur taken off the map goes onto the hand
  fur.picked+=picked;const h=fur.hand;h.acc+=picked*o.hairsPerUnit;const whole=Math.floor(h.acc);h.acc-=whole;h.hairs+=whole;h.total+=whole;
  // the live spring under the finger: remember where the hand just was
  fur.trail.push({x:x1,y:y1,vx:ux,vy:uy,t:fur.t});if(fur.trail.length>o.trailN)fur.trail.shift();
  fur.lastMove=fur.t;
  return{kind,len,picked:whole};
}
function markDirty(fur,k){const i=k%fur.nx,j=(k-i)/fur.nx,d=fur.dirty;if(!d)fur.dirty={i0:i,i1:i,j0:j,j1:j};else{if(i<d.i0)d.i0=i;if(i>d.i1)d.i1=i;if(j<d.j0)d.j0=j;if(j>d.j1)d.j1=j;}}

// Untouched fur settles back toward its grain over tens of seconds (so a round can be played again).
function relax(fur,dt){
  const o=fur.o,km=dt/o.relaxMess,kd=dt/o.relaxDir;fur.t+=dt;
  for(let k=0;k<fur.n;k++){if(!fur.K[k])continue;
    fur.M[k]+=(o.baseMess-fur.M[k])*km;
    let qx=fur.D[k*2]+(fur.F[k*2]-fur.D[k*2])*kd,qy=fur.D[k*2+1]+(fur.F[k*2+1]-fur.D[k*2+1])*kd;const m=Math.hypot(qx,qy)||1;fur.D[k*2]=qx/m;fur.D[k*2+1]=qy/m;}
  fur.dirty={i0:0,i1:fur.nx-1,j0:0,j1:fur.ny-1};
}

// How far the hair at (x,y) is bent right now by the finger and its trail: a damped spring that rings twice.
function liveBend(fur,x,y){
  const o=fur.o;let bx=0,by=0;
  for(const p of fur.trail){const age=fur.t-p.t,d=Math.hypot(x-p.x,y-p.y);if(d>=o.R*1.4)continue;
    const w=(1-d/(o.R*1.4))**2,a=Math.exp(-age/o.trailTau)*Math.cos(6.2832*o.trailHz*age)*w;bx+=p.vx*a;by+=p.vy*a;}
  return[bx,by];
}
function liveMax(fur){let m=0;for(const p of fur.trail)m=Math.max(m,Math.exp(-(fur.t-p.t)/fur.o.trailTau));return m;}

// Shine is not stored: it is flat, combed fur lying along its own grain.
function shineAt(fur,k){if(!fur.K[k])return 0;const al=fur.D[k*2]*fur.F[k*2]+fur.D[k*2+1]*fur.F[k*2+1];return Math.max(0,al)**4*(1-fur.M[k])**2;}

// The cat's own tongue: after a bite she licks the messiest patch smooth.
function groom(fur,amount){
  for(let k=0;k<fur.n;k++){if(!fur.K[k])continue;fur.M[k]*=1-amount;
    let qx=fur.D[k*2]+(fur.F[k*2]-fur.D[k*2])*amount,qy=fur.D[k*2+1]+(fur.F[k*2+1]-fur.D[k*2+1])*amount;const m=Math.hypot(qx,qy)||1;fur.D[k*2]=qx/m;fur.D[k*2+1]=qy/m;}
  fur.dirty={i0:0,i1:fur.nx-1,j0:0,j1:fur.ny-1};
}

// ---------- the hand ----------
const HAND_LEVELS=[[0,'干净'],[1,'几根'],[10,'一层'],[40,'毛手套'],[100,'毛茸茸大爪']];
function handLevel(h){let l=0;for(let i=0;i<HAND_LEVELS.length;i++)if(h.hairs>=HAND_LEVELS[i][0])l=i;return l;}
function clap(fur){const n=fur.hand.hairs;fur.hand.hairs=0;fur.events.push({type:'clap',hairs:n,t:fur.t});return n;}

// ---------- the cat ----------
function createCat(opt){
  const o=Object.assign({},CFG,opt||{});
  return{o,content:0,annoy:0,over:0,state:'idle',stateT:0,warnT:0,lookT:0,lastStroke:-1e9,t:0,biteCool:0,locked:0,bites:0,events:[],look:false,happy:false};
}
// Feed one stroke result into the mood.
function feel(cat,res){
  if(!res||res.kind==='still'||res.kind==='off')return;
  const o=cat.o,L=res.len;cat.lastStroke=cat.t;
  if(cat.state==='bite'||cat.state==='lick')return;
  if(res.kind==='with'){cat.content+=L*o.contentGain;cat.annoy=Math.max(0,cat.annoy-L*0.5);cat.over+=L*o.overWith;}
  else if(res.kind==='against'){cat.annoy+=L*o.annoyGain;cat.content=Math.max(0,cat.content-L*0.8);cat.over+=L*o.overAgainst;}
  else{cat.over+=L*o.overAcross;}
  cat.content=Math.min(cat.content,1.6);cat.annoy=Math.min(cat.annoy,1.5);
  // a bite only ever comes out of a stroke, and only after the warning has been on long enough to be seen
  if(cat.state==='warn'&&cat.warnT>=o.warnMin&&cat.over>=o.biteAt&&cat.biteCool<=0)setState(cat,'bite');
}
function setState(cat,s){if(cat.state===s)return;cat.state=s;cat.stateT=0;cat.events.push({type:s,t:cat.t});
  if(s==='bite'){cat.bites++;cat.locked=cat.o.biteLock;}
  if(s==='warn')cat.warnT=0;}
function tick(cat,dt,fur){
  const o=cat.o;cat.t+=dt;cat.stateT+=dt;cat.biteCool=Math.max(0,cat.biteCool-dt);cat.locked=Math.max(0,cat.locked-dt);
  const resting=cat.t-cat.lastStroke>o.restAfter;
  // contentment only fades once the hand has been away a moment: slow, long strokes are what cats like best
  if(cat.t-cat.lastStroke>o.contentHold)cat.content=Math.max(0,cat.content-o.contentDecay*dt);cat.annoy=Math.max(0,cat.annoy-o.annoyDecay*dt);
  if(resting)cat.over=Math.max(0,cat.over-(cat.state==='warn'?o.overRestWarn:o.overRest)*dt);
  if(cat.state==='bite'){if(cat.stateT>=o.biteDur)setState(cat,'lick');return;}
  if(cat.state==='lick'){if(cat.stateT>=o.lickDur){if(fur)groom(fur,0.55);cat.over=0.2;cat.content=0.3;cat.annoy=0;cat.biteCool=o.biteCool;setState(cat,'idle');}return;}
  // looking back: on when annoyed, held at least lookMin
  if(cat.annoy>=o.lookOn&&!cat.look){cat.look=true;cat.lookT=0;cat.events.push({type:'look',t:cat.t});}
  if(cat.look){cat.lookT+=dt;if(cat.annoy<o.lookOff&&cat.lookT>=o.lookMin)cat.look=false;}
  if(cat.content>=o.happyOn)cat.happy=true;else if(cat.content<o.happyOff)cat.happy=false;
  if(cat.state==='warn'){cat.warnT+=dt;if(cat.over<o.warnOn*0.85)setState(cat,cat.happy?'happy':'idle');return;}
  if(cat.over>=o.warnOn){setState(cat,'warn');return;}
  setState(cat,cat.look?'look':cat.happy?'happy':'idle');
}

// ---------- a petting session (finger + fur + cat), for tests and the fixed views ----------
function createSession(opt){
  const fur=createFur(opt),cat=createCat(opt);
  const s={fur,cat,finger:null,t:0,log:[]};
  s.down=(x,y)=>{s.finger={x,y};};
  s.move=(x,y)=>{
    if(!s.finger)return null;
    if(cat.locked>0){s.finger={x,y};return null;}            // just got bitten: the hand flinches, nothing is written
    const f=s.finger;if(Math.hypot(x-f.x,y-f.y)<fur.o.minMove)return null;
    const r=stroke(fur,f.x,f.y,x,y);s.finger={x,y};feel(cat,r);s.log.push(Object.assign({t:s.t},r));return r;
  };
  s.up=()=>{s.finger=null;};
  s.step=dt=>{s.t+=dt;relax(fur,dt);tick(cat,dt,fur);};
  return s;
}
// Stroke along a path: from→to over dur seconds, at 60 Hz; returns the session.
function petLine(s,from,to,dur,dt){
  dt=dt||1/60;s.down(from[0],from[1]);
  for(let t=dt;t<=dur+1e-9;t+=dt){const k=t/dur,e=k*k*(3-2*k);s.move(from[0]+(to[0]-from[0])*e,from[1]+(to[1]-from[1])*e);s.step(dt);}
  s.up();return s;
}
function rest(s,secs,dt){dt=dt||1/60;for(let t=0;t<secs;t+=dt)s.step(dt);return s;}

// Region statistics, for tests and the probe.
function regionStats(fur,x0,y0,x1,y1){
  let n=0,mess=0,align=0,shine=0,loose=0;
  for(let k=0;k<fur.n;k++){if(!fur.K[k])continue;const[x,y]=texel(fur,k);if(x<x0||x>x1||y<y0||y>y1)continue;
    n++;mess+=fur.M[k];align+=fur.D[k*2]*fur.F[k*2]+fur.D[k*2+1]*fur.F[k*2+1];shine+=shineAt(fur,k);loose+=fur.L[k];}
  return n?{n,mess:mess/n,align:align/n,shine:shine/n,loose:loose/n}:{n:0,mess:0,align:0,shine:0,loose:0};
}
function looseTotal(fur){let t=0;for(let k=0;k<fur.n;k++)t+=fur.L[k];return t;}

// Pack the map into RGBA bytes for a texture: R,G = direction (−1..1 → 0..255), B = messiness, A = loose.
function packRGBA(fur,out){
  out=out||new Uint8Array(fur.n*4);
  for(let k=0;k<fur.n;k++){const p=k*4;out[p]=Math.round((fur.D[k*2]*0.5+0.5)*255);out[p+1]=Math.round((fur.D[k*2+1]*0.5+0.5)*255);
    out[p+2]=Math.round(fur.M[k]*255);out[p+3]=Math.round(Math.min(1,fur.L[k])*255);}
  return out;
}

return{CFG,rng,createFur,createCat,createSession,stroke,relax,liveBend,liveMax,shineAt,groom,feel,tick,clap,handLevel,HAND_LEVELS,
  petLine,rest,regionStats,looseTotal,packRGBA,grainAt,idx,texel};
});
