const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
function match(options={}){const s=C.create({seed:42,...options});C.start(s);return s;}
function duel(){const s=match();s.actors.forEach(a=>{a.alive=false;});const a=s.actors[0],b=s.actors[1];Object.assign(a,{alive:true,x:0,z:24,protect:0});Object.assign(b,{alive:true,x:0,z:20,protect:0});return[s,a,b];}
function advance(s,seconds,input={}){for(let t=0;t<Math.round(seconds*60);t++){C.tick(s,input,1/60);s.events.length=0;}}
test('invalid settings stay within supported game modes',()=>{
  const s=C.create({team:7,teamSize:999,target:-1,difficulty:'not-real',weapon:99});
  assert.equal(s.actors.length,8);assert.equal(s.target,30);assert.equal(s.team,0);assert.equal(s.difficulty,'normal');assert.equal(s.actors[0].weapon,0);
});
test('all team spawns are free in every match size and team',()=>{
  for(const teamSize of [3,4,6])for(const team of [0,1]){const s=match({teamSize,team});for(const a of s.actors)assert.ok(C.canStand(a.x,a.z),JSON.stringify(a));assert.equal(s.actors.filter(a=>a.team===team).length,teamSize);}
});
test('swept movement cannot tunnel through a shed or leave the roof',()=>{
  const a={x:-12,z:28,y:0};C.move(a,0,-100);assert.ok(a.z>=23.38-.01);assert.ok(C.canStand(a.x,a.z));
  const b={x:0,z:25,y:0};C.move(b,100,0);assert.ok(b.x<=18.62+.001);assert.ok(C.canStand(b.x,b.z));
});
test('diagonal player movement does not exceed straight movement',()=>{
  const straight=match(),diagonal=match();for(const s of [straight,diagonal])s.actors.splice(1);
  C.tick(straight,{forward:1},.1);C.tick(diagonal,{forward:1,strafe:1},.1);
  assert.ok(Math.abs(Math.hypot(diagonal.actors[0].x,24-diagonal.actors[0].z)-(24-straight.actors[0].z))<1e-6);
});
test('route finding reaches the opposite team around solid props',()=>{
  for(const s of [match({teamSize:6}),match({team:1,teamSize:6})])for(const a of s.actors){const dest=C.arena.spawns[1-a.team],path=C.pathTo(a,dest);assert.ok(path.length>20);let previous=a;for(const p of path){assert.ok(C.canStand(p.x,p.z));assert.ok(Math.hypot(p.x-previous.x,p.z-previous.z)<1.6);previous=p;}assert.ok(Math.hypot(previous.x-dest.x,previous.z-dest.z)<1);}
});
test('rays handle parallel faces and objects behind the shooter',()=>{
  const b={minX:-1,maxX:1,minY:0,maxY:2,minZ:-4,maxZ:-2};
  assert.equal(C.rayBox({x:0,y:1,z:0},{x:0,y:0,z:-1},b),2);
  assert.equal(C.rayBox({x:2,y:1,z:0},{x:0,y:0,z:-1},b),Infinity);
  assert.equal(C.rayBox({x:0,y:1,z:0},{x:0,y:0,z:1},b),Infinity);
});
test('a visible opponent takes damage; solid props stop shots',()=>{
  const[s,a,b]=duel();s.random=()=>.5;assert.equal(C.shoot(s,a),true);assert.equal(b.hp,78);assert.equal(a.ammo[0],27);
  Object.assign(a,{x:0,z:6,cooldown:0});Object.assign(b,{x:0,z:-6,hp:100});C.shoot(s,a);assert.equal(b.hp,100);assert.equal(C.lineOfSight(C.eye(a),C.eye(b)),false);
});
test('standing and crouching use different eye and hitbox heights',()=>{
  const[s,a,b]=duel();s.random=()=>.5;b.crouch=true;C.shoot(s,a);assert.equal(b.hp,100);
  a.cooldown=0;a.pitch=-.2;C.shoot(s,a);assert.equal(b.hp,78);
});
test('teammates block shots without taking friendly damage',()=>{
  const[s,a,b]=duel();s.random=()=>.5;const ally=s.actors[2];Object.assign(ally,{alive:true,protect:0,x:0,z:22});C.shoot(s,a);assert.equal(ally.hp,100);assert.equal(b.hp,100);
});
test('spawn protection blocks incoming damage and ends when firing',()=>{
  const[s,a,b]=duel();s.random=()=>.5;b.protect=1;C.shoot(s,a);assert.equal(b.hp,100);a.protect=2;a.cooldown=0;C.shoot(s,a);assert.equal(a.protect,0);
});
test('empty magazines trigger refill, and refill prevents shooting',()=>{
  const[s,a]=duel();s.actors.splice(1);a.ammo[0]=0;assert.equal(C.shoot(s,a),false);assert.ok(a.reload>0);assert.equal(C.shoot(s,a),false);advance(s,1.6);assert.equal(a.ammo[0],28);assert.equal(a.reload,0);
});
test('weapon switch cancels refill without refilling another magazine',()=>{
  const[s,a]=duel();s.actors.splice(1);a.ammo=[10,2,6];C.reload(s);C.equip(s,1);advance(s,2.5);assert.deepEqual(a.ammo,[10,2,6]);assert.equal(a.reload,0);
});
test('a knockout scores once and respawns with fresh water and protection',()=>{
  const[s,a,b]=duel();C.damage(s,b,100,a);assert.equal(s.score[0],1);assert.equal(b.deaths,1);assert.equal(C.damage(s,b,100,a),false);assert.equal(s.score[0],1);advance(s,3.1);assert.equal(b.alive,true);assert.equal(b.hp,100);assert.ok(b.protect>2);assert.equal(b.bombs,2);
});
test('pause freezes match, refill, respawn and movement',()=>{
  const[s,a,b]=duel();a.ammo[0]=1;C.reload(s);C.damage(s,b,100,a);C.pause(s);const before=JSON.stringify(s);C.tick(s,{forward:1,fire:true},1);assert.equal(JSON.stringify(s),before);assert.equal(C.shoot(s,a),false);assert.equal(C.throwBomb(s),false);C.pause(s);assert.equal(s.phase,'playing');
});
test('jump lands on the floor and low planter platforms',()=>{
  const s=match();s.actors.splice(1);const a=s.actors[0];C.tick(s,{jump:true},1/60);advance(s,.9);assert.equal(a.y,0);assert.equal(a.grounded,true);
  Object.assign(a,{x:-3,z:15,y:2,vy:-1,grounded:false});advance(s,.5);assert.equal(a.y,1.05);assert.equal(a.grounded,true);
});
test('water balls are limited per life and blocked by cover',()=>{
  const[s,a,b]=duel();assert.equal(C.throwBomb(s),true);assert.equal(C.throwBomb(s),true);assert.equal(C.throwBomb(s),false);assert.equal(a.bombs,0);
  s.bombs=[{x:0,y:1.5,z:3,vx:0,vy:0,vz:0,time:0,by:0,team:0}];Object.assign(b,{x:0,z:-2.5,hp:100});C.tick(s,{},1/60);assert.equal(b.hp,100);assert.equal(s.bombs.length,0);
});
test('winning hit is atomic and the finished match cannot keep scoring',()=>{
  const[s,a,b]=duel();s.score[0]=s.target-1;C.damage(s,b,100,a);assert.equal(s.phase,'result');assert.equal(s.winner,0);assert.equal(s.score[0],s.target);b.alive=true;b.hp=100;assert.equal(C.damage(s,b,100,a),false);assert.equal(C.shoot(s,a),false);
});
test('timer resolves a tie and a winner; long frames are bounded',()=>{
  const s=match();s.actors.splice(1);s.time=.001;C.tick(s,{},1/60);assert.equal(s.phase,'result');assert.equal(s.winner,null);
  const t=match();t.time=.001;t.score=[2,4];C.tick(t,{},1/60);assert.equal(t.winner,1);
  const u=match();C.tick(u,{forward:1},30);assert.ok(u.time>=179.8999);assert.ok(u.actors[0].z>23.4);
});
test('seeded full matches finish, score through actual bot fire, and stay collision-free',()=>{
  for(const teamSize of [3,4,6])for(const difficulty of ['easy','normal','hard']){
    const s=match({teamSize,difficulty,seed:teamSize*37,target:15});
    for(let t=0;t<180*60+1&&s.phase==='playing';t++){
      C.tick(s,{},1/60);s.events.length=0;
      for(const a of s.actors)if(a.alive)assert.ok(C.canStand(a.x,a.z,a.y,.3),'actor inside obstacle: '+JSON.stringify(a));
    }
    assert.equal(s.phase,'result');assert.ok(s.score[0]+s.score[1]>5);assert.ok(s.score.every(n=>n<=s.target));
  }
});
