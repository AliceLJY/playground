// 药性配对 page: drawing, input, sound and the acceptance hooks. All rules live in core.js, the herb drawings in herbs.js.
(function(){
'use strict';
const Core=window.HerbCore,Art=window.HerbArt,CFG=Core.CFG,H=Core.H,HERBS=Core.HERBS,NATURES=Core.NATURES;
const canvas=document.getElementById('stage'),ctx=canvas.getContext('2d');
const params=new URLSearchParams(location.search),viewName=params.get('view');
const FONT='"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';
const C={paper:'#F3E7CF',shelf:'#D9C29C',jarA:'#E6D3AE',jarB:'#D7BE93',floor:'#E8D6B3',ink:'#3B2A1E',muted:'#7A6650',card:'#FFF9EC',
  seal:'#B8322A',mint:'#4FAE6A',mintDark:'#2F7A45',gold:'#E0A21B',wicker:'#C99A5B',wickerDark:'#9C6B34',wickerLight:'#E2BD84',hollow:'#6E4A26'};
const NAT=['#3C7BC0','#2FA39A','#E58A2E','#D23A2C'];               // 寒 凉 温 热
const NAT_SUB=['含微寒、大寒','比寒轻一档','含微温','含大热'];
const DISCLAIMER='小游戏只为认识四气，不是医疗建议；用药请遵医嘱';
const KEY_LINE=['四气是药物作用于人体后的反应，','不是药材本身的温度'];

// ---------- view ----------
let cw=1,ch=1,dpr=1,view={scale:1,ox:0,oy:0,W:562},backdrop=null;
const aspectNow=()=>Math.max(0.45,Math.min(1.9,cw/ch));
function worldWidth(){return game?game.state.W:H*aspectNow();}
function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);cw=Math.max(1,Math.round(innerWidth*dpr));ch=Math.max(1,Math.round(innerHeight*dpr));
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  const W=worldWidth(),scale=Math.min(cw/W,ch/H);view={scale,ox:(cw-W*scale)/2,oy:(ch-H*scale)/2,W};backdrop=null;
}
addEventListener('resize',resize);addEventListener('orientationchange',resize);
const toWorld=(cx,cy)=>({x:(cx*dpr-view.ox)/view.scale,y:(cy*dpr-view.oy)/view.scale});
const layoutNow=()=>game?game.state.L:Core.layout(view.W);

// ---------- sound (synthesised, no files) ----------
let ac=null,muted=false,master=null;
try{muted=localStorage.getItem('herb-match-muted')==='1';}catch(e){}
function audio(){
  if(ac||muted)return ac;
  try{ac=new (window.AudioContext||window.webkitAudioContext)();master=ac.createGain();master.gain.value=0.45;master.connect(ac.destination);}catch(e){ac=null;}
  return ac;
}
function tone(freq,to,dur,type,vol,delay){
  if(!audio()||muted)return;const t=ac.currentTime+(delay||0),o=ac.createOscillator(),g=ac.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+dur);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol||0.3,t+0.008);g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
  o.connect(g).connect(master);o.start(t);o.stop(t+dur+0.03);
}
function noise(dur,freq,vol,q,delay){
  if(!audio()||muted)return;const n=Math.floor(ac.sampleRate*dur),buf=ac.createBuffer(1,n,ac.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,2);
  const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();s.buffer=buf;f.type='bandpass';f.frequency.value=freq;f.Q.value=q||1;
  g.gain.value=vol;s.connect(f).connect(g).connect(master);s.start(ac.currentTime+(delay||0));
}
const NOTE=[1568,1319,880,659];   // 寒 bright and glassy down to 热 warm and low
const sfx={
  right(b,combo){const f=NOTE[b];tone(f,f*1.01,0.16,b<2?'sine':'triangle',0.28);tone(f*1.5,f*1.5,0.12,'sine',0.12,0.06);noise(0.07,900,0.35,0.7);
    if(combo>0&&combo%5===0)[0,1,2,3].forEach(i=>tone(784*Math.pow(1.26,i),784*Math.pow(1.26,i),0.14,'triangle',0.16,0.08+i*0.07));},
  wrong(){tone(330,150,0.32,'sine',0.32);tone(250,120,0.3,'triangle',0.12,0.04);noise(0.12,2400,0.25,1.5,0.18);},
  drop(){tone(140,60,0.22,'sine',0.4);noise(0.1,400,0.4,0.8);},
  tick(){tone(1200,1150,0.05,'square',0.06);},
  start(){[523,659,784].forEach((f,i)=>tone(f,f,0.16,'triangle',0.2,i*0.08));},
  end(){[523,659,784,1047,1319].forEach((f,i)=>tone(f,f,0.24,'triangle',0.22,i*0.1));}
};

// ---------- game state ----------
let game=null,pilot=null,screen='title',frozen=false,best=0,clock=0,endT=0,resultT=0,lastTick=-1;
try{best=+localStorage.getItem('herb-match-best')||0;}catch(e){}
const fx={fly:[],pops:[],ripples:[],baskets:[0,0,0,0],shown:[[],[],[],[]],combo:null,flash:0,cardFlip:new Map()};
// what the autopilot holds: the same taps, but a ripple shows where its finger landed
const pilotHands={get state(){return game.state;},tapAt(x,y){fx.ripples.push({x,y,t:0});return game.tapAt(x,y);}};
function start(seed){
  game=Core.create({seed:seed==null?(Math.random()*1e9)|0:seed,aspect:cw/ch});pilot=null;screen='play';endT=0;resultT=0;lastTick=-1;
  fx.fly.length=fx.pops.length=fx.ripples.length=0;fx.baskets=[0,0,0,0];fx.shown=[[],[],[],[]];fx.combo=null;fx.flash=0;fx.cardFlip.clear();drag=null;resize();
}
function pop(text,x,y,color,size){fx.pops.push({text,x,y,color:color||C.ink,size:size||40,t:0});}
function handle(e){
  const s=game.state;
  if(e.type==='file'){
    const B=s.L.baskets[HERBS[e.k].nature];
    fx.fly.push({k:e.k,x0:e.x,y0:e.y,x1:B.cx,y1:B.y+30,t:0,dur:e.ok?0.32:0.55,ok:e.ok,b:HERBS[e.k].nature});
    if(e.ok){pop('+'+e.pts,B.cx,B.y-26,NAT[e.b],e.mult>1?48:40);if(e.combo>=3)fx.combo={n:e.combo,mult:e.mult,t:0};sfx.right(e.b,e.combo);}
    else{const W=s.L.baskets[e.b];pop('不是'+NATURES[e.b].label,W.cx,W.y-26,C.seal,36);fx.flash=0.25;sfx.wrong();}
  }else if(e.type==='drop'){const B=s.L.baskets[HERBS[e.k].nature];fx.fly.push({k:e.k,x0:e.x,y0:e.y,x1:B.cx,y1:B.y+30,t:0,dur:0.55,ok:false,b:HERBS[e.k].nature});pop('漏接了',e.x,CFG.missY-40,C.seal,34);sfx.drop();}
  else if(e.type==='card'){fx.cardFlip.set(e.card,0);}
  else if(e.type==='over'){endT=1.0;sfx.end();if(s.score>best){best=s.score;try{localStorage.setItem('herb-match-best',String(best));}catch(err){}}}
}
function tick(dt){
  clock+=dt;
  if(screen==='play'&&game){
    const s=game.state;
    if(s.phase!=='over'){if(pilot)pilot(pilotHands);game.step(dt);}
    const ev=s.events;for(let i=0;i<ev.length;i++)handle(ev[i]);ev.length=0;
    const left=Math.ceil(CFG.round-s.t);if(s.phase!=='over'&&left<=5&&left!==lastTick){lastTick=left;sfx.tick();}
    if(s.phase==='over'){endT-=dt;if(endT<=0){screen='result';resultT=0;}}
  }
  if(screen==='result')resultT+=dt;
  for(let i=fx.fly.length-1;i>=0;i--){const f=fx.fly[i];f.t+=dt;if(f.t>=f.dur){fx.baskets[f.b]=0.3;const sh=fx.shown[f.b];sh.push(f.k);if(sh.length>3)sh.shift();fx.fly.splice(i,1);}}
  for(let i=fx.pops.length-1;i>=0;i--){const p=fx.pops[i];p.t+=dt;p.y-=60*dt;if(p.t>0.9)fx.pops.splice(i,1);}
  for(let i=fx.ripples.length-1;i>=0;i--){fx.ripples[i].t+=dt;if(fx.ripples[i].t>0.4)fx.ripples.splice(i,1);}
  for(let i=0;i<4;i++)fx.baskets[i]=Math.max(0,fx.baskets[i]-dt);
  for(const [c,v] of fx.cardFlip)fx.cardFlip.set(c,v+dt);
  if(fx.combo){fx.combo.t+=dt;if(fx.combo.t>1.2)fx.combo=null;}
  fx.flash=Math.max(0,fx.flash-dt);
}

// ---------- input ----------
let drag=null;
function muteBox(){const s=view.scale;return{x:view.ox+(view.W-126)*s,y:view.oy+8*s,w:112*s,h:36*s};}
function down(ev){
  ev.preventDefault();audio();if(ac&&ac.state==='suspended')ac.resume();
  const px=ev.clientX*dpr,py=ev.clientY*dpr,m=muteBox();
  if(screen!=='play'&&px>=m.x&&px<=m.x+m.w&&py>=m.y&&py<=m.y+m.h){muted=!muted;try{localStorage.setItem('herb-match-muted',muted?'1':'0');}catch(e){}return;}
  if(frozen)return;
  if(screen==='title'){start();sfx.start();return;}
  if(screen==='result'){if(resultT>0.8){start();sfx.start();}return;}
  if(!game||pilot||game.state.phase==='over')return;
  const p=toWorld(ev.clientX,ev.clientY);
  if(p.y>=CFG.tapTop){fx.ripples.push({x:p.x,y:p.y,t:0});game.tapAt(p.x,p.y);return;}
  const h=game.grab(p.x,p.y);
  if(h){drag={h,id:ev.pointerId,dx:h.x-p.x,dy:h.y-p.y};try{canvas.setPointerCapture(ev.pointerId);}catch(e){}}
}
function move(ev){
  if(!drag||ev.pointerId!==drag.id)return;ev.preventDefault();
  const p=toWorld(ev.clientX,ev.clientY);game.carry(drag.h,p.x+drag.dx,p.y+drag.dy);drag.px=p.x;drag.py=p.y;
}
function up(ev){
  if(!drag||ev.pointerId!==drag.id)return;
  const p=toWorld(ev.clientX,ev.clientY),h=drag.h;drag=null;
  // the herb lands where it is drawn, so judge the drop by the finger, or by the herb when the finger left the basket row
  const r=game.release(h,p.y>=CFG.tapTop?p.x:h.x,Math.max(p.y,h.y));
  if(r!==null)fx.ripples.push({x:p.x,y:Math.max(p.y,CFG.basketTop+40),t:0});
}
canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const KEYS={'1':0,'2':1,'3':2,'4':3,a:0,s:1,d:2,f:3,ArrowLeft:0,ArrowDown:1,ArrowUp:2,ArrowRight:3};
addEventListener('keydown',e=>{
  if(frozen)return;
  if(e.key===' '||e.key==='Enter'){if(screen==='title'||(screen==='result'&&resultT>0.8)){audio();start();sfx.start();}return;}
  if(screen==='play'&&game&&!pilot&&e.key in KEYS){const b=KEYS[e.key],B=game.state.L.baskets[b];fx.ripples.push({x:B.cx,y:B.cy,t:0});game.tapBasket(b);}
});

// ---------- drawing helpers ----------
function text(str,x,y,size,color,align,weight,outline){
  ctx.font=(weight||900)+' '+size+'px '+FONT;ctx.textAlign=align||'center';ctx.textBaseline='middle';
  if(outline){ctx.lineJoin='round';ctx.lineWidth=Math.max(3,size*0.18);ctx.strokeStyle=outline;ctx.strokeText(str,x,y);}
  ctx.fillStyle=color;ctx.fillText(str,x,y);
}
function wrap(str,maxW,size,weight){
  ctx.font=(weight||700)+' '+size+'px '+FONT;const lines=[];let line='';
  for(const ch of str){if(ctx.measureText(line+ch).width>maxW&&line){if('，。；、」！？'.includes(ch)){line+=ch;continue;}lines.push(line);line=ch;}else line+=ch;}
  if(line)lines.push(line);return lines;
}
// same number of lines as a plain wrap, but as even as possible, so no line ends up holding a single character
function wrapEven(str,maxW,size,weight){
  const n=wrap(str,maxW,size,weight).length;if(n<2)return[str];let lo=maxW*0.4,hi=maxW;
  for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(wrap(str,mid,size,weight).length===n)hi=mid;else lo=mid;}
  return wrap(str,hi,size,weight);
}
// a property line breaks after its semicolon first (辛、甘，大热； / 有毒), and only then inside a part
function tasteLines(str,maxW,size){
  if(wrap(str,maxW,size,800).length<2||!str.includes('；'))return wrapEven(str,maxW,size,800);
  const i=str.indexOf('；')+1;return[].concat(wrapEven(str.slice(0,i),maxW,size,800),wrapEven(str.slice(i),maxW,size,800));
}
function pill(x,y,w,h,r,fill,stroke,lw){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||3;ctx.stroke();}}
function drawBackdrop(){
  if(!backdrop||backdrop.width!==cw||backdrop.height!==ch){
    backdrop=document.createElement('canvas');backdrop.width=cw;backdrop.height=ch;const b=backdrop.getContext('2d');
    b.fillStyle=C.paper;b.fillRect(0,0,cw,ch);
    const s=view.scale,X0=-view.ox/s,X1=(cw-view.ox)/s;b.setTransform(s,0,0,s,view.ox,view.oy);b.globalAlpha=0.55;
    for(const y of[250,520]){b.fillStyle=C.shelf;b.fillRect(X0,y,X1-X0,16);
      for(let x=Math.floor(X0/150)*150+40,i=0;x<X1;x+=150,i++){b.fillStyle=i%2?C.jarA:C.jarB;b.beginPath();b.roundRect(x-42,y-92,84,92,12);b.fill();b.fillStyle=C.card;b.beginPath();b.roundRect(x-26,y-70,52,34,5);b.fill();}}
    b.globalAlpha=1;b.fillStyle=C.floor;b.fillRect(X0,770,X1-X0,H+view.oy/s-770);
    b.fillStyle='rgba(155,120,70,0.18)';b.fillRect(X0,770,X1-X0,6);
  }
  ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(backdrop,0,0);
}
function moodFor(h,s){if(h.grabbed)return{mood:'happy',open:true};if(h.y>CFG.missY-150)return{mood:"worry"};return{mood:Math.floor((s.t+h.wob)*0.7)%3===0?'calm':'smug'};}
function herbAt(k,x,y,scale,rot,f,plate){
  ctx.save();ctx.translate(x,y);ctx.rotate(rot||0);ctx.scale(scale,scale);Art.drawHerb(ctx,HERBS[k].id,clock,f);ctx.restore();
  if(plate){const name=HERBS[k].name,size=24;ctx.font='800 '+size+'px '+FONT;const w=ctx.measureText(name).width+22;
    pill(x-w/2,y+66,w,32,10,C.card,C.ink,2.5);text(name,x,y+82.5,size,C.ink,'center',800);}
}
function drawBasket(B,i,title){
  const bump=fx.baskets[i],sq=bump>0?Math.sin(bump/0.3*Math.PI)*0.08:0,x=B.cx,top=B.y+24,bot=B.y+B.h-4,tw=B.w*0.96,bw=B.w*0.8;
  ctx.save();ctx.translate(x,bot);ctx.scale(1+sq,1-sq);ctx.translate(-x,-bot);
  ctx.fillStyle=C.hollow;ctx.beginPath();ctx.ellipse(x,top,tw/2,16,0,0,6.283);ctx.fill();
  for(let j=0;j<fx.shown[i].length;j++){const k=fx.shown[i][j];ctx.save();ctx.beginPath();ctx.rect(x-tw/2,top-80,tw,80);ctx.clip();herbAt(k,x+(j-1)*B.w*0.24,top+2,0.42,(j-1)*0.3,{mood:'happy'});ctx.restore();}
  ctx.beginPath();ctx.moveTo(x-tw/2,top);ctx.lineTo(x+tw/2,top);ctx.lineTo(x+bw/2,bot);ctx.quadraticCurveTo(x,bot+8,x-bw/2,bot);ctx.closePath();
  ctx.fillStyle=C.wicker;ctx.fill();ctx.save();ctx.clip();ctx.strokeStyle='rgba(156,107,52,0.55)';ctx.lineWidth=3;
  for(let y=top+16;y<bot;y+=16){ctx.beginPath();ctx.moveTo(x-tw/2,y);ctx.lineTo(x+tw/2,y);ctx.stroke();}
  for(let k=-3;k<=3;k++){ctx.beginPath();ctx.moveTo(x+k*tw/7,top);ctx.lineTo(x+k*bw/7,bot);ctx.stroke();}ctx.restore();
  ctx.strokeStyle=C.wickerDark;ctx.lineWidth=4;ctx.stroke();
  ctx.strokeStyle=C.wickerLight;ctx.lineWidth=9;ctx.beginPath();ctx.ellipse(x,top,tw/2,16,0,0.05,Math.PI-0.05);ctx.stroke();
  ctx.strokeStyle=C.wickerDark;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,top,tw/2+4,19,0,0,6.283);ctx.stroke();
  const r=Math.min(36,B.w*0.3),by=top+52;
  ctx.fillStyle=NAT[i];ctx.beginPath();ctx.arc(x,by,r,0,6.283);ctx.fill();ctx.strokeStyle=C.card;ctx.lineWidth=4;ctx.stroke();
  text(NATURES[i].label,x,by+1,r*1.3,'#FFFFFF','center',900);
  const fs=Math.min(17,B.w*0.135);ctx.font='700 '+fs+'px '+FONT;const tw2=ctx.measureText(NAT_SUB[i]).width+12;
  pill(x-tw2/2,by+r+6,tw2,fs+10,6,'rgba(255,249,236,0.92)');text(NAT_SUB[i],x,by+r+11+fs/2,fs,C.ink,'center',700);
  ctx.restore();
}
// The back of a card, laid out top-down in card units (card height CFG.card.h). Lines are measured, so a long property
// line or note wraps; the note shrinks a step at a time until everything ends above the divider over the last line.
const CARD_TEXT={pillH:34,floor:44};
function cardBack(herb,w,h,noShrink){
  const maxW=w-28,divider=h-CARD_TEXT.floor,steps=[[19,25,25,30],[18,23,23,27],[17,21,22,26],[16,20,21,24],[15,18,20,23]];
  for(const [nf,nl,tf,tl] of noShrink?steps.slice(0,1):steps){
    const items=[];let yy=46;
    items.push({text:herb.name,y:yy,size:herb.name.length>2?36:40,color:C.ink,weight:900});yy+=26;
    items.push({rule:true,y:yy});yy+=20;
    for(const l of tasteLines(herb.taste,maxW,tf)){items.push({text:l,y:yy,size:tf,color:C.seal,weight:800});yy+=tl;}
    const pw=Math.min(maxW,128),ph=CARD_TEXT.pillH;items.push({pill:true,y:yy-tf/2+2,w:pw,h:ph});items.push({text:'归「'+NATURES[herb.nature].label+'」篓',y:yy-tf/2+2+ph/2,size:21,color:'#FFFFFF',weight:800});yy+=ph+10;
    const notes=wrapEven(herb.note,maxW,nf,700);for(const l of notes){items.push({text:l,y:yy,size:nf,color:C.ink,weight:700});yy+=nl;}
    const bottom=yy-nl+nf*0.6;
    if(bottom<=divider-6||nf===15||noShrink)return{items,bottom,divider,noteSize:nf};
  }
}
function drawCard(card){
  const flip=fx.cardFlip.has(card)?fx.cardFlip.get(card):1,age=game.state.t-card.born,fade=Math.min(1,(CFG.card.life-age)/0.3);
  const k=Math.min(1,flip/0.34);drawCardBody(card,HERBS[card.k],k>=0.5,game.state.cardK,Math.max(0,fade),Math.abs(Math.cos(k*Math.PI)));
}
const lastLine=c=>c.chosen<0?'刚才漏接了':'刚才放进了「'+NATURES[c.chosen].label+'」';
function lastLineSize(c,w){ctx.font='800 18px '+FONT;return Math.min(18,18*(w-24)/ctx.measureText(lastLine(c)).width);}
function drawCardBody(card,herb,back,zk,alpha,sx){
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(card.x+card.w/2,card.y+card.h/2);ctx.scale(Math.max(0.02,sx)*zk,zk);ctx.rotate(card.x<view.W/2?-0.03:0.03);
  const c={w:card.w/zk,h:card.h/zk,chosen:card.chosen},x=-c.w/2,y=-c.h/2;
  ctx.strokeStyle=C.seal;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,y-30);ctx.lineTo(0,y+12);ctx.stroke();
  pill(x+4,y+6,c.w,c.h,14,'rgba(59,42,30,0.18)');pill(x,y,c.w,c.h,14,back?C.card:'#EADBC0',C.ink,4);
  ctx.beginPath();ctx.arc(0,y+16,7,0,6.283);ctx.strokeStyle=C.ink;ctx.lineWidth=3;ctx.stroke();
  if(!back){
    text(c.chosen<0?'漏接了':'放进了',0,y+70,26,C.muted,'center',700);
    if(c.chosen>=0){ctx.fillStyle=NAT[c.chosen];ctx.beginPath();ctx.arc(0,y+130,34,0,6.283);ctx.fill();text(NATURES[c.chosen].label,0,y+131,44,'#FFFFFF');}
    else text('？',0,y+130,64,C.seal);
    text('翻面看看',0,y+200,24,C.muted,'center',700);
  }else{
    const L=cardBack(herb,c.w,c.h),pad=14;
    for(const it of L.items){
      if(it.rule){ctx.strokeStyle=C.seal;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-c.w*0.3,y+it.y);ctx.lineTo(c.w*0.3,y+it.y);ctx.stroke();}
      else if(it.pill){pill(-it.w/2,y+it.y,it.w,it.h,it.h/2,NAT[herb.nature]);}
      else text(it.text,0,y+it.y,it.size,it.color,'center',it.weight);
    }
    ctx.strokeStyle='rgba(59,42,30,0.2)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+pad,y+c.h-44);ctx.lineTo(x+c.w-pad,y+c.h-44);ctx.stroke();
    text(lastLine(c),0,y+c.h-22,lastLineSize(c,c.w),C.seal,'center',800);
  }
  ctx.restore();
}
// fixed view: all sixteen card backs at this screen's real card size (with alternating chosen baskets), to read the layout
function drawCardsSheet(){
  const W=view.W,st=Core.create({aspect:aspectNow()}).state,zk=st.cardK,cols=Math.max(4,Math.floor(W/(st.cardW+16))),rows=Math.ceil(16/cols);
  const k=Math.min(1,(W-16)/(cols*(st.cardW+12)),(H-40)/(rows*(st.cardH+44)));
  ctx.save();ctx.scale(k,k);
  HERBS.forEach((h,i)=>{const col=i%cols,row=Math.floor(i/cols),x=(W/k-cols*(st.cardW+12))/2+col*(st.cardW+12),y=36+row*(st.cardH+44);
    drawCardBody({x,y,w:st.cardW,h:st.cardH,chosen:i%5===4?-1:(h.nature+1+i%3)%4},h,true,zk,1,1);});
  ctx.restore();
}
function drawHud(s){
  const W=s.W,pad=20;
  text(String(s.score),pad,52,52,C.ink,'left',900);
  text('最高 '+Math.max(best,s.score),pad,94,20,C.muted,'left',700);
  const left=Math.max(0,Math.ceil(CFG.round-s.t)),hurry=left<=10;
  text(String(left),W-pad-30,52,52,hurry?C.seal:C.ink,'right',900);text('秒',W-pad,60,24,hurry?C.seal:C.muted,'right',800);
  const L=s.L,bx=L.x0,bw=L.span,by=118;pill(bx,by,bw,10,5,'rgba(59,42,30,0.12)');
  pill(bx,by,Math.max(10,bw*Math.max(0,1-s.t/CFG.round)),10,5,hurry?C.seal:C.mint);
  if(fx.combo){const c=fx.combo,k=Math.min(1,c.t*8),a=Math.max(0,1-Math.max(0,c.t-0.8)/0.4);ctx.save();ctx.globalAlpha=a;
    const size=Math.min(40,W*0.075)*(0.75+0.25*k);text(c.n+' 连对'+(c.mult>1?' ×'+c.mult:''),W/2,58,size,c.mult>1?C.seal:C.ink,'center',900,C.card);ctx.restore();}
}
function drawFooter(){text(DISCLAIMER,view.W/2,H-22,Math.min(18,view.W*0.032),C.muted,'center',600);}
function drawMute(){const m=muteBox();ctx.setTransform(1,0,0,1,0,0);pill(m.x,m.y,m.w,m.h,m.h/2,'rgba(59,42,30,0.12)');
  ctx.font='700 '+m.h*0.48+'px '+FONT;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=C.ink;ctx.fillText(muted?'声音：关':'声音：开',m.x+m.w/2,m.y+m.h/2);}
function drawTitle(){
  const W=view.W,L=layoutNow(),big=Math.min(124,W*0.19);
  text('药性配对',W/2,150,big,C.seal,'center',900);
  text('寒热温凉，接住药材分进药篓',W/2,150+big*0.72,Math.min(32,W*0.056),C.ink,'center',800);
  const row=[4,8,13,2,10],gap=Math.min(118,(W-60)/row.length);
  row.forEach((k,i)=>herbAt(k,W/2+(i-(row.length-1)/2)*gap,395+Math.sin(clock*2+i)*10,Math.min(0.85,gap/120),0,{mood:i%2?'smug':'calm'},false));
  const fs=Math.min(27,W*0.047),y0=520;
  ['点下面的药篓：最靠下的那味药就放进去','也可以按住药材，拖进篓里','分错了，药签会翻过来告诉你为什么'].forEach((l,i)=>text(l,W/2,y0+i*fs*1.6,fs,C.ink,'center',700));
  ctx.save();ctx.globalAlpha=0.6+0.4*Math.sin(clock*4);text('点一下开始',W/2,y0+fs*5.1,Math.min(46,W*0.08),C.seal,'center',900);ctx.restore();
  L.baskets.forEach(B=>drawBasket(B,B.i,true));
}
function drawResult(s){
  const W=s.W,r=s.result,k=Math.min(1,resultT*3),e=1-(1-k)*(1-k);
  ctx.fillStyle='rgba(243,231,207,'+e+')';ctx.fillRect(-view.ox/view.scale,-view.oy/view.scale,cw/view.scale,ch/view.scale);
  ctx.save();ctx.globalAlpha=e;ctx.translate(0,(1-e)*30);
  text(r.score+' 分',W/2,82,Math.min(84,W*0.14),C.seal,'center',900);
  const isBest=r.score>=best&&r.score>0;
  text((isBest?'新纪录　':'')+'分对 '+r.correct+' / '+(r.filed+r.missed)+'　最长 '+r.bestCombo+' 连对',W/2,142,Math.min(28,W*0.05),C.ink,'center',800);
  const big=Math.min(118,W*0.2);text('寒热温凉',W/2,236,big,C.seal,'center',900);
  const fs=Math.min(30,W*0.052);ctx.font='900 '+fs+'px '+FONT;const pw=Math.min(W-28,Math.max(...KEY_LINE.map(l=>ctx.measureText(l).width))+48);
  pill(W/2-pw/2+5,312+7,pw,fs*2.9,22,C.mintDark);pill(W/2-pw/2,312,pw,fs*2.9,22,C.mint);
  KEY_LINE.forEach((l,i)=>text(l,W/2,312+fs*(0.95+i*1.05),fs,'#FFFFFF','center',900));
  // what went wrong this round: each herb once, with its real nature
  const seen=new Set(),slips=[];for(const x of r.slips)if(!seen.has(x.k)){seen.add(x.k);slips.push(x);}
  const y0=312+fs*2.9+46;
  if(slips.length){
    text('这几味没分对',W/2,y0,Math.min(26,W*0.046),C.muted,'center',800);
    const cols=W<700?2:4,cw2=Math.min(250,(W-40)/cols),show=slips.slice(0,cols*3);
    show.forEach((x,i)=>{const col=i%cols,row=Math.floor(i/cols),cx=W/2+(col-(cols-1)/2)*cw2,cy=y0+46+row*64,h=HERBS[x.k];
      pill(cx-cw2/2+6,cy-26,cw2-12,52,14,C.card,'rgba(59,42,30,0.3)',2);
      herbAt(x.k,cx-cw2/2+36,cy,0.34,0,{mood:'calm'});
      text(h.name,cx-cw2/2+64,cy-11,22,C.ink,'left',900);ctx.font='700 16px '+FONT;const room=cw2-12-64-58,tw=ctx.measureText(h.taste).width;text(h.taste,cx-cw2/2+64,cy+13,Math.min(16,16*room/tw),C.muted,'left',700);
      ctx.fillStyle=NAT[h.nature];ctx.beginPath();ctx.arc(cx+cw2/2-34,cy,18,0,6.283);ctx.fill();text(NATURES[h.nature].label,cx+cw2/2-34,cy+1,22,'#FFFFFF');});
    if(slips.length>show.length)text('还有 '+(slips.length-show.length)+' 味',W/2,y0+46+3*64-8,20,C.muted,'center',700);
  }else text('一味都没分错！',W/2,y0+30,Math.min(36,W*0.06),C.mintDark,'center',900);
  ctx.globalAlpha=e*(0.6+0.4*Math.sin(clock*4));text('点一下再来一局',W/2,H-150,Math.min(42,W*0.072),C.seal,'center',900);
  ctx.restore();
}
function drawSheet(){
  const W=view.W,cols=W<900?4:8,rows=16/cols,cw2=W/cols,rh=(H-90)/rows,k=Math.min(0.75,cw2/170,rh/230);
  text('药材一览',W/2,40,36,C.ink);
  HERBS.forEach((h,i)=>{const cx=(i%cols+0.5)*cw2,top=80+Math.floor(i/cols)*rh,cy=top+rh*0.4;
    ctx.save();ctx.translate(cx,cy);ctx.scale(k,k);herbAt(i,0,0,1,0,{mood:'smug'},true);ctx.restore();
    text(h.taste,cx,top+rh*0.9,Math.min(18,cw2/h.taste.length),NAT[h.nature],'center',800);});
}
function draw(){
  drawBackdrop();
  ctx.setTransform(view.scale,0,0,view.scale,view.ox,view.oy);
  if(screen==='sheet'){drawSheet();return;}
  if(screen==='cards'){drawCardsSheet();return;}
  if(screen==='title'){drawTitle();drawFooter();drawMute();return;}
  if(!game)return;
  const s=game.state;
  for(const c of s.cards)drawCard(c);
  s.L.baskets.forEach(B=>drawBasket(B,B.i));
  // score and slip captions sit under every herb, so a caption can never cover a character
  for(const p of fx.pops){ctx.save();ctx.globalAlpha=Math.max(0,1-p.t/0.9);text(p.text,Math.max(70,Math.min(s.W-70,p.x)),p.y,p.size,p.color,'center',900,C.card);ctx.restore();}
  for(const h of s.herbs)if(!h.grabbed){
    // pops out of the shelf: grows with a small overshoot, a puff of dust behind it
    const age=s.t-h.born,k=Math.min(1,age/(CFG.popIn+0.08)),grow=k<1?0.35+0.65*(1-Math.pow(1-k,3))+0.12*Math.sin(k*Math.PI):1;
    if(age<0.35){ctx.save();ctx.globalAlpha=0.5*(1-age/0.35);ctx.fillStyle=C.wickerLight;for(let i=0;i<5;i++){const a=i*1.257+h.wob;ctx.beginPath();ctx.arc(h.x+Math.cos(a)*(40+age*160),h.y-30+Math.sin(a)*(20+age*60),10*(1-age/0.35)+3,0,6.283);ctx.fill();}ctx.restore();}
    herbAt(h.k,h.x,h.y,grow,h.rot+Math.sin(clock*2.4+h.wob)*0.06,moodFor(h,s),k>=1);}
  for(const f of fx.fly){const k=Math.min(1,f.t/f.dur),e=k*k,x=f.x0+(f.x1-f.x0)*k,y=f.y0+(f.y1-f.y0)*e-Math.sin(k*Math.PI)*(f.ok?60:110);
    herbAt(f.k,x,y,1-0.5*k,k*(f.ok?6.283:3.14),{mood:f.ok?'happy':'oops'});}
  for(const r of fx.ripples){const k=r.t/0.4;ctx.strokeStyle='rgba(59,42,30,'+(0.5*(1-k))+')';ctx.lineWidth=5;ctx.beginPath();ctx.arc(r.x,r.y,18+50*k,0,6.283);ctx.stroke();}
  for(const h of s.herbs)if(h.grabbed){ctx.save();ctx.globalAlpha=0.25;ctx.fillStyle=C.ink;ctx.beginPath();ctx.ellipse(h.x+8,h.y+70,48,12,0,0,6.283);ctx.fill();ctx.restore();herbAt(h.k,h.x,h.y,1.12,0,moodFor(h,s),true);}
  if(screen==='play')drawHud(s);
  if(screen==='result')drawResult(s);
  drawFooter();
  if(screen==='result')drawMute();
  if(fx.flash>0){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgba(184,50,42,'+fx.flash*0.25+')';ctx.fillRect(0,0,cw,ch);}
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
// Fixed views: a seed and an autopilot play the real round from the start; from `from` seconds on, the game keeps going
// until the condition first holds, then freezes. Same seed and same screen shape always stop on the same frame.
const inPlay=s=>s.herbs.filter(h=>h.y>200&&h.y<700).length;
const VIEWS={
  hero:{seed:3,pilot:'human',from:20,until:s=>inPlay(s)>=2&&s.combo>=3},
  flip:{seed:9,pilot:'shaky',from:25,until:s=>inPlay(s)>=1&&s.cards.some(c=>s.t-c.born>=0.7)},
  stress:{seed:4,pilot:null,from:58,until:s=>s.herbs.length>=3},
  result:{seed:3,pilot:'human',from:76.5,until:()=>true}
};
const css=(x,y)=>({x:(view.ox+x*view.scale)/dpr,y:(view.oy+y*view.scale)/dpr});
function rectCss(x,y,w,h){const a=css(x,y);return{x:a.x,y:a.y,w:w*view.scale/dpr,h:h*view.scale/dpr};}
const hook=window.__herb={ready:false,metrics,
  start(seed){start(seed);return hook;},
  autopilot(level,seed){pilot=level?Core.pilot(level,seed==null?1:seed):null;return hook;},
  sound(){audio();return hook;},
  advance(seconds){advance(seconds);return hook;},
  popAt(str,x,y){fx.pops.push({text:str,x,y,color:C.seal,size:48,t:0});return hook;},
  clearPops(){fx.pops.length=0;return hook;},
  cardFit(noShrink){const out=[],sz=[0.45,0.5625,0.75,1.78].map(a=>{const st=Core.create({aspect:a}).state;return[st.cardW/st.cardK,st.cardH/st.cardK];});for(const [w,ch] of sz)for(const h of HERBS){const L=cardBack(h,w,ch,noShrink);out.push({name:h.name,w,lastLine:+Math.min(lastLineSize({chosen:-1},w),lastLineSize({chosen:0},w)).toFixed(1),bottom:+L.bottom.toFixed(1),divider:L.divider,noteSize:L.noteSize});}return out;},
  freeze(on){frozen=on!==false;return hook;},
  probe(){const s=game&&game.state,B=CFG.box;
    return{screen,frozen,dpr,canvas:[cw,ch],css:[innerWidth,innerHeight],view:{scale:view.scale,ox:view.ox,oy:view.oy,W:view.W},
      baskets:layoutNow().baskets.map(b=>rectCss(b.x,b.y,b.w,b.h)),
      state:s?{t:+s.t.toFixed(3),phase:s.phase,score:s.score,combo:s.combo,filed:s.filed,correct:s.correct,wrong:s.wrong,missed:s.missed,live:s.herbs.length,result:s.result,
        herbs:s.herbs.map(h=>Object.assign({name:HERBS[h.k].name,grabbed:h.grabbed,age:+(s.t-h.born).toFixed(3),cx:css(h.x,h.y).x,cy:css(h.x,h.y).y},rectCss(h.x-B.half,h.y-B.top,2*B.half,B.top+B.bottom))),
        cards:s.cards.map(c=>Object.assign({name:HERBS[c.k].name,flip:fx.cardFlip.get(c)||0},rectCss(c.x,c.y,c.w,c.h)))}:null};}
};
function boot(){
  resize();
  if(viewName==='sheet')screen='sheet';
  if(viewName==='cards')screen='cards';
  const v=VIEWS[viewName];
  if(v){
    const seed=params.has('seed')?+params.get('seed'):v.seed;start(seed);if(v.pilot)pilot=Core.pilot(v.pilot,seed);
    if(params.has('t'))advance(+params.get('t'));
    else{advance(v.from);const stop=viewName==='result'?1e9:CFG.round-1;for(let n=0;n<120*40&&screen==='play'&&game.state.t<stop&&!v.until(game.state);n++)tick(CFG.step);}
    frozen=true;
  }
  hook.ready=true;requestAnimationFrame(frame);
}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(boot,boot);else boot();
})();
