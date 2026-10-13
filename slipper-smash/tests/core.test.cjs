// Rules and composition checks for 凉拖拍蟑螂. Every number here comes from SPEC.md; all of them are measured on real simulated games.
const test=require('node:test'),assert=require('node:assert');
const C=require('../src/core.js'),{CFG,H}=C;
const ASPECTS=[0.46,0.5625,0.75,0.9,1.6,1.78],SEEDS=[1,2,3,4,5,6,7,8,9,10,11,12];
function play(seed,aspect,level,watch){
  const g=C.create({seed,aspect}),p=typeof level==='function'?level:level?C.pilot(level,seed):null;let n=0;
  while(g.state.phase!=='over'&&n++<120*120){if(p)p(g);g.step(CFG.step);if(watch)watch(g.state);g.state.events.length=0;}
  return g.state;
}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;

test('same seed and screen shape give the same game',()=>{
  const a=play(7,0.5625,'human').result,b=play(7,0.5625,'human').result;
  assert.deepStrictEqual(a,b,'spec 6: a fixed seed must replay identically, the fixed views depend on it');
});

test('tossed things peak inside the safe area on every screen shape',()=>{
  for(const aspect of ASPECTS)for(const seed of SEEDS){
    const seen=new Map();
    play(seed,aspect,null,s=>{if(s.phase==='waves')for(const e of s.ents)if(e.kind!=='flyer')seen.set(e.id,e);});
    assert.ok(seen.size>40,'expected a full round of tosses, got '+seen.size);
    for(const e of seen.values()){
      assert.ok(e.apexX>=0.08*H*aspect&&e.apexX<=0.92*H*aspect,`spec 3: apex x ${e.apexX.toFixed(0)} outside 8%-92% of width (aspect ${aspect}, seed ${seed})`);
      assert.ok(e.minY>=0.12*H&&e.minY<=0.64*H,`spec 3: apex y ${e.minY.toFixed(0)} outside 12%-64% of height (aspect ${aspect}, seed ${seed})`);
    }
  }
});

test('nothing drifts off the side while it is still in play',()=>{
  for(const aspect of ASPECTS)for(const seed of SEEDS.slice(0,6)){
    const W=H*aspect;
    play(seed,aspect,null,s=>{for(const e of s.ents){
      if(e.kind==='flyer'&&e.x>0&&e.x<W)assert.ok(e.y>=0.12*H&&e.y<=0.72*H,`spec 3: flyer at y ${e.y.toFixed(0)} outside 12%-72% of height`);
      if(e.kind!=='flyer'&&e.y>0&&e.y<H)assert.ok(e.x>=0.04*W&&e.x<=0.96*W,`spec 3: ${e.kind} at x ${e.x.toFixed(0)} drifts outside 4%-96% of width while on screen (aspect ${aspect}, ${s.phase})`);
    }});
  }
});

test('the boss stays whole on screen and clear of the score bar',()=>{
  for(const aspect of ASPECTS){
    const W=H*aspect;let frames=0;
    play(3,aspect,null,s=>{if(s.phase!=='boss')return;const b=s.boss;frames++;
      assert.ok(b.x-b.r*1.35>=0&&b.x+b.r*1.35<=W,`spec 3: boss body leaves the screen sideways at aspect ${aspect}`);
      assert.ok(b.y-b.r*1.5>=150,`spec 3: boss head at ${(b.y-b.r*1.5).toFixed(0)} rides over the bar that ends at 164`);
      assert.ok(b.y+b.r*1.5<=0.82*H,`spec 3: boss feet at ${(b.y+b.r*1.5).toFixed(0)} leave no room below to hit what it throws`);
    });
    assert.ok(frames>120*20,'boss phase should run its full time when nobody plays');
  }
});

test('readability: never more than 8 things in the air, milk tea is 6%-20% of them',()=>{
  let peak=0;const share=[];
  for(const aspect of ASPECTS)for(const seed of SEEDS){
    const s=play(seed,aspect,null),n=s.spawned;peak=Math.max(peak,s.peakLive);share.push(n.tea/(n.tea+n.roach+n.flyer+n.gold));
    assert.ok(n.roach+n.flyer+n.gold>=60,`spec 4: a round should offer at least 60 roaches, got ${n.roach+n.flyer+n.gold}`);
  }
  assert.ok(peak<=CFG.maxLive,`spec 4: ${peak} things in the air at once, ceiling is ${CFG.maxLive}`);
  const m=mean(share);assert.ok(m>=0.06&&m<=0.2,`spec 4: milk tea share ${(m*100).toFixed(1)}% outside 6%-20%`);
});

test('a roach is rarely glued to a milk tea cup',()=>{
  let near=0,total=0;
  for(const seed of SEEDS)play(seed,0.5625,null,s=>{for(const e of s.ents){
    if(e.kind==='tea'||e.y<0||e.y>H)continue;total++;
    if(s.ents.some(t=>t.kind==='tea'&&Math.hypot(t.x-e.x,t.y-e.y)<(t.r+e.r)*0.7))near++;
  }});
  assert.ok(near/total<=0.10,`spec 4: ${(100*near/total).toFixed(1)}% of roach screen time overlaps a cup, limit is 10%`);
});

test('combo multiplier climbs every 4 kills and stops at 5',()=>{
  assert.deepStrictEqual([1,4,5,8,9,13,17,40].map(C.multiplier),[1,1,2,2,3,4,5,5]);
});

test('hitting milk tea costs a cup and three cups end the round',()=>{
  const g=C.create({seed:2,aspect:0.5625}),s=g.state;let spilled=0;
  for(let n=0;n<120*60&&s.phase!=='over';n++){
    g.step(CFG.step);const t=s.ents.find(e=>e.kind==='tea'&&e.y<H);
    if(t){const before=s.lives;g.swipe(t.x-40,t.y,t.x+40,t.y);assert.strictEqual(s.lives,before-1);assert.strictEqual(s.combo,0);spilled++;}
  }
  assert.strictEqual(spilled,3);assert.strictEqual(s.result.reason,'tea');
});

test('the boss cannot be hit while walking in, and one stroke lands once',()=>{
  const g=C.create({seed:4,aspect:0.5625}),s=g.state;
  while(s.phase==='waves')g.step(CFG.step);
  const b=s.boss;g.swipe(b.x-50,b.y,b.x+50,b.y);g.swipe(s.W/2-50,b.home,s.W/2+50,b.home);
  assert.strictEqual(b.hp,CFG.bossHp,'spec 5: no damage during the entrance');
  while(s.phase==='bossIn')g.step(CFG.step);
  s.ents.length=0;g.swipe(b.x-50,b.y,b.x+50,b.y);g.swipe(b.x+50,b.y,b.x-50,b.y);
  assert.strictEqual(b.hp,CFG.bossHp-1,`spec 5: two strokes inside ${CFG.bossHitGap}s count once`);
});

test('length and difficulty: idle, precise, human and button-mashing play',()=>{
  const idle=play(1,0.5625,null).result;
  assert.strictEqual(idle.reason,'escaped');
  assert.ok(Math.abs(idle.time-(CFG.waveTime+CFG.bossEnter+CFG.bossTime))<0.1,`spec 5: an untouched round lasts ${idle.time.toFixed(1)}s`);
  const precise=[],human=[];
  for(const seed of SEEDS)for(const aspect of [0.5625,1.78]){precise.push(play(seed,aspect,'precise').result);human.push(play(seed,aspect,'human').result);}
  assert.ok(precise.every(r=>r.reason==='win'&&r.lives===3),'spec 5: flawless play always beats the boss without spilling');
  const wins=human.filter(r=>r.reason==='win').length/human.length,time=mean(human.map(r=>r.time)),lives=mean(human.map(r=>r.lives));
  assert.ok(wins>=0.8,`spec 5: human-like play wins ${(wins*100).toFixed(0)}%, floor is 80%`);
  assert.ok(time>=50&&time<=66,`spec 5: human-like round lasts ${time.toFixed(1)}s, expected 50-66s`);
  assert.ok(lives<3&&lives>=1.5,`spec 5: human-like play keeps ${lives.toFixed(2)} cups, expected at least 1.5 and fewer than 3`);
  assert.ok(mean(human.map(r=>r.score))<mean(precise.map(r=>r.score)),'spec 5: careful play should outscore sloppy play');
  // scrubbing the whole screen without looking must not pay: the cups are what stops it
  const masher=seed=>{const r=C.rng(seed);let next=0;return g=>{const s=g.state;if(s.t<next)return;const y=H*(0.15+0.7*r());g.swipe(0,y,s.W,y+(r()-0.5)*200);next=s.t+0.15;};};
  const mashed=SEEDS.map(seed=>play(seed,0.5625,masher(seed)).result);
  const lost=mashed.filter(r=>r.reason==='tea').length/mashed.length;
  assert.ok(lost>=0.75,`spec 5: blind scrubbing loses all cups in ${(lost*100).toFixed(0)}% of rounds, expected at least 75%`);
});
