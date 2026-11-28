// 撸猫撸了一手毛 body: Xiaoju as a real cat lying on a lap, seen from above, head at the top.
// Shape (signed distance), natural grain, coat regions and a soft "dome" height for shading, all in body space
// (x 0..0.56 right, y 0..1 from head to tail, unit = body length). Shared by the game and the tests.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LumaoBody=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const ASPECT=0.56,SP=0.28;
// head (drawn separately, it turns): centre and radius in body space
const HEAD={x:0.285,y:0.175,r:0.142};
const PAWS=[[0.222,0.215,0.218,0.125,0.038],[0.348,0.215,0.352,0.128,0.038]];   // front paws tucked under the chin (a loaf): hidden until she lifts her head   // x0,y0 (elbow) → x1,y1 (toes), radius
const TAIL_BASE=[0.44,0.69];
// the spine bows a little to the right, so she lies like a soft C rather than a loaf of bread (display warp, x only)
const BEND=0.07;
function bendX(y){return BEND*Math.sin(Math.PI*Math.min(1,Math.max(0,(y-0.05)/0.9)));}

function ell(x,y,cx,cy,rx,ry){const dx=(x-cx)/rx,dy=(y-cy)/ry,l=Math.hypot(dx,dy);return(l-1)*Math.min(rx,ry);}
function cap(x,y,ax,ay,bx,by,r){const px=x-ax,py=y-ay,vx=bx-ax,vy=by-ay,h=Math.max(0,Math.min(1,(px*vx+py*vy)/(vx*vx+vy*vy)));return Math.hypot(px-vx*h,py-vy*h)-r;}
function smin(a,b,k){const h=Math.max(0,Math.min(1,0.5+0.5*(b-a)/k));return b+(a-b)*h-k*h*(1-h);}

// torso parts; the front paws are kept apart so they can have their own grain and colour
function torso(x,y){
  let d=ell(x,y,SP+0.004,0.5,0.175,0.235);           // the round middle
  d=smin(d,ell(x,y,SP,0.31,0.13,0.1),0.06);          // narrower shoulders
  d=smin(d,ell(x,y,SP+0.008,0.67,0.172,0.16),0.07);  // round haunch
  d=smin(d,ell(x,y,0.445,0.775,0.04,0.05),0.03);        // a hind foot tucked under, peeking out on the right
  return d;
}
function paw(x,y,i){const p=PAWS[i];return cap(x,y,p[0],p[1],p[2],p[3],p[4]);}
// the front paws stay tucked under the chest in this loaf pose, so they are not part of the visible outline
function sdf(x,y){return torso(x,y);}

// natural grain: head to tail along the back, splaying off the spine; along each foreleg toward the toes
function flow(x,y){
  for(let i=0;i<2;i++)if(paw(x,y,i)<0.004){const p=PAWS[i],vx=p[2]-p[0],vy=p[3]-p[1],m=Math.hypot(vx,vy);return[vx/m,vy/m];}
  const sx=(x-SP)/0.16*0.55,sy=1;const m=Math.hypot(sx,sy);return[sx/m,sy/m];
}
// coat: 0 orange (with stripes), 1 cream (paws, toes of the hind foot)
function region(x,y){
  for(let i=0;i<2;i++){if(paw(x,y,i)<0.004){const p=PAWS[i];const t=Math.hypot(x-p[0],y-p[1])/Math.hypot(p[2]-p[0],p[3]-p[1]);return t>0.4?1:0;}}
  if(ell(x,y,0.445,0.775,0.04,0.05)<0&&y>0.795)return 1;
  return 0;
}
// dome height 0 at the outline → 1 on the spine, for the light
// plus two shoulder blades and the hip bones under the fur
function height(x,y){const d=sdf(x,y);if(d>=0)return 0;let h=Math.min(1,Math.sqrt(-d/0.12));
  const g=(cx,cy,r)=>Math.exp(-((x-cx)**2+(y-cy)**2)/(r*r));
  h=h*0.88+0.1*(g(0.23,0.3,0.045)+g(0.33,0.3,0.045))+0.08*(g(0.21,0.65,0.07)+g(0.355,0.65,0.07));return Math.min(1,h);}
const mask=(x,y)=>sdf(x,y)<0?1:0;

// Tail lying along the right flank, curling up; wag = sideways swing of the far half, puff = fur volume.
function tailPoints(wag,curl,n){
  // from the hip, down and round the front of the haunch toward the left, tip free to flick
  n=n||10;const pts=[];let x=TAIL_BASE[0],y=TAIL_BASE[1],a=1.0-curl*0.1;const seg=0.046;
  for(let i=0;i<n;i++){pts.push([x,y]);const k=i/(n-1);a+=0.32+curl*0.04+wag*0.34*k*k;x+=Math.cos(a)*seg;y+=Math.sin(a)*seg;}
  return pts;
}

return{ASPECT,SP,HEAD,PAWS,TAIL_BASE,BEND,bendX,sdf,flow,region,height,mask,tailPoints,torso,paw};
});
