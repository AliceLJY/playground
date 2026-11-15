// Mac mini 拆解台 · 模型。只有纯函数：给拆解进度 s（0–22），算出每个零件的位姿、五个计数、侧视线稿。
// 三维几何（machine.js）、读数卡、线稿、测试都读这一份。单位 mm；坐标是「翻过来放」的机身：
// y 朝上（原来的底面朝天），+z 是机身正面（耳机孔那一侧），原点在桌面上机身中心。
// 数字出处见 SPEC.md：外形按 Apple 官方规格，步骤、螺丝、接头按 iFixit 180199，内存按 iFixit 178986；
// 内部零件的尺寸与位置是示意（按步骤描述的相对位置摆放）。

// ---------------- 机身（Apple 官方规格） ----------------
export const SPEC = { width: 127, depth: 127, height: 50, weightKg: 0.67 };
const HALF = SPEC.width / 2, WALL = 2.6, IN = HALF - WALL; // 内壁半宽 60.9（壁厚示意）
const TOPSKIN = 2.5; // 原来的顶面，翻过来后贴着桌面（示意）

// ---------------- 步骤：21 个 iFixit 步骤；第 18 步后插一拍「顺带看内存」，最后加 SSD 特写和「换上第三方小板」两拍 ----------------
// ifixit 为 null 的是插进来的一拍，不计步数。
export const STAGES = [
  // op：步骤栏小字，只写 iFixit 原文的操作要点（工具 · 动作）；大字旁白另写，不重复
  { ifixit: 1, op: '关机、拔掉所有线 · 翻过来放平', short: '翻面' },
  { ifixit: 2, op: 'Jimmy 撬片 · 在底盖和机身之间撬出一道缝', short: '撬缝' },
  { ifixit: 3, op: '开启片插进缝里 · 抽出 Jimmy', short: '插开启片' },
  { ifixit: 4, op: '开启片沿边滑，卡到销钉一拧 · 销钉 1/4', short: '销钉 1' },
  { ifixit: 5, op: '沿一圈撬起其余 3 个销钉 · 电源键附近只插 1 英寸', short: '销钉 2–4' },
  { ifixit: 6, op: '从电源键对边掀起底盖 · 翻过去撑住', short: '掀开底盖' },
  { ifixit: 7, op: '捏住排线头拔开 · 可不拔', short: '电源键排线' },
  { ifixit: 8, op: '取下底盖', short: '取下底盖' },
  { ifixit: 9, op: 'T5 · 拧下 8 颗 3.4 mm 螺丝', short: '内板螺丝' },
  { ifixit: 10, op: '撬棒插进卡扣槽 · 撬起耳机孔那一侧', short: '撬起内板' },
  { ifixit: 11, op: '从散热片边沿下抽出内板', short: '抽出内板' },
  { ifixit: 12, op: '翻过机身边缘靠住 · 还连着一根线', short: '内板靠边' },
  { ifixit: 13, op: '3IP ×2（2.4 mm）· 5IP ×2（7.9 mm）', short: '风扇螺丝' },
  { ifixit: 14, op: '抬出风扇翻面 · 搁在机身和散热片上', short: '翻起风扇' },
  { ifixit: 15, op: '镊子 · 揭开 ZIF 接头上的胶带', short: '揭胶带' },
  { ifixit: 16, op: '撬棒尖 · 翻起 ZIF 锁扣', short: '翻锁扣' },
  { ifixit: 17, op: '镊子 · 把排线笔直抽出插座', short: '抽排线' },
  { ifixit: 18, op: '取下风扇', short: '取下风扇' },
  { ifixit: null, kind: 'look', op: '', short: '顺带看内存' },
  { ifixit: 19, op: '8IP · 拧下 1 颗 4.1 mm 螺丝', short: 'SSD 螺丝' },
  { ifixit: 20, op: '撬棒插进边上的孔 · 左右交替拔离插槽', short: '拔开 SSD' },
  { ifixit: 21, op: '捏住一角 · 斜着靠向耳机孔取出', short: '取出 SSD' },
  { ifixit: null, kind: 'closeup', op: '', short: '看清这块硬盘' },
  // 装回去按第 21 步原文的 During reassembly：斜着插、轻晃到位、压平，再拧回 8IP
  { ifixit: null, kind: 'swap', op: '斜着插进插槽 · 轻晃到位、压平 · 拧回 8IP', short: '换上第三方小板' },
];
export const S_MAX = STAGES.length; // 24
export const LOOK = STAGES.findIndex((x) => x.kind === 'look'); // 18
export const CLOSEUP = STAGES.findIndex((x) => x.kind === 'closeup'); // 22
export const SWAP = STAGES.findIndex((x) => x.kind === 'swap'); // 23
export const SSD_OUT = CLOSEUP; // 第 21 步做完时的进度
export const IFIXIT_STEPS = STAGES.filter((x) => x.ifixit).length; // 21

// ---------------- 螺丝、接头、销钉（iFixit 180199） ----------------
// stage 是 STAGES 的下标；同一阶段的螺丝按顺序在 [a, b] 里一颗颗拧出（局部进度 0–1）。
const INNER_Y = 40.3, INNER_T = 1.4; // 内板（示意）
const screwRow = (stage, bit, len, pts, y, a = 0.08, b = 0.92) => pts.map(([x, z], j) => {
  const n = pts.length, span = (b - a) / n;
  return { stage, bit, len, x, z, y, a: a + j * span, b: a + (j + 1) * span * 0.98 + 0 };
});
export const SCREWS = [
  // 第 9 步：内板 T5 ×8，沿四周（位置示意）
  ...screwRow(8, 'T5', 3.4, [[-54, -54], [0, -55], [54, -54], [55, 0], [54, 54], [0, 55], [-54, 54], [-55, 0]], INNER_Y + INNER_T),
  // 第 13 步：风扇 3IP ×2（2.4 mm）、5IP ×2（7.9 mm）
  ...screwRow(12, '3IP', 2.4, [[-4, 50], [48, 4]], 38.6, 0.08, 0.48),
  ...screwRow(12, '5IP', 7.9, [[-4, 4], [48, 50]], 38.6, 0.52, 0.92),
  // 第 19 步：SSD 8IP ×1（4.1 mm），压在 SSD 远端正中的半圆缺口里
  ...screwRow(19, '8IP', 4.1, [[-42, 49.6]], 16.4, 0.15, 0.85),
].map((s, i) => ({ ...s, id: 'screw' + i }));
export const BITS = ['T5', '3IP', '5IP', '8IP'];
export const CONNECTORS = [
  { id: 'power', name: '电源键排线', stage: 6, at: 0.6, optional: true },
  { id: 'zif', name: '风扇 ZIF 接头', stage: 16, at: 0.7 },
  { id: 'ssd', name: 'SSD 插槽', stage: 20, at: 0.8 },
];
export const PINS = [[0.35, 3], [0.25, 4], [0.55, 4], [0.85, 4]].map(([at, stage], i) => ({ stage, at, corner: [[1, 1], [1, -1], [-1, -1], [-1, 1]][i] }));
export const RAM_FOUND_AT = LOOK + 0.3;

// ---------------- 小工具 ----------------
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const ease = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
export const local = (s, stage) => clamp(s - stage);
const seg = (u, a, b) => ease((u - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const D = Math.PI / 180;

// 3×3 旋转（行主序）
export function rotX(t) { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; }
export function rotY(t) { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
export function rotZ(t) { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
export function mul(a, b) { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; }
export function apply(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const euler = ([x, y, z]) => mul(rotZ(z), mul(rotY(y), rotX(x)));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** 绕 pivot 转 R 之后，原来中心 c0 落到哪 */
const aboutPivot = (R, pivot, c0) => add(pivot, apply(R, sub(c0, pivot)));

// ---------------- 零件（盒子是碰撞与线稿用的外形；三维几何在 machine.js 里按同一中心搭） ----------------
// box: [cx, cy, cz, sx, sy, sz]（静止时，在翻面后的机身坐标里）
const box = (x0, x1, y0, y1, z0, z1) => [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0];
export const PARTS = {
  // 机身：贴桌的顶皮 + 四面壁（铝，一体；碰撞拆成五块）
  skin: { name: '机身', box: box(-HALF, HALF, 0, TOPSKIN, -HALF, HALF), group: 'chassis' },
  wallN: { name: '机身', box: box(-HALF, HALF, TOPSKIN, SPEC.height, -HALF, -IN), group: 'chassis' },
  wallS: { name: '机身', box: box(-HALF, HALF, TOPSKIN, SPEC.height, IN, HALF), group: 'chassis' },
  wallW: { name: '机身', box: box(-HALF, -IN, TOPSKIN, SPEC.height, -IN, IN), group: 'chassis' },
  wallE: { name: '机身', box: box(IN, HALF, TOPSKIN, SPEC.height, -IN, IN), group: 'chassis' },
  psu: { name: '电源（示意）', box: box(-54, 54, TOPSKIN, 12.6, -54, 54) },
  board: { name: '主板', box: box(-IN + 0.4, IN - 0.4, 12.6, 14.2, -IN + 0.4, IN - 0.4) },
  m4: { name: 'M4 芯片', box: box(-3, 19, 14.2, 16.2, -42, -20) },
  ramA: { name: 'LPDDR5 内存颗粒', box: box(-1, 17, 14.2, 15.4, -53, -44) },
  ramB: { name: 'LPDDR5 内存颗粒', box: box(-1, 17, 14.2, 15.4, -18, -9) },
  heatsink: { name: '散热片', box: box(-48, 48, 16.2, 38, -58, -6) },
  // SSD 模块：竖长板，宽 : 长 = 1 : 1.5（形状按第三方 2TB 小板商品图与 iFixit「看着像 M.2」；尺寸示意），金手指在插槽那条短边
  socket: { name: 'SSD 插槽', box: box(-57, -27, 14.2, 16.8, 3, 9.6) },
  ssd: { name: 'SSD 闪存模块', box: box(-56, -28, 14.2, 15.6, 8, 50) },
  ssd2: { name: '第三方 2TB 小板', box: box(-56, -28, 14.2, 15.6, 8, 50) },
  jack: { name: '耳机孔', box: box(-24, -11, 14.2, 24, 50, IN - 0.2) },
  zif: { name: '风扇 ZIF 插座', box: box(-6, 2, 14.2, 15.6, -3, 3) },
  fan: { name: '风扇', box: box(-8, 54, 18, 37.6, -2, 56) },
  inner: { name: '内板', box: box(-IN + 0.4, IN - 0.4, INNER_Y, INNER_Y + INNER_T, -IN + 0.4, IN - 0.4) },
  cover: { name: '底盖', box: box(-IN + 0.4, IN - 0.4, 47.2, 49.6, -IN + 0.4, IN - 0.4) },
};
export const POWER_BUTTON = [45, -45]; // 电源键在底盖一角（示意）

// 摆在一旁的螺丝盘（四格，按刀头分），放在机身右边；竖屏格子小一点、离机身近一点，好让整台机器加盘子塞进窄画面
export const TRAY = {
  wide: { c: [134, 0, -6], cell: 22 },
  tall: { c: [116, 0, 6], cell: 24 },
};
export function trayCell(layout, bit, k) {
  const T = TRAY[layout] || TRAY.wide, i = BITS.indexOf(bit);
  const off = (i - 1.5) * T.cell;
  const jx = ((k % 3) - 1) * 5.2, jz = (Math.floor(k / 3) - 1) * 5.2;
  return [T.c[0] + jx, 3.2, T.c[2] + off + jz];
}
export function trayBox(layout) {
  const T = TRAY[layout] || TRAY.wide, L = T.cell * 4 + 4, S = T.cell + 4;
  return [T.c[0], 1, T.c[2], S, 2, L];
}

// ---------------- 位姿 ----------------
// 每个零件：R（3×3）与中心 p（世界坐标），op 透明度，hi 高亮（0–1，强调色）
function restPose(id) { const b = PARTS[id].box; return { R: I3, p: [b[0], b[1], b[2]], op: 1, hi: 0 }; }

/** 第 1 步：整台机器先抬起、绕前后轴翻面（s=0 时是正放：原来的顶面朝上） */
export function machineFlip(s) {
  // 先抬起 46 mm（机身对角半径约 68 mm，中心高 25 mm，抬够了转的时候才不碰桌面），转完再放下
  const u = local(s, 0), k = seg(u, 0.3, 0.74), lift = 46 * (seg(u, 0.06, 0.32) - seg(u, 0.72, 0.96));
  return { angle: Math.PI * (1 - k), lift, k };
}
function applyGlobal(pose, s) {
  if (s >= 1) return pose;
  const f = machineFlip(s), G = rotZ(f.angle), c = [0, SPEC.height / 2, 0];
  const p = add(aboutPivot(G, c, pose.p), [0, f.lift, 0]);
  return { ...pose, R: mul(G, pose.R), p };
}

/** 一串关键帧：[[u, [x,y,z], [rx,ry,rz]], ...]，两帧之间缓动 */
function path(keys, u) {
  if (u <= keys[0][0]) return { p: keys[0][1], e: keys[0][2] };
  for (let i = 1; i < keys.length; i++) {
    const [u1, p1, e1] = keys[i], [u0, p0, e0] = keys[i - 1];
    if (u <= u1) { const k = ease((u - u0) / (u1 - u0)); return { p: lerp3(p0, p1, k), e: lerp3(e0, e1, k) }; }
  }
  const l = keys[keys.length - 1]; return { p: l[1], e: l[2] };
}

// 底盖：撬缝时前沿翘起（绕后沿转），销钉松开，掀起翻过去撑在后面，拔线后拿走
const COVER_PIVOT = [0, 49.6, -IN + 0.4];
function coverPose(s) {
  const b = PARTS.cover.box, c0 = [b[0], b[1], b[2]];
  let ang = 0;
  ang = -1.2 * D * seg(local(s, 1), 0.2, 0.8);
  ang += -0.8 * D * seg(local(s, 3), 0.2, 0.6) - 0.8 * D * seg(local(s, 4), 0.1, 0.9);
  ang += (-100 * D - ang) * seg(local(s, 5), 0.12, 0.9);
  const R = rotX(ang);
  let p = aboutPivot(R, COVER_PIVOT, c0), op = 1;
  const u = local(s, 7);
  if (u > 0) {
    // 拿走：往上、往后右方飞出画面并淡出（指南只说取下）
    const k1 = seg(u, 0.05, 0.55), k2 = seg(u, 0.45, 0.95);
    p = add(p, [80 * k2, 70 * k1, -60 * k2]); op = 1 - seg(u, 0.6, 0.98);
    return { R: mul(rotX(-30 * D * k2), R), p, op, hi: 0 };
  }
  return { R, p, op, hi: s > 5 && s < 7 ? 1 : 0 };
}

// 内板：撬起前沿 → 往上抽出 → 翻过左边沿、靠在机身上（还连着线）
export const INNER_LEAN = (() => {
  const th = -(180 - 24.4) * D, R = rotZ(th);
  // 板的 +y 面（翻过来以后朝下、朝机身）贴着机身左上棱 (-HALF, height)
  const corner = [-HALF - 0.2, SPEC.height + 0.2, 0];
  const contact = apply(R, [-56, INNER_T / 2, 0]);
  return { R, p: sub(corner, contact), th };
})();
function innerPose(s) {
  const b = PARTS.inner.box, c0 = [b[0], b[1], b[2]];
  const u9 = local(s, 9), u10 = local(s, 10), u11 = local(s, 11);
  const tilt = 4 * D * seg(u9, 0.2, 0.9) * (1 - seg(u10, 0.1, 0.6));
  const pivot = [0, INNER_Y, -IN + 0.4];
  let R = rotX(-tilt); let p = aboutPivot(R, pivot, c0);
  p = add(p, [0, 16 * seg(u10, 0.05, 0.9), 0]);
  if (u11 > 0) {
    // 先整块抬高、挪到机身左外侧，再在空中翻面，最后落下靠住机身左上棱
    const A = p, P = INNER_LEAN.p;
    const high = [-128, 128, A[2]];
    const k1 = seg(u11, 0, 0.36), k2 = seg(u11, 0.66, 1);
    R = rotZ(INNER_LEAN.th * seg(u11, 0.3, 0.72));
    p = lerp3(lerp3(A, high, k1), P, k2);
    if (u11 >= 1) R = INNER_LEAN.R;
  }
  return { R, p, op: 1, hi: s > 8 && s < 12 ? 1 : 0 };
}

// 风扇：拧完螺丝抬起翻面，搁在散热片上，拔线后拿走
const FAN_REST = { p: [23, 38 + 9.8, -29], e: [Math.PI, 0, 0] };
function fanPose(s) {
  const b = PARTS.fan.box, c0 = [b[0], b[1], b[2]];
  const u13 = local(s, 13), u17 = local(s, 17);
  const q = path([[0, c0, [0, 0, 0]], [0.35, [c0[0], 78, c0[2]], [0, 0, 0]], [0.75, [FAN_REST.p[0], 80, -10], [Math.PI, 0, 0]], [1, FAN_REST.p, FAN_REST.e]], u13);
  let p = q.p, R = euler(q.e), op = 1;
  if (u17 > 0) {
    const k = seg(u17, 0.05, 0.9);
    p = add(p, [70 * k, 60 * seg(u17, 0, 0.5), -40 * k]); op = 1 - seg(u17, 0.55, 0.98);
  }
  return { R, p, op, hi: s > 12 && s < 18 ? 1 : 0 };
}

// SSD：螺丝出来 → 从插槽拔开（往耳机孔方向挪）→ 斜着翘起、取出，悬在机器上方亮相
// 特写时 SSD 悬在机器前上方 190 mm，正面朝镜头（镜头几乎平视，背后是素背景）
export const SSD_SHOW = { p: [0, 190, 96], e: [72 * D, 14 * D, 0] };
function ssdPose(s) {
  const b = PARTS.ssd.box, c0 = [b[0], b[1], b[2]];
  const u20 = local(s, 20), u21 = local(s, 21);
  let p = add(c0, [0, 0, 4.4 * seg(u20, 0.2, 0.85)]);
  let R = I3;
  if (u21 > 0) {
    // 绕靠耳机孔那条长边（x = -28）翘起，再往上取出
    const tilt = 24 * D * seg(u21, 0.05, 0.35);
    const Rt = rotZ(-tilt), pv = [-28, 14.2, p[2]];
    const tilted = aboutPivot(Rt, pv, p);
    const lifted = add(tilted, [0, 52 * seg(u21, 0.3, 0.6), 0]); // 先竖直提出机身口（壁高 50），再往前送
    const k = seg(u21, 0.58, 1);
    p = lerp3(lifted, SSD_SHOW.p, k);
    R = k > 0 ? euler(lerp3([0, 0, -tilt], SSD_SHOW.e, k)) : Rt;
  }
  const uc = local(s, CLOSEUP);
  if (uc > 0) {
    // 特写：先正面（闪存颗粒、金手指），再翻到背面看另一颗，最后翻回来
    const flip = Math.PI * (seg(uc, 0.32, 0.46) - seg(uc, 0.74, 0.88)); // 导览里约 30.4–31.5 秒翻到背面，33.6–34.7 秒翻回来
    R = mul(euler(SSD_SHOW.e), rotZ(flip));
    p = add(SSD_SHOW.p, [0, 10 * seg(uc, 0, 0.2), 0]);
  }
  const us = local(s, SWAP);
  if (us > 0) {
    // 换上小板的那一拍一开头（硬切泛白时），原厂模块平放到机身正前方的桌上
    const k = seg(us, 0, 0.06);
    p = lerp3(add(SSD_SHOW.p, [0, 10, 0]), SSD_DESK, k);
    R = k >= 1 ? I3 : euler(lerp3(SSD_SHOW.e, [0, 0, 0], k));
  }
  return { R, p, op: 1, hi: s > 19 && s < SWAP ? 1 : 0 };
}
export const SSD_DESK = [-120, 0.7, 80]; // 机身左前方的桌上（内板靠在机身左边，只占 z ±61）

// 第三方 2TB 小板：从上方落下，斜着插进同一个插槽（绕插槽那端的下棱翘 20°），轻晃到位，压平
export const SSD2_TILT = -20 * D;
export function ssd2Pose(s) {
  const b = PARTS.ssd2.box, c0 = [b[0], b[1], b[2]];
  const u = local(s, SWAP);
  if (u <= 0) return { R: I3, p: add(c0, [0, 140, 30]), op: 0, hi: 0 };
  const pivot = [c0[0], 14.2, 8]; // 插槽那端的下棱
  const wiggle = 2.2 * D * Math.sin(Math.PI * 4 * seg(u, 0.44, 0.56)) * (1 - seg(u, 0.52, 0.58));
  const ang = SSD2_TILT * (1 - seg(u, 0.54, 0.7)) + wiggle;
  const R = rotX(ang);
  const seated = aboutPivot(R, pivot, c0);
  // 插入前：沿板子自己的方向往外退 9 mm、再抬高
  const back = apply(R, [0, 0, 9]);
  const k1 = seg(u, 0.06, 0.3), k2 = seg(u, 0.3, 0.46);
  const above = add(seated, [0, 30, 12]), before = add(seated, [back[0], back[1] + 1.5, back[2]]);
  const p = k2 > 0 ? lerp3(before, seated, k2) : lerp3(above, before, k1);
  return { R, p, op: seg(u, 0.03, 0.1), hi: u < 0.95 ? 1 : 0 };
}

// 散热片：找内存那一拍变成 X 光（半透明），让底下的 M4 和内存颗粒露出来
export function xray(s) {
  const u = local(s, LOOK);
  return seg(u, 0.08, 0.22) * (1 - seg(u, 0.9, 1));
}
function heatPose(s) { const r = restPose('heatsink'); r.op = 1 - 0.82 * xray(s); return r; }
function ramPose(id, s) { const r = restPose(id); const u = local(s, LOOK); r.hi = seg(u, 0.22, 0.34) * (1 - seg(u, 0.92, 1)); return r; }

/** 一颗螺丝：在自己的区间里转着退出、抬起，然后飞进螺丝盘对应那一格 */
export function screwPose(sc, s, layout = 'wide') {
  const u = local(s, sc.stage), k = clamp((u - sc.a) / (sc.b - sc.a));
  const back = ease(k / 0.45), fly = ease((k - 0.45) / 0.55);
  const home = [sc.x, sc.y, sc.z];
  // 拧松后带着跟着的零件一起走：内板、风扇、SSD 上的螺丝在被拧下之前不动
  const out = add(home, [0, sc.len * 1.15 * back, 0]);
  const same = SCREWS.filter((x) => x.bit === sc.bit), idx = same.indexOf(sc);
  const dst = trayCell(layout, sc.bit, idx);
  const mid = [(out[0] + dst[0]) / 2, Math.max(out[1], dst[1]) + 46, (out[2] + dst[2]) / 2];
  let p = out;
  if (fly > 0) { const a = lerp3(out, mid, fly), b2 = lerp3(mid, dst, fly); p = lerp3(a, b2, fly); }
  const spin = -back * 5 * 2 * Math.PI;
  let R = fly > 0 ? mul(rotX(Math.PI / 2 * fly), rotY(spin)) : rotY(spin);
  // 换上小板那一拍：同一颗 8IP 从盘里飞回来，落进小板的半圆缺口拧紧（不改拧下的计数）
  const us = sc.bit === '8IP' ? local(s, SWAP) : 0;
  if (us > 0.7) {
    const f = seg(us, 0.7, 0.84), dn = seg(us, 0.84, 0.97);
    const hover = add(home, [0, sc.len * 1.15 + 18, 0]);
    const mid2 = [(dst[0] + hover[0]) / 2, Math.max(dst[1], hover[1]) + 30, (dst[2] + hover[2]) / 2];
    p = dn > 0 ? lerp3(hover, home, dn) : lerp3(lerp3(dst, mid2, f), lerp3(mid2, hover, f), f);
    R = mul(rotX(Math.PI / 2 * (1 - f)), rotY(dn * 5 * 2 * Math.PI));
    return { R, p, op: 1, hi: dn < 1 ? 1 : 0, done: true, k: 1, back: true };
  }
  return { R, p, op: 1, hi: k > 0 && k < 1 ? 1 : 0, done: k >= 1, k };
}

/** 全部零件在进度 s 时的位姿（世界坐标） */
export function pose(s, layout = 'wide') {
  s = clamp(s, 0, S_MAX);
  const out = {};
  for (const id of Object.keys(PARTS)) out[id] = restPose(id);
  out.cover = coverPose(s); out.inner = innerPose(s); out.fan = fanPose(s); out.ssd = ssdPose(s); out.ssd2 = ssd2Pose(s); out.heatsink = heatPose(s);
  out.ramA = ramPose('ramA', s); out.ramB = ramPose('ramB', s);
  out.m4.hi = 0.35 * seg(local(s, LOOK), 0.22, 0.34) * (1 - seg(local(s, LOOK), 0.92, 1));
  out.socket.hi = (s > 20 && s < 21) || (s > SWAP + 0.3 && s < SWAP + 0.7) ? 1 : 0;
  out.zif.hi = s > 14 && s < 17 ? 1 : 0;
  for (const sc of SCREWS) out[sc.id] = screwPose(sc, s, layout);
  for (const id of Object.keys(out)) if (!(id.startsWith('screw') && out[id].k > 0)) out[id] = applyGlobal(out[id], s);
  return out;
}

// ---------------- 计数 ----------------
const stageDone = (s, i) => s >= i + 1;
export function counters(s) {
  s = clamp(s, 0, S_MAX);
  let steps = 0; STAGES.forEach((st, i) => { if (st.ifixit && stageDone(s, i)) steps++; });
  const out = SCREWS.filter((sc) => local(s, sc.stage) >= sc.b);
  const bits = BITS.filter((b) => out.some((sc) => sc.bit === b));
  const conns = CONNECTORS.filter((c) => s >= c.stage + c.at);
  const pins = PINS.filter((p) => s >= p.stage + p.at).length;
  return {
    steps, screws: out.length, bits: bits.length, bitList: bits, connectors: conns.length, connectorList: conns.map((c) => c.id), pins,
    ramSlots: s >= RAM_FOUND_AT ? 0 : null,
    totals: { steps: IFIXIT_STEPS, screws: SCREWS.length, bits: BITS.length, connectors: CONNECTORS.length },
  };
}

/** 当前在第几阶段（下标），以及它是不是正在进行 */
export function stageAt(s) { s = clamp(s, 0, S_MAX); const i = Math.min(S_MAX - 1, Math.floor(s)); return { i, u: s - i, stage: STAGES[i] }; }
/** 正在动的那一件（强调色给它） */
export function activePart(s) {
  const { i } = stageAt(s);
  if (i === 0) return 'machine';
  if (i <= 7) return i >= 6 ? 'power' : 'cover';
  if (i <= 11) return 'inner';
  if (i <= 17) return i >= 14 && i <= 16 ? 'zif' : 'fan';
  if (i === LOOK) return 'ram';
  if (i === SWAP) return 'ssd2';
  return 'ssd';
}

// ---------------- 有向包围盒（测试与线稿共用） ----------------
export function obb(id, P) {
  let half, R = P.R, c = P.p;
  if (id.startsWith('screw')) { const sc = SCREWS.find((x) => x.id === id); half = [2, sc.len / 2 + 0.5, 2]; }
  else { const b = PARTS[id].box; half = [b[3] / 2, b[4] / 2, b[5] / 2]; }
  return { c, R, half, axes: [[R[0], R[3], R[6]], [R[1], R[4], R[7]], [R[2], R[5], R[8]]] };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** 两个有向包围盒的最小穿透深度（mm）；不相交返回 0 */
export function penetration(A, B) {
  const d = sub(B.c, A.c); let best = Infinity;
  const axes = [...A.axes, ...B.axes];
  for (const a of A.axes) for (const b of B.axes) { const c = cross(a, b), l = Math.hypot(...c); if (l > 1e-6) axes.push(c.map((x) => x / l)); }
  for (const n of axes) {
    const ra = A.half[0] * Math.abs(dot(A.axes[0], n)) + A.half[1] * Math.abs(dot(A.axes[1], n)) + A.half[2] * Math.abs(dot(A.axes[2], n));
    const rb = B.half[0] * Math.abs(dot(B.axes[0], n)) + B.half[1] * Math.abs(dot(B.axes[1], n)) + B.half[2] * Math.abs(dot(B.axes[2], n));
    const o = ra + rb - Math.abs(dot(d, n));
    if (o <= 0) return 0;
    best = Math.min(best, o);
  }
  return best;
}
export function corners(o) {
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const v = [sx * o.half[0], sy * o.half[1], sz * o.half[2]];
    out.push(add(o.c, [dot([o.R[0], o.R[1], o.R[2]], v), dot([o.R[3], o.R[4], o.R[5]], v), dot([o.R[6], o.R[7], o.R[8]], v)]));
  }
  return out;
}

// ---------------- 侧视线稿（从机身左侧看，z 横轴、y 纵轴） ----------------
const SIDE = ['skin', 'wallN', 'wallS', 'psu', 'board', 'm4', 'ramA', 'ramB', 'heatsink', 'socket', 'ssd', 'ssd2', 'jack', 'fan', 'inner', 'cover'];
function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
export function sideView(s, layout = 'wide') {
  const P = pose(s, layout), act = activePart(s);
  return SIDE.filter((id) => P[id].op > 0.05).map((id) => ({
    id, name: PARTS[id].name, op: P[id].op,
    hi: P[id].hi > 0.5 || (act === 'ram' && (id === 'ramA' || id === 'ramB') && P[id].hi > 0.5),
    xray: id === 'heatsink' && P[id].op < 0.6,
    poly: hull(corners(obb(id, P[id])).map((v) => [v[2], v[1]])),
  }));
}
