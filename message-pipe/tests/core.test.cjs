// Rules, solvability and difficulty checks for 一条消息的旅程. Every number comes from SPEC.md and is measured on real simulated play.
const test=require('node:test'),assert=require('node:assert');
const C=require('../src/core.js'),{LEVELS,CFG}=C;
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
// SPEC 5 table, written out again here so a change to core.js has to be a change to the spec too
const SPEC=[
  {id:'chat',cols:4,rows:5,stations:2,time:35,steps:[4,9],win:[0.9,1]},
  {id:'article',cols:5,rows:6,stations:5,time:60,steps:[10,18],win:[0.7,0.95]},
  {id:'dispatch',cols:5,rows:7,stations:5,time:60,steps:[10,18],win:[0.7,0.95]},
  {id:'bugfix',cols:5,rows:7,stations:4,time:80,steps:[14,24],win:[0.7,0.95]},
  {id:'push',cols:5,rows:7,stations:4,time:75,steps:[12,22],win:[0.7,0.95]}
];
function runTo(s,limit,watch){for(let n=0;n<limit/CFG.step&&s.phase!=='cleared'&&s.phase!=='timeout';n++){s.step(CFG.step);if(watch)watch(s);s.events.length=0;if(s.fail&&s.ride&&s.ride.done&&!watch)break;}return s;}
function rideOut(s){for(let n=0;n<60*60&&s.phase==='ride';n++){s.step(CFG.step);s.events.length=0;}return s;}

test('levels match the spec table and the labels fit a tile',()=>{
  assert.strictEqual(LEVELS.length,SPEC.length,'spec 5: five levels');
  LEVELS.forEach((d,i)=>{
    const sp=SPEC[i];
    assert.deepStrictEqual([d.id,d.cols,d.rows,d.stations.length,d.time],[sp.id,sp.cols,sp.rows,sp.stations,sp.time],'spec 5: level '+(i+1)+' differs from the table');
    assert.deepStrictEqual(d.minSteps,sp.steps,'spec 5: step range of level '+(i+1));
    assert.ok(d.time>=30&&d.time<=120,'spec 5: every level takes 30 s to 2 min');
    for(const lab of [d.start.label,d.end.label].concat(d.stations.map(s=>s.name)))assert.ok([...lab].length<=4,'spec 3: label "'+lab+'" is longer than 4 characters and will not fit a tile');
    assert.ok(d.lesson&&d.lesson.length>=10,'spec 1: every level ends on a one-line lesson');
    C.layout(d); // throws if the intended route and the traps cannot share the board
  });
  assert.ok(LEVELS[2].stations.some(s=>s.verify),'spec 4: level 3 has the inspection station');
});

test('every level is solvable after every shuffle, with the fewest taps inside the spec range',()=>{
  LEVELS.forEach((d,L)=>{
    const seen=new Set();
    for(let seed=1;seed<=200;seed++){
      const s=C.create({level:L,seed});
      assert.ok(s.min>=d.minSteps[0]&&s.min<=d.minSteps[1],`spec 5: level ${L+1} seed ${seed} needs ${s.min} taps, range ${d.minSteps}`);
      assert.notStrictEqual(C.trace(d,s.cells).outcome.kind,'delivered','spec 5: a fresh board must not already be connected');
      seen.add(s.min);
      const sol=C.solve(d,s.cells);
      assert.strictEqual(sol.taps.length,s.min,'the tap list has as many taps as the reported minimum');
      for(const i of sol.taps)assert.ok(s.tap(i),'every solution tap is accepted by the game');
      assert.ok(s.dispatch());rideOut(s);
      assert.strictEqual(s.phase,'cleared',`spec 5: following the solution must deliver the message (level ${L+1}, seed ${seed})`);
      assert.strictEqual(s.result.steps,s.min);
    }
    assert.ok(seen.size>=3,`spec 5: shuffles of level ${L+1} should not all cost the same (${[...seen]})`);
  });
});

test('the solver never reports more taps than the designed route would cost',()=>{
  // independent upper bound: walk the intended route of the level and price each cell with costTo
  LEVELS.forEach((d,L)=>{
    for(let seed=1;seed<=60;seed++){
      const s=C.create({level:L,seed});let c=d.start.c,r=d.start.r,cost=0;
      for(let i=0;i<d.moves.length-1;i++){
        const m='NESW'.indexOf(d.moves[i]),n='NESW'.indexOf(d.moves[i+1]);c+=C.DC[m];r+=C.DR[m];
        cost+=C.costTo(s.cells[r*d.cols+c],(m+2)&3,n);
      }
      assert.ok(s.min<=cost,`level ${L+1} seed ${seed}: solver says ${s.min}, the designed route costs ${cost}`);
    }
  });
});

test('skipping the inspection station brings back an empty box, then the level can still be won',()=>{
  const d=LEVELS[2],k=d.stations.findIndex(s=>s.verify),seq=d.stations.map((s,i)=>i).filter(i=>i!==k);
  let found=0;
  for(let seed=1;seed<=60;seed++){
    const s=C.create({level:2,seed}),by=C.solve(d,s.cells,seq);
    if(!by)continue;found++;
    by.taps.forEach(i=>s.tap(i));s.dispatch();rideOut(s);
    assert.strictEqual(s.fail&&s.fail.kind,'emptybox','spec 4: a route that skips 验货 must fail with the empty box');
    assert.strictEqual(s.fail.station,k,'spec 4: the inspection station is the one that lights up');
    assert.ok(s.fail.text.includes(C.NUM[k]),'spec 4: the empty-box note points at the station by number');
    const last=s.ride.pts[s.ride.pts.length-1];
    assert.deepStrictEqual([last[0],last[1]],[d.end.c+0.5,d.end.r+0.5],'spec 4: the cat gets all the way to the end before the box is found empty');
    assert.strictEqual(s.phase,'play','after a failed ride the player can keep turning pipes');
    const t=s.t;runTo(s,CFG.failHold+0.1,()=>{});
    assert.ok(!s.fail&&s.timeLeft<d.time-t,'the note clears and the clock kept running');
    C.solve(d,s.cells).taps.forEach(i=>s.tap(i));s.dispatch();rideOut(s);
    assert.strictEqual(s.phase,'cleared','after the empty box the real route still wins');
  }
  assert.ok(found>=50,'spec 4: the bypass trap must be there on almost every shuffle, found on '+found+'/60');
});

// stations a route string passes, in order
function stationsOn(d,mv){let c=d.start.c,r=d.start.r;const out=[];for(const ch of mv){const k='NESW'.indexOf(ch);c+=C.DC[k];r+=C.DR[k];const i=d.stations.findIndex(s=>s.c===c&&s.r===r);if(i>=0)out.push(i);}return out;}

test('out-of-order and missing stations stop the cat and light the station it skipped',()=>{
  let order=0,broken=0;
  LEVELS.forEach((d,L)=>{
    const n=d.stations.length;
    for(const trap of d.traps){
      const seq=stationsOn(d,trap);if(seq.every((v,i)=>v===i))continue;   // in-order traps are the empty-box kind, tested above
      const skipped=seq.findIndex((v,i)=>v!==i);
      for(let seed=1;seed<=40;seed++){
        const s=C.create({level:L,seed}),r=C.solve(d,s.cells,seq);
        assert.ok(r,`spec 4: the shortcut on level ${L+1} must be buildable after every shuffle (seed ${seed})`);
        r.taps.forEach(i=>s.tap(i));s.dispatch();rideOut(s);
        assert.strictEqual(s.fail&&s.fail.kind,'order',`spec 4: level ${L+1} seed ${seed} takes the shortcut`);
        assert.strictEqual(s.fail.station,skipped,'spec 4: the station it skipped is the one that lights up');
        assert.ok(s.fail.text.includes(C.NUM[skipped])&&s.fail.text.includes(C.NUM[seq[skipped]]),'spec 4: the note points at both stations by number, no need to know what they mean');
        const lp=s.ride.pts[s.ride.pts.length-1];
        assert.ok(!(Math.abs(lp[0]-d.end.c-0.5)<1e-9&&Math.abs(lp[1]-d.end.r-0.5)<1e-9),'spec 4: the cat stops half way, before reaching the end');
        order++;
      }
    }
    for(let seed=1;seed<=40;seed++){ // the shuffled board itself: whatever breaks, the lit station is the next one due
      const s3=C.create({level:L,seed}),tr=C.trace(d,s3.cells);s3.dispatch();rideOut(s3);
      if(s3.fail.kind==='break'){assert.strictEqual(s3.fail.station,tr.visited<n?tr.visited:-1);assert.ok(s3.fail.text.length>0);broken++;}
    }
  });
  assert.ok(order>=120&&broken>=100,`the sample must really contain each failure (order ${order}, break ${broken})`);
  assert.deepStrictEqual(LEVELS.map(d=>d.traps.length>0),[false,true,true,true,true],'spec 4: levels 2-5 each have a shortcut built in');
});

test('reaching the end with a station still missing is turned back at the gate',()=>{
  // a one-row board where the pipe can reach the end without passing the second station
  const d={id:'t',cols:4,rows:2,start:{c:0,r:0,label:'起'},end:{c:3,r:0,label:'终'},moves:'EEE',traps:[],stations:[{c:1,r:0,name:'甲'},{c:2,r:1,name:'乙'}],fill:1};
  const cells=C.layout({...d,stations:[d.stations[0]]});cells[2*1+4].station=1;cells[6].type='L';
  cells[1].rot=1;cells[2].rot=1;  // straight pieces turned east-west
  const tr=C.trace(d,cells);
  assert.strictEqual(tr.outcome.kind,'missing');assert.strictEqual(tr.outcome.station,1);
  assert.ok(C.failText(d,tr.outcome).includes(C.NUM[1]),'spec 4: the missing station is named by its number');
});

test('the same seed gives the same board and the same game',()=>{
  const a=C.run(3,7,'human').state,b=C.run(3,7,'human').state;
  assert.deepStrictEqual(a.cells.map(c=>c.rot),b.cells.map(c=>c.rot));
  assert.deepStrictEqual(a.result,b.result,'spec 6: fixed views depend on exact replay');
});

test('the clock runs during a ride and taps wait for the cat',()=>{
  const s=C.create({level:1,seed:4});s.dispatch();
  const t=s.timeLeft,rot=s.cells.map(c=>c.rot);
  for(let i=0;i<s.cells.length;i++)assert.ok(!s.tap(i),'no turning pipes while the cat is out');
  s.step(0.5);assert.ok(Math.abs(t-s.timeLeft-0.5)<1e-9,'spec 5: a failed ride costs time');
  assert.deepStrictEqual(s.cells.map(c=>c.rot),rot);
});

test('difficulty: precise always wins, the human model wins most but not all, reckless always loses',()=>{
  LEVELS.forEach((d,L)=>{
    for(let seed=1;seed<=100;seed++)assert.ok(C.run(L,seed,'precise').state.result.win,`spec 5: precise autopilot must clear level ${L+1} (seed ${seed})`);
    let wins=0,times=[],early=0,mis=0,failsOnBoard=0;const N=300;
    for(let seed=1;seed<=N;seed++){
      const {state,stat}=C.run(L,seed,'human');
      if(state.result.win){wins++;times.push(state.result.time);}
      early+=stat.earlyRides;mis+=stat.misTaps;failsOnBoard+=state.fails;
    }
    const rate=wins/N,lo=SPEC[L].win[0],hi=SPEC[L].win[1];
    assert.ok(rate>=lo&&rate<=hi,`spec 5: human model clears level ${L+1} at ${rate.toFixed(2)}, expected ${lo}-${hi}`);
    const m=mean(times);
    assert.ok(m>=15&&m<=d.time*0.9,`spec 5: human model takes ${m.toFixed(1)} s on level ${L+1}, expected 15 s to 90% of the ${d.time} s limit`);
    assert.ok(early>=N*0.2&&mis>=N&&failsOnBoard>=N*0.2,`the human sample must really send the cat early and mis-tap (early ${early}, mis-taps ${mis}, failed rides ${failsOnBoard})`);
    let rw=0;
    for(let seed=1;seed<=40;seed++){
      const r=C.run(L,seed,'reckless').state;if(r.result.win)rw++;
      assert.ok(r.rides>=5,'reckless really keeps sending the cat');
    }
    assert.strictEqual(rw,0,`spec 5: tapping at random and sending the cat must not clear level ${L+1}`);
  });
});

test('after a timeout a retry starts clean and can be won',()=>{
  const lost=C.run(4,3,'reckless').state;
  assert.strictEqual(lost.phase,'timeout');assert.strictEqual(lost.timeLeft,0);
  lost.step(1);assert.strictEqual(lost.phase,'timeout','nothing moves after the timeout');
  const again=C.create({level:4,seed:4});
  assert.deepStrictEqual([again.phase,again.steps,again.rides,again.timeLeft,again.fail],['play',0,0,LEVELS[4].time,null]);
  const p=C.pilot('precise',4);for(let n=0;n<60*60&&again.phase!=='cleared';n++){p.drive(again,CFG.step);again.step(CFG.step);}
  assert.strictEqual(again.phase,'cleared','spec 5: the retry is playable to the end');
});

test('plain-player rule: every note leads with numbers, every station has one, names never carry the rule',()=>{
  // spec 1: someone who knows nothing about AI plays by the numbers 1, 2, 3 alone
  LEVELS.forEach((d,L)=>{
    d.stations.forEach((st,k)=>assert.ok(C.NUM[k],'station '+st.name+' has a number'));
    for(const o of [{kind:'break',station:0},{kind:'order',station:0,at:d.stations.length-1},{kind:'missing',station:d.stations.length-1},{kind:'emptybox',station:d.stations.length-1}]){
      const t=C.failText(d,o),pos=t.indexOf(C.NUM[o.station]);
      assert.ok(pos>=0,`level ${L+1} ${o.kind}: the note "${t}" must show the number ${C.NUM[o.station]}`);
      assert.ok(pos<=t.indexOf(d.stations[o.station].name),`level ${L+1} ${o.kind}: the number comes before the name`);
      assert.ok(!/[A-Za-z]{3,}/.test(t.replace(/AI/g,'')),`level ${L+1} ${o.kind}: no English jargon in "${t}"`);
    }
    const s=C.create({level:L,seed:1});
    assert.strictEqual(C.reaches(d,s.cells),false,'a fresh board does not already reach the end');
    C.solve(d,s.cells).taps.forEach(i=>s.tap(i));
    assert.strictEqual(C.reaches(d,s.cells),true,'once solved the pipe reaches the end, which lights the send button');
  });
});
