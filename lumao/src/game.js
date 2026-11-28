// 撸猫撸了一手毛 game: WebGL fur (one pass, shells marched in the fragment shader), Canvas 2D face, hand and loose hair.
// Numbers are in SPEC.md. The fur state lives in core.js; this file only draws it and feeds it the finger.
(function(){
'use strict';
const C=window.LumaoCore,B=window.LumaoBody;
const qs=new URLSearchParams(location.search);
const VIEW=qs.get('view')||'',LAYERS=qs.get('q')==='low'?8:14;
const $=id=>document.getElementById(id);
const bg=$('bg'),gl_c=$('gl'),fx=$('fx'),hintEl=$('hint'),soundBtn=$('sound');
const bx=bg.getContext('2d'),fc=fx.getContext('2d'),hc=document.createElement('canvas').getContext('2d');   // hc: hit tests in hand units
const A=B.ASPECT;
let DPR=Math.min(2,window.devicePixelRatio||1),VW=0,VH=0,Lc=0,ox=0,oy=0;   // css px per body length, body box origin
let seed=Number(qs.get('seed'))||7;
let S,frozen=false,viewDone=VIEW?false:true,started=false,stroked=false;

// ---------- WebGL ----------
const gl=gl_c.getContext('webgl',{premultipliedAlpha:false,alpha:true,antialias:false});
if(!gl){$('nogl').hidden=false;return;}
const VS=`attribute vec2 a;uniform vec4 u_rect;uniform vec2 u_res;
void main(){vec2 p=u_rect.xy+a*u_rect.zw;gl_Position=vec4(p.x/u_res.x*2.-1.,1.-p.y/u_res.y*2.,0.,1.);}`;
const FS=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;uniform float u_mode,u_L,u_time,u_layers,u_twitch,u_tailR,u_tailPuff,u_headPuff,u_earVis0,u_earVis1;
uniform vec2 u_org;uniform sampler2D u_map,u_stat;
uniform vec4 u_trail[8];uniform vec3 u_finger;uniform vec2 u_tail[10];uniform vec3 u_head;uniform vec2 u_nose,u_up2;uniform vec2 u_ears[6];
const float ASP=${A.toFixed(4)},SP=${B.SP.toFixed(4)},DENS=300.,FL=0.023,R=0.08,BEND=${B.BEND.toFixed(4)};
const vec3 ORANGE=vec3(0.94,0.52,0.14),CREAM=vec3(0.98,0.93,0.84),PINK=vec3(0.94,0.6,0.6),DARK=vec3(0.66,0.26,0.06);
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float sdTri(vec2 p,vec2 p0,vec2 p1,vec2 p2){
  vec2 e0=p1-p0,e1=p2-p1,e2=p0-p2,v0=p-p0,v1=p-p1,v2=p-p2;
  vec2 pq0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.,1.),pq1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.,1.),pq2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.,1.);
  float s=sign(e0.x*e2.y-e0.y*e2.x);
  vec2 d=min(min(vec2(dot(pq0,pq0),s*(v0.x*e0.y-v0.y*e0.x)),vec2(dot(pq1,pq1),s*(v1.x*e1.y-v1.y*e1.x))),vec2(dot(pq2,pq2),s*(v2.x*e2.y-v2.y*e2.x)));
  return -sqrt(d.x)*sign(d.y);}
vec4 stat(vec2 q){return texture2D(u_stat,vec2(q.x/ASP,q.y));}
// tail: distance to the polyline, arc position t (0 base → 1 tip), tangent
vec4 tailInfo(vec2 q){float best=1e3,bt=0.;vec2 tg=vec2(0,1);
  for(int i=0;i<9;i++){vec2 a=u_tail[i],b=u_tail[i+1],v=b-a;float h=clamp(dot(q-a,v)/dot(v,v),0.,1.);float d=length(q-a-v*h);
    if(d<best){best=d;bt=(float(i)+h)/9.;tg=normalize(v);}}
  return vec4(best,bt,tg);}
float tailRad(float t){return u_tailR*(1.-0.3*t)*(1.+0.55*u_tailPuff);}
// root test + field for a point, per mode. returns inside(0/1); out: flow, region, height
float field(vec2 q,out vec2 fl,out float reg,out float hgt){
  if(u_mode<0.5){if(q.x<0.||q.y<0.||q.x>ASP||q.y>1.)return 0.;vec4 s=stat(q);fl=s.rg*2.-1.;reg=s.b;hgt=s.a;return step(0.012,s.a);}
  if(u_mode<1.5){vec4 ti=tailInfo(q);float r=tailRad(ti.y);fl=ti.zw;reg=step(0.8,ti.y);hgt=sqrt(max(0.,1.-(ti.x/r)*(ti.x/r)));return step(ti.x,r);}
  vec2 v=q-u_head.xy;float d=length(v*vec2(1./1.08,1.))/u_head.z;
  float e0=sdTri(q,u_ears[0],u_ears[1],u_ears[2]),e1=sdTri(q,u_ears[3],u_ears[4],u_ears[5]);
  if(d<1.){fl=normalize(q-u_nose+vec2(1e-5));float m=length(q-u_nose)/u_head.z;reg=step(m,0.42);hgt=sqrt(max(0.,1.-d*d));return 1.;}
  float ee=min(e0+ (1.-u_earVis0)*1.,e1+(1.-u_earVis1)*1.);
  if(ee<0.){bool l=e0<e1;vec2 tip=l?u_ears[0]:u_ears[3],mid=l?(u_ears[1]+u_ears[2])*.5:(u_ears[4]+u_ears[5])*.5;
    fl=normalize(tip-mid);vec2 c=l?(u_ears[0]+u_ears[1]+u_ears[2])/3.:(u_ears[3]+u_ears[4]+u_ears[5])/3.;
    float inner=l?sdTri(c+(q-c)/0.6,u_ears[0],u_ears[1],u_ears[2]):sdTri(c+(q-c)/0.6,u_ears[3],u_ears[4],u_ears[5]);
    reg=inner<0.?2.:0.;hgt=0.45;return 1.;}
  return 0.;}
void main(){
  vec2 px=vec2(gl_FragCoord.x,u_res.y-gl_FragCoord.y);
  vec2 p=(px-u_org)/u_L;
  if(u_mode<1.5)p.x-=BEND*sin(3.14159*clamp((p.y-0.05)/0.9,0.,1.));else p.x-=BEND*sin(3.14159*clamp((u_head.y-0.05)/0.9,0.,1.));
  vec2 fl;float reg,hgt;float inP=field(p,fl,reg,hgt);
  vec2 dir=fl;float mess=0.18,loose=0.,shineK=0.15;float fl0=FL;
  if(u_mode<0.5){vec4 m=texture2D(u_map,vec2(p.x/ASP,p.y));dir=m.rg*2.-1.;mess=m.b;loose=m.a;
    float al=max(0.,dot(normalize(dir+1e-5),fl));shineK=pow(al,4.)*(1.-mess)*(1.-mess);}
  else if(u_mode<1.5){mess=0.2+0.7*u_tailPuff;fl0=FL*1.25;}
  else{mess=0.06+u_headPuff;fl0=FL*0.42;}
  // the spring under and behind the finger
  vec2 bend=vec2(0.);
  for(int i=0;i<8;i++){vec4 t=u_trail[i];float d=length(p-t.xy);float w=max(0.,1.-d/(R*1.4));bend+=t.zw*w*w;}
  float press=u_finger.z*max(0.,1.-length(p-u_finger.xy)/R);
  if(u_mode>0.5){bend*=0.;press=0.;}
  mess*=1.-0.85*press;
  // ruffled fur goes in clumps, each clump its own way
  vec2 clump=vec2(vnoise(p*34.),vnoise(p*34.+17.3))-0.5;
  vec2 perp=vec2(-dir.y,dir.x);
  vec2 ld=normalize(dir+clump*mess*3.6+bend*2.2+perp*u_twitch*sin(p.y*90.-u_time*30.)*0.7+1e-5);
  float llen=fl0*(1.-0.6*mess)*(1.+0.35*mess)+length(bend)*fl0*0.6+press*fl0*0.4;
  vec2 lean=ld*llen;
  vec3 col=vec3(0.);float hit=0.,hh=0.,sl=1.,lz=0.;vec2 hb=p;float hreg=reg;
  for(int k=15;k>=0;k--){
    if(float(k)>=u_layers)continue;
    float h=(float(k)+0.5)/u_layers;
    vec2 b=p-lean*h;
    vec2 fb;float rb,hgb;
    if(field(b,fb,rb,hgb)<0.5)continue;
    vec2 g=b*DENS;vec2 id=floor(g);vec2 f=fract(g)-0.5;
    float r1=hash(id),r2=hash(id+7.13),r3=hash(id+3.71),r4=hash(id+11.9);
    f-=(vec2(r2,r3)-0.5)*0.45;
    float Ls=0.6+0.4*r1;bool fluff=r4<loose*0.3&&u_mode<0.5;if(fluff)Ls=1.3;
    if(rb>1.5)Ls*=0.45;
    if(h>Ls)continue;
    float rad=0.44*(1.-0.7*h/Ls);
    if(length(f)>rad)continue;
    hit=1.;hh=h/Ls;sl=r1;hb=b;hreg=rb;lz=fluff?1.:0.;break;
  }
  if(hit<0.5){if(inP<0.5)discard;hb=p;hreg=reg;hh=0.;}
  // coat colour at the root
  vec3 base=ORANGE;
  if(u_mode<0.5){
    float s=sin((hb.y+0.03*sin(hb.x*31.)+pow(abs(hb.x-SP),2.)*2.6)*6.2832*7.2+vnoise(hb*14.)*1.4);
    float stripe=smoothstep(0.05,0.7,s)*(0.65+0.35*vnoise(hb*22.));
    float spine=exp(-pow((hb.x-SP)/0.028,2.));
    base=mix(base,DARK,0.7*stripe+0.4*spine);
    base*=0.9+0.2*vnoise(hb*24.+7.);   // clumps catch the light differently
    base=mix(base,vec3(0.98,0.68,0.36),0.3*(1.-smoothstep(0.,0.45,hgt)));
  }else if(u_mode<1.5){vec4 ti=tailInfo(hb);float s=sin(ti.y*6.2832*4.5);base=mix(base,DARK,0.5*smoothstep(0.35,0.85,s));}
  else{base=mix(base,vec3(0.98,0.66,0.3),0.18);vec2 v=hb-u_head.xy;vec2 rt=vec2(-u_up2.y,u_up2.x);float up=dot(v,u_up2)/u_head.z;
    float s=sin(dot(v,rt)/u_head.z*15.);base=mix(base,DARK,0.55*smoothstep(0.4,0.9,s)*smoothstep(0.05,0.45,up));}
  if(hreg>1.5)base=PINK;else if(hreg>0.5)base=CREAM;
  if(lz>0.5)base=mix(base,CREAM,0.35);
  // ruffled fur shows its darker roots between the clumps and lighter tips on top
  if(u_mode<0.5)base*=mix(1.,mix(0.62,1.18,hh),smoothstep(0.25,0.8,mess));
  // light: a dome normal from the height field, warm window light from the top left
  vec3 Ld=normalize(vec3(-0.55,-0.62,0.6));
  vec2 e=vec2(0.006,0.);vec2 f1;float r_,h1,h2,h3,h4;
  field(hb+e.xy,f1,r_,h1);field(hb-e.xy,f1,r_,h2);field(hb+e.yx,f1,r_,h3);field(hb-e.yx,f1,r_,h4);
  vec3 n=normalize(vec3(-(h1-h2)*2.6,-(h3-h4)*2.6,1.));
  float dif=0.52+0.62*max(dot(n,Ld),0.);
  if(u_mode>1.5&&hreg>0.5&&hreg<1.5)dif=max(dif,0.9);
  // the head casts a soft shadow onto the shoulders
  if(u_mode<0.5){float hd=length(hb-u_head.xy-vec2(0.012,0.03))/u_head.z;dif*=1.-0.38*smoothstep(1.28,0.85,hd);}
  float ao=mix(mix(0.62,1.04,smoothstep(0.,1.,hh)),0.97,0.75*shineK);
  vec3 H=normalize(Ld+vec3(0.,0.,1.));
  float spec=pow(max(dot(n,H),0.),7.)*(0.1+1.7*shineK)*smoothstep(0.35,0.95,hh)*(0.75+0.5*sl);
  col=base*dif*ao+vec3(1.,0.86,0.62)*spec*0.8;
  col*=vec3(1.05,0.99,0.92);
  gl_FragColor=vec4(col,1.);
}`;
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
const prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);
if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const U={};for(const n of ['u_res','u_mode','u_L','u_time','u_layers','u_twitch','u_tailR','u_tailPuff','u_headPuff','u_earVis0','u_earVis1','u_org','u_map','u_stat','u_trail','u_finger','u_tail','u_head','u_nose','u_up2','u_ears','u_rect'])U[n]=gl.getUniformLocation(prog,n);
const qb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,qb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);
const al=gl.getAttribLocation(prog,'a');gl.enableVertexAttribArray(al);gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);
function tex(w,h,data){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);return t;}
// static field: grain, coat region, dome height — 2× the state map's resolution for a cleaner outline
const SW=112,SH=200,stat=new Uint8Array(SW*SH*4);
for(let j=0;j<SH;j++)for(let i=0;i<SW;i++){const x=(i+0.5)/SW*A,y=(j+0.5)/SH,k=(j*SW+i)*4,f=B.flow(x,y);
  stat[k]=Math.round((f[0]*0.5+0.5)*255);stat[k+1]=Math.round((f[1]*0.5+0.5)*255);stat[k+2]=B.region(x,y)*255;stat[k+3]=Math.round(B.height(x,y)*255);}
gl.activeTexture(gl.TEXTURE1);const statTex=tex(SW,SH,stat);
gl.activeTexture(gl.TEXTURE0);let mapTex=null,mapBuf=null;
gl.uniform1i(U.u_map,0);gl.uniform1i(U.u_stat,1);

// ---------- the cat (presentation state on top of core's mood) ----------
const look={f:[-0.45,-0.42,0.79],eye:0.55,earBack:0,mouth:0,tongue:0,tailWag:0,tailPuff:0,tailCurl:0,headDX:0,headDY:0,purr:0,blink:0,shake:0,twitch:0};
const norm=v=>{const m=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/m,v[1]/m,v[2]/m];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const lerp=(a,b,k)=>a+(b-a)*k;
let finger=null,lastFinger={x:B.SP,y:0.5};       // body units
const P=[];                                       // loose hair particles
const hand={shown:0,stuck:[],flinch:0,clapT:-1,x:0,y:0,w:0,h:0,path:null,lvlShown:0};
const bubble={text:'',t:0,x:0,y:0};

function headBasis(){
  const f=norm(look.f),u0=[0,-1,0.35];const d=u0[0]*f[0]+u0[1]*f[1]+u0[2]*f[2];
  const up=norm([u0[0]-f[0]*d,u0[1]-f[1]*d,u0[2]-f[2]*d]),rt=cross(f,up);return{f,up,rt};
}
function headCenter(){return[B.HEAD.x+look.headDX,B.HEAD.y+look.headDY];}
// a point on (or off) the head sphere, local (a right, b up, c forward) → body units + depth
function hp(a,b,c,rad){const {f,up,rt}=headBasis();const v=norm([rt[0]*a+up[0]*b+f[0]*c,rt[1]*a+up[1]*b+f[1]*c,rt[2]*a+up[2]*b+f[2]*c]);
  const [cx,cy]=headCenter(),r=B.HEAD.r*(rad||1);return[cx+v[0]*r,cy+v[1]*r,v[2]];}
function face(a,b){const {f,up,rt}=headBasis();const v=norm([f[0]+rt[0]*a+up[0]*b,f[1]+rt[1]*a+up[1]*b,f[2]+rt[2]*a+up[2]*b]);
  const [cx,cy]=headCenter(),r=B.HEAD.r;return[cx+v[0]*r,cy+v[1]*r,v[2]];}
function ears(){
  const back=look.earBack;const out=[];
  for(const s of [-1,1]){
    const tip=hp(s*lerp(0.62,1.1,back),lerp(1.1,0.5,back),lerp(0.2,-0.5,back),lerp(1.62,1.38,back));
    const b1=hp(s*0.12,0.85,0.4,0.96),b2=hp(s*0.9,0.4,0.25,0.96);
    out.push([tip,b1,b2]);
  }
  return out;
}

// ---------- layout ----------
function layout(){
  VW=window.innerWidth;VH=window.innerHeight;DPR=Math.min(2,window.devicePixelRatio||1);
  for(const c of [bg,gl_c,fx]){c.width=Math.round(VW*DPR);c.height=Math.round(VH*DPR);c.style.width=VW+'px';c.style.height=VH+'px';}
  // the whole cat (head top ≈ 0.0, tail and hind foot ≈ 0.97; tail reaches x ≈ 0.6) must fit with room for the hand and the hint
  Lc=Math.min((VH-150)/1.0,VW*0.9/0.64,600);
  ox=(VW-0.62*Lc)/2;oy=Math.max(96,(VH-1.0*Lc)*0.55);
  hand.w=Math.min(64,VW*0.17);hand.h=hand.w*1.15;hand.x=14;hand.y=12;
  hand.path=handPath(hand.w,hand.h);
  paintBg();
}
function handPath(w,h){
  const p=new Path2D();const pw=w*0.62,ph=h*0.46,px=w*0.2,py=h*0.48;
  p.roundRect(px,py,pw,ph,[w*0.12,w*0.12,w*0.2,w*0.2]);
  const fw=pw/4.3;for(let i=0;i<4;i++){const fx_=px+fw*0.15+i*fw*1.05,len=h*[0.34,0.42,0.4,0.33][i];p.roundRect(fx_,py-len+fw*0.5,fw*0.92,len,fw*0.46);}
  p.ellipse(px-w*0.02,py+ph*0.42,w*0.11,h*0.2,-0.6,0,Math.PI*2);
  return p;
}
let blanket=null;
function paintBg(){
  const w=bg.width,h=bg.height;bx.setTransform(1,0,0,1,0,0);
  const g=bx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#efe4d2');g.addColorStop(1,'#d5c6ae');bx.fillStyle=g;bx.fillRect(0,0,w,h);
  // knit: rows of small V stitches
  const s=11*DPR;bx.lineWidth=1.6*DPR;
  for(let y=0,r=0;y<h+s;y+=s*0.8,r++)for(let x=(r%2)*s*0.5;x<w+s;x+=s){
    bx.strokeStyle='rgba(120,96,70,0.13)';bx.beginPath();bx.moveTo(x-s*0.32,y-s*0.3);bx.quadraticCurveTo(x-s*0.12,y+s*0.15,x,y+s*0.25);bx.quadraticCurveTo(x+s*0.12,y+s*0.15,x+s*0.32,y-s*0.3);bx.stroke();
    bx.strokeStyle='rgba(255,250,240,0.18)';bx.beginPath();bx.moveTo(x-s*0.3,y-s*0.34);bx.quadraticCurveTo(x-s*0.12,y+s*0.08,x-s*0.02,y+s*0.18);bx.stroke();
  }
  // window light from the top left, and a cooler bottom right
  const sun=bx.createRadialGradient(w*0.1,h*0.05,0,w*0.1,h*0.05,Math.max(w,h)*0.9);sun.addColorStop(0,'rgba(255,236,200,0.5)');sun.addColorStop(1,'rgba(255,236,200,0)');
  bx.fillStyle=sun;bx.fillRect(0,0,w,h);
  const sh=bx.createLinearGradient(0,h*0.6,0,h);sh.addColorStop(0,'rgba(80,60,40,0)');sh.addColorStop(1,'rgba(80,60,40,0.16)');bx.fillStyle=sh;bx.fillRect(0,0,w,h);
  blanket=bx.getImageData(0,0,w,h);
}

// ---------- session ----------
function newSession(){
  S=C.createSession({flow:(x,y)=>B.flow(x,y),mask:B.mask,seed});
  mapBuf=C.packRGBA(S.fur);
  gl.activeTexture(gl.TEXTURE0);if(mapTex)gl.deleteTexture(mapTex);mapTex=tex(S.fur.nx,S.fur.ny,mapBuf);
  P.length=0;hand.shown=0;hand.stuck.length=0;hand.clapT=-1;look.f=[-0.45,-0.42,0.79];stroked=false;hintEl.hidden=false;hintEl.textContent='顺着毛撸撸它';
}
const toBody=(cx,cy)=>{const y=(cy-oy)/Lc;return{x:(cx-ox)/Lc-B.bendX(y),y};};
const toCss=(x,y)=>[ox+(x+B.bendX(y))*Lc,oy+y*Lc];
const HB=()=>B.bendX(B.HEAD.y);   // the head rides on the bowed neck
const onHead=(x,y)=>{const [hx,hy]=headCenter();x+=B.bendX(y)-HB();return Math.hypot(x-hx,y-hy)<B.HEAD.r*1.05;};

function down(x,y){finger={x,y,lx:x,ly:y};S.down(x,y);lastFinger={x,y};}
function move(x,y){
  if(!finger)return;
  const dx=x-finger.lx,dy=y-finger.ly,len=Math.hypot(dx,dy);
  if(onHead(x,y)&&onHead(finger.lx,finger.ly)&&len>0.004){   // a head rub: she likes it, nothing to comb there
    if(S.cat.locked<=0)C.feel(S.cat,{kind:'with',len:len*0.8});finger.lx=x;finger.ly=y;S.finger={x,y};noteStroke();return;}
  const r=S.move(x,y);finger.lx=x;finger.ly=y;lastFinger={x,y};
  if(r&&r.kind!=='off'&&r.kind!=='still'){noteStroke();audio.rub(r.len);
    if(r.picked>0)for(let i=0;i<r.picked;i++)spawnHair(x,y);}
}
function up(){finger=null;S.up();}
function noteStroke(){if(!stroked){stroked=true;hintEl.hidden=true;}}

// ---------- loose hair ----------
function spawnHair(x,y){
  if(P.length>360)return;
  const [cx,cy]=toCss(x,y);
  P.push({x:cx-14+Math.random()*18,y:cy-22+Math.random()*14,vx:(Math.random()-0.5)*40,vy:-30-Math.random()*45,a:Math.random()*6.28,va:(Math.random()-0.5)*5,
    len:10+Math.random()*9,bend:(Math.random()-0.5)*0.9,col:Math.random()<0.75?'#e08a3a':'#f3e1c6',t:0,float:0.45+Math.random()*0.7,phase:'float',fx:0,fy:0,sx:0,sy:0});
}
function stuckSpot(){
  for(let i=0;i<40;i++){const x=Math.random()*hand.w,y=Math.random()*hand.h;if(hc.isPointInPath(hand.path,x,y))return[x,y];}
  return[hand.w*0.5,hand.h*0.7];
}
function updateHairs(dt){
  for(let i=P.length-1;i>=0;i--){const p=P[i];p.t+=dt;
    if(p.phase==='float'){p.vy+= -8*dt;p.vx*=1-1.5*dt;p.vy*=1-1.2*dt;p.x+=p.vx*dt+Math.sin(p.t*7+p.a)*10*dt;p.y+=p.vy*dt;p.a+=p.va*dt;
      if(p.t>p.float){p.phase='fly';p.t=0;p.sx=p.x;p.sy=p.y;const s=stuckSpot();p.fx=s[0];p.fy=s[1];}}
    else if(p.phase==='fly'){const k=Math.min(1,p.t/0.55),e=k*k*(3-2*k),tx=hand.x+p.fx,ty=hand.y+p.fy;
      p.x=lerp(p.sx,tx,e)+Math.sin(k*3.14)*(-30);p.y=lerp(p.sy,ty,e)-Math.sin(k*3.14)*40;p.a+=p.va*dt;
      if(k>=1){hand.stuck.push({x:p.fx,y:p.fy,a:p.a,len:p.len*0.8,bend:p.bend,col:p.col});if(hand.stuck.length>260)hand.stuck.shift();hand.shown++;P.splice(i,1);}}
    else{ // shaken off: drift down and fade
      p.vy+=90*dt;p.vx*=1-1.8*dt;p.vy*=1-1.6*dt;p.x+=p.vx*dt+Math.sin(p.t*6+p.a)*14*dt;p.y+=p.vy*dt;p.a+=p.va*dt;if(p.t>2.4||p.y>VH+20)P.splice(i,1);}
  }
}
function clap(){
  if(hand.shown===0&&S.fur.hand.hairs===0)return;
  C.clap(S.fur);audio.clap();
  for(const s of hand.stuck){if(P.length>420)break;P.push({x:hand.x+s.x,y:hand.y+s.y,vx:(Math.random()-0.35)*260,vy:-120-Math.random()*160,a:s.a,va:(Math.random()-0.5)*9,len:s.len,bend:s.bend,col:s.col,t:0,phase:'off'});}
  for(const p of P)if(p.phase!=='off'){p.phase='off';p.t=0;p.vy=-60;}
  hand.stuck.length=0;hand.shown=0;hand.clapT=0;
}

// ---------- mood → look ----------
let lastState='idle',purrPulse=0;
function animate(dt,t){
  const st=S.cat.state,cat=S.cat,k=1-Math.exp(-dt*6);
  if(st!==lastState){
    if(st==='bite'){bubble.text='啊呜！';bubble.t=1.1;hand.flinch=0.5;look.shake=0.28;audio.bite();vibe(60);}
    if(st==='lick'){bubble.text='舔舔';bubble.t=1.4;}
    if(st==='warn'){bubble.text='……';bubble.t=1.6;}
    lastState=st;
  }
  if(st!=='bite'&&st!=='lick'&&cat.look&&bubble.t<=0&&!bubble.lookShown){bubble.text='喵？';bubble.t=1.0;bubble.lookShown=true;}
  if(!cat.look)bubble.lookShown=false;
  let f=[-0.45,-0.42,0.79],eye=0.6,earBack=0,mouth=0,tongue=0,wag=0.25*Math.sin(t*0.6),puff=0,curl=0,hdx=0,hdy=0,twitch=0;
  // blink now and then
  look.blink-=dt;if(look.blink<-3.5-Math.random()*3)look.blink=0.14;
  if(cat.happy&&st!=='warn'){f=[-0.38,-0.3,0.87];eye=0;wag=0.55*Math.sin(t*2.2);curl=0.25;}
  if(st==='look'||(cat.look&&st!=='bite'&&st!=='lick')){f=[0.3,0.55,0.78];eye=1;earBack=0.2;wag=0.3*Math.sin(t*9)*0.5+0.2;}
  if(st==='warn'){const dx=lastFinger.x-B.HEAD.x,dy=lastFinger.y-B.HEAD.y;f=[dx*1.1,Math.max(0.15,dy*1.1),0.95];eye=0.7;earBack=1;
    wag=1.15*Math.sin(t*10.5)*Math.abs(Math.sin(t*5.25));puff=0.35;twitch=0.6*Math.max(0,Math.sin(t*3.1));}
  if(st==='bite'){const dx=lastFinger.x-B.HEAD.x,dy=lastFinger.y-B.HEAD.y,m=Math.hypot(dx,dy)||1;f=[dx/m*0.55,dy/m*0.55,0.83];eye=0.85;earBack=0.9;mouth=1;
    const reach=Math.min(0.085,m*0.5),ph=Math.min(1,cat.stateT/0.18);hdx=dx/m*reach*ph;hdy=dy/m*reach*ph;puff=0.7;wag=0.8*Math.sin(t*12);}
  if(st==='lick'){f=[0.3,0.75,0.42];eye=0.15;tongue=0.6+0.4*Math.sin(t*14);mouth=0.35;wag=0.2*Math.sin(t*2);}
  if(st!=='bite'&&st!=='lick'&&look.blink>0)eye=Math.min(eye,0.05);
  const kk=st==='bite'?1-Math.exp(-dt*18):k;
  look.f=norm([lerp(look.f[0],f[0],kk),lerp(look.f[1],f[1],kk),lerp(look.f[2],f[2],kk)]);
  look.eye=lerp(look.eye,eye,1-Math.exp(-dt*10));look.earBack=lerp(look.earBack,earBack,k);look.mouth=lerp(look.mouth,mouth,1-Math.exp(-dt*14));look.tongue=tongue;
  look.tailWag=lerp(look.tailWag,wag,1-Math.exp(-dt*9));look.tailPuff=lerp(look.tailPuff,puff,k*0.6);look.tailCurl=lerp(look.tailCurl,curl,k*0.5);
  look.headDX=lerp(look.headDX,hdx,kk);look.headDY=lerp(look.headDY,hdy,kk);look.twitch=lerp(look.twitch,twitch,k);
  look.purr=lerp(look.purr,cat.happy&&st!=='warn'&&st!=='bite'&&st!=='lick'?1:0,1-Math.exp(-dt*2));
  look.shake=Math.max(0,look.shake-dt);hand.flinch=Math.max(0,hand.flinch-dt);bubble.t-=dt;
  audio.purr(look.purr);
  if(look.purr>0.6&&finger){purrPulse-=dt;if(purrPulse<=0){purrPulse=0.83;vibe(14);}}
}
function vibe(ms){try{if(navigator.vibrate&&audio.on)navigator.vibrate(ms);}catch(e){}}

// ---------- drawing ----------
const trailU=new Float32Array(32),tailU=new Float32Array(20),earU=new Float32Array(12);
function draw(t){
  const sx=look.shake>0?Math.sin(t*90)*look.shake*14:0;
  const breath=1+Math.sin(t*6.2832*1.2)*0.006*(0.4+look.purr)+ (look.purr>0.5?Math.sin(t*150)*0.0012:0);
  const L=Lc*DPR*breath,o=[(ox+sx)*DPR-(breath-1)*0.3*Lc*DPR,oy*DPR-(breath-1)*0.5*Lc*DPR];
  // background + soft shadow under the cat
  bx.putImageData(blanket,0,0);
  bx.save();bx.translate(o[0],o[1]);bx.scale(L,L);
  const sg=bx.createRadialGradient(0.31,0.58,0.05,0.31,0.58,0.5);sg.addColorStop(0,'rgba(70,45,25,0.32)');sg.addColorStop(0.6,'rgba(70,45,25,0.12)');sg.addColorStop(1,'rgba(70,45,25,0)');
  bx.fillStyle=sg;bx.beginPath();bx.ellipse(0.31,0.57,0.3,0.48,0,0,Math.PI*2);bx.fill();bx.restore();

  gl.viewport(0,0,gl_c.width,gl_c.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  // upload the fur map (core marks what changed; a full re-pack is ~22 KB)
  if(S.fur.dirty){C.packRGBA(S.fur,mapBuf);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,mapTex);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,S.fur.nx,S.fur.ny,gl.RGBA,gl.UNSIGNED_BYTE,mapBuf);S.fur.dirty=null;}
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,statTex);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,mapTex);
  gl.uniform2f(U.u_res,gl_c.width,gl_c.height);gl.uniform2f(U.u_org,o[0],o[1]);gl.uniform1f(U.u_L,L);gl.uniform1f(U.u_time,t);gl.uniform1f(U.u_layers,LAYERS);
  gl.uniform1f(U.u_twitch,look.twitch);
  const tr=S.fur.trail,o_=S.fur.o;trailU.fill(0);
  for(let i=0;i<tr.length&&i<8;i++){const p=tr[i],age=S.fur.t-p.t,a=Math.exp(-age/o_.trailTau)*Math.cos(6.2832*o_.trailHz*age);trailU.set([p.x,p.y,p.vx*a,p.vy*a],i*4);}
  gl.uniform4fv(U.u_trail,trailU);
  gl.uniform3f(U.u_finger,finger?finger.lx:0,finger?finger.ly:0,finger&&S.cat.locked<=0?1:0);
  const tp=B.tailPoints(look.tailWag,look.tailCurl,10);tp.forEach((p,i)=>{tailU[i*2]=p[0];tailU[i*2+1]=p[1];});gl.uniform2fv(U.u_tail,tailU);
  gl.uniform1f(U.u_tailR,0.034);gl.uniform1f(U.u_tailPuff,look.tailPuff);
  const [hx,hy]=headCenter();gl.uniform3f(U.u_head,hx,hy,B.HEAD.r);
  const nose=face(0,-0.12);gl.uniform2f(U.u_nose,nose[0],nose[1]);
  const top=hp(0,1,0.2,1);const ux=top[0]-hx,uy=top[1]-hy,um=Math.hypot(ux,uy)||1;gl.uniform2f(U.u_up2,ux/um,uy/um);
  const E=ears();E.forEach((e,i)=>e.forEach((q,j)=>{earU[(i*3+j)*2]=q[0];earU[(i*3+j)*2+1]=q[1];}));gl.uniform2fv(U.u_ears,earU);
  gl.uniform1f(U.u_earVis0,1);gl.uniform1f(U.u_earVis1,1);
  gl.uniform1f(U.u_headPuff,look.earBack*0.15);
  // tail, body, head: each a quad over its own bounding box
  let tx0=1,tx1=0,ty0=1,ty1=0;for(const p of tp){tx0=Math.min(tx0,p[0]);tx1=Math.max(tx1,p[0]);ty0=Math.min(ty0,p[1]);ty1=Math.max(ty1,p[1]);}
  const pad=0.11;
  quad(0,o,L,tx0-pad,ty0-pad,tx1+pad+B.BEND,ty1+pad,1);
  quad(0,o,L,-0.04,-0.04,A+0.04+B.BEND,1.04,0);
  quad(0,o,L,hx+HB()-B.HEAD.r*1.9,hy-B.HEAD.r*2.1,hx+HB()+B.HEAD.r*1.9,hy+B.HEAD.r*1.7,2);
  drawFx(t,o,L,E);
}
function quad(_,o,L,x0,y0,x1,y1,mode){
  gl.uniform1f(U.u_mode,mode);gl.uniform4f(U.u_rect,o[0]+x0*L,o[1]+y0*L,(x1-x0)*L,(y1-y0)*L);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}

function drawFx(t,o,L,E){
  const c=fc;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,fx.width,fx.height);
  c.setTransform(L,0,0,L,o[0]+HB()*L,o[1]);
  drawCollar(c);
  drawFace(c,t,E);
  // purr marks by the chin
  if(look.purr>0.3){const [hx,hy]=headCenter(),a=look.purr*(0.55+0.45*Math.sin(t*7.5));c.lineWidth=0.006;c.strokeStyle=`rgba(120,70,30,${0.55*a})`;
    for(let i=0;i<3;i++){const r=B.HEAD.r*(1.12+i*0.13+0.03*Math.sin(t*7.5));c.beginPath();c.arc(hx,hy,r,Math.PI*0.62,Math.PI*0.88);c.stroke();}}
  c.setTransform(DPR,0,0,DPR,0,0);
  // bubble text
  const bt=bubble.t>0?bubble.text:look.purr>0.55?'呼噜呼噜':'';
  if(bt){const [hx,hy]=headCenter();const x=ox+(hx+HB()-B.HEAD.r*1.9)*Lc,y=oy+(hy-B.HEAD.r*0.4)*Lc;drawBubble(c,bt,Math.max(54,x),Math.max(hand.y+hand.h+30,y),bubble.t>0?Math.min(1,bubble.t*3):0.55+0.45*look.purr);}
  // loose hair in the air
  for(const p of P){c.save();c.translate(p.x,p.y);c.rotate(p.a);c.globalAlpha=p.phase==='off'?Math.max(0,1-p.t/2.4):1;c.strokeStyle='rgba(90,45,15,0.35)';c.lineWidth=2.6;c.beginPath();c.moveTo(-p.len/2,0);c.quadraticCurveTo(0,p.bend*p.len,p.len/2,0);c.stroke();c.strokeStyle=p.col;c.lineWidth=1.5;
    c.beginPath();c.moveTo(-p.len/2,0);c.quadraticCurveTo(0,p.bend*p.len,p.len/2,0);c.stroke();c.restore();}
  drawHand(c,t);
}
function drawBubble(c,text,x,y,a){
  c.save();c.globalAlpha=a;c.font='700 17px "PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",system-ui,sans-serif';
  const w=c.measureText(text).width+20;c.fillStyle='rgba(255,250,242,0.92)';c.strokeStyle='rgba(90,60,30,0.35)';c.lineWidth=1;
  c.beginPath();c.roundRect(x-w/2,y-16,w,32,16);c.fill();c.stroke();c.fillStyle='#6b3d16';c.textAlign='center';c.textBaseline='middle';c.fillText(text,x,y+1);c.restore();
}
function drawToes(c){
  c.strokeStyle='rgba(150,110,80,0.55)';c.lineWidth=0.003;c.lineCap='round';
  for(const p of B.PAWS){const tx=p[2],ty=p[3]-p[4]*0.55;for(const dx of [-0.012,0.012]){c.beginPath();c.moveTo(tx+dx,ty-0.004);c.lineTo(tx+dx*1.1,ty+0.014);c.stroke();}}
}
function drawCollar(c){
  // a little cream chalk bag with a pink paw print, peeking out under the chin
  const x=0.338,y=0.272;{const [hx,hy]=headCenter();if(Math.hypot(x-hx,y-hy)<B.HEAD.r*1.02)return;}c.save();c.translate(x,y);c.rotate(0.15);
  c.fillStyle='#f1e2c8';c.strokeStyle='rgba(110,80,50,0.5)';c.lineWidth=0.0025;c.beginPath();c.roundRect(-0.022,-0.018,0.044,0.04,0.008);c.fill();c.stroke();
  c.fillStyle='#e79aa5';c.beginPath();c.arc(0,0.006,0.0075,0,Math.PI*2);c.fill();
  for(const [dx,dy] of [[-0.009,-0.006],[-0.003,-0.011],[0.004,-0.011],[0.01,-0.006]]){c.beginPath();c.arc(dx,dy,0.0032,0,Math.PI*2);c.fill();}
  c.restore();
}
function setFeature(c,a,b){
  // affine transform for a face feature at (a,b): tangent vectors by finite differences, so features foreshorten with the head
  const p=face(a,b),pa=face(a+0.02,b),pb=face(a,b-0.02);
  c.setTransform(1,0,0,1,0,0);
  return{p,ux:(pa[0]-p[0])/0.02,uy:(pa[1]-p[1])/0.02,vx:(pb[0]-p[0])/0.02,vy:(pb[1]-p[1])/0.02};
}
function featureCtx(c,F,L,o){const k=L/B.HEAD.r*0.95;c.setTransform(F.ux*k,F.uy*k,F.vx*k,F.vy*k,o[0]+(F.p[0]+HB())*L,o[1]+F.p[1]*L);}
function drawFace(c,t,E){
  const L=Lc*DPR,o=[ox*DPR+(look.shake>0?Math.sin(t*90)*look.shake*14*DPR:0),oy*DPR];
  // head tuft
  const tuft=hp(0.05,1.02,0.15,1.0);
  if(tuft[2]>-0.3){c.setTransform(L,0,0,L,o[0]+HB()*L,o[1]);c.strokeStyle='#d9771f';c.lineWidth=0.006;c.lineCap='round';
    for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(tuft[0]+i*0.006,tuft[1]+0.01);c.quadraticCurveTo(tuft[0]+i*0.012-0.01,tuft[1]-0.03,tuft[0]+i*0.02+0.012,tuft[1]-0.038-Math.abs(i)*-0.006);c.stroke();}}
  for(const s of [-1,1]){
    const F=setFeature(c,s*0.36,0.1);if(F.p[2]<0.08)continue;
    featureCtx(c,F,L,o);c.lineCap='round';c.lineJoin='round';
    const e=look.eye;
    if(e<0.12){ // happy closed eye: an arch with lashes (like the 小橘 sheet)
      c.strokeStyle='#2a1a10';c.lineWidth=0.0065;c.beginPath();c.moveTo(-0.022*s,0.002);c.quadraticCurveTo(0,-0.022,0.024*s,0.0);c.stroke();
      c.lineWidth=0.004;c.beginPath();c.moveTo(0.024*s,0);c.lineTo(0.032*s,-0.008);c.stroke();
      c.fillStyle='rgba(240,120,120,0.28)';c.beginPath();c.ellipse(0,0.028,0.024,0.012,0,0,Math.PI*2);c.fill();
    }else{
      const h=0.021*(0.3+0.85*e),w=0.026;
      c.fillStyle='#f0a62c';c.beginPath();c.ellipse(0,0,w,h,0,0,Math.PI*2);c.fill();
      const pw=S.cat.state==='warn'?0.004:e>0.9?0.012:0.007;c.fillStyle='#1d120b';c.beginPath();c.ellipse(0.002*s,0,pw,h*0.9,0,0,Math.PI*2);c.fill();
      c.fillStyle='rgba(255,255,255,0.85)';c.beginPath();c.arc(-0.008*s,-h*0.4,0.0045,0,Math.PI*2);c.fill();
      c.strokeStyle='#22140c';c.lineWidth=0.0055;c.beginPath();c.ellipse(0,0,w,h,0,Math.PI*1.05,Math.PI*1.95);c.stroke();
      c.lineWidth=0.004;c.beginPath();c.moveTo(w*s*0.95,-h*0.3);c.lineTo((w+0.012)*s,-h*0.9);c.stroke();   // the eyeliner flick
      if(S.cat.state==='warn'){c.strokeStyle='#22140c';c.lineWidth=0.005;c.beginPath();c.moveTo(-w*s,-h*1.6);c.lineTo(w*s*0.8,-h*0.9);c.stroke();}
    }
  }
  // nose, mouth
  let F=setFeature(c,0,-0.13);
  if(F.p[2]>0.05){featureCtx(c,F,L,o);c.fillStyle='#e58a91';c.beginPath();c.moveTo(-0.011,-0.005);c.lineTo(0.011,-0.005);c.lineTo(0,0.008);c.closePath();c.fill();}
  F=setFeature(c,0,-0.27);
  if(F.p[2]>0.05){featureCtx(c,F,L,o);c.strokeStyle='#4a2a18';c.lineWidth=0.004;c.lineCap='round';
    if(look.mouth>0.25){const m=look.mouth;c.fillStyle='#6b1f22';c.beginPath();c.ellipse(0,0.004+0.01*m,0.024,0.024*m,0,0,Math.PI*2);c.fill();
      c.fillStyle='#fff';for(const s of [-1,1]){c.beginPath();c.moveTo(s*0.014,-0.012*m);c.lineTo(s*0.008,-0.012*m);c.lineTo(s*0.011,0.004*m);c.closePath();c.fill();}
      if(look.tongue>0){c.fillStyle='#ee8f98';c.beginPath();c.ellipse(0,0.016*m+0.01*look.tongue,0.012,0.012*look.tongue+0.004,0,0,Math.PI*2);c.fill();}}
    else{c.beginPath();c.moveTo(-0.018,-0.006);c.quadraticCurveTo(-0.009,0.006,0,-0.004);c.quadraticCurveTo(0.009,0.006,0.018,-0.006);c.stroke();}
    // whiskers
    c.strokeStyle='rgba(255,250,240,0.8)';c.lineWidth=0.0022;
    for(const s of [-1,1])for(let i=0;i<3;i++){c.beginPath();c.moveTo(s*0.03,-0.01+i*0.007);c.quadraticCurveTo(s*0.07,-0.02+i*0.012,s*0.11,-0.012+i*0.02);c.stroke();}}
  c.setTransform(1,0,0,1,0,0);
}
function drawHand(c,t){
  c.save();
  const shake=hand.flinch>0?Math.sin(t*70)*hand.flinch*10:0;
  const clapK=hand.clapT>=0?hand.clapT:-1;
  c.translate(hand.x+shake,hand.y);
  const lvl=C.handLevel({hairs:hand.shown});
  // fluffy fringe when the hand is really furry
  if(lvl>=3){c.save();c.strokeStyle=lvl>=4?'rgba(226,140,60,0.9)':'rgba(226,140,60,0.6)';c.lineWidth=1.3;
    for(let i=0;i<(lvl>=4?160:80);i++){const a=i*2.399,r=hand.w*0.5;let x=hand.w*0.5+Math.cos(a)*r*0.75,y=hand.h*0.55+Math.sin(a)*r*0.95;
      for(let s=0;s<6;s++){if(!hc.isPointInPath(hand.path,x,y))break;x+=Math.cos(a)*3;y+=Math.sin(a)*3;}
      c.beginPath();c.moveTo(x-Math.cos(a)*2,y-Math.sin(a)*2);c.lineTo(x+Math.cos(a+Math.sin(i)*0.6)*(lvl>=4?9:6),y+Math.sin(a+Math.sin(i)*0.6)*(lvl>=4?9:6));c.stroke();}
    c.restore();}
  if(clapK>=0&&clapK<0.6){const k=Math.abs(Math.sin(clapK/0.6*Math.PI*2));c.save();c.translate(hand.w*0.5,0);c.scale(-1,1);c.translate(-hand.w*0.5-hand.w*(0.25+0.5*k),0);c.globalAlpha=0.9;drawPalm(c,0);c.restore();}
  drawPalm(c,lvl);
  for(const s of hand.stuck){c.save();c.translate(s.x,s.y);c.rotate(s.a);c.strokeStyle=s.col;c.lineWidth=1.1;c.beginPath();c.moveTo(-s.len/2,0);c.quadraticCurveTo(0,s.bend*s.len,s.len/2,0);c.stroke();c.restore();}
  c.restore();
  // label
  const names=['干净','几根','一层','毛手套','毛茸茸大爪'];
  c.save();c.font='600 13px "PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",system-ui,sans-serif';c.fillStyle='#5b4330';c.textBaseline='top';
  const lx=hand.x+hand.w+8,ly=hand.y+hand.h*0.22;
  c.fillText(hand.shown?`一手毛 ${hand.shown} 根`:'手：干净',lx,ly);
  if(hand.shown){c.font='12px "PingFang SC","Hiragino Sans GB",system-ui,sans-serif';c.fillStyle='#8a6d55';c.fillText(`${names[lvl]} · 点手拍掉`,lx,ly+18);}
  c.restore();
}
function drawPalm(c,lvl){
  c.strokeStyle='rgba(120,80,50,0.6)';c.lineWidth=2.6;c.stroke(hand.path);c.fillStyle=lvl>=4?'#f0b98f':'#f3c9a6';c.fill(hand.path);
  if(lvl>=4){c.fillStyle='#e9959e';c.beginPath();c.ellipse(hand.w*0.51,hand.h*0.72,hand.w*0.16,hand.h*0.1,0,0,Math.PI*2);c.fill();}
}

// ---------- sound (synthesised, no files) ----------
const audio={on:true,ctx:null,purrG:null,rubG:null,
  init(){if(this.ctx||!this.on)return;try{const ctx=new (window.AudioContext||window.webkitAudioContext)();this.ctx=ctx;
    const n=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;this.noise=n;
    // purr: low noise, chopped at ~24 Hz, swelling with the breath
    const src=ctx.createBufferSource();src.buffer=n;src.loop=true;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=260;
    const chop=ctx.createGain();chop.gain.value=0.5;const lfo=ctx.createOscillator();lfo.frequency.value=24;const lg=ctx.createGain();lg.gain.value=0.5;lfo.connect(lg).connect(chop.gain);
    this.purrG=ctx.createGain();this.purrG.gain.value=0;src.connect(lp).connect(chop).connect(this.purrG).connect(ctx.destination);src.start();lfo.start();
    // rub: brushed fur, band-passed noise
    const s2=ctx.createBufferSource();s2.buffer=n;s2.loop=true;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=2600;bp.Q.value=0.7;
    this.rubG=ctx.createGain();this.rubG.gain.value=0;s2.connect(bp).connect(this.rubG).connect(ctx.destination);s2.start();
  }catch(e){this.ctx=null;}},
  purr(level){if(!this.ctx)return;const t=this.ctx.currentTime,br=0.6+0.4*Math.sin(t*6.2832*1.2);this.purrG.gain.setTargetAtTime(this.on?level*0.5*br:0,t,0.08);},
  rub(len){if(!this.ctx||!this.on)return;const t=this.ctx.currentTime;this.rubG.gain.cancelScheduledValues(t);this.rubG.gain.setTargetAtTime(Math.min(0.12,len*3),t,0.02);this.rubG.gain.setTargetAtTime(0,t+0.06,0.08);},
  burst(f,dur,vol){if(!this.ctx||!this.on)return;const ctx=this.ctx,s=ctx.createBufferSource();s.buffer=this.noise;const b=ctx.createBiquadFilter();b.type='bandpass';b.frequency.value=f;b.Q.value=1.2;
    const g=ctx.createGain();const t=ctx.currentTime;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);s.connect(b).connect(g).connect(ctx.destination);s.start(t,Math.random());s.stop(t+dur+0.02);},
  bite(){this.burst(1800,0.07,0.5);setTimeout(()=>this.burst(900,0.09,0.35),70);},
  clap(){this.burst(1400,0.06,0.7);setTimeout(()=>this.burst(1500,0.06,0.6),160);},
};
soundBtn.addEventListener('click',()=>{audio.on=!audio.on;soundBtn.textContent=audio.on?'声音 开':'声音 关';soundBtn.setAttribute('aria-pressed',String(audio.on));if(audio.on)audio.init();});

// ---------- input ----------
const inHand=(x,y)=>x>=hand.x-8&&x<=hand.x+hand.w+130&&y>=hand.y-8&&y<=hand.y+hand.h+8;   // the hand and its label to the right
let pid=null;
fx.addEventListener('pointerdown',e=>{
  audio.init();
  if(inHand(e.clientX,e.clientY)){clap();return;}
  pid=e.pointerId;fx.setPointerCapture(pid);const b=toBody(e.clientX,e.clientY);down(b.x,b.y);e.preventDefault();});
fx.addEventListener('pointermove',e=>{if(e.pointerId!==pid||!finger)return;
  const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];for(const ev of (evs.length?evs:[e])){const b=toBody(ev.clientX,ev.clientY);move(b.x,b.y);}e.preventDefault();});
const end=e=>{if(e.pointerId!==pid)return;pid=null;up();};
fx.addEventListener('pointerup',end);fx.addEventListener('pointercancel',end);
window.addEventListener('keydown',e=>{
  if(e.key===' '||e.key==='ArrowDown'){auto.push({from:[B.SP,0.32],to:[B.SP,0.72],dur:0.45});e.preventDefault();}
  else if(e.key==='ArrowUp'){auto.push({from:[B.SP-0.04,0.72],to:[B.SP-0.04,0.34],dur:0.45});e.preventDefault();}
  else if(e.key==='c'||e.key==='C'){clap();}
});
window.addEventListener('resize',()=>{layout();});

// automatic strokes (keyboard and the fixed views go through the same down/move/up as a finger)
const auto=[];let autoCur=null;
function runAuto(dt){
  if(!autoCur&&auto.length){autoCur=Object.assign({t:0},auto.shift());down(autoCur.from[0],autoCur.from[1]);}
  if(!autoCur)return;autoCur.t+=dt;const k=Math.min(1,autoCur.t/autoCur.dur),e=k*k*(3-2*k);
  move(autoCur.from[0]+(autoCur.to[0]-autoCur.from[0])*e,autoCur.from[1]+(autoCur.to[1]-autoCur.from[1])*e);
  if(k>=1){if(!autoCur.hold)up();autoCur=null;}
}

// ---------- loop ----------
let T=0,last=performance.now();
function update(dt){
  T+=dt;runAuto(dt);S.step(dt);updateHairs(dt);animate(dt,T);
  if(hand.clapT>=0){hand.clapT+=dt;if(hand.clapT>0.7)hand.clapT=-1;}
}
function frame(now){
  const dt=Math.min(1/30,(now-last)/1000);last=now;
  if(!frozen)update(dt);
  draw(T);
  requestAnimationFrame(frame);
}

// ---------- fixed views ----------
function sim(secs){for(let t=0;t<secs;t+=1/60)update(1/60);}
function strokes(list){for(const s of list){auto.push(s);}while(auto.length||autoCur)update(1/60);}
const DOWN=(x,d)=>({from:[x,0.32],to:[x,0.7],dur:d||0.4});
const UPS=(x,d)=>({from:[x,0.7],to:[x,0.33],dur:d||0.4});
function goView(v){
  if(v==='smooth'){for(let i=0;i<9;i++){strokes([DOWN(B.SP+((i%3)-1)*0.025)]);sim(0.3);}sim(0.4);}
  else if(v==='ruffle'){strokes([DOWN(B.SP)]);sim(0.3);for(let i=0;i<4;i++){strokes([UPS(B.SP-0.05+(i%2)*0.02,0.35)]);sim(0.1);}sim(0.35);}
  else if(v==='warn'){for(let i=0;i<120&&S.cat.state!=='warn';i++){strokes([DOWN(B.SP+((i%3)-1)*0.03,0.3)]);sim(0.05);}strokes([DOWN(B.SP,0.3)]);sim(0.2);}
  else if(v==='bite'){for(let i=0;i<200&&S.cat.state!=='bite';i++){strokes([DOWN(B.SP+((i%3)-1)*0.03,0.3)]);sim(0.05);}sim(0.16);}
  else if(v==='furry'||v==='clap'){for(let i=0;i<34;i++){const x=B.SP+(((i*7)%5)-2)*0.035;strokes([i%5===4?UPS(x,0.35):DOWN(x,0.35)]);sim(0.6);if(S.cat.state==='bite'||S.cat.state==='lick')sim(2.6);}sim(2.2);
    if(v==='clap'){clap();sim(0.3);}}
  else sim(0.3);
  frozen=true;viewDone=true;
}

// ---------- hooks ----------
// where the cat is on screen (css px), fur and ears included: for layout checks
function catBox(){
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;const add=(x,y,pad)=>{const [cx,cy]=toCss(x,y);x0=Math.min(x0,cx-pad*Lc);x1=Math.max(x1,cx+pad*Lc);y0=Math.min(y0,cy-pad*Lc);y1=Math.max(y1,cy+pad*Lc);};
  for(let y=0.15;y<=0.9;y+=0.01)for(let x=0;x<=A;x+=0.01)if(B.sdf(x,y)<0)add(x,y,0.025);
  for(const p of B.tailPoints(look.tailWag,look.tailCurl,10))add(p[0],p[1],0.06);
  const [hx,hy]=headCenter();add(hx,hy,B.HEAD.r*1.1);for(const e of ears())add(e[0][0],e[0][1],0.01);
  return{x:x0,y:y0,w:x1-x0,h:y1-y0};
}
function backStats(){return C.regionStats(S.fur,B.SP-0.06,0.36,B.SP+0.06,0.7);}
window.__lumao={get ready(){return started&&viewDone;},view:VIEW,
  probe(){const st=backStats();return{view:VIEW,state:S.cat.state,happy:S.cat.happy,look:S.cat.look,bites:S.cat.bites,content:+S.cat.content.toFixed(3),over:+S.cat.over.toFixed(3),annoy:+S.cat.annoy.toFixed(3),
    hairsCore:S.fur.hand.hairs,hairsShown:hand.shown,airborne:P.length,handLevel:C.handLevel({hairs:hand.shown}),backMess:+st.mess.toFixed(3),backShine:+st.shine.toFixed(3),hint:!hintEl.hidden,frozen,layers:LAYERS,
    layout:{VW,VH,Lc,ox,oy,hand:{x:hand.x,y:hand.y,w:hand.w,h:hand.h},label:{x:hand.x+hand.w+8,y:hand.y+hand.h*0.22,w:130,h:36},cat:catBox()}};},
  stroke(dir){auto.push(dir==='up'?UPS(B.SP-0.04):DOWN(B.SP));},clap,
  renderer(){const d=gl.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}};
window.__PLAYTEST__={get ready(){return started&&viewDone;},snapshot:()=>window.__lumao.probe(),reset(){newSession();frozen=false;},setSeed(n){seed=n|0||7;newSession();},step(ms){sim(ms/1000);}};

layout();newSession();
if(VIEW)goView(VIEW);
started=true;
requestAnimationFrame(frame);
})();
