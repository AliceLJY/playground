const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../src/core.js'), P = require('../src/pilot.js'), H = C.step;
const hero = C.data.hero;
function props(s) { const out = []; for (let i = 0; i < s.oOn.length; i++) if (s.oOn[i]) out.push({ i, x: s.ox[i], y: s.oy[i], hw: s.ohw[i], hh: s.ohh[i] }); return out; }
// Distance from a point to a box (0 inside).
function gap(px, py, p) { return Math.hypot(Math.max(Math.abs(px - p.x) - p.hw, 0), Math.max(Math.abs(py - p.y) - p.hh, 0)); }

test('P1: props come from the seeded game RNG — same seed same room, different seeds different rooms, never boxed in', () => {
  const rooms = new Set();
  for (let level = 0; level < 3; level++) for (let seed = 1; seed <= 12; seed++) {
    const a = props(C.create(seed, level)), b = props(C.create(seed, level));
    assert.deepEqual(a, b, 'layout must be reproducible');
    assert.equal(a.length, C.data.levels[level].props, 'restrained prop count per level');
    rooms.add(JSON.stringify(a));
    for (const p of a) {
      // Start point, boss entrance and field edge stay clear; the hero's feet fit between a prop and the field edge.
      assert.ok(gap(180, 260 + hero.footY, p) > hero.footRadius + 30, `seed ${seed}: prop crowds the start`);
      assert.ok(gap(180, 100, p) >= 26, `seed ${seed}: prop overlaps the boss entrance`);
      assert.ok(p.x - p.hw >= hero.minX + hero.footRadius && p.x + p.hw <= hero.maxX - hero.footRadius, `seed ${seed}: no passage beside prop`);
      if (level === 1) assert.ok(Math.abs(p.x - 180) > 60 || Math.abs(p.y - 260) > 150, 'the context stage keeps its middle open for the shrinking wall');
      // Any two props leave a gap the hero's feet pass through (or they do not face each other at all).
      for (const q of a) if (q !== p) {
        const gx = Math.abs(p.x - q.x) - p.hw - q.hw, gy = Math.abs(p.y - q.y) - p.hh - q.hh;
        assert.ok(Math.max(gx, gy) >= hero.footRadius * 2, `seed ${seed}: props ${p.i}/${q.i} pinch a ${Math.max(gx, gy)}-unit gap`);
      }
    }
  }
  assert.ok(rooms.size >= 30, `only ${rooms.size}/36 distinct rooms across seeds and levels`);
});

test('P2: walking straight at a prop is stopped at its face, from all four sides (and the old open floor would let the hero through)', () => {
  let checked = 0;
  for (let seed = 1; seed <= 12; seed++) for (const p of props(C.create(seed, 0))) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const s = C.create(seed, 0); s.nextSpawn = 1e9;
    // Start 50 units away from the face, lined up with the prop's centre (feet are 20 below the body centre).
    s.x = p.x - dx * (p.hw + hero.footRadius + 50); s.y = p.y - hero.footY - dy * (p.hh + hero.footRadius + 50);
    if (s.x < hero.minX || s.x > hero.maxX || s.y < hero.minY || s.y > hero.maxY) continue;
    let closest = Infinity;
    for (let f = 0; f < 90; f++) {
      H(s, dx, dy, -2); if (s.phase === 1) H(s, 0, 0, -1);
      const g = gap(s.x, s.y + hero.footY, p); closest = Math.min(closest, g);
      assert.ok(g >= hero.footRadius - 1e-6, `seed ${seed} prop ${p.i} dir ${dx},${dy}: feet entered the prop (${g.toFixed(2)})`);
    }
    // The hero really walked up to the face (not stopped early by something else), and the frame counter saw it.
    assert.ok(closest < hero.footRadius + .5, `seed ${seed} prop ${p.i} dir ${dx},${dy}: never reached the face (${closest.toFixed(2)})`);
    assert.ok(s.blocked > 30, 'blocked frames were counted');
    checked++;
  }
  assert.ok(checked >= 120, `only ${checked} approaches were possible`);
});

test('P3: real held input from the normal start walks into the nearest prop, slides along it and keeps going', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = C.create(seed, 0); s.nextSpawn = 1e9;
    const p = props(s).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    const d = Math.hypot(p.x - s.x, p.y - hero.footY - s.y), ix = (p.x - s.x) / d, iy = (p.y - hero.footY - s.y) / d;
    let touched = 0;
    for (let f = 0; f < 240; f++) {
      H(s, ix, iy, -2); if (s.phase === 1) H(s, 0, 0, -1);
      assert.ok(gap(s.x, s.y + hero.footY, p) >= hero.footRadius - 1e-6, `seed ${seed}: walked into the prop`);
      if (gap(s.x, s.y + hero.footY, p) < hero.footRadius + .5) touched++;
    }
    assert.ok(touched > 20 && s.blocked > 20, `seed ${seed}: held input never met the prop`);
    // Turning 90 degrees frees the hero at once: no sticky contact.
    const x = s.x, y = s.y; for (let f = 0; f < 20; f++) H(s, -iy, ix, -2);
    assert.ok(Math.hypot(s.x - x, s.y - y) > 20, `seed ${seed}: hero stuck on the prop after turning`);
  }
});

test('P4: an enemy directly behind a prop walks around it and reaches the hero; it never passes through', () => {
  let routed = 0;
  for (let seed = 1; seed <= 12; seed++) for (const p of props(C.create(seed, 0))) {
    const s = C.create(seed, 0); s.nextSpawn = 1e9;
    // Hero below the prop, enemy above it, both on the prop's vertical centre line: the straight line is blocked.
    s.x = p.x; s.y = Math.min(hero.maxY, p.y + p.hh + 50);
    const e = H.enemy(s, 0, p.x, p.y - p.hh - 16); s.eBorn[e] = -100; s.eSpeed[e] = 60; s.eHP[e] = 1e9; // helpers cannot shoot it out of the test
    assert.equal(H.clear(s, s.ex[e], s.ey[e], s.x, s.y + 10, 8), 0, 'setup: straight line must be blocked');
    let reached = -1;
    for (let f = 0; f < 600 && reached < 0; f++) {
      H(s, 0, 0, -2); if (s.phase === 1) H(s, 0, 0, -1);
      assert.ok(gap(s.ex[e], s.ey[e], p) >= s.er[e] - 1e-6, `seed ${seed} prop ${p.i}: enemy went through the prop`);
      if (s.hits > 0 || Math.hypot(s.x - s.ex[e], s.y - s.ey[e]) < s.er[e] + hero.hitRadius + 2) reached = f;
    }
    if (reached >= 0) routed++;
    else assert.fail(`seed ${seed} prop ${p.i}: enemy stuck behind the prop at ${s.ex[e].toFixed(1)},${s.ey[e].toFixed(1)}`);
  }
  assert.ok(routed >= 40, `${routed} routed`);
});

test('P5: the token wall swallows props before the gap to them gets narrower than the hero', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const s = C.create(seed, 1), pilot = P.create('precise', seed); let swallowed = 0;
    for (let f = 0; f < 6000 && s.phase < 2; f++) {
      const before = Array.from(s.oOn); H(s, ...pilot(s));
      for (let i = 0; i < s.oOn.length; i++) {
        if (before[i] && !s.oOn[i]) swallowed++;
        if (!s.oOn[i]) continue;
        const room = Math.min(s.ox[i] - s.ohw[i], s.oy[i] - s.ohh[i], 360 - s.ox[i] - s.ohw[i], 520 - s.oy[i] - s.ohh[i]) - s.wall;
        assert.ok(room >= hero.footRadius * 2, `seed ${seed}: live prop only ${room.toFixed(1)} from the wall`);
      }
    }
    assert.ok(swallowed > 0, `seed ${seed}: the wall never reached a prop`);
  }
});

test('P6: a shrinking north wall cannot clamp the hero back into a live prop', () => {
  let contacts = 0;
  for (let seed = 1; seed <= 12; seed++) for (const p of props(C.create(seed, 1))) {
    if (p.y > 160) continue;
    const s = C.create(seed, 1); s.nextSpawn = 1e9;
    s.x = p.x; s.y = p.y - p.hh - hero.footRadius - hero.footY;
    // Start tangent to the prop and inside the current wall. Let normal wall ticks close the gap.
    s.wall = s.y - hero.minY - .02;
    const edge = Math.min(p.x - p.hw, p.y - p.hh, 360 - p.x - p.hw, 520 - p.y - p.hh);
    if (edge < s.wall + s.stage.wallRate * 26 + 34) continue;
    assert.ok(s.wall > 0 && s.wall < s.stage.wallMax);
    assert.ok(gap(s.x, s.y + hero.footY, p) >= hero.footRadius);
    assert.ok(s.y >= hero.minY + s.wall, 'hero starts within the shrinking wall bounds');
    for (let i = 0; i < 26; i++) H(s, 0, 0, -2);
    assert.equal(s.oOn[p.i], 1, 'sample must retain its obstacle');
    assert.ok(gap(s.x, s.y + hero.footY, p) >= hero.footRadius - 1e-6,
      `seed ${seed} prop ${p.i}: wall pushed feet ${hero.footRadius - gap(s.x, s.y + hero.footY, p)} units into prop`);
    assert.ok(s.y >= hero.minY && s.y <= hero.maxY, 'hero stays inside the field');
    contacts++;
  }
  assert.ok(contacts >= 6, `only ${contacts} north-wall contacts sampled`);
});

test('P7: revival knockback separates ordinary enemies from props immediately', () => {
  let landings = 0;
  for (let seed = 1; seed <= 12; seed++) for (const p of props(C.create(seed))) {
    const s = C.create(seed); s.nextSpawn = 1e9;
    const dir = p.x > 180 ? 1 : -1;
    s.x = p.x - dir * 120; s.y = p.y; s.hp = 1; s.revives = 1;
    const e = H.enemy(s, 0, p.x - dir * 90, p.y);
    assert.ok(gap(s.ex[e], s.ey[e], p) >= s.er[e], 'enemy starts outside the prop');
    H.hurt(s);
    assert.equal(s.revivals, 1, 'sample must actually revive');
    for (const q of props(s)) assert.ok(gap(s.ex[e], s.ey[e], q) >= s.er[e] - 1e-6,
      `seed ${seed}: revival landed enemy inside prop ${q.i}`);
    assert.ok(Math.hypot(s.ex[e] - s.x, s.ey[e] - s.y) > 30, 'revival still pushes the enemy away');
    landings++;
  }
  assert.equal(landings, 48);
});
