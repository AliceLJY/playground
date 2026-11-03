const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{once}=require('node:events'),{createHash,randomBytes}=require('node:crypto');
const C=require('../office-core.js');
const clock=hm=>Date.parse(`2026-11-03T${hm}:00+08:00`);
const roster=n=>Array.from({length:n},(_,desk)=>({id:`member-${desk}`,name:`伙伴${desk}`,desk,courier:false,color:'#739C82'}));
function office(layout,hm,n=8,chef=false){const people=roster(n);if(chef)people.at(-1).awayPost='kitchen';const s=C.create(people,7,layout);s.setScene(C.emptyScene(),clock(hm));if(chef)s.setStatus(people.at(-1).id,'away');return s;}
function slots(s){return s.actors.filter(a=>a.status==='idle').map(a=>a.gameSlot);}
function at(s,hm){s.clockBase=clock(hm)-s.time*1000;s.step(40000);}

test('kitchen clock: inclusive starts, exclusive ends; tea and night windows stay intact',()=>{
  for(const [hm,expected] of [['11:29',null],['11:30','午餐'],['12:59','午餐'],['13:00',null],['17:29',null],['17:30','晚餐'],['18:59','晚餐'],['19:00',null]])assert.equal(C.mealTime(clock(hm)),expected,hm);
  for(const [hm,expected] of [['18:59',false],['19:00',true],['22:59',true],['23:00',false]])assert.equal(C.isBBQTime(clock(hm)),expected,hm);
  assert.equal(C.teaTime(clock('19:59')),null);assert.equal(C.teaTime(clock('20:00')),'夜茶');assert.equal(C.teaTime(clock('23:00')),null);assert.equal(C.isNight(clock('23:00')),true);
});

test('meal allocation uses the shared leisure list, even with just one idle colleague; ordinary rotation still reaches it',()=>{
  for(const layout of ['portrait','landscape'])for(const hm of ['11:30','12:40','17:30','18:40'])for(const n of [1,2,4,8]){
    const s=office(layout,hm,n);s.step(40000);
    for(const slot of [37,38,39,40].slice(0,n))assert.ok(slots(s).includes(slot),`${layout} ${hm} ${n}: slot ${slot}`);
    assert.equal(s.actors.filter(a=>['cook','chop','eat'].includes(s.gameActivity(a))).length,Math.min(n,4));
  }
  assert.ok(!C.leisureSlots(8).some(i=>i>=34),'new rooms start at low ordinary priority');
  const seen=new Set();for(let turn=0;turn<80;turn++)for(const slot of C.leisureSlots(8,false,turn))seen.add(slot);
  for(const slot of [37])assert.ok(seen.has(slot),`ordinary rotation reaches ${slot}`);
  const s=office('portrait','11:29',4);s.step(20);assert.ok(!slots(s).includes(37));at(s,'11:30');assert.deepEqual(slots(s).sort(),[37,38,39,40]);at(s,'13:00');assert.ok(slots(s).some(i=>i<34));
});

test('barbecue precedes night tea, includes grill/eat/cheer, and stops at 23:00',()=>{
  for(const layout of ['portrait','landscape']){
    for(const hm of ['19:00','20:30','22:40']){
      const s=office(layout,hm,7);s.step(40000);for(const slot of [34,35,36])assert.ok(slots(s).includes(slot));
      for(const kind of ['grill','eat','cheer'])assert.ok(s.actors.some(a=>s.gameActivity(a)===kind));
      if(hm!=='19:00')for(const slot of [16,17,18,19])assert.ok(slots(s).includes(slot),'night tea follows the three barbecue slots');
      const small=office(layout,hm,1);small.step(40000);assert.equal(small.actors[0].gameSlot,34);
    }
    const s=office(layout,'22:59',1);s.step(20);assert.equal(s.actors[0].gameSlot,34);at(s,'23:00');assert.notEqual(s.actors[0].gameSlot,34);
  }
});

test('awayPost is independent of ID/desk: chef walks to reserved stove/grill, off leaves, work interrupts',()=>{
  for(const layout of ['portrait','landscape']){
    const s=office(layout,'12:00',8,true),a=s.actors.at(-1);s.step(40000);
    assert.equal(s.chefActivity(a),'cook');assert.ok(C.distance(a,C.leisure(layout)[37])<1);assert.ok(!slots(s).includes(37));
    for(const slot of [38,39,40])assert.ok(slots(s).includes(slot));
    at(s,'20:30');assert.equal(s.chefActivity(a),'grill');assert.ok(!slots(s).includes(34));for(const slot of [35,36])assert.ok(slots(s).includes(slot));
    at(s,'23:00');s.setStatus(a.id,'off');s.treat('dimsum',new Date(clock('23:00')).toISOString());s.step(40000);
    assert.ok(C.distance(a,s.layout.door)<1);assert.equal(s.napping(a),false);assert.equal(s.feastSpot(a),null);assert.equal(s.chefActivity(a),null);
    for(const status of ['busy','done','waiting']){s.setStatus(a.id,status);s.step(40000);const expected=status==='waiting'?s.layout.queuePoint(0):C.home(a.i,layout);assert.ok(C.distance(a,expected)<1,status);assert.equal(s.chefActivity(a),null);}
    s.setStatus(a.id,'away');at(s,'10:00');assert.equal(s.chefActivity(a),'cook','outside meals chef remains in kitchen');
    const relaid=s.relayout(layout==='portrait'?'landscape':'portrait');assert.equal(relaid.chefActivity(relaid.actors.at(-1)),'cook');
    const normal=s.actors[0];s.setStatus(normal.id,'away');s.step(40000);assert.ok(C.distance(normal,s.layout.door)<1,'ordinary away still leaves');s.setStatus(normal.id,'off');s.step(40000);assert.ok(s.napping(normal),'ordinary off still naps');
  }
});

test('chef speaks occasionally only while stationed with meal guests; no stale speech after work resumes',()=>{
  const s=office('portrait','12:00',5,true),a=s.actors.at(-1);s.step(40000);const lines=new Set();let quiet=0;
  for(let i=0;i<36;i++){s.step(1000);const b=s.eventSpeech().find(b=>b.id===a.id);if(b)lines.add(b.text);else quiet++;}
  // 11-03: every other call names a diner's home dish (「X的Y好了」).
  assert.ok([...lines].every(l=>['开饭啦','加个菜？','小心烫'].includes(l)||/的.+好了$/.test(l)),[...lines].join());assert.ok([...lines].some(l=>/好了$/.test(l))&&[...lines].some(l=>!/好了$/.test(l)));assert.ok(quiet>=20);
  for(const b of s.actors)s.setStatus(b.id,'busy');s.step(20);assert.ok(!s.eventSpeech().some(b=>b.id===a.id));
  const alone=office('portrait','12:00',1,true);alone.step(48000);assert.equal(alone.eventSpeech().length,0);
});

test('both layouts: new posts have clear continuous BFS paths from every desk and the door, and fit between old rooms',()=>{
  for(const layout of ['portrait','landscape']){
    const L=C.layouts[layout],spots=C.leisure(L).slice(34);assert.equal(spots.length,layout==='portrait'?12:7);
    const [kx,ky]=L.kitchenOffset,[bx,by]=L.funOffsets.bbq;
    const rooms=[{x:kx,y:ky,w:76,h:80},{x:bx,y:by,w:72,h:68}],old=[{x:L.restOffset[0],y:L.restOffset[1],w:104,h:66},{x:L.gymOffset[0],y:L.gymOffset[1],w:96,h:80},...Object.entries(L.funOffsets).filter(([k])=>k!=='bbq').map(([k,[x,y]])=>({x,y,w:k==='snack'?68:110,h:80}))];
    for(const p of rooms)for(const q of old)assert.ok(p.x+p.w<=q.x||q.x+q.w<=p.x||p.y+p.h<=q.y||q.y+q.h<=p.y,`${layout}: room overlap`);
    for(const to of spots){assert.equal(C.blocked(to.x,to.y,L),false);for(const from of [L.door,...L.desks.map((_,i)=>C.home(i,L)).filter((_,i)=>i!==9)]){
      const route=C.route(from,to,L);assert.ok(route.length,`${layout}: route to ${to.kind}`);let previous=from;
      for(const p of route){const n=Math.max(1,Math.ceil(C.distance(previous,p)));for(let i=0;i<=n;i++)assert.equal(C.blocked(previous.x+(p.x-previous.x)*i/n,previous.y+(p.y-previous.y)*i/n,L),false,`${layout}: clear route to ${to.kind}`);previous=p;}
    }}
  }
});

test('film and legacy retain exact pre-kitchen layout data and never create kitchen posts',()=>{
  const hashes={film:'3fcfbc01a86ac8a64920f4ee68d725f6ea2db69b42bd5381d77d014575fd675e',legacy:'391f0564d10afbe0f11363fd88bec58649f3da758830061e71327b33ca026457'};
  for(const [id,hash] of Object.entries(hashes)){
    const L=C.layouts[id];assert.equal(createHash('sha256').update(JSON.stringify(L)).digest('hex'),hash);assert.equal(L.kitchen,undefined);assert.ok(!L.funOffsets?.bbq);
    const s=office(id,'20:30',1,true);s.classicLeisure=true;s.step(40000);assert.ok(C.distance(s.actors[0],L.door)<1);assert.equal(s.chefActivity(s.actors[0]),null);
  }
});

test('awayPost validation and projection: private/guest HTTP preserve the field, page rejects invalid values',async t=>{
  const {createOffice,validateConfig}=await import('../server/office-server.mjs');
  const a={...roster(1)[0],role:'伙伴',awayPost:'kitchen',source:{type:'push'}},config={roster:[a],makotoAudit:null,radarLedgers:[]};
  for(const awayPost of [null,'bbq','',true,1,{},['kitchen']])assert.throws(()=>validateConfig({...config,roster:[{...a,awayPost}]}),/Invalid away post/);
  assert.doesNotThrow(()=>validateConfig({...config,roster:[{...a,awayPost:undefined}]}));
  const dir=await fs.mkdtemp(path.join(__dirname,'.kitchen-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const office=await createOffice({config,token:randomBytes(24).toString('hex'),stateFile:path.join(dir,'state.json'),clock:()=>clock('12:00'),collector:async()=>({}),sceneCollector:async()=>({})});
  office.server.listen(0,'127.0.0.1');await once(office.server,'listening');t.after(()=>new Promise(resolve=>office.server.close(resolve)));
  const source=await fs.readFile(path.join(__dirname,'../office.js'),'utf8');
  const validate=vm.runInNewContext('('+source.slice(source.indexOf('function validateState(data)'),source.indexOf('  // Where the live office answers'))+')',{C,labels:Object.fromEntries(['busy','idle','away','off','waiting','done','unknown'].map(k=>[k,k])),TREAT_NAMES:C.TREAT_NAMES});
  for(const route of ['/api/state','/guest/api/state']){
    const data=await (await fetch(`http://127.0.0.1:${office.server.address().port}${route}`)).json();assert.equal(data.roster[0].awayPost,'kitchen');assert.doesNotThrow(()=>validate(data));
    for(const awayPost of [null,'bbq','',true,{},['kitchen']])assert.throws(()=>validate({...data,roster:[{...data.roster[0],awayPost}]}),/Invalid role/);
  }
});

// 11-03 Alice: 「给我安排点事儿……老板在唱歌、游泳、撸猫」— the boss's own day in the tower.
test('boss day: the plan follows Beijing time, every spot is walkable, and a busy office still pulls her back to the desk',()=>{
  const at=hm=>Date.parse(`2026-11-01T${hm}:00+08:00`);
  for(const [hm,kind] of [['00:10','read'],['03:00','home'],['08:30','tea'],['10:40','stroll'],['12:00','kitchen'],['15:10','swim'],['16:40','gym'],['19:40','theatre'],['21:20','theatre'],['21:40','bbq'],['22:40','sing'],['23:10','dance'],['23:40','read']])
    assert.equal(C.bossPlan(at(hm)).kind,kind,hm);
  const L=C.layouts.portrait;
  for(const [k,p] of Object.entries(L.bossSpots)){assert.equal(C.blocked(p.x,p.y,L),false,k);assert.ok(C.route(L.bossDesk,p,L).length,k);}
  const s=C.create(require('../demo-script.json').roster,7,'portrait');s.setScene(C.emptyScene(),at('15:10'));for(const a of s.actors)s.setStatus(a.id,'busy');
  s.step(30000);assert.equal(s.bossActivity(),'swim');assert.equal(s.bossLabel(),'游泳');
  s.setStatus(s.actors[1].id,'waiting');s.step(30000);assert.ok(C.distance(s.boss,L.bossDesk)<1,'a waiting colleague brings her back');assert.equal(s.bossLabel(),'在老板桌等着拍板');
});
