// 小橘偷虾记 · page: drawing, input, cards, fixed views and the playtest hook. Rules live in core.js.
(function(){
'use strict';
const C=window.SneakCore,CFG=C.CFG;
const canvas=document.getElementById('board'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
const COL={bg:'#1b1d29',floor:'#2a2d3e',wood:'#4a3c30',woodLine:'#3d3127',rug:'#3f6170',rugEdge:'#5d8796',line:'#353a52',wall:'#5a5f7a',table:'#7a6a4f',
  cone:'#ffd75e',ear:'#7fc8ff',alert:'#ff5d5d',cat:'#ff9d2e',catDark:'#c46a14',sanW:'#f4efe6',sanK:'#2b2b2b',sanO:'#e08a3c',
  kid:'#9fd3ff',kidDark:'#3d6f93',toy:'#7ee08a',nest:'#3fb8a0',door:'#9fe3c8',treat:'#ffcf5a',text:'#f4ecd8',dim:'#c9c2b2'};
// words that change between levels; the rules behind them live in core.js
const TXT=[
  {hitWord:'被哈',hit:'哈！被三花看见了，吓回猫窝。',back:'再来。看准三花背对你的时候走，目标是右上角的出口。',sub:'走廊 ↑'},
  {hitWord:'被抱',hit:'抱住啦！孩子把小橘放回客厅门口。',back:'再来。等玩具响起来再过木地板，目标是右上角的出口。',sub:'饭厅 ↑'}
];
const params=new URLSearchParams(location.search),view=params.get('view');
let LV=Math.max(0,Math.min(C.LEVELS.length-1,(parseInt(params.get('level'),10)||1)-1));
let S=null,L=C.level(LV),seed=1,acc=0,last=0,paused=true,frozen=false,flash=0,cell=40,ox=0,oy=0,dpr=1,viewOk=null;

function start(sd,lv){
  if(lv!=null&&lv!==LV){LV=lv;L=C.level(LV);layout();}
  seed=sd;S=C.create({level:LV,seed});acc=0;flash=0;
  $('title').textContent=L.def.title;
  say('目标：溜到右上角闪光的「出口」。点一格小橘就走过去，点小橘它停下。');
  hud();
}
function say(t,cls){const m=$('msg');m.textContent=t;m.className=cls||'';}
function hud(){
  if(!S)return;
  $('stats').innerHTML=`<span>离出口 <b>${S.stepsLeft()}</b> 格</span><span>用时 <b>${S.time().toFixed(1)}</b> 秒</span><span>${TXT[LV].hitWord} <b>${S.hissed}</b> 次</span><span>猫条 <b>${S.treat?1:0}</b>/1</span>`;
}
function card(html){$('cardbox').innerHTML=html;$('card').hidden=false;}
function hideCard(){$('card').hidden=true;}
function newSeed(){return (Date.now()%997)+1;}
function play(lv){hideCard();start(newSeed(),lv);paused=false;}

const RULES=[
  `<ul>
    <li><b style="color:${COL.sanO}">三花</b>绕着鱼缸和茶几转圈，地上的黄色是她看得见的地方，走进去她就哈你，你会被吓回猫窝。</li>
    <li>她在拐角会先回头看一眼，再转身。</li>
    <li><b style="color:#c9a86a">茶几</b>底下可以钻，钻进去她看不见。</li>
    <li>点一格，小橘自己走过去；点小橘，它停下。电脑上也能用方向键，空格停下。</li>
    <li><b style="color:${COL.treat}">猫条</b>是额外奖励，拿不拿都行，过关还是要走进出口。</li>
  </ul>`,
  `<ul>
    <li><b style="color:${COL.kid}">孩子</b>坐在走廊边玩玩具。她不看，只听。</li>
    <li>踩<b style="color:#c7a27e">木地板</b>会「嗒」一声，踩<b style="color:${COL.rugEdge}">地毯</b>没声音。地上的蓝色是她听得见的木地板。</li>
    <li><b style="color:${COL.toy}">玩具响</b>的时候她玩得入迷，听不见。看她头上的进度条，等玩具响了再过木地板。</li>
    <li>被听见，她会「咦？」一下，走到出声的地方找你。她走得比你快，被她摸到身边就抱住了。悄悄踩着地毯躲开。</li>
    <li>操作和第 1 关一样。猫条是额外奖励。</li>
  </ul>`
];
function startCard(lv){
  const levels=C.LEVELS.map((d,i)=>`<button class="ghost" data-lv="${i}">${d.title}</button>`).join('');
  card(`<h1>小橘偷虾记</h1><p class="tag">灰盒试玩版 · 方块代替猫和家具</p>
  <h2>${C.LEVELS[lv].title}</h2>
  <p class="big">目标：走进右上角闪光的<b style="color:${COL.door}">出口</b>，就过关</p>
  ${RULES[lv]}
  <button class="main" id="go">开始</button>
  <p class="small">选关</p>${levels}`);
  $('go').onclick=()=>play(lv);
  for(const b of document.querySelectorAll('#cardbox [data-lv]'))b.onclick=()=>{const n=+b.dataset.lv;if(n!==LV){LV=n;L=C.level(LV);layout();start(newSeed());}startCard(n);};
}
function winCard(){
  const clean=S.hissed===0,who=LV===0?'三花':'孩子',next=LV+1<C.LEVELS.length;
  card(`<h2>${L.def.exitText}</h2>
  <p class="big">用时 ${S.time().toFixed(1)} 秒 · ${TXT[LV].hitWord} ${S.hissed} 次 · 猫条 ${S.treat?'拿到了':'没拿'}</p>
  ${clean?`<p class="medal">一次都没被${who}发现</p>`:''}${S.treat&&clean?'<p class="medal">拿了猫条还没被发现，高手</p>':''}
  ${next?`<button class="main" id="next">下一关：${C.LEVELS[LV+1].title.replace(/^第 \d 关 · /,'')}</button>`:'<p class="small">最后一关「饭桌偷虾」还没做。这一关好不好玩，太难还是太简单，告诉 CC。</p>'}
  <button class="${next?'ghost':'main'}" id="again">再玩这一关</button>`);
  $('again').onclick=()=>play(LV);
  if(next)$('next').onclick=()=>{hideCard();start(newSeed(),LV+1);paused=true;startCard(LV);};
}
function pauseCard(){
  if(!S||S.phase==='cleared'||!$('card').hidden||frozen)return;
  paused=true;
  card(`<h2>暂停了</h2><button class="main" id="cont">继续</button>`);
  $('cont').onclick=()=>{hideCard();paused=false;last=performance.now();};
}

// ---- layout & drawing
function layout(){
  const wide=innerWidth/innerHeight>1.1;document.body.classList.toggle('wide',wide);
  const r=canvas.getBoundingClientRect();dpr=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
  cell=Math.floor(Math.min(r.width/L.cols,r.height/L.rows,80));
  ox=Math.floor((r.width-cell*L.cols)/2);oy=Math.floor((r.height-cell*L.rows)/2);
}
const cx=i=>i%L.cols,cy=i=>(i/L.cols)|0;
function rect(c,r,w,h,col){ctx.fillStyle=col;ctx.fillRect(ox+c*cell,oy+r*cell,w*cell,h*cell);}
function label(text,x,y,size,col){ctx.fillStyle=col;ctx.font=`700 ${size}px -apple-system,"PingFang SC",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);}
function bubble(text,x,y,size,col){ctx.font=`700 ${size}px -apple-system,"PingFang SC",sans-serif`;const w=ctx.measureText(text).width+size*.8;ctx.fillStyle='#1b1d29e0';ctx.beginPath();ctx.roundRect(x-w/2,y-size*.75,w,size*1.5,size*.4);ctx.fill();label(text,x,y,size,col);}
function lerp(a,b,t){return a+(b-a)*t;}
function moverPos(at,m,n,f){if(!m)return [cx(at),cy(at)];const t=Math.min(1,(m.k+f)/n);return [lerp(cx(m.from),cx(m.to),t),lerp(cy(m.from),cy(m.to),t)];}
function sanPos(f){
  const e=L.tl[S.san.p];if(S.phase==='hiss'||e.from===e.to)return [cx(e.to),cy(e.to),e.face];
  const t=Math.min(1,e.prog+f/CFG.sanMove);return [lerp(cx(e.from),cx(e.to),t),lerp(cy(e.from),cy(e.to),t),e.face];
}
function exitK(f){if(!S||S.phase==='play'||S.phase==='hiss')return 0;if(S.phase==='cleared')return 1;return Math.min(1,(S.exitT+f)/CFG.exit);}
function drawTile(i){
  const c=cx(i),r=cy(i),k=L.kind[i],sound=L.type==='sound';
  if(k==='#')rect(c,r,1,1,COL.wall);
  else if(k==='T')rect(c,r,1,1,COL.table);
  else if(k==='~'){rect(c,r,1,1,COL.rug);ctx.strokeStyle=COL.rugEdge;ctx.lineWidth=2;ctx.setLineDash([3,3]);ctx.strokeRect(ox+c*cell+4,oy+r*cell+4,cell-8,cell-8);ctx.setLineDash([]);}
  else if(sound){rect(c,r,1,1,COL.wood);ctx.strokeStyle=COL.woodLine;ctx.lineWidth=1;for(let y=1;y<4;y++){ctx.beginPath();ctx.moveTo(ox+c*cell,oy+(r+y/4)*cell);ctx.lineTo(ox+(c+1)*cell,oy+(r+y/4)*cell);ctx.stroke();}}
  else rect(c,r,1,1,COL.floor);
  ctx.strokeStyle=COL.line;ctx.lineWidth=1;ctx.strokeRect(ox+c*cell+.5,oy+r*cell+.5,cell-1,cell-1);
  if(k==='T'){ctx.save();ctx.beginPath();ctx.rect(ox+c*cell,oy+r*cell,cell,cell);ctx.clip();ctx.strokeStyle='#00000033';ctx.lineWidth=2;
    for(let s=-cell;s<cell*2;s+=cell/4){ctx.beginPath();ctx.moveTo(ox+c*cell+s,oy+r*cell);ctx.lineTo(ox+c*cell+s-cell,oy+r*cell+cell);ctx.stroke();}ctx.restore();}
  if(i===L.nest){rect(c+.1,r+.1,.8,.8,COL.nest+'55');label(L.def.startName,ox+(c+.5)*cell,oy+(r+.5)*cell,cell*(L.def.startName.length>1?.24:.34),COL.nest);}
  if(i===L.door){const pulse=.5+.5*Math.sin(performance.now()/260);rect(c,r,1,1,COL.door+'40');
    ctx.strokeStyle=COL.door;ctx.lineWidth=2+pulse*3;ctx.globalAlpha=.5+.5*pulse;ctx.strokeRect(ox+c*cell+3,oy+r*cell+3,cell-6,cell-6);ctx.globalAlpha=1;
    label('出口',ox+(c+.5)*cell,oy+(r+.42)*cell,cell*.3,COL.door);label(TXT[LV].sub,ox+(c+.5)*cell,oy+(r+.76)*cell,cell*.19,COL.door);}
  if(i===L.treat&&!S.treat){ctx.save();ctx.translate(ox+(c+.5)*cell,oy+(r+.5)*cell);ctx.rotate(-.5);ctx.fillStyle=COL.treat;ctx.fillRect(-cell*.28,-cell*.08,cell*.56,cell*.16);ctx.restore();label('猫条',ox+(c+.5)*cell,oy+(r+.82)*cell,cell*.18,COL.treat);}
}
function drawSan(f){
  const seen=L.seen[S.san.p],hot=S.phase==='hiss';
  ctx.globalAlpha=hot?.55:.35;
  for(let i=0;i<L.N;i++)if(seen[i])rect(cx(i),cy(i),1,1,hot?COL.alert:COL.cone);
  ctx.globalAlpha=1;
  const [sx,sy,face]=sanPos(f),sxp=ox+(sx+.5)*cell,syp=oy+(sy+.5)*cell,sz=cell*.7;
  ctx.fillStyle=COL.sanW;ctx.fillRect(sxp-sz/2,syp-sz/2,sz,sz);
  ctx.fillStyle=COL.sanK;ctx.fillRect(sxp-sz/2,syp-sz/2,sz*.45,sz*.4);
  ctx.fillStyle=COL.sanO;ctx.fillRect(sxp+sz*.05,syp+sz*.1,sz*.45,sz*.4);
  const fx=C.DC[face],fy=C.DR[face];ctx.fillStyle=COL.sanK;ctx.beginPath();
  ctx.moveTo(sxp+fx*sz*.62,syp+fy*sz*.62);ctx.lineTo(sxp+fx*sz*.36-fy*sz*.18,syp+fy*sz*.36+fx*sz*.18);ctx.lineTo(sxp+fx*sz*.36+fy*sz*.18,syp+fy*sz*.36-fx*sz*.18);ctx.fill();
  label('花',sxp,syp,cell*.3,'#7a3d12');
  return [sxp,syp];
}
function drawKid(f){
  const k=S.kid,home=k.state==='play'&&!k.move,on=L.toyOn(S.san.p);
  // what she can hear: wood within earshot of where she is now; faint while the toy plays and she sits with it
  const at=S.kidOcc(),quiet=!(home&&on),hot=S.phase==='hiss';
  ctx.globalAlpha=hot?.5:quiet?.42:.12;
  for(let i=0;i<L.N;i++)if(L.wood(i)&&i!==at&&L.man(i,at)<=CFG.hear)rect(cx(i),cy(i),1,1,hot?COL.alert:COL.ear);
  ctx.globalAlpha=1;
  // her toy, at her spot
  const tc=cx(L.kid),tr=cy(L.kid);rect(tc+.15,tr+.6,.7,.3,'#2f3a2f');
  // the step that made a sound
  if(S.noise&&S.tick-S.noise.tick<6){const a=(S.tick-S.noise.tick+f)/6,nx=ox+(cx(S.noise.cell)+.5)*cell,ny=oy+(cy(S.noise.cell)+.5)*cell;
    ctx.globalAlpha=1-a;ctx.strokeStyle=COL.text;ctx.lineWidth=2;ctx.beginPath();ctx.arc(nx,ny,cell*(.3+.5*a),0,Math.PI*2);ctx.stroke();label('嗒',nx,ny-cell*.55,cell*.26,COL.text);ctx.globalAlpha=1;}
  const [kx,ky]=moverPos(k.at,k.move,CFG.kidMove,f),kxp=ox+(kx+.5)*cell,kyp=oy+(ky+.5)*cell,kz=cell*.7;
  ctx.fillStyle=COL.kid;ctx.beginPath();ctx.roundRect(kxp-kz/2,kyp-kz/2,kz,kz,kz*.3);ctx.fill();ctx.strokeStyle=COL.kidDark;ctx.lineWidth=2;ctx.stroke();
  label('孩',kxp,kyp,cell*.32,COL.kidDark);
  // toy timer above her while she sits: green and filling down while it plays, grey and filling up while quiet
  if(home&&S.phase!=='hiss'){
    const p=((S.san.p%L.P)+L.P)%L.P,bw=cell*1.3,bx=kxp-bw/2+cell*.35,by=kyp-cell*.78;
    const frac=on?L.toyLeft(p)/L.toyLen(p):0; // while quiet there is no countdown: you cannot tell when it starts again
    ctx.fillStyle='#1b1d29e0';ctx.fillRect(bx-2,by-cell*.36,bw+4,cell*.52);
    ctx.fillStyle='#353a52';ctx.fillRect(bx,by,bw,cell*.12);ctx.fillStyle=on?COL.toy:'#8a90aa';ctx.fillRect(bx,by,bw*frac,cell*.12);
    label(on?'♪ 玩具响 · 听不见':'安静 · 她在听',bx+bw/2,by-cell*.15,Math.max(10,cell*.17),on?COL.toy:COL.dim);
  }
  if(S.phase==='hiss')bubble('抱住啦！',kxp,kyp-cell*.75,cell*.34,COL.alert);
  else if(k.state==='huh')bubble('咦？',kxp,kyp-cell*.72,cell*.34,COL.kid);
  else if(k.state==='walk')bubble('在哪？',kxp,kyp-cell*.72,cell*.26,COL.kid);
  else if(k.state==='look')bubble('？？',kxp,kyp-cell*.72,cell*.3,COL.kid);
}
function draw(f){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=COL.bg;ctx.fillRect(0,0,canvas.width/dpr,canvas.height/dpr);
  if(!S)return;
  const k=exitK(f),ease=k*k*(3-2*k),zoom=1+1.2*ease;
  if(k>0){ // push the camera in on the door
    const dx=ox+(cx(L.door)+.5)*cell,dy=oy+(cy(L.door)+.5)*cell,W=canvas.width/dpr,H=canvas.height/dpr;
    const tx=lerp(dx,W/2,ease),ty=lerp(dy,H/2,ease);
    ctx.setTransform(dpr*zoom,0,0,dpr*zoom,dpr*(tx-dx*zoom),dpr*(ty-dy*zoom));
  }
  for(let i=0;i<L.N;i++)drawTile(i);
  for(const lb of L.def.labels)label(lb.text,ox+(lb.c+lb.w/2)*cell,oy+(lb.r+lb.h/2)*cell,Math.min(cell*.3,18),'#ffffffaa');
  if(S.cat.target>=0){const c=cx(S.cat.target),r=cy(S.cat.target);ctx.strokeStyle=COL.cat;ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(ox+(c+.15)*cell,oy+(r+.15)*cell,cell*.7,cell*.7);ctx.setLineDash([]);}
  let sp=null;
  if(L.type==='sound')drawKid(f);else sp=drawSan(f);
  // 小橘 (dimmed when hidden under the table)
  let [kx,ky]=moverPos(S.cat.at,S.cat.move,CFG.catMove,f);ky-=k*.9;
  const kxp=ox+(kx+.5)*cell,kyp=oy+(ky+.5)*cell,kz=cell*.66,under=L.kind[S.catOcc()]==='T';
  if(!(S.phase==='hiss'&&Math.floor(flash*10)%2)){
    ctx.globalAlpha=(under?.5:1)*(1-k*.85);ctx.fillStyle=COL.cat;ctx.beginPath();ctx.roundRect(kxp-kz/2,kyp-kz/2,kz,kz,kz*.22);ctx.fill();
    ctx.strokeStyle=COL.catDark;ctx.lineWidth=2;ctx.stroke();label('橘',kxp,kyp,cell*.32,'#4a2400');ctx.globalAlpha=1;
  }
  if(sp&&S.phase==='hiss')label('哈！',sp[0],sp[1]-cell*.75,cell*.62,COL.alert);
  if(S.phase==='play'||S.phase==='hiss'){ // goal pointer: tells a first-time player where the level ends
    const bob=Math.sin(performance.now()/220)*cell*.08,dxp=ox+(cx(L.door)-.05)*cell+bob,dyp=oy+(cy(L.door)+.5)*cell;
    ctx.fillStyle=COL.door;ctx.beginPath();ctx.moveTo(dxp,dyp);ctx.lineTo(dxp-cell*.28,dyp-cell*.18);ctx.lineTo(dxp-cell*.28,dyp+cell*.18);ctx.fill();
    ctx.fillStyle='#1b1d29d8';ctx.fillRect(dxp-cell*1.75,dyp-cell*.2,cell*1.45,cell*.4);
    label('走进这里过关',dxp-cell*1.03,dyp,Math.max(11,cell*.22),COL.door);
  }
  if(k>0){ // title over the shot, in screen space
    ctx.setTransform(dpr,0,0,dpr,0,0);const W=canvas.width/dpr,H=canvas.height/dpr;
    ctx.globalAlpha=Math.min(1,k*2);ctx.fillStyle='#1b1d29b0';ctx.fillRect(0,H*.38,W,H*.2);
    label(L.def.exitText,W/2,H*.46,Math.min(W*.11,46),COL.cat);label(`第 ${LV+1} 关完成`,W/2,H*.53,Math.min(W*.05,20),COL.text);ctx.globalAlpha=1;
  }
}

// ---- input
function cellAt(e){const r=canvas.getBoundingClientRect(),c=Math.floor((e.clientX-r.left-ox)/cell),rr=Math.floor((e.clientY-r.top-oy)/cell);return (c<0||rr<0||c>=L.cols||rr>=L.rows)?-1:rr*L.cols+c;}
canvas.addEventListener('pointerdown',e=>{
  if(!S||paused||frozen||S.phase!=='play')return;
  const i=cellAt(e);if(i<0)return;
  if(i===S.catOcc()||i===S.cat.at){S.stop();say('小橘停下了。');return;}
  if(!S.setTarget(i))say('那里过不去。');
});
const KEYS={ArrowUp:0,KeyW:0,ArrowRight:1,KeyD:1,ArrowDown:2,KeyS:2,ArrowLeft:3,KeyA:3};
addEventListener('keydown',e=>{
  if(e.code==='Escape'){pauseCard();return;}
  if(!S||paused||frozen)return;
  if(e.code in KEYS){e.preventDefault();S.stepDir(KEYS[e.code]);}
  else if(e.code==='Space'){e.preventDefault();S.stop();}
});
addEventListener('blur',pauseCard);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseCard();});
addEventListener('resize',layout);

// ---- loop
function onEvents(){
  for(const ev of S.events){
    if(ev==='hiss'||ev==='hug'){flash=0;say(TXT[LV].hit,'alert');}
    if(ev==='heard')say('嗒——被她听见了！快踩着地毯悄悄躲开。','alert');
    if(ev==='back')say(TXT[LV].back);
    if(ev==='under')say('钻进茶几底下了，三花看不见你。','good');
    if(ev==='treat')say('拿到猫条了！但还没过关，出口在右上角。','good');
    if(ev==='door')say('到出口了！','good');
    if(ev==='clear'){winCard();}
  }
}
function advanceTicks(n){
  for(let k=0;k<n&&S.phase!=='cleared';k++){S.step();onEvents();}
  hud();
}
function frame(t){
  const dt=Math.min(.25,(t-last)/1000);last=t;
  if(S&&!paused&&!frozen&&S.phase!=='cleared'){
    acc+=dt;const n=Math.floor(acc/CFG.tick);acc-=n*CFG.tick;if(n)advanceTicks(n);
    if(S.phase==='hiss')flash+=dt;
  }
  draw(frozen||paused?0:Math.min(1,acc/CFG.tick));
  requestAnimationFrame(frame);
}

// ---- fixed views (spec 7): ?view=… for level 1, ?level=2&view=… for level 2
function runView(v){
  frozen=true;paused=false;hideCard();
  const go=(sd,pilotOf,until,max)=>{start(sd);hideCard();const p=pilotOf(S);for(let n=0;n<max;n++){if(until(S))return true;p();S.step();onEvents();if(S.phase==='cleared'&&!until(S))return false;}return until(S);};
  let ok=false;
  if(v==='start')ok=go(1,s=>C.precise(s),s=>s.tick>=20,20);
  else if(v==='hiss'&&LV===0)ok=go(2,s=>C.reckless(s),s=>s.phase==='hiss',600);
  else if(v==='table'&&LV===0)ok=go(3,s=>C.precise(s),s=>L.kind[s.catOcc()]==='T',600);
  // the first seed from 2 up where the reckless run really gets heard / hugged (reckless is not caught every time)
  else if(v==='heard'&&LV===1){for(let sd=2;sd<60&&!ok;sd++)ok=go(sd,s=>C.reckless(s),s=>s.kid.state==='huh',600);}
  else if(v==='hug'&&LV===1){for(let sd=2;sd<60&&!ok;sd++)ok=go(sd,s=>C.reckless(s),s=>s.phase==='hiss',600);}
  else if(v==='exit')ok=go(4,s=>C.precise(s),s=>s.phase==='exit'&&s.exitT>=Math.floor(CFG.exit*.6),3000);
  else if(v==='clear')ok=go(4,s=>C.precise(s),s=>s.phase==='cleared',3000);
  viewOk=ok?v:'failed:'+v;hud();
  if(!ok){$('card').hidden=true;say('机位 '+v+' 没能进入请求的状态','alert');}
}
function snapshot(){return S?{view:viewOk,level:LV+1,seed,tick:S.tick,time:S.time(),phase:S.phase,stepsLeft:S.stepsLeft(),exitT:S.exitT,hissed:S.hissed,treat:S.treat,
  cat:S.cat.at,catOcc:S.catOcc(),under:L.kind[S.catOcc()]==='T',clock:S.san.p,kid:S.kid?S.kid.state:null,cell,paused,frozen}:{view:viewOk};}
window.__sneak={get state(){return S;},snapshot};
window.__PLAYTEST__={get ready(){return !!S;},snapshot,reset(){start(seed);hideCard();paused=false;},setSeed(n){start(n);hideCard();paused=false;},step(ms){advanceTicks(Math.round(ms/1000/CFG.tick));}};

layout();
if(view)runView(view);else{start(newSeed());startCard(LV);}
requestAnimationFrame(t=>{last=t;frame(t);});
})();
