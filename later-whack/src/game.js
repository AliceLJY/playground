// 推到以后: drawing, input, screens and test hooks. Rules live in core.js.
// Everything is drawn in the 150 x 266 logical frame onto an offscreen canvas at an integer scale, then fitted to the screen.
(function(){
'use strict';
const C=window.LaterCore,{LW,LH,COLS,ROWS,CFG}=C;
const cv=document.getElementById('stage'),ctx=cv.getContext('2d');
const off=document.createElement('canvas'),g=off.getContext('2d'),bg=document.createElement('canvas');
const startBtn=document.getElementById('start'),retryBtn=document.getElementById('retry');
const qs=new URLSearchParams(location.search),view=qs.get('view');
const FONT='"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif';
const COL={tail:'#f08a3c',tailHi:'#f6ad6f',wait:'#3f7fd1',obs:'#4fa36d',ink:'#253334',paper:'#fff6dc',gold:'#ffd75a',red:'#e5484d',skin:'#e3b58d',hair:'#4b4639',out:'#33443f'};
let N=4,scale=1,ox=0,oy=0,cssW=0,cssH=0,dpr=1;
let screen='title',game=null,seed=Math.floor(Math.random()*1e6),pilot=null,frozen=false,paused=false,overAt=0;
let fx=[],slip=null,shake=0,acc=0,last=0,clock=0;
const metrics={frames:0,sumMs:0,maxMs:0,avgFrameMs:0};

const r=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),w,h);};
function text(s,x,y,size,color,align,weight){g.font=(weight||700)+' '+size+'px '+FONT;g.textAlign=align||'center';g.textBaseline='alphabetic';g.fillStyle=color;g.fillText(s,x,y);}

function resize(){
  cssW=window.innerWidth;cssH=window.innerHeight;dpr=Math.min(window.devicePixelRatio||1,3);
  cv.width=Math.round(cssW*dpr);cv.height=Math.round(cssH*dpr);
  scale=Math.min(cssW/LW,cssH/LH);ox=(cssW-LW*scale)/2;oy=(cssH-LH*scale)/2;
  N=Math.max(2,Math.min(8,Math.ceil(scale*dpr)));off.width=bg.width=LW*N;off.height=bg.height=LH*N;
  paintBackground();
}

// ---------- static room ----------
function paintBackground(){
  const b=bg.getContext('2d');b.setTransform(N,0,0,N,0,0);
  const R=(x,y,w,h,c)=>{b.fillStyle=c;b.fillRect(x,y,w,h);};
  R(0,0,LW,LH,'#cfc19c');
  for(let y=24;y<LH;y+=8)for(let x=0;x<LW;x+=8)if(((x+y)/8)%2===0)R(x,y,8,8,'#d8cba9');
  R(0,24,LW,26,'#9fb59a');R(0,48,LW,3,'#6f8a6b');
  for(const wx of [14,62,110]){R(wx,28,26,16,'#5f7c74');R(wx+1,29,24,14,'#bfe0e6');R(wx+12,29,2,14,'#5f7c74');R(wx+1,35,24,1,'#5f7c74');R(wx+2,30,6,2,'#ffffff');}
  // a plant and a water cooler at the wall line
  R(3,40,6,9,'#a0603a');R(1,32,10,9,'#5c9a5a');R(3,30,6,4,'#78b56f');
  R(141,34,7,15,'#d7e3e6');R(142,30,5,6,'#8fc4e0');
  // the pile tray at the bottom
  R(0,218,LW,48,'#b9ab86');R(0,218,LW,2,'#8f8263');
  b.font='700 6px '+FONT;b.textAlign='left';b.fillStyle='#5a4e35';b.fillText('留给下一个窗口',5,227);
  b.textAlign='right';b.fillStyle='#7a6c4c';b.fillText('满三条就下班不了',145,227);
  for(let i=0;i<3;i++){const y=232+i*11;b.strokeStyle='#8f8263';b.lineWidth=0.6;b.setLineDash([2,1.5]);b.strokeRect(6.5,y+0.5,137,9);}
  b.setLineDash([]);
}

// ---------- people ----------
function person(x,yb,shirt,arms){
  r(x-6,yb-18,12,15,COL.out);r(x-5,yb-10,10,8,shirt);
  r(x-5,yb-16,10,7,COL.skin);r(x-6,yb-21,12,6,COL.hair);r(x-6,yb-16,2,5,'#544c3a');
  r(x-3,yb-13,2,2,'#273a34');r(x+2,yb-13,2,2,'#273a34');
  if(arms==='up'){r(x-8,yb-22,3,12,shirt);r(x+5,yb-22,3,12,shirt);r(x-8,yb-24,3,3,'#e4bb91');r(x+5,yb-24,3,3,'#e4bb91');}
  else if(arms==='cross'){r(x-8,yb-10,3,5,shirt);r(x+5,yb-10,3,5,shirt);r(x-6,yb-8,12,3,shirt);r(x-6,yb-8,12,1,'#00000030');r(x-7,yb-8,2,2,'#e4bb91');r(x+5,yb-8,2,2,'#e4bb91');}
  else{r(x-8,yb-10,3,6,shirt);r(x+5,yb-20,3,10,shirt);r(x+5,yb-22,3,3,'#e4bb91');}
}
// 无忧 (boy, orange) and 无虑 (girl, purple, two pigtails), after ai-office; drawn a size up so they read at phone scale
function kid(x,yb,girl){
  const shirt=girl?'#9a6fc4':'#e8963a';
  r(x-4,yb-9,8,8,shirt);r(x-4,yb-16,8,7,'#e4bb91');r(x-4,yb-17,8,3,COL.hair);
  r(x-2,yb-13,2,2,'#2f3a3c');r(x+1,yb-13,2,2,'#2f3a3c');
  if(girl){r(x-6,yb-16,2,5,COL.hair);r(x+4,yb-16,2,5,COL.hair);r(x-6,yb-17,2,1,'#e58fb0');r(x+4,yb-17,2,1,'#e58fb0');}
  r(x-6,yb-20,2,11,shirt);r(x+4,yb-20,2,11,shirt);r(x-6,yb-22,2,2,'#e4bb91');r(x+4,yb-22,2,2,'#e4bb91');
}

// ---------- signs (shapes carry the meaning, text is extra) ----------
function tailSign(e,t){
  const s=C.signRect(e,t);
  r(s.x-1,s.y-1,s.w+2,s.h+2,'#5a3b2a');r(s.x,s.y,s.w,s.h,COL.tail);r(s.x,s.y,s.w,2,COL.tailHi);
  r(s.x+s.w-4,s.y+s.h-2,4,2,COL.paper);r(s.x+s.w-2,s.y+s.h-4,2,2,COL.paper);   // curled-up corner
  text(e.text,s.x+s.w/2,s.y+8.4,6,'#3b2414');
  return s;
}
function waitSign(e){
  const s=C.signRect(e),cx=s.x+s.w/2,cy=s.y+s.h/2;
  g.fillStyle='#1f3f6a';g.beginPath();g.arc(cx,cy,11.6,0,Math.PI*2);g.fill();
  g.fillStyle='#ffffff';g.beginPath();g.arc(cx,cy,10.6,0,Math.PI*2);g.fill();
  g.fillStyle=COL.wait;g.beginPath();g.arc(cx,cy,9,0,Math.PI*2);g.fill();
  text(C.WAIT,cx,cy+2.6,7,'#ffffff');
  r(cx-3,cy-7,6,1,'#ffffff');r(cx-3,cy+5,6,1,'#ffffff');                        // a small hourglass frame top and bottom
  return s;
}
function observerSign(e){
  const s=C.signRect(e),cx=s.x+s.w/2,cy=s.y+s.h/2,h=s.w/2;
  const dia=k=>{g.beginPath();g.moveTo(cx,cy-k);g.lineTo(cx+k,cy);g.lineTo(cx,cy+k);g.lineTo(cx-k,cy);g.closePath();g.fill();};
  g.fillStyle='#24543a';dia(h+1);g.fillStyle=COL.obs;dia(h-0.5);
  g.fillStyle='#ffffff';g.beginPath();g.ellipse(cx,cy-2,6,3.4,0,0,Math.PI*2);g.fill();
  r(cx-1.5,cy-3.5,3,3,'#1d2b24');
  text(C.OBSERVE,cx,cy+6.4,4.5,'#ffffff');
  return s;
}

// ---------- desks ----------
function desk(c,x,y,warn,t,label){
  r(x-22,y+15,46,5,'#4c4d4040');
  r(x+9,y-12,14,12,'#35474a');
  const flick=warn&&Math.floor(t*14)%2===0;
  r(x+10,y-11,12,9,flick?'#c9f3df':'#213b40');
  if(!flick){r(x+11,y-9,8,1,'#71a29a');r(x+11,y-6,5,1,'#5c8d83');}
  r(x+15,y-1,2,2,'#394947');
  r(x-22,y+3,44,14,'#77563f');r(x-22,y+3,44,8,'#a97c52');r(x-24,y,48,5,'#d1a272');r(x-24,y,48,1,'#e0b786');
  r(x-20,y+17,3,4,'#715543');r(x+17,y+17,3,4,'#715543');
  r(x-8,y+7,16,5,'#e1d8ba');
  if(label)text(label.text,x,y+11.2,4.5,label.color);
  else r(x-6,y+9,12,1,'#a99d7d');
  if(warn){const k=Math.floor(t*10)%2;r(x-14-k,y-2,2,2,'#efe6cc');r(x-18+k,y-3,2,1,'#efe6cc');}
}

function riseOf(e,t){
  if(e.state==='warn')return 0;
  if(e.state==='up')return Math.min(1,(t-e.upAt)/CFG.rise);
  if(e.state==='leaving')return Math.max(0,1-(t-e.leaveAt)/CFG.sink);
  if(e.state==='hit')return Math.max(0,1-(t-e.hitAt)/0.25);
  return 0;
}

function drawOffice(s){
  const t=s?s.t:clock;
  for(let row=0;row<3;row++){
    const y=ROWS[row],signs=[];
    for(let col=0;col<3;col++){
      const c=row*3+col,x=COLS[col],e=s&&s.ents.find(q=>q.cell===c&&q.state!=='gone');
      let label=null;
      if(e&&e.state!=='warn'){
        const f=riseOf(e,t),kidHolder=e.holder!=='adult';
        const wob=e.kind==='tail'&&e.state==='up'?Math.round(Math.sin(t*8+e.id)):0;
        const yb=y+(kidHolder?2:3)+Math.round((1-f)*28);
        g.save();g.beginPath();g.rect(x-25,y-70,50,y<0?0:76);g.clip();
        if(e.state==='hit'){g.translate(x,yb);g.scale(1.25,0.7);g.translate(-x,-yb);}
        if(kidHolder)kid(x,yb,e.holder==='wulv');
        else person(x+wob,yb,e.shirt,e.kind==='wait'?'up':e.kind==='observer'?'cross':'one');
        if(e.kind==='tail'){const k=Math.floor(t*6+e.id)%2;r(x-10+wob,yb-7,3,2,COL.tail);r(x-12+wob,yb-11+k,2,4,COL.tail);r(x-11+wob,yb-13+k,3,2,COL.tail);}
        g.restore();
        if(kidHolder)label={text:e.holder==='wulv'?'无虑':'无忧',color:e.holder==='wulv'?'#6b4596':'#9a5a1a'};
        if(f>0.35)signs.push({e,f,yb});
      }
      desk(c,x,y,e&&e.state==='warn',t,label);
    }
    for(const {e,yb} of signs){
      if(e.state==='hit')continue;
      const x=COLS[e.cell%3];
      if(e.kind==='tail'){const sr=C.signRect(e,t);r(sr.x+sr.w/2+5,sr.y+sr.h,1,Math.max(0,yb-22-(sr.y+sr.h)),'#7a5a3c');tailSign(e,t);}
      else if(e.kind==='wait'){const sr=C.signRect(e);r(x,sr.y+sr.h,1,Math.max(0,yb-(e.holder==='adult'?24:22)-(sr.y+sr.h)),'#7a5a3c');waitSign(e);}
      else{const sr=C.signRect(e);r(x+15,sr.y+sr.h-6,1,ROWS[Math.floor(e.cell/3)]-(sr.y+sr.h-6),'#7a5a3c');r(x+13,ROWS[Math.floor(e.cell/3)]-1,5,1,'#5a4330');observerSign(e);}
    }
  }
}

function drawPile(s){
  const pile=s?s.pile:[];
  for(let i=0;i<pile.length;i++){
    const y=232+(2-i)*11,tilt=(i%2?1:-1);
    r(7+tilt,y+1,136,8,'#00000022');r(6,y,136,8,'#f6c08a');r(6,y,3,8,COL.tail);
    text(pile[i],76,y+6.4,5.5,'#5a3b2a');
  }
}

function drawBar(s){
  r(0,0,LW,24,COL.ink);r(0,23,LW,1,'#0f1717');
  text(String(s.score),6,15,10,COL.paper,'left');text('分',6+g.measureText(String(s.score)).width+2,15,5,'#b6c2b8','left');
  const left=Math.max(0,CFG.duration-s.t),k=left/CFG.duration;
  r(52,6,46,6,'#3d4d4e');r(52,6,Math.round(46*k),6,left<10?COL.red:COL.paper);
  text(Math.ceil(left)+' 秒',75,20,5.5,'#b6c2b8');
  const m=C.multiplier(s.combo);
  if(s.combo>0){text('×'+m,145,14,m>1?10:8,m>1?COL.gold:'#b6c2b8','right');text('连击 '+s.combo,145,21,4.5,'#b6c2b8','right');}
}

function drawSlipper(){
  if(!slip)return;
  const age=clock-slip.at;if(age>0.5){slip=null;return;}
  g.save();
  let x=slip.x,y=slip.y,a;
  if(slip.kind==='bounce'){a=-0.6+age*14;x+=age*30;y-=age*60-age*age*120;}
  else{a=age<0.08?-0.9+age/0.08*0.9:0;y-=age<0.08?(1-age/0.08)*10:0;}
  g.translate(x,y);g.rotate(a);g.globalAlpha=age>0.3?Math.max(0,1-(age-0.3)/0.2):1;
  g.fillStyle=slip.kind==='bounce'?'#c9c4b8':'#f7f5ef';g.beginPath();g.ellipse(0,-2,5.5,9,0,0,Math.PI*2);g.fill();
  g.strokeStyle='#5a5547';g.lineWidth=0.6;g.stroke();
  g.strokeStyle=slip.kind==='bounce'?'#7a8597':'#2f6fd6';g.lineWidth=1.6;g.beginPath();g.moveTo(-4.5,0);g.lineTo(0,-7);g.lineTo(4.5,0);g.stroke();
  g.restore();
}

function drawFx(){
  fx=fx.filter(f=>clock-f.at<f.dur);
  for(const f of fx){
    const k=(clock-f.at)/f.dur;
    g.globalAlpha=Math.max(0,1-k*k);
    if(f.type==='text')text(f.text,f.x,f.y-k*12,f.size||7,f.color);
    else if(f.type==='stars')for(let i=0;i<6;i++){const a=i/6*6.283+f.seed,d=4+k*14;r(f.x+Math.cos(a)*d,f.y+Math.sin(a)*d,2,2,i%2?COL.gold:COL.paper);}
    else if(f.type==='ring'){g.strokeStyle=f.color;g.lineWidth=1.4;g.beginPath();g.arc(f.x,f.y,8+k*8,0,6.283);g.stroke();}
    else if(f.type==='cross'){g.strokeStyle=COL.red;g.lineWidth=2.4;g.beginPath();g.moveTo(f.x-8,f.y-8);g.lineTo(f.x+8,f.y+8);g.moveTo(f.x+8,f.y-8);g.lineTo(f.x-8,f.y+8);g.stroke();}
    else if(f.type==='fly'){const x=f.x+(76-f.x)*k,y=f.y+(f.ty-f.y)*k-Math.sin(k*3.14)*12;r(x-14,y-4,28,8,'#f6c08a');r(x-14,y-4,2,8,COL.tail);}
    else if(f.type==='flash'){g.fillStyle=f.color;g.fillRect(0,0,LW,LH);}
  }
  g.globalAlpha=1;
  if(game&&screen==='play'&&game.state.t<game.state.lockUntil&&slip){
    const left=(game.state.lockUntil-game.state.t)/CFG.lockObserver;
    g.strokeStyle='#7a8597';g.lineWidth=1.4;g.beginPath();g.arc(slip.x,slip.y-24,5,-1.57,-1.57+6.283*Math.min(1,left));g.stroke();
  }
}

function card(x,y,w,h){r(x+2,y+2,w,h,'#00000040');r(x,y,w,h,COL.ink);r(x+1,y+1,w-2,h-2,'#2e3e3f');r(x+1,y+1,w-2,1,'#4a5d5e');}
function legendRow(y,kind,line1,line2){
  const e={id:0,kind,cell:0,text:'下次顺手',holder:'adult'},cx=36;
  g.save();
  if(kind==='tail'){g.translate(cx-C.COLS[0],y+45-C.ROWS[0]+0);tailSign(e,0);}
  else if(kind==='wait'){g.translate(cx-C.COLS[0],y+48-C.ROWS[0]-11+6);waitSign(e);}
  else{g.translate(cx-C.COLS[0],y+50-C.ROWS[0]-12+6);observerSign(e);}
  g.restore();
  text(line1,64,y+5,7,COL.paper,'left');text(line2,64,y+13,5,'#b6c2b8','left',400);
}
function drawTitle(){
  card(8,30,134,174);
  text('推到以后',75,52,16,COL.paper);
  text('像素办公室 · 小尾巴当轮修完',75,63,5.5,'#b6c2b8',undefined,400);
  legendRow(76,'tail','敲掉','小尾巴：当轮自己修完');
  legendRow(112,'wait','别敲','等她拍板，敲了扣 50 分');
  legendRow(148,'observer','不用敲','观察型，敲了拖鞋弹开白等');
  text('漏掉的小尾巴堆到下面，满三条就结束',75,186,5,COL.paper,undefined,400);
  text('连敲 4 下翻倍，连敲 10 下补修一条',75,195,5,COL.gold,undefined,400);
}
function drawResult(s){
  const res=s.result,win=res.reason==='time';
  card(8,40,134,170);
  if(win){text('下班！',75,64,15,COL.gold);text('60 秒，当轮修完',75,76,6,COL.paper,undefined,400);}
  else{text('留给下一个窗口的手尾，',75,62,7.5,COL.paper);text('下一个窗口也不会做',75,73,7.5,COL.red);}
  text(String(res.score),75,98,16,COL.paper);text('分',75,106,5,'#b6c2b8',undefined,400);
  const rows=[['修完',res.fixed+' 条'],['最高连击',res.bestCombo+''],['误敲等她',res.wrong+' 次'],['白敲观察型',res.bounced+' 次'],['补修',res.cleared+' 条']];
  rows.forEach(([a,b],i)=>{text(a,30,122+i*9,6,'#b6c2b8','left',400);text(b,120,122+i*9,6,COL.paper,'right');});
  if(!win){text('堆在下面的：',30,174,5,'#b6c2b8','left',400);res.pile.forEach((p,i)=>text('· '+p,30,182+i*7,5,'#f6c08a','left',400));}
  else text(res.wrong?'下次看清蓝牌再敲':'等她的一块没碰，好',75,180,6,res.wrong?'#b6c2b8':COL.obs);
}

function render(){
  const t0=performance.now();
  g.setTransform(1,0,0,1,0,0);g.drawImage(bg,0,0);
  g.setTransform(N,0,0,N,0,0);
  const s=game&&game.state;
  drawOffice(screen==='title'?null:s);
  if(s&&screen!=='title'){drawPile(s);drawBar(s);}
  else r(0,0,LW,24,COL.ink);
  drawSlipper();drawFx();
  if(screen==='title')drawTitle();
  if(screen==='result'&&s)drawResult(s);
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#1c2526';ctx.fillRect(0,0,cv.width,cv.height);
  ctx.imageSmoothingEnabled=true;
  const sx=shake>0?Math.round((Math.sin(clock*90)*shake)*dpr):0;
  ctx.drawImage(off,0,0,off.width,off.height,Math.round(ox*dpr)+sx,Math.round(oy*dpr),Math.round(LW*scale*dpr),Math.round(LH*scale*dpr));
  const ms=performance.now()-t0;metrics.frames++;metrics.sumMs+=ms;metrics.maxMs=Math.max(metrics.maxMs,ms);metrics.avgFrameMs=+(metrics.sumMs/metrics.frames).toFixed(3);
}

// ---------- events from the rules ----------
function onEvent(e){
  const s=game.state;
  const signAt=c=>{const {x,y}=C.cellXY(c);return{x,y:y-38};};
  if(e.type==='hit'){const p=signAt(e.cell);fx.push({type:'stars',x:p.x,y:p.y,at:clock,dur:0.4,seed:e.id});fx.push({type:'text',text:'修完 +'+e.pts,x:p.x,y:p.y-6,color:e.mult>1?COL.gold:COL.paper,size:e.mult>1?7.5:6.5,at:clock,dur:0.7});
    if(e.mult>1&&e.combo%4===0)fx.push({type:'text',text:'×'+e.mult+'！',x:75,y:120,color:COL.gold,size:14,at:clock,dur:0.8});}
  else if(e.type==='wrong'){const p=signAt(e.cell);fx.push({type:'cross',x:p.x,y:p.y+2,at:clock,dur:0.5});fx.push({type:'text',text:'−50 她还没拍板',x:Math.max(34,Math.min(116,p.x)),y:p.y-10,color:COL.red,size:6.5,at:clock,dur:0.9});fx.push({type:'flash',color:'#e5484d30',at:clock,dur:0.18});shake=2.5;}
  else if(e.type==='bounce'){const p=signAt(e.cell);fx.push({type:'text',text:'白敲',x:p.x,y:p.y-10,color:'#dfe6ea',size:7,at:clock,dur:0.8});fx.push({type:'ring',x:p.x,y:p.y+2,color:'#dfe6ea',at:clock,dur:0.4});}
  else if(e.type==='whiff'){fx.push({type:'text',text:'敲空',x:e.x,y:e.y-10,color:'#5a5547',size:5,at:clock,dur:0.4});}
  else if(e.type==='miss'){const p=signAt(e.cell);fx.push({type:'fly',x:p.x,y:p.y,ty:236+(3-e.pile)*11,at:clock,dur:0.45});fx.push({type:'text',text:'推到以后…',x:Math.max(30,Math.min(120,p.x)),y:p.y-6,color:'#5a3b2a',size:6,at:clock,dur:0.7});}
  else if(e.type==='cleared'){fx.push({type:'text',text:'补修一条！',x:75,y:224,color:'#2f7a4a',size:7,at:clock,dur:1});}
  else if(e.type==='over'){overAt=clock;}
}
function drain(){const s=game.state;for(const e of s.events)onEvent(e);s.events.length=0;}

// ---------- screens ----------
function start(n){
  if(n!=null)seed=n;
  game=C.create({seed});pilot=null;frozen=false;fx=[];slip=null;shake=0;acc=0;overAt=0;
  screen='play';startBtn.hidden=true;retryBtn.hidden=true;
}
function toTitle(){screen='title';game=null;startBtn.hidden=false;retryBtn.hidden=true;}
function showResult(){screen='result';retryBtn.hidden=false;startBtn.hidden=true;}
function fastForward(level,n,until){
  start(n);pilot=C.pilot(level,n);
  while(game.state.phase!=='over'&&!(until!=null&&game.state.t>=until)){pilot(game);game.step(CFG.step);game.state.events.length=0;}
  pilot=null;
  if(game.state.phase==='over')showResult();else frozen=true;
}

startBtn.addEventListener('click',()=>start(Math.floor(Math.random()*1e6)));
retryBtn.addEventListener('click',()=>start(Math.floor(Math.random()*1e6)));
window.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&screen!=='play'){e.preventDefault();start(Math.floor(Math.random()*1e6));}});

cv.addEventListener('pointerdown',ev=>{
  if(screen!=='play'||frozen||paused)return;
  ev.preventDefault();
  const x=(ev.clientX-ox)/scale,y=(ev.clientY-oy)/scale;
  const res=game.tap(x,y);
  if(res.type!=='locked'&&res.type!=='over')slip={x,y:y+4,at:clock,kind:res.type};
  drain();
});
document.addEventListener('visibilitychange',()=>{paused=document.hidden;last=performance.now();});
window.addEventListener('blur',()=>{paused=true;});
window.addEventListener('focus',()=>{paused=false;last=performance.now();});
window.addEventListener('resize',resize);

function frame(now){
  const dt=Math.min(0.05,Math.max(0,(now-(last||now))/1000));last=now;
  if(!paused)clock+=dt;
  if(game&&screen==='play'&&!frozen&&!paused){
    acc+=dt;
    while(acc>=CFG.step&&game.state.phase!=='over'){if(pilot)pilot(game);game.step(CFG.step);drain();acc-=CFG.step;}
    if(game.state.phase==='over'&&clock-overAt>0.7)showResult();
  }
  shake=Math.max(0,shake-dt*12);
  render();
  requestAnimationFrame(frame);
}

// ---------- hooks for tests and fixed views (normal play never touches them) ----------
function probe(){
  const s=game&&game.state;
  return{screen,view,frozen,seed,css:[cssW,cssH],frame:{scale,ox,oy,N},
    state:s?{t:+s.t.toFixed(3),lockUntil:+s.lockUntil.toFixed(3),phase:s.phase,score:s.score,combo:s.combo,pile:s.pile.slice(),live:s.ents.filter(e=>e.state!=='gone').length,
      up:s.ents.filter(e=>e.state==='up').length,
      ents:s.ents.filter(e=>e.state!=='gone').map(e=>{const {x,y}=C.cellXY(e.cell);return{id:e.id,kind:e.kind,holder:e.holder,cell:e.cell,state:e.state,text:e.text,tapX:ox+x*scale,tapY:oy+(y-20)*scale};}),
      stats:{...s.stats},result:s.result}:null};
}
const api={ready:false,probe,start,metrics,
  autopilot(level){if(game)pilot=C.pilot(level,seed);},
  view:view||null};
window.__later=api;
window.__PLAYTEST__={get ready(){return api.ready;},snapshot:probe,reset:()=>start(seed),setSeed:n=>{seed=n;},
  step(ms){if(!game)start(seed);const n=Math.round(ms/1000/CFG.step);for(let i=0;i<n&&game.state.phase!=='over';i++){if(pilot)pilot(game);game.step(CFG.step);drain();}if(game.state.phase==='over')showResult();}};

resize();
if(view==='hero')fastForward('human',4,14.8);
else if(view==='stress')fastForward('human',3,57.5);
else if(view==='over')fastForward('reckless',2);
else if(view==='win')fastForward('precise',4);
else toTitle();
api.ready=true;
requestAnimationFrame(frame);
})();
