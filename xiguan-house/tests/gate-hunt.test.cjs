const test = require('node:test');
const assert = require('node:assert/strict');
const { GATES, newHunt, huntAction, SOLIDS, vec } = require('../src/model.js');
const pick = (s, id) => huntAction(s, { type: 'pick', id });
const start = () => huntAction(newHunt(), { type: 'start' });

test('shared button intent sequence finds all three before requesting the normal opening', () => {
  let state = start(), correctPicks = 0;
  for (const id of ['jiaomen', 'tanglong', 'damen']) {
    const before = state.count;
    state = pick(state, id);
    correctPicks += state.count - before;
    assert.equal(state.count, correctPicks);
    assert.notEqual(state.phase, 'opening', 'finding a gate must not skip its explanation');
  }
  assert.equal(correctPicks, 3, 'sample must actually contain three successful choices');
  assert.equal(state.phase, 'reading');
  state = huntAction(state, { type: 'elapse', ms: 1799 });
  assert.equal(state.phase, 'reading');
  state = huntAction(state, { type: 'elapse', ms: 1 });
  assert.equal(state.phase, 'opening');
  assert.deepEqual(huntAction(state, { type: 'exit' }), newHunt(), 'normal flow must receive no hunt state');
});

test('out-of-order, invalid and duplicate choices really occur and preserve earned progress', () => {
  let wrong = 0, repeats = 0, successes = 0;
  for (const sequence of [
    ['tanglong', 'damen', 'jiaomen', 'jiaomen', 'damen', 'tanglong', 'damen'],
    ['unknown', 'jiaomen', 'tanglong', 'tanglong', 'jiaomen', 'damen'],
  ]) {
    let state = start();
    for (const id of sequence) {
      const before = state.count;
      state = pick(state, id);
      if (state.feedback === 'wrong' || state.feedback === 'repeat') {
        assert.equal(state.count, before, 'mistakes must neither reset nor advance progress');
        assert.equal(state.phase, 'finding', 'mistakes must not open the house');
        if (state.feedback === 'wrong') wrong++; else repeats++;
      } else successes++;
    }
    assert.equal(state.count, 3, 'a visitor must still be able to finish after errors');
  }
  assert.ok(wrong >= 4 && repeats >= 3 && successes === 6, 'samples must exercise mistakes, duplicates and recovery');
});

test('exit during every stage cancels pending opening; a fresh visit has no progress or highlight', () => {
  for (let count = 0; count <= 3; count++) {
    let state = start();
    for (let i = 0; i < count; i++) state = pick(state, GATES[i].id);
    state = huntAction(state, { type: 'exit' });
    assert.deepEqual(state, newHunt());
    state = huntAction(state, { type: 'elapse', ms: 10000 });
    state = pick(state, 'jiaomen');
    assert.deepEqual(state, newHunt(), 'late input or timer must not revive an exited hunt');
    assert.deepEqual(huntAction(state, { type: 'start' }), start());
  }
});

test('rapid input during the last explanation cannot double-complete or reset its timer', () => {
  let state = ['jiaomen', 'tanglong', 'damen'].reduce(pick, start());
  state = huntAction(state, { type: 'elapse', ms: 800 });
  for (const id of ['damen', 'jiaomen', 'unknown']) assert.deepEqual(pick(state, id), state);
  for (const ms of [-1, NaN, Infinity]) assert.deepEqual(huntAction(state, { type: 'elapse', ms }), state);
  assert.equal(huntAction(state, { type: 'elapse', ms: 1000 }).phase, 'opening');
});

test('each closed-front anchor hits its actual gate before any occluding solid', () => {
  const { dot, cross, sub } = vec;
  const expected = ['脚门', '趟栊圆木', '大门右扇'];
  for (const [i, gate] of GATES.entries()) {
    const hits = [];
    for (const solid of SOLIDS) for (const face of solid.faces) {
      if (face.n[1] >= -1e-6) continue;
      const poly = face.idx.map(j => solid.verts[j]), [x,,z] = gate.at;
      const y = (dot(face.n,poly[0])-face.n[0]*x-face.n[2]*z)/face.n[1];
      const q = [x,y,z];
      if (poly.every((p,j) => dot(cross(sub(poly[(j+1)%poly.length],p),sub(q,p)),face.n)>=-1e-6)) hits.push({y,name:solid.name});
    }
    hits.sort((a,b)=>a.y-b.y);
    assert.ok(hits.length>0, 'ray must actually hit rendered geometry');
    assert.equal(hits[0].name,expected[i], `${gate.title} anchor is hidden behind another part`);
  }
});
