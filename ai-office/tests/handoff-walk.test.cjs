const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js'),roster=require('./fixtures/state-scene.json').roster;
const since='2026-11-02T12:00:00Z';
function setup(layout='portrait',seed=7){const s=C.create(roster,seed,layout);for(const a of s.actors)s.setStatus(a.id,'busy',since);return s;}
function dispatch(s,id='codex'){s.setScene({...s.scene,call:{kind:'dispatch',with:id,since},dispatched:[id]});}
test('present neighbour receives a real handoff, never a phone or flight, then CC returns without status edits',()=>{
 for(const layout of ['portrait','landscape'])for(const seed of [1,7,31]){
  const s=setup(layout,seed),cc=s.actors.find(a=>a.id==='cc'),to=s.actors.find(a=>a.id==='codex'),states=s.actors.map(a=>[a.status,a.statusSince]);dispatch(s);
  const phases=new Set(),words=new Set();let ended=null,walked=0;
  for(let i=0;i<1500;i++){
   s.step(20);assert.equal(s.flights.length,0);assert.notEqual(cc.activity,'call');if(!s.layout.noBooth)assert.ok(C.distance(cc,s.layout.booth)>30); // 11-03: the tower has no booth; CC calls from her desk
   assert.deepEqual(s.actors.map(a=>[a.status,a.statusSince]),states);
   for(const a of s.actors)assert.equal(C.blocked(a.x,a.y,s.layout),false,a.id+' hits furniture');
   if(cc.path.length)walked++;
   if(s.handoffWalk){phases.add(s.handoffWalk.phase);for(const b of s.handoffSpeech())words.add(b.text);if(s.handoffWalk.phase==='pat')assert.ok(C.distance(cc,to)<=20.1);}
   if(phases.size&&!s.handoffWalk&&ended===null)ended=s.time;
   if(i%100===0)s.setScene(s.scene);
  }
  for(const p of ['pickup','walking','placing','pat','reply','returning'])assert.ok(phases.has(p),p);
  assert.deepEqual([...words].sort(),['这个交给你','收到'].sort());assert.ok(walked>20);assert.ok(ended>=6&&ended<=10,'duration '+ended);
  assert.ok(C.distance(cc,C.home(cc.i,s.layout))<1);assert.equal(s.handoffWalk,null);
 }
});
test('away/off and a busy actor still outside use the original booth and outward flight',()=>{
 for(const state of ['away','off','outside']){const s=setup(),to=s.actors.find(a=>a.id==='codex');if(state==='outside')Object.assign(to,s.layout.door);else s.setStatus(to.id,state,since);dispatch(s);
 assert.equal(s.flights.length,1);assert.equal(s.handoffWalk,null);s.step(30000);const cc=s.actors.find(a=>a.id==='cc');assert.equal(cc.activity,'call');assert.ok(C.distance(cc,s.layout.booth)<1);}
});
test('consult still goes to the booth and dispatch yields to huddle/review without replay',()=>{
 const consult=setup();consult.setScene({...consult.scene,call:{kind:'consult',since}});consult.step(30000);assert.ok(C.distance(consult.actors[0],consult.layout.booth)<1);
 for(const kind of ['huddle','review'])for(const elapsed of [1000,4000,6500]){const s=setup();dispatch(s);s.step(elapsed);s.setScene({...s.scene,meeting:{kind,since,members:['cc','codex'],round:1,slide:null}});s.step(30000);
 assert.equal(s.handoffWalk,null);for(const id of ['cc','codex'])assert.ok(C.distance(s.actors.find(a=>a.id===id),s.meetingTarget(id))<1);
 s.setScene({...s.scene,meeting:null});s.step(20000);assert.equal(s.actors[0].activity,null);assert.ok(C.distance(s.actors[0],C.home(0))<1);}
});
test('an absent-recipient dispatch also yields to a meeting, while a new dispatch key can play again',()=>{
 const s=setup();s.setStatus('codex','away',since);dispatch(s);s.step(25000);assert.equal(s.actors[0].activity,'call');
 s.setScene({...s.scene,meeting:{kind:'huddle',since,members:['cc'],round:null,slide:null}});s.step(25000);assert.equal(s.actors[0].activity,'meeting');assert.ok(C.distance(s.actors[0],s.layout.podium)<1);
 s.setScene({...C.emptyScene()});s.setStatus('codex','busy',since);s.step(25000);dispatch(s);s.step(3500);assert.equal(s.handoffWalk.phase,'pat');
 const review=setup();dispatch(review);review.step(1000);
 review.setScene({...review.scene,meeting:{kind:'review',since,roundAt:since,members:['cc','codex'],round:1,slide:{adopted:0,rejected:1,open:1}}},Date.parse(since));
 let talked=false;for(let i=0;i<1800;i++){review.step(20);if(review.argue?.phase==='talking')talked=true;}
 assert.ok(talked,'the stale dispatch ring must not suppress the review performance');
});
test('all indoor desks, including an idle recipient in the games corner, have a clear complete route in both layouts',()=>{
 for(const layout of ['portrait','landscape'])for(const id of roster.filter(a=>a.id!=='cc').map(a=>a.id)){
  const s=setup(layout),to=s.actors.find(a=>a.id===id);s.setStatus(id,'idle',since);s.step(15000);const start=s.time;dispatch(s,id);let pat=false,finished=false;
  for(let i=0;i<600;i++){s.step(20);for(const a of s.actors)assert.equal(C.blocked(a.x,a.y,s.layout),false,id+' '+a.id);
   if(s.handoffWalk?.phase==='pat'){pat=true;assert.ok(C.distance(s.actors[0],to)<=20.1);}
   if(!s.handoffWalk){assert.ok(s.time-start<=10,'duration '+id+' '+(s.time-start));finished=true;break;}}
  assert.ok(pat&&finished,id);assert.equal(to.status,'idle');assert.equal(to.statusSince,since);
 }
});
test('rotation preserves handoff progress; target departure cancels it, repeated calls do not start again',()=>{
 let s=setup();dispatch(s);s.step(3500);assert.equal(s.handoffWalk.phase,'pat');s=s.relayout('landscape');assert.equal(s.handoffWalk.phase,'pat');s.step(10000);assert.equal(s.handoffWalk,null);assert.equal(s.flights.length,0);
 s=setup();dispatch(s);s.step(1000);s.setStatus('codex','away',since);s.step(20);assert.equal(s.handoffWalk,null);s.setScene(s.scene);s.step(20000);assert.equal(s.actors[0].activity,null);
});
