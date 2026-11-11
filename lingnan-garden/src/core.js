// 岭南园林一角（第二版）：布局数据与行走规则。不依赖 Three.js，画面和测试都读这一份。
// 坐标：x 向东，z 向南，y 向上；单位米。明信片机位在庭院西南角，朝东北看。

export const WATER_Y = -0.38;
export const DECK_Y = 0.45;          // 敞厅台基、廊子的高度
export const OCT_Y = 0.3;            // 八角亭台面
export const EYE = 1.62;
export const PLAYER_R = 0.28;
export const BOUNDS = { x0: -13.4, x1: 16.2, z0: -9.5, z1: 15.2 };

// 敞厅：面南，前带檐廊。pavToWorld 保留给机位和测试用（这一版没有转角）。
export const PAV = { x0: -5.5, x1: 3.0, zBack: -6.2, zWall: -2.4, zFront: 0.0, door: [-5.22, -3.92], cols: [-5.3, -3.64, -1.98, -0.32, 1.34, 2.8] };
export const pavToWorld = (lx, lz) => ({ x: lx, z: lz });
export const worldToPav = (x, z) => ({ x, z });

// 水面：长方形荷池 + 廊桥下的水道 + 八角池，连成一圈（顺序绕一周）。
export const RECT = { x0: -5.5, x1: 4.5, z0: 0.2, z1: 7.6 };
export const CHANNEL = { x0: 4.5, x1: 8.0, z0: 1.9, z1: 3.6 };
export const OCT = { x: 11.3, z: 5.2, a: 3.3 };                 // a 是边心距
const os = OCT.a * Math.tan(Math.PI / 8);
export const OCT_PTS = [
  { x: OCT.x - OCT.a, z: OCT.z - os }, { x: OCT.x - os, z: OCT.z - OCT.a }, { x: OCT.x + os, z: OCT.z - OCT.a }, { x: OCT.x + OCT.a, z: OCT.z - os },
  { x: OCT.x + OCT.a, z: OCT.z + os }, { x: OCT.x + os, z: OCT.z + OCT.a }, { x: OCT.x - os, z: OCT.z + OCT.a }, { x: OCT.x - OCT.a, z: OCT.z + os },
];
// 水道从八角池的西北角接进去：北沿正好接八角池北边，南沿接西边
export const POND = [
  { x: RECT.x0, z: RECT.z0 }, { x: RECT.x1, z: RECT.z0 }, { x: RECT.x1, z: CHANNEL.z0 },
  OCT_PTS[1], OCT_PTS[2], OCT_PTS[3], OCT_PTS[4], OCT_PTS[5], OCT_PTS[6], OCT_PTS[7], OCT_PTS[0],
  { x: CHANNEL.x1, z: CHANNEL.z1 }, { x: RECT.x1, z: CHANNEL.z1 }, { x: RECT.x1, z: RECT.z1 }, { x: RECT.x0, z: RECT.z1 },
];

// 廊子与廊桥：从敞厅檐廊东头接出去（CONN），折向南跨过水道（BRIDGE，南北向）。
export const CONN = { x0: 3.0, x1: 6.85, z0: -2.4, z1: -0.6 };
export const BRIDGE = { x0: 4.95, x1: 6.85, z0: -0.6, z1: 5.6, flat: 0.9, peak: 1.2, land: 4.3 };
export function bridgeY(z) {
  const B = BRIDGE;
  if (z <= B.flat) return DECK_Y;
  if (z >= B.z1) return 0;
  const mid = (CHANNEL.z0 + CHANNEL.z1) / 2;
  if (z <= mid) { const t = (z - B.flat) / (mid - B.flat); return DECK_Y + (B.peak - DECK_Y) * Math.sin(t * Math.PI / 2); }
  const t = (z - mid) / (B.z1 - mid); return B.peak * Math.cos(t * Math.PI / 2);
}
export const PAVILION = { x: OCT.x, z: OCT.z, r: 1.75, wall: 1.5, doorSide: 2 };   // 八角亭；doorSide：朝南那一面开门
export const SLAB = { x0: OCT.x - 0.6, x1: OCT.x + 0.6, z0: OCT.z + 1.5, z1: OCT.z + OCT.a + 0.25 };                       // 南岸通八角亭的石板桥（为了能走进去补的）

export const LINK_Z = -2.6;                           // 庭院北面的砖墙：从西围墙一直接到敞厅西山墙
export const DOOR = { x0: -8.9, x1: -7.6 };           // 这道墙上的门，门里是窄巷
export const ALLEY_X = -9.6;                          // 窄巷的西墙；巷子贴着敞厅西山墙往北，再拐到屋后
export const NORTH_JOG = { x: 4.6, z: -2.9 };         // 东半边的北墙比西半边靠南
export const PLANTER = { x0: -9.85, x1: -8.75, z0: 3.4, z1: 8.4, h: 0.55 };
export const BONSAI = [
  { x: -9.3, z: 4.3, pot: 'bluewhite' }, { x: -9.3, z: 5.9, pot: 'green' }, { x: -9.3, z: 7.5, pot: 'brown' },
];
export const TABLE = { x: -1.2, z: 9.9 };
export const JAR = { x: 1.9, z: 9.9, r: 0.72 };
export const LYCHEE = { x: -1.5, z: 11.6, r: 0.45 };
export const WAX = [{ x: -5.0, z: 8.35, r: 0.42 }, { x: -4.15, z: 8.45, r: 0.3 }];
export const KAPOK = { x: -10.4, z: -4.4, r: 0.55 };  // 在墙外，花枝探进院子
export const JACK = { x: -1.6, z: -8.95, r: 0.45 };   // 屋后那棵大树菠萝
export const BANANA = [{ x: 9.0, z: -2.1 }, { x: 10.2, z: -2.3 }];
export const BAMBOO = [
  { x: -9.1, z: -4.2, r: 0.38 }, { x: -9.15, z: -6.4, r: 0.38 }, { x: -9.1, z: -8.7, r: 0.38 },
  { x: -4.4, z: -9.0, r: 0.45 }, { x: 1.6, z: -9.0, r: 0.45 },
  { x: -12.8, z: -1.9, r: 0.5 }, { x: -12.9, z: 1.2, r: 0.5 }, { x: -12.9, z: 4.4, r: 0.5 },
];
export const ROCKS = [   // 贴东墙和北墙的英石壁山：每块一个挡路的圆
  { x: 11.6, z: -2.3, r: 0.6 }, { x: 12.8, z: -2.2, r: 0.75 }, { x: 14.1, z: -2.1, r: 0.85 }, { x: 15.4, z: -1.8, r: 0.9 },
  { x: 15.6, z: -0.3, r: 0.8 }, { x: 15.6, z: 1.3, r: 0.85 }, { x: 15.6, z: 2.9, r: 0.85 }, { x: 15.6, z: 4.5, r: 0.8 }, { x: 15.6, z: 6.0, r: 0.8 }, { x: 15.6, z: 7.6, r: 0.85 }, { x: 15.65, z: 9.1, r: 0.7 }, { x: 15.7, z: 10.3, r: 0.5 },
];
export const FALL = { x: 15.5, z: 5.2, dx: -1, dz: 0, top: 3.5 };   // 壁山上的一线跌水，落进八角池东沿
export const POSTCARD = { x: -9.6, y: 3.0, z: 13.4, yaw: -0.66, pitch: -0.1, fov: 50 };
export const START = { x: -5.6, z: 12.6, yaw: -0.5 };

// ---- 几何小工具 ----
export function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const rect = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
function strip(a, b, w) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  return { a, b, len, ux: dx / len, uz: dz / len, poly: [{ x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz }, { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz }] };
}
const along = (s, x, z) => ((x - s.a.x) * s.ux + (z - s.a.z) * s.uz) / s.len;
const clamp01 = t => Math.min(1, Math.max(0, t));

// ---- 架在地面以上的可走面 ----
export const STEPS_W = strip({ x: PAV.x0, z: -1.5 }, { x: PAV.x0 - 1.2, z: -1.5 }, 1.6);        // 檐廊西头下到庭院
export const STEPS_N = strip({ x: 4.0, z: CONN.z0 }, { x: 4.0, z: CONN.z0 - 1.1 }, 1.2);        // 廊子北侧下到屋后
export const STEPS_E = strip({ x: CONN.x1, z: -1.5 }, { x: CONN.x1 + 1.1, z: -1.5 }, 1.6);      // 廊子东头下到八角池北岸
const down = s => (x, z) => DECK_Y * (1 - clamp01(along(s, x, z)));
export const RAISED = [
  { name: 'deck', poly: rect(PAV.x0, PAV.zBack, PAV.x1, PAV.zFront), h: () => DECK_Y },
  { name: 'stepsW', poly: STEPS_W.poly, h: down(STEPS_W) },
  { name: 'conn', poly: rect(CONN.x0, CONN.z0, CONN.x1, CONN.z1), h: () => DECK_Y },
  { name: 'stepsN', poly: STEPS_N.poly, h: down(STEPS_N) },
  { name: 'stepsE', poly: STEPS_E.poly, h: down(STEPS_E) },
  { name: 'bridge', poly: rect(BRIDGE.x0, BRIDGE.z0, BRIDGE.x1, BRIDGE.z1), h: (x, z) => bridgeY(z) },
  { name: 'slab', poly: rect(SLAB.x0, SLAB.z0, SLAB.x1, SLAB.z1), h: () => OCT_Y },
];
export const JOINTS = [{ x: PAVILION.x, z: PAVILION.z, r: PAVILION.r, h: OCT_Y }];

// ---- 挡路的东西 ----
const thin = (ax, az, bx, bz, w = 0.22) => strip({ x: ax, z: az }, { x: bx, z: bz }, w).poly;
const octSide = i => { const a0 = Math.PI / 8 + i * Math.PI / 4, a1 = a0 + Math.PI / 4, r = PAVILION.wall / Math.cos(Math.PI / 8); return thin(PAVILION.x + Math.cos(a0) * r, PAVILION.z + Math.sin(a0) * r, PAVILION.x + Math.cos(a1) * r, PAVILION.z + Math.sin(a1) * r, 0.18); };
export const WALLS = [
  // 敞厅：后墙、两山墙、正面墙（最西一间是门）
  thin(PAV.x0, PAV.zBack, PAV.x1, PAV.zBack, 0.3), thin(PAV.x0, PAV.zBack, PAV.x0, PAV.zWall, 0.3), thin(PAV.x1, PAV.zBack, PAV.x1, PAV.zWall, 0.3),
  thin(PAV.x0, PAV.zWall, PAV.door[0], PAV.zWall), thin(PAV.door[1], PAV.zWall, PAV.x1, PAV.zWall),
  // 檐廊临水一面的栏杆
  thin(PAV.x0, PAV.zFront, PAV.x1, PAV.zFront, 0.16),
  // 廊子：南侧栏杆（留出上桥的口）、北侧栏杆（留出下屋后的踏步）
  thin(CONN.x0, CONN.z1, BRIDGE.x0, CONN.z1, 0.16), thin(PAV.x1, CONN.z1, PAV.x1, PAV.zFront, 0.16), thin(CONN.x0, CONN.z0, 3.4, CONN.z0, 0.16), thin(4.6, CONN.z0, CONN.x1, CONN.z0, 0.16),
  // 廊桥两侧栏杆
  thin(BRIDGE.x0, BRIDGE.z0, BRIDGE.x0, BRIDGE.z1, 0.16), thin(BRIDGE.x1, BRIDGE.z0, BRIDGE.x1, BRIDGE.z1, 0.16),
  // 庭院北墙（留门）、窄巷西墙外面那一块实地、北墙东半段外面那一块
  thin(BOUNDS.x0 - 0.5, LINK_Z, DOOR.x0, LINK_Z, 0.44), thin(DOOR.x1, LINK_Z, PAV.x0, LINK_Z, 0.44),
  rect(BOUNDS.x0 - 0.6, BOUNDS.z0 - 0.6, ALLEY_X, LINK_Z),
  rect(NORTH_JOG.x, BOUNDS.z0 - 0.6, BOUNDS.x1 + 0.6, NORTH_JOG.z),
  // 花基
  rect(PLANTER.x0, PLANTER.z0, PLANTER.x1, PLANTER.z1),
  // 八角亭：七面矮墙加窗，朝南一面开门
  ...[0, 1, 2, 3, 4, 5, 6, 7].filter(i => i !== 1).map(octSide),
  // 屋里的桌子
  rect(-0.6, -4.9, 1.2, -4.0),
];
export const CIRCLES = [
  { x: TABLE.x, z: TABLE.z, r: 0.72 }, { x: TABLE.x - 1.05, z: TABLE.z + 0.6, r: 0.34 }, { x: TABLE.x + 1.05, z: TABLE.z + 0.75, r: 0.34 },
  JAR, LYCHEE, KAPOK, JACK, ...WAX.map(w => ({ ...w, r: w.r * 0.85 })), ...BANANA.map(b => ({ ...b, r: 0.45 })), ...BAMBOO, ...ROCKS,
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
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export function placeName(x, z) {
  if (x >= PAV.x0 && x <= PAV.x1 && z >= PAV.zBack && z <= PAV.zWall) return '敞厅 · 屋内';
  if (x >= PAV.x0 && x <= PAV.x1 && z > PAV.zWall && z <= PAV.zFront) return '敞厅 · 檐廊';
  if (Math.hypot(x - PAVILION.x, z - PAVILION.z) <= PAVILION.r) return '八角亭';
  if (inRect(BRIDGE, x, z) && z > BRIDGE.flat) return '廊桥';
  if (inRect(CONN, x, z) || inRect(BRIDGE, x, z)) return '廊子';
  if (z < LINK_Z && x < PAV.x0 && z > PAV.zBack) return '窄巷';
  if (x < NORTH_JOG.x && (z < PAV.zBack + 0.2 || (x > PAV.x1 && z < CONN.z0))) return '屋后';
  if (z < CHANNEL.z0 && x > CONN.x1) return '壁山下';
  if (x > RECT.x1 + 0.4 && z > CHANNEL.z1) return '八角池畔';
  if (Math.hypot(x - TABLE.x, z - TABLE.z) < 2.6) return '石桌旁';
  if (x < RECT.x0 - 0.6 && x > PLANTER.x0 - 1.6 && z > PLANTER.z0 - 1 && z < PLANTER.z1 + 0.8) return '花基旁';
  return '庭院';
}
// 一圈导览：庭院 → 北墙的门 → 窄巷 → 屋后 → 廊子 → 檐廊 → 进屋再出来 → 廊桥 → 八角池畔 → 八角亭 → 石桌 → 回到起点
export const TOUR = [
  START, { x: -6.6, z: 4.6 }, { x: -8.25, z: -1.4 }, { x: -8.25, z: -4.2 }, { x: -7.5, z: -7.9 }, { x: 2.6, z: -7.7 }, { x: 4.0, z: -5.6 }, { x: 4.0, z: -1.6 },
  { x: 2.0, z: -1.5 }, { x: -4.57, z: -1.5 }, { x: -4.57, z: -3.6 }, { x: -2.4, z: -4.4 }, { x: -4.57, z: -3.4 }, { x: -4.57, z: -1.5 }, { x: 2.4, z: -1.5 },
  { x: 5.9, z: -1.4 }, { x: 5.9, z: 2.75 }, { x: 5.9, z: 6.3 }, { x: 7.2, z: 9.4 }, { x: 11.3, z: 9.3 }, { x: 11.3, z: 5.8 }, { x: 11.3, z: 9.3 }, { x: 5.2, z: 11.6 }, { x: 3.4, z: 13.9 }, { x: -1.3, z: 14.1 }, START,
];
