// 小黑煤球盖广州: drawing, input, saving, fixed views and test hooks. Rules live in core.js, building data in buildings.js.
(function(){
'use strict';
const C=window.CoalCore,B=window.COAL_BUILDINGS,CFG=C.CFG;
const cv=document.getElementById('stage'),ctx=cv.getContext('2d');
const Q=new URLSearchParams(location.search),VIEW=Q.get('view'),SEED=+(Q.get('seed')||0)||Math.floor(Math.random()*1e6)+1;
const ALPHA='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',KEY='coal-build-v1',FONT='"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
const COL={sky0:'#f3cf9b',sky1:'#fbeed6',ground:'#cdb48a',groundLine:'#a88d64',panel:'#2b2622',text:'#fff6e6',sub:'#d8c9b0',
  btn:'#f08a3c',btnEdge:'#8a4a1c',off:'#8d847a',coin:'#f2c14e',target:'#d2483c',coal:'#111111',pink:'#FF5DA2',brick:'#7f8a94',bamboo:'#c8a45a'};
const lerp=(a,b,t)=>a+(b-a)*t,clamp=(v,a,b)=>v<a?a:v>b?b:v,ease=t=>1-Math.pow(1-t,3);

// ---------- images ----------
const IMG=B.map(b=>{const im=new Image();im.src=b.img;return im;});
let imgReady=0;IMG.forEach(im=>{if(im.complete&&im.naturalWidth)imgReady++;else im.onload=()=>{imgReady++;dirtyAll=true;};im.onerror=()=>{imgReady++;};});

// ---------- game ----------
let g,ui;
function fresh(seed){g=C.create({buildings:B,seed});ui=newUi();g.state.phase='play';}
function newUi(){return{textBoxes:[],cardText:{},screen:'title',albumOpen:false,texts:[],flights:[],pend:[],instant:[],mz:[],wph:null,flash:[],dust:[],hopNow:{},allHopUntil:0,reveal:[],banner:null,shine:null,doneAt:null,frozen:false,
  wind:0,shakeT:0,lastSave:0,hadSave:false,pointerHint:0,buyPulse:{},skillFlash:0};}
fresh(SEED);
function trySave(){try{localStorage.setItem(KEY,JSON.stringify(g.save()));}catch(e){}}
function tryLoad(){try{const o=JSON.parse(localStorage.getItem(KEY)||'null');if(o&&g.load(o)){ui.hadSave=true;return true;}}catch(e){}return false;}

// ---------- layout & per-building geometry ----------
let W=0,H=0,DPR=1,OX=0,L=null,geo=null,dirtyAll=true;
const safeEl=document.createElement('div');safeEl.style.cssText='position:fixed;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden';document.body.appendChild(safeEl);
function resize(){
  DPR=Math.min(3,window.devicePixelRatio||1);const vw=window.innerWidth,vh=window.innerHeight;
  cv.width=Math.round(vw*DPR);cv.height=Math.round(vh*DPR);
  W=Math.min(vw,470);H=vh;OX=Math.round((vw-W)/2);
  relayout();
}
function curB(){return B[Math.min(g.state.bi,B.length-1)];}
function relayout(){
  const safeB=parseFloat(getComputedStyle(safeEl).paddingBottom)||0;
  L=C.layout(W,H,curB().aspect,safeB);buildGeo();
}
function buildGeo(){
  const b=curB(),R=L.building,bw=R.w/b.cols,bh=R.h/b.rows;
  const cells=[];const r=C.rng(g.state.seed*101+g.state.bi*17+3);
  for(let row=0;row<b.rows;row++){
    const s=b.cells[row],off=row%2?0.5:0,list=[];
    for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='.')continue;
      const x0=Math.max(0,(i-off)*bw),x1=Math.min(R.w,(i-off+1)*bw);
      list.push({x:R.x+x0,y:R.y+R.h-(row+1)*bh,w:x1-x0,h:bh,c:b.palette[ALPHA.indexOf(ch)],row});}
    for(let i=list.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
    cells.push(...list);
  }
  geo={b,cells,bw,bh,cache:null,blue:null,stageY:b.stages.map(st=>R.y+R.h-st.rows*bh)};
  // cached layers at device resolution
  const cw=Math.ceil(R.w*DPR)+2,ch=Math.ceil(R.h*DPR)+2;
  geo.cache=document.createElement('canvas');geo.cache.width=cw;geo.cache.height=ch;
  geo.blue=document.createElement('canvas');geo.blue.width=cw;geo.blue.height=ch;
  drawBlueprint();
  ui.flights=[];ui.pend=[];ui.instant=[];ui.mz=[];ui.wph=null;ui.flash=[];ui.dust=[];
  for(let i=0;i<g.state.laid;i++)paintCell(i);
}
function drawBlueprint(){
  const c=geo.blue.getContext('2d'),R=L.building,im=IMG[g.state.bi]||IMG[0];
  c.setTransform(DPR,0,0,DPR,-R.x*DPR,-R.y*DPR);c.clearRect(R.x,R.y,R.w+2,R.h+2);
  // brick pattern of the whole outline: what is still to be built
  c.fillStyle='rgba(255,255,255,0.28)';
  for(const k of geo.cells)c.fillRect(k.x+0.35,k.y+0.35,k.w-0.7,k.h-0.7);
  if(im&&im.naturalWidth){c.globalAlpha=0.22;c.drawImage(im,R.x,R.y,R.w,R.h);c.globalAlpha=1;}
}
function paintCell(i){
  const k=geo.cells[i];if(!k)return;const c=geo.cache.getContext('2d'),R=L.building;
  c.setTransform(DPR,0,0,DPR,-R.x*DPR,-R.y*DPR);
  const gap=geo.bw>=6?0.45:0.25;
  c.fillStyle='rgba(60,40,28,0.55)';c.fillRect(k.x,k.y,k.w,k.h);c.fillStyle=k.c;c.fillRect(k.x+gap,k.y+gap,k.w-gap*2,k.h-gap*2);
  if(geo.bw>=7){c.fillStyle='rgba(255,255,255,0.16)';c.fillRect(k.x+gap,k.y+gap,k.w-gap*2,Math.max(0.6,k.h*0.18));}
}

// ---------- input ----------
function hitList(){
  const s=g.state,list=[];
  if(ui.screen==='title')return[{id:'start',r:L.button}];
  if(ui.albumOpen||s.phase==='album')return[{id:s.phase==='album'?'restart':'closeAlbum',r:L.button}];
  if(s.phase==='done')return ui.doneReady?[{id:'next',r:L.button}]:[];
  list.push({id:'album',r:L.album});
  for(const c of L.cards)list.push({id:'buy:'+c.kind,r:c});
  list.push({id:'skill',r:L.skill});
  const er=eventRect();if(er)list.push({id:'event',r:er});
  const R=L.building;list.push({id:'building',r:{x:R.x-6,y:Math.min(R.y,L.stage.y+4),w:R.w+12,h:L.ground+14-Math.min(R.y,L.stage.y+4)}});
  return list;
}
function eventRect(){return C.eventRect(L,g.state);}
const inR=(r,x,y)=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;
function act(id){
  const s=g.state;
  if(id==='start'){ui.screen='play';return true;}
  if(id==='album'){ui.albumOpen=true;return true;}
  if(id==='closeAlbum'){ui.albumOpen=false;return true;}
  if(id==='restart'){try{localStorage.removeItem(KEY);}catch(e){}fresh(Math.floor(Math.random()*1e6)+1);ui.screen='play';relayout();return true;}
  if(id==='next'){g.next();ui.doneReady=false;ui.reveal=[];relayout();trySave();return true;}
  if(id.startsWith('buy:')){const k=id.slice(4);const ok=g.buy(k);const c=L.cards.find(c=>c.kind===k);
    if(ok){ui.buyPulse[k]=now;note(C.LABEL[k]+' Lv.'+g.state.lv[k],c.x+c.w/2,'#ffcf5a');}
    else{ui.buyPulse[k]=-now;const lb=C.cardLabel(g,k);note(lb.kind==='full'?'工棚住满了，先「扩工棚」':lb.kind==='short'?lb.lead:'现在不能买',c.x+c.w/2,'#fff6e6');}
    return ok;}
  if(id==='skill'){const ok=g.useSkill();if(ok)ui.skillFlash=now;return ok;}
  if(id==='event')return g.collect();
  if(id==='building'){const ok=g.tap();return ok;}
  return false;
}
let now=0;
cv.addEventListener('pointerdown',ev=>{
  ev.preventDefault();const x=ev.clientX-OX,y=ev.clientY;
  for(const h of hitList())if(inR(h.r,x,y)){act(h.id);return;}
},{passive:false});
document.addEventListener('visibilitychange',()=>{if(document.hidden)trySave();});
window.addEventListener('pagehide',trySave);
window.addEventListener('resize',()=>{resize();});

// ---------- events from the rules -> visuals ----------
function addText(t,x,y,color,size,life){ui.texts.push({t,x,y,color:color||'#fff6e6',size:size||14,t0:now,life:life||1.2});}
// short notes about a card float in the strip just above the cards, never on top of one
function note(t,x,color){ui.texts=ui.texts.filter(q=>q.kind!=='note');ui.texts.push({t,x,y:L.noteY,color,size:14,t0:now,life:1.1,kind:'note',rise:10});}
// centre announcements take the first free lane so two at once never print over each other
function toast(t,color,size,life){const act=ui.texts.filter(x=>x.lane!=null&&now-x.t0<x.life);if(act.length>=3)ui.texts.splice(ui.texts.indexOf(act[0]),1);const used=new Set(ui.texts.filter(x=>x.lane!=null&&now-x.t0<x.life).map(x=>x.lane));let lane=0;while(used.has(lane))lane++;
  ui.texts.push({t,x:W/2,y:L.stage.y+92+lane*30,color:color||'#fff6e6',size:size||17,t0:now,life:life||1.8,lane});}
function handleEvents(){
  const s=g.state,R=L.building;
  for(const e of s.events){
    if(e.type==='lay'){for(let i=e.from;i<e.from+e.n;i++)(e.src==='balls'?ui.pend:ui.instant).push(i);
      if(e.src==='tap'){const k=geo.cells[e.from];if(k)addText('+'+C.fmt(e.coins),k.x+k.w/2,k.y-4,COL.coin,13,0.8);}}
    else if(e.type==='stage'){ui.reveal.push({i:e.index,t0:now});ui.banner={t:e.name+'砌好了！',sub:'奖 '+C.fmt(e.bonus)+' 工钱',t0:now};}
    else if(e.type==='built'){ui.doneAt=now;ui.doneReady=false;trySave();}
    else if(e.type==='skill'){toast('齐心一砌！+'+C.fmt(e.n)+' 块','#fff6e6',20,1.6);ui.shakeT=now;}
    else if(e.type==='event'){
      if(e.kind==='tea')toast('糖水担来了！','#fff6e6',18,1.6);
      else if(e.kind==='wind'){ui.wind=now;toast('穿堂风！煤球跑快了 ×2','#fff6e6',18,2);}
      else toast('地基里挖出旧青砖 +'+e.n+' 块','#fff6e6',17,2);
    }
    else if(e.type==='tea')toast('糖水真甜，跑快一点 +'+C.fmt(e.coins),COL.coin,17,1.8);
    else if(e.type==='eventGone')toast('糖水担走远了',COL.sub,15,1.4);
  }
  s.events.length=0;
}

// ---------- brick flights ----------
const MAXFLY=60;
function landNow(i){paintCell(i);}
function launch(i,w,now0,stamp){
  const k=geo.cells[i];if(!k)return;
  const tx=k.x+k.w/2,ty=k.y+k.h/2,ox=w.head.x,oy=w.head.y,dur=0.32+Math.min(0.4,Math.max(0,oy-ty)/700);
  if(ui.flights.length>=MAXFLY){const f=ui.flights.shift();landNow(f.i);}
  ui.flights.push({i,t0:now0,dur,ox,oy,tx,ty});
  if(stamp)assignStamp(tx,now0+dur);
  if(ui.measure){let d=1e9;for(let j=0;j<walkerCount();j++){const h=walker(j).head;d=Math.min(d,Math.hypot(h.x-ox,h.y-oy));}ui.measure.launch.push(d);}
}
function updateFlights(){
  const n=walkerCount();if(!n)return;
  const ws=Array.from({length:n},(_,i)=>walker(i));
  if(!ui.wph||ui.wph.length!==n)ui.wph=ws.map(w=>w.ph);
  // instant bricks (a tap, the skill, an event): from the walker closest under the spot, or round-robin for a burst
  if(ui.instant.length){
    const burst=ui.instant.length>3;if(burst)ui.allHopUntil=now+0.5;
    ui.instant.forEach((i,j)=>{const k=geo.cells[i];if(!k)return;let w=ws[j%n];
      if(!burst){w=ws.reduce((a,b)=>Math.abs(b.x-k.x)<Math.abs(a.x-k.x)?b:a);ui.hopNow[w.i]=now;}
      launch(i,w,now+(burst?(j%n)*0.02:0),!burst);});
    ui.instant=[];
  }
  // walkers that just reached the toss point throw their bricks: the pending bricks nearest above them
  const tossers=ws.filter(w=>{const a=ui.wph[w.i],b=w.ph;return a<TOSS&&b>=TOSS&&b-a<0.3;});
  ui.wph=ws.map(w=>w.ph);
  if(ui.pend.length&&tossers.length){
    const E=Math.max(0.5,n*g.speed()/CFG.trip),per=Math.max(1,Math.ceil(ui.pend.length/Math.max(1,E*0.6)));
    for(const w of tossers){
      if(!ui.pend.length)break;
      ui.pend.sort((a,b)=>Math.abs(geo.cells[a].x-w.x)-Math.abs(geo.cells[b].x-w.x));
      for(const i of ui.pend.splice(0,Math.min(per,carryN()*4)))launch(i,w,now,true);
    }
  }
  if(ui.pend.length>90){const extra=ui.pend.splice(0,ui.pend.length-60);for(const i of extra)landNow(i);}
  for(let j=0;j<ui.flights.length;j++){const f=ui.flights[j];if(now-f.t0>=f.dur){landNow(f.i);ui.flights.splice(j--,1);
    ui.flash.push({i:f.i,t0:now});for(let d=0;d<3;d++)ui.dust.push({x:f.tx,y:f.ty,vx:(Math.random()-0.5)*40,vy:-10-Math.random()*20,t0:now});
    if(ui.measure)ui.measure.land.push({x:f.tx,t:now});}}
  if(ui.flash.length>80)ui.flash.splice(0,ui.flash.length-80);if(ui.dust.length>120)ui.dust.splice(0,ui.dust.length-120);
}
function drawDust(){
  ui.flash=ui.flash.filter(f=>now-f.t0<0.22);for(const f of ui.flash){const k=geo.cells[f.i];if(!k)continue;ctx.fillStyle='rgba(255,255,240,'+(0.85*(1-(now-f.t0)/0.22))+')';ctx.fillRect(k.x-0.5,k.y-0.5,k.w+1,k.h+1);}
  ui.dust=ui.dust.filter(d=>now-d.t0<0.45);for(const d of ui.dust){const t=now-d.t0;ctx.fillStyle='rgba(200,185,160,'+(0.8*(1-t/0.45))+')';ctx.beginPath();ctx.arc(d.x+d.vx*t,d.y+d.vy*t+40*t*t,1.6,0,7);ctx.fill();}
}

// ---------- drawing helpers ----------
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
function txt(t,x,y,size,color,align,weight){ctx.font=(weight||500)+' '+size+'px '+FONT;ctx.fillStyle=color;ctx.textAlign=align||'left';ctx.textBaseline='middle';ctx.fillText(t,x,y);}
function wrap(t,maxW,size,weight){ctx.font=(weight||400)+' '+size+'px '+FONT;const out=[];let line='';
  const toks=t.match(/[0-9A-Za-z.%×]+|[\s\S]/g)||[];
  for(const tk of toks){if(ctx.measureText(line+tk).width>maxW&&line){if(/^[，。、；：！？」』）]$/.test(tk)){line+=tk;continue;}out.push(line);line=tk.trim()?tk:'';}else line+=tk;}if(line)out.push(line);return out;}
function coin(x,y,r){ctx.fillStyle=COL.coin;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.strokeStyle='#b8862a';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#8a6420';ctx.fillRect(x-r*0.3,y-r*0.3,r*0.6,r*0.6);}
// 小黑煤球 per ip/IP设定: matte black round body, white sticker outline, two white dot eyes, short flat white mouth,
// thin black antenna with a #FF5DA2 ball, two thin legs, no arms. dir: 1 right, -1 left, 0 front. A brick rides on its head.
function coalBall(x,feet,r,dir,phase,carry,hop,o){
  o=o||{};const sq=o.squash||0,tilt=o.tilt||0;
  ctx.save();ctx.translate(x,feet);if(tilt)ctx.rotate(tilt);ctx.scale(1+sq*0.12,1-sq*0.2);ctx.translate(-x,-feet);
  const leg=r*0.75,cy=feet-leg-r-(hop||0),sw=dir?Math.sin(phase)*r*0.45:0;
  const legs=dir?[[x-r*0.15,cy+r*0.8,x-r*0.15+sw,feet-(hop||0)],[x+r*0.15,cy+r*0.8,x+r*0.15-sw,feet-(hop||0)]]
    :[[x-r*0.35,cy+r*0.8,x-r*0.38,feet-(hop||0)],[x+r*0.35,cy+r*0.8,x+r*0.38,feet-(hop||0)]];
  const ax=x+(dir?dir*r*0.3:0),atx=ax+(dir?dir*r*0.2:r*0.12)+Math.sin(phase*0.5)*r*0.08,aty=cy-r-r*0.95;
  const bx=x-(dir?dir*r*0.35:0);
  ctx.lineCap='round';
  // white sticker pass
  ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(2.4,r*0.42);
  for(const l of legs){ctx.beginPath();ctx.moveTo(l[0],l[1]);ctx.lineTo(l[2],l[3]);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(ax,cy-r*0.8);ctx.quadraticCurveTo(ax,aty+r*0.3,atx,aty);ctx.stroke();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,cy,r+Math.max(1.2,r*0.2),0,7);ctx.fill();ctx.beginPath();ctx.arc(atx,aty,r*0.3+Math.max(1,r*0.13),0,7);ctx.fill();
  // black pass
  ctx.strokeStyle=COL.coal;ctx.lineWidth=Math.max(1,r*0.17);
  for(const l of legs){ctx.beginPath();ctx.moveTo(l[0],l[1]);ctx.lineTo(l[2],l[3]);ctx.stroke();}
  ctx.lineWidth=Math.max(0.9,r*0.13);ctx.beginPath();ctx.moveTo(ax,cy-r*0.8);ctx.quadraticCurveTo(ax,aty+r*0.3,atx,aty);ctx.stroke();
  ctx.fillStyle=COL.coal;ctx.beginPath();ctx.arc(x,cy,r,0,7);ctx.fill();
  if(o.glow){ctx.fillStyle='rgba(255,93,162,'+(0.35*o.glow)+')';ctx.beginPath();ctx.arc(atx,aty,r*0.3+4*o.glow,0,7);ctx.fill();}
  ctx.fillStyle=COL.pink;ctx.beginPath();ctx.arc(atx,aty,r*0.3,0,7);ctx.fill();
  // face
  ctx.fillStyle='#fff';ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(0.9,r*0.13);
  if(dir){ctx.beginPath();ctx.arc(x+dir*r*0.45,cy-r*0.12,Math.max(0.9,r*0.16),0,7);ctx.fill();
    ctx.beginPath();ctx.moveTo(x+dir*r*0.5,cy+r*0.3);ctx.lineTo(x+dir*r*0.74,cy+r*0.3);ctx.stroke();}
  else{for(const s of[-1,1]){ctx.beginPath();ctx.arc(x+s*r*0.33,cy-r*0.12,Math.max(0.9,r*0.16),0,7);ctx.fill();}
    ctx.beginPath();ctx.moveTo(x-r*0.18,cy+r*0.3);ctx.lineTo(x+r*0.18,cy+r*0.3);ctx.stroke();}
  const nb=carry?(carry===true?1:carry):0;
  for(let k=0;k<nb;k++){const bw=r*1.5,bh=r*0.6,by=cy-r-bh*(k+1)+r*0.12+k*0.5,bxk=bx+(k%2?r*0.12:0);
    ctx.fillStyle=o.brick||COL.brick;ctx.fillRect(bxk-bw/2,by,bw,bh);ctx.fillStyle='rgba(255,255,255,0.25)';ctx.fillRect(bxk-bw/2,by,bw,bh*0.25);
    ctx.strokeStyle='rgba(40,40,40,0.75)';ctx.lineWidth=0.8;ctx.strokeRect(bxk-bw/2,by,bw,bh);}
  ctx.restore();
}

// ---------- scene ----------
function drawScene(){
  const s=g.state,R=L.building,st=L.stage;
  // sky and ground
  const sky=ctx.createLinearGradient(0,st.y,0,L.ground);sky.addColorStop(0,COL.sky0);sky.addColorStop(1,COL.sky1);
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,L.ground);
  // far skyline silhouettes (low contrast, behind everything)
  ctx.fillStyle='rgba(170,130,90,0.18)';
  for(let i=0;i<9;i++){const x=i*W/8-20,h=26+((i*37)%30);ctx.fillRect(x,L.ground-h,W/8-6,h);}
  ctx.fillStyle=COL.ground;ctx.fillRect(0,L.ground,W,H-L.ground);
  ctx.fillStyle=COL.groundLine;ctx.fillRect(0,L.ground,W,2);
  // blueprint of what is still to build, bricks laid, revealed painting
  const im=IMG[s.bi];
  ctx.drawImage(geo.blue,R.x,R.y,geo.blue.width/DPR,geo.blue.height/DPR);
  const revealed=s.phase==='play'||s.phase==='done'?s.stage:0;
  const lineY=revealed>0?geo.stageY[revealed-1]:R.y+R.h+1;
  ctx.save();ctx.beginPath();ctx.rect(R.x-2,R.y-4,R.w+4,lineY-R.y+4);ctx.clip();
  ctx.drawImage(geo.cache,R.x,R.y,geo.cache.width/DPR,geo.cache.height/DPR);ctx.restore();
  // flights
  for(const f of ui.flights){const p=clamp((now-f.t0)/f.dur,0,1);if(p<=0)continue;const k=geo.cells[f.i],e=ease(p);
    const x=lerp(f.ox,f.tx,e),y=lerp(f.oy,f.ty,e)-Math.sin(p*Math.PI)*Math.max(18,Math.min(40,(f.oy-f.ty)*0.25)),bw=Math.max(k.w*1.3,9),bh=Math.max(k.h*1.3,4.5);
    ctx.fillStyle=k.c;ctx.fillRect(x-bw/2,y-bh/2,bw,bh);ctx.strokeStyle='rgba(40,30,20,0.5)';ctx.lineWidth=0.6;ctx.strokeRect(x-bw/2,y-bh/2,bw,bh);}
  if(revealed>0&&im&&im.naturalWidth){
    ctx.save();ctx.beginPath();ctx.rect(R.x-2,lineY,R.w+4,R.y+R.h-lineY+2);ctx.clip();
    const last=ui.reveal[ui.reveal.length-1],fa=last?clamp((now-last.t0)/0.9,0,1):1;
    // the newest stage fades in over its own band; older stages are already fully shown
    const newTop=lineY,newBot=last&&last.i>0?geo.stageY[last.i-1]:R.y+R.h;
    if(last&&fa<1){
      ctx.drawImage(geo.cache,R.x,R.y,geo.cache.width/DPR,geo.cache.height/DPR);
      ctx.save();ctx.beginPath();ctx.rect(R.x-2,newBot,R.w+4,R.y+R.h-newBot+2);ctx.clip();ctx.drawImage(im,R.x,R.y,R.w,R.h);ctx.restore();
      ctx.globalAlpha=ease(fa);ctx.drawImage(im,R.x,R.y,R.w,R.h);ctx.globalAlpha=1;
      const sy=lerp(newBot,newTop,fa),gr=ctx.createLinearGradient(0,sy-24,0,sy+24);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(0.5,'rgba(255,250,220,0.55)');gr.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=gr;ctx.fillRect(R.x,sy-24,R.w,48);
    }else ctx.drawImage(im,R.x,R.y,R.w,R.h);
    ctx.restore();
  }
  if(s.phase==='play')drawScaffold();
  drawPile();drawBalls();drawEvent();
  if(s.phase==='play')drawTargetLine();
  if(now-ui.wind<CFG.event.windBuff&&s.t<s.buff.until){ctx.strokeStyle='rgba(255,255,255,0.6)';ctx.lineWidth=1.5;
    for(let i=0;i<7;i++){const y=st.y+30+i*((L.ground-st.y-40)/7),x=((now*260+i*97)%(W+120))-60;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+46,y-3);ctx.stroke();}}
}
function frontRowY(){const s=g.state;const k=geo.cells[Math.min(s.laid,geo.cells.length-1)];return k?k.y+k.h:L.building.y;}
function drawScaffold(){
  const R=L.building,fy=Math.max(R.y,frontRowY()-geo.bh);
  // only over the part not yet revealed: two bamboo poles and a plank at the working row
  ctx.strokeStyle=COL.bamboo;ctx.lineWidth=2.4;ctx.lineCap='round';
  for(const x of[R.x-3,R.x+R.w+3]){ctx.beginPath();ctx.moveTo(x,L.ground);ctx.lineTo(x,fy-16);ctx.stroke();
    ctx.strokeStyle='#9c7c3a';for(let y=L.ground-14;y>fy-10;y-=14){ctx.beginPath();ctx.moveTo(x-1.6,y);ctx.lineTo(x+1.6,y);ctx.stroke();}ctx.strokeStyle=COL.bamboo;}
  ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(R.x-8,fy);ctx.lineTo(R.x+R.w+8,fy);ctx.stroke();
  ctx.strokeStyle='#9c7c3a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(R.x-8,fy+1.5);ctx.lineTo(R.x+R.w+8,fy+1.5);ctx.stroke();
  // two masons on the plank, front view, hopping as bricks arrive
  for(const a of masons()){const st=a.stomp>0?a.stomp:0;
    if(st>0){ctx.strokeStyle='rgba(255,246,230,'+(0.8*st)+')';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(a.x,a.feet+1,6+(1-st)*10,2+(1-st)*2.5,0,0,7);ctx.stroke();}
    coalBall(a.x,a.feet,8,0,now*6,false,a.hop,{squash:st*1.6,glow:st});}
  drawDust();
}
function drawPile(){
  const p=L.pile;
  for(let row=0;row<4;row++)for(let i=0;i<4-row;i++){const x=p.x+row*5+i*10,y=p.y+p.h-(row+1)*6;ctx.fillStyle=(row+i)%2?'#7f8a94':'#8f99a2';ctx.fillRect(x,y,9.2,5.4);ctx.strokeStyle='#4d555c';ctx.lineWidth=0.6;ctx.strokeRect(x,y,9.2,5.4);}
  if(g.state.balls>BALLS_DRAWN){ctx.font='700 12px '+FONT;const t='煤球 ×'+g.state.balls,tw=ctx.measureText(t).width;txt(t,clamp(p.x+p.w/2-tw/2,4,W-tw-4),p.y-8,12,'#5a4630','left',700);}
}
const BALLS_DRAWN=60;
// where walker i is right now; the same function draws it and decides where its bricks leave from.
// One trip: walk in with bricks on the head (0-0.42), crouch (0.42-0.5), toss at 0.5, pop up (0.5-0.6), walk back (0.6-1).
const TOSS=0.5;
function walkerCount(){return Math.min(g.state.balls,BALLS_DRAWN);}
function carryN(){const p=g.power();return p>=3?3:p>=2?2:1;}
function walker(i){
  const s=g.state,R=L.building,n=walkerCount(),sp=g.speed(),r=n>30?6:7.5;
  const x0=L.pile.x+L.pile.w+4,ph=((ballClock*sp)/CFG.trip+i*0.6180339)%1;
  const tx=R.x+10+(((i*0.381966)%1)*Math.max(20,R.w-20)),lane=L.ground+1+(i%4)*2.2;
  let x,dir,carry=0,hop=0,squash=0,tilt=0,glow=0;
  const away=x0>tx?-1:1;
  if(ph<0.42){const p=ph/0.42;x=lerp(x0,tx,p);dir=away;carry=carryN();hop=Math.abs(Math.sin(p*Math.PI*9))*1.4;tilt=away*0.1;}
  else if(ph<TOSS){x=tx;dir=away;carry=carryN();squash=Math.sin((ph-0.42)/(TOSS-0.42)*Math.PI*0.5);}
  else if(ph<0.6){const p=(ph-TOSS)/0.1;x=tx;dir=away;hop=Math.sin(p*Math.PI)*9;squash=-0.6*Math.sin(p*Math.PI);glow=1-p;}
  else{const p=(ph-0.6)/0.4;x=lerp(tx,x0,p);dir=-away;hop=Math.abs(Math.sin(p*Math.PI*9))*1.2;}
  const hn=ui.hopNow[i];if(hn&&now-hn<0.3){const p=(now-hn)/0.3;hop=Math.max(hop,Math.sin(p*Math.PI)*8);glow=Math.max(glow,1-p);}
  if(now<ui.allHopUntil){const p=1-(ui.allHopUntil-now)/0.5;hop=Math.max(hop,Math.sin(p*Math.PI)*10);glow=Math.max(glow,1-p);}
  const leg=r*0.75;return{i,x,feet:lane,r,dir,carry,hop,squash,tilt,glow,ph,carryN:carry,head:{x,y:lane-leg-2*r-hop}};
}
function drawBalls(){
  const n=walkerCount(),sp=g.speed(),bc=geo.b.id==='zhenhailou'?'#a5523a':COL.brick;
  for(let i=0;i<n;i++){const w=walker(i);coalBall(w.x,w.feet,w.r,w.dir,ballClock*12*sp+i,w.carry,w.hop,{squash:w.squash,tilt:w.tilt,glow:w.glow,brick:bc});}
}
function masonCount(){return clamp(2+Math.floor(walkerCount()/6),2,6);}
function plankY(){const R=L.building;return Math.max(R.y,frontRowY()-geo.bh);}
function masonsInit(){const M=masonCount(),R=L.building;while(ui.mz.length<M){const m=ui.mz.length;ui.mz.push({x:R.x+R.w*(m+0.5)/M,q:[],j:null});}ui.mz.length=M;}
// a mason takes the landings in its slice of the wall; each landing: jump there, arrive with the brick, stamp it
function assignStamp(tx,tLand){
  masonsInit();const R=L.building,M=ui.mz.length,m=clamp(Math.floor((tx-R.x)/R.w*M),0,M-1),z=ui.mz[m];
  const near=z.q.find(q=>Math.abs(q.x-tx)<=14&&Math.abs(q.t-tLand)<0.2)||(z.j&&Math.abs(z.j.x1-tx)<=14&&Math.abs(z.j.t1-tLand)<0.2);
  if(!near)z.q.push({x:tx,t:tLand});
}
function mason(m){
  const z=ui.mz[m],fy=plankY();
  if(z.j&&now>z.j.t1+0.2){z.x=z.j.x1;z.j=null;}
  if(!z.j&&z.q.length){z.q.sort((a,b)=>a.t-b.t);while(z.q.length>1&&z.q[0].t<now-0.3)z.q.shift();const nx=z.q.shift();const t1=Math.max(nx.t,now+0.12);z.j={x0:z.x,x1:nx.x,t0:Math.max(now,t1-0.26),t1};}
  let x=z.x,hop=0,stomp=0;
  if(z.j){const j=z.j;if(now<j.t0){x=j.x0;}else if(now<j.t1){const p=(now-j.t0)/(j.t1-j.t0);x=lerp(j.x0,j.x1,ease(p));hop=Math.sin(p*Math.PI)*Math.min(14,6+Math.abs(j.x1-j.x0)*0.08);}
    else{x=j.x1;stomp=1-(now-j.t1)/0.2;}}
  else hop=Math.max(0,Math.sin(now*3+m*1.7))*1.2;
  return{x,feet:fy-1,hop,stomp};
}
function masons(){masonsInit();return ui.mz.map((_,m)=>mason(m));}
let ballClock=0;
function drawEvent(){
  const P=C.eventParts(L,g.state);if(!P)return;const cr=P.cart,x=cr.x,y=L.ground;
  // a small 糖水 cart rolling by with a coal ball walking beside it
  ctx.fillStyle='#8a5a32';rr(ctx,x+12,y-30,42,18,3);ctx.fill();
  ctx.fillStyle='#5a3a20';for(const wx of[x+20,x+46]){ctx.beginPath();ctx.arc(wx,y-8,6,0,7);ctx.fill();}
  ctx.fillStyle='#c0b8a8';ctx.beginPath();ctx.ellipse(x+33,y-33,13,6,0,0,7);ctx.fill();ctx.fillStyle='#e9e2d2';ctx.fillRect(x+21,y-42,24,9);
  ctx.fillStyle='#c8382c';rr(ctx,x+18,y-58,30,15,3);ctx.fill();txt('糖水',x+33,y-50.5,11,'#fff6e6','center',700);
  coalBall(x+4,y+2,7,1,now*10,false,0);
  const bb=P.bubble,pulse=1+Math.sin(now*6)*0.06;ctx.save();ctx.translate(bb.x+bb.w/2,bb.y+bb.h/2);ctx.scale(pulse,pulse);
  ctx.fillStyle='#fff6e6';rr(ctx,-bb.w/2,-bb.h/2,bb.w,bb.h,12);ctx.fill();ctx.strokeStyle=COL.target;ctx.lineWidth=2;ctx.stroke();
  txt('糖水！点我',0,0,13,'#2b2622','center',700);ctx.restore();
  // a dashed ring shows the whole thing is the button
  ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(255,246,230,0.7)';ctx.lineWidth=1.5;rr(ctx,P.hit.x,P.hit.y,P.hit.w,P.hit.h,12);ctx.stroke();ctx.setLineDash([]);
}
function drawTargetLine(){
  const goal=g.goal(),R=L.building,b=geo.b,idx=Math.min(g.state.stage,b.stages.length-1),y=geo.stageY[idx];
  ctx.setLineDash([6,5]);ctx.strokeStyle=COL.target;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(R.x-12,y);ctx.lineTo(R.x+R.w+12,y);ctx.stroke();ctx.setLineDash([]);
  const label='目标线 · '+goal.stageName+' '+goal.stageDone+'/'+goal.stageSize;
  ctx.font='700 12px '+FONT;const tw=ctx.measureText(label).width+14;
  const P=C.eventParts(L,g.state),lr=C.placeLabel(L,y,tw,P?[P.hit]:[]),lx=lr.x,ly=lr.y;
  ctx.fillStyle=COL.target;rr(ctx,lx,ly,tw,20,10);ctx.fill();txt(label,lx+tw/2,ly+10,12,'#fff','center',700);
  ui.labelRect={x:lx,y:ly,w:tw,h:20};
}

// ---------- HUD ----------
function drawHud(){
  const s=g.state,goal=g.goal(),hint=g.hint();
  ctx.fillStyle=COL.panel;ctx.fillRect(0,0,W,L.top.h);
  coin(18,18,9);txt(C.fmt(s.coins),32,18,18,COL.text,'left',700);
  const rate=g.rate()*g.coinPerBrick();txt('每秒 +'+C.fmt(Math.max(rate,0)+0.5|0)+(g.speed()>1?'  跑快了 ×'+g.speed():''),12,39,11,COL.sub,'left',500);
  // building name and progress
  const b=curB(),px=W-50-8-118;
  txt('第'+(Math.min(s.bi,2)+1)+'栋 '+b.name+(b.weight>1?' · 砖重×'+b.weight:''),px+118,15,12,COL.text,'right',700);
  ctx.fillStyle='#4a423b';rr(ctx,px,28,118,12,6);ctx.fill();ctx.fillStyle='#6fbf73';rr(ctx,px,28,Math.max(12,118*goal.progress),12,6);ctx.fill();
  txt((goal.progress*100).toFixed(1)+'%',px+59,34.5,10,'#fff','center',700);
  // album button
  const a=L.album;ctx.fillStyle='#4a423b';rr(ctx,a.x,a.y,a.w,a.h,8);ctx.fill();
  ctx.fillStyle='#e6d3b0';ctx.fillRect(a.x+12,a.y+7,20,14);ctx.fillStyle='#8a4a1c';ctx.fillRect(a.x+21.5,a.y+7,1,14);
  txt('图鉴 '+s.done.length,a.x+a.w/2,a.y+33,10,COL.text,'center',700);
  // goal row
  ctx.fillStyle='rgba(43,38,34,0.82)';ctx.fillRect(0,L.goal.y,W,L.goal.h);
  txt(goal.text,W/2,L.goal.y+17,goal.last?22:20,goal.last?'#ffcf5a':COL.text,'center',800);
  if(hint.text){const lines=wrap(hint.text,W-24,12,600);txt(lines[0],W/2,L.goal.y+38,12.5,'#ffd9a8','center',600);}
}
function drawCards(){
  const s=g.state,hint=g.hint();
  for(const c of L.cards){
    const k=c.kind,can=g.canBuy(k),full=k==='hire'&&g.full(),bp=ui.buyPulse[k]||0;
    const pop=bp>0?Math.max(0,1-(now-bp)/0.25):0,shake=bp<0?Math.max(0,1-(now+bp)/0.3):0;
    const bob=can&&hint.target===k?Math.sin(now*6)*1.5:0;
    ctx.save();ctx.translate(c.x+c.w/2+Math.sin(now*60)*shake*6,c.y+c.h/2+bob);ctx.scale(1+pop*0.05,1+pop*0.05);ctx.translate(-c.w/2,-c.h/2);
    ctx.fillStyle=COL.panel;rr(ctx,0,0,c.w,c.h,10);ctx.fill();
    if(hint.target===k){ctx.strokeStyle='#ffcf5a';ctx.lineWidth=2.5;rr(ctx,1,1,c.w-2,c.h-2,10);ctx.stroke();}
    // icon
    cardIcon(k,22,24);
    txt(C.LABEL[k],42,15,15,COL.text,'left',800);
    txt('Lv.'+s.lv[k],c.w-10,15,11,COL.sub,'right',600);
    const val=k==='hire'?'煤球 '+s.balls+'/'+g.cap()+' 只':k==='shed'?'工棚住 '+g.cap()+' 只':k==='power'?'一趟搬 '+fmtNum(g.power())+' 块':'每块 '+fmtNum(g.coinPerBrick())+' 工钱';
    txt(val,42,33,11.5,COL.sub,'left',500);
    // price pill
    const px=8,pw=c.w-16,py=c.h-30,ph=24;
    ctx.fillStyle=can?COL.btn:COL.off;rr(ctx,px,py,pw,ph,12);ctx.fill();
    if(can){ctx.fillStyle=COL.btnEdge;ctx.globalAlpha=0.35;rr(ctx,px,py+ph-4,pw,4,2);ctx.fill();ctx.globalAlpha=1;}
    const lb=C.cardLabel(g,k);ui.cardText[k]=lb.lead+(lb.cost!=null?' '+C.fmt(lb.cost):'');
    const fg=can?'#2b2622':'#f4ede2';ctx.font='700 12px '+FONT;
    if(lb.cost==null)txt(lb.lead,c.w/2,py+ph/2,12,fg,'center',700);
    else{const lead=lb.lead+'  ',tw=ctx.measureText(lead+C.fmt(lb.cost)).width+14,sx=c.w/2-tw/2;
      txt(lead,sx,py+ph/2,12,fg,'left',700);const cx=sx+ctx.measureText(lead).width;coin(cx+5,py+ph/2,5);txt(C.fmt(lb.cost),cx+13,py+ph/2,12,fg,'left',700);}
    ctx.restore();
  }
}
const fmtNum=v=>Math.abs(v-Math.round(v))<1e-6?String(Math.round(v)):v.toFixed(1);
function cardIcon(k,x,y){
  if(k==='hire')coalBall(x,y+12,8,0,0,false,0);
  else if(k==='shed'){ctx.fillStyle='#c8a45a';ctx.beginPath();ctx.moveTo(x-13,y);ctx.lineTo(x,y-11);ctx.lineTo(x+13,y);ctx.closePath();ctx.fill();ctx.fillStyle='#8a6a3a';ctx.fillRect(x-10,y,20,13);ctx.fillStyle=COL.panel;ctx.fillRect(x-3,y+4,6,9);}
  else if(k==='power'){for(let i=0;i<3;i++){ctx.fillStyle=i%2?'#8f99a2':'#7f8a94';ctx.fillRect(x-10+i*1.5,y+6-i*7,20,6);}ctx.fillStyle='#ffcf5a';ctx.beginPath();ctx.moveTo(x+10,y-14);ctx.lineTo(x+15,y-8);ctx.lineTo(x+5,y-8);ctx.closePath();ctx.fill();}
  else coin(x,y,11);
}
function drawSkill(){
  const s=g.state,r=L.skill,cx=r.x+r.w/2,cy=r.y+r.h/2,ready=g.skillReady(),hint=g.hint();
  ctx.fillStyle=ready?'#f08a3c':'rgba(43,38,34,0.85)';ctx.beginPath();ctx.arc(cx,cy,r.w/2,0,7);ctx.fill();
  if(!ready){const left=Math.max(0,s.skillAt-s.t),tot=s.skillAt<=CFG.skill.first+1e-6?CFG.skill.first:CFG.skill.cool,p=1-left/tot;
    ctx.strokeStyle='#f08a3c';ctx.lineWidth=4;ctx.beginPath();ctx.arc(cx,cy,r.w/2-3,-Math.PI/2,-Math.PI/2+p*Math.PI*2);ctx.stroke();
    txt('齐心一砌',cx,cy-7,11,COL.text,'center',800);txt(Math.ceil(left)+' 秒',cx,cy+10,12,'#ffcf5a','center',700);}
  else{const pulse=1+Math.sin(now*6)*0.08;ctx.strokeStyle='#ffcf5a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,r.w/2*pulse+2,0,7);ctx.stroke();
    txt('齐心一砌',cx,cy-7,11,'#2b2622','center',800);txt('点我',cx,cy+10,13,'#2b2622','center',800);}
}
function drawPointer(){
  const h=g.hint();let x,y;
  if(h.target==='building'){const R=L.building,fy=frontRowY();x=R.x+R.w/2;y=clamp(fy-30,L.stage.y+30,L.ground-40);
    const p=(now%1.2)/1.2;ctx.strokeStyle='rgba(255,255,255,'+(1-p)+')';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y+24,8+p*22,0,7);ctx.stroke();
    ctx.fillStyle='rgba(43,38,34,0.85)';rr(ctx,x-34,y-34,68,22,11);ctx.fill();txt('点这里',x,y-23,12,'#fff6e6','center',700);}
  else if(h.target&&C.KINDS.includes(h.target)){const c=L.cards.find(c=>c.kind===h.target);x=c.x+c.w/2;y=c.y-4;}
  else if(h.target==='skill'){x=L.skill.x+L.skill.w+12;y=L.skill.y+L.skill.h/2;drawArrow(x,y,'left');return;}
  else if(h.target==='event'){const r=eventRect();if(!r)return;x=r.x+r.w/2;y=r.y-34;}
  else return;
  if(h.target!=='building')drawArrow(x,y,'down');else drawArrow(x,y+12,'down');
}
function drawArrow(x,y,dir){
  const b=Math.sin(now*7)*4;ctx.save();ctx.translate(x,y);if(dir==='left')ctx.rotate(Math.PI/2);ctx.translate(0,b);
  ctx.fillStyle='#ffcf5a';ctx.strokeStyle='#2b2622';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-9,-16);ctx.lineTo(9,-16);ctx.lineTo(9,-6);ctx.lineTo(15,-6);ctx.lineTo(0,6);ctx.lineTo(-15,-6);ctx.lineTo(-9,-6);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
function drawTexts(){
  ui.textBoxes=[];
  ui.texts=ui.texts.filter(t=>now-t.t0<t.life);
  for(const t of ui.texts){const p=(now-t.t0)/t.life;ctx.globalAlpha=1-Math.max(0,p-0.6)/0.4;
    ctx.font='800 '+t.size+'px '+FONT;ctx.lineWidth=3.5;ctx.strokeStyle='rgba(43,38,34,0.85)';ctx.textAlign='center';ctx.textBaseline='middle';
    const y=t.y-p*(t.rise!=null?t.rise:22);const tw=ctx.measureText(t.t).width,x=clamp(t.x,tw/2+6,W-tw/2-6);ctx.strokeText(t.t,x,y);ctx.fillStyle=t.color;ctx.fillText(t.t,x,y);ctx.globalAlpha=1;
    ui.textBoxes.push({t:t.t,kind:t.lane!=null?'toast':t.kind||'float',x:x-tw/2,y:y-t.size/2,w:tw,h:t.size});}
  const bn=ui.banner;if(bn&&now-bn.t0<2){const p=(now-bn.t0)/2,a=p<0.15?p/0.15:p>0.75?(1-p)/0.25:1,y=L.stage.y+L.stage.h*0.55;
    ctx.globalAlpha=a;ctx.fillStyle='rgba(43,38,34,0.88)';rr(ctx,W/2-120,y-30,240,60,14);ctx.fill();ui.textBoxes.push({t:bn.t,kind:'banner',x:W/2-120,y:y-30,w:240,h:60});
    txt(bn.t,W/2,y-8,20,'#ffcf5a','center',800);txt(bn.sub,W/2,y+16,13,COL.text,'center',600);ctx.globalAlpha=1;}
}

// ---------- overlays ----------
function scrim(){ctx.fillStyle='#1c1815';ctx.fillRect(0,0,W,H);}
function bigButton(label,primary){const b=L.button,pulse=primary?1+Math.sin(now*4)*0.025:1;ctx.save();ctx.translate(b.x+b.w/2,b.y+b.h/2);ctx.scale(pulse,pulse);
  ctx.fillStyle=COL.btnEdge;rr(ctx,-b.w/2,-b.h/2+4,b.w,b.h,14);ctx.fill();ctx.fillStyle=COL.btn;rr(ctx,-b.w/2,-b.h/2,b.w,b.h,14);ctx.fill();
  txt(label,0,0,label.length>6?17:20,'#2b2622','center',800);ctx.restore();}
function fitImage(im,x,y,w,h){if(!im||!im.naturalWidth)return null;const s=Math.min(w/im.naturalWidth,h/im.naturalHeight),iw=im.naturalWidth*s,ih=im.naturalHeight*s;const r={x:x+(w-iw)/2,y:y+(h-ih),w:iw,h:ih};ctx.drawImage(im,r.x,r.y,r.w,r.h);return r;}
function drawTitle(){
  scrim(0.95);const o=L.overlay,top=Math.max(44,H*0.1);
  txt('小黑煤球盖广州',W/2,top,30,'#ffcf5a','center',900);
  txt('一群小黑煤球顶着青砖，盖起广州的老房子',W/2,top+38,14.5,COL.text,'center',500);
  const y0=top+66,h=Math.max(120,L.button.y-40-y0),imgH=h-64;
  const sw=(o.w-12)/3;B.forEach((b,i)=>{const im=IMG[i];ctx.globalAlpha=i===0?1:0.4;const r=fitImage(im,o.x+6+i*sw+4,y0,sw-8,imgH);ctx.globalAlpha=1;
    txt((i+1)+'. '+b.name,o.x+6+i*sw+sw/2,y0+imgH+16,13,i===0?'#ffcf5a':COL.sub,'center',700);});
  ctx.fillStyle=COL.ground;ctx.fillRect(o.x,y0+h-8,o.w,2);
  for(let i=0;i<5;i++){const x=o.x+20+((now*28+i*(o.w-40)/5)%(o.w-40));coalBall(x,y0+h-9,8,1,now*12+i,true,0);}
  bigButton(ui.hadSave?'接着盖':'开工',true);
}
function drawDone(){
  const s=g.state,bi=s.done.length-1,b=B[bi],t=now-ui.doneAt;
  if(t<1.4){ // let the last stage reveal play, then a shine
    const R=L.building,p=clamp((t-0.5)/0.8,0,1);if(p>0){const gr=ctx.createLinearGradient(R.x+R.w*(p*2-1),0,R.x+R.w*(p*2-0.5),0);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(0.5,'rgba(255,250,220,0.5)');gr.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gr;ctx.fillRect(R.x,R.y,R.w,R.h);}
    return;}
  ui.doneReady=true;const a=clamp((t-1.4)/0.4,0,1);ctx.globalAlpha=a;scrim(0.96);
  const o=L.overlay;let y=Math.max(28,H*0.06);
  txt(b.name+' 盖好了！',W/2,y+8,26,'#ffcf5a','center',900);y+=34;
  txt('用时 '+fmtTime(s.buildTimes[bi])+(bi<B.length-1?'　收进图鉴，下一栋：'+B[bi+1].name:'　三栋都盖好了'),W/2,y,12.5,COL.sub,'center',600);y+=16;
  const fl=wrap(b.name+'：'+b.fact,o.w-16,14,500),fh=fl.length*21+10;
  const imH=L.button.y-24-fh-y;fitImage(IMG[bi],o.x,y,o.w,imH);y+=imH+14;
  fl.forEach((l,i)=>txt(l,o.x+8,y+i*21,14,COL.text,'left',500));
  bigButton(bi<B.length-1?'收进图鉴，开下一栋':'收进图鉴',true);ctx.globalAlpha=1;
}
const fmtTime=sec=>{sec=Math.round(sec||0);const m=Math.floor(sec/60),s=sec%60;return(m?m+' 分 ':'')+s+' 秒';};
function drawAlbum(){
  scrim(0.97);const s=g.state,o=L.overlay;let y=Math.max(26,H*0.05);
  txt('图鉴 '+s.done.length+'/'+B.length,W/2,y+6,24,'#ffcf5a','center',900);y+=28;
  const slotH=(L.button.y-16-y)/B.length;
  B.forEach((b,i)=>{const got=s.done.includes(b.id),sy=y+i*slotH;
    ctx.fillStyle='rgba(255,246,230,0.07)';rr(ctx,o.x,sy+3,o.w,slotH-6,12);ctx.fill();
    const iw=Math.min(o.w*0.42,(slotH-14)*1.6);ctx.globalAlpha=got?1:0.22;fitImage(IMG[i],o.x+6,sy+8,iw,slotH-16);ctx.globalAlpha=1;
    const tx=o.x+iw+16,tw=o.w-iw-24;txt((i+1)+'. '+b.name,tx,sy+20,16,got?'#ffcf5a':COL.sub,'left',800);
    if(got){wrap(b.fact,tw,11.5,500).slice(0,Math.floor((slotH-40)/16)).forEach((l,j)=>txt(l,tx,sy+42+j*16,11.5,COL.text,'left',500));}
    else txt(i===s.bi?'正在盖：'+Math.floor(g.goal().progress*100)+'%':'还没盖',tx,sy+42,12,COL.sub,'left',500);
  });
  bigButton(s.phase==='album'?'从头再盖一遍':'回去接着盖',s.phase==='album');
}

// ---------- loop ----------
let acc=0,last=performance.now(),frameMs=[];
function frame(t){
  const dt=Math.min(0.1,(t-last)/1000);last=t;now+=dt;
  const s=g.state;
  if(ui.screen==='play'&&!ui.frozen&&!ui.albumOpen){acc+=dt;while(acc>=CFG.step){g.step(CFG.step);acc-=CFG.step;}ballClock+=dt;}
  else if(ui.screen!=='play')ballClock+=dt*0.5;
  if(dirtyAll){dirtyAll=false;relayout();}
  handleEvents();updateFlights();
  if(ui.screen==='play'&&!ui.frozen&&now-ui.lastSave>3){ui.lastSave=now;trySave();}
  if(ui.measure&&s.phase==='play')ui.measure.masonAt.push({t:now,m:masons().map(a=>({x:a.x,stomp:a.stomp||0,hop:a.hop}))});
  const t0=performance.now();
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#1c1815';ctx.fillRect(0,0,cv.width,cv.height);
  ctx.setTransform(DPR,0,0,DPR,OX*DPR,0);ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
  if(!ui.bareOverlay){const sh=now-ui.shakeT<0.35?(1-(now-ui.shakeT)/0.35)*3:0;ctx.save();ctx.translate(Math.sin(now*80)*sh,0);drawScene();ctx.restore();
  ctx.fillStyle=COL.ground;ctx.fillRect(0,L.cards[0].y-8,W,H-L.cards[0].y+8);
  drawHud();drawCards();drawSkill();}
  if(ui.screen==='play'&&s.phase==='play'&&!ui.albumOpen)drawPointer();
  drawTexts();
  if(ui.screen==='title')drawTitle();
  else if(ui.albumOpen||s.phase==='album')drawAlbum();
  else if(s.phase==='done')drawDone();
  ctx.restore();
  frameMs.push(performance.now()-t0);if(frameMs.length>240)frameMs.shift();
  requestAnimationFrame(frame);
}

// ---------- fixed views, hooks ----------
function runTo(seed,until){
  fresh(seed);const pl=C.pilot('normal',seed);let n=0;
  while(!until(g.state)&&n++<3600*30*3){pl(g);g.step(CFG.step);g.state.events.length=0;}
  ui.screen='play';relayout();
  ui.reveal=[];
}
const views={
  hero:()=>{runTo(1,s=>s.t>=70);ui.frozen=true;},
  stage:()=>{runTo(1,s=>s.stage>=1);ui.reveal=[{i:0,t0:-9}];ui.frozen=true;},
  done:()=>{runTo(1,s=>s.phase==='done');ui.doneAt=-9;ui.frozen=true;},
  album:()=>{runTo(1,s=>s.phase==='album');ui.frozen=true;}
};
resize();
if(VIEW&&views[VIEW]){views[VIEW]();ui.view=VIEW;}
else{tryLoad();if(g.state.phase==='done')ui.doneAt=-9;relayout();}
function probe(){const s=g.state;return{screen:ui.screen,view:ui.view||null,frozen:ui.frozen,phase:s.phase,albumOpen:ui.albumOpen,t:s.t,coins:s.coins,laid:s.laid,total:curB().total,bi:s.bi,stage:s.stage,
  balls:s.balls,lv:{...s.lv},done:[...s.done],goal:g.goal(),hint:g.hint(),skillReady:g.skillReady(),event:s.event&&{...s.event},eventRect:eventRect(),
  labelRect:ui.labelRect||null,bubble:(C.eventParts(L,g.state)||{}).bubble||null,frontRowY:geo?frontRowY():0,layout:L,ox:OX,dpr:DPR,pending:ui.pend.length,flights:ui.flights.length,frameMs:frameMs.length?frameMs.reduce((a,b)=>a+b,0)/frameMs.length:0,imgReady};}
window.__coalbuild={get ready(){return imgReady>=IMG.length&&!!L;},probe,
  bareOverlay:v=>{ui.bareOverlay=!!v;},
  textBoxes:()=>ui.textBoxes,cardText:()=>({...ui.cardText}),
  measureStart:()=>{ui.measure={launch:[],land:[],masonAt:[]};},
  measureRead:()=>ui.measure,
  walkers:()=>{const n=Math.min(g.state.balls,BALLS_DRAWN);return Array.from({length:n},(_,i)=>walker(i));},
  hits:()=>hitList().map(h=>({id:h.id,r:h.r})),
  autoplay:(level,secs)=>{const pl=C.pilot(level||'normal',g.state.seed);const end=g.state.t+secs;while(g.state.t<end&&g.state.phase==='play'){pl(g);g.step(CFG.step);handleEvents();}ui.texts=[];ui.banner=null;return probe();}};
window.__PLAYTEST__={get ready(){return window.__coalbuild.ready;},snapshot:probe,
  reset:()=>{try{localStorage.removeItem(KEY);}catch(e){}fresh(SEED);ui.screen='play';relayout();},
  setSeed:n=>{fresh(n);ui.screen='play';relayout();},
  step:ms=>{const n=Math.round(ms/1000/CFG.step);for(let i=0;i<n;i++){g.step(CFG.step);}handleEvents();return probe();}};
requestAnimationFrame(frame);
})();
