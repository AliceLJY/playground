// Does the picture agree with the verdict? A play report (2026-11-24) said the new hero sprite and the judgement did
// not line up: at a perfect parry the attacker ended up behind the hero's face, blades slid under the gong into his
// waist, and he stood inside the rat king. These checks sample real matches (both autopilots, several seeds) at the
// step a blow is judged, and measure what the renderer will draw: the hero from the sprite atlas (flowsprite.drawn),
// the opponents from the rig. World units; the hero stands 2.83 tall and his gong is 0.29 in radius.
// What only the browser can see (the sprite's mirror sign as drawn, sparks, hints, touch) is in
// tools/browser-check.cjs --align-only.
const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../src/flowsprite.js');

test('the sprite mirrors with the hero: gong and body box swap sides, nothing else moves',()=>{
  const p={x:1,y:0,face:1,state:'guard',st:.2},a=F.drawn(p,3,{x:1,y:0,face:1},-8,8),b=F.drawn({...p,face:-1},3,{x:1,y:0,face:-1},-8,8);
  assert.equal(a.frame,b.frame);
  assert.ok(a.gong.x>1&&b.gong.x<1,'the gong is on the side the hero faces');
  assert.ok(Math.abs((a.gong.x-1)+(b.gong.x-1))<1e-9&&Math.abs(a.gong.y-b.gong.y)<1e-9);
  assert.ok(Math.abs((a.box.maxX-1)+(b.box.minX-1))<1e-9,'the body box mirrors about the feet');
});
