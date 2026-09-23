/* Metres and seconds. No renderer, DOM, network or wall-clock dependency. */
(function(root){
'use strict';
const arena=typeof module!=='undefined'?require('./arena.js'):root.SplashArena;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const weapons=[
  {name:'泡泡连发',capacity:28,damage:22,delay:.13,reload:1.55,range:60,spread:.014},
  {name:'高压水炮',capacity:6,damage:72,delay:.85,reload:2.1,range:75,spread:.005},
  {name:'口袋水枪',capacity:12,damage:30,delay:.28,reload:1.1,range:45,spread:.018}
];
function rng(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function rayBox(o,d,b,max=Infinity){
  let near=0,far=max;
  for(const [key,lo,hi] of [['x','minX','maxX'],['y','minY','maxY'],['z','minZ','maxZ']]){
    if(Math.abs(d[key])<1e-8){if(o[key]<b[lo]||o[key]>b[hi])return Infinity;continue;}
    let a=(b[lo]-o[key])/d[key],c=(b[hi]-o[key])/d[key];if(a>c)[a,c]=[c,a];
    near=Math.max(near,a);far=Math.min(far,c);if(near>far)return Infinity;
  }
  return near;
}
function wallDistance(o,d,max=Infinity){
  let best=max;for(const b of arena.blocks)best=Math.min(best,rayBox(o,d,b,max));
  const limits=[['x',arena.width/2],['z',arena.length/2]];
  for(const [k,v] of limits)if(Math.abs(d[k])>1e-8){const t=((d[k]>0?v:-v)-o[k])/d[k];if(t>=0&&o.y+d.y*t<1.2)best=Math.min(best,t);}
  if(d.y<0){const t=-o.y/d.y;if(t>=0)best=Math.min(best,t);}
  return best;
}
function lineOfSight(a,b){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,len=Math.hypot(dx,dy,dz);return wallDistance(a,{x:dx/len,y:dy/len,z:dz/len},len)>=len-.05;}
function bodyBox(a){return{minX:a.x-.38,maxX:a.x+.38,minZ:a.z-.38,maxZ:a.z+.38,minY:a.y+.12,maxY:a.y+(a.crouch?1.12:1.88)};}
function canStand(x,z,y=0,r=.38){
  if(Math.abs(x)>arena.width/2-r||Math.abs(z)>arena.length/2-r)return false;
  return !arena.blocks.some(b=>y<b.maxY-.04&&y+1.1>b.minY&&x+r>b.minX&&x-r<b.maxX&&z+r>b.minZ&&z-r<b.maxZ);
}
function move(a,dx,dz){
  // Swept substeps prevent tunnelling even after a slow frame or a large test step.
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.18));
  for(let i=0;i<steps;i++){
    if(canStand(a.x+dx/steps,a.z,a.y))a.x+=dx/steps;
    if(canStand(a.x,a.z+dz/steps,a.y))a.z+=dz/steps;
  }
}
const cell=1,nx=Math.floor(arena.width/cell),nz=Math.floor(arena.length/cell);
const gridPoint=i=>({x:(i%nx+.5)*cell-arena.width/2,z:(Math.floor(i/nx)+.5)*cell-arena.length/2});
const gridIndex=(x,z)=>clamp(Math.floor((z+arena.length/2)/cell),0,nz-1)*nx+clamp(Math.floor((x+arena.width/2)/cell),0,nx-1);
const walkable=Array.from({length:nx*nz},(_,i)=>{const p=gridPoint(i);return canStand(p.x,p.z,0,.48);});
function pathTo(a,b){
  const start=gridIndex(a.x,a.z);let goal=gridIndex(b.x,b.z);
  if(!walkable[goal]){let best=Infinity;walkable.forEach((ok,i)=>{if(ok){const p=gridPoint(i),dist=Math.hypot(p.x-b.x,p.z-b.z);if(dist<best){best=dist;goal=i;}}});}
  const parent=new Int32Array(nx*nz).fill(-1),queue=[start];parent[start]=start;
  for(let head=0;head<queue.length&&parent[goal]===-1;head++){
    const i=queue[head],x=i%nx,z=Math.floor(i/nx);
    for(const [dx,dz]of [[0,1],[1,0],[0,-1],[-1,0]]){
      if(x+dx<0||x+dx>=nx||z+dz<0||z+dz>=nz)continue;
      const j=i+dx+dz*nx;if(!walkable[j]||parent[j]!==-1)continue;parent[j]=i;queue.push(j);
    }
  }
  if(parent[goal]===-1)return[];
  const path=[];for(let i=goal;i!==start;i=parent[i])path.push(gridPoint(i));return path.reverse();
}
const names=['你','阿晴','小满','汽水','阿树','奶盖','橘子','风铃','薄荷','夏至','西瓜','海盐'];
function actor(id,team){return{id,team,name:names[id],x:0,y:0,z:0,yaw:0,pitch:0,vy:0,hp:100,alive:true,crouch:false,grounded:true,kills:0,deaths:0,weapon:0,ammo:weapons.map(w=>w.capacity),reload:0,cooldown:0,protect:0,respawn:0,bombs:2,path:[],repath:0,think:0,target:null,moving:0};}
function spawn(s,a){
  const p=arena.spawns[a.team],slot=Math.floor(a.id/2),offsets=[0,-2,2,-4,4,-6];
  Object.assign(a,{x:p.x+offsets[slot],y:0,z:p.z+(a.team?-.8:.8)*(slot%2),yaw:p.yaw,pitch:0,vy:0,hp:100,alive:true,grounded:true,crouch:false,ammo:weapons.map(w=>w.capacity),reload:0,cooldown:0,protect:2.4,respawn:0,bombs:2,path:[],repath:0,think:.5,target:null,moving:0});
}
function create(opts={}){
  const team=opts.team===1?1:0,teamSize=[3,4,6].includes(+opts.teamSize)?+opts.teamSize:4;
  const s={phase:'menu',target:[15,30,50].includes(+opts.target)?+opts.target:30,difficulty:['easy','normal','hard'].includes(opts.difficulty)?opts.difficulty:'normal',teamSize,team,time:180,elapsed:0,score:[0,0],actors:[],events:[],bombs:[],winner:null,random:rng(opts.seed??Date.now())};
  for(let i=0;i<teamSize*2;i++){const a=actor(i,(i%2===0)?team:1-team);s.actors.push(a);spawn(s,a);}
  s.actors[0].weapon=[0,1,2].includes(+opts.weapon)?+opts.weapon:0;return s;
}
function start(s){if(s.phase==='menu'){s.phase='playing';return true;}return false;}
function pause(s){if(s.phase==='playing')s.phase='paused';else if(s.phase==='paused')s.phase='playing';}
function finish(s){s.phase='result';s.winner=s.score[0]===s.score[1]?null:s.score[0]>s.score[1]?0:1;s.events.push({type:'finish',winner:s.winner});}
function damage(s,victim,amount,shooter){
  if(s.phase!=='playing'||!victim.alive||victim.protect>0||victim.team===shooter.team)return false;
  victim.hp=Math.max(0,victim.hp-amount);s.events.push({type:'hit',id:victim.id,by:shooter.id,amount});
  if(victim.hp===0){victim.alive=false;victim.deaths++;victim.respawn=3;victim.reload=0;shooter.kills++;s.score[shooter.team]++;s.events.push({type:'out',id:victim.id,by:shooter.id});if(s.score[shooter.team]>=s.target)finish(s);}
  return true;
}
function eye(a){return{x:a.x,y:a.y+(a.crouch?1.04:1.64),z:a.z};}
function direction(yaw,pitch){return{x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};}
function shoot(s,a,yaw=a.yaw,pitch=a.pitch){
  if(s.phase!=='playing'||!a.alive||a.reload>0||a.cooldown>0)return false;
  const w=weapons[a.weapon];if(a.ammo[a.weapon]<=0){reload(s,a);return false;}
  a.protect=0;a.ammo[a.weapon]--;a.cooldown=w.delay;
  const accuracy=a.id===0?w.spread*(a.aim?.25:1):({easy:.18,normal:.095,hard:.045}[s.difficulty]);
  const d=direction(yaw+(s.random()-.5)*accuracy,pitch+(s.random()-.5)*accuracy),o=eye(a);
  let distance=wallDistance(o,d,w.range),target=null;
  for(const other of s.actors){if(other.id===a.id||!other.alive)continue;const t=rayBox(o,d,bodyBox(other),distance);if(t<distance){distance=t;target=other;}}
  const end={x:o.x+d.x*distance,y:o.y+d.y*distance,z:o.z+d.z*distance};
  const hit=target?damage(s,target,w.damage,a):false;
  s.events.push({type:'shot',id:a.id,team:a.team,weapon:a.weapon,from:o,to:end,hit});return true;
}
function reload(s,a=s.actors[0]){if(s.phase!=='playing'||!a.alive||a.reload>0||a.ammo[a.weapon]>=weapons[a.weapon].capacity)return false;a.reload=weapons[a.weapon].reload;return true;}
function equip(s,index){const a=s.actors[0];if(s.phase!=='playing'||!a.alive||![0,1,2].includes(index))return false;a.weapon=index;a.reload=0;a.cooldown=Math.max(.18,a.cooldown);return true;}
function throwBomb(s){
  const a=s.actors[0];if(s.phase!=='playing'||!a.alive||a.bombs<=0)return false;
  a.bombs--;a.protect=0;const o=eye(a),d=direction(a.yaw,a.pitch);
  s.bombs.push({...o,vx:d.x*14,vy:d.y*14+4,vz:d.z*14,time:1.4,by:a.id,team:a.team});s.events.push({type:'throw'});return true;
}
function updateVertical(a,dt){
  const previous=a.y;a.vy-=20*dt;a.y+=a.vy*dt;let floor=0;
  for(const b of arena.blocks)if(a.x+.3>b.minX&&a.x-.3<b.maxX&&a.z+.3>b.minZ&&a.z-.3<b.maxZ&&previous>=b.maxY-.05)floor=Math.max(floor,b.maxY);
  if(a.y<=floor){a.y=floor;a.vy=0;a.grounded=true;}else a.grounded=false;
}
function bot(s,a,dt){
  a.think-=dt;a.repath-=dt;
  if(a.think<=0){
    a.think=.22+s.random()*.15;let best=Infinity;a.target=null;
    for(const b of s.actors){if(b.team===a.team||!b.alive)continue;const dist=Math.hypot(a.x-b.x,a.z-b.z);if(dist<best&&lineOfSight(eye(a),{x:b.x,y:b.y+1.2,z:b.z})){best=dist;a.target=b.id;}}
  }
  const target=a.target===null?null:s.actors[a.target];
  if(target?.alive){
    const dx=target.x-a.x,dz=target.z-a.z,dist=Math.hypot(dx,dz);a.yaw=Math.atan2(-dx,-dz);a.pitch=Math.atan2(target.y+1.2-eye(a).y,dist);
    if(lineOfSight(eye(a),{x:target.x,y:target.y+1.2,z:target.z})){shoot(s,a);const side=Math.sin(s.elapsed*1.5+a.id*3)>0?1:-1;move(a,Math.cos(a.yaw)*side*dt*1.7,-Math.sin(a.yaw)*side*dt*1.7);a.moving=1;return;}
  }
  if(a.repath<=0||!a.path.length){
    a.repath=1+s.random();const foes=s.actors.filter(b=>b.team!==a.team&&b.alive);
    foes.sort((b,c)=>Math.hypot(a.x-b.x,a.z-b.z)-Math.hypot(a.x-c.x,a.z-c.z));
    const goal=foes[0]||arena.spawns[1-a.team];a.path=pathTo(a,goal);
  }
  const goal=a.path[0];if(goal){const dx=goal.x-a.x,dz=goal.z-a.z,dist=Math.hypot(dx,dz);if(dist<.2)a.path.shift();else{const speed=Math.min(dist/dt,3.1);a.yaw=Math.atan2(-dx,-dz);move(a,dx/dist*speed*dt,dz/dist*speed*dt);a.moving=1;}}else a.moving=0;
}
function tick(s,input={},dt=1/60){
  if(s.phase!=='playing'||!Number.isFinite(dt)||dt<=0)return;
  // Drop excess time on background/slow frames instead of teleporting the match.
  dt=Math.min(dt,.1);const steps=Math.ceil(dt/(1/60));for(let i=0;i<steps&&s.phase==='playing';i++)step(s,input,dt/steps);
}
function step(s,input,dt){
  s.time=Math.max(0,s.time-dt);s.elapsed+=dt;
  for(const a of s.actors){
    if(s.phase!=='playing')break;
    if(!a.alive){a.respawn-=dt;if(a.respawn<=0)spawn(s,a);continue;}
    a.protect=Math.max(0,a.protect-dt);a.cooldown=Math.max(0,a.cooldown-dt);
    if(a.reload>0){a.reload=Math.max(0,a.reload-dt);if(a.reload===0)a.ammo[a.weapon]=weapons[a.weapon].capacity;}
    if(a.id===0){
      a.crouch=Boolean(input.crouch);a.aim=Boolean(input.aim);a.yaw=Number.isFinite(input.yaw)?input.yaw:a.yaw;a.pitch=clamp(Number.isFinite(input.pitch)?input.pitch:a.pitch,-1.4,1.4);
      let x=clamp(input.strafe||0,-1,1),z=clamp(input.forward||0,-1,1);const n=Math.max(1,Math.hypot(x,z));x/=n;z/=n;
      const speed=a.crouch?2.3:a.aim?3.1:input.sprint?7.4:5.3;
      if(input.jump&&a.grounded&&!a.crouch){a.vy=7.2;a.grounded=false;}
      move(a,(Math.cos(a.yaw)*x-Math.sin(a.yaw)*z)*speed*dt,(-Math.sin(a.yaw)*x-Math.cos(a.yaw)*z)*speed*dt);a.moving=Math.hypot(x,z);
      if(input.fire)shoot(s,a);
    }else bot(s,a,dt);
    updateVertical(a,dt);
  }
  for(let i=s.bombs.length-1;i>=0&&s.phase==='playing';i--){
    const b=s.bombs[i];b.time-=dt;b.vy-=13*dt;const next={x:b.x+b.vx*dt,y:b.y+b.vy*dt,z:b.z+b.vz*dt};
    const dir={x:next.x-b.x,y:next.y-b.y,z:next.z-b.z},dist=Math.hypot(dir.x,dir.y,dir.z);
    if(wallDistance(b,{x:dir.x/dist,y:dir.y/dist,z:dir.z/dist},dist)<dist||Math.abs(next.x)>arena.width/2||Math.abs(next.z)>arena.length/2){b.vx*=-.3;b.vz*=-.3;b.vy=Math.abs(b.vy)*.35;}else Object.assign(b,next);
    if(b.y<.15){b.y=.15;b.vy=Math.abs(b.vy)*.3;b.vx*=.6;b.vz*=.6;}
    if(b.time<=0){for(const a of s.actors){const len=Math.hypot(a.x-b.x,a.y+1-b.y,a.z-b.z);if(len<5.5&&lineOfSight(b,{x:a.x,y:a.y+1,z:a.z}))damage(s,a,Math.round(110*(1-len/7)),s.actors[b.by]);}s.events.push({type:'splash',...b});s.bombs.splice(i,1);}
  }
  if(s.time<=0&&s.phase==='playing')finish(s);
}
const api={arena,weapons,create,start,pause,tick,shoot,reload,equip,throwBomb,damage,spawn,eye,move,canStand,pathTo,lineOfSight,rayBox,direction,finish};
if(typeof module!=='undefined')module.exports=api;root.SplashCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
