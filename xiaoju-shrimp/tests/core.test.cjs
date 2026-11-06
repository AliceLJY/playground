// Rules and difficulty checks for 小橘偷虾记 level 1. Every threshold comes from SPEC.md and is measured on real simulated play.
const test=require('node:test'),assert=require('node:assert');
const C=require('../src/core.js'),{CFG}=C;
const L=C.level(0);
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const SEEDS=300;

test('spec 3: timing constants and the patrol shape',()=>{
  assert.deepStrictEqual([CFG.tick,CFG.catMove,CFG.sanMove,CFG.sanLook,CFG.sanTurn,CFG.hiss,CFG.sight],[0.1,4,5,6,6,12,4],'spec 3: 0.1 s ticks, cat 0.4 s/cell, 三花 0.5 s/cell, look back 0.6 s, turn 0.6 s, hiss 1.2 s, sight 4');
  assert.strictEqual([L.cols,L.rows].join('x'),'7x9','spec 3: 7 by 9 cells');
  assert.strictEqual(L.P*CFG.tick,13.8,'spec 3: one loop takes 13.8 s');
  assert.ok(L.nest>=0&&L.door>=0&&L.treat>=0,'map has a cat bed, a door and a treat');
});

test('spec 8.6: at every corner she looks back, then stands facing the new way for 0.6 s before stepping',()=>{
  const tl=L.tl,P=L.P;let corners=0;
  for(let p=0;p<P;p++){
    const a=tl[p],b=tl[(p+1)%P];
    if(a.turn&&!b.turn){ // last tick of a turn: next tick starts walking
      corners++;
      let n=0;for(let q=p;tl[(q+P)%P].turn;q--)n++;
      assert.ok(n*CFG.tick>=0.6-1e-9,'spec 8.6: she stands facing the new way at least 0.6 s, got '+n*CFG.tick);
      assert.strictEqual(b.face,a.face,'spec 3: she walks off the way she was facing');
      let back=0;for(let q=p-n;tl[(q+P)%P].look;q--)back++;
      assert.ok(back*CFG.tick>=0.6-1e-9,'spec 3: every corner has a look back');
    }
  }
  assert.strictEqual(corners,4,'four corners');
});

test('spec 8.2: the cat bed is never seen, so a cat sent back home is not caught again at once',()=>{
  for(let p=0;p<L.P;p++)assert.ok(!L.danger(L.nest,p),'spec 8.2: bed seen at patrol tick '+p);
});

test('spec 3: the coffee table hides the cat and blocks sight; walls block sight',()=>{
  let tableSeen=0,beyond=0;
  for(let p=0;p<L.P;p++)for(let i=0;i<L.N;i++)if(L.seen[p][i]){if(L.kind[i]==='T'||L.kind[i]==='#')tableSeen++;}
  assert.strictEqual(tableSeen,0,'spec 3: a cell under the table or inside furniture is never seen');
  // sight actually reaches somewhere: on the top side walking east she sees down the whole row ahead
  const p=L.tl.findIndex(e=>e.face===1&&!e.turn&&!e.look);
  const n=L.seen[p].reduce((a,b)=>a+b,0);
  assert.ok(n>=4,'spec 3: walking east she sees at least 4 cells, saw '+n);
  for(let p2=0;p2<L.P;p2++)beyond+=L.seen[p2].reduce((a,b)=>a+b,0);
  assert.ok(beyond/L.P>=3,'spec 3: on average she sees at least 3 cells');
});

test('spec 8.3: from the bed there is a safe way to the door and a safe way to the treat, at every patrol tick',()=>{
  for(let p=0;p<L.P;p++){
    assert.ok(isFinite(L.toDoor.get(L.nest,p)),'spec 8.3: no safe way to the door from the bed at tick '+p);
    assert.ok(isFinite(L.toTreat.get(L.nest,p)),'spec 8.3: no safe way to the treat from the bed at tick '+p);
    // and the treat can be picked up on a way that still ends at the door (some arrival time, not just the fastest)
    const R=C.reachable(L,L.nest,p);let ok=false;
    for(let q=0;q<L.P&&!ok;q++)if(R[L.treat*L.P+q]&&isFinite(L.toDoor.get(L.treat,q)))ok=true;
    assert.ok(ok,'spec 8.3: no safe way through the treat to the door from the bed at tick '+p);
  }
});

test('spec 4: precise autopilot clears every seed without being seen, and some seeds use the table',()=>{
  let under=0,passedTreat=0;
  for(let seed=1;seed<=SEEDS;seed++){
    const s=C.create({seed});C.run(s,C.precise(s),3000);
    assert.strictEqual(s.phase,'cleared','spec 4: precise seed '+seed+' did not reach the door');
    assert.strictEqual(s.hissed,0,'spec 4: precise seed '+seed+' was seen');
    if(s.underTable)under++;
    if(s.treat)passedTreat++;
  }
  assert.ok(under>=1,'spec 4: the precise route goes under the table in at least one seed (the hiding spot is real)');
  assert.strictEqual(passedTreat,0,'spec 8.3: the treat is a detour, the fastest safe way never passes it');
});

test('spec 4: human-error autopilot — two-sided difficulty over 300 seeds',()=>{
  let win=0,hit=0,under=0;const times=[];
  for(let seed=1;seed<=SEEDS;seed++){
    const s=C.create({seed});C.run(s,C.human(s,seed),900);
    if(s.phase==='cleared'){win++;times.push(s.time());}
    if(s.hissed)hit++;if(s.underTable)under++;
  }
  assert.ok(win/SEEDS>=0.95,'spec 4: at least 95% clear within 90 s, got '+win/SEEDS);
  assert.ok(hit/SEEDS>=0.25,'spec 4: at least 25% of runs get hissed at once (else no pressure), got '+hit/SEEDS);
  assert.ok(hit/SEEDS<=0.75,'spec 4: at most 75% of runs get hissed at (else frustrating), got '+hit/SEEDS);
  const m=mean(times);
  assert.ok(m>=8&&m<=40,'spec 4: mean clear time 8–40 s, got '+m.toFixed(1));
  assert.ok(under>=1,'spec 4: the sample really went under the table');
});

test('spec 4 / 8.5: reckless autopilot gets hissed at in at least half the seeds, and play recovers after',()=>{
  let caught=0;
  for(let seed=1;seed<=SEEDS;seed++){
    const s=C.create({seed});
    C.run(s,C.reckless(s),600,x=>x.phase==='hiss');
    if(s.phase!=='hiss')continue;
    caught++;
    assert.strictEqual(s.hissed,1,'one hiss counted');
    const p0=s.san.p;
    for(let k=0;k<CFG.hiss;k++)s.step();
    assert.strictEqual(s.san.p,p0,'spec 3: 三花 stands still while she hisses');
    assert.strictEqual(s.phase,'play','back to play after the hiss');
    assert.strictEqual(s.cat.at,L.nest,'spec 3: the cat is sent back to its bed');
    assert.ok(!s.cat.move&&s.cat.target<0,'nothing left over from before the hiss');
    s.step();assert.strictEqual(s.san.p,(p0+1)%L.P,'spec 3: she walks on after the hiss');
    C.run(s,C.precise(s),3000);
    assert.strictEqual(s.phase,'cleared','spec 8.5: after the hiss the game is still winnable, seed '+seed);
    assert.strictEqual(s.hissed,1,'no second hiss on the precise way home');
  }
  assert.ok(caught/SEEDS>=0.5,'spec 4: reckless gets hissed at in at least half the seeds, got '+caught/SEEDS);
});

test('spec 3 / 8.1: player input — tap a cell to walk there, tap again to stop, arrows step one cell',()=>{
  const s=C.create({seed:9});
  const tgt=8*L.cols+3; // (3,8), three cells right of the bed along the bottom wall, never seen
  assert.ok(s.setTarget(tgt));
  for(let k=0;k<CFG.catMove;k++)s.step();
  assert.notStrictEqual(s.cat.at,L.nest,'one cell walked after 0.4 s');
  s.stop();
  for(let k=0;k<CFG.catMove*3;k++)s.step();
  assert.ok(!s.cat.move,'stopped after finishing the cell it was on');
  const at=s.cat.at;
  assert.ok(s.stepDir(1));for(let k=0;k<CFG.catMove;k++)s.step();
  assert.strictEqual(s.cat.at,at+1,'arrow right moves exactly one cell');
  const wall=1*L.cols+0;assert.strictEqual(s.setTarget(wall),false,'cannot target a wall');
  // input is taken on the very next tick (spec 3: under 100 ms)
  const s2=C.create({seed:9});s2.setTarget(tgt);s2.step();assert.ok(s2.cat.move&&s2.cat.move.k===1,'the first step starts on the next 0.1 s tick');
});

test('spec 7: the same seed replays exactly',()=>{
  const a=C.create({seed:5}),b=C.create({seed:5});
  C.run(a,C.human(a,5),900);C.run(b,C.human(b,5),900);
  assert.deepStrictEqual([a.tick,a.hissed,a.cat.at,a.san.p],[b.tick,b.hissed,b.cat.at,b.san.p]);
});
