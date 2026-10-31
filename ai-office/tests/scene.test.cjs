const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js'),script=require('../demo-script.json');
function simulation(seed){const s=C.create(script.roster,seed);for(const a of script.roster)s.setStatus(a.id,a.status);return s;}
function run(s,end){let index=0;for(let ms=0;ms<end;ms+=20){while(index<script.events.length&&script.events[index].at*1000<=ms){const e=script.events[index++];if(e.notice)s.notice({text:e.notice,at:new Date(0).toISOString()});else s.setStatus(e.id,e.status);}s.step(20);}return s;}
test('busy at desk, waiting at boss, departure actually exits, seed-reproducible movement',()=>{
  for(const seed of [1,7,31]){
    const s=run(simulation(seed),20000),waiting=s.actors.filter(a=>a.status==='waiting');
    assert.equal(waiting.length,2);
    waiting.forEach((a,i)=>assert.ok(C.distance(a,C.queuePoint(i))<1,`${a.id} did not reach queue`));
    assert.ok(C.distance(s.boss,C.bossDesk)<1);
    s.actors.filter(a=>a.status==='busy').forEach(a=>assert.ok(C.distance(a,C.home(a.i))<1));
    const muse=s.actors[7];assert.ok(C.distance(muse,C.door)<1,'away actor must leave the room');
    const other=run(simulation(seed),20000);assert.equal(s.boss.x,other.boss.x);assert.equal(s.boss.y,other.boss.y);
  }
});
test('courier arrives before notice view; paper holds eight seconds, multiple deliveries queue',()=>{
  const s=run(simulation(7),35000);assert.equal(s.delivery.phase,'holding');assert.ok(C.distance(s.actors[10],C.handoff)<1);
  const arrival=s.delivery.arrived;s.notice({text:'second',at:new Date(1).toISOString()});
  s.step((arrival+7.98-s.time)*1000);assert.equal(s.delivery.phase,'holding');
  s.step(40);assert.equal(s.delivery.phase,'returning');assert.equal(s.delivered,1);
  s.step(16000);assert.equal(s.delivered,2);assert.equal(s.notices.length,2);
});
test('real movement samples stay inside floor and outside furniture; completion reaches rest',()=>{
  const s=simulation(13);let moved=0;
  s.setStatus(s.actors[1].id,'done');
  for(let i=0;i<1200;i++){
    s.step(20);
    for(const a of s.actors){assert.ok(a.x>=18&&a.x<=342&&a.y>=88&&a.y<=398);if(a.path.length){moved++;assert.equal(C.blocked(a.x,a.y),false,`${a.id} walks through furniture at ${a.x},${a.y}`);}}
  }
  assert.ok(moved>100,'movement must actually occur');assert.ok(C.distance(s.actors[1],{x:C.rest[1][0],y:C.rest[1][1]})<1);
});
test('all eleven reported waiting states have distinct reachable queue positions',()=>{
  const s=simulation(7);for(const a of s.actors)s.setStatus(a.id,'waiting');s.step(20000);
  s.actors.forEach((a,i)=>assert.ok(C.distance(a,C.queuePoint(i))<1,`${a.id} cannot reach its queue position`));
  assert.equal(new Set(s.actors.map(a=>`${a.x},${a.y}`)).size,11);
  assert.ok(C.distance(s.boss,C.bossDesk)<1);
});
test('a real notice waits for the roaming host before the eight-second handoff',()=>{
  const s=simulation(7);s.step(5000);assert.ok(C.distance(s.boss,C.bossDesk)>30,'host must actually be away');
  s.notice({text:'delivery',at:new Date(0).toISOString()});let waitedAtDesk=false;
  for(let i=0;i<1000&&s.delivery?.phase!=='holding';i++){
    s.step(20);if(s.delivery?.phase==='walking'&&C.distance(s.actors[10],C.handoff)<1&&C.distance(s.boss,C.bossDesk)>1)waitedAtDesk=true;
  }
  assert.equal(waitedAtDesk,true,'courier must really encounter an empty desk');assert.equal(s.delivery.phase,'holding');assert.ok(C.distance(s.boss,C.bossDesk)<1);
  s.step(7980);assert.equal(s.delivery.phase,'holding');s.step(40);assert.equal(s.delivery.phase,'returning');
});
