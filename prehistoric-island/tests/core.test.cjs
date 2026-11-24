// Terrain, creature and camera rules from SPEC.md, checked on the real functions the page uses.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = import('../src/core.js');

const ASPECTS = [['desktop', 1440 / 900], ['phone', 390 / 664]];
// Where the subject of a shot may sit on screen (0..1, y down), clear of the title, the side panel, the
// caption and the button dock. Phone: the title and the animal panel take the top ~24 %, the caption and the
// two rows of buttons the bottom ~30 %.
const SAFE = { desktop: { x: [0.04, 0.96], y: [0.08, 0.8] }, phone: { x: [0.04, 0.96], y: [0.25, 0.68] } };
const sample = (from, to, fn, dt = 0.25) => { for (let t = from; t <= to + 1e-9; t += dt) fn(t); };

test('B1 the island has a summit with a crater, a beach ring, a shallow reef flat, a drop-off and a trench', async () => {
  const { height, islandS, coastRadius, ISLAND, SUMMIT, CRATER, BLOCK, FLOOR_MIN, trenchX, WATER } = await core;
  assert.ok(SUMMIT[1] > 30, `summit only ${SUMMIT[1].toFixed(1)} m`);
  assert.ok(CRATER[1] < SUMMIT[1] - 3, 'crater must sit below the rim');
  const ring = (s) => { const ys = []; for (let th = 0; th < 2 * Math.PI; th += 0.05) { const r = coastRadius(th) * s; ys.push(height(ISLAND.cx + r * Math.cos(th), ISLAND.cz + r * Math.sin(th))); } return ys; };
  const beach = ring(0.93);
  assert.ok(beach.every(y => y > WATER && y < 5), 'beach ring must be low dry land all round');
  const reef = ring(1.25), inBlock = (s) => { const out = []; for (let th = 0; th < 2 * Math.PI; th += 0.05) { const r = coastRadius(th) * s, x = ISLAND.cx + r * Math.cos(th), z = ISLAND.cz + r * Math.sin(th); if (x > BLOCK.x0 && x < BLOCK.x1 && z > BLOCK.z0 && z < BLOCK.z1) out.push(height(x, z)); } return out; };
  assert.ok(reef.every(y => y < -1 && y > -10), `reef flat must be 1–10 m under water, got ${Math.min(...reef).toFixed(1)}..${Math.max(...reef).toFixed(1)}`);
  const deep = inBlock(1.95);
  assert.ok(deep.length > 20 && deep.every(y => y < -25), 'beyond the reef edge the floor must drop past 25 m');
  for (let z = BLOCK.z0 + 4; z <= BLOCK.z1; z += 4) assert.ok(height(trenchX(z), z) < -55, `trench too shallow at z=${z}`);
  for (let x = BLOCK.x0; x <= BLOCK.x1; x += 2) for (let z = BLOCK.z0; z <= BLOCK.z1; z += 2) {
    const y = height(x, z); assert.ok(Number.isFinite(y) && y >= FLOOR_MIN - 1e-9, `floor at ${x},${z} below the base`);
  }
  void islandS;
});

test('B1 the front cut shows the reef edge, the deep floor and the trench in one profile', async () => {
  const { height, BLOCK } = await core;
  const ys = []; for (let x = BLOCK.x0; x <= BLOCK.x1; x += 1) ys.push(height(x, BLOCK.z1));
  assert.ok(ys.some(y => y > -20 && y < -6), 'no reef edge on the front cut');
  assert.ok(ys.some(y => y < -34 && y > -45), 'no deep floor on the front cut');
  assert.ok(Math.min(...ys) < -55, 'no trench on the front cut');
});

test('B2 plants grow on dry island ground only, clear of the beach walk and the crater', async () => {
  const { vegetation, height, islandS, WATER } = await core;
  const v = vegetation(7), count = (k) => v.filter(p => p.type === k).length;
  assert.ok(count('conifer') >= 30 && count('cycad') >= 15 && count('fern') >= 120, `too few plants: ${count('conifer')}/${count('cycad')}/${count('fern')}`);
  for (const p of v) { assert.ok(p.y > WATER + 2 && Math.abs(height(p.x, p.z) - p.y) < 1e-9, 'plant off the ground or on the beach'); assert.ok(islandS(p.x, p.z) > 0.2, 'plant in the crater'); }
  assert.deepEqual(vegetation(7), v, 'placement must be the same every load');
});

test('B3 animals stay where they live for the whole loop, and every loop closes', async () => {
  const c = await core, { CYCLE, WATER, height, insideBlock, SUMMIT } = c;
  const close = (a, b) => Math.hypot(...a.map((v, i) => v - b[i])) < 1e-6;
  sample(0, CYCLE, (t) => {
    c.HERD.forEach((_, i) => { const h = c.herdAt(i, t); assert.ok(h.position[1] > WATER + 0.5 && insideBlock(h.position[0], h.position[2], 4), `herd ${i} off the beach at ${t}`); });
    c.FLYERS.forEach((_, i) => { const f = c.flyerAt(i, t); assert.ok(f.position[1] > SUMMIT[1] + 15, `flyer ${i} too low at ${t}`); });
    c.SWIMMERS.forEach((w, i) => {
      const s = c.swimmerAt(i, t), [x, y, z] = s.position;
      assert.ok(insideBlock(x, z, 6), `swimmer ${i} leaves the block at ${t}`);
      assert.ok(y < WATER - 3 && y - height(x, z) > 4 * w.size, `swimmer ${i} not in open water at ${t}`);
      // Head and tail ends stay in the water too (body ~10 m long at size 1).
      for (const d of [9.4, -6]) { const hx = x + d * w.size * Math.cos(s.heading), hz = z + d * w.size * Math.sin(s.heading); assert.ok(y > height(hx, hz) + 1 && insideBlock(hx, hz, 0), `swimmer ${i} pokes through at ${t}`); }
    });
    c.SHELLS.forEach((_, k) => { const s = c.shellAt(k, t), [x, y, z] = s.position; assert.ok(y < WATER - 2 && y > height(x, z) + s.size, `shell ${k} out of the water at ${t}`); });
    c.SCHOOLS.forEach((_, j) => { for (const f of c.schoolAt(j, t).members) { const [x, y, z] = f.position; assert.ok(y < WATER - 0.5 && y > height(x, z) + 0.8 && insideBlock(x, z), `fish of school ${j} out of the water at ${t}`); } });
  }, 0.5);
  for (const [fn, n] of [[c.herdAt, 3], [c.flyerAt, 5], [c.swimmerAt, 2], [c.shellAt, 14]]) for (let i = 0; i < n; i++) assert.ok(close(fn(i, 0).position, fn(i, CYCLE).position), 'loop does not close');
});

// The thing each shot is about, which must be on screen and clear of the text.
async function subjects() {
  const c = await core;
  return {
    overview: () => [c.SUMMIT, [c.ISLAND.cx, 0, c.ISLAND.cz + 40]],
    cutaway: () => [c.SUMMIT, [c.trenchX(c.BLOCK.z1), -50, c.BLOCK.z1], [-40, -14, c.BLOCK.z1]],
    reef: () => [[-8, -4, 22]],
    trench: () => [[c.trenchX(c.BLOCK.z1), -58, c.BLOCK.z1]],
    beach: (t) => [c.herdAt(0, t).position.map((v, i) => v + (i === 1 ? 4 : 0))],
    summit: () => [c.CRATER],
  };
}

test('B4 every fixed view frames its subject inside the safe zone on desktop and phone', async () => {
  const { SHOTS, shotPoseAt, project } = await core, subj = await subjects();
  for (const [vp, aspect] of ASPECTS) for (const shot of SHOTS) for (const t of [shot.start, shot.at, shot.end - 0.01]) {
    const pose = shotPoseAt(shot.key, t, aspect);
    for (const p of subj[shot.key](t)) {
      const s = project(pose, aspect, p), z = SAFE[vp];
      assert.ok(s.z > 0 && s.x >= z.x[0] && s.x <= z.x[1] && s.y >= z.y[0] && s.y <= z.y[1], `${shot.key} on ${vp} at ${t.toFixed(1)}: subject at ${s.x.toFixed(2)},${s.y.toFixed(2)}`);
    }
  }
});

test('B4 no camera stands inside the water body, the ground or a tree crown', async () => {
  const c = await core, crowns = c.vegetation(7).filter(p => p.type !== 'fern').map(c.crown);
  const check = (pose, what) => {
    const [x, y, z] = pose.position;
    assert.ok(!c.inWater(pose.position), `${what}: camera inside the water body at ${pose.position.map(v => v.toFixed(1))}`);
    if (c.insideBlock(x, z, -1)) assert.ok(y > c.height(x, z) + 2, `${what}: camera in the ground`);
    for (const k of crowns) assert.ok(Math.hypot(x - k.c[0], y - k.c[1], z - k.c[2]) > k.r + 0.5, `${what}: camera inside a tree`);
    // Near the water wall the near plane must not clip into it: keep 1 m off the cut faces when below water.
    if (y < c.WATER && Math.abs(x) < c.BLOCK.x1 + 1 && z > c.BLOCK.z0 - 1 && z < c.BLOCK.z1 + 1) assert.ok(!c.insideBlock(x, z, -1), `${what}: camera brushing the water wall`);
  };
  for (const [vp, aspect] of ASPECTS) {
    for (const shot of c.SHOTS) sample(shot.start, shot.end - 0.01, (t) => check(c.shotPoseAt(shot.key, t, aspect), `${shot.key}/${vp}@${t.toFixed(2)}`));
    sample(0, c.CYCLE, (t) => { const p = c.tourPose(t, aspect); if (p.fade < 0.95) check(p, `tour/${vp}@${t.toFixed(2)}`); }, 1 / 15);
  }
});

test('B5 the tour never jumps except under a full fade, including the wrap from 48 s to 0 s', async () => {
  const { tourPose, CYCLE, CUT_INTO } = await core;
  for (const [vp, aspect] of ASPECTS) {
    const frames = [];
    for (let t = -1 / 30; t <= CYCLE + 1; t += 1 / 30) frames.push({ t, ...tourPose(t, aspect) });
    const relOf = (i) => { const p = frames[i], q = frames[i - 1], dist = Math.min(...[p, q].map(f => Math.hypot(...f.position.map((v, k) => v - f.target[k])))); return Math.max(Math.hypot(...p.position.map((v, k) => v - q.position[k])), Math.hypot(...p.target.map((v, k) => v - q.target[k]))) / dist; };
    let cuts = 0;
    for (let i = 1; i < frames.length; i++) {
      const p = frames[i], q = frames[i - 1], rel = relOf(i);
      const r0 = i > 1 ? relOf(i - 1) : 0, r2 = i + 1 < frames.length ? relOf(i + 1) : 0, spike = rel > 0.02 && rel > 4 * Math.max(r0, r2);
      if (rel > 0.15 || spike) { assert.ok(Math.max(p.fade, q.fade) > 0.85, `${vp}: tour jumps ${(rel * 100).toFixed(1)} % at ${p.t.toFixed(2)} s without a fade`); cuts++; }
    }
    assert.ok(cuts <= CUT_INTO.size + 1, `${vp}: ${cuts} hard cuts`);
  }
});

test('B5 a button press glides or fades, lands on the shot, and a held shot never snaps back', async () => {
  const { ViewController, shotPoseAt, BLEND, FADE } = await core;
  const view = new ViewController(), t = 19.5, aspect = 1.6;
  view.tour(t - 13); let prev = view.pose(t - 13, aspect, 0);
  view.select('reef', prev, 0);
  let worst = 0;
  for (let wall = 0; wall <= BLEND + 0.2; wall += 1 / 60) { const p = view.pose(t, aspect, wall); worst = Math.max(worst, Math.hypot(...p.position.map((v, i) => v - prev.position[i]))); prev = p; }
  assert.ok(worst < 8, `blend step ${worst.toFixed(2)} m per frame`);
  const end = shotPoseAt('reef', t, aspect);
  assert.ok(Math.hypot(...prev.position.map((v, i) => v - end.position[i])) < 1e-6, 'blend must land on the shot');
  view.select('beach', prev, 10);
  let before = view.pose(t, aspect, 10), black = false;
  for (let wall = 10; wall <= 10 + 2 * FADE + 0.1; wall += 1 / 120) {
    const p = view.pose(t, aspect, wall), move = Math.hypot(...p.position.map((v, i) => v - before.position[i]));
    if (move > 2) assert.ok(p.fade > 0.95, 'a cut must happen under black'); if (p.fade > 0.95) black = true; before = p;
  }
  assert.ok(black, 'never went black');
  view.jump('trench'); let held = view.pose(20, aspect, 40), jump = 0;
  for (let tt = 20; tt < 60; tt += 1 / 30) { const p = view.pose(tt, aspect, 40); jump = Math.max(jump, Math.hypot(...p.position.map((v, i) => v - held.position[i]))); held = p; }
  assert.ok(jump < 2, `held shot snaps ${jump.toFixed(2)} m`);
});

test('B6 fixed views are deterministic and each has a name, an English kicker and a still time', async () => {
  const { SHOTS, shotPoseAt, CYCLE } = await core;
  assert.equal(SHOTS.length, 6);
  for (const s of SHOTS) {
    assert.ok(s.name && s.en && s.at > s.start && s.at < s.end && s.end <= CYCLE, `shot ${s.key} incomplete`);
    assert.deepEqual(shotPoseAt(s.key, s.at, 1.6), shotPoseAt(s.key, s.at, 1.6));
  }
  assert.deepEqual(SHOTS.map(s => s.key), ['overview', 'cutaway', 'reef', 'trench', 'beach', 'summit']);
});

// 2026-11-25 real-GPU review: at each end of the walk the plant-eaters flipped 180° in one frame. They turn
// round over a couple of seconds now; no frame may turn one by more than 3°.
test('B3 the plant-eaters turn round at the ends of their walk instead of flipping', async () => {
  const c = await core;
  for (let i = 0; i < c.HERD.length; i++) {
    let prev = c.herdAt(i, 0).heading;
    for (let t = 1 / 60; t <= c.CYCLE; t += 1 / 60) {
      const h = c.herdAt(i, t).heading; let d = Math.abs(h - prev) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d;
      assert.ok(d * 180 / Math.PI <= 3, `herd ${i} turned ${(d * 180 / Math.PI).toFixed(1)}° in one frame at ${t.toFixed(2)} s`);
      prev = h;
    }
  }
});
