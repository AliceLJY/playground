import {createGame,update,eat} from './core.mjs';
// Test driver uses the same movement, collision, weapon, hunger and AI update as play.
export function runPilot(seed,mode,seconds=180){const g=createGame(seed),random=g.random;let aim=0,nextAim=0,delay=0,stuck=0,stationary=0,lastX=g.p.x,lastZ=g.p.z,steps=0,damaged=0,shots=0,escape=0;
 const normal=()=>Math.sqrt(-2*Math.log(Math.max(.00001,random())))*Math.cos(2*Math.PI*random());
 const bias=mode==='tremor'?normal()*.075:0;let target=null;
 for(let t=0;t<seconds&&!g.dead;t+=.05){steps++;const p=g.p;target=g.creatures.filter(e=>e.type!=='grazer'&&!e.dead&&(e.type==='rex'||e.dive&&e.warning<0&&Math.abs(e.y-p.y)<6)).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];const d=target?Math.hypot(target.x-p.x,target.z-p.z):99;
  if(t>=nextAim){nextAim=t+(mode==='tremor'?.3:.05);aim=bias+(mode==='tremor'?normal()*.38:0);delay=mode==='tremor'?Math.max(0,normal()*.16+.25):0;}
  if(target){const desired=Math.atan2(-(target.x-p.x),-(target.z-p.z));let diff=(desired-p.yaw+Math.PI*3)%(Math.PI*2)-Math.PI;p.yaw+=diff*Math.min(1,.05/(mode==='tremor'?.13:.03));p.yaw+=aim*.1;p.pitch=Math.atan2(target.y+2-p.y-1.62,d)+(mode==='tremor'?aim*.5:0);}
  if(p.hunger<80||p.hp<80)eat(g);
  const danger=g.creatures.some(e=>e.type==='ptero'&&e.dive&&(mode==='precise'||e.warning<.3));const reckless=mode==='reckless',input={moveX:!reckless&&danger?1:0,fire:!reckless&&d<40&&t>delay,moveZ:reckless?(d>2?1:0):d<9?-1:0,sprint:!reckless&&d<5,jump:!reckless&&stationary>1.5};
  if(stationary>1.1)escape=.8;if(escape>0&&!reckless){escape-=.05;input.moveX=-1;input.moveZ=.3;input.jump=true;input.mine=true;}update(g,input,.05);for(const e of g.events){if(e.type==='hurt')damaged++;if(e.type==='shot')shots++;}
  const moved=Math.hypot(p.x-lastX,p.z-lastZ);lastX=p.x;lastZ=p.z;if(input.moveZ&&moved<.003){stationary+=.05;if(stationary>2)stuck++;}else stationary=0;
 }
 return {seed,mode,survived:!g.dead&&g.time>=seconds-.1,time:g.time,hp:g.p.hp,kills:g.stats.kills,hits:g.stats.hits,shots,damaged,warnings:g.stats.warnings,bites:g.stats.bites,distance:g.stats.distance,stuckFrames:stuck,steps,game:g};
}
