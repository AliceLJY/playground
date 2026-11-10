// 岭南园林一角：布局数据与行走规则。不依赖 Three.js，画面和测试都读这一份。
// 坐标：x 向右（东），z 朝向明信片机位（南），y 向上；单位米。

export const WATER_Y = -0.42;
export const DECK_Y = 0.85;
export const EYE = 1.62;
export const PLAYER_R = 0.28;
export const BOUNDS = { x0: -15.6, x1: 15.6, z0: -16.4, z1: 21.2 };

// 水榭：局部坐标 x 沿面阔、z 朝池；rot 让东端往北退一点，和起始图一致。
export const PAV = { x: -1.2, z: 2.5, rot: 0.17, halfL: 4.1, zBack: -2.6, zWall: 0.6, zFront: 2.4, door: [-3.72, -2.3], stepsX: [-4.1, -2.45], stepsLen: 2.3 };
export function pavToWorld(lx, lz) {
  const c = Math.cos(PAV.rot), s = Math.sin(PAV.rot);
  return { x: PAV.x + lx * c + lz * s, z: PAV.z - lx * s + lz * c };
}
export function worldToPav(x, z) {
  const c = Math.cos(PAV.rot), s = Math.sin(PAV.rot), dx = x - PAV.x, dz = z - PAV.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
const pavPoly = (x0, z0, x1, z1) => [pavToWorld(x0, z0), pavToWorld(x1, z0), pavToWorld(x1, z1), pavToWorld(x0, z1)];

// 荷塘岸线（顺序绕一圈）。水榭前廊的石墩立在水里。
export const POND = [
  pavToWorld(PAV.stepsX[1] + 0.1, 0.7), pavToWorld(PAV.stepsX[1] + 0.1, 3.0), { x: -2.7, z: 7.5 }, { x: -1.8, z: 8.8 }, { x: -0.2, z: 9.9 }, { x: 1.6, z: 10.3 }, { x: 3.6, z: 10.2 }, { x: 5.6, z: 10.2 }, { x: 7.4, z: 10.2 },
  { x: 9.0, z: 9.4 }, { x: 10.2, z: 7.6 }, { x: 10.8, z: 5.6 }, { x: 10.9, z: 3.4 }, { x: 10.7, z: 1.2 }, { x: 9.9, z: -0.6 }, { x: 8.2, z: -1.1 }, { x: 6.2, z: -1.0 }, { x: 4.6, z: -0.5 }, pavToWorld(PAV.halfL, 0.2),
];

// 曲廊：从前廊东端出去到水中的石矶 M，在那里折向东北落到北岸；石桥从 M 往东跨到东岸。
const E0 = pavToWorld(PAV.halfL - 0.2, 1.5);
export const ISLET = { x: 5.9, z: 3.0, r: 1.15 };
const N1 = { x: 8.6, z: -0.5 }, N2 = { x: 9.42, z: -1.57 };
export const CORRIDOR = [E0, { x: ISLET.x, z: ISLET.z }, N1, N2];   // 最后一段是下到北岸的踏步
export const CORRIDOR_W = 1.7;
export const BRIDGE = { a: { x: 6.85, z: 3.2 }, b: { x: 11.3, z: 4.25 }, w: 1.7, rise: 0.8 };
export const WALL_Z = 1.0;             // 月洞门那道墙
export const GATE = { x: -9.4, r: 1.3, y: 1.6 };
export const WOK = { x: -11.4, half: 2.4 };
export const ROCKERY = { x: 12.6, z: -5.2, r: 2.7 };
export const BANYAN = { x: 8.8, z: -12.6, r: 1.5 };
export const KAPOK = { x: -4.9, z: 14.9, r: 0.55 };
export const TABLE = { x: 3.4, z: 12.2 };
export const JAR = { x: 5.4, z: 12.9, r: 0.72 };
export const BANANA = [{ x: 6.5, z: 11.8 }, { x: 7.7, z: 13.5 }];
export const BONSAI = [
  { x: -4.3, z: 11.7, pot: 'bluewhite', block: [1.5, 0.55, 1.1] },
  { x: -3.1, z: 10.7, pot: 'green', block: [1.0, 0.5, 0.9] },
  { x: -4.4, z: 9.5, pot: 'brown', block: [1.05, 0.42, 0.8] },
];
export const POND_ROCKS = [[0.6, 10.55, 0.5], [1.9, 10.65, 0.36], [-1.2, 9.6, 0.4], [-2.2, 8.4, 0.32], [6.6, 10.5, 0.4], [9.5, 9.2, 0.45], [10.8, 6.9, 0.42]].map(([x, z, r]) => ({ x, z, r }));
export const BAMBOO = [
  { x: 15.1, z: 6.5, r: 0.6 }, { x: 15.2, z: 3.4, r: 0.6 }, { x: 15.1, z: 0.6, r: 0.6 }, { x: 15.1, z: 10.5, r: 0.6 }, { x: 14.9, z: 13.6, r: 0.6 }, { x: 14.7, z: 19.4, r: 0.7 }, { x: -14.6, z: 19.2, r: 0.7 },
  { x: -13.0, z: -3.0, r: 1.0 }, { x: -10.6, z: -4.3, r: 0.9 }, { x: -8.0, z: -3.8, r: 0.9 }, { x: -14.4, z: -0.6, r: 0.8 },
  { x: -7.0, z: -12.5, r: 1.0 }, { x: -11.5, z: -11.0, r: 1.0 },
];
export const POSTCARD = { x: 0.8, y: 3.6, z: 20.6, yaw: -0.04, pitch: -0.185, fov: 44 };
export const START = { x: 0.6, z: 18.4, yaw: 0.03 };

// ---- 几何小工具 ----
export function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function strip(a, b, w) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  return { a, b, len, ux: dx / len, uz: dz / len, poly: [{ x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz }, { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz }] };
}
const along = (s, x, z) => ((x - s.a.x) * s.ux + (z - s.a.z) * s.uz) / s.len;

// ---- 架在地面以上的可走面（前廊、屋内、踏步、曲廊、桥）----
const stepsA = pavToWorld((PAV.stepsX[0] + PAV.stepsX[1]) / 2, PAV.zFront), stepsB = pavToWorld((PAV.stepsX[0] + PAV.stepsX[1]) / 2, PAV.zFront + PAV.stepsLen);
const sSteps = strip(stepsA, stepsB, PAV.stepsX[1] - PAV.stepsX[0]);
const sC = [strip(CORRIDOR[0], CORRIDOR[1], CORRIDOR_W), strip(CORRIDOR[1], CORRIDOR[2], CORRIDOR_W), strip(CORRIDOR[2], CORRIDOR[3], CORRIDOR_W)];
export const CORRIDOR_STEPS = sC[2];
const sBridge = strip(BRIDGE.a, BRIDGE.b, BRIDGE.w);
export const bridgeY = t => DECK_Y * (1 - t) + BRIDGE.rise * 4 * t * (1 - t);   // 西头接在石矶的廊台上，东头落到岸上
export const RAISED = [
  { name: 'deck', poly: pavPoly(-PAV.halfL, PAV.zBack, PAV.halfL, PAV.zFront), h: () => DECK_Y },
  { name: 'steps', poly: sSteps.poly, h: (x, z) => DECK_Y * (1 - Math.min(1, Math.max(0, along(sSteps, x, z)))) },
  { name: 'corridor1', poly: sC[0].poly, h: () => DECK_Y },
  { name: 'corridor2', poly: sC[1].poly, h: () => DECK_Y },
  { name: 'corridorSteps', poly: sC[2].poly, h: (x, z) => DECK_Y * (1 - Math.min(1, Math.max(0, (along(sC[2], x, z) - 0.1) / 0.8))) },
  { name: 'bridge', poly: sBridge.poly, h: (x, z) => bridgeY(Math.min(1, Math.max(0, along(sBridge, x, z)))) },
];
export const JOINTS = [{ x: ISLET.x, z: ISLET.z, r: ISLET.r, h: DECK_Y }];

// ---- 挡路的东西 ----
const thin = (a, b, w = 0.22) => strip(a, b, w).poly;
const p2w = (lx, lz) => pavToWorld(lx, lz);
export const WALLS = [
  // 屋身四面墙，正面留门
  thin(p2w(-PAV.halfL, PAV.zBack), p2w(PAV.halfL, PAV.zBack)),
  thin(p2w(-PAV.halfL, PAV.zBack), p2w(-PAV.halfL, PAV.zWall)),
  thin(p2w(PAV.halfL, PAV.zBack), p2w(PAV.halfL, PAV.zWall)),
  thin(p2w(-PAV.halfL, PAV.zWall), p2w(PAV.door[0], PAV.zWall)),
  thin(p2w(PAV.door[1], PAV.zWall), p2w(PAV.halfL, PAV.zWall)),
  // 前廊栏杆（踏步口和曲廊口留开）
  thin(p2w(PAV.stepsX[1], PAV.zFront), p2w(PAV.halfL, PAV.zFront), 0.16),
  thin(p2w(-PAV.halfL, PAV.zWall), p2w(-PAV.halfL, PAV.zFront), 0.16),
  thin(p2w(PAV.halfL, PAV.zFront), p2w(PAV.halfL, PAV.zFront - 0.35), 0.16),
  // 月洞门那道白墙：门洞两侧
  thin({ x: BOUNDS.x0 - 0.5, z: WALL_Z }, { x: GATE.x - 1.02, z: WALL_Z }, 0.5),
  thin({ x: GATE.x + 1.02, z: WALL_Z }, pavToWorld(-PAV.halfL, -2.35), 0.5),
  // 屋内家具
  thin(p2w(0.75, -1.3), p2w(2.45, -1.3), 0.9),
];
export const CIRCLES = [
  { x: TABLE.x, z: TABLE.z, r: 0.72 }, { x: TABLE.x - 1.05, z: TABLE.z + 0.75, r: 0.34 }, { x: TABLE.x + 1.1, z: TABLE.z + 0.9, r: 0.34 },
  JAR, { ...BANANA[0], r: 0.45 }, { ...BANANA[1], r: 0.45 }, KAPOK, BANYAN, ROCKERY,
  ...BONSAI.map(b => ({ x: b.x, z: b.z, r: Math.max(b.block[0], b.block[2]) / 2 + 0.05 })),
  ...POND_ROCKS.map(r => ({ x: r.x, z: r.z, r: r.r * 0.8 })), ...BAMBOO,
  { x: -1.0, z: -6.5, r: 0.5 }, { x: -4.8, z: -9.0, r: 0.5 }, { x: 1.6, z: -13.6, r: 0.5 },     // 后园小树
  { x: -12.6, z: 6.4, r: 0.5 }, { x: -13.4, z: 12.6, r: 0.6 }, { x: 12.6, z: 13.8, r: 0.6 }, { x: 10.6, z: 18.8, r: 0.5 }, { x: -10.4, z: 18.4, r: 0.5 },  // 前园小树与石
];

const onRaised = (x, z) => { let best = null; for (const r of RAISED) if (inPoly(r.poly, x, z)) { const h = r.h(x, z); if (best === null || h > best) best = h; } for (const j of JOINTS) if (Math.hypot(x - j.x, z - j.z) <= j.r && (best === null || j.h > best)) best = j.h; return best; };
export function groundY(x, z) { const h = onRaised(x, z); return h === null ? 0 : h; }
export const inPond = (x, z) => inPoly(POND, x, z);
const RING = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * PLAYER_R, Math.sin(i * Math.PI / 4) * PLAYER_R]);
export function blockedBy(x, z) {
  if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return 'bounds';
  if (onRaised(x, z) === null && inPond(x, z)) return 'pond';
  for (const c of CIRCLES) if (Math.hypot(x - c.x, z - c.z) < c.r + PLAYER_R) return 'object';
  for (const w of WALLS) { if (inPoly(w, x, z)) return 'wall'; for (const [rx, rz] of RING) if (inPoly(w, x + rx, z + rz)) return 'wall'; }
  return null;
}
export const STEP_UP = 0.3;
function canGo(x0, z0, x1, z1) { return !blockedBy(x1, z1) && Math.abs(groundY(x1, z1) - groundY(x0, z0)) <= STEP_UP; }
// 走一步：整步不行就只走 x 或只走 z（贴着滑），长步拆成小步免得穿过薄墙。
export function moveWalker(x, z, dx, dz) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  const sx = dx / n, sz = dz / n;
  for (let i = 0; i < n; i++) {
    if (canGo(x, z, x + sx, z + sz)) { x += sx; z += sz; }
    else if (sx && canGo(x, z, x + sx, z)) x += sx;
    else if (sz && canGo(x, z, x, z + sz)) z += sz;
    else break;
  }
  return { x, z };
}
// 朝一个点走若干秒，返回终点；测试和自动巡游都用它。
export function walkToward(x, z, tx, tz, seconds, speed = 2.5, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) {
    const d = Math.hypot(tx - x, tz - z); if (d < 0.15) break;
    const k = Math.min(d, speed * dt) / d, r = moveWalker(x, z, (tx - x) * k, (tz - z) * k);
    if (r.x === x && r.z === z) break; x = r.x; z = r.z;
  }
  return { x, z };
}
export function placeName(x, z) {
  const l = worldToPav(x, z);
  if (Math.abs(l.x) <= PAV.halfL && l.z >= PAV.zBack && l.z <= PAV.zWall) return '水榭 · 屋内';
  if (Math.abs(l.x) <= PAV.halfL && l.z > PAV.zWall && l.z <= PAV.zFront) return '水榭 · 前廊';
  if (inPoly(RAISED[5].poly, x, z)) return '石拱桥';
  if (Math.hypot(x - ISLET.x, z - ISLET.z) <= ISLET.r) return '曲廊 · 石矶';
  if (RAISED.slice(2, 5).some(r => inPoly(r.poly, x, z)) || JOINTS.some(j => Math.hypot(x - j.x, z - j.z) <= j.r)) return '曲廊';
  if (z < WALL_Z && x < pavToWorld(-PAV.halfL, 0).x) return '月洞门内 · 竹院';
  if (z < -0.8) return x > 10 && z > -9 ? '假山下' : x > 3 && z < -8 ? '榕树下' : '北岸';
  if (x > 10.9) return '东岸竹径';
  if (Math.hypot(x - TABLE.x, z - TABLE.z) < 3.2) return '石桌旁';
  return x < -5 ? '木棉树下' : '石板路';
}
// 一圈导览路线：石板路 → 踏步 → 前廊 → 进屋再出来 → 曲廊 → 北岸 → 石桥 → 东岸 → 石桌 → 回到起点
export const TOUR = [
  START, { x: -0.9, z: 10.6 }, pavToWorld(-3.27, 5.0), pavToWorld(-3.27, 1.5), pavToWorld(-3.0, -0.9), pavToWorld(-3.0, 1.5), pavToWorld(PAV.halfL - 0.7, 1.5),
  { x: ISLET.x, z: ISLET.z }, N1, { x: N2.x + 0.3, z: N2.z - 0.4 }, { x: N2.x - 0.3, z: N2.z - 1.8 }, { x: N2.x + 0.3, z: N2.z - 0.4 }, N1, { x: ISLET.x, z: ISLET.z }, BRIDGE.a, BRIDGE.b, { x: 12.7, z: 5.6 }, { x: 12.8, z: 8.2 }, { x: 11.0, z: 11.2 }, { x: 9.6, z: 14.4 }, { x: 4.4, z: 15.0 }, { x: 1.6, z: 16.4 }, START,
];
