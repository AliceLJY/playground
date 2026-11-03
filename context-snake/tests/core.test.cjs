// Rules for 上下文蛇. Every number comes from SPEC.md and is measured on real simulated games.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),{CFG}=C;
const SEEDS=Array.from({length:40},(_,i)=>i+1);
function play(seed,level,o){
  o=o||{};const g=C.create({seed}),p=level?C.pilot(level,seed):null;
  if(o.noSkills){g.compress=()=>false;g.dispatch=()=>false;}
  const events=[];let n=0;
  while(g.state.phase==='play'&&n++<200*60){if(p)p(g);const prev=o.watch?{body:g.state.body.map(c=>({...c})),subs:g.state.subs.map(b=>b.body.map(c=>({...c})))}:null;g.step(CFG.step);if(o.watch)o.watch(g,prev);events.push(...g.state.events);g.state.events.length=0;}
  return{r:g.state.result,events,g};
}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const runs={};
function batch(level,o){const k=level+(o&&o.noSkills?':noskills':'');return runs[k]||(runs[k]=SEEDS.map(s=>play(s,level,o)));}
// step the game until its next move happens; returns how many moves were made
function stepMoves(g,k){const m0=g.state.moves;let n=0;while(g.state.moves<m0+k&&g.state.phase==='play'&&n++<6000)g.step(CFG.step);return g.state.moves-m0;}
// a snake of a given length laid out without touching itself: head at the left edge pointing up,
// the body snakes back and forth through the lower rows, so the rows above the head stay free
function grown(len,seed){
  const g=C.create({seed:seed||1}),s=g.state,cells=[{x:0,y:8}];
  for(let row=9;cells.length<len;row++)for(let i=0;i<CFG.cols&&cells.length<len;i++)cells.push({x:(row-9)%2?CFG.cols-1-i:i,y:row});
  s.body=cells;s.kinds=['head'].concat(Array(len-1).fill('log'));s.dir=0;s.items.length=0;s.nextChat=1e9;s.grow=0;s.pendingKinds.length=0;
  return g;
}
// let the clock run with the snake parked (its move timer held back) so a cooldown can be timed without it crashing
function wait(g,sec){const s=g.state,t1=s.t+sec;while(s.t<t1){s.moveAcc=-1;g.step(CFG.step);assert.equal(s.phase,'play','the parked snake must not end the round');}}
test('same seed and same play give the same game',()=>{
  for(const lv of ['human','precise']){const a=play(9,lv).r,b=play(9,lv).r;assert.deepEqual(a,b,'spec 7.1: a fixed seed must replay identically ('+lv+'), the fixed views depend on it');}
});

test('turns land exactly turnDelay moves late, at every delay tier',()=>{
  const tiers=new Set();
  for(const len of [5,15,16,23,24,32,40]){
    const g=grown(len),s=g.state,want=C.turnDelay(s.body.length);tiers.add(want);
    s.items.length=0;s.respawn.length=0;
    const before=s.dir,turnTo=(before+1)%4;
    assert.ok(g.turn(turnTo),'turn should be accepted');
    s.items.length=0;
    for(let m=0;m<want;m++){stepMoves(g,1);s.items.length=0;assert.equal(s.dir,before,`spec 2: at length ${len} the turn landed after ${m+1} move(s), expected only after ${want+1}`);}
    stepMoves(g,1);
    assert.equal(s.dir,turnTo,`spec 2: at length ${len} (delay ${want}) the turn did not land on move ${want+1}`);
  }
  assert.deepEqual([...tiers].sort(),[0,1,2,3],'spec 2: every delay tier 0-3 must actually be exercised');
  assert.equal(C.turnDelay(15),0);assert.equal(C.turnDelay(16),1);assert.equal(C.turnDelay(24),2);assert.equal(C.turnDelay(32),3);assert.equal(C.turnDelay(99),3);
});

test('reverse and over-full queues are refused',()=>{
  const g=C.create({seed:2});
  assert.equal(g.turn((g.state.dir+2)%4),false,'spec 2: turning straight back must be ignored');
  assert.ok(g.turn(1));assert.ok(g.turn(2));assert.ok(g.turn(3));assert.equal(g.turn(0),false,'spec 2: at most 3 queued turns');
});

test('crossing an edge wraps; only biting yourself ends the round',()=>{
  let wraps=0;
  const {r}=play(4,null,{watch:g=>{const h=g.state.body[0],n=g.state.body[1];if(n&&Math.abs(h.x-n.x)+Math.abs(h.y-n.y)>1)wraps++;}});
  assert.ok(wraps>=3,'spec 7.3: the idle snake should cross the edge several times, got '+wraps);
  assert.equal(r.reason,'pollution','spec 7.3: the idle round must end by the snake biting itself');
  // a hand-built bite: a 6-long hook and a turn into it
  const g=C.create({seed:1}),s=g.state;s.items.length=0;s.nextChat=1e9;
  s.body=[{x:5,y:5},{x:5,y:6},{x:6,y:6},{x:6,y:5},{x:6,y:4},{x:7,y:4}];s.kinds=['head','log','log','log','log','log'];s.dir=0;
  g.turn(1);stepMoves(g,1);
  assert.equal(s.phase,'over');assert.equal(s.result.reason,'pollution','spec 7.3: hitting the body is 上下文污染');
});

test('compression cuts the oldest end by the formula, keeps the score, and cools down',()=>{
  for(const len of [5,9,14,25]){
    const g=grown(len),s=g.state;s.score=123;const cut=C.compressCut(s.body.length),n=s.body.length;
    assert.ok(g.compress(),'compress should work at length '+n);
    assert.equal(cut,Math.max(2,Math.floor((n-3)/2)),'spec 2: compression formula');
    assert.equal(s.body.length,n-cut,`spec 7.4: length ${n} should drop by ${cut}`);
    assert.equal(s.score,123,'spec 7.4: compression must not cost points');
    assert.equal(s.kinds[s.kinds.length-1],'summary','spec 7.4: the tail becomes a summary chip');
    assert.equal(g.compress(),false,'spec 7.4: a second press inside the cooldown does nothing');
    wait(g,CFG.compressCd-0.05);assert.equal(g.compress(),false);
    wait(g,0.07);if(s.body.length>=CFG.compressMinLen)assert.ok(g.compress(),'spec 2: usable again after 10 s');
  }
  const short=C.create({seed:1});assert.equal(short.compress(),false,'spec 2: below 5 segments compression does nothing');
  assert.equal(short.state.compressReady,0,'spec 2: and costs no cooldown');
});

test('sub-agents leave with 4 segments and come back with a short report, never with length',()=>{
  let delivered=0,checked=0;
  for(const seed of SEEDS.slice(0,15)){
    play(seed,'precise',{watch:g=>{
      const s=g.state;
      for(const e of s.events){
        if(e.type==='dispatch'){checked++;}
        if(e.type==='report'){delivered++;
          assert.ok(e.chars>=205&&e.chars<=588,'spec 7.5: report length '+e.chars+' outside 205-588');
          assert.ok(e.pts>=CFG.reportBase,'spec 7.5: a report always adds points');}
      }
    }});
  }
  assert.ok(checked>20&&delivered>20,'spec 7.5: the sample must really dispatch and deliver (got '+checked+'/'+delivered+')');
  // exact bookkeeping on one dispatch
  const g=grown(12,3),s=g.state;const n=s.body.length,score=s.score;
  assert.ok(g.dispatch());assert.equal(s.body.length,n-CFG.dispatchCut,'spec 7.5: dispatch takes 4 segments from the tail');
  s.nextChat=1e9;let report=null;
  for(let i=0;i<60*20&&!report;i++){s.moveAcc=-1;g.step(CFG.step);s.nextChat=1e9;const e=s.events.find(x=>x.type==='report');if(e)report=e;
    // keep the main snake from growing so the length comparison only sees the report
    s.grow=0;s.pendingKinds.length=0;s.events.length=0;}
  assert.ok(report,'spec 7.5: the sub-agent must come back within 14 s');
  assert.equal(s.body.length,n-CFG.dispatchCut,'spec 7.5: a report adds no length');
  assert.ok(s.score>=score+report.pts,'spec 7.5: a report adds points');
});

test('a 4th sub-agent with 3 out: all of them hit 429 and nothing comes back',()=>{
  const g=grown(30,5),s=g.state;
  for(let i=0;i<3;i++){assert.ok(g.dispatch(),'dispatch '+(i+1));wait(g,CFG.dispatchCd+0.02);}
  assert.equal(s.subs.length,3);
  const reportsBefore=s.stats.reports,len=s.body.length;s.events.length=0;
  assert.ok(g.dispatch());
  assert.equal(s.subs.length,0,'spec 7.6: every sub-agent vanishes');
  assert.equal(s.body.length,len-CFG.dispatchCut,'spec 7.6: the 4th one\'s segments are gone too');
  assert.equal(s.stats.lost429,4,'spec 7.6: 4 lost');
  assert.ok(s.events.some(e=>e.type==='burst429'&&e.lost===4));
  assert.equal(g.dispatch(),false,'spec 7.6: dispatch is locked after a 429');
  const t0=s.t;wait(g,CFG.subWork+CFG.subReturnMax+1);
  assert.equal(s.stats.reports,reportsBefore,'spec 7.6: no report from the lost ones ever arrives');
  assert.ok(s.t>=t0+CFG.lockout429&&g.dispatch(),'spec 7.6: dispatch works again after 8 s');
});

test('items never spawn on a body, on a sub-agent or next to the head',()=>{
  let spawned=0;
  for(const seed of SEEDS.slice(0,30)){
    const seen=new Set();
    // items appear before anything moves inside a step, so check them against the board as it was when they appeared
    play(seed,seed%2?'human':'precise',{watch:(g,prev)=>{const s=g.state;for(const it of s.items){if(seen.has(it.id))continue;seen.add(it.id);if(it.born===0)continue;spawned++;
      assert.ok(it.x>=0&&it.x<CFG.cols&&it.y>=0&&it.y<CFG.rows,'spec 7.7: inside the board');
      assert.ok(!prev.body.some(c=>c.x===it.x&&c.y===it.y),'spec 7.7: spawned on the body');
      assert.ok(!prev.subs.some(b=>b.some(c=>c.x===it.x&&c.y===it.y)),'spec 7.7: spawned on a sub-agent');
      assert.ok(C.wdist(it.x,it.y,prev.body[0].x,prev.body[0].y)>=CFG.itemMinDist,'spec 7.7: spawned within 3 cells of the head');}}});
  }
  assert.ok(spawned>500,'spec 7.7: expected a real sample, got '+spawned);
});

test('length and difficulty across seeds 1-40: idle, precise, human, reckless',()=>{
  const idle=batch(null),precise=batch('precise'),human=batch('human'),reckless=batch('reckless');
  const done=a=>a.filter(x=>x.r.reason==='done').length/a.length;
  assert.equal(done(idle),0,'spec 7.8: doing nothing must never survive the session');
  assert.ok(mean(idle.map(x=>x.r.score))<=20,'spec 7.8: doing nothing scores almost nothing');
  assert.ok(done(precise)>=0.7,'spec 7.8: the precise pilot should survive at least 70%, got '+done(precise));
  const ht=mean(human.map(x=>x.r.t));
  assert.ok(ht>=45&&ht<=110,'spec 7.8: shaky human rounds should last 45-110 s on average, got '+ht.toFixed(1));
  assert.ok(done(human)>=0.02&&done(human)<=0.6,'spec 7.8: shaky human should neither always die nor always survive, survived '+done(human));
  assert.ok(human.some(x=>x.r.stats.compress>0)&&human.some(x=>x.r.stats.reports>0)&&human.some(x=>x.r.stats.bursts>0),'spec 7.8: the human sample must really compress, collect a report and hit 429');
  assert.ok(reckless.every(x=>x.r.reason==='pollution'),'spec 7.8: the reckless pilot must always crash');
  assert.ok(mean(reckless.map(x=>x.r.t))<=30,'spec 7.8: and crash within 30 s on average');
});

test('the skills matter: the same shaky play without them dies much sooner',()=>{
  const on=mean(batch('human').map(x=>x.r.t)),off=mean(batch('human',{noSkills:true}).map(x=>x.r.t));
  assert.ok(off<=on*0.75,`spec 7.9: without compress and dispatch the average life should be at least 25% shorter (with ${on.toFixed(1)} s, without ${off.toFixed(1)} s)`);
});

test('a lost round can be restarted cleanly',()=>{
  const a=play(11,'reckless').r;assert.equal(a.reason,'pollution');
  const g=C.create({seed:11}),s=g.state;
  assert.equal(s.phase,'play');assert.equal(s.score,0);assert.equal(s.body.length,CFG.startLen);assert.equal(s.subs.length,0);assert.equal(s.queue.length,0);
});
