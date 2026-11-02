const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js');
const M=60000,T=Date.parse('2026-11-01T16:05:00Z'),iso=n=>new Date(n).toISOString();

test('regression: midnight meeting survives 45 real visitor reductions and the board reports one meeting',async()=>{
  const {emptyScene,reduceScene,noteVisitor}=await import('../server/scene.mjs');
  let s=reduceScene(emptyScene(T),{dispatched:['codex','kimi']},T);
  for(let i=1;i<=45;i++) {const now=T+i*10*M;s=reduceScene(s,{dispatched:[]},now);noteVisitor(s,now);}
  assert.equal(s.stats.today.meetings,1);
  assert.ok(s.events.some(e=>e.kind==='meeting'),'the early meeting must survive visitor traffic');
  assert.ok(s.events.length>40,'the diary must keep more than 40 rows');
  assert.match(C.meetingBoardText(s.stats,s.events),/今天开过 1 次会/);
});

test('board uses the count when the meeting row is absent; old snapshots keep the event fallback',()=>{
  assert.equal(C.meetingBoardText({today:{meetings:1}},[]),'今天开过 1 次会');
  assert.equal(C.meetingBoardText({today:{meetings:0}},[]),'今天还没开会');
  assert.equal(C.meetingBoardText(null,[{kind:'meeting',at:iso(T)}]),'上次开会 00:05');
  assert.equal(C.meetingBoardText(null,[]),'今天还没开会');
});

const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'office-batch2-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('500-row safety valve removes oldest visitors before any other events',async()=>{
  const {emptyScene,addEvent}=await import('../server/scene.mjs');const s=emptyScene(T);addEvent(s,{kind:'meeting',ids:['cc']},T);
  for(let i=0;i<505;i++)addEvent(s,{kind:i%2?'radar':'visitor',n:i+1,...(i%2?{added:1}:{})},T+i*1000+1);
  assert.equal(s.events.length,500);assert.equal(s.events[0].kind,'meeting');assert.equal(s.events.filter(e=>e.kind==='radar').length,252);assert.equal(s.events.find(e=>e.kind==='visitor').n,13);
  for(let i=0;i<500;i++)addEvent(s,{kind:'reception'},T+600000+i);
  assert.equal(s.events.length,500);assert.ok(s.events.every(e=>e.kind==='reception'));
});
test('Beijing rollover archives every event and counts atomically with 0600 file and 0700 directory',async t=>{
  const {emptyScene,reduceScene,noteVisitor,configureHistory,sceneView}=await import('../server/scene.mjs');const dir=await temp(t),archive=path.join(dir,'history');let s=configureHistory(emptyScene(T),archive);
  s=reduceScene(s,{dispatched:['codex','kimi']},T);for(let i=1;i<=45;i++){s=reduceScene(s,{dispatched:[]},T+i*10*M);noteVisitor(s,T+i*10*M);}
  const before=structuredClone({events:s.events,today:s.stats.today}),midnight=Date.parse('2026-11-02T16:00:00Z');s=reduceScene(s,{},midnight);
  const file=path.join(archive,'2026-11-02.json'),saved=JSON.parse(await fs.readFile(file));assert.deepEqual(saved.events,before.events);assert.deepEqual(saved.stats.today,before.today);assert.equal(saved.day,'2026-11-02');
  assert.equal((await fs.stat(file)).mode&0o777,0o600);assert.equal((await fs.stat(archive)).mode&0o777,0o700);assert.deepEqual(await fs.readdir(archive),['2026-11-02.json']);assert.equal(s.stats.today.meetings,0);assert.deepEqual(sceneView(s,new Set(['cc','codex','kimi']),midnight).events,[]);
  const bytes=await fs.readFile(file,'utf8');s=reduceScene(s,{},midnight+M);assert.equal(await fs.readFile(file,'utf8'),bytes);
});
test('unwritable history directory logs once and rollover continues',async t=>{
  const {emptyScene,reduceScene,configureHistory}=await import('../server/scene.mjs');const dir=await temp(t),history=path.join(dir,'locked');await fs.mkdir(history,{mode:0o500});const logs=[];
  try {const s=reduceScene(configureHistory(emptyScene(T),path.join(history,'history'),m=>logs.push(m)),{},T+86400000);assert.equal(logs.length,1);assert.match(logs[0],/history archive failed/);assert.equal(s.stats.day,'2026-11-03');assert.deepEqual(s.events,[]);}finally{await fs.chmod(history,0o700);}
});
test('Grok done replaces snack, three-hour cooldown persists across midnight, repeated done is not new',async()=>{
  const {emptyScene,reduceScene}=await import('../server/scene.mjs');let s=emptyScene(T);
  const transition=(at,status='busy')=>{s=reduceScene(s,{transitions:[{id:'grok',before:{status,statusSince:iso(at-10*M)},after:{status:'done'}}]},at);};
  transition(T);assert.deepEqual(s.souvenir,{at:iso(T)});assert.equal(s.stats.souvenirsTotal,1);assert.equal(s.stats.today.souvenirs,1);assert.equal(s.snack,undefined);
  transition(T+179*M);assert.equal(s.stats.souvenirsTotal,1);transition(T+180*M);assert.equal(s.stats.souvenirsTotal,2);transition(T+360*M,'done');assert.equal(s.stats.souvenirsTotal,2);assert.equal(s.events.filter(e=>e.kind==='snack').length,0);
  transition(Date.parse('2026-11-02T15:30:00Z'),'away');transition(Date.parse('2026-11-02T16:01:00Z'),'away');assert.equal(s.stats.souvenirsTotal,3);
});
test('radar baseline, increase only, stale mirror high-water mark, midnight reset and snack suppression',async()=>{
  const {emptyScene,reduceScene}=await import('../server/scene.mjs');let s=reduceScene(emptyScene(T),{radarCount:6},T);assert.equal(s.radar,undefined);assert.equal(s.stats.radarsTotal,0);
  s=reduceScene(s,{radarCount:13,transitions:[{id:'doubao',before:{status:'busy',statusSince:iso(T-10*M)},after:{status:'done'}}]},T+M);assert.deepEqual(s.radar,{at:iso(T+M),n:13,added:7});assert.equal(s.stats.radarsTotal,1);assert.equal(s.stats.today.radars,1);assert.equal(s.snack,undefined);
  for(const n of [13,null,7,13])s=reduceScene(s,{radarCount:n},T+2*M);assert.equal(s.stats.radarsTotal,1);
  const midnight=Date.parse('2026-11-02T16:00:00Z');s=reduceScene(s,{radarCount:0},midnight);assert.equal(s.radar,null);assert.deepEqual(s.radarSeen,{day:'2026-11-03',n:0});assert.equal(s.stats.today.radars,0);
  s=reduceScene(s,{radarCount:2},midnight+M);assert.equal(s.stats.radarsTotal,2);assert.equal(s.radar.added,2);
});
test('radar exact date-prefix counts, larger of two mirrors, EPERM and ENOENT skipped silently',async t=>{
  const {collectRadar}=await import('../server/scene.mjs');const dir=await temp(t),a=path.join(dir,'a.md'),b=path.join(dir,'b.md');await fs.writeFile(a,'# ledger\n2026-11-02 | SECRET TITLE | PRIVATE LINK | PRIVATE BODY\n2026-11-01 | yesterday | x | x\n');await fs.writeFile(b,Array.from({length:13},()=> '2026-11-02 | SECRET TITLE | PRIVATE LINK | PRIVATE BODY').join('\n'));
  assert.equal(await collectRadar([a,b],T),13);assert.equal(await collectRadar([b,a],T),13);assert.equal(await collectRadar([a],T+86400000),0);assert.equal(await collectRadar([a,b],T,async()=>{throw Object.assign(new Error('denied'),{code:'EPERM'});}),null);assert.equal(await collectRadar([path.join(dir,'absent'),a],T),1);
});
const roster=require('../demo-script.json').roster.map(a=>({...a,id:a.id==='scout'?'grok':a.id==='writer'?'doubao':a.id==='director'?'cc':a.id}));
const states=s=>s.actors.map(a=>[a.id,a.status,a.statusSince]);
function create(layout='portrait') {const s=C.create(roster,7,layout);s.clockBase=T;for(const a of s.actors)s.setStatus(a.id,['grok','doubao','filmmaker'].includes(a.id)?'away':'busy',iso(T));s.step(25000);return s;}
function walk(s,ms,check=()=>{}) {for(let t=0;t<ms;t+=10){s.step(10);for(const a of [...s.actors,s.boss])assert.ok(!C.blocked(a.x,a.y,s.layout),`${s.layout.id}: ${a.id} inside furniture at ${a.x},${a.y}`);check();}}
for(const layout of ['portrait','landscape']) {
 test(`souvenir ${layout}: door/papers/candy/sit/exit, routes, immutable statuses, retention`,()=>{
  const s=create(layout),before=states(s),phases=new Set(),words=new Set();let papersAt,cloudAt,maxClouds=0;s.setScene({...C.emptyScene(),souvenir:{at:iso(T+s.time*1000)}});
  walk(s,100000,()=>{assert.deepEqual(states(s),before);if(s.souvenir)phases.add(s.souvenir.phase);for(const b of s.eventSpeech())words.add(b.text);const f=s.foodNow();if(f.some(f=>f.kind==='papers'))papersAt ??=s.time;if(f.some(f=>f.kind==='cloud'))cloudAt ??=s.time;maxClouds=Math.max(maxClouds,f.filter(f=>f.kind==='cloud').length);if(s.souvenir?.phase==='delivering')assert.ok(papersAt,'papers precede candy');});
  assert.deepEqual([...phases],['entering','papers','delivering','returning','sitting','leaving']);assert.equal(s.souvenir,null);assert.equal(maxClouds,roster.length-3);assert.ok(['欢迎回来','这是哪儿的特产','好软','云上带的','刚醒'].every(w=>words.has(w)));assert.ok(C.distance(s.actors.find(a=>a.id==='grok'),s.layout.door)<1);
  const cloud=s.foodNow().find(f=>f.kind==='cloud'),paper=s.foodNow().find(f=>f.kind==='papers');assert.equal(cloud.until-cloudAt,300);assert.equal(paper.until-papersAt,600);s.step((cloud.until-s.time+.01)*1000);assert.ok(!s.foodNow().includes(cloud));assert.ok(s.foodNow().includes(paper));s.step(600000);assert.equal(s.foodNow().length,0);
 });
 test(`radar ${layout}: board/host look/sit/exit, card until midnight, statuses untouched`,()=>{
  const s=create(layout),before=states(s),phases=new Set(),words=new Set();s.setScene({...C.emptyScene(),radar:{at:iso(T+s.time*1000),n:13,added:7}});
  walk(s,110000,()=>{assert.deepEqual(states(s),before);if(s.radar)phases.add(s.radar.phase);for(const b of s.eventSpeech())words.add(b.text);});
  assert.deepEqual([...phases],['entering','pinning','showing','returning','sitting','leaving']);assert.equal(s.radar,null);assert.equal(s.radarCardNow().n,13);assert.ok(words.has('有意思'));assert.ok(words.has('今天有啥题'));assert.ok(words.has('这个能写'));assert.ok(C.distance(s.actors.find(a=>a.id==='doubao'),s.layout.door)<1);
  s.clockBase=Date.parse('2026-11-02T16:00:00Z')-s.time*1000;s.step(20);assert.equal(s.radarCardNow(),null);
 });
}
test('strict optional new fields, 500 events accepted / 501 rejected, count-only templates',()=>{
 const valid={roster,scene:{...C.emptyScene(),souvenir:{at:iso(T)},radar:{at:iso(T),n:13,added:7}},stats:require('../demo-script.json').stats,events:[{kind:'souvenir',at:iso(T)},{kind:'radar',at:iso(T),n:13,added:7}]};assert.doesNotThrow(()=>C.validateSceneFields(valid));assert.doesNotThrow(()=>C.validateSceneFields({roster}));
 for(const souvenir of [{at:'bad'},{at:iso(T),id:'grok'},{at:iso(T),title:'secret'}])assert.throws(()=>C.validateSceneFields({...valid,scene:{...valid.scene,souvenir}}));
 for(const radar of [{at:iso(T),n:13,added:0},{at:iso(T),n:13,added:14},{at:iso(T),n:'13',added:7},{at:iso(T),n:1.5,added:1},{at:iso(T),n:13,added:7,title:'secret'}])assert.throws(()=>C.validateSceneFields({...valid,scene:{...valid.scene,radar}}));
 for(const event of [{kind:'radar',at:iso(T),n:13},{kind:'radar',at:iso(T),n:13,added:0},{kind:'souvenir',at:iso(T),n:1}])assert.throws(()=>C.validateSceneFields({...valid,events:[event]}));
 for(const k of ['souvenirs','radars']){assert.throws(()=>C.validateSceneFields({...valid,stats:{...valid.stats,[k+'Total']:-1}}));assert.throws(()=>C.validateSceneFields({...valid,stats:{...valid.stats,today:{...valid.stats.today,[k]:'1'}}}));}
 assert.doesNotThrow(()=>C.validateSceneFields({...valid,events:Array(500).fill(valid.events[0])}));assert.throws(()=>C.validateSceneFields({...valid,events:Array(501).fill(valid.events[0])}));assert.equal(C.eventText(valid.events[0],roster),'Grok Bot 从云上回来，给大家带了云朵棉花糖');assert.equal(C.eventText(valid.events[1],roster),'豆包雷达回来了，带回 7 个选题');
});
test('priority/expiry, rotation retains delivered gifts, old radar restores card without replay',()=>{
 let s=create();s.setStatus('grok','busy',iso(T));s.setScene({...C.emptyScene(),souvenir:{at:iso(T+s.time*1000)}});s.step(1000);assert.equal(s.souvenir,null);s.step(121000);s.setStatus('grok','away',iso(T));s.step(20);assert.equal(s.souvenir,null);
 s=create();s.setScene({...C.emptyScene(),souvenir:{at:iso(T+s.time*1000)}});s.step(16000);s=s.relayout('landscape');walk(s,100000);assert.equal(s.souvenir,null);assert.ok(s.foodNow().some(f=>f.kind==='cloud'));
 s=create();s.setScene({...C.emptyScene(),radar:{at:iso(T-3*M),n:13,added:7}});s.step(20);assert.equal(s.radar,null);assert.equal(s.radarCardNow().n,13);assert.equal(C.ACTIVITY_PRIORITY.souvenir,C.ACTIVITY_PRIORITY.snack);assert.equal(C.ACTIVITY_PRIORITY.radar,C.ACTIVITY_PRIORITY.snack);
});
test('same radar count on a different Beijing day plays again; same-day polls do not replay',()=>{
 const s=create();const signal={at:iso(T+s.time*1000),n:7,added:7};s.setScene({...C.emptyScene(),radar:signal});walk(s,110000);assert.equal(s.radar,null);s.setScene({...C.emptyScene(),radar:signal});s.step(20);assert.equal(s.radar,null);
 s.clockBase+=86400000;s.setScene({...C.emptyScene(),radar:{...signal,at:iso(s.clockBase+s.time*1000)}});s.step(20);assert.ok(s.radar);assert.equal(s.radar.n,7);
});
test('old radar does not suppress an unrelated later Doubao snack',()=>{
 const s=create();s.setStatus('doubao','done',iso(T+s.time*1000));s.setScene({...C.emptyScene(),radar:{at:iso(T-10*M),n:13,added:7},snack:{id:'doubao',at:iso(T+s.time*1000)}});s.step(20);assert.ok(s.snack);assert.equal(s.radar,null);
});
