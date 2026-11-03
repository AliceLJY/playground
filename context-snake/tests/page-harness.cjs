// Run the real page script (src/game.js) against a minimal DOM and canvas, so input tests fire its own handlers.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function page(width=390,height=664,search=''){
  const elements=new Map(),storage=new Map(),texts=[];let raf=null;
  const target=(tag)=>({tag,hidden:false,disabled:false,textContent:'',dataset:{},style:{setProperty(k,v){this[k]=v;}},listeners:{},
    classList:{set:new Set(),add(c){this.set.add(c);},remove(c){this.set.delete(c);},toggle(c,on){on?this.set.add(c):this.set.delete(c);},contains(c){return this.set.has(c);}},
    addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);},
    fire(k,e={}){for(const fn of this.listeners[k]||[])fn({preventDefault(){},stopPropagation(){},...e});},
    focus(){},setPointerCapture(){},releasePointerCapture(){},getBoundingClientRect(){return{x:0,y:0,width:50,height:50};}});
  const el=id=>{if(!elements.has(id))elements.set(id,target(id));return elements.get(id);};
  const dirs=['u','r','d','l'].map((c,i)=>{const b=target('dpad-'+c);b.dataset.dir=String(i);return b;});
  const ctx=new Proxy({fillText(s){texts.push(s);},strokeText(){},measureText(s){return{width:String(s).length*10};}},{get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  el('stage').getContext=()=>ctx;
  const doc=target('document');doc.getElementById=el;doc.hidden=false;
  doc.querySelectorAll=sel=>sel==='#dpad button'?dirs:[];
  doc.querySelector=sel=>sel==='#dpad .u'?dirs[0]:null;
  for(const id of ['pad','pause-btn','pause-panel','result-sheet'])el(id).hidden=true;
  const win=target('window');Object.assign(win,{innerWidth:width,innerHeight:height,devicePixelRatio:2,document:doc,location:{search},URLSearchParams,console,
    performance:{now:()=>0},localStorage:{getItem:k=>k.endsWith('-muted')?'1':storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))},
    requestAnimationFrame:fn=>{raf=fn;}});
  win.window=win;win.addEventListener=win.addEventListener.bind(win);win.Math=Object.create(Math);
  win.SnakeCore=require('../src/core.js');win.Math.random=win.SnakeCore.rng(5);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/game.js'),'utf8'),win);
  let now=0;
  return{hook:win.__snake,playtest:win.__PLAYTEST__,win,doc,el,dirs,texts,
    frame(ms=16){now+=ms;const f=raf;f(now);},
    key(code){win.fire('keydown',{code,key:code,repeat:false});},
    pointer(type,x,y,id=1){el('stage').fire(type,{clientX:x,clientY:y,pointerId:id});}};
}
module.exports=page;
