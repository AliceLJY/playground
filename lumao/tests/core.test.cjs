// Fur, hand and mood checks for 撸猫撸了一手毛. Every threshold comes from SPEC.md and is measured on the real simulation.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js');
const SP=0.28;                                    // the spine, in body units (map is 0.56 wide)
const DOWN=[[SP,0.15],[SP,0.9]],UP=[[SP,0.9],[SP,0.15]];   // head→tail is with the grain; a full stroke down the back
const BACK=[SP-0.05,0.3,SP+0.05,0.75];            // the stroked strip, away from the stroke ends
const down=(s,dur)=>C.petLine(s,DOWN[0],DOWN[1],dur||0.35);
const up=(s,dur)=>C.petLine(s,UP[0],UP[1],dur||0.35);

test('spec 1: stroking with the grain combs the fur flat, along its grain, and makes it shine',()=>{
  const s=C.createSession(),before=C.regionStats(s.fur,...BACK);
  for(let i=0;i<20;i++){down(s);C.rest(s,0.1);}
  const a=C.regionStats(s.fur,...BACK);
  assert.ok(a.mess<0.15,`messiness ${a.mess.toFixed(3)} after 20 strokes, want < 0.15`);
  assert.ok(a.align>0.9,`alignment with the grain ${a.align.toFixed(3)}, want > 0.9`);
  assert.ok(a.shine>before.shine+0.25&&a.shine>0.8,`shine ${before.shine.toFixed(3)} -> ${a.shine.toFixed(3)}`);
  assert.ok(s.log.some(r=>r.kind==='with')&&!s.log.some(r=>r.kind==='against'),'head-to-tail strokes read as with the grain');
});

test('spec 2: stroking against the grain makes the fur stand up, and she looks back within 0.5 s of the second stroke',()=>{
  const s=C.createSession();let second=null,looked=null;
  for(let i=0;i<5;i++){up(s);if(i===1)second=s.t;C.rest(s,0.15);
    if(looked==null){const e=s.cat.events.find(e=>e.type==='look');if(e)looked=e.t;}}
  const a=C.regionStats(s.fur,...BACK);
  assert.ok(a.mess>0.6,`messiness ${a.mess.toFixed(3)} after 5 strokes against, want > 0.6`);
  assert.ok(looked!=null,'she never looked back');
  const first=s.log.find(r=>r.kind==='against').t;
  assert.ok(looked>first+0.2,'she should not turn on the very first touch');
  assert.ok(looked<=second+0.5,`looked back at ${looked.toFixed(2)} s, second stroke ended ${second.toFixed(2)} s`);
});

test('spec 3: a stroke only touches fur within the brush radius of its path',()=>{
  const s=C.createSession(),M0=Float32Array.from(s.fur.M),D0=Float32Array.from(s.fur.D),L0=Float32Array.from(s.fur.L);
  const f=s.fur;C.stroke(f,SP,0.3,SP,0.6);
  let changed=0,far=0;
  for(let k=0;k<f.n;k++){
    const moved=f.M[k]!==M0[k]||f.L[k]!==L0[k]||f.D[k*2]!==D0[k*2]||f.D[k*2+1]!==D0[k*2+1];if(!moved)continue;changed++;
    const[x,y]=C.texel(f,k);const cy=Math.max(0.3,Math.min(0.6,y)),d=Math.hypot(x-SP,y-cy);
    if(d>f.o.R+1e-9)far++;
  }
  assert.ok(changed>50,'the stroke changed something (otherwise this test is empty)');
  assert.equal(far,0,`${far} texels farther than R from the path changed`);
});

test('spec 4: a still finger writes nothing, and the spring under it dies out within 0.6 s',()=>{
  const s=C.createSession();s.down(SP,0.3);
  for(let t=0;t<0.3;t+=1/60){s.move(SP,0.3+t);s.step(1/60);}
  assert.ok(C.liveMax(s.fur)>0.8,'the finger really bent the fur (otherwise this test is empty)');
  const M0=Float32Array.from(s.fur.M),L0=Float32Array.from(s.fur.L),hairs=s.fur.hand.hairs;
  const before=s.log.length;let at06=null;
  for(let t=0;t<2;t+=1/60){s.move(s.finger.x,s.finger.y);   // finger held, not moving
    // only relaxation may touch the map: put the relaxed values aside and compare the rest
    s.step(1/60);if(at06==null&&t>=0.6)at06=C.liveMax(s.fur);}
  assert.equal(s.log.length,before,'a still finger produced strokes');
  assert.equal(s.fur.hand.hairs,hairs,'a still finger picked up hair');
  for(let k=0;k<s.fur.n;k++)assert.ok(s.fur.L[k]<=L0[k]+1e-9,'loose hair grew under a still finger');
  let drift=0;for(let k=0;k<s.fur.n;k++)drift=Math.max(drift,Math.abs(s.fur.M[k]-M0[k]));
  assert.ok(drift<0.02,`messiness drifted ${drift.toFixed(4)} in 2 s with the finger still (only slow settling allowed)`);
  assert.ok(at06<0.05,`spring still at ${at06.toFixed(3)} 0.6 s after the finger stopped`);
});

test('spec 5: every hair on the hand came off the cat, and a clap clears the hand',()=>{
  const s=C.createSession(),L0=C.looseTotal(s.fur);
  for(let i=0;i<6;i++){down(s);up(s);C.rest(s,0.1);}
  const f=s.fur,taken=L0+f.lifted-C.looseTotal(f);
  assert.ok(Math.abs(taken-f.picked)<1e-3,`map lost ${taken.toFixed(4)} loose, hand side recorded ${f.picked.toFixed(4)}`);
  assert.equal(f.hand.total,Math.floor(f.picked*f.o.hairsPerUnit+1e-9),'hairs on the hand = loose fur taken × hairs per unit');
  assert.ok(f.hand.hairs>=25&&f.hand.hairs<=120,`${f.hand.hairs} hairs after 12 strokes (want about 5 per stroke: a hand that gets furry over a minute, not in one swipe)`);
  const n=C.clap(f);assert.equal(n,f.hand.total);assert.equal(f.hand.hairs,0);
  assert.equal(C.handLevel(f.hand),0);
});

test('spec 6: she always warns for at least 1.5 s before a bite, a 3 s pause calms her, and bites have a cooldown',()=>{
  // keep petting with the grain without a break until she bites
  const s=C.createSession();let warnAt=null,biteAt=null;
  for(let i=0;i<200&&biteAt==null;i++){down(s,0.3);s.step(0.05);
    for(const e of s.cat.events){if(e.type==='warn'&&warnAt==null)warnAt=e.t;if(e.type==='bite'&&biteAt==null)biteAt=e.t;}}
  assert.ok(biteAt!=null,'non-stop petting never got a bite (the over-petting line is unreachable)');
  assert.ok(biteAt>8,`bit after only ${biteAt.toFixed(1)} s of petting; she should enjoy it a while first`);
  const lastWarn=s.cat.events.filter(e=>e.type==='warn'&&e.t<=biteAt).pop();
  assert.ok(biteAt-lastWarn.t>=1.5,`warning was up ${(biteAt-lastWarn.t).toFixed(2)} s before the bite`);
  // a bite locks the hand, then she licks and calms down; a second bite cannot follow right away
  assert.ok(s.cat.locked>0,'the hand is not locked right after the bite');
  const tB=s.t;let again=null;
  for(let i=0;i<20;i++){down(s,0.3);s.step(0.05);const e=s.cat.events.filter(e=>e.type==='bite');if(e.length>1){again=e[1].t;break;}}
  assert.ok(again==null||again-biteAt>=s.cat.o.biteDur+s.cat.o.lickDur+s.cat.o.biteCool,`second bite ${again&&(again-biteAt).toFixed(2)} s after the first`);
  // a fresh cat: pet into the warning, stop for 3 s, resume: no bite on resuming
  const q=C.createSession();
  for(let i=0;i<200&&q.cat.state!=='warn';i++){down(q,0.3);q.step(0.05);}
  assert.equal(q.cat.state,'warn','never reached the warning (empty test)');
  C.rest(q,3);
  const bites=q.cat.bites;for(let i=0;i<3;i++){down(q,0.3);q.step(0.05);}
  assert.ok(q.cat.bites===bites,'bit right after a 3 s pause during the warning');
  void tB;
});

test('spec 6b: reckless petting (fast, against the grain, non-stop) still gets the full warning before the bite',()=>{
  // the over-petting meter climbs fastest this way, so this is where a missing warning guard would show
  for(const seed of [1,2,3]){
    const s=C.createSession({seed});let biteAt=null;
    for(let i=0;i<300&&biteAt==null;i++){C.petLine(s,i%2?DOWN[0]:UP[0],i%2?DOWN[1]:UP[1],0.18);s.step(0.02);
      const e=s.cat.events.find(e=>e.type==='bite');if(e)biteAt=e.t;}
    assert.ok(biteAt!=null,`seed ${seed}: reckless petting never got bitten`);
    const lastWarn=s.cat.events.filter(e=>e.type==='warn'&&e.t<=biteAt).pop();
    assert.ok(lastWarn,`seed ${seed}: bitten without any warning`);
    assert.ok(biteAt-lastWarn.t>=1.5,`seed ${seed}: warning up only ${(biteAt-lastWarn.t).toFixed(2)} s before the bite`);
    assert.ok(biteAt-lastWarn.t<4,`seed ${seed}: warning dragged on ${(biteAt-lastWarn.t).toFixed(2)} s (reckless petting should bite soon after)`);
  }
});

test('spec 7: eight strokes with the grain in six seconds make her happy (eyes shut, purring)',()=>{
  const s=C.createSession();
  for(let i=0;i<8;i++){down(s,0.4);C.rest(s,0.35);}
  assert.ok(s.t<=6.2,`took ${s.t.toFixed(2)} s`);
  assert.equal(s.cat.state,'happy',`state ${s.cat.state}, content ${s.cat.content.toFixed(2)}`);
  // and not before: two strokes alone do not do it
  const q=C.createSession();for(let i=0;i<2;i++){down(q,0.4);C.rest(q,0.35);}
  assert.notEqual(q.cat.state,'happy','two strokes were enough (the threshold is too low)');
});

test('spec 7c: slow, long strokes (2 s each) make her happy too, within ten strokes',()=>{
  const s=C.createSession();let n=0;
  for(;n<10&&s.cat.state!=='happy';n++){down(s,2.0);C.rest(s,0.4);}
  assert.equal(s.cat.state,'happy',`not happy after ${n} slow strokes, content ${s.cat.content.toFixed(2)}`);
  // and leaving her alone for a while lets it fade
  C.rest(s,30);assert.notEqual(s.cat.state,'happy','still purring 30 s after the last stroke');
});

test('spec 7b: a bitten hand flinches: strokes during the lock write nothing',()=>{
  const s=C.createSession();
  for(let i=0;i<200&&s.cat.state!=='bite';i++){down(s,0.3);s.step(0.05);}
  assert.equal(s.cat.state,'bite','never got bitten (empty test)');
  const M0=Float32Array.from(s.fur.M),n=s.log.length;
  s.down(SP,0.3);s.move(SP,0.4);s.move(SP,0.5);s.up();
  assert.equal(s.log.length,n,'a stroke during the bite lock was recorded');
  for(let k=0;k<s.fur.n;k++)assert.equal(s.fur.M[k],M0[k]);
});

test('spec 8: one stroke step costs under 0.5 ms on the full map',()=>{
  const f=C.createFur();const t0=process.hrtime.bigint();
  for(let i=0;i<600;i++){const y=0.2+0.5*((i%60)/60);C.stroke(f,SP+0.03*Math.sin(i),y,SP+0.03*Math.sin(i+1),y+0.0083);}
  const ms=Number(process.hrtime.bigint()-t0)/1e6/600;
  assert.ok(ms<0.5,`${ms.toFixed(3)} ms per stroke step`);
  const t1=process.hrtime.bigint();for(let i=0;i<120;i++)C.relax(f,1/60);
  const rm=Number(process.hrtime.bigint()-t1)/1e6/120;assert.ok(rm<0.5,`${rm.toFixed(3)} ms per relax`);
});
