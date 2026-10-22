// 齿轮参数、运动学，以及「两个齿廓有没有互相穿过」的检测。页面和 Node 测试共用，不依赖 THREE 和 DOM。
//
// 检测分两份实现，结果必须一致（tests/mesh-check.test.cjs 逐帧对账）：
//   referenceFrame / referenceCycle  dsh 的 evidence.cjs 的二维检测：线段-线段相交 + 顶点在多边形内，
//                                    只加了一个包围盒提前退出（不改变判定），慢，只给测试用
//   PairChecker                      同样的判定，先按角度分桶、再按两轮外圆的交叠区过滤，页面每帧用它
(function (root) {
'use strict';

// ---- dsh 页面里的参数（原样） ----
const m = 0.9, depth = 1.5, zL = 1.05;          // 模数 / 齿宽 / 前后层中心距
const NA = 12, NB = 30, NC = 12, ND = 30;
const rA = m * NA / 2, rB = m * NB / 2, rC = m * NC / 2, rD = m * ND / 2;
const bx = rA + rB;                              // A 到 B、C 到 D 的中心距
const w0 = 1.4;                                  // 主动轮角速度 rad/s
const PARAMS = { m, depth, zL, NA, NB, NC, ND, rA, rB, rC, rD, bx, w0, pressureDeg: 20, curveDivisions: 40 };

// 四个轮子在时刻 t（秒）的转角（弧度）。与 dsh 页面完全一致：
// A 为 +ω，复合轮 B/C 为 −ω·NA/NB，D 为 +ω·(NA/NB)(NC/ND)；B、D 各有半个齿距的初始相位。
function angles(t) {
  const s = w0 * t;
  return {
    A: s,
    B: -s * (NA / NB) + Math.PI / NB,
    C: -s * (NA / NB),
    D: s * (NA / NB) * (NC / ND) + Math.PI / ND,
  };
}

// 两个啮合对。originX 是左轮中心在装配里的横坐标，z 是它们所在的层。
const PAIRS = [
  { id: 'AB', left: 'A', right: 'B', NL: NA, NR: NB, dist: rA + rB, originX: -bx, z: -zL },
  { id: 'CD', left: 'C', right: 'D', NL: NC, NR: ND, dist: rC + rD, originX: 0, z: +zL },
];

// ================= 参照实现（dsh evidence.cjs 的判定，原样移植） =================
function cross(o, p, q) { return (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]); }
function segInt(a, b, c, d) {
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
      Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false; // 包围盒不相交，必不相交
  const d1 = cross(b, a, c), d2 = cross(b, a, d);
  const d3 = cross(d, c, a), d4 = cross(d, c, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function pointInPoly(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function rotPts(pts, ang) { const c = Math.cos(ang), s = Math.sin(ang); return pts.map((p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]); }
function transPts(pts, dx, dy) { return pts.map((p) => [p[0] + dx, p[1] + dy]); }

// 一帧：左轮转 aL、右轮转 aR，右轮中心在 (dist, 0)。返回 {crossings, inL, inR}：
// crossings = 相交的边对数；inL = 右轮落在左轮里的顶点数；inR = 左轮落在右轮里的顶点数。
function referenceFrame(L, R, aL, aR, dist) {
  const Lr = rotPts(L, aL), Rr = transPts(rotPts(R, aR), dist, 0);
  let crossings = 0;
  for (let i = 0; i < Lr.length; i++) {
    const p1 = Lr[i], p2 = Lr[(i + 1) % Lr.length];
    for (let j = 0; j < Rr.length; j++) if (segInt(p1, p2, Rr[j], Rr[(j + 1) % Rr.length])) crossings++;
  }
  let inL = 0, inR = 0;
  for (const p of Rr) if (pointInPoly(p, Lr)) inL++;
  for (const p of Lr) if (pointInPoly(p, Rr)) inR++;
  return { crossings, inL, inR };
}

// 一个完整啮合周期（左轮转一个齿距）取 steps 帧，等同于 dsh 的 meshCheckPair。
function referenceCycle(L, R, NL, NR, dist, phaseR, steps) {
  const toothAngle = 2 * Math.PI / NL;
  let maxSeg = 0, maxInL = 0, maxInR = 0, framesWith = 0, worstAngle = 0;
  for (let k = 0; k < steps; k++) {
    const a = toothAngle * k / steps;
    const b = -a * (NL / NR) + phaseR;
    const f = referenceFrame(L, R, a, b, dist);
    if (f.crossings > 0 || f.inL > 0 || f.inR > 0) framesWith++;
    if (f.crossings > maxSeg) { maxSeg = f.crossings; worstAngle = a; }
    if (f.inL > maxInL) maxInL = f.inL;
    if (f.inR > maxInR) maxInR = f.inR;
  }
  return { steps, framesWith, maxSeg, maxInL, maxInR, worstAngle };
}

// ================= 页面用的快速实现 =================
const BUCKETS = 720;                       // 每桶 0.5°
const TWO_PI = Math.PI * 2;
const normAng = (a) => { a %= TWO_PI; return a < 0 ? a + TWO_PI : a; };

// 把一个齿廓（[[x,y],…]，齿轮自己的坐标系，中心在原点）建成按角度分桶的索引。
function buildGear(pts) {
  const n = pts.length;
  const x = new Float64Array(n), y = new Float64Array(n), ang = new Float64Array(n);
  let rmax = 0;
  for (let i = 0; i < n; i++) {
    x[i] = pts[i][0]; y[i] = pts[i][1];
    ang[i] = normAng(Math.atan2(y[i], x[i]));
    rmax = Math.max(rmax, Math.hypot(x[i], y[i]));
  }
  const bw = TWO_PI / BUCKETS;
  const vb = Array.from({ length: BUCKETS }, () => []);
  const sb = Array.from({ length: BUCKETS }, () => []);
  for (let i = 0; i < n; i++) {
    vb[Math.min(BUCKETS - 1, Math.floor(ang[i] / bw))].push(i);
    const j = (i + 1) % n;
    let d = ang[j] - ang[i];
    if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI;
    const lo = d >= 0 ? ang[i] : ang[j], span = Math.abs(d);
    const b0 = Math.floor(lo / bw), b1 = Math.floor((lo + span) / bw);
    for (let b = b0; b <= b1; b++) sb[((b % BUCKETS) + BUCKETS) % BUCKETS].push(i);
  }
  return { n, x, y, rmax, vb, sb, stamp: new Int32Array(n), stampId: 0, bw };
}

// 以 center 为中心、±half 的角度窗口覆盖的桶号（从 0 开始的整数，可为负或超出，用时取模）。
function bucketRange(g, center, half) {
  const c = normAng(center);
  const b0 = Math.floor((c - half) / g.bw) - 1, b1 = Math.floor((c + half) / g.bw) + 1;
  return b1 - b0 + 1 >= BUCKETS ? [0, BUCKETS - 1] : [b0, b1];
}

class PairChecker {
  constructor(polyL, polyR, dist) {
    this.L = buildGear(polyL);
    this.R = buildGear(polyR);
    this.dist = dist;
    this.cap = 4096;
    this.ls = new Float64Array(this.cap * 4);   // 左轮候选线段 x1,y1,x2,y2（装配坐标）
    this.rs = new Float64Array(this.cap * 4);
    // 两个圆盘相交区（透镜）的包围盒；交点和穿入的顶点一定落在里面
    const rL = this.L.rmax, rR = this.R.rmax;
    this.overlap = dist < rL + rR;
    if (this.overlap) {
      const xs = (dist * dist + rL * rL - rR * rR) / (2 * dist);
      const h = Math.sqrt(Math.max(0, rL * rL - xs * xs));
      const e = 1e-6;
      this.lx0 = Math.max(-rL, dist - rR) - e; this.lx1 = Math.min(rL, dist + rR) + e;
      this.ly0 = -h - e; this.ly1 = h + e;
      // 对方圆盘从本轮中心看过去的最大半角
      const half = (r, rOther) => {
        const tan2 = dist * dist - rOther * rOther;
        if (tan2 <= 0) return Math.PI;
        if (tan2 >= r * r) return Math.acos(Math.min(1, (r * r + dist * dist - rOther * rOther) / (2 * r * dist)));
        return Math.asin(Math.min(1, rOther / dist));
      };
      this.halfL = half(rL, rR) + 1e-6;
      this.halfR = half(rR, rL) + 1e-6;
    }
  }

  // 收集 g 轮在窗口里、且包围盒碰到透镜的线段，写进 out（装配坐标）。返回线段数。
  _segments(g, rotAng, offX, center, half, out) {
    const c = Math.cos(rotAng), s = Math.sin(rotAng);
    const [b0, b1] = bucketRange(g, center, half);
    const id = ++g.stampId;
    let k = 0;
    for (let b = b0; b <= b1; b++) {
      const list = g.sb[((b % BUCKETS) + BUCKETS) % BUCKETS];
      for (let q = 0; q < list.length; q++) {
        const i = list[q];
        if (g.stamp[i] === id) continue;
        g.stamp[i] = id;
        const j = i + 1 === g.n ? 0 : i + 1;
        const x1 = g.x[i] * c - g.y[i] * s + offX, y1 = g.x[i] * s + g.y[i] * c;
        const x2 = g.x[j] * c - g.y[j] * s + offX, y2 = g.x[j] * s + g.y[j] * c;
        if (Math.max(x1, x2) < this.lx0 || Math.min(x1, x2) > this.lx1 || Math.max(y1, y2) < this.ly0 || Math.min(y1, y2) > this.ly1) continue;
        if ((k + 1) * 4 > out.length) return -1;
        out[k * 4] = x1; out[k * 4 + 1] = y1; out[k * 4 + 2] = x2; out[k * 4 + 3] = y2; k++;
      }
    }
    return k;
  }

  // g 轮（转角 rotAng，中心在 (offX,0)）的顶点里，落在透镜里的那些，写进 out 的 [x,y,…]。
  _vertices(g, rotAng, offX, center, half, out) {
    const c = Math.cos(rotAng), s = Math.sin(rotAng);
    const [b0, b1] = bucketRange(g, center, half);
    let k = 0;
    for (let b = b0; b <= b1; b++) {
      const list = g.vb[((b % BUCKETS) + BUCKETS) % BUCKETS];
      for (let q = 0; q < list.length; q++) {
        const i = list[q];
        const x = g.x[i] * c - g.y[i] * s + offX, y = g.x[i] * s + g.y[i] * c;
        if (x < this.lx0 || x > this.lx1 || y < this.ly0 || y > this.ly1) continue;
        out.push(x, y);
        k++;
      }
    }
    return k;
  }

  // 点 (px,py)（装配坐标）是否在 g 轮（转角 rotAng，中心 (offX,0)）的多边形里：沿径向往外射一条线数交点的奇偶。
  _inside(g, rotAng, offX, px, py) {
    const c = Math.cos(rotAng), s = Math.sin(rotAng);
    const dx = px - offX;
    const lx = dx * c + py * s, ly = -dx * s + py * c;       // 转回齿轮自己的坐标
    const r = Math.hypot(lx, ly);
    if (r > g.rmax) return false;
    const ux = lx / r, uy = ly / r;
    const th = normAng(Math.atan2(ly, lx));
    const bi = Math.floor(th / g.bw);
    let cnt = 0;
    const id = ++g.stampId;
    for (let b = bi - 1; b <= bi + 1; b++) {
      const list = g.sb[((b % BUCKETS) + BUCKETS) % BUCKETS];
      for (let q = 0; q < list.length; q++) {
        const i = list[q];
        if (g.stamp[i] === id) continue;
        g.stamp[i] = id;
        const j = i + 1 === g.n ? 0 : i + 1;
        const c1 = ux * g.y[i] - uy * g.x[i], c2 = ux * g.y[j] - uy * g.x[j];
        if ((c1 > 0) === (c2 > 0)) continue;
        const t = c1 / (c1 - c2);
        const ix = g.x[i] + t * (g.x[j] - g.x[i]), iy = g.y[i] + t * (g.y[j] - g.y[i]);
        if (ix * ux + iy * uy > r) cnt++;
      }
    }
    return (cnt & 1) === 1;
  }

  // 一帧。aL、aR 是两轮转角；wantPoints 为真时返回 points：[x,y,kind,…]，kind 0 = 交点，1 = 穿进对方的顶点（pair 坐标：左轮中心为原点，右轮在 +x）。
  frame(aL, aR, wantPoints) {
    const out = { crossings: 0, inL: 0, inR: 0, points: wantPoints ? [] : null };
    if (!this.overlap) return out;
    const L = this.L, R = this.R, d = this.dist;
    let nl = this._segments(L, aL, 0, -aL, this.halfL, this.ls);
    let nr = this._segments(R, aR, d, Math.PI - aR, this.halfR, this.rs);
    while (nl < 0 || nr < 0) {                   // 候选线段超过缓冲区：扩容重来（正常用不到）
      this.cap *= 2; this.ls = new Float64Array(this.cap * 4); this.rs = new Float64Array(this.cap * 4);
      nl = this._segments(L, aL, 0, -aL, this.halfL, this.ls);
      nr = this._segments(R, aR, d, Math.PI - aR, this.halfR, this.rs);
    }
    const ls = this.ls, rs = this.rs;
    for (let i = 0; i < nl; i++) {
      const ax = ls[i * 4], ay = ls[i * 4 + 1], bx2 = ls[i * 4 + 2], by2 = ls[i * 4 + 3];
      for (let j = 0; j < nr; j++) {
        const cx = rs[j * 4], cy = rs[j * 4 + 1], dx = rs[j * 4 + 2], dy = rs[j * 4 + 3];
        if (Math.max(ax, bx2) < Math.min(cx, dx) || Math.max(cx, dx) < Math.min(ax, bx2) ||
            Math.max(ay, by2) < Math.min(cy, dy) || Math.max(cy, dy) < Math.min(ay, by2)) continue;
        const d1 = (ax - bx2) * (cy - by2) - (ay - by2) * (cx - bx2);      // cross(b, a, c)
        const d2 = (ax - bx2) * (dy - by2) - (ay - by2) * (dx - bx2);      // cross(b, a, d)
        const d3 = (cx - dx) * (ay - dy) - (cy - dy) * (ax - dx);          // cross(d, c, a)
        const d4 = (cx - dx) * (by2 - dy) - (cy - dy) * (bx2 - dx);        // cross(d, c, b)
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
          out.crossings++;
          if (wantPoints) {
            // 交点：a、b 两点到直线 cd 的有向距离之比 d3 : d4，决定它在 a→b 上的位置
            const t = d3 / (d3 - d4);
            out.points.push(ax + t * (bx2 - ax), ay + t * (by2 - ay), 0);
          }
        }
      }
    }
    // 穿进对方的顶点
    const vr = [], vl = [];
    this._vertices(R, aR, d, Math.PI - aR, this.halfR, vr);
    for (let q = 0; q < vr.length; q += 2) {
      if (this._inside(L, aL, 0, vr[q], vr[q + 1])) { out.inL++; if (wantPoints) out.points.push(vr[q], vr[q + 1], 1); }
    }
    this._vertices(L, aL, 0, -aL, this.halfL, vl);
    for (let q = 0; q < vl.length; q += 2) {
      if (this._inside(R, aR, d, vl[q], vl[q + 1])) { out.inR++; if (wantPoints) out.points.push(vl[q], vl[q + 1], 1); }
    }
    return out;
  }
}

const api = {
  PARAMS, PAIRS, angles,
  referenceFrame, referenceCycle, rotPts, transPts, segInt, pointInPoly,
  PairChecker, buildGear,
};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.GearMesh = api;
})(typeof window !== 'undefined' ? window : globalThis);
