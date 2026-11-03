const test=require('node:test'),assert=require('node:assert/strict'),page=require('./page-harness.cjs');
test('title offers casual and night watch without choosing a new default',()=>{
 const p=page();p.draw();assert.equal(p.el('mode-choices').hidden,false);
 p.el('casual-entry').fire('click');assert.equal(p.hook.probe().state.mode,'casual');
 assert.equal(p.el('mode-choices').hidden,true);assert.equal(p.hook.probe().gestureActive,false);
 const q=page();q.el('night-entry').fire('click');assert.equal(q.hook.probe().screen,'nightMenu');
 q.el('night-back').fire('click');assert.equal(q.hook.probe().screen,'title');assert.equal(q.el('mode-choices').hidden,false);
 q.win.fire('keydown',{key:'Enter'});assert.equal(q.hook.probe().state.mode,'casual');
});
