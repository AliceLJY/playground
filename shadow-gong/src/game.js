/* 灯影守夜 browser shell: input, the frame loop, HUD, fixed camera views and the window.__duel hook. */
(function(){
'use strict';
const C=window.GongCore,A=window.GongAudio;
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const view=['hero','wide','stress'].includes(params.get('view'))?params.get('view'):null;
const live=params.get('live')==='1',plain=params.get('plain')==='1',seedParam=parseInt(params.get('seed'),10)||0;
const audio=A.createAudio();
let world,s=C.create({seed:seedParam||1+Math.floor(Math.random()*1e6)});
let aspect=16/9,real=0,last=performance.now(),ready=false,frozen=false,freezeAt=0,trap=null,autoMode=null,resultAt=0,playStart=0,playEnd=0;
const defaultPR=Math.min(window.devicePixelRatio||1,2);
let pr=defaultPR,adaptiveLocked=!!view,fpsWin={t:0,n:0},goodFor=0,fps=0,fpsAcc={t:0,n:0},info={calls:0,triangles:0};

function fail(err){console.error(err);$('error-text').textContent=String(err&&err.message||err);$('error').hidden=false;}
try{world=window.GongWorld.createWorld($('view'));}catch(err){fail(err);return;}
function resize(){const w=window.innerWidth,h=window.innerHeight;aspect=w/Math.max(1,h);world.resize(w,h,pr);}
window.addEventListener('resize',resize);resize();

// ---- input -----------------------------------------------------------------------------
const held={left:false,right:false,block:false},edges={block:false,attack:false,dodge:false};
const keymap={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyK:'block',Space:'block',KeyJ:'attack',KeyL:'dodge',ShiftLeft:'dodge',ShiftRight:'dodge'};
function press(k,down){
  if(k==='left'||k==='right')held[k]=down;
  else if(k==='block'){if(down&&!held.block)edges.block=true;held.block=down;}
  else if(down)edges[k]=true;
}
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'||e.code==='KeyP'){togglePause();return;}
  if(e.code==='Enter'&&!$('menu').hidden){startGame();return;}
  const k=keymap[e.code];if(!k)return;e.preventDefault();if(e.repeat&&k!=='left'&&k!=='right')return;press(k,true);
});
window.addEventListener('keyup',e=>{const k=keymap[e.code];if(k)press(k,false);});
const canvas=$('view');
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;if(e.button===0)press('attack',true);if(e.button===2)press('block',true);});
window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&e.button===2)press('block',false);});
const touchy=()=>document.body.classList.add('touchy');
if(window.matchMedia&&matchMedia('(pointer: coarse)').matches)touchy();
window.addEventListener('touchstart',touchy,{passive:true});
for(const b of document.querySelectorAll('#touch button')){
  const k=b.dataset.key;
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);b.classList.add('held');press(k,true);audio.resume();});
  const up=()=>{b.classList.remove('held');press(k,false);};
  b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up);
}
window.addEventListener('blur',()=>{held.left=held.right=held.block=false;if(['intro','fight','breather'].includes(s.phase))setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&['intro','fight','breather'].includes(s.phase))setPaused(true);});
function takeInput(){
  const input=autoMode?C.autopilot(s,autoMode):{left:held.left,right:held.right,blockDown:held.block,blockPressed:edges.block,attackPressed:edges.attack,dodgePressed:edges.dodge};
  edges.block=edges.attack=edges.dodge=false;return input;
}

// ---- flow -----------------------------------------------------------------------------
function startGame(wave){
  audio.init();audio.resume();audio.ambience(true);
  if(wave===undefined)C.start(s);else C.start(s,{wave});
  $('menu').hidden=true;$('pause').hidden=true;$('result').hidden=true;$('hud').hidden=false;$('boss').hidden=true;
  resultAt=0;playStart=real;playEnd=0;shownHints.clear();
}
function setPaused(on){if(!world)return;C.pause(s,on);$('pause').hidden=!s.paused;}
function togglePause(){if(!$('menu').hidden||!$('result').hidden)return;setPaused(!s.paused);}
$('start').addEventListener('click',()=>startGame());
$('resume').addEventListener('click',()=>setPaused(false));
$('restart').addEventListener('click',()=>startGame(0));
$('exit').addEventListener('click',toMenu);$('back').addEventListener('click',toMenu);
$('again').addEventListener('click',()=>{if(s.phase==='lost')startGame(s.bossReached?C.WAVES.length-1:0);else startGame(0);});
$('pause-button').addEventListener('click',togglePause);
$('sound').addEventListener('click',()=>{audio.setMuted(!audio.muted);$('sound').textContent=audio.muted?'声音 关':'声音 开';$('sound').setAttribute('aria-label',audio.muted?'打开声音':'关闭声音');});
function toMenu(){s=C.create({seed:1+Math.floor(Math.random()*1e6)});audio.ambience(false);$('menu').hidden=false;$('hud').hidden=true;$('pause').hidden=true;$('result').hidden=true;}

// ---- HUD and hints --------------------------------------------------------------------
const shownHints=new Set();let hintUntil=0;
const T=()=>document.body.classList.contains('touchy');
function hint(id,text,seconds=4.5){if(id&&shownHints.has(id))return;if(id)shownHints.add(id);$('hint').textContent=text;$('hint').classList.add('on');hintUntil=real+seconds;}
function call(text){const el=$('call');el.textContent=text;el.classList.remove('show');void el.offsetWidth;el.classList.add('show');}
function plate(title,name){$('plate-title').textContent=title;$('plate-name').textContent=name;const el=$('plate');el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');}
const key=(k,t)=>T()?t:k;
function handleEvents(){
  for(const ev of s.events){
    world.fx(ev,s);
    if(trap&&ev.type===trap.type&&(!trap.when||trap.when(ev))){freezeAt=real+trap.delay;trap=null;}
    switch(ev.type){
      case 'telegraph':audio.play(ev.unblockable?'drum':'clap');if(ev.unblockable)hint('red',`红光挡不住——按 ${key('L / Shift','「闪」')} 闪开`);break;
      case 'parry':audio.play(ev.sound);
        if(ev.perfect)hint('perfect',`锵！对手露出空当，趁这一下按 ${key('J / 左键','「槌」')} 回击`,4);
        else{hint('block','挡住了，但不完美：看见白光再按一下，别一直按住',4);if(ev.broken){call('破防');audio.play('clang');}}
        break;
      case 'strike':if(ev.kind==='scissors'&&ev.outcome!=='perfect'&&ev.outcome!=='block')audio.play('snip');
        if(ev.outcome==='hurt')hint('hurt','没挡住。白光亮起后，等一拍再按锣',4);break;
      case 'hit':audio.play(ev.sound);break;
      case 'deflect':audio.play('clang');hint('deflect','刃面把槌挡开了——先完美弹反，再趁空当打',4);break;
      case 'hurt':audio.play('hurt');break;
      case 'execute':audio.play('gongBig');call('处决');break;
      case 'bossDown':audio.play('gongBig');break;
      case 'dodge':audio.play('whoosh');break;
      case 'swing':audio.play('swing');break;
      case 'nearMiss':break;
      case 'moveStart':if(ev.kind==='moth')audio.play('flutter');else if(ev.kind==='rat'&&ev.move!=='ladle')audio.play('squeak');break;
      case 'flit':audio.play('flutter');hint('flit','蛾子在空中会躲开，只能先弹反，打晕了再处决',4);break;
      case 'stun':audio.play('ding');hint('stun',`它晕了！靠近按 ${key('J / 左键','「槌」')} 处决`,4);break;
      case 'intro':plate('开锣','灯影守夜');audio.play('open');break;
      case 'wave':{
        plate(ev.title,ev.name);call(ev.name);
        const lines=[`兵器一透光变亮，就按一下 ${key('K / 空格 / 右键','「锣」')}`,'剪刀精第二剪会慢半拍——别连按','两边都有人时，按锣会自动转向先落下的那一招',`鼠王只怕处决：弹反攒满他的架势，再上前处决，灭掉三盏灯油`];
        hint('wave'+ev.index,lines[ev.index]||'',6);if(C.WAVES[ev.index].boss)$('boss').hidden=false;break;}
      case 'breather':plate('场间歇','灯油 +15');break;
      case 'phase2':audio.play('roar');call('最后一盏');break;
      case 'bossReady':audio.play('roar');break;
      case 'won':resultAt=real+1.6;playEnd=real;audio.play('win');break;
      case 'lost':resultAt=real+1.3;playEnd=real;audio.play('lose');audio.ambience(false);break;
    }
  }
  s.events.length=0;
}
let shown={};
function setBar(id,v){v=Math.max(0,Math.min(1,v));if(shown[id]===v)return;shown[id]=v;$(id).style.transform=`scaleX(${v})`;}
function hud(){
  if($('hud').hidden)return;
  const p=s.player;setBar('oil',p.hp/p.maxHp);setBar('posture',p.posture/p.maxPosture);
  $('posture').parentElement.classList.toggle('hot',p.posture/p.maxPosture>.7);
  const chain=s.stats.chain>=2?`连弹 ×${s.stats.chain}`:'';if(shown.chain!==chain){shown.chain=chain;$('chain').textContent=chain;}
  const rat=s.enemies.find(e=>e.kind==='rat');
  if(rat){setBar('boss-posture',rat.posture/rat.maxPosture);const marks=Array.from({length:3},(_,i)=>`<i class="${i<rat.hp?'':'out'}"></i>`).join('');if(shown.marks!==marks){shown.marks=marks;$('boss-marks').innerHTML=marks;}}
  if(real>hintUntil)$('hint').classList.remove('on');
  if(resultAt&&real>=resultAt&&$('result').hidden){
    resultAt=0;const won=s.phase==='won',t=Math.round(playEnd-playStart),st=s.stats;
    $('result-eyebrow').textContent=won?'散场':'熄灯';$('result-title').textContent=won?'灯守住了。':'灯灭了。';
    $('result-stats').innerHTML=[['完美弹反',st.perfect],['普通格挡',st.block],['处决',st.exec],['挨打',st.hurt],['最长连弹',st.bestChain],['用时',`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`]].map(([a,b])=>`<span>${a}</span><b>${b}</b>`).join('');
    $('again').textContent=won?'再演一场':s.bossReached?'从鼠王重来':'重新开锣';$('result').hidden=false;
  }
}

// ---- fixed camera views: real simulation up to the documented moment, then frozen ---------
if(view){
  s=C.scenario(view==='hero'&&plain?'heroPlain':view,seedParam||11);
  $('menu').hidden=true;$('hud').hidden=false;$('boss').hidden=!s.enemies.some(e=>e.kind==='rat');
  handleEvents();const w=C.WAVES[s.wave];if(w)plate(w.title,w.name);
  frozen=!live;
  if(!live){world.sync(s,real,0,C.timeScale(s));for(let i=0;i<4;i++)world.sync(s,real+=.015,.015,1);}
}

// ---- adaptive resolution (locked in fixed views so screenshots repeat) ---------------------
function adapt(dt){
  if(adaptiveLocked||s.phase==='menu')return;
  fpsWin.t+=dt;fpsWin.n++;
  if(fpsWin.t<1.5)return;
  const f=fpsWin.n/fpsWin.t;fpsWin={t:0,n:0};
  if(f<48&&pr>1){pr=Math.max(1,pr-.25);resize();goodFor=0;}
  else if(f>58){goodFor+=1.5;if(goodFor>=4&&pr<defaultPR){pr=Math.min(defaultPR,pr+.25);resize();goodFor=0;}}
  else goodFor=0;
}

// ---- the frame loop --------------------------------------------------------------------
function frame(now){
  const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
  if(freezeAt&&real>=freezeAt){frozen=true;freezeAt=0;}
  const step=frozen?0:dt;real+=step;
  const input=takeInput();
  if(!frozen&&s.phase!=='menu'&&!s.paused)C.run(s,dt,input);
  handleEvents();
  world.sync(s,real,step,C.timeScale(s));
  world.frameCamera(aspect,view==='wide'?'wide':'play',s.feel,real);
  world.render();
  info=world.renderer.info.render;info={calls:info.calls,triangles:info.triangles};
  fpsAcc.t+=dt;fpsAcc.n++;if(fpsAcc.t>=1){fps=fpsAcc.n/fpsAcc.t;fpsAcc={t:0,n:0};}
  adapt(dt);hud();
  if(!ready){ready=true;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(t=>{last=t;requestAnimationFrame(frame);});

// ---- window.__duel: state, metrics and render readings for acceptance -------------------
const toLin=Array.from({length:256},(_,i)=>{const c=i/255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);});
function readFrame(){
  const gl=world.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(w*h*4);
  world.render();gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
  const lum=new Float32Array(w*h);for(let i=0;i<w*h;i++)lum[i]=.2126*toLin[px[i*4]]+.7152*toLin[px[i*4+1]]+.0722*toLin[px[i*4+2]];
  return{lum,w,h};
}
// Render readings. (1) Silhouette: the hero's body alone against the bare cloth, everything else hidden in both
// renders, compared only inside the body (the mask is eroded by one pixel so anti-aliased edges do not count).
// (2) Flare: the full frame against the same frame with the lamp flare removed.
function probe(){
  const base=readFrame(),{body,rest}=world.layers(),keep=rest.map(m=>m.visible);
  rest.forEach(m=>{m.visible=false;});const solo=readFrame();
  body.forEach(m=>{m.visible=false;});const bare=readFrame();
  body.forEach(m=>{m.visible=true;});rest.forEach((m,i)=>{m.visible=keep[i];});
  const {w,h}=solo,inside=new Uint8Array(w*h);for(let i=0;i<w*h;i++)inside[i]=Math.abs(bare.lum[i]-solo.lum[i])>.02?1:0;
  let n=0,withP=0,without=0;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(inside[i]&&inside[i-1]&&inside[i+1]&&inside[i-w]&&inside[i+w]){n++;withP+=solo.lum[i];without+=bare.lum[i];}}
  const flare=s.feel.flare;s.feel.flare=0;world.sync(s,real,0,C.timeScale(s));const calm=readFrame();s.feel.flare=flare;world.sync(s,real,0,C.timeScale(s));world.render();
  let mb=0,mc=0;for(let i=0;i<base.lum.length;i++){mb+=base.lum[i];mc+=calm.lum[i];}
  return{buffer:[w,h],silhouettePixels:n,silhouetteRatio:n?withP/without:null,meanLum:mb/base.lum.length,meanLumNoFlare:mc/calm.lum.length,flare,flareGain:(mb-mc)/Math.max(1e-9,mc)};
}
function gpu(){const gl=world.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);}
window.__duel={
  get ready(){return ready;},get view(){return view;},get frozen(){return frozen;},
  get state(){return JSON.parse(JSON.stringify(s,(k,v)=>k==='rand'||k==='ap'?undefined:v));},
  get metrics(){const gl=world.renderer.getContext(),mem=world.renderer.info.memory;return{fps,drawCalls:info.calls,triangles:info.triangles,geometries:mem.geometries,textures:mem.textures,
    pixelRatio:world.renderer.getPixelRatio(),defaultPixelRatio:defaultPR,devicePixelRatio:window.devicePixelRatio,adaptiveLocked,css:[window.innerWidth,window.innerHeight],buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
    antialias:gl.getContextAttributes().antialias,samples:gl.getParameter(gl.SAMPLES),gpu:gpu()};},
  probe,start:wave=>startGame(wave),
  autopilot(on=true,opts={}){autoMode=on?opts:null;},
  freezeOn(type,delayMs=60,when){trap={type,delay:delayMs/1000,when};},
  unfreeze(){frozen=false;freezeAt=0;},
  timeScale:()=>C.timeScale(s)
};
})();
