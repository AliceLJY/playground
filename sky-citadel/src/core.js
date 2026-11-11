import {PALETTES,DEFAULT_PALETTE,paletteKey} from './palettes.js';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Frame order is dawn, noon, dusk, afterglow, night. The slider still runs 0–3: the afterglow
// keyframe sits at 2.5, so a warm floor darkens to ember before it turns blue instead of greying out.
const FRAME_AT=[0,1,2,2.5,3];
export function timeState(hour,key=DEFAULT_PALETTE){const h=clamp(Number(hour)||0,0,3),frames=PALETTES[paletteKey(key)].frames;let i=0;while(i<FRAME_AT.length-2&&h>=FRAME_AT[i+1])i++;const t=(h-FRAME_AT[i])/(FRAME_AT[i+1]-FRAME_AT[i]);return{a:frames[i],b:frames[i+1],t,night:frames[i].night*(1-t)+frames[i+1].night*t};}
export class Quality{
 constructor(){this.level=0;this.slow=0;this.fast=0;this.cooldown=0;}
 sample(ms){if(this.cooldown>0){this.cooldown--;return false;}this.slow=ms>38?this.slow+1:0;this.fast=ms<24?this.fast+1:0;if(this.slow>=45&&this.level<2){this.level++;this.slow=this.fast=0;this.cooldown=90;return true;}if(this.fast>=300&&this.level>0){this.level--;this.slow=this.fast=0;this.cooldown=90;return true;}return false;}
 get scale(){return[1,.82,.65][this.level];}
}
export function airshipAt(t,out){const a=t*.085+.42;out.x=Math.cos(a)*29;out.y=8.3+Math.sin(a*1.7)*.65;out.z=Math.sin(a)*25;out.heading=Math.atan2(-29*Math.sin(a),25*Math.cos(a));return out;}
