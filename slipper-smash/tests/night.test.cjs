const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),page=require('./page-harness.cjs');
const aspects=[.5625,1.78];

function run(seed,aspect,level,watch=()=>{}){
  const g=C.create({seed,aspect,mode:'night'}),pilot=level?C.pilot(level,seed):null;
  for(let i=0;i<120*80&&!g.state.result;i++){
    if(pilot)pilot(g);g.step(C.CFG.step);watch(g.state);g.state.events.length=0;
  }
  assert.ok(g.state.result,'a real round must terminate within its time budget');
  return g.state;
}

test('night: every third escaped bug steals a cup, and idle play really loses',()=>{
  for(const seed of [1,5,48]){
    let misses=0,stolen=0;
    const s=run(seed,.5625,null,s=>{
      misses+=s.events.filter(e=>e.type==='miss').length;
      stolen+=s.events.filter(e=>e.type==='stolen').length;
      assert.equal(s.misses,misses);assert.equal(s.night.pending,misses%3);
      assert.equal(s.lives,3-Math.floor(misses/3));assert.equal(s.night.stolen,stolen);
    });
    assert.equal(misses,9,'the sample must really contain nine escaped bugs');
    assert.equal(stolen,3);assert.equal(s.result.reason,'stolen');assert.equal(s.lives,0);
  }
});

test('night: accurate and shaky swipes across 100 seeds have real hits, thefts, spills and both outcomes',t=>{
  const human=[],precise=[];let bossMisses=0,escapedTea=0;
  for(let seed=1;seed<=100;seed++)for(const aspect of aspects){
    let teaIds=new Set();
    const watch=s=>{
      bossMisses+=s.boss?s.events.filter(e=>e.type==='miss').length:0;
      const now=new Set(s.ents.filter(e=>e.kind==='tea').map(e=>e.id));
      if(!s.events.some(e=>e.type==='tea'))for(const id of teaIds)if(!now.has(id))escapedTea++;
      teaIds=now;
      assert.equal(s.night.pending,s.misses%3,'only a full group resets the pending count');
      assert.equal(s.night.stolen,Math.floor(s.misses/3));
      assert.equal(s.lives,3-s.night.stolen-s.night.spilled,'spills and thefts each cost exactly one cup');
    };
    human.push(run(seed,aspect,'human',watch).result);
    precise.push(run(seed,aspect,'precise').result);
  }
  const wins=human.filter(r=>r.reason==='win').length;
  assert.ok(wins>0&&wins<human.length,`shaky play must neither always lose nor always win: ${wins}/${human.length}`);
  assert.ok(precise.every(r=>r.reason==='win'&&r.lives>0&&r.kills>0),'accurate real swipes complete the challenge');
  assert.ok(human.some(r=>r.night.stolen>0)&&human.some(r=>r.night.spilled>0),'the samples must actually include both penalties');
  assert.ok(human.some(r=>r.reason==='stolen'),'the added miss penalty must really cause a defeat');
  assert.ok(bossMisses>0&&escapedTea>0,'boss misses and safely falling cups must actually occur');
  t.diagnostic(JSON.stringify({rounds:human.length,wins,bossMisses,escapedTea,stolen:human.reduce((n,r)=>n+r.night.stolen,0),spilled:human.reduce((n,r)=>n+r.night.spilled,0)}));
});

test('night: partial miss group and remaining cups carry into the boss, finish freezes them',()=>{
  for(const seed of [1,5,48]){
    const g=C.create({seed,mode:'night'}),p=C.pilot('precise',seed),s=g.state;
    while(s.misses<4)g.step(C.CFG.step);
    assert.equal(s.lives,2);assert.equal(s.night.pending,1);
    while(s.phase==='waves'){p(g);g.step(C.CFG.step);}
    assert.equal(s.night.bossLives,2);assert.equal(s.lives,2);assert.equal(s.night.pending,1);
    const before=s.misses;
    while(!s.result)g.step(C.CFG.step);
    assert.ok(s.misses>before,'boss throws must actually escape');
    assert.equal(s.result.reason,'stolen');assert.equal(s.result.night.bossLives,2);
    const finished=JSON.stringify(s);g.step(1);g.swipe(0,0,s.W,1000);
    assert.equal(JSON.stringify(s),finished,'no extra deductions after the final cup');
  }
});

// Drive the real pointer handlers, with CSS coordinates from the page hook.
// This deliberately does not call hook.autopilot(), hook.start() or core.swipe().
function playPage(p,careful=true){
  let strokes=0,stalled=0,lastTime=-1;
  for(let i=0;i<80*40;i++){
    const q=p.hook.probe(),s=q.state;if(q.screen==='result')return{strokes,state:s};
    if(s.phase!=='over'){
      stalled=s.t===lastTime?stalled+1:0;lastTime=s.t;assert.ok(stalled<4,'active simulation must not get stuck');
      const teas=s.ents.filter(e=>e.kind==='tea'),scale=q.view.scale/q.dpr;
      let target=careful?s.ents.find(e=>e.kind!=='tea'&&e.x>12&&e.x<q.css[0]-12&&e.y>60&&e.y<q.css[1]-40):teas.find(e=>e.y>60&&e.y<q.css[1]-40);
      if(!target&&careful&&s.phase==='boss')target=s.boss;
      if(target&&(!careful||teas.every(e=>Math.hypot(e.x-target.x,e.y-target.y)>e.r+40*scale))){
        p.pointer('pointerdown',target.x,target.y);p.pointer('pointermove',target.x+2,target.y);p.pointer('pointerup',target.x+2,target.y);strokes++;
      }
    }
    p.hook.advance(.025);
  }
  assert.fail('real input sequence did not reach a result');
}
function enter(p){p.el('night-entry').fire('click');assert.equal(p.hook.probe().screen,'nightMenu');p.el('night-start').fire('click');assert.equal(p.hook.probe().state.mode,'night');}

test('night: real menu and swipe sequence completes, retries, then returns to untouched casual play',()=>{
  const p=page();enter(p);const r=playPage(p);
  assert.ok(r.strokes>20&&r.state.kills>0,'the winning sample must actually swipe and hit bugs');
  assert.equal(r.state.result.reason,'win');assert.ok(r.state.result.lives>0);
  assert.ok(+p.win.localStorage.getItem('slipper-night-best')>0);
  assert.equal(p.win.localStorage.getItem('slipper-best'),undefined,'night scores must not overwrite the original record');
  p.hook.advance(1);p.el('night-retry').fire('click');
  assert.equal(p.hook.probe().state.mode,'night');assert.equal(p.hook.probe().state.lives,3);
  p.hook.advance(20);assert.equal(p.hook.probe().state.result.reason,'stolen');
  p.el('night-return').fire('click');assert.equal(p.hook.probe().screen,'title');assert.equal(p.hook.probe().state,null);
  p.win.fire('keydown',{key:'Enter'});const s=p.hook.probe();
  assert.equal(s.state.mode,'casual');assert.equal(s.state.night,null);assert.equal(s.state.lives,3);
  assert.equal(s.state.score,0);assert.equal(s.state.misses,0);assert.equal(s.paused,false);assert.equal(s.gestureActive,false);
  p.hook.advance(20);assert.ok(p.hook.probe().state.misses>=9);assert.equal(p.hook.probe().state.lives,3,'casual misses never cost cups');
});

test('night: reckless actual inputs lose cups, retry clears all challenge counters and can win',()=>{
  const p=page();enter(p);const r=playPage(p,false);
  assert.ok(r.strokes>0&&r.state.night.spilled>0,'must actually hit a tea cup');assert.equal(r.state.lives,0);
  p.hook.advance(1);p.pointer('pointerdown');p.pointer('pointerup');
  const s=p.hook.probe().state;assert.equal(s.lives,3);assert.equal(s.night.pending,0);assert.equal(s.night.stolen,0);assert.equal(s.night.spilled,0);
  assert.equal(playPage(p).state.result.reason,'win');
  p.el('night-return').fire('click');p.pointer('pointerdown');p.pointer('pointerup');assert.equal(p.hook.probe().state.mode,'casual');
});

test('night: pause, mute and interrupted touch preserve the miss group, and menu Escape cancels selection',()=>{
  const p=page();enter(p);p.hook.advance(4);p.pointer('pointerdown',10,300);p.win.fire('blur');
  const before=JSON.stringify(p.hook.probe().state);p.hook.advance(30);p.el('pause-mute').fire('click');
  assert.equal(JSON.stringify(p.hook.probe().state),before);assert.equal(p.hook.probe().gestureActive,false);
  p.el('resume').fire('click');p.pointer('pointerdown',10,300);p.pointer('pointercancel');assert.equal(p.hook.probe().gestureActive,false);
  p.hook.advance(.1);assert.equal(p.hook.probe().paused,false);
  p.hook.advance(20);p.el('night-return').fire('click');p.el('night-entry').fire('click');
  p.win.fire('keydown',{key:'Escape'});p.win.fire('keydown',{key:' '});assert.equal(p.hook.probe().state.mode,'casual');
});
