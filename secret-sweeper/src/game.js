// 凭证扫雷 page: drawing, input, the pixel clerk and the acceptance hooks. All rules live in core.js.
(function(){
'use strict';
const Core=window.SweeperCore,L=Core.LEVELS;
const canvas=document.getElementById('stage'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),viewName=params.get('view');
const FONT='"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif',MONO='Menlo,Consolas,"Courier New",monospace';
const COL={bg:'#11161c',cover:'#1d2733',coverHi:'#2b3846',coverLo:'#141b23',open:'#0c1116',grid:'#1a222c',cream:'#f3ead8',amber:'#ffb23e',alert:'#ff4d4d',ok:'#7bd88f',bar:'#050608',dim:'#8b98a5'};
const NUM=['','#6cc4ff','#7bd88f','#ffb454','#ff7a90','#c792ea','#4fd6be','#f3ead8','#9aa5b1'];
const KIND_TINT=['#4a6fa5','#6d8f5a','#a5814a'];

// ---------- state ----------
let game=null,levelId='normal',seed=1,screen='title',flagMode=false,lay=null,dpr=1,cw=1,ch=1,clock=0,frozen=false;
let press=null,cardAt=null,cardHidden=false,lastCursor=-1;
const guy={pose:'idle',since:0};
const fx={confetti:[],pops:[],shake:0};
const metrics={frames:0,drawMs:0,maxDrawMs:0,get avgDrawMs(){return this.frames?this.drawMs/this.frames:0;}};
const best={};try{for(const k in L)best[k]=+localStorage.getItem('secret-sweeper-best-'+k)||0;}catch(e){}

function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);const w=innerWidth,h=innerHeight;
  cw=Math.max(1,Math.round(w*dpr));ch=Math.max(1,Math.round(h*dpr));
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  lay=Core.layout(w,h,levelId);placeDom();
}
addEventListener('resize',resize);addEventListener('orientationchange',resize);
function place(el,r){el.style.left=r.x+'px';el.style.top=r.y+'px';el.style.width=r.w+'px';el.style.height=r.h+'px';}
function placeDom(){
  const bar=$('bar'),b=lay.btn;
  bar.style.left='0';bar.style.top='0';bar.style.width='0';bar.style.height='0';bar.style.padding='0';
  for(const k of ['mode','restart','menu','sound']){const el=$(k);el.style.position='fixed';place(el,b[k]);}
  const card=$('card');
  if(lay.land){card.style.left=(lay.area.x+lay.area.w/2)+'px';card.style.top='auto';card.style.bottom='12px';card.style.maxHeight=(lay.h-24)+'px';}
  else{card.style.left='50%';card.style.top='auto';card.style.bottom=(lay.h-lay.btn.mode.y+8)+'px';card.style.maxHeight=(lay.btn.mode.y-lay.hud.h-16)+'px';}
  card.style.overflow='auto';
  const pk=$('peek');pk.style.left=(lay.land?lay.area.x+lay.area.w/2-60:lay.w/2-60)+'px';pk.style.width='120px';pk.style.top=(lay.land?lay.h-60:lay.btn.mode.y-56)+'px';
  const t=$('title');if(lay.land){t.style.top='auto';t.style.bottom='12px';t.style.left=(lay.hud.w+(lay.w-lay.hud.w)/2)+'px';}else{t.style.top=Math.round(lay.h*0.3)+'px';t.style.bottom='auto';t.style.left='50%';}
}

// ---------- sound: classic minesweeper blips, synthesised on the spot (no files) ----------
let ac=null,master=null,muted=false,noiseBuf=null;const sndRand=Core.rng(4242),sounds=[];
try{muted=localStorage.getItem('secret-sweeper-muted')==='1';}catch(e){}
function audio(){
  if(muted)return null;
  if(!ac){try{ac=new (window.AudioContext||window.webkitAudioContext)();master=ac.createGain();master.gain.value=0.45;master.connect(ac.destination);
    noiseBuf=ac.createBuffer(1,ac.sampleRate*0.7|0,ac.sampleRate);const d=noiseBuf.getChannelData(0),r=Core.rng(7);for(let i=0;i<d.length;i++)d[i]=r()*2-1;}catch(e){ac=null;}}
  if(ac&&ac.state==='suspended')ac.resume();
  return ac;
}
const vary=()=>1+(sndRand()-0.5)*0.12;   // ±6% pitch so repeats do not sound like a machine gun
function blip(f0,f1,dur,type,vol,delay){
  const t=ac.currentTime+(delay||0),o=ac.createOscillator(),g=ac.createGain();
  o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,f1),t+dur);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.004);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g).connect(master);o.start(t);o.stop(t+dur+0.02);
}
function hiss(dur,freq,vol,delay){
  const t=ac.currentTime+(delay||0),src=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();
  src.buffer=noiseBuf;f.type='lowpass';f.frequency.setValueAtTime(freq,t);f.frequency.exponentialRampToValueAtTime(80,t+dur);
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);src.connect(f).connect(g).connect(master);src.start(t);src.stop(t+dur);
}
const SFX={
  open(){const v=vary();blip(1100*v,700*v,0.045,'square',0.18);},
  flood(n){const k=Math.min(8,2+Math.floor(n/4));for(let i=0;i<k;i++){const v=vary();blip((700+i*90)*v,(500+i*90)*v,0.04,'square',0.12,i*0.028);}},
  flag(){const v=vary();blip(620*v,620*v,0.05,'triangle',0.32);blip(930*v,930*v,0.06,'triangle',0.22,0.05);},
  unflag(){const v=vary();blip(700*v,420*v,0.07,'triangle',0.25);},
  boom(){hiss(0.65,2400,0.9);blip(140,38,0.55,'sine',0.7);blip(90,30,0.4,'square',0.18,0.03);},
  win(){[523,659,784,1047,1319].forEach((f,i)=>blip(f,f,0.16,'square',0.14,i*0.09));blip(1568,1568,0.4,'triangle',0.2,0.47);}
};
function play(name,arg){sounds.push({name,t:+clock.toFixed(3),played:!muted&&!!ac});if(muted||!ac)return;try{SFX[name](arg);}catch(e){}}
function setMuted(m){muted=!!m;try{localStorage.setItem('secret-sweeper-muted',muted?'1':'0');}catch(e){}
  const b=$('sound');b.textContent=muted?'🔇':'🔊';b.setAttribute('aria-pressed',String(!muted));b.setAttribute('aria-label',muted?'声音：关':'声音：开');
  if(!muted&&touched)audio();}

// ---------- flow ----------
function start(level,s){
  levelId=L[level]?level:levelId;seed=s==null?(Math.random()*1e9)>>>0:s>>>0;
  game=Core.create({level:levelId,seed});screen='play';cardAt=null;cardHidden=false;press=null;guy.pose='idle';guy.since=clock;
  fx.confetti.length=fx.pops.length=0;fx.shake=0;lastCursor=-1;
  $('title').hidden=true;$('card').hidden=true;$('peek').hidden=true;$('bar').hidden=false;setMode(false);resize();
}
function toTitle(){screen='title';game=null;$('title').hidden=false;$('card').hidden=true;$('peek').hidden=true;$('bar').hidden=true;guy.pose='idle';guy.since=clock;resize();}
function setMode(on){flagMode=!!on;const b=$('mode');b.setAttribute('aria-pressed',String(flagMode));b.textContent=flagMode?'🚩 点：插旗':'👆 点：翻开';}
function handleEvents(){
  const s=game.state;
  for(const e of s.events){
    if(e.type==='flag'){guy.pose='flag';guy.since=clock;play('flag');}
    else if(e.type==='unflag')play('unflag');
    else if(e.type==='lose'){guy.pose='boom';guy.since=clock;fx.shake=1;cardAt=clock+Core.CARD_DELAY;vibrate(60);play('boom');}
    else if(e.type==='win'){guy.pose='win';guy.since=clock;cardAt=clock+Core.CARD_DELAY;burst();play('win');
      try{const k='secret-sweeper-best-'+levelId;if(!best[levelId]||s.t<best[levelId]){best[levelId]=s.t;localStorage.setItem(k,String(s.t));s.newBest=true;}}catch(e){}}
    else if(e.type==='reveal'&&e.count>0){if(guy.pose!=='flag'){guy.pose='look';guy.since=clock;}if(!s.events.some(x=>x.type==='win'))play(e.count>1?'flood':'open',e.count);}
  }
  s.events.length=0;
}
function act(kind,i){
  if(!game||screen!=='play'||i<0)return;
  const s=game.state;lastCursor=i;
  if(kind==='flag'){const r=game.toggleFlag(i);if(r.ok)vibrate(15);}
  else game.reveal(i);
  handleEvents();
}
let touched=false; // the browser only lets a page buzz after a real touch
function vibrate(ms){if(!touched)return;try{if(navigator.vibrate)navigator.vibrate(ms);}catch(e){}}
function fmt(t){t=Math.floor(t);return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');}
function showCard(){
  const s=game.state,card=$('card'),body=$('card-body');
  card.className=s.status==='won'?'win':'';
  if(s.status==='lost'){
    const st=Core.STORIES[s.story];
    $('card-title').textContent='💥 踩到钥匙了';
    body.innerHTML='';
    const p=document.createElement('p');p.className='tale';p.innerHTML='<b></b>';p.firstChild.textContent='真事一则 · '+st.title+'：';p.appendChild(document.createTextNode(st.text));
    const n=document.createElement('p');n.className='never';n.textContent=Core.NEVER_BACK;
    body.append(p,n);
  }else{
    $('card-title').textContent='🎉 全部打码！';
    body.innerHTML='';
    const p=document.createElement('p');p.className='tale';p.style.textAlign='center';
    p.textContent='用时 '+fmt(s.t)+' · '+s.level.mines+' 把钥匙全插上旗'+(s.newBest?' · 新纪录':'');
    const n=document.createElement('p');n.className='never';n.textContent='先看线索再动手。';
    body.append(p,n);
  }
  card.hidden=cardHidden;$('peek').hidden=!cardHidden;
}

// ---------- input: tap = open, hold = flag, right click = flag ----------
const toCss=e=>({x:e.clientX,y:e.clientY});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
  if(screen!=='play')return;e.preventDefault();touched=true;audio();
  const p=toCss(e),i=Core.cellAt(lay,p.x,p.y);
  if(e.button===2){act('flag',i);press=null;return;}
  if(e.button!==0)return;
  press={id:e.pointerId,x:p.x,y:p.y,i,t:clock,done:false};
  try{canvas.setPointerCapture(e.pointerId);}catch(err){}
});
canvas.addEventListener('pointermove',e=>{if(!press||e.pointerId!==press.id)return;const p=toCss(e);if(Math.hypot(p.x-press.x,p.y-press.y)>Core.MOVE_CANCEL)press=null;});
canvas.addEventListener('pointerup',e=>{
  if(!press||e.pointerId!==press.id)return;const pr=press;press=null;
  if(pr.done||pr.i<0)return;
  act(flagMode?'flag':'reveal',pr.i);
});
const drop=()=>{press=null;};
canvas.addEventListener('pointercancel',drop);canvas.addEventListener('lostpointercapture',e=>{if(press&&e.pointerId===press.id&&!press.done)press=null;});
addEventListener('blur',drop);document.addEventListener('visibilitychange',drop);
function checkHold(){if(press&&!press.done&&clock-press.t>=Core.LONG_PRESS){press.done=true;act(flagMode?'reveal':'flag',press.i);}}
$('mode').addEventListener('click',()=>setMode(!flagMode));
$('restart').addEventListener('click',()=>start(levelId));
$('menu').addEventListener('click',toTitle);
$('again').addEventListener('click',()=>start(levelId));
$('levels-btn').addEventListener('click',toTitle);
$('close').addEventListener('click',()=>{cardHidden=true;showCard();});
$('peek').addEventListener('click',()=>{cardHidden=false;showCard();});
for(const b of document.querySelectorAll('#levels button'))b.addEventListener('click',()=>{touched=true;audio();start(b.dataset.level);});
$('sound').addEventListener('click',()=>{touched=true;setMuted(!muted);});
addEventListener('keydown',e=>{
  if(screen!=='play')return;
  if(e.key==='f'||e.key==='F')setMode(!flagMode);
  else if(e.key==='r'||e.key==='R')start(levelId);
});

// ---------- drawing ----------
function rect(c,x,y,w,h){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
function fitText(str,max,size,font){ctx.font='700 '+size+'px '+font;let w=ctx.measureText(str).width;if(w>max){size=Math.max(5,size*max/w);ctx.font='700 '+size+'px '+font;}return size;}
function drawCell(i){
  const s=game?game.state:null,b=lay.board,c=b.cell,L0=L[levelId],x=b.x+(i%L0.cols)*c,y=b.y+Math.floor(i/L0.cols)*c,g=Math.max(1,Math.round(c*0.04));
  const open=s&&s.open[i],flag=s&&s.flag[i],over=s&&(s.status==='lost'||s.status==='won'),mine=s&&s.board&&s.board.mine[i];
  if(open){
    rect(COL.open,x,y,c,c);rect(COL.grid,x,y,c,g);rect(COL.grid,x,y,g,c);
    const n=s.board.n[i];
    if(n){ctx.fillStyle=NUM[n];ctx.font='800 '+Math.round(c*0.58)+'px '+FONT;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(n),x+c/2,y+c/2+c*0.03);}
    else{const k=s.dress.kind[i];ctx.globalAlpha=0.22;rect(KIND_TINT[k],x+c*0.2,y+c*0.38,c*0.6,g);rect(KIND_TINT[k],x+c*0.2,y+c*0.56,c*0.4,g);ctx.globalAlpha=1;}
    return;
  }
  if(s&&s.status==='lost'&&mine&&!flag){
    rect(i===s.hit?COL.alert:'#3a1218',x,y,c,c);rect('#00000040',x,y,c,g);drawKey(x+c/2,y+c/2,c,i===s.hit?'#fff3d6':'#ff9a7a');return;
  }
  // covered: a raised tile with the faint shape of what it is (log lines, a brace, a folded page)
  rect(COL.cover,x,y,c,c);rect(COL.coverHi,x,y,c,g*2);rect(COL.coverHi,x,y,g*2,c);rect(COL.coverLo,x,y+c-g*2,c,g*2);rect(COL.coverLo,x+c-g*2,y,g*2,c);
  if(!flag){
    const k=s?s.dress.kind[i]:(i*7)%3,t=KIND_TINT[k];ctx.globalAlpha=0.55;
    if(k===0){for(let r=0;r<3;r++)rect(t,x+c*0.26,y+c*(0.34+r*0.14),c*(r===1?0.48:0.36),g);}
    else if(k===1){ctx.fillStyle=t;ctx.font='700 '+Math.round(c*0.36)+'px '+MONO;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('{ }',x+c/2,y+c/2);}
    else{rect(t,x+c*0.32,y+c*0.28,c*0.36,c*0.44);rect(COL.cover,x+c*0.56,y+c*0.28,c*0.12,c*0.12);}
    ctx.globalAlpha=1;
  }else{
    // 插旗 = 打码: a little red flag on a black redaction bar
    const wrong=s.status==='lost'&&!mine;
    rect(COL.bar,x+c*0.08,y+c*0.5,c*0.84,c*0.3);rect(COL.amber,x+c*0.08,y+c*0.5,c*0.84,g);
    const sz=fitText('<REDACTED>',c*0.78,c*0.2,MONO);ctx.fillStyle=COL.cream;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('<REDACTED>',x+c/2,y+c*0.66);
    rect('#d8d8d8',x+c*0.36,y+c*0.14,Math.max(1,c*0.05),c*0.38);
    ctx.fillStyle=COL.alert;ctx.beginPath();ctx.moveTo(x+c*0.41,y+c*0.14);ctx.lineTo(x+c*0.7,y+c*0.24);ctx.lineTo(x+c*0.41,y+c*0.34);ctx.closePath();ctx.fill();
    if(wrong){ctx.strokeStyle=COL.alert;ctx.lineWidth=Math.max(2,c*0.07);ctx.beginPath();ctx.moveTo(x+c*0.15,y+c*0.15);ctx.lineTo(x+c*0.85,y+c*0.85);ctx.moveTo(x+c*0.85,y+c*0.15);ctx.lineTo(x+c*0.15,y+c*0.85);ctx.stroke();}
  }
  // a pressed finger fills a ring: let go early to open, hold to flag
  if(press&&press.i===i&&!press.done){const k=Math.min(1,(clock-press.t)/Core.LONG_PRESS);ctx.strokeStyle=COL.amber;ctx.lineWidth=Math.max(2,c*0.06);ctx.beginPath();ctx.arc(x+c/2,y+c/2,c*0.42,-Math.PI/2,-Math.PI/2+k*Math.PI*2);ctx.stroke();}
}
// a pixel key: the "mine"
function drawKey(cx,cy,c,color){
  const p=Math.max(1,Math.round(c/14));ctx.fillStyle=color;
  const px=(x,y,w,h)=>ctx.fillRect(Math.round(cx+x*p),Math.round(cy+y*p),w*p,h*p);
  px(-5,-3,4,1);px(-6,-2,1,4);px(-1,-2,1,4);px(-5,2,4,1);px(-1,-1,7,2);px(3,1,1,2);px(5,1,1,3);
}
// the pixel clerk (same block style as the pixel office people, 17 x 24 art pixels, feet at x,y)
function drawGuy(gx,gy,S){
  const t=clock,k=clock-guy.since;let pose=guy.pose;
  if((pose==='flag'&&k>0.8)||(pose==='look'&&k>0.5)){pose='idle';}
  ctx.save();
  let lift=0,shake=0;
  if(pose==='flag')lift=Math.sin(Math.min(1,k/0.5)*Math.PI)*2;
  if(pose==='win')lift=Math.abs(Math.sin(k*5))*3;
  if(pose==='boom'&&k<0.5){lift=Math.sin(k/0.5*Math.PI)*4;shake=Math.round(Math.sin(k*70))*1;}
  const slump=pose==='boom'&&k>=0.5;
  ctx.translate(Math.round(gx+shake*S),Math.round(gy));ctx.scale(S,S);
  const r=(c,x,y,w,h)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
  r('#4c584e60',-8,-1,17,3);
  const y=-Math.round(lift)+(slump?2:0),shirt='#3f7fd0',skin='#e3b58d',hand='#e4bb91';
  r('#33443f',-6,y-18,12,15);r(shirt,-5,y-10,10,8);r(skin,-5,y-16,10,7);r('#4b4639',-6,y-21,12,6);r('#544c3a',-6,y-16,2,5);
  // eyes
  const blink=pose==='idle'&&(t%3.2)<0.12;
  if(pose==='boom'&&!slump){r('#ffffff',-4,y-14,3,3);r('#ffffff',1,y-14,3,3);r('#273a34',-3,y-13,1,1);r('#273a34',2,y-13,1,1);r('#7a2e22',-1,y-11,2,2);}
  else if(slump){r('#273a34',-4,y-13,3,1);r('#273a34',1,y-13,3,1);r('#7a2e22',-2,y-10,4,1);}
  else{const look=pose==='look'?1:0;r('#273a34',-3+look,y-13,2,blink?1:2);r('#273a34',2+look,y-13,2,blink?1:2);if(pose==='win')r('#7a2e22',-2,y-11,4,1);}
  // legs
  const leg=pose==='win'?(Math.sin(k*10)>0?1:-1):0;r('#34483e',-5,y-2,4,3+leg+(slump?-2:0));r('#34483e',2,y-2,4,3-leg+(slump?-2:0));
  // arms
  if(pose==='flag'){
    r(shirt,-8,y-10,3,6);r(hand,-8,y-4,3,3);
    r(shirt,5,y-19,3,10);r(hand,5,y-22,3,3);
    r('#050608',2,y-25,13,4);r('#ffb23e',2,y-25,13,1);r('#d8d8d8',3,y-29,1,4);r('#ff4d4d',4,y-29,4,2);
  }else if(pose==='boom'&&!slump){
    r(shirt,-9,y-20,3,10);r(hand,-9,y-23,3,3);r(shirt,6,y-20,3,10);r(hand,6,y-23,3,3);
    r('#ff4d4d',8,y-29,2,4);r('#ff4d4d',8,y-24,2,1);
  }else if(slump){
    r(shirt,-8,y-18,3,8);r(hand,-7,y-21,3,3);r(shirt,5,y-18,3,8);r(hand,4,y-21,3,3);
    const d=(k*1.4)%1;r('#6cc4ff',7,y-17+Math.round(d*6),1,2);
  }else if(pose==='win'){
    const wave=Math.sin(k*9)>0?1:-1;r(shirt,-8,y-10,3,6);r(hand,-8,y-4,3,3);r(shirt,5,y-19,3,10);r(hand,5+wave,y-22,3,3);
  }else{
    r(shirt,-8,y-10,3,6);r(shirt,5,y-10,3,6);const typing=screen==='play'&&game&&game.state.status==='play'&&Math.sin(t*14)>0?1:0;r(hand,-8,y-4-typing,3,3);r(hand,5,y-4,3,3);
  }
  ctx.restore();
  const bb=bubbleBox;
  if(bb&&(pose==='win'&&k<1.6||pose==='flag'&&k<0.8||pose==='boom')){
    const word=pose==='win'?'全打码了！':pose==='flag'?'打码！':(slump?'唉…':'糟了！');
    const fs=fitText(word,bb.w-12,15,FONT);const w=Math.min(bb.w,ctx.measureText(word).width+12);
    rect('#f3ead8',bb.x,bb.y,w,bb.h);rect('#f3ead8',bb.x-4,bb.y+bb.h-8,4,4);ctx.fillStyle='#11161c';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(word,bb.x+6,bb.y+bb.h/2+1);
  }
}
let bubbleBox=null;
function burst(){const r=Core.rng(seed+99);for(let i=0;i<40;i++)fx.confetti.push({x:lay.guy.x,y:lay.guy.y-lay.guy.s*20,vx:(r()-0.5)*260,vy:-120-r()*200,c:NUM[1+(i%7)],t:0});}
function drawHud(){
  const s=game?game.state:null,h=lay.hud;
  rect('#0d1218',h.x,h.y,h.w,h.h);rect('#26313d',lay.land?h.x+h.w-1:h.x,lay.land?h.y:h.y+h.h-1,lay.land?1:h.w,lay.land?h.h:1);
  bubbleBox=lay.bubble;drawGuy(lay.guy.x,lay.guy.y,lay.guy.s);
  if(!s)return;
  const c=lay.counter;ctx.textBaseline='top';ctx.textAlign=c.align;
  const left='🚩'+String(game.left()).padStart(2,' '),clockStr='⏱'+fmt(s.t);
  ctx.font='800 '+c.size+'px '+MONO;
  if(c.align==='right'){ctx.fillStyle=COL.cream;ctx.fillText(clockStr,c.x,c.y);const cw2=ctx.measureText(clockStr).width;ctx.fillStyle=COL.alert;ctx.fillText(left,c.x-cw2-12,c.y);}
  else{ctx.fillStyle=COL.alert;ctx.fillText(left,c.x,c.y);const lw=ctx.measureText(left).width;ctx.fillStyle=COL.cream;ctx.fillText(clockStr,c.x+lw+14,c.y);}
  // what the last touched cell says: just flavour
  const i=lastCursor>=0?lastCursor:s.last,ro=lay.readout;
  if(i>=0&&s.board&&(s.open[i]||s.status==='lost'&&s.board.mine[i])){
    const line=game.text(i);ctx.font='400 13px '+MONO;ctx.fillStyle=s.board.mine[i]?'#ff9a7a':COL.dim;ctx.textAlign='left';
    let str=(s.board.mine[i]?'':Core.KINDS[s.dress.kind[i]]+'│')+line;while(ctx.measureText(str).width>ro.w&&str.length>4)str=str.slice(0,-2)+'…';
    ctx.fillText(str,ro.x,ro.y);
  }
}
function draw(){
  const t0=performance.now();
  ctx.setTransform(1,0,0,1,0,0);rect(COL.bg,0,0,cw,ch);
  let sx=0,sy=0;if(fx.shake>0){sx=Math.sin(clock*90)*fx.shake*6;sy=Math.cos(clock*77)*fx.shake*4;}
  ctx.setTransform(dpr,0,0,dpr,sx*dpr,sy*dpr);
  if(screen==='play'||screen==='title'){
    if(screen==='play'){
      const b=lay.board;rect('#0a0e12',b.x-3,b.y-3,b.w+6,b.h+6);
      for(let i=0;i<game.state.N;i++)drawCell(i);
      // before the first tap the middle cell pulses: tap here
      if(game.state.status==='ready'){const L0=L[levelId],c=b.cell,i=Math.floor(L0.rows/2)*L0.cols+Math.floor(L0.cols/2),x=b.x+(i%L0.cols)*c,y=b.y+Math.floor(i/L0.cols)*c,a=0.35+0.35*Math.sin(clock*5);
        ctx.strokeStyle='rgba(255,178,62,'+a.toFixed(2)+')';ctx.lineWidth=3;ctx.strokeRect(x+2,y+2,c-4,c-4);
        ctx.fillStyle='rgba(255,178,62,'+(a+0.2).toFixed(2)+')';ctx.font=Math.round(c*0.5)+'px '+FONT;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('👆',x+c/2,y+c*0.85+Math.sin(clock*5)*3);}
    }
    if(screen==='title'){ctx.setTransform(dpr,0,0,dpr,0,0);const S=lay.land?5:4;bubbleBox=null;drawGuy(lay.land?lay.hud.w/2:lay.w/2,lay.land?lay.h*0.62:lay.h*0.27,S);}
    else{ctx.setTransform(dpr,0,0,dpr,0,0);drawHud();}
  }
  for(const p of fx.confetti){rect(p.c,p.x,p.y,4,4);}
  const ms=performance.now()-t0;metrics.frames++;metrics.drawMs+=ms;if(ms>metrics.maxDrawMs)metrics.maxDrawMs=ms;
}
function advance(dt){
  clock+=dt;
  if(game&&screen==='play'){game.tick(dt);checkHold();handleEvents();if(cardAt!=null&&clock>=cardAt){cardAt=null;showCard();}}
  fx.shake=Math.max(0,fx.shake-dt*2.5);
  for(const p of fx.confetti){p.t+=dt;p.vy+=500*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}
  for(let i=fx.confetti.length-1;i>=0;i--)if(fx.confetti[i].t>2.2)fx.confetti.splice(i,1);
}
let last=null;
function frame(ts){
  if(last==null)last=ts;const dt=Math.min(0.05,(ts-last)/1000);last=ts;
  if(!frozen)advance(dt);draw();requestAnimationFrame(frame);
}

// ---------- hooks for tests and fixed views (normal play never touches them) ----------
function auto(kind,until){
  const p=Core.pilot(kind,seed);let n=0,m;
  while(game.state.status!=='won'&&game.state.status!=='lost'&&n<2000){if(until&&until(game.state,m))break;m=p(game);if(!m)break;game.tick(m.dt);n++;lastCursor=m.i;handleEvents();}
  return n;
}
function probe(){
  const s=game?game.state:null;
  return{muted,audio:ac?ac.state:null,sounds:sounds.slice(-40),screen,view:viewName,level:levelId,seed,flagMode,pose:guy.pose,css:[innerWidth,innerHeight],dpr,layout:lay,
    card:!$('card').hidden,cardText:$('card').hidden?'':$('card').innerText,
    state:s&&{status:s.status,opened:s.opened,flags:s.flags,left:game.left(),t:s.t,moves:s.moves,story:s.story,hit:s.hit,guessFree:s.board?s.board.guessFree:null,
      N:s.N,mines:s.level.mines,open:Array.from(s.open),flag:Array.from(s.flag),mine:s.board?Array.from(s.board.mine):null,n:s.board?Array.from(s.board.n):null},
    metrics:{frames:metrics.frames,avgDrawMs:metrics.avgDrawMs,maxDrawMs:metrics.maxDrawMs}};
}
const hook={ready:false,start(l,s){start(l,s);return hook;},tap(i){act('reveal',i);return hook;},flag(i){act('flag',i);return hook;},
  auto(kind,n){let k=0;auto(kind,()=>k++>=n);return hook;},finish(kind){auto(kind||'precise');return hook;},advance(sec){for(let t=0;t<sec;t+=1/60)advance(1/60);return hook;},
  next(){const m=game&&game.moves();return m&&m.length?{op:m[0].op,i:m[0].i}:null;},freeze(){frozen=true;return hook;},probe,metrics,center(i){const b=lay.board,c=L[levelId].cols;return{x:b.x+(i%c+0.5)*b.cell,y:b.y+(Math.floor(i/c)+0.5)*b.cell};}};
window.__sweeper=hook;
window.__PLAYTEST__={get ready(){return hook.ready;},snapshot(){const p=probe();return{screen:p.screen,level:p.level,seed:p.seed,pose:p.pose,card:p.card,state:p.state&&{status:p.state.status,opened:p.state.opened,flags:p.state.flags,left:p.state.left,t:p.state.t}};},
  reset(){start(levelId,seed);},setSeed(n){seed=n>>>0;start(levelId,seed);},step(ms){hook.advance(ms/1000);}};

function applyView(){
  const qs=params.get('seed'),lv=params.get('level');
  const views={
    hero:{level:'normal',seed:3,run(){auto('precise',(s,m)=>s.opened>=0.45*(s.N-s.level.mines)&&m&&m.op==='flag');hook.advance(0.25);}},
    boom:{level:'normal',seed:5,run(){auto('precise',s=>s.opened>=0.3*(s.N-s.level.mines));const s=game.state,nb=Core.neighbours(s.cols,s.rows);
      let target=-1;for(let i=0;i<s.N&&target<0;i++)if(s.board.mine[i]&&!s.flag[i]&&nb[i].some(j=>s.open[j]))target=i;act('reveal',target);hook.advance(1.5);}},
    win:{level:'easy',seed:3,run(){auto('precise');hook.advance(1.3);}},
    stress:{level:'hard',seed:7,run(){auto('precise',s=>s.opened>=0.8*(s.N-s.level.mines));hook.advance(0.25);}}
  };
  const v=views[viewName];if(!v)return;
  start(lv&&L[lv]?lv:v.level,qs!=null?+qs:v.seed);v.run();frozen=true;
}
setMuted(muted);resize();applyView();hook.ready=true;requestAnimationFrame(frame);
})();
