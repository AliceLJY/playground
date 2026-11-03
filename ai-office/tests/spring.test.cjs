const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../office-core.js');

// Run a spring the way a page does: one springStep per frame at the given frame rate.
const byFrames=(fps,seconds,{k=600,ratio=.35,from=0,to=0,v=90,reduced=false}={})=>{
  const s=C.spring(k,ratio,reduced);s.x=from;s.target=to;s.v=v;
  for(let i=0;i<Math.round(fps*seconds);i++)C.springStep(s,1/fps);
  return s.x;
};

test('springs are frame-rate independent: 30 fps and 120 fps land on the same position (< 0.05 px)',()=>{
  for(const seconds of [.1,.3,.4,.8])for(const opts of [{},{k:260,ratio:.48,to:1,v:0},{k:120,ratio:.16,v:32}]) {
    const a=byFrames(30,seconds,opts),b=byFrames(120,seconds,opts);
    assert.ok(Math.abs(a-b)<.05,`${seconds}s ${JSON.stringify(opts)}: 30 fps ${a}, 120 fps ${b}`);
  }
  // The age-driven poses agree with frame-by-frame integration too, so the MV recorder can seek to any frame.
  const frames=byFrames(30,.4,{k:260,ratio:.48,to:1,v:0});
  assert.ok(Math.abs(C.greetPose(.4).arm-frames)<.05,'greetPose.arm is the same spring stepped per frame');
});

test('reduced motion never overshoots: damping ratio is lifted to 1, the squash is zero',()=>{
  for(const [k,ratio] of [[600,.35],[260,.48],[120,.16]]) {
    const s=C.spring(k,ratio,true);s.target=1;let peak=0;
    for(let i=0;i<240;i++){C.springStep(s,1/60);peak=Math.max(peak,s.x);}
    assert.ok(peak<=1+1e-9,`k ${k}: peak ${peak} > target`);
    assert.ok(s.c>=2*Math.sqrt(k)-1e-9,'damping ratio below 1 in reduced motion');
  }
  for(let t=0;t<C.HOP_SECONDS;t+=1/60){const h=C.hopAt(t,true);assert.equal(h.squash,0);assert.equal(h.widen,0);}
  let arm=0,pop=Infinity,signFlips=0,last=0;
  for(let t=0;t<1.5;t+=1/60){const p=C.greetPose(t,true);arm=Math.max(arm,p.arm);pop=Math.min(pop,p.pop);assert.ok(p.perk>=0);}
  assert.ok(arm<=1+1e-9,`reduced wave arm overshoots: ${arm}`);assert.ok(pop>=0,'reduced word bubble pops past its place');
  for(let t=0;t<C.SWAY_SECONDS;t+=1/60){const x=C.swayAt(t,true);if(x<0)signFlips++;last=x;}
  assert.equal(signFlips,0,'a reduced-motion sheet swings back past the pin');assert.equal(last,0);
});

test('normal motion does spring: landings squash, the wave overshoots, a new sheet swings both ways, all settle',()=>{
  let squash=0,stretch=0,arm=0,left=0,right=0;
  for(let t=0;t<C.HOP_SECONDS;t+=1/60){const h=C.hopAt(t);squash=Math.max(squash,h.squash);stretch=Math.min(stretch,h.squash);}
  for(let t=0;t<1.5;t+=1/60)arm=Math.max(arm,C.greetPose(t).arm);
  for(let t=0;t<C.SWAY_SECONDS;t+=1/60){const x=C.swayAt(t);left=Math.min(left,x);right=Math.max(right,x);}
  assert.ok(squash>=2&&squash<=3,`landing squash ${squash} rows`);assert.ok(stretch<0,'no stretch in the air');
  assert.ok(arm>1.08&&arm<1.3,`wave overshoot ${arm}`);
  assert.ok(right>=2&&left<=-1,`sheet swing ${left}..${right}`);
  // Settled: the last 0.25 s of the hop and the end of the sway are still, and nothing runs after the event is over.
  for(let t=C.HOP_SECONDS-.25;t<C.HOP_SECONDS;t+=1/60)assert.equal(C.hopAt(t).squash,0,`still squashing at ${t}`);
  assert.deepEqual(C.hopAt(C.HOP_SECONDS),{lift:0,squash:0,widen:0});assert.equal(C.swayAt(C.SWAY_SECONDS),0);
  assert.deepEqual(C.greetPose(1.5),C.greetPose(2.9),'the wave pose keeps integrating after it settled');
});

test('poses are whole logical pixels and survive bad input (NaN, negative age, huge dt)',()=>{
  for(let t=0;t<C.HOP_SECONDS;t+=1/97){const h=C.hopAt(t);for(const v of Object.values(h))assert.ok(Number.isInteger(v),`hop ${t}: ${JSON.stringify(h)}`);}
  for(let t=0;t<C.SWAY_SECONDS;t+=1/97)assert.ok(Number.isInteger(C.swayAt(t)));
  for(let t=0;t<1.5;t+=1/97){const p=C.greetPose(t);assert.ok(Number.isInteger(p.perk)&&Number.isInteger(p.pop)&&Number.isFinite(p.arm));}
  assert.deepEqual(C.hopAt(NaN),{lift:0,squash:0,widen:0});assert.deepEqual(C.hopAt(-1),{lift:0,squash:0,widen:0});
  assert.equal(C.swayAt(NaN),0);assert.deepEqual(C.greetPose(NaN),{arm:1,perk:0,pop:0});
  const s=C.spring(600,.35);s.target=1;C.springStep(s,NaN);C.springStep(s,-5);assert.equal(s.x,0);
  s.v=NaN;C.springStep(s,1/30);assert.equal(s.x,1,'NaN velocity is caught and the spring rests on its target');assert.equal(s.v,0);
  const wild=C.spring(1e12,0);wild.target=1;wild.v=1e300;C.springStep(wild,1);assert.ok(Number.isFinite(wild.x)&&Number.isFinite(wild.v));
});
