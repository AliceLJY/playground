// Logic checks for 雪线小木屋. Run in this folder: node --test tests/*.test.cjs
// Each test names the SPEC.md item it guards. They drive the same code the page runs (src/core.js);
// pixels, bloom, frame rate and the real layout of the text are checked in a browser by tools/browser-check.cjs.
const test = require('node:test');
const assert = require('node:assert');
const load = () => import('../src/core.js');
const DT = 1 / 60;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('SPEC 1: the loop closes and never jumps', async () => {
  const c = await load();
  const a = c.pathAt(0), b = c.pathAt(1);
  assert.ok(dist(a.pos, b.pos) < 1e-9, 'the loop must end where it starts');
  // speed is judged by how far away the lodge is: up close 3 m/s, on the far aerial legs 6 m/s
  let near = 0, far = 0;
  for (let i = 0; i < c.LOOP_S * 60; i++) {
    const a2 = c.pathAt(i / (c.LOOP_S * 60)).pos, d = dist(a2, c.pathAt((i + 1) / (c.LOOP_S * 60)).pos);
    if (Math.hypot(a2[0], a2[1] - 4, a2[2]) < 30) near = Math.max(near, d); else far = Math.max(far, d);
  }
  assert.ok(near < 0.05, `within 30 m of the lodge the camera moves ${near.toFixed(3)} m in one frame, limit 0.05 (3 m/s)`);
  assert.ok(far < 0.1, `on the far legs the camera moves ${far.toFixed(3)} m in one frame, limit 0.1 (6 m/s)`);
});

test('SPEC 2: along the whole loop the camera stays 6 m clear of the lodge, outside every summit, above the cloud', async () => {
  const c = await load();
  for (let i = 0; i < 2000; i++) {
    const p = c.pathAt(i / 2000).pos;
    assert.ok(c.clearance(p) >= 6, `u=${i / 2000}: ${c.clearance(p).toFixed(2)} m from the lodge, need 6`);
    assert.ok(p[1] > c.CLOUD_Y + 6, `u=${i / 2000}: camera at y=${p[1].toFixed(1)} is in the cloud`);
    if (p[1] < 21) assert.ok(Math.hypot(p[0], p[2]) > c.SUMMIT_R + 1.5, `u=${i / 2000}: camera is over the lodge summit at low height`);
    for (const s of c.SATELLITES) assert.ok(dist(p, [s.x, s.y + 1.5, s.z]) > s.r + 3, `u=${i / 2000}: camera is inside summit ${s.id}`);
  }
});

test('SPEC 3: the loop has its four beats — opening with the moon behind the tower, deck level, past a far hut, high aerial', async () => {
  const c = await load();
  const start = c.pathAt(c.VIEWS.hero), tower = c.BUILDINGS.find((b) => b.id === 'tower');
  for (const aspect of [16 / 9, 1440 / 900]) {
    const top = c.project([tower.cx, tower.h, tower.cz], start.pos, start.target, aspect);
    const moon = c.project(start.pos.map((v, i) => v + c.MOON_DIR[i] * 500), start.pos, start.target, aspect);
    assert.ok(moon.z > 0 && Math.abs(moon.x) < 0.9 && moon.y < 0.92 && moon.y > 0.3, `aspect ${aspect.toFixed(2)}: moon centre at ${moon.x.toFixed(2)}, ${moon.y.toFixed(2)} is not in the upper frame`);
    assert.ok(Math.abs(moon.x - top.x) < 0.22 && moon.y > top.y, `aspect ${aspect.toFixed(2)}: moon (${moon.x.toFixed(2)}, ${moon.y.toFixed(2)}) is not behind and above the tower top (${top.x.toFixed(2)}, ${top.y.toFixed(2)})`);
  }
  let low = Infinity, nearSat = Infinity, high = -Infinity;
  for (let i = 0; i < 1000; i++) {
    const p = c.pathAt(i / 1000).pos;
    if (Math.hypot(p[0], p[2]) < 28) low = Math.min(low, p[1]);
    nearSat = Math.min(nearSat, dist(p, [c.SATELLITES[0].x, c.SATELLITES[0].y, c.SATELLITES[0].z]));
    high = Math.max(high, p[1]);
  }
  assert.ok(low > c.DECK_Y + 1 && low < c.DECK_Y + 3.5, `lowest pass near the lodge is y=${low.toFixed(2)}, want deck level + 1 to 3.5 m`);
  assert.ok(nearSat < 16, `closest pass to the red hut is ${nearSat.toFixed(1)} m, want under 16`);
  assert.ok(high > 36, `highest point is ${high.toFixed(1)} m, want above 36`);
});

test('SPEC 3: from the aerial beat every summit is inside the frame', async () => {
  const c = await load();
  const v = c.pathAt(c.VIEWS.wide);
  for (const s of c.SATELLITES) {
    const q = c.project([s.x, s.y, s.z], v.pos, v.target, 16 / 9);
    assert.ok(q.z > 0 && Math.abs(q.x) < 1 && Math.abs(q.y) < 1, `${s.id} is out of frame at (${q.x.toFixed(2)}, ${q.y.toFixed(2)})`);
  }
});

test('SPEC 4: at least six smaller summits, each different, not on a grid', async () => {
  const c = await load();
  const S = c.SATELLITES;
  assert.ok(S.length >= 6);
  const sig = new Set(S.map((s) => s.features.slice().sort().join('+')));
  assert.strictEqual(sig.size, S.length, 'two summits carry the same set of things');
  assert.strictEqual(new Set(S.map((s) => s.y)).size, S.length, 'two summits share a height');
  assert.ok(Math.max(...S.map((s) => s.y)) - Math.min(...S.map((s) => s.y)) >= 8, 'heights span less than 8 m');
  const d = S.map((s) => Math.hypot(s.x, s.z));
  assert.ok(Math.max(...d) - Math.min(...d) >= 12, 'distances from the lodge span less than 12 m');
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
    assert.ok(Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z) > S[i].r + S[j].r + 4, `${S[i].id} and ${S[j].id} overlap`);
    assert.ok(Math.abs(S[i].x - S[j].x) > 1.5 || Math.abs(S[i].z - S[j].z) > 1.5, `${S[i].id} and ${S[j].id} line up on a grid axis`);
  }
  const ph = S.map((_, i) => c.phaseOf(i));
  for (let i = 0; i < ph.length; i++) for (let j = i + 1; j < ph.length; j++) assert.ok(Math.abs(ph[i] - ph[j]) > 0.2, 'two summits move in step');
});

test('SPEC 5: windows — most lit, some dim, some dark, a few flickering', async () => {
  const c = await load();
  const st = c.windowStates(69), n = (k) => st.filter((s) => s === k).length / st.length;
  assert.ok(n('lit') >= 0.4 && n('lit') <= 0.62, `lit share ${n('lit').toFixed(2)}`);
  assert.ok(n('dim') >= 0.1 && n('dim') <= 0.28, `dim share ${n('dim').toFixed(2)}`);
  assert.ok(n('dark') >= 0.15 && n('dark') <= 0.35, `dark share ${n('dark').toFixed(2)}`);
  assert.ok(n('flicker') >= 0.03 && n('flicker') <= 0.12, `flicker share ${n('flicker').toFixed(2)}`);
  let lo = 9, hi = 0; for (let t = 0; t < 10; t += 0.02) { const v = c.windowLevel('flicker', t, 3); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  assert.ok(lo > 0.4 && hi <= 1.01 && hi - lo > 0.2, `flicker range ${lo.toFixed(2)}..${hi.toFixed(2)}`);
  assert.strictEqual(c.windowLevel('lit', 1, 0), c.windowLevel('lit', 7, 0), 'a steady window must not change');
});

test('SPEC 6: a drag takes the view at once and without a jump; hands off, the loop takes it back smoothly', async () => {
  const c = await load();
  for (const u0 of [0.02, 0.2, 0.5, 0.8]) {
    const rig = c.createRig({ u: u0 });
    let prev = rig.update(DT).pos;
    for (let i = 0; i < 120; i++) prev = rig.update(DT).pos;
    rig.drag(0, 0);                                   // touch only
    let p = rig.update(DT).pos;
    assert.strictEqual(rig.mode, 'manual');
    assert.ok(dist(p, prev) < 0.08, `u=${u0}: taking over moved the camera ${dist(p, prev).toFixed(3)} m`);
    const u1 = rig.u; rig.drag(0.5, 0.05); p = rig.update(DT).pos;
    assert.strictEqual(rig.u, u1, 'the loop must stop advancing while the hand is on it');
    prev = p; let worst = 0, returned = false;
    for (let i = 0; i < (c.IDLE_S + c.RETURN_S + 2) * 60; i++) {
      const q = rig.update(DT).pos; worst = Math.max(worst, dist(q, prev)); prev = q;
      assert.ok(c.clearance(q) >= 5, `u=${u0}: hand-back passes ${c.clearance(q).toFixed(2)} m from the lodge`);
      if (rig.mode === 'auto') returned = true;
    }
    assert.ok(returned, `u=${u0}: the loop never took the view back`);
    assert.ok(worst < 0.75, `u=${u0}: hand-back moves ${worst.toFixed(2)} m in one frame, limit 0.75 (45 m/s)`);
  }
});

test('SPEC 6: with auto-orbit off the view stays where the hand left it; zoom is clamped; nothing a hand can do puts the camera inside something', async () => {
  const c = await load();
  const rig = c.createRig({ u: 0.3 }); rig.update(DT); rig.setAuto(false);
  const a = rig.update(DT).pos; for (let i = 0; i < 20 * 60; i++) rig.update(DT);
  assert.strictEqual(rig.mode, 'manual');
  const rnd = c.mulberry32(9);
  const fromRig = (r) => [r.target[0] + r.sph.r * Math.cos(r.sph.el) * Math.sin(r.sph.az), r.target[1] + r.sph.r * Math.sin(r.sph.el), r.target[2] + r.sph.r * Math.cos(r.sph.el) * Math.cos(r.sph.az)];
  const far0 = Math.max(c.R_MAX, dist(a, c.ORBIT_TARGET));
  for (let i = 0; i < 4000; i++) {
    if (rnd() < 0.5) rig.drag((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.3); else rig.zoom(rnd() < 0.5 ? 0.8 : 1.25);
    const p = rig.update(DT).pos;
    assert.ok(dist(fromRig(rig), c.ORBIT_TARGET) <= far0 + 1e-6, 'zoomed out past the limit');
    assert.ok(c.clearance(p) >= 5, `camera ${c.clearance(p).toFixed(2)} m from the lodge`);
    assert.ok(p[1] >= c.CLOUD_Y + 4 - 1e-9, 'camera sank into the cloud');
    for (const s of c.SATELLITES) assert.ok(dist(p, [s.x, s.y + 1.5, s.z]) >= s.r + 3.5 - 1e-6, `camera inside summit ${s.id}`);
  }
  assert.ok(a);
});

test('SPEC 7: in the opening view the lodge sits clear of the copy on wide screens and above it on a phone', async () => {
  const c = await load();
  const v = c.pathAt(c.VIEWS.hero);
  for (const aspect of [16 / 9, 1440 / 900, 21 / 9]) {
    const b = c.screenBox(c.HERO_BOX, v.pos, v.target, aspect);
    assert.ok(b.front && b.x0 >= 0.36 && b.x1 <= 0.97, `aspect ${aspect.toFixed(2)}: lodge spans x ${b.x0.toFixed(2)}..${b.x1.toFixed(2)}, want inside 0.36..0.97`);
    assert.ok(b.y1 - b.y0 >= 0.4 && b.y1 - b.y0 <= 0.8, `aspect ${aspect.toFixed(2)}: lodge is ${(b.y1 - b.y0).toFixed(2)} of the height, want 0.4..0.8`);
  }
  const b = c.screenBox(c.HERO_BOX, v.pos, v.target, 390 / 844);
  assert.ok(b.x0 >= 0.02 && b.x1 <= 0.98 && b.y1 <= 0.6 && b.y0 >= 0.08, `phone: lodge box x ${b.x0.toFixed(2)}..${b.x1.toFixed(2)}, y ${b.y0.toFixed(2)}..${b.y1.toFixed(2)}`);
});

test('SPEC 8: lighting the lamps — each summit lights once, seven make the finale, unknown ids do nothing', async () => {
  const c = await load();
  const g = c.createGame();
  assert.deepStrictEqual(g.light('nowhere'), { changed: false, count: 0, done: false, finale: false });
  c.SATELLITES.forEach((s, i) => {
    const r = g.light(s.id);
    assert.ok(r.changed && r.count === i + 1, `${s.id} did not light`);
    assert.strictEqual(r.finale, i === c.SATELLITES.length - 1, 'the finale must fire exactly on the seventh');
    assert.strictEqual(g.light(s.id).changed, false, 'a lit summit must not light twice');
    assert.strictEqual(g.light(s.id).finale, false, 'the finale must not fire again');
  });
  assert.ok(g.done);
  for (const s of c.SATELLITES) { assert.ok(c.STORIES[s.id] && c.STORIES[s.id].line.length >= 10, `${s.id} has no story`); assert.strictEqual(c.summitOf(s.id + '-a'), s.id); }
  assert.strictEqual(c.summitOf('keep'), null);
});

test('SPEC 9: every summit has a parking view that shows it, clear of everything, and a tap on it picks it', async () => {
  const c = await load();
  for (const s of c.SATELLITES) {
    const f = c.focusPose(s.id);
    for (const o of c.SATELLITES) assert.ok(dist(f.pos, [o.x, o.y + 1.5, o.z]) >= o.r + 3.5 - 1e-6, `view of ${s.id} is inside ${o.id}`);
    assert.ok(c.clearance(f.pos) >= 6, `view of ${s.id} is ${c.clearance(f.pos).toFixed(1)} m from the lodge`);
    const d = dist(f.pos, [s.x, s.y, s.z]); assert.ok(d > s.r + 5 && d < s.r * 3.4 + 16, `view of ${s.id} is ${d.toFixed(1)} m away`);
    for (const aspect of [16 / 9, 390 / 844]) {
      const q = c.project([s.x, s.y + 1.6, s.z], f.pos, f.target, aspect);
      assert.ok(q.z > 0 && Math.abs(q.x) < 0.6 && Math.abs(q.y) < 0.6, `${s.id} sits at (${q.x.toFixed(2)}, ${q.y.toFixed(2)}) in its own view, aspect ${aspect.toFixed(2)}`);
    }
    const dir = f.target.map((v, i) => v - f.pos[i]), l = Math.hypot(...dir);
    assert.strictEqual(c.pickSummit(f.pos, dir.map((v) => v / l)), s.id, `a tap at the middle of the view of ${s.id} picks something else`);
  }
  const h = c.homePose(), dir = [0 - h.pos[0], 5 - h.pos[1], 1 - h.pos[2]], l = Math.hypot(...dir);
  assert.strictEqual(c.pickSummit(h.pos, dir.map((v) => v / l)), 'lodge');
});

test('SPEC 9: flying to a summit and back never jumps, never passes through the lodge, and the loop waits until released', async () => {
  const c = await load();
  for (const s of c.SATELLITES) for (const u0 of [0, 0.35, 0.7]) {
    const rig = c.createRig({ u: u0 }); let prev = rig.update(DT).pos;
    rig.flyTo(c.focusPose(s.id));
    let worst = 0;
    for (let i = 0; i < (c.FLY_MAX_S + 0.5) * 60; i++) { const q = rig.update(DT).pos; worst = Math.max(worst, dist(q, prev)); prev = q; assert.ok(c.clearance(q) >= 5, `to ${s.id} from u=${u0}: ${c.clearance(q).toFixed(2)} m from the lodge`); }
    // 1 m a frame separates a fast sweep from a teleport; the fastest frames are where the flight bends around another summit
    assert.ok(worst < 1.0, `to ${s.id} from u=${u0}: ${worst.toFixed(2)} m in one frame, limit 1.0 (60 m/s)`);
    assert.ok(dist(prev, c.focusPose(s.id).pos) < 0.05, `did not arrive at ${s.id}`);
    for (let i = 0; i < 20 * 60; i++) rig.update(DT);
    assert.strictEqual(rig.mode, 'manual', 'the loop took the view back while parked');
    rig.release(); let back = false; worst = 0; prev = rig.update(DT).pos;
    for (let i = 0; i < 7 * 60; i++) { const q = rig.update(DT).pos; worst = Math.max(worst, dist(q, prev)); prev = q; if (rig.mode === 'auto') back = true; assert.ok(c.clearance(q) >= 5); }
    assert.ok(back && worst < 1.2, `from ${s.id}: back=${back}, worst step ${worst.toFixed(2)} m`);
  }
});

test('SPEC 10: the hour — night is the darkest sky, stars and lit windows peak at night, values stay continuous', async () => {
  const c = await load();
  const lum = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  const d = c.skyAt(0), n = c.skyAt(0.5), m = c.skyAt(1);
  assert.ok(lum(n.low) < lum(d.low) && lum(n.low) < lum(m.low), 'night horizon must be darker than dusk and dawn');
  assert.ok(n.stars === 1 && d.stars < 0.5 && m.stars === 0);
  assert.ok(d.low[0] > d.low[2] && m.low[0] > m.low[2] && n.low[2] > n.low[0], 'dusk and dawn horizons are warm, night is blue');
  let prev = c.skyAt(0);
  for (let h = 0.01; h <= 1.0001; h += 0.01) { const s = c.skyAt(h); for (const f of ['low', 'fog', 'key']) for (let i = 0; i < 3; i++) assert.ok(Math.abs(s[f][i] - prev[f][i]) < 0.05, `${f} jumps at h=${h.toFixed(2)}`); assert.ok(Math.abs(Math.hypot(...s.keyDir) - 1) < 1e-9); prev = s; }
  const on = (h) => { let k = 0; for (let i = 0; i < 400; i++) if (c.windowOn(i, h)) k++; return k / 400; };
  assert.ok(on(0.5) === 1, 'at night every window keeps its usual state');
  assert.ok(on(0) > 0.25 && on(0) < 0.55, `dusk: ${on(0)}`); assert.ok(on(1) > 0.03 && on(1) < 0.2, `dawn: ${on(1)}`);
  for (let i = 0; i < 400; i++) if (c.windowOn(i, 1)) assert.ok(c.windowOn(i, 0.75) && c.windowOn(i, 0.5), 'a window on at dawn must have been on all night');
});

test('SPEC 11: inside — three standing spots inside the room, clear of walls and furniture, eye below the ceiling', async () => {
  const c = await load();
  assert.strictEqual(c.SPOTS.length, 3);
  const keep = c.BUILDINGS[0];
  assert.ok(c.ROOM.x0 > keep.cx - keep.w / 2 && c.ROOM.x1 < keep.cx + keep.w / 2 && c.ROOM.z0 > keep.cz - keep.d / 2 && c.ROOM.z1 < keep.cz + keep.d / 2, 'the room must fit inside the main house');
  for (const s of c.SPOTS) {
    assert.ok(s.x > c.ROOM.x0 + 0.6 && s.x < c.ROOM.x1 - 0.6 && s.z > c.ROOM.z0 + 0.6 && s.z < c.ROOM.z1 - 0.6, `${s.id} is too close to a wall`);
    for (const f of c.FURNITURE) { const dx = Math.max(f.x0 - s.x, s.x - f.x1, 0), dz = Math.max(f.z0 - s.z, s.z - f.z1, 0); assert.ok(Math.hypot(dx, dz) >= 0.5, `${s.id} stands ${Math.hypot(dx, dz).toFixed(2)} m from the ${f.id}`); }
  }
  for (let i = 0; i < c.SPOTS.length; i++) for (let j = i + 1; j < c.SPOTS.length; j++) assert.ok(Math.hypot(c.SPOTS[i].x - c.SPOTS[j].x, c.SPOTS[i].z - c.SPOTS[j].z) > 1.5, 'two spots are nearly the same place');
  const v = c.createVisit(); v.go(1); v.look(0.3, 5); const p = v.pose();
  assert.ok(p.pos[1] < c.ROOM.y1 - 0.5 && p.pos[1] > c.ROOM.y0 + 1, 'eye height'); assert.ok(v.pitch <= 0.9, 'pitch is clamped');
  assert.ok(Math.abs(dist(p.pos, p.target) - 1) < 1e-9);
  // the window spot looks out through the back wall, towards the moon side
  v.go(1); const w = v.pose(), f = [w.target[0] - w.pos[0], w.target[2] - w.pos[2]]; assert.ok(f[1] < -0.8 && f[0] * c.MOON_DIR[0] + f[1] * c.MOON_DIR[2] > 0.6, 'the window spot must face the moon side');
});
