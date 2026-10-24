const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const F=require('../src/feel.js');

// Feed real match events through the same reaction rules the browser uses (events() in game.js).
function reactTo(f,s){
  const me=s.actors[0];
  for(const e of s.events){
    if(e.type==='shot'&&e.id===0){F.react(f,'shot',{weapon:e.weapon});if(e.hit)F.react(f,'hitConfirm');}
    if(e.type==='hit'&&e.id===0)F.react(f,'hurt',{dir:0,scale:Math.min(1.6,e.amount/30)});
    if(e.type==='out'&&e.by===0)F.react(f,'soak');
    if(e.type==='out'&&e.id===0)F.react(f,'soaked');
    if(e.type==='splash'){const near=Math.max(0,1-Math.hypot(e.x-me.x,e.z-me.z)/14);if(near>0)F.react(f,'splash',{scale:near});}
  }
  s.events.length=0;
}
// Simple autopilot for the player: aim at the nearest visible opponent and fire, otherwise walk forward.
function pilot(s){
  const me=s.actors[0];if(!me.alive)return{};const o=C.eye(me);let best=null,bd=Infinity;
  for(const b of s.actors){if(!b.alive||b.team===me.team)continue;const t={x:b.x,y:b.y+1.1,z:b.z},d=Math.hypot(t.x-o.x,t.z-o.z);if(d<bd&&d<40&&C.lineOfSight(o,t)){bd=d;best=t;}}
  if(me.ammo[me.weapon]===0)C.reload(s);
  if(!best)return{forward:1,yaw:me.yaw+.01};
  return{yaw:Math.atan2(-(best.x-o.x),-(best.z-o.z)),pitch:Math.atan2(best.y-o.y,bd),fire:true};
}
// Real match: opponents and teammates are the game's bots, the player is driven by pilot().
function play(seed,teamSize,difficulty){
  const s=C.create({seed,teamSize,difficulty,target:15});C.start(s);
  const f=F.create(seed);let frozen=0,steps=0,maxTrauma=0,maxShake=0,soaks=0;
  while(s.phase==='playing'&&steps<60*200){
    const dt=1/60,gameDt=F.step(f,dt);frozen+=dt-gameDt;
    if(gameDt>0)C.tick(s,pilot(s),gameDt);
    soaks+=s.events.filter(e=>e.type==='out'&&e.by===0).length;
    reactTo(f,s);steps++;maxTrauma=Math.max(maxTrauma,f.trauma);
    const sh=F.shake(f);maxShake=Math.max(maxShake,Math.abs(sh.pitch),Math.abs(sh.yaw));
  }
  return{frozen,total:steps/60,maxTrauma,maxShake,soaks,phase:s.phase};
}

test('heavier events give stronger feedback: soak-out > hurt > shot',()=>{
  const W=F.WEIGHTS;
  assert.ok(W.soak.trauma>W.hurt.trauma&&W.hurt.trauma>W.shot.trauma,'trauma must rise with event weight (AGENTS §8 layering)');
  assert.ok(W.soak.marker>W.hitConfirm.marker,'a soak-out marker must outshine a plain hit');
  assert.ok(!W.shot.hitStop&&!W.hitConfirm.hitStop&&!W.hurt.hitStop,'hit-stop is reserved for soak-outs');
});

test('trauma stays capped and shake bounded under stacked heavy events',()=>{
  const f=F.create(3);for(let i=0;i<50;i++){F.react(f,'splash');F.react(f,'soaked');}
  assert.equal(f.trauma,1,'trauma must cap at 1');
  for(let i=0;i<120;i++){F.step(f,1/60);const sh=F.shake(f);assert.ok(Math.abs(sh.pitch)<=F.SHAKE_MAX&&Math.abs(sh.yaw)<=F.SHAKE_MAX,'shake exceeded SHAKE_MAX');}
  assert.equal(f.trauma,0,'full trauma must decay to zero within 1/TRAUMA_DECAY seconds');
});

test('a single shot barely shakes; trauma is squared so small events stay small',()=>{
  const f=F.create(4);F.react(f,'hurt',{scale:.3});const sh=F.shake(f);
  assert.ok(Math.abs(sh.pitch)<F.SHAKE_MAX*.01,'light hurt should move the camera <1% of max');
});

test('weapon and camera kick return to rest quickly so aim is not disturbed for the next shot',()=>{
  for(const weapon of [0,1,2]){
    const f=F.create(5);F.react(f,'shot',{weapon});let peak=0;
    for(let t=0;t<Math.round(.13*60);t++){F.step(f,1/60);peak=Math.max(peak,Math.abs(f.camKick.x));}
    // Fastest blaster fires every 0.13 s: by then the camera kick must be under 35% of its peak.
    assert.ok(Math.abs(f.camKick.x)<peak*.35+1e-6,`weapon ${weapon} camera kick ${f.camKick.x} still high at next shot`);
    for(let t=0;t<30;t++)F.step(f,1/60);
    assert.ok(Math.abs(f.gunZ.x)<.002&&Math.abs(f.gunPitch.x)<.004,`weapon ${weapon} gun did not settle within 0.63 s`);
  }
});

test('sound pitch jitter stays within ±6% and is reproducible by seed',()=>{
  const a=F.create(11),b=F.create(11),seen=[];
  for(let i=0;i<500;i++){const x=F.pitchJitter(a);assert.equal(x,F.pitchJitter(b));assert.ok(x>=1-F.PITCH_JITTER&&x<=1+F.PITCH_JITTER);seen.push(x);}
  assert.ok(Math.max(...seen)-Math.min(...seen)>F.PITCH_JITTER*1.6,'jitter should actually spread across the range');
});

test('hit-stop freezes only game time and never stacks past its cap',()=>{
  const f=F.create(6);F.react(f,'soak');F.react(f,'soak');F.react(f,'soak');
  assert.ok(f.hitStop<=F.HITSTOP_MAX+1e-9);let game=0,real=0;
  for(let i=0;i<12;i++){game+=F.step(f,1/60);real+=1/60;}
  assert.ok(Math.abs(real-game-F.HITSTOP_MAX)<1e-9,'frozen time must equal the capped hit-stop');
});

test('across real bot matches hit-stop stays under 2% of play time and the match still finishes',()=>{
  let anySoak=false;
  for(const [seed,size,diff] of [[1,3,'easy'],[2,4,'normal'],[3,6,'hard'],[4,6,'normal'],[5,3,'hard']]){
    const r=play(seed,size,diff);
    assert.equal(r.phase,'result',`seed ${seed} match did not finish`);
    assert.ok(r.frozen/r.total<.02,`seed ${seed}: hit-stop took ${(100*r.frozen/r.total).toFixed(2)}% of play`);
    assert.ok(r.maxShake<=F.SHAKE_MAX,`seed ${seed}: shake out of bounds`);
    if(r.soaks>0)anySoak=true;
  }
  assert.ok(anySoak,'sample matches must include at least one soak-out by the player, otherwise the hit-stop check is vacuous');
});
