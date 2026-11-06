// Level 2 「走廊躲孩子」: rules and difficulty, every threshold from SPEC.md section 3b / 4b, measured on real simulated play.
const test=require('node:test'),assert=require('node:assert');
const C=require('../src/core.js'),{CFG}=C;
const L=C.level(1);
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const SEEDS=300;

test('spec 3b: constants — child 0.3 s/cell (faster than the cat), 「咦？」 0.5 s, looks round 1.5 s, hears 5 cells, toy in uneven short bursts',()=>{
  assert.deepStrictEqual([CFG.kidMove,CFG.kidHuh,CFG.kidLook,CFG.hear],[3,5,15,5]);
  const on=CFG.toy.map(x=>x[0]),off=CFG.toy.map(x=>x[1]);
  assert.ok(Math.max(...on)<=22&&Math.min(...on)>=12,'spec 3b: each burst lasts 1.2–2.2 s');
  assert.ok(new Set(off).size>=4&&Math.max(...off)-Math.min(...off)>=20,'spec 3b: the quiet gaps vary by at least 2 s, so they cannot be counted');
  assert.ok(CFG.kidMove<CFG.catMove,'spec 3b: the child walks faster than the cat, so being heard close by is real danger');
  assert.strictEqual(L.type,'sound');assert.ok(L.kid>=0&&L.nest>=0&&L.door>=0&&L.treat>=0);
});

test('spec 1 / 8.1: same controls as level 1 — the cat only takes setTarget, stop, stepDir',()=>{
  const s=C.create({level:1,seed:1});
  for(const f of ['setTarget','stop','stepDir'])assert.strictEqual(typeof s[f],'function');
  assert.ok(s.setTarget(L.door));
});

test('spec 3b: the shoe cabinet closes the silent far side — every way to the door crosses wood within earshot',()=>{
  // remove every wood cell she can hear; the door must then be unreachable from the start
  const blocked=new Set(L.hearZone);const q=[L.nest],seen=new Set([L.nest]);
  while(q.length){const i=q.shift();for(const [,j] of L.nbr(i))if(!seen.has(j)&&!blocked.has(j)&&L.man(j,L.kid)>1){seen.add(j);q.push(j);}}
  assert.ok(!seen.has(L.door),'spec 3b: there is a way to the door that never makes a sound she can hear');
});

test('spec 8.2b: the start is never next to her or within earshot, so a cat put back is safe',()=>{
  assert.ok(L.man(L.nest,L.kid)>CFG.hear,'start is out of earshot');
});

test('spec 8.3b: a safe way to the door and through the treat exists at every toy phase, and the treat is off the fastest way',()=>{
  for(let p=0;p<L.P;p++){
    assert.ok(isFinite(L.toDoor.get(L.nest,p)),'no safe way to the door at toy phase '+p);
    const R=C.reachable(L,L.nest,p);let ok=false;
    for(let q=0;q<L.P&&!ok;q++)if(R[L.treat*L.P+q]&&isFinite(L.toDoor.get(L.treat,q)))ok=true;
    assert.ok(ok,'no safe way through the treat at toy phase '+p);
  }
  assert.ok(L.wood(L.treat)&&L.man(L.treat,L.kid)<=CFG.hear,'spec 3b: the treat sits on wood within earshot (a risk to take)');
  let passed=0;for(let seed=1;seed<=SEEDS;seed++){const s=C.create({level:1,seed});C.run(s,C.precise(s),3000);if(s.treat)passed++;}
  assert.strictEqual(passed,0,'spec 8.3b: the fastest safe way never passes the treat');
});

test('spec 4b: precise autopilot clears every seed without ever being heard',()=>{
  for(let seed=1;seed<=SEEDS;seed++){
    const s=C.create({level:1,seed});let heard=0;
    C.run(s,C.precise(s),3000,x=>{if(x.events.includes('heard'))heard++;});
    assert.strictEqual(s.phase,'cleared','precise seed '+seed);
    assert.strictEqual(heard+s.hissed,0,'spec 4b: precise seed '+seed+' was heard or hugged');
  }
});

test('spec 4b: human-error autopilot — two-sided difficulty over 300 seeds, and she really gets up in the sample',()=>{
  let win=0,hug=0,heard=0,walked=0;const times=[];
  for(let seed=1;seed<=SEEDS;seed++){
    const s=C.create({level:1,seed});let h=false,w=false;
    C.run(s,C.human(s,seed),1500,x=>{if(x.events.includes('heard'))h=true;if(x.kid.state==='walk')w=true;});
    if(s.phase==='cleared'){win++;times.push(s.time());}
    if(s.hissed)hug++;if(h)heard++;if(w)walked++;
  }
  assert.ok(win/SEEDS>=0.95,'spec 4b: at least 95% clear within 150 s, got '+win/SEEDS);
  assert.ok(hug/SEEDS>=0.25&&hug/SEEDS<=0.75,'spec 4b: 25–75% of runs get hugged at least once, got '+hug/SEEDS);
  assert.ok(heard/SEEDS>=0.3,'spec 4b: in at least 30% of runs she hears a step (the new thing is really met), got '+heard/SEEDS);
  assert.ok(walked>=1,'spec 4b: in the sample she really gets up and walks to the sound');
  const m=mean(times);assert.ok(m>=8&&m<=40,'spec 4b: mean clear time 8–40 s, got '+m.toFixed(1));
});

test('spec 4b / 8.5b: reckless autopilot gets hugged in at least half the seeds, and play recovers cleanly',()=>{
  let caught=0;
  for(let seed=1;seed<=SEEDS;seed++){
    const s=C.create({level:1,seed});C.run(s,C.reckless(s),600,x=>x.phase==='hiss');
    if(s.phase!=='hiss')continue;caught++;
    for(let k=0;k<CFG.hiss;k++)s.step();
    assert.strictEqual(s.phase,'play');assert.strictEqual(s.cat.at,L.nest,'spec 3b: the cat is put back at the start');
    assert.deepStrictEqual([s.kid.at,s.kid.state,s.kid.move],[L.kid,'play',null],'spec 3b: she is back at her toy');
    C.run(s,C.precise(s),3000);
    assert.strictEqual(s.phase,'cleared','spec 8.5b: winnable after the hug, seed '+seed);
  }
  assert.ok(caught/SEEDS>=0.5,'spec 4b: reckless hugged in at least half the seeds, got '+caught/SEEDS);
});

test('spec 3b: she hears wood, not rugs, and not while the toy plays; a heard step makes her freeze, walk there and look',()=>{
  const quiet=[...Array(L.P).keys()].find(p=>!L.toyOn(p)),playing=[...Array(L.P).keys()].find(p=>L.toyOn(p));
  const rug=[...Array(L.N).keys()].find(i=>L.kind[i]==='~'&&L.man(i,L.kid)<=CFG.hear&&L.man(i,L.kid)>1);
  assert.ok(rug>=0&&!L.noisy(rug,quiet),'a rug in earshot is silent');
  const w=L.hearZone.find(i=>L.man(i,L.kid)>1);
  assert.ok(L.noisy(w,quiet)&&!L.noisy(w,playing),'wood in earshot: heard when the toy is quiet, not while it plays');
  // put the cat next to a wood cell in earshot during quiet time and step onto it
  const s=C.create({level:1,seed:1});s.san.p=quiet+1;while(L.toyOn(s.san.p+2))s.san.p++;
  const from=L.nbr(w).map(x=>x[1]).find(j=>L.man(j,L.kid)>1&&j!==L.kid);
  s.cat.at=from;const d=L.nbr(from).find(x=>x[1]===w)[0];s.stepDir(d);
  const seen=[];for(let k=0;k<60&&s.phase==='play';k++){s.step();seen.push(s.kid.state);}
  assert.ok(seen.includes('huh'),'spec 3b: she freezes with 「咦？」 first');
  const huh=seen.filter(x=>x==='huh').length;assert.ok(huh*CFG.tick>=0.5-1e-9-0.1,'spec 3b: the 「咦？」 warning lasts about 0.5 s, got '+huh*CFG.tick);
  assert.ok(seen.indexOf('huh')<seen.indexOf('walk'),'then walks');
});

// Alice 2026-11-06 second playtest: 「躲孩子比躲三花猫简单多了。第二关不行，太简单了」
test('playtest 2: level 2 is harder than level 1 for the same human-error player',()=>{
  const rate=(lv,n)=>{let hit=0;for(let seed=1;seed<=n;seed++){const s=C.create({level:lv,seed});C.run(s,C.human(s,seed),1500);if(s.hissed)hit++;}return hit/n;};
  const r1=rate(0,SEEDS),r2=rate(1,SEEDS);
  assert.ok(r2>=r1+0.1,`playtest 2: level 2 must catch the human-error player clearly more often than level 1 (level 1 ${r1.toFixed(2)}, level 2 ${r2.toFixed(2)})`);
});

// Alice 2026-11-06 third playtest: 「我现在是分不清到底我要走哪里……我就不知道我是该躲还是该藏，有没有藏的地方」
// The page coaches from game events, so the rules must announce when the toy starts and stops while she sits with it.
test('playtest 3: the game announces when the toy starts and stops, so the page can say "go" and "stop"',()=>{
  const s=C.create({level:1,seed:3});let on=0,off=0;
  for(let k=0;k<L.P*2;k++){s.step();if(s.events.includes('toyOn'))on++;if(s.events.includes('toyOff'))off++;}
  assert.ok(on>=CFG.toy.length&&off>=CFG.toy.length,`playtest 3: every burst announces its start and end (on ${on}, off ${off})`);
  // and it agrees with the rule she listens by
  const s2=C.create({level:1,seed:3});
  for(let k=0;k<200;k++){s2.step();if(s2.events.includes('toyOn'))assert.ok(L.toyOn(s2.san.p));if(s2.events.includes('toyOff'))assert.ok(!L.toyOn(s2.san.p));}
});

test('furniture labels sit only on furniture (2026-11-06: 「鞋柜」 was printed over a floor cell after the map changed)',()=>{
  for(const lv of [0,1]){const Lx=C.level(lv);
    for(const lb of Lx.def.labels)for(let r=lb.r;r<lb.r+lb.h;r++)for(let c=lb.c;c<lb.c+lb.w;c++){
      const k=Lx.kind[r*Lx.cols+c];assert.ok(k==='#'||k==='T',`level ${lv+1}: label 「${lb.text}」 covers a ${k} cell at (${c},${r})`);}}
});

// Alice 2026-11-06 fourth playtest: 「我看到可躲的那个地方，我躲进去了呀，为什么还会被孩子抓到呢」
// Measured before the fix: 24 of 303 hugs in the human-error sample happened with the cat on a rug, all while she was searching.
test('playtest 4: a cat lying on a rug (可躲) is never hugged — she walks round it',()=>{
  let onRug=0,hugs=0,searchedPastRug=0;
  for(let seed=1;seed<=SEEDS;seed++){
    const s=C.create({level:1,seed}),pilot=C.human(s,seed);
    for(let n=0;n<1500&&s.phase!=='cleared';n++){
      pilot();s.step();
      if(s.events.includes('hug')){hugs++;if(L.kind[s.catOcc()]==='~')onRug++;}
      if(s.kid.state==='walk'&&L.kind[s.catOcc()]==='~'&&L.man(s.catOcc(),s.kidOcc())<=1)searchedPastRug++;
    }
  }
  assert.strictEqual(onRug,0,`playtest 4: ${onRug} of ${hugs} hugs happened on a rug`);
  assert.ok(searchedPastRug>=1,'playtest 4: the sample really has her searching right next to a cat on a rug (else this test proves nothing)');
});
