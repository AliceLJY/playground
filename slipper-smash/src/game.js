// Slipper Smash page: drawing, input, sound and the acceptance hooks. All rules live in core.js.
(function(){
'use strict';
const Core=window.SlipperCore,CFG=Core.CFG,H=Core.H;
const canvas=document.getElementById('stage'),ctx=canvas.getContext('2d');
const params=new URLSearchParams(location.search),viewName=params.get('view');
const FONT='"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';
const COLOR={ink:'#0b0d12',cream:'#f3ead8',amber:'#ffb23e',blue:'#2f6fd6',sole:'#f7f5ef',tea:'#c8996b',alert:'#ff4d4d',gold:'#ffd75a'};

// ---------- assets ----------
const img={};let pending=0,assetsReady=false;
function load(name,file){pending++;const i=new Image();i.onload=i.onerror=()=>{if(--pending===0)onAssets();};i.src='assets/'+file;img[name]=i;}
load('front','roach-front.webp');load('back','roach-back.webp');load('alley','alley.webp');load('keeper','keeper.webp');
const ok=i=>i&&i.complete&&i.naturalWidth>0;
function goldFrom(src){
  const c=document.createElement('canvas');c.width=src.naturalWidth;c.height=src.naturalHeight;
  const g=c.getContext('2d');g.drawImage(src,0,0);
  try{const im=g.getImageData(0,0,c.width,c.height),d=im.data;
    for(let i=0;i<d.length;i+=4){const l=(d[i]*0.5+d[i+1]*0.4+d[i+2]*0.1)/255,k=Math.min(1,l*1.9);d[i]=70+185*k;d[i+1]=44+176*k;d[i+2]=4+110*k*k;}
    g.putImageData(im,0,0);}catch(e){}
  return c;
}
function onAssets(){if(ok(img.front))img.gold=goldFrom(img.front);assetsReady=true;boot();}

// ---------- view ----------
let cw=1,ch=1,dpr=1,view={scale:1,ox:0,oy:0,W:562};
function worldWidth(){return game?game.state.W:H*Math.max(0.42,Math.min(2.2,cw/ch));}
function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);cw=Math.max(1,Math.round(innerWidth*dpr));ch=Math.max(1,Math.round(innerHeight*dpr));
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  const W=worldWidth(),scale=Math.min(cw/W,ch/H);view={scale,ox:(cw-W*scale)/2,oy:(ch-H*scale)/2,W};
}
addEventListener('resize',resize);addEventListener('orientationchange',resize);
const toWorld=(cx,cy)=>({x:(cx*dpr-view.ox)/view.scale,y:(cy*dpr-view.oy)/view.scale});

// ---------- sound (synthesised, no files) ----------
let ac=null,muted=false,master=null;
try{muted=localStorage.getItem('slipper-muted')==='1';}catch(e){}
function audio(){
  if(ac||muted)return ac;
  try{ac=new (window.AudioContext||window.webkitAudioContext)();master=ac.createGain();master.gain.value=0.5;master.connect(ac.destination);}catch(e){ac=null;}
  return ac;
}
function tone(freq,to,dur,type,vol,delay){
  if(!audio()||muted)return;const t=ac.currentTime+(delay||0),o=ac.createOscillator(),g=ac.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+dur);
  g.gain.setValueAtTime(vol||0.3,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);o.connect(g).connect(master);o.start(t);o.stop(t+dur+0.02);
}
function noise(dur,freq,vol,q){
  if(!audio()||muted)return;const n=Math.floor(ac.sampleRate*dur),buf=ac.createBuffer(1,n,ac.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);
  const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();s.buffer=buf;f.type='bandpass';f.frequency.value=freq;f.Q.value=q||0.8;
  g.gain.value=vol;s.connect(f).connect(g).connect(master);s.start();
}
const sfx={
  slap(combo){noise(0.09,1800,0.9);tone(190,70,0.11,'triangle',0.5);if(combo>2)tone(520+Math.min(combo,16)*45,900+combo*30,0.09,'sine',0.16,0.03);},
  gold(){[880,1175,1568].forEach((f,i)=>tone(f,f*1.02,0.16,'sine',0.2,i*0.06));},
  tea(){noise(0.3,700,0.5,0.5);tone(420,120,0.4,'sawtooth',0.18);},
  boss(){tone(90,45,0.9,'sawtooth',0.4);tone(64,40,1.1,'square',0.2,0.1);},
  thump(){noise(0.12,500,0.9);tone(120,50,0.18,'triangle',0.6);},
  win(){[523,659,784,1047,1319].forEach((f,i)=>tone(f,f,0.22,'triangle',0.25,i*0.11));},
  lose(){[392,330,262].forEach((f,i)=>tone(f,f*0.97,0.3,'triangle',0.22,i*0.18));}
};

// ---------- game state ----------
let game=null,pilot=null,screen='title',frozen=false,best=0,endTimer=0,clock=0;
try{best=+localStorage.getItem('slipper-best')||0;}catch(e){}
const fx={splats:[],bits:[],pops:[],shake:0,flash:0,banner:0,trail:[],down:null};
const hand={x:-999,y:-999,angle:0,active:false,seen:false};
function start(seed){
  game=Core.create({seed:seed==null?(Math.random()*1e9)|0:seed,aspect:cw/ch});pilot=null;screen='play';endTimer=0;
  fx.splats.length=fx.bits.length=fx.pops.length=0;fx.shake=fx.flash=fx.banner=0;fx.down=null;resize();
}
function pop(text,x,y,color,size){fx.pops.push({text,x,y,color:color||COLOR.cream,size:size||44,t:0});}
function burst(x,y,n,color,speed){for(let i=0;i<n;i++){const a=Math.random()*6.283,v=speed*(0.35+Math.random());fx.bits.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-speed*0.3,r:4+Math.random()*7,color,t:0,life:0.5+Math.random()*0.4});}}
function handle(e){
  const s=game.state;
  if(e.type==='hit'){
    fx.splats.push({kind:e.kind,x:e.x,y:e.y,rot:e.rot,vx:e.vx*0.25+e.sx*2,vy:Math.min(e.vy,0)*0.2,t:0});
    burst(e.x,e.y,7,e.kind==='gold'?COLOR.gold:'#b9a14a',420);burst(e.x,e.y,4,COLOR.cream,520);
    pop('+'+e.pts,e.x,e.y-70,e.kind==='gold'?COLOR.gold:COLOR.cream,e.mult>1?52:42);
    if(e.combo>=3)fx.combo={n:e.combo,mult:e.mult,t:0};
    fx.shake=Math.max(fx.shake,5);e.kind==='gold'?sfx.gold():0;sfx.slap(e.combo);
  }else if(e.type==='tea'){
    burst(e.x,e.y,16,COLOR.tea,560);burst(e.x,e.y,6,'#3a2616',380);pop('奶茶洒了！',e.x,e.y-80,COLOR.alert,54);fx.flash=0.4;fx.shake=16;sfx.tea();
  }else if(e.type==='boss'){fx.banner=2.4;sfx.boss();}
  else if(e.type==='bossHit'){burst(e.x+(Math.random()-0.5)*120,e.y+(Math.random()-0.5)*160,6,COLOR.amber,520);pop('+'+e.pts,e.x+(Math.random()-0.5)*160,e.y-s.boss.r*0.9,COLOR.amber,46);fx.shake=Math.max(fx.shake,8);sfx.thump();if(e.combo>=3)fx.combo={n:e.combo,mult:e.mult,t:0};}
  else if(e.type==='bossDown'){fx.down={x:e.x,y:e.y,r:s.boss.r,t:0};burst(e.x,e.y,40,COLOR.gold,900);burst(e.x,e.y,20,COLOR.cream,700);pop('拍扁！+'+e.bonus,e.x,e.y-s.boss.r,COLOR.gold,64);fx.shake=24;sfx.thump();sfx.win();}
  else if(e.type==='over'){
    endTimer=e.reason==='win'?2.0:1.0;if(e.reason!=='win')sfx.lose();
    if(s.score>best){best=s.score;try{localStorage.setItem('slipper-best',String(best));}catch(err){}}
  }
}
function tick(dt){
  clock+=dt;
  if(screen==='play'&&game){
    if(game.state.phase!=='over'){if(pilot)pilot(game);game.step(dt);}
    const ev=game.state.events;for(let i=0;i<ev.length;i++)handle(ev[i]);ev.length=0;
    if(game.state.phase==='over'){endTimer-=dt;if(endTimer<=0)screen='result',fx.resultT=0;}
  }
  if(screen==='result')fx.resultT+=dt;
  for(let i=fx.splats.length-1;i>=0;i--){const p=fx.splats[i];p.t+=dt;p.vy+=900*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.t>0.7)fx.splats.splice(i,1);}
  for(let i=fx.bits.length-1;i>=0;i--){const p=fx.bits[i];p.t+=dt;p.vy+=1400*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.t>p.life)fx.bits.splice(i,1);}
  for(let i=fx.pops.length-1;i>=0;i--){const p=fx.pops[i];p.t+=dt;p.y-=70*dt;if(p.t>0.8)fx.pops.splice(i,1);}
  if(fx.combo){fx.combo.t+=dt;if(fx.combo.t>1.1)fx.combo=null;}
  if(fx.down)fx.down.t+=dt;
  fx.shake=Math.max(0,fx.shake-60*dt);fx.flash=Math.max(0,fx.flash-dt);fx.banner=Math.max(0,fx.banner-dt);
  for(let i=fx.trail.length-1;i>=0;i--){fx.trail[i].t+=dt;if(fx.trail[i].t>0.16)fx.trail.splice(i,1);}
}

// ---------- input ----------
let lastPt=null;
function muteBox(){const s=view.scale;return{x:view.ox+18*s,y:view.oy+(H-64)*s,w:128*s,h:46*s};}
function down(ev){
  ev.preventDefault();audio();if(ac&&ac.state==='suspended')ac.resume();
  const px=ev.clientX*dpr,py=ev.clientY*dpr,m=muteBox();
  if(screen!=='play'&&px>=m.x&&px<=m.x+m.w&&py>=m.y&&py<=m.y+m.h){muted=!muted;try{localStorage.setItem('slipper-muted',muted?'1':'0');}catch(e){}return;}
  if(frozen)return;
  if(screen==='title'){start();return;}
  if(screen==='result'){if(fx.resultT>0.7)start();return;}
  const p=toWorld(ev.clientX,ev.clientY);lastPt=p;hand.active=true;hand.seen=true;hand.x=p.x;hand.y=p.y;
  try{canvas.setPointerCapture(ev.pointerId);}catch(e){}
  if(game&&!pilot)game.swipe(p.x,p.y,p.x,p.y);
}
function move(ev){
  const p=toWorld(ev.clientX,ev.clientY);
  if(Math.hypot(p.x-hand.x,p.y-hand.y)>6)hand.angle=Math.atan2(p.y-hand.y,p.x-hand.x);
  hand.x=p.x;hand.y=p.y;hand.seen=true;
  if(!hand.active||!lastPt||screen!=='play'||frozen)return;
  ev.preventDefault();
  if(game&&!pilot)game.swipe(lastPt.x,lastPt.y,p.x,p.y);
  fx.trail.push({x:p.x,y:p.y,t:0});lastPt=p;
}
function up(){hand.active=false;lastPt=null;}
canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!frozen){if(screen==='title')start();else if(screen==='result'&&fx.resultT>0.7)start();}});

// ---------- drawing ----------
function text(str,x,y,size,color,align,weight){
  ctx.font=(weight||900)+' '+size+'px '+FONT;ctx.textAlign=align||'center';ctx.textBaseline='middle';
  ctx.lineJoin='round';ctx.lineWidth=Math.max(3,size*0.16);ctx.strokeStyle='rgba(6,8,12,0.85)';ctx.strokeText(str,x,y);ctx.fillStyle=color;ctx.fillText(str,x,y);
}
function drawBackdrop(){
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=COLOR.ink;ctx.fillRect(0,0,cw,ch);
  if(ok(img.alley)){const a=img.alley,s=Math.max(cw/a.naturalWidth,ch/a.naturalHeight),w=a.naturalWidth*s,h=a.naturalHeight*s;ctx.drawImage(a,(cw-w)/2,(ch-h)*0.62,w,h);}
  else{const g=ctx.createLinearGradient(0,0,0,ch);g.addColorStop(0,'#1a2030');g.addColorStop(1,'#2a1a10');ctx.fillStyle=g;ctx.fillRect(0,0,cw,ch);}
  ctx.fillStyle='rgba(6,8,14,0.34)';ctx.fillRect(0,0,cw,ch);
}
function sprite(image,x,y,height,rot,alpha,sx,sy){
  if(!image||(image instanceof HTMLImageElement&&!ok(image)))return;
  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,w=height*iw/ih;
  ctx.save();ctx.translate(x,y);ctx.rotate(rot||0);ctx.scale(sx||1,sy||1);ctx.globalAlpha=alpha==null?1:alpha;ctx.drawImage(image,-w/2,-height*0.52,w,height);ctx.restore();
}
function slipper(x,y,rot,len,alpha){
  const k=len/150;ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.scale(k,k);ctx.globalAlpha=alpha==null?1:alpha;
  const sole=g=>{ctx.beginPath();ctx.ellipse(0,-26,31+g,48+g,0,0,6.283);ctx.ellipse(0,36,25+g,40+g,0,0,6.283);ctx.fill();};
  ctx.fillStyle='rgba(0,0,0,0.3)';ctx.save();ctx.translate(6,8);sole(5);ctx.restore();
  ctx.fillStyle=COLOR.blue;sole(5);ctx.fillStyle=COLOR.sole;sole(0);
  ctx.strokeStyle=COLOR.blue;ctx.lineWidth=10;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-27,10);ctx.quadraticCurveTo(-12,-14,0,-42);ctx.quadraticCurveTo(12,-14,27,10);ctx.stroke();
  ctx.restore();
}
function cup(x,y,rot,size,alpha,spilled){
  const k=size/56;ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.scale(k,k);ctx.globalAlpha=alpha==null?1:alpha;
  ctx.strokeStyle='#3fae6a';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(8,-40);ctx.lineTo(20,-86);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-36,-44);ctx.lineTo(36,-44);ctx.lineTo(27,56);ctx.quadraticCurveTo(0,64,-27,56);ctx.closePath();
  ctx.fillStyle=spilled?'rgba(243,234,216,0.25)':'rgba(243,234,216,0.92)';ctx.fill();
  if(!spilled){
    ctx.save();ctx.clip();ctx.fillStyle=COLOR.tea;ctx.fillRect(-40,-26,80,96);ctx.fillStyle='#2b1a10';
    [[-16,40],[2,46],[17,38],[-6,28],[10,24],[-20,22]].forEach(p=>{ctx.beginPath();ctx.arc(p[0],p[1],7,0,6.283);ctx.fill();});ctx.restore();
  }
  ctx.fillStyle=spilled?'rgba(243,234,216,0.3)':'#fffaf0';ctx.beginPath();ctx.ellipse(0,-45,40,9,0,0,6.283);ctx.fill();
  ctx.restore();
}
function drawEntity(e,t){
  if(e.kind==='tea'){
    const pulse=0.5+0.5*Math.sin(t*9);ctx.save();ctx.strokeStyle='rgba(255,77,77,'+(0.5+0.4*pulse)+')';ctx.lineWidth=5;ctx.setLineDash([14,10]);ctx.lineDashOffset=-t*40;
    ctx.beginPath();ctx.arc(e.x,e.y,e.r+16,0,6.283);ctx.stroke();ctx.restore();cup(e.x,e.y,e.rot,e.r);return;
  }
  if(e.kind==='flyer'){
    const rot=Math.atan2(e.vy,e.vx)+Math.PI/2,flap=Math.sin(t*46);
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(rot);ctx.fillStyle='rgba(255,214,160,0.3)';ctx.strokeStyle='rgba(255,230,190,0.45)';ctx.lineWidth=2;
    for(const side of[-1,1]){ctx.save();ctx.translate(side*14,-18);ctx.rotate(side*(-0.95-0.4*flap));ctx.beginPath();ctx.ellipse(0,52,17,58,0,0,6.283);ctx.fill();ctx.stroke();ctx.restore();}
    ctx.restore();sprite(img.back,e.x,e.y,e.r*3.1,rot);return;
  }
  if(e.kind==='gold'){ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle='rgba(255,215,90,0.18)';ctx.beginPath();ctx.arc(e.x,e.y,e.r*1.7,0,6.283);ctx.fill();ctx.restore();
    if(Math.random()<0.5)fx.bits.push({x:e.x+(Math.random()-0.5)*90,y:e.y+(Math.random()-0.5)*90,vx:0,vy:-40,r:3+Math.random()*4,color:COLOR.gold,t:0,life:0.4});
    sprite(img.gold||img.front,e.x,e.y,e.r*3.2,e.rot);return;}
  sprite(img.front,e.x,e.y,e.r*3.3,e.rot);
}
function drawBoss(b,t){
  const jig=b.flinch>0?(Math.random()-0.5)*26:0,breathe=1+0.025*Math.sin(t*3.2),h=b.r*2.9;
  ctx.save();ctx.fillStyle='rgba(255,178,62,0.10)';ctx.beginPath();ctx.arc(b.x,b.y,b.r*1.5,0,6.283);ctx.fill();ctx.restore();
  sprite(img.front,b.x+jig,b.y,h,Math.sin(t*1.3)*0.05,1,breathe,breathe);
  if(b.flinch>0){ctx.save();ctx.globalCompositeOperation='lighter';sprite(img.front,b.x+jig,b.y,h,Math.sin(t*1.3)*0.05,0.55,breathe,breathe);ctx.restore();}
}
function drawHud(s){
  const W=s.W,pad=22;
  text(String(s.score),pad,50,58,COLOR.cream,'left');
  text('最高 '+Math.max(best,s.score),pad,96,22,'rgba(243,234,216,0.75)','left',700);
  for(let i=0;i<CFG.lives;i++)cup(W-pad-26-i*58,54,0,25,1,i>=s.lives);
  const bw=Math.min(W-2*pad,520),bx=(W-bw)/2,by=152,bossOn=s.boss&&s.phase!=='waves';
  ctx.fillStyle='rgba(6,8,12,0.55)';ctx.fillRect(bx-3,by-3,bw+6,18);
  if(bossOn){
    ctx.fillStyle=COLOR.alert;ctx.fillRect(bx,by,bw*Math.max(0,s.boss.hp)/s.boss.maxHp,12);
    text('最靓的仔'+(s.phase==='boss'?'　'+Math.max(0,Math.ceil(CFG.bossTime-s.bossT))+' 秒后溜走':''),W/2,by-24,24,COLOR.amber);
  }else{ctx.fillStyle=COLOR.amber;ctx.fillRect(bx,by,bw*Math.min(1,s.t/CFG.waveTime),12);}
  if(fx.combo){const c=fx.combo,k=Math.min(1,c.t*8),a=Math.max(0,1-Math.max(0,c.t-0.7)/0.4);ctx.save();ctx.globalAlpha=a;
    text(c.n+' 连拍'+(c.mult>1?'  ×'+c.mult:''),W/2,bossOn?Math.min(H-120,s.boss.y+s.boss.r*1.5+50):236,(40+Math.min(c.n,20))*(0.7+0.3*k),c.mult>1?COLOR.gold:COLOR.cream);ctx.restore();}
  if(fx.banner>0){const a=Math.min(1,fx.banner,(2.4-fx.banner)*4);ctx.save();ctx.globalAlpha=a;ctx.fillStyle='rgba(6,8,12,0.6)';ctx.fillRect(0,H*0.52,W,150);
    text('最靓的仔 登场！',W/2,H*0.52+58,Math.min(72,W*0.11),COLOR.amber);text('对着它连续划，拍到它服',W/2,H*0.52+116,Math.min(30,W*0.05),COLOR.cream,'center',700);ctx.restore();}
}
function polaroid(cx,cy,w,reason,tilt){
  const h=w*1.12,pw=w*0.9,ph=w*0.82;ctx.save();ctx.translate(cx,cy);ctx.rotate(tilt);
  ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(-w/2+10,-h/2+14,w,h);ctx.fillStyle='#fbf8f1';ctx.fillRect(-w/2,-h/2,w,h);
  const px=-pw/2,py=-h/2+w*0.05;ctx.save();ctx.beginPath();ctx.rect(px,py,pw,ph);ctx.clip();ctx.fillStyle='#ffffff';ctx.fillRect(px,py,pw,ph);
  const win=reason==='win';
  if(ok(img.keeper)){const kh=ph*(win?0.9:1.0),kw=kh*img.keeper.naturalWidth/img.keeper.naturalHeight;ctx.drawImage(img.keeper,win?px+pw*0.23-kw/2:-kw/2,py+ph-kh,kw,kh);}
  if(win){const rh=ph*0.8,rx=px+pw*0.69,ry=py+ph*0.6;sprite(img.front,rx,ry,rh,0.04);slipper(rx-2,ry-rh*0.41,-0.5,rh*0.27);}
  ctx.restore();
  ctx.fillStyle='#3a3530';ctx.font='700 '+w*0.062+'px '+FONT;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(win?'和最靓的仔合个影，拖鞋送它了':reason==='tea'?'奶茶全洒了，今晚先收工':'让最靓的仔溜了，明晚再战',0,h/2-w*0.105);
  ctx.restore();
}
function drawTitle(t){
  const W=view.W;
  sprite(img.front,W/2,H*0.50+Math.sin(t*1.6)*12,Math.min(H*0.46,W*0.95),Math.sin(t*0.9)*0.05);
  slipper(W/2+Math.min(W*0.3,230),H*0.33+Math.sin(t*2.3)*16,0.6+Math.sin(t*2.3)*0.12,Math.min(190,W*0.34));
  text('凉拖拍蟑螂',W/2,H*0.14,Math.min(110,W*0.17),COLOR.amber);
  text('广州雨夜，小巷值班',W/2,H*0.14+Math.min(110,W*0.17)*0.78,Math.min(30,W*0.052),COLOR.cream,'center',700);
  const fs=Math.min(30,W*0.052),y0=H*0.76;
  text('按住划过蟑螂，一拖鞋拍扁',W/2,y0,fs,COLOR.cream,'center',700);
  text('画了红圈的奶茶别碰，三杯洒完就收工',W/2,y0+fs*1.5,fs,COLOR.cream,'center',700);
  text('45 秒后，最靓的仔登场',W/2,y0+fs*3,fs,COLOR.cream,'center',700);
  ctx.save();ctx.globalAlpha=0.6+0.4*Math.sin(t*4);text('点一下开始',W/2,H*0.925,Math.min(44,W*0.075),COLOR.gold);ctx.restore();
}
function drawResult(s,t){
  const W=s.W,r=s.result,k=Math.min(1,fx.resultT*3),e=1-(1-k)*(1-k);
  ctx.fillStyle='rgba(6,8,12,'+0.62*e+')';ctx.fillRect(-view.ox/view.scale,-view.oy/view.scale,cw/view.scale,ch/view.scale);
  ctx.save();ctx.globalAlpha=e;
  text(r.reason==='win'?'拍服了！':r.reason==='tea'?'奶茶洒光了':'它溜了',W/2,H*0.085,Math.min(84,W*0.14),r.reason==='win'?COLOR.gold:COLOR.cream);
  polaroid(W/2,H*0.40-(1-e)*60,Math.min(W*0.8,H*0.44),r.reason,-0.045);
  text(String(r.score)+' 分',W/2,H*0.725,Math.min(92,W*0.15),COLOR.amber);
  if(r.score>=best&&r.score>0)text('新纪录',W/2,H*0.725-Math.min(92,W*0.15)*0.72,Math.min(26,W*0.045),COLOR.gold);
  text('拍扁 '+r.kills+' 只　最长 '+r.bestCombo+' 连拍　漏掉 '+r.misses+' 只',W/2,H*0.795,Math.min(28,W*0.046),COLOR.cream,'center',700);
  ctx.globalAlpha=e*(0.6+0.4*Math.sin(t*4));text('点一下再来一局',W/2,H*0.905,Math.min(42,W*0.07),COLOR.gold);ctx.restore();
}
function draw(){
  const t=clock;drawBackdrop();
  const sh=fx.shake>0?fx.shake*dpr*0.5:0;
  ctx.setTransform(view.scale,0,0,view.scale,view.ox+(Math.random()-0.5)*sh,view.oy+(Math.random()-0.5)*sh);
  if(screen==='title')drawTitle(t);
  else if(game){
    const s=game.state;
    for(const p of fx.splats){const a=Math.max(0,1-p.t/0.7),r=CFG.radius[p.kind];sprite(p.kind==='gold'?(img.gold||img.front):p.kind==='flyer'?img.back:img.front,p.x,p.y,r*3.3,p.rot,a,1.25,0.4);}
    if(s.boss&&!fx.down)drawBoss(s.boss,t);
    if(fx.down&&fx.down.t<2){const d=fx.down,k=Math.min(1,d.t/0.35),a=Math.max(0,1-Math.max(0,d.t-1.2)/0.8);sprite(img.front,d.x,d.y+d.t*90,d.r*2.9,d.t*0.3,a,1+0.3*k,1-0.6*k);slipper(d.x,d.y-d.r*0.5+d.t*90,-0.5,d.r*0.9,a);}
    for(const e of s.ents)drawEntity(e,t);
    for(const p of fx.bits){ctx.globalAlpha=Math.max(0,1-p.t/p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.283);ctx.fill();}ctx.globalAlpha=1;
    if(fx.trail.length>1){ctx.lineCap='round';ctx.lineJoin='round';for(let i=1;i<fx.trail.length;i++){const a=fx.trail[i-1],b=fx.trail[i],k=1-b.t/0.16;ctx.strokeStyle='rgba(190,220,255,'+0.55*k+')';ctx.lineWidth=34*k+4;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
    for(const p of fx.pops){ctx.save();ctx.globalAlpha=Math.max(0,1-p.t/0.8);text(p.text,Math.max(90,Math.min(s.W-90,p.x)),p.y,p.size,p.color);ctx.restore();}
    if(screen==='play'){drawHud(s);if(hand.seen&&!pilot)slipper(hand.x,hand.y,hand.angle+Math.PI/2+(hand.active?0:-0.35),hand.active?170:140,hand.active?1:0.75);}
    if(screen==='result')drawResult(s,t);
  }
  if(screen!=='play'){const m=muteBox();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgba(6,8,12,0.5)';ctx.fillRect(m.x,m.y,m.w,m.h);
    ctx.font='700 '+m.h*0.48+'px '+FONT;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=COLOR.cream;ctx.fillText(muted?'声音：关':'声音：开',m.x+m.w/2,m.y+m.h/2);}
  if(fx.flash>0){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgba(255,60,60,'+fx.flash*0.6+')';ctx.fillRect(0,0,cw,ch);}
}

// ---------- loop, hooks, fixed views ----------
const metrics={frames:0,fps:0,maxFrameMs:0,avgFrameMs:0};
let lastNow=0,acc=0,windowStart=0,windowFrames=0,windowMax=0,windowSum=0;
function frame(now){
  requestAnimationFrame(frame);
  const elapsed=lastNow?Math.min(0.1,(now-lastNow)/1000):0;lastNow=now;
  if(!frozen){acc+=elapsed;while(acc>=CFG.step){tick(CFG.step);acc-=CFG.step;}}
  const t0=performance.now();draw();const cost=performance.now()-t0;
  metrics.frames++;windowFrames++;windowSum+=cost;if(cost>windowMax)windowMax=cost;
  if(now-windowStart>=1000){metrics.fps=Math.round(windowFrames*1000/(now-windowStart));metrics.maxFrameMs=+windowMax.toFixed(2);metrics.avgFrameMs=+(windowSum/windowFrames).toFixed(2);windowStart=now;windowFrames=0;windowMax=0;windowSum=0;}
}
function advance(seconds){const n=Math.round(seconds/CFG.step);for(let i=0;i<n;i++)tick(CFG.step);}
const VIEWS={hero:{seed:5,pilot:'human',t:13.2},stress:{seed:11,pilot:null,t:40.6},boss:{seed:8,pilot:'human',t:49.4},win:{seed:5,pilot:'precise',t:80}};
const hook=window.__slipper={ready:false,metrics,
  start(seed){start(seed);return hook;},
  autopilot(level){pilot=level?Core.pilot(level,game?game.state.t*1000|0:1):null;return hook;},
  advance(seconds){advance(seconds);return hook;},
  freeze(on){frozen=on!==false;return hook;},
  probe(){const s=game&&game.state,px=e=>({kind:e.kind,x:(view.ox+e.x*view.scale)/dpr,y:(view.oy+e.y*view.scale)/dpr,r:e.r*view.scale/dpr});
    return{screen,frozen,dpr,canvas:[cw,ch],css:[innerWidth,innerHeight],view:{scale:view.scale,ox:view.ox,oy:view.oy,W:view.W},
      assets:{front:ok(img.front),back:ok(img.back),alley:ok(img.alley),keeper:ok(img.keeper)},
      state:s?{t:+s.t.toFixed(3),phase:s.phase,score:s.score,lives:s.lives,combo:s.combo,kills:s.kills,live:s.ents.length,result:s.result,
        boss:s.boss?Object.assign(px({kind:'boss',x:s.boss.x,y:s.boss.y,r:s.boss.r}),{hp:s.boss.hp}):null,ents:s.ents.map(px)}:null};}
};
function boot(){
  resize();
  const v=VIEWS[viewName];
  if(v){
    const seed=params.has('seed')?+params.get('seed'):v.seed;start(seed);if(v.pilot)pilot=Core.pilot(v.pilot,seed);
    advance(params.has('t')?+params.get('t'):v.t);if(viewName==='win')advance(3);frozen=true;
  }
  hook.ready=true;requestAnimationFrame(frame);
}
resize();
})();
