// 南禅寺大殿 · 可以按的机器。node build.mjs [--light] [--audit]
// 一个世界单位 = 1 分（16.5 mm）。数字全部来自 model.mjs。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SKILL = join(homedir(), ".claude/skills/anatomy");
const k = await import(join(SKILL, "kit/iso-kit.mjs"));
const G = await import(join(SKILL, "kit/lathe.mjs"));
const A = await import(join(SKILL, "kit/audit.mjs"));
const { kitScript } = await import(join(SKILL, "scripts/inline-kit.mjs"));
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";
const QUICK = process.argv.includes("--quick");

const W = 1000;
const H = 940;
const AZIMUTH = 58;
const ELEVATION = 30;

// ---------- 世界尺寸（分） ----------
const XS = M.COLS_X; // -350 -150 150 350
const YS = M.COLS_Y; // -300 -100 100 300
const ZB = M.BASE_H; // 台基上皮
const PLINTH = 3; // 柱础露明高（示意）
const J = M.juZhe();
const isCorner = (x, y) => Math.abs(x) === 350 && Math.abs(y) === 300;
const onPerimeter = (x, y) => Math.abs(x) === 350 || Math.abs(y) === 300;
const COLUMNS = [];
for (const x of XS) for (const y of YS) if (onPerimeter(x, y)) COLUMNS.push([x, y]);
const SQUARE = new Set(["-350,-100", "-350,100", "-350,-300"]); // 西面方柱（位置示意）
const R_COL = M.COLUMN_D / 2;
// 生起只有 2 分（3.3 cm），图上不到 2 像素；画出来会让槫和椽在角上互相吃进去，所以不画（README 里写明）
const SHENG_DRAWN = 0;
const colTop = (x, y) => ZB + PLINTH + M.COLUMN_H + (isCorner(x, y) ? SHENG_DRAWN : 0);
const lean = (x, y) => {
  const lx = Math.abs(x) === 350 ? -Math.sign(x) : 0;
  const ly = Math.abs(y) === 300 ? -Math.sign(y) : 0;
  return [lx * M.CE_JIAO, ly * M.CE_JIAO];
};
const axisAt = (x, y, z) => {
  const [lx, ly] = lean(x, y);
  const t = (z - ZB - PLINTH) / (colTop(x, y) - ZB - PLINTH);
  return [x + lx * t, y + ly * t];
};
const Z0 = ZB + PLINTH + M.COLUMN_H; // 平柱柱头
const LANE_H = 22; // 阑额高（示意）
const LANE_W = 12;
// 斗栱层：相对柱头
const BR = { tuanZ: 96 + 10.5, tuanR: 10.5 };
const ZL = Z0 + 96 + 2 * BR.tuanR; // 橑檐槫上皮（平柱处）
const RAFTER_R = 4.5;
const SLAB = 12; // 望板加瓦厚（示意）
const EAVE_Y = 300 + M.EAVE_OUT; // 441.8
const EAVE_X = 350 + M.EAVE_OUT;
const GABLE_X = 200; // 山花位置 = 山面平槫
const CHU_JI = 20; // 出际（示意）
// 槫上皮高度：随到中线距离 d（分）
function tuanTop(d) {
  if (d <= 150) return ZL + J.ping + ((M.JU_H - J.ping) * (150 - d)) / 150;
  return ZL + (J.ping * (347 - d)) / 197;
}
// 椽中心线高度（落在槫上皮 + 椽半径），檐椽在 347 以外沿下段坡度延长
// 椽落在圆槫上：椽中心线 = 两槫中心连线沿法线抬高 (槫半径 + 椽半径)，竖直方向要除以 cosθ
const segCos = (d) => {
  const upper = d <= 150;
  const rise = upper ? tuanTop(0) - tuanTop(150) : tuanTop(150) - tuanTop(347);
  const run = upper ? 150 : 197;
  return Math.cos(Math.atan(rise / run));
};
const rafterZ = (d) => tuanTop(d) - BR.tuanR + (BR.tuanR + RAFTER_R) / segCos(d);
const roofBottom = (d) => tuanTop(d) - BR.tuanR + (BR.tuanR + 2 * RAFTER_R) / segCos(d);

const P = k.fitProjection(
  [
    ...k.boxCorners({ x: -520, y: -470, w: 1040, d: 1080, r: 0 }, -6, 0),
    [-EAVE_X, -EAVE_Y, ZL],
    [EAVE_X, EAVE_Y, ZL],
    [-EAVE_X, EAVE_Y, ZL],
    [EAVE_X, -EAVE_Y, ZL],
    [-230, 0, ZL + M.JU_H + 540 + 115],
    [230, 0, ZL + M.JU_H + 540 + 115],
    [-EAVE_X, EAVE_Y, ZL + 520],
    [EAVE_X, -EAVE_Y, ZL + 520],
  ],
  W,
  H,
  { pad: 22, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const unit = G.unit3;
const add = G.add3;
const mul = G.mul3;
const sub = G.sub3;

// ---------- 层（拆装组） ----------
const PIECES = {
  stand: { name: "台基", move: [0, 0, 0] },
  column: { name: "檐柱", move: [0, 0, 26] },
  lane: { name: "阑额", move: [0, 0, 62] },
  bracket: { name: "斗栱", move: [0, 0, 112] },
  beam: { name: "梁架", move: [0, 0, 178] },
  purlin: { name: "槫", move: [0, 0, 250] },
  rafter: { name: "椽与角梁", move: [0, 0, 330] },
  roof: { name: "瓦顶", move: [0, 0, 540] },
};
const STEP_PIECES = { base: ["stand"], column: ["column"], lane: ["lane"], bracket: ["bracket"], beam: ["beam"], purlin: ["purlin"], rafter: ["rafter"], roof: ["roof"], wall: [] };
const STAGGER = ["roof", "rafter", "purlin", "beam", "bracket", "lane", "column", "stand"];
const SPRING = { stagger: 0.16, stiffness: 70, damping: 16.7, substeps: 4 };
const R = A.recorder(P, { order: STAGGER, spring: SPRING });
const record = R.solid;
const MAT = new Map();
let serial = 0;
const STEP_OF = new Map();
function put(piece, ref, svg, shapes, { mat = "zhu", bias = 0, name } = {}) {
  // 墙不参与拆装位移（它们夹在柱子之间，只能原地砌起来），挂在台基这一层上，单独一步显现
  const step = piece.startsWith("wall") ? "wall" : piece;
  if (piece.startsWith("wall")) piece = "stand";
  const id = name ?? R.nameFor(`${piece}.p`);
  R.put({ piece, ride: piece, at: ref, bias, svg, move: PIECES[piece].move, shapes, name: id });
  STEP_OF.set(id, step === "stand" ? "base" : step);
  MAT.set(id, mat);
  serial++;
  return id;
}

// 轴对齐方块（世界坐标 min/max），可选 inner 线
function box(piece, x0, x1, y0, y1, z0, z1, { mat = "zhu", owner, name, inner = "", extra = "", bevel = 0.4, bias = 0, tone = "hi", r = 0.6, crease = "faint" } = {}) {
  const plan = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), d: Math.abs(y1 - y0), r: Math.min(r, Math.abs(x1 - x0) / 3, Math.abs(y1 - y0) / 3) };
  const id = name ?? R.nameFor(`${piece}.box`);
  const svg = S(k.slabOf(plan, Math.min(z0, z1), Math.abs(z1 - z0), P, 2, bevel), { tone, crease, inner }) + extra;
  put(piece, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], svg, [record(A.slab(plan, Math.min(z0, z1), Math.abs(z1 - z0), { name: id, owner }, 2))], { mat, bias, name: id });
  return plan;
}
// 局部坐标的方块：c 中心，along/out 两个水平单位向量（轴对齐）
function lbox(piece, c, along, out, a0, a1, b0, b1, z0, z1, opts = {}) {
  const p = (a, b) => [c[0] + along[0] * a + out[0] * b, c[1] + along[1] * a + out[1] * b];
  const q0 = p(a0, b0);
  const q1 = p(a1, b1);
  return box(piece, q0[0], q1[0], q0[1], q1[1], z0, z1, opts);
}
// 任意凸棱柱：框架 F（正交），截面 polygon（u,v），沿 a 从 s0 到 s1
function prism(piece, F, poly, s0, s1, { mat = "zhu", owner, name, extra = "", bias = 0, tone = "hi", inner = "" } = {}) {
  const id = name ?? R.nameFor(`${piece}.pr`);
  const svg = S(G.prismOf(F, poly, s0, s1, P), { tone, crease: "faint", inner }) + extra;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const mid = add(add(add(F.o, mul(F.a, (s0 + s1) / 2)), mul(F.u, cx)), mul(F.v, cy));
  put(piece, mid, svg, [record(A.prism(F, poly, s0, s1, { name: id, owner }))], { mat, bias, name: id });
  return id;
}
const frame = (o, a, u) => {
  const A3 = unit(a);
  const U = unit(u);
  return { o, a: A3, u: U, v: G.cross3(A3, U) };
};
function rod(piece, from, to, r, { mat = "zhu", owner, name, extra = "", bias = 0, tone = "hi" } = {}) {
  const axis = sub(to, from);
  const len = G.len3(axis);
  const F = G.frameAlong(from, unit(axis));
  const id = name ?? R.nameFor(`${piece}.rod`);
  put(piece, add(from, mul(axis, 0.5)), S(G.disc(0, len, r, F, P), { tone }) + extra, [record(A.disc(F, 0, len, r, { name: id, owner }))], { mat, bias, name: id });
  return id;
}

// ---------- 1 台基 ----------
const BASE = { x: -350 - M.BASE_OUT, y: -300 - M.BASE_OUT, w: 700 + 2 * M.BASE_OUT, d: 600 + 2 * M.BASE_OUT, r: 1.5 };
const YUE = { x: -260, y: BASE.y + BASE.d, w: 520, d: 110, r: 1.2 }; // 月台（示意）
const YUE_H = 44;
const GROUND = { x: -520, y: -470, w: 1040, d: 1080, r: 6 };
const back = [];
const halo = [];
const front = [];
function stand() {
  // 地坪
  const gid = "stand.ground";
  halo.push(`<path class="iso-halo nc-shadow" data-shadow d="${k.haloOf(BASE, 0, ZB, P)}"/>`);
  back.push(`<g class="m-tu">${S(k.slabOf(GROUND, -6, 6, P, 6, 1), { tone: "mid" })}${Ln(k.planOutline(k.insetPlan(GROUND, 6), 0, P, 6), { tone: "faint" })}</g>`);
  record(A.slab(GROUND, -6, 6, { name: gid, ground: true }, 6));
  // 台基：砖砌叠涩，顶上阶条石
  const courses = [];
  for (let z = 7; z < ZB - 6; z += 6.7) courses.push(k.sideSeam(BASE, z, P, 2));
  const id = "stand.base";
  put("stand", [0, 0, ZB / 2], S(k.slabOf(BASE, 0, ZB - 5, P, 2, 0.6), { tone: "hi", inner: Ln(courses.join(""), { tone: "lo" }) }), [record(A.slab(BASE, 0, ZB - 5, { name: id }, 2))], { mat: "zhuan", name: id });
  // 阶条石一圈（顶面），分块
  const top = ZB - 5;
  const rim = 16;
  const stones = [];
  const pushStone = (x0, x1, y0, y1) => stones.push([x0, x1, y0, y1]);
  const X0 = BASE.x, X1 = BASE.x + BASE.w, Y0 = BASE.y, Y1 = BASE.y + BASE.d;
  // 前后条石按 ~80 分一块
  const split = (a0, a1, n) => Array.from({ length: n }, (_, i) => [a0 + ((a1 - a0) * i) / n, a0 + ((a1 - a0) * (i + 1)) / n]);
  for (const [a, b] of split(X0, X1, 12)) { pushStone(a, b, Y1 - rim, Y1); pushStone(a, b, Y0, Y0 + rim); }
  for (const [a, b] of split(Y0 + rim, Y1 - rim, 10)) { pushStone(X1 - rim, X1, a, b); pushStone(X0, X0 + rim, a, b); }
  stones.forEach(([x0, x1, y0, y1], i) => box("stand", x0, x1, y0, y1, top, ZB, { mat: "shi", name: `stand.rim#${i}`, bevel: 0.5, r: 0.4 }));
  // 地面方砖：一整块薄面，砖缝从边到边
  const inner = { x: X0 + rim, y: Y0 + rim, w: BASE.w - 2 * rim, d: BASE.d - 2 * rim, r: 0 };
  const seams = [];
  for (let x = inner.x + 20; x < inner.x + inner.w - 1; x += 20) seams.push(k.lineOnTop([x, inner.y], [x, inner.y + inner.d], ZB, P));
  for (let y = inner.y + 20; y < inner.y + inner.d - 1; y += 20) seams.push(k.lineOnTop([inner.x, y], [inner.x + inner.w, y], ZB, P));
  put("stand", [0, 0, ZB - 2.5], S(k.slabOf(inner, top, 5, P, 2, 0), { tone: "mid", crease: "none" }) + Ln(seams.join(""), { tone: "faint" }), [record(A.slab(inner, top, 5, { name: "stand.floor" }, 2))], { mat: "fangzhuan", name: "stand.floor", bias: -2 });
  // 月台
  const yc = [];
  for (let z = 7; z < YUE_H - 4; z += 6.7) yc.push(k.sideSeam(YUE, z, P, 2));
  put("stand", [0, YUE.y + YUE.d / 2, YUE_H / 2], S(k.slabOf(YUE, 0, YUE_H - 4, P, 2, 0.5), { tone: "hi", inner: Ln(yc.join(""), { tone: "lo" }) }), [record(A.slab(YUE, 0, YUE_H - 4, { name: "stand.yuetai" }, 2))], { mat: "zhuan", name: "stand.yuetai" });
  split(YUE.x, YUE.x + YUE.w, 7).forEach(([a, b], i) => box("stand", a, b, YUE.y, YUE.y + YUE.d, YUE_H - 4, YUE_H, { mat: "shi", name: `stand.yuetop#${i}`, bevel: 0.5, r: 0.4 }));
  // 踏道：月台到台基三级，地面到月台三级
  const stepW = 120;
  for (let i = 0; i < 3; i++) {
    const h0 = YUE_H + ((ZB - YUE_H) * i) / 3;
    const h1 = YUE_H + ((ZB - YUE_H) * (i + 1)) / 3;
    const y1 = BASE.y + BASE.d + 30 - i * 10;
    box("stand", -stepW / 2, stepW / 2, BASE.y + BASE.d, y1, h0, h1, { mat: "shi", name: `stand.step-up#${i}`, bevel: 0.5, r: 0.4 });
  }
  for (let i = 0; i < 3; i++) {
    const h0 = (YUE_H * i) / 3;
    const h1 = (YUE_H * (i + 1)) / 3;
    const y1 = YUE.y + YUE.d + 36 - i * 12;
    box("stand", -stepW / 2, stepW / 2, YUE.y + YUE.d, y1, h0, h1, { mat: "shi", name: `stand.step#${i}`, bevel: 0.5, r: 0.4 });
  }
  // 柱础
  for (const [x, y] of COLUMNS) {
    const s = 16;
    box("stand", x - s, x + s, y - s, y + s, ZB, ZB + PLINTH, { mat: "shi", name: `stand.plinth${x},${y}`, bevel: 0.5, r: 1.2, extra: Ln(k.ring(x, y, R_COL + 3, ZB + PLINTH, P, 28), { tone: "lo" }) });
  }
  // 营造尺：地上一根十尺杆（不随分值缩放）
  // 放在月台右前方的地上：滑杆把殿放大到 1.21 倍时也压不到它
  const RULER = { x: 0, y: 588, w: (10 * M.CHI_MM) / M.FEN_MM, d: 8, r: 0.8 };
  RULER.x = 510 - RULER.w;
  const t = k.topTicks(RULER.x, RULER.x + RULER.w, (0.5 * M.CHI_MM) / M.FEN_MM, 2, RULER.y + 0.4, 2.4, [2.6, 5], P);
  front.push(`<g class="m-qing nc-ruler">${S(k.slabOf(RULER, 0, 2.4, P, 2, 0.4), { tone: "hi" })}${Ln(t.minor, { tone: "lo" })}${Ln(t.major, { tone: "mid" })}</g>`);
  record(A.slab(RULER, 0, 2.4, { name: "stand.ruler" }, 2));
  return RULER;
}
const RULER = stand();

// ---------- 2 檐柱 ----------
for (const [x, y] of COLUMNS) {
  const z0 = ZB + PLINTH;
  const z1 = colTop(x, y);
  const [lx, ly] = lean(x, y);
  const from = [x, y, z0];
  const to = [x + lx, y + ly, z1];
  const name = `column.${x},${y}`;
  if (SQUARE.has(`${x},${y}`)) {
    const a = unit(sub(to, from));
    const F = frame(from, a, unit(G.cross3([0, 1, 0], a)));
    const [w, d] = M.SQUARE_COL;
    prism("column", F, [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], 0, G.len3(sub(to, from)), { name, owner: "frame" });
  } else {
    const axis = sub(to, from);
    const F = G.frameAlong(from, unit(axis));
    const len = G.len3(axis);
    put("column", add(from, mul(axis, 0.5)), S(G.disc(0, len, R_COL, F, P), { tone: "hi" }), [record(A.disc(F, 0, len, R_COL, { name, owner: "frame" }))], { name, mat: "zhu" });
  }
}

// ---------- 3 阑额 ----------
const halfW = (x, y) => (SQUARE.has(`${x},${y}`) ? Math.max(...M.SQUARE_COL) / 2 : R_COL);
function laneBetween(p, q) {
  const zTop = Math.min(colTop(...p), colTop(...q));
  const z0 = zTop - LANE_H;
  const zm = z0 + LANE_H / 2;
  const alongX = p[1] === q[1];
  const ap = axisAt(p[0], p[1], zm);
  const aq = axisAt(q[0], q[1], zm);
  const reach = (c) => halfW(...c) + 0.1; // 平端面只与柱面相切，凸件互不穿插
  if (alongX) {
    const s = Math.sign(q[0] - p[0]);
    const xa = ap[0] + s * reach(p);
    const xb = aq[0] - s * reach(q);
    const yc = p[1] + (ap[1] - p[1] + aq[1] - q[1]) / 2;
    const seam = [0.5].map((f) => k.segment([xa + (xb - xa) * f, yc + Math.sign(p[1]) * LANE_W / 2, z0], [xa + (xb - xa) * f, yc + Math.sign(p[1]) * LANE_W / 2, z0 + LANE_H], P)).join("");
    box("lane", xa, xb, yc - LANE_W / 2, yc + LANE_W / 2, z0, zTop, { name: `lane.${p}-${q}`, owner: "frame", extra: laneDots(xa, xb, yc + LANE_W / 2, z0, zTop, "x") });
  } else {
    const s = Math.sign(q[1] - p[1]);
    const ya = ap[1] + s * reach(p);
    const yb = aq[1] - s * reach(q);
    const xc = p[0] + (ap[0] - p[0] + aq[0] - q[0]) / 2;
    box("lane", xc - LANE_W / 2, xc + LANE_W / 2, ya, yb, z0, zTop, { name: `lane.${p}-${q}`, owner: "frame", extra: laneDots(ya, yb, xc + LANE_W / 2, z0, zTop, "y") });
  }
}
// 阑额上的「七朱八白」白点（R：阑额通身刷土朱，画白色圆点）——只画在朝外可见面
function laneDots(a0, a1, face, z0, z1, axis) {
  const n = 7;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = a0 + ((a1 - a0) * (i + 0.5)) / n;
    const p = axis === "x" ? [t, face, (z0 + z1) / 2] : [face, t, (z0 + z1) / 2];
    pts.push(at(p));
  }
  const facing = axis === "x" ? Math.sign(face) * V[1] > 0 : Math.sign(face) * V[0] > 0;
  return facing ? `<g class="nc-baidian">${Dots(pts, { size: 1.6, tone: "hi" })}</g>` : "";
}
const ring = [[-350, -300], [-150, -300], [150, -300], [350, -300], [350, -100], [350, 100], [350, 300], [150, 300], [-150, 300], [-350, 300], [-350, 100], [-350, -100]];
for (let i = 0; i < ring.length; i++) laneBetween(ring[i], ring[(i + 1) % ring.length]);

// ---------- 4 斗栱 ----------
// 每朵：c 柱头中心（含侧脚后的位置），out 向外，along 沿墙；z0 柱头高
const BRACKETS = [];
for (const [x, y] of COLUMNS) {
  const z0 = colTop(x, y);
  const [ax, ay] = axisAt(x, y, z0);
  const kind = isCorner(x, y) ? "corner" : Math.abs(y) === 300 ? "front" : "gable";
  BRACKETS.push({ x, y, c: [ax, ay], z0, kind, beam: kind === "front" && Math.abs(x) === 150 });
}
function dou(piece, c, along, out, a, b, wA, wB, z, h, opts) {
  // 斗：下面欹（收分）、上面平，作为一个件画（下先上后）
  const p = (aa, bb) => [c[0] + along[0] * aa + out[0] * bb, c[1] + along[1] * aa + out[1] * bb];
  const parts = [[1.2, z, z + h * 0.45], [0, z + h * 0.45, z + h]].map(([inset, z0, z1]) => {
    const q0 = p(a - wA / 2 + inset, b - wB / 2 + inset);
    const q1 = p(a + wA / 2 - inset, b + wB / 2 - inset);
    return { x: Math.min(q0[0], q1[0]), y: Math.min(q0[1], q1[1]), w: Math.abs(q1[0] - q0[0]), d: Math.abs(q1[1] - q0[1]), r: 0.6, z0, z1 };
  });
  const id = R.nameFor(`${piece}.dou`);
  const svg = parts.map((pl) => S(k.slabOf(pl, pl.z0, pl.z1 - pl.z0, P, 2, 0.3), { tone: "hi", crease: "faint" })).join("");
  const shapes = parts.map((pl) => record(A.slab(pl, pl.z0, pl.z1 - pl.z0, { name: id, owner: opts.owner }, 2)));
  const cc = p(a, b);
  put(piece, [cc[0], cc[1], z + h / 2], svg, shapes, { mat: opts.mat ?? "zhu", name: id });
}
function arm(B, along, out, owner, { beam = false, corner = false } = {}) {
  const inner = corner ? -5.5 : null;
  const { c, z0 } = B;
  const o = { owner, mat: "zhu" };
  const ob = { owner, mat: "zhubai" };
  // 华栱一跳（足材 21，厚 11）
  lbox("bracket", c, along, out, -5.5, 5.5, inner ?? -32, 27, z0 + 11, z0 + 32, { ...ob, name: R.nameFor(`bracket.hua1`) });
  // 交互斗（外、内）
  dou("bracket", c, along, out, 0, 19, 18, 16, z0 + 32, 6, o);
  if (!corner) dou("bracket", c, along, out, 0, -24, 18, 16, z0 + 32, 6, o);
  if (!beam) {
    for (const s of [-1, 1]) lbox("bracket", c, along, out, s * 5.5, s * 9, 11, 27, z0 + 38, z0 + 42, o);
    // 华栱二跳
    lbox("bracket", c, along, out, -5.5, 5.5, inner ?? -40, 52, z0 + 38, z0 + 59, { ...ob, name: R.nameFor("bracket.hua2") });
  }
  // 交互斗（二跳头）
  dou("bracket", c, along, out, 0, 47, 18, 16, z0 + 59, 6, o);
  for (const s of [-1, 1]) for (const [b0, b1] of [[39, 42], [52, 55]]) lbox("bracket", c, along, out, s * 5, s * 9, b0, b1, z0 + 65, z0 + 69, o);
  // 令栱两半
  for (const s of [-1, 1]) lbox("bracket", c, along, out, s * 5, s * 35, 42, 52, z0 + 65, z0 + 80, { ...ob, name: R.nameFor("bracket.linggong") });
  // 耍头（批竹昂式），梁头处由缴背出头
  if (!beam) {
    const F = frame([c[0], c[1], z0 + 65], along, out);
    // 截面在 (out, z) 平面：沿 along 拉伸。用 frame: a=along, u=out, v=z
    const Fz = { o: [c[0], c[1], z0 + 65], a: along, u: out, v: [0, 0, 1] };
    const fix = G.dot3(G.cross3(Fz.a, Fz.u), [0, 0, 1]) > 0 ? Fz : { o: Fz.o, a: mul(along, -1), u: out, v: [0, 0, 1] };
    prism("bracket", fix, [[-5, 0], [56, 0], [67, 6], [67, 15], [-5, 15]], -5, 5, { ...ob, name: R.nameFor("bracket.shuatou") });
  }
  // 令栱上散斗
  for (const s of [-1, 1]) {
    dou("bracket", c, along, out, s * 28, 47, 14, 16, z0 + 80, 6, o);
    for (const t of [-1, 1]) lbox("bracket", c, along, out, s * 28 - 7, s * 28 + 7, 47 + t * 5, 47 + t * 8, z0 + 86, z0 + 90, o);
  }
}
function bracketSet(B) {
  const { x, y, c, z0, kind } = B;
  const owner = `dg.${x},${y}`;
  const out = kind === "gable" ? [Math.sign(x), 0, 0] : [0, Math.sign(y), 0];
  const along = kind === "gable" ? [0, 1, 0] : [1, 0, 0];
  const o = { owner, mat: "zhu" };
  // 栌斗：欹、平、四个耳
  lbox("bracket", c, along, out, -10.5, 10.5, -9.5, 9.5, z0, z0 + 7, { ...o, name: R.nameFor("bracket.ludou-qi"), bevel: 0.3 });
  lbox("bracket", c, along, out, -14.5, 14.5, -13, 13, z0 + 7, z0 + 11, { ...o, name: R.nameFor("bracket.ludou-ping"), bevel: 0.3 });
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) lbox("bracket", c, along, out, sa * 5.5, sa * 14.5, sb * 5, sb * 13, z0 + 11, z0 + 18, { ...o, name: R.nameFor("bracket.ludou-er"), bevel: 0.3 });
  if (kind === "corner") {
    // 转角：两个方向各出一缕（示意，不画斜出的角华栱）
    const outY = [0, Math.sign(y), 0];
    const outX = [Math.sign(x), 0, 0];
    arm(B, [1, 0, 0], outY, owner, { corner: true });
    // 另一向：华栱一跳只出外侧，避开正交那根
    lbox("bracket", c, [0, 1, 0], outX, -5.5, 5.5, 5.5, 27, z0 + 11, z0 + 32, { owner, mat: "zhubai", name: R.nameFor("bracket.hua1x") });
    dou("bracket", c, [0, 1, 0], outX, 0, 19, 18, 16, z0 + 32, 6, o);
    for (const s of [-1, 1]) lbox("bracket", c, [0, 1, 0], outX, s * 5.5, s * 9, 11, 27, z0 + 38, z0 + 42, o);
    lbox("bracket", c, [0, 1, 0], outX, -5.5, 5.5, 5.5, 52, z0 + 38, z0 + 59, { owner, mat: "zhubai", name: R.nameFor("bracket.hua2x") });
    dou("bracket", c, [0, 1, 0], outX, 0, 47, 18, 16, z0 + 59, 6, o);
    for (const s of [-1, 1]) for (const [b0, b1] of [[39, 42], [52, 55]]) lbox("bracket", c, [0, 1, 0], outX, s * 5, s * 9, b0, b1, z0 + 65, z0 + 69, o);
    for (const s of [-1, 1]) lbox("bracket", c, [0, 1, 0], outX, s * 5, s * 35, 42, 52, z0 + 65, z0 + 80, { owner, mat: "zhubai", name: R.nameFor("bracket.linggongx") });
    for (const s of [-1, 1]) {
      dou("bracket", c, [0, 1, 0], outX, s * 28, 47, 14, 16, z0 + 80, 6, o);
      for (const t of [-1, 1]) lbox("bracket", c, [0, 1, 0], outX, s * 28 - 7, s * 28 + 7, 47 + t * 5, 47 + t * 8, z0 + 86, z0 + 90, o);
    }
  } else {
    // 泥道栱两半（单材 15×10）
    for (const s of [-1, 1]) lbox("bracket", c, along, out, s * 5.5, s * 35, -5, 5, z0 + 11, z0 + 26, { owner, mat: "zhubai", name: R.nameFor("bracket.nidao") });
    for (const s of [-1, 1]) {
      dou("bracket", c, along, out, s * 28, 0, 14, 16, z0 + 26, 6, o);
      for (const t of [-1, 1]) lbox("bracket", c, along, out, s * 28 - 7, s * 28 + 7, t * 5, t * 8, z0 + 32, z0 + 36, o);
    }
    arm(B, along, out, owner, { beam: B.beam });
  }
}
BRACKETS.forEach(bracketSet);

// 柱头枋两层（沿墙一圈），在华栱/梁头处断开；层间散斗
const FANG = [[32, 47], [53, 68]];
function fangRuns() {
  const sides = [
    { pts: [[-350, -300], [-150, -300], [150, -300], [350, -300]], axis: "x" },
    { pts: [[-350, 300], [-150, 300], [150, 300], [350, 300]], axis: "x" },
    { pts: [[-350, -300], [-350, -100], [-350, 100], [-350, 300]], axis: "y" },
    { pts: [[350, -300], [350, -100], [350, 100], [350, 300]], axis: "y" },
  ];
  for (const side of sides) {
    for (let i = 0; i < 3; i++) {
      const p = side.pts[i];
      const q = side.pts[i + 1];
      const Bp = BRACKETS.find((b) => b.x === p[0] && b.y === p[1]);
      const Bq = BRACKETS.find((b) => b.x === q[0] && b.y === q[1]);
      const gapP = Bp.beam && side.axis === "x" ? 9.7 : 5.5;
      const gapQ = Bq.beam && side.axis === "x" ? 9.7 : 5.5;
      const zBase = Math.min(Bp.z0, Bq.z0);
      FANG.forEach(([f0, f1], layer) => {
        if (side.axis === "x") {
          const yc = (Bp.c[1] + Bq.c[1]) / 2;
          box("bracket", Bp.c[0] + gapP, Bq.c[0] - gapQ, yc - 5, yc + 5, zBase + f0, zBase + f1, { owner: "fang", mat: "zhu", name: R.nameFor(`bracket.fang${layer}`) });
        } else {
          const xc = (Bp.c[0] + Bq.c[0]) / 2;
          box("bracket", xc - 5, xc + 5, Bp.c[1] + gapP, Bq.c[1] - gapQ, zBase + f0, zBase + f1, { owner: "fang", mat: "zhu", name: R.nameFor(`bracket.fang${layer}`) });
        }
      });
      // 层间散斗（在泥道栱散斗正上方：距柱 ±28）
      for (const [B, s] of [[Bp, 1], [Bq, -1]]) {
        if (B.kind === "corner") continue;
        if (side.axis === "x") dou("bracket", [B.c[0], (Bp.c[1] + Bq.c[1]) / 2], [1, 0, 0], [0, 1, 0], s * 28, 0, 14, 16, zBase + 47, 6, { owner: "fang", mat: "zhu" });
        else dou("bracket", [(Bp.c[0] + Bq.c[0]) / 2, B.c[1]], [0, 1, 0], [1, 0, 0], s * 28, 0, 14, 16, zBase + 47, 6, { owner: "fang", mat: "zhu" });
      }
    }
  }
}
fangRuns();
// 替木：每朵令栱上，沿墙；转角处缩短免得相交
for (const B of BRACKETS) {
  const z = B.z0 + 86;
  const sets = B.kind === "corner" ? [[[1, 0, 0], [0, Math.sign(B.y), 0], Math.sign(B.x)], [[0, 1, 0], [Math.sign(B.x), 0, 0], Math.sign(B.y)]] : [[B.kind === "gable" ? [0, 1, 0] : [1, 0, 0], B.kind === "gable" ? [Math.sign(B.x), 0, 0] : [0, Math.sign(B.y), 0], 0]];
  for (const [along, out, cut] of sets) {
    const a0 = cut > 0 ? -60 : -60;
    const a1 = cut ? 36 : 60;
    const [lo, hi] = cut < 0 ? [-36, 60] : [a0, a1];
    lbox("bracket", B.c, along, out, cut === 0 ? -60 : (cut > 0 ? -60 : -36), cut === 0 ? 60 : (cut > 0 ? 36 : 60), 42, 52, z, z + 10, { owner: `dg.${B.x},${B.y}`, mat: "zhu", name: R.nameFor("bracket.timu") });
  }
}

// ---------- 5 梁架 ----------
// 四椽栿：明间两缝，从前檐二跳头到后檐二跳头；缴背；驼峰、大斗；平梁；叉手
const BEAM_W = 420 / M.FEN_MM * (32 / 42); // R：42×32 cm → 宽 19.4
const BEAM_H = 420 / M.FEN_MM; // 25.5
const beamOwner = (x) => `liang.${x}`;
for (const x of [-150, 150]) {
  const Bf = BRACKETS.find((b) => b.x === x && b.y === 300);
  const Bb = BRACKETS.find((b) => b.x === x && b.y === -300);
  const z0 = Z0;
  const xc = (Bf.c[0] + Bb.c[0]) / 2;
  const o = { owner: beamOwner(x), mat: "zhubai" };
  // 梁头（二跳华栱，足材截面）前后
  // 梁头（二跳华栱）和缴背出头的耍头压在令栱、替木下面，拆的时候得跟斗栱一起走，所以算斗栱层
  box("bracket", xc - 5.5, xc + 5.5, Bf.c[1] + 27, Bf.c[1] + 52, z0 + 38, z0 + 59, { ...o, name: R.nameFor("bracket.beamhead") });
  box("bracket", xc - 5.5, xc + 5.5, Bb.c[1] - 52, Bb.c[1] - 27, z0 + 38, z0 + 59, { ...o, name: R.nameFor("bracket.beamhead") });
  // 梁身
  box("beam", xc - BEAM_W / 2, xc + BEAM_W / 2, Bb.c[1] - 27, Bf.c[1] + 27, z0 + 38, z0 + 38 + BEAM_H, { owner: beamOwner(x), mat: "zhu", name: `beam.sichuanfu${x}` });
  // 缴背，出头作耍头（批竹）
  const jb = 0.5 + (z0 + 38 + BEAM_H);
  box("beam", xc - 5, xc + 5, Bb.c[1] - 27.5, Bf.c[1] + 27.5, jb - 0.5, jb + 14, { owner: beamOwner(x), mat: "zhu", name: `beam.jiaobei${x}` });
  for (const s of [-1, 1]) {
    const yEnd = s > 0 ? Bf.c[1] : Bb.c[1];
    const Fz = { o: [xc, yEnd, z0 + 65], a: [-s, 0, 0], u: [0, s, 0], v: [0, 0, 1] };
    const F2 = G.dot3(G.cross3(Fz.a, Fz.u), [0, 0, 1]) > 0 ? Fz : { ...Fz, a: [s, 0, 0] };
    prism("bracket", F2, [[27.5, 0], [56, 0], [67, 6], [67, 15], [27.5, 15]], -5, 5, { owner: beamOwner(x), mat: "zhubai", name: R.nameFor("bracket.beamshuatou") });
    // 令栱处的空档由耍头填上：耍头底 z0+65 与缴背顶 jb+14≈z0+78 之间对齐（示意）
  }
  // 驼峰 + 大斗 在平槫位置（y=±150），承平梁
  const PING_W = 15, PING_H = 21; // R：平梁 35×25 cm → 21×15
  const pingTop = tuanTop(150) - 2 * BR.tuanR; // 平槫下皮
  const pingBot = pingTop - PING_H;
  for (const s of [-1, 1]) {
    const yc = s * 150;
    const top = jb + 14;
    const dz = pingBot - 10 - top;
    const Fz = { o: [xc, yc, top], a: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] };
    const F2 = G.dot3(G.cross3(Fz.a, Fz.u), [0, 0, 1]) > 0 ? Fz : { ...Fz, a: [-1, 0, 0] };
    prism("beam", F2, [[-30, 0], [30, 0], [22, dz * 0.45], [12, dz], [-12, dz], [-22, dz * 0.45]], -5, 5, { owner: beamOwner(x), mat: "zhu", name: R.nameFor("beam.tuofeng") });
    dou("beam", [xc, yc], [1, 0, 0], [0, 1, 0], 0, 0, 22, 20, top + dz, 10, { owner: beamOwner(x), mat: "zhu" });
  }
  box("beam", xc - PING_W / 2, xc + PING_W / 2, -175, 175, pingBot, pingTop, { owner: beamOwner(x), mat: "zhu", name: `beam.pingliang${x}` });
  // 叉手：从平梁两端斜上到脊槫下，中缝对接
  const jiBot = tuanTop(0) - 2 * BR.tuanR;
  for (const s of [-1, 1]) {
    const Fz = { o: [xc, 0, 0], a: [1, 0, 0], u: [0, s, 0], v: [0, 0, 1] };
    const F2 = G.dot3(G.cross3(Fz.a, Fz.u), [0, 0, 1]) > 0 ? Fz : { ...Fz, a: [-1, 0, 0] };
    prism("beam", F2, [[0, jiBot - 13], [138, pingTop], [138, pingTop + 9], [0, jiBot]], -4.5, 4.5, { owner: beamOwner(x), mat: "zhu", name: R.nameFor("beam.chashou") });
  }
}
// 丁栿：山面中柱斗栱二跳头 → 斜搭在四椽栿缴背上
const JB_TOP = Z0 + 38 + BEAM_H + 0.5 + 14;
for (const B of BRACKETS.filter((b) => b.kind === "gable")) {
  const s = Math.sign(B.x);
  const xIn = s * (150 + 5);
  const Fz = { o: [0, B.c[1], 0], a: [0, 1, 0], u: [s, 0, 0], v: [0, 0, 1] };
  const F2 = G.dot3(G.cross3(Fz.a, Fz.u), [0, 0, 1]) > 0 ? Fz : { ...Fz, a: [0, -1, 0] };
  const xo = Math.abs(B.c[0]);
  prism("beam", F2, [[155, JB_TOP], [155, JB_TOP + 15], [xo - 40, B.z0 + 59], [xo - 40, B.z0 + 38]], -5, 5, { owner: `dingfu.${B.x},${B.y}`, mat: "zhu", name: R.nameFor("beam.dingfu") });
}

// ---------- 6 槫 ----------
const purlinR = BR.tuanR;
const PX = GABLE_X + CHU_JI; // 槫出际到 ±220
const PURLINS = [];
function purlin(from, to, name) {
  PURLINS.push({ a: from, b: to });
  return rod("purlin", from, to, purlinR, { name, mat: "zhu2" });
}
// 橑檐槫：前后、两山，沿替木；转角处前后的出头，两山的抵到前后槫面
const ZT = (B) => B.z0 + 96 + purlinR;
{
  const zf = Z0 + 96 + purlinR;
  for (const s of [-1, 1]) purlin([-397 - 10, s * 347, zf], [397 + 10, s * 347, zf], `purlin.liaoyan${s > 0 ? "F" : "B"}`);
  for (const s of [-1, 1]) purlin([s * 397, -347 + purlinR, zf], [s * 397, 347 - purlinR, zf], `purlin.liaoyan${s > 0 ? "E" : "W"}`);
  // 平槫：前后通长到出际；两山的承椽槫抵在前后平槫上
  const zp = tuanTop(150) - purlinR;
  for (const s of [-1, 1]) purlin([-PX, s * 150, zp], [PX, s * 150, zp], `purlin.ping${s > 0 ? "F" : "B"}`);
  for (const s of [-1, 1]) purlin([s * GABLE_X, -150 + purlinR, zp], [s * GABLE_X, 150 - purlinR, zp], `purlin.ping${s > 0 ? "E" : "W"}`);
  // 脊槫
  purlin([-PX, 0, tuanTop(0) - purlinR], [PX, 0, tuanTop(0) - purlinR], "purlin.ji");
  // 山面承椽槫下的蜀柱（立在丁栿上）
  for (const B of BRACKETS.filter((b) => b.kind === "gable")) {
    const s = Math.sign(B.x);
    const xo = Math.abs(B.c[0]);
    const t = (GABLE_X - 6 - 155) / (xo - 40 - 155);
    const zTopDing = JB_TOP + 15 + (B.z0 + 59 - JB_TOP - 15) * t + 0.2;
    box("purlin", s * GABLE_X - 6, s * GABLE_X + 6, B.c[1] - 6, B.c[1] + 6, zTopDing + 0.3, zp - purlinR, { name: R.nameFor("purlin.shuzhu"), mat: "zhu" });
  }
}

// ---------- 7 椽与角梁 ----------
const ROOF = [];
// 大角梁：从角朵橑檐槫交点到平槫交点，再伸出到檐角
for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
  const lo = [sx * 397, sy * 347, ZL + 0.2];
  const hi = [sx * GABLE_X, sy * 150, tuanTop(150) + 0.2];
  const dir = unit(sub(hi, lo));
  const outward = mul(dir, -1);
  const tail = add(lo, mul(outward, 138));
  const u = unit(G.cross3([0, 0, 1], dir));
  let F = frame(tail, dir, u);
  const len = G.len3(sub(hi, tail));
  const vUp = F.v[2] > 0 ? 1 : -1;
  // 底面压在槫上：在底面取样，量到每根槫轴线的距离，整根抬到刚好相切（留 0.05）
  const segDist = (p, q) => { const ab = sub(q.b, q.a); const t = Math.max(0, Math.min(1, G.dot3(sub(p, q.a), ab) / G.dot3(ab, ab))); return G.len3(sub(p, add(q.a, mul(ab, t)))) - purlinR; };
  for (let iter = 0; iter < 6; iter++) {
    let worst = Infinity;
    for (let t = 0; t <= len; t += 0.7) for (let w = -7; w <= 7; w += 1) {
      const p = add(add(F.o, mul(F.a, t)), mul(F.u, w));
      for (const q of PURLINS) worst = Math.min(worst, segDist(p, q));
    }
    const lift = 0.05 - worst;
    if (Math.abs(lift) < 0.01) break;
    F = { ...F, o: add(F.o, [0, 0, lift]) };
  }
  prism("rafter", F, [[-7, 0], [7, 0], [7, 7 * vUp], [-7, 7 * vUp]], 0, len, { name: `rafter.jiaoliang${sx},${sy}`, mat: "zhu2" });
}
// 正身椽（前后）
const RAFTER_STEP = 21;
function rafterRun(from, to, name) {
  const id = rod("rafter", from, to, RAFTER_R, { name, mat: "zhu2" });
  return id;
}
const zr = (d) => rafterZ(d);
const eaveZ = (d) => zr(d);
for (const s of [-1, 1]) {
  // 脑椽：脊到平槫，x 在 ±(PX-6)
  for (let x = -189; x <= 189 + 0.01; x += RAFTER_STEP) {
    rafterRun([x, s * 4.5, zr(4.5)], [x, s * 150, zr(150)], R.nameFor("rafter.nao"));
  }
  // 檐椽：平槫到檐口；在角部为平行的翼角椽，尾端抵角梁侧
  for (let x = -EAVE_X + 10; x <= EAVE_X - 10 + 0.01; x += RAFTER_STEP) {
    const ax = Math.abs(x);
    let d0 = 150;
    if (ax > GABLE_X - 2) d0 = 150 + (ax - GABLE_X) + 14.55; // 椽尾一角刚好贴上角梁侧面 // 角梁在平面上 y-150 = |x|-200
    if (d0 > EAVE_Y - 16) continue;
    const p0 = [x, s * d0, d0 <= 347 ? zr(d0) : eaveZ(d0)];
    rafterRun(p0, [x, s * EAVE_Y, eaveZ(EAVE_Y)], R.nameFor("rafter.yan"));
  }
}
// 两山的檐椽（沿 x）：从山面平槫到山檐
for (const s of [-1, 1]) {
  for (let y = -EAVE_Y + 10; y <= EAVE_Y - 10 + 0.01; y += RAFTER_STEP) {
    const ay = Math.abs(y);
    let d0 = PX + 1; // 让开出际的槫头：拆的时候椽先走，不能从槫头底下穿出去
    if (ay > 150 - 2) d0 = Math.max(PX + 1, GABLE_X + (ay - 150) + 14.55);
    if (d0 > EAVE_X - 16) continue;
    const dd = (d) => 150 + (d - GABLE_X); // 对应到「距中线」的同一坡
    const z = (d) => (dd(d) <= 347 ? zr(dd(d)) : eaveZ(dd(d)));
    rafterRun([s * d0, y, z(d0)], [s * EAVE_X, y, z(EAVE_X)], R.nameFor("rafter.shan"));
  }
}

// ---------- 8 瓦顶与鸱尾 ----------
// 屋面板：法线方向挤出 SLAB；底面贴在椽上皮
const PANEL_SHAPES = [];
function panel(name, pts3, normalHint, { mat = "wa", rows = null } = {}) {
  // pts3 在底面平面上（凸），按 normalHint 求法线
  const a = sub(pts3[1], pts3[0]);
  const b = sub(pts3[2], pts3[0]);
  let n = unit(G.cross3(a, b));
  if (G.dot3(n, normalHint) < 0) n = mul(n, -1);
  const u = unit(a);
  const F = { o: pts3[0], a: n, u, v: G.cross3(n, u) };
  const poly = pts3.map((p) => [G.dot3(sub(p, F.o), F.u), G.dot3(sub(p, F.o), F.v)]);
  let extra = "";
  if (rows) extra = rows(F, poly);
  PANEL_SHAPES.push(A.prism(F, poly, 0, SLAB));
  return prism("roof", F, poly, 0, SLAB, { name, mat, extra });
}
const rb = (d) => roofBottom(d);
const eaveB = (d) => rb(d);
const RIDGE_GAP = 7;
// 屋面板顶面：沿法线挤出 SLAB，竖直方向厚 SLAB/cosθ；板边上沿在 SLAB·cosθ
const slopeCos = (d) => { const e = 0.5; return Math.cos(Math.atan(Math.abs(rb(d + e) - rb(d - e)) / (2 * e))); };
const TOP_Z = (d) => rb(d) + SLAB / slopeCos(d);
const EDGE_Z = (d) => rb(d) + SLAB * slopeCos(d);
// 瓦垄：在屋面顶面上，沿坡向的成对线（筒瓦两边），从板的一边到另一边；檐口一排瓦当
const QIAO = 9; // 檐角起翘（示意）
function tileRows(F, poly, across, eave = true, pitch = 16.4) {
  const g = [G.dot3(F.u, across), G.dot3(F.v, across)];
  const o = G.dot3(F.o, across);
  const W3 = (uu, vv) => add(add(add(F.o, mul(F.a, SLAB)), mul(F.u, uu)), mul(F.v, vv));
  const vals = poly.map((p) => o + g[0] * p[0] + g[1] * p[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const out = [];
  const caps = [];
  const hit = (c) => {
    const hits = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const a = vals[i] - c, b = vals[(i + 1) % poly.length] - c;
      if (a === b) continue;
      if (a * b <= 0) { const t = a / (a - b); hits.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    if (hits.length < 2) return null;
    hits.sort((m, n) => W3(...m)[2] - W3(...n)[2]);
    return [hits[0], hits[hits.length - 1]];
  };
  const first = Math.ceil((lo + 1) / pitch) * pitch - pitch / 2;
  for (let c = first; c < hi - 1; c += pitch) {
    for (const off of [-4.8, 4.8]) {
      if (c + off <= lo + 0.3 || c + off >= hi - 0.3) continue;
      const h = hit(c + off);
      if (h) out.push(k.segment(W3(...h[0]), W3(...h[1]), P));
    }
    const h = hit(c);
    if (h && eave) {
      const low = W3(...h[0]);
      if (Math.abs(low[2] - Math.min(...poly.map((p) => W3(...p)[2]))) < QIAO + 2) caps.push(at(low));
    }
  }
  return Ln(out.join(""), { tone: "lo" }) + Dots(caps, { size: 1.5, tone: "hi" });
}
const PANELS = [];
function roofPanels(name, pts, hint, across, eave = true) {
  PANELS.push(panel(name, pts, hint, { rows: (F, poly) => tileRows(F, poly, across, eave) }));
}
const eaveFront = eaveB(EAVE_Y);
for (const s of [-1, 1]) {
  // 上段（脊到平槫），x ±PX
  const yEnd = 150 - SLAB * Math.sqrt(1 - slopeCos(75) ** 2);
  const up = [[-PX, s * RIDGE_GAP, rb(RIDGE_GAP)], [PX, s * RIDGE_GAP, rb(RIDGE_GAP)], [PX, s * yEnd, rb(yEnd)], [-PX, s * yEnd, rb(yEnd)]];
  roofPanels(`roof.upper${s}`, up, [0, s, 4], [1, 0, 0], false);
  // 下段：中间一块 + 两角三角（檐角起翘）
  roofPanels(`roof.lower${s}`, [[-GABLE_X, s * 150, rb(150)], [GABLE_X, s * 150, rb(150)], [GABLE_X, s * EAVE_Y, eaveFront], [-GABLE_X, s * EAVE_Y, eaveFront]], [0, s, 4], [1, 0, 0]);
  for (const sx of [-1, 1]) roofPanels(`roof.lowerC${s},${sx}`, [[sx * GABLE_X, s * 150, rb(150)], [sx * EAVE_X, s * EAVE_Y, eaveFront + QIAO], [sx * GABLE_X, s * EAVE_Y, eaveFront]], [0, s, 4], [1, 0, 0]);
}
for (const s of [-1, 1]) {
  // 两山的下段（歇山的「厦两头」）
  const dd = (d) => 150 + (d - GABLE_X);
  const hz = (d) => (dd(d) <= 347 ? rb(dd(d)) : eaveB(dd(d)));
  roofPanels(`roof.side${s}`, [[s * PX, -150, hz(PX)], [s * PX, 150, hz(PX)], [s * EAVE_X, 150, hz(EAVE_X)], [s * EAVE_X, -150, hz(EAVE_X)]], [s, 0, 4], [0, 1, 0]);
  for (const sy of [-1, 1]) roofPanels(`roof.sideC${s},${sy}`, [[s * GABLE_X, sy * 150, hz(GABLE_X)], [s * EAVE_X, sy * EAVE_Y, hz(EAVE_X) + QIAO], [s * EAVE_X, sy * 150, hz(EAVE_X)]], [s, 0, 4], [0, 1, 0]);
}
// 山花板：立在山面平槫上，夹在前后平槫之间，顶到脊槫下皮；两斜边贴着上段屋面板底
for (const s of [-1, 1]) {
  const base = tuanTop(150) + 0.1;
  const top = tuanTop(0) - 2 * BR.tuanR - 0.3;
  const yb = 150 - BR.tuanR - 0.6;
  // 屋面板底在 y 处的高度（上段，线性）：rb(y)；求 rb(y) - 0.5 = top 的 y
  const under = (y) => rb(y) - 0.5;
  const yt = 150 * (under(0) - top) / (under(0) - under(150));
  const Fz = { o: [s * GABLE_X, 0, 0], a: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] };
  prism("purlin", Fz, [[-yb, base], [yb, base], [yb, under(yb)], [yt, top], [-yt, top], [-yb, under(yb)]], s > 0 ? -3 : 0, s > 0 ? 0 : 3, { name: `purlin.shanhua${s}`, mat: "bai" });
}
// 正脊、垂脊、戗脊

{
  let zr0 = EDGE_Z(RIDGE_GAP) - 0.05;
  for (let iter = 0; iter < 6; iter++) {
    let worst = Infinity;
    for (let x = -PX; x <= PX; x += 20) for (let y = -13; y <= 13; y += 0.5) for (const shape of PANEL_SHAPES) worst = Math.min(worst, A.sdf(shape, [x, y, zr0]));
    const lift = 0.05 - worst;
    if (Math.abs(lift) < 0.01) break;
    zr0 += lift;
  }
  const ridgeH = 22;
  const ridgeHalf = 13;
  box("roof", -PX, PX, -ridgeHalf, ridgeHalf, zr0, zr0 + ridgeH, { mat: "wa", name: "roof.zhengji", inner: Ln([zr0 + 7, zr0 + 14].map((z) => k.sideSeam({ x: -PX, y: -ridgeHalf, w: 2 * PX, d: 2 * ridgeHalf, r: 0.6 }, z, P, 2)).join(""), { tone: "lo" }) });
  // 鸱尾：脊两端
  for (const s of [-1, 1]) {
    const x0 = s * (PX - 2);
    const zb = zr0 + ridgeH;
    const h = M.CHIWEI_H;
    // 侧影在 (x,z) 平面（u 指向脊中，v 向上），沿 y 有厚度；按高度切成四块凸件，顶上向内卷
    const Fz = { o: [x0, 0, zb], a: [0, 1, 0], u: [-s, 0, 0], v: [0, 0, 1] };
    const F2 = G.dot3(G.cross3(Fz.a, Fz.u), [0, 0, 1]) > 0 ? Fz : { ...Fz, a: [0, -1, 0] };
    const q = h / 86;
    const bands = [
      [[[-6, 0], [34, 0], [28, 30], [-8, 30]], 9],
      [[[-8, 30], [28, 30], [20, 58], [-4, 58]], 7.5],
      [[[-4, 58], [20, 58], [30, 76], [6, 76]], 6],
      [[[6, 76], [30, 76], [44, 86], [20, 86]], 4.5],
    ];
    bands.forEach(([poly, t], i) => {
      const pts = poly.map(([u, v]) => [u, v * q]);
      // 鳍纹：每块侧面上三条从下沿到上沿的线
      const face = F2.a[1] * V[1] > 0 ? t : -t;
      const lines = [];
      for (const f of [0.2, 0.45, 0.7]) {
        const p0 = [pts[0][0] + (pts[1][0] - pts[0][0]) * f, pts[0][1]];
        const p1 = [pts[3][0] + (pts[2][0] - pts[3][0]) * f, pts[3][1]];
        const w = (uv) => add(add(add(F2.o, mul(F2.a, face)), mul(F2.u, uv[0])), mul(F2.v, uv[1]));
        lines.push(k.segment(w(p0), w(p1), P));
      }
      prism("roof", F2, pts, -t, t, { name: `roof.chiwei${s}#${i}`, mat: "wa", extra: Ln(lines.join(""), { tone: "lo" }) });
    });
  }
  // 垂脊：沿上段屋面在出际端，从脊到平槫
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const a0 = [sx * (PX - 7), sy * 13.3, TOP_Z(13.3)];
    const a1 = [sx * (PX - 7), sy * 141, TOP_Z(141)];
    const dir = unit(sub(a1, a0));
    let F = frame(a0, dir, [1, 0, 0]);
    const vUp = F.v[2] > 0 ? 1 : -1;
    const L = G.len3(sub(a1, a0));
    for (let iter = 0; iter < 6; iter++) {
      let worst = Infinity;
      for (let t = 0; t <= L; t += 1) for (let w = -7; w <= 7; w += 1) {
        const p = add(add(F.o, mul(F.a, t)), mul(F.u, w));
        for (const shape of PANEL_SHAPES) worst = Math.min(worst, A.sdf(shape, p));
      }
      const lift = 0.05 - worst;
      if (Math.abs(lift) < 0.01) break;
      F = { ...F, o: add(F.o, [0, 0, lift]) };
    }
    prism("roof", F, [[-7, 0], [7, 0], [7, 14 * vUp], [-7, 14 * vUp]], 0, L, { name: `roof.chuiji${sx},${sy}`, mat: "wa" });
  }
  // 戗脊：沿斜脊，从 (200,150) 到檐角
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const a0 = [sx * PX, sy * (150 + PX - GABLE_X), rb(150 + PX - GABLE_X) + SLAB * slopeCos(250) - 0.05];
    const a1 = [sx * EAVE_X, sy * EAVE_Y, eaveB(EAVE_Y) + QIAO + SLAB * slopeCos(250) - 0.05];
    const dir = unit(sub(a1, a0));
    let F = frame(a0, dir, unit(G.cross3([0, 0, 1], dir)));
    const vUp = F.v[2] > 0 ? 1 : -1;
    const L = G.len3(sub(a1, a0));
    // 戗脊压在两片屋面的接缝上：底面取样量到屋面板的距离，抬到刚好相切
    for (let iter = 0; iter < 6; iter++) {
      let worst = Infinity;
      for (let t = 0; t <= L; t += 1) for (let w = -8; w <= 8; w += 1) {
        const p = add(add(F.o, mul(F.a, t)), mul(F.u, w));
        for (const shape of PANEL_SHAPES) worst = Math.min(worst, A.sdf(shape, p));
      }
      const lift = 0.05 - worst;
      if (Math.abs(lift) < 0.01) break;
      F = { ...F, o: add(F.o, [0, 0, lift]) };
    }
    prism("roof", F, [[-8, 0], [8, 0], [8, 13 * vUp], [-8, 13 * vUp]], 0, L, { name: `roof.qiangji${sx},${sy}`, mat: "wa" });
  }
}

// ---------- 9 墙与门窗 ----------
const WALL_T = 40;
const WALL_TOP = Z0 - LANE_H;
const gap = (x, y) => Math.max(halfW(x, y) + 5.5, isCorner(x, y) ? WALL_T / 2 + 0.4 : 0);
function wallSeg(piece, p, q, { kind = "wall" } = {}) {
  const alongX = p[1] === q[1];
  const z0 = ZB;
  const z1 = WALL_TOP - 0.3;
  if (alongX) {
    const s = Math.sign(q[0] - p[0]);
    const xa = p[0] + s * gap(...p);
    const xb = q[0] - s * gap(...q);
    const y = p[1];
    const y0 = y - WALL_T / 2, y1 = y + WALL_T / 2;
    if (kind === "wall") box(piece, xa, xb, y0, y1, z0, z1, { mat: "bai", name: R.nameFor(`${piece}.wall`), extra: "", inner: Ln(k.sideSeam({ x: Math.min(xa, xb), y: y0, w: Math.abs(xb - xa), d: WALL_T, r: 0.6 }, z0 + 24, P, 2), { tone: "faint" }) });
    return { xa, xb, y0, y1, z0, z1 };
  }
  const s = Math.sign(q[1] - p[1]);
  const ya = p[1] + s * gap(...p);
  const yb = q[1] - s * gap(...q);
  const x = p[0];
  const x0 = x - WALL_T / 2, x1 = x + WALL_T / 2;
  if (kind === "wall") box(piece, x0, x1, ya, yb, z0, z1, { mat: "bai", name: R.nameFor(`${piece}.wall`), inner: Ln(k.sideSeam({ x: x0, y: Math.min(ya, yb), w: WALL_T, d: Math.abs(yb - ya), r: 0.6 }, z0 + 24, P, 2), { tone: "faint" }) });
  return { ya, yb, x0, x1, z0, z1 };
}
// 后檐与两山：整片墙（白粉），下肩一道线
for (let i = 0; i < 3; i++) wallSeg("wallB", [XS[i], -300], [XS[i + 1], -300]);
for (let i = 0; i < 3; i++) wallSeg("wallE", [350, YS[i]], [350, YS[i + 1]]);
for (let i = 0; i < 3; i++) wallSeg("wallW", [-350, YS[i]], [-350, YS[i + 1]]);
// 前檐：次间破子棂窗，明间板门
for (const [p, q] of [[[-350, 300], [-150, 300]], [[150, 300], [350, 300]]]) {
  const g = wallSeg("wallF", p, q, { kind: "frame" });
  const xa = Math.min(g.xa, g.xb), xb = Math.max(g.xa, g.xb);
  const sill = ZB + 78; // 窗下肩（示意）
  const head = WALL_TOP - 30;
  const wx0 = xa + 34, wx1 = xb - 34;
  box("wallF", xa, xb, g.y0, g.y1, ZB, sill, { mat: "bai", name: R.nameFor("wallF.xiajian"), inner: Ln(k.sideSeam({ x: xa, y: g.y0, w: xb - xa, d: WALL_T, r: 0.6 }, ZB + 24, P, 2), { tone: "faint" }) });
  box("wallF", xa, wx0, g.y0, g.y1, sill, head, { mat: "bai", name: R.nameFor("wallF.pier") });
  box("wallF", wx1, xb, g.y0, g.y1, sill, head, { mat: "bai", name: R.nameFor("wallF.pier") });
  box("wallF", xa, xb, g.y0, g.y1, head, g.z1, { mat: "bai", name: R.nameFor("wallF.lintel") });
  // 窗框：窗槛、窗额、立颊（在墙中线）
  const fy0 = 300 - 6, fy1 = 300 + 6;
  box("wallF", wx0, wx1, fy0, fy1, sill, sill + 8, { mat: "zhu", name: R.nameFor("wallF.kan") });
  box("wallF", wx0, wx1, fy0, fy1, head - 8, head, { mat: "zhu", name: R.nameFor("wallF.e") });
  box("wallF", wx0, wx0 + 8, fy0, fy1, sill + 8, head - 8, { mat: "zhu", name: R.nameFor("wallF.jia") });
  box("wallF", wx1 - 8, wx1, fy0, fy1, sill + 8, head - 8, { mat: "zhu", name: R.nameFor("wallF.jia") });
  // 破子棂：九根三角截面（R：每樘用断面三角形棂条九根）
  const n = 9;
  const span = wx1 - 8 - (wx0 + 8);
  for (let i = 0; i < n; i++) {
    const cx = wx0 + 8 + (span * (i + 0.5)) / n;
    const F = { o: [cx, 300, sill + 8], a: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] };
    prism("wallF", F, [[-3, -2], [3, -2], [0, 4]], 0, head - 8 - (sill + 8), { name: R.nameFor("wallF.ling"), mat: "lv" });
  }
}
{
  // 明间板门：门额、门槛、立颊、两扇门（门钉三路）
  const g = wallSeg("wallF", [-150, 300], [150, 300], { kind: "frame" });
  const xa = Math.min(g.xa, g.xb), xb = Math.max(g.xa, g.xb);
  const doorTop = WALL_TOP - 34;
  const dx0 = -92, dx1 = 92;
  box("wallF", xa, dx0, g.y0, g.y1, ZB, g.z1, { mat: "bai", name: "wallF.door-pierW" });
  box("wallF", dx1, xb, g.y0, g.y1, ZB, g.z1, { mat: "bai", name: "wallF.door-pierE" });
  box("wallF", dx0, dx1, g.y0, g.y1, doorTop + 10, g.z1, { mat: "bai", name: "wallF.door-lintel" });
  box("wallF", dx0, dx1, 300 - 7, 300 + 7, doorTop, doorTop + 10, { mat: "zhu", name: "wallF.men-e" });
  box("wallF", dx0, dx1, 300 - 7, 300 + 7, ZB, ZB + 9, { mat: "zhu", name: "wallF.menkan" });
  box("wallF", dx0, dx0 + 9, 300 - 7, 300 + 7, ZB + 9, doorTop, { mat: "zhu", name: "wallF.jiaW" });
  box("wallF", dx1 - 9, dx1, 300 - 7, 300 + 7, ZB + 9, doorTop, { mat: "zhu", name: "wallF.jiaE" });
  const lx0 = dx0 + 9, lx1 = dx1 - 9;
  const mid = (lx0 + lx1) / 2;
  for (const [a, b, side] of [[lx0, mid, "W"], [mid, lx1, "E"]]) {
    const y0 = 300 + 1, y1 = 300 + 5;
    const nails = [];
    const rows = 3; // R：门钉三路
    for (let r = 0; r < rows; r++) {
      const z = ZB + 9 + ((doorTop - ZB - 9) * (r + 1)) / (rows + 1);
      for (let c = 0; c < 4; c++) nails.push(at([a + ((b - a) * (c + 0.5)) / 4, y1, z]));
    }
    const ring = side === "W" ? [at([b - 7, y1, ZB + 9 + (doorTop - ZB - 9) * 0.48])] : [at([a + 7, y1, ZB + 9 + (doorTop - ZB - 9) * 0.48])];
    box("wallF", a + 0.3, b - 0.3, y0, y1, ZB + 9, doorTop, { mat: "zhu", name: `wallF.leaf${side}`, extra: Dots(nails, { size: 1.5, tone: "hi" }) + Dots(ring, { size: 2.6, tone: "hi" }) });
  }
}

// ---------- 定序与审计 ----------
const t0 = Date.now();
const PROBE = process.argv.find((a) => a.startsWith("--probe="));
if (PROBE) {
  const n = Number(PROBE.slice(8));
  const all = A.explodeStates(STAGGER, SPRING).depth;
  const t = Date.now();
  A.overlapsOf(R.items.slice(), P, { states: all.slice(0, n), skip: A.sameRun });
  console.log(`probe ${n} of ${all.length} states: ${Date.now() - t} ms`);
  process.exit(0);
}
// 状态集：全部零件只做竖直平移、高层先走、弹簧临界阻尼不过冲，所以任何一帧都夹在 prefix 状态之间（kit 自己的覆盖论证）。
// 为了让审计在一小时内跑完，深度定序用 均匀 11 个 + prefix 全部 + 每 12 帧取一帧的开合回放；穿插检查用 prefix + 每 4 帧一帧。
const uniform = Array.from({ length: 11 }, (_, i) => i / 10);
const prefix = A.prefixStates(STAGGER);
const DEPTH_STATES = [...uniform, ...prefix, ...A.springStates(STAGGER, { ...SPRING, stride: 12 })];
const FRAME_STATES = [...prefix, ...A.springStates(STAGGER, { ...SPRING, stride: 4 })];
const KIT = process.argv.includes("--kit-states");
A.settle(R, P, QUICK ? { states: [0, 1] } : KIT ? {} : { states: DEPTH_STATES });
R.items.sort((a, b) => a.key - b.key);
const settleMs = Date.now() - t0;

const groups = R.items.map((item, index) => {
  const [mx, my, mz] = item.move;
  return `<g class="it m-${MAT.get(item.name) ?? "zhu"}" data-piece="${item.piece}" data-step="${STEP_OF.get(item.name)}" data-k="${item.key.toFixed(2)}" data-m="${mx.toFixed(1)},${my.toFixed(1)},${mz.toFixed(1)}" data-i="${index}">${item.svg}</g>`;
});

// ---------- 剖视窗（斗栱放大） ----------
const inset = (await import("./inset.mjs")).buildInset({ k, G, M, AZIMUTH, ELEVATION });

// ---------- 页面 ----------
const LABEL = "山西五台南禅寺大殿（唐建中三年 782 年重建）的等轴模型：台基、十二根檐柱、阑额、十二朵五铺作柱头斗栱、两缝四椽栿与平梁叉手、五槫、椽与角梁、单檐歇山瓦顶与鸱尾、白墙板门破子棂窗。按步骤可以一层层搭起来、拆开、再装回。";
const svgMain = k.figureSvg({ width: W, height: H, label: LABEL, body: [back.join(""), `<g class="nc-house">${halo.join("")}${groups.join("")}</g>`, front.join("")], className: "nc-svg" });

const STEPS = M.STEPS.map((s) => ({ id: s.id, name: s.name, hint: s.hint, sound: s.sound, part: s.part }));
const sayText = Object.fromEntries(M.STEPS.map((s) => [s.id, [12, 14, 16.5, 18, 20].map((mm) => [mm, s.say(mm)])]));
const unitV = (v) => {
  const o = at([0, 0, 0]);
  const p = at(v);
  return [p[0] - o[0], p[1] - o[1]];
};
// 象声词落点：每步动作所在的屏幕位置（viewBox）
const SOUND_AT = {
  base: at([-300, 300, ZB]),
  column: at([150, 300, ZB + 160]),
  lane: at([-250, 300, Z0 + 10]),
  bracket: at([150, 300, Z0 + 90]),
  beam: at([150, 0, Z0 + 130]),
  purlin: at([0, 150, tuanTop(150) + 20]),
  rafter: at([300, 380, ZL + 20]),
  roof: at([PX, 0, TOP_Z(0) + 110]),
  wall: at([0, 330, ZB + 120]),
  apart: at([0, 0, ZL + 260]),
  again: at([0, 0, ZL + 200]),
};
const centre = at([0, 0, 0]);
const DATA = {
  W, H, V,
  EX: unitV([1, 0, 0]), EY: unitV([0, 1, 0]), EZ: unitV([0, 0, 1]),
  pieces: Object.keys(PIECES),
  stagger: STAGGER,
  spring: SPRING,
  stepPieces: STEP_PIECES,
  steps: STEPS,
  say: sayText,
  soundAt: SOUND_AT,
  anchor: centre,
  speedNote: M.SPEED_NOTE,
  zooms: {
    bracket: at([150, 300 + 30, Z0 + 50]),
    bracketCorner: at([350, 300, Z0 + 50]),
    joint: at([150, 300, Z0 - 12]),
    eaveCorner: at([EAVE_X, EAVE_Y, ZL - 10]),
    chiwei: at([PX, 0, TOP_Z(0) + 60]),
    chiweiW: at([-PX, 0, TOP_Z(0) + 60]),
    door: at([0, 320, ZB + 90]),
    window: at([250, 320, ZB + 110]),
    rafterCorner: at([400, 400, ZL]),
    beam: at([150, 0, Z0 + 120]),
  },
  load: M.LOAD_PATH,
  fen: M.FEN_MM,
  overall: Object.fromEntries([12, 13, 14, 15, 16, 16.5, 17, 18, 19, 20].map((mm) => [mm, M.overall(mm)])),
  chips: { column: M.COLUMN_H, eave: M.EAVE_OUT, ju: M.JU_H, bracket: M.BRACKET_H, cai: M.CAI, ratio: J.ratio },
};

const buttons = STEPS.map((s, i) => `<button type="button" class="nc-step" data-step="${s.id}" data-i="${i}" disabled><span class="nc-num">${i + 1}</span><span class="nc-name">${s.name}</span></button>`).join("");
const controls = `<aside class="nc-side">
  <div class="nc-mode" role="group" aria-label="播放方式"><button type="button" data-mode="manual" aria-pressed="true">手动</button><button type="button" data-mode="auto" aria-pressed="false">自动</button></div>
  <div class="nc-mode nc-theme" role="group" aria-label="白天或黑夜"><button type="button" data-theme-set="light" aria-pressed="${THEME === "light"}">白天</button><button type="button" data-theme-set="dark" aria-pressed="${THEME === "dark"}">黑夜</button></div>
  <div class="nc-steps">${buttons}</div>
  <a href="#" class="nc-reset" data-reset>从头来</a>
  ${inset.html}
</aside>`;
const chips = `<div class="nc-chips" data-chips>
  <span class="nc-chip"><b>当前</b><i data-chip="part">台基</i></span>
  <span class="nc-chip"><b>分值</b><i data-chip="fen">1 分 = 16.5 mm</i></span>
  <span class="nc-chip"><b>材</b><i data-chip="cai">15×10 分 = 24.8×16.5 cm</i></span>
  <span class="nc-chip"><b>柱高</b><i data-chip="column">236 分 = 3.90 m</i></span>
  <span class="nc-chip"><b>出檐</b><i data-chip="eave">142 分 = 2.34 m · 示意</i></span>
  <span class="nc-chip"><b>举高</b><i data-chip="ju">130 分 = 2.15 m · 1:5.34</i></span>
</div>`;
const slider = `<label class="nc-slider"><span>换一把尺子：1 分 =</span><input type="range" min="12" max="20" step="0.5" value="16.5" data-fen aria-label="分值，毫米"><output data-fen-out>16.5 mm</output><em data-fen-note>实测（张荣 2022）</em></label>`;
const corners = `<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">南禅寺大殿 · 唐 782</span><span class="iso-plate-corner" data-corner="hint">按左边亮着的那一步</span><span class="iso-plate-corner" data-corner="readout" data-readout>还是一块空地</span></div>`;
const stage = `<div class="nc-stage" tabindex="0" role="group" aria-label="南禅寺大殿搭建演示。左侧按钮按顺序一步步搭起来；空格键按下一步。">
  <div class="nc-tiprow"><div class="nc-tip" data-tip aria-live="polite">先把地基夯结实。按「1 夯台基」。</div><div class="nc-speed" data-speed hidden>${M.SPEED_NOTE}</div></div>
  ${svgMain}
  <div class="nc-sound" data-sound aria-hidden="true"></div>
</div>`;
const caption = `一句话：<strong>整座殿可以用一把尺子量出来——材。</strong>图里每个零件都按「分」建（1 分 = 材广的十五分之一，这里取 16.5 mm）：明间 300 分，次间和进深各 200 分，柱高 13 尺，斗栱层高 95 分，举高 130 分。<span class="nc-small">以宋《营造法式》（1103 年刊行）的材分回量这座唐构，是今人的分析方法（祁英涛、柴泽俊 1980；张荣等 2022），不是唐人留下的图纸。殿内没有一根内柱：两根四椽栿从前檐跨到后檐，屋顶的重量经斗栱一层层落到 12 根檐柱上。出檐、台基外轮廓、生起、阑额截面、门钉与椽的数量为示意。</span>`;
const legend = `<figcaption class="iso-legend"><div class="nc-swatches"><span><i class="sw sw-zhu"></i>土朱：柱、额、斗栱</span><span><i class="sw sw-bai"></i>白粉：墙、栱头</span><span><i class="sw sw-wa"></i>灰瓦</span><span><i class="sw sw-shi"></i>青灰石</span></div><span class="iso-caption">${caption}</span></figcaption>`;
const body = `<figure class="iso-figure nc"><div class="iso-plate">${corners}<div class="nc-layout">${controls}<div class="nc-main">${stage}${chips}${slider}</div></div></div>${legend}</figure>`;

const CSS = readFileSync(join(HERE, "nanchan.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA)) + inset.script;
const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;600&display=swap" rel="stylesheet">`;
const page = k.pageHtml({ title: "南禅寺大殿", theme: THEME, body: `${fonts}<style>${CSS}</style>${body}`, script: kitScript() + LIVE, width: 1240 });
const name = THEME === "light" ? "nanchan-light.html" : "nanchan.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `settle ${settleMs} ms`);

if (process.argv.includes("--audit")) console.log(`states: depth ${DEPTH_STATES.length} (kit default ${A.explodeStates(STAGGER, SPRING).depth.length}) · frames ${FRAME_STATES.length} (kit default ${A.explodeStates(STAGGER, SPRING).frames.length})`);
A.auditOrExit(R, P, KIT ? { crowd: [] } : { crowd: [], frames: FRAME_STATES });
