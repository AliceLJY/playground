const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const C = require('../src/core.js'), P = require('../src/pilot.js');

test('W1: auto choice prefers the first matching existing offer without mutating state or RNG', () => {
  for (const workflow of ['', 'clear', 'sustain', 'invalid']) {
    const s = C.create(1, 0, false, workflow);
    for (const offers of [[0, 1, 4], [2, 5, 1], [3, 6, 7], [-1, -1, -1], [99, -1, 4]]) {
      s.offer.set(offers);
      const before = structuredClone(s);
      const expected = workflow === 'clear' ? offers.findIndex(c => c === 1 || c === 2) : workflow === 'sustain' ? offers.findIndex(c => c === 4 || c === 5) : 0;
      assert.equal(C.step.autoChoice(s), Math.max(0, expected));
      assert.deepEqual(s, before, 'selection must not reroll offers, consume RNG or change cards');
    }
    s.cards.fill(3); s.offer.set([0, 1, 4]);
    assert.equal(C.step.autoChoice(s), 0, 'maxed cards cannot be preferred');
  }
});

test('W1: no preference preserves pre-change default simulation on every recorded frame', () => {
  for (const row of require('./fixtures/default-runs.json').runs) {
    const s = C.create(row.seed, row.stage), p = P.create('precise', row.seed), hash = crypto.createHash('sha256');
    let frames = 0;
    while (s.phase < 2 && frames < 18000) {
      C.step(s, ...p(s)); const snap = C.snapshot(s); delete snap.workflow;
      hash.update(JSON.stringify([snap, s.rng, s.autoCard, s.autoUntil])); frames++;
    }
    assert.equal(frames, row.frames);
    assert.equal(hash.digest('hex'), row.digest, `default changed: stage ${row.stage + 1}, seed ${row.seed}`);
  }
});

function run(seed, workflow, mode = 'precise') {
  const s = C.create(seed, 0, false, workflow), pilot = P.create(mode, seed), autos = [];
  let pauses = 0, matches = 0, previous = 0, stuck = 0, maxStuck = 0;
  for (let frame = 0; frame < 18000 && s.phase < 2; frame++) {
    const x = s.x, y = s.y, kills = s.kills, input = pilot(s);
    C.step(s, ...input);
    if (s.phase === 0 && Math.hypot(input[0], input[1]) > .2 && Math.hypot(s.x - x, s.y - y) < .01 && kills === s.kills) stuck++; else stuck = 0;
    maxStuck = Math.max(maxStuck, stuck);
    if (s.phase === 1 && previous !== 1) pauses++;
    if (s.event === 12) {
      const matchesGroup = c => c >= 0 && C.data.cards[c].workflow === workflow;
      const expected = Array.from(s.offer).find(matchesGroup) ?? s.offer[0];
      assert.equal(s.autoCard, expected, 'actual even-rank award must follow the preference');
      assert.equal(s.chosen[s.chosenCount - 1], expected, 'card was actually awarded');
      assert.ok(s.cards[expected] > 0);
      if (matchesGroup(expected)) matches++;
      autos.push(s.autoCard);
    }
    previous = s.phase;
  }
  return { s, autos, pauses, matches, maxStuck };
}

test('W2: both preferences complete real input-driven fights, changing actual cards AND combat outcomes', t => {
  const rows = []; let different = 0, clearWins = 0, sustainWins = 0, clearMatches = 0, sustainMatches = 0;
  let clearInClear = 0, clearInSustain = 0, sustainInClear = 0, sustainInSustain = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const clear = run(seed, 'clear'), sustain = run(seed, 'sustain');
    for (const r of [clear, sustain]) {
      assert.ok(r.s.phase >= 2, 'real run must reach a result');
      assert.ok(r.autos.length >= 2 && r.pauses > 0, 'sample must contain both real automatic awards and manual choices');
      assert.ok(r.s.kills > 0 && r.s.shots > 0 && r.s.collected > 0, 'sample must contain real combat and pickups');
      assert.ok(r.maxStuck < 180, 'held movement must not get stuck without progress for three seconds');
      assert.ok(r.pauses <= Math.ceil((r.s.level - 1) / 2), 'no extra upgrade popup');
      rows.push({ seed, workflow: r.s.workflow, phase: r.s.phase, seconds: r.s.tick / 60, cards: Array.from(r.s.cards), autos: r.autos, hits: r.s.hits, kills: r.s.kills, shots: r.s.shots, maxStuck: r.maxStuck });
    }
    clearWins += clear.s.phase === 2; sustainWins += sustain.s.phase === 2;
    clearMatches += clear.matches > 0; sustainMatches += sustain.matches > 0;
    const isClear = c => c === 1 || c === 2, isSustain = c => c === 4 || c === 5;
    clearInClear += clear.autos.filter(isClear).length; clearInSustain += sustain.autos.filter(isClear).length;
    sustainInClear += clear.autos.filter(isSustain).length; sustainInSustain += sustain.autos.filter(isSustain).length;
    const combat = r => [r.s.tick, r.s.kills, r.s.hits, r.s.shots].join();
    if (clear.s.cards.join() !== sustain.s.cards.join() && combat(clear) !== combat(sustain)) different++;
  }
  assert.ok(different >= 3 && clearWins > 0 && sustainWins > 0, 'both must be beatable and at least half the pairs must change cards and combat');
  assert.ok(clearMatches >= 4 && sustainMatches >= 4, 'at least 4/6 actual runs in each group must exercise preference matching');
  assert.ok(clearInClear > clearInSustain && sustainInSustain > sustainInClear, 'actual automatic awards must lean toward each requested group');
  t.diagnostic(JSON.stringify({ clearWins, sustainWins, different, clearInClear, clearInSustain, sustainInClear, sustainInSustain, rows }));
});

test('W3: bad steering still dies; a fresh default run has no preference, cards, revival or notice residue', () => {
  for (const workflow of ['clear', 'sustain']) {
    const { s } = run(1, workflow, 'reckless');
    assert.equal(s.phase, 3); assert.ok(s.hits >= 6, 'reckless damage must actually occur');
    const fresh = C.create(s.seed, s.stageIndex);
    assert.equal(fresh.workflow, ''); assert.equal(fresh.chosenCount, 0); assert.equal(fresh.revives, 0);
    assert.equal(fresh.autoCard, -1); assert.equal(fresh.autoUntil, 0); assert.ok(fresh.cards.every(n => n === 0));
    const before = fresh.x;
    for (let f = 0; f < 30; f++) C.step(fresh, 1, 0, -2);
    assert.ok(fresh.x > before + 20);
    const pilot = P.create('precise', fresh.seed);
    for (let f = 0; f < 1200; f++) C.step(fresh, ...pilot(fresh));
    assert.ok(fresh.hp > 0 && fresh.kills > 0, 'normal restart must move and fight');
  }
});
