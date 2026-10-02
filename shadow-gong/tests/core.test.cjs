const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const STEP=C.STEP;

// A quiet arena: one opponent placed by hand, no director spawns.
function arena(kind,x=1.7,seed=5){
  const s=C.create({seed});C.start(s,{wave:0});C.beginWave(s,0);s.spawnIdx=99;s.events.length=0;
  const e=C.spawn(s,kind,Math.sign(x),{x,state:'idle'});e.cool=99;e.face=-Math.sign(x);
  Object.assign(s.player,{x:0,face:Math.sign(x)});
  return[s,e];
}
function attack(s,e,move){C.startMove(s,e,move);s.tokens.holders.push(e.id);}
// Steps from the start of a move until strike k resolves, found by a dry run.
function strikeStep(kind,move,k=0,x){
  const [s,e]=arena(kind,x);attack(s,e,move);
  for(let i=0;i<1200;i++){C.step(s,{},STEP);if(s.events.some(ev=>ev.type==='strike'&&ev.strike===k))return i;s.events.length=0;}
  throw new Error('strike never resolved');
}
// Play a move with a scripted input per step; returns the outcome of each strike plus the state.
function play(kind,move,script,{x,rate,extra}={}){
  const [s,e]=arena(kind,x);if(rate)e.rate=rate;attack(s,e,move);if(extra)extra(s,e);
  const out={},events=[];
  for(let i=0;i<1200&&(e.state==='attack'||i<5);i++){
    C.step(s,script(i)||{},STEP);
    for(const ev of s.events){events.push(ev);if(ev.type==='strike'&&ev.id===e.id)out[ev.strike]=ev.outcome;}
    s.events.length=0;
  }
  return{out,events,s,e};
}
const at=(stepsBefore,hit)=>hit-Math.round(stepsBefore/STEP);

test('a press up to 0.16 s before the blow is a perfect parry, the same step included; earlier is a plain block',()=>{
  const hit=strikeStep('scissors','snip');
  const outcome=(ago,holdSteps=Infinity)=>{const p=at(ago,hit);return play('scissors','snip',i=>({blockPressed:i===p,blockDown:i>=p&&i<p+holdSteps})).out[0];};
  for(const ago of [0,STEP,.08,.15,.158])assert.equal(outcome(ago),'perfect',`pressed ${ago} s before the blow`);
  for(const ago of [.175,.25,.5])assert.equal(outcome(ago),'block',`pressed ${ago} s before the blow`);
  assert.equal(outcome(.12,1),'perfect','a quick tap keeps the gong up long enough');
  assert.equal(outcome(.3,1),'hurt','a tap long before the blow has already dropped the gong');
  assert.equal(play('scissors','snip',()=>({})).out[0],'hurt','no guard at all');
});

test('holding the guard from the start of the swing is only a plain block',()=>{
  const r=play('scissors','snip',i=>({blockPressed:i===0,blockDown:true}));
  assert.equal(r.out[0],'block');assert.equal(r.out[1],'block');
});

test('mashing shrinks the window: five presses inside 0.4 s leave less than 0.04 s',()=>{
  const hit=strikeStep('scissors','snip'),hit2=strikeStep('scissors','snip',1);
  const presses=[.42,.34,.26,.18,.10].map(a=>at(a,hit)),clean=at(.08,hit2);
  const r=play('scissors','snip',i=>({blockPressed:presses.includes(i)||i===clean,blockDown:i>=presses[0]}));
  const windows=r.events.filter(ev=>ev.type==='press').map(ev=>ev.window);
  assert.ok(windows[4]<.04,'window after five quick presses: '+windows[4]);
  assert.equal(r.out[0],'block','a mashed press 0.10 s early is not perfect');
  assert.ok(Math.abs(windows[5]-C.FEEL.parryWindow)<1e-9,'one clean press later gets the full window back');
  assert.equal(r.out[1],'perfect');
});

test('the parry stance covers a follow-up from the front for 0.42 s, but not one from behind',()=>{
  const hit=strikeStep('scissors','snip'),press=at(.08,hit),later=hit+Math.round(.3/STEP);
  // a second opponent whose blow lands 0.3 s after the first, started on the right step
  const second=(kind,x,move)=>(s,e)=>{
    const o=C.spawn(s,kind,Math.sign(x),{x,state:'idle'});o.cool=99;o.face=-Math.sign(x);
    const lead=Math.round(C.KINDS[kind].moves[move].strikes[0].hit/o.rate/STEP);
    s.secondAt=later-lead;s.second=o;s.secondMove=move;
  };
  const scenario=(kind,x,move,script)=>{
    const [s,e]=arena('scissors');attack(s,e,'snip');second(kind,x,move)(s,e);const res={};
    for(let i=0;i<400;i++){
      if(i===s.secondAt){C.startMove(s,s.second,s.secondMove);s.tokens.holders.push(s.second.id);}
      C.step(s,script(i),STEP);
      for(const ev of s.events)if(ev.type==='strike')res[ev.id===e.id?'first':'second']=res[ev.id===e.id?'first':'second']||ev.outcome;
      s.events.length=0;
    }
    return res;
  };
  const front=scenario('scissors',2.6,'thrust',i=>({blockPressed:i===press,blockDown:i>=press}));
  assert.deepEqual(front,{first:'perfect',second:'perfect'},'no second press needed for a blow from the front inside the stance');
  const behind=scenario('moth',-1.8,'pounce',i=>({blockPressed:i===press,blockDown:i>=press}));
  assert.equal(behind.first,'perfect');assert.equal(behind.second,'hurt','the stance faces one way');
  const turned=scenario('moth',-1.8,'pounce',i=>({blockPressed:i===press||i===at(.06,later),blockDown:i>=press}));
  assert.equal(turned.second,'perfect','pressing again turns the gong to the new threat');
});

test('telegraphs lead every blow by 0.40 s (red ones by 0.55 s) of simulation time at any swing speed',()=>{
  for(const kind of Object.keys(C.KINDS))for(const move of Object.keys(C.KINDS[kind].moves))for(const rate of [.9,1,1.12]){
    const r=play(kind,move,()=>({}),{rate,x:kind==='rat'?2:1.7});
    const tel=r.events.filter(ev=>ev.type==='telegraph'),hits=r.events.filter(ev=>ev.type==='strike');
    const strikes=C.KINDS[kind].moves[move].strikes;
    assert.equal(tel.length,strikes.length,`${kind}.${move} telegraphs`);assert.equal(hits.length,strikes.length,`${kind}.${move} blows`);
    for(const st of strikes){
      const k=strikes.indexOf(st),lead=hits.find(h=>h.strike===k).t-tel.find(t=>t.strike===k).t;
      const want=st.unblockable?C.FEEL.leadRed:C.FEEL.lead;
      assert.ok(Math.abs(lead-want)<=STEP+1e-9,`${kind}.${move} strike ${k} at rate ${rate}: lead ${lead.toFixed(4)} s`);
    }
  }
});

// Full matches, one simulation step per call so every step is inspected.
function match(seed,human,visit){
  const s=C.create({seed});C.start(s);let frames=0;
  while(!['won','lost'].includes(s.phase)&&frames<120*900){s.events.length=0;C.run(s,1/120,C.autopilot(s,{human}));frames++;if(visit)visit(s);}
  return{s,minutes:frames/120/60};
}

test('at most two opponents are mid-attack; grants are 0.7 s apart and blows 0.35 s apart',()=>{
  for(const human of [false,true])for(const seed of [3,8]){
    let most=0;const grants=[],blows=[];
    match(seed,human,s=>{
      most=Math.max(most,s.enemies.filter(e=>e.state==='attack').length);
      for(const ev of s.events){if(ev.type==='token')grants.push(ev.t);if(ev.type==='strike')blows.push(ev.t);}
    });
    assert.ok(most<=2,`seed ${seed}: ${most} attacking at once`);
    for(let i=1;i<grants.length;i++)assert.ok(grants[i]-grants[i-1]>=C.FEEL.grantGap-1e-9,`grant gap ${grants[i]-grants[i-1]}`);
    blows.sort((a,b)=>a-b);
    for(let i=1;i<blows.length;i++)assert.ok(blows[i]-blows[i-1]>=C.FEEL.hitGap-STEP,`blows ${blows[i-1].toFixed(3)} and ${blows[i].toFixed(3)} too close`);
  }
});

test('a crowd of six ready blades still takes turns',()=>{
  const s=C.create({seed:9});C.start(s,{wave:1});C.beginWave(s,1);s.spawnIdx=99;
  for(const x of [-2.2,-3.4,-4.6,2.2,3.4,4.6]){const e=C.spawn(s,'scissors',Math.sign(x),{x,state:'idle'});e.cool=0;}
  let most=0,ready=0;
  for(let i=0;i<120*12;i++){
    s.events.length=0;C.run(s,1/120,C.autopilot(s));
    const attacking=s.enemies.filter(e=>e.state==='attack').length;most=Math.max(most,attacking);
    if(attacking===2&&s.enemies.some(e=>e.state!=='attack'&&e.state!=='dead'&&e.cool<=0))ready++;
  }
  assert.equal(most,2,'the cap is reached but never passed');
  assert.ok(ready>0,'some ready blades had to wait for a token');
});

test('perfect parry and plain block feel different: hit-stop, slow motion, sparks, flare and sound',()=>{
  const hit=strikeStep('scissors','snip');
  const after=(ago,hold)=>{
    const [s,e]=arena('scissors');attack(s,e,'snip');const p=at(ago,hit);let ev=null;
    for(let i=0;i<=hit;i++){C.step(s,{blockPressed:i===p,blockDown:i>=p},STEP);ev=s.events.find(x=>x.type==='parry')||ev;}
    const scaleNow=C.timeScale(s),flare=s.feel.flare,t0=s.time;let scaleAt=1;
    for(let f=1;f<=36;f++){C.run(s,1/60,{blockDown:hold});if(f===12)scaleAt=C.timeScale(s);}
    return{ev,scaleNow,flare,scaleAt,progress:s.time-t0};
  };
  const perfect=after(.08,true),plain=after(.3,true);
  assert.equal(perfect.ev.perfect,true);assert.equal(plain.ev.perfect,false);
  assert.ok(perfect.scaleNow<=.05,'hit-stop freezes time: '+perfect.scaleNow);
  assert.ok(perfect.scaleAt<=.45,'slow motion after the hit-stop: '+perfect.scaleAt);
  assert.ok(perfect.progress<=.36,'0.6 s of real time moves only '+perfect.progress.toFixed(3)+' s of game time');
  assert.equal(plain.scaleAt,1,'no slow motion on a plain block');
  assert.ok(plain.progress>=.5,'plain block barely pauses: '+plain.progress.toFixed(3));
  assert.ok(perfect.ev.sparks>=3*plain.ev.sparks,`sparks ${perfect.ev.sparks} vs ${plain.ev.sparks}`);
  assert.notEqual(perfect.ev.sound,plain.ev.sound);
  assert.ok(perfect.flare>.3&&plain.flare===0,'the lamp jumps only for a perfect parry');
});

test('red blows ignore the gong; a dodge slips through them',()=>{
  const hit=strikeStep('rat','fling',0,2);
  const guard=play('rat','fling',i=>({blockPressed:i===at(.08,hit),blockDown:i>=at(.08,hit)}),{x:2});
  assert.equal(guard.out[0],'hurt');
  const dodge=play('rat','fling',i=>({dodgePressed:i===at(.18,hit),left:i===at(.18,hit)}),{x:2});
  assert.equal(dodge.out[0],'evade');
});

test('only an opened opponent takes the drumstick; a turned blow still lets you guard',()=>{
  const [s,e]=arena('scissors',1.5);
  C.step(s,{attackPressed:true},STEP);for(let i=0;i<70;i++)C.step(s,{},STEP);
  assert.ok(s.events.some(ev=>ev.type==='deflect'),'blades turn a cold swing');assert.equal(e.hp,C.KINDS.scissors.hp);
  assert.equal(s.player.state,'idle');
  const [t]=arena('scissors',1.5);
  C.step(t,{attackPressed:true},STEP);for(let i=0;i<16;i++)C.step(t,{},STEP);
  assert.equal(t.player.state,'bounced');C.step(t,{blockPressed:true,blockDown:true},STEP);assert.equal(t.player.state,'guard');
  // after a perfect parry the first answer lands with the bonus, a second one is turned again
  const hit=strikeStep('scissors','snip'),p=at(.08,hit),swing1=hit+6,swing2=hit+50;
  const r=play('scissors','snip',i=>({blockPressed:i===p,blockDown:i>=p&&i<hit+3,attackPressed:i===swing1||i===swing2}));
  const hits=r.events.filter(ev=>ev.type==='hit'),turned=r.events.filter(ev=>ev.type==='deflect');
  assert.equal(hits.length,1);assert.equal(hits[0].counter,true);assert.equal(hits[0].dmg,1.5);
  assert.ok(turned.length>=1,'the second swing inside the same opening is turned');
});

test('posture breaks into an execution: blades after two combos, the rat king one mark at a time',()=>{
  const hit1=strikeStep('scissors','snip'),hit2=strikeStep('scissors','snip',1);
  const [s,e]=arena('scissors');let stunned=false;
  for(const round of [0,1]){
    attack(s,e,'snip');
    for(let i=0;i<260&&!stunned;i++){
      const inp={blockPressed:i===at(.06,hit1)||i===at(.06,hit2),blockDown:(i>=at(.06,hit1)&&i<hit1+2)||(i>=at(.06,hit2)&&i<hit2+2),attackPressed:i===hit1+8||i===hit2+8};
      C.step(s,inp,STEP);if(s.events.some(ev=>ev.type==='stun'))stunned=true;s.events.length=0;
    }
    if(stunned)break;
    for(let i=0;i<60&&e.state==='attack';i++)C.step(s,{},STEP);
    assert.equal(round,0,'two full combos are enough');
  }
  assert.ok(stunned&&e.state==='stun');
  C.step(s,{attackPressed:true},STEP);for(let i=0;i<80;i++)C.step(s,{},STEP);
  assert.ok(s.events.some(ev=>ev.type==='execute'),'execution lands');assert.ok(e.state==='dead'||e.gone);

  const [r,rat]=arena('rat',1.6);assert.equal(rat.hp,3);
  C.setState(rat,'stun',2.2);C.step(r,{attackPressed:true},STEP);for(let i=0;i<80;i++)C.step(r,{},STEP);
  assert.equal(rat.hp,2,'one execution, one mark');assert.equal(rat.phase2,false);
  r.player.counterUntil=r.time+1;C.step(r,{attackPressed:true},STEP);for(let i=0;i<60;i++)C.step(r,{},STEP);
  assert.equal(rat.hp,2,'swings never put out a mark');
  C.setState(rat,'stun',2.2);rat.x=r.player.x+1.6*r.player.face;C.step(r,{attackPressed:true},STEP);for(let i=0;i<80;i++)C.step(r,{},STEP);
  assert.equal(rat.hp,1);assert.equal(rat.phase2,true,'the last mark starts the second phase');
  assert.equal(rat.rate,1.12);assert.equal(r.enemies.filter(o=>o.kind==='moth').length,2,'two moths answer the call');
});

test('both autopilots finish: exact presses win every seed quickly; shaky presses mostly win in time',()=>{
  const exact=[],shaky=[];
  for(let seed=1;seed<=8;seed++){
    const a=match(seed,false);exact.push(a);
    assert.equal(a.s.phase,'won');assert.equal(a.s.stats.hurt,0,'exact autopilot takes no blows');
    assert.ok(a.minutes>=1.6&&a.minutes<=2.6,`exact seed ${seed}: ${a.minutes.toFixed(2)} min`);
    shaky.push(match(seed,true));
  }
  const won=shaky.filter(r=>r.s.phase==='won');
  assert.ok(won.length>=7,`shaky autopilot won ${won.length}/8`);
  for(const r of won)assert.ok(r.minutes>=1.9&&r.minutes<=3.5,`shaky run ${r.minutes.toFixed(2)} min`);
  assert.ok(shaky.some(r=>r.s.stats.block>0&&r.s.stats.hurt>0),'the shaky model really does miss');
});

test('pause freezes the match; the same seed replays identically',()=>{
  const s=C.create({seed:4});C.start(s);for(let i=0;i<600;i++)C.run(s,1/60,C.autopilot(s));
  C.pause(s,true);const before=JSON.stringify(s);C.run(s,1/60,{left:true,attackPressed:true,blockPressed:true});
  assert.equal(JSON.stringify(s),before);C.pause(s,false);assert.equal(s.paused,false);
  const replay=seed=>{const r=C.create({seed});C.start(r);const log=[];for(let i=0;i<3000;i++){r.events.length=0;C.run(r,1/60,C.autopilot(r,{human:true}));for(const ev of r.events)log.push(ev.type+ev.t);}return log.join('|')+r.time;};
  assert.equal(replay(12),replay(12));
});

test('an empty lamp loses the match; retry restarts at the rat king once he was reached',()=>{
  const [s,e]=arena('scissors');s.player.hp=5;attack(s,e,'snip');
  for(let i=0;i<120*3&&s.phase!=='lost';i++)C.step(s,{},STEP);
  assert.equal(s.phase,'lost');assert.equal(s.player.hp,0);
  C.retry(s);assert.equal(s.startWave,0);
  const b=C.create({seed:2});C.start(b,{wave:3});b.player.hp=1;for(let i=0;i<120*40&&b.phase!=='lost';i++)C.step(b,{},STEP);
  assert.equal(b.phase,'lost');C.retry(b);assert.equal(b.startWave,3);assert.equal(b.player.hp,100);
  C.start(b);assert.equal(b.bossReached,false,'starting over from the first scene clears the checkpoint');
  for(let i=0;i<120*3&&b.phase!=='lost';i++){if(b.phase==='fight'){b.player.hp=0;b.loseAt=b.time;}C.step(b,{},STEP);}
  C.retry(b);assert.equal(b.startWave,0,'a loss before the rat king retries from the first scene');
});

test('fixed camera scenarios reach the moments the spec lists',()=>{
  const hero=C.scenario('hero');
  assert.ok(hero.events.some(ev=>ev.type==='parry'&&ev.perfect&&ev.kind==='scissors'),'hero: a perfect parry on a blade');
  assert.equal(hero.wave,1);
  const wide=C.scenario('wide');
  assert.ok(wide.events.some(ev=>ev.type==='telegraph'&&ev.kind==='moth'));assert.equal(wide.wave,2);
  const stress=C.scenario('stress');
  assert.ok(stress.enemies.some(e=>e.kind==='rat'&&e.phase2));assert.equal(stress.tokens.holders.length,2);
  assert.ok(stress.enemies.filter(e=>e.kind==='moth').length>=2);
});
