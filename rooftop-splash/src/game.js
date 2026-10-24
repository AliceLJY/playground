(function(){
'use strict';
const $=id=>document.getElementById(id),C=SplashCore,W=SplashWorld,F=SplashFeel,T=THREE,A=C.arena;
const coarse=matchMedia('(pointer:coarse)').matches;
let renderer;
try{renderer=new T.WebGLRenderer({canvas:$('view'),antialias:true,powerPreference:'high-performance'});}catch(err){$('error').hidden=false;$('error-text').textContent='这个浏览器没有成功打开三维画面。请使用支持 WebGL 的浏览器，再试一次。';return;}
renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1.4:1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new T.Scene(),world=W.buildWorld(scene),camera=new T.PerspectiveCamera(73,1,.06,200);camera.rotation.order='YXZ';scene.add(camera);
if(coarse){world.sun.shadow.mapSize.set(1024,1024);}
const actorsGroup=new T.Group();scene.add(actorsGroup);
const gunAnchor=new T.Group();gunAnchor.position.set(.33,-.29,-.75);gunAnchor.scale.setScalar(.7);camera.add(gunAnchor);
const arm=W.box(gunAnchor,.14,.16,.52,0xecc29b,.12,-.2,.28);arm.rotation.x=-.25;
let gun=W.makeGun(0,0);gunAnchor.add(gun);
let state=C.create(),team=0,visuals=[],selected=-1,selectedTeam=-1,previousPhase='menu';
let firing=false,aim=false,jump=false,yaw=0,pitch=0,muted=false,audio=null,dragFallback=false,dragging=false;
let sensitivity=1,feel=F.create(7),wasGrounded=true,lastVy=0,noiseBuffer=null,voices=0,hitFlash=0,wetFlash=0,hintTimer=0,hintText='',last=performance.now(),hudTick=0;
const keys=new Set(),effects=[],feed=[],touch={forward:0,strafe:0};let joystickPointer=null,lookPointer=null,lastLook=null;
const effectGeometry=new T.SphereGeometry(1,6,4),waterMats=[new T.MeshBasicMaterial({color:0x82e3ef}),new T.MeshBasicMaterial({color:0xffcf87})];
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
function sound(freq=600,duration=.06,volume=.025,kind='sine'){
  if(muted||!audio||audio.state!=='running')return;
  const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type=kind;oscillator.frequency.setValueAtTime(freq,audio.currentTime);oscillator.frequency.exponentialRampToValueAtTime(Math.max(40,freq*.3),audio.currentTime+duration);gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}
/* Water sounds: filtered bursts of one seeded noise buffer plus a short tone, pitch jittered per play. */
function noise(){if(!noiseBuffer){const r=F.create(91).rand,n=audio.sampleRate;noiseBuffer=audio.createBuffer(1,n,audio.sampleRate);const d=noiseBuffer.getChannelData(0);for(let i=0;i<n;i++)d[i]=r()*2-1;}return noiseBuffer;}
function burst({type='bandpass',freq=1800,q=1,duration=.08,volume=.05,attack=.004,delay=0,pitch=1}){
  const t=audio.currentTime+delay,src=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
  src.buffer=noise();src.playbackRate.value=pitch;src.loop=true;filter.type=type;filter.frequency.value=freq*pitch;filter.Q.value=q;
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+attack);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  src.connect(filter);filter.connect(gain);gain.connect(audio.destination);src.start(t,(feel.rand()*.8));src.stop(t+duration+.02);voices++;src.onended=()=>{voices--;src.disconnect();filter.disconnect();gain.disconnect();};
}
function tone(freq,duration,volume,kind='sine',delay=0,end=.3){
  const t=audio.currentTime+delay,o=audio.createOscillator(),gain=audio.createGain();o.type=kind;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(40,freq*end),t+duration);
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.005);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(gain);gain.connect(audio.destination);o.start(t);o.stop(t+duration+.02);voices++;o.onended=()=>{voices--;o.disconnect();gain.disconnect();};
}
function sfx(kind,volume=1,weapon=0){
  if(muted||!audio||audio.state!=='running'||voices>24)return;const j=F.pitchJitter(feel),v=volume;
  if(kind==='squirt'){
    if(weapon===1){burst({type:'lowpass',freq:900,q:.7,duration:.26,volume:.09*v,pitch:j});tone(170*j,.16,.05*v,'sine',0,.45);}
    else{burst({freq:weapon===2?2300:1900,q:1.3,duration:weapon===2?.09:.07,volume:.05*v,pitch:j});tone((weapon===2?640:540)*j,.05,.012*v,'triangle',0,.6);}
  }else if(kind==='pat'){burst({type:'highpass',freq:2400,q:.8,duration:.05,volume:.06,pitch:j});tone(1250*j,.06,.018,'sine',0,.8);}
  else if(kind==='soak'){tone(1320,.18,.05,'triangle',0,.98);tone(1760,.32,.05,'triangle',.07,.98);burst({type:'lowpass',freq:1500,q:.6,duration:.34,volume:.08,pitch:j});}
  else if(kind==='hurt'){burst({type:'lowpass',freq:650,q:.7,duration:.13,volume:.09,pitch:j});tone(150*j,.1,.04,'sine',0,.5);}
  else if(kind==='soaked'){tone(520,.42,.04,'triangle',0,.4);burst({type:'lowpass',freq:900,q:.6,duration:.5,volume:.1,pitch:j});}
  else if(kind==='splash'){burst({type:'lowpass',freq:1200,q:.5,duration:.48*v+.1,volume:.11*v,pitch:j});tone(85*j,.22,.07*v,'sine',0,.5);}
  else if(kind==='refill'){for(let i=0;i<4;i++)tone((300+i*70)*j,.07,.016,'sine',i*.09,1.35);burst({freq:700,q:2,duration:.38,volume:.025,pitch:j});}
  else if(kind==='throw'){burst({freq:900,q:.8,duration:.12,volume:.03,pitch:j,attack:.03});}
}
function initAudio(){try{if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)audio=new Audio();}if(audio?.state==='suspended')audio.resume().catch(()=>{});}catch{muted=true;}}
function showHint(text,time=1.8){hintText=text;hintTimer=time;}
function clearInput(){keys.clear();firing=false;aim=false;jump=false;dragging=false;touch.forward=0;touch.strafe=0;joystickPointer=null;lookPointer=null;lastLook=null;$('joystick').querySelector('i').style.transform='';}
function disposeTree(root){root.traverse(m=>{if(!m.isMesh&&!m.isSprite)return;m.geometry?.dispose();if(m.isSprite){m.material.map?.dispose();m.material.dispose();}});}
function populate(){for(const m of visuals){actorsGroup.remove(m);disposeTree(m);}visuals=state.actors.map(a=>{const m=W.makeActor(a);m.userData.squash=new F.Spring(260,14);actorsGroup.add(m);return m;});}
populate();
function updateGun(){const a=state.actors[0];if(selected===a.weapon&&selectedTeam===a.team)return;gunAnchor.remove(gun);disposeTree(gun);gun=W.makeGun(a.team,a.weapon);gunAnchor.add(gun);selected=a.weapon;selectedTeam=a.team;}
function settings(){return{team,teamSize:+$('size').value,target:+$('target').value,difficulty:$('difficulty').value,weapon:+$('weapon').value};}
function requestLock(){
  if(coarse)return;
  try{const request=$('view').requestPointerLock();if(request?.catch)request.catch(()=>{dragFallback=true;document.body.classList.add('drag-mode');showHint('按住画面拖动瞄准；Esc 暂停',4);});}
  catch{dragFallback=true;document.body.classList.add('drag-mode');showHint('按住画面拖动瞄准；Esc 暂停',4);}
}
function newMatch(){
  clearInput();clearEffects();feed.length=0;state=C.create(settings());C.start(state);populate();yaw=state.actors[0].yaw;pitch=0;hitFlash=0;wetFlash=0;wasGrounded=true;lastVy=0;previousPhase='playing';
  $('menu').hidden=true;$('hud').hidden=false;for(const id of ['pause','results','help','scoreboard'])$(id).hidden=true;
  $('goal').textContent='先到 '+state.target+' 分';updateGun();initAudio();requestLock();showHint('和队友一起出发！打湿一位对手得 1 分',4);updateHUD();
}
function paused(note){if(state.phase!=='playing')return;C.pause(state);clearInput();updateHUD();$('scoreboard').hidden=true;$('pause').hidden=false;$('pause-note').textContent=note||'比赛暂停了，大家都在等你。';if(document.pointerLockElement)document.exitPointerLock();}
function resume(){if(state.phase!=='paused')return;C.pause(state);$('pause').hidden=true;clearInput();initAudio();requestLock();last=performance.now();}
function menu(){state.phase='menu';clearInput();clearEffects();$('hud').hidden=true;$('menu').hidden=false;for(const id of ['pause','results','scoreboard'])$(id).hidden=true;if(document.pointerLockElement)document.exitPointerLock();}
$('start').onclick=newMatch;$('resume').onclick=resume;$('pause-button').onclick=()=>paused();$('restart').onclick=newMatch;$('again').onclick=newMatch;$('exit').onclick=menu;$('back').onclick=menu;
document.querySelectorAll('[data-team]').forEach(button=>{button.onclick=()=>{team=+button.dataset.team;document.querySelectorAll('[data-team]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});};});
$('help-open').onclick=()=>{$('help').hidden=false;$('help-close').focus();};$('help-close').onclick=()=>{$('help').hidden=true;$('help-open').focus();};
$('sensitivity').oninput=e=>{sensitivity=+e.target.value;};$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'声音 关':'声音 开';$('sound').setAttribute('aria-label',muted?'打开声音':'关闭声音');};
if(coarse)$('start-note').textContent='左手移动 · 右手转头 · 横屏更好玩';
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&state.phase==='playing'&&!dragFallback&&!coarse)paused();if(document.pointerLockElement){dragFallback=false;document.body.classList.remove('drag-mode');}});
document.addEventListener('pointerlockerror',()=>{dragFallback=true;document.body.classList.add('drag-mode');showHint('按住画面拖动瞄准；Esc 暂停',4);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)paused('切到别的页面时，比赛会自动暂停。');});
addEventListener('blur',()=>paused());
document.addEventListener('contextmenu',e=>{if(state.phase==='playing')e.preventDefault();});
document.addEventListener('mousemove',e=>{if(state.phase!=='playing'||coarse)return;if(document.pointerLockElement||dragging){yaw-=e.movementX*.0022*sensitivity;pitch=clamp(pitch-e.movementY*.0022*sensitivity,-1.4,1.4);}});
document.addEventListener('mousedown',e=>{if(state.phase!=='playing'||coarse||e.target.closest('button'))return;if(e.button===0){firing=true;dragging=true;C.shoot(state,state.actors[0]);}if(e.button===2)aim=true;});
document.addEventListener('mouseup',e=>{if(e.button===0){firing=false;dragging=false;}if(e.button===2)aim=false;});
document.addEventListener('wheel',e=>{if(state.phase==='playing'){e.preventDefault();C.equip(state,(state.actors[0].weapon+(e.deltaY>0?1:2))%3);}},{passive:false});
const gameKeys=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab','KeyR','KeyG','KeyQ','KeyC','Digit1','Digit2','Digit3'];
document.addEventListener('keydown',e=>{
  if(e.code==='Escape'){if(!$('help').hidden){$('help').hidden=true;return;}if(state.phase==='playing')paused();else if(state.phase==='paused')resume();return;}
  if(state.phase!=='playing')return;if(gameKeys.includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;
  if(e.code==='KeyR'){if(C.reload(state))sfx('refill');}
  if(e.code==='Space')jump=true;if(e.code==='KeyG'&&C.throwBomb(state))sfx('throw');
  if(e.code==='KeyQ')C.equip(state,(state.actors[0].weapon+1)%3);
  if(/^Digit[123]$/.test(e.code))C.equip(state,+e.code.at(-1)-1);
  if(e.code==='Tab'){table($('live-table'));$('scoreboard').hidden=false;}
});
document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab'){$('scoreboard').hidden=true;e.preventDefault();}});
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function touchButton(id,onDown,onUp=()=>{}){const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();if(state.phase!=='playing')return;b.setPointerCapture(e.pointerId);onDown();});for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,e=>{e.preventDefault();onUp();});}
touchButton('touch-fire',()=>{firing=true;C.shoot(state,state.actors[0]);},()=>{firing=false;});touchButton('touch-aim',()=>{aim=true;},()=>{aim=false;});touchButton('touch-jump',()=>{jump=true;});touchButton('touch-reload',()=>C.reload(state));touchButton('touch-switch',()=>C.equip(state,(state.actors[0].weapon+1)%3));touchButton('touch-bomb',()=>C.throwBomb(state));
const joystick=$('joystick');
function updateStick(e){const r=joystick.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,len=Math.max(1,Math.hypot(x,y)/36);touch.strafe=clamp(x/36/len,-1,1);touch.forward=clamp(-y/36/len,-1,1);joystick.querySelector('i').style.transform='translate('+x/len+'px,'+y/len+'px)';}
joystick.addEventListener('pointerdown',e=>{if(state.phase!=='playing')return;e.preventDefault();joystickPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);updateStick(e);});
joystick.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer)updateStick(e);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(type,e=>{if(e.pointerId===joystickPointer){joystickPointer=null;touch.strafe=touch.forward=0;joystick.querySelector('i').style.transform='';}});
const look=$('look-zone');look.addEventListener('pointerdown',e=>{if(state.phase!=='playing')return;lookPointer=e.pointerId;lastLook={x:e.clientX,y:e.clientY};look.setPointerCapture(e.pointerId);});look.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer||!lastLook)return;yaw-=(e.clientX-lastLook.x)*.006*sensitivity;pitch=clamp(pitch-(e.clientY-lastLook.y)*.006*sensitivity,-1.4,1.4);lastLook={x:e.clientX,y:e.clientY};});for(const type of ['pointerup','pointercancel','lostpointercapture'])look.addEventListener(type,e=>{if(e.pointerId===lookPointer){lookPointer=null;lastLook=null;}});
function particle(x,y,z,team,scale=.07,life=.35,vx=0,vy=0,vz=0){
  // Fixed cap bounds both GPU and audio/visual work during 6v6 crossfire.
  if(effects.length>=200)return;const m=new T.Mesh(effectGeometry,waterMats[team]);m.position.set(x,y,z);m.scale.setScalar(scale);scene.add(m);effects.push({mesh:m,life,max:life,vx,vy,vz});
}
function clearEffects(){for(const e of effects)scene.remove(e.mesh);effects.length=0;for(const d of wetSpots){scene.remove(d.mesh);d.mesh.material.dispose();}wetSpots.length=0;F.reset(feel);}
/* Wet spots on the roof fade as they dry; a fixed ring buffer keeps 6v6 crossfire bounded. */
const wetSpots=[],wetGeometry=new T.CircleGeometry(1,14),wetMats=[0x3d8fa3,0xc98a4b].map(color=>new T.MeshBasicMaterial({color,transparent:true,opacity:.32,depthWrite:false}));
function wetSpot(x,z,team,size){
  if(wetSpots.length>=40){const old=wetSpots.shift();scene.remove(old.mesh);old.mesh.material.dispose();}
  const m=new T.Mesh(wetGeometry,wetMats[team].clone());m.rotation.x=-Math.PI/2;m.position.set(x,.03+wetSpots.length*.0004,z);m.scale.setScalar(size*(.8+feel.rand()*.4));scene.add(m);wetSpots.push({mesh:m,life:6,max:6});
}
function burstAt(x,y,z,team,count,speed,scale=.08,life=.45){for(let i=0;i<count;i++){const r=feel.rand,ang=r()*Math.PI*2,up=.4+r()*.9;particle(x,y,z,team,scale*(.6+r()*.8),life*(.7+r()*.6),Math.cos(ang)*speed*(.3+r()*.7),up*speed,Math.sin(ang)*speed*(.3+r()*.7));}}
function events(){
  const me=state.actors[0];
  for(const e of state.events){
    if(e.type==='shot'){
      // The stream sags a little toward the middle so it reads as water, not a laser.
      const len=Math.hypot(e.to.x-e.from.x,e.to.y-e.from.y,e.to.z-e.from.z),sag=Math.min(.35,len*.012),n=e.weapon===1?9:6;
      for(let i=1;i<=n;i++){const t=i/(n+1);particle(e.from.x+(e.to.x-e.from.x)*t,e.from.y+(e.to.y-e.from.y)*t-sag*4*t*(1-t),e.from.z+(e.to.z-e.from.z)*t,e.team,e.weapon===1?.06:.045,.1+t*.06,0,-.6,0);}
      burstAt(e.to.x,e.to.y,e.to.z,e.team,e.hit?7:4,e.hit?2.6:1.8,.06,.32);
      if(e.to.y<.2)wetSpot(e.to.x,e.to.z,e.team,e.weapon===1?.55:.32);
      if(e.id===0){
        F.react(feel,'shot',{weapon:e.weapon});sfx('squirt',1,e.weapon);
        // Muzzle spray just ahead of the barrel, in world space.
        const f={x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};
        for(let i=0;i<3;i++)particle(e.from.x+f.x*.9,e.from.y+f.y*.9-.12,e.from.z+f.z*.9,e.team,.03,.12,f.x*2+(feel.rand()-.5),f.y*2+feel.rand(),f.z*2+(feel.rand()-.5));
        if(e.hit){F.react(feel,'hitConfirm');hitFlash=.18;sfx('pat');}
      }else{const d=Math.hypot(e.from.x-me.x,e.from.z-me.z);if(d<16)sfx('squirt',.25*(1-d/16),e.weapon);}
    }
    if(e.type==='hit'){
      const v=visuals[e.id];if(v&&e.id!==0)v.userData.squash.impulse(2.2+e.amount*.03);
      const b=state.actors[e.id];if(e.id!==0)burstAt(b.x,b.y+1.2,b.z,state.actors[e.by].team,5,2.2,.07,.35);
      if(e.id===0){
        const s=state.actors[e.by],ang=Math.atan2(-(s.x-me.x),-(s.z-me.z));
        F.react(feel,'hurt',{dir:ang,scale:Math.min(1.6,e.amount/30)});wetFlash=.8;sfx('hurt');
      }
    }
    if(e.type==='out'){
      const a=state.actors[e.by],b=state.actors[e.id];feed.unshift({by:a.name,id:b.name,team:a.team,other:b.team,until:state.elapsed+5});feed.splice(4);
      burstAt(b.x,b.y+1.1,b.z,a.team,26,4.2,.1,.6);wetSpot(b.x,b.z,a.team,1.1);
      if(e.by===0){F.react(feel,'soak');showHint('打湿 '+b.name+'！ +1 分',1.6);sfx('soak');}
      if(e.id===0){F.react(feel,'soaked');firing=false;aim=false;showHint(a.name+' 的水枪太准啦，补完水再来',2.5);sfx('soaked');}
    }
    if(e.type==='splash'){
      for(let i=0;i<36;i++)particle(e.x,e.y,e.z,e.team,.14,.6,(feel.rand()-.5)*13,feel.rand()*8,(feel.rand()-.5)*13);wetSpot(e.x,e.z,e.team,2.2);
      const d=Math.hypot(e.x-me.x,e.z-me.z),near=Math.max(0,1-d/14);if(near>0)F.react(feel,'splash',{scale:near});sfx('splash',.4+near*.6);
    }
  }
  state.events.length=0;
}
const bombMeshes=[];
function renderActors(time){
  state.actors.forEach((a,i)=>{
    const m=visuals[i];m.visible=a.alive&&(i!==0||state.phase==='menu');m.position.set(a.x,a.y,a.z);m.rotation.y=a.yaw;
    const walk=state.phase==='playing'?Math.sin(time*9+i)*.55*a.moving:0;m.userData.legs[0].rotation.x=walk;m.userData.legs[1].rotation.x=-walk;
    const q=m.userData.squash.x;m.scale.set(1+q*.5,(a.crouch?.7:1)*(1-q),1+q*.5);m.userData.ring.visible=a.protect>0;m.userData.label.visible=true;
  });
  while(bombMeshes.length<state.bombs.length){const m=new T.Mesh(new T.SphereGeometry(.18,10,8),W.mat(0xf9c76b));scene.add(m);bombMeshes.push(m);}
  bombMeshes.forEach((m,i)=>{m.visible=!!state.bombs[i];if(state.bombs[i])m.position.set(state.bombs[i].x,state.bombs[i].y,state.bombs[i].z);});
}
function radar(){
  const canvas=$('radar'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,scale=2.7,p=state.actors[0];
  ctx.clearRect(0,0,w,h);const x=v=>w/2+v*scale,z=v=>h/2+v*scale;
  ctx.fillStyle='#eee0c1';ctx.fillRect(x(-19),z(-29),38*scale,58*scale);ctx.fillStyle='#a2afa3';for(const b of A.blocks)ctx.fillRect(x(b.minX),z(b.minZ),(b.maxX-b.minX)*scale,(b.maxZ-b.minZ)*scale);
  for(const a of state.actors){if(!a.alive||a.team!==p.team)continue;ctx.fillStyle=a.id===0?'#fffcee':a.team?'#e78d4f':'#267e9a';ctx.beginPath();ctx.arc(x(a.x),z(a.z),a.id===0?4:3,0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='#315d68';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x(p.x),z(p.z));ctx.lineTo(x(p.x-Math.sin(yaw)*3),z(p.z-Math.cos(yaw)*3));ctx.stroke();
}
function table(container){
  const t=document.createElement('table');t.className='score-table';const head=t.createTHead().insertRow();for(const text of ['队员','打湿','归队']){const th=document.createElement('th');th.textContent=text;head.append(th);}
  const body=t.createTBody();for(const a of [...state.actors].sort((a,b)=>a.team-b.team||b.kills-a.kills)){
    const row=body.insertRow();if(a.id===0)row.className='you';const name=row.insertCell(),dot=document.createElement('span');dot.className='team-dot '+(a.team?'orange':'blue');name.append(dot,document.createTextNode(a.name+(a.id===0?'（你）':'')));row.insertCell().textContent=a.kills;row.insertCell().textContent=a.deaths;
  }container.replaceChildren(t);
}
function updateHUD(){
  const a=state.actors[0],w=C.weapons[a.weapon];$('blue-score').textContent=state.score[0];$('orange-score').textContent=state.score[1];const seconds=Math.ceil(state.time);$('timer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  $('health').textContent=a.hp;$('health-fill').style.width=a.hp+'%';$('personal').textContent='打湿 '+a.kills+' · 归队 '+a.deaths;$('weapon-name').textContent=w.name;$('ammo').textContent=a.ammo[a.weapon];$('capacity').textContent='/ '+w.capacity;
  $('reload-note').textContent=a.reload>0?'补水中 · '+a.reload.toFixed(1)+' 秒':coarse?'点补水，随时加满':'R 补水 · 1 / 2 / 3 换枪';$('bomb-count').textContent='G 水球 × '+a.bombs;
  document.querySelectorAll('[data-slot]').forEach(e=>e.classList.toggle('active',+e.dataset.slot===a.weapon));
  $('respawn').hidden=a.alive;$('respawn-time').textContent=Math.max(1,Math.ceil(a.respawn))+' 秒后重新加入';$('crosshair').hidden=!a.alive;
  $('hint').textContent=hintTimer>0?hintText:a.protect>0?'出生保护 '+a.protect.toFixed(1)+' 秒 · 开火即解除':a.ammo[a.weapon]===0&&a.reload===0?'按 R 补水':'';
  const visible=feed.filter(e=>e.until>state.elapsed);$('feed').replaceChildren(...visible.map(e=>{const line=document.createElement('div');line.className='feed-line';const a=document.createElement('span'),b=document.createElement('span');a.className=e.team?'orange':'blue';b.className=e.other?'orange':'blue';a.textContent=e.by;b.textContent=e.id;line.append(a,document.createTextNode('  ~ 打湿 ~  '),b);return line;}));radar();
  if(!$('scoreboard').hidden)table($('live-table'));
}
function results(){
  clearInput();$('scoreboard').hidden=true;if(document.pointerLockElement)document.exitPointerLock();$('results').hidden=false;const won=state.winner===state.team;
  $('result-title').textContent=state.winner===null?'不分上下，都很凉快。':won?'这片天台，我们赢啦！':'差一点点，再来一场。';$('result-score').textContent=state.score[0]+' : '+state.score[1];$('result-note').textContent='你打湿了 '+state.actors[0].kills+' 位对手，重新归队 '+state.actors[0].deaths+' 次。';table($('result-table'));sound(won?980:300,.3,.05);
}
function frame(now){
  requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.1);last=now;const a=state.actors[0];
  // Hit-stop freezes only the match step; camera, shake, springs and HUD keep real time.
  const live=state.phase==='playing',gameDt=live?F.step(feel,dt):0;
  if(live&&gameDt>0){
    const wasAlive=a.alive;
    C.tick(state,{forward:touch.forward+(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),strafe:touch.strafe+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),yaw,pitch,fire:firing,aim,jump,crouch:keys.has('KeyC'),sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')},gameDt);jump=false;
    if(a.alive&&a.grounded&&!wasGrounded)F.land(feel,-lastVy);wasGrounded=a.grounded;lastVy=a.vy;
    if(!wasAlive&&a.alive){yaw=a.yaw;pitch=0;}events();hintTimer=Math.max(0,hintTimer-dt);hudTick+=dt;if(hudTick>.08){updateHUD();hudTick=0;}
  }
  if(state.phase==='result'&&previousPhase!=='result'){updateHUD();results();}previousPhase=state.phase;
  if(state.phase==='menu'){
    const time=now*.00006;camera.position.set(29+Math.sin(time)*3,23,39);camera.lookAt(1,0,0);gunAnchor.visible=false;
  }else{
    const eye=C.eye(a),sh=F.shake(feel),sprinting=a.moving>.5&&(keys.has('ShiftLeft')||keys.has('ShiftRight'))&&!aim;
    camera.position.set(eye.x,eye.y+(a.alive&&live?Math.sin(state.elapsed*10)*.022*a.moving:0)+feel.landing.x*2,eye.z);
    camera.rotation.set(pitch+feel.camKick.x*1.4+feel.flinch.x*.12+sh.pitch,yaw+sh.yaw,sh.roll+feel.flinch.x*.05,'YXZ');
    gunAnchor.visible=a.alive&&!(aim&&a.weapon===1);updateGun();
    const targetFov=aim?(a.weapon===1?33:58):sprinting?79:73;camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*12);camera.updateProjectionMatrix();
    gunAnchor.position.set(aim?.09:.33,-.29+(a.reload>0?-.2:0)+Math.sin(state.elapsed*10)*.013*a.moving-feel.landing.x*.6,-.75+feel.gunZ.x*1.5);
    gunAnchor.rotation.set(feel.gunPitch.x*1.2,0,(a.reload>0?-.45:0)+feel.gunRoll.x*.8);
  }
  $('scope').hidden=!(aim&&a.weapon===1&&a.alive&&state.phase==='playing');hitFlash=Math.max(0,hitFlash-dt);wetFlash=Math.max(0,wetFlash-dt*2);const hm=$('hitmarker');hm.style.opacity=feel.marker>0?1:0;hm.style.transform='translate(-50%,-50%) scale('+(1+feel.marker*(feel.markerKill?3.2:2))+')';hm.classList.toggle('kill',feel.markerKill);
  const hd=$('hurt-dir');hd.style.opacity=feel.hurtT>0&&feel.hurtDir!==null?Math.min(1,feel.hurtT*1.6):0;if(feel.hurtDir!==null)hd.style.transform='translate(-50%,-50%) rotate('+(-(feel.hurtDir-yaw))+'rad)';$('wet-flash').style.opacity=wetFlash*.6;
  const fx=state.phase==='paused'?0:live?gameDt:dt;
  for(const m of visuals)m.userData.squash.update(fx);
  renderActors(state.elapsed);
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=fx;if(e.life<=0){scene.remove(e.mesh);effects.splice(i,1);}else{e.vy-=5*fx;e.mesh.position.x+=e.vx*fx;e.mesh.position.y+=e.vy*fx;e.mesh.position.z+=e.vz*fx;e.mesh.scale.multiplyScalar(1-fx*.8);}}
  for(let i=wetSpots.length-1;i>=0;i--){const d=wetSpots[i];d.life-=fx;d.mesh.material.opacity=.32*Math.min(1,d.life/2.5);if(d.life<=0){scene.remove(d.mesh);d.mesh.material.dispose();wetSpots.splice(i,1);}}
  renderer.render(scene,camera);
}
// Read-only inspection for local acceptance; does not expose gameplay mutators.
window.splashInspect=()=>({view:{yaw,pitch,fov:camera.fov},feel:{trauma:feel.trauma,hitStop:feel.hitStop,marker:feel.marker,markerKill:feel.markerKill,wetSpots:wetSpots.length,particles:effects.length,voices},phase:state.phase,time:state.time,score:[...state.score],target:state.target,actors:state.actors.map(a=>({id:a.id,team:a.team,x:a.x,y:a.y,z:a.z,hp:a.hp,alive:a.alive,kills:a.kills,deaths:a.deaths,ammo:[...a.ammo],reload:a.reload,weapon:a.weapon,bombs:a.bombs})),camera:{yaw,pitch},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
requestAnimationFrame(frame);
})();
