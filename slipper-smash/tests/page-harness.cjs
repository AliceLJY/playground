// Run the real page handlers and simulation with a minimal DOM/canvas boundary.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function page(width=390,height=664){
  const texts=[],images=[],elements=new Map(),storage=new Map();let raf;
  const target=()=>({hidden:true,disabled:false,textContent:'',style:{},listeners:{},
    addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);},
    fire(k,e={}){for(const fn of this.listeners[k]||[])fn({preventDefault(){},stopPropagation(){},...e});},
    setPointerCapture(){},releasePointerCapture(){},hasPointerCapture(){return false;}});
  const ctx=new Proxy({fillText(s){texts.push(s);},measureText(s){return{width:s.length*20};},createLinearGradient(){return{addColorStop(){}};},createRadialGradient(){return{addColorStop(){}};}},{get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const el=id=>{if(!elements.has(id))elements.set(id,target());return elements.get(id);};
  el('stage').getContext=()=>ctx;
  const doc=target();doc.getElementById=el;
  const win=target();Object.assign(win,{innerWidth:width,innerHeight:height,devicePixelRatio:2,
    document:doc,location:{search:''},URLSearchParams,console,setTimeout:()=>0,performance:{now:()=>0},
    localStorage:{getItem:k=>k.endsWith('-muted')?'1':storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    requestAnimationFrame:fn=>{raf=fn;},Image:class{constructor(){images.push(this);}},HTMLImageElement:class{}});
  win.window=win;win.addEventListener=win.addEventListener.bind(win);
  win.SlipperCore=require('../src/core.js');
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/game.js'),'utf8'),win);
  images.forEach(i=>i.onload());
  return{hook:win.__slipper,win,doc,el,texts,draw(){texts.length=0;raf(16);},pointer(type,x=180,y=300){el('stage').fire(type,{clientX:x,clientY:y,pointerId:1});}};
}
module.exports=page;
