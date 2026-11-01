const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js'),fixture=require('./fixtures/state-scene.json');
const fresh=()=>structuredClone(fixture);
function simulation(seed=7){const s=C.create(fixture.roster,seed);for(const a of fixture.roster)s.setStatus(a.id,a.status);return s;}
function scene(s,patch){s.setScene({...C.emptyScene(),...patch});}
function walk(s,seconds){let moved=0;for(let i=0;i<seconds*50;i++){s.step(20);for(const a of [...s.actors,...s.visitors,...(s.guard?[s.guard]:[])])if(a.path.length){moved++;assert.equal(C.blocked(a.x,a.y),false,`${a.id} crossed furniture: ${a.x},${a.y}`);}}return moved;}
test('contract fixture and old feed accepted; malformed structural fields rejected',()=>{
  assert.equal(C.validateSceneFields(fresh()).scene.disk.usedPct,93);
  const offset=fresh();offset.scene.meeting.since='2026-11-01T15:18:00+08:00';assert.doesNotThrow(()=>C.validateSceneFields(offset));
  const old=fresh();delete old.scene;delete old.stats;delete old.events;assert.doesNotThrow(()=>C.validateSceneFields(old));
  for(const mutate of [d=>d.scene=null,d=>d.scene.dispatched=['cc'],d=>d.scene.dispatched=['not-a-role'],d=>d.scene.dispatched=Array(12).fill('codex'),d=>d.scene.meeting.members=['codex','codex'],d=>d.scene.meeting.members=Array(12).fill('cc'),d=>d.scene.meeting.round=Infinity,d=>d.scene.meeting.kind='chat',d=>d.scene.meeting.slide.open=-1,d=>d.scene.meeting.since='bad',d=>d.scene.meeting.since='2026-02-30T00:00:00Z',d=>d.scene.call={since:42},d=>d.scene.disk.usedPct=101,d=>d.scene.disk.usedPct='93',d=>d.scene.guard.ok=1,d=>d.scene.guard.phase='sleep',d=>d.scene.guard.at='2026',d=>d.stats.today.calls=-1,d=>d.stats.meetingsTotal=1e9+1,d=>d.stats.since='2026-02-30',d=>d.events=Array(41).fill(d.events[0]),d=>d.events[0].kind='x'.repeat(17),d=>d.events[0].kind='Hello!',d=>d.events[0].text='free text',d=>d.events[0].ids=['unknown'],d=>d.events[0].ok=null,d=>d.events[0].round=1.2,d=>d.events[0].minutes=1441,d=>d.events[0].n=100001,d=>d.events[0].treat='__proto__',d=>d.events[0].review='yes',d=>d.events=[{kind:'handoff',at:d.updatedAt,ids:['cc']}],d=>d.events=[null]]){
    const d=fresh();mutate(d);assert.throws(()=>C.validateSceneFields(d),/Invalid scene state/);
  }
  const future=fresh();future.events.push({at:future.updatedAt,kind:'new-event'});assert.doesNotThrow(()=>C.validateSceneFields(future));assert.equal(C.eventText(future.events.at(-1),future.roster),null);
});
test('new targets are reachable from all original desks, rest and door',()=>{
  const targets=[C.podium,C.booth,...C.seats,...C.audience,...C.patrol];
  for(const start of [...C.desks.map((_,i)=>C.home(i)),...C.rest.map(([x,y])=>({x,y})),C.door])for(const target of targets){assert.ok(!C.blocked(target.x,target.y));assert.ok(C.route(start,target).length,JSON.stringify({start,target}));}
});
test('meeting starts from desks or rest, seats every member, round changes do not move them, end returns them',()=>{
  for(const seed of [1,7,31]){
    const s=simulation(seed);s.setStatus('kimi','idle');s.step(10000);scene(s,{meeting:fixture.scene.meeting});assert.ok(walk(s,35)>500);
    for(const id of fixture.scene.meeting.members){const a=s.actors.find(a=>a.id===id);assert.ok(C.distance(a,s.meetingTarget(id))<1,id);}
    const points=s.actors.filter(a=>a.activity).map(a=>[a.x,a.y]);s.setScene({...s.scene,meeting:{...s.scene.meeting,round:3}});s.step(1000);assert.deepEqual(s.actors.filter(a=>a.activity).map(a=>[a.x,a.y]),points);
    scene(s,{});walk(s,35);for(const id of ['cc','codex','grok']){const a=s.actors.find(a=>a.id===id);assert.ok(C.distance(a,C.home(a.i))<1);}
    const k=s.actors.find(a=>a.id==='kimi');assert.ok(C.distance(k,{x:C.rest[k.i][0],y:C.rest[k.i][1]})<1);
  }
  const full=C.create(Array.from({length:11},(_,desk)=>({id:desk?'a'+desk:'cc',desk})));scene(full,{meeting:{...fixture.scene.meeting,members:full.actors.map(a=>a.id)}});walk(full,35);assert.equal(new Set(full.actors.map(a=>`${a.x},${a.y}`)).size,11);full.actors.forEach(a=>assert.ok(C.distance(a,full.meetingTarget(a.id))<1));
});
test('dispatch delta makes a one-second parabola, persists on desk, returns; unchanged snapshots never replay',()=>{
  const s=simulation();scene(s,{dispatched:['codex']});assert.equal(s.flights.length,1);s.step(500);const f=s.flightPoints()[0];assert.ok(f.progress>.49&&f.progress<.51);assert.ok(f.y<(f.from.y+f.to.y)/2-40);
  s.setScene(s.scene);assert.equal(s.flights.length,1);s.step(520);assert.equal(s.flights.length,0);assert.deepEqual(s.scene.dispatched,['codex']);scene(s,{});assert.equal(s.flights[0].returning,true);s.step(1020);assert.equal(s.flights.length,0);assert.equal(s.scene.dispatched.length,0);
  scene(s,{meeting:fixture.scene.meeting});s.step(35000);s.setScene({...s.scene,dispatched:['kimi']});const cc=s.actors.find(a=>a.id==='cc');assert.deepEqual(s.flights[0].from,{x:cc.x,y:cc.y-12});
});
test('call takes CC to booth, concurrent meeting keeps others seated; hangs up and resumes meeting or desk',()=>{
  const s=simulation();scene(s,{call:{since:fixture.updatedAt},meeting:fixture.scene.meeting});walk(s,35);const cc=s.actors.find(a=>a.id==='cc');assert.ok(C.distance(cc,C.booth)<1);assert.ok(C.distance(s.actors.find(a=>a.id==='codex'),s.meetingTarget('codex'))<1);
  s.setScene({...s.scene,dispatched:['codex']});assert.deepEqual(s.flights.at(-1).from,{x:cc.x,y:cc.y-12});
  s.setScene({...s.scene,dispatched:[]});assert.deepEqual(s.flights.at(-1).to,{x:C.desks[0][0]+17,y:C.desks[0][1]+4},'return goes to CC desk even during a call');
  s.setScene({...s.scene,call:null});walk(s,20);assert.ok(C.distance(cc,C.podium)<1);scene(s,{});walk(s,35);assert.ok(C.distance(cc,C.home(cc.i))<1);
});
test('disk stack is monotonic with zero, null, full and threshold coverage',()=>{
  assert.equal(C.diskLayers(null),0);assert.equal(C.diskLayers({usedPct:0}),0);let previous=0;for(let n=0;n<=100;n++){const layers=C.diskLayers({usedPct:n});assert.ok(layers>=previous&&layers<=8);previous=layers;}assert.equal(previous,8);assert.equal(C.diskLayers({usedPct:93}),8);
});
test('only two audience seats, no daytime or no-meeting invention; treats and leaving still work',()=>{
  const s=simulation();s.setVisitors(5);s.step(15000);assert.equal(s.visitors.filter(v=>v.listening).length,0);scene(s,{meeting:fixture.scene.meeting});walk(s,35);
  assert.equal(s.visitors.filter(v=>v.listening).length,2);s.visitors.filter(v=>v.listening).forEach((v,i)=>assert.ok(C.distance(v,C.audience[i])<1));
  s.treat('cake',fixture.updatedAt);walk(s,35);assert.ok(s.deskTreatNow());assert.equal(s.visitors.filter(v=>v.listening).length,2);
  s.setVisitors(0);walk(s,35);assert.equal(s.visitors.length,0);s.setVisitors(3);walk(s,35);scene(s,{});walk(s,35);assert.equal(s.visitors.filter(v=>v.listening).length,0);
});
test('night guard follows a closed walkable patrol with no stuck windows, done stays at door, day hides it',()=>{
  assert.equal(C.isNight(Date.parse('2026-11-01T14:59:59Z')),false);assert.equal(C.isNight(Date.parse('2026-11-01T15:00:00Z')),true);assert.equal(C.isNight(Date.parse('2026-11-01T23:59:59Z')),true);assert.equal(C.isNight(Date.parse('2026-11-02T00:00:00Z')),false);
  const s=simulation();scene(s,{guard:{phase:'patrol',at:fixture.updatedAt,ok:null}});s.step(1000);assert.equal(s.guard,null);s.night=true;let moved=0,last,stuck=0;
  for(let i=0;i<1800;i++){s.step(100);const a=s.guard;assert.equal(C.blocked(a.x,a.y),false);if(last&&C.distance(a,last)>.1){moved++;stuck=0;}else if(!a.lap)stuck++;assert.ok(stuck<20,'guard stuck >2s');last={x:a.x,y:a.y};if(a.lap)break;}
  assert.ok(moved>300);assert.equal(s.guard.lap,1);s.step(2000);assert.ok(C.distance(s.guard,C.door)<1);s.setScene(s.scene);s.step(2000);assert.equal(s.guard.lap,1,'same signal does not restart patrol');
  s.setScene({...s.scene,guard:{...s.scene.guard,phase:'done',ok:false}});s.step(100);assert.ok(C.distance(s.guard,C.door)<1);s.night=false;s.step(100);assert.equal(s.guard,null);
});
test('event templates cover every public event, use fixed treat names, ignore unknown kinds',()=>{
  const d=fresh();d.events.push({kind:'meeting-end',minutes:12},{kind:'meeting',ids:['cc','codex']});for(const e of d.events)assert.equal(typeof C.eventText(e,d.roster),'string');
  assert.equal(C.eventText({kind:'treat',treat:'milktea'},d.roster),'有人送来一杯奶茶');assert.equal(C.eventText({kind:'new-event',text:'not displayed'},d.roster),null);
});
