// Input and page-state checks that run the real handlers in src/game.js (spec 7.10).
const test=require('node:test'),assert=require('node:assert/strict'),page=require('./page-harness.cjs');
const C=require('../src/core.js');
function playing(seed=4){const p=page();p.el('start-btn').fire('click');p.hook.start(seed);return p;}
const queued=p=>p.hook.probe().state.queue;

test('keys, WASD, on-screen arrows and swipes all queue the same turn',()=>{
  const cases=[['key ArrowRight',p=>p.key('ArrowRight')],['key D',p=>p.key('KeyD')],['button right',p=>p.dirs[1].fire('pointerdown')],
    ['swipe right',p=>{p.pointer('pointerdown',100,300);p.pointer('pointermove',130,302);p.pointer('pointerup',130,302);}]];
  for(const [name,act] of cases){const p=playing();act(p);const s=p.hook.probe().state;
    assert.equal(s.queue,1,'spec 7.10: '+name+' should queue one turn');
    p.hook.advance(0.4);assert.equal(p.hook.probe().state.dir,1,'spec 7.10: '+name+' should end up heading right');}
});

test('the on-screen arrow turns on press, without waiting for release',()=>{
  const p=playing();p.dirs[3].fire('pointerdown');assert.equal(queued(p),1,'spec 5: pointerdown alone must queue the turn');
});

test('one long swipe can bend twice; release and cancel end the swipe',()=>{
  const p=playing();p.pointer('pointerdown',100,300);p.pointer('pointermove',130,300);p.pointer('pointermove',130,330);
  assert.equal(queued(p),2,'a right-then-down drag should queue two turns');
  assert.equal(p.hook.probe().gestureActive,true);
  p.pointer('pointercancel',130,330);assert.equal(p.hook.probe().gestureActive,false,'spec 7.10: pointercancel must end the swipe');
  p.pointer('pointerdown',100,300);p.el('stage').fire('lostpointercapture',{pointerId:1});assert.equal(p.hook.probe().gestureActive,false,'lostpointercapture must end the swipe');
  p.pointer('pointerdown',100,300);p.pointer('pointerup',100,300);assert.equal(p.hook.probe().gestureActive,false);
});

test('skill buttons and keys reach the same intents as the rules',()=>{
  const p=playing(4);p.hook.advance(14);const before=p.hook.probe().state.len;
  p.el('btn-compress').fire('pointerdown');const after=p.hook.probe().state.len;
  assert.equal(after,before-C.compressCut(before),'spec 7.10: the compress button compresses');
  const q=playing(4);q.hook.advance(14);const b2=q.hook.probe().state.len;q.key('KeyQ');assert.equal(q.hook.probe().state.len,b2-C.compressCut(b2),'Q compresses');
  const r=playing(4);r.hook.advance(30);const l3=r.hook.probe().state.len;r.key('KeyE');
  assert.equal(r.hook.probe().state.subs.length,1,'E dispatches a sub-agent');assert.equal(r.hook.probe().state.len,l3-4);
  const u=playing(4);u.hook.advance(30);u.el('btn-dispatch').fire('pointerdown');assert.equal(u.hook.probe().state.subs.length,1,'the dispatch button dispatches');
});

test('pause freezes time, length and sub-agents; blur and hidden pages pause too',()=>{
  const p=playing(4);p.hook.advance(30);p.key('KeyE');assert.equal(p.hook.probe().state.subs.length,1);
  p.el('pause-btn').fire('click');const a=p.hook.probe();assert.equal(a.paused,true);
  for(let i=0;i<120;i++)p.frame(16);
  const b=p.hook.probe();assert.equal(b.state.t,a.state.t,'spec 7.10: time must not run while paused');
  assert.equal(b.state.len,a.state.len);assert.deepEqual(b.state.subs,a.state.subs,'sub-agents must not move while paused');
  p.key('ArrowLeft');assert.equal(p.hook.probe().state.queue,a.state.queue,'input while paused is ignored');
  p.el('resume-btn').fire('click');for(let i=0;i<20;i++)p.frame(16);assert.ok(p.hook.probe().state.t>a.state.t,'time resumes after 继续');
  p.win.fire('blur');assert.equal(p.hook.probe().paused,true,'blur pauses');
  const q=playing();q.doc.hidden=true;q.doc.fire('visibilitychange');assert.equal(q.hook.probe().paused,true,'a hidden page pauses');
});

test('a finished round restarts clean from the result page and from the title',()=>{
  const p=page();p.el('start-btn').fire('click');p.hook.start(11).autopilot('reckless');
  for(let i=0;i<60*40&&p.hook.probe().screen==='play';i++)p.frame(16.7);
  assert.equal(p.hook.probe().screen,'result','the reckless pilot should lose');
  p.el('again-btn').fire('click');const s=p.hook.probe();
  assert.equal(s.screen,'play');assert.equal(s.state.score,0);assert.equal(s.state.len,C.CFG.startLen);assert.equal(s.state.subs.length,0);assert.equal(s.state.queue,0);
  for(let i=0;i<30;i++)p.frame(16.7);assert.equal(p.hook.probe().state.subs.length,0,'no autopilot left driving after a restart');
  p.el('pause-btn').fire('click');p.el('pause-btn');p.el('resume-btn').fire('click');
  const q=page();q.key('Enter');assert.equal(q.hook.probe().screen,'play','Enter starts from the title');
});

test('the result page names a real story that matches what happened',()=>{
  const p=page();p.el('start-btn').fire('click');p.hook.start(11).autopilot('reckless');
  for(let i=0;i<60*40&&p.hook.probe().screen==='play';i++)p.frame(16.7);
  for(let i=0;i<30;i++)p.frame(16.7);
  const all=p.texts.join('|');
  assert.match(all,/上下文污染/,'the result title names 上下文污染');
  assert.match(all,/真事/,'spec 8: the result page carries one real-story line');
});

test('the shared playtest hook works',()=>{
  const p=page();assert.equal(p.playtest.ready,true);
  const a=p.playtest.setSeed(7);assert.equal(a.screen,'play');assert.equal(a.seed,7);
  const b=p.playtest.step(1000);assert.ok(Math.abs(b.state.t-1)<0.02);
  const c=p.playtest.reset();assert.equal(c.state.t,0);
});

test('the skill buttons say when to press and when not to, with colour and dots instead of words',()=>{
  // compress pulses pink once turns lag and it is ready; dispatch turns red when all three slots are out
  let hinted=0,warned=0,hintWrong=0,warnWrong=0;
  // the precise pilot keeps three out early; the shaky one lets turns start to lag before it compresses
  for(const [seed,level] of [[3,'precise'],[2,'human']]){
  const p=page();p.el('start-btn').fire('click');p.hook.start(seed).autopilot(level);
  for(let i=0;i<60*110&&p.hook.probe().screen==='play';i++){
    p.hook.advance(1/60);const s=p.hook.probe().state;
    const h=p.el('btn-compress').classList.contains('hint'),w=p.el('btn-dispatch').classList.contains('warn');
    if(h)hinted++;if(w)warned++;
    if(h&&s.delay<1)hintWrong++;
    if(w&&s.subs.length<3&&s.stats.bursts===0)warnWrong++;
  }}
  assert.ok(hinted>0,'self-check: the compress hint must actually light up in a real round');
  assert.ok(warned>0,'self-check: the dispatch warning must actually light up when three are out');
  assert.equal(hintWrong,0,'the compress hint only lights while turns lag');
  assert.equal(warnWrong,0,'the dispatch warning only lights with three out (or during the 429 lock)');
});

test('the speed button cycles slow, medium, fast, starts rounds at that speed and is remembered',()=>{
  const p=page();assert.equal(p.el('speed-btn').textContent,'速度：慢','slow is the default on a fresh device');
  p.el('speed-btn').fire('click');assert.equal(p.el('speed-btn').textContent,'速度：中');
  p.el('start-btn').fire('click');assert.equal(p.hook.probe().state.speed,'normal','a round starts at the picked speed');
  p.el('speed-btn').fire('click');p.el('speed-btn').fire('click');assert.equal(p.el('speed-btn').textContent,'速度：慢','it wraps back to slow');
  assert.equal(p.win.localStorage.getItem('context-snake-speed'),'slow','the choice is kept on this device');
});
