const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js'),script=require('../demo-script.json');
const roster=()=>script.roster.map(a=>({...a}));
const measure=t=>Array.from(t).reduce((w,c)=>w+(c.charCodeAt(0)<128?4:7),0);
const fresh=()=>({meeting:null,dispatched:[],call:null,disk:null,guard:null});
test('landscape targets: every desk, activity, queue and patrol route is clear at <=1 px samples',()=>{
  const L=C.layouts.landscape;
  const homes=L.desks.map(([x,y])=>({x,y:y+27}));
  const targets=[...homes,...C.leisure(L),...L.seats,...L.standing,...L.audience,...L.patrol,...L.tour,...Array.from({length:11},(_,i)=>L.queuePoint(i)),L.podium,L.booth,L.gameWatch,L.door,L.bossDesk,L.handoff,L.pantry];
  for(const from of [...homes,L.door,L.bossDesk,{x:60,y:250}])for(const to of targets){
    const path=C.route(from,to,L);assert.ok(path.length,JSON.stringify({from,to}));let p=from;
    for(const q of path){const n=Math.max(1,Math.ceil(C.distance(p,q)));for(let j=0;j<=n;j++)assert.equal(C.blocked(p.x+(q.x-p.x)*j/n,p.y+(q.y-p.y)*j/n,L),false,JSON.stringify({from,to,p,q,j}));p=q;}
  }
});
test('wall board counts Beijing today, overflow, recent pin; guests never infer note contents',()=>{
  const now=Date.parse('2026-11-01T16:04:00Z');
  const notes=[{at:'2026-11-01T15:59:59Z',text:'yesterday'},...Array.from({length:11},()=>({at:'2026-11-01T16:00:00Z',text:'today'}))];
  assert.deepEqual(C.noticeBoard(notes,now),{count:11,sheets:8,extra:3,recent:true});
  assert.equal(C.noticeBoard(notes,now+360000).recent,false);
  assert.equal(C.noticeBoard([{at:'2026-11-01T17:00:00Z'}],now).recent,false);
  assert.deepEqual(C.noticeBoard(notes,now,true),{count:null,sheets:0,extra:0,recent:false});
  assert.deepEqual(C.noticeBoard(notes,now,true,12),{count:12,sheets:8,extra:4,recent:false});
  assert.equal(C.noticeBoard([],now,true,0).count,0);
});
function separated(s){
  const active=s.actors.filter(a=>a.activity || !['away','off'].includes(a.status));
  for(let i=0;i<active.length;i++)for(const b of active.slice(i+1)){const a=active[i];assert.ok(Math.abs(a.x-b.x)>=18||Math.abs(a.y-b.y)>=32,`${a.id}/${b.id}: ${a.x},${a.y} / ${b.x},${b.y}`);}
  const plates=C.nameplates(s.actors,measure,[],s.layout);
  for(const p of plates){assert.ok(p.x>=2&&p.x+p.w<=638&&p.y+p.h<=418);for(const q of plates)if(q!==p)assert.ok(p.x+p.w+1<=q.x||q.x+q.w+1<=p.x||p.y+p.h+1<=q.y||q.y+q.h+1<=p.y);}
  return plates;
}
const fullRoster=()=>Array.from({length:11},(_,desk)=>({id:desk?'a'+desk:'cc',name:['CC','Codex','Kimi','GrokBot','Agy','etwin-cc','Gemini','Muse','Cobbler','Dots','豆包'][desk],color:'#739780',desk,courier:desk===8}));
const meeting=s=>({kind:'review',since:'2026-11-01T02:00:00Z',round:2,slide:null,members:s.actors.map(a=>a.id)});
test('1–11 landscape colleagues: games, busy, queue, meetings and mixed states have readable separate destinations',()=>{
  for(const seed of [1,7,31])for(let n=1;n<=11;n++)for(const mode of ['idle','busy','waiting','meeting','mixed']){
    const s=C.create(fullRoster().slice(0,n),seed,'landscape');
    for(const a of s.actors)s.setStatus(a.id,mode==='mixed'?['busy','idle','waiting','done','unknown','away','off'][(a.i+seed)%7]:mode==='meeting'?'busy':mode);
    if(mode==='meeting')s.setScene({...fresh(),meeting:meeting(s)});
    if(mode==='mixed')s.setScene({...fresh(),meeting:{...meeting(s),members:s.actors.filter((a,i)=>i%4===0).map(a=>a.id)},call:{since:'2026-11-01T02:00:00Z'}});
    s.step(35000);assert.ok(s.actors.every(a=>!a.path.length));const plates=separated(s);
    if(mode==='meeting')assert.equal(plates.length,n,'all settled meeting members have names');
    if(mode==='waiting')assert.ok(plates.length>=Math.min(n,7),'crowded queue retains readable names');
  }
});
test('landscape real movement covers games, meeting, call, queue, courier, treats, dispatch and guard',()=>{
  for(const seed of [1,7,31]){
    const s=C.create(fullRoster(),seed,'landscape');let moved=0,held=0,thanked=false;
    function walk(ms){for(let i=0;i<ms;i+=20){s.step(20);for(const a of [...s.actors,...s.visitors,...(s.guard?[s.guard]:[])])if(a.path.length){moved++;assert.equal(C.blocked(a.x,a.y,s.layout),false,`${a.id}: ${a.x},${a.y}`);}if(s.delivery?.phase==='holding')held++;if(s.thanksNow())thanked=true;}}
    walk(15000);assert.equal(s.actors.filter(a=>s.gameActivity(a)).length,10);s.setVisitors(5);
    s.setScene({...fresh(),meeting:meeting(s),call:{since:'2026-11-01T02:00:00Z'}});walk(35000);
    assert.equal(s.actors.find(a=>a.id==='cc').x,s.layout.booth.x);assert.equal(s.visitors.filter(v=>v.listening).length,2);separated(s);
    s.treat('coffee','2026-11-01T02:00:00Z');walk(20000);assert.ok(thanked);assert.equal(s.deskTreatNow().kind,'coffee');
    s.setScene({...fresh(),dispatched:['a9']});const f=s.flightPoints()[0];assert.deepEqual(f.to,{x:s.layout.desks[9][0]+17,y:s.layout.desks[9][1]+4});walk(1200);assert.equal(s.flights.length,0);
    for(const a of s.actors)s.setStatus(a.id,'waiting');walk(20000);s.notice({text:'full delivery',at:'2026-11-01T02:00:00Z'});walk(35000);assert.equal(s.delivered,1);assert.equal(s.delivery,null);assert.ok(held>=399);separated(s);
    s.setVisitors(0);walk(20000);assert.equal(s.visitors.length,0);
    s.night=true;s.setScene({...fresh(),guard:{phase:'patrol',at:'2026-11-01T15:00:00Z',ok:null}});let stuck=0,last={...s.layout.door};
    for(let i=0;i<1800&&!s.guard?.lap;i++){walk(100);const a=s.guard;stuck=C.distance(a,last)<.1?stuck+1:0;assert.ok(stuck<20);last={x:a.x,y:a.y};}
    assert.equal(s.guard.lap,1);assert.ok(moved>3000,'real moving samples must exist');s.setScene(s.scene);walk(100);assert.equal(s.guard.lap,1);
  }
});
test('layout rebuild preserves state, resolves each status immediately and never replays dispatch or delivery',()=>{
  for(const mode of ['busy','idle','waiting','meeting','call','delivery']){
    let s=C.create(fullRoster());for(const a of s.actors)s.setStatus(a.id,['busy','idle','waiting'].includes(mode)?mode:'busy');
    if(mode==='meeting'||mode==='call')s.setScene({...fresh(),meeting:meeting(s),call:mode==='call'?{since:'2026-11-01T02:00:00Z'}:null});
    s.step(35000);if(mode==='delivery'){s.notice({text:'keep full text',at:'2026-11-01T02:00:00Z'});while(s.delivery?.phase!=='holding')s.step(20);s.step(2000);}
    s.setScene({...s.scene,dispatched:['a9']});s.step(300);
    const before={time:s.time,scene:structuredClone(s.scene),delivery:structuredClone(s.delivery),delivered:s.delivered,status:s.actors.map(a=>a.status),flight:s.flights[0].at};
    for(const key of ['landscape','portrait','landscape']){
      s=s.relayout(key);assert.equal(s.layout.id,key);assert.deepEqual(s.scene,before.scene);assert.deepEqual(s.actors.map(a=>a.status),before.status);assert.equal(s.time,before.time);assert.deepEqual(s.delivery,before.delivery);assert.equal(s.delivered,before.delivered);assert.equal(s.flights.length,1);assert.equal(s.flights[0].at,before.flight);
      for(const a of s.actors){assert.equal(a.path.length,0);assert.equal(C.blocked(a.x,a.y,s.layout),false);const target=a.activity==='call'?s.layout.booth:a.activity==='meeting'?s.meetingTarget(a.id):s.isCourier(a)&&s.delivery?s.layout.handoff:a.status==='waiting'?s.layout.queuePoint(s.actors.indexOf(a)):a.gameSlot!=null?C.leisure(s.layout)[a.gameSlot]:C.home(a.i,s.layout);assert.ok(C.distance(a,target)<1,a.id);}
    }
    if(mode==='delivery'){s.step(6000);assert.equal(s.delivered,1);s.step(20000);assert.equal(s.delivery,null);}
  }
});
test('guest notice counts reject malformed snapshots; zero and absent remain distinct',()=>{
  const data=()=>({roster:[],notices:[]});
  for(const value of [null,-1,1.2,'3',NaN,Infinity,1e9+1,[],{}])assert.throws(()=>C.validateSceneFields({...data(),noticesToday:value}));
  for(const value of [0,1,8,1000000000])assert.doesNotThrow(()=>C.validateSceneFields({...data(),noticesToday:value}));
  assert.doesNotThrow(()=>C.validateSceneFields(data()));
});
test('rotation preserves a completed guard lap, pending gifts and visitors without another welcome',()=>{
  let s=C.create(fullRoster(),7,'landscape');s.night=true;s.setScene({...fresh(),guard:{phase:'patrol',at:'2026-11-01T15:00:00Z',ok:null}});s.step(180000);assert.equal(s.guard.lap,1);
  s.setVisitors(2);s.step(5000);s.treat('cake','2026-11-01T02:00:00Z');s.step(20);assert.ok(s.carrier);const greeting=structuredClone(s.hello),carrier=s.carrier;
  s=s.relayout('portrait');assert.equal(s.guard.lap,1);assert.equal(s.carrier,carrier);assert.equal(s.visitors.length,2);assert.deepEqual(s.hello,greeting);
  s.step(100);assert.equal(s.guard.lap,1);assert.ok(C.distance(s.guard,s.layout.door)<1);assert.equal(s.deskTreatNow().kind,'cake');s.step(5000);assert.equal(s.thanksNow(),null);
});
