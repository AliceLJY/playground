// 撸猫撸了一手毛 game. The cat is a side-view picture split into layers (body, head states, tail) and moved in one
// WebGL pass: the body bends (arch, press, raised rump, crouch, hop, breath, skin twitch), the tail turns about its root,
// the head swaps expressions and turns about the neck. Fur strands only appear where the hand has changed the fur:
// untouched fur is the picture itself. The fur state lives in core.js. Numbers are in SPEC.md.
(function(){
'use strict';
const C=window.LumaoCore,POSES=window.LumaoCat.poses;
const qs=new URLSearchParams(location.search);
// three poses: standing side-on, on her back (belly up, a trap), asleep on her side (stroke her awake)
const POSE_OPT={stand:{},belly:{overMul:3},sleep:{asleep:true}};   // on her back she purrs first, then the trap shuts
const POSE_NAME={stand:'站着',belly:'躺着',sleep:'睡着'};
let POSE=POSES[qs.get('pose')]?qs.get('pose'):'stand',K=POSES[POSE];
const VIEW=qs.get('view')||'',LAYERS=qs.get('q')==='low'?6:10;
const $=id=>document.getElementById(id);
const bg=$('bg'),gl_c=$('gl'),fx=$('fx'),hintEl=$('hint'),soundBtn=$('sound');
const bx=bg.getContext('2d'),fc=fx.getContext('2d'),hc=document.createElement('canvas').getContext('2d');   // hc: hit tests in hand units
let AT=K.aspect,T0=K.torso.p0,T1=K.torso.p1;const ACROSS=0.56;
let DPR=Math.min(2,window.devicePixelRatio||1),VW=0,VH=0,cw=0,ch=0,ox=0,oy=0;   // css: the cat picture's rect
let seed=Number(qs.get('seed'))||7;
let S,frozen=false,viewDone=!VIEW,started=false,stroked=false,loaded=false;

// ---------- geometry: picture units t (0..1) ↔ fur units c (x across the side, back→belly; y along, head→tail) ----------
const t2c=(tx,ty)=>[(ty-T0[1])/(T1[1]-T0[1])*ACROSS,(tx-T0[0])/(T1[0]-T0[0])];
const c2t=(cx,cy)=>[T0[0]+cy*(T1[0]-T0[0]),T0[1]+cx/ACROSS*(T1[1]-T0[1])];
// fur grain on a cat's side: backward, and a little downward lower on the flank
function flow(x){const f=0.32*(x/ACROSS),m=Math.hypot(f,1);return[f/m,1/m];}
const maskAt=(x,y)=>{const i=Math.floor(x/ACROSS*56),j=Math.floor(y*100);return(i<0||j<0||i>=56||j>=100)?0:+(K.mask[j][i]==='1');};
function usePose(p){POSE=p;K=POSES[p];AT=K.aspect;T0=K.torso.p0;T1=K.torso.p1;}

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
uniform vec2 u_res,u_org,u_sz;
uniform sampler2D u_base,u_va,u_vb,u_masks,u_map,u_kmask;
uniform float u_vmix,u_aBase,u_bBase,u_time,u_layers;
uniform vec4 u_torso;uniform vec2 u_tailPivot,u_neckPivot;uniform float u_tailLen;
uniform float u_tailAng,u_tailTip,u_headRot;uniform vec2 u_headOff;
uniform float u_arch,u_butt,u_crouch,u_hop,u_breath,u_twitch,u_sway;uniform vec3 u_press;
uniform vec4 u_trail[8];uniform vec3 u_finger;uniform float u_at,u_py,u_floor,u_bellyY;
#define AT u_at
#define PY u_py
const float ACROSS=${ACROSS.toFixed(3)},DENS=150.,FL=0.03,R=0.08;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
// how the body is pushed around, in picture units (positive y = down). Paws stay planted: the weight fades out below the belly.
vec2 disp(vec2 t){
  float tw=u_torso.z-u_torso.x;
  float wv=smoothstep(u_floor,u_bellyY,t.y);
  float along=clamp((t.x-u_torso.x+0.03)/(tw+0.06),0.,1.);
  float y=0.;
  y-=u_arch*wv*sin(3.14159*along);
  y-=u_butt*wv*smoothstep(u_torso.x+0.56*tw,u_torso.z+0.035,t.x);
  y+=u_crouch*wv;
  y-=u_breath*wv*smoothstep(u_bellyY+0.05,u_bellyY-0.2,t.y)*sin(3.14159*along);
  vec2 dp=(t-u_press.xy)*vec2(AT,1.);
  y+=u_press.z*wv*exp(-dot(dp,dp)/0.0036);
  y+=u_twitch*sin(t.x*95.-u_time*24.)*smoothstep(u_torso.y+0.125,u_torso.y+0.005,t.y)*smoothstep(u_torso.x+0.05,u_torso.x+0.15,t.x)*smoothstep(u_torso.z+0.015,u_torso.z-0.085,t.x);
  return vec2(u_sway*wv,y*PY-u_hop*PY);
}
vec2 rot(vec2 v,float a){float c=cos(a),s=sin(a);return vec2(v.x*c-v.y*s,v.x*s+v.y*c);}
vec4 tex(sampler2D s,vec2 t){if(t.x<0.||t.y<0.||t.x>1.||t.y>1.)return vec4(0.);return texture2D(s,t);}
vec2 toC(vec2 t){return vec2((t.y-u_torso.y)/(u_torso.w-u_torso.y)*ACROSS,(t.x-u_torso.x)/(u_torso.z-u_torso.x));}
vec2 toT(vec2 c){return vec2(u_torso.x+c.y*(u_torso.z-u_torso.x),u_torso.y+c.x/ACROSS*(u_torso.w-u_torso.y));}
vec4 over(vec4 top,vec4 bot){float a=top.a+bot.a*(1.-top.a);return vec4((top.rgb*top.a+bot.rgb*bot.a*(1.-top.a))/max(a,1e-4),a);}
void main(){
  vec2 px=vec2(gl_FragCoord.x,u_res.y-gl_FragCoord.y);
  vec2 t=(px-u_org)/u_sz;
  vec2 src=t-disp(t);
  // ---- tail: turns about its root; the root rides on the body ----
  vec2 piv=u_tailPivot+disp(u_tailPivot);
  vec2 rel=(t-piv)*vec2(AT,1.);float s=clamp(length(rel)/u_tailLen,0.,1.2);
  float th=u_tailAng*(0.25+0.75*s)+u_tailTip*s*s*s;
  vec2 srcT=u_tailPivot+rot(rel,-th)/vec2(AT,1.);
  vec4 tailC=tex(u_base,srcT);float tT=tex(u_masks,srcT).g;
  // ---- body (head and tail cut out of it) ----
  vec4 m=tex(u_masks,src);
  vec4 body=tex(u_base,src);
  // ---- fur: strands only where the hand changed something ----
  vec2 c=toC(src);
  float kin=tex(u_kmask,vec2(c.x/ACROSS,c.y)).r*step(0.5,body.a);
  if(kin>0.01){
    vec4 mp=texture2D(u_map,vec2(c.x/ACROSS,c.y));
    vec2 dir=normalize(mp.rg*2.-1.+1e-5);float mess=mp.b;
    vec2 fl=normalize(vec2(0.32*c.x/ACROSS,1.));
    vec2 bend=vec2(0.);
    for(int i=0;i<8;i++){vec4 q=u_trail[i];float d=length(c-q.xy);float w=max(0.,1.-d/(R*1.4));bend+=q.zw*w*w;}
    float press=u_finger.z*max(0.,1.-length(c-u_finger.xy)/R);
    float k=clamp(abs(mess-0.19)*3.6+(1.-dot(dir,fl))*1.3+length(bend)*4.+press*0.9,0.,1.)*kin;
    if(k>0.02){
      vec2 clump=vec2(vnoise(c*30.),vnoise(c*30.+17.3))-0.5;
      vec2 ld=normalize(dir+clump*mess*3.+bend*2.2+1e-5);
      vec2 lean=ld*FL*k*(1.-0.45*mess)*(1.+0.6*mess);
      float hit=0.,hh=0.,r_=0.;vec2 rc=c;
      for(int j=11;j>=0;j--){
        if(float(j)>=u_layers)continue;
        float h=(float(j)+0.5)/u_layers;
        vec2 b=c-lean*h;
        vec2 g=b*DENS;vec2 id=floor(g);vec2 f=fract(g)-0.5;
        float r1=hash(id),r2=hash(id+7.13),r3=hash(id+3.71);
        f-=(vec2(r2,r3)-0.5)*0.6;
        float Ls=0.45+0.55*r1;if(h>Ls)continue;
        if(length(f)>0.44*(1.-0.7*h/Ls))continue;
        if(tex(u_kmask,vec2(b.x/ACROSS,b.y)).r<0.5)continue;
        hit=1.;hh=h/Ls;rc=b;r_=r2;break;
      }
      vec4 rootC=tex(u_base,toT(rc));
      float shade=hit>0.5?mix(0.74,1.07,hh)*(0.93+0.14*fract(hh*7.+r_)):0.76;
      body.rgb=mix(body.rgb,rootC.rgb*shade,k);
      // combed fur lying along its grain catches the window light in long streaks
      float shine=pow(max(0.,dot(dir,fl)),4.)*(1.-mess)*(1.-mess);
      float streak=vnoise(vec2(dot(c,ld)*6.,dot(c,vec2(-ld.y,ld.x))*70.));
      float bandy=smoothstep(0.75,0.35,c.x/ACROSS);   // the light from above catches the top of the back most
      body.rgb+=vec3(1.,0.9,0.72)*max(0.,shine-0.6)*2.4*(0.45+0.55*streak)*0.22*bandy*kin;
    }
  }
  // ---- head: expressions cross-faded, turning about the neck ----
  vec2 nk=u_neckPivot;
  vec2 srcH=nk+rot((src-nk-u_headOff)*vec2(AT,1.),-u_headRot)/vec2(AT,1.);
  float hr=tex(u_masks,srcH).r;
  vec4 ha=tex(u_va,srcH),hb=tex(u_vb,srcH);
  vec4 head=vec4(mix(ha.rgb*ha.a,hb.rgb*hb.a,u_vmix),mix(ha.a,hb.a,u_vmix));   // premultiplied
  // layers replace each other inside their own regions instead of stacking: where nothing moved, the result is the picture,
  // with no seam; where the head or tail moved, its old place shows what the moved layer has there (often nothing)
  vec4 o=vec4(body.rgb*body.a,body.a);
  float wT=max(m.g,tT);o=mix(o,vec4(tailC.rgb*tailC.a,tailC.a),wT);
  float wH=max(m.b,hr);o=mix(o,head,wH);
  if(o.a<0.004)discard;
  gl_FragColor=vec4(o.rgb/o.a,o.a);
}`;
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
const prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);
if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const U={};for(const n of ['u_res','u_org','u_sz','u_base','u_va','u_vb','u_masks','u_map','u_kmask','u_vmix','u_aBase','u_bBase','u_time','u_layers','u_torso','u_tailPivot','u_neckPivot','u_tailLen',
  'u_tailAng','u_tailTip','u_headRot','u_headOff','u_arch','u_butt','u_crouch','u_hop','u_breath','u_twitch','u_sway','u_press','u_trail','u_finger','u_rect','u_at','u_py','u_floor','u_bellyY'])U[n]=gl.getUniformLocation(prog,n);
const qb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,qb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);
const al=gl.getAttribLocation(prog,'a');gl.enableVertexAttribArray(al);gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);
gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
function texFrom(src,unit,w,h,fmt){gl.activeTexture(gl.TEXTURE0+unit);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  if(w)gl.texImage2D(gl.TEXTURE_2D,0,fmt||gl.RGBA,w,h,0,fmt||gl.RGBA,gl.UNSIGNED_BYTE,src);else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);return t;}
// texture units: 0 base, 1 head A, 2 head B, 3 masks (r head region, g tail, b head without the chest), 4 fur map, 5 fur-map mask
function kmaskTex(k){const a=new Uint8Array(56*100);for(let j=0;j<100;j++)for(let i=0;i<56;i++)a[j*56+i]=k.mask[j][i]==='1'?255:0;
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);const t=texFrom(a,5,56,100,gl.LUMINANCE);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);return t;}
const TEX={},PT={};let maskPix=null;   // PT[pose]: that pose's textures and CPU masks, loaded on first use
function loadImg(src){return new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error('missing '+src));i.src=src;});}

// ---------- the cat's body language (presentation on top of core's mood) ----------
const M={dream:4,dreamT:0,arch:0,butt:0,crouch:0,hop:0,hopV:0,breath:0,twitch:0,sway:0,swayV:0,press:[0,0,0],tailAng:0,tailTip:0,headRot:0,headOff:[0,0],
  cur:'base',prev:'base',fade:1,fadeDur:0.15,blink:0,blinkNext:2.5,startle:0,purr:0};
const VARS={stand:{idle:'base',happy:'purr',look:'look',warn:'warn',bite:'bite',lick:'lick',blink:'purr'},
  belly:{idle:'base',happy:'purr',look:'look',warn:'warn',bite:'bite',lick:'lick',blink:'purr'},
  sleep:{sleep:'base',drowsy:'drowsy',idle:'awake',happy:'purr',look:'look',warn:'warn',bite:'bite',lick:'lick',blink:'drowsy'}};
const lerp=(a,b,k)=>a+(b-a)*k;
let finger=null,lastFinger={x:0.5,y:0.5};
const P=[];
const hand={shown:0,stuck:[],flinch:0,clapT:-1,x:0,y:0,w:0,h:0,path:null};
const bubble={text:'',t:0,lookShown:false};

// ---------- layout ----------
function layout(){
  VW=window.innerWidth;VH=window.innerHeight;DPR=Math.min(2,window.devicePixelRatio||1);
  for(const c of [bg,gl_c,fx]){c.width=Math.round(VW*DPR);c.height=Math.round(VH*DPR);c.style.width=VW+'px';c.style.height=VH+'px';}
  cw=Math.min(VW*0.98,(VH-250)*AT,760);ch=cw/AT;
  ox=(VW-cw)/2;oy=Math.min(Math.max(96,(VH-ch)*0.5),VH-150-K.floor*ch);
  hand.w=Math.min(64,VW*0.17);hand.h=hand.w*1.15;hand.x=14;hand.y=12;hand.path=handPath(hand.w,hand.h);
  paintBg();
}
function handPath(w,h){
  const p=new Path2D();const pw=w*0.62,ph=h*0.46,px=w*0.2,py=h*0.48;
  p.roundRect(px,py,pw,ph,[w*0.12,w*0.12,w*0.2,w*0.2]);
  const fw=pw/4.3;for(let i=0;i<4;i++){const fx_=px+fw*0.15+i*fw*1.05,len=h*[0.34,0.42,0.4,0.33][i];p.roundRect(fx_,py-len+fw*0.5,fw*0.92,len,fw*0.46);}
  p.ellipse(px-w*0.02,py+ph*0.42,w*0.11,h*0.2,-0.6,0,Math.PI*2);
  return p;
}
let room=null;
function paintBg(){
  if(POSE!=='stand')return paintBed();
  const w=bg.width,h=bg.height,fy=Math.round((oy+K.floor*ch)*DPR);bx.setTransform(1,0,0,1,0,0);
  // warm wall, window light from the top left
  const g=bx.createLinearGradient(0,0,0,fy);g.addColorStop(0,'#f1e6d4');g.addColorStop(1,'#e3d2b8');bx.fillStyle=g;bx.fillRect(0,0,w,fy);
  const sun=bx.createRadialGradient(w*0.08,0,0,w*0.08,0,Math.max(w,h)*0.95);sun.addColorStop(0,'rgba(255,238,205,0.55)');sun.addColorStop(1,'rgba(255,238,205,0)');bx.fillStyle=sun;bx.fillRect(0,0,w,fy);
  // skirting board and a light wooden floor
  bx.fillStyle='#cdb38f';bx.fillRect(0,fy-6*DPR,w,6*DPR);
  const f=bx.createLinearGradient(0,fy,0,h);f.addColorStop(0,'#d9b88d');f.addColorStop(1,'#b98f62');bx.fillStyle=f;bx.fillRect(0,fy,w,h-fy);
  bx.strokeStyle='rgba(110,70,35,0.18)';bx.lineWidth=DPR;
  for(let y=fy+14*DPR;y<h;y+=Math.max(10,(y-fy)*0.35+14*DPR)){bx.beginPath();bx.moveTo(0,y);bx.lineTo(w,y);bx.stroke();}
  for(let i=-8;i<=8;i++){bx.beginPath();bx.moveTo(w/2+i*w*0.09,fy);bx.lineTo(w/2+i*w*0.3,h);bx.stroke();}
  room=bx.getImageData(0,0,w,h);
}
// lying down: a cream fleece blanket on the bed fills most of the screen, a strip of warm wall above it
function paintBed(){
  const w=bg.width,h=bg.height,ey=Math.round(Math.max(40,oy-ch*0.35)*DPR);bx.setTransform(1,0,0,1,0,0);
  const g=bx.createLinearGradient(0,0,0,ey);g.addColorStop(0,'#f1e6d4');g.addColorStop(1,'#e6d6bd');bx.fillStyle=g;bx.fillRect(0,0,w,ey);
  const f=bx.createLinearGradient(0,ey,0,h);f.addColorStop(0,'#f2e7d3');f.addColorStop(1,'#dccbb0');bx.fillStyle=f;bx.fillRect(0,ey,w,h-ey);
  // fleece: lots of tiny soft curls
  let r=12345;const rnd=()=>{r=(r*1103515245+12345)&0x7fffffff;return r/0x7fffffff;};
  bx.filter=`blur(${1.2*DPR}px)`;
  for(let i=0;i<w*(h-ey)/(140*DPR*DPR);i++){const x=rnd()*w,y=ey+rnd()*(h-ey),s=(2+rnd()*3)*DPR;bx.fillStyle=rnd()<0.5?'rgba(255,252,244,0.22)':'rgba(150,120,85,0.05)';bx.beginPath();bx.arc(x,y,s,0,Math.PI*2);bx.fill();}
  bx.filter='none';
  // a few soft folds
  for(let k=0;k<5;k++){const y=ey+(0.15+k*0.19)*(h-ey),sg=bx.createLinearGradient(0,y-30*DPR,0,y+30*DPR);sg.addColorStop(0,'rgba(120,90,60,0)');sg.addColorStop(0.5,'rgba(120,90,60,0.08)');sg.addColorStop(1,'rgba(255,250,240,0.10)');
    bx.fillStyle=sg;bx.beginPath();bx.moveTo(0,y-30*DPR);bx.bezierCurveTo(w*0.3,y-60*DPR,w*0.7,y+40*DPR,w,y-10*DPR);bx.lineTo(w,y+50*DPR);bx.bezierCurveTo(w*0.7,y+90*DPR,w*0.3,y-10*DPR,0,y+30*DPR);bx.fill();}
  bx.fillStyle='rgba(150,110,70,0.25)';bx.fillRect(0,ey,w,2*DPR);
  room=bx.getImageData(0,0,w,h);
}

// ---------- session ----------
function newSession(){
  if(!PT[POSE])return;
  S=C.createSession(Object.assign({flow,mask:maskAt,seed},POSE_OPT[POSE]));
  TEX.mapBuf=C.packRGBA(S.fur);if(TEX.map)gl.deleteTexture(TEX.map);TEX.map=texFrom(TEX.mapBuf,4,S.fur.nx,S.fur.ny);
  stroked=false;hintEl.hidden=false;hintEl.textContent=POSE==='sleep'?'它睡着了，轻轻顺着毛撸':POSE==='belly'?'摸摸肚皮……小心':'从头往尾巴，顺着毛撸撸它';
  M.cur=M.prev=VARS[POSE][S.cat.state]||'base';M.fade=1;Object.assign(M,{arch:0,butt:0,crouch:0,hop:0,hopV:0,twitch:0,headRot:0,headOff:[0,0],tailAng:0,tailTip:0});lastState=S.cat.state;wakeSeen=0;
  if(PT[POSE])maskPix=PT[POSE].pix;
}
// screen css ↔ picture units, including the body's current push, so the fur under the finger is the fur you see
const sm=(a,b,x)=>{const k=Math.max(0,Math.min(1,(x-a)/(b-a)));return k*k*(3-2*k);};
function dispJS(tx,ty){
  const wv=sm(0.975,0.70,ty),along=Math.max(0,Math.min(1,(tx-0.18)/0.66));let y=0;
  y-=M.arch*wv*Math.sin(Math.PI*along);y-=M.butt*wv*sm(0.55,0.86,tx);y+=M.crouch*wv;
  const dx=(tx-M.press[0])*AT,dy=ty-M.press[1];y+=M.press[2]*wv*Math.exp(-(dx*dx+dy*dy)/0.0036);
  return[M.sway*wv,y/1024-M.hop/1024];
}
const cssToT=(x,y)=>{const tx=(x-ox)/cw,ty=(y-oy)/ch,d=dispJS(tx,ty);return[tx-d[0],ty-d[1]];};
const tToCss=(tx,ty)=>{const d=dispJS(tx,ty);return[ox+(tx+d[0])*cw,oy+(ty+d[1])*ch];};
function pix(tx,ty){if(!maskPix)return-1;const i=Math.round(tx*(maskPix.w-1)),j=Math.round(ty*(maskPix.h-1));return(i<0||j<0||i>=maskPix.w||j>=maskPix.h)?-1:(j*maskPix.w+i)*4;}
function headHit(tx,ty){const k=pix(tx,ty);return k>=0&&maskPix.d[k]>128&&maskPix.a[k+3]>128;}

function down(cx,cy){const [tx,ty]=cssToT(cx,cy),c=t2c(tx,ty);finger={tx,ty,x:c[0],y:c[1],head:headHit(tx,ty)};S.down(c[0],c[1]);lastFinger={x:tx,y:ty};}
function move(cx,cy){
  if(!finger)return;
  const [tx,ty]=cssToT(cx,cy),c=t2c(tx,ty);
  if(headHit(tx,ty)&&headHit(finger.tx,finger.ty)){   // a head rub: she likes it, nothing to comb there
    const len=Math.hypot(c[0]-finger.x,c[1]-finger.y);
    if(len>0.004&&S.cat.locked<=0){C.feel(S.cat,{kind:'with',len:len*0.8});noteStroke();}
    Object.assign(finger,{tx,ty,x:c[0],y:c[1],head:true});S.finger={x:c[0],y:c[1]};return;}
  const r=S.move(c[0],c[1]);Object.assign(finger,{tx,ty,x:c[0],y:c[1],head:false});lastFinger={x:tx,y:ty};
  if(r&&r.kind!=='off'&&r.kind!=='still'){noteStroke();audio.rub(r.len);
    if(r.kind==='with')M.swayV+=0.0016*Math.min(1,r.len*20);
    if(r.picked>0)for(let i=0;i<r.picked;i++)spawnHair(cx,cy);}
}
function up(){finger=null;S.up();}
function noteStroke(){if(!stroked){stroked=true;hintEl.hidden=true;}}

// ---------- loose hair ----------
function spawnHair(cx,cy){
  if(P.length>360)return;
  P.push({x:cx-14+Math.random()*18,y:cy-22+Math.random()*14,vx:(Math.random()-0.5)*40,vy:-30-Math.random()*45,a:Math.random()*6.28,va:(Math.random()-0.5)*5,
    len:10+Math.random()*9,bend:(Math.random()-0.5)*0.9,col:Math.random()<0.75?'#df8b3f':'#f4e2c6',t:0,float:0.45+Math.random()*0.7,phase:'float',fx:0,fy:0,sx:0,sy:0});
}
function stuckSpot(){for(let i=0;i<40;i++){const x=Math.random()*hand.w,y=Math.random()*hand.h;if(hc.isPointInPath(hand.path,x,y))return[x,y];}return[hand.w*0.5,hand.h*0.7];}
function updateHairs(dt){
  for(let i=P.length-1;i>=0;i--){const p=P[i];p.t+=dt;
    if(p.phase==='float'){p.vy+=-8*dt;p.vx*=1-1.5*dt;p.vy*=1-1.2*dt;p.x+=p.vx*dt+Math.sin(p.t*7+p.a)*10*dt;p.y+=p.vy*dt;p.a+=p.va*dt;
      if(p.t>p.float){p.phase='fly';p.t=0;p.sx=p.x;p.sy=p.y;const s=stuckSpot();p.fx=s[0];p.fy=s[1];}}
    else if(p.phase==='fly'){const k=Math.min(1,p.t/0.55),e=k*k*(3-2*k),tx=hand.x+p.fx,ty=hand.y+p.fy;
      p.x=lerp(p.sx,tx,e)+Math.sin(k*3.14)*(-30);p.y=lerp(p.sy,ty,e)-Math.sin(k*3.14)*40;p.a+=p.va*dt;
      if(k>=1){hand.stuck.push({x:p.fx,y:p.fy,a:p.a,len:p.len*0.8,bend:p.bend,col:p.col});if(hand.stuck.length>260)hand.stuck.shift();hand.shown++;P.splice(i,1);}}
    else{p.vy+=90*dt;p.vx*=1-1.8*dt;p.vy*=1-1.6*dt;p.x+=p.vx*dt+Math.sin(p.t*6+p.a)*14*dt;p.y+=p.vy*dt;p.a+=p.va*dt;if(p.t>2.4||p.y>VH+20)P.splice(i,1);}
  }
}
function clap(){
  if(hand.shown===0&&S.fur.hand.hairs===0)return;
  C.clap(S.fur);audio.clap();
  for(const s of hand.stuck){if(P.length>420)break;P.push({x:hand.x+s.x,y:hand.y+s.y,vx:(Math.random()-0.35)*260,vy:-120-Math.random()*160,a:s.a,va:(Math.random()-0.5)*9,len:s.len,bend:s.bend,col:s.col,t:0,phase:'off'});}
  for(const p of P)if(p.phase!=='off'){p.phase='off';p.t=0;p.vy=-60;}
  hand.stuck.length=0;hand.shown=0;hand.clapT=0;
  // the clap startles her: a little hop and a look at you
  if(S.cat.state!=='bite'){M.hopV+=POSE==='stand'?95:45;M.startle=0.8;}
}

// ---------- mood → body language ----------
let lastState='idle',purrPulse=0,wakeSeen=0;
function setVariant(name,dur){if(name===M.cur)return;M.prev=M.fade<0.5?M.prev:M.cur;M.cur=name;M.fade=0;M.fadeDur=dur||0.15;}
function animate(dt,t){
  const cat=S.cat,st=cat.state,k=1-Math.exp(-dt*7),slow=1-Math.exp(-dt*3),fast=1-Math.exp(-dt*20);
  if(st!==lastState){
    if(st==='bite'){bubble.text='啊呜！';bubble.t=1.1;hand.flinch=0.5;audio.bite();vibe(60);}
    if(st==='lick'){bubble.text='舔舔';bubble.t=1.4;}
    if(st==='warn'){bubble.text='……';bubble.t=1.6;}
    if(st==='drowsy'&&lastState==='sleep'){bubble.text='嗯……？';bubble.t=1.4;}
    lastState=st;
  }
  for(;wakeSeen<cat.events.length;wakeSeen++){const e=cat.events[wakeSeen];if(e.type==='wake'){bubble.text=e.rude?'喵！？':'醒啦';bubble.t=1.3;if(e.rude){M.hopV+=40;}}}
  if(st!=='bite'&&st!=='lick'&&cat.look&&!bubble.lookShown){bubble.text='喵？';bubble.t=1.0;bubble.lookShown=true;}
  if(!cat.look)bubble.lookShown=false;
  const onBack=finger&&!finger.head&&maskAt(finger.x,finger.y)>0;
  const happy=cat.happy&&st!=='warn'&&st!=='bite'&&st!=='lick';
  // targets (body numbers in picture pixels of the 1024-high original, angles in radians)
  let arch=0,butt=0,crouch=0,twitch=0,headRot=0.02*Math.sin(t*0.4),headOff=[0,0],tailAng=0.05*Math.sin(t*1.5),tailTip=0.12*Math.sin(t*0.9),breath=1.6*Math.sin(t*2.2),pressZ=0;
  const V=VARS[POSE],standing=POSE==='stand',asleep=st==='sleep'||st==='drowsy';
  let variant=V[st]||'base';
  if(onBack&&cat.locked<=0){pressZ=8;if(cat.content>0.35&&!asleep)arch=standing?18:8;   // the hand pushes the back down; once she likes it she pushes up into it
    if(standing&&finger.y>0.74&&cat.content>0.25&&st!=='warn')butt=36;}   // stroked near the root of the tail: the rump goes up
  if(happy){headRot=0.07+0.015*Math.sin(t*1.1);tailAng=-0.06;tailTip=0.05*Math.sin(t*55);breath=2.4*Math.sin(t*5.6);}
  if(cat.look&&st!=='bite'&&st!=='lick'){tailAng=0.22*Math.sin(t*4.4);tailTip=0.3*Math.sin(t*4.4-0.8);twitch=0.6;}
  if(asleep){headRot=0;breath=3.2*Math.sin(t*1.5);tailAng=0.02*Math.sin(t*0.5);tailTip=finger?0.25*Math.sin(t*7):0.03*Math.sin(t*0.7);   // slow deep breaths; the tip flicks when touched
    M.dream-=dt;if(M.dream<=0&&!finger){M.dream=5+Math.random()*5;M.dreamT=0.45;}if(M.dreamT>0){M.dreamT-=dt;twitch=1.4;tailTip=0.3*Math.sin(t*20);}}   // a little twitch in her dream
  if(st==='warn'){crouch=standing?9:0;twitch=1.3;headRot=-0.04;const w=Math.sin(t*10.5);tailAng=0.38*w*Math.abs(w);tailTip=0.35*Math.sin(t*10.5-1.1);}
  if(st==='bite'){const nk=K.neckPivot,dx=(lastFinger.x-nk[0])*AT,dy=lastFinger.y-nk[1],m=Math.hypot(dx,dy)||1,reach=Math.min(0.028,m*0.3),ph=Math.min(1,cat.stateT/0.15);
    headOff=[dx/m*reach*ph/AT,dy/m*reach*ph];headRot=standing?-0.1*Math.sign(dy)*ph:0;crouch=standing?6:0;tailAng=0.3*Math.sin(t*12);}
  if(st==='lick'){headRot=-0.05;tailAng=0.06*Math.sin(t*2);}
  if(M.startle>0&&st!=='bite'&&!asleep){variant='look';tailAng=-0.1;}
  // blink when idle and awake
  M.blinkNext-=dt;if(M.blinkNext<=0){M.blink=0.14;M.blinkNext=2.5+Math.random()*3.5;}
  const blinking=M.blink>0&&variant===V.idle;if(M.blink>0){M.blink-=dt;if(blinking)variant=V.blink;}
  setVariant(variant,blinking?0.06:st==='bite'?0.08:asleep?0.45:0.16);
  M.fade=Math.min(1,M.fade+dt/M.fadeDur);
  M.arch=lerp(M.arch,arch,slow);M.butt=lerp(M.butt,butt,1-Math.exp(-dt*5));M.crouch=lerp(M.crouch,crouch,k);M.twitch=lerp(M.twitch,twitch,k);
  M.press=[lastFinger.x,lastFinger.y,lerp(M.press[2],pressZ,1-Math.exp(-dt*14))];
  M.headRot=lerp(M.headRot,headRot,st==='bite'?fast:k);M.headOff=[lerp(M.headOff[0],headOff[0],st==='bite'?fast:k),lerp(M.headOff[1],headOff[1],st==='bite'?fast:k)];
  M.tailAng=lerp(M.tailAng,tailAng,1-Math.exp(-dt*10));M.tailTip=lerp(M.tailTip,tailTip,1-Math.exp(-dt*12));M.breath=breath;
  M.hopV-=420*dt;M.hop=Math.max(0,M.hop+M.hopV*dt);if(M.hop<=0&&M.hopV<0){M.hopV=0;M.hop=0;}
  M.swayV+=(-M.sway*90-M.swayV*9)*dt;M.sway+=M.swayV*dt;
  M.startle=Math.max(0,M.startle-dt);hand.flinch=Math.max(0,hand.flinch-dt);bubble.t-=dt;
  M.purr=lerp(M.purr,happy?1:0,1-Math.exp(-dt*2));
  audio.purr(M.purr);
  if(M.purr>0.6&&finger){purrPulse-=dt;if(purrPulse<=0){purrPulse=0.83;vibe(14);}}
}
function vibe(ms){try{if(navigator.vibrate&&audio.on&&navigator.userActivation&&navigator.userActivation.hasBeenActive)navigator.vibrate(ms);}catch(e){}}

// ---------- drawing ----------
const trailU=new Float32Array(32);
function bindHead(unit,name){const T=PT[POSE].tex;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,T[name]||T.base);return name==='base'?1:0;}
function draw(t){
  if(room)bx.putImageData(room,0,0);
  const L=DPR;
  // contact shadow on the floor: shrinks and fades when she hops
  const fy=(oy+K.floor*ch)*L,lift=Math.min(1,M.hop/30);
  bx.save();const sg=bx.createRadialGradient(0,0,0,0,0,1);sg.addColorStop(0,`rgba(70,40,15,${0.32*(1-lift*0.6)})`);sg.addColorStop(1,'rgba(70,40,15,0)');
  bx.translate((ox+cw*0.52)*L,fy);bx.scale(cw*0.42*L*(1-lift*0.15),ch*0.045*L);bx.fillStyle=sg;bx.beginPath();bx.arc(0,0,1,0,Math.PI*2);bx.fill();bx.restore();
  if(!loaded||!PT[POSE])return;const PTX=PT[POSE].tex;
  gl.viewport(0,0,gl_c.width,gl_c.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  if(S.fur.dirty){C.packRGBA(S.fur,TEX.mapBuf);gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,TEX.map);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,S.fur.nx,S.fur.ny,gl.RGBA,gl.UNSIGNED_BYTE,TEX.mapBuf);S.fur.dirty=null;}
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,PTX.base);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,PTX.masks);
  gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,TEX.map);gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,PT[POSE].kmask);
  gl.uniform1f(U.u_at,AT);gl.uniform1f(U.u_py,1/K.pxH);gl.uniform1f(U.u_floor,K.floor);gl.uniform1f(U.u_bellyY,K.belly);
  const ab=bindHead(1,M.prev),bb=bindHead(2,M.cur);
  for(const [n,u] of [['u_base',0],['u_va',1],['u_vb',2],['u_masks',3],['u_map',4],['u_kmask',5]])gl.uniform1i(U[n],u);
  gl.uniform1f(U.u_aBase,ab);gl.uniform1f(U.u_bBase,bb);gl.uniform1f(U.u_vmix,M.fade);
  gl.uniform2f(U.u_res,gl_c.width,gl_c.height);gl.uniform2f(U.u_org,ox*L,oy*L);gl.uniform2f(U.u_sz,cw*L,ch*L);
  gl.uniform1f(U.u_time,t);gl.uniform1f(U.u_layers,LAYERS);
  gl.uniform4f(U.u_torso,T0[0],T0[1],T1[0],T1[1]);gl.uniform2f(U.u_tailPivot,K.tailPivot[0],K.tailPivot[1]);gl.uniform2f(U.u_neckPivot,K.neckPivot[0],K.neckPivot[1]);gl.uniform1f(U.u_tailLen,K.tailLen);
  gl.uniform1f(U.u_tailAng,M.tailAng);gl.uniform1f(U.u_tailTip,M.tailTip);gl.uniform1f(U.u_headRot,M.headRot);gl.uniform2f(U.u_headOff,M.headOff[0],M.headOff[1]);
  gl.uniform1f(U.u_arch,M.arch);gl.uniform1f(U.u_butt,M.butt);gl.uniform1f(U.u_crouch,M.crouch);gl.uniform1f(U.u_hop,M.hop);gl.uniform1f(U.u_breath,M.breath+(M.purr>0.5?Math.sin(t*150)*0.5:0));
  gl.uniform1f(U.u_twitch,M.twitch);gl.uniform1f(U.u_sway,M.sway);gl.uniform3f(U.u_press,M.press[0],M.press[1],M.press[2]);
  const tr=S.fur.trail,o_=S.fur.o;trailU.fill(0);
  for(let i=0;i<tr.length&&i<8;i++){const p=tr[i],age=S.fur.t-p.t,a=Math.exp(-age/o_.trailTau)*Math.cos(6.2832*o_.trailHz*age);trailU.set([p.x,p.y,p.vx*a,p.vy*a],i*4);}
  gl.uniform4fv(U.u_trail,trailU);
  gl.uniform3f(U.u_finger,finger?finger.x:0,finger?finger.y:0,finger&&!finger.head&&S.cat.locked<=0?1:0);
  // one quad over the cat, with room for the tail swing, the hop and the bite lunge
  const pad=0.12;gl.uniform4f(U.u_rect,(ox-cw*pad)*L,(oy-ch*pad)*L,cw*(1+2*pad)*L,ch*(1+pad+0.03)*L);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  drawFx(t);
}
function drawFx(t){
  const c=fc;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,fx.width,fx.height);c.setTransform(DPR,0,0,DPR,0,0);
  // purr marks under the chin
  if(M.purr>0.3){const [x,y]=tToCss(K.neckPivot[0]-0.13,K.neckPivot[1]-0.02),a=M.purr*(0.55+0.45*Math.sin(t*7.5));c.lineWidth=1.6;c.strokeStyle=`rgba(120,70,30,${0.55*a})`;
    for(let i=0;i<3;i++){const r=ch*(0.05+i*0.025+0.006*Math.sin(t*7.5));c.beginPath();c.arc(x,y,r,Math.PI*0.55,Math.PI*0.95);c.stroke();}}
  const zz=S.cat.state==='sleep';
  const bt=bubble.t>0?bubble.text:M.purr>0.55?(zz?'呼噜……Zzz':'呼噜呼噜'):zz?'Zzz':'';
  if(bt){const [x,y]=tToCss(K.neckPivot[0]-0.08,K.neckPivot[1]-0.36);drawBubble(c,bt,Math.max(60,Math.min(VW-60,x)),Math.max(hand.y+hand.h+24,y),bubble.t>0?Math.min(1,bubble.t*3):zz&&M.purr<0.55?0.55+0.2*Math.sin(t*1.5):0.55+0.45*M.purr);}
  for(const p of P){c.save();c.translate(p.x,p.y);c.rotate(p.a);c.globalAlpha=p.phase==='off'?Math.max(0,1-p.t/2.4):1;
    c.strokeStyle='rgba(90,45,15,0.35)';c.lineWidth=2.6;c.beginPath();c.moveTo(-p.len/2,0);c.quadraticCurveTo(0,p.bend*p.len,p.len/2,0);c.stroke();
    c.strokeStyle=p.col;c.lineWidth=1.5;c.beginPath();c.moveTo(-p.len/2,0);c.quadraticCurveTo(0,p.bend*p.len,p.len/2,0);c.stroke();c.restore();}
  drawHand(c,t);
}
function drawBubble(c,text,x,y,a){
  c.save();c.globalAlpha=a;c.font='700 17px "PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",system-ui,sans-serif';
  const w=c.measureText(text).width+20;c.fillStyle='rgba(255,250,242,0.92)';c.strokeStyle='rgba(90,60,30,0.35)';c.lineWidth=1;
  c.beginPath();c.roundRect(x-w/2,y-16,w,32,16);c.fill();c.stroke();c.fillStyle='#6b3d16';c.textAlign='center';c.textBaseline='middle';c.fillText(text,x,y+1);c.restore();
}
function drawHand(c,t){
  c.save();
  const shake=hand.flinch>0?Math.sin(t*70)*hand.flinch*10:0,clapK=hand.clapT;
  c.translate(hand.x+shake,hand.y);
  const lvl=C.handLevel({hairs:hand.shown});
  if(lvl>=3){c.save();c.strokeStyle=lvl>=4?'rgba(226,140,60,0.9)':'rgba(226,140,60,0.6)';c.lineWidth=1.3;
    for(let i=0;i<(lvl>=4?160:80);i++){const a=i*2.399,r=hand.w*0.5;let x=hand.w*0.5+Math.cos(a)*r*0.75,y=hand.h*0.55+Math.sin(a)*r*0.95;
      for(let s=0;s<6;s++){if(!hc.isPointInPath(hand.path,x,y))break;x+=Math.cos(a)*3;y+=Math.sin(a)*3;}
      c.beginPath();c.moveTo(x-Math.cos(a)*2,y-Math.sin(a)*2);c.lineTo(x+Math.cos(a+Math.sin(i)*0.6)*(lvl>=4?9:6),y+Math.sin(a+Math.sin(i)*0.6)*(lvl>=4?9:6));c.stroke();}
    c.restore();}
  if(clapK>=0&&clapK<0.6){const kk=Math.abs(Math.sin(clapK/0.6*Math.PI*2));c.save();c.translate(hand.w*0.5,0);c.scale(-1,1);c.translate(-hand.w*0.5-hand.w*(0.25+0.5*kk),0);c.globalAlpha=0.9;drawPalm(c,0);c.restore();}
  drawPalm(c,lvl);
  for(const s of hand.stuck){c.save();c.translate(s.x,s.y);c.rotate(s.a);c.strokeStyle=s.col;c.lineWidth=1.1;c.beginPath();c.moveTo(-s.len/2,0);c.quadraticCurveTo(0,s.bend*s.len,s.len/2,0);c.stroke();c.restore();}
  c.restore();
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
    const src=ctx.createBufferSource();src.buffer=n;src.loop=true;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=260;
    const chop=ctx.createGain();chop.gain.value=0.5;const lfo=ctx.createOscillator();lfo.frequency.value=24;const lg=ctx.createGain();lg.gain.value=0.5;lfo.connect(lg).connect(chop.gain);
    this.purrG=ctx.createGain();this.purrG.gain.value=0;src.connect(lp).connect(chop).connect(this.purrG).connect(ctx.destination);src.start();lfo.start();
    const s2=ctx.createBufferSource();s2.buffer=n;s2.loop=true;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=2600;bp.Q.value=0.7;
    this.rubG=ctx.createGain();this.rubG.gain.value=0;s2.connect(bp).connect(this.rubG).connect(ctx.destination);s2.start();
  }catch(e){this.ctx=null;}},
  purr(level){if(!this.ctx)return;const t=this.ctx.currentTime,br=0.6+0.4*Math.sin(t*6.2832*0.9);this.purrG.gain.setTargetAtTime(this.on?level*0.5*br:0,t,0.08);},
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
  pid=e.pointerId;fx.setPointerCapture(pid);down(e.clientX,e.clientY);e.preventDefault();});
fx.addEventListener('pointermove',e=>{if(e.pointerId!==pid||!finger)return;
  const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];for(const ev of (evs.length?evs:[e]))move(ev.clientX,ev.clientY);e.preventDefault();});
const end=e=>{if(e.pointerId!==pid)return;pid=null;up();};
fx.addEventListener('pointerup',end);fx.addEventListener('pointercancel',end);fx.addEventListener('lostpointercapture',end);
window.addEventListener('blur',()=>{if(finger){pid=null;up();}});
window.addEventListener('keydown',e=>{
  if(e.key===' '||e.key==='ArrowRight'){auto.push(WITH(0.2));e.preventDefault();}
  else if(e.key==='ArrowLeft'){auto.push(AGAINST(0.2));e.preventDefault();}
  else if(e.key==='c'||e.key==='C'){clap();}
});
window.addEventListener('resize',()=>{layout();});

// automatic strokes (keyboard and the fixed views) go through the same down/move/up as a finger, in fur units
const auto=[];let autoCur=null;
const cToCss=(x,y)=>{const t=c2t(x,y);return tToCss(t[0],t[1]);};
const WITH=(x,d)=>({from:[x,0.12],to:[x,0.92],dur:d||0.45});
const AGAINST=(x,d)=>({from:[x,0.92],to:[x,0.14],dur:d||0.45});
function runAuto(dt){
  if(!autoCur&&auto.length){autoCur=Object.assign({t:0},auto.shift());const p=cToCss(autoCur.from[0],autoCur.from[1]);down(p[0],p[1]);}
  if(!autoCur)return;autoCur.t+=dt;const k=Math.min(1,autoCur.t/autoCur.dur),e=k*k*(3-2*k);
  const p=cToCss(autoCur.from[0]+(autoCur.to[0]-autoCur.from[0])*e,autoCur.from[1]+(autoCur.to[1]-autoCur.from[1])*e);move(p[0],p[1]);
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
  if(!S){requestAnimationFrame(frame);return;}
  if(!frozen)update(dt);
  draw(T);
  requestAnimationFrame(frame);
}

// ---------- fixed views ----------
function sim(secs){for(let t=0;t<secs;t+=1/60)update(1/60);}
function strokes(list){for(const s of list)auto.push(s);while(auto.length||autoCur)update(1/60);}
function goView(v){
  const lane=i=>0.1+((i*7)%5)*0.065;
  if(v==='smooth'){for(let i=0;i<9;i++){strokes([WITH(lane(i))]);sim(0.3);}sim(0.4);}
  else if(v==='rump'){for(let i=0;i<7;i++){strokes([WITH(lane(i))]);sim(0.25);}strokes([Object.assign(WITH(0.12,0.5),{hold:true})]);sim(0.6);}
  else if(v==='ruffle'){strokes([WITH(0.14)]);sim(0.3);for(let i=0;i<4;i++){strokes([AGAINST(0.08+(i%2)*0.08,0.35)]);sim(0.1);}sim(0.35);}
  else if(v==='warn'){for(let i=0;i<160&&S.cat.state!=='warn';i++){strokes([WITH(lane(i),0.3)]);sim(0.05);}strokes([WITH(0.15,0.3)]);sim(0.25);}
  else if(v==='drowsy'){for(let i=0;i<4&&S.cat.state!=='drowsy';i++){strokes([WITH(lane(i))]);sim(0.3);}sim(0.6);}
  else if(v==='awake'){for(let i=0;i<12&&['sleep','drowsy'].includes(S.cat.state);i++){strokes([WITH(lane(i))]);sim(0.3);}sim(1.6);}
  else if(v==='bite'){for(let i=0;i<240&&S.cat.state!=='bite';i++){strokes([WITH(lane(i),0.3)]);sim(0.05);}sim(0.16);}
  else if(v==='furry'||v==='clap'){for(let i=0;i<34;i++){strokes([i%5===4?AGAINST(lane(i),0.35):WITH(lane(i),0.35)]);sim(0.6);if(S.cat.state==='bite'||S.cat.state==='lick')sim(2.6);}sim(2.2);
    if(v==='clap'){clap();sim(0.12);}}
  else sim(0.3);
  frozen=true;viewDone=true;
}

// ---------- hooks ----------
function catBox(){
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  if(maskPix)for(let j=0;j<maskPix.h;j+=6)for(let i=0;i<maskPix.w;i+=6)if(maskPix.a[(j*maskPix.w+i)*4+3]>100){const [x,y]=tToCss(i/(maskPix.w-1),j/(maskPix.h-1));x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  return{x:x0,y:y0,w:x1-x0,h:y1-y0};
}
function backStats(){return C.regionStats(S.fur,0.03,0.25,0.3,0.9);}
window.__lumao={get ready(){return started&&loaded&&viewDone&&!switching&&!!S;},view:VIEW,setPose,
  probe(){const st=backStats();return{view:VIEW,state:S.cat.state,happy:S.cat.happy,look:S.cat.look,bites:S.cat.bites,content:+S.cat.content.toFixed(3),over:+S.cat.over.toFixed(3),annoy:+S.cat.annoy.toFixed(3),
    hairsCore:S.fur.hand.hairs,hairsShown:hand.shown,airborne:P.length,handLevel:C.handLevel({hairs:hand.shown}),backMess:+st.mess.toFixed(3),backShine:+st.shine.toFixed(3),hint:!hintEl.hidden,frozen,layers:LAYERS,
    pose:POSE,sleep:+S.cat.sleep.toFixed(3),head:M.cur,arch:+M.arch.toFixed(2),butt:+M.butt.toFixed(2),crouch:+M.crouch.toFixed(2),tailAng:+M.tailAng.toFixed(3),hop:+M.hop.toFixed(2),
    layout:{VW,VH,ox,oy,cw,ch,hand:{x:hand.x,y:hand.y,w:hand.w,h:hand.h},label:{x:hand.x+hand.w+8,y:hand.y+hand.h*0.22,w:130,h:36},cat:catBox(),floor:oy+K.floor*ch}};},
  coreToCss:(x,y)=>cToCss(x,y),stroke(dir){auto.push(dir==='against'?AGAINST(0.15):WITH(0.15));},clap,
  renderer(){const d=gl.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}};
window.__PLAYTEST__={get ready(){return started&&loaded&&viewDone&&!switching&&!!S;},snapshot:()=>window.__lumao.probe(),reset(){newSession();frozen=false;},setSeed(n){seed=n|0||7;newSession();},step(ms){sim(ms/1000);}};

layout();started=true;requestAnimationFrame(frame);
function loadPose(p){
  if(PT[p])return Promise.resolve(PT[p]);
  const k=POSES[p];
  return Promise.all(['base','masks',...k.states].map(n=>loadImg(n==='masks'?`assets/${p}/cat-masks.png`:`assets/${p}/cat-${n}.webp`).then(img=>[n,img]))).then(list=>{
    const tex={};const units={base:0,masks:3};
    for(const [n,img] of list)tex[n]=texFrom(img,units[n]!=null?units[n]:1);
    // CPU copies of the picture's alpha and the head region, for hit tests and the layout check
    const cv=document.createElement('canvas');cv.width=k.size[0];cv.height=k.size[1];const cx=cv.getContext('2d',{willReadFrequently:true});
    const im=list.find(l=>l[0]==='base')[1],mk=list.find(l=>l[0]==='masks')[1];
    cx.drawImage(im,0,0);const a=cx.getImageData(0,0,cv.width,cv.height).data;cx.clearRect(0,0,cv.width,cv.height);cx.drawImage(mk,0,0);const d=cx.getImageData(0,0,cv.width,cv.height).data;
    PT[p]={tex,kmask:kmaskTex(k),pix:{w:cv.width,h:cv.height,a,d}};return PT[p];
  });
}
// switching pose keeps the hair on your hand; the cat (and her fur) start fresh
let switching=false;
function setPose(p,then){
  if(switching||!POSES[p])return;switching=true;
  loadPose(p).then(()=>{usePose(p);finger=null;pid=null;auto.length=0;autoCur=null;layout();newSession();
    for(const b of poseBtns.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.pose===p));
    switching=false;loaded=true;if(then)then();})
  .catch(e=>{switching=false;$('nogl').textContent='猫的图没加载出来，刷新一下试试。';$('nogl').hidden=false;console.error(e);});
}
const poseBtns=$('poses');
for(const b of poseBtns.querySelectorAll('button'))b.addEventListener('click',()=>{audio.init();if(b.dataset.pose!==POSE)setPose(b.dataset.pose);});
setPose(POSE,()=>{if(VIEW)goView(VIEW);});
})();
