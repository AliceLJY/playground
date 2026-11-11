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
  const results = []; let warnings = 0, zones = 0, walls = 0, blocked = 0, maxStuck = 0, enemySamples = 0;
  for (const mode of ['precise', 'human']) for (let seed = 1; seed <= 12; seed++) {
    let stuck = 0, lastX = 0, lastY = 0, lastKills = 0;
    const s = P.run(C, seed, level, mode, 18000, (g, input) => {
      // Actual hero silhouette: sprite pixels x=5..26, y=1..37 drawn 2 units per pixel from (x-32, y-45.12),
      // with a 2-unit stride bob. Same anchored draw as art.js.
      assert.ok(g.x - 22 >= 0 && g.x + 22 <= 360 && g.y - 45.2 >= 0 && g.y + 31 <= 520, `hero leaves field: ${g.x},${g.y}`);
      // Feet never inside a live prop; ordinary enemies never sink into one (sampled every 15 frames). The boss and its clones float over props by design.
      for (let i = 0; i < g.oOn.length; i++) if (g.oOn[i]) {
        const fx = Math.max(Math.abs(g.x - g.ox[i]) - g.ohw[i], 0), fy = Math.max(Math.abs(g.y + 20 - g.oy[i]) - g.ohh[i], 0);
        assert.ok(Math.hypot(fx, fy) >= 14 - 1e-6, `${mode} seed ${seed}: hero feet inside prop ${i} at ${g.x},${g.y}`);
        if (g.tick % 15 === 0) for (let e = 0; e < g.eOn.length; e++) if (g.eOn[e] && g.er[e] < 20) {
          const ex = Math.max(Math.abs(g.ex[e] - g.ox[i]) - g.ohw[i], 0), ey = Math.max(Math.abs(g.ey[e] - g.oy[i]) - g.ohh[i], 0);
          assert.ok(Math.hypot(ex, ey) >= g.er[e] - 1, `${mode} seed ${seed}: enemy inside prop ${i}`); enemySamples++;
        }
      }
      if (g.phase === 0 && Math.hypot(input[0], input[1]) > .2 && Math.hypot(g.x - lastX, g.y - lastY) < .01 && lastKills === g.kills) stuck++; else stuck = 0;
      maxStuck = Math.max(maxStuck, stuck); lastX = g.x; lastY = g.y; lastKills = g.kills;
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
    blocked += s.blocked;
    results.push({ mode, stage: level + 1, seed, win: s.phase === 2, seconds: +(s.tick / 60).toFixed(2), hits: s.hits, blocked: s.blocked });
  }
  t.diagnostic(JSON.stringify({ maxStuck, blocked, enemySamples, results }));
  assert.ok(maxStuck < 180, `stage ${level + 1}: held input made no movement or kill progress for ${maxStuck} frames`);
  assert.ok(blocked > 0 && enemySamples > 1000, `stage ${level + 1}: props must actually be met in the sampled runs`);
  const human = results.filter(r => r.mode === 'human'), hits = human.map(r => r.hits).sort((a, b) => a - b);
  const wins = human.filter(r => r.win).length, median = (hits[5] + hits[6]) / 2;
  const minHits = [1, 2, 2][level], maxHits = [5, 8, 6][level], minWins = [8, 6, 8][level], maxWins = [11, 11, 11][level];
  assert.ok(median >= minHits && median <= maxHits, `human stage ${level + 1}: median hits ${median}, expected ${minHits}–${maxHits}`);
  assert.ok(wins >= minWins && wins <= maxWins, `human stage ${level + 1}: won ${wins}/12, expected ${minWins}–${maxWins}`);
  if (level === 1) assert.ok(walls > 1000, 'meaningful sampling of shrinking walls');
  if (level === 2) assert.ok(warnings > 1000 && zones > 1000, 'meaningful sampling of reset and rate zones');
});

test('A5: quota warns for 180 ticks, pairs zones with the 240-tick outage, then boosts real shot rate', () => {
  const s = C.create(1, 2), p = P.create('precise', 1);
  let warned = 0, off = 0, previousShots = 0, recoveryShots = 0, sawRecovery = false;
  let activeZoneFrames = 0, clearOffFrames = 0;
  while (s.tick < 3600 && s.phase < 2) {
    previousShots = s.shots; H(s, ...p(s)); if (s.phase === 1) continue;
    if (s.warning) warned++;
    if (s.tick < 2400) assert.equal(s.zones, 0, 'rate zones must wait for the reset');
    if (s.tick === 2400) {
      assert.equal(s.boss, -1, 'the reset attack must occur before the boss');
      assert.equal(s.zones, 2, 'first reset must place a real pair of rate zones');
      assert.equal(s.zBorn.filter((born, i) => s.zOn[i] && born === s.tick).length, 2);
      assert.equal(s.zx[0], Math.max(52, Math.min(308, s.x)), 'first zone targets the current position');
      assert.equal(s.zy[0], Math.max(56, Math.min(464, s.y)));
    }
    if (s.off) { off++; assert.equal(s.shots, previousShots, 'a helper fired during reset'); assert.equal(s.bOn.some(v => v > 0), false, 'in-flight shots remain during reset'); }
    if (s.off && s.tick >= 2472 && s.tick < 2550) {
      assert.equal(s.zBorn[0], 2400);
      assert.ok(s.zOn.slice(0, 2).every(on => on === 2549 - s.tick), 'the actual reset pair must last through the 78-tick danger window');
      activeZoneFrames++;
    }
    if (s.off && s.tick >= 2550) {
      assert.equal(s.zOn.some(v => v > 0), false, 'zones must leave room to recover before firing resumes');
      clearOffFrames++;
    }
    if (s.burst) { sawRecovery = true; recoveryShots += s.shots - previousShots; }
  }
  assert.equal(warned, 180);
  assert.equal(off, 240);
  assert.equal(activeZoneFrames, 78);
  assert.equal(clearOffFrames, 90);
  assert.ok(sawRecovery && recoveryShots >= 12);
});

test('A5: all three pre-boss resets place exactly one pair of zones at the outage start', () => {
  const s = C.create(1, 2), p = P.create('precise', 1), attacks = [];
  while (s.tick < s.stage.duration && s.phase < 2) {
    const previousZones = s.zones;
    H(s, ...p(s));
    if (s.boss < 0 && s.zones > previousZones) {
      assert.equal(s.zones - previousZones, 2, 'a reset places one pair');
      assert.equal(s.off, 240, 'the pair must begin with the weapon outage');
      attacks.push(s.tick);
    }
  }
  assert.deepEqual(attacks, [2400, 4800, 7200], 'the real run must encounter every pre-boss reset attack');
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

test('A11: only every other level-up pauses for a card choice; the rest auto-pick and still grow the team', () => {
  for (let seed = 1; seed <= 6; seed++) {
    let pauses = 0, last = -1, autos = 0;
    const s = P.run(C, seed, 0, 'precise', 18000, g => {
      if (g.phase === 1 && last !== 1) pauses++;
      if (g.event === 12) autos++;
      last = g.phase;
    });
    const ups = s.level - 1;
    assert.ok(ups >= 8, `seed ${seed}: too few level-ups (${ups}) for the check to mean anything`);
    assert.ok(autos >= Math.floor(ups / 2) - 1 && pauses <= Math.ceil(ups / 2) + 1, `seed ${seed}: ${pauses} pauses, ${autos} auto picks for ${ups} level-ups`);
    assert.ok(s.cards.reduce((a, b) => a + b, 0) >= ups - 2, `seed ${seed}: auto picks must add real cards`);
  }
});
