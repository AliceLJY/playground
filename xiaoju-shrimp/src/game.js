// 小橘偷虾记 · page: drawing, input, cards, fixed views and the playtest hook. Rules live in core.js.
(function(){
'use strict';
const C=window.SneakCore,CFG=C.CFG,A=window.SneakArt;
const canvas=document.getElementById('board'),ctx=canvas.getContext('2d');
const hitCanvas=document.createElement('canvas');hitCanvas.width=hitCanvas.height=1;
const hitCtx=hitCanvas.getContext('2d',{willReadFrequently:true});
const $=id=>document.getElementById(id);
const COL={bg:'#1e1915',floor:'#2a2d3e',wood:'#4a3c30',woodLine:'#3d3127',rug:'#4f8296',rugEdge:'#5d8796',line:'#353a52',wall:'#5a5f7a',table:'#9a6a3e',
  cone:'#ffd75e',ear:'#7fc8ff',alert:'#ff5d5d',cat:'#ff9d2e',catDark:'#c46a14',sanW:'#f4efe6',sanK:'#2b2b2b',sanO:'#e08a3c',
  kid:'#9fd3ff',kidDark:'#3d6f93',top:'#5c4634',topLine:'#4c3a2b',owner:'#e9c9a8',ownerDark:'#7a5235',shrimp:'#ff8a6b',plate:'#e8e4da',toy:'#7ee08a',nest:'#3fb8a0',door:'#9fe3c8',treat:'#ffcf5a',text:'#f4ecd8',dim:'#c9c2b2'};
// words that change between levels; the rules behind them live in core.js
const TXT=[
  {hitWord:'被哈',hit:'哈！被三花看见了，吓回猫窝。',back:'再来。看准三花背对你的时候走，目标是右上角的出口。',sub:'走廊 ↑'},
  {hitWord:'被抱',hit:'抱住啦！孩子把小橘放回客厅门口。',back:'再来。等玩具响起来再过木地板，目标是右上角的出口。',sub:'饭厅 ↑'},
  {hitWord:'被发现',hit:'去！被主人赶回窗台。',back:'再来。她低头吃饭时走，筷子一停就站住。',sub:'← 跳下'}
];
const params=new URLSearchParams(location.search),view=params.get('view');
let LV=Math.max(0,Math.min(C.LEVELS.length-1,(parseInt(params.get('level'),10)||1)-1));
let S=null,L=C.level(LV),seed=1,acc=0,last=0,paused=true,frozen=false,flash=0,cell=40,ox=0,oy=0,dpr=1,viewOk=null;

function start(sd,lv){
  if(lv!=null&&lv!==LV){LV=lv;L=C.level(LV);layout();}
  seed=sd;S=C.create({level:LV,seed});acc=0;flash=0;catPose=null;catAng=LV===2?Math.PI:-Math.PI/2;kidAng=0;
  $('title').textContent=L.def.title;
  $('legend').innerHTML=LEGEND[LV];
  say(LV===2?'先去叼虾：虾盘在主人跟前。她低头吃饭时走，筷子一停就站住别动。':LV===1?'先别急：等孩子的玩具响了（头上变绿）再过蓝色木地板，地毯上随时能停下躲。':'目标：溜到右上角闪光的「出口」。点一格小橘就走过去，点小橘它停下。');
  hud();
}
function say(t,cls){const m=$('msg');m.textContent=t;m.className=cls||'';}
function hud(){
  if(!S)return;
  const toShrimp=LV===2&&!S.carry;
  $('stats').innerHTML=`<span>${toShrimp?'离虾':'离出口'} <b>${toShrimp?Math.max(0,L.shrimpDist[S.catOcc()]):S.stepsLeft()}</b> 格</span><span>用时 <b>${S.time().toFixed(1)}</b> 秒</span><span>${TXT[LV].hitWord} <b>${S.hissed}</b> 次</span><span>猫条 <b>${S.treat?1:0}</b>/1</span>`;
}
function card(html){$('cardbox').innerHTML=html;$('card').hidden=false;}
function hideCard(){$('card').hidden=true;}
function newSeed(){return (Date.now()%997)+1;}
function play(lv){hideCard();start(newSeed(),lv);paused=false;}

// always on screen under the stats: what the colours on the floor mean (playtest 3: nobody reads the start card)
const LEGEND=[
  `<span><i style="background:${COL.cone}"></i>三花看得见，别进</span><span><i style="background:${COL.table}"></i>茶几底下能藏</span><span><i style="background:${COL.door}"></i>出口</span>`,
  `<span><i style="background:${COL.rug}"></i>地毯没声音，能趴着躲</span><span><i style="background:${COL.ear}"></i>她听得见的木地板</span><span><i style="background:${COL.toy}"></i>玩具响时她听不见</span>`,
  `<span><i style="background:${COL.alert}"></i>主人看着时别动</span><span><i style="background:${COL.cone}"></i>筷子停了＝要转头</span><span><i style="background:${COL.shrimp}"></i>叼了虾她一抬头就发现</span>`
];
// pick a level and it starts at once (playtest 3: choosing a level and then pressing 「开始」 again was a chore)
const BLURB=['三花绕着茶几巡逻，别被她看见','孩子在玩玩具，别被她听见','主人在吃饭，趁她不看把虾拖走'];
function startCard(lv){
  const levels=C.LEVELS.map((d,i)=>`<button class="${i===lv?'main':'ghost'} lv" data-lv="${i}">${d.title}<small>${BLURB[i]||''}</small></button>`).join('');
  card(`<h1>小橘偷虾记</h1><p class="tag">试玩版 · 边玩边改</p>
  <p class="big">点一关就开始。跟着画面上闪光的<b style="color:${COL.door}">出口</b>走</p>
  ${levels}
  <p class="small">玩法看画面：顶上有图例，边走边有提示。</p>`);
  for(const b of document.querySelectorAll('#cardbox [data-lv]'))b.onclick=()=>play(+b.dataset.lv);
}
function winCard(){
  const clean=S.hissed===0&&!S.caughtWin,who=['三花','孩子','主人'][LV],next=LV+1<C.LEVELS.length;
  card(`<h2>${L.def.exitText}</h2>
  <p class="big">用时 ${S.time().toFixed(1)} 秒 · ${TXT[LV].hitWord} ${S.hissed} 次 · 猫条 ${S.treat?'拿到了':'没拿'}</p>
  ${clean?`<p class="medal">一次都没被${who}发现</p>`:''}${S.treat&&clean?'<p class="medal">拿了猫条还没被发现，高手</p>':''}
  ${S.caughtWin?'<p class="medal">当场被抓包，照样得手！</p>':''}
  ${next?`<button class="main" id="next">下一关：${C.LEVELS[LV+1].title.replace(/^第 \d 关 · /,'')}</button>`:'<p>小橘叼着虾溜出门，跑到菜地里，边吃边打滚……<br>然后被一把抱起，送去洗澡。</p><p class="big">全剧终</p>'}
  <button class="${next?'ghost':'main'}" id="again">再玩这一关</button>${next?'':'<button class="ghost" id="first">从第 1 关重玩</button>'}`);
  $('again').onclick=()=>play(LV);
  if(!next)$('first').onclick=()=>play(0);
  if(next)$('next').onclick=()=>play(LV+1);
}
function pauseCard(){
  if(!S||S.phase==='cleared'||!$('card').hidden||frozen)return;
  paused=true;
  card(`<h2>暂停了</h2><button class="main" id="cont">继续</button>`);
  $('cont').onclick=()=>{hideCard();paused=false;last=performance.now();};
}

// ---- layout & drawing (pictures in art.js; the room is painted once per layout into bgLayer)
let bgLayer=null,catPose=null,catAng=-Math.PI/2,kidAng=0;
const ANG=[-Math.PI/2,0,Math.PI/2,Math.PI];   // facing 0 N, 1 E, 2 S, 3 W → canvas angle
function layout(){
  catPose=null;
  const wide=innerWidth/innerHeight>1.1;document.body.classList.toggle('wide',wide);
  const r=canvas.getBoundingClientRect();dpr=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
  cell=Math.floor(Math.min(r.width/L.cols,r.height/L.rows,80));
  ox=Math.floor((r.width-cell*L.cols)/2);oy=Math.floor((r.height-cell*L.rows)/2);
  buildBg();
}
function buildBg(){
  if(!canvas.width||!canvas.height)return;
  bgLayer=document.createElement('canvas');bgLayer.width=canvas.width;bgLayer.height=canvas.height;
  const b=bgLayer.getContext('2d');b.setTransform(dpr,0,0,dpr,0,0);
  A.paintRoom(b,L,{ox,oy,s:cell},true);
  if(L.type==='sound')for(let i=0;i<L.N;i++)   // the wood she can hear from her spot says so
    if(L.wood(i)&&L.man(i,L.kid)<=CFG.hear&&i!==L.kid&&i!==L.treat&&i!==L.door&&i!==L.nest)A.label(b,'响',ox+(cx(i)+.5)*cell,oy+(cy(i)+.5)*cell,Math.max(11,cell*.22),'#eaf6ff','rgba(30,50,80,.5)');
  A.vignette(b,ox,oy,cell*L.cols,cell*L.rows);
}
const cx=i=>i%L.cols,cy=i=>(i/L.cols)|0;
function rect(c,r,w,h,col){ctx.fillStyle=col;ctx.fillRect(ox+c*cell,oy+r*cell,w*cell,h*cell);}
function label(text,x,y,size,col){ctx.fillStyle=col;ctx.font=`700 ${size}px -apple-system,"PingFang SC",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);}
function bubble(text,x,y,size,col){ctx.font=`700 ${size}px -apple-system,"PingFang SC",sans-serif`;const w=ctx.measureText(text).width+size*.8;ctx.fillStyle='#1e1915e6';ctx.beginPath();ctx.roundRect(x-w/2,y-size*.75,w,size*1.5,size*.4);ctx.fill();label(text,x,y,size,col);}
function lerp(a,b,t){return a+(b-a)*t;}
function moverPos(at,m,n,f){if(!m)return [cx(at),cy(at)];const t=Math.min(1,(m.k+f)/(m.n||n));return [lerp(cx(m.from),cx(m.to),t),lerp(cy(m.from),cy(m.to),t)];}
function moveAng(m){return Math.atan2(cy(m.to)-cy(m.from),cx(m.to)-cx(m.from));}
function sanPos(f){
  const e=L.tl[S.san.p];if(S.phase==='hiss'||e.from===e.to)return [cx(e.to),cy(e.to),e.face];
  const t=Math.min(1,e.prog+f/CFG.sanMove);return [lerp(cx(e.from),cx(e.to),t),lerp(cy(e.from),cy(e.to),t),e.face];
}
function exitK(f){if(!S||(S.phase!=='exit'&&S.phase!=='cleared'))return 0;if(S.phase==='cleared')return 1;return Math.min(1,(S.exitT+f)/CFG.exit);}
// the goal cell: warm light through the doorway (or a glow at the table edge), a pulsing frame and a small sign
function drawDoor(now){
  const c=cx(L.door),r=cy(L.door),x=ox+c*cell,y=oy+r*cell,pulse=.5+.5*Math.sin(now*3.8);
  if(L.type==='still'){ // the table edge: light from the floor below, and a drop arrow
    ctx.save();ctx.beginPath();ctx.rect(ox,oy,L.cols*cell,L.rows*cell);ctx.clip();
    const g=ctx.createRadialGradient(x,y+cell*.5,0,x,y+cell*.5,cell*1.2);g.addColorStop(0,`rgba(159,227,200,${.5+.25*pulse})`);g.addColorStop(1,'rgba(159,227,200,0)');
    ctx.fillStyle=g;ctx.fillRect(x,y-cell*.7,cell*1.2,cell*2.4);
    ctx.fillStyle=COL.door;ctx.beginPath();const ay=y+cell*.5;ctx.moveTo(x+cell*.06,ay);ctx.lineTo(x+cell*.2,ay-cell*.1);ctx.lineTo(x+cell*.2,ay+cell*.1);ctx.fill();ctx.restore();}
  else A.doorLight(ctx,x,y,cell,pulse,'#ffd48a');
  ctx.save();ctx.strokeStyle=COL.door;ctx.lineWidth=1.5+pulse*2.5;ctx.globalAlpha=.45+.45*pulse;ctx.setLineDash([cell*.12,cell*.08]);ctx.strokeRect(x+3,y+3,cell-6,cell-6);ctx.restore();
  A.label(ctx,'出口',x+cell*.5,y+cell*.46,Math.max(11,cell*.22),'#103a30','#9fe3c8e8');
  label(TXT[LV].sub,x+cell*.5,y+cell*.8,Math.max(9,cell*.16),COL.door);
}
function drawTreat(){
  if(S.treat)return;const c=cx(L.treat),r=cy(L.treat),x=ox+(c+.5)*cell,y=oy+(r+.45)*cell;
  ctx.save();ctx.translate(x,y);ctx.rotate(-.5);
  ctx.fillStyle='rgba(30,12,2,.3)';ctx.fillRect(-cell*.27,-cell*.05,cell*.58,cell*.17);
  ctx.fillStyle=COL.treat;ctx.beginPath();ctx.roundRect(-cell*.3,-cell*.09,cell*.6,cell*.18,cell*.04);ctx.fill();
  ctx.fillStyle='#e0622a';ctx.fillRect(-cell*.1,-cell*.09,cell*.2,cell*.18);ctx.fillStyle='#fff3d0';ctx.fillRect(-cell*.3,-cell*.09,cell*.07,cell*.18);ctx.fillRect(cell*.23,-cell*.09,cell*.07,cell*.18);
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-cell*.02,0,cell*.035,0,Math.PI*2);ctx.fill();
  ctx.restore();label('猫条',x,y+cell*.33,Math.max(9,cell*.16),COL.treat);
}
function drawCone(seen,hot,now){
  ctx.save();ctx.fillStyle=hot?COL.alert:COL.cone;ctx.globalAlpha=hot?.6:.55;
  ctx.beginPath();for(let i=0;i<L.N;i++)if(seen[i])ctx.rect(ox+cx(i)*cell,oy+cy(i)*cell,cell,cell);ctx.fill();
  ctx.save();ctx.clip();ctx.globalAlpha=.45;ctx.strokeStyle=hot?'#ffe0dc':'#fffbe0';ctx.lineWidth=Math.max(1.5,cell*.035);ctx.beginPath();
  const W=L.cols*cell,H=L.rows*cell,st=cell*.2,ph=(now*cell*.25)%st;
  for(let d=-H+ph;d<W;d+=st){ctx.moveTo(ox+d,oy+H);ctx.lineTo(ox+d+H,oy);}ctx.stroke();ctx.restore();
  ctx.globalAlpha=.95;ctx.strokeStyle=hot?'#ffb0a8':'#fff3b0';ctx.lineWidth=Math.max(2,cell*.04);ctx.beginPath();
  for(let i=0;i<L.N;i++)if(seen[i]){const c=cx(i),r=cy(i),x=ox+c*cell,y=oy+r*cell;
    const off=(dc,dr)=>{const cc=c+dc,r2=r+dr;return cc<0||r2<0||cc>=L.cols||r2>=L.rows||!seen[r2*L.cols+cc];};
    if(off(0,-1)){ctx.moveTo(x,y);ctx.lineTo(x+cell,y);}if(off(0,1)){ctx.moveTo(x,y+cell);ctx.lineTo(x+cell,y+cell);}
    if(off(-1,0)){ctx.moveTo(x,y);ctx.lineTo(x,y+cell);}if(off(1,0)){ctx.moveTo(x+cell,y);ctx.lineTo(x+cell,y+cell);}}
  ctx.stroke();ctx.restore();
}
function tag(text,x,y,col){A.label(ctx,text,x,y,Math.max(10,cell*.19),'#1e1915',col);}
function drawSan(f,now){
  const seen=L.seen[S.san.p],hot=S.phase==='hiss';
  drawCone(seen,hot,now);
  const e=L.tl[S.san.p],[sx,sy,face]=sanPos(f),sxp=ox+(sx+.5)*cell,syp=oy+(sy+.5)*cell;
  const walking=!hot&&e.from!==e.to;
  A.cat(ctx,sxp,syp,cell*.92,ANG[face],{kind:'calico',walk:walking?(e.prog+f/CFG.sanMove)%1:-1,t:now,seed:3,puff:hot});
  return [sxp,syp];
}
function drawKid(f,now){
  const k=S.kid,home=k.state==='play'&&!k.move,on=L.toyOn(S.san.p);
  // what she can hear: wood within earshot of where she is now; faint while the toy plays and she sits with it
  const at=S.kidOcc(),quiet=!(home&&on),hot=S.phase==='hiss';
  ctx.globalAlpha=hot?.5:quiet?.42:.12;
  for(let i=0;i<L.N;i++)if(L.wood(i)&&i!==at&&L.man(i,at)<=CFG.hear)rect(cx(i),cy(i),1,1,hot?COL.alert:COL.ear);
  ctx.globalAlpha=1;
  // the step that made a sound
  if(S.noise&&S.tick-S.noise.tick<6){const a=(S.tick-S.noise.tick+f)/6,nx=ox+(cx(S.noise.cell)+.5)*cell,ny=oy+(cy(S.noise.cell)+.5)*cell;
    ctx.globalAlpha=1-a;ctx.strokeStyle=COL.text;ctx.lineWidth=2;ctx.beginPath();ctx.arc(nx,ny,cell*(.3+.5*a),0,Math.PI*2);ctx.stroke();label('嗒',nx,ny-cell*.55,cell*.26,COL.text);ctx.globalAlpha=1;}
  // her toy stays at her spot
  A.toy(ctx,ox+(cx(L.kid)+.78)*cell,oy+(cy(L.kid)+.72)*cell,cell*.62,home&&on,now);
  const [kx,ky]=moverPos(k.at,k.move,CFG.kidMove,f),kxp=ox+(kx+.5)*cell,kyp=oy+(ky+.5)*cell;
  const angle=kidAng+(k.state==='look'?.3*(Math.cos(S.time()*4)-Math.cos(now*4)):0);
  A.kid(ctx,kxp,kyp,cell*1.15,angle,{sit:home,walk:k.move?(k.move.k+f)/CFG.kidMove%1:-1});
  // toy timer above her while she sits: green and filling down while it plays, grey while quiet
  if(home&&S.phase!=='hiss'){
    const p=((S.san.p%L.P)+L.P)%L.P,bw=cell*1.3,bx=kxp-bw/2+cell*.35,by=kyp-cell*.78;
    const frac=on?L.toyLeft(p)/L.toyLen(p):0; // while quiet there is no countdown: you cannot tell when it starts again
    ctx.fillStyle='#1e1915e0';ctx.fillRect(bx-2,by-cell*.36,bw+4,cell*.52);
    ctx.fillStyle='#4a3a30';ctx.fillRect(bx,by,bw,cell*.12);ctx.fillStyle=on?COL.toy:'#8a90aa';ctx.fillRect(bx,by,bw*frac,cell*.12);
    label(on?'♪ 玩具响 · 听不见':'安静 · 她在听',bx+bw/2,by-cell*.15,Math.max(10,cell*.17),on?COL.toy:COL.dim);
  }
  if(S.phase==='hiss')bubble('抱住啦！',kxp,kyp-cell*.75,cell*.34,COL.alert);
  else if(k.state==='huh')bubble('咦？',kxp,kyp-cell*.72,cell*.34,COL.kid);
  else if(k.state==='walk')bubble('在哪？',kxp,kyp-cell*.72,cell*.26,COL.kid);
  else if(k.state==='look')bubble('？？',kxp,kyp-cell*.72,cell*.3,COL.kid);
}
function drawOwner(now){
  const st=L.owner(S.san.p),dash=S.phase==='dash',hot=st===2||dash;
  if(hot){ctx.globalAlpha=.16;rect(0,0,L.cols,L.rows-1,COL.alert);ctx.globalAlpha=1;}
  A.steam(ctx,ox+2*cell,oy+1.5*cell,cell,now);
  // the shrimp on the plate
  const pc=cx(L.shrimp),pr=cy(L.shrimp),px=ox+(pc+.5)*cell,py=oy+(pr+.5)*cell;
  if(!S.carry){A.shrimp(ctx,px-cell*.12,py-cell*.02,cell*.42,.4);A.shrimp(ctx,px+cell*.14,py+cell*.06,cell*.4,-2.3);A.shrimp(ctx,px+cell*.02,py-cell*.12,cell*.36,1.6);}
  else{ctx.fillStyle='rgba(200,90,40,.35)';ctx.beginPath();ctx.ellipse(px,py,cell*.18,cell*.08,.3,0,Math.PI*2);ctx.fill();}
  // the owner at her seat, below the table edge
  const o=L.def.owner,x=ox+(o.c+.5)*cell,y=oy+(o.r+.5)*cell;
  A.owner(ctx,x,y+cell*.05,cell*1.2,{state:st,dash,t:now});
  const bx=x+cell*1.95,by=y-cell*.18;   // beside her, so her face stays in view
  if(dash)bubble('住手！',bx,by,cell*.4,COL.alert);
  else if(st===0)bubble('低头吃饭',bx,by,cell*.2,COL.dim);
  else if(st===1)bubble('筷子停了…要转头！',bx,by,cell*.24,COL.cone);
  else bubble('看！别动！',bx,by,cell*.3,COL.alert);
}
function drawCat(f,now,k){
  catPose=null;
  let [kx,ky]=moverPos(S.cat.at,S.cat.move,CFG.catMove,f);ky-=k*.9;
  const m=S.cat.move;if(m)catAng=moveAng(m);
  const kxp=ox+(kx+.5)*cell,kyp=oy+(ky+.5)*cell;
  if(S.phase==='hiss'&&Math.floor(flash*10)%2)return [kxp,kyp];
  ctx.globalAlpha=1-k*.85;
  catPose=[kxp,kyp,cell*.95,k>0?-Math.PI/2:catAng,{kind:'orange',walk:m?((m.k+f)/(m.n||CFG.catMove))%1:k>0?(now*2)%1:-1,t:now,seed:0,carry:S.carry}];
  A.cat(ctx,...catPose);
  ctx.globalAlpha=1;
  return [kxp,kyp];
}
function draw(f){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=canvas.width/dpr,H=canvas.height/dpr;
  ctx.fillStyle=COL.bg;ctx.fillRect(0,0,W,H);
  if(!S)return;
  const now=(S.tick+f)*CFG.tick;
  const k=exitK(f),ease=k*k*(3-2*k),zoom=1+1.2*ease;
  if(k>0){ // push the camera in on the door
    const dx=ox+(cx(L.door)+.5)*cell,dy=oy+(cy(L.door)+.5)*cell;
    const tx=lerp(dx,W/2,ease),ty=lerp(dy,H/2,ease);
    ctx.setTransform(dpr*zoom,0,0,dpr*zoom,dpr*(tx-dx*zoom),dpr*(ty-dy*zoom));
  }
  if(bgLayer)ctx.drawImage(bgLayer,0,0,W,H);
  if(L.def.id==='living')A.tankDynamic(ctx,ox+2*cell,oy+2*cell,cell*3,cell*2,cell,now);
  drawDoor(now);drawTreat();
  if(S.cat.target>=0){const c=cx(S.cat.target),r=cy(S.cat.target);ctx.strokeStyle=COL.cat;ctx.lineWidth=2.5;ctx.setLineDash([5,4]);ctx.strokeRect(ox+(c+.12)*cell,oy+(r+.12)*cell,cell*.76,cell*.76);ctx.setLineDash([]);}
  let sp=null;
  if(L.type==='sound')drawKid(f,now);else if(L.type==='still')drawOwner(now);else sp=drawSan(f,now);
  const cp=drawCat(f,now,k);
  // the coffee table top goes over the cat: see-through while 小橘 is under it, so you can tell where it is
  if(L.def.id==='living'){const under=L.kind[S.catOcc()]==='T';A.coffeeTableTop(ctx,ox+2*cell,oy+4*cell,cell*3,cell*2,cell,under?.5:1);
    A.label(ctx,under?'藏好了':'茶几 · 底下能藏',ox+3.5*cell,oy+5.62*cell,Math.max(10,cell*.17),'#fff8e8','rgba(40,22,10,.62)');}
  if(S.time()<3&&S.phase==='play'){tag('你 · 小橘',cp[0],cp[1]-cell*.8,'#ffcf8e');if(sp)tag('三花',sp[0],sp[1]-cell*.8,'#f6f1e6');}
  if(sp&&S.phase==='hiss')bubble('哈！',sp[0],sp[1]-cell*.75,cell*.5,COL.alert);
  if(S.phase==='play'||S.phase==='hiss'||S.phase==='dash'){ // goal pointer: tells a first-time player where to go next
    const goal=L.type==='still'&&!S.carry?L.shrimp:L.door,text=L.type==='still'?(S.carry?'叼着虾跳下去':'先来叼虾'):'走进这里过关';
    const gc=cx(goal),fromRight=gc<=1,bob=Math.sin(now*4.5)*cell*.08*(fromRight?-1:1);
    const tip=ox+(fromRight?gc+1.05:gc-.05)*cell+bob,dyp=oy+(cy(goal)+.5)*cell,dir=fromRight?1:-1;
    ctx.fillStyle=COL.door;ctx.beginPath();ctx.moveTo(tip,dyp);ctx.lineTo(tip+dir*cell*.28,dyp-cell*.18);ctx.lineTo(tip+dir*cell*.28,dyp+cell*.18);ctx.fill();
    const bx=fromRight?tip+cell*.3:tip-cell*1.75;
    ctx.fillStyle='#1e1915e0';ctx.beginPath();ctx.roundRect(bx,dyp-cell*.2,cell*1.45,cell*.4,cell*.1);ctx.fill();
    label(text,bx+cell*.72,dyp,Math.max(11,cell*.22),COL.door);
  }
  if(k>0){ // title over the shot, in screen space
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.globalAlpha=Math.min(1,k*2);ctx.fillStyle='#1e1915b0';ctx.fillRect(0,H*.38,W,H*.2);
    label(L.def.exitText,W/2,H*.46,Math.min(W*.11,46),COL.cat);label(`第 ${LV+1} 关完成`,W/2,H*.53,Math.min(W*.05,20),COL.text);ctx.globalAlpha=1;
  }
}

// ---- input
function catAt(e){
  if(!catPose)return false;
  const r=canvas.getBoundingClientRect(),px=Math.floor((e.clientX-r.left)*dpr),py=Math.floor((e.clientY-r.top)*dpr);
  // Replay the last visible pose at the clicked device pixel, without the contact shadow.
  // Using the actual artwork keeps the tail, ears and whiskers in sync with movement and sway.
  hitCtx.setTransform(1,0,0,1,0,0);hitCtx.clearRect(0,0,1,1);
  hitCtx.setTransform(dpr,0,0,dpr,-px,-py);
  const [x,y,s,ang,o]=catPose;A.cat(hitCtx,x,y,s,ang,{...o,hitMask:true});
  return hitCtx.getImageData(0,0,1,1).data[3]>0;
}
function cellAt(e){const r=canvas.getBoundingClientRect(),c=Math.floor((e.clientX-r.left-ox)/cell),rr=Math.floor((e.clientY-r.top-oy)/cell);return (c<0||rr<0||c>=L.cols||rr>=L.rows)?-1:rr*L.cols+c;}
canvas.addEventListener('pointerdown',e=>{
  if(!S||paused||frozen||S.phase!=='play')return;
  const i=cellAt(e);
  if(i===S.catOcc()||i===S.cat.at||catAt(e)){S.stop();say('小橘停下了。');return;}
  if(i<0)return;
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
    if(ev==='toyOn'&&S.kid.state==='play')say('玩具响了！她听不见，快过木地板！','good');
    if(ev==='toyOff'&&S.kid.state==='play'){const o=S.catOcc(),loud=L.wood(o)&&L.man(o,L.kid)<=CFG.hear&&o!==L.nest;
      say(loud?'玩具停了！站住别动，下一步踩地毯或者等它再响。':'玩具停了，她在听。找块地毯趴着等。',loud?'alert':'');}
    if(ev==='rug'&&S.kid.state==='play'&&!L.toyOn(S.san.p))say('趴在地毯上，她听不见你。等玩具响了再走。','good');
    if(ev==='back')say(TXT[LV].back);
    if(ev==='under')say('钻进茶几底下了，三花看不见你。','good');
    if(ev==='treat')say('拿到猫条了！但还没过关，出口在右上角。','good');
    if(ev==='door'&&!S.caughtWin)say('到出口了！','good');
    if(ev==='warn')say(S.carry?'筷子停了！她要抬头了，快冲！':'筷子停了！她要转头，快停下！','alert');
    if(ev==='look')say('定住！别动！','alert');
    if(ev==='eat')say('她又低头吃饭了，走！','good');
    if(ev==='grab')say('叼到虾了！她下次抬头就会发现盘子空了，赶在那之前拖到左边桌沿！','good');
    if(ev==='shoo'){flash=0;say(TXT[LV].hit,'alert');}
    if(ev==='stop')say(S.events.includes('missing')?'「我的虾呢？！住手！」——快跑，冲到左边桌沿！':'住手！——快跑，冲到左边桌沿！','alert');
    if(ev==='plate'){flash=0;say('没跑掉，盘子被端走了……虾放回盘里，重来。','alert');}
    if(ev==='dashWin')say('当场被抓包，照样得手！','good');
    if(ev==='needShrimp')say('先去叼虾！虾盘在主人跟前。');
    if(ev==='clear'){winCard();}
  }
}
function advanceTicks(n){
  for(let k=0;k<n&&S.phase!=='cleared';k++)stepTick();
  hud();
}
function stepTick(){
  S.step();
  if(S.kid){
    const k=S.kid;
    if(k.move)kidAng=moveAng(k.move);
    else if(k.state==='play')kidAng=0;
    // Integral of the old 60fps look-around speed (0.02 radians per frame), evaluated once per logic tick.
    else if(k.state==='look')kidAng+=.3*(Math.cos((S.tick-1)*CFG.tick*4)-Math.cos(S.time()*4));
  }
  onEvents();
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
  const go=(sd,pilotOf,until,max)=>{start(sd);hideCard();const p=pilotOf(S);for(let n=0;n<max;n++){if(until(S))return true;p();stepTick();if(S.phase==='cleared'&&!until(S))return false;}return until(S);};
  let ok=false;
  if(v==='start')ok=go(1,s=>C.precise(s),s=>s.tick>=20,20);
  else if(v==='hiss'&&LV===0)ok=go(2,s=>C.reckless(s),s=>s.phase==='hiss',600);
  else if(v==='table'&&LV===0)ok=go(3,s=>C.precise(s),s=>L.kind[s.catOcc()]==='T',600);
  // the first seed from 2 up where the reckless run really gets heard / hugged (reckless is not caught every time)
  else if(v==='heard'&&LV===1){for(let sd=2;sd<60&&!ok;sd++)ok=go(sd,s=>C.reckless(s),s=>s.kid.state==='huh',600);}
  else if(v==='hug'&&LV===1){for(let sd=2;sd<60&&!ok;sd++)ok=go(sd,s=>C.reckless(s),s=>s.phase==='hiss',600);}
  else if(v==='warn'&&LV===2)ok=go(1,s=>C.precise(s),s=>L.owner(s.san.p)===1&&s.tick>20,3000);
  else if(v==='stop'&&LV===2){for(let sd=1;sd<80&&!ok;sd++)ok=go(sd,s=>C.human(s,sd),s=>s.phase==='dash',3000);}
  else if(v==='exit')ok=go(4,s=>C.precise(s),s=>s.phase==='exit'&&s.exitT>=Math.floor(CFG.exit*.6),3000);
  else if(v==='clear')ok=go(4,s=>C.precise(s),s=>s.phase==='cleared',3000);
  viewOk=ok?v:'failed:'+v;hud();
  if(!ok){$('card').hidden=true;say('机位 '+v+' 没能进入请求的状态','alert');}
}
function snapshot(){return S?{view:viewOk,level:LV+1,seed,tick:S.tick,time:S.time(),phase:S.phase,stepsLeft:S.stepsLeft(),exitT:S.exitT,hissed:S.hissed,treat:S.treat,
  cat:S.cat.at,catOcc:S.catOcc(),under:L.kind[S.catOcc()]==='T',clock:S.san.p,kid:S.kid?S.kid.state:null,carry:S.carry,owner:L.owner?L.owner(S.san.p):null,cell,paused,frozen}:{view:viewOk};}
window.__sneak={get state(){return S;},snapshot,paint(){draw(0);}};
window.__PLAYTEST__={get ready(){return !!S;},snapshot,reset(){start(seed);hideCard();paused=false;},setSeed(n){start(n);hideCard();paused=false;},step(ms){advanceTicks(Math.round(ms/1000/CFG.tick));}};

layout();
if(view)runView(view);else{start(newSeed());startCard(LV);}
requestAnimationFrame(t=>{last=t;frame(t);});
})();
