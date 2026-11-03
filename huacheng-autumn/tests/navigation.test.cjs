const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import(process.env.CORE_UNDER_TEST||'../src/core.js');
const destinations=['bridge','arch','pagoda'];

test('F4 — named destinations travel smoothly on the existing route, then hold while traffic runs',async()=>{
 const c=await load(),l=c.makeLayout();let samples=0,moving=0;
 for(const u of [0,...destinations.map(name=>c.VIEWS[name]),.95])for(const name of destinations){
  const r=c.createRig({u}),start=r.pos.slice();
  assert.equal(typeof r.goTo,'function','ordinary visitors need a navigation action independent of setView');
  r.goTo(name);assert.deepEqual(r.pos,start,'selection must not teleport');assert.equal(r.auto,false);
  let previous=start,previousLook=r.look.slice(),elapsed=0;
  while(r.mode!=='manual'&&elapsed<60){
   const p=r.update(1/60);elapsed+=1/60;samples++;
   assert.ok(c.dist(p.pos,previous)<.3,'navigation must stay below 0.3 m per 60 Hz step');
   assert.ok(c.dist(p.target,previousLook)<2,'look target must stay continuous along the existing route');
   for(const b of [...l.obstacles,...c.trafficAt(r.time)])assert.ok(c.distanceBox(p.pos,b)>=2,`navigation to ${name} intersects ${b.id}`);
   previous=p.pos;previousLook=p.target;
  }
  const target=c.pathAt(c.VIEWS[name]);
  assert.equal(r.mode,'manual','destination must be reached within 60 s');
  assert.ok(c.dist(r.pos,target.pos)<1e-6);assert.ok(c.dist(r.look,target.target)<1e-6);
  const stopped=r.pos.slice(),time=r.time;
  for(let i=0;i<3600;i++){r.update(1/60);assert.deepEqual(r.pos,stopped);if(!c.tramAt(r.time).stopped)moving++;}
  assert.ok(r.time>time+59,'holding the camera must not freeze scene time');
  r.setAuto(true);r.update(1/60);assert.equal(r.mode,'return','explicit resume starts returning immediately');for(let i=0;i<240;i++)r.update(1/60);
  assert.equal(r.mode,'auto');assert.ok(c.dist(r.pos,stopped)>1,'explicit resume must move again');
 }
 assert.ok(samples>1000&&moving>1000,'exercise travel and moving-tram states');
});

test('F4 — destination travel can be redirected, interrupted, held and reset without a jump',async()=>{
 const c=await load(),r=c.createRig();
 assert.equal(typeof r.goTo,'function');
 for(const name of destinations){const before=r.pos.slice();r.goTo(name);assert.deepEqual(r.pos,before);for(let i=0;i<80;i++)r.update(1/60);}
 const before=r.pos.slice();r.grab();assert.deepEqual(r.pos,before);r.drag(.1,.03);r.zoom(.9);
 const held=r.pos.slice();for(let i=0;i<600;i++)r.update(1/60);assert.deepEqual(r.pos,held);assert.equal(r.auto,false);
 r.goTo('bridge');r.update(.1);r.setAuto(false);const paused=r.pos.slice();for(let i=0;i<600;i++)r.update(1/60);assert.deepEqual(r.pos,paused);
 r.goTo('arch');r.update(.1);r.reset();assert.equal(r.mode,'auto');assert.equal(r.u,0);
 const snapshot=JSON.stringify(r);r.goTo('not-a-view');assert.equal(JSON.stringify(r),snapshot,'invalid destinations leave the rig alone');
});
