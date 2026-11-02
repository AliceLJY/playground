const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js'),roster=require('../demo-script.json').roster,T=Date.parse('2026-11-02T02:00:00Z'),iso=n=>new Date(n).toISOString();
const states=s=>s.actors.map(a=>[a.id,a.status,a.statusSince]);
function create(layout='portrait',status='idle'){const s=C.create(roster,7,layout);s.clockBase=T;for(const a of s.actors)s.setStatus(a.id,status,iso(T));return s;}
function steps(s,ms,check=()=>{}){for(let t=0;t<ms;t+=20){s.step(20);check();}}
function meeting(s,round=1,rejected=1,age=0){return {...C.emptyScene(),meeting:{kind:'review',since:iso(T),roundAt:iso(T+s.time*1000-age),members:['director','builder','twin-a'],round,slide:{adopted:1,rejected,open:0}}};}
function clearPaths(s){for(const a of [...s.actors,...(s.guard?[s.guard]:[])])assert.ok(!C.blocked(a.x,a.y,s.layout),`${s.layout.id} ${a.id}: ${a.x},${a.y}`);}
for(const layout of ['portrait','landscape']) {
 test(`argument ${layout}: actual approach/talk/shared cloud/huff/return; immutable statuses; same round never replays`,()=>{
  const s=create(layout,'busy'),before=states(s),phases=new Set(),words=new Set();s.setScene(meeting(s,1,3),T);let smoke=0,moved=0;
  steps(s,40000,()=>{assert.deepEqual(states(s),before);clearPaths(s);if(s.argue){phases.add(s.argue.phase);for(const b of s.eventSpeech())words.add(b.text);if(s.argue.phase==='smoke'){smoke++;assert.ok(C.distance(...s.argue.ids.map(id=>s.actors.find(a=>a.id===id)))<.01);}moved++;}});
  assert.deepEqual([...phases],['arriving','talking','joining','smoke','huff','returning']);assert.ok(smoke>=120&&moved>300);assert.equal(words.size,6);assert.equal(s.argue,null);
  s.setScene(meeting(s,1,3));s.step(20000);assert.equal(s.argue,null);assert.equal(s.eventQueues.argue.length,0);
  s.setScene(meeting(s,2,1));s.step(20);assert.ok(s.argue);s.setScene({...C.emptyScene()});s.step(20);assert.equal(s.argue,null);
 });
 test(`snack ${layout}: every occupied desk reached, biscuits last five minutes; real work interrupts`,()=>{
  const s=create(layout),before=states(s);s.setScene({...C.emptyScene(),snack:{id:'builder',at:iso(T)}},T);let visited=0;
  steps(s,60000,()=>{clearPaths(s);assert.deepEqual(states(s),before);visited=Math.max(visited,s.foodNow().length);});
  assert.equal(visited,roster.length);assert.equal(s.snack,null);assert.ok(s.foodNow().every(f=>f.kind==='biscuit'));s.step(300000);assert.equal(s.foodNow().length,0);
  s.setScene({...C.emptyScene(),snack:{id:'builder',at:iso(T+s.time*1000)}});s.step(20);assert.ok(s.snack);s.setStatus('builder','busy',iso(T+1));s.step(20);assert.equal(s.snack,null);assert.equal(s.actors.find(a=>a.id==='builder').activity,null);
 });
 test(`melon ${layout}: only 2–3 idle game-corner colleagues, waits three seconds then returns; no idle means none`,()=>{
  const s=create(layout);s.step(20000);s.setStatus('director','waiting',iso(T));const before=states(s);s.step(5000);assert.ok(s.melon);assert.ok(s.melon.ids.length>=2&&s.melon.ids.length<=3);
  assert.ok(s.melon.ids.every(id=>s.actors.find(a=>a.id===id).status==='idle'));const ids=[...s.melon.ids];steps(s,3000,()=>{clearPaths(s);assert.deepEqual(states(s),before);});
  s.setStatus('director','idle',iso(T));s.step(2900);assert.ok(s.melon);s.step(200);assert.equal(s.melon,null);s.step(15000);for(const id of ids)assert.ok(s.gameActivity(s.actors.find(a=>a.id===id)));
  const b=create(layout,'busy');b.setStatus('director','waiting',iso(T));b.step(30000);assert.equal(b.melon,null);
 });
 test(`quota ${layout}: wall route, status invariant, release by clear/expiry; reception/melon cannot steal`,()=>{
  const s=create(layout);s.setQuota({artist:iso(T+60000)},T);s.step(10000);const a=s.actors.find(a=>a.id==='artist'),before=states(s);assert.equal(a.activity,'quota');assert.equal(a.path.length,0);
  s.meet('pitch',iso(T+10000));s.setStatus('director','waiting',iso(T));const expected=states(s);steps(s,30000,()=>{clearPaths(s);assert.equal(a.activity,'quota');assert.deepEqual(states(s),expected);assert.ok(!s.reception?.hosts.includes('artist'));assert.ok(!s.melon?.ids.includes('artist'));});
  s.setQuota({});s.step(20000);assert.notEqual(a.activity,'quota');assert.equal(a.statusSince,before.find(x=>x[0]==='artist')[2]);
  s.setQuota({artist:iso(T+s.time*1000+2000)});s.step(2100);assert.equal(s.quotaEvent,null);
 });
 test(`supper ${layout}: guard enters, delivers every signalled desk, exits; bowls last ten minutes`,()=>{
  const s=create(layout,'busy'),before=states(s);s.setScene({...C.emptyScene(),supper:{at:iso(T),ids:['builder','artist','writer']}},T);let count=0,moving=false;
  steps(s,60000,()=>{clearPaths(s);assert.deepEqual(states(s),before);count=Math.max(count,s.foodNow().length);moving ||=!!s.guard?.path.length;});
  assert.ok(moving);assert.equal(count,3);assert.equal(s.supper,null);assert.equal(s.guard,null);assert.ok(s.foodNow().every(f=>f.kind==='noodles'));s.step(600000);assert.equal(s.foodNow().length,0);
 });
}
test('late arguments skipped, stable reviewer hash across seed/order, priority table and active reception retained',()=>{
 const late=create();late.setScene(meeting(late,1,2,120001),T);late.step(30000);assert.equal(late.argue,null);
 const a=create(),b=C.create([...roster].reverse(),99);b.clockBase=T;for(const x of b.actors)b.setStatus(x.id,'idle',iso(T));for(const s of [a,b]){s.setScene(meeting(s),T);s.step(20);}assert.deepEqual(a.argue.ids,b.argue.ids);
 assert.deepEqual(Object.keys(C.ACTIVITY_PRIORITY),['work','quota','reception','argue','snack','melon','games']);
 const s=create();s.setScene(meeting(s,1,0),T);s.meet('pitch',iso(T));s.step(16000);const hosts=[...s.reception.hosts];s.setScene(meeting(s,2,1));s.step(1000);assert.deepEqual(s.reception.hosts,hosts);for(const id of hosts)assert.equal(s.actors.find(a=>a.id===id).activity,'reception');
 s.setScene({...s.scene,call:{since:iso(T)}});s.step(20);assert.equal(s.argue,null);assert.equal(s.actors.find(a=>a.id==='director').activity,'call');
});
test('one per type, pending cap three, FIFO and expired pending discarded; rotation retains food/dedupe',()=>{
 let s=create('portrait','busy');for(let i=0;i<5;i++)s.setScene({...C.emptyScene(),snack:{id:roster[i].id,at:iso(T-i*1000)}},T);
 assert.equal(s.eventQueues.snack.length,3);assert.equal(s.eventQueues.snack[0].at,T-2000);s.step(121000);assert.equal(s.eventQueues.snack.length,0);assert.equal(s.snack,null);
 s=create();s.setScene({...C.emptyScene(),snack:{id:'builder',at:iso(T)}});s.step(10000);const snack=s.snack;s=s.relayout('landscape');assert.equal(s.snack.at,snack.at);steps(s,50000,()=>clearPaths(s));assert.equal(s.snack,null);assert.equal(s.foodNow().length,roster.length);
 const q=create();q.setQuota({artist:iso(T+4000),builder:iso(T+8000),helper:iso(T+12000)});q.step(20);assert.equal(q.actors.filter(a=>a.activity==='quota').length,1);q.step(4200);assert.equal(q.quotaEvent.id,'builder');q.step(8000);assert.equal(q.quotaEvent,null);
});
test('courier and argument also trigger melon; recipients with real work are released immediately',()=>{
 const s=create();s.step(20000);s.notice({at:iso(T),text:'test note'});let note=false;
 steps(s,30000,()=>{if(s.delivery?.phase==='holding'&&s.melon)note=true;});assert.ok(note);
 s.setScene(meeting(s));let argue=false;steps(s,20000,()=>{if(s.argue?.phase==='talking'&&s.melon)argue=true;});assert.ok(argue);
 if(s.melon){const id=s.melon.ids[0];s.setStatus(id,'busy',iso(T+1));s.step(20);assert.ok(!s.melon?.ids.includes(id));}
});
test('new snapshot fields strict, old optional, fixed templates have no arbitrary source text',()=>{
 const valid={roster,scene:{...C.emptyScene(),snack:{id:'builder',at:iso(T)},supper:{at:iso(T),ids:['builder']}},quota:{artist:iso(T+60000)},stats:require('../demo-script.json').stats,events:[{kind:'argue',at:iso(T),round:2,rejected:3},{kind:'snack',at:iso(T),ids:['builder']},{kind:'quota',at:iso(T),ids:['artist'],clear:false},{kind:'supper',at:iso(T),ids:['builder']}]};
 assert.doesNotThrow(()=>C.validateSceneFields(valid));assert.doesNotThrow(()=>C.validateSceneFields({roster}));
 for(const patch of [{quota:null},{quota:[]},{quota:{nope:iso(T)}},{quota:{artist:'tomorrow'}},{quota:{artist:3}},{scene:{...valid.scene,snack:{id:'bad',at:iso(T)}}},{scene:{...valid.scene,snack:{id:'builder',at:iso(T),task:'private'}}},{scene:{...valid.scene,supper:{ids:['builder','builder'],at:iso(T)}}},{scene:{...valid.scene,supper:{ids:[],at:iso(T)}}},{scene:{...valid.scene,supper:{ids:['builder'],at:'today'}}},{scene:{...valid.scene,meeting:{...meeting(create()).meeting,roundAt:'bad'}}},{stats:{...valid.stats,snacksTotal:-1}},{stats:{...valid.stats,today:{...valid.stats.today,suppers:'1'}}},{events:[{kind:'argue',at:iso(T),round:2,rejected:0}]},{events:[{kind:'quota',at:iso(T),ids:['artist'],clear:'yes'}]}])assert.throws(()=>C.validateSceneFields({...valid,...patch}));
 assert.match(C.eventText(valid.events[0],roster),/第 2 轮，反驳 3 条/);assert.match(C.eventText(valid.events[1],roster),/交了大活/);
});
test('history recovers several completions between polls, dedupes minute-rounded guest/latest signals, and plays FIFO',()=>{
 const s=create();s.receiveEventHistory([{kind:'snack',ids:['builder'],at:iso(T)},{kind:'snack',ids:['artist'],at:iso(T)}]);s.setScene({...C.emptyScene(),snack:{id:'artist',at:iso(T+400)}},T+400);assert.equal(s.eventQueues.snack.length,2);
 s.step(20);assert.equal(s.snack.id,'builder');let next=false;steps(s,90000,()=>{next ||=s.snack?.id==='artist';});assert.ok(next);assert.equal(s.snack,null);
});
test('existing guard resumes its own patrol after supper; queued supper expires and cannot duplicate the guard',()=>{
 const s=create();s.night=true;s.setScene({...C.emptyScene(),guard:{at:iso(T),phase:'patrol',ok:null}},T);s.step(1000);const guard=s.guard,waypoint=guard.waypoint;
 s.setScene({...s.scene,supper:{at:iso(T+1000),ids:['builder']}},T+1000);s.step(20);assert.equal(s.guard,guard);assert.equal(s.supper.borrowed,false);
 steps(s,50000,()=>clearPaths(s));assert.equal(s.supper,null);assert.equal(s.guard,guard);assert.ok(s.guard.waypoint>=waypoint);
 s.setScene({...s.scene,supper:{at:iso(T-120001),ids:['artist']}},T);s.step(20);assert.equal(s.supper,null);
});
test('work/call/meeting outrank quota; snacks yield to reception; melon never claims a receiver',()=>{
 const s=create();s.setQuota({builder:iso(T+3600000)},T);s.step(20);assert.equal(s.actors.find(a=>a.id==='builder').activity,'quota');
 s.setStatus('builder','busy',iso(T));s.step(20);assert.equal(s.actors.find(a=>a.id==='builder').activity,null);
 s.setStatus('builder','idle',iso(T));s.setScene(meeting(s,1,0));s.step(20);assert.equal(s.actors.find(a=>a.id==='builder').activity,'meeting');
 const r=create();r.meet('pitch',iso(T));r.step(16000);const id=r.reception.hosts[0];r.setScene({...C.emptyScene(),snack:{id,at:iso(T+16000)}});r.step(20);assert.equal(r.snack,null);assert.equal(r.actors.find(a=>a.id===id).activity,'reception');
});
