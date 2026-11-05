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
