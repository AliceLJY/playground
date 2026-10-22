// 机位与构图：页面和 Node 测试共用的纯数学，不依赖 THREE 和 DOM。
//
// 世界坐标里相机永远朝 −z 看、上方向是 +y。整套齿轮装在 rig 里：横屏不转，竖屏绕 z 转 90°（横排变竖排）。
// 机位由「要框进画面的一组点」反推：沿固定方向把相机拉远，直到所有点都落进「安全区」
// （画面去掉顶栏和底栏之后的那块），再用 viewOffset 把画面中心挪到安全区中心。
(function (root) {
'use strict';

const FOV = 42;                           // 度，纵向，与 dsh 页面一致
const UP = [0, 1, 0];
const DIRS = {                            // 相机相对目标的方向（世界坐标，不用归一化）
  hero: [9, 9, 58],                       // dsh 原来的开场角度
  mesh: [1.6, 1.2, 10],                   // 啮合处特写：几乎正对，略带斜角看得出厚度
  'mesh-cd': [1.6, 1.2, 10],
};
const VIEWS = ['hero', 'mesh', 'mesh-cd'];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

function isPortrait(W, H) { return H > W; }
function rigRotation(W, H) { return isPortrait(W, H) ? Math.PI / 2 : 0; }

// rig 局部坐标 → 世界坐标（rig 只绕 z 转）
function rigToWorld(p, rotZ) {
  const c = Math.cos(rotZ), s = Math.sin(rotZ);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

// 透视投影：返回像素坐标 [x, y] 和深度。pose = {position, target, offsetY}，offsetY 是画面整体下移的像素数
function project(p, pose, W, H, fov = FOV) {
  const f = nrm(sub(pose.target, pose.position));
  const r = nrm(crs(f, UP));
  const u = crs(r, f);
  const v = sub(p, pose.position);
  const zc = dot(v, f);
  const th = Math.tan(fov * Math.PI / 360);
  const nx = dot(v, r) / (zc * th * (W / H)), ny = dot(v, u) / (zc * th);
  return { x: (nx + 1) / 2 * W, y: (1 - ny) / 2 * H + (pose.offsetY || 0), depth: zc };
}

// 圆周上的取样点（rig 局部），用来代表一个轮子的外缘；两个端面都取
function circlePoints(cx, cy, cz, radius, halfDepth, n = 24) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    for (const dz of [-halfDepth, halfDepth]) pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a), cz + dz]);
  }
  return pts;
}

// 四个轮子外缘（齿顶圆）的取样点，rig 局部坐标。params 来自 GearMesh.PARAMS。
function gearOutlinePoints(P) {
  const { m, depth, zL, rA, rB, rC, rD, bx } = P;
  const half = depth / 2 + 0.05;
  return {
    A: circlePoints(-bx, 0, -zL, rA + m, half),
    B: circlePoints(0, 0, -zL, rB + m, half),
    C: circlePoints(0, 0, +zL, rC + m, half),
    D: circlePoints(+bx, 0, +zL, rD + m, half),
  };
}
function gearCenters(P) {
  const { zL, bx } = P;
  return { A: [-bx, 0, -zL], B: [0, 0, -zL], C: [0, 0, +zL], D: [bx, 0, +zL] };
}

// 要框进画面的点（rig 局部）与目标点
function subjectFor(view, P) {
  if (view === 'hero') {
    const all = [].concat(...Object.values(gearOutlinePoints(P)));
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 0];
    return { points: all, target: c };
  }
  // 特写：啮合点（节圆相切处）附近一块正方形，边长取 11 个单位，足够装下两轮咬合的三四个齿
  const { rA, rC, zL, bx, depth } = P;
  const c = view === 'mesh' ? [-bx + rA, 0, -zL + depth / 2] : [rC, 0, +zL + depth / 2];
  const h = 5.5;
  const pts = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([dx, dy]) => [c[0] + dx, c[1] + dy, c[2]]);
  return { points: pts, target: c };
}

// 给定视口和上下遮挡，算出某个机位的相机位置、目标、viewOffset。
// insets = {top, bottom}（像素，被顶栏底栏占掉的高度），pad 是内容离安全区边缘至少留的像素。
function poseFor(view, { W, H, top = 0, bottom = 0, pad = 10, P }) {
  const rot = rigRotation(W, H);
  const subj = subjectFor(view, P);
  const target = rigToWorld(subj.target, rot);
  const pts = subj.points.map((p) => rigToWorld(p, rot));
  const dir = nrm(DIRS[view] || DIRS.hero);
  const offsetY = (top - bottom) / 2;
  const x0 = pad, x1 = W - pad, y0 = top + pad, y1 = H - bottom - pad;
  const fits = (d) => {
    const pose = { position: add(target, mul(dir, d)), target, offsetY };
    return pts.every((p) => { const q = project(p, pose, W, H); return q.depth > 0 && q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1; });
  };
  let lo = 2, hi = 600;
  if (!fits(hi)) return { position: add(target, mul(dir, hi)), target, offsetY, distance: hi, rigRotation: rot, fitted: false };
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return { position: add(target, mul(dir, hi)), target, offsetY, distance: hi, rigRotation: rot, fitted: true };
}

const api = { FOV, VIEWS, DIRS, isPortrait, rigRotation, rigToWorld, project, circlePoints, gearOutlinePoints, gearCenters, subjectFor, poseFor };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.GearFraming = api;
})(typeof window !== 'undefined' ? window : globalThis);
