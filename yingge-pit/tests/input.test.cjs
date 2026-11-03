const test=require('node:test'),assert=require('node:assert/strict'),page=require('./page-harness.cjs');
test('real solo/duo pad layout has at least 48 CSS px height and 8 px bottom room',()=>{
  for(const [w,h] of [[390,664],[320,568],[844,340],[1365,900]])for(const mode of ['solo','duo']){
    const p=page(w,h);p.hook.start(5,mode);const pads=p.hook.probe().pads;
    assert.ok(pads.length>=3);
    for(const b of pads){assert.ok(b.h>=48-1e-6,`${w}x${h} ${mode}: height ${b.h}`);assert.ok(b.w>=44,`${w} ${mode}: width ${b.w}`);assert.ok(b.y+b.h<=h-8+1e-6,`${w}: bottom ${b.y+b.h}`);}
  }
});
test('pause freezes threats and scores; three beats elapse before the same round resumes',()=>{
  const p=page();p.hook.start(5,'duo').advance(2.1);p.el('pause-btn').fire('click');
  const before=JSON.stringify(p.hook.probe().state);p.hook.advance(3);
  assert.equal(JSON.stringify(p.hook.probe().state),before);
  p.pointer('pointerdown');p.win.fire('keydown',{key:'a'});p.hook.advance(.1);
  assert.equal(JSON.stringify(p.hook.probe().state),before,'pause consumes taps and keyboard attacks');
  p.el('resume').fire('click');p.hook.advance(1.6);assert.equal(JSON.stringify(p.hook.probe().state),before,'three beats at 104 BPM');
  p.hook.advance(.3);assert.ok(p.hook.probe().state.t>2.1);assert.equal(p.hook.probe().mode,'duo');
});
test('Escape, blur and visibility pause, including interruption of the resume count',()=>{
  for(const event of ['keydown','blur','visibilitychange']){
    const p=page();p.hook.start(5).advance(1);
    if(event==='visibilitychange'){p.doc.hidden=true;p.doc.fire(event);}else p.win.fire(event,{key:'Escape'});
    const before=JSON.stringify(p.hook.probe().state);p.hook.advance(3);assert.equal(JSON.stringify(p.hook.probe().state),before,event);
    p.doc.hidden=false;p.doc.fire('visibilitychange');p.el('resume').fire('click');p.hook.advance(.5);
    p.win.fire('blur');p.hook.advance(3);assert.equal(JSON.stringify(p.hook.probe().state),before,'blur during count must wait again');
  }
});
test('pause sound switch is available without changing the round',()=>{
  const p=page();p.hook.start(5).advance(1);p.el('pause-btn').fire('click');p.el('pause-mute').fire('click');
  assert.equal(p.hook.probe().muted,false);p.hook.advance(2);assert.equal(p.hook.probe().state.t,1);
});
test('result says return to opening and the next genuine press does so, retaining mode',()=>{
  const p=page();p.hook.start(4,'duo').autopilot('precise').advance(100).render();
  assert.equal(p.hook.probe().screen,'result');
  assert.ok(p.hook.probe().texts.some(x=>x.text==='点一下返回开场'));
  p.pointer('pointerdown');assert.equal(p.hook.probe().screen,'title');assert.equal(p.hook.probe().mode,'duo');
});
