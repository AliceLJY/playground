const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../src/core.js'), P = require('../src/pilot.js'), H = C.step;
function tick(s, n, x = 0, y = 0) { for (let i = 0; i < n; i++) H(s, x, y, -2); }

test('A4: random steering wins some and loses some; reckless always dies; every restart can move and kill', t => {
  let wins = 0, events = 0; const results = [];
  for (let seed = 1; seed <= 12; seed++) {
    let stuck = 0, maxStuck = 0, lastX = 0, lastY = 0, lastKills = 0;
    const s = P.run(C, seed, 0, 'random', 18000, (g, input) => {
      if (g.phase === 0 && Math.hypot(...input.slice(0, 2)) > .2 && Math.hypot(g.x - lastX, g.y - lastY) < .01 && lastKills === g.kills) stuck++; else stuck = 0;
      maxStuck = Math.max(stuck, maxStuck); lastX = g.x; lastY = g.y; lastKills = g.kills;
    });
    if (s.phase === 2) wins++; events += s.hits + s.fakeReveals;
    assert.ok(s.phase >= 2 && maxStuck < 180, `seed ${seed}: unfinished/stuck ${maxStuck} frames`);
    const reckless = P.run(C, seed, 0, 'reckless'); assert.equal(reckless.phase, 3, `reckless ${seed} must lose`);
    const restart = C.create(seed), before = restart.x; tick(restart, 30, 1, 0); assert.ok(restart.x > before + 20);
    const pilot = P.create('precise', seed); for (let i = 0; i < 1200; i++) H(restart, ...pilot(restart));
    assert.ok(restart.kills > 0 && restart.hp > 0, 'restart must be a playable fight');
    results.push({ seed, win: s.phase === 2, seconds: +(s.tick / 60).toFixed(2), hits: s.hits, recklessSeconds: +(reckless.tick / 60).toFixed(2) });
  }
  assert.ok(wins >= 3 && wins <= 9, `random steering won ${wins}/12, expected 25–75% (3–9 wins)`);
  assert.ok(events > 30, 'difficulty observations were not empty');
  t.diagnostic(`${wins}/12 random wins; ` + JSON.stringify(results));
});

for (let level = 0; level < 3; level++) test(`A4/A6: stage ${level + 1} has bounded human difficulty and remains precisely beatable`, t => {
  const results = []; let warnings = 0, zones = 0, walls = 0;
  for (const mode of ['precise', 'human']) for (let seed = 1; seed <= 12; seed++) {
    const s = P.run(C, seed, level, mode, 18000, g => {
      // Actual 36px sprite silhouette: source x=5..26,y=0..37; bottom at +17.2. Same anchored draw as art.js.
      assert.ok(g.x - 13 >= 0 && g.x + 13 <= 360 && g.y - 25.4 >= 0 && g.y + 18 <= 520, `hero leaves field: ${g.x},${g.y}`);
      if (g.warning) warnings++;
      if (g.wall > 30) walls++;
      for (let i = 0; i < g.zOn.length; i++) if (g.zOn[i]) {
        assert.ok(g.zx[i] - 43 >= 0 && g.zx[i] + 43 <= 360 && g.zy[i] - 43 >= 0 && g.zy[i] + 43 <= 520); zones++;
      }
    });
    assert.ok(s.phase === 2 || s.phase === 3, `${mode}, stage ${level + 1}, seed ${seed} must finish`);
    if (mode === 'precise') assert.equal(s.phase, 2, `precise, stage ${level + 1}, seed ${seed} must beat boss`);
    assert.ok(s.tick / 60 <= 240 && (s.phase === 3 || s.tick >= s.stage.duration), 'round duration falls outside spec');
    if (s.phase === 2 && level === 1) assert.ok(s.compressions > 0 && s.pullFrames > 0, 'compression and pull actually occurred');
    if (s.phase === 2 && level === 2) assert.ok(s.resets >= 3 && s.zones >= 2, 'reset and rate zones actually occurred');
    results.push({ mode, stage: level + 1, seed, win: s.phase === 2, seconds: +(s.tick / 60).toFixed(2), hits: s.hits });
  }
  t.diagnostic(JSON.stringify(results));
  const human = results.filter(r => r.mode === 'human'), hits = human.map(r => r.hits).sort((a, b) => a - b);
  const wins = human.filter(r => r.win).length, median = (hits[5] + hits[6]) / 2;
  const minHits = [1, 2, 2][level], maxHits = [5, 8, 6][level], minWins = [8, 6, 8][level], maxWins = [12, 11, 12][level];
  assert.ok(median >= minHits && median <= maxHits, `human stage ${level + 1}: median hits ${median}, expected ${minHits}–${maxHits}`);
  assert.ok(wins >= minWins && wins <= maxWins, `human stage ${level + 1}: won ${wins}/12, expected ${minWins}–${maxWins}`);
  if (level === 1) assert.ok(walls > 1000, 'meaningful sampling of shrinking walls');
  if (level === 2) assert.ok(warnings > 1000 && zones > 1000, 'meaningful sampling of reset and rate zones');
});

test('A5: quota telegraphs exactly 180 ticks, stops all firing for 240, then boosts real shot rate', () => {
  const s = C.create(1, 2), p = P.create('precise', 1); let warned = 0, off = 0, previousShots = 0, recoveryShots = 0, sawRecovery = false;
  while (s.tick < 3600 && s.phase < 2) {
    previousShots = s.shots; H(s, ...p(s)); if (s.phase === 1) continue;
    if (s.warning) warned++;
    if (s.off) { off++; assert.equal(s.shots, previousShots, 'a helper fired during reset'); assert.equal(s.bOn.some(v => v > 0), false, 'in-flight shots remain during reset'); }
    if (s.burst) { sawRecovery = true; recoveryShots += s.shots - previousShots; }
  }
  assert.equal(warned, 180); assert.equal(off, 240); assert.ok(sawRecovery && recoveryShots >= 12);
});

test('A5: fake gems reveal before biting; real gems never bite and upgrade can be skipped', () => {
  const s = C.create(3); s.nextSpawn = 99999; tick(s, 1);
  const id = H.gem(s, s.x + 25, s.y, 1, 2); tick(s, 1); const at = s.gReveal[id]; assert.ok(at > 0);
  tick(s, 41); assert.equal(s.fakeBites, 0); assert.equal(s.gOn[id], 1);
  tick(s, 1); assert.equal(s.fakeBites, 1); assert.equal(s.gOn[id], 0);
  const a = C.create(5); H.gem(a, a.x, a.y, 0, 20); tick(a, 1); assert.equal(a.phase, 1);
  const before = a.tick; tick(a, 60); assert.equal(a.tick, before, 'selection must pause time');
  H(a, 0, 0, -1); assert.equal(a.phase, 0); assert.equal(a.chosenCount, 0);
});

test('A5: rate zones warn for 72 frames before contact damage', () => {
  const s = C.create(1, 2); s.nextSpawn = 99999; H.zone(s, s.x, s.y); tick(s, 71);
  assert.equal(s.hp, 6); tick(s, 1); assert.equal(s.hp, 5); assert.ok(s.zoneContacts > 0);
});

test('A5: lethal rate-zone damage ends the frame before projectiles can turn death into victory', () => {
  const s = C.create(1, 2); s.nextSpawn = 99999; s.hp = 1;
  const boss = H.enemy(s, 5, 180, 100); s.boss = boss; s.eHP[boss] = 1; s.eBorn[boss] = -100; s.eSpeed[boss] = 0;
  H.zone(s, s.x, s.y); s.tick = 71;
  s.bOn[0] = 10; s.bx[0] = 180; s.by[0] = 100; s.bDamage[0] = 1; s.bID[0] = 1; s.shots = 1; s.fire = 99;
  tick(s, 1); assert.equal(s.phase, 3); assert.equal(s.eHP[boss], 1);
});

test('A10: false boss bodies take no damage; true boss death wins; compressor pushes wall back', () => {
  const s = C.create(1); const fake = H.enemy(s, 6, 60, 60), real = H.enemy(s, 5, 180, 100); s.boss = real;
  H.hit(s, fake, 999); assert.equal(s.eOn[fake], 1); assert.equal(s.eHP[fake], 1);
  H.hit(s, real, 1); assert.equal(s.eHP[real], 199); H.hit(s, real, 999); assert.equal(s.phase, 2);
  const b = C.create(2, 1); b.wall = 55; const elite = H.enemy(b, 3, 100, 100); H.hit(b, elite, 20);
  assert.equal(b.wall, 37); assert.equal(b.compressions, 1);
});

test('A10: all eight cards change simulated outcomes, not just displayed values', () => {
  function fight(card) {
    const s = C.create(4); s.nextSpawn = 99999; s.cards[card] = 1;
    for (let i = 0; i < 20; i++) { const e = H.enemy(s, 0, 50 + i * 12, 100); s.eHP[e] = 100; s.eSpeed[e] = 0; }
    tick(s, 360); return s;
  }
  const base = fight(99); // typed array out-of-range write is ignored, gives base loadout
  for (const card of [0, 2, 3]) assert.ok(fight(card).shots > base.shots, `card ${card} must increase emitted shots`);
  assert.ok(fight(1).eHP.reduce((a, v) => a + v, 0) < base.eHP.reduce((a, v) => a + v, 0), 'lint beam must deal extra damage');
  assert.ok(fight(7).eHP.reduce((a, v) => a + v, 0) < base.eHP.reduce((a, v) => a + v, 0), 'temperature must deal critical damage');
  const slow = C.create(4), fast = C.create(4); fast.cards[6] = 1; tick(slow, 30, 1, 0); tick(fast, 30, 1, 0); assert.ok(fast.x > slow.x + 5);
  const small = C.create(4), large = C.create(4); tick(small, 1); tick(large, 1); large.cards[4] = 1;
  H.gem(small, 220, 260, 0, 3); H.gem(large, 220, 260, 0, 3); tick(small, 30); tick(large, 30); assert.ok(large.xp > small.xp);
  const life = C.create(4); life.phase = 1; life.offer[0] = 5; H(life, 0, 0, 0); life.hp = 1; H.hurt(life);
  assert.equal(life.phase, 0); assert.equal(life.hp, 6); assert.equal(life.revivals, 1); assert.equal(life.revives, 0);
});
