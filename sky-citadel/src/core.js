import {PALETTES,DEFAULT_PALETTE,paletteKey} from './palettes.js';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// 0 dawn, 1 noon, 2 dusk, 3 night: interpolated without rebuilding the scene.
export function timeState(hour,key=DEFAULT_PALETTE){const h=clamp(Number(hour)||0,0,3),i=Math.min(2,Math.floor(h)),t=h-i,frames=PALETTES[paletteKey(key)].frames;return{a:frames[i],b:frames[i+1],t,night:frames[i].night*(1-t)+frames[i+1].night*t};}
export class Quality{
 constructor(){this.level=0;this.slow=0;this.fast=0;this.cooldown=0;}
 sample(ms){if(this.cooldown>0){this.cooldown--;return false;}this.slow=ms>38?this.slow+1:0;this.fast=ms<24?this.fast+1:0;if(this.slow>=45&&this.level<2){this.level++;this.slow=this.fast=0;this.cooldown=90;return true;}if(this.fast>=300&&this.level>0){this.level--;this.slow=this.fast=0;this.cooldown=90;return true;}return false;}
 get scale(){return[1,.82,.65][this.level];}
}
export function airshipAt(t,out){const a=t*.085+.42;out.x=Math.cos(a)*29;out.y=8.3+Math.sin(a*1.7)*.65;out.z=Math.sin(a)*25;out.heading=Math.atan2(-29*Math.sin(a),25*Math.cos(a));return out;}
