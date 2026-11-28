// 手撕日历: drawing, input and sound. Rules and paper live in core.js; the almanac in almanac.js.
// Two canvases: #bg (Canvas 2D: wall, board, header, the next page, the stack) and #gl (WebGL: the page you tear,
// its shadow, the torn stub under the binding, falling pages).
(function(){
'use strict';
const C=window.TearCore,A=window.TearAlmanac;
const Q=new URLSearchParams(location.search);
const VIEW=Q.get('view')||'';
const TEX_W=1024,TEX_H=Math.round(1024*C.CFG.h);          // page texture: 1024 px per page width
const STUB={x0:-0.035,x1:1.035,y0:-0.115,y1:0.03};        // stub quad (binding + paper stub + torn bits), page units
const SERIF='"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC","SimSun",serif';
const SANS='"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
const COL={red:'#c3262b',ink:'#1f1d1b',muted:'#6d655a',paper:'#f6f1e4',board:'#9e1f22',gold:'#e8c37a'};

const bg=document.getElementById('bg'),bx=bg.getContext('2d');
const cv=document.getElementById('gl');
const gl=cv.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,depth:true});
const ui={hint:document.getElementById('hint'),count:document.getElementById('count'),today:document.getElementById('today'),
  sound:document.getElementById('sound'),toast:document.getElementById('toast'),fallback:document.getElementById('nogl')};

// ---------- days ----------
function localYmd(){const t=new Date();return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');}
const todayIdx=C.indexOf(A,Q.get('date')||localYmd());
const models=new Map();
const model=i=>{if(!models.has(i))models.set(i,C.dayModel(A,i));return models.get(i);};

// ---------- layout ----------
const L={};
function layout(){
  const vv=window.visualViewport;
  L.vw=Math.round(vv?vv.width:innerWidth);L.vh=Math.round(vv?vv.height:innerHeight);
  L.dpr=Math.min(window.devicePixelRatio||1,2.5);
  // nail and string 0.16, header 0.30, page 1.18, stack and board margin 0.08 page widths, plus room for the hint
  L.PW=Math.min(L.vw*0.84,(L.vh-60)/1.72,540);L.PH=L.PW*C.CFG.h;
  L.HH=L.PW*0.30;                                    // board header + binding above the perforation
  L.x0=(L.vw-L.PW)/2;
  const bottomRoom=L.PH+L.PW*0.06+44;
  L.perfY=Math.max(L.HH+L.PW*0.16+8,Math.min(L.vh*0.27,L.vh-bottomRoom));
  L.F=3.2;L.cx=0.5;L.cy=C.CFG.h/2;
  for(const c of [bg,cv]){c.width=Math.round(L.vw*L.dpr);c.height=Math.round(L.vh*L.dpr);c.style.width=L.vw+'px';c.style.height=L.vh+'px';}
}
function toScreen(x,y,z){const s=L.F/(L.F-z);return[L.x0+(L.cx+(x-L.cx)*s)*L.PW,L.perfY+(L.cy+(y-L.cy)*s)*L.PW];}
function fromScreen(X,Y,z){const s=L.F/(L.F-z),qx=(X-L.x0)/L.PW,qy=(Y-L.perfY)/L.PW;return[L.cx+(qx-L.cx)/s,L.cy+(qy-L.cy)/s];}

// ---------- paper textures (Canvas 2D) ----------
const grain=(()=>{const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),r=C.rng(7),im=x.createImageData(256,256);
  for(let i=0;i<im.data.length;i+=4){const v=r();im.data[i]=im.data[i+1]=im.data[i+2]=v<0.5?60:255;im.data[i+3]=Math.floor(r()*14);}
  x.putImageData(im,0,0);
  for(let k=0;k<90;k++){x.strokeStyle=`rgba(120,100,70,${0.05+r()*0.08})`;x.lineWidth=0.6;x.beginPath();const a=r()*256,b=r()*256;x.moveTo(a,b);x.quadraticCurveTo(a+r()*16-8,b+r()*16-8,a+r()*24-12,b+r()*24-12);x.stroke();}
  return c;})();
function paperFill(x,w,h,tone){
  x.fillStyle=tone||COL.paper;x.fillRect(0,0,w,h);
  x.fillStyle=x.createPattern(grain,'repeat');x.fillRect(0,0,w,h);
  const g=x.createRadialGradient(w/2,h*0.45,w*0.2,w/2,h/2,w*0.85);g.addColorStop(0,'rgba(255,250,235,0)');g.addColorStop(1,'rgba(170,140,90,0.10)');
  x.fillStyle=g;x.fillRect(0,0,w,h);
}
function vertical(x,text,cx,y,size,gap){for(const ch of text){x.fillText(ch,cx,y);y+=size+(gap||0);}return y;}
function wrapItems(x,items,left,y,maxW,lh){let line='',yy=y;
  for(const it of items){const t=line?line+'　'+it:it;if(x.measureText(t).width>maxW&&line){x.fillText(line,left,yy);yy+=lh;line=it;}else line=t;}
  if(line)x.fillText(line,left,yy);return yy;}
function chongText(m){const r=/^冲\((..)\)(.)$/.exec(m.chong);return r?`冲${r[2]}（${r[1]}）　${m.sha}`:m.chong+'　'+m.sha;}

function drawPage(c,m){
  const x=c.getContext('2d'),W=TEX_W,H=TEX_H;c.width=W;c.height=H;
  paperFill(x,W,H);
  const main=m.red?COL.red:COL.ink;
  x.textBaseline='alphabetic';
  // header
  x.fillStyle=COL.muted;x.font=`500 38px ${SANS}`;x.textAlign='left';x.fillText(`${m.year}年${m.month}月`,64,98);
  x.fillStyle=COL.red;x.textAlign='right';x.font=`600 38px ${SERIF}`;x.fillText(`${m.yearGz}${m.zodiac}年`,W-64,98);
  x.strokeStyle=COL.red;x.globalAlpha=0.75;x.lineWidth=3;x.beginPath();x.moveTo(56,124);x.lineTo(W-56,124);x.stroke();
  x.lineWidth=1.2;x.beginPath();x.moveTo(56,133);x.lineTo(W-56,133);x.stroke();x.globalAlpha=1;
  // week
  x.textAlign='center';x.fillStyle=main;x.font=`600 44px ${SERIF}`;x.fillText(m.week,W/2,196);
  x.font=`500 24px ${SANS}`;x.fillStyle=COL.muted;x.fillText(m.weekEn,W/2,232);
  // the big number, with a faint second impression for an old offset print
  x.font=`bold 440px ${SERIF}`;
  x.fillStyle=m.red?'rgba(195,38,43,0.16)':'rgba(31,29,27,0.12)';x.fillText(String(m.day),W/2+5,616);
  x.fillStyle=main;x.fillText(String(m.day),W/2,612);
  // lunar column left, ganzhi column right
  x.fillStyle=COL.red;x.font=`600 56px ${SERIF}`;
  vertical(x,m.lunarMonth,104,300,56,6);vertical(x,m.lunarDay,104,300+3*62+18,56,6);
  x.fillStyle=COL.muted;x.font=`500 34px ${SERIF}`;
  vertical(x,m.ganzhi.replace(/ /g,''),W-100,290,34,8);
  // term / festival badge
  const tag=m.term||m.fest[0]||(m.holidayName&&m.holiday==='休'?m.holidayName:'');
  if(tag){x.font=`600 44px ${SERIF}`;const w=x.measureText(tag).width+64;
    x.fillStyle=COL.red;round(x,W/2-w/2,646,w,66,10);x.fill();x.fillStyle='#fff6e6';x.fillText(tag,W/2,694);}
  if(m.holiday){x.save();x.translate(W-150,200);x.rotate(-0.18);x.strokeStyle=m.holiday==='休'?COL.red:COL.ink;x.fillStyle=x.strokeStyle;
    x.lineWidth=5;x.globalAlpha=0.85;x.beginPath();x.arc(0,0,52,0,6.283);x.stroke();x.font=`bold 58px ${SERIF}`;x.fillText(m.holiday,0,21);x.restore();}
  // yi / ji
  x.strokeStyle='rgba(109,101,90,0.35)';x.lineWidth=2;x.setLineDash([6,8]);x.beginPath();x.moveTo(60,740);x.lineTo(W-60,740);x.stroke();x.setLineDash([]);
  const row=(label,color,items,y)=>{x.fillStyle=color;x.beginPath();x.arc(104,y-14,34,0,6.283);x.fill();
    x.fillStyle='#fff6e6';x.font=`bold 40px ${SERIF}`;x.textAlign='center';x.fillText(label,104,y);
    x.fillStyle=COL.ink;x.font=`500 38px ${SERIF}`;x.textAlign='left';return wrapItems(x,items,164,y,W-164-64,52);};
  row('宜',COL.red,m.yi,812);row('忌','#3b3733',m.ji,930);
  x.fillStyle=COL.muted;x.font=`500 28px ${SANS}`;x.textAlign='left';x.fillText(chongText(m),164,1012);
  // a line of Cantonese
  x.fillStyle='rgba(195,38,43,0.07)';round(x,56,1040,W-112,128,12);x.fill();
  x.fillStyle=COL.red;x.font=`600 24px ${SANS}`;x.textAlign='left';x.fillText('一句广州话',84,1078);
  x.fillStyle=COL.ink;x.font=`600 46px ${SERIF}`;x.textAlign='center';fitText(x,m.saying[0],W/2+46,1092,W-260);
  x.fillStyle=COL.muted;x.font=`400 27px ${SANS}`;fitText(x,m.saying[1],W/2,1146,W-150);
  x.fillStyle='rgba(109,101,90,0.6)';x.font=`400 18px ${SANS}`;x.textAlign='right';x.fillText('我的AI小木屋 · 手撕日历',W-40,H-14);
  // perforation: a row of small holes right under the top edge
  x.globalCompositeOperation='destination-out';
  for(let px=10;px<W;px+=17){x.beginPath();x.arc(px,5,2.6,0,6.283);x.fill();}
  x.globalCompositeOperation='source-over';
  return c;
}
function round(x,a,b,w,h,r){x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath();}
function fitText(x,t,cx,y,maxW){const w=x.measureText(t).width;if(w>maxW){x.save();x.translate(cx,y);x.scale(maxW/w,1);x.fillText(t,0,0);x.restore();}else x.fillText(t,cx,y);}

// ---------- the stub: binding bar, paper stub, torn bits that stay behind ----------
const stub=document.createElement('canvas');
stub.width=Math.round((STUB.x1-STUB.x0)*TEX_W);stub.height=Math.round((STUB.y1-STUB.y0)*TEX_W);
const sx=stub.getContext('2d'),SOX=-STUB.x0*TEX_W,SOY=-STUB.y0*TEX_W;   // page (0,0) on the stub canvas
let stubLayer=null;
function drawStubBase(){
  stubLayer=document.createElement('canvas');stubLayer.width=stub.width;stubLayer.height=stub.height;
  const x=stubLayer.getContext('2d');
  // paper stub left by every page so far: a few stacked bands under the binding
  x.save();x.translate(SOX,0);
  const band=SOY-0.07*TEX_W;
  x.fillStyle='#e9e1cf';x.fillRect(0,band,TEX_W,SOY-band);
  x.fillStyle=x.createPattern(grain,'repeat');x.fillRect(0,band,TEX_W,SOY-band);
  x.restore();
  // binding bar
  const by=0,bh=SOY-0.035*TEX_W;
  const g=x.createLinearGradient(0,by,0,bh);g.addColorStop(0,'#7b1517');g.addColorStop(0.55,'#9e1f22');g.addColorStop(1,'#5e1012');
  x.fillStyle=g;x.fillRect(0,by,stub.width,bh);
  x.fillStyle='rgba(0,0,0,0.25)';x.fillRect(0,bh,stub.width,4);
  for(const f of [0.18,0.82]){const cx=SOX+f*TEX_W;x.fillStyle='#c9c4b8';x.fillRect(cx-34,bh*0.42,68,10);x.fillStyle='rgba(255,255,255,0.55)';x.fillRect(cx-34,bh*0.42,68,3);}
  x.fillStyle=COL.gold;x.font=`600 30px ${SERIF}`;x.textAlign='center';x.fillText('每日一页 · 撕去昨天',stub.width/2,bh*0.62);
  sx.clearRect(0,0,stub.width,stub.height);sx.drawImage(stubLayer,0,0);
}
// A ragged tear between page x a..b (page units). Returns a polyline of [x, depth px below the perforation].
function raggedEdge(a,b,r){
  const pts=[],step=5;let d=4+r()*6;
  for(let px=a*TEX_W;px<=b*TEX_W+step;px+=step){d+=(r()-0.5)*5;d=Math.max(0,Math.min(17,d));if(r()<0.06)d=Math.min(17,d+6*r());pts.push([Math.min(px,b*TEX_W),d]);}
  return pts;
}
function applyTear(page,a,b,r){
  const pts=raggedEdge(a,b,r),x=page.canvas.getContext('2d');
  // the page loses the strip above the ragged line
  x.save();x.globalCompositeOperation='destination-out';x.beginPath();x.moveTo(pts[0][0],-2);
  for(const p of pts)x.lineTo(p[0],p[1]);x.lineTo(pts[pts.length-1][0],-2);x.closePath();x.fill();x.restore();
  // loose fibres along the new edge, on the page and on the stub
  x.strokeStyle='rgba(232,224,206,0.9)';x.lineWidth=1.3;
  for(const p of pts)if(r()<0.35){x.beginPath();x.moveTo(p[0],p[1]+1);x.lineTo(p[0]+(r()-0.5)*8,p[1]-2-r()*5);x.stroke();}
  // the same strip stays on the stub, in front of whatever page is next
  sx.save();sx.translate(SOX,SOY);sx.beginPath();sx.rect(0,-SOY,TEX_W,stub.height);sx.clip();   // torn bits never stick out past the page
  sx.fillStyle='#efe8d8';sx.beginPath();sx.moveTo(pts[0][0],-1);for(const p of pts)sx.lineTo(p[0],p[1]);sx.lineTo(pts[pts.length-1][0],-1);sx.closePath();sx.fill();
  sx.strokeStyle='rgba(150,130,100,0.35)';sx.lineWidth=1;sx.beginPath();pts.forEach((p,i)=>i?sx.lineTo(p[0],p[1]):sx.moveTo(p[0],p[1]));sx.stroke();
  sx.strokeStyle='rgba(240,233,218,0.95)';sx.lineWidth=1.2;
  for(const p of pts)if(r()<0.3){sx.beginPath();sx.moveTo(p[0],p[1]-1);sx.lineTo(p[0]+(r()-0.5)*7,p[1]+2+r()*6);sx.stroke();}
  sx.restore();
  page.dirty=true;stubDirty=true;
}
// a calendar in use has already lost pages: seed the stub with old tears so it looks lived in
function seedStub(n){const r=C.rng(1234+todayIdx);const fake={canvas:document.createElement('canvas')};fake.canvas.width=TEX_W;fake.canvas.height=24;
  for(let k=0;k<n;k++){const segs=C.CFG.nx-1;for(let i=0;i<segs;i++)applyTear(fake,i/segs,(i+1)/segs,r);}}

// ---------- WebGL ----------
let prog,shadowProg,flatProg,buf={},stubTex,stubDirty=true;
const VS=`attribute vec3 aPos;attribute vec2 aUv;attribute vec3 aN;
uniform vec4 uL;uniform vec2 uC;uniform vec2 uView;uniform vec3 uShadow;
varying vec2 vUv;varying vec3 vN;varying float vA;
void main(){vec3 p=aPos;vA=1.;
 if(uShadow.z>0.){vA=0.24*smoothstep(0.,0.06,p.z)*clamp(1.-p.z*1.1,0.15,1.);p.xy+=p.z*vec2(0.20,0.30)+uShadow.xy*p.z;p.z=0.;}
 float s=uL.w/(uL.w-p.z);vec2 q=uC+(p.xy-uC)*s;vec2 px=uL.xy+q*uL.z;
 gl_Position=vec4(px.x/uView.x*2.-1.,1.-px.y/uView.y*2.,clamp(-p.z*0.4,-0.99,0.99),1.);
 vUv=aUv;vN=aN;}`;
const FS=`precision mediump float;uniform sampler2D uTex;uniform highp vec3 uShadow;varying vec2 vUv;varying vec3 vN;varying float vA;
void main(){vec4 t=texture2D(uTex,vUv);if(t.a<0.5)discard;
 if(uShadow.z>0.){gl_FragColor=vec4(0.,0.,0.,vA);return;}
 vec3 n=normalize(vN);bool back=n.z<0.;if(back)n=-n;
 vec3 Lg=normalize(vec3(-0.45,-0.55,0.70));float d=max(dot(n,Lg),0.);
 float shade=(0.60+0.40*d)/(0.60+0.40*Lg.z);
 float rim=pow(1.-n.z,3.)*0.10;
 vec3 col=back?vec3(0.925,0.894,0.824)-(1.-t.rgb)*0.07:t.rgb;   // the back is plain paper with a faint show-through
 gl_FragColor=vec4(col*shade+rim,1.);}`;
const FLAT_VS=`attribute vec2 aXY;attribute vec2 aUv;uniform vec4 uL;uniform vec2 uView;varying vec2 vUv;
void main(){vec2 px=uL.xy+aXY*uL.z;gl_Position=vec4(px.x/uView.x*2.-1.,1.-px.y/uView.y*2.,-0.995,1.);vUv=aUv;}`;
const FLAT_FS=`precision mediump float;uniform sampler2D uTex;varying vec2 vUv;void main(){vec4 t=texture2D(uTex,vUv);if(t.a<0.02)discard;gl_FragColor=vec4(t.rgb*t.a,t.a);}`;
function compile(vs,fs){const p=gl.createProgram();for(const [t,src] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);}gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
function initGL(){
  prog=compile(VS,FS);flatProg=compile(FLAT_VS,FLAT_FS);
  const {nx,ny}=C.CFG,uv=new Float32Array(nx*ny*2),idx=[];
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){uv[(j*nx+i)*2]=i/(nx-1);uv[(j*nx+i)*2+1]=j/(ny-1);}
  for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){const a=j*nx+i,b=a+1,c=a+nx,d=c+1;idx.push(a,c,b,b,c,d);}
  buf.uv=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf.uv);gl.bufferData(gl.ARRAY_BUFFER,uv,gl.STATIC_DRAW);
  buf.idx=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buf.idx);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.STATIC_DRAW);buf.count=idx.length;
  buf.pos=gl.createBuffer();buf.n=gl.createBuffer();
  const q=new Float32Array([STUB.x0,STUB.y0,0,0, STUB.x1,STUB.y0,1,0, STUB.x0,STUB.y1,0,1, STUB.x1,STUB.y1,1,1]);
  buf.stub=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf.stub);gl.bufferData(gl.ARRAY_BUFFER,q,gl.STATIC_DRAW);
  stubTex=newTex();
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
}
function newTex(){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
function upload(t,canvas){gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);}
function uniforms(p){gl.uniform4f(gl.getUniformLocation(p,'uL'),L.x0,L.perfY,L.PW,L.F);gl.uniform2f(gl.getUniformLocation(p,'uView'),L.vw,L.vh);
  const c=gl.getUniformLocation(p,'uC');if(c)gl.uniform2f(c,L.cx,L.cy);}
function attr(p,name,b,size){const loc=gl.getAttribLocation(p,name);if(loc<0)return;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);}
function drawSheet(page,shadow){
  const s=page.sheet;
  if(page.dirty){upload(page.tex,page.canvas);page.dirty=false;}
  gl.useProgram(prog);uniforms(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER,buf.pos);gl.bufferData(gl.ARRAY_BUFFER,s.P,gl.DYNAMIC_DRAW);attr(prog,'aPos',buf.pos,3);
  gl.bindBuffer(gl.ARRAY_BUFFER,buf.n);gl.bufferData(gl.ARRAY_BUFFER,s.N,gl.DYNAMIC_DRAW);attr(prog,'aN',buf.n,3);
  attr(prog,'aUv',buf.uv,2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buf.idx);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,page.tex);gl.uniform1i(gl.getUniformLocation(prog,'uTex'),0);
  const sh=gl.getUniformLocation(prog,'uShadow');
  if(shadow){gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
    for(const [ox,oy] of [[0,0],[0.05,0.03],[-0.03,0.06]]){gl.uniform3f(sh,ox,oy,1);gl.drawElements(gl.TRIANGLES,buf.count,gl.UNSIGNED_SHORT,0);}}
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.uniform3f(sh,0,0,0);
  gl.drawElements(gl.TRIANGLES,buf.count,gl.UNSIGNED_SHORT,0);
}
function drawStub(){
  if(stubDirty){upload(stubTex,stub);stubDirty=false;}
  gl.disable(gl.DEPTH_TEST);gl.useProgram(flatProg);uniforms(flatProg);
  const loc1=gl.getAttribLocation(flatProg,'aXY'),loc2=gl.getAttribLocation(flatProg,'aUv');
  gl.bindBuffer(gl.ARRAY_BUFFER,buf.stub);gl.enableVertexAttribArray(loc1);gl.vertexAttribPointer(loc1,2,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(loc2);gl.vertexAttribPointer(loc2,2,gl.FLOAT,false,16,8);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,stubTex);gl.uniform1i(gl.getUniformLocation(flatProg,'uTex'),0);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  gl.disableVertexAttribArray(loc1);gl.disableVertexAttribArray(loc2);
}

// ---------- the background: wall, board, header, the next page, the stack ----------
let nextCanvas=null;
function drawBg(){
  const x=bx,d=L.dpr;x.setTransform(d,0,0,d,0,0);
  const g=x.createLinearGradient(0,0,0,L.vh);g.addColorStop(0,'#ece3d1');g.addColorStop(1,'#d6c7ac');x.fillStyle=g;x.fillRect(0,0,L.vw,L.vh);
  x.globalAlpha=0.5;x.fillStyle=x.createPattern(grain,'repeat');x.fillRect(0,0,L.vw,L.vh);x.globalAlpha=1;
  const lamp=x.createRadialGradient(L.vw*0.3,L.vh*0.1,10,L.vw*0.3,L.vh*0.1,L.vh*0.9);lamp.addColorStop(0,'rgba(255,248,230,0.35)');lamp.addColorStop(1,'rgba(80,60,30,0.12)');
  x.fillStyle=lamp;x.fillRect(0,0,L.vw,L.vh);
  const m=model(cur.i),left=Math.max(0,m.left),stack=3+11*left/365;
  const bx0=L.x0-L.PW*0.05,bw=L.PW*1.10,by0=L.perfY-L.HH,bh=L.HH+L.PH+stack+L.PW*0.05;
  // string and nail
  const nx=L.vw/2,ny=Math.max(6,by0-L.PW*0.16);
  x.strokeStyle='rgba(60,40,25,0.7)';x.lineWidth=1.4;x.beginPath();x.moveTo(nx-L.PW*0.12,by0+L.PW*0.03);x.lineTo(nx,ny);x.lineTo(nx+L.PW*0.12,by0+L.PW*0.03);x.stroke();
  x.fillStyle='#5b4a3a';x.beginPath();x.arc(nx,ny,3.5,0,6.283);x.fill();
  // board with its shadow on the wall
  x.save();x.shadowColor='rgba(60,35,15,0.35)';x.shadowBlur=L.PW*0.06;x.shadowOffsetX=L.PW*0.02;x.shadowOffsetY=L.PW*0.03;
  x.fillStyle=COL.board;round(x,bx0,by0,bw,bh,L.PW*0.025);x.fill();x.restore();
  const sheen=x.createLinearGradient(bx0,by0,bx0+bw,by0+bh);sheen.addColorStop(0,'rgba(255,255,255,0.10)');sheen.addColorStop(1,'rgba(0,0,0,0.12)');
  x.fillStyle=sheen;round(x,bx0,by0,bw,bh,L.PW*0.025);x.fill();
  // header lettering
  x.textAlign='center';x.fillStyle=COL.gold;
  x.font=`bold ${Math.round(L.PW*0.085)}px ${SERIF}`;x.fillText('广州老黄历',L.vw/2,by0+L.HH*0.36);
  x.font=`500 ${Math.round(L.PW*0.034)}px ${SERIF}`;x.globalAlpha=0.9;
  x.fillText(`${cnYear(m.year)} · ${m.yearGz}${m.zodiac}年`,L.vw/2,by0+L.HH*0.555);x.globalAlpha=1;
  // the stack under the pages: edges of the pages still to come
  for(let k=Math.ceil(stack);k>0;k--){x.fillStyle=k%2?'#e7dfcc':'#d9cfb9';x.fillRect(L.x0+k*0.35,L.perfY+L.PH,L.PW,k);}
  x.fillStyle='rgba(0,0,0,0.12)';x.fillRect(L.x0,L.perfY+L.PH+stack,L.PW,1.5);
  // the next page, flat on the stack
  const nxt=cur.i+1<A.days.length?cur.i+1:null;
  if(nxt!=null){if(!nextCanvas||nextCanvas.idx!==nxt){nextCanvas=drawPage(document.createElement('canvas'),model(nxt));nextCanvas.idx=nxt;}
    x.drawImage(nextCanvas,L.x0,L.perfY,L.PW,L.PH);}
  else{x.fillStyle='#d8ccb3';x.fillRect(L.x0,L.perfY,L.PW,L.PH);x.fillStyle=COL.muted;x.font=`500 ${Math.round(L.PW*0.05)}px ${SANS}`;x.fillText('这本撕完了',L.vw/2,L.perfY+L.PH/2);}
}
const CN='〇一二三四五六七八九';const cnYear=y=>String(y).split('').map(c=>CN[+c]).join('');

// ---------- pages in play ----------
let cur=null;const falling=[];let torn=0,rnd=C.rng(99+todayIdx);
function makePage(i){const canvas=drawPage(document.createElement('canvas'),model(i));const sheet=C.createSheet();sheet.seed=i*1.7;
  if(i>=A.days.length-1)sheet.o.breakDist=1e9;               // the last page of the book stays on
  return{i,canvas,tex:newTex(),dirty:true,sheet};}
function setCurrent(i){if(cur)gl.deleteTexture(cur.tex);cur=makePage(i);drawBg();refreshUi();}
function promote(){
  // the page came free: it joins the falling pages (still in the hand if held) and the next page becomes current
  falling.push(cur);torn++;if(falling.length>3){const old=falling.shift();gl.deleteTexture(old.tex);}
  const i=cur.i+1;cur=makePage(i);drawBg();refreshUi();sound.free();
  if(torn===1)hint('');
}

// ---------- input ----------
let finger=null;     // {id, page, down:[x,y], last:[x,y,t], speed}
function pagePoint(e){return[e.clientX,e.clientY];}
cv.addEventListener('pointerdown',e=>{
  sound.wake();
  if(finger||!cur)return;
  const [X,Y]=pagePoint(e),[u,v]=fromScreen(X,Y,0);
  if(u<-0.04||u>1.04||v<0.03||v>C.CFG.h+0.04)return;
  cv.setPointerCapture(e.pointerId);
  cur.sheet.grabAt(Math.max(0,Math.min(1,u)),Math.max(0,Math.min(C.CFG.h,v)));
  finger={id:e.pointerId,page:cur,down:[X,Y],last:[X,Y,performance.now()],speed:0};
  if(!torn)hint('往下拽，撕开它');
  e.preventDefault();
});
cv.addEventListener('pointermove',e=>{
  if(!finger||e.pointerId!==finger.id)return;
  const [X,Y]=pagePoint(e),now=performance.now(),dt=Math.max(1,now-finger.last[2]);
  finger.speed=finger.speed*0.7+0.3*Math.hypot(X-finger.last[0],Y-finger.last[1])/dt;finger.last=[X,Y,now];
  steer(finger,X,Y);
});
function steer(f,X,Y){
  const dist=Math.hypot(X-f.down[0],Y-f.down[1])/L.PW;
  const z=f.page.sheet.free?Math.min(0.5,0.12+dist*0.3):Math.min(0.32,0.03+dist*0.55);
  const [x,y]=fromScreen(X,Y,z);f.page.sheet.moveTo(x,y,z);
}
function lift(e){if(!finger||(e&&e.pointerId!==finger.id))return;finger.page.sheet.release();finger=null;sound.rustle(0);}
for(const ev of ['pointerup','pointercancel','lostpointercapture'])cv.addEventListener(ev,lift);
window.addEventListener('blur',()=>lift());
document.addEventListener('visibilitychange',()=>{if(document.hidden)lift();});
window.addEventListener('keydown',e=>{if(e.key===' '||e.key==='ArrowDown'||e.key==='Enter'){e.preventDefault();autoTear();}});
ui.today.addEventListener('click',()=>{for(const p of falling)gl.deleteTexture(p.tex);falling.length=0;setCurrent(todayIdx);});
ui.sound.addEventListener('click',()=>{sound.on=!sound.on;ui.sound.textContent=sound.on?'声音 开':'声音 关';ui.sound.setAttribute('aria-pressed',String(sound.on));if(sound.on)sound.wake();});

// scripted finger, for the keyboard, fixed views and tests: [t, x, y, z] keyframes in page units, then release
let script=null;
function autoTear(){if(finger||script||!cur)return;runScript([[0,0.92,1.1,0],[0.5,0.86,1.45,0.15],[0.8,0.8,1.62,0.25],[1.0,0.74,1.6,0.3]],true);}
function runScript(keys,releaseAtEnd,onDone){script={keys,t:0,page:cur,release:releaseAtEnd,onDone};cur.sheet.grabAt(keys[0][1],keys[0][2]);}
function scriptStep(dt){
  const s=script;s.t+=dt;const k=s.keys;let a=k[0],b=k[k.length-1];
  for(let i=0;i<k.length-1;i++)if(s.t>=k[i][0]&&s.t<=k[i+1][0]){a=k[i];b=k[i+1];break;}
  const f=b[0]>a[0]?Math.min(1,(s.t-a[0])/(b[0]-a[0])):1,e=f*f*(3-2*f);
  s.page.sheet.moveTo(a[1]+(b[1]-a[1])*e,a[2]+(b[2]-a[2])*e,a[3]+(b[3]-a[3])*e);
  if(s.t>=k[k.length-1][0]){if(s.release)s.page.sheet.release();script=null;if(s.onDone)s.onDone();}
}

// ---------- sound: synthesised paper ----------
const sound=(()=>{
  let ctx=null,noise=null,rus=null;const S={on:true};
  S.wake=()=>{if(!S.on)return;if(!ctx){try{ctx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
      noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const d=noise.getChannelData(0),r=C.rng(5);for(let i=0;i<d.length;i++)d[i]=r()*2-1;
      const src=ctx.createBufferSource();src.buffer=noise;src.loop=true;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=3200;bp.Q.value=0.6;
      const g=ctx.createGain();g.gain.value=0;src.connect(bp).connect(g).connect(ctx.destination);src.start();rus=g;}
    if(ctx.state==='suspended')ctx.resume();};
  function burst(freq,q,dur,peak,rate){if(!ctx||!S.on)return;const t=ctx.currentTime,src=ctx.createBufferSource();src.buffer=noise;src.playbackRate.value=rate||1;
    const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=freq;bp.Q.value=q;const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=500;
    const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+0.003);g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    src.connect(bp).connect(hp).connect(g).connect(ctx.destination);src.start(t,rnd()*0.8);src.stop(t+dur+0.02);}
  S.rip=load=>{const p=0.18+0.22*Math.min(1,load/2);burst(1600+rnd()*2600,0.8,0.04+rnd()*0.05,p,0.94+rnd()*0.12);burst(5200,1.5,0.012,p*0.6);
    if(navigator.vibrate)try{navigator.vibrate(6);}catch(e){}};
  S.free=()=>burst(1300,0.5,0.16,0.3,0.9);
  S.rustle=v=>{if(rus&&ctx)rus.gain.setTargetAtTime(S.on?Math.min(0.06,v*0.03):0,ctx.currentTime,0.05);};
  return S;
})();

// ---------- ui ----------
function hint(t){ui.hint.textContent=t;ui.hint.hidden=!t;}
function refreshUi(){
  ui.count.textContent=torn?`已撕 ${torn} 页`:'';ui.count.hidden=!torn;
  ui.today.hidden=cur.i===todayIdx;
}
let toastT=0;function toast(t){ui.toast.textContent=t;ui.toast.hidden=false;toastT=2.2;}

// ---------- loop ----------
let frozen=false,last=performance.now(),fps=60,state=VIEW||'play';
function update(dt){
  if(script)scriptStep(dt);
  const s=cur.sheet;
  if(!frozen){
    s.step(dt);
    for(const ev of s.events){if(ev.type==='rip'){applyTear(cur,ev.x-0.5/(C.CFG.nx-1),ev.x+0.5/(C.CFG.nx-1),rnd);sound.rip(ev.load);}}
    s.events.length=0;
    if(s.free)promote();
    for(let k=falling.length-1;k>=0;k--){const p=falling[k];p.sheet.step(dt);p.sheet.events.length=0;
      const b=C.bounds(p.sheet);if(toScreen(0,b.y0,0)[1]>L.vh+40&&!(finger&&finger.page===p)){gl.deleteTexture(p.tex);falling.splice(k,1);}}
  }
  if(finger){sound.rustle(finger.speed);finger.speed*=0.9;}
  if(cur.i>=A.days.length-1&&finger&&!toastT)toast('这本撕完了，明年见');
  if(toastT>0){toastT-=dt;if(toastT<=0)ui.toast.hidden=true;}
}
function render(){
  gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  drawSheet(cur,true);
  drawStub();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  for(const p of falling)drawSheet(p,false);
}
function frame(now){
  const dt=Math.min(1/30,(now-last)/1000);last=now;fps=fps*0.95+0.05/Math.max(dt,1e-3);
  update(dt);render();requestAnimationFrame(frame);
}

// ---------- fixed views ----------
function startView(){
  if(VIEW==='lift')runScript([[0,0.92,1.1,0],[0.6,0.74,0.86,0.30],[1.6,0.74,0.86,0.30]],false,()=>{state='lift-ready';});
  else if(VIEW==='torn'){
    const keys=[[0,0.92,1.1,0],[1.4,0.95,1.62,0.12]];runScript(keys,false);
    const watch=setInterval(()=>{if(cur.sheet.broken>=6){clearInterval(watch);script=null;setTimeout(()=>{state='torn-ready';},700);}},16);
  }else if(VIEW==='fall'){autoTear();const w=setInterval(()=>{if(falling.length&&!script){clearInterval(w);setTimeout(()=>{frozen=true;state='fall-ready';},450);}},16);}
  else state=VIEW?VIEW+'-ready':'play';
}

// ---------- hooks ----------
function probe(){const s=cur.sheet;return{state,ymd:model(cur.i).ymd,today:model(todayIdx).ymd,broken:s.broken,free:s.free,torn,falling:falling.length,
  lift:+C.bounds(s).z1.toFixed(3),fps:Math.round(fps),hint:ui.hint.hidden?'':ui.hint.textContent,
  layout:{vw:L.vw,vh:L.vh,PW:+L.PW.toFixed(1),perfY:+L.perfY.toFixed(1),boardTop:+(L.perfY-L.HH-L.PW*0.16).toFixed(1),pageBottom:+(L.perfY+L.PH).toFixed(1)}};}

function boot(){
  if(!gl){ui.fallback.hidden=false;return;}
  try{initGL();}catch(err){ui.fallback.hidden=false;ui.fallback.textContent='这台设备的浏览器画不了这本日历（WebGL 启动失败）。';throw err;}
  layout();drawStubBase();seedStub(Math.min(8,1+Math.floor(todayIdx/40)));
  cur=makePage(todayIdx);drawBg();refreshUi();hint(VIEW&&VIEW!=='hero'?'':'捏住页脚，往下撕');
  const re=()=>{layout();drawBg();};window.addEventListener('resize',re);if(window.visualViewport)visualViewport.addEventListener('resize',re);
  window.__tearcal={get ready(){return true;},probe,autoTear,get state(){return state;}};
  window.__PLAYTEST__={ready:true,snapshot:probe,reset:()=>{for(const p of falling)gl.deleteTexture(p.tex);falling.length=0;torn=0;setCurrent(todayIdx);hint('捏住页脚，往下撕');},
    step:ms=>{for(let t=0;t<ms;t+=16.667)update(1/60);render();return probe();}};
  startView();requestAnimationFrame(frame);
}
boot();
})();
