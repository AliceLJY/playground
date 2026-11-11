// 广州石室圣心大教堂：纯逻辑部分（平面、柱网、碰撞、视点、光）。不依赖 Three.js，Node 里能直接测。
// 坐标：单位米。教堂坐北朝南：正立面（双塔、三座门）在 +Z（南），后殿在 -Z（北）；+X 是东，-X 是西。
// 总长 77.17、最宽 32.85、塔高 58.5、中殿拱顶 28.2 取自资料（见 facts.md）；开间、柱距、各层标高是照片上量比例定的。

export const AX = 5.2;            // 中殿柱轴线到中线的距离（中殿净宽约 10.4，示意）
export const AISLE = 10.2;        // 侧廊与小礼拜堂之间那排墩柱
export const CHAP = 13.8;         // 小礼拜堂外墙内皮
export const TRANS = 16.0;        // 横厅山墙内皮（外皮 16.43，总宽 32.85）
export const Z_FRONT = 38.0;      // 正立面内皮（外皮 38.6）
export const Z_TOWER = 29.7;      // 双塔背面 = 中殿第一道柱线
export const NAVE_BAY = 5.3, NAVE_BAYS = 7;
export const Z_CROSS0 = Z_TOWER - NAVE_BAY * NAVE_BAYS;   // -7.4 十字交叉南缘
export const Z_CROSS1 = Z_CROSS0 - 10.4;                   // -17.8 十字交叉北缘
export const CH_BAY = 5.0, CH_BAYS = 3;
export const Z_APSE = Z_CROSS1 - CH_BAY * CH_BAYS;         // -32.8 后殿多边形的圆心
export const APSE_R = 5.2;
export const TOWER = { cx: 10, half: 4.4, z0: Z_TOWER, z1: 38.6, h: 58.5, belfry: 39, cornice: 25 };
export const H = { vault: 28.2, spring: 20.5, arcadeSpring: 6.6, arcadeApex: 10.2, aisle: 11.2, chapel: 8.6, ridge: 32.3, eave: 25.6 };
export const WALL = 0.45;
export const EYE = 1.62;
export const GROUND = -0.75;      // 院子地面比堂内地面低：门前五级台阶
export const STAIR = 2.6;         // 正门台阶的进深
export const SANCT = { z0: -18.6, z1: -19.8, h: 0.75 };   // 圣所台：z0 到 z1 是三级台阶

export const naveLine = k => Z_TOWER - NAVE_BAY * k;       // k = 0…7
export const chLine = j => Z_CROSS1 - CH_BAY * j;          // j = 0…3
export const naveMid = k => Z_TOWER - NAVE_BAY * (k + 0.5);
export const chMid = j => Z_CROSS1 - CH_BAY * (j + 0.5);
export const SIDE_DOOR_BAY = 2;

// ---- 平面 ----
const sdBox = (x, z, cx, cz, hx, hz) => { const dx = Math.abs(x - cx) - hx, dz = Math.abs(z - cz) - hz; return Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0)); };
// 到教堂外墙的带符号距离：里面为负，外面为正。
export function sdFoot(x, z) {
  const body = sdBox(x, z, 0, (Z_FRONT + Z_APSE) / 2, CHAP, (Z_FRONT - Z_APSE) / 2);
  const trans = sdBox(x, z, 0, (Z_CROSS0 + Z_CROSS1) / 2, TRANS, (Z_CROSS0 - Z_CROSS1) / 2);
  const apse = Math.hypot(x, z - Z_APSE) - APSE_R;
  return Math.min(body, trans, apse);
}
export const inside = (x, z) => sdFoot(x, z) < 0;

// 能走过去的门洞：正面三座门，东西两侧各一扇边门（西侧那扇是按对称摆的示意）
export const DOORS = [
  { id: 'main', cn: '正门', x: 0, z: Z_FRONT, half: 1.55, axis: 'x' },
  { id: 'east-portal', cn: '东侧门', x: TOWER.cx, z: Z_FRONT, half: 1.05, axis: 'x' },
  { id: 'west-portal', cn: '西侧门', x: -TOWER.cx, z: Z_FRONT, half: 1.05, axis: 'x' },
  { id: 'east-side', cn: '东边门', x: CHAP, z: naveMid(SIDE_DOOR_BAY), half: 1.0, axis: 'z' },
  { id: 'west-side', cn: '西边门', x: -CHAP, z: naveMid(SIDE_DOOR_BAY), half: 1.0, axis: 'z' },
];
const inDoor = (x, z) => DOORS.some(d => d.axis === 'x' ? Math.abs(x - d.x) < d.half && Math.abs(z - d.z) < 3.2 : Math.abs(z - d.z) < d.half && Math.abs(x - d.x) < 3.2);

// ---- 柱 ----
// nave：中殿两侧的束柱，左右各 10 根；cross：十字交叉四角的大柱（算在 10 根里）；aisle：侧廊外侧的墩。
export const PIERS = [];
for (const s of [-1, 1]) {
  for (let k = 1; k <= NAVE_BAYS; k++) PIERS.push({ x: s * AX, z: naveLine(k), kind: k === NAVE_BAYS ? 'cross' : 'nave' });
  for (let j = 0; j < CH_BAYS; j++) PIERS.push({ x: s * AX, z: chLine(j), kind: j === 0 ? 'cross' : 'nave' });
}
for (const p of PIERS) p.r = p.kind === 'cross' ? 0.85 : 0.7;

// 实心的东西：塔基的墙、小礼拜堂之间的隔墙、圣所栏杆、祭台
export const SOLIDS = [];
const solid = (x0, x1, z0, z1, tag) => SOLIDS.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: Math.abs(x1 - x0) / 2, hz: Math.abs(z1 - z0) / 2, tag });
for (const s of [-1, 1]) {
  const a = TOWER.cx - TOWER.half, b = TOWER.cx + TOWER.half;       // 5.6 … 14.4
  solid(s * a, s * (a + 1.5), Z_TOWER, Z_TOWER + 2.6, 'tower'); solid(s * a, s * (a + 1.5), Z_FRONT - 2.4, Z_FRONT, 'tower');   // 朝中殿那面墙，中间留拱门
  solid(s * a, s * (TOWER.cx - 1.5), Z_TOWER, Z_TOWER + 1.5, 'tower'); solid(s * (TOWER.cx + 1.5), s * b, Z_TOWER, Z_TOWER + 1.5, 'tower');   // 朝侧廊那面墙
  for (let k = 1; k <= NAVE_BAYS; k++) solid(s * AISLE, s * CHAP, naveLine(k) - 0.4, naveLine(k) + 0.4, 'chapel-wall');
  for (let j = 1; j < CH_BAYS; j++) solid(s * AISLE, s * CHAP, chLine(j) - 0.4, chLine(j) + 0.4, 'chapel-wall');
  for (let k = 1; k <= NAVE_BAYS; k++) if (k !== NAVE_BAYS) SOLIDS.push({ x: s * AISLE, z: naveLine(k), hx: 0.7, hz: 0.7, tag: 'aisle-pier' });
  solid(s * (AX - 0.2), s * (AX + 0.2), Z_APSE, SANCT.z1, 'screen');                                  // 圣所两侧的矮屏
  solid(s * 1.3, s * AX, SANCT.z0 + 0.5, SANCT.z0 + 0.8, 'rail');                                      // 圣所栏杆，中间留口
}
export const ALTAR = { x: 0, z: -23.2, hx: 1.6, hz: 0.6 }, HIGH_ALTAR = { x: 0, z: Z_APSE - 2.6, hx: 2.7, hz: 1.1 };
SOLIDS.push({ ...ALTAR, tag: 'altar' }, { ...HIGH_ALTAR, tag: 'altar' });

// 长椅：中殿中间走道两边
export const PEWS = [];
for (let i = 0; i < 22; i++) { const z = 27.2 - i * 1.5; for (const x of [-2.85, 2.85]) PEWS.push({ x, z, hx: 1.9, hz: 0.3 }); }

// ---- 院子与周边 ----
// 院子的范围、铁栅和大门、两侧的房子都是照航拍摆的大样；尺寸是示意。
export const YARD = { x0: -46, x1: 50, z0: -52, z1: 84, gate: 4.2 };
export const BUILDINGS = [
  { id: 'east-hall', x: 37, z: 18, hx: 5.5, hz: 20, h: 7.5, roof: 'tile', color: '#d9d4c6' },      // 东侧长条的两层房子
  { id: 'se-house', x: 37, z: 60, hx: 8, hz: 9, h: 11, roof: 'dome', color: '#e9dfb0' },           // 东南角带小穹顶的黄房子
  { id: 'sw-house', x: -33, z: 58, hx: 9, hz: 11, h: 11, roof: 'dome', color: '#e9dfb0' },         // 西南角带小穹顶的黄房子
  { id: 'ne-house', x: 39, z: -34, hx: 7, hz: 9, h: 10, roof: 'tile', color: '#dcd6c8' },
];
export const FOUNTAIN = { x: 30, z: -12, r: 3.2 };
export const BUTTRESS = [];      // 飞扶壁落地的墩：东西两侧，每道柱线一个
for (const s of [-1, 1]) { for (let k = 1; k < NAVE_BAYS; k++) BUTTRESS.push({ x: s * (CHAP + 1.3), z: naveLine(k), hx: 0.95, hz: 0.55 }); for (let j = 1; j <= CH_BAYS; j++) BUTTRESS.push({ x: s * (CHAP + 1.3), z: chLine(j), hx: 0.95, hz: 0.55 }); }

export function groundY(x, z) {
  if (inside(x, z)) {
    if (Math.abs(x) > AX || z > SANCT.z0) return 0;
    if (z > SANCT.z1) return SANCT.h * (SANCT.z0 - z) / (SANCT.z0 - SANCT.z1);
    return SANCT.h;
  }
  const clamp01 = t => Math.max(0, Math.min(1, t));
  if (Math.abs(x) < 15.7 && z > Z_FRONT - 0.2 && z < 39 + STAIR) return GROUND * clamp01((z - 38.9) / (STAIR - 0.2)) + 0;          // 正门台阶
  const dz = Math.abs(z - naveMid(SIDE_DOOR_BAY)), ax = Math.abs(x);
  if (dz < 1.8 && ax < CHAP + 2.2) return GROUND * clamp01((ax - CHAP - 0.8) / 1.2) + 0;                                         // 边门台阶
  return GROUND;
}

const inBox = (x, z, b, pad) => Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad;
// 这个点人能不能站
export function blocked(x, z) {
  const sd = sdFoot(x, z);
  if (Math.abs(sd) < WALL && !inDoor(x, z)) return 'wall';
  if (sd < 0) {
    for (const c of PIERS) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.3) return 'pier';
    for (const p of PEWS) if (inBox(x, z, p, 0.22)) return 'pew';
    for (const p of SOLIDS) if (inBox(x, z, p, 0.28)) return p.tag;
    return null;
  }
  for (const b of BUTTRESS) if (inBox(x, z, b, 0.3)) return 'buttress';
  for (const b of BUILDINGS) if (inBox(x, z, b, 0.4)) return 'building';
  if (Math.hypot(x - FOUNTAIN.x, z - FOUNTAIN.z) < FOUNTAIN.r + 0.3) return 'fountain';
  if (Math.abs(z - YARD.z1) < 0.45 && Math.abs(x) > YARD.gate) return 'fence';
  if (x < YARD.x0 || x > YARD.x1 || z < YARD.z0 || z > YARD.z1 + 13) return 'edge';
  return null;
}
// 走一步：先整步，不行就分轴滑着走，再不行原地不动。
export function moveWalker(x, z, dx, dz) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  for (let i = 0; i < n; i++) {
    const sx = dx / n, sz = dz / n;
    if (!blocked(x + sx, z + sz)) { x += sx; z += sz; }
    else if (!blocked(x + sx, z)) x += sx;
    else if (!blocked(x, z + sz)) z += sz;
    else break;
  }
  return { x, z };
}

// ---- 光 ----
// 教堂朝南：上午太阳在东，东侧的窗亮，色光往西铺；傍晚反过来；正午太阳在南，正面的玫瑰窗最亮。
// east / west / south 是三个方向的彩窗各有多亮（0…1）。
export const LIGHTS = {
  morning: { cn: '上午', tod: 0, east: 1.0, west: 0.12, south: 0.3 },
  noon: { cn: '正午', tod: 0.5, east: 0.3, west: 0.3, south: 1.0 },
  evening: { cn: '傍晚', tod: 1, east: 0.12, west: 1.0, south: 0.25 },
};
// 窗洞尺寸：着色器、玻璃面片、墙上的洞共用同一组数
export const WIN = {
  clere: { sill: 14.4, h: 6.6, w: 0.62, off: 0.78, ocY: 23.5, ocR: 0.55 },     // 高侧窗：两扇尖窗加一个四叶圆窗
  chapel: { sill: 2.9, h: 3.3, w: 0.5, off: 0.64, ocY: 7.75, ocR: 0.42 },      // 小礼拜堂的窗
  rose: { y: 19, r: 3.5 },                                                      // 正面玫瑰窗（直径约 7 米）
  transRose: { y: 12.6, r: 3.3 },                                               // 横厅两端的玫瑰窗
  apse: { sill: 7.2, h: 11.5, w: 0.55, off: 0.68 },
};

// ---- 视点 ----
const V = (id, cn, en, zone, pos, look, mode, text, light) => ({ id, cn, en, zone, pos, look, mode, text, light });
export const VIEWS = [
  V('whole', '教堂全景', 'Whole cathedral', 'out', [62, 46, 96], [0, 22, 6], 'orbit', '坐北朝南，平面是一个拉丁十字：南北长 77 米多，最宽处近 33 米。墙、柱、塔全用花岗岩砌成，所以广州人叫它「石室」。1863 年奠基，1888 年落成。'),
  V('facade', '正立面', 'South façade', 'out', [0, 8, 96], [0, 28.5, 38], 'orbit', '立面分三层：底层三座往里收的尖券门，中层正中一个直径约 7 米的玫瑰窗，上层是一对八角尖塔，从地面到塔尖 58.5 米。西塔（左）装钟面，东塔（右）是钟楼。'),
  V('portals', '三座门', 'Three portals', 'out', [5, 4.2, 58], [0, 8.5, 38], 'orbit', '门洞一层一层往里退，每层一道券，券上盖一个尖山花，山花里是石刻的花格。中门最高，两边的门开在塔的底层。'),
  V('rose', '玫瑰窗与山花', 'Rose window', 'out', [-4, 22, 62], [0, 23, 38], 'orbit', '玫瑰窗的石花格从中心往外放射，外圈一环小圆。窗上面是一排小券托着的檐口，再上面是中殿屋顶的山花，顶上立着石十字架。'),
  V('towers', '双塔', 'Twin spires', 'out', [20, 49, 60], [-2, 44, 34], 'orbit', '塔身方形，到钟室这一层四面各开一对装着红色百叶的长窗，四角立小尖塔；再往上收成八角的石尖顶，八条棱上排着卷叶石钮，顶上是铁十字架。'),
  V('east', '东侧面', 'East flank', 'out', [58, 24, 6], [8, 15, 4], 'orbit', '中殿的高墙开大窗，墙身吃不住拱顶往外推的力，就靠一道道飞扶壁凌空撑到外侧的石墩上。下面一排带小山墙的，是侧廊外面的小礼拜堂。'),
  V('buttress', '飞扶壁', 'Flying buttresses', 'out', [24, EYE + GROUND, 9], [9, 19, 2], 'walk', '站在东侧院子里抬头看：石墩顶上压一个小尖塔，斜着的石拱从墩顶飞到高墙上。小尖塔不只是装饰，它的重量把石墩压稳。'),
  V('apse', '后殿', 'Apse', 'out', [-34, 30, -66], [0, 16, -30], 'orbit', '北端是多边形的后殿，每个转角一道扶壁，面与面之间是又高又窄的尖窗，祭坛就在这几扇窗下面。'),
  V('plaza', '堂前广场', 'Forecourt', 'out', [0, EYE + GROUND, 79], [0, 24, 38], 'walk', '从一德路的大门进来，花岗岩铺的广场正对着三座门。往前走，中门可以直接走进中殿。'),
  V('nave', '中殿', 'Nave', 'in', [0, EYE, 35], [0, 12, -20], 'walk', '中殿拱顶高 28.2 米，两排束柱把大厅分成中间的中殿和两边的侧廊。往北一直看过去，尽头是圣所和后殿的彩窗。'),
  V('piers', '束柱', 'Clustered piers', 'in', [0, EYE, 21], [5.2, 13, 12.5], 'walk', '每根大柱都是一束细柱抱在一起，全是花岗岩。细柱一直升到拱顶起脚的地方，接住肋拱；柱头刻着卷叶。'),
  V('vault', '肋拱顶', 'Rib vaults', 'in', [0, 8, 14], [0, 28, 4], 'fly', '每个开间一个四分肋拱：两条对角的石肋在最高处交叉，肋之间是用红砖砌的拱面，所以抬头看是灰白的骨架衬着砖红色。'),
  V('crossing', '十字交叉', 'Crossing', 'in', [4.2, EYE, -11.2], [-16, 10.5, -12.8], 'walk', '中殿和横厅在这里相交，四根最粗的束柱撑着正中的拱。往东西两头看，横厅的尽端各有一个玫瑰窗。'),
  V('altar', '圣所与祭台', 'Sanctuary', 'in', [0, EYE, -9.5], [0, 7, -34], 'walk', '上三级台阶是圣所，前面是祭台，后面靠着后殿的是带小尖塔的白色主祭台。再上面是后殿的五扇长窗。'),
  V('east-glass', '上午的彩窗', 'Morning glass', 'in', [7.4, EYE, 18.6], [-5.2, 3, 8], 'walk', '上午太阳在东，东侧高窗和小礼拜堂的窗最亮，红、蓝、黄的光斑落在西边的柱子和地面上。现在的彩窗是 2004 到 2006 年大修时重做的，画的是圣经故事和圣人像；这里的图案只是示意。', 'morning'),
  V('west-glass', '傍晚的彩窗', 'Evening glass', 'in', [-7.4, EYE, 18.6], [5.2, 3, 8], 'walk', '傍晚太阳转到西边，换成西侧的窗亮，色光往东铺。十九世纪从法国运来的原窗在战争和动荡年代里几乎全部损毁，如今看到的不是原物。', 'evening'),
  V('rose-in', '回望玫瑰窗', 'Rose from inside', 'in', [0, EYE, 2], [0, 17, 38], 'walk', '走到中殿中段回头看，南墙高处就是正面那个玫瑰窗。正午太阳在南，它最亮，会在中殿地面上投下一团圆形的色光。', 'noon'),
  V('chapel', '侧廊与小礼拜堂', 'Aisle and chapels', 'in', [-6.6, EYE, 23.4], [-13.8, 4.6, 21.2], 'walk', '侧廊比中殿矮得多，外侧一格一格的是小礼拜堂，各有一扇双尖窗。飞扶壁就架在这些隔墙的上方。'),
];

// 点一个视点之后，操作方式和光该变成什么。纯函数，方便测。
export function applyView(state, id) {
  const v = VIEWS.find(q => q.id === id);
  if (!v) return state;
  return { ...state, view: id, mode: v.mode, zone: v.zone, light: v.light || state.light };
}
// 手动切操作方式：在里面切「环绕」会被带到外面全景。
export function applyMode(state, mode) {
  if (!['orbit', 'walk', 'fly'].includes(mode)) return state;
  return { ...state, mode, zone: mode === 'orbit' ? 'out' : state.zone, view: mode === 'orbit' && state.zone === 'in' ? 'whole' : state.view };
}
