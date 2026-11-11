// Reported from a phone: "run fast and you clip through things". Reproduced on 2026-11-11 with a
// touch-driven sprint: the player ran straight through a rex and through grazers, and dinosaurs walk
// through tree trunks. Each test below was red on the code before the fix.
const test=require('node:test'),assert=require('node:assert/strict');let api;
test.before(async()=>{api=await import('../src/core.mjs');});
const settle=g=>{g.p.y=g.k.height(g.p.x,g.p.z)+1;g.p.vy=0;g.p.ground=true;};

test('a sprinting player cannot run through a rex',()=>{
 const g=api.createGame(731);g.creatures.length=0;settle(g);g.p.hp=1e6;g.p.yaw=0;
 const rex=g.spawn('rex',g.p.x,g.p.z-8);let min=Infinity,touched=false;
 for(let i=0;i<60*5;i++){api.update(g,{moveZ:1,sprint:true},1/60);g.p.hp=1e6;g.dead=false;const d=Math.hypot(g.p.x-rex.x,g.p.z-rex.z);min=Math.min(min,api.bodyDistance(rex,g.p.x,g.p.z,g.p.y));if(d<4.6)touched=true;}
 assert.ok(touched,'the player must actually reach the rex, otherwise this proves nothing');
 assert.ok(min>=.25,`player came within ${min.toFixed(2)} of the rex body; the eye must stay outside the head`);
});

test('a sprinting player cannot run through a fleeing grazer, at phone frame times too',()=>{
 for(const dt of [1/60,.05]){
  const g=api.createGame(731);g.creatures.length=0;settle(g);g.p.yaw=0;
  const e=g.spawn('grazer',g.p.x,g.p.z-4);let min=Infinity,touched=false;
  for(let t=0;t<6;t+=dt){api.update(g,{moveZ:1,sprint:true},dt);const d=Math.hypot(g.p.x-e.x,g.p.z-e.z);min=Math.min(min,api.bodyDistance(e,g.p.x,g.p.z,g.p.y));if(api.bodyDistance(e,g.p.x,g.p.z,g.p.y)<.6)touched=true;}
  assert.ok(touched,'the player must catch the grazer on its own level (dt '+dt+')');
  assert.ok(min>=.25,`dt ${dt}: player came within ${min.toFixed(2)} of the grazer body`);
 }
});

test('a player a creature has landed on is freed at once and can back away',()=>{
 const g=api.createGame(731);g.creatures.length=0;settle(g);g.p.hp=1e6;
 const rex=g.spawn('rex',g.p.x,g.p.z-.4);rex.cool=99;const sx=g.p.x,sz=g.p.z;
 api.update(g,{},1/60);
 assert.ok(api.bodyDistance(rex,g.p.x,g.p.z,g.p.y)>=.29,'one step must clear the overlap');
 // Back straight away from the animal: the player faces it and walks backwards.
 for(let i=0;i<60;i++){g.p.yaw=Math.atan2(-(rex.x-g.p.x),-(rex.z-g.p.z));api.update(g,{moveZ:-1},1/60);g.p.hp=1e6;g.dead=false;}
 assert.ok(Math.hypot(g.p.x-sx,g.p.z-sz)>2,'backing away from a creature must not be blocked');
});

test('a chasing rex goes around a tree trunk instead of through it, and still arrives',()=>{
 const g=api.createGame(731),k=g.k;let spot=null;
 for(let x=-40;x<=40&&!spot;x++)for(let z=-40;z<=40&&!spot;z++){
  const h=k.height(x,z);if(h<14||g.block(x,h+1,z)!==5)continue;
  // Level ground on both sides, and nothing but this trunk on the straight line.
  let ok=true;for(let d=-7;d<=7;d++){if(Math.abs(k.height(x+d,z)-h)>1)ok=false;if(d&&(g.block(x+d,k.height(x+d,z)+1,z)||g.block(x+d,k.height(x+d,z)+2,z)))ok=false;}
  if(ok)spot={x,z};
 }
 assert.ok(spot,'need a trunk on level ground near spawn');
 g.creatures.length=0;g.p.x=spot.x+6.5;g.p.z=spot.z+.5;settle(g);g.p.hp=1e6;
 const rex=g.spawn('rex',spot.x-5.5,spot.z+.5);let inside=0,crossed=false;
 for(let i=0;i<60*14;i++){api.update(g,{},1/60);g.p.hp=1e6;g.dead=false;
  // Trunks and built blocks stop a dinosaur; leaves (6) are passable for creatures by design.
  const solid=y=>{const b=g.block(rex.x,y,rex.z);return b&&b!==6;};if(solid(rex.y+.5)||solid(rex.y+1.5))inside++;
  if(rex.x>spot.x+1.5)crossed=true;}
 assert.equal(inside,0,`rex centre was inside a trunk for ${inside} frames`);
 assert.ok(crossed,'the rex must get past the trunk, not stop behind it');
 assert.ok(Math.hypot(g.p.x-rex.x,g.p.z-rex.z)<6,'the rex must still reach biting range of the player');
});

test('a rex that has closed in keeps its head in front of the player, and its bite still lands',()=>{
 const g=api.createGame(731);g.creatures.length=0;settle(g);
 const rex=g.spawn('rex',g.p.x,g.p.z-10);rex.cool=0;let min=Infinity,hurt=false;
 for(let i=0;i<60*8&&!hurt;i++){api.update(g,{},1/60);min=Math.min(min,api.bodyDistance(rex,g.p.x,g.p.z,g.p.y));if(g.events.some(e=>e.type==='hurt'))hurt=true;}
 assert.ok(min>=.3,`rex body came within ${min.toFixed(2)} of a standing player`);
 assert.ok(hurt,'a player who stands still must still be bitten');
});
