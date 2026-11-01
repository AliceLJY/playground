const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import(process.env.CORE_UNDER_TEST||'../src/core.js');
const inside=b=>b.front&&b.x0>=0&&b.x1<=1&&b.y0>=0&&b.y1<=1;
test('SPEC 1 — 60 s closed camera route, every 60 Hz step < 0.20 m',async()=>{
 const c=await load();assert.ok(c.dist(c.pathAt(0).pos,c.pathAt(1).pos)<1e-9);assert.ok(c.dist(c.pathAt(0).target,c.pathAt(1).target)<1e-9);
 let max=0;for(let i=0;i<3600;i++)max=Math.max(max,c.dist(c.pathAt(i/3600).pos,c.pathAt((i+1)/3600).pos));assert.ok(max<0.20,`max step ${max} m, route ${c.PATH_LENGTH} m`);
});
test('SPEC 2 — 3600 samples, generated bridge / stairs / tram swept volume / crowns clearance ≥ 2 m',async()=>{
 const c=await load();for(const seed of [c.SEED,7,131]) {const l=c.makeLayout(seed);for(let i=0;i<3600;i++){const p=c.pathAt(i/3600).pos;assert.ok(p[1]>=1.5);for(const b of l.obstacles) assert.ok(c.distanceBox(p,b)>=2,`seed ${seed} u=${i/3600}: ${b.id}, ${c.distanceBox(p,b)} m`);}}
});
test('SPEC 3 — four beats, bridge +2–4 m, pagoda 8–16 m, highest pose frames board and Canton Tower',async()=>{
 const c=await load(),l=c.makeLayout();let low=0,near=Infinity,high=null;
 for(let i=0;i<3600;i++){const p=c.pathAt(i/3600);if(p.pos[1]>=c.BRIDGE.top+2&&p.pos[1]<=c.BRIDGE.top+4&&c.distanceBox(p.pos,l.surfaces.find(x=>x.id==='bridge'))<7)low++;near=Math.min(near,c.distanceBox(p.pos,l.pagodaBox));if(!high||p.pos[1]>high.pos[1])high=p;}
 assert.ok(low>=30,`bridge low passage ${low} frames`);assert.ok(near>=8&&near<=16,`closest pagoda ${near}`);
 for(const a of [16/9,1440/900,390/664])for(const b of [l.baseBox,l.cantonBox]){const q=c.screenBox(b,high.pos,high.target,a);assert.ok(inside(q),`${b.id} at highest pose, aspect ${a}: ${JSON.stringify(q)}`);}
});
test('SPEC 4 — actual leaf / five-petal flower / bract descriptors, desktop and mobile, three seeds',async()=>{
 const c=await load();for(const seed of [c.SEED,7,131])for(const mobile of [false,true]){const l=c.makeLayout(seed,mobile);for(const t of l.trees){assert.ok(t.leaves.every(p=>p.p.every(Number.isFinite)));if(t.kind!=='silk')assert.ok(t.leaves.length>=(mobile?150:300));else assert.ok(t.flowers.length>=200);assert.ok(new Set(t.leaves.map(p=>p.p.join(','))).size===t.leaves.length,'distinct individual leaves');}
 assert.ok(l.bracts.length>=4000);for(let i=0;i<4;i++)assert.ok(l.bracts.filter(b=>b.color===i).length/l.bracts.length>=0.1);}
});
test('SPEC 5 — both rails covered at 0.5 m, real bract bottoms have varied depth σ ≥ 0.15 m',async()=>{
 const c=await load();for(const mobile of [false,true]){const l=c.makeLayout(c.SEED,mobile),ds=[];for(const side of [-1,1]){let covered=0;for(let j=0;j<35;j++){const ci=l.clusters.findIndex(q=>q.side===side&&q.segment===j),cl=l.clusters[ci],bb=l.bracts.filter(q=>q.cluster===ci);if(bb.some(b=>Math.abs(b.p[2]-(c.BRIDGE.z0+j*0.5+0.25))<0.25))covered++;ds.push(cl.center[1]-Math.min(...bb.map(b=>b.p[1])));}assert.ok(covered/35>=0.85,`coverage ${covered}/35`);}
 const mean=ds.reduce((a,b)=>a+b)/ds.length,sd=Math.sqrt(ds.reduce((a,b)=>a+(b-mean)**2,0)/ds.length);assert.ok(sd>=0.15,`depth SD ${sd}`);}
});
test('SPEC 6 — generated surface tops (including stair treads) have no 0–0.05 m gap',async()=>{
 const c=await load(),l=c.makeLayout(),ss=[...l.surfaces,...l.steps,l.cantonBase,l.waterSurface];for(let i=0;i<ss.length;i++)for(let j=i+1;j<ss.length;j++){const d=Math.abs(ss[i].max[1]-ss[j].max[1]);assert.ok(d<1e-8||d>=0.05-1e-8,`${ss[i].id} ${ss[i].max[1]} / ${ss[j].id} ${ss[j].max[1]}`);}
});
test('SPEC 8 — grab keeps exact pose; 4.5 s idle + 3 s return, max step < 0.3 m',async()=>{
 const c=await load();for(const u of [0,0.18,0.27,0.29,0.32,0.35,0.42,0.68,0.9])for(const drag of [-3,-0.5,0,0.5,3])for(const zoom of [.5,1,2]){const r=c.createRig({u});const p=r.update(1/60).pos;r.grab();assert.ok(c.dist(r.update(1/60).pos,p)<0.08);r.drag(drag,0.05);r.zoom(zoom);let prev=r.pos.slice(),max=0;
 for(let i=0;i<451;i++){const q=r.update(1/60).pos;max=Math.max(max,c.dist(prev,q));prev=q;if(i<268)assert.equal(r.mode,'manual');}
 assert.equal(r.mode,'auto',`u ${u} not returned by 7.5 s`);assert.ok(max<0.3,`u ${u}, ${drag}: max return step ${max}`);}
});
test('Structure — nine tapering octagons / 72 arches; 24 tilted columns / 46 rings / waist / braces',async()=>{
 const c=await load(),l=c.makeLayout(),s=c.cantonStructure();assert.equal(l.levels.length,9);assert.ok(l.levels.every(q=>q.windows.length===8));for(let i=1;i<9;i++)assert.ok(l.levels[i].radius<l.levels[i-1].radius);
 for(const col of s.columns){assert.ok(Math.abs(col.a[1]-l.cantonBase.max[1])<1e-8);assert.ok(col.a[0]>=l.cantonBase.min[0]&&col.a[0]<=l.cantonBase.max[0]&&col.a[2]>=l.cantonBase.min[2]&&col.a[2]<=l.cantonBase.max[2],'Canton Tower foot must stand on its distant bank');}
 assert.equal(s.columns.length,24);assert.equal(s.rings.length,46);assert.ok(s.braces.length>300);const radius=p=>Math.hypot(p[0]-c.CANTON.x,p[2]-c.CANTON.z);for(let i=0;i<24;i++){const a=i*Math.PI/12;assert.ok(radius(c.cantonPoint(a,0.5))<radius(c.cantonPoint(a,0))*0.65);assert.ok(c.dist(s.columns[i].a,s.columns[i].b)>c.CANTON.height);}
});
test('Input and hour — held pointer never returns; auto off stays; generated light values continuous',async()=>{
 const c=await load(),r=c.createRig();r.grab();r.held=true;for(let i=0;i<600;i++)r.update(1/60);assert.equal(r.mode,'manual');r.held=false;r.setAuto(false);const p=r.pos.slice();for(let i=0;i<600;i++)r.update(1/60);assert.deepEqual(r.pos,p);
 let prev=c.skyAt(0);for(let i=1;i<=1000;i++){const s=c.skyAt(i/1000);for(const k of ['low','mid','top'])assert.ok(c.dist(s[k],prev[k])<0.02);assert.ok(s.lights>=prev.lights);prev=s;}assert.ok(c.skyAt(1).mid[2]>c.skyAt(1).mid[0]);
});

test('R2 foliage — real generated palm pinnae are paired, unique, and frond tips droop',async()=>{
 const c=await load();for(const seed of [c.SEED,7,131]){
  const palms=c.makeLayout(seed).trees.filter(t=>t.kind==='palm');assert.equal(palms.length,3);
  for(const t of palms){assert.equal(t.branches.length,120);assert.equal(t.leaves.length,560);
   for(let j=0;j<10;j++){const ribs=t.branches.slice(j*12,(j+1)*12);assert.ok(ribs[11].b[1]<t.root[1]+t.h-.8);assert.ok(Math.max(...ribs.map(r=>r.b[1]))>t.root[1]+t.h+.2);}
   assert.ok(t.leaves.every(l=>l.scale[0]<.07),'pinnae must be narrow, not broad paper fans');
  }
 }
});

test('R3 windows — actual generated upper floors stay sparse, night adds lights, no floor is all lit',async()=>{
 const c=await load(),l=c.makeLayout(),count=h=>l.levels.map(v=>v.windows.filter(w=>h>=w.onAt).length),d=count(.55),n=count(1);
 assert.ok(d.slice(0,3).reduce((a,b)=>a+b,0)>d.slice(6).reduce((a,b)=>a+b,0));
 assert.ok(d.slice(6).every(v=>v<=2)&&n.slice(6).every(v=>v<=2));
 assert.ok(n.every((v,i)=>v>=d[i]&&v<8));assert.ok(n.reduce((a,b)=>a+b,0)>d.reduce((a,b)=>a+b,0));
});


test('R4 rail scale — generated deck posts spaced 1.2m, handrail 5cm',async()=>{
 const c=await load(),l=c.makeLayout();const rail=l.rails.filter(r=>Math.abs(r.a[0]-r.b[0])<1e-9&&Math.abs(r.a[2]-r.b[2])<1e-9&&Math.abs(r.a[0]-(c.BRIDGE.x+c.BRIDGE.width/2-.06))<1e-6).sort((a,b)=>a.a[2]-b.a[2]);
 assert.ok(rail.length>=14);for(let i=1;i<rail.length;i++)assert.ok(Math.abs(rail[i].a[2]-rail[i-1].a[2]-1.2)<1e-6);
 const handrails=l.rails.filter(r=>r.a[1]===6.6&&r.b[1]===6.6);assert.ok(handrails.length===2&&handrails.every(r=>Math.abs(r.width-.05)<1e-8));
});

test('R4 foliage — small leaves with outward crown normals on every generated broadleaf tree',async()=>{
 const c=await load();for(const seed of [c.SEED,7,131])for(const t of c.makeLayout(seed).trees.filter(t=>t.kind!=='palm')){
 assert.ok(t.leaves.every(l=>l.normal?.length===3&&Math.hypot(...l.normal)>0&&l.scale[0]<=.15&&l.scale[1]<=.23));
 const normals=t.leaves.map(l=>l.normal);assert.ok(normals.some(n=>n[1]>0)&&normals.some(n=>n[1]<0));
 }
});


test('R5 exterior curtains — real bracts leave walkway/stairs/piers clear, 1–2 m varied drops',async()=>{
 const c=await load();for(const seed of [c.SEED,7,131])for(const mobile of [false,true]){
  const l=c.makeLayout(seed,mobile);
  assert.ok(l.clusters.every(q=>q.segment!==null||q.stair),'piers must not be wrapped in flowers');
  assert.ok(l.clusters.every(q=>q.depth>=.8&&q.depth<=2),'curtain drops must stay in 1–2 m');
  assert.ok(l.bracts.every(b=>{const cl=l.clusters[b.cluster];return cl.stair?Math.abs(b.p[2]-cl.center[2])>=.04:Math.abs(b.p[0]-c.BRIDGE.x)>=c.BRIDGE.width/2&&b.p[1]<6.55;}),'bracts must hang outside rails, below clear handrail');
 }
});
test('R5 fine flowers — generated bougainvillea and silk-floss petals are 60% of R4',async()=>{
 const c=await load();for(const seed of [c.SEED,7,131])for(const mobile of [false,true]){
  const l=c.makeLayout(seed,mobile);assert.ok(l.bracts.every(b=>b.scale>=.072&&b.scale<=.114));
  const fs=l.trees.flatMap(t=>t.flowers);assert.ok(fs.length>=800&&fs.every(f=>f.size>=.054&&f.size<=.084));
 }
});
