const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../office-core.js'),MV=require('../mv.js'),script=require('../mv-script.json');
const L=Core.layouts.film,C={...Core,...L,home:i=>Core.home(i,L)};
function run(){
 const sim=C.create(script.roster,script.seed,L),mv=MV.create(script,C),frames=[];mv.start(sim);
 for(let t=0;t<script.seconds*1000;t+=20){
  mv.tick(t,sim);sim.night=C.isNight(mv.clock(t+20));sim.step(20*mv.pace(t+20));mv.observe(t+20,sim);
  if((t+20)%100===0)frames.push(structuredClone({t:(t+20)/1000,time:sim.time,clock:mv.clock(t+20),scene:sim.scene,handoffWalk:sim.handoffWalk,handoffSpeech:sim.handoffSpeech(),actors:sim.actors,reception:sim.reception,speech:sim.receptionSpeech(),argue:sim.argue,snack:sim.snack,radar:sim.radar,radarCard:sim.radarCardNow(),souvenir:sim.souvenir,supper:sim.supper,melon:sim.melon,quota:sim.quotaEvent,food:sim.foodNow(),eventSpeech:sim.eventSpeech(),visitors:sim.visitors,boss:sim.boss,guard:sim.guard,camera:mv.camera(t+20),dark:mv.darkness(t+20)}));
 }return {sim,mv,frames};
}
const {sim,mv,frames:F}=run(),at=t=>F.find(f=>f.t===t),a=(f,id)=>f.actors.find(a=>a.id===id),phase=(type,p)=>mv.log.filter(e=>e.type===type&&e.phase===p);
test('v6 pitch uses two idle hosts, four real dialogue lines, handshake and complete exit',()=>{
 const r=F.filter(f=>f.reception),first=r[0];assert.equal(first.reception.kind,'pitch');assert.equal(first.reception.venue,'meeting');assert.equal(first.reception.hosts.length,2);
 for(const f of r)for(const id of f.reception.hosts)assert.equal(a(f,id).status,'idle');
 for(const word of Core.MEET_LINES.pitch)assert.ok(r.some(f=>f.speech?.text===word),word);
 const hand=r.filter(f=>f.reception.phase==='handshake');assert.ok(hand.length>=15,'at least 1.5 source seconds of handshake');
 assert.ok(hand.some(f=>C.distance(a(f,f.reception.hosts[0]),f.reception.visitor)<=20.1));
 assert.ok(phase('reception','end')[0].t<57,'visitor exits before radar shot');
});
test('v6 Codex confetti precedes biscuits delivered at each occupied desk',()=>{
 const start=phase('snack','delivering')[0];assert.ok(mv.log.some(e=>e.type==='confetti'&&e.id==='builder'&&e.t<start.t));
 const foods=mv.log.filter(e=>e.type==='food'&&e.kind==='biscuit');assert.deepEqual(foods.map(f=>f.id).sort(),start.ids.slice().sort());
 for(const f of F.filter(f=>f.snack)){assert.equal(a(f,'builder').activity,'snack');assert.equal(a(f,'builder').status,'done');}
 assert.ok(phase('snack','end')[0].t<41);
});
test('v6 radar pins the example count, host actually walks over and says 有意思',()=>{
 const f=F.find(f=>f.eventSpeech.some(b=>b.id==='boss'&&b.text==='有意思'));assert.ok(f);assert.equal(f.radarCard.n,7);assert.equal(f.radar.phase,'showing');assert.ok(C.distance(f.boss,{x:300,y:88})<1);
 assert.ok(phase('radar','end')[0].t<66);
});
test('v6 Grok returns through the entrance, puts papers before cloud candy and finishes the route',()=>{
 const phases=mv.log.filter(e=>e.type==='souvenir').map(e=>e.phase);assert.deepEqual(phases,['papers','delivering','returning','sitting','leaving','end']);
 const papers=mv.log.find(e=>e.type==='food'&&e.kind==='papers');assert.equal(papers.id,'director');
 const candy=mv.log.filter(e=>e.type==='food'&&e.kind==='cloud');assert.ok(candy.length>=8);assert.ok(candy.every(e=>e.t>=papers.t));
 for(const text of ['刚醒','云上带的'])assert.ok(F.some(f=>f.eventSpeech.some(b=>b.text===text)));
 assert.ok(C.distance(a(at(63),'scout'),C.door)<1);assert.ok(phase('souvenir','end')[0].t<71);
});
test('v6 Agy reaches quota wall and returns to a real seat before the review',()=>{
 const wall=F.filter(f=>a(f,'artist').activity==='quota'&&!a(f,'artist').path.length);assert.ok(wall.length>10);assert.ok(wall.every(f=>a(f,'artist').y===92));
 assert.equal(at(72.9).quota,null);assert.equal(a(at(72.9),'artist').status,'busy');assert.ok(C.distance(a(at(72.9),'artist'),C.home(4))<1);
});
test('v6 both review rounds complete talk, joined smoke, huff and return; three idle spectators eat melon',()=>{
 for(const round of [1,2]){
  const logs=mv.log.filter(e=>e.type==='argue'&&e.round===round);
  for(const p of ['arriving','talking','joining','smoke','huff','returning'])assert.ok(logs.some(e=>e.phase===p),round+' '+p);
  const smoke=F.filter(f=>f.argue?.round===round&&f.argue.phase==='smoke');assert.ok(smoke.length>3);
  for(const f of smoke){assert.equal(f.argue.ids.length,2);assert.ok(C.distance(...f.argue.ids.map(id=>a(f,id)))<.1);assert.ok(f.melon?.ids.length>=2);}
 }
 const main=F.filter(f=>f.argue?.round===1&&f.argue.phase==='smoke');assert.ok(main.length>=19,'main laugh holds about two source seconds');
 const spectators=at(78.1);assert.equal(spectators.melon.ids.length,3);assert.ok(spectators.melon.ids.every(id=>a(spectators,id).activity==='melon'&&!a(spectators,id).path.length));
 const settled=at(86);assert.equal(settled.actors.filter(a=>a.activity==='meeting'&&!a.path.length).length,5);assert.equal(settled.visitors.filter(a=>a.listening&&!a.path.length).length,2);
});
test('v6 late supper reaches both busy colleagues before a completed real patrol',()=>{
 const start=phase('supper','delivering')[0];assert.ok(MV.toMs('23:00')<=mv.clock(start.t*1000));
 const noodles=mv.log.filter(e=>e.type==='food'&&e.kind==='noodles');assert.deepEqual(noodles.map(e=>e.id),['director','builder']);assert.ok(F.some(f=>f.eventSpeech.some(b=>b.text==='谢谢大哥')));
 const end=phase('supper','end')[0],done=mv.log.find(e=>e.type==='guard-done');assert.ok(end.t<done.t);
 const patrol=F.filter(f=>f.guard&&!f.supper&&f.scene.guard?.phase==='patrol');assert.ok(patrol.some(f=>f.guard.y>690));assert.ok(patrol.some(f=>f.guard.y<180));
 assert.equal(at(102.7).scene.guard.ok,true);
});
test('v7 replaces the phone with the real desk handoff and retains clock, final exit and duration',()=>{
 const phases=mv.log.filter(e=>e.type==='handoffWalk').map(e=>e.phase);
 for(const phase of ['pickup','walking','placing','pat','reply','returning','end'])assert.ok(phases.includes(phase),phase);
 const hand=F.filter(f=>f.handoffWalk);assert.ok(hand.length>20);assert.ok(!F.some(f=>f.actors.some(a=>a.activity==='call')));
 assert.ok(hand.some(f=>f.handoffSpeech.some(b=>b.text==='收到')));assert.ok(C.distance(a(at(32),'director'),C.home(0))<1);
 const start=mv.log.find(e=>e.type==='meeting-start');assert.ok(start&&start.t>73&&start.t<77);
 assert.equal(mv.events.find(e=>e.kind==='meeting').at,new Date(start.storyTime).toISOString());
 assert.ok(mv.log.some(e=>e.type==='paper'));assert.ok(at(32).scene.dispatched.includes('builder'));
 for(let i=1;i<F.length;i++)assert.ok(F[i].clock>=F[i-1].clock);
 for(const actor of at(106).actors)assert.ok(C.distance(actor,C.door)<3,actor.id);assert.ok(C.distance(at(106).boss,C.door)<1);
 assert.equal(F.at(-1).dark,1);assert.ok(script.seconds/1.2>=80&&script.seconds/1.2<=95);
});
