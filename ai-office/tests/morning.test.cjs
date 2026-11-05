const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js');
const at=hm=>Date.parse(`2026-11-01T${hm}:00+08:00`);
// 11-05 Alice: 7:30 the cats are let in and wake her, follow her meowing while she washes, get fed, and she leaves at 7:45.
test('morning: asleep till 07:30, woken by the cats, washes, feeds them, at her desk by 07:45, tea at 08:00',()=>{
  for(const [hm,kind] of [['07:29','sleep'],['07:30','wake'],['07:33','wash'],['07:41','wash'],['07:42','feed'],['07:44','feed'],['07:45','desk'],['07:59','desk'],['08:00','tea']])
    assert.equal(C.bossPlan(at(hm)).kind,kind,hm);
  assert.equal(C.kidsPlan(at('07:45')).kind,'sleep','the kids are still asleep');
});
test('morning spots are walkable and reachable from her bed',()=>{
  const L=C.layouts.portrait;
  for(const k of ['wash','feed']){const p=L.bossSpots[k];assert.equal(C.blocked(p.x,p.y,L),false,k);assert.ok(C.route(L.clinicBed,p,L).length,k);}
});
test('she stays in bed while being woken, then walks to the basin and the cat bowl',()=>{
  for(const [hm,act,label] of [['07:30','wake','被猫叫醒'],['07:36','wash','洗漱，两只猫跟着喵喵叫'],['07:43','feed','出门前喂猫']]){
    const s=C.create(require('../demo-script.json').roster,7,'portrait');s.setScene(C.emptyScene(),at(hm));for(const a of s.actors)s.setStatus(a.id,'busy');
    for(let i=0;i<4;i++)s.step(15000);assert.equal(s.bossActivity(),act,hm);assert.equal(s.bossLabel(),label,hm);
  }
});
// 11-05 Alice: 「我们是看情况的，因为他们会出去花园弄的脏兮兮，我们就要给他洗澡了，每个月还要去杀虫的」.
const on=(day,hm)=>Date.parse(`${day}T${hm}:00+08:00`);
test('13:00 is a bath only on muddy days, the vet on the 1st, otherwise more petting',()=>{
  assert.equal(C.bossPlan(on('2026-11-01','13:10')).kind,'vet'); assert.equal(C.bossPlan(on('2026-12-01','13:10')).kind,'vet');
  assert.equal(C.bossPlan(on('2026-11-02','13:10')).kind,'pet'); assert.equal(C.bossPlan(on('2026-11-03','13:10')).kind,'bath');
  assert.equal(C.bossPlan(on('2026-11-03','12:59')).kind,'pet'); assert.equal(C.bossPlan(on('2026-11-03','13:30')).kind,'desk');
  let muddy=0; for(let i=0;i<90;i++) if(C.catDay(on('2026-11-02','12:00')+i*86400000).muddy) muddy++;
  assert.ok(muddy>15 && muddy<45, `about one day in three, got ${muddy}/90`);
  assert.equal(C.kidsPlan(on('2026-11-03','13:10')).with,'bath'); assert.equal(C.kidsPlan(on('2026-11-01','13:10')).kind,'play');
  const L=C.layouts.portrait,p=L.bossSpots.bath; assert.equal(C.blocked(p.x,p.y,L),false); for(const q of L.kidSpots.bath) assert.equal(C.blocked(q.x,q.y,L),false);
  const s=C.create(require('../demo-script.json').roster,7,'portrait');s.setScene(C.emptyScene(),on('2026-11-03','13:05'));for(const a of s.actors)s.setStatus(a.id,'busy');
  for(let i=0;i<4;i++)s.step(15000);assert.equal(s.bossActivity(),'bath');assert.equal(s.bossLabel(),'带娃给小橘洗澡');
  const v=C.create(require('../demo-script.json').roster,7,'portrait');v.setScene(C.emptyScene(),on('2026-11-01','13:05'));for(const a of v.actors)v.setStatus(a.id,'busy');
  for(let i=0;i<8;i++)v.step(15000);assert.equal(v.bossAway,true);assert.equal(v.bossLabel(),'带两只猫去宠物医院驱虫');
});
