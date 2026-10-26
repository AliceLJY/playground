// 粤剧六柱测试的页面：开场、答题、结果、分享图。规则全在 core.js。
// 固定视图：?view=q3（第 3 题）、?r=<柱 id>（直接看某个结果，分享出去的链接就是这个）。调试钩子 window.__pillar。
(function(){
'use strict';
const C=window.PillarCore,{PILLARS,QUESTIONS,SOURCES}=C;
const $=id=>document.getElementById(id);
const st={i:0,answers:[],result:null,mine:null};
// 插画没到之前的占位字
const GLYPH={wms:'文',xs:'书',zyhd:'旦',ebhd:'帮',cs:'丑',ws:'武'};

function show(id){document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('on',s.id===id));window.scrollTo(0,0);}

function drawPillars(box,meId){
  box.innerHTML='';
  PILLARS.forEach(p=>{
    const d=document.createElement('div');d.className='pl'+(p.id===meId?' me':'');
    const s=document.createElement('span');s.textContent=p.name;d.appendChild(s);box.appendChild(d);
  });
}

function ask(i){
  st.i=i;const q=QUESTIONS[i];
  $('dots').innerHTML=QUESTIONS.map((_,k)=>`<i class="${k<i?'done':''}"></i>`).join('');
  $('qnum').textContent=`第 ${i+1} 题 / 共 ${QUESTIONS.length} 题`;
  $('qtext').textContent=q.q;
  const box=$('opts');box.innerHTML='';
  q.opts.forEach((o,k)=>{
    const b=document.createElement('button');b.className='opt';
    b.innerHTML=`<b>${'ABCD'[k]}</b>`;const t=document.createElement('span');t.textContent=o[0];b.appendChild(t);
    b.onclick=()=>{
      if(box.dataset.lock)return;box.dataset.lock='1';b.classList.add('hit');
      st.answers[i]=k;
      setTimeout(()=>{delete box.dataset.lock;i+1<QUESTIONS.length?ask(i+1):finish();},220);
    };
    box.appendChild(b);
  });
  $('back').style.visibility=i?'visible':'hidden';
  show('s-q');
}

function finish(){
  const r=C.score(st.answers.slice(0,QUESTIONS.length));
  st.mine=r.id;
  try{history.replaceState(null,'','?r='+r.id);}catch(e){}
  result(r.id,false);
}

function srcMark(src){return src.map(s=>Object.keys(SOURCES).indexOf(s)+1).sort((a,b)=>a-b).join(',');}

function result(id,peek){
  const p=C.pillar(id);if(!p)return start();
  st.result=id;
  document.documentElement.style.setProperty('--pc',p.color);
  $('you').textContent=peek?'这一柱是':'你是';
  $('rname').textContent=p.name;$('rlabel').textContent=p.label;
  drawPillars(document.querySelector('#stage1 .pillars'),id);
  const v=$('viewing');
  if(peek&&st.mine&&st.mine!==id){v.textContent=`你在看「${p.name}」的介绍。你自己测出来的是「${C.pillar(st.mine).name}」。`;v.classList.add('on');}
  else if(peek&&!st.mine){v.textContent=`朋友分享给你的是「${p.name}」。你自己是哪一根？点下面「再测一次」就能测。`;v.classList.add('on');}
  else v.classList.remove('on');
  const art=$('art');art.innerHTML='';
  const img=new Image();img.alt=p.name+'插画';
  st.img=img;st.imgId=p.id;
  img.onload=()=>{art.innerHTML='';art.appendChild(img);};
  img.onerror=()=>{art.innerHTML=`<div class="ph">${GLYPH[p.id]}</div>`;};
  img.src=`img/${p.id}.webp`;
  $('portrait').textContent=p.portrait;
  $('facts').innerHTML='';
  p.facts.forEach(f=>{
    const li=document.createElement('li');li.textContent=f.t;
    const sup=document.createElement('sup');sup.textContent='['+srcMark(f.src)+']';li.appendChild(sup);
    $('facts').appendChild(li);
  });
  $('role').textContent=p.role;
  const o=$('others');o.innerHTML='';
  PILLARS.forEach(q=>{
    const b=document.createElement('button');b.textContent=q.name;if(q.id===id)b.className='cur';
    b.onclick=()=>result(q.id,true);o.appendChild(b);
  });
  $('again').textContent=st.mine?'再测一次':'我也测一测';
  show('s-r');
}

function sources(){
  $('srcs').innerHTML=Object.entries(SOURCES).map(([k,s])=>{
    const t=s.url?`<a href="${s.url}" target="_blank" rel="noopener">${s.t}</a>`:s.t;
    return `<li>${t}${s.org?'，'+s.org:''}</li>`;
  }).join('')+`<li style="list-style:none;margin-left:-18px;margin-top:6px">${C.ROLE_SOURCE}</li>`;
}

function start(){st.answers=[];drawPillars(document.querySelector('#stage0 .pillars'),null);show('s-start');}

// 分享图：宽 1080，高按内容裁（有插画约 1800），与结果页同一套颜色与字；有插画就放在右侧。微信里长按图片即可保存或转发。
function lines(ctx,text,maxW){
  const out=[];let line='';
  for(const ch of text){
    // 标点不放行首
    if(ctx.measureText(line+ch).width>maxW&&line&&!'，。、；：？！」）'.includes(ch)){out.push(line);line=ch;}
    else line+=ch;
  }
  if(line)out.push(line);
  return out;
}
function card(){
  const p=C.pillar(st.result),W=1080,H=2400;  // 先画在高画布上，最后按内容裁高
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d');
  const css=getComputedStyle(document.documentElement);
  const serif=css.getPropertyValue('--serif'),kai=css.getPropertyValue('--kai');
  g.fillStyle='#F3EAD9';g.fillRect(0,0,W,H);
  g.fillStyle=p.color;g.fillRect(0,0,W,620);
  // 六根柱
  const top=470,ph=150,gap=18,pw=(W-120-gap*5)/6;
  g.fillStyle='#D9A93B';g.fillRect(50,top-26,W-100,20);
  PILLARS.forEach((q,k)=>{
    const x=60+k*(pw+gap),me=q.id===p.id;
    g.fillStyle=me?'#F2D27A':'rgba(0,0,0,.28)';g.fillRect(x,top,pw,ph);
    g.fillStyle=me?p.color:'rgba(255,247,230,.55)';g.font=`900 30px ${serif}`;g.textAlign='center';
    [...q.name].forEach((ch,j)=>g.fillText(ch,x+pw/2,top+38+j*30));
  });
  g.textAlign='left';
  g.fillStyle='#FFF7E6';g.font=`900 40px ${serif}`;g.fillText('我是撑起粤剧团的',70,110);
  g.font=`900 210px ${kai}`;g.fillText(p.name,62,320);
  g.font=`900 46px ${serif}`;g.fillText(p.label,70,405);
  // 正文区：有插画时插画靠右、文字走左栏；冷知识框通栏放在两者下面。放不下就缩字，各块位置记进 st.cardLayout 供验收。
  const fact=p.facts[p.hook].t,top0=660;
  const art=st.img&&st.imgId===p.id&&st.img.complete&&st.img.naturalWidth>0?st.img:null;
  const iw=art?480:0,ih=art?Math.round(iw*art.naturalHeight/art.naturalWidth):0,ix=W-60-iw;
  const colR=art?ix-40:W-70,colW=colR-70;
  if(art){
    g.save();const r=24;g.beginPath();g.moveTo(ix+r,top0);g.arcTo(ix+iw,top0,ix+iw,top0+ih,r);g.arcTo(ix+iw,top0+ih,ix,top0+ih,r);g.arcTo(ix,top0+ih,ix,top0,r);g.arcTo(ix,top0,ix+iw,top0,r);g.closePath();g.clip();
    g.drawImage(art,ix,top0,iw,ih);g.restore();
  }
  let ps=40,plh=64,pl;
  for(;;){g.font=`400 ${ps}px ${serif}`;pl=lines(g,p.portrait,colW);if(pl.length<=6||ps<=30)break;ps-=2;plh=Math.round(ps*1.6);}
  g.fillStyle='#2B211C';
  pl.forEach((t,k)=>g.fillText(t,70,top0+48+k*plh));
  const portraitBottom=top0+48+(pl.length-1)*plh;
  const roleTop=portraitBottom+70;
  g.fillStyle=p.color;g.font=`900 34px ${serif}`;g.fillText('在《帝女花》里，我是',70,roleTop+34);
  let rs=70;for(;;){g.font=`900 ${rs}px ${kai}`;if(g.measureText(p.role).width<=colW||rs<=40)break;rs-=4;}
  g.fillText(p.role,70,roleTop+34+20+rs);
  const roleBottom=roleTop+34+20+rs+16,roleRight=70+g.measureText(p.role).width;
  let fs=36,lh=56,fl;
  for(;;){g.font=`400 ${fs}px ${serif}`;fl=lines(g,fact,W-190);if(fl.length<=4||fs<=28)break;fs-=2;lh=Math.round(fs*1.55);}
  const boxY=Math.max(roleBottom,top0+ih)+40,boxH=78+fl.length*lh+20;
  g.fillStyle='#FFF8EA';g.fillRect(50,boxY,W-100,boxH);
  g.fillStyle=p.color;g.fillRect(50,boxY,10,boxH);
  g.font=`900 32px ${serif}`;g.fillText('这一柱在粤剧里',90,boxY+56);
  g.fillStyle='#2B211C';g.font=`400 ${fs}px ${serif}`;
  fl.forEach((t,k)=>g.fillText(t,90,boxY+56+lh*(k+1)));
  const foot=boxY+boxH+56,FH=200;
  st.cardLayout={hasArt:!!art,portraitBottom,roleTop,roleBottom,roleRight,imgLeft:art?ix:W,imgBottom:top0+ih,boxY,boxBottom:boxY+boxH,foot,height:foot+FH};
  const out=document.createElement('canvas');out.width=W;out.height=foot+FH;const o=out.getContext('2d');
  o.drawImage(cv,0,0);
  o.fillStyle='#B3261E';o.fillRect(0,foot,W,FH);
  o.fillStyle='#FFF7E6';o.font=`900 44px ${serif}`;o.fillText('你是哪一根柱？',70,foot+82);
  o.font=`400 30px ${serif}`;o.fillText('aliceljy.github.io/playground/yueju-pillars',70,foot+138);
  o.textAlign='right';o.font=`900 32px ${serif}`;o.fillText('我的AI小木屋',W-70,foot+82);
  const url=out.toDataURL('image/png');
  $('cardimg').src=url;$('dl').href=url;$('modal').classList.add('on');
}

$('go').onclick=()=>{st.answers=[];ask(0);};
$('back').onclick=()=>{if(st.i>0)ask(st.i-1);};
$('again').onclick=()=>{st.answers=[];try{history.replaceState(null,'',location.pathname);}catch(e){}ask(0);};
$('card').onclick=card;
$('close').onclick=()=>$('modal').classList.remove('on');
sources();

const qs=new URLSearchParams(location.search),r=qs.get('r'),view=qs.get('view');
if(r&&C.pillar(r))result(r,true);
else if(view&&/^q[1-8]$/.test(view))ask(+view.slice(1)-1);
else start();

window.__pillar={st,ask,result,card,core:C};
})();
