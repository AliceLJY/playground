// Rules, solvability and difficulty checks for 凭证扫雷. Every threshold comes from SPEC.md; all of them are measured on real simulated games.
const test=require('node:test'),assert=require('node:assert');
const C=require('../src/core.js'),{LEVELS}=C;
const IDS=['easy','normal','hard'];
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const pct=(a,p)=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(p*b.length))];};

test('spec 7.1: a fixed seed and first tap replay the same board and the same game',()=>{
  for(const id of IDS){
    const a=C.playOut(id,11,'human'),b=C.playOut(id,11,'human');
    assert.deepStrictEqual(Array.from(a.state.board.mine),Array.from(b.state.board.mine),'spec 7.1: same seed must lay the same leaks ('+id+')');
    assert.strictEqual(a.time,b.time,'spec 7.1: same seed must replay the same game ('+id+')');
  }
});

test('spec 7.2: the first tap never hits a leak and always opens an area',()=>{
  for(const id of IDS){const L=LEVELS[id],N=L.cols*L.rows;
    for(let seed=1;seed<=60;seed++)for(const first of [0,L.cols-1,N-1,Math.floor(N/2),(seed*37)%N]){
      const g=C.create({level:id,seed});const r=g.reveal(first);
      assert.ok(!r.lost&&g.state.status==='play','spec 7.2: first tap hit a leak ('+id+' seed '+seed+' cell '+first+')');
      assert.strictEqual(g.state.board.n[first],0,'spec 7.2: the first tapped cell must show no number, so it opens an area');
      assert.ok(g.state.opened>=4,'spec 7.2: first tap opened only '+g.state.opened+' cells');
    }}
});

test('spec 7.3: every generated board can be finished by reasoning alone, from wherever the first tap lands',()=>{
  for(const id of IDS){const L=LEVELS[id],N=L.cols*L.rows;let tries=[];
    for(let seed=1;seed<=400;seed++){
      const first=(seed*7919)%N,b=C.generate(L,seed,first);tries.push(b.tries);
      assert.ok(b.guessFree,'spec 7.3: generator fell back to a board that needs a guess ('+id+' seed '+seed+')');
      let mines=0;for(const m of b.mine)mines+=m;assert.strictEqual(mines,L.mines,'spec 7.3: wrong leak count');
      const r=C.solve(L,b.mine,first);
      assert.ok(r.solved,'spec 7.3: logic alone could not finish '+id+' seed '+seed+(r.error?' ('+r.error+')':''));
      assert.ok(r.steps.every(s=>['first','single','subset','global'].includes(s.rule)),'spec 7.3: a step used something other than the three reasoning rules');
    }
    assert.ok(pct(tries,0.99)<C.MAX_TRIES/10,'spec 7.3: generator is near its retry ceiling on '+id+' (p99 '+pct(tries,0.99)+')');
  }
});

test('spec 7.3: the three reasoning rules only make forced moves (hand-checked positions)',()=>{
  // 3 x 3 corner, numbers seen by the player are fixed; check single and subset deductions on known small positions.
  const lv={cols:3,rows:2,mines:1};
  // row 0: open 1, open 1, covered;  row 1: covered x3. The leak sits under (1,1)? Build from a real layout and compare.
  const mine=Uint8Array.from([0,0,0, 0,1,0]),n=C.counts(3,2,mine);
  const open=Uint8Array.from([1,1,1, 0,0,0]),flag=new Uint8Array(6);
  // top row reads 1 1 1: the subset rule must find the two bottom corners safe, never flag them
  const moves=C.deduce(3,2,1,n,open,flag);
  for(const m of moves){if(m.op==='reveal')assert.strictEqual(mine[m.i],0,'deduce opened a leak');else assert.strictEqual(mine[m.i],1,'deduce flagged a clean cell');}
  assert.ok(moves.some(m=>m.op==='reveal'&&(m.i===3||m.i===5))||moves.some(m=>m.op==='flag'&&m.i===4),'1-1-1 row should settle the bottom row');
});

test('spec 7.4: chord, flags and the counter behave like classic minesweeper',()=>{
  const g=C.create({level:'easy',seed:4});g.reveal(31);const s=g.state;
  assert.strictEqual(g.toggleFlag(31).ok,false,'cannot flag an open cell');
  const nb=C.neighbours(s.cols,s.rows);
  // find an open number whose leaks can be flagged, flag them all, then chord
  let done=false;
  for(let i=0;i<s.N&&!done;i++){if(!s.open[i]||!s.board.n[i])continue;const cov=nb[i].filter(j=>!s.open[j]);if(!cov.some(j=>!s.board.mine[j]))continue;
    for(const j of cov)if(s.board.mine[j])g.toggleFlag(j);const before=s.opened;const r=g.chord(i);
    assert.ok(r.ok&&s.opened>before,'spec 7.4: chord on a satisfied number must open its other neighbours');done=true;}
  assert.ok(done,'no chord position found to test');
  assert.strictEqual(g.left(),s.level.mines-s.flags,'counter = leaks minus flags');
  const f=s.flag.findIndex(x=>x);assert.strictEqual(g.reveal(f).ok,false,'spec 7.4: tapping a flagged cell must not open it');
});

test('spec 7.5: the precise autopilot clears every board without a single guess',()=>{
  for(const id of IDS)for(let seed=1;seed<=150;seed++){
    const r=C.playOut(id,seed,'precise');
    assert.strictEqual(r.state.status,'won','spec 7.5: precise play lost '+id+' seed '+seed);
  }
});

test('spec 7.6: casual players finish in 1 to 5 minutes, and fat fingers lose some games but not all',()=>{
  const band={easy:[40,120],normal:[60,180],hard:[90,300]};
  for(const id of IDS){
    const runs=[];for(let seed=1;seed<=400;seed++)runs.push(C.playOut(id,seed,'human'));
    const won=runs.filter(r=>r.state.status==='won'),rate=won.length/runs.length,times=won.map(r=>r.time),med=pct(times,0.5);
    assert.ok(med>=band[id][0]&&med<=band[id][1],`spec 7.6: ${id} median finish ${med.toFixed(0)} s outside ${band[id]} s`);
    assert.ok(pct(times,0.9)<=300,`spec 7.6: ${id} 90th percentile ${pct(times,0.9).toFixed(0)} s is over five minutes`);
    assert.ok(rate>=0.7&&rate<=0.99,`spec 7.6: ${id} fat-finger win rate ${rate} outside 0.70-0.99 (two-sided: not all lost, not all won)`);
    assert.ok(runs.some(r=>r.state.status==='lost'),'spec 7.6: the sample never actually lost, the check is empty');
    assert.ok(runs.some(r=>r.state.events.some(e=>e.type==='flag')),'spec 7.6: the sample never placed a flag');
  }
});

test('spec 7.7: tapping blind loses almost every game, and a new game after losing plays normally',()=>{
  for(const id of IDS){
    let lost=0;for(let seed=1;seed<=200;seed++)if(C.playOut(id,seed,'reckless').state.status==='lost')lost++;
    assert.ok(lost/200>=0.95,`spec 7.7: blind tapping lost only ${lost}/200 on ${id}`);
  }
  const r=C.playOut('normal',3,'reckless');assert.strictEqual(r.state.status,'lost');
  const again=C.playOut('normal',4,'precise');assert.strictEqual(again.state.status,'won','spec 7.7: a fresh game after a loss must play to the end');
  const g=C.create({level:'normal',seed:3});assert.strictEqual(g.state.opened,0);assert.strictEqual(g.state.flags,0);assert.strictEqual(g.state.status,'ready','spec 7.7: new game starts clean');
});

test('spec 7.8: losing names one of the eight leak stories, each one or two short sentences',()=>{
  assert.strictEqual(C.STORIES.length,8);
  const seen=new Set();
  for(let seed=1;seed<=300;seed++){const r=C.playOut('normal',seed,'reckless');if(r.state.status==='lost'){assert.ok(r.state.story>=0&&r.state.story<8,'spec 7.8: lost without a story');seen.add(r.state.story);}}
  assert.strictEqual(seen.size,8,'spec 7.8: over 300 losses every story should come up, saw '+seen.size);
  for(const st of C.STORIES){
    const sentences=st.text.split('。').filter(Boolean).length;
    assert.ok(sentences>=1&&sentences<=2,'spec 7.8: story "'+st.title+'" has '+sentences+' sentences');
    assert.ok(st.text.length<=60,'spec 7.8: story "'+st.title+'" is '+st.text.length+' chars, keep it a quick read');
  }
  assert.strictEqual(C.NEVER_BACK,'写进记录就收不回来了。');
});
