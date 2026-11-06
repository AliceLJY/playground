// 小橘偷虾记 · page: drawing, input, cards, fixed views and the playtest hook. Rules live in core.js.
(function(){
'use strict';
const C=window.SneakCore,CFG=C.CFG;
const canvas=document.getElementById('board'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
const COL={bg:'#1b1d29',floor:'#2a2d3e',line:'#353a52',wall:'#5a5f7a',table:'#7a6a4f',cone:'#ffd75e',alert:'#ff5d5d',
  cat:'#ff9d2e',catDark:'#c46a14',sanW:'#f4efe6',sanK:'#2b2b2b',sanO:'#e08a3c',nest:'#3fb8a0',door:'#9fe3c8',treat:'#ffcf5a',text:'#f4ecd8',dim:'#c9c2b2'};
const params=new URLSearchParams(location.search),view=params.get('view');
let S=null,L=C.level(0),seed=1,acc=0,last=0,paused=true,frozen=false,flash=0,cell=40,ox=0,oy=0,dpr=1,viewOk=null;

function start(sd){
  seed=sd;S=C.create({level:0,seed});acc=0;flash=0;
  say('点一格，小橘自己走过去；点小橘，它就停下。');
  hud();
}
function say(t,cls){const m=$('msg');m.textContent=t;m.className=cls||'';}
function hud(){
  if(!S)return;
  $('stats').innerHTML=`<span>用时 <b>${S.time().toFixed(1)}</b> 秒</span><span>被哈 <b>${S.hissed}</b> 次</span><span>猫条 <b>${S.treat?1:0}</b>/1</span>`;
}
function card(html){$('cardbox').innerHTML=html;$('card').hidden=false;}
function hideCard(){$('card').hidden=true;}

function startCard(){
  card(`<h1>小橘偷虾记</h1><p class="tag">灰盒试玩版 · 方块代替猫和家具</p>
  <h2>第 1 关 · 客厅躲三花</h2>
  <ul>
    <li>你是<b style="color:${COL.cat}">橘</b>，要溜到右上角的<b style="color:${COL.door}">门</b>。</li>
    <li><b style="color:${COL.sanO}">三花</b>绕着鱼缸和茶几转圈，地上的黄色是她看得见的地方，走进去她就哈你，你会被吓回猫窝。</li>
    <li>她在拐角会先回头看一眼，再转身。</li>
    <li><b style="color:#c9a86a">茶几</b>底下可以钻，钻进去她看不见。</li>
    <li>点一格，小橘自己走过去；点小橘，它停下。电脑上也能用方向键，空格停下。</li>
    <li>顶上那根<b style="color:${COL.treat}">猫条</b>，想拿就绕路去拿。</li>
  </ul>
  <button class="main" id="go">开始</button>`);
  $('go').onclick=()=>{hideCard();start(newSeed());paused=false;};
}
function newSeed(){return (Date.now()%997)+1;}
function winCard(){
  const clean=S.hissed===0;
  card(`<h2>溜出客厅了！</h2>
  <p class="big">用时 ${S.time().toFixed(1)} 秒 · 被哈 ${S.hissed} 次 · 猫条 ${S.treat?'拿到了':'没拿'}</p>
  ${clean?'<p class="medal">一次都没被三花发现</p>':''}${S.treat&&clean?'<p class="medal">拿了猫条还没被发现，高手</p>':''}
  <p class="small">下一关「走廊躲孩子」和最后的「饭桌偷虾」还没做。这一关好不好玩，太难还是太简单，告诉 CC。</p>
  <button class="main" id="again">再玩一次</button>`);
  $('again').onclick=()=>{hideCard();start(newSeed());paused=false;};
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
function lerp(a,b,t){return a+(b-a)*t;}
function catPos(f){
  const m=S.cat.move;
  if(!m)return [cx(S.cat.at),cy(S.cat.at)];
  const t=Math.min(1,(m.k+f)/CFG.catMove);return [lerp(cx(m.from),cx(m.to),t),lerp(cy(m.from),cy(m.to),t)];
}
function sanPos(f){
  const e=L.tl[S.san.p];if(S.phase==='hiss'||e.from===e.to)return [cx(e.to),cy(e.to),e.face];
  const t=Math.min(1,e.prog+f/CFG.sanMove);return [lerp(cx(e.from),cx(e.to),t),lerp(cy(e.from),cy(e.to),t),e.face];
}
function draw(f){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=COL.bg;ctx.fillRect(0,0,canvas.width,canvas.height);
  if(!S)return;
  // floor and special cells
  for(let i=0;i<L.N;i++){
    const c=cx(i),r=cy(i),k=L.kind[i];
    rect(c,r,1,1,k==='#'?COL.wall:k==='T'?COL.table:COL.floor);
    ctx.strokeStyle=COL.line;ctx.lineWidth=1;ctx.strokeRect(ox+c*cell+.5,oy+r*cell+.5,cell-1,cell-1);
    if(k==='T'){ctx.save();ctx.beginPath();ctx.rect(ox+c*cell,oy+r*cell,cell,cell);ctx.clip();ctx.strokeStyle='#00000033';ctx.lineWidth=2;
      for(let s=-cell;s<cell*2;s+=cell/4){ctx.beginPath();ctx.moveTo(ox+c*cell+s,oy+r*cell);ctx.lineTo(ox+c*cell+s-cell,oy+r*cell+cell);ctx.stroke();}ctx.restore();}
    if(i===L.nest){rect(c+.1,r+.1,.8,.8,COL.nest+'55');label('窝',ox+(c+.5)*cell,oy+(r+.5)*cell,cell*.34,COL.nest);}
    if(i===L.door){rect(c+.08,r+.08,.84,.84,COL.door+'33');label('门',ox+(c+.5)*cell,oy+(r+.38)*cell,cell*.32,COL.door);label('走廊',ox+(c+.5)*cell,oy+(r+.75)*cell,cell*.2,COL.door);}
    if(i===L.treat&&!S.treat){ctx.save();ctx.translate(ox+(c+.5)*cell,oy+(r+.5)*cell);ctx.rotate(-.5);ctx.fillStyle=COL.treat;ctx.fillRect(-cell*.28,-cell*.08,cell*.56,cell*.16);ctx.restore();label('猫条',ox+(c+.5)*cell,oy+(r+.82)*cell,cell*.18,COL.treat);}
  }
  for(const lb of L.def.labels)label(lb.text,ox+(lb.c+lb.w/2)*cell,oy+(lb.r+lb.h/2)*cell,Math.min(cell*.3,18),'#ffffffaa');
  // sight
  const seen=L.seen[S.san.p],hot=S.phase==='hiss';
  ctx.globalAlpha=hot?.55:.35;
  for(let i=0;i<L.N;i++)if(seen[i])rect(cx(i),cy(i),1,1,hot?COL.alert:COL.cone);
  ctx.globalAlpha=1;
  // target marker
  if(S.cat.target>=0){const c=cx(S.cat.target),r=cy(S.cat.target);ctx.strokeStyle=COL.cat;ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(ox+(c+.15)*cell,oy+(r+.15)*cell,cell*.7,cell*.7);ctx.setLineDash([]);}
  // 三花
  const [sx,sy,face]=sanPos(f),sxp=ox+(sx+.5)*cell,syp=oy+(sy+.5)*cell,sz=cell*.7;
  ctx.fillStyle=COL.sanW;ctx.fillRect(sxp-sz/2,syp-sz/2,sz,sz);
  ctx.fillStyle=COL.sanK;ctx.fillRect(sxp-sz/2,syp-sz/2,sz*.45,sz*.4);
  ctx.fillStyle=COL.sanO;ctx.fillRect(sxp+sz*.05,syp+sz*.1,sz*.45,sz*.4);
  const fx=C.DC[face],fy=C.DR[face];ctx.fillStyle=COL.sanK;ctx.beginPath();
  ctx.moveTo(sxp+fx*sz*.62,syp+fy*sz*.62);ctx.lineTo(sxp+fx*sz*.36-fy*sz*.18,syp+fy*sz*.36+fx*sz*.18);ctx.lineTo(sxp+fx*sz*.36+fy*sz*.18,syp+fy*sz*.36-fx*sz*.18);ctx.fill();
  label('花',sxp,syp,cell*.3,'#7a3d12');
  // 小橘 (dimmed when hidden under the table)
  const [kx,ky]=catPos(f),kxp=ox+(kx+.5)*cell,kyp=oy+(ky+.5)*cell,kz=cell*.66,under=L.kind[S.catOcc()]==='T';
  if(!(S.phase==='hiss'&&Math.floor(flash*10)%2)){
    ctx.globalAlpha=under?.5:1;ctx.fillStyle=COL.cat;ctx.beginPath();ctx.roundRect(kxp-kz/2,kyp-kz/2,kz,kz,kz*.22);ctx.fill();
    ctx.strokeStyle=COL.catDark;ctx.lineWidth=2;ctx.stroke();label('橘',kxp,kyp,cell*.32,'#4a2400');ctx.globalAlpha=1;
  }
  if(S.phase==='hiss'){label('哈！',sxp,syp-cell*.75,cell*.62,COL.alert);}
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
function advanceTicks(n){
  for(let k=0;k<n&&S.phase!=='cleared';k++){
    S.step();
    for(const ev of S.events){
      if(ev==='hiss'){flash=0;say('哈！被三花看见了，吓回猫窝。','alert');}
      if(ev==='back')say('再来。看准三花背对你的时候走。');
      if(ev==='under')say('钻进茶几底下了，三花看不见你。','good');
      if(ev==='treat')say('拿到猫条了！','good');
      if(ev==='clear'){winCard();}
    }
  }
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

// ---- fixed views (spec 7)
function runView(v){
  frozen=true;paused=false;hideCard();
  const go=(sd,pilotOf,until,max)=>{start(sd);const p=pilotOf(S);for(let n=0;n<max;n++){if(until(S))return true;p();S.step();if(S.phase==='cleared'&&!until(S))return false;}return until(S);};
  let ok=false;
  if(v==='start')ok=go(1,s=>C.precise(s),s=>s.tick>=20,20);
  else if(v==='hiss')ok=go(2,s=>C.reckless(s),s=>s.phase==='hiss',600);
  else if(v==='table')ok=go(3,s=>C.precise(s),s=>L.kind[s.catOcc()]==='T',600);
  else if(v==='clear'){ok=go(4,s=>C.precise(s),s=>s.phase==='cleared',3000);if(ok)winCard();}
  viewOk=ok?v:'failed:'+v;hud();
  if(!ok)say('机位 '+v+' 没能进入请求的状态','alert');
  else if(v==='hiss')say('哈！被三花看见了，吓回猫窝。','alert');
  else if(v==='table')say('钻进茶几底下了，三花看不见你。','good');
}
function snapshot(){return S?{view:viewOk,seed,tick:S.tick,time:S.time(),phase:S.phase,hissed:S.hissed,treat:S.treat,cat:S.cat.at,catOcc:S.catOcc(),under:L.kind[S.catOcc()]==='T',san:S.san.p,cell,paused,frozen}:{view:viewOk};}
window.__sneak={get state(){return S;},snapshot};
window.__PLAYTEST__={get ready(){return !!S;},snapshot,reset(){start(seed);hideCard();paused=false;},setSeed(n){start(n);hideCard();paused=false;},step(ms){advanceTicks(Math.round(ms/1000/CFG.tick));}};

layout();
if(view)runView(view);else{start(newSeed());startCard();}
requestAnimationFrame(t=>{last=t;frame(t);});
})();
