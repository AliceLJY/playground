// Rules checks for 打回乐池. Every number here comes from SPEC.md; all of them are measured on real simulated games.
const test=require('node:test'),assert=require('node:assert');
const C=require('../src/core.js'),{CFG,GEO,STEP}=C;
// The numbers from SPEC.md section 4, written out here so a change to core.js cannot quietly move the target with it.
const SPEC={pre:[0.32,0.30,0.28],window:[0.50,0.44,0.36],fake:[0,0.40,0.36],earlyGrace:0.06,grace:0.08,
  start:[6,7,8],top:10,hitDrop:0.5,missClimb:1,gongDrop:2,meter:8,down:3};
const SEEDS=n=>Array.from({length:n},(_,i)=>i+1);
// Play one game to the end. level: 'precise' | 'human' | 'spam' | null (nobody plays) | a function(game).
function play(seed,mode,level,watch){
  const g=C.create({seed,mode}),p=typeof level==='function'?level:level?C.pilot(level,seed):null;let n=0;
  while(g.state.phase!=='over'&&n++<300/STEP){if(p)p(g);g.step(STEP);if(watch)watch(g.state,g);g.state.events.length=0;}
  return g.state;
}
// Replay a seed with a pilot up to time t (deterministic), then hand the live game back.
function replayTo(seed,mode,level,t){
  const g=C.create({seed,mode}),p=level?C.pilot(level,seed):null;
  while(g.state.t<t-1e-9&&g.state.phase!=='over'){if(p)p(g);g.step(STEP);g.state.events.length=0;}
  return g;
}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;

test('same seed gives the same game, solo and duo',()=>{
  for(const mode of ['solo','duo']){
    const a=play(7,mode,'human').result,b=play(7,mode,'human').result;
    assert.deepStrictEqual(a,b,'spec 6: a fixed seed must replay identically, the fixed views depend on it');
  }
});

test('precise play wins every round without being hit, in 40-55 s',()=>{
  const times=[];
  for(const seed of SEEDS(40)){const r=play(seed,'solo','precise').result;
    assert.strictEqual(r.outcome,'win',`spec 5: precise play lost seed ${seed}`);assert.strictEqual(r.misses,0,`spec 5: precise play was hit on seed ${seed}`);times.push(r.time);}
  const m=mean(times);assert.ok(m>=40&&m<=55,`spec 5: precise rounds average ${m.toFixed(1)} s, expected 40-55 s`);
});

test('the shaky-thumb player (手抖档) survives wave 1, wins some and loses some, rounds last 60-90 s',()=>{
  const N=200;let w1=0,wins=0;const times=[];
  for(const seed of SEEDS(N)){const r=play(seed,'solo','human').result;if(r.outcome==='win')wins++;if(r.outcome==='lose'&&r.wave===1)w1++;times.push(r.time);}
  assert.ok(w1/N<=0.03,`spec 5: ${w1} of ${N} shaky rounds were lost in wave 1, at most 3% allowed`);
  assert.ok(wins/N>=0.6,`spec 5: shaky player wins only ${(100*wins/N).toFixed(0)}%, too hard (at least 60%)`);
  assert.ok(wins/N<=0.95,`spec 5: shaky player wins ${(100*wins/N).toFixed(0)}%, too easy (at most 95%)`);
  const m=mean(times);assert.ok(m>=60&&m<=90,`spec 5: shaky rounds average ${m.toFixed(1)} s, expected 60-90 s`);
});

test('nobody playing loses fast; hammering every lane blind loses too',()=>{
  for(const seed of SEEDS(20)){const r=play(seed,'solo',null).result;
    assert.strictEqual(r.outcome,'lose',`spec 5: an idle round must be lost (seed ${seed})`);assert.ok(r.time<=15,`spec 5: idle round lasted ${r.time} s, the boss should take the stage within 15 s`);}
  let lost=0;for(const seed of SEEDS(60))if(play(seed,'solo','spam').result.outcome==='lose')lost++;
  assert.ok(lost/60>=0.75,`spec 5: blind hammering lost only ${lost} of 60 rounds, at least 75% must be lost`);
});

test('telegraph lead: the sleeve swells, then the rod lights, then the strike lands, on spec in every wave',()=>{
  const seen=[0,0,0];
  for(const seed of SEEDS(30))play(seed,'solo','human',s=>{
    for(const a of s.attacks){if(a._checked)continue;a._checked=true;const w=a.wave;seen[w]++;
      assert.ok(Math.abs(a.lightAt-a.preAt-SPEC.pre[w])<1e-6,`spec 4: sleeve-to-light ${(a.lightAt-a.preAt).toFixed(3)} s in wave ${w+1}, spec ${SPEC.pre[w]}`);
      assert.ok(Math.abs(a.hitAt-a.lightAt-SPEC.window[w])<1e-6,`spec 4: light-to-strike ${(a.hitAt-a.lightAt).toFixed(3)} s in wave ${w+1}, spec ${SPEC.window[w]}`);
      if(a.fake)assert.ok(Math.abs(a.switchAt-a.onset-SPEC.fake[w])<1e-6&&a.fake.lane!==a.lanes[0],'spec 4: a feint shows another lane for exactly its fake time, then the real lane gets the full lead');
    }});
  assert.ok(seen.every(n=>n>50),'expected many strikes in every wave, got '+seen);
  // the judge window, probed with real taps on a real strike: early edge, late edge, and too late
  const first=(()=>{let a0=null;play(3,'solo',null,s=>{if(!a0&&s.attacks.length)a0={...s.attacks[0]};});return a0;})();
  const at=(dt,lane)=>{const g=replayTo(3,'solo',null,first.hitAt+dt);return g.tap(lane==null?first.lanes[0]:lane,0);};
  assert.strictEqual(at(-SPEC.window[0]-SPEC.earlyGrace-2*STEP),'early','spec 4: a tap before the rod lights (minus the 60 ms grace) is a swing at air');
  assert.strictEqual(at(-SPEC.window[0]-SPEC.earlyGrace+2*STEP),'hit','spec 4: a tap just inside the early edge of the window hits');
  assert.strictEqual(at(SPEC.grace-2*STEP),'hit','spec 4: a tap up to 80 ms after the strike still hits');
  const late=replayTo(3,'solo',null,first.hitAt+SPEC.grace+2*STEP);assert.ok(late.state.level===SPEC.start[0]+SPEC.missClimb,'spec 4: past the late edge the strike has already landed and the boss climbed one notch');
  assert.strictEqual(at(-0.05,(first.lanes[0]+1)%3),'air','spec 4: tapping a quiet lane is a swing at air');
});

test('a landed strike knocks that puppet flat for 3 s and lifts the boss one notch; nothing aims at a flat puppet',()=>{
  let checked=0;
  for(const seed of SEEDS(30)){
    const g=C.create({seed,mode:'solo'}),p=C.pilot('human',seed);let n=0;
    let prev=g.state.level;
    while(g.state.phase!=='over'&&n++<300/STEP){
      p(g);g.step(STEP);const s=g.state;
      // walk the events in order: every level change must be exactly the one the spec gives for it
      for(const e of s.events){
        if(e.type==='miss'){checked++;const pp=s.puppets[e.lane];
          assert.ok(Math.abs(pp.downUntil-e.t-SPEC.down)<1e-6,'spec 5: a puppet that was hit lies down for 3 s');
          assert.ok(Math.abs(e.level-Math.min(SPEC.top,prev+SPEC.missClimb))<1e-6,`spec 5: the boss climbs one notch per landed strike (${prev} -> ${e.level})`);prev=e.level;}
        else if(e.type==='hit'){assert.ok(Math.abs(e.level-Math.max(0,prev-SPEC.hitDrop*(e.t-s.waveStart[s.wave]>=CFG.tiredAfter?2:1)))<1e-6,`spec 5: a hit knocks the boss back half a notch (${prev} -> ${e.level})`);prev=e.level;}
        else if(e.type==='gong')prev=e.level;
        else if(e.type==='phase'&&e.phase==='intro')prev=s.level;
        if(e.type==='attack'){const a=s.attacks.find(x=>x.id===e.id);
          for(const l of a.lanes)assert.ok(s.puppets[l].downUntil<=a.hitAt,`spec 5: a strike aimed at lane ${l} whose puppet is still flat when it lands`);}
      }
      s.events.length=0;
    }
  }
  assert.ok(checked>100,'expected many landed strikes to check, got '+checked);
});

test('the gong only goes off when the 锣鼓槽 is full, and then knocks the boss back two notches',()=>{
  let dull=0,rang=0;
  for(const seed of SEEDS(20)){
    const g=C.create({seed,mode:'solo'}),p=C.pilot('precise',seed);let n=0;
    while(g.state.phase!=='over'&&n++<300/STEP){
      const s=g.state;
      if(s.phase==='wave'){
        const before={level:s.level,meter:s.meter,score:s.score.slice()};
        if(s.meter<SPEC.meter&&n%37===0){
          assert.strictEqual(g.gong(0),false,`spec 5: the gong rang with the meter at ${s.meter} of ${SPEC.meter}`);
          assert.deepStrictEqual({level:s.level,meter:s.meter,score:s.score},before,'spec 5: a gong that did not go off must change nothing');dull++;
        }else if(s.meter>=SPEC.meter){
          assert.strictEqual(g.gong(0),true,'spec 5: a full meter must let the gong go off');rang++;
          assert.strictEqual(s.level,Math.max(0,before.level-SPEC.gongDrop),'spec 5: 大英歌 knocks the boss back two notches');
          assert.strictEqual(s.meter,0,'spec 5: the gong empties the meter');assert.ok(s.puppets.every(pp=>pp.downUntil<=s.t),'spec 5: 大英歌 stands every puppet back up');
        }
      }
      p(g);g.step(STEP);g.state.events.length=0;
    }
  }
  assert.ok(dull>200&&rang>40,`expected many gong checks, got ${dull} refused and ${rang} rung`);
});

test('duo mode scores each player separately: left lane is 阿爸, right lane is 心远, the middle goes to whoever taps first',()=>{
  for(const seed of SEEDS(30)){
    const hits=[[0,0,0],[0,0,0]];
    const s=play(seed,'duo','human',st=>{for(const e of st.events)if(e.type==='hit')hits[e.player][e.lane]++;});
    const r=s.result;
    assert.strictEqual(hits[1][0],0,'spec 5: 心远 cannot be credited with the left lane');assert.strictEqual(hits[0][2],0,'spec 5: 阿爸 cannot be credited with the right lane');
    for(const pl of [0,1]){
      const want=hits[pl].reduce((a,b)=>a+b,0)*CFG.points.hit+r.perfects[pl]*CFG.points.perfect+r.gongs[pl]*CFG.points.gong+r.balls[pl]*CFG.points.ball+(r.outcome==='win'?CFG.points.win/2:0);
      assert.strictEqual(r.score[pl],want,`spec 5: player ${pl} score ${r.score[pl]} does not add up to ${want} (seed ${seed})`);
      assert.strictEqual(r.hits[pl],hits[pl].reduce((a,b)=>a+b,0));
    }
    assert.ok(hits[0][1]+hits[1][1]>0,'expected middle-lane hits');
  }
  // scripted: on a middle strike 心远 taps first and takes it; 阿爸's tap a moment later is a harmless joint swing, not a whiff
  let a0=null;play(5,'duo',null,s=>{if(!a0){const a=s.attacks.find(x=>x.lanes.length===1&&x.lanes[0]===1);if(a)a0={...a};}});
  const g=replayTo(5,'duo',null,a0.hitAt-0.1);
  assert.strictEqual(g.tap(1,1),'hit');const sc=g.state.score.slice(),meter=g.state.meter;
  for(let i=0;i<Math.round(0.3/STEP);i++)g.step(STEP);
  assert.strictEqual(g.tap(1,0),'echo','spec 5: the second thumb on the middle lane just after a hit is not punished');
  assert.deepStrictEqual(g.state.score,sc);assert.strictEqual(g.state.meter,meter);
  assert.ok(sc[1]>=CFG.points.hit&&sc[0]===0,'spec 5: the middle-lane hit is credited to the player who tapped first');
});

test('waves escalate: feints only from wave 2, double strikes only in wave 3',()=>{
  for(const seed of SEEDS(10))play(seed,'solo','precise',s=>{for(const e of s.events)if(e.type==='phase'&&e.phase==='intro')assert.ok(s.level===SPEC.start[e.wave]||s.level===SPEC.start[e.wave]-1,`spec 4: wave ${e.wave+1} starts at level ${s.level}, spec ${SPEC.start[e.wave]} (one lower after a bonk)`);});
  const n=[[0,0,0],[0,0,0],[0,0,0]];   // per wave: attacks, feints, doubles
  for(const seed of SEEDS(40))play(seed,'solo','precise',s=>{for(const e of s.events)if(e.type==='attack'){const w=s.wave;n[w][0]++;if(e.fake!=null)n[w][1]++;if(e.lanes.length===2)n[w][2]++;}});
  assert.strictEqual(n[0][1]+n[0][2],0,'spec 5: wave 1 is single strikes only');
  assert.strictEqual(n[1][2],0,'spec 5: wave 2 has no double strikes');
  const f=n[1][1]/n[1][0],d=n[2][2]/n[2][0];
  assert.ok(f>=0.3&&f<=0.55,`spec 5: ${(100*f).toFixed(0)}% of wave-2 strikes are feints, expected 30-55%`);
  assert.ok(d>=0.35&&d<=0.65,`spec 5: ${(100*d).toFixed(0)}% of wave-3 attacks are double strikes, expected 35-65%`);
});

test('a lit rod is always long enough to see above the pit front and inside the frame',()=>{
  let samples=0,worst=1e9;
  for(const seed of SEEDS(30))play(seed,'solo','human',s=>{
    for(const arm of ['L','R']){const st=C.armState(s,arm,s.t);if(!st||!st.glow)continue;
      const l=C.armLine(s.level,arm,st.lane,st.reach,st.cock,st.minRod);samples++;
      // part of the rod above the panel top (the panel hides the pit below 1500)
      const y0=Math.min(l.hy,GEO.panelTop),y1=Math.min(l.ty,GEO.panelTop),len=Math.hypot(l.tx-l.hx,l.ty-l.hy),frac=l.ty===l.hy?1:Math.abs(y0-y1)/Math.abs(l.ty-l.hy);
      const visible=len*Math.min(1,frac);if(visible<worst)worst=visible;
      assert.ok(visible>=200,`spec 3: a lit rod shows only ${visible.toFixed(0)} units above the pit front (level ${s.level})`);
      assert.ok(l.tx>=20&&l.tx<=1060&&l.ty>=420&&l.ty<=GEO.panelTop,`spec 3: a lit rod tip at (${l.tx.toFixed(0)}, ${l.ty.toFixed(0)}) is outside the stage frame`);
    }});
  assert.ok(samples>2000,'expected many lit frames, got '+samples);
});

test('the red ball flies over the stage and a tap on it scores',()=>{
  let flights=0,scored=0;
  for(const seed of SEEDS(20))play(seed,'solo','precise',s=>{
    if(s.ball&&!s.ball.smack){const p=C.ballAt(s.ball.keys,s.t-s.ball.t0);if(p&&p.x>0&&p.x<1080){flights++;
      assert.ok(p.y>=560&&p.y<=GEO.floorY,`spec 3: the ball at y ${p.y.toFixed(0)} leaves the stage opening`);}}
    for(const e of s.events)if(e.type==='ball')scored++;
  });
  assert.ok(flights>500,'expected ball frames');assert.ok(scored>=30,'spec 5: precise play should smack nearly every ball, got '+scored);
});
