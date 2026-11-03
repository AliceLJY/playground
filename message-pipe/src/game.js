// 一条消息的旅程 · page: drawing, input, cards, fixed views and the test hooks. Rules live in core.js.
(function(){
'use strict';
const C=window.PipeCore,LV=C.LEVELS;
const $=id=>document.getElementById(id);
const canvas=$('board'),ctx=canvas.getContext('2d');
const COL={bg:'#181a26',tile:'#262a3d',tileEdge:'#363b55',term:'#30364f',pipe:'#5f6684',live:'#ffb347',station:'#3fb8a0',done:'#2f8f73',alert:'#ff5d5d',text:'#f4ecd8',
  cat:'#dc8d35',catLight:'#edaf50',stripe:'#ad652d',white:'#fff0d3',ear:'#d58d74',bike:'#4fc3a1',wheel:'#d9d2c0'};
const params=new URLSearchParams(location.search),VIEW=params.get('view');
const STORE='message-pipe.unlocked';
let unlocked=1;try{unlocked=Math.max(1,Math.min(LV.length,+localStorage.getItem(STORE)||1));}catch(e){}

let S=null,seed=+params.get('seed')||((Date.now()%100000)+1),paused=false,frozen=false,cardMode='title',anim={},face=1,drawMs=[],viewInfo=null,last=0;
let geo={ts:60,ox:0,oy:0};

// ---------- cards ----------
const NUM=C.NUM;
// numbers carry the rule; names are small flavour text
function routeLine(def){return def.stations.map((s,k)=>`<span class="rn">${NUM[k]}<small>${s.name}</small></span>`).join('<span class="ra">→</span>');}
function showCard(mode){
  cardMode=mode;const box=$('cardbox');$('card').hidden=false;
  const def=S?S.def:LV[0];
  if(mode==='title'){
    let lv='';for(let i=0;i<LV.length;i++)lv+=`<button type="button" data-level="${i}" ${i<unlocked?'':'disabled'} aria-label="第 ${i+1} 关">${i+1}</button>`;
    box.innerHTML=`<h1>一条消息的旅程</h1><p class="how"><span>👆 点管道<br>转一转</span><span class="ra">→</span><span><b class="n1">① ② ③</b><br>按数字接</span><span class="ra">→</span><span><b class="go1">▶</b><br>发车</span></p>
      <button type="button" id="c-go">▶ 开始第 ${Math.min(unlocked,LV.length)} 关</button><p class="small">选关</p><div class="levels">${lv}</div>`;
    $('c-go').onclick=()=>intro(Math.min(unlocked,LV.length)-1);
    box.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>intro(+b.dataset.level));
  }else if(mode==='intro'){
    box.innerHTML=`<p class="small">第 ${S.level+1} 关 / 共 ${LV.length} 关</p><h2>${def.title}</h2>
      <p class="route"><span class="rn">▶</span><span class="ra">→</span>${routeLine(def)}<span class="ra">→</span><span class="rn">🏁</span></p>
      <p class="big">⏱ ${def.time} 秒</p><button type="button" id="c-go">▶ 开始</button>`;
    $('c-go').onclick=hideCard;
  }else if(mode==='cleared'){
    const r=S.result,lastLevel=S.level===LV.length-1;
    box.innerHTML=`<h2>🎉 送到了</h2><p class="big">⏱ ${r.time.toFixed(1)} 秒 · 👆 ${r.steps} 下 <span class="small">（最少 ${r.min} 下）</span></p>
      <button type="button" id="c-go">${lastLevel?'▶ 看全部五段':'▶ 下一关'}</button><button type="button" id="c-again">↻ 这关再玩</button>
      <p class="lesson">🐱 ${def.lesson}</p><button type="button" id="c-home" class="ghost">回标题</button>`;
    $('c-go').onclick=()=>lastLevel?showCard('final'):intro(S.level+1);$('c-again').onclick=()=>{seed++;start(S.level,seed);hideCard();};$('c-home').onclick=()=>showCard('title');
  }else if(mode==='timeout'){
    box.innerHTML=`<h2>⏱ 时间到</h2><button type="button" id="c-go">↻ 再来一次</button><p class="small">管道会重新打乱，数字顺序不变。</p><button type="button" id="c-home" class="ghost">回标题</button>`;
    $('c-go').onclick=()=>{seed++;start(S.level,seed);hideCard();};$('c-home').onclick=()=>showCard('title');
  }else if(mode==='final'){
    box.innerHTML=`<h2>🎉 五关都通了</h2><button type="button" id="c-go">↻ 从第一关再玩</button><ol>${LV.map(d=>`<li><b>${d.title}</b>：${d.lesson}</li>`).join('')}</ol>`;
    $('c-go').onclick=()=>intro(0);
  }else if(mode==='pause'){
    box.innerHTML=`<h2>⏸ 暂停</h2><button type="button" id="c-go">▶ 继续</button>`;
    $('c-go').onclick=()=>{paused=false;hideCard();};
  }
  const first=box.querySelector('button:not([disabled])');if(first&&!VIEW)first.focus({preventScroll:true});
}
function hideCard(){$('card').hidden=true;cardMode=null;last=performance.now();}
function intro(level){seed++;start(level,seed);showCard('intro');}

// ---------- state ----------
function start(level,sd){S=C.create({level,seed:sd});S.hint=C.solve(S.def,S.cells).taps[0];anim={};face=1;paused=false;frozen=false;hud();layoutBoard();}
function hud(){
  if(!S)return;const def=S.def;
  $('title').textContent=`第 ${S.level+1} 关 · ${def.title}`;
  const f=S.timeLeft/def.time;$('fill').style.transform=`scaleX(${Math.max(0,f)})`;$('fill').classList.toggle('low',S.timeLeft<10);
  $('stats').textContent=`剩 ${Math.ceil(S.timeLeft)} 秒 · 转了 ${S.steps} 下 · 发车 ${S.rides} 次`;
  const tr=C.trace(def,S.cells),hi=S.fail?S.fail.station:-1;
  let passed=tr.visited;
  if(S.ride){passed=0;tr.steps.forEach((sp,i)=>{const cell=S.cells[sp.r*def.cols+sp.c];if(cell.station>=0&&S.ride.pts.cum[2+2*i]<=S.ride.pos+1e-6)passed=Math.max(passed,cell.station+1);});if(S.fail)passed=S.ride.trace.visited;}
  S.passed=passed;
  const chips=def.stations.map((s,k)=>`<span class="chip ${k===hi?'alert':k<passed?'done':''}"><b>${NUM[k]}</b><small>${s.name}</small></span>`).join('<span class="arrow">→</span>');
  if($('chips').dataset.k!==chips){$('chips').innerHTML=chips;$('chips').dataset.k=chips;}
  const msg=$('msg');
  if(S.fail){msg.textContent=S.fail.text;msg.className='alert';}
  else if(S.phase==='ride'){msg.textContent='小橘猫出发了……';msg.className='';}
  else if(S.phase==='cleared'){msg.textContent='送到了！';msg.className='good';}
  else{const ok=C.reaches(def,S.cells);msg.textContent=ok?'▶ 接到终点了，发车！':'👆 点管道转一转，按 '+def.stations.map((x,k)=>NUM[k]).join(' ')+' 接到终点';msg.className=ok?'good':'';}
  $('go').disabled=S.phase!=='play';
  $('go').classList.toggle('ready',S.phase==='play'&&!S.fail&&C.reaches(def,S.cells));
}

// ---------- geometry ----------
function layoutBoard(){
  const dpr=Math.min(2,window.devicePixelRatio||1);
  document.body.classList.toggle('wide',innerWidth>innerHeight*1.1);
  const r=canvas.getBoundingClientRect();canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(!S)return;const def=S.def;
  const ts=Math.floor(Math.min(r.width/def.cols,r.height/def.rows,96));
  geo={ts,ox:Math.floor((r.width-ts*def.cols)/2),oy:Math.floor((r.height-ts*def.rows)/2),w:r.width,h:r.height,left:r.left,top:r.top};
}
function cellCenter(idx){const d=S.def,c=idx%d.cols,r=Math.floor(idx/d.cols),b=canvas.getBoundingClientRect();return{x:b.left+geo.ox+(c+0.5)*geo.ts,y:b.top+geo.oy+(r+0.5)*geo.ts};}

// ---------- input ----------
canvas.addEventListener('pointerdown',e=>{
  if(!S||cardMode||frozen)return;
  const b=canvas.getBoundingClientRect(),c=Math.floor((e.clientX-b.left-geo.ox)/geo.ts),r=Math.floor((e.clientY-b.top-geo.oy)/geo.ts);
  if(c<0||r<0||c>=S.def.cols||r>=S.def.rows)return;
  const idx=r*S.def.cols+c;if(S.tap(idx)){anim[idx]=performance.now();hud();}
  e.preventDefault();
});
$('again').addEventListener('click',()=>{if(!S||cardMode||frozen)return;seed++;start(S.level,seed);});
$('go').addEventListener('click',()=>{if(S&&!cardMode&&!frozen&&S.dispatch())hud();});
addEventListener('keydown',e=>{if(e.key==='Enter'&&!cardMode&&S&&document.activeElement!==$('go')){if(S.dispatch())hud();}if(e.key==='Escape'&&!cardMode&&S&&!VIEW)pause();});
function pause(){if(!S||cardMode||frozen||S.phase==='cleared'||S.phase==='timeout')return;paused=true;showCard('pause');}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
addEventListener('blur',pause);
addEventListener('resize',()=>{layoutBoard();draw();});

// ---------- drawing ----------
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function pill(cx,cy,text,bg,fg,size){
  ctx.font=`700 ${size}px -apple-system,"PingFang SC","Noto Sans SC",sans-serif`;
  const w=Math.max(ctx.measureText(text).width+size*0.9,size*1.8),h=size*1.55;
  rr(cx-w/2,cy-h/2,w,h,h/2);ctx.fillStyle=bg;ctx.fill();ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,cx,cy+size*0.04);
  return w;
}
function draw(){
  const t0=performance.now();
  ctx.clearRect(0,0,geo.w||canvas.width,geo.h||canvas.height);if(!S)return;
  const def=S.def,{ts,ox,oy}=geo,now=performance.now();
  const tr=C.trace(def,S.cells),live=new Set();
  for(const sp of tr.steps){const idx=sp.r*def.cols+sp.c,cell=S.cells[idx];live.add(cell.type==='X'?idx+'x'+(sp.inSide&1):idx+'');}
  live.add((def.start.r*def.cols+def.start.c)+'');
  const fail=S.fail;
  for(let i=0;i<S.cells.length;i++){
    const cell=S.cells[i],c=i%def.cols,r=Math.floor(i/def.cols),x=ox+c*ts,y=oy+r*ts,cx=x+ts/2,cy=y+ts/2;
    const pad=Math.max(1.5,ts*0.035);
    rr(x+pad,y+pad,ts-2*pad,ts-2*pad,ts*0.14);ctx.fillStyle=cell.fixed?COL.term:COL.tile;ctx.fill();ctx.strokeStyle=COL.tileEdge;ctx.lineWidth=1;ctx.stroke();
    let turn=0;const a=anim[i];if(a!=null){const k=(now-a)/110;if(k>=1)delete anim[i];else turn=-(1-k*k*(3-2*k))*Math.PI/2;}
    ctx.save();ctx.translate(cx,cy);ctx.rotate(turn);
    const m=C.maskOf(cell);ctx.lineCap='butt';ctx.lineWidth=ts*0.2;
    const axisLive=ax=>live.has(cell.type==='X'?i+'x'+ax:i+'');
    for(let d=0;d<4;d++)if(m&(1<<d)){
      ctx.strokeStyle=axisLive(d&1)?COL.live:COL.pipe;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(C.DC[d]*ts/2,C.DR[d]*ts/2);ctx.stroke();
    }
    if(cell.type!=='X'){ctx.fillStyle=axisLive(0)?COL.live:COL.pipe;ctx.beginPath();ctx.arc(0,0,ts*0.1,0,7);ctx.fill();}
    if(cell.type==='X'){ // the axis the route uses goes on top so the crossing reads right
      for(const ax of [0,1])if(axisLive(ax)){ctx.strokeStyle=COL.live;ctx.beginPath();if(ax===0){ctx.moveTo(0,-ts/2);ctx.lineTo(0,ts/2);}else{ctx.moveTo(-ts/2,0);ctx.lineTo(ts/2,0);}ctx.stroke();}
      ctx.fillStyle=COL.tile;ctx.beginPath();ctx.arc(0,0,ts*0.06,0,7);ctx.fill();
    }
    ctx.restore();

    if(cell.station>=0){
      const k=cell.station,hot=fail&&fail.station===k,blink=hot&&Math.floor(now/260)%2===0;
      const bg=hot?(blink?COL.alert:'#a83a3a'):k<(S.passed==null?tr.visited:S.passed)?COL.done:COL.station;
      // the big number is the whole rule; the name underneath is only a skin
      ctx.beginPath();ctx.arc(cx,cy-ts*0.04,ts*0.24,0,7);ctx.fillStyle=bg;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#181a26';ctx.stroke();
      ctx.fillStyle=hot?'#fff':COL.bg;ctx.font=`900 ${Math.round(ts*0.3)}px -apple-system,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(k+1,cx,cy-ts*0.02);
      ctx.font=`600 ${Math.round(Math.max(9,ts*0.135))}px -apple-system,"PingFang SC",sans-serif`;ctx.fillStyle=hot?'#ff8a7a':'#c9c2b2';ctx.fillText(def.stations[k].name,cx,cy+ts*0.34);
      if(hot){ctx.strokeStyle=COL.alert;ctx.lineWidth=3;rr(x+2,y+2,ts-4,ts-4,ts*0.16);ctx.stroke();
        const ay=y-ts*0.02+Math.sin(now/140)*ts*0.05;ctx.fillStyle=COL.alert;ctx.beginPath();ctx.moveTo(cx-ts*0.13,ay-ts*0.16);ctx.lineTo(cx+ts*0.13,ay-ts*0.16);ctx.lineTo(cx,ay);ctx.fill();}
    }
  }
  if(fail&&fail.kind==='break'&&S.ride){ // red cross on the broken joint
    const p=C.pointAt(S.ride.pts,S.ride.stop),px=ox+p.x*ts,py=oy+p.y*ts,s=ts*0.13;
    ctx.strokeStyle=COL.alert;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(px-s,py-s);ctx.lineTo(px+s,py+s);ctx.moveTo(px+s,py-s);ctx.lineTo(px-s,py+s);ctx.stroke();
  }
  // the cat: riding while the route plays out, parked at the start otherwise
  let p,moving=false;
  if(S.ride){p=C.pointAt(S.ride.pts,S.ride.pos);moving=S.phase==='ride';}
  else{const st=def.start,o=S.cells[st.r*def.cols+st.c].open;p={x:st.c+0.5,y:st.r+0.5+(o===0?-0.1:0.16),dx:C.DC[o],dy:0};}
  if(!S.ride||S.ride.pos>=S.ride.stop-1e-6){const e=def.end;if(Math.abs(p.x-e.c-0.5)<0.01&&Math.abs(p.y-e.r-0.5)<0.01)p={...p,y:p.y+(S.cells[e.r*def.cols+e.c].open===0?-0.1:0.16)};}
  if(p.dx>0.01)face=1;else if(p.dx<-0.01)face=-1;
  const cargo=def.id==='dispatch'?'box':'letter';
  const empty=fail&&fail.kind==='emptybox';
  cat(ox+p.x*ts,oy+p.y*ts-ts*0.1,ts*0.74,face,moving?S.t:0,cargo,empty,S.phase==='cleared');
  for(const tm of [def.start,def.end]){ // terminal labels go on top of the cat so they stay readable when it parks there
    const cell=S.cells[tm.r*def.cols+tm.c],cx=ox+(tm.c+0.5)*ts,cy=oy+(tm.r+0.5)*ts,ly=cy+(cell.open===0?ts*0.3:-ts*0.3);
    const fs=Math.max(11,Math.min(15,ts*0.2)),pw=pill(cx,ly,(cell.type==='S'?'▶ ':'')+tm.label,cell.type==='S'?'#ffd27a':'#9fe3c8',COL.bg,fs);
    if(cell.type==='E')flag(cx-pw/2-fs*0.95,ly,fs);
  }
  // first-move hint: a turning arrow on one pipe until the player taps anything
  if(S.phase==='play'&&S.steps===0&&!S.ride&&S.hint!=null){
    const hc=S.hint%def.cols,hr=Math.floor(S.hint/def.cols),hx=ox+(hc+0.5)*ts,hy=oy+(hr+0.5)*ts,a=0.55+0.45*Math.sin(now/220),rad=ts*0.4;
    ctx.save();ctx.globalAlpha=a;ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(3,ts*0.06);ctx.lineCap='round';
    const a0=-Math.PI*0.4+now/600,a1=a0+Math.PI*1.5;ctx.beginPath();ctx.arc(hx,hy,rad,a0,a1);ctx.stroke();
    const ex=hx+Math.cos(a1)*rad,ey=hy+Math.sin(a1)*rad,tx=-Math.sin(a1),ty=Math.cos(a1),hw=ts*0.1;
    ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(ex+tx*hw*1.4,ey+ty*hw*1.4);ctx.lineTo(ex-ty*hw,ey+tx*hw);ctx.lineTo(ex+ty*hw,ey-tx*hw);ctx.fill();ctx.restore();
  }
  drawMs.push(performance.now()-t0);if(drawMs.length>300)drawMs.shift();
}
function flag(x,y,s){ctx.fillStyle='#f4ecd8';ctx.fillRect(x-1,y-s*0.7,2,s*1.4);for(let i=0;i<3;i++)for(let j=0;j<2;j++){ctx.fillStyle=(i+j)%2?'#181a26':'#f4ecd8';ctx.fillRect(x+1+i*s*0.25,y-s*0.7+j*s*0.25,s*0.25,s*0.25);}}
function phone(x,y,s){ctx.fillStyle=COL.bg;rr(x-s*0.55,y-s,s*1.1,s*2,s*0.25);ctx.fill();ctx.fillStyle='#ffd27a';rr(x-s*0.38,y-s*0.78,s*0.76,s*1.4,s*0.1);ctx.fill();}

// Side view orange tabby on a bicycle, about `w` wide, code drawn after the cats in xiaoju-racing / aju-guangzhou-ride.
function cat(x,y,w,dir,t,cargo,empty,happy){
  const s=w/100,crank=t*9;
  ctx.save();ctx.translate(x,y);ctx.scale(dir*s,s);
  ctx.lineCap='round';ctx.lineJoin='round';
  // shadow
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,40,46,6,0,0,7);ctx.fill();
  // wheels
  for(const wx of [-30,30]){ctx.strokeStyle=COL.wheel;ctx.lineWidth=5;ctx.beginPath();ctx.arc(wx,24,15,0,7);ctx.stroke();
    ctx.lineWidth=1.5;ctx.strokeStyle='#8c8778';for(let k=0;k<3;k++){const a=crank*0.6+k*Math.PI/3;ctx.beginPath();ctx.moveTo(wx+Math.cos(a)*13,24+Math.sin(a)*13);ctx.lineTo(wx-Math.cos(a)*13,24-Math.sin(a)*13);ctx.stroke();}}
  // frame
  ctx.strokeStyle=COL.bike;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-30,24);ctx.lineTo(-6,24);ctx.lineTo(18,0);ctx.lineTo(-12,0);ctx.lineTo(-30,24);ctx.moveTo(-6,24);ctx.lineTo(-14,-4);ctx.moveTo(18,0);ctx.lineTo(30,24);ctx.moveTo(18,0);ctx.lineTo(22,-14);ctx.lineTo(30,-16);ctx.stroke();
  // rear rack + cargo
  ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-40,-2);ctx.lineTo(-14,-2);ctx.moveTo(-34,-2);ctx.lineTo(-30,24);ctx.stroke();
  if(cargo==='letter'){ctx.fillStyle='#fffaf0';rr(-44,-20,26,17,2);ctx.fill();ctx.strokeStyle='#c9b48f';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-44,-20);ctx.lineTo(-31,-10);ctx.lineTo(-18,-20);ctx.stroke();ctx.fillStyle=COL.alert;ctx.beginPath();ctx.arc(-31,-9,3,0,7);ctx.fill();}
  else{ctx.fillStyle='#c79a5b';ctx.fillRect(-45,-24,28,22);ctx.fillStyle='#a87c43';
    if(empty){ctx.save();ctx.translate(-45,-24);ctx.rotate(-0.9);ctx.fillRect(0,-3,16,3);ctx.restore();ctx.fillStyle='#3a2a18';ctx.fillRect(-42,-24,22,4);}else ctx.fillRect(-45,-24,28,4);
    ctx.strokeStyle='#e8c48a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-31,-24);ctx.lineTo(-31,-2);ctx.stroke();}
  // pedalling leg
  const fx=-6+Math.cos(crank)*7,fy=24+Math.sin(crank)*7;
  ctx.strokeStyle=COL.cat;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-10,-10);ctx.lineTo((fx-10)/2+4,(fy-10)/2);ctx.lineTo(fx,fy);ctx.stroke();
  ctx.fillStyle=COL.white;ctx.beginPath();ctx.ellipse(fx+2,fy,5,3.5,0,0,7);ctx.fill();
  // tail
  ctx.strokeStyle=COL.cat;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-22,-12);ctx.quadraticCurveTo(-40,-22,-34,-40+Math.sin(t*6)*3);ctx.stroke();
  ctx.strokeStyle=COL.stripe;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-36,-30);ctx.lineTo(-35,-34);ctx.stroke();
  // body leaning toward the bars
  ctx.fillStyle=COL.cat;ctx.beginPath();ctx.ellipse(-4,-16,20,13,-0.45,0,7);ctx.fill();
  ctx.fillStyle=COL.white;ctx.beginPath();ctx.ellipse(4,-12,9,8,-0.4,0,7);ctx.fill();
  ctx.strokeStyle=COL.stripe;ctx.lineWidth=3.5;for(const k of [-14,-6,2]){ctx.beginPath();ctx.moveTo(k,-28+(k+14)*0.35);ctx.lineTo(k+4,-21+(k+14)*0.35);ctx.stroke();}
  // arm to the handlebar
  ctx.strokeStyle=COL.cat;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(6,-20);ctx.lineTo(26,-15);ctx.stroke();ctx.fillStyle=COL.white;ctx.beginPath();ctx.arc(28,-15,3.6,0,7);ctx.fill();
  // head
  const hx=16,hy=-36;
  ctx.fillStyle=COL.cat;for(const ex of [-9,8]){ctx.beginPath();ctx.moveTo(hx+ex-6,hy-6);ctx.lineTo(hx+ex,hy-21);ctx.lineTo(hx+ex+6,hy-6);ctx.fill();}
  ctx.fillStyle=COL.ear;for(const ex of [-9,8]){ctx.beginPath();ctx.moveTo(hx+ex-3,hy-8);ctx.lineTo(hx+ex,hy-16);ctx.lineTo(hx+ex+3,hy-8);ctx.fill();}
  ctx.fillStyle=COL.cat;ctx.beginPath();ctx.ellipse(hx,hy,15,13,0,0,7);ctx.fill();
  ctx.strokeStyle=COL.stripe;ctx.lineWidth=2.6;for(const k of [-5,0,5]){ctx.beginPath();ctx.moveTo(hx+k,hy-12);ctx.lineTo(hx+k*0.6,hy-6);ctx.stroke();}
  ctx.fillStyle=COL.white;ctx.beginPath();ctx.ellipse(hx+7,hy+5,8,6,0,0,7);ctx.fill();
  ctx.fillStyle='#2a1d14';
  if(happy){ctx.strokeStyle='#2a1d14';ctx.lineWidth=2;ctx.beginPath();ctx.arc(hx+5,hy-2,3,Math.PI*1.1,Math.PI*1.9);ctx.stroke();}
  else{ctx.beginPath();ctx.ellipse(hx+5,hy-2,2.2,3,0,0,7);ctx.fill();}
  ctx.fillStyle='#d9736a';ctx.beginPath();ctx.moveTo(hx+12,hy+2);ctx.lineTo(hx+16,hy+2);ctx.lineTo(hx+14,hy+5);ctx.fill();
  ctx.strokeStyle='#fff6e6';ctx.lineWidth=1;for(const k of [-1,2]){ctx.beginPath();ctx.moveTo(hx+14,hy+6);ctx.lineTo(hx+26,hy+5+k*2);ctx.stroke();}
  ctx.restore();
  if(empty){ // the empty box speaks for itself even with the sound off
    ctx.save();ctx.translate(x,y);
    const bx=-dir*w*0.31,by=-w*0.5,rad=w*0.17;ctx.fillStyle=COL.alert;ctx.beginPath();ctx.arc(bx,by,rad,0,7);ctx.fill();
    ctx.beginPath();ctx.moveTo(bx-rad*0.4,by+rad*0.8);ctx.lineTo(bx,by+rad*1.5);ctx.lineTo(bx+rad*0.3,by+rad*0.8);ctx.fill();
    ctx.fillStyle='#fff';ctx.font=`800 ${Math.round(rad*1.15)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('空',bx,by+1);
    ctx.restore();
  }
}

// ---------- loop ----------
function frame(now){
  const dt=Math.min(0.1,(now-(last||now))/1000);last=now;
  if(S&&!paused&&!frozen&&!cardMode){
    let acc=dt;while(acc>1e-6){const h=Math.min(C.CFG.step,acc);if(pilotRef)pilotRef.drive(S,h);S.step(h);acc-=h;}
    S.events.length=0;
  }
  // cards follow the state, not the event stream, so hook-driven advances end the same way as real play
  if(S&&!frozen&&!S.shown&&(S.phase==='cleared'||S.phase==='timeout')){
    const ss=S;ss.shown=true;
    if(ss.phase==='cleared'){try{unlocked=Math.max(unlocked,Math.min(LV.length,ss.level+2));localStorage.setItem(STORE,unlocked);}catch(err){}setTimeout(()=>{if(S===ss)showCard('cleared');},700);}
    else showCard('timeout');
  }
  if(S)hud();draw();requestAnimationFrame(frame);
}
let pilotRef=null;

// ---------- fixed views (SPEC 6) ----------
function advance(sec,stop){const n=Math.round(sec/C.CFG.step);for(let i=0;i<n;i++){if(stop&&stop())break;if(pilotRef)pilotRef.drive(S,C.CFG.step);S.step(C.CFG.step);S.events.length=0;}}
function runView(v){
  const want={start:{level:0,seed:1},emptybox:{level:2,seed:3},ride:{level:4,seed:5},clear:{level:1,seed:2}}[v];
  if(!want)return null;
  start(want.level,+params.get('seed')||want.seed);
  if(v==='start'){pilotRef=C.pilot('human',1);advance(+params.get('t')||6);}
  if(v==='emptybox'){const seq=S.def.stations.map((s,k)=>k).filter(k=>!S.def.stations[k].verify),sol=C.solve(S.def,S.cells,seq);sol.taps.forEach(i=>S.tap(i));S.dispatch();advance(20,()=>!!S.fail);}
  if(v==='ride'){pilotRef=C.pilot('precise',5);advance(30,()=>S.phase==='ride'&&S.ride.pos>S.ride.stop*0.55);}
  if(v==='clear'){pilotRef=C.pilot('precise',2);advance(60,()=>S.phase==='cleared');}
  pilotRef=null;frozen=true;
  if(v==='clear')showCard('cleared');else hideCard();
  hud();
  return {view:v,level:S.level,seed:S.seed,phase:S.phase,fail:S.fail&&S.fail.kind,ridePos:S.ride?+(S.ride.pos/S.ride.stop).toFixed(2):null};
}

function snapshot(){
  if(!S)return {card:cardMode};
  return {card:cardMode,level:S.level,seed:S.seed,phase:S.phase,t:+S.t.toFixed(2),timeLeft:+S.timeLeft.toFixed(2),steps:S.steps,min:S.min,rides:S.rides,fails:S.fails,
    fail:S.fail&&{kind:S.fail.kind,station:S.fail.station,text:S.fail.text},outcome:C.trace(S.def,S.cells).outcome.kind,frozen,paused,view:viewInfo};
}
function api(){
  return {ready:true,view:viewInfo,snapshot,probe(){const g=geo,b=canvas.getBoundingClientRect(),go=$('go').getBoundingClientRect();return {hint:S&&S.phase==='play'&&S.steps===0&&!S.ride?S.hint:null,ready:$('go').classList.contains('ready'),snap:snapshot(),geo:{ts:g.ts,ox:g.ox,oy:g.oy,canvas:[b.left,b.top,b.width,b.height]},go:[go.left,go.top,go.width,go.height],viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,
      drawMean:drawMs.length?drawMs.reduce((a,b)=>a+b,0)/drawMs.length:0,drawMax:drawMs.length?Math.max(...drawMs):0};},
    cellCenter,solution(){return C.solve(S.def,S.cells).taps;},trap(){ // cheapest taps that build the level's first built-in shortcut (it skips a station); for the demo film
      const d=S.def;if(!d.traps.length)return null;let c=d.start.c,r=d.start.r;const seq=[];
      for(const ch of d.traps[0]){const k='NESW'.indexOf(ch);c+=C.DC[k];r+=C.DR[k];const i=d.stations.findIndex(x=>x.c===c&&x.r===r);if(i>=0)seq.push(i);}
      const t=C.solve(d,S.cells,seq);return t?t.taps:null;},
    bypass(){const seq=S.def.stations.map((s,k)=>k).filter(k=>!S.def.stations[k].verify);const r=C.solve(S.def,S.cells,seq);return r?r.taps:null;},
    start(level,sd){start(level,sd);hideCard();},advance,freeze(f){frozen=f!==false;},
    autopilot(mode,sd){pilotRef=mode?C.pilot(mode,sd||1):null;}};
}

start(0,seed);
layoutBoard();
if(VIEW){viewInfo=runView(VIEW);}
else{showCard('title');}
const h=api();
window.__pipe=h;
window.__PLAYTEST__={get ready(){return true;},snapshot,reset(){start(S?S.level:0,seed);hideCard();},setSeed(n){seed=n;start(S?S.level:0,n);hideCard();},step(ms){advance(ms/1000);}};
requestAnimationFrame(t=>{last=t;layoutBoard();frame(t);});
})();
