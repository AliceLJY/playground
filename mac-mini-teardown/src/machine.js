// Mac mini 拆解台 · 几何。整台机器由代码搭出（没有模型文件），update(s) 按 model.pose(s) 摆每个零件。
// 每个零件的几何按它在 model.PARTS 里的静止中心搭，矩阵直接取模型给的 R 与 p。
import * as THREE from 'three';
import { mergeGeometries as mergeRaw } from 'three/addons/utils/BufferGeometryUtils.js';
// 拉伸体没有索引、圆柱和方块有：统一去掉索引再合并
const mergeGeometries = (gs) => mergeRaw(gs.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.clearGroups(); return n; }));
import * as M from './model.js';

export const ACCENT = new THREE.Color(0xe0602a);
const INK = 0x2b2a28;

function rrect(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const holePath = (w, d, r) => { const s = rrect(w, d, r); const p = new THREE.Path(s.getPoints(12).reverse()); return p; };
/** 圆角方板：xz 平面，厚度沿 +y（从 y0 到 y0+h） */
function slab(w, d, r, h, y0 = 0, hole = null, curve = 10) {
  const sh = rrect(w, d, r); if (hole) sh.holes.push(holePath(...hole));
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: curve });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g;
}
const boxG = (sx, sy, sz, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); return g; };
const cylG = (r, h, x = 0, y = 0, z = 0, seg = 24, axis = 'y') => {
  const g = new THREE.CylinderGeometry(r, r, h, seg); if (axis === 'z') g.rotateX(Math.PI / 2); if (axis === 'x') g.rotateZ(Math.PI / 2); g.translate(x, y, z); return g;
};

function mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...o }); }
function labelTex(lines, w = 256, h = 128, bg = null, fg = '#2b2a28', size = 34) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${size}px "SF Mono", Menlo, monospace`;
  lines.forEach((t, i) => g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildMachine() {
  const root = new THREE.Group();
  const parts = {}; // id → { g, mats:[{m, base, op}], lines }
  const lineMat = () => new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.55 });

  function part(id, center) {
    const g = new THREE.Group(); g.matrixAutoUpdate = false; root.add(g);
    const P = { g, mats: [], lines: [], lineMat: lineMat(), center, hi: -1, op: -1 };
    parts[id] = P; return P;
  }
  function add(P, geo, m, { edges = 28, shadow = true, at = null } = {}) {
    geo.translate(-P.center[0], -P.center[1], -P.center[2]);
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = shadow; mesh.receiveShadow = true;
    (at || P.g).add(mesh);
    if (!P.mats.find((x) => x.m === m)) P.mats.push({ m, color: m.color.clone(), emissive: m.emissive ? m.emissive.clone() : null, op: m.opacity });
    if (edges) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, edges), P.lineMat); (at || P.g).add(l); P.lines.push(l); }
    return mesh;
  }
  const C = (id) => { const b = M.PARTS[id].box; return [b[0], b[1], b[2]]; };

  // ---------- 机身：顶皮 + 四壁一体，铝 ----------
  const HALF = M.SPEC.width / 2, R0 = 16;
  {
    const P = part('skin', C('skin'));
    const alu = mat(0xe4e3e0, { roughness: 0.5, metalness: 0.04 });
    add(P, slab(127, 127, R0, 2.5, 0, null, 14), alu);
    add(P, slab(127, 127, R0, 47.5, 2.5, [121.8, 121.8, R0 - 2.6], 14), alu);
    // 接口（示意）：正面两个 USB-C 和耳机孔，背面电源、网口、HDMI、三个雷雳
    const dark = mat(0x2a2a2c, { roughness: 0.5 });
    const port = (w, h, r, x, y, z) => { const g = slab(w, h, r, 0.25, 0, null, 6); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g; };
    const ports = [port(8.4, 2.8, 1.3, -1, 34, HALF + 0.1), port(8.4, 2.8, 1.3, 10, 34, HALF + 0.1), cylG(1.8, 0.4, -17.5, 34, HALF + 0.05, 20, 'z'),
      cylG(4.4, 0.4, 44, 30, -HALF - 0.05, 24, 'z'), port(16, 13, 1, 22, 30, -HALF - 0.1), port(14.5, 5.2, 1, 2, 34, -HALF - 0.1),
      port(8.4, 2.8, 1.3, -14, 34, -HALF - 0.1), port(8.4, 2.8, 1.3, -26, 34, -HALF - 0.1), port(8.4, 2.8, 1.3, -38, 34, -HALF - 0.1)];
    add(P, mergeGeometries(ports), dark, { edges: 0, shadow: false });
  }
  // ---------- 电源（示意）、主板 ----------
  {
    const P = part('psu', C('psu')); const b = M.PARTS.psu.box;
    add(P, slab(b[3], b[5], 8, b[4], b[1] - b[4] / 2, null, 6), mat(0xdedcd7));
  }
  {
    const P = part('board', C('board')); const b = M.PARTS.board.box;
    add(P, slab(b[3], b[5], 12, b[4], b[1] - b[4] / 2, null, 8), mat(0xcfcbc2, { roughness: 0.75 }));
    // 风扇底下那片空出来的地方：一些低矮元件（示意，比风扇底面低得多）
    const y = b[1] + b[4] / 2, parts2 = [];
    const spots = [[8, 12, 7, 5], [22, 10, 4, 4], [34, 14, 9, 6], [46, 9, 5, 7], [14, 26, 5, 5], [30, 30, 11, 8], [46, 30, 6, 4], [8, 42, 9, 6], [24, 46, 5, 5], [40, 46, 10, 7], [52, 44, 3, 6], [-50, -30, 6, 10], [-54, -10, 4, 6]];
    for (const [x, z, w, d] of spots) parts2.push(boxG(w, 0.9, d, x, y + 0.45, z));
    add(P, mergeGeometries(parts2), mat(0x47474a, { roughness: 0.5 }), { edges: 0 });
  }
  // ---------- M4 与内存颗粒（在散热片底下） ----------
  {
    const P = part('m4', C('m4')); const b = M.PARTS.m4.box, y0 = b[1] - b[4] / 2;
    add(P, boxG(22, 0.8, 22, b[0], y0 + 0.4, b[2]), mat(0x3b3b3d));
    add(P, boxG(14, 1.2, 14, b[0], y0 + 1.4, b[2]), mat(0xbdbcb8, { metalness: 0.5, roughness: 0.35 }));
  }
  for (const id of ['ramA', 'ramB']) {
    const P = part(id, C(id)); const b = M.PARTS[id].box;
    add(P, boxG(b[3], b[4], b[5], b[0], b[1], b[2]), mat(0x2e2e30, { roughness: 0.4 }));
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(b[3] - 3, b[5] - 3), new THREE.MeshBasicMaterial({ map: labelTex(['LPDDR5'], 256, 96, null, '#cfcdc7', 46), transparent: true }));
    lab.rotation.x = -Math.PI / 2; lab.position.set(0, b[4] / 2 + 0.02, 0); P.g.add(lab);
  }
  // ---------- 散热片：底座 + 鳍片（找内存那一拍变 X 光） ----------
  {
    const P = part('heatsink', C('heatsink')); const b = M.PARTS.heatsink.box;
    const y0 = b[1] - b[4] / 2, y1 = b[1] + b[4] / 2, z0 = b[2] - b[5] / 2, z1 = b[2] + b[5] / 2;
    const gs = [boxG(b[3], 2.2, b[5], b[0], y0 + 1.1, b[2]), boxG(b[3], 1.2, 6, b[0], y0 + 2.8, z1 - 3)];
    for (let i = 0; i < 24; i++) gs.push(boxG(0.8, y1 - y0 - 2.2, z1 - 8 - z0, b[0] - b[3] / 2 + 2 + i * ((b[3] - 4) / 23), y0 + 2.2 + (y1 - y0 - 2.2) / 2, z0 + (z1 - 8 - z0) / 2));
    add(P, mergeGeometries(gs), mat(0xd8d7d3, { roughness: 0.45, metalness: 0.45 }), { edges: 40 });
  }
  // ---------- SSD 插槽、SSD 模块、耳机孔、ZIF 插座 ----------
  {
    const P = part('socket', C('socket')); const b = M.PARTS.socket.box;
    add(P, boxG(b[3], b[4], b[5], b[0], b[1], b[2]), mat(0x2c2c2e, { roughness: 0.5 }));
  }
  {
    const P = part('ssd', C('ssd')); const b = M.PARTS.ssd.box, y0 = b[1] - b[4] / 2, z0 = b[2] - b[5] / 2;
    add(P, boxG(b[3], 0.8, b[5], b[0], b[1], b[2]), mat(0x4b5350, { roughness: 0.55 }));
    // 正面（朝上）一颗闪存，背面一颗闪存加一个电源管理芯片（iFixit 178986 第 6–7 步）
    const nandM = mat(0x3f3f42, { roughness: 0.35 });
    add(P, boxG(16, 0.3, 18, b[0] + 2, b[1] + 0.55, b[2] + 4), nandM);
    add(P, boxG(16, 0.3, 18, b[0] + 2, b[1] - 0.55, b[2] + 4), nandM);
    add(P, boxG(6, 0.3, 6, b[0] - 8, b[1] - 0.55, b[2] - 12), nandM, { edges: 0 });
    for (const sgn of [1, -1]) {
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(13, 12), new THREE.MeshBasicMaterial({ map: labelTex(['NAND', '128 GB'], 256, 236, null, '#d6d3cc', 52), transparent: true }));
      lab.rotation.x = -sgn * Math.PI / 2; lab.position.set(2, sgn * 0.72, 4); P.g.add(lab);
    }
    add(P, boxG(30, 0.9, 3.4, b[0], b[1], z0 + 1.9), mat(0xe0b95c, { roughness: 0.35, metalness: 0.25, emissive: 0x3a2a08 }), { edges: 0 }); // 金手指，插槽那一端
    add(P, cylG(2.6, 0.82, b[0], b[1], b[2] + b[5] / 2 - 4, 20), mat(0xe0b95c, { roughness: 0.35, metalness: 0.25 }), { edges: 0 }); // 螺丝位
  }
  {
    const P = part('jack', C('jack')); const b = M.PARTS.jack.box;
    add(P, boxG(b[3], b[4] - 3, b[5], b[0], b[1] - 1.5, b[2]), mat(0x3a3a3c));
    add(P, cylG(3.6, b[5], b[0], b[1] + 1, b[2], 20, 'z'), mat(0x3a3a3c));
  }
  let zifTape, zifLock;
  {
    const P = part('zif', C('zif')); const b = M.PARTS.zif.box;
    add(P, boxG(b[3], b[4], b[5], b[0], b[1], b[2]), mat(0x2c2c2e));
    zifLock = new THREE.Group(); zifLock.position.set(0, b[4] / 2, -b[5] / 2); P.g.add(zifLock);
    const lock = new THREE.Mesh(boxG(b[3], 0.5, 2.6, 0, 0.25, 1.3), mat(0x56565a)); zifLock.add(lock);
    zifTape = new THREE.Group(); zifTape.position.set(-b[3] / 2 - 1, b[4] / 2 + 0.6, 0); P.g.add(zifTape);
    zifTape.add(new THREE.Mesh(boxG(12, 0.15, 8, 6, 0, 0), new THREE.MeshStandardMaterial({ color: 0xd9a24b, transparent: true, opacity: 0.75, roughness: 0.3 })));
  }
  // ---------- 风扇：外壳、叶轮、上盖 ----------
  {
    const P = part('fan', C('fan')); const b = M.PARTS.fan.box;
    const cx = b[0], cz = b[2], y0 = b[1] - b[4] / 2, y1 = b[1] + b[4] / 2, h = y1 - y0;
    const white = mat(0xf2f1ed, { roughness: 0.55 });
    add(P, (() => { const g = slab(b[3], b[5], 10, 1.2, y0, null, 8); g.translate(cx, 0, cz); return g; })(), white);
    add(P, (() => { const g = slab(b[3], b[5], 10, 1.2, y1 - 1.2, [46, 46, 23], 10); g.translate(cx, 0, cz); return g; })(), white);
    const ring = new THREE.CylinderGeometry(27, 27, h - 2.4, 48, 1, true); ring.translate(cx + 2, y0 + h / 2, cz + 2);
    add(P, ring, mat(0xeae9e5, { side: THREE.DoubleSide }), { edges: 0 });
    const blades = [cylG(9, h - 4, cx + 2, y0 + h / 2, cz + 2, 32)];
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2, g = boxG(12, h - 4.4, 0.6, 16, 0, 0); g.rotateY(a + 0.35); g.translate(cx + 2, y0 + h / 2, cz + 2); blades.push(g); }
    add(P, mergeGeometries(blades), mat(0x8f8d89, { roughness: 0.5 }), { edges: 0 });
    // 上盖上的贴纸
    const lab = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshBasicMaterial({ map: labelTex(['FAN'], 128, 128, '#e6e4df', '#77736c', 30) }));
    lab.rotation.x = -Math.PI / 2; lab.position.set(cx + 2 - b[0], y1 + 0.02 - b[1], cz + 2 - b[2]); P.g.add(lab);
  }
  // ---------- 内板：冲压金属薄板 ----------
  {
    const P = part('inner', C('inner')); const b = M.PARTS.inner.box, y0 = b[1] - b[4] / 2;
    const steel = mat(0xe9e8e4, { roughness: 0.42, metalness: 0.3 });
    add(P, slab(b[3], b[5], 13, b[4], y0, null, 10), steel);
    const pads = [boxG(46, 0.5, 30, -24, y0 + b[4] + 0.25, 20), boxG(40, 0.5, 26, 26, y0 + b[4] + 0.25, -26), boxG(30, 0.5, 18, 30, y0 + b[4] + 0.25, 30)];
    add(P, mergeGeometries(pads), steel, { edges: 20 });
    // 电源键排线的插座（在内板一角，示意）
    add(P, boxG(7, 1.2, 5, M.POWER_BUTTON[0], y0 + b[4] + 0.6, M.POWER_BUTTON[1] - 5), mat(0x2c2c2e), { edges: 0 });
  }
  // ---------- 底盖：浅色板、一圈通风孔、电源键 ----------
  {
    const P = part('cover', C('cover')); const b = M.PARTS.cover.box, y0 = b[1] - b[4] / 2, y1 = b[1] + b[4] / 2;
    add(P, slab(b[3], b[5], R0 - 2.8, b[4], y0, null, 14), mat(0xe3e2de, { roughness: 0.6 }));
    add(P, slab(114, 114, R0 - 6, 0.3, y1, [106, 106, R0 - 9], 14), mat(0x46464a, { roughness: 0.7 }), { edges: 0 });
    add(P, cylG(4.4, 0.7, M.POWER_BUTTON[0], y1 + 0.35, M.POWER_BUTTON[1], 28), mat(0xcfcdc8, { roughness: 0.35, metalness: 0.3 }));
    // 内侧的加强框（翻过去以后看得到）
    add(P, slab(108, 108, R0 - 7, 1.0, y0 - 1.0, [102, 102, R0 - 9], 12), mat(0xd8d7d3), { edges: 20 });
  }

  // ---------- 螺丝：头、梅花槽、螺杆 ----------
  const screwMat = mat(0x6d6d70, { roughness: 0.32, metalness: 0.75 });
  const recessMat = mat(0x1d1d1f);
  for (const sc of M.SCREWS) {
    const P = part(sc.id, [0, 0, 0]);
    add(P, cylG(2.0, 1.0, 0, 0.5, 0, 20), screwMat, { edges: 0 });
    add(P, cylG(0.85, 0.12, 0, 1.03, 0, 6), recessMat, { edges: 0 });
    add(P, cylG(0.9, sc.len, 0, -sc.len / 2, 0, 10), screwMat, { edges: 0 });
  }

  // ---------- 动态排线（每帧按两端位置重建） ----------
  const cableMat = mat(0x3d3d40, { roughness: 0.6 });
  function cable() { const m = new THREE.Mesh(new THREE.BufferGeometry(), cableMat); m.castShadow = true; root.add(m); return m; }
  const cables = { power: cable(), inner: cable(), fan: cable() };
  function setCable(m, pts, r = 0.8) {
    m.geometry.dispose();
    if (!pts) { m.geometry = new THREE.BufferGeometry(); m.visible = false; return; }
    m.visible = true; m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 6, false);
  }

  // ---------- 工具：开启片、螺丝刀、撬棒（只是示意动作，位置是 s 的函数） ----------
  const pick = new THREE.Mesh((() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(30, -9); s.lineTo(30, 9); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g; })(), mat(0xb8c4cc, { roughness: 0.35, transparent: true, opacity: 0.92 }));
  pick.castShadow = true; root.add(pick);
  const driver = new THREE.Group();
  driver.add(new THREE.Mesh(cylG(0.9, 26, 0, 13, 0, 10), mat(0x9a9a9d, { metalness: 0.8, roughness: 0.3 })));
  driver.add(new THREE.Mesh(cylG(4.2, 38, 0, 26 + 19, 0, 24), mat(0xf2f1ed, { roughness: 0.55 })));
  driver.children.forEach((m) => { m.castShadow = true; const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.45 })); driver.add(l); });
  root.add(driver);
  const spudger = new THREE.Mesh(cylG(1.4, 60, 0, 30, 0, 10), mat(0x2a2a2c)); spudger.castShadow = true; root.add(spudger);

  // ---------- 螺丝盘 ----------
  const trays = {};
  for (const layout of ['wide', 'tall']) {
    const T = M.trayBox(layout), g = new THREE.Group(); g.position.set(T[0], 0, T[2]); root.add(g);
    const along = 'z', L = along === 'x' ? T[3] : T[5], S = along === 'x' ? T[5] : T[3];
    const base = slab(along === 'x' ? L : S, along === 'x' ? S : L, 4, 1.4, 0, null, 6);
    const tm = mat(0xe4e2dd, { roughness: 0.7 });
    const bm = new THREE.Mesh(base, tm); bm.receiveShadow = true; g.add(bm, new THREE.LineSegments(new THREE.EdgesGeometry(base, 20), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.45 })));
    const cell = (M.TRAY[layout] || M.TRAY.wide).cell;
    M.BITS.forEach((bit, i) => {
      const off = (i - 1.5) * cell;
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(cell - 6, (cell - 6) * 0.42), new THREE.MeshBasicMaterial({ map: labelTex([bit], 256, 108, null, '#77736c', 64), transparent: true }));
      lab.rotation.x = -Math.PI / 2;
      if (along === 'x') lab.position.set(off, 1.45, S / 2 - 4.2); else { lab.position.set(S / 2 - 4.2, 1.45, off); lab.rotation.z = Math.PI / 2; }
      g.add(lab);
      if (i > 0) { const w = along === 'x' ? boxG(0.8, 2.4, S - 2, off - cell / 2, 2.6, 0) : boxG(S - 2, 2.4, 0.8, 0, 2.6, off - cell / 2); const wm = new THREE.Mesh(w, tm); wm.castShadow = true; g.add(wm); }
    });
    trays[layout] = g;
  }

  // ---------- 每帧 ----------
  const m4 = new THREE.Matrix4();
  const wp = (P, l) => { const R = P.R, p = P.p; return [R[0] * l[0] + R[1] * l[1] + R[2] * l[2] + p[0], R[3] * l[0] + R[4] * l[1] + R[5] * l[2] + p[1], R[6] * l[0] + R[7] * l[1] + R[8] * l[2] + p[2]]; };
  const rel = (id, w) => { const c = M.PARTS[id].box; return [w[0] - c[0], w[1] - c[1], w[2] - c[2]]; };
  let lastPose = null, lastLayout = 'wide';
  function update(s, layout = 'wide', { xrayLines = true } = {}) {
    const PS = M.pose(s, layout); lastPose = PS; lastLayout = layout;
    for (const [id, P] of Object.entries(parts)) {
      const q = PS[id]; if (!q) continue;
      const R = q.R, p = q.p;
      m4.set(R[0], R[1], R[2], p[0], R[3], R[4], R[5], p[1], R[6], R[7], R[8], p[2], 0, 0, 0, 1);
      P.g.matrix.copy(m4); P.g.matrixWorldNeedsUpdate = true;
      const op = q.op, hi = q.hi;
      P.g.visible = op > 0.01;
      if (Math.abs(op - P.op) > 1e-4 || Math.abs(hi - P.hi) > 1e-4) {
        P.op = op; P.hi = hi;
        const xr = id === 'heatsink' && op < 0.999;
        for (const x of P.mats) {
          const tr = op < 0.999 || x.op < 1; if (tr !== x.m.transparent) { x.m.transparent = tr; x.m.needsUpdate = true; } 
          // 透明与否是着色器参数（OPAQUE 宏），改了要重编
          x.m.opacity = (x.op ?? 1) * (xr ? op * op : op); x.m.depthWrite = op > 0.95;
          // 高亮只给内存颗粒上色；其余零件高亮靠强调色描边，不染整块
          if (id.startsWith('ram')) { x.m.color.copy(x.color).lerp(ACCENT, hi * 0.5); x.m.emissive.copy(ACCENT).multiplyScalar(hi * 0.35); }
        }
        P.lineMat.color.set(INK).lerp(ACCENT, hi); P.lineMat.opacity = xr ? 0.18 + 0.37 * op : 0.55 * op + hi * 0.4;
        P.g.traverse((o) => { if (o.isMesh) o.castShadow = op > 0.6; });
      }
    }
    // ZIF：胶带揭开、锁扣翻起
    const u14 = M.local(s, 14), u15 = M.local(s, 15);
    zifTape.rotation.z = -2.2 * u14; zifTape.visible = u14 < 0.95; zifTape.children[0].material.opacity = 0.75 * (1 - Math.max(0, u14 - 0.6) / 0.35);
    zifLock.rotation.x = -1.6 * Math.min(1, u15 * 1.4);
    // 排线
    const cv = PS.cover, inn = PS.inner, fan = PS.fan, board = PS.board;
    const pb = wp(cv, rel('cover', [M.POWER_BUTTON[0], 47.2, M.POWER_BUTTON[1] + 4]));
    const sock = wp(inn, rel('inner', [M.POWER_BUTTON[0], 42.3, M.POWER_BUTTON[1] - 5]));
    const cDone = s >= M.CONNECTORS[0].stage + M.CONNECTORS[0].at;
    if (cv.op > 0.05) {
      if (!cDone) { const mid = [(pb[0] + sock[0]) / 2 + 4, Math.max(pb[1], sock[1]) + 3, (pb[2] + sock[2]) / 2]; setCable(cables.power, [pb, mid, sock], 0.7); }
      else { const end = wp(cv, rel('cover', [M.POWER_BUTTON[0] - 4, 40, M.POWER_BUTTON[1] + 12])); setCable(cables.power, [pb, [(pb[0] + end[0]) / 2, (pb[1] + end[1]) / 2, (pb[2] + end[2]) / 2 + 1], end], 0.7); }
    } else setCable(cables.power, null);
    const ia = wp(inn, rel('inner', [-50, 40.3, 57])), ib = wp(board, rel('board', [-56, 14.2, 57.5]));
    setCable(cables.inner, [ia, [(ia[0] + ib[0]) / 2 - 3, (ia[1] + ib[1]) / 2 + 4, (ia[2] + ib[2]) / 2], ib], 0.9);
    const fDone = s >= M.CONNECTORS[1].stage + M.CONNECTORS[1].at;
    const fa = wp(fan, rel('fan', [-6, 19, 4]));
    if (fan.op > 0.05) {
      const slide = M.local(s, 16);
      const zb = [-2, 15.6 + 0.6, -3 + 6 * slide * (fDone ? 1 : 0.6)];
      const end = fDone ? wp(fan, rel('fan', [-6, 12, 4])) : zb;
      setCable(cables.fan, [fa, [(fa[0] + end[0]) / 2 - 3, Math.max(fa[1], end[1]) + 4, (fa[2] + end[2]) / 2], end], 0.9);
    } else setCable(cables.fan, null);
    // 开启片：插进缝里，沿着一圈滑过四个角（第 2–5 步）
    const u1 = M.local(s, 1), u2 = M.local(s, 2), u3 = M.local(s, 3), u4 = M.local(s, 4);
    pick.visible = s > 1.1 && s < 5.95;
    if (pick.visible) {
      const per = Math.min(1, u3 * 0.3 + u4 * 0.7); // 0 → 1 绕一圈
      const a = Math.PI / 2 - per * Math.PI * 2; const r = 66;
      const px = Math.cos(a) * r * 0.95, pz = Math.sin(a) * r * 0.95;
      const ins = 3 + 6 * Math.min(1, u2 * 2);
      const dir = Math.atan2(-pz, -px);
      pick.position.set(px - Math.cos(dir) * (ins - 30) * 0 + Math.cos(dir) * -(30 - ins) * 0.0, 49.2 + 1.6 * u1, pz);
      pick.rotation.set(0, -dir, 0);
      // 尖朝机身中心，插进去 ins mm
      pick.position.x = Math.cos(a) * (r + 30 - ins); pick.position.z = Math.sin(a) * (r + 30 - ins);
      pick.rotation.y = -Math.atan2(-Math.sin(a), -Math.cos(a));
      pick.material.opacity = 0.92 * Math.min(1, (s - 1.1) * 4, (5.95 - s) * 4);
    }
    // 螺丝刀：停在正在拧的那颗上
    const turning = M.SCREWS.find((sc) => { const k = PS[sc.id].k; return k > 0.0 && k < 0.5; });
    driver.visible = !!turning;
    if (turning) { const p = PS[turning.id].p; driver.position.set(p[0], p[1] + 1.0, p[2]); driver.rotation.y = s * 40; }
    // 撬棒：撬内板（第 10 步）、拔 SSD（第 20 步）
    const u9 = M.local(s, 9), u20 = M.local(s, 20);
    spudger.visible = (s > 9 && s < 10) || (s > 20 && s < 21);
    if (s > 9 && s < 10) { spudger.position.set(20, 41.4, 62); spudger.rotation.set(-1.15 + 0.2 * u9, 0, 0); }
    else if (s > 20 && s < 21) { spudger.position.set(-30 - 10 * u20, 15.4, 52 + 1.5 * u20); spudger.rotation.set(-1.25 + 0.25 * Math.sin(u20 * Math.PI * 4), 0.35, 0); }
    for (const [k, g] of Object.entries(trays)) g.visible = k === layout;
    return PS;
  }

  /** 屏幕标注用的锚点（世界坐标） */
  function anchor(name) {
    const PS = lastPose; if (!PS) return null;
    const at = { gold: ['ssd', [-42, 15.6, 8]], nand: ['ssd', [-40, 16.2, 32]], ssd: ['ssd', [-42, 16, 30]], ram: ['ramA', [8, 15.4, -48.5]], ramB: ['ramB', [8, 15.4, -13.5]], m4: ['m4', [8, 16.2, -31]], power: ['cover', [M.POWER_BUTTON[0], 48, M.POWER_BUTTON[1]]], zif: ['zif', [-2, 15.6, 0]], fan: ['fan', [23, 37.6, 27]], inner: ['inner', [0, 41.7, 0]] }[name];
    if (!at) return null;
    return new THREE.Vector3(...wp(PS[at[0]], rel(at[0], at[1])));
  }
  return { root, parts, update, anchor, trays, get pose() { return lastPose; }, get layout() { return lastLayout; } };
}
