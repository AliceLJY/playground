// 凭证扫雷 rules: board generation (first tap safe, no-guess boards), the logic solver, the autopilots and the screen layout.
// No DOM, no drawing; runs in Node for tests. Every secret-looking string in this file is fake and deliberately incomplete.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SweeperCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const LEVELS={
  easy:{id:'easy',name:'轻松',cols:7,rows:9,mines:9},
  normal:{id:'normal',name:'标准',cols:8,rows:11,mines:15},
  hard:{id:'hard',name:'困难',cols:9,rows:13,mines:24}
};
const MAX_TRIES=3000;      // generator gives up after this many layouts and hands back a board that may need a guess (flagged guessFree:false)
const LONG_PRESS=0.42;     // seconds a finger stays down before the tap becomes 打码 (awaiting playtest)
const MOVE_CANCEL=10;      // CSS px a finger may drift before the press is dropped
const CARD_DELAY=0.9;      // seconds between the last move and the result card, so the board and the reaction are seen first

// ---------- the eight shapes of a leak (rewritten from real incidents, no names) ----------
const STORIES=[
  {title:'报告里抄了原值',text:'查出一把泄露的钥匙，写报告时顺手把整串贴了进去。发现问题的那份报告，自己成了新的泄露。',frag:'报告：发现泄露 sk-…4f2a'},
  {title:'打码写了，没生效',text:'写了一行打码命令就放心走了，没回头看结果。规则一个字没匹配上，原文照样进了日志。',frag:'打码后日志 token=tok-…81bd'},
  {title:'规则写错，一声不吭',text:'打码规则用了另一台机器的写法，这里的工具不认。没有报错，也一个字没打掉。',frag:'规则没命中 key=ak-…7e90'},
  {title:'工具自己把配置念出来',text:'只想看一眼配置对不对，查看命令把整份配置连同里面的钥匙一起打印在了屏幕上。',frag:'查看配置 API_KEY=sk-…c3d1'},
  {title:'小插件在后台抄了一份',text:'装的一个小插件在后台写检查报告，顺手把登录令牌抄进报告，又被原样送进了对话。',frag:'插件报告 session=ss-…0b5f'},
  {title:'备份放错了地方',text:'改配置前先备份一份，备份放进了会自动同步上云的文件夹，钥匙跟着一起出了门。',frag:'备份副本 secret=sk-…9a6e'},
  {title:'打码和检查用同一张表',text:'打码和检查共用一张规则表，漏掉的那种格式两边一起漏，检查全绿，泄露还在。',frag:'检查通过 bearer …52ac'},
  {title:'一条普通命令变了脸',text:'一条设置代理的日常命令，读的文件刚好是空的，退化成「列出全部环境变量」，钥匙全上了屏。',frag:'环境变量 TOKEN=tk-…e1f7'}
];
const NEVER_BACK='写进记录就收不回来了。';
const SNIPPETS=[
  ['[09:14:02] 构建完成，0 个警告','[09:14:05] 测试 128 项全过','[09:15:40] 缓存命中 92%','[09:16:11] 重试第 2 次，成功','[09:17:03] 任务入队 #418','[09:18:20] 磁盘剩余 61%'],
  ['timeout = 30','retries = 3','region = "local"','log_level = "info"','cache_dir = "./tmp"','max_workers = 4'],
  ['交接：明早先跑测试','交接：第 3 步还没验','交接：别动旧分支','交接：产物放输出目录','交接：等确认再发布','交接：日志在 logs/ 下']
];
const KINDS=['日志行','配置片段','交接文件'];

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const nbCache={};
function neighbours(cols,rows){
  const key=cols+'x'+rows;if(nbCache[key])return nbCache[key];
  const out=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const l=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<cols&&Y<rows)l.push(Y*cols+X);}
    out.push(l);}
  return nbCache[key]=out;
}

// open i, and keep opening around every cell that has no leak next to it (classic flood)
function flood(n,mine,open,flag,nb,i){
  let opened=0;const st=[i];
  while(st.length){const c=st.pop();if(open[c]||flag[c]||mine[c])continue;open[c]=1;opened++;if(n[c]===0)for(const j of nb[c])if(!open[j])st.push(j);}
  return opened;
}

// Moves that follow from what a player can see: numbers on open cells, the flags, and the total count of leaks.
// rule 'single': one number alone; 'subset': one number's covered cells sit inside another's; 'global': the leak count settles the rest.
function deduce(cols,rows,mines,n,open,flag){
  const nb=neighbours(cols,rows),N=cols*rows,cons=[];
  for(let i=0;i<N;i++)if(open[i]&&n[i]>0){const u=[];let f=0;for(const j of nb[i])if(!open[j]){if(flag[j])f++;else u.push(j);}if(u.length)cons.push({u,m:n[i]-f});}
  const safe=new Map(),bad=new Map();
  for(const c of cons){if(c.m===0)for(const j of c.u)safe.set(j,'single');else if(c.m===c.u.length)for(const j of c.u)bad.set(j,'single');}
  if(safe.size||bad.size)return pack(safe,bad);
  for(const a of cons)for(const b of cons){
    if(a===b||a.u.length>=b.u.length||!a.u.every(j=>b.u.includes(j)))continue;
    const d=b.u.filter(j=>!a.u.includes(j)),dm=b.m-a.m;
    if(dm===0)for(const j of d)safe.set(j,'subset');else if(dm===d.length)for(const j of d)bad.set(j,'subset');
  }
  if(safe.size||bad.size)return pack(safe,bad);
  let flags=0;const unk=[];for(let i=0;i<N;i++){if(flag[i])flags++;else if(!open[i])unk.push(i);}
  if(unk.length&&mines-flags===0)for(const j of unk)safe.set(j,'global');
  else if(unk.length&&mines-flags===unk.length)for(const j of unk)bad.set(j,'global');
  return pack(safe,bad);
}
function pack(safe,bad){const m=[];for(const [i,rule] of safe)m.push({op:'reveal',i,rule});for(const [i,rule] of bad)m.push({op:'flag',i,rule});return m;}

function counts(cols,rows,mine){const nb=neighbours(cols,rows),n=new Uint8Array(cols*rows);for(let i=0;i<n.length;i++){let k=0;for(const j of nb[i])k+=mine[j];n[i]=k;}return n;}

// Play the board with logic only, from the first tap. solved=true means no guess is ever needed.
function solve(level,mine,first){
  const {cols,rows,mines}=level,N=cols*rows,nb=neighbours(cols,rows),n=counts(cols,rows,mine);
  const open=new Uint8Array(N),flag=new Uint8Array(N),steps=[];
  if(mine[first])return{solved:false,steps,error:'first tap on a leak'};
  flood(n,mine,open,flag,nb,first);steps.push({op:'reveal',i:first,rule:'first'});
  for(let guard=0;guard<N*2;guard++){
    const moves=deduce(cols,rows,mines,n,open,flag);if(!moves.length)break;
    for(const m of moves){
      if(m.op==='flag'){if(!mine[m.i])return{solved:false,steps,error:'solver flagged a safe cell '+m.i};flag[m.i]=1;}
      else{if(mine[m.i])return{solved:false,steps,error:'solver opened a leak '+m.i};if(open[m.i])continue;flood(n,mine,open,flag,nb,m.i);}
      steps.push(m);
    }
  }
  let o=0;for(let i=0;i<N;i++)o+=open[i];
  return{solved:o===N-mines,steps,open:o};
}

// Lay the leaks out after the first tap: the tapped cell and its neighbours stay clean, and the layout must be solvable by logic.
function generate(level,seed,first){
  const {cols,rows,mines}=level,N=cols*rows,nb=neighbours(cols,rows),rand=rng((seed*2654435761+first*97)>>>0);
  const banned=new Set([first,...nb[first]]),pool=[];for(let i=0;i<N;i++)if(!banned.has(i))pool.push(i);
  let mine=null;
  for(let tries=1;tries<=MAX_TRIES;tries++){
    const p=pool.slice();for(let k=0;k<mines;k++){const j=k+Math.floor(rand()*(p.length-k));const t=p[k];p[k]=p[j];p[j]=t;}
    mine=new Uint8Array(N);for(let k=0;k<mines;k++)mine[p[k]]=1;
    if(solve(level,mine,first).solved)return finish(level,mine,rand,tries,true);
  }
  return finish(level,mine,rand,MAX_TRIES,false);
}
function finish(level,mine,rand,tries,guessFree){
  const story=new Int8Array(mine.length).fill(-1);for(let i=0;i<mine.length;i++)if(mine[i])story[i]=Math.floor(rand()*STORIES.length);
  return{mine,n:counts(level.cols,level.rows,mine),story,tries,guessFree};
}

// What each cell looks like before it is opened (log line / config / handoff): drawn from its own stream, says nothing about leaks.
function dressing(level,seed){
  const r=rng((seed^0x5bd1e995)>>>0),N=level.cols*level.rows,kind=new Uint8Array(N),pick=new Uint8Array(N);
  for(let i=0;i<N;i++){kind[i]=Math.floor(r()*3);pick[i]=Math.floor(r()*6);}
  return{kind,pick};
}

function create(opts){
  opts=opts||{};
  const level=LEVELS[opts.level]||LEVELS.normal,seed=opts.seed==null?1:opts.seed>>>0,N=level.cols*level.rows;
  const s={level,seed,cols:level.cols,rows:level.rows,N,status:'ready',board:null,open:new Uint8Array(N),flag:new Uint8Array(N),
    t:0,opened:0,flags:0,moves:0,last:-1,hit:-1,story:-1,wrongFlags:[],events:[],dress:dressing(level,seed),endT:null};
  const nb=neighbours(level.cols,level.rows),emit=e=>s.events.push(e);
  function lose(i){s.status='lost';s.hit=i;s.story=s.board.story[i];s.endT=s.t;
    s.wrongFlags=[];for(let j=0;j<N;j++)if(s.flag[j]&&!s.board.mine[j])s.wrongFlags.push(j);emit({type:'lose',i,story:s.story});}
  function checkWin(){
    if(s.opened!==N-level.mines)return;
    s.status='won';s.endT=s.t;for(let j=0;j<N;j++)if(s.board.mine[j]&&!s.flag[j]){s.flag[j]=1;s.flags++;}
    emit({type:'win',t:s.t});
  }
  function openCell(i){const k=flood(s.board.n,s.board.mine,s.open,s.flag,nb,i);s.opened+=k;return k;}
  const api={state:s,
    reveal(i){
      if(s.status==='won'||s.status==='lost'||i<0||i>=N)return{ok:false};
      if(s.status==='ready'){s.board=generate(level,seed,i);s.status='play';emit({type:'board',tries:s.board.tries,guessFree:s.board.guessFree});}
      if(s.flag[i])return{ok:false,why:'flagged'};
      s.moves++;s.last=i;
      if(s.open[i])return api.chord(i);
      if(s.board.mine[i]){lose(i);return{ok:true,lost:true};}
      const k=openCell(i);emit({type:'reveal',i,count:k});checkWin();return{ok:true,opened:k};
    },
    // tap on an open number whose flags are all placed: open every other neighbour (classic chord)
    chord(i){
      if(s.status!=='play'||!s.open[i]||s.board.n[i]===0)return{ok:false};
      let f=0;for(const j of nb[i])f+=s.flag[j];if(f!==s.board.n[i])return{ok:false,why:'flags do not match'};
      let k=0;for(const j of nb[i])if(!s.open[j]&&!s.flag[j]){if(s.board.mine[j]){lose(j);return{ok:true,lost:true};}k+=openCell(j);}
      if(k)emit({type:'reveal',i,count:k});checkWin();return{ok:true,opened:k};
    },
    toggleFlag(i){
      if(s.status!=='play'||i<0||i>=N||s.open[i])return{ok:false};
      s.flag[i]^=1;s.flags+=s.flag[i]?1:-1;s.moves++;s.last=i;emit({type:s.flag[i]?'flag':'unflag',i});return{ok:true,flagged:!!s.flag[i]};
    },
    tick(dt){if(s.status==='play')s.t+=dt;},
    left(){return level.mines-s.flags;},
    moves(){return s.status==='play'?deduce(level.cols,level.rows,level.mines,s.board.n,s.open,s.flag):[];},
    text(i){const st=s.board&&s.board.mine[i]?s.board.story[i]:-1;return st>=0?STORIES[st].frag:SNIPPETS[s.dress.kind[i]][s.dress.pick[i]];}
  };
  return api;
}

// ---------- autopilots (tests and fixed views only; normal play never uses them) ----------
// precise: plays only logical moves.  human: same logic, think time per move, and a fat-finger slip now and then.
// reckless: taps covered cells at random without reading the numbers.
const THINK={first:1.5,single:2.4,subset:7,global:4,slip:0.8,reckless:0.5}; // seconds a casual player looks before a move (awaiting playtest)
function gauss(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function pilot(kind,seed,opt){
  opt=opt||{};const r=rng((seed*7919+13)>>>0),slip=opt.slip==null?0.012:opt.slip;
  return function(g){
    const s=g.state;if(s.status==='won'||s.status==='lost')return null;
    const center=Math.floor(s.rows/2)*s.cols+Math.floor(s.cols/2);
    const think=rule=>kind==='human'?Math.max(0.35,THINK[rule]*(1+0.35*gauss(r))):THINK[rule]||1;
    if(kind==='reckless'){
      const c=[];for(let i=0;i<s.N;i++)if(!s.open[i]&&!s.flag[i])c.push(i);
      const i=s.status==='ready'?center:c[Math.floor(r()*c.length)];g.reveal(i);return{op:'reveal',i,rule:'reckless',dt:THINK.reckless};
    }
    if(s.status==='ready'){g.reveal(center);return{op:'reveal',i:center,rule:'first',dt:think('first')};}
    const ms=g.moves();
    if(!ms.length){const c=[];for(let i=0;i<s.N;i++)if(!s.open[i]&&!s.flag[i])c.push(i);const i=c[Math.floor(r()*c.length)];g.reveal(i);return{op:'reveal',i,rule:'guess',dt:think('subset')};}
    const m=ms[0];
    if(m.op==='flag'){g.toggleFlag(m.i);return{...m,dt:think(m.rule)*0.6};}
    if(kind==='human'&&r()<slip){
      // the finger lands one cell off: any covered, unflagged neighbour of the intended cell
      const nb=neighbours(s.cols,s.rows)[m.i].filter(j=>!s.open[j]&&!s.flag[j]);
      if(nb.length){const j=nb[Math.floor(r()*nb.length)];g.reveal(j);return{op:'reveal',i:j,rule:'slip',dt:think(m.rule)};}
    }
    g.reveal(m.i);return{...m,dt:think(m.rule)};
  };
}
function playOut(level,seed,kind,opt){
  const g=create({level,seed}),p=pilot(kind,seed,opt);let time=0,acts=0,m;
  while((m=p(g))&&acts<2000){time+=m.dt;g.tick(m.dt);acts++;}
  return{state:g.state,time,acts};
}

// ---------- layout (CSS px). Portrait: status strip on top, buttons at the bottom. Landscape: a side panel. ----------
// The clerk is 17 art px wide; his tallest pose (arm up with the redaction bar) reaches GUY_TOP art px above his feet.
const GUY_TOP=32,GUY_HALF=9; // 29 art px tallest pose + the hop (flag 2, win 3; the 4 px jump only happens with arms at 23)
function layout(w,h,levelId){
  const L=LEVELS[levelId]||LEVELS.normal,pad=8,land=w/h>1.15;
  let hud,area,btn,guy,counter,readout,bubble;
  if(!land){
    const hudH=clamp(Math.round(h*0.155),80,120),barH=64,S=clamp(Math.floor((hudH-4)/GUY_TOP),2,4);
    hud={x:0,y:0,w,h:hudH};area={x:pad,y:hudH+6,w:w-2*pad,h:h-hudH-barH-10};
    const by=h-barH+8,bh=48,gap=8,small=Math.min(96,Math.floor((w-2*pad-2*gap)*0.25)),big=w-2*pad-2*gap-2*small;
    btn={mode:{x:pad,y:by,w:big,h:bh},restart:{x:pad+big+gap,y:by,w:small,h:bh},menu:{x:pad+big+2*gap+small,y:by,w:small,h:bh}};
    guy={x:pad+GUY_HALF*S,y:hudH-4,s:S};
    const fs=w<360?17:20;
    counter={x:w-pad,y:10,size:fs,align:'right',w:fs*7.6,h:fs+4};
    const gx=guy.x+GUY_HALF*S+6;
    bubble={x:gx,y:Math.max(4,guy.y-S*19-12),w:Math.min(104,w-pad-counter.w-gx-6),h:24};
    readout={x:gx,y:hudH-22,w:w-pad-gx,h:16};
  }else{
    const side=clamp(Math.round(w*0.28),170,280),S=clamp(Math.floor(Math.min(side/44,(h*0.32)/GUY_TOP)),2,4);
    hud={x:0,y:0,w:side,h};area={x:side+pad,y:pad,w:w-side-2*pad,h:h-2*pad};
    const bw=side-2*pad,bh=48,gap=8,half=Math.floor((bw-gap)/2),by=h-pad-bh*2-gap;
    btn={mode:{x:pad,y:by,w:bw,h:bh},restart:{x:pad,y:by+bh+gap,w:half,h:bh},menu:{x:pad+half+gap,y:by+bh+gap,w:half,h:bh}};
    guy={x:pad+GUY_HALF*S+4,y:pad+GUY_TOP*S+2,s:S};
    const gx=guy.x+GUY_HALF*S+6;
    bubble={x:gx,y:Math.max(4,guy.y-S*19-12),w:side-pad-gx,h:24};
    const cs=clamp(Math.round(side/11),18,26);counter={x:pad,y:guy.y+10,size:cs,align:'left',w:side-2*pad,h:cs+4};
    readout={x:pad,y:counter.y+cs+14,w:side-2*pad,h:16};
  }
  const cell=Math.floor(Math.min(area.w/L.cols,area.h/L.rows,72));
  const bw=cell*L.cols,bh=cell*L.rows;
  const board={x:Math.round(area.x+(area.w-bw)/2),y:Math.round(area.y+(area.h-bh)/2),w:bw,h:bh,cell};
  const guyBox={x:guy.x-GUY_HALF*guy.s,y:guy.y-GUY_TOP*guy.s,w:2*GUY_HALF*guy.s,h:GUY_TOP*guy.s+2*guy.s};
  const counterBox=counter.align==='right'?{x:counter.x-counter.w,y:counter.y,w:counter.w,h:counter.h}:{x:counter.x,y:counter.y,w:counter.w,h:counter.h};
  return{w,h,land,hud,area,board,btn,guy,guyBox,counter,counterBox,bubble,readout,level:L.id};
}
const cellAt=(lay,x,y)=>{const b=lay.board;if(x<b.x||y<b.y||x>=b.x+b.w||y>=b.y+b.h)return -1;const c=Math.floor((x-b.x)/b.cell),r=Math.floor((y-b.y)/b.cell),L=LEVELS[lay.level];return r*L.cols+c;};

return{GUY_TOP,LEVELS,STORIES,NEVER_BACK,SNIPPETS,KINDS,LONG_PRESS,MOVE_CANCEL,CARD_DELAY,MAX_TRIES,THINK,rng,neighbours,deduce,solve,generate,counts,create,pilot,playOut,layout,cellAt};
});
