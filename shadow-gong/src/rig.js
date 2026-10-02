/* Puppet skeletons: every part is a flat quad hinged on its parent, the way shadow puppets are riveted.
   Poses come only from simulation state, so the renderer and the tests measure the same silhouette. */
(function(root){
'use strict';
// name, parent, pivot (in parent frame), size [w,h], anchor (joint inside the quad, 0..1 from bottom-left), layer
const P=(name,parent,pivot,size,anchor,z,art)=>({name,parent,pivot,size,anchor,z,art:art===undefined?name:art});
const rigs={
  player:[
    P('legB','root',[-.06,1.14],[.3,1.16],[.46,.96],1),
    P('torso','root',[0,1.12],[.66,.86],[.5,.04],3),
    P('armBu','torso',[-.04,.72],[.2,.52],[.5,.92],2),
    P('armBl','armBu',[0,-.44],[.18,.48],[.5,.92],2.1),
    P('stick','armBl',[0,-.38],[.13,.84],[.5,.92],2.2),
    P('legF','root',[.08,1.14],[.3,1.16],[.46,.96],4),
    P('skirt','torso',[0,.08],[.9,.6],[.5,.88],5),
    P('head','torso',[.06,.8],[.74,.8],[.42,.05],6),
    P('armFu','torso',[.1,.72],[.2,.52],[.5,.92],7),
    P('armFl','armFu',[0,-.44],[.18,.48],[.5,.92],7.1),
    P('gong','armFl',[0,-.38],[.94,.94],[.5,.94],7.2)
  ],
  moth:[
    // body in profile, wings spread as if seen from above (the usual shadow-puppet way to draw insects)
    P('wingB','body',[-.02,0],[1.04,.72],[.5,1],1),
    P('wingF','body',[-.02,0],[1.04,.72],[.5,0],2),
    P('body','root',[0,0],[.76,.3],[.5,.5],3)
  ],
  scissors:[
    P('core','root',[0,1.02],[0,0],[.5,.5],0,null),
    P('handleB','core',[0,0],[.5,1.04],[.5,.97],1),
    P('bladeB','core',[0,0],[.28,1.32],[.5,.05],2),
    P('handleF','core',[0,0],[.5,1.04],[.5,.97],4),
    P('bladeF','core',[0,0],[.28,1.32],[.5,.05],5),
    P('screw','core',[0,0],[.38,.38],[.5,.5],6)
  ],
  rat:[
    P('tail1','root',[-.5,1.3],[.85,.26],[.97,.5],0),
    P('tail2','tail1',[-.8,0],[.75,.2],[.97,.5],.1),
    P('tail3','tail2',[-.7,0],[.65,.15],[.97,.5],.2),
    P('thighB','root',[-.22,1.6],[.62,.98],[.5,.9],1),
    P('shinB','thighB',[0,-.82],[.48,.92],[.5,.92],1.1),
    P('body','root',[0,1.55],[1.6,2],[.5,.05],3),
    P('armBu','body',[-.12,1.5],[.38,.86],[.5,.92],2),
    P('armBl','armBu',[0,-.74],[.34,.8],[.5,.92],2.1),
    P('jar','armBl',[0,-.7],[.62,.7],[.5,.86],2.2),
    P('thighF','root',[.12,1.6],[.62,.98],[.5,.9],5),
    P('shinF','thighF',[0,-.82],[.48,.92],[.5,.92],5.1),
    P('head','body',[.3,1.78],[1.3,1],[.28,.18],6),
    P('armFu','body',[.28,1.5],[.4,.9],[.5,.92],7),
    P('armFl','armFu',[0,-.78],[.36,.82],[.5,.92],7.1),
    P('ladle','armFl',[0,-.72],[.56,2],[.5,.94],7.2)
  ]
};
const byName={};for(const k in rigs){byName[k]={};for(const p of rigs[k])byName[k][p.name]=p;}
// Named points in a part's own frame: weapon tips for glints and sparks, rod anchors, gong centre.
const points={
  player:{weapon:['gong',0,-.41],gong:['gong',0,-.41],stickTip:['stick',0,-.72],neck:['head',0,0],handF:['armFl',0,-.38],handB:['armBl',0,-.38]},
  moth:{weapon:['body',.36,0],eye:['wingF',.14,.4],eyeB:['wingB',.14,-.4],rod:['body',0,0]},
  scissors:{weapon:['bladeF',0,1.18],tipB:['bladeB',0,1.18],rod:['screw',0,0],eye:['screw',0,0]},
  rat:{weapon:['ladle',0,-1.7],jar:['jar',0,.05],neck:['head',0,0],handF:['armFl',0,-.72],handB:['armBl',0,-.7]}
};
// 2D affine [a,b,c,d,e,f]: x' = a*x + c*y + e, y' = b*x + d*y + f
const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
const trs=(x,y,r,sx=1,sy=1)=>{const c=Math.cos(r),s=Math.sin(r);return[c*sx,s*sx,-s*sy,c*sy,x,y];};
const apply=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
function solve(kind,pose){
  const out={},parts=rigs[kind],sc=pose.scale||1;
  const base=mul(mul([pose.face||1,0,0,1,pose.x,pose.y],trs(0,0,pose.rot||0)),[sc,0,0,sc,0,0]);
  const get=name=>{
    if(name==='root')return base;
    if(out[name])return out[name].m;
    const part=byName[kind][name],s=pose.scales&&pose.scales[name];
    const m=mul(get(part.parent),trs(part.pivot[0],part.pivot[1],pose.angles[name]||0,s?s[0]:1,s?s[1]:1));
    out[name]={m,part};return m;
  };
  for(const p of parts)get(p.name);
  return out;
}
function point(kind,solved,name){const [part,x,y]=points[kind][name];return apply(solved[part].m,x,y);}
function corners(part,m){const [w,h]=part.size,[ax,ay]=part.anchor;return[[-ax*w,-ay*h],[(1-ax)*w,-ay*h],[(1-ax)*w,(1-ay)*h],[-ax*w,(1-ay)*h]].map(([x,y])=>apply(m,x,y));}
function bounds(kind,pose){
  const solved=solve(kind,pose);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const k in solved){const {m,part}=solved[k];if(!part.art)continue;for(const c of corners(part,m)){minX=Math.min(minX,c.x);maxX=Math.max(maxX,c.x);minY=Math.min(minY,c.y);maxY=Math.max(maxY,c.y);}}
  return{minX,minY,maxX,maxY};
}
// --- poses -------------------------------------------------------------------------------
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);
// keyframes [[time,value],...] with smoothstep between keys
function kf(u,keys){
  if(u<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++)if(u<=keys[i][0]){const [t0,v0]=keys[i-1],[t1,v1]=keys[i];return lerp(v0,v1,ease((u-t0)/Math.max(1e-6,t1-t0)));}
  return keys[keys.length-1][1];
}
function playerPose(p,t){
  const a={legB:-.05,legF:.07,torso:-.03,head:0,armBu:-.1,armBl:.42,stick:1.25,armFu:.45,armFl:.7,gong:-.25,skirt:0};
  let y=0,rot=0;const u=p.st;
  const guard=()=>Object.assign(a,{legF:.24,legB:-.24,torso:.07,head:-.05,armFu:1.3,armFl:.5,gong:-.35,armBu:-.35,armBl:.6,stick:1.4});
  switch(p.state){
    case 'idle':{const b=Math.sin(t*2.4);y=.012*b;a.torso+=.012*b;a.head=-.015*b;break;}
    case 'walk':{const f=p.walkPhase;a.legF=.4*Math.sin(f);a.legB=-.4*Math.sin(f);y=-.035*Math.abs(Math.sin(f));a.torso=-.07;a.armBu=-.1-.18*Math.sin(f);a.armFu=.45+.12*Math.sin(f);a.skirt=.04*Math.sin(2*f);break;}
    case 'guard':{const k=ease(clamp(u/.06,0,1));const g={...a};guard();for(const n in a)a[n]=lerp(g[n],a[n],k);y=-.03*k;break;}
    case 'parry':{guard();const k=ease(clamp(u/.06,0,1));a.torso=lerp(.07,-.12,k);a.armFu=lerp(1.3,1.62,k);a.armFl=lerp(.5,.12,k);a.gong=-.35+.22*Math.sin(u*72)*Math.exp(-u*6.5);a.head=-.08;y=-.03;break;}
    case 'attack':{
      const big=p.combo===2,d=p.attackDur,h=p.attackHit;
      a.armBu=kf(u,[[0,-.1],[h*.7,big?3.8:3.4],[h,big?1:1.3],[h+.08,big?.8:.95],[d,-.1]]);
      a.armBl=kf(u,[[0,.42],[h*.7,.3],[h,.2],[d,.42]]);a.stick=kf(u,[[0,1.25],[h*.7,.5],[h,1.1],[d,1.25]]);
      a.torso=kf(u,[[0,-.03],[h*.7,big?.15:.1],[h,big?-.22:-.15],[d,-.03]]);a.legF=kf(u,[[0,.07],[h,big?.38:.22],[d,.07]]);a.legB=kf(u,[[0,-.05],[h,-.2],[d,-.05]]);
      break;}
    case 'dodge':{const k=clamp(u/p.dodgeDur,0,1),back=p.dodgeDir!==p.face;y=.42*Math.sin(Math.PI*k);a.torso=back?.25:-.4;a.legF=back?.6:.55;a.legB=back?-.2:-.5;a.armFu=.9;a.armFl=1.2;a.armBu=back?-.6:.3;break;}
    case 'bounced':case 'hurt':{const r=(p.state==='bounced'?.6:1)*(1-clamp(u/p.stateDur,0,1));a.torso=.3*r-.03;a.head=.25*r;a.armFu=.45+.4*r;a.armBu=-.1-.5*r;a.legF=.07-.1*r;break;}
    case 'down':{const d=p.stateDur;rot=kf(u,[[0,0],[.15,1.35],[d-.3,1.35],[d,0]]);y=kf(u,[[0,0],[.15,.08],[d-.3,.08],[d,0]]);a.armFu=1.1;a.armBu=-.8;a.head=.3;break;}
    case 'broken':{a.torso=.25+.08*Math.sin(u*9);a.head=-.3;a.armFu=-.1;a.armFl=.3;a.gong=.5;a.armBu=-.25;break;}
    case 'execute':{
      a.armFu=kf(u,[[0,.45],[.16,2.7],[.24,.9],[.4,.75],[.55,.45]]);a.armFl=kf(u,[[0,.7],[.16,.2],[.24,.1],[.55,.7]]);
      a.torso=kf(u,[[0,0],[.16,.18],[.24,-.25],[.55,-.03]]);a.legF=kf(u,[[0,.07],[.24,.4],[.55,.07]]);a.gong=-.25+.3*Math.sin(Math.max(0,u-.24)*60)*Math.exp(-Math.max(0,u-.24)*7);break;}
    case 'dead':{rot=kf(u,[[0,0],[.3,1.45]]);y=.05;a.head=.35;a.armFu=1.4;a.armBu=-.9;break;}
    case 'won':{a.armFu=2.9;a.armFl=.2;a.gong=.25*Math.sin(u*50)*Math.exp(-u*2);a.head=.15;a.armBu=-.4;break;}
  }
  if(p.recoil>0&&(p.state==='guard'||p.state==='idle'||p.state==='walk')){a.torso+=.16*p.recoil;a.armFu-=.25*p.recoil;}
  return{x:p.x,y:(p.y||0)+y,rot,face:p.face,angles:a};
}
// wings open and close together; fully open reads as a spread moth, nearly closed as a flick
const flap=(f,lo=.32)=>{const v=lo+(1-lo)*(.5+.5*Math.cos(f));return[1,v];};
function mothPose(e,t){
  const a={body:0,wingB:.06,wingF:-.06},sc={wingF:flap(e.flap),wingB:flap(e.flap)};
  let rot=.08*Math.sin(t*3+e.id),y=e.y+.07*Math.sin(t*3.1+e.id*1.7);
  if(e.state==='attack'){
    const u=e.clock,tel=e.move.strikes[0].hit-e.move.strikes[0].lead*e.rate,hit=e.move.strikes[0].hit;
    if(u<tel){const k=ease(clamp(u/tel,0,1)),o=lerp(sc.wingF[1],1.12,k)+.04*Math.sin(u*80)*k;rot=.4*k;sc.wingF=[1,o];sc.wingB=[1,o];y=e.y;}
    else if(u<hit){rot=-.6;sc.wingF=[.9,.36];sc.wingB=[.9,.36];a.wingF=-.35;a.wingB=.35;y=e.y;}
    else{const k=clamp((u-hit)/.3,0,1);rot=lerp(-.4,.2,k);y=e.y;}
  }else if(e.state==='stun'){rot=.12*Math.sin(e.st*14)*Math.exp(-e.st*2);sc.wingF=[1,.95];sc.wingB=[1,.95];a.wingF=-.15;a.wingB=.15;y=e.y;}
  else if(e.state==='recoil'){rot=.5*Math.exp(-e.st*4);}
  else if(e.state==='dead'){rot=e.st*9;sc.wingF=[1,.5];sc.wingB=[1,.5];y=e.y;}
  return{x:e.x,y,rot,face:e.face,scale:1.15*(1+1.3*(e.depth||0)),angles:a,scales:sc};   // moth parts are drawn at 1/1.15 scale
}
function scissorsPose(e,t){
  const a={core:0,bladeF:.06,bladeB:-.06,handleF:.12,handleB:-.12,screw:0};
  if(e.state==='walk'||e.state==='enter'){const f=e.walkPhase;a.handleF=.12+.35*Math.sin(f);a.handleB=-.12-.35*Math.sin(f);a.core=.05*Math.sin(f*2);const o=.12+.05*Math.sin(f*2);a.bladeF=o;a.bladeB=-o;}
  else if(e.state==='idle'){const o=.1+.04*Math.sin(t*3+e.id);a.bladeF=o;a.bladeB=-o;a.core=.03*Math.sin(t*2+e.id);}
  else if(e.state==='attack'&&e.move.name==='snip'){
    const u=e.clock,[s1,s2]=e.move.strikes,h1=s1.hit,h2=s2.hit,o=kf(u,[[0,.06],[h1-.4,.66],[h1-.06,.66],[h1,.02],[h1+.14,.1],[h2-.4,.66],[h2-.06,.66],[h2,.02],[e.move.dur,.06]]);
    a.core=kf(u,[[0,0],[h1-.42,-.35],[h1,-.85],[h1+.18,-.45],[h2,-.9],[h2+.16,-.5],[e.move.dur,0]]);a.bladeF=o;a.bladeB=-o;a.handleF=.3;a.handleB=-.4;
  }else if(e.state==='attack'&&e.move.name==='thrust'){
    const u=e.clock,h=e.move.strikes[0].hit;a.core=kf(u,[[0,0],[h-.4,-.5],[h-.06,-1.45],[h,-1.5],[h+.2,-1.2],[e.move.dur,0]]);a.bladeF=.03;a.bladeB=-.03;a.handleF=kf(u,[[0,.12],[h,.9],[e.move.dur,.12]]);a.handleB=kf(u,[[0,-.12],[h,.5],[e.move.dur,-.12]]);
  }else if(e.state==='stun'){a.core=.3*Math.sin(e.st*10);a.bladeF=.9;a.bladeB=-.9;a.handleF=.5;a.handleB=-.5;}
  else if(e.state==='recoil'){a.core=.45*Math.exp(-e.st*5);a.bladeF=.3;a.bladeB=-.3;}
  else if(e.state==='dead'){a.core=Math.min(1.5,e.st*4);a.bladeF=.7;a.bladeB=-.7;}
  return{x:e.x,y:e.y||0,rot:0,face:e.face,scale:1+1.3*(e.depth||0),angles:a};
}
function ratPose(e,t){
  const sw=Math.sin(t*2+e.id);
  // the ladle rests upright like a staff; the tail curls up so the silhouette stays compact
  const a={thighF:.3,shinF:-.55,thighB:.2,shinB:-.45,body:-.04,head:0,armFu:.35,armFl:.75,ladle:1.6,armBu:-.2,armBl:.6,jar:0,tail1:-.75+.1*sw,tail2:-.55+.15*Math.sin(t*2.6+1),tail3:-.45+.2*Math.sin(t*3.1+2)};
  let rot=0,y=e.y||0;
  if(e.state==='walk'||e.state==='enter'){const f=e.walkPhase;a.thighF=.3+.35*Math.sin(f);a.thighB=.2-.35*Math.sin(f);a.shinF=-.55-.2*Math.max(0,Math.sin(f));a.shinB=-.45-.2*Math.max(0,-Math.sin(f));y+=-.05*Math.abs(Math.sin(f));}
  else if(e.state==='attack'){
    const u=e.clock,m=e.move,d=m.dur;
    if(m.name==='ladle'){const [h1,h2,h3]=m.strikes.map(s=>s.hit);
      a.armFu=kf(u,[[0,.35],[h1-.4,2.5],[h1,.9],[h1+.12,2.2],[h2,.8],[h2+.34,2.6],[h3,.7],[d,.35]]);
      a.armFl=kf(u,[[0,.75],[h1-.4,.3],[h1,.2],[h1+.12,.4],[h2,.2],[h2+.34,.2],[h3,.1],[d,.75]]);
      a.ladle=kf(u,[[0,1.6],[h1-.4,.4],[h1,.2],[h1+.12,.4],[h2,.2],[h2+.34,.45],[h3,.2],[d,1.6]]);
      a.body=kf(u,[[0,-.04],[h1-.4,.12],[h1,-.2],[h1+.12,.08],[h2,-.2],[h2+.34,.16],[h3,-.28],[d,-.04]]);
    }else if(m.name==='fling'){const h=m.strikes[0].hit;
      a.armBu=kf(u,[[0,-.2],[h-.55,-1.05],[h-.15,-1.2],[h,1.4],[h+.15,1.5],[d,-.2]]);a.jar=kf(u,[[0,0],[h-.15,.4],[h,-1.4],[d,0]]);
      a.body=kf(u,[[0,-.04],[h-.15,.2],[h,-.25],[d,-.04]]);a.head=kf(u,[[0,0],[h-.15,.2],[h,-.1],[d,0]]);
    }else if(m.name==='leap'){const h=m.strikes[0].hit;
      a.thighF=kf(u,[[0,.3],[.4,.8],[.5,.1],[h-.1,.9],[h,.5],[d,.3]]);a.shinF=kf(u,[[0,-.55],[.4,-1.3],[.5,-.3],[h-.1,-1.4],[h,-.9],[d,-.55]]);
      a.thighB=kf(u,[[0,.2],[.4,.7],[.5,-.2],[h-.1,.8],[h,.4],[d,.2]]);a.shinB=kf(u,[[0,-.45],[.4,-1.2],[.5,-.2],[h-.1,-1.3],[h,-.8],[d,-.45]]);
      a.armFu=kf(u,[[0,.35],[.45,1.6],[h-.12,2.7],[h,.7],[d,.35]]);a.ladle=kf(u,[[0,1.6],[.45,.8],[h-.12,.45],[h,.2],[d,1.6]]);a.body=kf(u,[[0,-.04],[.4,-.3],[.6,.1],[h,-.35],[d,-.04]]);
    }
  }else if(e.state==='stun'){a.body=.2*Math.sin(e.st*5)+.15;a.head=-.35+.1*Math.sin(e.st*7);a.armFu=-.2;a.armFl=.4;a.ladle=.9;a.armBu=-.1;}
  else if(e.state==='recoil'){const r=Math.exp(-e.st*4);a.body=-.04+.32*r;a.head=.2*r;a.armFu=.35+.8*r;}
  else if(e.state==='intro'){const r=clamp(e.st/2,0,1);a.armFu=lerp(.5,2.2,ease(clamp((e.st-1.2)/.5,0,1)));a.head=.3*ease(clamp((e.st-1.3)/.4,0,1));a.body=-.04+.1*r;}
  else if(e.state==='dead'){rot=kf(e.st,[[0,0],[.5,1.4]]);a.head=.4;a.armFu=1.3;a.ladle=1;}
  return{x:e.x,y,rot,face:e.face,scale:1+1.3*(e.depth||0),angles:a};
}
const posers={player:playerPose,moth:mothPose,scissors:scissorsPose,rat:ratPose};
function pose(kind,actor,t){return posers[kind](actor,t||0);}
const api={rigs,byName,points,solve,point,corners,bounds,pose,kf,mul,trs,apply};
if(typeof module!=='undefined')module.exports=api;root.GongRig=api;
})(typeof globalThis!=='undefined'?globalThis:this);
