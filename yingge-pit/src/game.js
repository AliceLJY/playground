// 打回乐池 page: drawing, input, sound and the acceptance hooks. All rules live in core.js.
(function(){
'use strict';
const Core=window.YinggeCore,CFG=Core.CFG,GEO=Core.GEO,STEP=Core.STEP;
const canvas=document.getElementById('stage'),ctx=canvas.getContext('2d');
const params=new URLSearchParams(location.search),viewName=params.get('view');
const FONT='"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';
const COLOR={ink:'#120a06',cream:'#f6ecd8',gold:'#ffc94a',amber:'#ff9a2e',red:'#d8262c',rodLit:'#fff3c4',white:'#f4f0e6',
  dad:'#3c8fd6',son:'#f08a2c',pre:'#ff8a3d'};
const NAMES=['阿爸','心远'],PUPPET=['普宁','甲子','凤岗'];
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t,ease=t=>1-Math.pow(1-clamp(t,0,1),3),easeIn=t=>Math.pow(clamp(t,0,1),3);
const W01=(t,a,b)=>clamp((t-a)/(b-a),0,1);

// ---------- assets ----------
// Puppet part rectangles from the film's rigs.js (A 普宁, B 甲子, C 潮阳凤岗), in the source sheet's pixels; the sheets here are scaled by SHEET.
const SHEET=0.6;
const RIGS={
  A:{body:{sx:76,sy:17,sw:878,sh:1062,foot:[512,1066],sL:[279,417],sR:[736,422],hip:[512,640]},
     armL:{sx:7,sy:1085,sw:368,sh:433,pivot:[181,1144],hand:[288,1300]},armR:{sx:647,sy:1083,sw:369,sh:433,pivot:[843,1145],hand:[736,1300]}},
  B:{body:{sx:145,sy:10,sw:742,sh:1137,foot:[516,1136],sL:[326,515],sR:[700,515],hip:[512,760]},
     armL:{sx:8,sy:1138,sw:435,sh:387,pivot:[164,1202],hand:[300,1400]},armR:{sx:580,sy:1138,sw:436,sh:387,pivot:[860,1202],hand:[730,1400]}},
  C:{body:{sx:61,sy:4,sw:902,sh:975,foot:[512,968],sL:[305,270],sR:[720,281],hip:[512,560]},
     armL:{sx:5,sy:978,sw:374,sh:539,pivot:[49,1036],hand:[226,1280]},armR:{sx:646,sy:978,sw:373,sh:539,pivot:[975,1036],hand:[800,1280]}}
};
const img={};let pending=0;
function load(name,file){pending++;const i=new Image();i.onload=i.onerror=()=>{if(--pending===0)boot();};i.src='assets/'+file;img[name]=i;}
['stage-back','stage-front','puppet-A','puppet-B','puppet-C','gong','ball'].forEach(n=>load(n,n+'.webp'));
const ok=i=>i&&i.complete&&i.naturalWidth>0;

// ---------- layout ----------
// Portrait: the film's 1080 x 1920 frame, contained, pads along the bottom. Landscape: the stage part (y 200-1790) contained,
// with the pads in the side margins so each thumb sits on its own side.
let cw=1,ch=1,dpr=1,L={scale:1,ox:0,oy:0,land:false,vis:{x0:0,y0:0,x1:1080,y1:1920},pads:[]};
const PAD_TOP=1784;
function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);cw=Math.max(1,Math.round(innerWidth*dpr));ch=Math.max(1,Math.round(innerHeight*dpr));
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  const land=cw/ch>=1.15;let scale,ox,oy;
  if(!land){scale=Math.min(cw/1080,ch/1920);ox=(cw-1080*scale)/2;oy=(ch-1920*scale)/2;}
  else{const y0=200,y1=1790,minSide=300;scale=Math.min(ch/(y1-y0),cw/(1080+2*minSide));ox=(cw-1080*scale)/2;oy=(ch-(y1-y0)*scale)/2-y0*scale;}
  const vis={x0:-ox/scale,y0:-oy/scale,x1:(cw-ox)/scale,y1:(ch-oy)/scale};
  L={scale,ox,oy,land,vis,pads:makePads(land,vis)};
}
// Each pad: a rectangle in world units, the lane it strikes and whose thumb it is (player -1 = solo).
function makePads(land,vis){
  const duo=mode==='duo',pads=[];
  if(!land){
    const y0=PAD_TOP,y1=vis.y1-14,g=10;
    const cols=duo?[[vis.x0+12,360,0,0],[360,540,1,0],[540,720,1,1],[720,vis.x1-12,2,1]]:[[vis.x0+12,360,0,-1],[360,720,1,-1],[720,vis.x1-12,2,-1]];
    for(const [a,b,lane,player] of cols)pads.push({x:a+g/2,y:y0,w:b-a-g,h:y1-y0,lane,player});
  }else{
    const g=14,h=Math.min(560,(vis.y1-vis.y0)*0.42),y=vis.y1-h-24;
    const lw=-vis.x0-2*g-20,rw=vis.x1-1080-2*g-20,half=w=>(w-g)/2;
    pads.push({x:vis.x0+g,y,w:half(lw),h,lane:0,player:duo?0:-1},{x:vis.x0+g+half(lw)+g,y,w:half(lw),h,lane:1,player:duo?0:-1});
    pads.push({x:1080+20+g,y,w:half(rw),h,lane:1,player:duo?1:-1},{x:1080+20+g+half(rw)+g,y,w:half(rw),h,lane:2,player:duo?1:-1});
  }
  return pads;
}
addEventListener('resize',resize);addEventListener('orientationchange',resize);
const toWorld=(cx,cy)=>({x:(cx*dpr-L.ox)/L.scale,y:(cy*dpr-L.oy)/L.scale});
const toCss=(x,y)=>({x:(L.ox+x*L.scale)/dpr,y:(L.oy+y*L.scale)/dpr});

// ---------- sound (synthesised, no files) ----------
let ac=null,master=null,noiseBuf=null,muted=false;
try{muted=localStorage.getItem('yingge-muted')==='1';}catch(e){}
function audio(){
  if(ac||muted)return ac;
  try{ac=new (window.AudioContext||window.webkitAudioContext)();const comp=ac.createDynamicsCompressor();comp.threshold.value=-12;comp.ratio.value=4;
    master=ac.createGain();master.gain.value=0.8;master.connect(comp);comp.connect(ac.destination);
    noiseBuf=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}catch(e){ac=null;}
  return ac;
}
function env(g,t,attack,peak,decay){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,peak),t+attack);g.gain.exponentialRampToValueAtTime(0.0001,t+attack+decay);}
function tone(type,f0,t,o){o=o||{};const os=ac.createOscillator(),g=ac.createGain();os.type=type;os.frequency.setValueAtTime(f0,t);
  if(o.f1)os.frequency.exponentialRampToValueAtTime(o.f1,t+(o.glide||0.05));env(g,t,o.attack||0.003,o.peak||0.3,o.decay||0.3);os.connect(g);g.connect(master);os.start(t);os.stop(t+(o.attack||0.003)+(o.decay||0.3)+0.05);}
function hiss(t,o){o=o||{};const sr=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();sr.buffer=noiseBuf;f.type=o.type||'bandpass';f.frequency.setValueAtTime(o.f||2000,t);f.Q.value=o.q||1;
  if(o.f1)f.frequency.exponentialRampToValueAtTime(o.f1,t+(o.glide||0.2));env(g,t,o.attack||0.002,o.peak||0.2,o.decay||0.2);sr.connect(f);f.connect(g);g.connect(master);sr.start(t,Math.random());sr.stop(t+(o.attack||0.002)+(o.decay||0.2)+0.05);}
const partials=[1,1.47,2.09,2.56,3.17,4.1];
const S={
  gong(t,f){f=f||560;partials.forEach((r,i)=>tone('sine',f*r*0.94,t,{f1:f*r,glide:0.06,peak:0.22/(1+i*0.5),decay:1.1/(1+i*0.3)}));hiss(t,{type:'highpass',f:4400,q:0.7,peak:0.2,decay:0.3});},
  gongBig(t){partials.forEach((r,i)=>tone('sine',300*r*1.04,t,{f1:300*r,glide:0.25,peak:0.3/(1+i*0.5),decay:2.2/(1+i*0.25)}));hiss(t,{type:'bandpass',f:6000,q:0.6,peak:0.3,decay:1});tone('sine',82,t,{f1:52,glide:0.3,peak:0.35,decay:0.5});},
  clack(t){tone('sine',1700,t,{peak:0.22,decay:0.05});hiss(t,{type:'bandpass',f:2400,q:5,peak:0.32,decay:0.045});},
  puff(t){hiss(t,{type:'bandpass',f:420,f1:900,glide:0.25,q:0.9,peak:0.12,decay:0.28});},
  drum(t,v){tone('sine',128,t,{f1:68,glide:0.14,peak:0.34*v,decay:0.22});hiss(t,{type:'lowpass',f:420,peak:0.1*v,decay:0.07});},
  hit(t,perfect){S.clack(t);S.gong(t+0.005,perfect?660:540);hiss(t,{type:'highpass',f:5200,peak:perfect?0.26:0.14,decay:perfect?0.5:0.2});if(perfect)tone('triangle',1320,t+0.03,{peak:0.12,decay:0.35});},
  slap(t){tone('sine',150,t,{f1:52,glide:0.2,peak:0.6,decay:0.25});hiss(t,{type:'lowpass',f:800,peak:0.3,decay:0.16});tone('sine',300,t+0.12,{f1:900,glide:0.25,peak:0.14,decay:0.3});},
  laugh(t){[0,0.11,0.22].forEach((d,i)=>{tone('square',330-i*25,t+0.15+d,{f1:240-i*20,glide:0.08,peak:0.07,decay:0.09});});},
  swish(t){hiss(t,{type:'bandpass',f:900,f1:2400,glide:0.1,q:1.8,peak:0.1,decay:0.1});},
  dull(t){tone('sine',220,t,{f1:160,glide:0.08,peak:0.15,decay:0.12});},
  roll(t){let d=0,gap=0.15;for(let i=0;i<9;i++){S.drum(t+d,0.5+i*0.06);d+=gap;gap*=0.85;}return d;},
  bigYingge(t){const d=S.roll(t);S.gongBig(t+d);[0.18,0.36].forEach(x=>S.gong(t+d+x,620));},
  boing(t){tone('sine',240,t,{f1:620,glide:0.12,peak:0.18,decay:0.18});},
  smack(t){hiss(t,{type:'bandpass',f:1500,q:1.2,peak:0.36,decay:0.07});tone('sine',380,t,{f1:160,glide:0.07,peak:0.25,decay:0.08});},
  ouch(t){tone('square',520,t,{f1:300,glide:0.15,peak:0.06,decay:0.18});},
  thud(t){tone('sine',110,t,{f1:46,glide:0.18,peak:0.6,decay:0.3});hiss(t,{type:'lowpass',f:500,peak:0.3,decay:0.25});},
  brush(t){hiss(t,{type:'bandpass',f:3000,f1:1500,glide:0.15,q:0.8,peak:0.05,decay:0.16});},
  win(t){S.gongBig(t);[523,659,784,1047].forEach((f,i)=>tone('triangle',f,t+0.3+i*0.12,{peak:0.14,decay:0.4}));},
  lose(t){tone('sawtooth',330,t,{f1:110,glide:1.1,peak:0.12,decay:1.2});hiss(t,{type:'lowpass',f:1200,f1:200,glide:1,peak:0.1,decay:1});},
  ui(t){tone('sine',1200,t,{peak:0.08,decay:0.05});}
};
function play(name,a,b){if(!ac||muted||!S[name])return;try{S[name](ac.currentTime+0.004,a,b);}catch(e){}}

// ---------- game state ----------
const titleGame=Core.create({seed:1});
let mode='solo',game=null,pilot=null,screen='title',frozen=false,clock=0,resultT=0,best=0;
try{best=+localStorage.getItem('yingge-best')||0;mode=localStorage.getItem('yingge-mode')==='duo'?'duo':'solo';}catch(e){}
if(params.get('mode')==='duo')mode='duo';else if(params.get('mode')==='solo')mode='solo';
const log=[];
const fx={sparks:[],bits:[],pops:[],rings:[],dust:[],flash:0,shake:0,banner:null,speech:null,big:null};
let vis=null;   // smoothed boss motion and per-puppet swing info for drawing
function freshVis(){return{level:0,jolt:-9,joltK:0,spin:0,spinT:-9,face:'grin',faceUntil:0,laughT:-9,board:0,beat:0,lastBeat:-9,barStart:null,beatIdx:0,
  swings:[{at:-9,hit:false},{at:-9,hit:false},{at:-9,hit:false}]};}
function start(seed,m){
  if(m)mode=m;
  game=Core.create({seed:seed==null?(Math.random()*1e9)|0:seed,mode});pilot=null;screen='play';resultT=0;
  fx.sparks.length=fx.bits.length=fx.pops.length=fx.rings.length=fx.dust.length=0;fx.flash=fx.shake=0;fx.banner=fx.speech=fx.big=null;
  vis=freshVis();resize();
}
function pop(text,x,y,color,size){fx.pops.push({text,x,y,color:color||COLOR.cream,size:size||46,t:0});}
function sparks(x,y,n,big){for(let i=0;i<n;i++){const a=Math.random()*6.283,v=(big?900:600)*(0.35+Math.random());fx.sparks.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-200,t:0,life:0.3+Math.random()*0.3,len:10+Math.random()*16});}
  fx.rings.push({x,y,t:0,r0:20,r1:big?220:130,color:big?COLOR.gold:COLOR.rodLit});}
function dust(x,y,n){for(let i=0;i<n;i++)fx.dust.push({x:x+(Math.random()-0.5)*80,y,vx:(Math.random()-0.5)*260,vy:-60-Math.random()*120,r:10+Math.random()*16,t:0,life:0.6+Math.random()*0.4});}
function banner(title,hint,dur,low){fx.banner={title,hint,t:0,dur:dur||2.2,low:!!low};}
function say(text,dur){fx.speech={text,t:0,dur:dur||1.0};}
const WAVE_HINT=[
  ['第一波 · 探头','袖子鼓起看哪一道，铁枝一亮就点那一道'],
  ['第二波 · 虚晃','它会虚晃一下再换道：等铁枝亮了再点'],
  ['第三波 · 两道齐抽',()=>mode==='duo'?'两道一起亮：阿爸心远一起出槌':'两道一起亮：两只手一起点']
];
function handle(e){
  const s=game.state;
  switch(e.type){
    case 'phase':
      if(e.phase==='intro'){const h=WAVE_HINT[e.wave];banner(h[0],typeof h[1]==='function'?h[1]():h[1],2.4);say(e.wave===0?'嘿嘿，戏台归我了':e.wave===1?'还没完！':'这回动真格的',1.3);vis.laughT=s.t;play('laugh');}
      if(e.phase==='sink'){say('哎呀呀',0.9);vis.face='dizzy';vis.faceUntil=s.t+1.2;}
      if(e.phase==='interlude'){banner('牛肉丸来了','点中红球有分，打回去还能砸它的头',2.6,true);}
      break;
    case 'attack':play('puff');break;
    case 'hit':{
      if(e.meter>=CFG.meter&&!vis.meterFull){vis.meterFull=true;banner('锣鼓槽满了！','点台口那面大锣：三个一齐出槌',1.6);}
      const c=Core.contact(e.lane);vis.swings[e.lane]={at:s.t,hit:true,perfect:e.perfect,player:e.player};
      sparks(c.x,c.y,e.perfect?26:16,e.perfect);vis.jolt=s.t;vis.joltK=e.perfect?1:0.6;if(e.perfect){vis.spinT=s.t;}
      vis.face='ouch';vis.faceUntil=s.t+0.5;fx.shake=Math.max(fx.shake,e.perfect?12:7);
      const hy=GEO.lanes[e.lane].foot-GEO.lanes[e.lane].h-70;
      pop(e.perfect?'妙！':'+100',GEO.lanes[e.lane].x,hy,e.perfect?COLOR.gold:COLOR.cream,e.perfect?64:48);
      if(mode==='duo')pop(NAMES[e.player],GEO.lanes[e.lane].x,hy-58,e.player?COLOR.son:COLOR.dad,34);
      play('hit',e.perfect);break;}
    case 'miss':{
      vis.meterFull=false;
      const c=Core.contact(e.lane);vis.swings[e.lane]={at:-9,hit:false};fx.shake=Math.max(fx.shake,10);dust(c.x,GEO.lanes[e.lane].foot,8);
      vis.laughT=s.t;vis.face='laugh';vis.faceUntil=s.t+0.9;say(['嘿嘿嘿','哈！','爬一格～','再来呀'][e.id%4],0.9);play('slap');play('laugh');break;}
    case 'whiff':
      if(game.state.meter<CFG.meter)vis.meterFull=false;
      vis.swings[e.lane]={at:s.t,hit:false};play('swish');
      if(e.why==='fooled'){pop('上当了',GEO.lanes[e.lane].x,GEO.lanes[e.lane].foot-GEO.lanes[e.lane].h-70,COLOR.pre,40);say('骗你的～',0.9);vis.face='wink';vis.faceUntil=s.t+0.9;}
      else if(e.why==='early')pop('早了',GEO.lanes[e.lane].x,GEO.lanes[e.lane].foot-GEO.lanes[e.lane].h-70,COLOR.cream,38);
      break;
    case 'swing':vis.swings[e.lane]={at:s.t,hit:false};play('swish');break;
    case 'dizzy':pop('手忙脚乱',GEO.lanes[e.lane].x,GEO.lanes[e.lane].foot-GEO.lanes[e.lane].h-70,COLOR.pre,40);break;
    case 'gong':
      vis.meterFull=false;fx.banner=null;   // the "meter full, hit the gong" hint is done once the gong goes
      for(let i=0;i<3;i++)vis.swings[i]={at:s.t,hit:true,perfect:true};vis.jolt=s.t;vis.joltK=1.4;vis.spinT=s.t;vis.face='ouch';vis.faceUntil=s.t+1.2;
      fx.flash=0.5;fx.shake=22;fx.big={text:'大英歌！',t:0};for(let i=0;i<3;i++){const c=Core.contact(i);sparks(c.x,c.y,18,true);}
      fx.rings.push({x:GEO.gong.x,y:GEO.gong.y,t:0,r0:60,r1:520,color:COLOR.gold});play('bigYingge');break;
    case 'gongDull':if(s.phase==='wave'){play('dull');fx.rings.push({x:GEO.gong.x,y:GEO.gong.y,t:0,r0:40,r1:110,color:'rgba(246,236,216,0.6)'});}break;
    case 'tired':say('呼……呼……累了',1.6);banner('它累了！','现在每一槌都打回一整格',1.8);break;
    case 'bounce':play('boing');break;
    case 'ball':play('smack');sparks(e.x,e.y,12,false);pop('+80 牛肉丸！',e.x,e.y-80,COLOR.gold,44);if(e.bonk)setTimeout(()=>play('ouch'),450);break;
    case 'win':play('win');break;
    case 'lose':play('lose');banner('台被占了！','它爬上台口，今晚收工',2.6);break;
  }
}

// ---------- sim tick ----------
function tick(dt){
  clock+=dt;
  if(screen==='play'&&game){
    const s=game.state;
    if(s.phase!=='over'){if(pilot)pilot(game);game.step(dt);}
    const ev=s.events;for(let i=0;i<ev.length;i++){handle(ev[i]);const e=ev[i];if(e.lane!=null||e.type==='gong'||e.type==='gongDull'){log.push({type:e.type,lane:e.lane,player:e.player,why:e.why,t:+e.t.toFixed(3)});if(log.length>60)log.shift();}}ev.length=0;
    updateVis(dt);
    if(s.phase==='over'){screen='result';resultT=0;const tot=s.result.total;if(tot>best){best=tot;try{localStorage.setItem('yingge-best',String(best));}catch(e){}}}
  }
  if(screen==='result')resultT+=dt;
  for(let i=fx.sparks.length-1;i>=0;i--){const p=fx.sparks[i];p.t+=dt;p.vy+=1600*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.t>p.life)fx.sparks.splice(i,1);}
  for(let i=fx.dust.length-1;i>=0;i--){const p=fx.dust[i];p.t+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=60*dt;if(p.t>p.life)fx.dust.splice(i,1);}
  for(let i=fx.rings.length-1;i>=0;i--){fx.rings[i].t+=dt;if(fx.rings[i].t>0.45)fx.rings.splice(i,1);}
  for(let i=fx.pops.length-1;i>=0;i--){const p=fx.pops[i];p.t+=dt;p.y-=60*dt;if(p.t>0.85)fx.pops.splice(i,1);}
  if(fx.banner){fx.banner.t+=dt;if(fx.banner.t>fx.banner.dur)fx.banner=null;}
  if(fx.speech){fx.speech.t+=dt;if(fx.speech.t>fx.speech.dur)fx.speech=null;}
  if(fx.big){fx.big.t+=dt;if(fx.big.t>1.2)fx.big=null;}
  fx.flash=Math.max(0,fx.flash-dt*1.6);fx.shake=Math.max(0,fx.shake-50*dt);
}
// The boss's level eases toward the rule value; 甲子's drum point ("咚咚咚，隆咚咚") keeps time under the waves.
const JIAZI=[[0,1],[0.5,0.55],[1,0.8],[2,1],[2.17,0.6],[2.5,0.55],[3,0.9]],SPB=60/104;
function updateVis(dt){
  const s=game.state,v=vis;
  let target=s.level;
  if(s.phase==='intro')target=lerp(-1.5,s.level,ease(W01(s.phaseT,0.15,0.9)));
  else if(s.phase==='sink'||s.phase==='interlude')target=s.phase==='sink'?lerp(v.level,-2,ease(s.phaseT/0.8)):-2;
  else if(s.phase==='won')target=-2.5;
  else if(s.phase==='lost'||s.phase==='over'&&s.result&&s.result.outcome==='lose')target=CFG.top+1.6*ease(W01(s.phaseT,0,1));
  const k=s.phase==='wave'?Math.min(1,dt*7):Math.min(1,dt*10);v.level+=(target-v.level)*k;
  if(s.phase==='won'){v.board=ease(W01(s.phaseT,0.5,1.15));if(s.phaseT>=1.15&&s.phaseT-dt<1.15){play('thud');for(let x=150;x<960;x+=120)dust(x,GEO.pitTop+10,2);fx.shake=10;}}
  // drum
  if(s.phase==='wave'||s.phase==='intro'){
    if(v.barStart==null){v.barStart=clock+0.1;v.beatIdx=0;}
    const at=()=>{const n=JIAZI.length;return v.barStart+(Math.floor(v.beatIdx/n)*4+JIAZI[v.beatIdx%n][0])*SPB;};
    while(clock>=at()){const vel=JIAZI[v.beatIdx%JIAZI.length][1];play('drum',vel*0.8);v.lastBeat=clock;v.beat=vel;v.beatIdx++;}
  }else v.barStart=null;
  if(s.phase==='won'){const T=s.phaseT;for(let i=0;i<3;i++)for(let k2=0;k2<13;k2+=3){const at=1.8+i*0.25+k2*0.15;if(T>=at&&T-dt<at)play('brush');}if(T>=4.4&&T-dt<4.4)play('bigYingge');}
}

// ---------- input ----------
function muteBox(){const v=L.vis;return{x:v.x1-170,y:v.y0+24,w:150,h:64};}
function modeBoxes(){return[{x:250,y:1790,w:270,h:104,mode:'solo'},{x:560,y:1790,w:270,h:104,mode:'duo'}];}
const inBox=(p,b)=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h;
function laneAt(p){
  for(const pad of L.pads)if(inBox(p,pad))return{lane:pad.lane,player:pad.player<0?0:pad.player};
  const lane=p.x<360?0:p.x<720?1:2;return{lane,player:mode==='duo'&&p.x>=540?1:0};
}
function press(p){
  if(frozen)return;
  if(inBox(p,muteBox())&&screen!=='play'){muted=!muted;try{localStorage.setItem('yingge-muted',muted?'1':'0');}catch(e){}if(muted&&master)master.gain.value=0;else if(master)master.gain.value=0.8;return;}
  if(screen==='title'){for(const b of modeBoxes())if(inBox(p,b)){mode=b.mode;try{localStorage.setItem('yingge-mode',mode);}catch(e){}resize();play('ui');return;}start();return;}
  if(screen==='result'){if(resultT>1.2)screen='title',resize();return;}
  if(!game||pilot)return;
  const s=game.state,g=GEO.gong;
  if(Math.hypot(p.x-g.x,p.y-g.y)<=g.r*1.35){game.gong(mode==='duo'&&p.x>=540?1:0);return;}
  const hit=laneAt(p);
  if(s.phase==='interlude'&&game.tapBall(p.x,p.y,hit.player))return;
  game.tap(hit.lane,hit.player);
}
canvas.addEventListener('pointerdown',ev=>{ev.preventDefault();audio();if(ac&&ac.state==='suspended')ac.resume();press(toWorld(ev.clientX,ev.clientY));});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const KEYS={solo:{ArrowLeft:[0,0],a:[0,0],ArrowDown:[1,0],s:[1,0],ArrowRight:[2,0],d:[2,0]},
  duo:{a:[0,0],ArrowLeft:[0,0],s:[1,0],ArrowDown:[1,1],ArrowRight:[2,1]}};
addEventListener('keydown',e=>{
  if(frozen||e.repeat)return;audio();if(ac&&ac.state==='suspended')ac.resume();
  const k=e.key.length===1?e.key.toLowerCase():e.key;
  if(screen==='title'){if(k==='1'){mode='solo';resize();}else if(k==='2'){mode='duo';resize();}else if(k===' '||k==='Enter')start();return;}
  if(screen==='result'){if((k===' '||k==='Enter')&&resultT>1.2){screen='title';resize();}return;}
  if(!game||pilot)return;
  const m=KEYS[mode][k];if(m){game.tap(m[0],m[1]);e.preventDefault();return;}
  if(k===' '||k==='ArrowUp'||k==='w'){game.gong(mode==='duo'&&k==='ArrowUp'?1:0);e.preventDefault();}
});

// ---------- drawing helpers ----------
let frameText=[];
function text(str,x,y,size,color,align,weight,tag){
  ctx.font=(weight||900)+' '+size+'px '+FONT;ctx.textAlign=align||'center';ctx.textBaseline='middle';
  ctx.lineJoin='round';ctx.lineWidth=Math.max(3,size*0.18);ctx.strokeStyle='rgba(18,8,4,0.88)';ctx.strokeText(str,x,y);ctx.fillStyle=color;ctx.fillText(str,x,y);
  if(tag){const w=ctx.measureText(str).width,x0=align==='left'?x:align==='right'?x-w:x-w/2;frameText.push({tag,text:str,x:x0,y:y-size*0.6,w,h:size*1.2});}
}
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

// One paper puppet: body card anchored at the foot, two arm cards turning on the shoulder rivets. Returns its world bounding box.
function drawPuppet(lane,pose){
  const G=GEO.lanes[lane],R=RIGS[G.rig],B=R.body,im=img['puppet-'+G.rig];if(!ok(im))return null;
  const k=G.h/B.sh*(pose.scale||1),tilt=pose.tilt||0,sx=pose.sx||1,sy=pose.sy||1,fy0=G.foot-(pose.bob||0),piv=pose.pivot||0;
  // pivot: turn about a point on the floor this far from the foot (a puppet falling over goes over its outer foot)
  const fx0=G.x+(pose.dx||0)+piv-piv*Math.cos(tilt),fyT=fy0-piv*Math.sin(tilt);
  const box={x0:1e9,y0:1e9,x1:-1e9,y1:-1e9};
  const local=(px,py)=>[(px-B.foot[0])*k*sx,(py-B.foot[1])*k*sy];
  const world=(lx,ly)=>{const c=Math.cos(tilt),s=Math.sin(tilt);return[fx0+lx*c-ly*s,fyT+lx*s+ly*c];};
  const grow=(x,y)=>{if(x<box.x0)box.x0=x;if(x>box.x1)box.x1=x;if(y<box.y0)box.y0=y;if(y>box.y1)box.y1=y;};
  // iron rods from below the stage to the hip and hands, like the film's rod puppets
  ctx.save();ctx.translate(fx0,fyT);ctx.rotate(tilt);
  const hip=local(...B.hip);if(Math.abs(tilt)<0.3){ctx.strokeStyle='rgba(30,26,24,0.85)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(hip[0],hip[1]);ctx.lineTo(hip[0]+4,G.foot+30-fyT);ctx.stroke();}
  ctx.save();ctx.scale(sx,sy);
  ctx.drawImage(im,B.sx*SHEET,B.sy*SHEET,B.sw*SHEET,B.sh*SHEET,(B.sx-B.foot[0])*k,(B.sy-B.foot[1])*k,B.sw*k,B.sh*k);
  ctx.restore();
  for(const [x,y] of [[B.sx,B.sy],[B.sx+B.sw,B.sy],[B.sx,B.sy+B.sh],[B.sx+B.sw,B.sy+B.sh]])grow(...world(...local(x,y)));
  const hands={};
  for(const side of ['L','R']){
    const A=R['arm'+side],sh=local(...B['s'+side]),ang=pose['a'+side]||0;
    ctx.save();ctx.translate(sh[0],sh[1]);ctx.rotate(ang);
    ctx.drawImage(im,A.sx*SHEET,A.sy*SHEET,A.sw*SHEET,A.sh*SHEET,(A.sx-A.pivot[0])*k,(A.sy-A.pivot[1])*k,A.sw*k,A.sh*k);
    ctx.restore();
    const rot=(px,py)=>{const dx=(px-A.pivot[0])*k,dy=(py-A.pivot[1])*k,c=Math.cos(ang),s=Math.sin(ang);return world(sh[0]+dx*c-dy*s,sh[1]+dx*s+dy*c);};
    for(const [x,y] of [[A.sx,A.sy],[A.sx+A.sw,A.sy],[A.sx,A.sy+A.sh],[A.sx+A.sw,A.sy+A.sh]])grow(...rot(x,y));
    hands[side]=rot(...A.hand);
  }
  ctx.restore();
  return{box,hands,head:world(...local(B.foot[0],B.sy+40))};
}
function puppetPose(lane,t){
  const s=game.state,p=s.puppets[lane],sw=vis.swings[lane],G=GEO.lanes[lane];
  const phase=lane*1.3,idle=Math.sin(clock*3.1+phase)*0.05,beat=Math.exp(-(clock-vis.lastBeat)*8)*vis.beat;
  let pose={aL:0.35+idle-0.25*beat,aR:-0.35-idle+0.25*beat,tilt:idle*0.3,bob:10*beat};
  const out=lane===0?-1:lane===2?1:0;
  if(s.phase==='won'){
    const T=s.phaseT,step=ease(W01(T,1.25,1.7)),pose2={aL:lerp(0.35,-1.55,ease(W01(T,4.4,4.7))),aR:lerp(-0.35,1.55,ease(W01(T,4.4,4.7))),bob:24*step+18*Math.abs(Math.sin((T-4.4)*Math.PI*2))*W01(T,4.4,4.6),scale:1+0.06*step};
    return pose2;
  }
  if(s.phase==='lost'||(s.phase==='over'&&s.result&&s.result.outcome==='lose')){const k=ease(W01(s.phaseT,0.3,0.8)),dir=out||-1;return{aL:0.95,aR:-0.95,tilt:dir*1.2*k,pivot:dir*110,sy:1-0.2*k};}
  // knocked down: squashed by the blow, slumps over its outer foot, lies there with stars, springs back up
  if(t<p.downUntil){
    const u=t-p.downAt,dir=out||-1,piv=dir*110;
    if(u<0.12){const k=u/0.12;return{aL:0.35,aR:-0.35,sy:1-0.5*k,sx:1+0.2*k};}
    if(u<2.55){const k=ease(W01(u,0.12,0.42)),wob=Math.sin(u*9)*0.03*(1-W01(u,0.4,1.2));return{aL:0.95,aR:-0.95,tilt:dir*(0.62*k+wob),pivot:piv,sy:lerp(0.5,0.7,k),sx:lerp(1.2,1.06,k)};}
    const k=ease(W01(u,2.55,3));return{aL:0.35,aR:-0.35,tilt:dir*0.62*(1-k),pivot:piv,sy:lerp(0.7,1,k),bob:60*Math.sin(Math.PI*k)};
  }
  if(t<p.dizzyUntil){const w=Math.sin(clock*16);return{aL:0.9+0.4*w,aR:-0.9+0.4*w,tilt:0.16*w,bob:4};}
  // a swing: wind up, strike toward the pit, hold, recover (槌法 from the film's 合力出槌)
  const u=t-sw.at;
  if(u>=0&&u<0.6){
    const up=ease(W01(u,0,0.05))*(1-W01(u,0.05,0.12)),hit=ease(W01(u,0.04,0.13))*(1-ease(W01(u,0.32,0.6)));
    return{aL:0.35+0.75*up-1.75*hit,aR:-0.35-0.75*up+1.75*hit,tilt:-out*0.12*hit,bob:-8*hit,dx:-out*26*hit,sy:1-0.04*hit};
  }
  // braced while its lane is threatened
  const th=game.threat(lane);
  if(th.kind==='lit'||th.kind==='pre'){const k=th.kind==='lit'?1:0.5;pose.tilt+=-out*0.04*k;pose.sy=1-0.03*k;pose.aL+=0.12*k;pose.aR-=0.12*k;}
  return pose;
}

// The boss: a white-robed rod puppet in the pit, drawn in code after the film's design. Origin at the head centre.
function drawBoss(level,t){
  const s=game.state,B=GEO.boss,top=Core.headTop(level),u=t-vis.jolt,jolt=u>=0&&u<0.32?Math.sin(Math.PI*u/0.32)*70*vis.joltK:0;
  let rot=0;const su=t-vis.spinT;if(su>=0&&su<0.6)rot=-Math.PI*2*ease(su/0.6);else if(u>=0&&u<0.6)rot=-0.8*Math.sin(Math.PI*W01(u,0,0.6));
  const laugh=t-vis.laughT<0.9?Math.sin((t-vis.laughT)*30)*6:0,sway=Math.sin(clock*2.2)*0.04;
  const cx=B.x,cy=top+52-jolt+laugh;
  const arms={};
  ctx.save();ctx.beginPath();ctx.rect(-400,-2000,1880,GEO.panelTop+2000);ctx.clip();
  // the rod that holds it up from the bottom of the pit
  ctx.strokeStyle='#2c2a2c';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(cx+4,cy+300);ctx.lineTo(cx+6,GEO.panelBottom+40);ctx.stroke();
  ctx.save();ctx.translate(cx,cy);ctx.rotate(rot+sway);ctx.translate(-cx,-cy);
  // arms first behind the robe? the sleeves read better in front; draw the robe, then arms
  ctx.lineJoin='round';
  // robe
  ctx.fillStyle='#f2efe8';ctx.strokeStyle='#222';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(cx-80,cy+60);ctx.lineTo(cx+80,cy+60);ctx.lineTo(cx+124,cy+340);ctx.lineTo(cx-124,cy+340);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle='rgba(40,40,44,.4)';ctx.lineWidth=2;for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(cx+i*22,cy+200);ctx.lineTo(cx+i*33,cy+336);ctx.stroke();}
  ctx.fillStyle='#1b1b1d';ctx.beginPath();ctx.moveTo(cx-20,cy+60);ctx.lineTo(cx,cy+128);ctx.lineTo(cx+20,cy+60);ctx.closePath();ctx.fill();
  ctx.fillRect(cx-88,cy+178,176,24);
  // stiff shoulder pieces
  for(const d of [-1,1]){ctx.fillStyle='#f7f4ee';ctx.strokeStyle='#222';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(cx+d*28,cy+56);ctx.lineTo(cx+d*130,cy+32);ctx.lineTo(cx+d*120,cy+82);ctx.lineTo(cx+d*60,cy+100);ctx.closePath();ctx.fill();ctx.stroke();}
  // head
  const face=t<vis.faceUntil?vis.face:(s.tired&&s.phase==='wave'?'tired':'grin');
  ctx.fillStyle='#141416';ctx.beginPath();ctx.arc(cx,cy,52,0,6.283);ctx.fill();
  ctx.fillStyle='#f2efe8';ctx.strokeStyle='#222';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx-56,cy-20);ctx.quadraticCurveTo(cx,cy-80,cx+56,cy-20);ctx.lineTo(cx+56,cy-34);ctx.quadraticCurveTo(cx,cy-100,cx-56,cy-34);ctx.closePath();ctx.fill();ctx.stroke();
  drawFace(cx,cy,face,t);
  ctx.restore();
  // arms (outside the body rotation so the rods stay readable)
  for(const arm of ['L','R']){
    const st=Core.armState(s,arm,t);let line;
    if(st){line=Core.armLine(level,arm,st.lane,st.reach,st.cock,st.minRod);}
    else{const sh=Core.shoulder(level,arm),ang=Math.PI/2+(arm==='L'?0.55:-0.55)+Math.sin(clock*2+(arm==='L'?0:1))*0.08;
      line={sx:sh.x,sy:sh.y,hx:sh.x+Math.cos(ang)*B.sleeve,hy:sh.y+Math.sin(ang)*B.sleeve,tx:sh.x+Math.cos(ang)*(B.sleeve+200),ty:sh.y+Math.sin(ang)*(B.sleeve+200),ang};}
    const dy=-jolt+laugh;line={...line,sy:line.sy+dy,hy:line.hy+dy,ty:line.ty+(st&&st.reach>=0.99?0:dy)};
    arms[arm]={line,st};
    drawArm(line,st,t);
  }
  ctx.restore();
  return{cx,cy,arms};
}
function drawFace(cx,cy,face,t){
  ctx.lineCap='round';
  if(face==='ouch'||face==='dizzy'){
    ctx.strokeStyle='#f2efe8';ctx.lineWidth=6;
    for(const d of [-1,1]){const x=cx+d*22,y=cy-4;
      if(face==='ouch'){ctx.beginPath();ctx.moveTo(x-9,y-9);ctx.lineTo(x+9,y+9);ctx.moveTo(x+9,y-9);ctx.lineTo(x-9,y+9);ctx.stroke();}
      else{ctx.beginPath();for(let a=0;a<12;a+=0.4){const r=a*1.1;ctx.lineTo(x+Math.cos(a+t*10)*r,y+Math.sin(a+t*10)*r);}ctx.stroke();}}
    ctx.fillStyle='#f2efe8';ctx.beginPath();ctx.ellipse(cx,cy+28,12,15,0,0,6.283);ctx.fill();return;
  }
  // brows
  ctx.strokeStyle='#f2efe8';ctx.lineWidth=7;
  const lift=face==='laugh'?-6:face==='tired'?6:0;
  ctx.beginPath();ctx.moveTo(cx-40,cy-20+lift);ctx.quadraticCurveTo(cx-24,cy-34+lift,cx-8,cy-18);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+40,cy-20+lift);ctx.quadraticCurveTo(cx+24,cy-34+lift,cx+8,cy-18);ctx.stroke();
  // eyes
  ctx.fillStyle='#e0202a';
  if(face==='laugh'){ctx.strokeStyle='#e0202a';ctx.lineWidth=6;for(const d of [-1,1]){ctx.beginPath();ctx.moveTo(cx+d*36,cy-2);ctx.quadraticCurveTo(cx+d*22,cy-16,cx+d*8,cy-2);ctx.stroke();}}
  else if(face==='tired'){ctx.fillRect(cx-36,cy-4,26,6);ctx.fillRect(cx+10,cy-4,26,6);}
  else{for(const d of [-1,1]){if(face==='wink'&&d>0){ctx.strokeStyle='#e0202a';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cx+10,cy-2);ctx.lineTo(cx+34,cy-2);ctx.stroke();continue;}
    ctx.beginPath();ctx.moveTo(cx+d*36,cy-8);ctx.lineTo(cx+d*8,cy);ctx.lineTo(cx+d*36,cy+6);ctx.closePath();ctx.fill();}}
  // mouth: a wide toothy grin; open when laughing; tongue out when winking or tired
  ctx.fillStyle='#f2efe8';
  if(face==='laugh'){ctx.beginPath();ctx.moveTo(cx-30,cy+20);ctx.quadraticCurveTo(cx,cy+56,cx+30,cy+20);ctx.closePath();ctx.fill();ctx.fillStyle='#b8262a';ctx.beginPath();ctx.ellipse(cx,cy+36,12,7,0,0,6.283);ctx.fill();}
  else{ctx.beginPath();ctx.moveTo(cx-30,cy+22);ctx.quadraticCurveTo(cx,cy+40,cx+30,cy+22);ctx.lineTo(cx+26,cy+30);ctx.quadraticCurveTo(cx,cy+46,cx-26,cy+30);ctx.closePath();ctx.fill();
    ctx.fillStyle='#141416';for(let i=-2;i<=2;i++)ctx.fillRect(cx+i*11-1,cy+26,2,10);
    ctx.fillStyle='#f2efe8';for(const d of [-1,1]){ctx.beginPath();ctx.moveTo(cx+d*16,cy+30);ctx.lineTo(cx+d*12,cy+44);ctx.lineTo(cx+d*8,cy+30);ctx.closePath();ctx.fill();}
    if(face==='wink'||face==='tired'){ctx.fillStyle='#d8505a';ctx.beginPath();ctx.ellipse(cx+4,cy+46,9,12,0.2,0,6.283);ctx.fill();}}
  if(face==='tired'){ctx.fillStyle='rgba(150,200,255,0.85)';const k=(t*1.5)%1;ctx.beginPath();ctx.ellipse(cx+58,cy-20+k*40,6,9,0,0,6.283);ctx.fill();}
}
function drawArm(l,st,t){
  const puff=st?st.puff:0,glow=st?st.glow:0,wob=puff>0?Math.sin(t*40)*4*puff:0;
  // the iron rod: dark, or lit white-gold when it is about to strike (铁枝发亮)
  if(glow>0){const pulse=0.75+0.25*Math.sin(t*38);ctx.save();ctx.lineCap='round';ctx.strokeStyle='rgba(255,214,110,'+0.42*pulse+')';ctx.lineWidth=40;ctx.beginPath();ctx.moveTo(l.hx,l.hy);ctx.lineTo(l.tx,l.ty);ctx.stroke();
    ctx.strokeStyle='rgba(255,240,190,'+0.8*pulse+')';ctx.lineWidth=22;ctx.stroke();ctx.restore();}
  ctx.save();ctx.lineCap='round';ctx.strokeStyle=glow>0?COLOR.rodLit:'#3a383b';ctx.lineWidth=glow>0?13:10;ctx.beginPath();ctx.moveTo(l.hx,l.hy);ctx.lineTo(l.tx,l.ty);ctx.stroke();
  // spear tip
  const a=Math.atan2(l.ty-l.hy,l.tx-l.hx);ctx.translate(l.tx,l.ty);ctx.rotate(a);ctx.fillStyle=glow>0?'#fffbe8':'#c9ccd2';ctx.strokeStyle='#222';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(26,0);ctx.lineTo(0,12);ctx.lineTo(-10,0);ctx.lineTo(0,-12);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  // the white sleeve, puffing up before a strike (袖子鼓起)
  ctx.save();ctx.translate(l.sx,l.sy);ctx.rotate(l.ang-Math.PI/2);
  const w=44*(1+0.75*puff)+wob,len=150*(1+0.08*puff);
  ctx.fillStyle=puff>0?'#fff6e6':'#ece8e0';ctx.strokeStyle=puff>0.5?COLOR.pre:'#2a2a2a';ctx.lineWidth=puff>0.5?5:2.5;
  rr(-w/2,-14,w,len+14,w*0.42);ctx.fill();ctx.stroke();
  ctx.fillStyle='#d9cbb4';ctx.strokeStyle='#2a2a2a';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,len,19,17,0,0,6.283);ctx.fill();ctx.stroke();
  ctx.restore();
}

// Lane telegraph: a shaft of light from the valance down onto the threatened puppet (amber while a sleeve swells,
// white-gold while the rod is lit), drawn behind the puppet; the target ring is drawn in front of it.
function drawLaneLight(lane,th,t){
  const G=GEO.lanes[lane];if(th.kind==='none')return;
  const lit=th.kind==='lit',a=lit?0.42+0.18*Math.sin(t*30):0.26;
  ctx.save();const g=ctx.createLinearGradient(0,600,0,G.foot);
  g.addColorStop(0,lit?'rgba(255,244,200,0)':'rgba(255,150,70,0)');g.addColorStop(0.55,lit?'rgba(255,240,180,'+a*0.6+')':'rgba(255,150,70,'+a*0.6+')');g.addColorStop(1,lit?'rgba(255,240,180,'+a+')':'rgba(255,150,70,'+a+')');
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(G.x-50,600);ctx.lineTo(G.x+50,600);ctx.lineTo(G.x+150,G.foot);ctx.lineTo(G.x-150,G.foot);ctx.closePath();ctx.fill();
  ctx.fillStyle=lit?'rgba(255,240,180,'+a+')':'rgba(255,150,70,'+a+')';ctx.beginPath();ctx.ellipse(G.x,G.foot-2,165,30,0,0,6.283);ctx.fill();
  ctx.restore();
}
function drawTargetRing(lane,th,t){
  if(th.kind!=='lit')return;const c=Core.contact(lane),k=clamp(th.k,0,1);
  ctx.save();ctx.strokeStyle='rgba(255,245,200,'+(0.7+0.3*Math.sin(t*30))+')';ctx.lineWidth=7;ctx.setLineDash([22,14]);ctx.lineDashOffset=-t*120;
  ctx.beginPath();ctx.arc(c.x,c.y,lerp(96,60,k),0,6.283);ctx.stroke();ctx.restore();
}
function drawGong(t){
  const s=game&&game.state,full=s&&s.meter>=CFG.meter&&s.phase==='wave',g=GEO.gong,im=img.gong,k=g.r/92;
  if(full){const p=0.6+0.4*Math.sin(t*9);ctx.save();ctx.globalCompositeOperation='lighter';const gr=ctx.createRadialGradient(g.x,g.y,g.r*0.5,g.x,g.y,g.r*2.2);gr.addColorStop(0,'rgba(255,200,90,'+0.55*p+')');gr.addColorStop(1,'rgba(255,200,90,0)');ctx.fillStyle=gr;ctx.fillRect(g.x-g.r*2.3,g.y-g.r*2.3,g.r*4.6,g.r*4.6);ctx.restore();}
  if(ok(im))ctx.drawImage(im,g.x-127*k,g.y-158*k,254*k,316*k);
  // the 锣鼓槽: lamps on the front panel either side of the gong, filling from the outside in
  const n=CFG.meter,m=s?s.meter:0,half=n/2;
  for(let i=0;i<n;i++){const side=i<half?-1:1,j=i<half?i:n-1-i,x=g.x+side*(330-j*46),y=1556;
    const on=i<half?i<Math.ceil(m/2):n-1-i<Math.floor(m/2);
    ctx.fillStyle=on?(full?COLOR.gold:COLOR.amber):'rgba(40,24,14,0.9)';ctx.strokeStyle='rgba(255,220,160,0.8)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,15,0,6.283);ctx.fill();ctx.stroke();}
}
function drawPads(t){
  const s=game.state;
  for(const p of L.pads){
    const th=s.phase==='wave'?game.threat(p.lane):{kind:'none'},lit=th.kind==='lit',pre=th.kind==='pre',col=p.player<0?COLOR.cream:p.player?COLOR.son:COLOR.dad;
    ctx.save();rr(p.x,p.y,p.w,p.h,26);ctx.fillStyle=lit?'rgba(255,236,170,'+(0.42+0.2*Math.sin(t*30))+')':pre?'rgba(255,140,60,0.22)':'rgba(30,16,8,0.62)';ctx.fill();
    ctx.lineWidth=lit?7:3;ctx.strokeStyle=lit?COLOR.rodLit:pre?COLOR.pre:'rgba(246,236,216,0.35)';ctx.stroke();ctx.restore();
    const cx=p.x+p.w/2,cy=p.y+Math.min(p.h/2,90);
    if(p.player>=0)text(NAMES[p.player],cx,cy-24,32,col,'center',900,'pad');
    text(['左','中','右'][p.lane]+' · '+PUPPET[p.lane],cx,p.player>=0?cy+20:cy,p.w<200?28:36,COLOR.cream,'center',800,'pad');
  }
}
function drawHud(t){
  const s=game.state,v=L.vis,land=L.land;
  // the climb gauge: 乐池 at one end, 台口 at the other, the boss's head where it is now
  const gx0=land?v.x0+30:40,gx1=land?-30:1040,gy=land?v.y0+210:150,t0=gx0+96,t1=gx1-96;
  ctx.fillStyle='rgba(20,10,6,0.78)';rr(gx0,gy-30,gx1-gx0,60,28);ctx.fill();
  text('乐池',gx0+16,gy,28,COLOR.cream,'left',800,'hud');text('台口',gx1-16,gy,28,'#ff8080','right',800,'hud');
  for(let i=0;i<=CFG.top;i++){const x=lerp(t0,t1,i/CFG.top);ctx.fillStyle=i>=8?'#ff4d4d':'rgba(246,236,216,0.5)';ctx.fillRect(x-2,gy-12,4,24);}
  const lx=lerp(t0,t1,clamp(vis.level,0,CFG.top)/CFG.top);
  ctx.fillStyle='#141416';ctx.beginPath();ctx.arc(lx,gy,21,0,6.283);ctx.fill();ctx.fillStyle='#e0202a';ctx.fillRect(lx-13,gy-2,9,5);ctx.fillRect(lx+4,gy-2,9,5);
  ctx.fillStyle='#f2efe8';ctx.fillRect(lx-21,gy-21,42,7);
  const w=s.phase==='interlude'||s.phase==='sink'?'换场 · 牛肉丸':'第'+'一二三'[Math.min(2,s.wave)]+'波 · '+CFG.waves[Math.min(2,s.wave)].name;
  if(mode==='duo'){
    text(NAMES[0]+' '+s.score[0],land?v.x0+30:40,land?v.y0+70:66,44,COLOR.dad,'left',900,'hud');
    text(NAMES[1]+' '+s.score[1],land?v.x1-30:1040,land?v.y0+70:66,44,COLOR.son,'right',900,'hud');
    text(land?w:w.split(' · ')[0],land?v.x1-30:540,land?v.y0+130:66,32,COLOR.gold,land?'right':'center',800,'hud');
  }else{
    text(String(s.score[0]),land?v.x0+30:40,land?v.y0+70:66,56,COLOR.cream,'left',900,'hud');
    text(w,land?v.x1-30:1040,land?v.y0+70:66,36,COLOR.gold,'right',800,'hud');
  }
}
// banners sit in the upper stage, above the puppets' heads; the boss talks inside the pit, below the stage floor
function drawCaptions(t,boss){
  const b=fx.banner;
  if(b){const a=Math.min(1,b.t*5,(b.dur-b.t)*3),y=b.low?1326:612;ctx.save();ctx.globalAlpha=a;ctx.fillStyle='rgba(18,8,4,0.72)';rr(150,y,780,168,24);ctx.fill();
    text(b.title,540,y+56,64,COLOR.gold,'center',900,'banner');text(b.hint,540,y+126,b.hint.length>16?30:34,COLOR.cream,'center',800,'banner');ctx.restore();}
  const sp=fx.speech;
  if(sp&&boss){const a=Math.min(1,sp.t*6,(sp.dur-sp.t)*4),right=boss.cx<540?1:-1;
    const x=boss.cx+190*(boss.cx>=540?1:-1),y=clamp(boss.cy,GEO.pitTop+80,GEO.panelTop-34);
    ctx.save();ctx.globalAlpha=a;ctx.font='900 36px '+FONT;const w=ctx.measureText(sp.text).width+40;
    ctx.fillStyle='rgba(246,236,216,0.95)';rr(x-w/2,y-30,w,60,26);ctx.fill();ctx.beginPath();ctx.moveTo(x-(x>boss.cx?w/2-6:-w/2+6),y-8);ctx.lineTo(boss.cx+(x>boss.cx?60:-60),y+4);ctx.lineTo(x-(x>boss.cx?w/2-6:-w/2+6),y+14);ctx.fill();
    ctx.fillStyle='#2a160a';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(sp.text,x,y);frameText.push({tag:'speech',text:sp.text,x:x-w/2,y:y-30,w,h:60});ctx.restore();}
  if(fx.big){const k=fx.big.t,a=Math.min(1,k*8,(1.2-k)*3);ctx.save();ctx.globalAlpha=a;text(fx.big.text,540,520,96*(1+0.2*Math.max(0,0.2-k)*5),COLOR.gold,'center',900,'banner');ctx.restore();}
}
function drawBall(t){
  const s=game.state,b=s.ball;if(!b||!ok(img.ball))return;
  let p;
  if(b.smack){const u=t-b.smack.t;if(u>0.9)return;const k=u/0.9;
    p=b.smack.bonk?{x:lerp(b.smack.x,540,k),y:(1-k)*(1-k)*b.smack.y+2*k*(1-k)*(b.smack.y-420)+k*k*(GEO.pitTop+60)}:{x:b.smack.x+(b.smack.x<540?-1:1)*900*k,y:b.smack.y-700*k+500*k*k};}
  else p=Core.ballAt(b.keys,t-b.t0);
  if(!p)return;const r=GEO.ball.r;ctx.drawImage(img.ball,p.x-r,p.y-r,r*2,r*2);
}
function drawFaceCards(T){
  // 画脸: a face card over each puppet, painted stroke by stroke (stroke order after the film's 脸谱 card)
  const strokes=[
    ['#16110d',16,[[-0.62,-0.28],[-0.4,-0.42],[-0.12,-0.3]]],['#16110d',16,[[0.62,-0.28],[0.4,-0.42],[0.12,-0.3]]],
    ['#16110d',26,[[-0.5,-0.12],[-0.3,-0.18],[-0.12,-0.08],[-0.3,0.02],[-0.5,-0.06]]],['#16110d',26,[[0.5,-0.12],[0.3,-0.18],[0.12,-0.08],[0.3,0.02],[0.5,-0.06]]],
    ['#16110d',10,[[-0.08,0.12],[0,0.22],[0.08,0.12]]],['#16110d',12,[[-0.24,0.42],[0,0.36],[0.24,0.42]]],
    ['#c8262c',22,[[-0.72,0.12],[-0.56,0.36],[-0.3,0.5]]],['#c8262c',22,[[0.72,0.12],[0.56,0.36],[0.3,0.5]]],
    ['#c8262c',18,[[0,-0.2],[-0.06,-0.48],[0,-0.78],[0.06,-0.48],[0,-0.2]]],
    ['#f4f0e6',7,[[-0.5,-0.5],[-0.3,-0.6],[-0.12,-0.52]]],['#f4f0e6',7,[[0.5,-0.5],[0.3,-0.6],[0.12,-0.52]]],
    ['#2f5a9a',8,[[-0.36,-0.7],[-0.2,-0.86],[-0.06,-0.92]]],['#2f5a9a',8,[[0.36,-0.7],[0.2,-0.86],[0.06,-0.92]]]];
  for(let i=0;i<3;i++){
    const t0=1.7+i*0.25,k=W01(T,t0,t0+0.3);if(k<=0)continue;
    const G=GEO.lanes[i],cx=G.x,cy=812-18*Math.sin(Math.PI*k),sc=78*ease(k),prog=W01(T,t0+0.2,t0+2.2)*strokes.length;
    ctx.save();ctx.fillStyle='#efe2c8';ctx.strokeStyle='#3a2a1a';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(cx,cy,sc*0.9,sc*1.12,0,0,6.283);ctx.fill();ctx.stroke();
    ctx.lineCap='round';ctx.lineJoin='round';
    for(let j=0;j<strokes.length&&j<prog;j++){const [col,w,pts]=strokes[j],fr=Math.min(1,prog-j),n=pts.length-1,upto=fr*n;
      ctx.strokeStyle=col;ctx.lineWidth=w*sc/150*1.4;ctx.beginPath();ctx.moveTo(cx+pts[0][0]*sc,cy+pts[0][1]*sc);
      for(let q=1;q<=n;q++){const f=Math.min(1,upto-(q-1));if(f<=0)break;const [x0,y0]=pts[q-1],[x1,y1]=pts[q];ctx.lineTo(cx+lerp(x0,x1,f)*sc,cy+lerp(y0,y1,f)*sc);}ctx.stroke();}
    frameText.push({tag:'card',text:'face',x:cx-sc*0.9,y:cy-sc*1.12,w:sc*1.8,h:sc*2.24});
    ctx.restore();
  }
}
function drawBatonCard(T){
  const k=W01(T,4.4,4.8);if(k<=0)return;
  ctx.save();ctx.globalAlpha=Math.min(1,k*2);const sc=1+0.25*(1-ease(k));ctx.translate(540,470);ctx.scale(sc,sc);ctx.rotate(-0.04);
  ctx.fillStyle='#f3e4c4';rr(-300,-130,600,260,18);ctx.fill();ctx.strokeStyle='#b8262a';ctx.lineWidth=10;ctx.stroke();
  ctx.fillStyle='#b8262a';rr(-276,-108,148,148,10);ctx.fill();ctx.fillStyle='#f3e4c4';ctx.font='900 64px '+FONT;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('英',-238,-68);ctx.fillText('歌',-166,-68+0);
  ctx.fillStyle='#1b120c';ctx.font='900 170px '+FONT;ctx.fillText('接棒',60,-10);
  ctx.font='800 34px '+FONT;ctx.fillStyle='#5a3a24';ctx.fillText(mode==='duo'?'阿爸 → 心远 · 一棒传一棒':'普宁 · 甲子 · 潮阳凤岗 · 一棒传一棒',0,96);
  ctx.restore();frameText.push({tag:'banner',text:'接棒',x:240,y:340,w:600,h:260});
}

function drawStage(t){
  const s=game?game.state:null;
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=COLOR.ink;ctx.fillRect(0,0,cw,ch);
  const sh=fx.shake>0?fx.shake*0.6:0;
  ctx.setTransform(L.scale,0,0,L.scale,L.ox+(Math.random()-0.5)*sh*L.scale,L.oy+(Math.random()-0.5)*sh*L.scale);
  // fill the space around the frame: a warm dark gradient, so tall phones are filled top to bottom
  const v=L.vis,g=ctx.createLinearGradient(0,v.y0,0,v.y1);g.addColorStop(0,'#1d0f08');g.addColorStop(0.5,'#140a06');g.addColorStop(1,'#0c0604');ctx.fillStyle=g;ctx.fillRect(v.x0,v.y0,v.x1-v.x0,v.y1-v.y0);
  if(ok(img['stage-back']))ctx.drawImage(img['stage-back'],0,200,1080,1300);
  return s;
}
const boxes={puppets:[],boss:null};
function drawPlay(t,bare){
  const s=drawStage(t);frameText=[];boxes.puppets=[];
  const th=[0,1,2].map(i=>s.phase==='wave'?game.threat(i):{kind:'none'});
  for(let i=0;i<3;i++)drawLaneLight(i,th[i],t);
  for(const i of [1,0,2]){const r=drawPuppet(i,puppetPose(i,s.t));boxes.puppets[i]=r;}
  for(let i=0;i<3;i++)drawTargetRing(i,th[i],t);
  // stars over puppets that are down or dizzy
  for(let i=0;i<3;i++){const p=s.puppets[i];if(s.t<p.downUntil||s.t<p.dizzyUntil){const G=GEO.lanes[i],down=s.t<p.downUntil,cx=G.x+(down?(i===2?150:-150):0),cy=down?G.foot-G.h*0.62:G.foot-G.h-20;
    for(let k=0;k<3;k++){const a=clock*5+k*2.09;ctx.fillStyle=COLOR.gold;star(cx+Math.cos(a)*44,cy+Math.sin(a)*14,12);}}}
  const boss=drawBoss(vis.level,s.t);boxes.boss=boss;
  // 台板: the board slides over the pit when it is beaten back for good
  if(vis.board>0){const x=lerp(1090,112,vis.board);ctx.fillStyle='#7a4a26';ctx.fillRect(x,GEO.pitTop,856,GEO.panelTop-GEO.pitTop);ctx.strokeStyle='#4a2a12';ctx.lineWidth=4;
    for(let y=GEO.pitTop+30;y<GEO.panelTop;y+=36){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+856,y);ctx.stroke();}ctx.fillStyle='#c99a5b';ctx.fillRect(x,GEO.pitTop,856,10);}
  if(ok(img['stage-front']))ctx.drawImage(img['stage-front'],0,GEO.panelTop,1080,109);
  drawBall(s.t);
  drawGong(t);
  // effects
  for(const r of fx.rings){const k=r.t/0.45;ctx.strokeStyle=r.color;ctx.globalAlpha=1-k;ctx.lineWidth=8*(1-k)+2;ctx.beginPath();ctx.arc(r.x,r.y,lerp(r.r0,r.r1,ease(k)),0,6.283);ctx.stroke();}ctx.globalAlpha=1;
  ctx.lineCap='round';for(const p of fx.sparks){const k=1-p.t/p.life,sp=Math.hypot(p.vx,p.vy)||1;ctx.strokeStyle='rgba(255,'+(200+55*k|0)+','+(120*k|0)+','+k+')';ctx.lineWidth=5*k+1;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx/sp*p.len,p.y-p.vy/sp*p.len);ctx.stroke();}
  for(const p of fx.dust){const k=1-p.t/p.life;ctx.fillStyle='rgba(200,170,130,'+0.45*k+')';ctx.beginPath();ctx.arc(p.x,p.y,p.r*(1.5-k*0.5),0,6.283);ctx.fill();}
  for(const p of fx.pops){ctx.save();ctx.globalAlpha=Math.max(0,1-p.t/0.85);text(p.text,clamp(p.x,140,940),p.y,p.size,p.color,'center',900,'pop');ctx.restore();}
  if(s.phase==='won'){drawFaceCards(s.phaseT);drawBatonCard(s.phaseT);}
  if(!bare){drawPads(t);drawHud(t);drawCaptions(t,boss);}
}
function star(x,y,r){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr0=i%2?r*0.45:r;ctx.lineTo(x+Math.cos(a)*rr0,y+Math.sin(a)*rr0);}ctx.closePath();ctx.fill();}

function drawTitle(t){
  drawStage(t);frameText=[];
  const v=L.vis;ctx.fillStyle='rgba(12,6,3,0.45)';ctx.fillRect(v.x0,v.y0,v.x1-v.x0,v.y1-v.y0);
  // the three puppets on the stage and the boss peeking out of the pit
  const saveGame=game;game=titleGame;if(!vis)vis=freshVis();
  for(const i of [1,0,2])drawPuppet(i,{aL:0.35+Math.sin(t*3+i)*0.15,aR:-0.35-Math.sin(t*3+i)*0.15,bob:6*Math.abs(Math.sin(t*3+i))});
  vis.level=3.2+Math.sin(t*1.4)*0.4;vis.faceUntil=0;drawBoss(vis.level,t);
  if(ok(img['stage-front']))ctx.drawImage(img['stage-front'],0,GEO.panelTop,1080,109);
  game=saveGame;
  ctx.save();ctx.translate(540,470);ctx.rotate(-0.03);ctx.fillStyle='#f3e4c4';rr(-330,-140,660,280,20);ctx.fill();ctx.strokeStyle='#b8262a';ctx.lineWidth=10;ctx.stroke();
  ctx.fillStyle='#1b120c';ctx.font='900 150px '+FONT;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('打回乐池',0,-24);
  ctx.font='800 34px '+FONT;ctx.fillStyle='#b8262a';ctx.fillText('英歌小戏台 · 三个纸偶守戏台',0,90);ctx.restore();
  text('白衣木偶从乐池往上爬',540,700,40,COLOR.cream,'center',800,'banner');
  text('袖子鼓起看哪一道，铁枝一亮就点那一道',540,756,34,COLOR.cream,'center',800,'banner');
  for(const b of modeBoxes()){const on=mode===b.mode;ctx.save();rr(b.x,b.y,b.w,b.h,30);ctx.fillStyle=on?COLOR.gold:'rgba(30,16,8,0.8)';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle=COLOR.gold;ctx.stroke();ctx.restore();
    text(b.mode==='solo'?'单人':'双人',b.x+b.w/2,b.y+b.h/2,44,on?'#1b120c':COLOR.gold,'center',900,'ui');}
  text(mode==='duo'?'同一台手机：阿爸管左半边，心远管右半边':'一个人管三道，两只手一起上',540,1700,mode==='duo'?32:34,COLOR.cream,'center',800,'banner');
  if(mode==='duo')text('中间那道谁先点算谁的',540,1746,30,COLOR.cream,'center',800,'banner');
  ctx.save();ctx.globalAlpha=0.6+0.4*Math.sin(t*4);text('点一下开始',540,1610,58,COLOR.gold,'center',900,'ui');ctx.restore();
}
function drawResult(t){
  const s=game.state,r=s.result,k=ease(Math.min(1,resultT*3)),v=L.vis;
  drawPlay(t,true);
  // dim everything except a window on the three puppets, which stay in view
  ctx.fillStyle='rgba(12,6,3,'+0.74*k+')';ctx.fillRect(v.x0,v.y0,v.x1-v.x0,860-v.y0);ctx.fillRect(v.x0,1290,v.x1-v.x0,v.y1-1290);
  ctx.fillRect(v.x0,860,186-v.x0,430);ctx.fillRect(894,860,v.x1-894,430);
  ctx.save();ctx.globalAlpha=k;
  const win=r.outcome==='win';
  text(win?'打回乐池了！':'台被占了',540,250,96,win?COLOR.gold:COLOR.cream,'center',900,'result');
  text(win?'台板盖上，今晚戏台是三个纸偶的':'差一点就打回去了，再来一局',540,338,36,COLOR.cream,'center',800,'result');
  if(mode==='duo'){
    text(NAMES[0]+' '+r.score[0]+' 分',300,470,58,COLOR.dad,'center',900,'result');text(NAMES[1]+' '+r.score[1]+' 分',780,470,58,COLOR.son,'center',900,'result');
    text('出槌 '+r.hits[0]+' 次 · 妙 '+r.perfects[0],300,540,30,COLOR.cream,'center',700,'result');text('出槌 '+r.hits[1]+' 次 · 妙 '+r.perfects[1],780,540,30,COLOR.cream,'center',700,'result');
  }else{
    if(r.total>=best&&r.total>0)text('新纪录',540,410,34,COLOR.gold,'center',900,'result');
    text(r.total+' 分',540,488,110,COLOR.amber,'center',900,'result');
    text('出槌 '+r.hits[0]+' 次 · 妙 '+r.perfects[0]+' · 被拍倒 '+r.misses+' 次',540,576,34,COLOR.cream,'center',700,'result');
  }
  text('大英歌 '+(r.gongs[0]+r.gongs[1])+' 次 · 牛肉丸 '+(r.balls[0]+r.balls[1])+' 个 · 最长连对 '+r.bestStreak,540,630,32,COLOR.cream,'center',700,'result');
  ctx.fillStyle='rgba(243,228,196,0.96)';rr(110,1320,860,250,18);ctx.fill();
  ctx.fillStyle='#2a160a';ctx.font='800 34px '+FONT;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('舞剧《英歌》的演员跟普宁、甲子、',540,1382);ctx.fillText('潮阳凤岗三支英歌队学过',540,1430);
  ctx.font='700 26px '+FONT;ctx.fillStyle='#7a5a3a';ctx.fillText('——羊城晚报 2024-11-11',540,1480);
  ctx.font='800 28px '+FONT;ctx.fillStyle='#b8262a';ctx.fillText('粉丝向，画面全部自制',540,1530);
  frameText.push({tag:'result',text:'credit',x:110,y:1320,w:860,h:250});
  if(resultT>1.2){ctx.globalAlpha=k*(0.6+0.4*Math.sin(t*4));text('点一下再来一局',540,1700,54,COLOR.gold,'center',900,'ui');}
  ctx.restore();
}
function drawMute(){
  if(screen==='play')return;const m=muteBox();ctx.fillStyle='rgba(20,10,6,0.7)';rr(m.x,m.y,m.w,m.h,22);ctx.fill();
  text(muted?'声音：关':'声音：开',m.x+m.w/2,m.y+m.h/2,28,COLOR.cream,'center',800,'ui');
}
function draw(){
  const t=clock;
  if(screen==='title')drawTitle(t);else if(screen==='result')drawResult(t);else if(game)drawPlay(t);
  drawMute();
  if(fx.flash>0){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgba(255,210,120,'+fx.flash*0.5+')';ctx.fillRect(0,0,cw,ch);}
}

// ---------- loop, hooks, fixed views ----------
const metrics={frames:0,fps:0,maxFrameMs:0,avgFrameMs:0};
let lastNow=0,acc=0,windowStart=0,windowFrames=0,windowMax=0,windowSum=0;
function frame(now){
  requestAnimationFrame(frame);
  const elapsed=lastNow?Math.min(0.1,(now-lastNow)/1000):0;lastNow=now;
  if(!frozen){acc+=elapsed;while(acc>=STEP){tick(STEP);acc-=STEP;}}
  const t0=performance.now();draw();const cost=performance.now()-t0;
  metrics.frames++;windowFrames++;windowSum+=cost;if(cost>windowMax)windowMax=cost;
  if(now-windowStart>=1000){metrics.fps=Math.round(windowFrames*1000/(now-windowStart));metrics.maxFrameMs=+windowMax.toFixed(2);metrics.avgFrameMs=+(windowSum/windowFrames).toFixed(2);windowStart=now;windowFrames=0;windowMax=0;windowSum=0;}
}
function advance(seconds){const n=Math.round(seconds/STEP);for(let i=0;i<n;i++)tick(STEP);}
// run the real game with its autopilot until a condition holds (checked every step), at most `limit` seconds
function runUntil(cond,limit){const n=Math.round(limit/STEP);for(let i=0;i<n;i++){tick(STEP);if(cond(game.state))return true;}return false;}
const lit=s=>[0,1,2].filter(i=>game.threat(i).kind==='lit'&&game.threat(i).k>=0.35&&game.threat(i).k<=0.5);
const VIEWS={
  hero:{seed:4,pilot:'human',until:s=>s.phase==='wave'&&s.wave===0&&s.t>9&&lit(s).length===1},
  feint:{seed:4,pilot:'precise',until:s=>s.phase==='wave'&&s.wave===1&&[0,1,2].some(i=>{const th=game.threat(i);return th.kind==='fake'&&th.k>0.7;})},
  stress:{seed:6,pilot:'human',until:s=>s.phase==='wave'&&s.wave===2&&lit(s).length===2&&s.puppets.some(p=>s.t<p.downUntil)},
  duo:{seed:4,mode:'duo',pilot:'human',until:s=>s.phase==='wave'&&s.wave===0&&s.t>9&&lit(s).length===1},
  ball:{seed:4,pilot:'precise',until:s=>s.phase==='interlude'&&s.phaseT>1.4},
  win:{seed:4,pilot:'precise',until:s=>s.phase==='won'&&s.phaseT>5.6},
  result:{seed:4,pilot:'precise',until:s=>s.phase==='over'||screen==='result',after:1.6},
  lose:{seed:4,pilot:null,until:s=>s.phase==='lost'&&s.phaseT>1.2}
};
function laneBoxCss(i){const b=boxes.puppets[i]&&boxes.puppets[i].box;if(!b)return null;const a=toCss(b.x0,b.y0),c=toCss(b.x1,b.y1);return{x:a.x,y:a.y,w:c.x-a.x,h:c.y-a.y};}
const hook=window.__yingge={ready:false,metrics,log,
  start(seed,m){start(seed,m);return hook;},
  autopilot(level,seed){pilot=level?Core.pilot(level,seed==null?1:seed):null;return hook;},
  sound(){audio();return hook;},advance(seconds){advance(seconds);return hook;},freeze(on){frozen=on!==false;return hook;},
  runUntil(name){const v=VIEWS[name];return runUntil(v.until,200);},
  render(){draw();return hook;},
  toCss(x,y){return toCss(x,y);},
  tap(lane,player){return game?game.tap(lane,player||0):null;},gong(player){return game?game.gong(player||0):null;},
  probe(){
    const s=game&&game.state,cssBox=r=>{const a=toCss(r.x,r.y),c=toCss(r.x+r.w,r.y+r.h);return{tag:r.tag,text:r.text,x:a.x,y:a.y,w:c.x-a.x,h:c.y-a.y};};
    const arms=boxes.boss&&boxes.boss.arms?Object.fromEntries(Object.entries(boxes.boss.arms).map(([k,a])=>{const h=toCss(a.line.hx,a.line.hy),tp=toCss(a.line.tx,a.line.ty);return[k,{lit:!!(a.st&&a.st.glow),lane:a.st?a.st.lane:null,hand:h,tip:tp}];})):null;
    const panel=toCss(0,GEO.panelTop).y;
    return{screen,mode,frozen,dpr,canvas:[cw,ch],css:[innerWidth,innerHeight],land:L.land,scale:L.scale,
      assets:Object.fromEntries(Object.keys(img).map(k=>[k,ok(img[k])])),
      pads:L.pads.map(p=>({lane:p.lane,player:p.player,...cssBox({x:p.x,y:p.y,w:p.w,h:p.h})})),
      gong:(()=>{const g=GEO.gong,c=toCss(g.x,g.y);return{x:c.x,y:c.y,r:g.r*L.scale/dpr};})(),
      stage:cssBox({x:186,y:582,w:708,h:690}),
      texts:frameText.map(cssBox),puppets:[0,1,2].map(laneBoxCss),
      boss:boxes.boss?{head:toCss(boxes.boss.cx,boxes.boss.cy),arms,panel}:null,
      state:s?{t:+s.t.toFixed(3),phase:s.phase,wave:s.wave,level:s.level,meter:s.meter,score:s.score.slice(),
        threats:[0,1,2].map(i=>game.threat(i).kind),litIds:[0,1,2].map(i=>{const th=game.threat(i);return th.kind==='lit'?th.a.id:null;}),
        down:s.puppets.map(p=>s.t<p.downUntil),result:s.result,
        ball:s.ball&&!s.ball.smack?(()=>{const b=Core.ballAt(s.ball.keys,s.t-s.ball.t0);return b?toCss(b.x,b.y):null;})():null}:null};
  }
};
function boot(){
  resize();
  const v=VIEWS[viewName];
  if(v){
    const seed=params.has('seed')?+params.get('seed'):v.seed;start(seed,v.mode||(params.get('mode')==='duo'?'duo':'solo'));if(v.pilot)pilot=Core.pilot(v.pilot,seed);
    runUntil(v.until,200);if(v.after)advance(v.after);if(params.has('t'))advance(+params.get('t'));frozen=true;
  }
  hook.ready=true;requestAnimationFrame(frame);
}
resize();
})();
