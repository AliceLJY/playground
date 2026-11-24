// Soft-body gummy bears: extended position-based dynamics (XPBD) on a tetrahedral lattice, written for this
// page (no physics package). Each bear is the same lattice of particles held by edge-length constraints
// (stretch) and tetrahedron-volume constraints (volume stays about the same, so a stretched neck gets
// thinner and a pressed body bulges sideways). Particles are spheres of radius r for contacts with the table,
// the invisible box walls and other bears. Fixed time step and a seeded random source: the same seed and the
// same calls give the same numbers, run after run.
import { bearTemplate, GRAB_PARTS } from './shape.js';

export const FLAVORS = [
  { key: 'cherry', name: '樱桃', en: 'Cherry', color: '#d7192f', clarity: 0.0 },
  { key: 'orange', name: '橙子', en: 'Orange', color: '#f26a0f', clarity: 0.0 },
  { key: 'lemon', name: '柠檬', en: 'Lemon', color: '#f3c613', clarity: 0.0 },
  { key: 'apple', name: '青苹果', en: 'Apple', color: '#58b326', clarity: 0.0 },
  { key: 'pineapple', name: '菠萝', en: 'Pineapple', color: '#f4e9b8', clarity: 0.75 },
];
// The play area: a white table (y = 0) with invisible walls, in bear units (a bear is about 2.1 long).
export const ARENA = { x: 5, z: 3.2, ceiling: 9 };
// The phone tier uses a squarer, smaller table so the bears can be drawn larger on a narrow screen.
export const ARENAS = { high: ARENA, low: { x: 3.4, z: 3.4, ceiling: 9 } };
export const DT = 1 / 60;
export const GRAVITY = 28;
export const MIN_SQUASH = 0.8;             // and squashed no closer than this
export const MAX_STRETCH = 2.2;           // a grabbed point may be pulled at most this far from the rest of the bear, × its rest distance
export const CAP = { high: 30, low: 18 }; // most bears at once; "low" is the phone tier
export const POUR = 6;                    // bears per pour

// Seeded random numbers (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Rotation matrix (row-major 3×3) from yaw-pitch-roll angles.
export function rotation(ax, ay, az) {
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  // R = Ry * Rx * Rz
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx], Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul3(Ry, mul3(Rx, Rz));
}
function mul3(a, b) { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return o; }

// Lying on its back, belly and face up, head away from the viewer: the resting pose of the first row.
export const ON_BACK = (yaw = 0) => rotation(-Math.PI / 2, yaw, 0);

export class World {
  constructor({ seed = 1, quality = 'high', softness = 0.55, substeps, surfaceStep } = {}) {
    this.quality = quality;
    this.cap = CAP[quality] || CAP.high;
    this.arena = ARENAS[quality] || ARENA;
    this.substeps = substeps || 6;
    this.tpl = bearTemplate({ surfaceStep: surfaceStep || (quality === 'low' ? 0.08 : 0.06) });
    const L = this.tpl.lattice;
    this.r = L.r; this.n = L.positions.length;
    const N = this.cap * this.n;
    this.x = new Float64Array(N * 3); this.p = new Float64Array(N * 3); this.v = new Float64Array(N * 3);
    this.w = new Float64Array(N); this.m = new Float64Array(N);
    this.contact = new Uint8Array(N);
    // Rest data shared by every bear.
    this.rest = new Float64Array(this.n * 3); L.positions.forEach((q, i) => this.rest.set(q, i * 3));
    this.surfaceIds = L.surface.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
    this.tets = new Int32Array(L.tets.flat()); this.edges = new Int32Array(L.edges.flat());
    this.restLen = new Float64Array(L.edges.length); this.restVol = new Float64Array(L.tets.length);
    const R = this.rest;
    for (let e = 0; e < L.edges.length; e++) { const a = L.edges[e][0] * 3, b = L.edges[e][1] * 3; this.restLen[e] = Math.hypot(R[a] - R[b], R[a + 1] - R[b + 1], R[a + 2] - R[b + 2]); }
    const lump = new Float64Array(this.n);
    for (let t = 0; t < L.tets.length; t++) { const v = tetVolume(R, this.tets, t, 0); this.restVol[t] = v; for (let k = 0; k < 4; k++) lump[this.tets[t * 4 + k]] += v / 4; }
    this.restVolume = this.restVol.reduce((a, b) => a + b, 0);
    this.mass0 = Array.from(lump, v => v / this.restVolume); // one bear weighs 1
    let c = [0, 0, 0]; for (let i = 0; i < this.n; i++) for (let k = 0; k < 3; k++) c[k] += R[i * 3 + k] * this.mass0[i];
    this.restCom = c;
    this.partParticle = {};
    for (const [k, q] of Object.entries(GRAB_PARTS)) {
      let best = 0, bd = Infinity; for (let i = 0; i < this.n; i++) { const d = Math.hypot(R[i * 3] - q[0], R[i * 3 + 1] - q[1], R[i * 3 + 2] - q[2]); if (d < bd) { bd = d; best = i; } }
      this.partParticle[k] = best;
    }
    this.setSoftness(softness);
    this.setSeed(seed);
    this.reset();
  }
  setSoftness(s) {
    this.softness = Math.min(1, Math.max(0, s));
    // Edge compliance (inverse stiffness) from firm 0.02 to soft 0.25, on a log scale; 0.55 gives 0.08.
    this.edgeCompliance = 0.02 * Math.pow(12.5, this.softness);
    // Wobble (deformation) dies away at this rate per second; the firm end settles a little faster.
    this.deformDamping = 10 - 4 * this.softness;
    // Pull toward the rest shape, per substep: firm 0.03, soft 0.005 (0.55 gives about 0.011).
    this.shapeStiffness = 0.03 * Math.pow(1 / 6, this.softness);
  }
  setSeed(n) { this.seed = n >>> 0; this.random = rng(this.seed); }
  reset() {
    this.random = rng(this.seed);
    this.bears = [];
    this.time = 0; this.queue = []; this.grabState = null; this.events = [];
    this.stats = { maxStretch: 1, stretch: 1, bounce: 0 };
    this.x.fill(0); this.p.fill(0); this.v.fill(0); this.w.fill(0);
    this.initialRow().forEach(([x, z], i) => this.addBear({ flavor: i, at: [x, 0, z], R: ON_BACK((i - 2) * 0.06), settle: true }));
    this.pairs = new Int32Array(0); this.pairCount = 0;
    return this;
  }
  // Where the five starting bears lie, one per flavour: a row on the wide table, two staggered rows on the phone table.
  initialRow() {
    return this.arena === ARENA ? [[-3.6, 0.2], [-1.8, 0.2], [0, 0.2], [1.8, 0.2], [3.6, 0.2]] : [[-2.1, -1.2], [0, -1.2], [2.1, -1.2], [-1.05, 1.3], [1.05, 1.3]];
  }
  // Put a bear in the world. `at` is where its centre of mass goes; with `settle` it is lowered to rest on the table.
  addBear({ flavor = 0, at = [0, 4, 0], R = rotation(0, 0, 0), vel = [0, 0, 0], settle = false }) {
    if (this.bears.length >= this.cap) return -1;
    const bi = this.bears.length, o = bi * this.n, rest = this.rest, rc = this.restCom;
    let minY = Infinity;
    const local = [];
    for (let i = 0; i < this.n; i++) {
      const q = [rest[i * 3] - rc[0], rest[i * 3 + 1] - rc[1], rest[i * 3 + 2] - rc[2]];
      const y = [R[0] * q[0] + R[1] * q[1] + R[2] * q[2], R[3] * q[0] + R[4] * q[1] + R[5] * q[2], R[6] * q[0] + R[7] * q[1] + R[8] * q[2]];
      local.push(y); minY = Math.min(minY, y[1]);
    }
    const lift = settle ? this.r + 0.002 - minY : at[1];
    for (let i = 0; i < this.n; i++) {
      const j = (o + i) * 3;
      this.x[j] = at[0] + local[i][0]; this.x[j + 1] = lift + local[i][1]; this.x[j + 2] = at[2] + local[i][2];
      this.p.set(this.x.subarray(j, j + 3), j);
      this.v[j] = vel[0]; this.v[j + 1] = vel[1]; this.v[j + 2] = vel[2];
      this.m[o + i] = this.mass0[i]; this.w[o + i] = 1 / this.mass0[i];
    }
    this.bears.push({ flavor, born: this.time, peak: 0, asleep: false, calm: 0 });
    return bi;
  }
  // Schedule a handful of bears to drop from above the middle of the table.
  pour(count = POUR, flavors = [0, 1, 2, 3, 4]) {
    const room = this.cap - this.bears.length - this.queue.length;
    const n = Math.max(0, Math.min(count, room));
    for (let k = 0; k < n; k++) {
      const rnd = this.random;
      this.queue.push({
        at: this.time + 0.16 * k,
        flavor: flavors[Math.floor(rnd() * flavors.length) % flavors.length],
        pos: [(rnd() - 0.5) * 3.2, 6.6 + rnd() * 0.8, (rnd() - 0.5) * 1.8],
        R: rotation(rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI * 2),
        vel: [(rnd() - 0.5) * 1.5, -3 - rnd() * 2, (rnd() - 0.5) * 1.5],
      });
    }
    return n;
  }
  // Whether a bear placed as spawn s would stay clear of every particle already there (with a margin).
  roomFor(s) {
    const R = s.R, rc = this.restCom, rest = this.rest, x = this.x, N = this.bears.length * this.n, d = 2 * this.r + 0.1;
    // Cheap test first: the whole bear fits in a ball of radius 1.25 around its centre.
    let near = false;
    for (let i = 0; i < N && !near; i++) near = Math.hypot(x[i * 3] - s.pos[0], x[i * 3 + 1] - s.pos[1], x[i * 3 + 2] - s.pos[2]) < 1.25 + d;
    if (!near) return true;
    for (let k = 0; k < this.n; k++) {
      const q = [rest[k * 3] - rc[0], rest[k * 3 + 1] - rc[1], rest[k * 3 + 2] - rc[2]];
      const px = s.pos[0] + R[0] * q[0] + R[1] * q[1] + R[2] * q[2], py = s.pos[1] + R[3] * q[0] + R[4] * q[1] + R[5] * q[2], pz = s.pos[2] + R[6] * q[0] + R[7] * q[1] + R[8] * q[2];
      for (let i = 0; i < N; i++) if (Math.abs(x[i * 3] - px) < d && Math.abs(x[i * 3 + 1] - py) < d && Math.abs(x[i * 3 + 2] - pz) < d && Math.hypot(x[i * 3] - px, x[i * 3 + 1] - py, x[i * 3 + 2] - pz) < d) return false;
    }
    return true;
  }
  get count() { return this.bears.length; }
  get pending() { return this.queue.length; }

  // ---------- grabbing ----------
  // Grab a bear by a named part or by particle index; `target` is the world point the grabbed point is pulled to.
  grab(bi, part, target) {
    if (bi < 0 || bi >= this.bears.length) return false;
    this.release();
    this.wake(bi);
    const li = typeof part === 'number' ? part : (this.partParticle[part] ?? this.partParticle.body);
    const o = bi * this.n, R = this.rest, h = this.tpl.lattice.h;
    const cluster = [];
    for (let i = 0; i < this.n; i++) { const d = Math.hypot(R[i * 3] - R[li * 3], R[i * 3 + 1] - R[li * 3 + 1], R[i * 3 + 2] - R[li * 3 + 2]); if (d < 1.05 * h) cluster.push(o + i); }
    const c = centroid(this.x, cluster), R0 = this.rigidFit(bi).R;
    // The held particles keep their places around the hand in the bear's own frame, so the bear can still
    // turn about the hand instead of the held patch staying frozen in one orientation (which creased it).
    const offsets = cluster.map(j => { const d = [this.x[j * 3] - c[0], this.x[j * 3 + 1] - c[1], this.x[j * 3 + 2] - c[2]]; return [R0[0] * d[0] + R0[3] * d[1] + R0[6] * d[2], R0[1] * d[0] + R0[4] * d[1] + R0[7] * d[2], R0[2] * d[0] + R0[5] * d[1] + R0[8] * d[2]]; });
    // Rest distance from the grab point to the far side of the bear, the yardstick for stretch.
    const far = farSide(R, li, this.n);
    const restDist = Math.hypot(R[li * 3] - far.c[0], R[li * 3 + 1] - far.c[1], R[li * 3 + 2] - far.c[2]);
    // How low the hand may press: half the height the held patch had when it was grabbed. A gummy squashes
    // under a finger but a finger cannot push through it; pressing the patch all the way to the table
    // turned its tetrahedra inside out (spikes and dark creases, 2026-11-25 real-GPU review).
    const pressFloor = Math.max(this.r, c[1] * 0.5);
    this.grabState = { bi, li, cluster, offsets, far: far.ids.map(i => o + i), restDist, pressFloor, from: c, to: c.slice(), target: (target || c).slice() };
    this.moveGrab(target || c);
    return true;
  }
  moveGrab(target) {
    const g = this.grabState; if (!g) return;
    const t = target.slice();
    // Never into the table or through the walls.
    const A = this.arena;
    t[1] = Math.max(g.pressFloor, Math.min(A.ceiling - this.r, t[1]));
    t[0] = Math.max(-A.x + this.r, Math.min(A.x - this.r, t[0]));
    t[2] = Math.max(-A.z + this.r, Math.min(A.z - this.r, t[2]));
    // At most MAX_STRETCH × the rest distance from the far side of the bear.
    // And never squashed closer than MIN_SQUASH × that distance: pressed harder, the patch under the finger
    // turned its tetrahedra inside out.
    const f = centroid(this.x, g.far), d = [t[0] - f[0], t[1] - f[1], t[2] - f[2]], L = Math.hypot(...d), lim = g.restDist * MAX_STRETCH, low = g.restDist * MIN_SQUASH;
    if (L > lim) for (let k = 0; k < 3; k++) t[k] = f[k] + (d[k] * lim) / L;
    else if (L < low && L > 1e-6) for (let k = 0; k < 3; k++) t[k] = f[k] + (d[k] * low) / L;
    t[1] = Math.max(g.pressFloor, t[1]);
    g.target = t;
  }
  release() { this.grabState = null; }

  // ---------- simulation ----------
  step(dt = DT) {
    // Spawns that are due.
    // Spawns that are due. A bear only appears where it has room; otherwise it waits a frame, so no two
    // bears ever start inside each other.
    while (this.queue.length && this.queue[0].at <= this.time + 1e-9) {
      const s = this.queue[0];
      if (!this.roomFor(s)) { s.at = this.time + DT; break; }
      this.queue.shift();
      if (this.addBear({ flavor: s.flavor, at: s.pos, R: s.R, vel: s.vel }) < 0) { this.queue.length = 0; break; }
    }
    const S = this.substeps, h = dt / S, nb = this.bears.length, N = nb * this.n;
    const g = this.grabState;
    if (g) { g.from = g.to.slice(); g.R = this.rigidFit(g.bi).R; }
    this.findPairs(dt);
    this.wakeTouched();
    const x = this.x, p = this.p, v = this.v, w = this.w;
    const vmax = 40;
    for (let s = 1; s <= S; s++) {
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        p[j] = x[j]; p[j + 1] = x[j + 1]; p[j + 2] = x[j + 2];
        if (w[i] === 0) continue;
        v[j + 1] -= GRAVITY * h;
        x[j] += v[j] * h; x[j + 1] += v[j + 1] * h; x[j + 2] += v[j + 2] * h;
      }
      if (g) {
        // Held particles are put where the hand is, eased over the substeps so their velocity is the drag
        // velocity (that is what a fling keeps on release). They stay free particles: the solvers below
        // still move them, so the held patch is firm but not a rigid block.
        const u = s / S, tx = g.from[0] + (g.target[0] - g.from[0]) * u, ty = g.from[1] + (g.target[1] - g.from[1]) * u, tz = g.from[2] + (g.target[2] - g.from[2]) * u, R = g.R;
        g.cluster.forEach((j, k) => { const o = g.offsets[k]; x[j * 3] = tx + R[0] * o[0] + R[1] * o[1] + R[2] * o[2]; x[j * 3 + 1] = Math.max(this.r, ty + R[3] * o[0] + R[4] * o[1] + R[5] * o[2]); x[j * 3 + 2] = tz + R[6] * o[0] + R[7] * o[1] + R[8] * o[2]; });
      }
      this.solveEdges(h); this.solveVolumes(h); if (g) { this.solveVolumes(h); this.solveVolumes(h); } this.solveShape();
      this.solveContacts(h);
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        let vx = (x[j] - p[j]) / h, vy = (x[j + 1] - p[j + 1]) / h, vz = (x[j + 2] - p[j + 2]) / h;
        const sp = Math.hypot(vx, vy, vz); if (sp > vmax) { vx *= vmax / sp; vy *= vmax / sp; vz *= vmax / sp; }
        v[j] = vx; v[j + 1] = vy; v[j + 2] = vz;
      }
    }
    if (g) g.to = g.target.slice();
    this.damp(dt);
    this.time += dt;
    this.measure(dt);
  }
  solveEdges(h) {
    const x = this.x, w = this.w, E = this.edges, L0 = this.restLen, a = this.edgeCompliance / (h * h), ne = L0.length;
    for (let b = 0; b < this.bears.length; b++) {
      if (this.bears[b].asleep) continue;
      const o = b * this.n;
      for (let e = 0; e < ne; e++) {
        const i = o + E[e * 2], k = o + E[e * 2 + 1], wi = w[i], wk = w[k], W = wi + wk;
        if (W === 0) continue;
        const I = i * 3, K = k * 3, dx = x[I] - x[K], dy = x[I + 1] - x[K + 1], dz = x[I + 2] - x[K + 2], l = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (l < 1e-9) continue;
        const sgn = -(l - L0[e]) / (W + a) / l;
        x[I] += dx * sgn * wi; x[I + 1] += dy * sgn * wi; x[I + 2] += dz * sgn * wi;
        x[K] -= dx * sgn * wk; x[K + 1] -= dy * sgn * wk; x[K + 2] -= dz * sgn * wk;
      }
    }
  }
  // Shape matching (Müller et al. 2005), weak: every free particle is nudged a little toward where the best
  // rigid fit of its bear puts its rest position. The coarse lattice alone lets a hard pull fold the jelly
  // into creases; this keeps ears, arms and the head round while the bear stretches.
  solveShape() {
    const k = this.shapeStiffness; if (!(k > 0)) return;
    const x = this.x, w = this.w, rest = this.rest, rc = this.restCom, n = this.n;
    for (let b = 0; b < this.bears.length; b++) {
      if (this.bears[b].asleep) continue;
      const { R, c } = this.rigidFit(b), o = b * n;
      for (let i = 0; i < n; i++) {
        if (w[o + i] === 0) continue;
        const q0 = rest[i * 3] - rc[0], q1 = rest[i * 3 + 1] - rc[1], q2 = rest[i * 3 + 2] - rc[2], j = (o + i) * 3;
        x[j] += (R[0] * q0 + R[1] * q1 + R[2] * q2 + c[0] - x[j]) * k;
        x[j + 1] += (R[3] * q0 + R[4] * q1 + R[5] * q2 + c[1] - x[j + 1]) * k;
        x[j + 2] += (R[6] * q0 + R[7] * q1 + R[8] * q2 + c[2] - x[j + 2]) * k;
      }
    }
  }
  solveVolumes() {
    // Unrolled: the gradient of the volume with respect to each corner is the opposite face's area vector / 6.
    const x = this.x, w = this.w, T = this.tets, V0 = this.restVol, nt = V0.length;
    for (let b = 0; b < this.bears.length; b++) {
      if (this.bears[b].asleep) continue;
      const o = b * this.n;
      for (let t = 0; t < nt; t++) {
        const i0 = o + T[t * 4], i1 = o + T[t * 4 + 1], i2 = o + T[t * 4 + 2], i3 = o + T[t * 4 + 3];
        const w0 = w[i0], w1 = w[i1], w2 = w[i2], w3 = w[i3];
        const a = i0 * 3, b1 = i1 * 3, c = i2 * 3, d = i3 * 3;
        const x0 = x[a], y0 = x[a + 1], z0 = x[a + 2];
        const ux = x[b1] - x0, uy = x[b1 + 1] - y0, uz = x[b1 + 2] - z0;
        const vx = x[c] - x0, vy = x[c + 1] - y0, vz = x[c + 2] - z0;
        const qx = x[d] - x0, qy = x[d + 1] - y0, qz = x[d + 2] - z0;
        // ∂V/∂x1 = (v × q)/6, ∂V/∂x2 = (q × u)/6, ∂V/∂x3 = (u × v)/6, ∂V/∂x0 = −(sum of those).
        const g1x = (vy * qz - vz * qy) / 6, g1y = (vz * qx - vx * qz) / 6, g1z = (vx * qy - vy * qx) / 6;
        const g2x = (qy * uz - qz * uy) / 6, g2y = (qz * ux - qx * uz) / 6, g2z = (qx * uy - qy * ux) / 6;
        const g3x = (uy * vz - uz * vy) / 6, g3y = (uz * vx - ux * vz) / 6, g3z = (ux * vy - uy * vx) / 6;
        const g0x = -g1x - g2x - g3x, g0y = -g1y - g2y - g3y, g0z = -g1z - g2z - g3z;
        const W = w0 * (g0x * g0x + g0y * g0y + g0z * g0z) + w1 * (g1x * g1x + g1y * g1y + g1z * g1z) + w2 * (g2x * g2x + g2y * g2y + g2z * g2z) + w3 * (g3x * g3x + g3y * g3y + g3z * g3z);
        if (W === 0) continue;
        const vol = ux * g1x + uy * g1y + uz * g1z; // u · (v × q) / 6
        const s = -(vol - V0[t]) / W;
        let f = s * w0; x[a] += g0x * f; x[a + 1] += g0y * f; x[a + 2] += g0z * f;
        f = s * w1; x[b1] += g1x * f; x[b1 + 1] += g1y * f; x[b1 + 2] += g1z * f;
        f = s * w2; x[c] += g2x * f; x[c + 1] += g2y * f; x[c + 2] += g2z * f;
        f = s * w3; x[d] += g3x * f; x[d + 1] += g3y * f; x[d + 2] += g3z * f;
      }
    }
  }
  // Candidate pairs of particles from different bears, found once per frame with a margin for the motion
  // during that frame, then resolved every substep.
  findPairs(dt) {
    const x = this.x, v = this.v, n = this.n, ids = this.surfaceIds, ns = ids.length, nb = this.bears.length, M = nb * ns;
    let vmax = 0; for (let i = 0; i < nb * n * 3; i++) { const a = Math.abs(v[i]); if (a > vmax) vmax = a; }
    const reach = 2 * this.r + Math.min(1.2, 2 * vmax * dt + 0.05), rr = reach * reach, inv = 1 / reach;
    // Dense spatial hash over the surface particles (count, prefix sum, fill): no allocation per particle.
    let size = 1; while (size < 2 * M) size <<= 1; const mask = size - 1;
    if (!this.hashStart || this.hashStart.length < size + 1) { this.hashStart = new Int32Array(size + 1); this.seenBuf = new Int32Array(size); }
    if (!this.cellOf || this.cellOf.length < M * 3) { this.cellOf = new Int32Array(M * 3); this.hashEntries = new Int32Array(M); this.particleOf = new Int32Array(M); }
    const start = this.hashStart, cellOf = this.cellOf, entries = this.hashEntries, pid = this.particleOf, seen = this.seenBuf;
    start.fill(0, 0, size + 1);
    for (let b = 0, q = 0; b < nb; b++) for (let k = 0; k < ns; k++, q++) {
      const i = b * n + ids[k]; pid[q] = i;
      const a = Math.floor(x[i * 3] * inv), c1 = Math.floor(x[i * 3 + 1] * inv), c2 = Math.floor(x[i * 3 + 2] * inv);
      cellOf[q * 3] = a; cellOf[q * 3 + 1] = c1; cellOf[q * 3 + 2] = c2;
      start[(Math.imul(a, 92837111) ^ Math.imul(c1, 689287499) ^ Math.imul(c2, 283923481)) & mask]++;
    }
    let acc = 0; for (let k = 0; k < size; k++) { acc += start[k]; start[k] = acc; } start[size] = acc;
    for (let q = 0; q < M; q++) { const h = (Math.imul(cellOf[q * 3], 92837111) ^ Math.imul(cellOf[q * 3 + 1], 689287499) ^ Math.imul(cellOf[q * 3 + 2], 283923481)) & mask; start[h]--; entries[start[h]] = q; }
    let out = this.pairBuf || (this.pairBuf = new Int32Array(1 << 16)), count = 0, stamp = this.stamp || 0;
    for (let q = 0; q < M; q++) {
      const bq = (q / ns) | 0, ca = cellOf[q * 3], cb = cellOf[q * 3 + 1], cc = cellOf[q * 3 + 2], i = pid[q];
      const xi = x[i * 3], yi = x[i * 3 + 1], zi = x[i * 3 + 2];
      stamp++;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const h = (Math.imul(ca + a, 92837111) ^ Math.imul(cb + b, 689287499) ^ Math.imul(cc + c, 283923481)) & mask;
        if (seen[h] === stamp) continue; // two neighbour cells can share a bucket: visit it once
        seen[h] = stamp;
        for (let e = start[h], end = start[h + 1]; e < end; e++) {
          const r2 = entries[e];
          if (r2 <= q || ((r2 / ns) | 0) === bq) continue;
          const j = pid[r2], dx = xi - x[j * 3], dy = yi - x[j * 3 + 1], dz = zi - x[j * 3 + 2];
          if (dx * dx + dy * dy + dz * dz < rr) {
            if (count * 2 + 2 > out.length) { const bigger = new Int32Array(out.length * 2); bigger.set(out); out = this.pairBuf = bigger; }
            out[count * 2] = i; out[count * 2 + 1] = j; count++;
          }
        }
      }
    }
    this.stamp = stamp;
    this.pairs = out; this.pairCount = count;
  }
  // Contacts: bear against bear first, then the table and walls last so nothing is left pushed through them;
  // two rounds per substep, because one bear's push in a pile moves the next one.
  solveContacts() {
    this.contact.fill(0, 0, this.bears.length * this.n);
    for (let round = 0; round < 2; round++) { this.solvePairs(); this.solveBounds(); }
  }
  solveBounds() {
    const x = this.x, p = this.p, w = this.w, r = this.r, N = this.bears.length * this.n, A = this.arena;
    const muS = 0.8, muK = 0.6;
    // Table, walls and ceiling.
    for (let i = 0; i < N; i++) {
      if (w[i] === 0) continue;
      const j = i * 3;
      const pen = r - x[j + 1];
      if (pen > 0) {
        x[j + 1] = r; this.contact[i] = 1;
        // Friction on the table: cancel the sideways slide up to what the normal push allows.
        const dx = x[j] - p[j], dz = x[j + 2] - p[j + 2], d = Math.hypot(dx, dz);
        if (d < muS * pen) { x[j] = p[j]; x[j + 2] = p[j + 2]; }
        else if (d > 0) { const f = Math.min(1, (muK * pen) / d); x[j] -= dx * f; x[j + 2] -= dz * f; }
      }
      if (x[j] < -A.x + r) x[j] = -A.x + r; else if (x[j] > A.x - r) x[j] = A.x - r;
      if (x[j + 2] < -A.z + r) x[j + 2] = -A.z + r; else if (x[j + 2] > A.z - r) x[j + 2] = A.z - r;
      if (x[j + 1] > A.ceiling - r) x[j + 1] = A.ceiling - r;
    }
  }
  solvePairs() {
    const x = this.x, p = this.p, w = this.w, r = this.r, d0 = 2 * r;
    const muS = 0.8, muK = 0.6;
    // Bear against bear.
    const P = this.pairs;
    for (let q = 0; q < this.pairCount; q++) {
      const i = P[q * 2], k = P[q * 2 + 1], wi = w[i], wk = w[k], W = wi + wk;
      if (W === 0) continue;
      const I = i * 3, K = k * 3;
      let dx = x[I] - x[K], dy = x[I + 1] - x[K + 1], dz = x[I + 2] - x[K + 2];
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l >= d0 || l < 1e-9) continue;
      dx /= l; dy /= l; dz /= l;
      const pen = d0 - l;
      x[I] += dx * pen * wi / W; x[I + 1] += dy * pen * wi / W; x[I + 2] += dz * pen * wi / W;
      x[K] -= dx * pen * wk / W; x[K + 1] -= dy * pen * wk / W; x[K + 2] -= dz * pen * wk / W;
      // Friction between bears: damp the relative sliding along the contact.
      let rx = (x[I] - p[I]) - (x[K] - p[K]), ry = (x[I + 1] - p[I + 1]) - (x[K + 1] - p[K + 1]), rz = (x[I + 2] - p[I + 2]) - (x[K + 2] - p[K + 2]);
      const rn = rx * dx + ry * dy + rz * dz; rx -= rn * dx; ry -= rn * dy; rz -= rn * dz;
      const rt = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (rt > 1e-12) {
        const f = rt < muS * pen ? 1 : Math.min(1, (muK * pen) / rt);
        x[I] -= rx * f * wi / W; x[I + 1] -= ry * f * wi / W; x[I + 2] -= rz * f * wi / W;
        x[K] += rx * f * wk / W; x[K + 1] += ry * f * wk / W; x[K + 2] += rz * f * wk / W;
      }
      this.contact[i] = 1; this.contact[k] = 1;
    }
  }
  // Damping: the wobble (each particle's velocity relative to the bear's own rigid motion) dies away at
  // deformDamping per second; the rigid motion keeps flying, apart from a little air drag.
  damp(dt) {
    const k = 1 - Math.exp(-this.deformDamping * dt), air = Math.exp(-0.15 * dt);
    const x = this.x, v = this.v, m = this.m;
    for (let b = 0; b < this.bears.length; b++) {
      const o = b * this.n, B = this.bears[b];
      if (B.asleep) continue;
      let M = 0, cx = 0, cy = 0, cz = 0, px = 0, py = 0, pz = 0;
      for (let i = o; i < o + this.n; i++) { const mi = m[i]; M += mi; cx += x[i * 3] * mi; cy += x[i * 3 + 1] * mi; cz += x[i * 3 + 2] * mi; px += v[i * 3] * mi; py += v[i * 3 + 1] * mi; pz += v[i * 3 + 2] * mi; }
      cx /= M; cy /= M; cz /= M; px /= M; py /= M; pz /= M;
      // Angular momentum and inertia about the centre of mass.
      let Lx = 0, Ly = 0, Lz = 0; const I = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let i = o; i < o + this.n; i++) {
        const mi = m[i], rx = x[i * 3] - cx, ry = x[i * 3 + 1] - cy, rz = x[i * 3 + 2] - cz, ux = v[i * 3] - px, uy = v[i * 3 + 1] - py, uz = v[i * 3 + 2] - pz;
        Lx += mi * (ry * uz - rz * uy); Ly += mi * (rz * ux - rx * uz); Lz += mi * (rx * uy - ry * ux);
        const r2 = rx * rx + ry * ry + rz * rz;
        I[0] += mi * (r2 - rx * rx); I[4] += mi * (r2 - ry * ry); I[8] += mi * (r2 - rz * rz);
        I[1] -= mi * rx * ry; I[2] -= mi * rx * rz; I[5] -= mi * ry * rz;
      }
      I[3] = I[1]; I[6] = I[2]; I[7] = I[5];
      const Ii = inv3(I), wx = Ii[0] * Lx + Ii[1] * Ly + Ii[2] * Lz, wy = Ii[3] * Lx + Ii[4] * Ly + Ii[5] * Lz, wz = Ii[6] * Lx + Ii[7] * Ly + Ii[8] * Lz;
      // A bear that has nearly stopped is helped to stop: the small left-over creep in a pile dies away.
      const slow = Math.hypot(px, py, pz) < 0.6 && Math.hypot(wx, wy, wz) < 0.9 && !(this.grabState && this.grabState.bi === b);
      const settle = slow ? Math.exp(-5 * dt) : 1;
      for (let i = o; i < o + this.n; i++) {
        if (this.w[i] === 0) continue;
        const rx = x[i * 3] - cx, ry = x[i * 3 + 1] - cy, rz = x[i * 3 + 2] - cz;
        const tx = px + wy * rz - wz * ry, ty = py + wz * rx - wx * rz, tz = pz + wx * ry - wy * rx;
        v[i * 3] = (v[i * 3] + (tx - v[i * 3]) * k) * air * settle;
        v[i * 3 + 1] = (v[i * 3 + 1] + (ty - v[i * 3 + 1]) * k) * air * settle;
        v[i * 3 + 2] = (v[i * 3 + 2] + (tz - v[i * 3 + 2]) * k) * air * settle;
      }
      B.com = [cx, cy, cz]; B.vel = [px, py, pz];
      let top = 0; for (let i = o; i < o + this.n; i++) top = Math.max(top, Math.abs(v[i * 3]), Math.abs(v[i * 3 + 1]), Math.abs(v[i * 3 + 2]));
      const grabbed = this.grabState && this.grabState.bi === b;
      B.calm = !grabbed && top < 0.6 ? B.calm + dt : 0;
      // A bear wedged in a pile can keep a small contact shimmer without going anywhere: if its centre has
      // stayed within a few hundredths for 1.5 s, it counts as settled too.
      if (!B.anchor || grabbed || Math.hypot(cx - B.anchor[0], cy - B.anchor[1], cz - B.anchor[2]) > 0.06) { B.anchor = [cx, cy, cz]; B.still = 0; }
      else B.still += dt;
      if (B.calm > 0.8 || B.still > 1.5) this.sleep(b);
    }
  }
  // Sleeping: a bear that has been nearly still for a while is frozen in place (its particles stop moving
  // and act as a fixed obstacle) until something moving touches it or it is grabbed. This is what lets a
  // pile come to rest instead of shimmering with contact noise.
  sleep(b) {
    const B = this.bears[b]; if (B.asleep) return;
    B.asleep = true; const o = b * this.n;
    for (let i = o; i < o + this.n; i++) { this.w[i] = 0; this.v[i * 3] = this.v[i * 3 + 1] = this.v[i * 3 + 2] = 0; }
  }
  wake(b) {
    const B = this.bears[b]; if (!B || !B.asleep) return;
    B.asleep = false; B.calm = 0; B.anchor = null; const o = b * this.n;
    for (let i = o; i < o + this.n; i++) this.w[i] = 1 / this.m[i];
  }
  wakeTouched() {
    const P = this.pairs, v = this.v, n = this.n;
    for (let q = 0; q < this.pairCount; q++) {
      const i = P[q * 2], k = P[q * 2 + 1], bi = (i / n) | 0, bk = (k / n) | 0, A = this.bears[bi], B = this.bears[bk];
      if (A.asleep === B.asleep) continue;
      const mover = A.asleep ? k : i, sleeper = A.asleep ? bi : bk;
      if (Math.hypot(v[mover * 3], v[mover * 3 + 1], v[mover * 3 + 2]) > 0.5) this.wake(sleeper);
    }
  }
  // Live readings for the card: how far the grabbed bear is stretched, and how high the last bounce went.
  measure() {
    const g = this.grabState;
    if (g) {
      const a = centroid(this.x, g.cluster), f = centroid(this.x, g.far);
      this.stats.stretch = Math.hypot(a[0] - f[0], a[1] - f[1], a[2] - f[2]) / g.restDist;
      this.stats.maxStretch = Math.max(this.stats.maxStretch, this.stats.stretch);
    } else this.stats.stretch += (1 - this.stats.stretch) * 0.1;
    // A bounce: a bear that came down fast, touched, and went up again; its peak height above where it touched.
    for (const b of this.bears) {
      if (!b.com) continue;
      const vy = b.vel[1];
      // Touchdown: a falling bear that turns back up. 'land' carries how fast it came down (for the sound).
      if (b.falling && vy > 0.4) { b.rising = true; b.falling = false; b.base = b.com[1]; b.peak = b.com[1]; this.events.push({ t: this.time, kind: 'land', bear: this.bears.indexOf(b), speed: -(b.vMin || 0) }); b.vMin = 0; }
      if (b.falling) b.vMin = Math.min(b.vMin || 0, vy);
      if (b.rising) { b.peak = Math.max(b.peak, b.com[1]); if (vy < 0) { b.rising = false; const hgt = b.peak - b.base; if (hgt > 0.03) { this.stats.bounce = hgt; this.events.push({ t: this.time, kind: 'bounce', h: hgt }); } } }
      if (vy < -4) b.falling = true;
    }
    if (this.events.length > 50) this.events.splice(0, this.events.length - 50);
  }

  // ---------- readings ----------
  bearVolumeRatio(b) { let v = 0; for (let t = 0; t < this.restVol.length; t++) v += tetVolume(this.x, this.tets, t, b * this.n); return v / this.restVolume; }
  bearBox(b) {
    const o = b * this.n, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = o; i < o + this.n; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], this.x[i * 3 + k]); hi[k] = Math.max(hi[k], this.x[i * 3 + k]); }
    const r = this.r; return { min: lo.map(v => v - r), max: hi.map(v => v + r) };
  }
  bearSpeed(b) { let s = 0; const o = b * this.n; for (let i = o; i < o + this.n; i++) s = Math.max(s, Math.hypot(this.v[i * 3], this.v[i * 3 + 1], this.v[i * 3 + 2])); return s; }
  // Shape error after taking out position and rotation: RMS distance to the rest shape, in bear units.
  // Best rigid fit of bear b to its rest shape: rotation R (row-major) and centre of mass c.
  rigidFit(b) {
    const o = b * this.n, n = this.n, R = this.rest, m = this.mass0, rc = this.restCom;
    const c = [0, 0, 0]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += this.x[(o + i) * 3 + k] * m[i];
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const q0 = R[i * 3] - rc[0], q1 = R[i * 3 + 1] - rc[1], q2 = R[i * 3 + 2] - rc[2], j = (o + i) * 3;
      const p0 = this.x[j] - c[0], p1 = this.x[j + 1] - c[1], p2 = this.x[j + 2] - c[2], mi = m[i];
      A[0] += mi * p0 * q0; A[1] += mi * p0 * q1; A[2] += mi * p0 * q2; A[3] += mi * p1 * q0; A[4] += mi * p1 * q1; A[5] += mi * p1 * q2; A[6] += mi * p2 * q0; A[7] += mi * p2 * q1; A[8] += mi * p2 * q2;
    }
    return { R: polarRotation(A), c };
  }
  // Shape error after taking out position and rotation: RMS distance to the rest shape, in bear units.
  shapeError(b) {
    const o = b * this.n, n = this.n, R = this.rest, m = this.mass0, { R: Rot, c } = this.rigidFit(b);
    let e = 0;
    for (let i = 0; i < n; i++) {
      const q = [R[i * 3] - this.restCom[0], R[i * 3 + 1] - this.restCom[1], R[i * 3 + 2] - this.restCom[2]];
      const t = [Rot[0] * q[0] + Rot[1] * q[1] + Rot[2] * q[2], Rot[3] * q[0] + Rot[4] * q[1] + Rot[5] * q[2], Rot[6] * q[0] + Rot[7] * q[1] + Rot[8] * q[2]];
      e += m[i] * ((this.x[(o + i) * 3] - c[0] - t[0]) ** 2 + (this.x[(o + i) * 3 + 1] - c[1] - t[1]) ** 2 + (this.x[(o + i) * 3 + 2] - c[2] - t[2]) ** 2);
    }
    return Math.sqrt(e);
  }
  // Render-surface vertex positions of bear b, written into out (Float32Array) at offset off. Each vertex
  // rides on its tetrahedron (barycentric weights). The lattice is coarse, so a hard pull leaves creases
  // where neighbouring tetrahedra bend differently; the deformation (each vertex's offset from where the
  // best rigid fit of the bear would put it) is therefore smoothed over the surface a few times. A bear at
  // rest, moved or turned without bending, comes out exactly as the rest shape.
  skin(b, out, off = 0, smoothing = 3) {
    const { tetOf, bary } = this.tpl.embedding, T = this.tets, x = this.x, o = b * this.n, nv = tetOf.length;
    for (let v = 0; v < nv; v++) {
      const t = tetOf[v] * 4, w0 = bary[v * 4], w1 = bary[v * 4 + 1], w2 = bary[v * 4 + 2], w3 = bary[v * 4 + 3];
      const a = (o + T[t]) * 3, bb = (o + T[t + 1]) * 3, c = (o + T[t + 2]) * 3, d = (o + T[t + 3]) * 3, q = off + v * 3;
      out[q] = w0 * x[a] + w1 * x[bb] + w2 * x[c] + w3 * x[d];
      out[q + 1] = w0 * x[a + 1] + w1 * x[bb + 1] + w2 * x[c + 1] + w3 * x[d + 1];
      out[q + 2] = w0 * x[a + 2] + w1 * x[bb + 2] + w2 * x[c + 2] + w3 * x[d + 2];
    }
    if (smoothing > 0) this.smoothSkin(b, out, off, smoothing);
    return out;
  }
  smoothSkin(b, out, off, iterations) {
    const S = this.tpl.surface, nv = S.positions.length;
    if (!this.adj) {
      // Vertex neighbours of the render surface (compressed rows), and the rest positions about the centre of mass.
      const sets = Array.from({ length: nv }, () => new Set());
      for (let t = 0; t < S.indices.length; t += 3) for (let k = 0; k < 3; k++) { const a = S.indices[t + k], c = S.indices[t + ((k + 1) % 3)]; sets[a].add(c); sets[c].add(a); }
      const start = new Int32Array(nv + 1); sets.forEach((st, i) => { start[i + 1] = start[i] + st.size; });
      const list = new Int32Array(start[nv]); sets.forEach((st, i) => list.set([...st], start[i]));
      const q = new Float64Array(nv * 3); S.positions.forEach((p, i) => { for (let k = 0; k < 3; k++) q[i * 3 + k] = p[k] - this.restCom[k]; });
      this.adj = { start, list, q, d: new Float64Array(nv * 3), e: new Float64Array(nv * 3) };
    }
    const { start, list, q } = this.adj, { R, c } = this.rigidFit(b);
    let d = this.adj.d, e = this.adj.e;
    for (let v = 0; v < nv; v++) {
      const i = v * 3, j = off + i, q0 = q[i], q1 = q[i + 1], q2 = q[i + 2];
      d[i] = out[j] - (R[0] * q0 + R[1] * q1 + R[2] * q2 + c[0]);
      d[i + 1] = out[j + 1] - (R[3] * q0 + R[4] * q1 + R[5] * q2 + c[1]);
      d[i + 2] = out[j + 2] - (R[6] * q0 + R[7] * q1 + R[8] * q2 + c[2]);
    }
    // A bear that is barely bent (flying, resting) has nothing worth smoothing: under about a pixel at desktop
    // size. Skipping it saves most of the skinning cost while a handful falls.
    let big = 0;
    for (let i = 0; i < nv * 3; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > big) big = a; }
    if (big < 0.012) return out;
    for (let it = 0; it < iterations; it++) {
      for (let v = 0; v < nv; v++) {
        let sx = 0, sy = 0, sz = 0; const a = start[v], z = start[v + 1], k = z - a;
        for (let u = a; u < z; u++) { const n3 = list[u] * 3; sx += d[n3]; sy += d[n3 + 1]; sz += d[n3 + 2]; }
        e[v * 3] = 0.5 * d[v * 3] + (0.5 * sx) / k; e[v * 3 + 1] = 0.5 * d[v * 3 + 1] + (0.5 * sy) / k; e[v * 3 + 2] = 0.5 * d[v * 3 + 2] + (0.5 * sz) / k;
      }
      const t = d; d = e; e = t;
    }
    for (let v = 0; v < nv; v++) {
      const i = v * 3, j = off + i, q0 = q[i], q1 = q[i + 1], q2 = q[i + 2];
      out[j] = R[0] * q0 + R[1] * q1 + R[2] * q2 + c[0] + d[i];
      out[j + 1] = R[3] * q0 + R[4] * q1 + R[5] * q2 + c[1] + d[i + 1];
      out[j + 2] = R[6] * q0 + R[7] * q1 + R[8] * q2 + c[2] + d[i + 2];
    }
  }
  // The closest approach of two particles from different bears, as a share of the contact distance 2r
  // (1 = just touching, below 1 = overlapping), and the lowest particle relative to r.
  penetration() {
    const N = this.bears.length * this.n, x = this.x, n = this.n;
    let worstPair = Infinity, lowest = Infinity;
    for (let i = 0; i < N; i++) lowest = Math.min(lowest, x[i * 3 + 1] / this.r);
    const cs = 2 * this.r, cells = new Map(), key = (a, b, c) => ((a + 512) * 1024 + (b + 512)) * 1024 + (c + 512);
    for (let i = 0; i < N; i++) { const k = key(Math.floor(x[i * 3] / cs), Math.floor(x[i * 3 + 1] / cs), Math.floor(x[i * 3 + 2] / cs)); (cells.get(k) || cells.set(k, []).get(k)).push(i); }
    for (let i = 0; i < N; i++) {
      const cx = Math.floor(x[i * 3] / cs), cy = Math.floor(x[i * 3 + 1] / cs), cz = Math.floor(x[i * 3 + 2] / cs);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const j of cells.get(key(cx + a, cy + b, cz + c)) || []) {
        if (j <= i || Math.floor(j / n) === Math.floor(i / n)) continue;
        worstPair = Math.min(worstPair, Math.hypot(x[i * 3] - x[j * 3], x[i * 3 + 1] - x[j * 3 + 1], x[i * 3 + 2] - x[j * 3 + 2]) / (2 * this.r));
      }
    }
    return { pair: worstPair, table: lowest };
  }
  snapshot() {
    return {
      time: +this.time.toFixed(4), seed: this.seed, softness: this.softness, quality: this.quality, cap: this.cap, count: this.bears.length, pending: this.queue.length,
      grabbing: this.grabState ? { bear: this.grabState.bi, particle: this.grabState.li } : null,
      stretch: +this.stats.stretch.toFixed(3), maxStretch: +this.stats.maxStretch.toFixed(3), bounce: +this.stats.bounce.toFixed(3),
      bears: this.bears.map((b, i) => {
        const box = this.bearBox(i), sp = this.bearSpeed(i);
        return { id: i, flavor: FLAVORS[b.flavor].key, position: (b.com || boxCentre(box)).map(v => +v.toFixed(4)), box: { min: box.min.map(v => +v.toFixed(4)), max: box.max.map(v => +v.toFixed(4)) }, volume: +this.bearVolumeRatio(i).toFixed(4), speed: +sp.toFixed(4), asleep: b.asleep, moving: !b.asleep && sp > 0.25 };
      }),
    };
  }
}

const boxCentre = (b) => b.min.map((v, k) => (v + b.max[k]) / 2);
function centroid(x, ids) { const c = [0, 0, 0]; for (const j of ids) { c[0] += x[j * 3]; c[1] += x[j * 3 + 1]; c[2] += x[j * 3 + 2]; } return c.map(v => v / ids.length); }
// The particles on the far side of the bear from particle li (the farthest fifth), in rest space.
function farSide(R, li, n) {
  const d = []; for (let i = 0; i < n; i++) d.push([Math.hypot(R[i * 3] - R[li * 3], R[i * 3 + 1] - R[li * 3 + 1], R[i * 3 + 2] - R[li * 3 + 2]), i]);
  d.sort((a, b) => b[0] - a[0]);
  const ids = d.slice(0, Math.max(4, Math.round(n / 5))).map(e => e[1]);
  return { ids, c: centroid(R, ids) };
}
export function tetVolume(x, T, t, o) {
  const a = (o + T[t * 4]) * 3, b = (o + T[t * 4 + 1]) * 3, c = (o + T[t * 4 + 2]) * 3, d = (o + T[t * 4 + 3]) * 3;
  const ux = x[b] - x[a], uy = x[b + 1] - x[a + 1], uz = x[b + 2] - x[a + 2], vx = x[c] - x[a], vy = x[c + 1] - x[a + 1], vz = x[c + 2] - x[a + 2], wx = x[d] - x[a], wy = x[d + 1] - x[a + 1], wz = x[d + 2] - x[a + 2];
  return (ux * (vy * wz - vz * wy) + uy * (vz * wx - vx * wz) + uz * (vx * wy - vy * wx)) / 6;
}
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const s = 1 / det;
  return [A * s, -(b * i - c * h) * s, (b * f - c * e) * s, B * s, (a * i - c * g) * s, -(a * f - c * d) * s, C * s, -(a * h - b * g) * s, (a * e - b * d) * s];
}
// Rotation part of a 3×3 matrix by iterating R ← (R + R⁻ᵀ)/2.
function polarRotation(A) {
  let R = A.slice();
  for (let it = 0; it < 30; it++) {
    const inv = inv3(R); if (!inv.some(Boolean)) break;
    const next = R.map((v, k) => 0.5 * (v + inv[(k % 3) * 3 + Math.floor(k / 3)]));
    if (next.every((v, k) => Math.abs(v - R[k]) < 1e-10)) { R = next; break; }
    R = next;
  }
  return R;
}
