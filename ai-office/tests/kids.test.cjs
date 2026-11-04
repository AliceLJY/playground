const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js');
const at=hm=>Date.parse(`2026-11-01T${hm}:00+08:00`);
// 11-04 Alice: 无忧无虑 leave the playroom — game room, farm, chasing the cat, AI lessons, and meals with the boss.
test('kids day: schedule follows Beijing time and the boss\'s meals pull them along',()=>{
  for(const [hm,kind] of [['07:59','sleep'],['21:00','sleep'],['08:30','meal'],['09:10','boss'],['09:40','boss'],['10:40','study'],['12:00','meal'],['12:40','boss'],['13:40','chase'],['14:40','study'],['15:10','boss'],['16:00','meal'],['16:40','boss'],['17:40','meal'],['18:40','boss'],['19:40','play'],['20:40','games']])
    assert.equal(C.kidsPlan(at(hm)).kind,kind,hm);
  assert.equal(C.kidsPlan(at('08:30')).meal,'tea'); assert.equal(C.kidsPlan(at('12:00')).meal,'kitchen');
});
test('kids spots are walkable and reachable from the playroom',()=>{
  const L=C.layouts.portrait;
  for(const [k,list] of Object.entries(L.kidSpots)) for(const p of list){assert.equal(C.blocked(p.x,p.y,L),false,k);assert.ok(C.route(L.kidSpots.play[0],p,L).length||C.distance(L.kidSpots.play[0],p)<1,k);}
});
test('the boss\'s drawer line says 带娃… while the kids are with her',()=>{
  const s=C.create(require('../demo-script.json').roster,7,'portrait');s.setScene(C.emptyScene(),at('12:00'));for(const a of s.actors)s.setStatus(a.id,'busy');
  s.step(30000);assert.equal(s.bossActivity(),'kitchen');assert.equal(s.bossLabel(),'带娃吃饭');
  for(const [hm,label] of [['09:10','带娃办公'],['10:00','带娃玩游戏'],['15:10','带娃游泳'],['16:40','带娃运动'],['18:40','带娃浇菜']]){const b=C.create(require('../demo-script.json').roster,7,'portrait');b.setScene(C.emptyScene(),at(hm));for(const a of b.actors)b.setStatus(a.id,'busy');b.step(30000);assert.equal(b.bossLabel(),label,hm);}
  assert.equal(C.kidsPlan(at('09:40')).with,'games');assert.equal(C.kidsPlan(at('16:40')).with,'gym');
});
test('during an AI lesson a free colleague sits down in the reading room to teach; outside it nobody is sent',()=>{
  const run=hm=>{const s=C.create(require('../demo-script.json').roster,7,'portrait');s.setScene(C.emptyScene(),at(hm));for(const a of s.actors)s.setStatus(a.id,'idle');for(let i=0;i<8;i++)s.step(15000);return s.actors.some(a=>s.gameActivity(a)==='book');};
  assert.equal(run('10:40'),true,'study time');
  const s=C.create(require('../demo-script.json').roster,7,'portrait');s.setScene(C.emptyScene(),at('10:40'));for(const a of s.actors)s.setStatus(a.id,'busy');s.step(60000);
  assert.equal(s.actors.some(a=>s.gameActivity(a)==='book'),false,'everyone busy: no teacher');
});
