const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import(process.env.CORE_UNDER_TEST||'../src/core.js');
function visitor(c,time=0){
 const rig=c.createRig();rig.update(0,time);
 let state=c.createJournal(),hour=0,frames=0,travelling=0;
 const scene=()=>({time:rig.time,hour,frozen:false,mode:rig.mode,auto:rig.auto,destination:rig.destination,pos:rig.pos,look:rig.look});
 const action=intent=>state=c.journalStep(state,intent,scene());
 const tick=()=>{rig.update(1/60);frames++;if(rig.mode==='travel')travelling++;action('tick');};
 const until=fn=>{for(let i=0;!fn()&&i<7200;i++)tick();assert.ok(fn(),'real simulation must reach requested state within 120 s');};
 return {rig,scene,action,tick,until,get state(){return state;},get frames(){return frames;},get travelling(){return travelling;},
  start(){rig.setAuto(false);action('start');},
  select(name){rig.goTo(name);action('tick');},
  visit(name){this.select(name);until(()=>rig.mode==='manual');assert.equal(c.journalPlace(scene()),name);},
  hour(h,input=true){hour=h;action(input?'hour':'tick');},
  exit(){action('exit');rig.setAuto(true);until(()=>rig.mode==='auto');}
 };
}

test('NG4 — both first-place choices finish through real navigation, tram and hour operations',async()=>{
 const c=await load();let captured=0,arrivals=0,travelFrames=0;const directions=new Set();
 for(const time of [0,12,29,47])for(const first of ['bridge','pagoda']){
  const v=visitor(c,time);v.start();assert.equal(v.state.stamps.length,0);
  v.select(first);assert.equal(v.state.stamps.length,0,'selection is not arrival');
  v.until(()=>v.rig.mode==='manual');assert.deepEqual(v.state.stamps,[first]);arrivals++;
  if(first==='pagoda'){v.visit('bridge');arrivals++;}
  v.until(()=>!!c.journalWindow(v.rig.time));const actual=c.tramAt(v.rig.time);
  assert.equal(actual.stopped,false,'capture samples must contain a moving tram');
  v.action('capture');assert.ok(v.state.moment);captured++;directions.add(v.state.moment.direction);
  if(first==='bridge'){v.visit('pagoda');arrivals++;}
  assert.deepEqual(v.state.stamps,first==='bridge'?['bridge','pagoda']:['pagoda','bridge']);
  assert.equal(v.state.phase,'night');v.hour(1);assert.equal(v.state.phase,'night','night input at wrong viewpoint cannot finish');
  v.visit('arch');assert.equal(v.state.phase,'night','pre-existing night cannot finish');
  v.hour(.94);assert.equal(v.state.phase,'night');v.hour(.96);assert.equal(v.state.phase,'done');
  travelFrames+=v.travelling;
  v.exit();assert.deepEqual(v.state,c.createJournal());assert.equal(v.rig.destination,null);assert.equal(v.rig.auto,true);
  const from=v.rig.pos.slice();for(let i=0;i<120;i++)v.tick();assert.ok(c.dist(from,v.rig.pos)>1,'ordinary tour resumes');
  v.start();assert.deepEqual(v.state.stamps,[]);assert.equal(v.state.moment,null);assert.equal(v.state.missed,0);
 }
 assert.equal(captured,8);assert.equal(arrivals,16);assert.equal(directions.size,2,'both real directions captured');assert.ok(travelFrames>1000);
});

test('NG4 — four-second windows straddle actual bridge crossings in both directions',async()=>{
 const c=await load(),runs=[];let run=null,crossings=0,previous=c.tramAt(0).x;
 for(let i=0;i<120*60;i++){
  const time=i/60,w=c.journalWindow(time),tram=c.tramAt(time);
  if((previous-c.BRIDGE.x)*(tram.x-c.BRIDGE.x)<0){crossings++;assert.ok(w,'true physical crossing must fall within the window');}
  previous=tram.x;
  if(w){if(!run){run={id:w.id,seconds:0};runs.push(run);}run.seconds+=1/60;assert.equal(tram.stopped,false);}
  else run=null;
 }
 assert.equal(crossings,4);assert.equal(runs.length,4);assert.equal(new Set(runs.map(r=>r.id)).size,4);
 for(const r of runs)assert.ok(Math.abs(r.seconds-4)<=.04,`window ${r.id}: ${r.seconds} seconds`);
 assert.equal(c.journalWindow(NaN),null);assert.equal(c.journalWindow(-1),null);
});

test('NG4 — miss a real train, retain stamps and catch the next one without losing',async()=>{
 const c=await load();let missed=0,retried=0;
 for(const start of [0,17,41]){
  const v=visitor(c,start);v.start();v.visit('pagoda');v.visit('bridge');
  v.until(()=>!!c.journalWindow(v.rig.time));const id=c.journalWindow(v.rig.time).id;
  v.until(()=>!c.journalWindow(v.rig.time));assert.equal(v.state.missed,1);missed++;
  assert.deepEqual(v.state.stamps,['pagoda','bridge']);assert.equal(v.state.moment,null);assert.equal(v.state.phase,'visiting');
  assert.match(c.journalPrompt(v.state,v.scene()),/下一班/);
  v.action('capture');assert.equal(v.state.moment,null,'late capture must not succeed');
  for(let i=0;i<30;i++)v.tick();assert.equal(v.state.missed,1,'one reminder per missed train');
  v.until(()=>!!c.journalWindow(v.rig.time));assert.notEqual(c.journalWindow(v.rig.time).id,id);
  v.action('capture');assert.ok(v.state.moment);assert.equal(v.state.phase,'night');retried++;
 }
 assert.equal(missed,3,'actual missed-window transitions occurred');assert.equal(retried,3);
});

test('NG4 — wrong place, travel, frozen time and moved camera cannot grant a moment or stamp',async()=>{
 const c=await load(),v=visitor(c);v.start();v.select('bridge');
 v.action('capture');assert.equal(v.state.moment,null);assert.equal(v.state.stamps.length,0);
 v.rig.grab();for(let i=0;i<600;i++)v.tick();assert.equal(v.state.stamps.length,0,'interrupted travel grants no stamp');
 v.visit('bridge');v.until(()=>!!c.journalWindow(v.rig.time));
 const scene=v.scene(),state=v.state;
 for(const observation of [{...scene,frozen:true},{...scene,auto:true},{...scene,mode:'travel'},{...scene,pos:scene.pos.map(n=>n+1)},{...scene,look:scene.look.map(n=>n+1)}]){
  const next=c.journalStep(state,'capture',observation);assert.equal(next.moment,null);assert.deepEqual(next.stamps,state.stamps);
 }
 v.rig.grab();v.rig.drag(.1,.02);v.action('capture');assert.equal(v.state.moment,null);
 v.visit('bridge');assert.deepEqual(v.state.stamps,['bridge'],'revisit never duplicates a stamp');
 v.visit('pagoda');v.until(()=>!!c.journalWindow(v.rig.time));v.action('capture');assert.equal(v.state.moment,null,'right time, wrong place');
});

test('NG4 — exit and reset clear partial state; reducer leaves ordinary scene untouched',async()=>{
 const c=await load(),v=visitor(c,20),scene=v.scene(),before=structuredClone(scene);
 for(const intent of ['tick','capture','hour'])assert.deepEqual(c.journalStep(v.state,intent,scene),c.createJournal());
 assert.deepEqual(scene,before);
 v.start();v.visit('bridge');v.until(()=>!!c.journalWindow(v.rig.time));v.until(()=>!c.journalWindow(v.rig.time));
 assert.ok(v.state.missed>0);v.exit();assert.deepEqual(v.state,c.createJournal());
 v.start();v.visit('pagoda');v.rig.reset();v.action('exit');assert.deepEqual(v.state,c.createJournal());assert.equal(v.rig.mode,'auto');
 v.start();assert.equal(v.state.stamps.length,0);v.hour(1);assert.equal(v.state.phase,'visiting');
});
