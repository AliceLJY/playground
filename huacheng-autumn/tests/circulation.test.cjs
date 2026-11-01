const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import(process.env.CORE_UNDER_TEST||'../src/core.js');
const overlap=(a,b)=>a.min.every((v,i)=>v<b.max[i]&&a.max[i]>b.min[i]);
test('R6 — two complete tram round trips at 60 Hz, zero boundary tolerance',async()=>{
 const c=await load();let stops=new Set(),moving=0;
 for(let frame=0;frame<=c.TRAM_PERIOD*2*60;frame++){
  const t=frame/60,tr=c.tramAt(t),objects=c.trafficAt?c.trafficAt(t):[tr.raw];
  for(const b of objects)for(const p of c.boxCorners(b))assert.ok(c.insideBase(p[0],p[2]),`${b.id} leaves base at t=${t}: ${p}`);
  for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++)assert.ok(!overlap(objects[i],objects[j]),`${objects[i].id}/${objects[j].id} intersect at ${t}`);
  if(tr.stopped)stops.add(Math.sign(tr.x));else moving++;
 }
 assert.equal(stops.size,2,'both endpoint dwell states must occur');assert.ok(moving>3000);
});
test('R6 — real traffic paths clear bridge solids and flower arch; smooth tram reversal',async()=>{
 const c=await load(),l=c.makeLayout();assert.ok(c.trafficAt,'all moving objects must use the shared simulation');
 const solids=[...l.piers,...l.steps,...l.surfaces.filter(s=>s.id==='bridge'),...l.archObstacles];
 let maxAcceleration=0,previous=c.tramAt(-1/60).x,lastVelocity=0;
 for(let i=0;i<=c.TRAM_PERIOD*2*60;i++){
  const t=i/60,tr=c.tramAt(t),v=(tr.x-previous)*60;maxAcceleration=Math.max(maxAcceleration,Math.abs(v-lastVelocity)*60);previous=tr.x;lastVelocity=v;
  for(const b of c.trafficAt(t))for(const solid of solids)assert.ok(!overlap(b,solid),`${b.id} intersects ${solid.id} at ${t}`);
 }
 assert.ok(maxAcceleration<3,`tram acceleration ${maxAcceleration} m/s²`);
 for(const t of [0,30])for(let i=0;i<16*60;i++)assert.equal(c.tramAt(t+i/60).x,c.tramAt(t).x,'16 s station dwell');
});

test('R6 — automatic route tracks the tram, dense clearance over two round trips',async()=>{
 const c=await load();for(const seed of [c.SEED,7,131]){const l=c.makeLayout(seed);let tracking=0,maxStep=0,prev=c.routeAt(0,0).pos;
 for(let frame=1;frame<=c.TRAM_PERIOD*2*60;frame++){
  const t=frame/60,p=c.routeAt(t/c.LOOP_S,t);maxStep=Math.max(maxStep,c.dist(prev,p.pos));prev=p.pos;
  for(const b of [...l.obstacles,...c.trafficAt(t)])assert.ok(c.distanceBox(p.pos,b)>=2,`${b.id} camera clearance at ${t}: ${c.distanceBox(p.pos,b)}`);
  if(p.tracking>1-1e-12){tracking++;assert.ok(Math.abs(p.pos[0]-c.tramAt(t).x-12.7)<1e-6);}
 }
 assert.ok(tracking>=250,`actual fully tracking frames: ${tracking}`);assert.ok(maxStep<.2,`tracking step ${maxStep}`);
 }
});

test('R6 — manual return predicts the moving tracking shot, no first-auto-frame jump',async()=>{
 const c=await load();let worst=0;
 for(const u of [.26,.29,.32,.35])for(const start of [0,10,15,18,21,30,45,60]){
  const r=c.createRig({u});r.update(0,start);r.grab();r.drag(.02,.02);let prev=r.pos.slice();
  for(let i=1;i<600;i++){const p=r.update(1/60,start+i/60).pos;worst=Math.max(worst,c.dist(prev,p));prev=p;}
 }
 assert.ok(worst<.3,`return / first auto frame ${worst} m`);
});
