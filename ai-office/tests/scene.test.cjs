const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js'),script=require('../demo-script.json');
function simulation(seed){const s=C.create(script.roster,seed);for(const a of script.roster)s.setStatus(a.id,a.status);return s;}
function run(s,end){let index=0;for(let ms=0;ms<end;ms+=20){while(index<script.events.length&&script.events[index].at*1000<=ms){const e=script.events[index++];if(e.notice)s.notice({text:e.notice,at:new Date(0).toISOString()});else s.setStatus(e.id,e.status);}s.step(20);}return s;}
test('validateState accepts optional identity fields and rejects every malformed roster as a whole',()=>{
  const source=require('node:fs').readFileSync(require.resolve('../office.js'),'utf8');
  const body=source.match(/function validateState\(data\) \{[\s\S]*?return C\.validateSceneFields\(data\);\n  \}/)[0];
  const validate=require('node:vm').runInNewContext('('+body+')',{C,TREAT_NAMES:C.TREAT_NAMES,labels:Object.fromEntries(['busy','waiting','done','idle','away','off','unknown'].map(s=>[s,s]))});
  const fresh=()=>structuredClone(require('./fixtures/state-scene.json'));
  assert.doesNotThrow(()=>validate(fresh()));
  for(const value of [0,8,10,11]){const d=fresh();d.roster[0].look=value;d.roster[0].courier=true;d.roster[1].courier=false;assert.doesNotThrow(()=>validate(d));}
  for(const value of [null,'10',-1,12,1.5,NaN,Infinity,{},[]]){const d=fresh();d.roster[0].look=value;assert.throws(()=>validate(d),/Invalid role/);}
  for(const value of [null,'true',0,1,{},[]]){const d=fresh();d.roster[0].courier=value;assert.throws(()=>validate(d),/Invalid role/);}
  const two=fresh();two.roster[0].courier=true;two.roster[1].courier=true;assert.throws(()=>validate(two),/Invalid role/);
});
test('busy at desk, waiting at boss, departure actually exits, seed-reproducible movement',()=>{
  for(const seed of [1,7,31]){
    const s=run(simulation(seed),20000),waiting=s.actors.filter(a=>a.status==='waiting');
    assert.equal(waiting.length,2);
    waiting.forEach((a,i)=>assert.ok(C.distance(a,C.queuePoint(i))<1,`${a.id} did not reach queue`));
    assert.ok(C.distance(s.boss,C.bossDesk)<1);
    s.actors.filter(a=>a.status==='busy').forEach(a=>assert.ok(C.distance(a,C.home(a.i))<1));
    const muse=s.actors.find(a=>a.name==='Muse');assert.ok(C.distance(muse,C.door)<1,'away actor must leave the room');
    const other=run(simulation(seed),20000);assert.equal(s.boss.x,other.boss.x);assert.equal(s.boss.y,other.boss.y);
  }
});
test('courier arrives before notice view; paper holds eight seconds, multiple deliveries queue',()=>{
  const s=run(simulation(7),35000);assert.equal(s.delivery.phase,'holding');assert.ok(C.distance(s.actors.find(a=>s.isCourier(a)),C.handoff)<1);
  const arrival=s.delivery.arrived;s.notice({text:'second',at:new Date(1).toISOString()});
  s.step((arrival+7.98-s.time)*1000);assert.equal(s.delivery.phase,'holding');
  s.step(40);assert.equal(s.delivery.phase,'returning');assert.equal(s.delivered,1);
  s.step(16000);assert.equal(s.delivered,2);assert.equal(s.notices.length,2);
});
test('real movement samples stay inside floor and outside furniture; completion stays at its desk',()=>{
  const s=simulation(13);let moved=0;
  s.setStatus(s.actors.find(a=>a.i===1).id,'done');
  for(let i=0;i<1200;i++){
    s.step(20);
    for(const a of s.actors){assert.ok(a.x>=18&&a.x<=342&&a.y>=88&&a.y<=(a.awayPost==='kitchen'?720:398));if(a.path.length){moved++;assert.equal(C.blocked(a.x,a.y),false,`${a.id} walks through furniture at ${a.x},${a.y}`);}}
  }
  assert.ok(moved>100,'movement must actually occur');assert.ok(C.distance(s.actors.find(a=>a.i===1),C.home(1))<1);
});
test('every reported waiting state has a distinct reachable queue position',()=>{
  const s=simulation(7);for(const a of s.actors)s.setStatus(a.id,'waiting');s.step(20000);
  s.actors.forEach((a,i)=>assert.ok(C.distance(a,C.queuePoint(i))<1,`${a.id} cannot reach its queue position`));
  assert.equal(new Set(s.actors.map(a=>`${a.x},${a.y}`)).size,s.actors.length);
  assert.ok(C.distance(s.boss,C.bossDesk)<1);
});
test('a real notice waits for the roaming host before the eight-second handoff',()=>{
  const s=simulation(7);s.step(5000);s.bossTarget={x:340,y:700};s.step(15000);s.bossTarget=null;assert.ok(C.distance(s.boss,C.bossDesk)>30,'host must actually be away');
  s.notice({text:'delivery',at:new Date(0).toISOString()});let waitedAtDesk=false;
  for(let i=0;i<1000&&s.delivery?.phase!=='holding';i++){
    s.step(20);if(s.delivery?.phase==='walking'&&C.distance(s.actors.find(a=>s.isCourier(a)),C.handoff)<1&&C.distance(s.boss,C.bossDesk)>1)waitedAtDesk=true;
  }
  assert.equal(waitedAtDesk,true,'courier must really encounter an empty desk');assert.equal(s.delivery.phase,'holding');assert.ok(C.distance(s.boss,C.bossDesk)<1);
  s.step(7980);assert.equal(s.delivery.phase,'holding');s.step(40);assert.equal(s.delivery.phase,'returning');
});

test('visitors come in through the door, stroll only on walkable floor, and leave when the count drops',()=>{
  const s=simulation(3); s.setVisitors(2); s.step(15000);
  assert.equal(s.visitors.length,2);
  for(const v of s.visitors){assert.ok(C.distance(v,C.door)>8,`${v.id} still at the door`);assert.ok(!C.blocked(Math.round(v.x),Math.round(v.y)),`${v.id} inside furniture at ${v.x},${v.y}`);}
  const seen=new Set(); for(let i=0;i<40;i++){s.step(1000);for(const v of s.visitors){assert.ok(!C.blocked(Math.round(v.x),Math.round(v.y)));seen.add(`${Math.round(v.x/50)}`);}}
  assert.ok(seen.size>=2,'visitors move between spots');
  s.setVisitors(1); s.step(20000); assert.equal(s.visitors.length,1);
  s.setVisitors(0); s.step(20000); assert.equal(s.visitors.length,0,'everyone left');
  s.setVisitors(50); s.step(100); assert.equal(s.visitors.length,5,'five at most on screen');
});

test('a visitor stepping in starts a three-second greeting; it ends on its own and restarts only with the next visitor',()=>{
  const s=simulation(5); assert.equal(s.greeting(),null);
  s.setVisitors(1); s.step(100); const g=s.greeting(); assert.ok(g,'greeting starts as the visitor appears'); assert.equal(g.visitor,'visitor-1');
  s.step(2000); assert.ok(s.greeting(),'still greeting after two seconds');
  s.step(1500); assert.equal(s.greeting(),null,'over after three seconds');
  s.step(5000); assert.equal(s.greeting(),null,'the same visitor strolling does not restart it');
  s.setVisitors(2); s.step(100); assert.equal(s.greeting().visitor,'visitor-2','a second visitor is greeted too');
});

test('a treat is carried by a visitor to the pantry, everyone says thanks, cups stay on the desks; with no visitor a runner comes and goes',()=>{
  const s=simulation(9); s.setVisitors(1); s.step(8000);
  s.treat('milktea','2026-11-01T08:00:00Z'); s.step(100);
  const v=s.visitors[0]; assert.equal(v.carry,'milktea','the visitor picked it up');
  let arrived=false; for(let i=0;i<60;i++){s.step(500); if(s.thanksNow()){arrived=true;break;}}
  assert.ok(arrived,'the cup reached the pantry'); assert.equal(s.thanksNow().kind,'milktea'); assert.equal(v.carry,null,'hands are empty once it is on the pantry'); assert.ok(C.distance(v,C.pantry)<30,'thanks start at the pantry, before the visitor wanders far');
  assert.equal(s.deskTreatNow().kind,'milktea'); s.step(3500); assert.equal(s.thanksNow(),null,'thanks are over'); assert.ok(s.deskTreatNow(),'cups stay');
  s.step(125000); assert.equal(s.deskTreatNow(),null,'cups are cleared after two minutes');
  s.treat('nope','2026-11-01T08:01:00Z'); s.step(100); assert.equal(s.visitors.length,1,'an unknown kind is ignored');
  s.setVisitors(0); s.step(20000); assert.equal(s.visitors.length,0);
  s.treat('cake','2026-11-01T08:02:00Z'); s.step(100); assert.equal(s.visitors.length,1,'a runner is sent when nobody is visiting'); assert.ok(s.visitors[0].runner);
  arrived=false; for(let i=0;i<60;i++){s.step(500); if(s.thanksNow()){arrived=true;break;}} assert.ok(arrived,'the runner delivered');
  s.step(30000); assert.equal(s.visitors.length,0,'the runner leaves after delivering');
});
