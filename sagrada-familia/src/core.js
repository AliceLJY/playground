// 圣家堂：纯逻辑部分（平面、塔表、柱网、碰撞、视点）。不依赖 Three.js，Node 里能直接测。
// 坐标：单位米。中殿轴线沿 Z：荣耀立面（主入口）在 +Z，后殿在 -Z；诞生立面在 +X，受难立面在 -X。

export const NAVE_HALF = 22.5;      // 五廊总宽 45
export const TRANS_HALF = 30;       // 横厅总长 60
export const Z_GLORY = 45;          // 荣耀立面内墙
export const Z_NAVE_END = 3;        // 中殿与横厅交界
export const Z_TRANS_END = -27;     // 横厅与后殿交界
export const APSE = { x: 0, z: -27, r: 18 };
export const CROSS = { x: 0, z: -12 };
export const H = { nave: 45, aisle: 30, crossing: 60, apse: 75 };
export const WALL = 0.7;            // 墙厚的一半，走路时贴不进去的距离
export const EYE = 1.65;
export const PRESBYTERY = { z0: -17.5, z1: -20.5, h: 1.6 };   // 圣坛台：z 从 z0 到 z1 是坡，往后是台面

// ---- 十八座塔 ----
// h 是塔顶（含顶饰）离地高度；y0 是塔身从哪里开始露出；r0 是底部半径。
// 耶稣塔 172.5、圣母塔 138、四福音塔 135 有两处来源；十二使徒塔只查到「98.5–120」的范围，逐座高度是示意。
const bell = (id, cn, x, z, h, face) => ({ id, cn, kind: 'apostle', x, z, h, y0: 0, r0: 3.9, face });
export const TOWERS = [
  { id: 'jesus', cn: '耶稣塔', kind: 'jesus', x: CROSS.x, z: CROSS.z, h: 172.5, y0: 58, r0: 11.5 },
  { id: 'mary', cn: '圣母塔', kind: 'mary', x: 0, z: -31, h: 138, y0: 50, r0: 8 },
  { id: 'matthew', cn: '马太塔', kind: 'evangelist', x: 11.5, z: -0.5, h: 135, y0: 44, r0: 5.6 },
  { id: 'mark', cn: '马可塔', kind: 'evangelist', x: -11.5, z: -0.5, h: 135, y0: 44, r0: 5.6 },
  { id: 'luke', cn: '路加塔', kind: 'evangelist', x: 11.5, z: -23.5, h: 135, y0: 44, r0: 5.6 },
  { id: 'john', cn: '约翰塔', kind: 'evangelist', x: -11.5, z: -23.5, h: 135, y0: 44, r0: 5.6 },
  bell('n1', '诞生·巴拿巴塔', 33, -28, 98.5, 'nativity'), bell('n2', '诞生·西门塔', 33, -19, 107, 'nativity'),
  bell('n3', '诞生·达陡塔', 33, -5, 107, 'nativity'), bell('n4', '诞生·玛弟亚塔', 33, 4, 98.5, 'nativity'),
  bell('p1', '受难·雅各伯塔', -33, -28, 108, 'passion'), bell('p2', '受难·巴多罗买塔', -33, -19, 112, 'passion'),
  bell('p3', '受难·多默塔', -33, -5, 112, 'passion'), bell('p4', '受难·斐理伯塔', -33, 4, 108, 'passion'),
  bell('g1', '荣耀·安德肋塔', -17, 48, 112, 'glory'), bell('g2', '荣耀·伯多禄塔', -7.6, 48, 120, 'glory'),
  bell('g3', '荣耀·保禄塔', 7.6, 48, 120, 'glory'), bell('g4', '荣耀·大雅各伯塔', 17, 48, 112, 'glory'),
];

// ---- 平面 ----
const sdBox = (x, z, cx, cz, hx, hz) => { const dx = Math.abs(x - cx) - hx, dz = Math.abs(z - cz) - hz; return Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0)); };
// 到教堂外墙的带符号距离：里面为负，外面为正。
export function sdFoot(x, z) {
  const nave = sdBox(x, z, 0, (Z_GLORY + Z_NAVE_END) / 2 - 6, NAVE_HALF, (Z_GLORY - Z_NAVE_END) / 2 + 6);   // 往横厅里多伸 12 米，免得交界处被当成墙
  const trans = sdBox(x, z, 0, (Z_NAVE_END + Z_TRANS_END) / 2, TRANS_HALF, (Z_NAVE_END - Z_TRANS_END) / 2);
  const apse = Math.hypot(x - APSE.x, z - APSE.z) - APSE.r;
  return Math.min(nave, trans, apse);
}
export const inside = (x, z) => sdFoot(x, z) < 0;

// 三处能走过去的门洞
export const DOORS = [
  { id: 'glory', cn: '荣耀门', x: 0, z: Z_GLORY, half: 2.9, axis: 'x' },
  { id: 'nativity', cn: '诞生门', x: TRANS_HALF, z: CROSS.z, half: 2.4, axis: 'z' },
  { id: 'passion', cn: '受难门', x: -TRANS_HALF, z: CROSS.z, half: 2.4, axis: 'z' },
];
// 荣耀门廊前的八根大柱（示意），走路要绕开
export const GLORY_COLS = Array.from({ length: 8 }, (_, k) => ({ x: (k - 3.5) * 5.9, z: Z_GLORY + 14.4, r: 1.15 }));
const inDoor = (x, z) => DOORS.some(d => d.axis === 'x' ? Math.abs(x - d.x) < d.half && Math.abs(z - d.z) < 6 : Math.abs(z - d.z) < d.half && Math.abs(x - d.x) < 9);

// ---- 柱网（7.5 米网格）----
// kind: crossing 四根斑岩柱最粗；nave 中殿内排；aisle 侧廊外排；apse 后殿马蹄形一圈。
export const COLUMNS = [];
for (const z of [39, 31.5, 24, 16.5, 9]) for (const x of [-15, -7.5, 7.5, 15]) COLUMNS.push({ x, z, kind: Math.abs(x) < 10 ? 'nave' : 'aisle' });
for (const z of [-4.5, -19.5]) {
  for (const x of [-7.5, 7.5]) COLUMNS.push({ x, z, kind: 'crossing' });
  for (const x of [-22.5, -15, 15, 22.5]) COLUMNS.push({ x, z, kind: 'aisle' });
}
for (const x of [-15, 15]) COLUMNS.push({ x, z: 1.5, kind: 'nave' });
for (let i = 0; i < 7; i++) { const a = Math.PI * (0.08 + 0.84 * i / 6); COLUMNS.push({ x: APSE.x + Math.cos(a) * 10.5, z: APSE.z - Math.sin(a) * 10.5, kind: 'apse' }); }
const COL_SPEC = { crossing: { r: 1.05, knot: 22, top: H.crossing }, nave: { r: 0.85, knot: 18, top: H.nave }, aisle: { r: 0.65, knot: 13, top: H.aisle }, apse: { r: 0.6, knot: 20, top: H.nave + 6 } };
for (const c of COLUMNS) Object.assign(c, COL_SPEC[c.kind]);

// 长椅：中殿中廊左右两列
export const PEWS = [];
for (let i = 0; i < 16; i++) { const z = 37 - i * 2.1; for (const x of [-3.6, 3.6]) PEWS.push({ x, z, hx: 2.5, hz: 0.42 }); }
// 祭台（实心）与管风琴
export const SOLIDS = [{ x: 0, z: -22.5, hx: 1.9, hz: 1.1 }, { x: 0, z: -37.5, hx: 6.5, hz: 1.6 }];

// ---- 周围的扩展区街块（切角方格）----
export const PITCH = 133, BLOCK = 113, CHAMFER = 16;
export const BLOCKS = [];
for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
  if (i === 0 && j === 0) continue;                 // 教堂自己占一格
  const park = j === 0 && Math.abs(i) === 1;         // 两侧小公园：+X 高迪广场（有水池），-X 圣家堂广场
  BLOCKS.push({ i, j, x: i * PITCH, z: j * PITCH, park });
}
const inChamferBox = (x, z, cx, cz, half, ch) => { const dx = Math.abs(x - cx), dz = Math.abs(z - cz); return dx < half && dz < half && dx + dz < 2 * half - ch; };

export function groundY(x, z) {
  if (!inside(x, z)) return 0;
  if (z > PRESBYTERY.z0) return 0;
  if (z > PRESBYTERY.z1) return PRESBYTERY.h * (PRESBYTERY.z0 - z) / (PRESBYTERY.z0 - PRESBYTERY.z1);
  return PRESBYTERY.h;
}

// 这个点人能不能站
export function blocked(x, z) {
  const sd = sdFoot(x, z);
  if (Math.abs(sd) < WALL && !inDoor(x, z)) return 'wall';
  if (sd < 0) {
    for (const c of COLUMNS) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.35) return 'column';
    for (const p of PEWS) if (Math.abs(x - p.x) < p.hx + 0.25 && Math.abs(z - p.z) < p.hz + 0.25) return 'pew';
    for (const p of SOLIDS) if (Math.abs(x - p.x) < p.hx + 0.3 && Math.abs(z - p.z) < p.hz + 0.3) return 'solid';
    return null;
  }
  for (const c of GLORY_COLS) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.35) return 'porch';
  for (const t of TOWERS) if (t.y0 === 0 && Math.hypot(x - t.x, z - t.z) < t.r0 + 0.4) return 'tower';
  for (const b of BLOCKS) if (!b.park && inChamferBox(x, z, b.x, b.z, BLOCK / 2, CHAMFER)) return 'block';
  if (Math.abs(x) > 3.4 * PITCH || Math.abs(z) > 3.4 * PITCH) return 'edge';
  return null;
}
// 走一步：先整步，不行就分轴滑着走，再不行原地不动。
export function moveWalker(x, z, dx, dz) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.3));
  for (let i = 0; i < n; i++) {
    const sx = dx / n, sz = dz / n;
    if (!blocked(x + sx, z + sz)) { x += sx; z += sz; }
    else if (!blocked(x + sx, z)) x += sx;
    else if (!blocked(x, z + sz)) z += sz;
    else break;
  }
  return { x, z };
}

// ---- 彩窗与光 ----
// 诞生一侧（+X，朝日出）冷色：蓝、绿；受难一侧（-X，朝日落）暖色：红、橙、黄。
export const LIGHTS = {
  morning: { cn: '早晨光', tod: 0, cool: 1.0, warm: 0.16 },
  noon: { cn: '正午光', tod: 0.5, cool: 0.42, warm: 0.42 },
  evening: { cn: '傍晚光', tod: 1, cool: 0.14, warm: 1.0 },
};
// 侧窗在墙上的位置：每个开间两层。给着色器和光柱共用。
export const BAY = 7, BAY_Z0 = 3, BAYS = 6;
export const WINDOW_TIERS = [{ y: 4.5, h: 10.5, w: 1.25, n: 2 }, { y: 19.5, h: 6.5, w: 1.05, n: 2 }];

// ---- 视点 ----
// zone: out / in；mode 是飞到之后落在哪种操作方式里；light 表示顺带切到哪档光。
const V = (id, cn, en, zone, pos, look, mode, text, light) => ({ id, cn, en, zone, pos, look, mode, text, light });
export const VIEWS = [
  V('whole', '教堂全景', 'Whole basilica', 'out', [150, 118, 178], [0, 52, -6], 'orbit', '拉丁十字平面，长约 90 米、横厅宽 60 米，十八座塔。这里搭出来的是高迪设计完成后的样子：荣耀立面的四座塔现实中还没建起来。'),
  V('nativity', '诞生立面', 'Nativity façade', 'out', [112, 30, -4], [30, 32, -12], 'orbit', '朝东北，迎着日出。高迪在世时亲自督造的一面，石头像融化的蜡一样堆满了植物和人物，三个门洞分别是望德、爱德、信德。'),
  V('nativity-detail', '诞生门雕刻', 'Nativity sculpture', 'out', [60, 15, -8], [33, 21, -12], 'orbit', '中门上方是一棵绿色的柏树，树上停着白鸽，象征永生。细部在这里只是示意的起伏，不是雕像复原。'),
  V('passion', '受难立面', 'Passion façade', 'out', [-124, 30, -22], [-30, 34, -12], 'orbit', '朝西南，对着日落。和诞生立面相反，它故意做得又冷又硬：六根像骨头一样斜撑的柱子，上面一排十八根小骨柱。'),
  V('passion-detail', '受难门雕刻', 'Passion sculpture', 'out', [-66, 11, -4], [-33, 15, -12], 'orbit', '苏比拉克斯的雕塑线条像刀切的。门廊正中高处是十字架。'),
  V('glory', '荣耀立面', 'Glory façade', 'out', [42, 62, 158], [0, 44, 45], 'orbit', '朝南，是将来的正门，也是三面里最大的一面。现实中还在施工，这里按设计意向示意：七扇门、一排锥形灯笼顶。'),
  V('towers', '塔群', 'Towers', 'out', [92, 150, 96], [0, 118, -10], 'orbit', '中央耶稣塔 172.5 米，后面的圣母塔 138 米，四座福音塔 135 米，三个立面各四座使徒钟塔。'),
  V('cross', '耶稣塔十字', 'Cross of Jesus', 'out', [30, 170, 30], [0, 160, -12], 'orbit', '塔顶是一座 17 米高的四臂十字架，2026 年 2 月装上之后教堂到了最终高度。'),
  V('pinnacles', '使徒塔尖', 'Apostle pinnacles', 'out', [56, 112, 6], [33, 100, -10], 'orbit', '使徒塔的尖顶贴着威尼斯彩色马赛克，红、黄、白几种颜色，远看像主教的权杖和戒指。'),
  V('apse', '后殿', 'Apse', 'out', [-58, 42, -112], [0, 40, -34], 'orbit', '最早建起来的部分，半圆形排着七间小礼拜堂，上面是带星的圣母塔。'),
  V('nave', '中殿', 'Nave', 'in', [0, EYE, 41], [0, 16, -10], 'walk', '五条廊，总宽 45 米。中廊拱顶高 45 米，侧廊 30 米。高迪想让人走进来像走进一片树林。'),
  V('columns', '树形柱', 'Branching columns', 'in', [-11, EYE, 20], [-6, 26, 6], 'walk', '每根柱子往上到「节」的地方分叉成几根枝，再分成更细的枝托住拱顶，所以外面不需要飞扶壁。'),
  V('vault', '拱顶', 'Vaults', 'in', [0, 9, 22], [0, 45, 10], 'fly', '拱顶是一个个双曲面，每个中间留一个圆形采光口，白天光从上面漏下来。'),
  V('crossing', '十字交叉', 'Crossing', 'in', [0, EYE, 4], [0, 34, -13], 'walk', '中殿与横厅相交的地方。四根最粗的红色斑岩柱托着 60 米高的拱顶，正上方就是耶稣塔。'),
  V('altar', '祭坛与华盖', 'Altar', 'in', [0, EYE, -3], [0, 9, -24], 'walk', '祭台上方悬着一顶七边形的华盖，边上挂着一圈灯，下面是十字架。后面是管风琴。'),
  V('morning-glass', '晨光彩窗', 'Morning glass', 'in', [-10, EYE, 26], [22, 13, 20], 'walk', '诞生一侧的彩窗是蓝和绿。早晨太阳从这边进来，冷色的光铺在地上和柱子上。', 'morning'),
  V('evening-glass', '暮光彩窗', 'Evening glass', 'in', [10, EYE, 26], [-22, 13, 20], 'walk', '受难一侧的彩窗是红、橙、黄。傍晚太阳转到这边，整个中殿像被点着了。', 'evening'),
];

// 点一个视点之后，操作方式和光该变成什么。纯函数，方便测。
export function applyView(state, id) {
  const v = VIEWS.find(q => q.id === id);
  if (!v) return state;
  return { ...state, view: id, mode: v.mode, zone: v.zone, light: v.light || state.light };
}
// 手动切操作方式：在里面切「环绕」会被带到外面全景；在外面切「步行」落在荣耀门前。
export function applyMode(state, mode) {
  if (!['orbit', 'walk', 'fly'].includes(mode)) return state;
  return { ...state, mode, zone: mode === 'orbit' ? 'out' : state.zone, view: mode === 'orbit' && state.zone === 'in' ? 'whole' : state.view };
}
