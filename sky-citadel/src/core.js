export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// 0 dawn, 1 noon, 2 dusk, 3 night: interpolated without rebuilding the scene.
export function timeState(hour){const h=clamp(Number(hour)||0,0,3),i=Math.min(2,Math.floor(h)),t=h-i;const frames=[{sky:'#b8a5b8',fog:'#c5b5c4',sun:'#ffcc9c',intensity:2,ambient:2.1,night:.15},{sky:'#97bfd0',fog:'#c7d8db',sun:'#fff3d7',intensity:2.7,ambient:2.3,night:0},{sky:'#a19bac',fog:'#c0b0bd',sun:'#ffc187',intensity:2.4,ambient:1.7,night:.4},{sky:'#101e37',fog:'#23344b',sun:'#a4b8f0',intensity:1,ambient:1.2,night:1}];return{a:frames[i],b:frames[i+1],t,night:frames[i].night*(1-t)+frames[i+1].night*t};}
export class Quality{
 constructor(){this.level=0;this.slow=0;this.fast=0;this.cooldown=0;}
 sample(ms){if(this.cooldown>0){this.cooldown--;return false;}this.slow=ms>38?this.slow+1:0;this.fast=ms<24?this.fast+1:0;if(this.slow>=45&&this.level<2){this.level++;this.slow=this.fast=0;this.cooldown=90;return true;}if(this.fast>=300&&this.level>0){this.level--;this.slow=this.fast=0;this.cooldown=90;return true;}return false;}
 get scale(){return[1,.82,.65][this.level];}
}
export function airshipAt(t,out){const a=t*.085+.42;out.x=Math.cos(a)*29;out.y=8.3+Math.sin(a*1.7)*.65;out.z=Math.sin(a)*25;out.heading=Math.atan2(-29*Math.sin(a),25*Math.cos(a));return out;}
