const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/race-core.js'),drive=require('../tools/license-pilot.cjs');
function active(seed=1){const s=C.create({license:true,seed});C.start(s);for(let i=0;i<181;i++)C.step(s,{},1/60);return s;}
function run(s,pilot,until=()=>false,seconds=50){
 const events=[];let stalled=0,longestStall=0;
 for(let i=0;i<seconds*60&&s.phase==='racing'&&!until(s);i++){
  const before=s.riders[0].progress,input=pilot(s);C.step(s,input,1/60);
  events.push(...s.events.map(e=>({...e,time:s.time,stamps:s.license.stamps})));
  stalled=(input.forward||input.autoPedal)&&Math.abs(s.riders[0].progress-before)<.001?stalled+1:0;longestStall=Math.max(stalled,longestStall);
 }
 return {events,longestStall};
}
test('three actual drift releases and safe exits earn three stamps for manual and automatic pedalling',()=>{
 for(const autoPedal of [false,true])for(const seed of [1,2,3,4]){
  const s=active(seed),log=run(s,s=>drive(C,s,{autoPedal,hold:.36+seed*.01,offset:seed}));
  assert.equal(s.riders.length,1);assert.equal(s.license.outcome,'pass');assert.equal(s.license.stamps,3);
  assert.equal(log.events.filter(e=>e.type==='license-stamp').length,3,'all three exits really occurred');
  assert.ok(log.events.filter(e=>e.type==='mini').length>=3,'samples must contain genuine mini events');
  assert.equal(s.license.retries,0);assert.ok(s.time<45);assert.ok(log.longestStall<60,'held throttle must not stall for a second');
 }
});
test('a real rail hit retries only the current bend, keeps an earned stamp and remains completable',()=>{
 const s=active();run(s,s=>drive(C,s),s=>s.license.stamps===1);assert.equal(s.license.stamps,1);
 const before=s.time,log=run(s,()=>({forward:true,right:true,drift:true}),s=>s.license.retries>0);
 assert.ok(log.events.some(e=>e.type==='hit'),'the reckless driver must actually hit a rail');
 assert.ok(log.events.some(e=>e.type==='license-retry'));assert.equal(s.license.stamps,1);assert.equal(s.license.mini,false);
 assert.ok(s.time>before);assert.ok(Math.abs(s.riders[0].progress-290)<.1);
 run(s,s=>drive(C,s));assert.equal(s.license.outcome,'pass');
});
test('a missed mini retries the bend; nitro and an actual boost-pad event cannot substitute for it',()=>{
 const s=active();run(s,s=>drive(C,s),s=>s.license.stamps===2);assert.equal(s.license.stamps,2);
 assert.equal(C.boost(s),true);
 const log=run(s,s=>{
  // Follow the existing pad lane on the last bend, using steering only.
  const r=s.riders[0],p=C.at(C.nearest(r.x,r.z).s+10,-2.5),e=C.wrap(Math.atan2(-(p.x-r.x),-(p.z-r.z))-r.heading);
  return {forward:true,left:e>.03,right:e<-.03};
 },s=>s.license.retries>0);
 assert.ok(log.events.some(e=>e.type==='pad'),'sample must actually cross a boost pad');
 assert.ok(log.events.some(e=>e.type==='license-retry'&&e.text.includes('还没触发小喷')));
 assert.equal(s.license.stamps,2);assert.equal(s.license.mini,false);
 run(s,s=>drive(C,s));assert.equal(s.license.outcome,'pass');
});
test('pause freezes the exam, recovery retries only this bend, and idle driving times out honestly',()=>{
 const s=active();run(s,s=>drive(C,s),s=>s.license.stamps===1);
 C.pause(s);C.step(s,{},1/60);const frozen=JSON.stringify(s);for(let i=0;i<120;i++)C.step(s,{autoPedal:true},1/60);assert.equal(JSON.stringify(s),frozen);C.pause(s);
 const before=s.time;C.recover(s);assert.equal(s.license.stamps,1);assert.equal(s.license.retries,1);assert.equal(s.time,before);
 run(s,()=>({}));assert.equal(s.license.outcome,'timeout');assert.equal(s.time,45);assert.equal(s.license.stamps,1);
 C.reset(s);assert.equal(s.phase,'countdown');assert.equal(s.time,0);assert.equal(s.license.stamps,0);assert.equal(s.license.retries,0);assert.equal(s.license.outcome,null);
});
test('completion and a fresh menu/race leave no exam state, resources or timers in the normal cup',()=>{
 const exam=active();run(exam,s=>drive(C,s));assert.equal(exam.license.outcome,'pass');
 const menu=C.create({laps:2,difficulty:'normal'});assert.equal(menu.phase,'menu');assert.equal(menu.license,undefined);assert.equal(menu.riders.length,6);assert.equal(menu.time,0);assert.deepEqual(menu.finishOrder,[]);
 C.start(menu);for(let i=0;i<300;i++)C.step(menu,{forward:true},1/60);
 assert.equal(menu.phase,'racing');assert.ok(menu.riders[0].speed>9);assert.equal(menu.license,undefined);
});

test('sampled release timing has both successes and failures, without awarding empty passes',()=>{
 const outcomes=[];let minis=0,hits=0;
 for(const hold of [.34,.38,.4,.42,.48,.52]){
  const s=active();const log=run(s,s=>drive(C,s,{hold}));outcomes.push(s.license.outcome);
  minis+=log.events.filter(e=>e.type==='mini').length;hits+=log.events.filter(e=>e.type==='hit').length;
 }
 const wins=outcomes.filter(o=>o==='pass').length;
 assert.ok(wins>0&&wins<outcomes.length,`release timing must have two-sided outcomes: ${outcomes}`);
 assert.ok(minis>=3&&hits>0,'samples must contain both mini releases and rail impacts');
});

test('a genuine mini before the designated bend cannot earn its stamp',()=>{
 const s=active();for(let i=0;i<90;i++)C.step(s,{forward:true},1/60);
 for(let i=0;i<24;i++)C.step(s,{forward:true,left:true,drift:true},1/60);
 C.step(s,{forward:true},1/60);
 assert.ok(s.events.some(e=>e.type==='mini'),'early input sequence must really trigger a mini');
 assert.ok(s.riders[0].progress<C.LICENSE.bends[0].from,'sample must still be outside the bend');
 assert.equal(s.license.mini,false);assert.equal(s.license.stamps,0);
});
