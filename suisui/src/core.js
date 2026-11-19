// 碎碎平安 rules: what sits on the shelf, how each material breaks, gesture thresholds, particle budget.
// No DOM, no drawing; runs in Node for tests. Every number here comes from SPEC.md.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SuiCore=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';

// Variant names the vendored engine registers (vendor/dissolve-atlas.js). A test checks each one is really there.
const ENGINE_FX=['dust','sand','ember','pixel','vortex','snap','fling','gather','rain','print','charge','melt','shatter'];

// kind -> material, how a tap breaks it, which synth sound, the floating words, how often it shows up.
// opts go straight to the engine's play(): n = engine knob (shard count for shatter, push for snap).
// Every kind except the worry slip is a photographed sprite in assets/<kind>.webp; the slip is drawn in code (its words change).
const KINDS={
  meiping: {name:'青花梅瓶', mat:'porcelain', fx:'shatter', sound:'porcelain', words:['碎碎平安','岁岁平安'], weight:2,   opts:{n:[190],duration:1600}, shake:0.6},
  plate:   {name:'青花大盘', mat:'porcelain', fx:'shatter', sound:'porcelain', words:['碎碎平安','岁岁平安'], weight:2,   opts:{n:[160],duration:1500}, shake:0.55},
  ru:      {name:'汝窑天青盏',mat:'porcelain', fx:'shatter', sound:'porcelain', words:['碎碎平安','岁岁平安'], weight:2,   opts:{n:[120],duration:1400}, shake:0.5},
  liuli:   {name:'琉璃荷叶盏',mat:'glass',     fx:'shatter', sound:'glass',     words:['碎碎平安'],             weight:2,   opts:{n:[260],duration:1300}, shake:0.5},
  bi:      {name:'白玉璧',   mat:'jade',      fx:'shatter', sound:'jade',      words:['碎碎平安','玉碎了'],     weight:1.5, opts:{n:[140],duration:1500}, shake:0.55},
  horse:   {name:'唐三彩马', mat:'earthenware',fx:'sand',   sound:'crumble',   words:['散了'],                 weight:1.5, opts:{grain:2.5,duration:1700}, shake:0.35},
  teapot:  {name:'紫砂壶',   mat:'clay',      fx:'sand',    sound:'crumble',   words:['散了'],                 weight:1.5, opts:{grain:2.5,duration:1700}, shake:0.35},
  note:    {name:'烦心事',   mat:'paper',     fx:'ember',   sound:'burn',      words:['烧掉了','烧干净'],       weight:3,   opts:{duration:1700}, shake:0.15},
  book:    {name:'线装古籍', mat:'paper',     fx:'dust',    sound:'whoosh',    words:['翻篇了'],               weight:1.5, opts:{duration:1500}, shake:0.1},
  candle:  {name:'红烛',     mat:'wax',       fx:'melt',    sound:'melt',      words:['化了'],                 weight:1.5, opts:{}, shake:0.1},
  sugar:   {name:'糖画龙',   mat:'sugar',     fx:'melt',    sound:'melt',      words:['化了','甜的'],           weight:1,   opts:{}, shake:0.1},
  firecracker:{name:'红鞭炮',mat:'paper',     fx:'snap',    sound:'firecracker',words:['噼里啪啦','砰！'],      weight:1.5, opts:{n:[1.8],duration:950}, shake:0.75},
  censer:  {name:'宣德炉',   mat:'bronze',    fx:'vortex',  sound:'swirl',     words:['烟消云散'],             weight:1.5, opts:{duration:1250}, shake:0.2},
};
// Sprites drawn from photographs; the rest are drawn in code.
const SPRITES=Object.keys(KINDS).filter(k=>k!=='note');
const KIND_IDS=Object.keys(KINDS);

// Generic worries for the default notes: nothing personal, nothing about anyone real.
const NOTES=['周一','改稿','开会','催进度','已读不回','加班','截止日','早起','堵车','排队','返工','没睡够'];

const G={tapMs:280,moveTol:18,holdMs:1000,flingWindow:80,flingMin:600,flingMax:5000,noteMax:10,budget:16000};

function rng(seed){let a=(seed>>>0)||1;return function(){a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

// Shelf geometry from the visible viewport (SPEC 4). header/footer are the title row and the button bar.
const HEADER=60,FOOTER=84,GAP=20;
function layout(vw,vh){
  const cols=vw<560?3:vw<900?4:5;
  const shelfW=Math.min(vw*0.92,980);
  const frame=20;                                  // wood frame thickness, both sides together
  const cellW=(shelfW-frame)/cols;
  const availH=vh-HEADER-FOOTER-GAP-frame;
  let rows=4,cell=cellW;
  if(rows*cellW>availH){rows=3;cell=Math.min(cellW,availH/3);}
  cell=Math.max(64,Math.floor(cell));
  const item=Math.round(cell*0.78);
  return{cols,rows,cell,item,shelfW:cell*cols+frame,shelfH:cell*rows+frame,count:cols*rows};
}

function weighted(r,ids){let sum=0;for(const k of ids)sum+=KINDS[k].weight;let x=r()*sum;for(const k of ids){x-=KINDS[k].weight;if(x<=0)return k;}return ids[ids.length-1];}

// Next thing for a slot: never the same kind as any neighbour (left, right, up, down).
function pickKind(r,avoid){const pool=KIND_IDS.filter(k=>!avoid.includes(k));return weighted(r,pool.length?pool:KIND_IDS);}
function neighbours(kinds,i,cols){const out=[];const c=i%cols;
  if(c>0)out.push(kinds[i-1]);if(c<cols-1)out.push(kinds[i+1]);out.push(kinds[i-cols],kinds[i+cols]);return out.filter(Boolean);}
// Kinds a slot must not take: its neighbours, plus anything already on the shelf twice (worries three times).
const MAX_SAME=2,MAX_NOTES=3;
function avoidFor(kinds,i,cols){
  const n={};kinds.forEach((k,j)=>{if(k&&j!==i)n[k]=(n[k]||0)+1;});
  return neighbours(kinds,i,cols).concat(Object.keys(n).filter(k=>n[k]>=(k==='note'?MAX_NOTES:MAX_SAME)));
}

// A default worry for a new slip, not one already on the shelf.
function pickNote(r,used){const pool=NOTES.filter(n=>!used.includes(n));const p=pool.length?pool:NOTES;return p[Math.floor(r()*p.length)];}

function createShelf(seed,count,cols){
  const r=rng(seed),kinds=new Array(count).fill(null),notes=[];
  for(let i=0;i<count;i++){kinds[i]=pickKind(r,avoidFor(kinds,i,cols));notes[i]=kinds[i]==='note'?pickNote(r,notes):'';}
  // at least two worries on every shelf: they are the point of the page
  let have=kinds.filter(k=>k==='note').length;
  const start=Math.floor(r()*count);
  for(let j=0;have<2&&j<count;j++){
    const i=(start+j*7)%count;   // stride 7 is coprime with every slot count we lay out (9, 12, 15, 16, 20), so this visits each slot once
    const nb=neighbours(kinds,i,cols);if(kinds[i]!=='note'&&!nb.includes('note')&&have<MAX_NOTES){kinds[i]='note';notes[i]=pickNote(r,notes);have++;}
  }
  return{kinds,notes,r};
}

// Gesture at release (SPEC 2). Hold is started live by a timer; this is the fallback for the release itself.
function classify(dt,dist){if(dist>=G.moveTol)return'swipe';if(dt>=G.tapMs)return'hold';return'tap';}

function clampSpeed(vx,vy){const s=Math.hypot(vx,vy);if(!(s>0))return{x:G.flingMin,y:0};
  const k=Math.min(G.flingMax,Math.max(G.flingMin,s))/s;return{x:vx*k,y:vy*k};}

// Engine options for one break. local = point inside the item (CSS px), box = item size.
function plan(kind,gesture,local,box,vel){
  const K=KINDS[kind]||KINDS.plate;
  const at={x:Math.max(0,Math.min(box.w,local.x)),y:Math.max(0,Math.min(box.h,local.y))};
  if(gesture==='swipe')return{preset:'fling',velocity:clampSpeed(vel?vel.x:0,vel?vel.y:0)};
  if(gesture==='hold')return{preset:'charge',hold:true,origin:at,duration:900,n:[1.35]};
  const o={preset:K.fx,...K.opts};
  if(K.fx==='shatter'||K.fx==='snap')o.origin=at;
  if(K.fx==='dust')o.origin=at.x<box.w/2?'left':'right';
  return o;
}

// What the engine will put on screen for one break, so the smash-all budget can be checked without a browser.
// Mirrors the engine: grain is raised until a burst stays under 5000 grains; shatter draws n shards instead.
function grainsFor(kind,w,h,grain){
  const K=KINDS[kind];if(K.fx==='shatter')return Math.min(400,K.opts.n[0]);
  let g=grain||K.opts.grain||(K.fx==='pixel'?7:3);const min=Math.sqrt(w*h/5000);if(g<min)g=Math.ceil(min*2)/2;
  return Math.ceil(w/g)*Math.ceil(h/g);
}
// Grain size for smash-all: smallest step from 3 up that keeps every burst on screen together under the budget.
function cascadeGrain(kinds,item){
  for(let g=3;g<=12;g+=0.5){let sum=0;for(const k of kinds)sum+=grainsFor(k,item,item,Math.max(g,KINDS[k].opts.grain||0));if(sum<=G.budget)return g;}
  return 12;
}

function words(kind,r){const w=KINDS[kind].words;return w[Math.floor((r||Math.random)()*w.length)];}

// A worry typed by the visitor: one line, no control characters, at most noteMax characters.
function cleanNote(s){const t=String(s||'').replace(/\s+/g,' ').replace(/[\u0000-\u001f\u007f]/g,'').trim();return Array.from(t).slice(0,G.noteMax).join('');}

return{ENGINE_FX,KINDS,KIND_IDS,SPRITES,NOTES,G,HEADER,FOOTER,MAX_SAME,MAX_NOTES,rng,layout,pickKind,pickNote,neighbours,avoidFor,createShelf,classify,clampSpeed,plan,grainsFor,cascadeGrain,words,cleanNote};
});
