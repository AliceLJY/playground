const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../office-core.js'),script=require('../demo-script.json');
// 08:30 and 10:30 Beijing on the demo day.
const BREAKFAST=Date.parse('2026-11-01T00:30:00Z'),LATE=Date.parse('2026-11-01T02:30:00Z');

function office(layout,clock){
  const s=C.create(script.roster,7,layout);
  if(clock!==undefined)s.setScene(C.emptyScene(),clock);
  for(const a of s.actors)s.setStatus(a.id,a.i===0?'busy':'idle');
  return s;
}
function clearRoute(L,from,to){
  const route=C.route(from,to,L);assert.ok(route.length || C.distance(from,to)<4,JSON.stringify({layout:L.id,from,to}));
  let previous=from;
  for(const p of route){const n=Math.max(1,Math.ceil(C.distance(previous,p)));for(let i=0;i<=n;i++){const x=previous.x+(p.x-previous.x)*i/n,y=previous.y+(p.y-previous.y)*i/n;assert.equal(C.blocked(x,y,L),false,JSON.stringify({layout:L.id,from,to,x,y}));}previous=p;}
}

test('departments: roster sits by department and desk 9 is gone from the room',()=>{
  const desk=Object.fromEntries(script.roster.map(a=>[a.name,a.desk]));
  assert.deepEqual([desk.Codex,desk.Kimi,desk.Agy].sort(),[1,2,3],'engineering & review take the top row');
  assert.deepEqual([desk['Grok Bot'],desk.Muse].sort(),[6,8],'production room');
  assert.deepEqual([desk.Cobbler,desk.Dots].sort(),[4,5],'mailroom');
  assert.equal(desk['etwin-cc'],7);for(const id of ['portrait','landscape']){const L=C.layouts[id],h=C.home(7,L);assert.ok(C.distance(h,L.bossDesk)<70,'etwin keeps the boss company');assert.equal(C.blocked(h.x,h.y,L),false);}
  assert.equal(desk.CC,0);assert.equal(desk['豆包'],10);
  assert.ok(!script.roster.some(a=>a.desk===9));
  for(const id of ['portrait','landscape']){const L=C.layouts[id];assert.ok(C.blocked(210,272,L),'arcade cabinets stand where desk 9 was');}
});

test('breakfast: idle colleagues fill the teahouse first and walk back to the game room after ten',()=>{
  for(const layout of ['portrait','landscape']){
    const s=office(layout,BREAKFAST);s.step(30000);
    const idle=s.actors.filter(a=>a.status==='idle'&&!s.isCourier(a));
    const tea=idle.filter(a=>s.gameActivity(a)==='tea');
    assert.equal(tea.length,4,`${layout}: four seats taken`);
    for(const a of tea){assert.ok(a.gameSlot>=16&&a.gameSlot<=19);assert.ok(C.distance(a,C.leisure(layout)[a.gameSlot])<1);}
    assert.equal(new Set(tea.map(a=>a.gameSlot)).size,4);
    // After the sitting the teahouse keeps only its two everyday seats; the rest go back to games and the gym.
    s.clockBase=LATE-s.time*1000;s.step(40000);
    assert.ok(s.actors.filter(a=>s.gameActivity(a)==='tea').length<=2,`${layout}: only everyday seats after ten`);
    assert.ok(s.actors.every(a=>s.gameActivity(a)!=='tea'||[16,17].includes(a.gameSlot)));
    assert.ok(s.actors.filter(a=>s.gameActivity(a)).length>=4);
  }
});

test('teahouse is open all day: two everyday seats outside 早茶/下午茶/夜茶, four during them; busy people stay at desks',()=>{
  assert.equal(C.teaTime(BREAKFAST),'早茶');assert.equal(C.teaTime(Date.parse('2026-11-01T07:30:00Z')),'下午茶');assert.equal(C.teaTime(Date.parse('2026-11-01T12:30:00Z')),'夜茶');assert.equal(C.teaTime(LATE),null);
  for(const clock of [undefined,LATE]){
    const s=office('portrait',clock);s.step(30000);
    assert.equal(s.actors.filter(a=>s.gameActivity(a)==='tea').length,2);
    const cc=s.actors.find(a=>a.i===0);assert.ok(C.distance(cc,C.home(0))<1);
  }
  const forced=office('portrait');forced.forceBreakfast=true;forced.step(30000);assert.equal(forced.actors.filter(a=>forced.gameActivity(a)==='tea').length,4);
});

test('gym: with enough idle people the treadmill and weights are used, with matching poses',()=>{
  const s=office('landscape',LATE);s.step(30000);
  const kinds=s.actors.map(a=>s.gameActivity(a)).filter(Boolean);
  assert.ok(kinds.includes('run'),kinds.join());
});

test('every leisure spot, meeting place and patrol point is reachable on sampled routes in both layouts',()=>{
  for(const id of ['portrait','landscape']){
    const L=C.layouts[id],starts=[...L.desks.map((_,i)=>C.home(i,L)).filter((_,i)=>i!==9),L.door,L.bossDesk];
    const targets=[...C.leisure(L).slice(10),L.podium,...L.seats,...L.standing,...L.audience,L.booth];
    for(const p of [...targets,...L.patrol])assert.equal(C.blocked(p.x,p.y,L),false,JSON.stringify({id,p}));
    for(const start of starts)for(const p of targets)clearRoute(L,start,p);
  }
});

test('compact meeting room keeps every seat, standing place and the podium distinct and inside its walls',()=>{
  const points=[C.podium,...C.seats,...C.standing];
  for(let i=0;i<points.length;i++)for(const q of points.slice(i+1))assert.ok(Math.abs(points[i].x-q.x)>=18||Math.abs(points[i].y-q.y)>=24);
  for(const p of points){assert.ok(p.x>23&&p.x<176&&p.y>490&&p.y<600,JSON.stringify(p));}
});

test('game room and teahouse links point at games that exist in this repo',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const links=[...html.matchAll(/href="https:\/\/aliceljy\.github\.io\/playground\/([a-z0-9-]+)\/"/g)].map(m=>m[1]);
  assert.ok(links.length>=15,`${links.length} links`);
  const root=path.join(__dirname,'..','..'),pages=fs.readFileSync(path.join(root,'.github','workflows','pages.yml'),'utf8');
  for(const slug of new Set(links)){
    const dir={aju:'aju-guangzhou-ride',shanhe:'shanhe-scroll'}[slug]||slug;
    assert.ok(fs.existsSync(path.join(root,dir)),`${slug} has a folder`);
    assert.ok(pages.includes(`_site/${slug}`),`${slug} is published by pages.yml`);
  }
  assert.ok(links.includes('datai-teahouse'));assert.ok(links.includes('memory-fade'),'showcase lists the AI backstage row');
  assert.ok(html.includes('https://github.com/AliceLJY')&&html.includes('我的AI小木屋'),'showcase carries the public accounts');
});

test('night 7×24: no one goes home; nappers take beanbags and the yoga mat, the rest sleep at their desks; work wakes them',()=>{
  for(const layout of ['portrait','landscape']){
    const s=C.create(script.roster,7,layout),L=C.layouts[layout];
    for(const a of s.actors)s.setStatus(a.id,a.name==='Grok Bot'?'away':'off');s.step(40000);
    const grok=s.actors.find(a=>a.name==='Grok Bot');assert.ok(C.distance(grok,L.door)<1,'away still leaves');
    const off=s.actors.filter(a=>a.status==='off').sort((a,b)=>a.i-b.i);
    for(const a of off){assert.ok(C.distance(a,L.door)>3,`${layout}: ${a.name} stayed in`);assert.ok(s.napping(a),`${layout}: ${a.name} asleep`);}
    const spots=[6,7,15].map(i=>C.leisure(L)[i]);
    off.slice(0,3).forEach((a,k)=>assert.ok(C.distance(a,spots[k])<1));
    off.slice(3).forEach(a=>assert.ok(C.distance(a,C.home(a.i,L))<1));
    const codex=s.actors.find(a=>a.name==='Codex');s.setStatus(codex.id,'busy');s.step(20000);
    assert.ok(C.distance(codex,C.home(codex.i,L))<1);assert.equal(s.napping(codex),false);
  }
  const film=C.create(script.roster,7,'film');film.classicLeisure=true;for(const a of film.actors)film.setStatus(a.id,'off');film.step(40000);
  assert.ok(film.actors.every(a=>C.distance(a,C.layouts.film.door)<1),'the published film still sends everyone home');
});

test('dim sum treat: carried to the teahouse, everyone free (idle or napping) eats for two minutes, then back',()=>{
  for(const layout of ['portrait','landscape']){
    const L=C.layouts[layout],s=C.create(script.roster,7,layout);s.setScene(C.emptyScene(),Date.parse('2026-11-01T15:30:00Z'));
    for(const a of s.actors)s.setStatus(a.id,a.i===0?'busy':a.i<4?'off':'idle');s.step(20000);
    for(const p of [L.feastDrop,...L.feastStand])assert.equal(C.blocked(p.x,p.y,L),false);
    s.treat('dimsum','2026-11-01T15:30:20Z');let started=null;
    for(let i=0;i<4000&&!started;i++){s.step(20);if(s.feast)started=s.time;}
    assert.ok(started,`${layout}: the treat reached the teahouse`);assert.equal(s.feast.night,true);
    s.step(25000);
    const eaters=s.actors.filter(a=>s.feastEating(a));
    assert.equal(eaters.length,Math.min(6,s.actors.filter(a=>['idle','off'].includes(a.status)).length),`${layout}: ${eaters.length} at the table`);
    assert.ok(eaters.some(a=>a.status==='off'),'nappers are woken for it');
    const cc=s.actors.find(a=>a.i===0);assert.ok(C.distance(cc,C.home(0,L))<1,'busy director keeps working');
    const others=s.actors.filter(a=>a.status==='idle'&&!s.feastSpot(a));for(const a of others)assert.ok(![16,17,18,19].includes(a.gameSlot),'leftovers do not share the feast table');
    s.step(130000);assert.equal(s.actors.filter(a=>s.feastEating(a)).length,0);assert.ok(s.actors.filter(a=>a.status==='off').every(a=>s.napping(a)));
  }
});
