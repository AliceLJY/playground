// Screen framing (src/view.js) and the render mesh helpers (src/mesh.js, src/shape.js): the bears' table must
// land in the free part of the screen at both checked sizes, picking must agree with projection, and the
// bear surface must be closed with outward normals.
const test = require('node:test');
const assert = require('node:assert/strict');
const view = import('../src/view.js');
const physics = import('../src/physics.js');
const scenes = import('../src/scenarios.js');
const shape = import('../src/shape.js');
const mesh = import('../src/mesh.js');

const SIZES = [
  { name: 'desktop 1440×900', w: 1440, h: 900, quality: 'high', phone: false },
  { name: 'phone 390×664', w: 390, h: 664, quality: 'low', phone: true },
];
// The title and card rectangles as the page's CSS draws them (index.template.html).
function uiRects(w, h, phone) {
  if (phone) return { title: { x0: 16, y0: 12, x1: w - 16, y1: 66 }, card: { x0: 10, y0: h - 10 - 196, x1: w - 10, y1: h - 10 } };
  return { title: { x0: 40, y0: 36, x1: 580, y1: 236 }, card: { x0: w - 36 - 300, y0: 36, x1: w - 36, y1: 36 + 520 } };
}
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const inside = (a, r, pad = 0.5) => a.x0 >= r.x0 - pad && a.x1 <= r.x1 + pad && a.y0 >= r.y0 - pad && a.y1 <= r.y1 + pad;

test('V1 the bear region keeps clear of the title and the card, at desktop and phone size', async () => {
  const { bearRegion, isPhoneLayout } = await view;
  for (const s of SIZES) {
    assert.equal(isPhoneLayout(s.w, s.h), s.phone, s.name);
    const r = bearRegion(s.w, s.h), ui = uiRects(s.w, s.h, s.phone);
    assert.ok(!overlaps(r, ui.title) && !overlaps(r, ui.card), `${s.name}: region ${JSON.stringify(r)} touches the title or card`);
    assert.ok(r.x0 >= 0 && r.y0 >= 0 && r.x1 <= s.w && r.y1 <= s.h, s.name);
    assert.ok((r.x1 - r.x0) * (r.y1 - r.y0) > 0.3 * s.w * s.h, `${s.name}: bear region is only ${(((r.x1 - r.x0) * (r.y1 - r.y0)) / (s.w * s.h) * 100).toFixed(0)} % of the screen`);
  }
});

test('V2 the whole table, and every bear in the four scenes, lands inside the bear region', async () => {
  const { frame, framePoints, project, toScreen, screenBox } = await view, { World } = await physics, { runOnWorld, SCENARIOS } = await scenes;
  for (const s of SIZES) {
    const w0 = new World({ quality: s.quality }), cam = frame(s.w, s.h, w0.arena), r = cam.region;
    for (const p of framePoints(w0.arena)) {
      const q = toScreen(project(cam, p), s.w, s.h);
      assert.ok(q.x >= r.x0 - 0.5 && q.x <= r.x1 + 0.5 && q.y >= r.y0 - 0.5 && q.y <= r.y1 + 0.5, `${s.name}: table corner ${p} at ${q.x.toFixed(0)},${q.y.toFixed(0)}`);
    }
    for (const key of ['row', 'stretch', 'pile']) {
      const w = new World({ quality: s.quality }), { snapshot } = runOnWorld(w, SCENARIOS[key]);
      for (const b of snapshot.bears) {
        const box = screenBox(cam, b.box);
        assert.ok(inside(box, r, 2), `${s.name} ${key}: bear ${b.id} on screen at ${JSON.stringify(box)}, region ${JSON.stringify(r)}`);
        assert.ok(b.box.max[1] - b.box.min[1] > 0, key);
      }
    }
    // The resting row is big enough to read: each bear spans a fair number of pixels.
    const row = runOnWorld(new World({ quality: s.quality }), SCENARIOS.row).snapshot;
    for (const b of row.bears) { const box = screenBox(cam, b.box); assert.ok(box.x1 - box.x0 > (s.phone ? 45 : 90), `${s.name}: bear ${b.id} only ${(box.x1 - box.x0).toFixed(0)} px wide`); }
  }
});

test('V3 screen points and world points agree both ways (projection, ray, drag plane, picking)', async () => {
  const { frame, project, toScreen, screenToPlane, pickParticle } = await view, { World } = await physics;
  for (const s of SIZES) {
    const w = new World({ quality: s.quality }), cam = frame(s.w, s.h, w.arena);
    for (const p of [[0, 0, 0], [2, 1, -1], [-1.5, 0.4, 1.2], [3, 2, 2]]) {
      const q = toScreen(project(cam, p), s.w, s.h), back = screenToPlane(cam, q.x, q.y, p);
      assert.ok(Math.hypot(...back.map((v, k) => v - p[k])) < 1e-6, `${s.name}: ${p} → ${back}`);
    }
    // Clicking on a bear's head picks a particle of that bear.
    const n = w.n, head = w.partParticle.head;
    for (let b = 0; b < w.count; b++) {
      const o = (b * n + head) * 3, q = toScreen(project(cam, [w.x[o], w.x[o + 1], w.x[o + 2]]), s.w, s.h);
      const hit = pickParticle(cam, q.x, q.y, w.x, w.count * n, w.r * 1.25);
      assert.ok(hit && Math.floor(hit.particle / n) === b, `${s.name}: clicking bear ${b}'s head picked ${hit && hit.particle}`);
    }
    assert.equal(pickParticle(cam, cam.region.x0 + 2, cam.region.y0 + 2, w.x, w.count * n, w.r * 1.25), null, `${s.name}: empty corner picked a bear`);
  }
});

test('V4 the projection matrix matches the plain-maths projection', async () => {
  const { frame, project, projectionMatrix, basis } = await view;
  const cam = frame(1440, 900), m = projectionMatrix(cam), { x, y, z } = basis(cam.eye, cam.target);
  for (const p of [[1, 0.5, -2], [-3, 1, 1]]) {
    const d = p.map((v, k) => v - cam.eye[k]), v = [d[0] * x[0] + d[1] * x[1] + d[2] * x[2], d[0] * y[0] + d[1] * y[1] + d[2] * y[2], d[0] * z[0] + d[1] * z[1] + d[2] * z[2], 1];
    const c = [0, 1, 2, 3].map(r => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]), q = project(cam, p);
    assert.ok(Math.abs(c[0] / c[3] - q.x) < 1e-9 && Math.abs(c[1] / c[3] - q.y) < 1e-9);
  }
});

test('M1 the bear surface is closed, with outward normals, at both detail levels; the merged index addresses every slot', async () => {
  const { bearTemplate, bearSdf } = await shape, { mergedIndex, computeNormals } = await mesh;
  for (const step of [0.06, 0.08]) {
    const t = bearTemplate({ surfaceStep: step }), P = t.surface.positions, I = t.surface.indices, NV = P.length;
    // Closed: every edge is shared by exactly two triangles.
    const edges = new Map();
    for (let k = 0; k < I.length; k += 3) for (const [a, b] of [[I[k], I[k + 1]], [I[k + 1], I[k + 2]], [I[k + 2], I[k]]]) { const key = a < b ? a * NV + b : b * NV + a; edges.set(key, (edges.get(key) || 0) + 1); }
    assert.ok([...edges.values()].every(c => c === 2), `step ${step}: surface has open or shared-by-3 edges`);
    const p = new Float32Array(NV * 6), nrm = new Float32Array(NV * 6);
    P.forEach((v, i) => { p.set(v, (NV + i) * 3); });
    computeNormals(p, nrm, I, NV, 1);
    let out = 0;
    for (let i = 0; i < NV; i++) {
      const o = (NV + i) * 3, q = [p[o] + nrm[o] * 0.02, p[o + 1] + nrm[o + 1] * 0.02, p[o + 2] + nrm[o + 2] * 0.02];
      if (bearSdf(q) > bearSdf(P[i])) out++;
    }
    assert.ok(out / NV > 0.99, `step ${step}: only ${(out / NV * 100).toFixed(1)} % of normals point out`);
    assert.ok(nrm.slice(0, NV * 3).every(v => v === 0), 'slot 0 untouched');
    const idx = mergedIndex(I, NV, 3);
    assert.equal(idx.length, I.length * 3);
    assert.equal(Math.max(...idx), NV * 3 - 1);
    assert.equal(idx[I.length * 2], I[0] + NV * 2);
  }
});
