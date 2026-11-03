const test=require('node:test'),assert=require('node:assert/strict'),page=require('./page-harness.cjs');
test('Escape and the visible pause control freeze the round until explicit resume',()=>{
  for(const via of ['keyboard','button']){
    const p=page();p.hook.start(5).advance(1);
    if(via==='keyboard')p.win.fire('keydown',{key:'Escape'});else p.el('pause-btn').fire('click');
    const before=JSON.stringify(p.hook.probe().state);p.hook.advance(2);
    assert.equal(JSON.stringify(p.hook.probe().state),before,via+' must stop all game state');
    p.el('resume').fire('click');p.hook.advance(.2);assert.ok(p.hook.probe().state.t>1);
  }
});
test('blur and hidden page pause and discard an unfinished swipe',()=>{
  for(const event of ['blur','visibilitychange']){
    const p=page();p.hook.start(5).advance(1);p.pointer('pointerdown',20,300);
    if(event==='blur')p.win.fire(event);else{p.doc.hidden=true;p.doc.fire(event);}
    const before=JSON.stringify(p.hook.probe().state);p.hook.advance(1);
    assert.equal(JSON.stringify(p.hook.probe().state),before,event);
    p.doc.hidden=false;p.doc.fire('visibilitychange');p.win.fire('focus');p.hook.advance(.1);
    assert.equal(JSON.stringify(p.hook.probe().state),before,'returning does not resume');
    p.el('resume').fire('click');assert.equal(p.hook.probe().gestureActive,false);
  }
});
test('pause mute toggles stored sound state without advancing or swinging',()=>{
  const p=page();p.hook.start(5).advance(1);p.el('pause-btn').fire('click');
  const before=JSON.stringify(p.hook.probe().state);p.el('pause-mute').fire('click');
  assert.equal(p.hook.probe().muted,false);p.hook.advance(1);
  assert.equal(JSON.stringify(p.hook.probe().state),before);p.el('pause-mute').fire('click');assert.equal(p.hook.probe().muted,true);
});
test('title explains missed bugs and spilled tea using rendered text',()=>{
  const p=page();p.draw();assert.ok(p.texts.some(s=>/漏掉.*断连拍.*误拍奶茶.*扣命/.test(s)),p.texts.join(' / '));
});

test('drawing a paused gold bug does not accumulate particles',()=>{
  const p=page();p.hook.start(5);
  for(let i=0;i<500&&!p.hook.probe().state.ents.some(e=>e.kind==='gold');i++)p.hook.advance(.1);
  assert.ok(p.hook.probe().state.ents.some(e=>e.kind==='gold'),'the sample must contain a gold bug');
  p.el('pause-btn').fire('click');const before=p.hook.probe().particleCount;
  for(let i=0;i<300;i++)p.draw();assert.equal(p.hook.probe().particleCount,before);
});
