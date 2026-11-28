// Paper, tearing and almanac checks for 手撕日历. Every threshold comes from SPEC.md and is measured on the real sheet simulation.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),A=require('../src/almanac.js');
const CORNER=[0.92,1.1];                       // a thumb on the bottom-right corner, in page units
const pull=(s,to,dur,hold)=>C.drive(s,CORNER,to,dur,hold);

test('spec 1: almanac covers 2026-2027 without gaps and matches known dates',()=>{
  assert.equal(A.days.length,730,'two full years of pages');
  for(let i=1;i<A.days.length;i++)assert.equal(C.parse(A.days[i].d)-C.parse(A.days[i-1].d),864e5,`gap after ${A.days[i-1].d}`);
  const day=ymd=>C.dayModel(A,C.indexOf(A,ymd));
  assert.equal(day('2026-02-17').lunar,'正月初一','2026 Spring Festival');
  assert.equal(day('2027-02-06').lunar,'正月初一','2027 Spring Festival');
  assert.equal(day('2026-11-22').term,'小雪');
  assert.equal(day('2026-12-22').term,'冬至');
  assert.equal(day('2026-02-14').holiday,'班','2026-02-14 is a make-up working Saturday');
  assert.equal(day('2026-02-14').red,false,'a make-up working day is printed black');
  assert.equal(day('2026-10-01').holiday,'休');
  assert.equal(day('2026-10-01').red,true);
  assert.equal(day('2027-10-01').holiday,'','2027 statutory days are not baked until published');
  assert.equal(C.indexOf(A,'2025-06-01'),0,'dates before the range clamp to the first page');
  assert.equal(C.indexOf(A,'2031-01-01'),729,'dates after the range clamp to the last page');
});

test('spec 1b: every page has a saying, festival days get their own, no repeats on neighbouring days',()=>{
  for(let i=0;i<A.days.length;i++){const m=C.dayModel(A,i);assert.ok(m.saying[0]&&m.saying[1],`page ${m.ymd} has no saying`);}
  assert.equal(C.dayModel(A,C.indexOf(A,'2026-12-22')).saying[0],'冬大过年');
  for(let i=1;i<A.days.length;i++){
    const a=C.dayModel(A,i-1).saying[0],b=C.dayModel(A,i).saying[0];
    assert.notEqual(a,b,`${A.days[i].d} repeats yesterday's saying`);
  }
});

test('spec 2: lifting the corner off the stack does not tear',()=>{
  const s=pull(C.createSheet(),[0.75,0.9,0.3],0.6,2);
  assert.equal(s.broken,0,`${s.broken} pins broke while only lifting`);
  assert.ok(C.bounds(s).z1>0.25,'the corner really came off the stack (otherwise this test is empty)');
});

test('spec 3: a hard pull tears the page off within 1.5 s, starting on the pulled side',()=>{
  let at=null;
  C.drive(C.createSheet(),CORNER,[0.85,2.0,0.2],0.6,1.0,1/60,(s,t)=>{if(s.free&&at==null){at=t;assert.ok(s.order[0]>=6,`first break at pin ${s.order[0]}, expected the right half`);}});
  assert.ok(at!=null&&at<=1.5,`page came free at ${at}`);
});

test('spec 4: stop the finger and the tear stops; let go of a half-torn page and it stays hanging',()=>{
  const s=C.createSheet();s.grabAt(...CORNER);let stopped=null,atStop=0;
  for(let t=0;t<3;t+=1/60){
    if(stopped==null){const k=Math.min(1,t/1.2);s.moveTo(0.92+0.02*k,1.1+0.5*k,0.12*k);if(s.broken>=4){stopped=t;atStop=s.broken;}}
    s.step(1/60);
  }
  assert.ok(stopped!=null,'the slow pull never started a tear (empty test)');
  assert.ok(s.broken>=1&&s.broken<=12,`broken ${s.broken}`);
  assert.ok(s.broken-atStop<=1,`tear kept running after the finger stopped: ${atStop} -> ${s.broken}`);
  const b=s.broken;s.release();C.run(s,2);
  assert.equal(s.broken,b,'a released half-torn page tore further under its own weight');
  assert.equal(s.free,false);
});

test('spec 5: paper does not stretch like rubber while it is being torn',()=>{
  const s=pull(C.createSheet(),[0.85,2.0,0.2],0.6,1.0);
  assert.ok(s.free,'page did not come free (empty test)');
  assert.ok(s.maxStrain<=0.08,`structural stretch reached ${(100*s.maxStrain).toFixed(1)}% while attached`);
  assert.ok(s.maxStrainFree<=0.12,`stretch while carrying the free page reached ${(100*s.maxStrainFree).toFixed(1)}%`);
});

test('spec 6: an untorn page let go settles back flat within 1.5 s',()=>{
  const s=pull(C.createSheet(),[0.75,0.9,0.3],0.6,0.3);
  assert.ok(C.bounds(s).z1>0.2,'not lifted (empty test)');
  s.release();C.run(s,1.5);
  assert.ok(C.bounds(s).z1<=0.01,`still ${C.bounds(s).z1.toFixed(3)} off the stack`);
});

test('spec 7: a torn-off page falls out of view and drifts side to side on the way',()=>{
  for(const seed of [1,2,3]){
    const s=C.createSheet();s.seed=seed;pull(s,[0.85,2.0,0.2],0.6,0.6);s.release();
    const y0=C.centroid(s)[1];let flips=0,last=0,px=C.centroid(s)[0];
    C.run(s,3,1/60,s=>{const x=C.centroid(s)[0],v=x-px;px=x;if(Math.abs(v)>2e-4){const g=Math.sign(v);if(last&&g!==last)flips++;last=g;}});
    assert.ok(C.bounds(s).y0>C.CFG.h*2,`seed ${seed}: top edge only at ${C.bounds(s).y0.toFixed(2)}`);
    assert.ok(flips>=2,`seed ${seed}: drifted sideways only ${flips} times`);
    assert.ok(C.centroid(s)[1]>y0);
  }
});
