// Level 3 「饭桌偷虾」: red-light-green-light with the owner. Every threshold from SPEC.md section 3c / 4c, measured on real simulated play.
const test=require('node:test'),assert=require('node:assert');
const C=require('../src/core.js'),{CFG}=C;
const L=C.level(2);
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const SEEDS=300;

test('spec 3c: constants — dragging 0.5 s/cell, chopsticks stop 0.6 s before she looks, 1.2 s to run after 「住手！」, uneven rhythm',()=>{
  assert.deepStrictEqual([CFG.catMove,CFG.dragMove,CFG.ownerWarn,CFG.dash],[4,5,6,12]);
  assert.strictEqual(L.type,'still');assert.ok(L.shrimp>=0&&L.door>=0&&L.nest>=0);
  const eat=CFG.owner.map(x=>x[0]),look=CFG.owner.map(x=>x[1]);
  assert.ok(Math.max(...eat)-Math.min(...eat)>=20,'spec 3c: how long she eats varies by at least 2 s, so it cannot be counted');
  assert.ok(Math.min(...look)>=10,'spec 3c: she looks at least 1 s each time');
});

test('spec 3c: every look is preceded by at least 0.6 s of stopped chopsticks (the warning)',()=>{
  let looks=0;
  for(let p=0;p<L.P;p++){if(L.owner(p)===2&&L.owner(p-1)!==2){looks++;let w=0;for(let q=p-1;L.owner(q)===1;q--)w++;assert.ok(w*CFG.tick>=0.6-1e-9,'warning before look at '+p+' is '+w*CFG.tick+' s');}}
  assert.strictEqual(looks,CFG.owner.length);
});

test('spec 3c / 8.1: same controls; standing still while she looks is safe, moving is seen',()=>{
  const s=C.create({level:2,seed:1});
  for(const f of ['setTarget','stop','stepDir'])assert.strictEqual(typeof s[f],'function');
  // stand still through a whole look
  while(L.owner(s.san.p)!==2)s.step();
  for(let k=0;k<30;k++)s.step();
  assert.strictEqual(s.hissed,0,'spec 3c: a cat that stands still is not seen');
  // start moving while she looks: seen and sent back
  const t=C.create({level:2,seed:1});while(L.owner(t.san.p+1)!==2)t.step();
  t.stepDir(3);for(let k=0;k<3;k++)t.step();
  assert.ok(t.phase==='hiss'&&t.hissed===1,'spec 3c: moving while she looks, without the shrimp, gets you shooed back');
});

test('spec 3c: the door does nothing without the shrimp; with it, being seen starts the run instead of failing',()=>{
  const s=C.create({level:2,seed:2});s.cat.at=L.door+1;s.san.p=0;while(L.owner(s.san.p+5)!==0||L.owner(s.san.p)!==0)s.san.p++;
  s.stepDir(3);for(let k=0;k<CFG.catMove+1;k++)s.step();
  assert.strictEqual(s.phase,'play','spec 3c: reaching the edge without the shrimp does not clear the level');
  const t=C.create({level:2,seed:2});t.carry=true;t.cat.at=L.door+2;while(L.owner(t.san.p+1)!==2)t.step();
  t.stepDir(3);t.step();
  assert.strictEqual(t.phase,'dash','spec 3c: seen with the shrimp in its mouth: 「住手！」 and run');
  for(let k=0;k<CFG.dash+2&&t.phase==='dash';k++)t.step();
  assert.ok(t.phase==='exit'&&t.caughtWin,'spec 3c: two cells from the edge, the run makes it (当场被抓包照样得手)');
});

test('spec 4c: precise autopilot clears every seed without ever being seen',()=>{
  for(let seed=1;seed<=SEEDS;seed++){
    const s=C.create({level:2,seed});C.run(s,C.precise(s),6000);
    assert.strictEqual(s.phase,'cleared','precise seed '+seed);
    assert.strictEqual(s.hissed+s.dashWins,0,'spec 4c: precise seed '+seed+' was seen');
  }
});

test('spec 4c: human-error autopilot — two-sided difficulty, both outcomes of 「住手！」 happen, and it is the hardest level',()=>{
  let win=0,seen=0,failed=0,dash=0,plate=0;const times=[];
  for(let seed=1;seed<=SEEDS;seed++){
    const s=C.create({level:2,seed});C.run(s,C.human(s,seed),2000);
    if(s.phase==='cleared'){win++;times.push(s.time());}
    if(s.hissed||s.dashWins)seen++;if(s.hissed)failed++;dash+=s.dashWins;plate+=s.plateLost;
  }
  assert.ok(win/SEEDS>=0.95,'spec 4c: at least 95% clear within 200 s, got '+win/SEEDS);
  // a run that makes it after 「住手！」 is the thrill, not a failure; the frustration cap counts real setbacks only
  assert.ok(failed/SEEDS>=0.25&&failed/SEEDS<=0.85,'spec 4c: 25–85% of runs are sent back at least once (shooed or plate taken), got '+failed/SEEDS);
  assert.ok(dash>=1&&plate>=1,`spec 4c: the sample has both a run that makes it after 「住手！」 (${dash}) and a plate taken away (${plate})`);
  assert.ok(plate/SEEDS<=1,'spec 4c: on average at most one plate taken away per game, got '+plate/SEEDS);
  const m=mean(times);assert.ok(m>=8&&m<=45,'spec 4c: mean clear time 8–45 s, got '+m.toFixed(1));
  let h2=0;for(let seed=1;seed<=SEEDS;seed++){const s=C.create({level:1,seed});C.run(s,C.human(s,seed),1500);if(s.hissed)h2++;}
  assert.ok(seen/SEEDS>=h2/SEEDS+0.05,`spec 4c: the last level is the hardest (level 2 ${(h2/SEEDS).toFixed(2)}, level 3 ${(seen/SEEDS).toFixed(2)})`);
});

test('spec 4c / 8.5c: reckless autopilot gets seen in at least half the seeds, and play recovers cleanly',()=>{
  let seen=0;
  for(let seed=1;seed<=SEEDS;seed++){
    const s=C.create({level:2,seed});C.run(s,C.reckless(s),900,x=>x.phase==='hiss');
    if(s.phase!=='hiss')continue;seen++;
    for(let k=0;k<CFG.hiss;k++)s.step();
    assert.strictEqual(s.phase,'play');assert.strictEqual(s.cat.at,L.nest,'spec 3c: back on the window sill');
    assert.strictEqual(s.carry,false,'spec 3c: the shrimp is back on the plate');
    C.run(s,C.precise(s),6000);
    assert.strictEqual(s.phase,'cleared','spec 8.5c: winnable after being sent back, seed '+seed);
  }
  assert.ok(seen/SEEDS>=0.5,'spec 4c: reckless gets sent back in at least half the seeds, got '+seen/SEEDS);
});

// Alice 2026-11-06 fifth playtest: 「叼了之后它不动就不会抓了，好像又少了点刺激感」
test('playtest 5: with the shrimp, standing still does not keep you safe — her next look notices the empty plate',()=>{
  const s=C.create({level:2,seed:5});
  s.carry=true;s.cat.at=L.shrimp;            // just grabbed, standing on the plate
  while(L.owner(s.san.p)!==0)s.step();       // she is eating
  let noticed=false;for(let k=0;k<L.P&&!noticed;k++){s.step();if(s.events.includes('stop'))noticed=true;}
  assert.ok(noticed,'playtest 5: standing still with the shrimp through her look, she must still notice');
  assert.strictEqual(s.phase,'dash','playtest 5: noticing starts the run (「我的虾呢？！住手！」)');
});
