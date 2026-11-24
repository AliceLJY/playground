// The bear's shape, built once and shared by every bear: one smooth signed-distance field (SDF), a render
// surface taken from it, and a coarse tetrahedral lattice inside it that the physics moves.
// Pure functions, no Three.js: the page, the Node tests and the CPU preview all use exactly this.
//
// Bear space: y up (feet to ears), z forward (belly and snout), x to the bear's left. Units are "bear units":
// the bear stands about 2.1 tall. Nothing here claims real-world sizes.

// ---------- signed distance field ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
function sdEllipsoid(p, c, r) {
  const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
  const q2 = [(p[0] - c[0]) / (r[0] * r[0]), (p[1] - c[1]) / (r[1] * r[1]), (p[2] - c[2]) / (r[2] * r[2])];
  const k0 = len(q), k1 = len(q2);
  return k1 < 1e-9 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
}
function sdCapsule(p, a, b, r) {
  const pa = sub(p, a), ba = sub(b, a);
  const h = Math.min(1, Math.max(0, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2])));
  return len([pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h]) - r;
}
// Polynomial smooth minimum: blends the parts into one continuous outline instead of balls glued together.
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

// Classic bear: round head with two ears, a short snout, a plump body and short stubby limbs.
export const PARTS = {
  body: { c: [0, -0.22, 0], r: [0.56, 0.64, 0.44] },
  belly: { c: [0, -0.3, 0.12], r: [0.44, 0.46, 0.36] },
  head: { c: [0, 0.56, 0.02], r: [0.47, 0.41, 0.4] },
  snout: { c: [0, 0.46, 0.33], r: [0.21, 0.15, 0.14] },
  earL: { c: [0.34, 0.9, -0.02], r: [0.16, 0.15, 0.12] },
  earR: { c: [-0.34, 0.9, -0.02], r: [0.16, 0.15, 0.12] },
  armL: { a: [0.42, 0.02, 0.06], b: [0.6, -0.2, 0.2], r: 0.18 },
  armR: { a: [-0.42, 0.02, 0.06], b: [-0.6, -0.2, 0.2], r: 0.18 },
  legL: { a: [0.28, -0.62, 0.06], b: [0.33, -0.86, 0.2], r: 0.21 },
  legR: { a: [-0.28, -0.62, 0.06], b: [-0.33, -0.86, 0.2], r: 0.21 },
};
export function bearSdf(p) {
  const P = PARTS;
  let d = sdEllipsoid(p, P.body.c, P.body.r);
  d = smin(d, sdEllipsoid(p, P.belly.c, P.belly.r), 0.2);
  d = smin(d, sdEllipsoid(p, P.head.c, P.head.r), 0.22);
  d = smin(d, sdEllipsoid(p, P.snout.c, P.snout.r), 0.1);
  d = smin(d, sdEllipsoid(p, P.earL.c, P.earL.r), 0.1);
  d = smin(d, sdEllipsoid(p, P.earR.c, P.earR.r), 0.1);
  for (const k of ['armL', 'armR', 'legL', 'legR']) d = smin(d, sdCapsule(p, P[k].a, P[k].b, P[k].r), 0.16);
  return d;
}
export function sdfGrad(f, p, e = 1e-3) {
  const g = [0, 0, 0];
  for (let i = 0; i < 3; i++) { const a = p.slice(), b = p.slice(); a[i] += e; b[i] -= e; g[i] = (f(a) - f(b)) / (2 * e); }
  return g;
}
// Newton steps onto the level set f = level.
function project(f, p, level = 0, steps = 6) {
  let q = p.slice();
  for (let s = 0; s < steps; s++) {
    const d = f(q) - level, g = sdfGrad(f, q), g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    if (g2 < 1e-12) break;
    q = [q[0] - (d * g[0]) / g2, q[1] - (d * g[1]) / g2, q[2] - (d * g[2]) / g2];
    if (Math.abs(d) < 1e-6) break;
  }
  return q;
}
export const BOUNDS = { min: [-0.92, -1.18, -0.66], max: [0.92, 1.16, 0.66] };

// ---------- render surface: surface nets on the SDF, each vertex then pulled exactly onto the surface ----------
export function surfaceMesh(step = 0.06) {
  const { min, max } = BOUNDS;
  const n = [0, 1, 2].map(i => Math.ceil((max[i] - min[i]) / step) + 1);
  const at = (i, j, k) => [min[0] + i * step, min[1] + j * step, min[2] + k * step];
  const field = new Float64Array(n[0] * n[1] * n[2]);
  const id = (i, j, k) => i + n[0] * (j + n[1] * k);
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) field[id(i, j, k)] = bearSdf(at(i, j, k));
  const cellVert = new Int32Array((n[0] - 1) * (n[1] - 1) * (n[2] - 1)).fill(-1);
  const cid = (i, j, k) => i + (n[0] - 1) * (j + (n[1] - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < n[2] - 1; k++) for (let j = 0; j < n[1] - 1; j++) for (let i = 0; i < n[0] - 1; i++) {
    const v = corners.map(c => field[id(i + c[0], j + c[1], k + c[2])]);
    if (v.every(x => x > 0) || v.every(x => x <= 0)) continue;
    let s = [0, 0, 0], m = 0;
    for (const [a, b] of edges) {
      if ((v[a] > 0) === (v[b] > 0)) continue;
      const t = v[a] / (v[a] - v[b]), pa = corners[a], pb = corners[b];
      for (let q = 0; q < 3; q++) s[q] += pa[q] + (pb[q] - pa[q]) * t;
      m++;
    }
    const p = [min[0] + (i + s[0] / m) * step, min[1] + (j + s[1] / m) * step, min[2] + (k + s[2] / m) * step];
    cellVert[cid(i, j, k)] = pos.length;
    pos.push(project(bearSdf, p, 0, 4));
  }
  const tris = [];
  const quad = (a, b, c, d, flip) => { if ([a, b, c, d].some(x => x < 0)) return; if (flip) tris.push(a, c, b, a, d, c); else tris.push(a, b, c, a, c, d); };
  for (let k = 1; k < n[2] - 1; k++) for (let j = 1; j < n[1] - 1; j++) for (let i = 1; i < n[0] - 1; i++) {
    const inside = field[id(i, j, k)] <= 0;
    // x-edge (i,j,k)-(i+1,j,k): cells around it share j-1..j, k-1..k
    if (i < n[0] - 1 && inside !== (field[id(i + 1, j, k)] <= 0))
      quad(cellVert[cid(i, j - 1, k - 1)], cellVert[cid(i, j, k - 1)], cellVert[cid(i, j, k)], cellVert[cid(i, j - 1, k)], !inside);
    if (j < n[1] - 1 && inside !== (field[id(i, j + 1, k)] <= 0))
      quad(cellVert[cid(i - 1, j, k - 1)], cellVert[cid(i - 1, j, k)], cellVert[cid(i, j, k)], cellVert[cid(i, j, k - 1)], !inside);
    if (k < n[2] - 1 && inside !== (field[id(i, j, k + 1)] <= 0))
      quad(cellVert[cid(i - 1, j - 1, k)], cellVert[cid(i, j - 1, k)], cellVert[cid(i, j, k)], cellVert[cid(i - 1, j, k)], !inside);
  }
  // Orientation check: make triangles face outward (normal along the SDF gradient).
  let agree = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = pos[tris[t]], b = pos[tris[t + 1]], c = pos[tris[t + 2]];
    const u = sub(b, a), w = sub(c, a), nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const ctr = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], g = sdfGrad(bearSdf, ctr);
    agree += Math.sign(nrm[0] * g[0] + nrm[1] * g[1] + nrm[2] * g[2]);
  }
  if (agree < 0) for (let t = 0; t < tris.length; t += 3) { const x = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = x; }
  return { positions: pos, indices: tris };
}

// ---------- physics lattice ----------
// A cubic lattice of spacing h, each kept cube split into six tetrahedra. Lattice points that stick out of
// the surface shrunk by the collision radius r are pulled onto it, so the particle spheres (radius r) cover
// the real surface. Squashed or inverted tetrahedra are dropped.
export function tetLattice(h = 0.28, r = 0.12) {
  const g = (p) => bearSdf(p) + r;
  const { min, max } = BOUNDS;
  const n = [0, 1, 2].map(i => Math.ceil((max[i] - min[i]) / h) + 2);
  const o = [0, 1, 2].map(i => (min[i] + max[i]) / 2 - ((n[i] - 1) * h) / 2);
  const vid = (i, j, k) => i + n[0] * (j + n[1] * k);
  const pts = new Map();
  const tets = [];
  const K = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]];
  for (let k = 0; k < n[2] - 1; k++) for (let j = 0; j < n[1] - 1; j++) for (let i = 0; i < n[0] - 1; i++) {
    const c = [o[0] + (i + 0.5) * h, o[1] + (j + 0.5) * h, o[2] + (k + 0.5) * h];
    if (g(c) > 0.3 * h) continue;
    const cv = [];
    for (let b = 0; b < 8; b++) { const ii = i + (b & 1), jj = j + ((b >> 1) & 1), kk = k + ((b >> 2) & 1); const key = vid(ii, jj, kk); if (!pts.has(key)) pts.set(key, [o[0] + ii * h, o[1] + jj * h, o[2] + kk * h]); cv.push(key); }
    for (const t of K) tets.push(t.map(x => cv[x]));
  }
  const orig = new Map(pts);
  for (const [key, p] of pts) if (g(p) > 0) pts.set(key, project(g, p, 0, 8));
  const vol = (a, b, c, d) => { const u = sub(b, a), v = sub(c, a), w = sub(d, a); return (u[0] * (v[1] * w[2] - v[2] * w[1]) + u[1] * (v[2] * w[0] - v[0] * w[2]) + u[2] * (v[0] * w[1] - v[1] * w[0])) / 6; };
  const minVol = 0.12 * (h * h * h) / 6;
  const kept = [];
  for (const t of tets) {
    const before = vol(...t.map(x => orig.get(x))), after = vol(...t.map(x => pts.get(x)));
    // A tetrahedron whose sign flipped while its corners were pulled in is inverted: drop it, as well as
    // any that got squashed nearly flat.
    if (Math.sign(before) !== Math.sign(after) || Math.abs(after) < minVol) continue;
    kept.push(after > 0 ? t : [t[0], t[2], t[1], t[3]]);
  }
  const used = [...new Set(kept.flat())].sort((a, b) => a - b);
  const remap = new Map(used.map((key, i) => [key, i]));
  const positions = used.map(key => pts.get(key));
  const tetIds = kept.map(t => t.map(x => remap.get(x)));
  const edgeSet = new Set(), edgeList = [];
  for (const t of tetIds) for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    const i = Math.min(t[a], t[b]), j = Math.max(t[a], t[b]), key = i * 100000 + j;
    if (!edgeSet.has(key)) { edgeSet.add(key); edgeList.push([i, j]); }
  }
  // Particles near the surface are the only ones that can touch the table or another bear.
  const surface = positions.map(q => g(q) > -0.7 * h);
  return { positions, tets: tetIds, edges: edgeList, surface, h, r };
}
// Barycentric coordinates of p in tetrahedron (a,b,c,d).
export function barycentric(p, a, b, c, d) {
  const m = [sub(b, a), sub(c, a), sub(d, a)], q = sub(p, a);
  const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[1][0] * (m[0][1] * m[2][2] - m[0][2] * m[2][1]) + m[2][0] * (m[0][1] * m[1][2] - m[0][2] * m[1][1]);
  // Solve [m0 m1 m2] * (u,v,w) = q by Cramer's rule (columns are the edge vectors).
  const col = (A, B, C) => A[0] * (B[1] * C[2] - B[2] * C[1]) - B[0] * (A[1] * C[2] - A[2] * C[1]) + C[0] * (A[1] * B[2] - A[2] * B[1]);
  const u = col(q, m[1], m[2]) / det, v = col(m[0], q, m[2]) / det, w = col(m[0], m[1], q) / det;
  return [1 - u - v - w, u, v, w];
}
// Each render vertex rides on the tetrahedron that contains it, or failing that the nearest one (its
// barycentric weights then reach slightly outside 0..1, which extrapolates the motion of that tetrahedron).
export function embed(vertices, lattice) {
  const { positions: P, tets } = lattice;
  const centroids = tets.map(t => [0, 1, 2].map(i => (P[t[0]][i] + P[t[1]][i] + P[t[2]][i] + P[t[3]][i]) / 4));
  const tetOf = new Int32Array(vertices.length), bary = new Float64Array(vertices.length * 4);
  vertices.forEach((v, vi) => {
    let best = -Infinity, bt = 0, bb = null;
    for (let ti = 0; ti < tets.length; ti++) {
      const c = centroids[ti];
      if (Math.abs(c[0] - v[0]) > 0.7 || Math.abs(c[1] - v[1]) > 0.7 || Math.abs(c[2] - v[2]) > 0.7) continue;
      const t = tets[ti], b = barycentric(v, P[t[0]], P[t[1]], P[t[2]], P[t[3]]);
      const score = Math.min(...b) - 0.02 * Math.hypot(c[0] - v[0], c[1] - v[1], c[2] - v[2]);
      if (score > best) { best = score; bt = ti; bb = b; }
    }
    tetOf[vi] = bt; bary.set(bb, vi * 4);
  });
  return { tetOf, bary };
}

// Named grab points ("parts"), as points in bear space; grab() takes the lattice particle nearest to one.
export const GRAB_PARTS = {
  head: [0, 0.62, 0.1], snout: [0, 0.47, 0.42], earL: [0.34, 0.95, 0], earR: [-0.34, 0.95, 0],
  body: [0, -0.2, 0.3], back: [0, -0.2, -0.35], armL: [0.6, -0.18, 0.18], armR: [-0.6, -0.18, 0.18],
  legL: [0.32, -0.9, 0.18], legR: [-0.32, -0.9, 0.18],
};

let cache = new Map();
// Everything the physics and the renderer need about the one bear shape, cached per surface resolution.
export function bearTemplate({ surfaceStep = 0.06, h = 0.28, r = 0.15 } = {}) {
  const key = `${surfaceStep}|${h}|${r}`;
  if (cache.has(key)) return cache.get(key);
  const surface = surfaceMesh(surfaceStep), lattice = tetLattice(h, r), embedding = embed(surface.positions, lattice);
  const tpl = { surface, lattice, embedding, surfaceStep };
  cache.set(key, tpl);
  return tpl;
}
