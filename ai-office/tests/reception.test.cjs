const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js'),roster=require('../demo-script.json').roster;
const at='2026-11-02T02:00:00.000Z';
function create(layout='portrait',statuses={}) {const s=C.create(roster,7,layout);for(const a of s.actors)s.setStatus(a.id,statuses[a.id]||'idle',at);return s;}
const states=s=>s.actors.map(a=>[a.id,a.status,a.statusSince]);
function finish(s,max=65000) {let elapsed=0;while((s.reception||s.meetQueue.length)&&elapsed<max){s.step(20);elapsed+=20;}assert.equal(s.reception,null,'visitor must leave');return elapsed;}
test('reception picks only current idle hosts, never courier/meeting/call, at most two; status invariance and return',()=>{
 for(const layout of ['portrait','landscape'])for(const kind of Object.keys(C.MEET_NAMES)) {
  const s=create(layout,{builder:'busy','twin-a':'waiting',artist:'done',scout:'away',filmmaker:'off'});
  s.setScene({...C.emptyScene(),call:{since:at},meeting:{members:['writer'],kind:'huddle',since:at,round:null,slide:null}});
  const before=states(s);s.meet(kind,at);s.step(40);const m=s.reception;
  assert.ok(m.hosts.length>0&&m.hosts.length<=(kind==='chat'?1:2));
  assert.ok(m.hosts.every(id=>['companion','helper'].includes(id)));assert.equal(m.venue,'pantry');
  finish(s);s.step(20000);assert.deepEqual(states(s),before);assert.ok(s.actors.every(a=>a.activity!=='reception'));
 }
});
test('normal visit really seats, alternates four lines 7s apart, shakes hands and exits in 40–60 seconds',()=>{
 for(const layout of ['portrait','landscape']) {
  const s=create(layout);s.meet('pitch',at,true);const before=states(s),seen=new Set(),phases=new Set();let elapsed=0,hand=false,moved=false;
  while((!elapsed||s.reception)&&elapsed<60000){s.step(20);elapsed+=20;const m=s.reception;if(!m)continue;
   phases.add(m.phase);moved ||= C.distance(m.visitor,s.layout.door)>100;
   if(m.phase==='talking'){assert.equal(m.venue,'meeting');assert.ok(C.distance(m.visitor,s.layout.seats[1])<1);seen.add(s.receptionSpeech().text);}
   if(m.phase==='handshake'&&s.time-m.handshakeAt>1){hand=true;assert.ok(C.distance(m.visitor,s.actors.find(a=>a.id===m.hosts[0]))<=21);}
   assert.deepEqual(states(s),before);
  }
  assert.ok(moved&&hand);assert.equal(s.reception,null);assert.ok(elapsed>=40000&&elapsed<=60000,`${layout}: ${elapsed}`);assert.equal(seen.size,4);assert.deepEqual([...phases],['arriving','talking','handshake','leaving']);
 }
});
test('no idle: Cobbler tea greeting lasts 20s; unknown is not idle',()=>{
 const s=create('portrait',Object.fromEntries(roster.map(a=>[a.id,'busy'])));s.meet('learn',at);s.step(40);
 assert.equal(s.reception.mode,'tea');assert.deepEqual(s.reception.hosts,['courier']);assert.match(s.receptionSpeech().text,/都在赶活/);assert.equal(s.reception.venue,'pantry');
 const before=states(s);s.step(18000);assert.ok(s.reception);finish(s,15000);assert.deepEqual(states(s),before);
 const u=create('portrait',Object.fromEntries(roster.map(a=>[a.id,'unknown'])));u.meet('learn',at);u.step(40);assert.equal(u.reception.mode,'tea');assert.ok(u.reception.uncertain);
});
// 11-03 Alice: 「深夜……我去接待吧」— with everyone asleep the boss receives the guest at the door, guard or not; sleepers stay put.
test('all off: the boss receives at the door, visible entry then exit after 10s, sleepers stay asleep',()=>{
 for(const guard of [false,true]) {const s=create('portrait',Object.fromEntries(roster.map(a=>[a.id,'off'])));s.night=guard;if(guard)s.setScene({...C.emptyScene(),guard:{phase:'patrol',at,ok:null}});
 s.step(60000);const before=s.actors.map(a=>[a.x,a.y]);s.meet('chat',at);s.step(1000);assert.equal(s.reception.mode,'closed');assert.match(s.receptionSpeech().text,/我来招呼你/);assert.equal(s.receptionSpeech().id,'boss');assert.ok(C.distance(s.reception.visitor,s.layout.door)>1);
 s.step(5000);assert.ok(C.distance(s.boss,{x:s.layout.door.x-40,y:s.layout.door.y})<1,'the boss is at the door');assert.match(s.receptionSpeech().text,/白天再来/);assert.ok(finish(s,12000)>=3000);assert.deepEqual(s.actors.map(a=>[a.x,a.y]),before);}
});
test('real meeting reserves the room initially and mid-visit, and new work/calls release hosts',()=>{
 for(const layout of ['portrait','landscape']) {const s=create(layout);s.meet('research',at);s.step(16000);assert.equal(s.reception.phase,'talking');const ids=s.reception.hosts.slice();
 s.setScene({...C.emptyScene(),meeting:{members:['courier'],kind:'huddle',since:at,round:null,slide:null}});s.step(40);assert.equal(s.reception.venue,'pantry');assert.match(s.receptionSpeech().text,/会议室有人/);
 s.step(15000);for(const id of ids)assert.ok(C.distance(s.actors.find(a=>a.id===id),s.layout.pantry)<30);
 s.setStatus(ids[0],'busy','2026-11-02T02:01:00Z');s.step(40);assert.ok(!s.reception.hosts.includes(ids[0]));assert.notEqual(s.actors.find(a=>a.id===ids[0]).activity,'reception');finish(s);
 }
});
test('same at and same availability select the same hosts despite seed/order/visitors; queue FIFO and cap three',()=>{
 const a=create(),b=C.create([...roster].reverse(),987);for(const x of b.actors)b.setStatus(x.id,'idle',at);b.setVisitors(3);b.step(2000);
 a.meet('research',at);b.meet('research',at);a.step(40);b.step(40);assert.deepEqual(a.reception.hosts,b.reception.hosts);
 a.meet('research',at);assert.equal(a.meetQueue.length,0);
 for(let n=1;n<=4;n++)a.meet('chat',`2026-11-02T02:00:0${n}.000Z`);assert.equal(a.meetQueue.length,3);assert.match(a.meetQueue[0].at,/02\.000Z$/);
 const order=[a.reception.at];let prev=a.reception.at;
 for(let i=0;i<250000;i+=100){a.step(100);if(a.reception&&a.reception.at!==prev){prev=a.reception.at;order.push(prev);}}
 // FIFO with the oldest dropped at the cap of three; the last one may expire before its turn (the 11-03 tower's meeting room is a
 // shorter walk, so it can also be served in time).
 const expected=[at,...[2,3].map(n=>`2026-11-02T02:00:0${n}.000Z`)];assert.deepEqual(order.slice(0,3),expected);assert.ok(order.length===3||order[3]==='2026-11-02T02:00:04.000Z');assert.equal(a.reception,null);
});
test('reception paths avoid furniture for both layouts; rotation keeps ownership, queue and phase',()=>{
 for(const layout of ['portrait','landscape']){let s=create(layout);s.meet('pitch',at,true);s.meet('chat','2026-11-02T02:00:01Z');let samples=0;
 for(let t=0;t<50000;t+=20){s.step(20);if(s.reception)for(const a of [s.reception.visitor,...s.actors.filter(a=>a.activity==='reception')]){assert.ok(!C.blocked(a.x,a.y,s.layout),`${layout} ${a.id} ${a.x},${a.y}`);samples++;}}
 assert.ok(samples>1000);
 s=create(layout);s.meet('pitch',at,true);s.step(16000);const before=s.reception; s=s.relayout(layout==='portrait'?'landscape':'portrait');assert.equal(s.reception.at,at);assert.equal(s.reception.phase,before.phase);assert.equal(s.reception.local,true);finish(s);
 }
});
test('strict reception snapshot fields, optional old feeds, counts and event template',()=>{
 const base={roster,meets:[{kind:'pitch',at}],meetsToday:{pitch:1},stats:require('../demo-script.json').stats,events:[{kind:'reception',at}]};
 assert.doesNotThrow(()=>C.validateSceneFields(structuredClone(base)));assert.doesNotThrow(()=>C.validateSceneFields({roster}));
 const bad=[{meets:null},{meets:Array(11).fill({kind:'pitch',at})},{meets:[{kind:'free',at}]},{meets:[{kind:'pitch',at:'tomorrow'}]},{meets:[{kind:'pitch',at,v:'private'}]},{meetsToday:[]},{meetsToday:{free:1}},{meetsToday:{pitch:-1}},{meetsToday:{chat:1.5}}];
 for(const patch of bad)assert.throws(()=>C.validateSceneFields({...base,...patch}));
 for(const patch of [{meetsTotal:-1},{today:{...base.stats.today,meets:'1'}}])assert.throws(()=>C.validateSceneFields({...base,stats:{...base.stats,...patch}}));
 assert.match(C.eventText(base.events[0],roster),/接待/);
 const legacy=create('legacy');legacy.meet('chat',at);legacy.step(60000);assert.equal(legacy.reception,null);
});

test('two fresh visits play in order; stale queued events expire before taking the room',()=>{
 const s=create();s.meet('chat',at);s.meet('pitch','2026-11-02T02:00:01Z');s.step(40);assert.equal(s.reception.kind,'chat');s.step(60000);assert.equal(s.reception.kind,'pitch');finish(s);
 const tiny=create();tiny.meet('chat',at);while(tiny.reception?.phase!=='leaving')tiny.step(20);for(let i=0;i<100;i++)tiny.step(1);finish(tiny);
 const q=create();q.meet('chat',at);q.meet('pitch','2026-11-02T02:00:01Z',false,119000);q.step(60000);assert.equal(q.reception,null);assert.equal(q.meetQueue.length,0);
});
