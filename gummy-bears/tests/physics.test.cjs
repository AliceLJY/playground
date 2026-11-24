// The soft-body rules from SPEC.md, checked on the physics the page runs (src/physics.js, src/scenarios.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const physics = import('../src/physics.js');
const scenes = import('../src/scenarios.js');

// "Does not pass through": two particles of different bears never come closer than half the contact
// distance (they are 2r apart when just touching), and no particle ever goes below the table surface.
const PAIR_MIN = 0.5;
const TIERS = ['high', 'low'];

test('P1 pulled as far as it goes and let go, a bear comes back to its own shape (volume ratio 0.9–1.1)', async () => {
  const { World, MAX_STRETCH } = await physics, { runOnWorld } = await scenes;
  for (const quality of TIERS) for (const part of ['head', 'earL', 'armR', 'legL']) {
    const w = new World({ seed: 3, quality }), vols = [];
    // Pull far beyond the stretch limit (the hand is held back at MAX_STRETCH × the rest distance). The hand
    // ends high above the table, so letting go drops the bear: give it time to land and tumble to rest.
    const { notes } = runOnWorld(w, [{ op: 'reset' }, { op: 'step', ms: 300 }, { op: 'grab', bear: 2, part }, { op: 'drag', offset: [0.4, 7, -6], ms: 700 }, { op: 'step', ms: 800 }], { onFrame: (w) => vols.push(w.bearVolumeRatio(2)) });
    assert.ok(notes.maxStretch > 1.25 && notes.maxStretch <= MAX_STRETCH + 0.05, `${quality} ${part}: stretch peaked at ${notes.maxStretch.toFixed(2)}`);
    runOnWorld(w, [{ op: 'release' }, { op: 'step', ms: 6000 }], { onFrame: (w) => vols.push(w.bearVolumeRatio(2)) });
    const v = w.bearVolumeRatio(2), err = w.shapeError(2);
    assert.ok(v >= 0.9 && v <= 1.1, `${quality} ${part}: volume ratio ${v.toFixed(3)} after letting go`);
    assert.ok(Math.min(...vols) > 0.85 && Math.max(...vols) < 1.15, `${quality} ${part}: volume ratio ${Math.min(...vols).toFixed(3)}..${Math.max(...vols).toFixed(3)} on the way`);
    assert.ok(err < 0.08, `${quality} ${part}: shape error ${err.toFixed(3)} after letting go`);
    assert.ok(w.bearSpeed(2) < 0.25, `${quality} ${part}: still moving at ${w.bearSpeed(2).toFixed(2)}`);
  }
});

test('P2 bears never pass through each other or the table: pouring to the cap, pulling, pressing and flinging', async () => {
  const { World } = await physics, { runOnWorld, SCENARIOS } = await scenes;
  for (const quality of TIERS) {
    const w = new World({ seed: 11, quality });
    let worstPair = Infinity, worstTable = Infinity, frames = 0;
    const watch = (w) => { const p = w.penetration(); worstPair = Math.min(worstPair, p.pair); worstTable = Math.min(worstTable, p.table); frames++; };
    runOnWorld(w, SCENARIOS.fling, { onFrame: watch });
    // Press a bear's back down into the table, then drag it into its neighbour.
    runOnWorld(w, [{ op: 'reset' }, { op: 'step', ms: 200 }, { op: 'grab', bear: 1, part: 'body' }, { op: 'drag', offset: [0, -1.5, 0], ms: 400 }, { op: 'step', ms: 300 }, { op: 'drag', offset: [2.5, -0.5, 0], ms: 500 }, { op: 'release' }, { op: 'step', ms: 600 }], { onFrame: watch });
    runOnWorld(w, SCENARIOS.pile, { onFrame: watch });
    assert.ok(worstTable >= 0.999, `${quality}: a particle went ${((1 - worstTable) * 100).toFixed(1)} % of its radius into the table`);
    assert.ok(worstPair >= PAIR_MIN, `${quality}: two bears overlapped to ${worstPair.toFixed(2)} of the contact distance`);
    assert.ok(frames > 300);
  }
});

test('P3 poured to the cap, the pile comes to rest, stays on the table and stays still', async () => {
  const { World, CAP } = await physics, { runOnWorld, SCENARIOS } = await scenes;
  for (const quality of TIERS) {
    const w = new World({ seed: 5, quality });
    const { snapshot: s, notes } = runOnWorld(w, SCENARIOS.pile);
    assert.equal(s.count, CAP[quality], `${quality}: ${s.count} bears, cap ${CAP[quality]}`);
    assert.equal(w.pour(), 0, `${quality}: the cap must stop further pours`);
    assert.ok(notes.settled && notes.settledAt < 14, `${quality}: still moving at ${notes.settledAt} s`);
    const before = s.bears.map(b => b.position);
    runOnWorld(w, [{ op: 'step', ms: 3000 }]);
    const after = w.snapshot();
    const drift = Math.max(...after.bears.map((b, i) => Math.hypot(...b.position.map((v, k) => v - before[i][k]))));
    assert.ok(drift < 0.02, `${quality}: a settled bear crept ${drift.toFixed(3)} in 3 s`);
    assert.equal(after.bears.filter(b => b.moving).length, 0, `${quality}: bears still marked moving`);
    const A = w.arena;
    for (const b of after.bears) {
      assert.ok(b.box.min[0] >= -A.x - 1e-6 && b.box.max[0] <= A.x + 1e-6 && b.box.min[2] >= -A.z - 1e-6 && b.box.max[2] <= A.z + 1e-6, `${quality}: bear ${b.id} off the table ${JSON.stringify(b.box)}`);
      assert.ok(b.box.min[1] >= -1e-6 && b.box.max[1] < 3.2, `${quality}: bear ${b.id} at height ${b.box.max[1]}`);
      assert.ok(b.volume > 0.9 && b.volume < 1.1, `${quality}: bear ${b.id} volume ${b.volume}`);
    }
  }
});

test('P4 reset puts the first five bears back exactly where a fresh page has them', async () => {
  const { World } = await physics, { runOnWorld, SCENARIOS } = await scenes;
  for (const quality of TIERS) {
    const fresh = new World({ seed: 9, quality }).snapshot();
    const w = new World({ seed: 9, quality });
    runOnWorld(w, SCENARIOS.fling); w.pour(); runOnWorld(w, [{ op: 'step', ms: 1500 }]);
    w.reset();
    assert.deepEqual(w.snapshot(), fresh, quality);
    assert.equal(fresh.count, 5);
    assert.deepEqual(fresh.bears.map(b => b.flavor), ['cherry', 'orange', 'lemon', 'apple', 'pineapple']);
  }
});

test('P5 the same seed gives the same result twice; another seed pours differently', async () => {
  const { World } = await physics, { runOnWorld, SCENARIOS } = await scenes;
  const run = (seed) => { const w = new World({ seed }); runOnWorld(w, SCENARIOS.stretch); runOnWorld(w, [{ op: 'release' }, { op: 'step', ms: 300 }]); w.pour(); runOnWorld(w, [{ op: 'step', ms: 2000 }]); return JSON.stringify(w.snapshot()); };
  assert.equal(run(42), run(42));
  assert.notEqual(run(42), run(43));
  // setSeed + reset on a used world equals a new world with that seed.
  const a = new World({ seed: 1 }); a.pour(); runOnWorld(a, [{ op: 'step', ms: 500 }]); a.setSeed(42); a.reset();
  const b = new World({ seed: 42 });
  for (const w of [a, b]) { w.pour(); runOnWorld(w, [{ op: 'step', ms: 1000 }]); }
  assert.equal(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()));
});

test('P6 the four picture scenes do what their names say', async () => {
  const { World } = await physics, { runOnWorld, SCENARIOS } = await scenes;
  for (const quality of TIERS) {
    const row = runOnWorld(new World({ quality }), SCENARIOS.row).snapshot;
    assert.equal(row.bears.filter(b => b.moving).length, 0, `${quality} row: still`);
    const s = runOnWorld(new World({ quality }), SCENARIOS.stretch);
    assert.ok(s.snapshot.stretch > 1.25 && s.snapshot.grabbing, `${quality} stretch: ×${s.snapshot.stretch} while held`);
    const f = runOnWorld(new World({ quality }), SCENARIOS.fling);
    assert.ok(f.notes.landedAt > 0, `${quality} fling: never landed`);
    const w = new World({ quality }); runOnWorld(w, SCENARIOS.fling);
    assert.ok(w.shapeError(0) > 0.05, `${quality} fling: the bear is not squashed on landing (${w.shapeError(0).toFixed(3)})`);
  }
});

test('P7 a dropped bear bounces, and the bounce reading picks it up', async () => {
  const { World, rotation } = await physics;
  const w = new World({ seed: 1 });
  w.reset(); w.bears.length = 0; // empty table
  w.addBear({ flavor: 0, at: [0, 5, 0], R: rotation(0.3, 0.2, 0.1), vel: [0, -6, 0] });
  for (let i = 0; i < 240; i++) w.step();
  assert.ok(w.stats.bounce > 0.05, `bounce ${w.stats.bounce}`);
});
