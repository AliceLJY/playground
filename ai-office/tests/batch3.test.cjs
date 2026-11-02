const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js'),T=Date.parse('2026-11-02T02:00:07Z'),M=60000,iso=n=>new Date(n).toISOString();
const roster=['cc','codex','kimi','grok','doubao'].map((id,i)=>({id,name:id==='cc'?'CC':id,color:'#739C82',desk:i}));
const today={visitors:0,treats:0,meetings:0,handoffs:0,calls:0};
const history=(events=[],timeline=[])=>({day:'2026-11-02',events,stats:{today},timeline});
test('timeline records status changes only and full startup/day snapshots with no text',async()=>{
 const {reduceScene,emptyScene}=await import('../server/scene.mjs');
 let members={cc:{status:'busy',summary:'NEVER_KEEP'},codex:{status:'idle',activity:'NEVER_KEEP'}};
 let s=reduceScene(emptyScene(T),{members},T);assert.deepEqual(s.timeline,[{at:iso(T),id:'cc',s:'busy'},{at:iso(T),id:'codex',s:'idle'}]);
 s=reduceScene(s,{members},T+M);assert.equal(s.timeline.length,2);
 members={...members,cc:{status:'waiting',task:'NEVER_KEEP'}};s=reduceScene(s,{members},T+2*M);assert.equal(s.timeline.length,3);
 s=reduceScene(s,{members},T+86400000);assert.equal(s.timeline.length,2);assert.equal(new Set(s.timeline.map(x=>x.at)).size,1);assert.ok(!JSON.stringify(s.timeline).includes('NEVER_KEEP'));
});
test('timeline cap keeps oldest 3000 entries, marks truncation and resets on midnight',async()=>{
 const {reduceScene,emptyScene,configureHistory}=await import('../server/scene.mjs');let s=emptyScene(T);
 for(let i=0;i<3002;i++)s=reduceScene(s,{members:{cc:{status:i%2?'busy':'idle'}}},T+i);
 assert.equal(s.timeline.length,3000);assert.equal(s.timeline[0].at,iso(T));assert.equal(s.timeline.at(-1).at,iso(T+2999));assert.equal(s.timelineTruncated,true);
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'office-cap-'));
 try{configureHistory(s,dir);s=reduceScene(s,{members:{cc:{status:'busy'}}},T+86400000);const old=JSON.parse(await fs.readFile(path.join(dir,'2026-11-02.json')));assert.equal(old.timelineTruncated,true);assert.equal(old.timeline.length,3000);}finally{await fs.rm(dir,{recursive:true,force:true});}
 assert.equal(s.timeline.length,1);assert.equal(s.timelineTruncated,undefined);
});
test('gate reducer coalesces blocks for two minutes, counts each and starts a new window at boundary',async()=>{
 const {emptyScene,noteGate}=await import('../server/scene.mjs');const s=emptyScene(T);
 noteGate(s,'cc',false,T);noteGate(s,'cc',false,T+M);noteGate(s,'cc',false,T+2*M-1);
 assert.equal(s.gate.n,3);assert.equal(s.events.length,1);assert.equal(s.stats.gatesBlockedTotal,3);assert.equal(s.stats.today.gatesBlocked,3);
 noteGate(s,'cc',false,T+2*M);assert.equal(s.events.length,2);assert.equal(s.gate.n,1);noteGate(s,'codex',true,T+3*M);assert.equal(s.stats.gatesPassedTotal,1);
});
for(const layout of ['portrait','landscape'])for(const ok of [false,true])test(`gate ${ok?'green':'red'} ${layout}: complete real route, immutable status and no furniture`,()=>{
 const s=C.create(roster,7,layout);for(const a of s.actors)s.setStatus(a.id,'done',iso(T));s.clockBase=T;s.place();
 const before=s.actors.map(a=>[a.status,a.statusSince]);s.setScene({...C.emptyScene(),gate:{id:'codex',at:iso(T),ok,n:3}},T);
 const phases=new Set(),positions=[];let finished=false,sawFolder=false;
 for(let i=0;i<6000;i++){
  const prev=s.actors.map(a=>({x:a.x,y:a.y}));s.step(10);
  assert.deepEqual(s.actors.map(a=>[a.status,a.statusSince]),before);
  s.actors.forEach((a,j)=>{assert.ok(!C.blocked(a.x,a.y,layout),`${a.id} furniture ${a.x},${a.y}`);assert.ok(C.distance(a,prev[j])<=.591);});
  if(s.gate){phases.add(s.gate.phase);if(s.gate.phase==='signal'){assert.ok(C.distance(s.actors[1],s.layout.gatePoint)<1);positions.push(s.actors[1].x);}}
  if(s.gateFolder)sawFolder=true;
  if(phases.size && !s.gate){finished=true;break;}
 }
 assert.ok(finished);assert.ok(positions.length>10);for(const p of ['pickup','approaching','signal','returning','sitting'])assert.ok(phases.has(p),p);assert.equal(phases.has('delivering'),ok);assert.equal(sawFolder,ok);assert.ok(C.distance(s.actors[1],C.home(1,layout))<1);
});
test('gate absent people never perform; work/reception/quota preempt gate and duplicate polls update n only',()=>{
 for(const status of ['away','off','unknown']){
  const s=C.create(roster);s.setStatus('codex',status,iso(T));s.setScene({...C.emptyScene(),gate:{id:'codex',at:iso(T),ok:false,n:1}},T);s.step(30000);assert.equal(s.gate,null);assert.equal(s.eventQueues.gate.length,0);
 }
 const s=C.create(roster);for(const a of s.actors)s.setStatus(a.id,'done',iso(T));const gate={id:'cc',at:iso(T),ok:false,n:1};s.setScene({...C.emptyScene(),gate},T);s.step(1000);assert.ok(s.gate);s.setScene({...C.emptyScene(),gate:{...gate,n:5}},T+1000);assert.equal(s.gate.n,5);assert.equal(s.eventQueues.gate.length,0);s.setStatus('cc','busy',iso(T+1000));s.step(20);assert.equal(s.gate,null);assert.equal(s.actors[0].activity,null);
 assert.equal(C.ACTIVITY_PRIORITY.gate,C.ACTIVITY_PRIORITY.argue);assert.ok(C.ACTIVITY_PRIORITY.reception>C.ACTIVITY_PRIORITY.gate && C.ACTIVITY_PRIORITY.gate>C.ACTIVITY_PRIORITY.snack);
});
test('shared boundary rejects malformed gate, history, timeline and extra private fields, accepts old archives',()=>{
 C.validateHistory({day:'2026-11-02',events:[],stats:{today}},roster);
 for(const entry of [{at:iso(T),id:'cc',s:'busy',task:'PRIVATE'},{at:iso(T),id:'nope',s:'busy'},{at:iso(T),id:'cc',s:'typing'},{at:iso(T+86400000),id:'cc',s:'idle'}])assert.throws(()=>C.validateHistory(history([],[entry]),roster));
 for(const gate of [{at:iso(T),id:'cc',ok:1,n:1},{at:iso(T),id:'cc',ok:false,n:0},{at:'bad',id:'cc',ok:false,n:1},{at:iso(T),id:'cc',ok:false,n:1,findings:'PRIVATE'}])assert.throws(()=>C.validateSceneFields({roster,scene:{...C.emptyScene(),gate}}));
 assert.throws(()=>C.validateHistory({...history(),stats:{today:{...today,task:'PRIVATE'}}},roster));
 assert.throws(()=>C.validateHistory(history([{kind:'gate',at:iso(T),id:'cc'}]),roster));
 assert.throws(()=>C.validateHistory({...history(),day:'2026-02-30'},roster));
 assert.throws(()=>C.validateHistoryList({days:[{day:'2026-11-02',events:0,timeline:3001}]}));
});
test('real replay clock, chronological statuses and idle skip; missing identities remain unknown',()=>{
 const r=C.createReplay(history([{kind:'gate',at:iso(T+90*M),id:'cc',ok:false}],[{at:iso(T),id:'cc',s:'done'},{at:iso(T+100*M),id:'cc',s:'busy'}]),roster);
 assert.equal(r.clock,T-M);assert.ok(r.sim.actors.every(a=>a.status==='unknown'));r.step(250);assert.equal(r.clock,T);assert.equal(r.sim.actors[0].status,'done');
 r.step(5100);assert.equal(r.skips,1);assert.ok(r.clock>=T+89*M);assert.ok(r.sim.actors.slice(1).every(a=>a.status==='unknown'));r.step(300);assert.ok(r.sim.gate);assert.equal(r.events.length,1);
 r.next();assert.equal(r.clock,T+99*M);r.step(250);assert.equal(r.sim.actors[0].status,'busy');
});
test('replay speed controls and event-only day never fabricate statuses',()=>{
 const r=C.createReplay(history([{kind:'visitor',at:iso(T),n:1},{kind:'treat',at:iso(T+2*M),treat:'coffee'}]),roster);
 assert.equal(r.noTimeline,true);r.speed=60;r.step(1000);assert.equal(r.clock,T);assert.equal(r.sim.visitors.length,1);assert.ok(r.sim.actors.every(a=>a.status==='unknown'));
 r.speed=600;r.step(200);assert.equal(r.clock,T+2*M);assert.ok(r.sim.carrier);assert.equal(r.events.length,2);
});
test('replay uses existing meeting, handoff, argument, quota and reception simulations',()=>{
 const timeline=roster.map(a=>({at:iso(T),id:a.id,s:'done'}));
 const ev=[{kind:'handoff',ids:['cc','codex']},{kind:'return',ids:['codex']},{kind:'meeting',ids:['cc','codex'],review:true},{kind:'round',round:2},{kind:'argue',round:2,rejected:3},{kind:'meeting-end',minutes:8},{kind:'quota',ids:['kimi'],clear:false},{kind:'quota',ids:['kimi'],clear:true},{kind:'reception'},{kind:'snack',ids:['codex']},{kind:'souvenir'},{kind:'radar',n:3,added:3},{kind:'supper',ids:['cc']}].map((e,i)=>({...e,at:iso(T+(i+1)*10*M)}));
 const r=C.createReplay(history(ev,timeline),roster);r.speed=60;r.step(1000);
 const observed=new Set();for(let i=0;i<ev.length;i++){r.next();r.step(1000);const s=r.sim;for(const k of ['handoffWalk','argue','quotaEvent','reception','snack','souvenir','radar','supper'])if(s[k])observed.add(k);}
 for(const k of ['handoffWalk','argue','quotaEvent','reception','snack','souvenir','radar','supper'])assert.ok(observed.has(k),k);
});
test('live gate history and scene share queue/dedupe; repeated polling never lowers n or replays',()=>{
 const s=C.create(roster);for(const a of s.actors)s.setStatus(a.id,'done',iso(T));s.clockBase=T;
 const e={kind:'gate',id:'cc',at:iso(T),ok:false};s.receiveEventHistory([e]);s.setScene({...C.emptyScene(),gate:{at:e.at,id:e.id,ok:e.ok,n:5}},T);s.step(20);assert.equal(s.gate.n,5);assert.equal(s.eventQueues.gate.length,0);
 s.receiveEventHistory([e]);s.setScene({...C.emptyScene(),gate:{at:e.at,id:e.id,ok:e.ok,n:5}},T);assert.equal(s.gate.n,5);s.step(30000);s.receiveEventHistory([e]);s.step(20);assert.equal(s.gate,null);
});
test('same-minute rounded timeline keeps recorded order, and replay rotation keeps queue expiry on simulation time',()=>{
 const timeline=[{at:iso(T),id:'cc',s:'busy'},{at:iso(T),id:'cc',s:'done'}];const r=C.createReplay(history([{kind:'gate',id:'cc',at:iso(T),ok:false}],timeline),roster);r.step(250);assert.equal(r.sim.actors[0].status,'done');
 r.sim=r.sim.relayout('landscape');r.step(2000);assert.ok(r.sim.gate);assert.ok(r.sim.replaying);assert.equal(r.sim.actors[1].status,'unknown');
});
test('all eleven desks including CC traverse gate both ways in both layouts, without blocked or excessive steps',()=>{
 const all=Array.from({length:11},(_,i)=>({id:i===0?'cc':'p'+i,name:'P'+i,desk:i,color:'#739C82'}));
 for(const layout of ['portrait','landscape'])for(const id of all.map(a=>a.id))for(const ok of [false,true]){
  const s=C.create(all,31,layout);for(const a of s.actors)s.setStatus(a.id,'done',iso(T));s.place();s.setScene({...C.emptyScene(),gate:{id,ok,n:1,at:iso(T)}},T);let began=false,ended=false;
  for(let i=0;i<3500;i++){const a=s.actors.find(a=>a.id===id),prev={x:a.x,y:a.y};s.step(20);assert.ok(!C.blocked(a.x,a.y,layout),layout+' '+id);assert.ok(C.distance(prev,a)<=1.181);began ||=!!s.gate;if(began&&!s.gate){ended=true;break;}}
  assert.ok(ended,layout+' '+id+' '+ok);assert.ok(s.actors.every(a=>a.status==='done'&&a.statusSince===iso(T)));assert.ok(C.distance(s.actors.find(a=>a.id===id),C.home(all.findIndex(a=>a.id===id),layout))<1);
 }
});
test('gate yields to quota and an arriving reception, with lower-priority snacks excluded',()=>{
 const s=C.create(roster);for(const a of s.actors)s.setStatus(a.id,'idle',iso(T));s.setScene({...C.emptyScene(),gate:{id:'codex',ok:false,n:1,at:iso(T)},snack:{id:'codex',at:iso(T)}},T);s.step(20);assert.ok(s.gate);assert.equal(s.snack,null);
 s.setQuota({codex:iso(T+60*M)},T);s.step(20);assert.equal(s.gate,null);assert.equal(s.actors[1].activity,'quota');
 const a=C.create([{...roster[0],courier:true},roster[1]]);a.setStatus('cc','busy',iso(T));a.setStatus('codex','idle',iso(T));a.setScene({...C.emptyScene(),gate:{id:'codex',ok:false,n:1,at:iso(T)}},T);a.step(20);a.meet('chat',iso(T));a.step(40);assert.equal(a.gate,null);assert.equal(a.actors[1].activity,'reception');
});
test('minute-rounded guest gate events retain two legal same-minute passes, without duplicate polling performances',()=>{
 const s=C.create(roster);for(const a of s.actors)s.setStatus(a.id,'done',iso(T));s.clockBase=T;
 const gate={id:'cc',at:iso(T),ok:true},events=[{kind:'gate',...gate},{kind:'gate',...gate}];s.receiveEventHistory(events);s.setScene({...C.emptyScene(),gate:{...gate,n:1}},T);assert.equal(s.eventQueues.gate.length,2);s.receiveEventHistory(events);s.setScene({...C.emptyScene(),gate:{...gate,n:1}},T);assert.equal(s.eventQueues.gate.length,2);
 s.step(60000);assert.equal(s.gate,null);assert.equal(s.eventQueues.gate.length,0);
});

test('replay performs both minute-rounded gate events, not just their shared timestamp',()=>{
 const event={kind:'gate',id:'cc',at:iso(T),ok:true};
 const r=C.createReplay(history([event,{...event}],[{id:'cc',at:iso(T),s:'done'}]),roster),performed=new Set();
 for(let i=0;i<1200;i++){r.step(50);if(r.sim.gate)performed.add(r.sim.gate.key);}
 assert.equal(r.events.length,2);assert.equal(performed.size,2);assert.equal(r.sim.gate,null);
});
