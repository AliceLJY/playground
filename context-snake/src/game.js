// 上下文蛇 page: layout, drawing, input, sound and the acceptance hooks. All rules live in core.js.
(function(){
'use strict';
const Core=window.SnakeCore,CFG=Core.CFG,COLS=CFG.cols,ROWS=CFG.rows;
const canvas=document.getElementById('stage'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),viewName=params.get('view');
const VIEW_NAMES=['hero','long','burst','end'];
const FONT='"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';
const COLOR={bg:'#101218',field:'#171a22',grid:'#262a35',ink:'#111111',cream:'#f3ead8',dim:'#9a9486',pink:'#ff3d7f',
  file:'#6aa8ff',web:'#5fd39a',log:'#ffc04d',chat:'#c9c2b4',summary:'#ff8fb5',sub:'#4fd1ff',alert:'#ff4d4d',mud:'#7d6aa8',gold:'#ffd75a'};
const KIND_NAME={file:'文件',web:'网页',log:'日志',chat:'对话',summary:'摘要'};

// ---------- layout (CSS pixels) ----------
let dpr=1,vw=1,vh=1,L=null;
function layout(){
  dpr=Math.min(window.devicePixelRatio||1,2);vw=innerWidth;vh=innerHeight;
  const cw=Math.max(1,Math.round(vw*dpr)),ch=Math.max(1,Math.round(vh*dpr));
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  const land=vw>vh*1.05;
  let pad,area;
  if(land){const w=Math.round(Math.min(340,Math.max(220,vw*0.3)));pad={x:vw-w,y:0,w,h:vh};area={x:0,y:0,w:vw-w,h:vh};}
  else{const h=Math.round(Math.min(220,Math.max(140,vh*0.26)));pad={x:0,y:vh-h,w:vw,h};area={x:0,y:0,w:vw,h:vh-h};}
  const hud=Math.round(Math.min(78,Math.max(54,area.h*0.11)));
  const cell=Math.max(8,Math.floor(Math.min((area.w-16)/COLS,(area.h-hud-10)/ROWS)));
  const fw=cell*COLS,fh=cell*ROWS;
  const field={x:Math.round(area.x+(area.w-fw)/2),y:Math.round(area.y+hud+Math.max(0,(area.h-hud-fh)/2)),w:fw,h:fh};
  const b=Math.round(Math.min(64,Math.max(44,(land?pad.w/3.6:pad.h/3.35))));
  L={land,pad,area,hud,cell,field,b};
  const P=$('pad');Object.assign(P.style,{left:pad.x+'px',top:pad.y+'px',width:pad.w+'px',height:pad.h+'px',
    gridTemplateColumns:land?'1fr':'1fr 1fr',gridTemplateRows:land?'1fr 1fr':'1fr','--b':b+'px'});
  P.style.setProperty('--b',b+'px');
  $('dpad').style.gridTemplateColumns='repeat(3,'+b+'px)';$('dpad').style.gridTemplateRows='repeat(3,'+b+'px)';
  const pb=$('pause-btn');pb.style.top=Math.round(area.y+(hud-44)/2)+'px';pb.style.left=Math.round(field.x+field.w-44)+'px';
  for(const id of ['title-sheet','result-sheet'])$(id).style.bottom=Math.round(Math.max(18,vh*0.06))+'px';
}
addEventListener('resize',layout);addEventListener('orientationchange',layout);

// ---------- sound (synthesised, no files) ----------
let ac=null,muted=false,master=null;
try{muted=localStorage.getItem('context-snake-muted')==='1';}catch(e){}
const sfxRand=Core.rng(4242);
function audio(){
  if(ac||muted)return ac;
  try{ac=new (window.AudioContext||window.webkitAudioContext)();master=ac.createGain();master.gain.value=0.45;master.connect(ac.destination);}catch(e){ac=null;}
  return ac;
}
function tone(freq,to,dur,type,vol,delay){
  if(muted||!audio())return;const j=1+(sfxRand()-0.5)*0.12;freq*=j;to*=j;
  const t=ac.currentTime+(delay||0),o=ac.createOscillator(),g=ac.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+dur);
  g.gain.setValueAtTime(vol||0.25,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);o.connect(g).connect(master);o.start(t);o.stop(t+dur+0.02);
}
const sfx={
  eat(k){const f={file:660,web:780,log:520}[k]||600;tone(f,f*1.5,0.09,'square',0.12);},
  turn(){tone(300,330,0.03,'triangle',0.05);},
  compress(){tone(900,160,0.35,'sawtooth',0.12);tone(500,90,0.4,'triangle',0.16,0.05);},
  dispatch(){tone(220,660,0.14,'triangle',0.2);},
  report(){tone(880,880,0.1,'sine',0.2);tone(1320,1320,0.16,'sine',0.18,0.08);},
  burst(){tone(140,60,0.5,'square',0.22);tone(147,62,0.5,'square',0.2,0.02);},
  over(){[392,330,262,196].forEach((f,i)=>tone(f,f*0.96,0.3,'triangle',0.22,i*0.16));},
  done(){[523,659,784,1047].forEach((f,i)=>tone(f,f,0.22,'triangle',0.22,i*0.11));}
};
function setMuted(m){muted=m;try{localStorage.setItem('context-snake-muted',m?'1':'0');}catch(e){}
  if(m&&ac){try{ac.close();}catch(e){}ac=null;}
  $('mute-btn').textContent=$('pause-mute').textContent=m?'声音：关':'声音：开';}
setMuted(muted);
// speed: slow / medium / fast, remembered on this device; one tap on the title cycles it
const SPEED_ORDER=['slow','normal','fast'],SPEED_NAME={slow:'慢',normal:'中',fast:'快'};
let speed=CFG.speedDefault;
try{const v=localStorage.getItem('context-snake-speed');if(CFG.speeds[v])speed=v;}catch(e){}
function setSpeed(v,keep){speed=v;if(!keep)try{localStorage.setItem('context-snake-speed',v);}catch(e){}$('speed-btn').textContent='速度：'+SPEED_NAME[v];}
setSpeed(speed,true);
// a fixed view always runs at the speed it declares (default slow), never at whatever this device last picked
const urlSpeed=CFG.speeds[params.get('speed')]?params.get('speed'):null;
if(urlSpeed||VIEW_NAMES.includes(viewName))setSpeed(urlSpeed||CFG.speedDefault,true);

// ---------- game state ----------
let game=null,pilot=null,screen='title',paused=false,frozen=false,clock=0,best=0,seedUsed=1;
try{best=+localStorage.getItem('context-snake-best')||0;}catch(e){}
const fx={pops:[],puffs:[],bursts:[],flash:0,shake:0,banner:null,overT:0,lastTurnLag:0,moveFlash:0};
function start(seed){
  seedUsed=seed==null?(Math.random()*1e9)|0:seed;
  game=Core.create({seed:seedUsed,speed});pilot=null;screen='play';paused=false;
  fx.pops.length=fx.puffs.length=fx.bursts.length=0;fx.flash=fx.shake=0;fx.banner={text:L&&L.land?'方向键转弯 · 吃东西 · 别撞自己':'滑动或按方向键 · 吃东西 · 别撞自己',color:COLOR.cream,t:0,life:3.2};fx.overT=0;
  swipe=null;syncUi();canvas.focus&&canvas.focus();
}
function toTitle(){screen='title';game=null;pilot=null;paused=false;syncUi();}
function setPaused(p){if(screen!=='play'||frozen)return;paused=!!p;swipe=null;syncUi();}

// ---------- intents: keys, buttons and swipes all end here ----------
function intent(name){
  if(screen==='title'){if(name==='start')start();return;}
  if(screen==='result'){if(name==='start')start();return;}
  if(paused||!game)return;
  audio();
  if(name==='up')game.turn(0);else if(name==='right')game.turn(1);else if(name==='down')game.turn(2);else if(name==='left')game.turn(3);
  else if(name==='compress'){if(!game.compress())deny('btn-compress');}
  else if(name==='dispatch'){if(!game.dispatch())deny('btn-dispatch');}
}
const DIRNAME=['up','right','down','left'];
function deny(id){const b=$(id);b.animate&&b.animate([{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'none'}],{duration:180});}
const KEYS={ArrowUp:'up',KeyW:'up',ArrowRight:'right',KeyD:'right',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',
  KeyQ:'compress',Digit1:'compress',KeyE:'dispatch',Digit2:'dispatch',Enter:'start',Space:'start'};
addEventListener('keydown',e=>{
  if(e.code==='Escape'||e.code==='KeyP'){if(screen==='play')setPaused(!paused);e.preventDefault();return;}
  const n=KEYS[e.code];if(!n)return;
  if(n==='start'&&screen==='play'){if(e.code==='Space'&&!paused)intent('compress');e.preventDefault();return;}
  e.preventDefault();if(!e.repeat)intent(n);
});
// on-screen arrows fire on press, not on release: a turn must not wait for the finger to lift
for(const b of document.querySelectorAll('#dpad button')){
  const d=+b.dataset.dir;
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.classList.add('on');intent(DIRNAME[d]);});
  for(const k of ['pointerup','pointercancel','pointerleave','lostpointercapture'])b.addEventListener(k,()=>b.classList.remove('on'));
}
$('btn-compress').addEventListener('pointerdown',e=>{e.preventDefault();intent('compress');});
$('btn-dispatch').addEventListener('pointerdown',e=>{e.preventDefault();intent('dispatch');});
$('start-btn').addEventListener('click',()=>{audio();start();});
$('again-btn').addEventListener('click',()=>{audio();start();});
$('home-btn').addEventListener('click',toTitle);
$('mute-btn').addEventListener('click',()=>setMuted(!muted));
$('speed-btn').addEventListener('click',()=>setSpeed(SPEED_ORDER[(SPEED_ORDER.indexOf(speed)+1)%3]));
$('pause-mute').addEventListener('click',()=>setMuted(!muted));
$('pause-btn').addEventListener('click',()=>setPaused(true));
$('resume-btn').addEventListener('click',()=>setPaused(false));
addEventListener('blur',()=>setPaused(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPaused(true);});
// swipe anywhere on the canvas: every 22 px of travel along one axis is a turn, so one drag can bend twice
let swipe=null;
const SWIPE=22;
canvas.addEventListener('pointerdown',e=>{if(screen!=='play'||paused)return;swipe={id:e.pointerId,x:e.clientX,y:e.clientY};try{canvas.setPointerCapture(e.pointerId);}catch(err){}});
canvas.addEventListener('pointermove',e=>{
  if(!swipe||e.pointerId!==swipe.id)return;
  const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<SWIPE)return;
  intent(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));
  swipe.x=e.clientX;swipe.y=e.clientY;
});
for(const k of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(k,e=>{if(swipe&&e.pointerId===swipe.id)swipe=null;});

function syncUi(){
  const play=screen==='play';
  $('pad').hidden=!play;$('pause-btn').hidden=!play||paused;
  $('pause-panel').hidden=!(play&&paused);
  $('title-sheet').hidden=screen!=='title';$('result-sheet').hidden=screen!=='result';
  if(play&&game){
    const s=game.state,t=s.t,len=s.body.length;
    const cr=t<s.compressReady?1-(s.compressReady-t)/CFG.compressCd:1,canC=Core.compressCut(len)>0;
    const bc=$('btn-compress');bc.style.setProperty('--ready',cr.toFixed(3));bc.classList.toggle('off',cr<1||!canC);
    $('cd-compress').textContent=cr<1?Math.ceil(s.compressReady-t)+' 秒':canC?'−'+Core.compressCut(len)+' 段':'太短';
    // pink pulse = now is a good time: turns have started to lag and compression is ready
    bc.classList.toggle('hint',cr>=1&&canC&&Core.turnDelay(len)>=1);
    const locked=t<s.lockUntil,dr=locked?1-(s.lockUntil-t)/CFG.lockout429:t<s.dispatchReady?1-(s.dispatchReady-t)/CFG.dispatchCd:1;
    const canD=len>=CFG.dispatchMinLen;
    const bd=$('btn-dispatch');bd.style.setProperty('--ready',dr.toFixed(3));bd.classList.toggle('off',dr<1||!canD);
    // three dots on the button are the three slots; all three lit turns the button red: one more press loses them all
    const full=!locked&&s.subs.length>=CFG.subMax;
    bd.classList.toggle('warn',full||locked);
    document.querySelectorAll('#slots i').forEach((d,i)=>d.classList.toggle('on',i<s.subs.length));
    $('cd-dispatch').textContent=locked?'429 '+Math.ceil(s.lockUntil-t)+' 秒':full?'⚠ 再按全没':canD?'−4 段':'要 7 段';
  }
}

// ---------- tick: run rules, turn rule events into effects ----------
function tick(dt){
  clock+=dt;
  for(const p of fx.pops)p.t+=dt;fx.pops=fx.pops.filter(p=>p.t<1.1);
  for(const p of fx.puffs)p.t+=dt;fx.puffs=fx.puffs.filter(p=>p.t<0.6);
  for(const p of fx.bursts)p.t+=dt;fx.bursts=fx.bursts.filter(p=>p.t<1.4);
  fx.flash=Math.max(0,fx.flash-dt*2.5);fx.shake=Math.max(0,fx.shake-dt*3);
  if(fx.banner){fx.banner.t+=dt;if(fx.banner.t>(fx.banner.life||1.6))fx.banner=null;}
  if(screen==='result')fx.overT+=dt;
  if(screen!=='play'||paused||!game)return;
  const s=game.state;
  if(pilot)pilot(game);
  const before=s.body.slice(-Core.CFG.cols*Core.CFG.rows);
  game.step(dt);
  for(const e of s.events)onEvent(e,before);
  s.events.length=0;
  if(s.phase==='over'){
    screen='result';fx.overT=0;
    if(s.result.score>best){best=s.result.score;try{localStorage.setItem('context-snake-best',best);}catch(e){}}
    syncUi();
  }
}
function onEvent(e,before){
  const s=game.state;
  if(e.type==='eat'){sfx.eat(e.kind);fx.pops.push({x:e.x,y:e.y,text:'+'+e.pts+' '+KIND_NAME[e.kind],color:COLOR[e.kind],t:0});}
  else if(e.type==='turn'){fx.lastTurnLag=e.lag;}
  else if(e.type==='compress'){sfx.compress();fx.banner={text:'压缩：砍掉最老的 '+e.cut+' 段',color:COLOR.summary,t:0};
    for(const c of before.slice(before.length-e.cut))fx.puffs.push({x:c.x,y:c.y,t:0,color:COLOR.summary});}
  else if(e.type==='dispatch'){sfx.dispatch();fx.banner={text:'派出子 agent（'+e.out+'/'+CFG.subMax+'）',color:COLOR.sub,t:0};}
  else if(e.type==='report'){sfx.report();fx.pops.push({x:e.x,y:e.y,text:'汇报 '+e.chars+' 字 · +'+e.pts,color:COLOR.sub,t:0,big:true});}
  else if(e.type==='burst429'){sfx.burst();fx.flash=1;fx.shake=1;fx.banner={text:'429：同时在外太多，全部被限流',color:COLOR.alert,t:0};
    for(const p of e.at)fx.bursts.push({x:p.x,y:p.y,t:0});}
  else if(e.type==='chat'){fx.pops.push({x:s.body[0].x,y:s.body[0].y,text:'对话 +1',color:COLOR.chat,t:0,small:true});}
  else if(e.type==='done'){sfx.done();}
  if(s.phase==='over'&&s.result.reason==='pollution'&&e.type!=='done'){}
}

// ---------- drawing helpers ----------
const cx=x=>L.field.x+(x+0.5)*L.cell,cy=y=>L.field.y+(y+0.5)*L.cell;
function text(str,x,y,size,color,align,weight,base){ctx.font=(weight||700)+' '+size+'px '+FONT;ctx.textAlign=align||'center';ctx.textBaseline=base||'middle';
  ctx.lineWidth=Math.max(2,size*0.16);ctx.strokeStyle='rgba(16,18,24,0.9)';ctx.lineJoin='round';ctx.strokeText(str,x,y);ctx.fillStyle=color;ctx.fillText(str,x,y);}
function rrect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function wrapLines(str,maxW,size){ctx.font='700 '+size+'px '+FONT;const out=[];let line='';
  const parts=str.match(/[A-Za-z0-9.\-–]+[）)，。、]?|[^A-Za-z0-9.\-–][，。、）)]?/g)||[];
  for(const w of parts){const t=line+w;if(ctx.measureText(t).width>maxW&&line.trim()){out.push(line.trimEnd());line=w.trimStart();}else line=t;}
  if(line)out.push(line);return out;}
// 小黑煤球: black ball, white outline, pink ball on a stick, white round eyes and a short line mouth. Never a faceless ball.
function coal(x,y,r,o){
  o=o||{};const look=o.look==null?2:o.look,lx=[0,1,0,-1][look]*r*0.16,ly=[-1,0,1,0][look]*r*0.12,antenna=o.antenna||COLOR.pink;
  const a=o.alpha==null?1:o.alpha;ctx.save();ctx.globalAlpha=a;
  if(o.legs){ctx.strokeStyle='#fff';ctx.lineCap='round';ctx.lineWidth=r*0.26;
    const off=s=>o.step?Math.sin(o.step+s*1.6)*r*0.08:0;
    for(const s of [-1,1]){const k=off(s);ctx.beginPath();ctx.moveTo(x+s*r*0.32,y+r*0.7);ctx.lineTo(x+s*r*0.32+k,y+r*1.35);ctx.stroke();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x+s*r*0.32+k+s*r*0.05,y+r*1.36,r*0.15,0,6.283);ctx.fill();}
    ctx.strokeStyle=COLOR.ink;ctx.lineWidth=r*0.13;
    for(const s of [-1,1]){const k=off(s);ctx.beginPath();ctx.moveTo(x+s*r*0.32,y+r*0.7);ctx.lineTo(x+s*r*0.32+k,y+r*1.35);ctx.stroke();
      ctx.fillStyle=COLOR.ink;ctx.beginPath();ctx.arc(x+s*r*0.32+k+s*r*0.05,y+r*1.36,r*0.1,0,6.283);ctx.fill();}}
  // stick and ball
  ctx.strokeStyle='#fff';ctx.lineCap='round';ctx.lineWidth=r*0.2;ctx.beginPath();ctx.moveTo(x,y-r*0.9);ctx.lineTo(x,y-r*1.45);ctx.stroke();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y-r*1.5,r*0.3,0,6.283);ctx.fill();
  ctx.strokeStyle=COLOR.ink;ctx.lineWidth=r*0.09;ctx.beginPath();ctx.moveTo(x,y-r*0.9);ctx.lineTo(x,y-r*1.4);ctx.stroke();
  ctx.fillStyle=antenna;ctx.beginPath();ctx.arc(x,y-r*1.5,r*0.24,0,6.283);ctx.fill();
  // body
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,r*1.07,0,6.283);ctx.fill();
  ctx.fillStyle=o.tint||COLOR.ink;ctx.beginPath();ctx.arc(x,y,r,0,6.283);ctx.fill();
  // face
  const ex=r*0.42,ey=-r*0.02,er=Math.max(1.6,r*0.15);
  ctx.fillStyle='#fff';
  for(const s of [-1,1]){ctx.beginPath();ctx.arc(x+s*ex+lx,y+ey+ly,er,0,6.283);ctx.fill();}
  ctx.strokeStyle='#fff';ctx.lineCap='round';ctx.lineWidth=Math.max(1.4,r*0.09);
  const mw=r*0.13,my=y+r*0.1+ly;ctx.beginPath();ctx.moveTo(x+lx-mw,my);ctx.lineTo(x+lx+mw,my);ctx.stroke();
  if(o.sweat){ctx.fillStyle='#8fd3ff';ctx.beginPath();ctx.ellipse(x+r*0.78,y-r*0.45,r*0.11,r*0.17,0,0,6.283);ctx.fill();}
  ctx.restore();
}
// item icons: a page, a globe, a terminal log
function icon(kind,x,y,size,alpha){
  ctx.save();ctx.globalAlpha=alpha==null?1:alpha;const s=size,c=COLOR[kind]||COLOR.chat;
  if(kind==='file'){const w=s*0.72,h=s*0.9,x0=x-w/2,y0=y-h/2,f=w*0.32;
    ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x0+w-f,y0);ctx.lineTo(x0+w,y0+f);ctx.lineTo(x0+w,y0+h);ctx.lineTo(x0,y0+h);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(16,18,24,0.35)';ctx.beginPath();ctx.moveTo(x0+w-f,y0);ctx.lineTo(x0+w-f,y0+f);ctx.lineTo(x0+w,y0+f);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(16,18,24,0.55)';ctx.lineWidth=Math.max(1,s*0.07);for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x0+w*0.18,y0+h*(0.45+i*0.17));ctx.lineTo(x0+w*(i===2?0.55:0.82),y0+h*(0.45+i*0.17));ctx.stroke();}}
  else if(kind==='web'){const r=s*0.44;ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,6.283);ctx.fill();
    ctx.strokeStyle='rgba(16,18,24,0.55)';ctx.lineWidth=Math.max(1,s*0.07);ctx.beginPath();ctx.ellipse(x,y,r*0.45,r,0,0,6.283);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.stroke();ctx.beginPath();ctx.moveTo(x-r*0.85,y-r*0.5);ctx.lineTo(x+r*0.85,y-r*0.5);ctx.moveTo(x-r*0.85,y+r*0.5);ctx.lineTo(x+r*0.85,y+r*0.5);ctx.stroke();}
  else if(kind==='log'){const w=s*0.86,h=s*0.7;rrect(x-w/2,y-h/2,w,h,s*0.1);ctx.fillStyle=c;ctx.fill();
    ctx.strokeStyle='rgba(16,18,24,0.7)';ctx.lineWidth=Math.max(1,s*0.08);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(x-w*0.32,y-h*0.2);ctx.lineTo(x-w*0.14,y);ctx.lineTo(x-w*0.32,y+h*0.2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-w*0.02,y+h*0.2);ctx.lineTo(x+w*0.3,y+h*0.2);ctx.stroke();}
  else if(kind==='chat'){const w=s*0.8,h=s*0.58;rrect(x-w/2,y-h/2-s*0.06,w,h,s*0.2);ctx.fillStyle=c;ctx.fill();
    ctx.beginPath();ctx.moveTo(x-w*0.2,y+h*0.4);ctx.lineTo(x-w*0.3,y+h*0.62);ctx.lineTo(x,y+h*0.4);ctx.fill();}
  else if(kind==='summary'){const w=s*0.86,h=s*0.62;rrect(x-w/2,y-h/2,w,h,s*0.14);ctx.fillStyle=c;ctx.fill();
    ctx.font='900 '+(s*0.5)+'px '+FONT;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=COLOR.ink;ctx.fillText('摘',x,y+s*0.03);}
  ctx.restore();
}

// ---------- scene ----------
function drawField(t){
  const f=L.field,c=L.cell;
  ctx.fillStyle=COLOR.field;rrect(f.x-4,f.y-4,f.w+8,f.h+8,10);ctx.fill();
  ctx.fillStyle=COLOR.grid;for(let y=1;y<ROWS;y++)for(let x=1;x<COLS;x++){ctx.fillRect(f.x+x*c-1,f.y+y*c-1,2,2);}
  // the board wraps: dashed edges with a small through-arrow on each side
  ctx.save();ctx.setLineDash([4,6]);ctx.strokeStyle='#3a4050';ctx.lineWidth=1.5;rrect(f.x-4,f.y-4,f.w+8,f.h+8,10);ctx.stroke();ctx.restore();
}
function drawItems(s,t){
  for(const it of s.items){const k=Math.min(1,(s.t-it.born)/0.25),b=Math.sin(t*4+it.id)*L.cell*0.05;
    ctx.fillStyle='rgba(255,255,255,0.05)';ctx.beginPath();ctx.arc(cx(it.x),cy(it.y),L.cell*0.48,0,6.283);ctx.fill();
    icon(it.kind,cx(it.x),cy(it.y)+b,L.cell*0.78*k);}
}
function drawChain(body,chips,o){
  const c=L.cell;o=o||{};
  // spine: dark links between neighbours (skipped across a wrap)
  ctx.strokeStyle=o.spine||'#0b0c10';ctx.lineWidth=c*0.5;ctx.lineCap='round';
  for(let i=1;i<body.length;i++){const a=body[i-1],b=body[i];if(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)continue;
    ctx.beginPath();ctx.moveTo(cx(a.x),cy(a.y));ctx.lineTo(cx(b.x),cy(b.y));ctx.stroke();}
  for(let i=body.length-1;i>=1;i--){const p=body[i],k=chips[i]||'chat',sz=c*(o.scale||0.86);
    ctx.fillStyle=o.mud?COLOR.mud:'#1f222b';rrect(cx(p.x)-sz/2,cy(p.y)-sz/2,sz,sz,sz*0.28);ctx.fill();
    ctx.strokeStyle=o.mud?'#a495c9':(o.outline||'rgba(255,255,255,0.18)');ctx.lineWidth=1.2;ctx.stroke();
    if(!o.mud)icon(k,cx(p.x),cy(p.y),sz*0.74,o.alpha);}
}
function drawSnake(s,t){
  const over=s.phase==='over'&&s.result.reason==='pollution';
  drawChain(s.body,s.kinds,{mud:over});
  const h=s.body[0],shake=over?Math.sin(t*40)*L.cell*0.06*Math.max(0,1-fx.overT*1.5):0;
  coal(cx(h.x)+shake,cy(h.y)+L.cell*0.04,L.cell*0.56,{look:s.dir,sweat:game.delay>=2||over,tint:over?'#24202c':null});
}
function drawBends(s,t){
  if(s.phase!=='play')return;
  const p=game.project(),c=L.cell;
  // where a turn asked right now would land: the path it has to coast first, then a ring
  if(p.delay>0){
    ctx.fillStyle='rgba(255,61,127,0.18)';for(const m of p.path){ctx.beginPath();ctx.arc(cx(m.x),cy(m.y),c*0.16,0,6.283);ctx.fill();}
    const last=p.path[p.path.length-1];if(last){ctx.strokeStyle='rgba(255,61,127,'+(0.45+0.25*Math.sin(t*6))+')';ctx.lineWidth=2;ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(cx(last.x),cy(last.y),c*0.42,0,6.283);ctx.stroke();ctx.setLineDash([]);}
  }
  for(const b of p.bends){const x=cx(b.x),y=cy(b.y);ctx.save();ctx.translate(x,y);ctx.rotate(b.dir*Math.PI/2);
    ctx.fillStyle=COLOR.pink;ctx.beginPath();ctx.moveTo(0,-c*0.38);ctx.lineTo(c*0.28,-c*0.02);ctx.lineTo(c*0.1,-c*0.02);ctx.lineTo(c*0.1,c*0.3);ctx.lineTo(-c*0.1,c*0.3);ctx.lineTo(-c*0.1,-c*0.02);ctx.lineTo(-c*0.28,-c*0.02);ctx.closePath();ctx.fill();ctx.restore();}
}
function drawSubs(s,t){
  for(const b of s.subs){
    drawChain(b.body,b.chips,{scale:0.62,outline:'rgba(79,209,255,0.55)',spine:'rgba(79,209,255,0.25)',alpha:0.9});
    const h=b.body[0],x=cx(h.x),y=cy(h.y),r=L.cell*0.4;
    coal(x,y,r,{look:b.dir,antenna:COLOR.sub,alpha:0.95});
    const k=b.phase==='work'?(s.t-b.born)/CFG.subWork:1;
    ctx.strokeStyle=COLOR.sub;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r*1.32,-Math.PI/2,-Math.PI/2+6.283*k);ctx.stroke();
    const label=b.phase==='work'?(b.tokens?b.tokens+' 万 token':'读材料中'):'回来交汇报';
    text(label,Math.max(L.field.x+30,Math.min(L.field.x+L.field.w-30,x)),y-r*2.4,Math.max(10,L.cell*0.42),COLOR.sub,'center',700);
  }
}
function drawFx(s,t){
  const c=L.cell;
  for(const p of fx.puffs){const k=p.t/0.6;ctx.globalAlpha=1-k;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(cx(p.x),cy(p.y),c*(0.3+0.4*k),0,6.283);ctx.fill();}ctx.globalAlpha=1;
  for(const p of fx.bursts){const k=Math.min(1,p.t/0.25),a=Math.max(0,1-Math.max(0,p.t-0.8)/0.6);ctx.globalAlpha=a;
    ctx.strokeStyle=COLOR.alert;ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx(p.x),cy(p.y),c*(0.4+0.8*k),0,6.283);ctx.stroke();
    text('429',cx(p.x),cy(p.y),c*0.7,COLOR.alert,'center',900);}ctx.globalAlpha=1;
  for(const p of fx.pops){const a=Math.max(0,1-p.t/1.1),size=p.big?Math.max(13,c*0.6):p.small?Math.max(10,c*0.38):Math.max(11,c*0.48);
    ctx.globalAlpha=a;text(p.text,Math.max(L.field.x+50,Math.min(L.field.x+L.field.w-50,cx(p.x))),cy(p.y)-c*0.7-p.t*c*1.1,size,p.color);}ctx.globalAlpha=1;
}
function drawHud(s){
  const a=L.area,f=L.field,top=a.y+6,h=L.hud-10,fs=Math.max(12,Math.min(18,h*0.3));
  const left=f.x,right=f.x+f.w-52,big=Math.min(30,h*0.5);
  const width=(str,size,w)=>{ctx.font=(w||700)+' '+size+'px '+FONT;return ctx.measureText(str).width;};
  text(String(s.score),left,top+h*0.3,big,COLOR.cream,'left',900);
  const scoreEnd=left+width(String(s.score),big,900)+6;
  text('分',scoreEnd,top+h*0.34,fs*0.8,COLOR.dim,'left',700);
  // session clock: a bar that empties over the round, squeezed so it never runs into the score
  const remain=Math.max(0,CFG.roundTime-s.t),clockStr=Math.floor(remain/60)+':'+String(Math.floor(remain%60)).padStart(2,'0');
  const free=right-(scoreEnd+fs+10);
  const label=width('会话 '+clockStr,fs*0.85)+8<=free*0.45?'会话 '+clockStr:clockStr,lw=width(label,fs*0.85)+8;
  const bw=Math.max(30,Math.min((right-left)*0.42,free-lw)),bx=right-bw,by=top+h*0.22,bh=Math.max(6,h*0.16);
  ctx.fillStyle='#2a2e3a';rrect(bx,by,bw,bh,bh/2);ctx.fill();
  ctx.fillStyle=remain<20?COLOR.alert:COLOR.cream;rrect(bx,by,bw*remain/CFG.roundTime,bh,bh/2);ctx.fill();
  text(label,bx-8,by+bh/2,fs*0.85,COLOR.dim,'right',700);
  // second row: context length and turn lag on the left, sub-agent slots on the right; the label goes first when it is tight
  const y2=top+h*0.8,len=s.body.length,d=game.delay,lenStr='长度 '+len,lagStr=d?'转弯慢 '+d+' 格':'转弯灵活';
  text(lenStr,left,y2,fs,COLOR.cream,'left',700);
  const lx=left+width(lenStr,fs)+10,lagEnd=lx+width(lagStr,fs);
  text(lagStr,lx,y2,fs,d>=2?COLOR.alert:d?COLOR.pink:COLOR.web,'left',700);
  const slot=fs*1.05,slotsLeft=right-(CFG.subMax-1)*slot-fs*0.4;
  for(let i=0;i<CFG.subMax;i++){const on=i<s.subs.length,x=right-i*slot;
    ctx.fillStyle=on?COLOR.sub:'#2a2e3a';ctx.beginPath();ctx.arc(x,y2,fs*0.38,0,6.283);ctx.fill();}
  const sl='子 agent';if(slotsLeft-6-width(sl,fs*0.85)>lagEnd+8)text(sl,slotsLeft-6,y2,fs*0.85,COLOR.dim,'right',700);
}
function drawBanner(){
  if(!fx.banner)return;const b=fx.banner,a=Math.min(1,b.t*6,Math.max(0,((b.life||1.6)-b.t)*3)),f=L.field;
  ctx.globalAlpha=a;const fs=Math.max(14,Math.min(22,L.cell*0.7));ctx.font='700 '+fs+'px '+FONT;
  const w=Math.min(f.w-16,ctx.measureText(b.text).width+28),x=f.x+f.w/2,y=f.y+fs*1.4;
  ctx.fillStyle='rgba(16,18,24,0.85)';rrect(x-w/2,y-fs*0.95,w,fs*1.9,fs*0.5);ctx.fill();
  text(b.text,x,y,fs,b.color);ctx.globalAlpha=1;
}
function drawTitle(t){
  const W=vw,H=vh,m=Math.min(W,H),r=Math.min(W*0.13,H*0.085);
  const yb=Math.round(H*0.2);
  coal(W/2,yb,r,{legs:true,step:t*3,look:2});
  text('上下文蛇',W/2,yb+r*2.05,Math.min(52,W*0.12),COLOR.cream,'center',900);
  text('蛇身就是上下文',W/2,yb+r*2.05+Math.min(52,W*0.12)*0.95,Math.min(20,W*0.05),COLOR.pink,'center',700);
  const fs=Math.max(13,Math.min(17,W*0.041)),lh=fs*1.65,x0=Math.max(16,W/2-Math.min(W,440)/2+16),maxW=Math.min(W,440)-32;
  let y=yb+r*2.05+Math.min(52,W*0.12)*0.95+fs*2.2;
  const rows=[
    [['file','web','log'],'吃东西，身子变长'],
    [null,'越长拐弯越慢，粉色圈就是会拐的那一格'],
    [null,'撞到自己就输（上下文污染）'],
    ['summary','✂ 压缩：尾巴剪掉一截，分数不扣'],
    ['sub','派子 agent：甩出一截自己去吃，回来加分'],
    ['alert','按钮上 3 个点亮满了还按，全部消失']
  ];
  for(const [k,str] of rows){
    let tx=x0;
    if(Array.isArray(k)){k.forEach((kk,i)=>icon(kk,x0+fs*0.6+i*fs*1.2,y,fs*1.1));tx=x0+fs*3.6;}
    else if(k==='sub')coal(x0+fs*0.6,y+fs*0.15,fs*0.45,{antenna:COLOR.sub}),tx=x0+fs*1.5;
    else if(k==='alert')text('429',x0+fs*0.9,y,fs*0.8,COLOR.alert,'center',900),tx=x0+fs*2;
    else if(k)icon(k,x0+fs*0.6,y,fs*1.1),tx=x0+fs*1.5;
    else{ctx.fillStyle=COLOR.pink;ctx.beginPath();ctx.arc(x0+fs*0.6,y,fs*0.18,0,6.283);ctx.fill();tx=x0+fs*1.5;}
    const lines=wrapLines(str,x0+maxW-tx,fs);lines.forEach((ln,i)=>text(ln,tx,y+i*lh*0.8,fs,COLOR.cream,'left',700));
    y+=lh+(lines.length-1)*lh*0.8;
  }
  const hint=L.land?'方向键 / WASD 转弯，Q 压缩，E 派子 agent':'在棋盘上滑动或按方向键转弯';
  text(hint,W/2,Math.min(H-Math.max(18,H*0.06)-70,y+fs*0.6),Math.max(12,fs*0.85),COLOR.dim,'center',700);
  if(best)text('最高 '+best+' 分',W/2,Math.min(H-Math.max(18,H*0.06)-70,y+fs*0.6)+fs*1.4,Math.max(12,fs*0.85),COLOR.dim,'center',700);
}
// one light line that maps what just happened to the thing it was drawn from
function storyLine(r){
  const st=r.stats;
  if(st.bursts)return '真事：作者有一次一口气派了 8 个重型子 agent，全撞上 429，最后只留下 3 份报告。你刚才这一下，算是还原现场了。';
  if(st.reports)return '真事：一次事实核查里，子 agent 在外面读到 14.4 万到 22.5 万 token，交回来的报告只有 205 到 588 个字。跟你收到的汇报一样短。';
  if(!st.compress&&r.reason==='pollution')return '真事：上下文快满时，Claude Code 也会把最老的对话压成一段摘要再接着干。刚才那一跤，差的就是这一下压缩。';
  return '真事：上下文塞得越满，AI 越容易被自己前面的话绊倒，所以真干活时也要压缩、也要分派。';
}
let resultBottom=null;
// the result card shrinks until it ends above the buttons; the coal is dropped first on short screens
function resultCard(s,t,scale,dry){
  const r=s.result,W=vw,H=vh,pw=Math.min(W-32,440),x0=(W-pw)/2,fs=Math.max(10,Math.min(17,W*0.042))*scale;
  const big=Math.min(44,W*0.1)*scale,score=Math.min(64,W*0.15)*scale,showCoal=H>=520;
  const T=dry?()=>{}:text;
  let y=Math.max(12,H*(showCoal?0.07:0.05));
  const good=r.reason==='done';
  if(showCoal){if(!dry)coal(W/2,y+fs*1.9,fs*1.7,{look:2,sweat:!good,legs:true,step:t*3});y+=fs*6.2;}
  else y+=big*0.5;
  T(good?'会话顺利结束':'上下文污染',W/2,y,big,good?COLOR.web:COLOR.summary,'center',900);
  y+=big*0.6+fs*1.0;
  const rec=r.score>=best&&r.score>0?' · 新纪录':'';
  T((good?'撑满了两分钟，另加 '+CFG.surviveBonus+' 分':'第 '+Math.floor(r.t)+' 秒撞上了自己的尾巴')+rec,W/2,y,fs,rec?COLOR.pink:COLOR.dim,'center',700);
  y+=fs*0.6+score*0.75;
  T(r.score+' 分',W/2,y,score,COLOR.gold,'center',900);
  y+=score*0.5+fs*1.3;
  const st=r.stats,eaten=st.eaten.file+st.eaten.web+st.eaten.log;
  const lines=['吃进 '+eaten+' 份：文件 '+st.eaten.file+' · 网页 '+st.eaten.web+' · 日志 '+st.eaten.log,
    '身子最长 '+st.peakLen+' 段，压缩 '+st.compress+' 次砍掉 '+st.cutTotal+' 段',
    '派出 '+st.dispatched+' 个子 agent，收回 '+st.reports+' 份汇报',
    st.reports?'每份汇报 '+Math.min(...st.reportChars)+'–'+Math.max(...st.reportChars)+' 字':'',
    st.bursts?'撞了 '+st.bursts+' 次 429，丢了 '+st.lost429+' 个子 agent':'一次 429 也没撞'].filter(Boolean);
  for(const ln of lines){for(const w of wrapLines(ln,pw,fs*0.95)){T(w,W/2,y,fs*0.95,COLOR.cream,'center',700);y+=fs*1.45;}}
  y+=fs*0.7;
  const story=wrapLines(storyLine(r),pw-24,fs*0.95);
  const bh=(story.length-1)*fs*1.45+fs*1.5;
  if(!dry){ctx.fillStyle='rgba(255,61,127,0.12)';rrect(x0,y-fs*0.6,pw,bh,10);ctx.fill();ctx.fillStyle=COLOR.pink;ctx.fillRect(x0,y-fs*0.6,4,bh);
    story.forEach((ln,i)=>text(ln,x0+14,y+fs*0.1+i*fs*1.45,fs*0.95,COLOR.cream,'left',700));}
  return y-fs*0.6+bh;
}
function drawResult(s,t){
  drawGame(s,t);
  const k=Math.min(1,fx.overT*2.5);
  ctx.fillStyle='rgba(16,18,24,'+0.94*k+')';ctx.fillRect(0,0,vw,vh);ctx.globalAlpha=k;
  const sheet=$('result-sheet').getBoundingClientRect(),limit=(sheet&&sheet.height?sheet.y:vh-80)-10;
  let scale=1;while(scale>0.62&&resultCard(s,t,scale,true)>limit)scale-=0.04;
  resultBottom=Math.round(resultCard(s,t,scale,false));
  ctx.globalAlpha=1;
}
function drawGame(s,t){
  drawField(t);
  // everything that lives on the board stays inside it, so rings and labels never spill over the buttons
  ctx.save();const f=L.field;ctx.beginPath();ctx.rect(f.x-6,f.y-6,f.w+12,f.h+12);ctx.clip();
  drawItems(s,t);drawBends(s,t);drawSubs(s,t);drawSnake(s,t);drawFx(s,t);ctx.restore();
  drawHud(s);drawBanner();
}
function draw(){
  const t=clock;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=COLOR.bg;ctx.fillRect(0,0,vw,vh);
  if(fx.shake>0)ctx.translate((Math.sin(clock*90)*fx.shake)*4,(Math.cos(clock*70)*fx.shake)*3);
  if(screen==='title')drawTitle(t);
  else if(game){const s=game.state;if(screen==='result')drawResult(s,t);else drawGame(s,t);}
  if(fx.flash>0){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgba(255,77,77,'+fx.flash*0.35+')';ctx.fillRect(0,0,canvas.width,canvas.height);}
}

// ---------- loop, hooks, fixed views ----------
const metrics={frames:0,fps:0,maxFrameMs:0,avgFrameMs:0};
let lastNow=0,acc=0,windowStart=0,windowFrames=0,windowMax=0,windowSum=0,uiAcc=0;
function frame(now){
  requestAnimationFrame(frame);
  const elapsed=lastNow?Math.min(0.1,(now-lastNow)/1000):0;lastNow=now;
  if(!frozen){acc+=elapsed;while(acc>=CFG.step){tick(CFG.step);acc-=CFG.step;}}
  uiAcc+=elapsed;if(uiAcc>0.1){uiAcc=0;syncUi();}
  const t0=performance.now();draw();const cost=performance.now()-t0;
  metrics.frames++;windowFrames++;windowSum+=cost;if(cost>windowMax)windowMax=cost;
  if(now-windowStart>=1000){metrics.fps=Math.round(windowFrames*1000/(now-windowStart));metrics.maxFrameMs=+windowMax.toFixed(2);metrics.avgFrameMs=+(windowSum/windowFrames).toFixed(2);windowStart=now;windowFrames=0;windowMax=0;windowSum=0;}
}
function advance(seconds){const n=Math.round(seconds/CFG.step);for(let i=0;i<n;i++)tick(CFG.step);syncUi();}
// play forward until something the view needs has really happened in the game, then a little longer
function advanceUntil(pred,extra,maxT){let n=0;const lim=Math.round((maxT||130)/CFG.step);
  while(n++<lim&&screen==='play'){tick(CFG.step);if(pred(game.state))break;}
  if(extra)advance(extra);syncUi();return game.state;}
const VIEWS={
  // mid-game: the precise pilot with sub-agents out
  hero:{seed:3,pilot:'precise',until:s=>s.t>=22&&s.subs.length>=2,extra:0},
  // a long body whose turn has to coast: bend marker on screen
  long:{seed:3,pilot:'human',until:s=>s.body.length>=17&&s.queue.length>0,extra:0},
  // the moment a 4th sub-agent goes out with 3 already out
  burst:{seed:31,pilot:'human',until:s=>s.stats.bursts>0,extra:0.25},
  // the result page after the snake bites itself
  end:{seed:5,pilot:'human',until:s=>s.phase==='over',extra:1.2}
};
function snapshot(){
  const s=game&&game.state,px=c=>({x:+cx(c.x).toFixed(1),y:+cy(c.y).toFixed(1)});
  const rect=el=>{if(!el||el.hidden)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
  return{screen,paused,muted,frozen,speed,view:viewName,resultBottom:screen==='result'?resultBottom:null,seed:seedUsed,dpr,css:[vw,vh],layout:L&&{land:L.land,cell:L.cell,field:L.field,hud:L.hud,pad:L.pad},
    buttons:{up:rect(document.querySelector('#dpad .u')),compress:rect($('btn-compress')),dispatch:rect($('btn-dispatch')),start:rect($('start-btn')),again:rect($('again-btn')),pause:rect($('pause-btn'))},
    gestureActive:swipe!==null,
    state:s?{speed:s.speed,t:+s.t.toFixed(3),phase:s.phase,score:s.score,len:s.body.length,delay:Core.turnDelay(s.body.length),dir:s.dir,moves:s.moves,queue:s.queue.length,
      head:px(s.body[0]),body:s.body.map(px),items:s.items.map(i=>Object.assign(px(i),{kind:i.kind})),
      subs:s.subs.map(b=>({phase:b.phase,tokens:b.tokens,head:px(b.body[0]),len:b.body.length})),stats:s.stats,result:s.result}:null};
}
const hook=window.__snake={ready:false,metrics,
  start(seed){start(seed);return hook;},
  autopilot(level,seed){pilot=level?Core.pilot(level,seed==null?seedUsed:seed):null;return hook;},
  advance(seconds){advance(seconds);return hook;},
  freeze(on){frozen=on!==false;return hook;},
  intent(n){intent(n);return hook;},
  pause(p){setPaused(p!==false);return hook;},
  probe:snapshot
};
window.__PLAYTEST__={get ready(){return hook.ready;},snapshot,reset(){start(seedUsed);return snapshot();},setSeed(n){start(+n);return snapshot();},step(ms){advance((+ms||0)/1000);return snapshot();}};
function boot(){
  layout();
  const v=VIEWS[viewName];
  if(v){
    const seed=params.has('seed')?+params.get('seed'):v.seed;start(seed);pilot=Core.pilot(v.pilot,seed);
    if(params.has('t'))advance(+params.get('t'));else advanceUntil(v.until,v.extra);
    if(screen==='play')pilot=null;frozen=true;fx.banner=fx.banner&&viewName==='burst'?fx.banner:null;
  }
  syncUi();hook.ready=true;requestAnimationFrame(frame);
}
boot();
})();
