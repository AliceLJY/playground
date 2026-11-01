const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../office-core.js'),MV=require('../mv.js'),script=require('../mv-script.json');
function run(){
 const L=Core.layouts.portrait,C={...Core,...L,home:i=>Core.home(i,L)},sim=C.create(script.roster,script.seed,L),mv=MV.create(script,C),frames=new Map();mv.start(sim);
 for(let t=0;t<Math.round(script.seconds*1000);t+=20){mv.tick(t,sim);sim.night=C.isNight(mv.clock(t+20));sim.step(20*mv.pace(t+20));mv.observe(t+20,sim);
  if((t+20)%100===0)frames.set((t+20)/1000,JSON.parse(JSON.stringify({scene:sim.scene,actors:sim.actors.map(a=>({...a,game:sim.gameActivity(a)})),visitors:sim.visitors,ball:sim.pingPongBall(),flights:sim.flightPoints(),guard:sim.guard,delivery:sim.delivery,boss:sim.boss,camera:mv.camera(t+20),subtitle:mv.subtitle(t+20),dark:mv.darkness(t+20),plates:C.nameplates(sim.actors,n=>n.length*4,[],L)})));
 }return {frames,log:mv.log,mv,C};
}
const {frames:F,log,mv,C}=run(),actor=(t,id)=>F.get(t).actors.find(a=>a.id===id);
test('v5 uses portrait games, real paired motion and identity-based desk 8 courier',()=>{
 assert.equal(script.roster.find(a=>a.id==='courier').desk,8);assert.equal(C.lookIndex(actor(14,'courier')),10);
 assert.equal(C.distance(actor(14,'courier'),C.home(8)),0);
 const games=F.get(14).actors.filter(a=>a.game);assert.equal(games.length,5);assert.equal(games.filter(a=>a.game==='pingpong').length,2);assert.equal(games.filter(a=>a.game==='chess').length,2);assert.equal(games.filter(a=>a.game==='arcade').length,1);
 assert.notDeepEqual(F.get(14).ball,F.get(14.3).ball);assert.equal(F.get(14).ball.size,3);assert.ok(games.every(a=>F.get(14).plates.some(p=>p.id===a.id)));
 assert.equal(F.get(20).delivery.phase,'holding');assert.ok(C.distance(actor(20,'courier'),C.handoff)<1);
 assert.ok(C.distance(actor(14,'helper'),C.home(9))<1);assert.equal(actor(14,'writer').status,'off');assert.ok(C.distance(actor(39,'writer'),C.home(10))<1);
});
test('phone reaches booth, shows two lines, lasts 30 story seconds and sends a real folder',()=>{
 assert.equal(actor(28,'director').activity,'call');assert.ok(C.distance(actor(28,'director'),C.booth)<1);
 assert.ok(script.says.some(s=>s.text==='喂，Codex'));assert.ok(script.says.some(s=>s.text==='交给你啦'));
 const seated=log.find(e=>e.type==='call-seated'),hangup=log.find(e=>e.type==='call'&&e.value===null);assert.ok(seated);
 assert.ok(Math.abs((mv.clock(hangup.t*1000)-seated.storyTime)/1000-30)<.1);
 const f=F.get(31.5).flights[0];assert.equal(f.id,'builder');assert.ok(f.progress>0&&f.progress<1);assert.deepEqual(f.to,{x:174,y:116});assert.ok(F.get(33).scene.dispatched.includes('builder'));
});
test('review really seats five members and two guests; camera travels through stairs and returns',()=>{
 for(const t of [53,56]){const s=F.get(t);assert.equal(s.actors.filter(a=>a.activity==='meeting'&&!a.path.length).length,5);}
 const s=F.get(56);assert.equal(s.visitors.filter(v=>v.listening&&!v.path.length).length,2);assert.equal(F.get(53).scene.meeting.round,1);assert.equal(s.scene.meeting.round,2);assert.equal(s.scene.meeting.slide.open,0);
 assert.ok(F.get(46).camera.cy>=390);assert.ok(F.get(47).camera.cy>420);assert.ok(F.get(56).camera.cy>490);assert.ok(F.get(60.5).camera.cy<250);assert.equal(F.get(60.5).scene.meeting,null);
 assert.ok(log.some(e=>e.type==='hello'));assert.ok(log.some(e=>e.type==='thanks'));
});
test('patrol completes by actual movement, green lamp precedes exits and host switches off',()=>{
 const patrol=[...F.values()].filter(s=>s.guard&&s.scene.guard.phase==='patrol');assert.ok(patrol.length>40);assert.ok(patrol.some(s=>s.guard.y>690));assert.ok(patrol.some(s=>s.guard.y<180));
 assert.ok(log.some(e=>e.type==='guard-done'));assert.equal(F.get(73.8).scene.guard.phase,'done');assert.equal(F.get(73.8).scene.guard.ok,true);
 for(const a of F.get(78.2).actors)assert.ok(C.distance(a,C.door)<3,`${a.id} must leave before lights out`);
 assert.ok(C.distance(F.get(78.2).boss,C.door)<1);assert.equal(F.get(80.4).dark,1);assert.ok(script.seconds/1.2>=60&&script.seconds/1.2<=70);
});
