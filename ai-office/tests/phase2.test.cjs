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
    const k=s.actors.find(a=>a.id==='kimi');assert.ok(C.distance(k,C.games[k.gameSlot])<1);
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

function idleGroup(n,seed=7){const s=C.create(Array.from({length:11},(_,desk)=>({id:desk?'a'+desk:'cc',desk})),seed);for(const a of s.actors)s.setStatus(a.id,a.i<n?'idle':'busy');s.step(15000);return s;}
test('idle only: tennis, chess, machines, beanbags, spectators; 1–10 never overlap; Cobbler stays home',()=>{
  for(let n=1;n<=11;n++){const s=idleGroup(n),idle=s.actors.filter(a=>a.status==='idle'&&a.i!==10);assert.equal(idle.filter(a=>a.gameSlot!=null&&a.gameSlot<2).length,n===1?0:2);
    assert.deepEqual(idle.map(a=>s.gameActivity(a)),n===1?['arcade']:n===2?['pingpong','pingpong']:n===3?['pingpong','pingpong','arcade']:['pingpong','pingpong','chess','chess','arcade','arcade','nap','read','watch','watch'].slice(0,n));
    for(let i=0;i<s.actors.length;i++)for(const b of s.actors.slice(i+1)){const a=s.actors[i];assert.ok(Math.abs(a.x-b.x)>=18||Math.abs(a.y-b.y)>=32,`${n} idle: overlapping ${a.id}/${b.id}`);}
    for(const a of idle){assert.ok(Number.isInteger(a.gameSlot));assert.ok(C.distance(a,C.games[a.gameSlot])<1);assert.equal(s.gameActivity(a),C.games[a.gameSlot].kind);}
    assert.equal(new Set(idle.map(a=>a.gameSlot)).size,idle.length);for(const a of s.actors.filter(a=>a.status==='busy'||a.i===10)){assert.ok(C.distance(a,C.home(a.i))<1);assert.equal(s.gameActivity(a),null);}
  }
});
test('idle allocation is stable, sorted initially, and each 5 to 4 removal moves only the vacancy replacement',()=>{
  for(let removed=0;removed<5;removed++){const s=idleGroup(5),before=s.actors.map(a=>a.gameSlot);assert.deepEqual(before.slice(0,5),[0,1,2,3,4]);
    s.step(8000);assert.deepEqual(s.actors.map(a=>a.gameSlot),before);const gone=s.actors[removed];s.setStatus(gone.id,'busy');s.step(15000);
    const changed=s.actors.filter(a=>a.i!==removed&&a.gameSlot!==before[a.i]);assert.deepEqual(changed.map(a=>a.i),removed===4?[]:[4]);assert.ok(C.distance(gone,C.home(gone.i))<1);assert.equal(s.actors.filter(a=>a.gameSlot!=null&&a.gameSlot<2).length,2);
  }
  const s=idleGroup(1);assert.equal(s.actors[0].gameSlot,4);s.setStatus('a1','idle');s.step(15000);assert.deepEqual(s.actors.slice(0,2).map(a=>a.gameSlot),[0,1]);s.setStatus('a1','busy');s.step(15000);assert.equal(s.actors[0].gameSlot,4);assert.equal(s.gameActivity(s.actors[0]),'arcade');
});
test('games, rear row and visitor observation stay reachable; actual travel never crosses new furniture',()=>{
  const targets=[...C.games,...C.standing,C.gameWatch,{x:125,y:169},C.bossDesk,C.door];for(const start of [...C.desks.map((_,i)=>C.home(i)),C.door,C.bossDesk])for(const p of targets){assert.equal(C.blocked(p.x,p.y),false);assert.ok(C.route(start,p).length,JSON.stringify({start,p}));}
  for(const seed of [1,7,31]){const s=idleGroup(10,seed);for(const a of s.actors)s.setStatus(a.id,'busy');assert.ok(walk(s,15)>0);for(const a of s.actors)s.setStatus(a.id,'idle');assert.ok(walk(s,15)>0);}
});
test('meeting has four chairs, extra members stand separately; clearing it resumes idle games',()=>{
  const s=idleGroup(10);scene(s,{meeting:{...fixture.scene.meeting,members:s.actors.map(a=>a.id)}});walk(s,35);assert.equal(C.seats.length,4);assert.equal(s.actors.filter(a=>a.i!==0&&s.meetingStanding(a.id)).length,6);assert.equal(new Set(s.actors.map(a=>`${a.x},${a.y}`)).size,11);assert.equal(s.actors.filter(a=>s.gameActivity(a)).length,0);
  scene(s,{});walk(s,35);assert.equal(s.actors.filter(a=>s.gameActivity(a)).length,10);
});

test('tennis waits for both arrivals; shuffled feed order uses desks, spectators and visitors have separate spots',()=>{
  const s=idleGroup(0);s.setStatus('a9','idle');s.setStatus('cc','idle');let loneArrival=false;
  for(let i=0;i<750;i++){s.step(20);const pair=s.actors.filter(a=>a.status==='idle');if(pair.filter(a=>!a.path.length).length===1){loneArrival=true;pair.forEach(a=>assert.equal(s.gameActivity(a),null));}}
  assert.ok(loneArrival,'must sample a real unmatched arrival');assert.equal(s.actors.filter(a=>s.gameActivity(a)==='pingpong').length,2);
  const sorted=idleGroup(10),reverse=C.create([...sorted.actors].reverse().map(({id,i})=>({id,desk:i})));reverse.step(15000);for(const a of reverse.actors)assert.equal(a.gameSlot,sorted.actors.find(b=>b.id===a.id).gameSlot);
  sorted.setVisitors(1);let watched=false;for(let i=0;i<3000;i++){sorted.step(20);if(sorted.visitors.some(v=>!v.path.length&&C.distance(v,C.gameWatch)<1))watched=true;}
  assert.ok(watched,'visitor really used the observation point');for(const a of sorted.actors.filter(a=>a.gameSlot!=null))assert.ok(C.distance(a,C.gameWatch)>=24);
  sorted.setStatus('a4','done');walk(sorted,15);const done=sorted.actors.find(a=>a.i===4);assert.ok(C.distance(done,C.home(4))<1);assert.equal(sorted.gameActivity(done),null);
});

test('Dots returns to moved desk, dispatch follows it, legacy desk and routes stay old',()=>{
  const s=idleGroup(10),dots=s.actors.find(a=>a.i===9);s.setStatus(dots.id,'busy');assert.ok(walk(s,15)>0);assert.deepEqual([dots.x,dots.y],[229,296]);
  scene(s,{dispatched:[dots.id]});assert.deepEqual(s.flights[0].to,{x:246,y:273});
  const old=C.create(s.actors.map(a=>({id:a.id,desk:a.i})),7,true);old.setStatus(dots.id,'busy');old.step(15000);const oldDots=old.actors.find(a=>a.i===9);assert.deepEqual([oldDots.x,oldDots.y],[157,296]);
});
test('tennis ball moves on tabletop only after two arrivals; three never play solo chess',()=>{
  const s=idleGroup(1);assert.equal(s.pingPongBall(),null);s.setStatus('a1','idle');let unmatched=0,playing=0;const ys=[];
  for(let i=0;i<750;i++){s.step(20);const pair=s.actors.filter(a=>a.gameSlot<2&&a.gameSlot!=null),ball=s.pingPongBall();if(pair.filter(a=>!a.path.length).length===1){unmatched++;assert.equal(ball,null);}if(ball){playing++;assert.ok(ball.x>=136&&ball.x+ball.size<=176&&ball.y>=276&&ball.y+ball.size<=316);assert.ok(ball.size>=2);ys.push(ball.y);}}
  assert.ok(unmatched>0&&playing>50,'both waiting and play actually sampled');assert.ok(Math.max(...ys)-Math.min(...ys)>25,'ball traverses the table');
  s.setStatus('a2','idle');s.step(15000);assert.equal(s.actors.filter(a=>s.gameActivity(a)==='chess').length,0);assert.equal(s.gameActivity(s.actors[2]),'arcade');
  s.setStatus('a1','busy');s.setStatus('a2','busy');s.step(20);assert.equal(s.pingPongBall(),null);
});
test('every 1–10 membership change preserves valid places; chess also waits for two arrivals',()=>{
  const slots=n=>n===1?[4]:n===3?[0,1,4]:Array.from({length:n},(_,i)=>i);
  for(let n=2;n<=10;n++)for(let removed=0;removed<n;removed++){
    const s=idleGroup(n),before=s.actors.map(a=>a.gameSlot);s.setStatus(s.actors[removed].id,'busy');s.step(15000);
    for(const a of s.actors.filter(a=>a.status==='idle'))if(slots(n-1).includes(before[a.i]))assert.equal(a.gameSlot,before[a.i],`${n}→${n-1}, removal ${removed}: unaffected ${a.id} moved`);
    assert.deepEqual(s.actors.filter(a=>a.status==='idle').map(a=>a.gameSlot).sort((a,b)=>a-b),slots(n-1));
  }
  const s=idleGroup(3);s.setStatus('a9','idle');let unmatched=0;
  for(let i=0;i<750;i++){s.step(20);const pair=s.actors.filter(a=>[2,3].includes(a.gameSlot));if(pair.filter(a=>!a.path.length).length===1){unmatched++;assert.ok(pair.every(a=>s.gameActivity(a)===null));}}
  assert.ok(unmatched>0);assert.equal(s.actors.filter(a=>s.gameActivity(a)==='chess').length,2);
});
test('all activity routes and left-workstation routes are free at subpixel travel samples',()=>{
  function clearRoute(from,to){const path=C.route(from,to);assert.ok(path.length,JSON.stringify({from,to}));let previous=from;for(const p of path){const n=Math.max(1,Math.ceil(C.distance(previous,p)));for(let i=0;i<=n;i++){const x=previous.x+(p.x-previous.x)*i/n,y=previous.y+(p.y-previous.y)*i/n;assert.equal(C.blocked(x,y),false,JSON.stringify({from,to,x,y}));}previous=p;}}
  for(const start of [...C.desks.map((_,i)=>C.home(i)),C.door,C.bossDesk])for(const p of [...C.games,C.gameWatch,{x:124,y:372}])clearRoute(start,p);
  for(const start of [C.home(5),{x:64,y:208}])for(const end of [C.bossDesk,C.door,C.pantry])clearRoute(start,end);
});
