/* Stage geometry, palette and camera framing. World units; no renderer, DOM or clock.
   The game and the tests both read this file, so composition checks measure the real framing. */
(function(root){
'use strict';
const screen={left:-8,right:8,bottom:-1.8,top:7.2};                 // the lit cloth
const hot={x:0,y:screen.bottom+.6*(screen.top-screen.bottom)};      // lamp hotspot, 60% up the cloth
const need={left:-8.8,right:8.8,bottom:-2.3,top:8.0};               // cloth plus frame the play camera must show
const floor=0;                                                       // puppets stand here; carved ground strip below
// Empty audience chairs in front of the stage: the wide shot shows them, the play shot must not.
const chairs=[{z:7,y:-4.2,count:9,spacing:2.05,w:1.3,h:1.55},{z:12,y:-4.8,count:11,spacing:2.15,w:1.4,h:1.7}];
const palette={
  screenCenter:'#F4C27A',screenEdge:'#9A5426',dark:'#140C09',
  wood:'#3A2216',woodRed:'#8E2A1E',woodGold:'#C9A24A',
  ink:'#24140D',robe:'#C4462C',jade:'#2F7D62',gong:'#D9A441',skin:'#E6C08C',
  moth:'#7A6248',steel:'#8E9BA6',handle:'#A93A2A',fur:'#463A33',sash:'#A62F28',crown:'#D8B048',
  glint:'#FFF2CF',danger:'#FF3A2A',spark:'#FFD36B',sparkDull:'#C47A3A'
};
const falloff={rx:9,ry:6.8,inner:.08,outer:1};                      // the screen shader uses the same numbers
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const toLinear=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
const luminance=l=>.2126*l[0]+.7152*l[1]+.0722*l[2];
function clothMix(x,y){
  const d=Math.min(1,Math.hypot((x-hot.x)/falloff.rx,(y-hot.y)/falloff.ry));
  const t=Math.min(1,Math.max(0,(d-falloff.inner)/(falloff.outer-falloff.inner)));
  return t*t*(3-2*t);
}
function clothLinear(x,y,lamp=1){
  const a=hex(palette.screenCenter).map(toLinear),b=hex(palette.screenEdge).map(toLinear),t=clothMix(x,y);
  return a.map((v,i)=>(v+(b[i]-v)*t)*lamp);
}
const FOV=30;
// Play camera: look straight at the cloth and keep the whole frame in view at any aspect.
function frame(aspect,view='play'){
  if(view==='wide')return{fov:34,pos:{x:-1.6,y:.4,z:29},target:{x:0,y:1.5,z:0}};
  const tan=Math.tan(FOV*Math.PI/360),w=need.right-need.left,h=need.top-need.bottom;
  const d=Math.max(h/(2*tan),w/(2*tan*aspect)),cy=(need.top+need.bottom)/2;
  return{fov:FOV,pos:{x:0,y:cy,z:d},target:{x:0,y:cy,z:0}};
}
// Viewport fractions (0..1, origin bottom-left) of a world point for a look-at pinhole camera.
function project(cam,aspect,p){
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)}),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const norm=a=>{const l=Math.hypot(a.x,a.y,a.z);return{x:a.x/l,y:a.y/l,z:a.z/l};};
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const f=norm(sub(cam.target,cam.pos)),r=norm(cross(f,{x:0,y:1,z:0})),u=cross(r,f),rel=sub({x:p.x,y:p.y,z:p.z||0},cam.pos);
  const tan=Math.tan(cam.fov*Math.PI/360),z=dot(rel,f);
  return{x:.5+dot(rel,r)/(z*tan*aspect)/2,y:.5+dot(rel,u)/(z*tan)/2,z};
}
const api={screen,hot,need,floor,chairs,palette,falloff,hex,toLinear,luminance,clothMix,clothLinear,frame,project,FOV};
if(typeof module!=='undefined')module.exports=api;root.GongStage=api;
})(typeof globalThis!=='undefined'?globalThis:this);
