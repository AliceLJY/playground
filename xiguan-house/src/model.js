// 西关大屋 · 推开看：几何、铰链与时间线。世界单位 = 厘米；x 面宽，y 进深（门口 y=0，往里为正），z 向上（台面 z=0）。
// 浏览器里挂在 window.XG，Node 测试里 require 进来。所有部件都是凸多面体，渲染和穿插检查共用同一份数据。
(function (root) {
  'use strict';

  // ---------- 尺寸（来源与示意项见 facts.md） ----------
  const E = 500;                       // 檐墙高（示意，资料只说大屋挑高至少 5 米）
  const PITCH = 25;                  // 屋面坡度（示意）
  const TAN = Math.tan(PITCH * Math.PI / 180);
  const COS = Math.cos(PITCH * Math.PI / 180);
  const TH = 24, THV = TH / COS;       // 屋面板厚（瓦加桷，示意）、竖向厚
  const HALF = 500, WT = 35, IN = HALF - WT;   // 外墙半宽、墙厚、内皮
  const D = 1100, YR = D / 2, OVER = 45;      // 截取的进深（门口到正厅后墙）、屋脊位置、前后出檐
  const RIDGE_TOP = E + YR * TAN + THV;
  const GABLE_UP = 12;                 // 山墙高出屋面（示意）
  const DOOR = 80;                     // 门洞半宽
  const DOOR_H = 310, LINTEL = 335, PLINTH = 60;
  const BAR_COUNT = 13;                // 趟栊圆木（13 或 15 根，取单数）
  const STEP_COUNT = 13;               // 楼梯级数与趟栊同数
  const TANG_TRAVEL = 160;
  const SASH_TRAVEL = 120;

  // ---------- 时间线（秒） ----------
  // over：末尾 2% 过冲再回落；land：落到实物上，碰到后回弹 2% 再落稳
  const TIMELINE = {
    tang: [0.00, 0.80, 'over'],
    doors: [0.40, 1.30, 'land'],
    roofF: [0.95, 2.05, 'land'],
    roofB: [1.60, 2.60, 'over'],
    wallF: [1.90, 2.85, 'land'],
    wallL: [2.10, 3.00, 'land'],
    wallR: [2.25, 3.15, 'land'],
    sash: [2.75, 3.40, 'over'],
  };
  const T = 3.40;
  const OVERSHOOT = 0.02;

  const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
  const cubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const sine = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
  function ease(u, kind) {
    u = clamp01(u);
    if (kind === 'over') {
      if (u < 0.8) return (1 + OVERSHOOT) * cubic(u / 0.8);
      return 1 + OVERSHOOT - OVERSHOOT * sine((u - 0.8) / 0.2);
    }
    // land：起步慢、越走越快（像倒下），碰到之后回弹 2%
    if (u < 0.78) { const w = u / 0.78; return (w * w * (3 - w)) / 2; }
    const v = (u - 0.78) / 0.22;
    return 1 - OVERSHOOT * Math.sin(Math.PI * v) * (1 - 0.35 * v);
  }
  const seg = (s, key) => { const [a, b, k] = TIMELINE[key]; return ease((s - a) / (b - a), k); };

  // ---------- 小向量 ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // ---------- 部件 ----------
  const SOLIDS = [];
  function solid(verts, faces, mat, group, name) {
    const c = verts.reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]).map((x) => x / verts.length);
    const fs = faces.map((idx) => {
      let n = norm(cross(sub(verts[idx[1]], verts[idx[0]]), sub(verts[idx[2]], verts[idx[0]])));
      if (dot(n, sub(verts[idx[0]], c)) < 0) { idx = idx.slice().reverse(); n = [-n[0], -n[1], -n[2]]; }
      return { idx, n, tex: [] };
    });
    const s = { id: SOLIDS.length, verts, faces: fs, mat, group, name };
    SOLIDS.push(s);
    return s;
  }
  // 沿某轴拉伸一个凸多边形。axis 'x'：poly 为 [y,z]；'y'：[x,z]；'z'：[x,y]
  function prism(poly, axis, a0, a1, mat, group, name) {
    const mk = (p, a) => (axis === 'x' ? [a, p[0], p[1]] : axis === 'y' ? [p[0], a, p[1]] : [p[0], p[1], a]);
    const n = poly.length, verts = [];
    poly.forEach((p) => verts.push(mk(p, a0)));
    poly.forEach((p) => verts.push(mk(p, a1)));
    const faces = [poly.map((_, i) => i), poly.map((_, i) => n + i)];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i, j, n + j, n + i]); }
    return solid(verts, faces, mat, group, name);
  }
  const box = (x0, x1, y0, y1, z0, z1, mat, group, name) =>
    prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 'z', z0, z1, mat, group, name);
  const ngon = (cx, cy, r, n = 8, rot = Math.PI / 8) =>
    Array.from({ length: n }, (_, i) => [cx + r * Math.cos(rot + (i * 2 * Math.PI) / n), cy + r * Math.sin(rot + (i * 2 * Math.PI) / n)]);

  // ---------- 面上的纹理（线、色块、圆点），存在部件自己的坐标里，跟着部件走 ----------
  function facePts(s, f) { return f.idx.map((i) => s.verts[i]); }
  function addTex(s, pred, fn) {
    for (const f of s.faces) if (pred(f.n)) f.tex.push(...fn(facePts(s, f), f.n));
    return s;
  }
  const isTop = (n) => n[2] > 0.5, isBottom = (n) => n[2] < -0.5;
  const isSide = (n) => Math.abs(n[2]) < 0.5;
  const facing = (axis, sign) => (n) => n[axis] * sign > 0.9;
  // 用一组平行平面 dot(p,axis)=c 去切凸多边形，得到面上的线
  function slices(pts, axis, step, { offset = 0, c = 'faint', w = 1, lo = -Infinity, hi = Infinity, inset = 0.6 } = {}) {
    const vals = pts.map((p) => dot(p, axis));
    const min = Math.max(Math.min(...vals), lo), max = Math.min(Math.max(...vals), hi);
    const out = [];
    for (let k = Math.ceil((min - offset) / step + 1e-6); offset + k * step < max - inset; k++) {
      const lv = offset + k * step;
      if (lv <= min + inset) continue;
      const hit = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], va = vals[i], vb = vals[(i + 1) % pts.length];
        if ((va - lv) * (vb - lv) < 0) hit.push(lerp3(a, b, (lv - va) / (vb - va)));
      }
      if (hit.length === 2) out.push({ l: hit, c, w });
    }
    return out;
  }
  const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  // 线段按 xy 矩形裁剪（地面纹理分区用）
  function clipXY(items, x0, x1, y0, y1) {
    const out = [];
    for (const it of items) {
      let [a, b] = it.l, t0 = 0, t1 = 1;
      const d = sub(b, a);
      const edges = [[-d[0], a[0] - x0], [d[0], x1 - a[0]], [-d[1], a[1] - y0], [d[1], y1 - a[1]]];
      let ok = true;
      for (const [p, q] of edges) {
        if (Math.abs(p) < 1e-9) { if (q < 0) { ok = false; break; } continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
      }
      if (ok && t1 - t0 > 1e-6) out.push({ ...it, l: [lerp3(a, b, t0), lerp3(a, b, t1)] });
    }
    return out;
  }
  // 面上的矩形色块：o 起点，u、v 两个方向（已含长度）
  const quad = (o, u, v, c) => ({ q: [o, [o[0] + u[0], o[1] + u[1], o[2] + u[2]], [o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2]], [o[0] + v[0], o[1] + v[1], o[2] + v[2]]], c });
  const line = (a, b, c = 'faint', w = 1) => ({ l: [a, b], c, w });

  const brick = (pts) => slices(pts, AX.z, 6.5, { offset: PLINTH, c: 'faint', lo: PLINTH });
  const granite = (pts, n) => [
    ...slices(pts, AX.z, 30, { c: 'ink', w: 0.7, hi: PLINTH + 0.1 }),
    ...slices(pts, Math.abs(n[0]) > 0.5 ? AX.y : AX.x, 90, { offset: 17, c: 'ink', w: 0.7, hi: PLINTH }),
  ];
  // 外墙：石脚（花岗岩）+ 青砖
  function wallPiece(x0, x1, y0, y1, z0, z1, group, name) {
    const out = [];
    if (z0 < PLINTH) {
      const g = box(x0, x1, y0, y1, z0, Math.min(z1, PLINTH), 'granite', group, name + '·石脚');
      addTex(g, isSide, (p, n) => slices(p, Math.abs(n[0]) > 0.5 ? AX.y : AX.x, 90, { offset: 17, c: 'ink', w: 0.7 }));
      addTex(g, isSide, (p) => slices(p, AX.z, 30, { c: 'ink', w: 0.7 }));
      out.push(g);
    }
    if (z1 > PLINTH) {
      const b = box(x0, x1, y0, y1, Math.max(z0, PLINTH), z1, 'brick', group, name);
      addTex(b, isSide, brick);
      out.push(b);
    }
    return out;
  }

  // ---------- 台面 ----------
  const STAND = { x0: -1400, x1: 1400, y0: -600, y1: 1220 };
  const stand = box(STAND.x0, STAND.x1, STAND.y0, STAND.y1, -30, 0, 'stand', 'root', '麻石台');
  addTex(stand, isTop, (p) => {
    const all = [...slices(p, AX.x, 100, { offset: 0, c: 'faint' }), ...slices(p, AX.y, 60, { offset: 0, c: 'faint' })];
    // 屋里的地方另铺阶砖、天井另铺石，台面石缝避开屋子
    const out = [];
    for (const it of all) {
      const parts = [
        clipXY([it], STAND.x0, STAND.x1, STAND.y0, 0), clipXY([it], STAND.x0, STAND.x1, D, STAND.y1),
        clipXY([it], STAND.x0, -HALF, 0, D), clipXY([it], HALF, STAND.x1, 0, D),
      ];
      for (const p2 of parts) out.push(...p2);
    }
    // 屋内阶砖（约 30 cm 见方，示意），天井花岗岩条石
    const floor = [...slices(p, AX.x, 30, { offset: 15, c: 'tile' }), ...slices(p, AX.y, 30, { offset: 5, c: 'tile' })];
    out.push(...clipXY(floor, -IN, IN, WT, 306));
    out.push(...clipXY(floor, -IN, IN, 515, D - WT));
    out.push(...clipXY(floor, -IN, -240, 306, 515), ...clipXY(floor, 240, IN, 306, 515));
    const well = [...slices(p, AX.x, 75, { offset: 0, c: 'ink', w: 0.6 }), ...slices(p, AX.y, 52, { offset: 306, c: 'ink', w: 0.6 })];
    out.push(...clipXY(well, -225, 225, 306, 515));
    // 天井四周的石沿
    const z = 0;
    out.push(line([-225, 306, z], [225, 306, z], 'ink', 0.9), line([225, 306, z], [225, 515, z], 'ink', 0.9),
      line([225, 515, z], [-225, 515, z], 'ink', 0.9), line([-225, 515, z], [-225, 306, z], 'ink', 0.9));
    // 去水孔：金钱形（外圆内方）
    const cx = 0, cy = 460, r = 13;
    out.push({ dot: [cx, cy, z], r, c: 'drain' });
    out.push({ q: [[cx - 4.5, cy - 4.5, z], [cx + 4.5, cy - 4.5, z], [cx + 4.5, cy + 4.5, z], [cx - 4.5, cy + 4.5, z]], c: 'stand' });
    return out;
  });
  addTex(stand, isSide, (p) => slices(p, AX.z, 15, { offset: -30, c: 'faint' }));

  // ---------- 前墙（连门） ----------
  const F = 'wallF';
  const front = [];
  const SKIN_O = 9, SKIN_I = 21;      // 趟栊槽：墙中间留 12 cm 的缝，趟栊推进去
  const POCKET = -250;
  front.push(...wallPiece(-IN, POCKET, 0, WT, 0, LINTEL, F, '前墙左'));
  front.push(...wallPiece(POCKET, -110, 0, SKIN_O, 0, DOOR_H, F, '前墙左外皮'));
  front.push(...wallPiece(POCKET, -110, SKIN_I, WT, 0, DOOR_H, F, '前墙左内皮'));
  front.push(...wallPiece(POCKET, -110, 0, WT, DOOR_H, LINTEL, F, '趟栊槽顶'));
  const jambTex = (p, n) => [...slices(p, AX.z, DOOR_H / 3, { c: 'ink', w: 0.7 })];
  for (const [y0, y1, nm] of [[0, SKIN_O, '外'], [SKIN_I, WT, '内']]) {
    const j = box(-110, -DOOR, y0, y1, 0, DOOR_H, 'granite', F, '石门夹左' + nm);
    addTex(j, isSide, jambTex);
  }
  const jr = box(DOOR, 110, 0, WT, 0, DOOR_H, 'granite', F, '石门夹右');
  addTex(jr, isSide, jambTex);
  const lintel = box(-110, 110, 0, WT, DOOR_H, LINTEL, 'granite', F, '石门楣');
  addTex(lintel, facing(1, -1), (p) => [line([-110, 0, DOOR_H + 12], [110, 0, DOOR_H + 12], 'ink', 0.5)]);
  front.push(...wallPiece(110, IN, 0, WT, 0, LINTEL, F, '前墙右'));
  const topBand = wallPiece(-IN, IN, 0, WT, LINTEL, E, F, '前墙上段');
  // 门额（平贴墙面的木匾）、墙楣灰塑带
  addTex(topBand[0], facing(1, -1), () => [
    quad([-72, -0.01, 352], [144, 0, 0], [0, 0, 38], 'plaque'),
    line([-60, -0.01, 362], [60, -0.01, 362], 'gold', 0.8), line([-60, -0.01, 371], [60, -0.01, 371], 'gold', 0.8),
    line([-60, -0.01, 380], [20, -0.01, 380], 'gold', 0.8),
    quad([-IN, -0.01, 470], [2 * IN, 0, 0], [0, 0, 34], 'frieze'),
    line([-IN, -0.01, 470], [IN, -0.01, 470], 'ink', 0.7), line([-IN, -0.01, 504], [IN, -0.01, 504], 'ink', 0.7),
    ...Array.from({ length: 23 }, (_, i) => { const x = -IN + 20 + i * 40; return line([x, -0.01, 478], [x + 20, -0.01, 496], 'faint', 0.8); }),
  ]);

  // 脚门：两扇矮门，上半截通花（闭着，挡路人视线）
  for (const [x0, x1] of [[-DOOR, -0.6], [0.6, DOOR]]) {
    const leaf = box(x0, x1, 1, 8, 40, 150, 'wood', F, '脚门');
    const y = 0.99;
    addTex(leaf, facing(1, -1), () => {
      const out = [line([x0 + 5, y, 96], [x1 - 5, y, 96], 'ink', 0.7), line([x0 + 5, y, 143], [x1 - 5, y, 143], 'ink', 0.7),
        line([x0 + 5, y, 47], [x1 - 5, y, 47], 'ink', 0.6), line([x0 + 5, y, 88], [x1 - 5, y, 88], 'ink', 0.6),
        line([x0 + 5, y, 47], [x0 + 5, y, 143], 'ink', 0.6), line([x1 - 5, y, 47], [x1 - 5, y, 143], 'ink', 0.6)];
      for (let x = x0 + 12; x < x1 - 6; x += 7.5) out.push(line([x, y, 96], [x, y, 143], 'wood2', 0.8));
      out.push(line([x0 + 5, y, 119.5], [x1 - 5, y, 119.5], 'wood2', 0.8));
      out.push(quad([x0 + 12, y - 0.01, 55], [x1 - x0 - 24, 0, 0], [0, 0, 25], 'panel'));
      return out;
    });
  }
  // 趟栊：木框 + 13 根横向圆木，往左推进墙里的槽
  const TG = 'tang';
  const ty0 = 10, ty1 = 20, tyc = 15;
  box(-DOOR, -DOOR + 6, ty0, ty1, 4, 302, 'wood', TG, '趟栊边梃');
  box(DOOR - 6, DOOR, ty0, ty1, 4, 302, 'wood', TG, '趟栊边梃');
  box(-DOOR + 6, DOOR - 6, ty0, ty1, 4, 16, 'wood', TG, '趟栊下槛');
  box(-DOOR + 6, DOOR - 6, ty0, ty1, 290, 302, 'wood', TG, '趟栊上槛');
  const BARS = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const zc = 16 + ((290 - 16) * (i + 0.5)) / BAR_COUNT;
    const bar = prism(ngon(tyc, zc, 4), 'x', -DOOR + 6, DOOR - 6, 'bar', TG, '趟栊圆木');
    BARS.push(bar);
  }

  // 大门：两扇，厚 8 cm，朝里推开 180° 贴到墙里皮
  const leafL = box(-DOOR, -1.2, 27, WT, 1, 306, 'door', 'doorL', '大门左扇');
  addTex(leafL, (n) => Math.abs(n[1]) > 0.9, (p, n) => slices(p, AX.x, 20, { offset: -DOOR, c: 'ink', w: 0.45 }).concat(n[1] < 0 ? [{ dot: [-14, 26.99, 150], r: 3.6, c: 'brass' }] : []));
  const leafR = box(1.2, DOOR, 27, WT, 1, 306, 'door', 'doorR', '大门右扇');
  addTex(leafR, (n) => Math.abs(n[1]) > 0.9, (p, n) => slices(p, AX.x, 20, { offset: 0, c: 'ink', w: 0.45 }).concat(n[1] < 0 ? [{ dot: [14, 26.99, 150], r: 3.6, c: 'brass' }] : []));

  // ---------- 后墙 ----------
  wallPiece(-IN, IN, D - WT, D, 0, E, 'root', '后墙');

  // ---------- 山墙（硬山，两面） ----------
  const gableTop0 = E + THV + GABLE_UP, gablePeak = RIDGE_TOP + GABLE_UP;
  const gablePoly = [[0, 0], [D, 0], [D, gableTop0], [YR, gablePeak], [0, gableTop0]];
  for (const [x0, x1, g, nm] of [[-HALF, -IN, 'wallL', '左山墙'], [IN, HALF, 'wallR', '右山墙']]) {
    const base = prism([[0, 0], [D, 0], [D, PLINTH], [0, PLINTH]], 'x', x0, x1, 'granite', g, nm + '·石脚');
    addTex(base, isSide, (p, n) => [...slices(p, AX.z, 30, { c: 'ink', w: 0.7 }), ...(Math.abs(n[0]) > 0.5 ? slices(p, AX.y, 90, { offset: 17, c: 'ink', w: 0.7 }) : [])]);
    const up = prism([[0, PLINTH], [D, PLINTH], [D, gableTop0], [YR, gablePeak], [0, gableTop0]], 'x', x0, x1, 'brick', g, nm);
    addTex(up, (n) => Math.abs(n[0]) > 0.9, (p) => [
      ...slices(p, AX.z, 6.5, { offset: PLINTH, c: 'faint' }),
      // 山墙顶的灰塑博古边（示意）：沿两道斜边各描一条线
      line([p[0][0], 0, gableTop0 - 16], [p[0][0], YR, gablePeak - 16], 'ink', 0.7),
      line([p[0][0], YR, gablePeak - 16], [p[0][0], D, gableTop0 - 16], 'ink', 0.7),
    ]);
    void gablePoly;
  }

  // ---------- 屋面：前后两块板，在屋脊处铰接；后板铰在后檐 ----------
  // 板的截面（y,z）：下皮过（墙外皮, E），上皮竖向高 THV
  const zbF = (y) => E + y * TAN, zbB = (y) => E + (D - y) * TAN;
  const roofF = prism([[-OVER, zbF(-OVER)], [YR, zbF(YR)], [YR, zbF(YR) + THV], [-OVER, zbF(-OVER) + THV]], 'x', -IN, IN, 'roof', 'roofF', '前坡');
  const roofB = prism([[YR, zbB(YR)], [D + OVER, zbB(D + OVER)], [D + OVER, zbB(D + OVER) + THV], [YR, zbB(YR) + THV]], 'x', -IN, IN, 'roof', 'roofB', '后坡');
  function roofTex(isFront) {
    return (p, n) => {
      if (n[2] > 0.3) {
        // 瓦面：筒瓦一垄一垄沿坡走（x 每 22 cm 一垄），檐口一排瓦当
        const out = slices(p, AX.x, 22, { offset: -IN, c: 'ink', w: 0.55 });
        out.push(...slices(p, AX.y, 34, { offset: isFront ? -OVER : YR, c: 'faint' }));
        const ye = isFront ? -OVER : D + OVER, ze = (isFront ? zbF(ye) : zbB(ye)) + THV;
        for (let x = -IN + 11; x < IN; x += 22) out.push({ dot: [x, ye + (isFront ? 1.5 : -1.5), ze + 0.2], r: 3.2, c: 'tileEnd' });
        // 屋脊（压脊线）
        out.push(line([-IN, YR + (isFront ? -10 : 10), (isFront ? zbF(YR - 10) : zbB(YR + 10)) + THV], [IN, YR + (isFront ? -10 : 10), (isFront ? zbF(YR - 10) : zbB(YR + 10)) + THV], 'ink', 1.1));
        return out;
      }
      if (n[2] < -0.3) {
        // 底面：桷（椽）沿坡走，桁（檩）横着
        const out = slices(p, AX.x, 26, { offset: -IN + 6, c: 'rafter', w: 1.6 });
        out.push(...slices(p, AX.y, 120, { offset: isFront ? 10 : YR + 70, c: 'ink', w: 1.2 }));
        return out;
      }
      return [];
    };
  }
  addTex(roofF, () => true, roofTex(true));
  addTex(roofB, () => true, roofTex(false));

  // ---------- 屋里 ----------
  // 门官：门里侧墙脚的小神位
  const mg = box(200, 248, WT, 63, 0, 52, 'lacquer', 'root', '门官');
  addTex(mg, facing(1, 1), () => []);
  addTex(mg, isTop, () => []);
  addTex(mg, (n) => n[0] < -0.9, (p) => [quad([200 - 0.01, 41, 12], [0, 16, 0], [0, 0, 28], 'paper'), line([199.99, 49, 18], [199.99, 49, 34], 'ink', 0.6)]);
  box(212, 236, WT, 50, 52, 60, 'brass', 'root', '门官香炉');

  // 挡中：四扇中门
  for (let i = 0; i < 4; i++) {
    const x0 = -160 + i * 80;
    const leaf = box(x0, x0 + 80, 300, 306, 0, 300, 'screen', 'root', '挡中');
    addTex(leaf, (n) => Math.abs(n[1]) > 0.9, (p, n) => {
      const y = n[1] < 0 ? 299.99 : 306.01;
      const out = [line([x0 + 7, y, 8], [x0 + 7, y, 292], 'ink', 0.6), line([x0 + 73, y, 8], [x0 + 73, y, 292], 'ink', 0.6),
        line([x0 + 7, y, 292], [x0 + 73, y, 292], 'ink', 0.6), line([x0 + 7, y, 8], [x0 + 73, y, 8], 'ink', 0.6),
        line([x0 + 7, y, 120], [x0 + 73, y, 120], 'ink', 0.6), line([x0 + 7, y, 138], [x0 + 73, y, 138], 'ink', 0.6)];
      for (let z = 150; z < 288; z += 11) out.push(line([x0 + 9, y, z], [x0 + 71, y, z], 'faint', 0.7));
      for (let x = x0 + 18; x < x0 + 70; x += 11) out.push(line([x, y, 140], [x, y, 290], 'faint', 0.7));
      return out;
    });
  }

  // 天井两侧的隔墙，墙上开满洲窗，窗扇往上推
  const PART = [[-240, -225, 'sashL'], [225, 240, 'sashR']];
  const WIN = { y0: 340, y1: 476, z0: 130, z1: 250 };
  for (const [x0, x1, sg] of PART) {
    const nm = x0 < 0 ? '左隔墙' : '右隔墙';
    const pieces = [
      box(x0, x1, 300, 515, 0, WIN.z0, 'plaster', 'root', nm),
      box(x0, x1, 300, 515, WIN.z1, 380, 'plaster', 'root', nm),
      box(x0, x1, 300, WIN.y0, WIN.z0, WIN.z1, 'plaster', 'root', nm),
      box(x0, x1, WIN.y1, 515, WIN.z0, WIN.z1, 'plaster', 'root', nm),
    ];
    for (const pc of pieces) addTex(pc, (n) => Math.abs(n[0]) > 0.9, (p) => slices(p, AX.z, 380, { c: 'faint' }));
    // 窗扇贴在天井一侧的墙面外，沿墙面往上推
    const fx0 = x0 < 0 ? x1 : x0 - 4, fx1 = x0 < 0 ? x1 + 4 : x0;
    const sash = box(fx0, fx1, WIN.y0 - 6, WIN.y1 + 6, WIN.z0 - 6, WIN.z1 + 6, 'wood', sg, '满洲窗');
    const xf = x0 < 0 ? fx1 + 0.01 : fx0 - 0.01;
    addTex(sash, (n) => Math.abs(n[0]) > 0.9, () => manchuGlass(xf));
  }
  // 满洲窗：套色蚀刻玻璃，4×3 格，中间一格花心
  function manchuGlass(x) {
    const out = [];
    const cols = 4, rows = 3, gy = (WIN.y1 - WIN.y0) / cols, gz = (WIN.z1 - WIN.z0) / rows;
    const PAL = ['glassBlue', 'glassRed', 'glassAmber', 'glassGreen', 'glassClear'];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const y0 = WIN.y0 + i * gy + 2.5, z0 = WIN.z0 + j * gz + 2.5;
      const c = (i === 1 || i === 2) && j === 1 ? 'glassClear' : PAL[(i + j * 2) % 4];
      out.push(quad([x, y0, z0], [0, gy - 5, 0], [0, 0, gz - 5], c));
      // 蚀花：每格一个菱形
      const cy = y0 + (gy - 5) / 2, cz = z0 + (gz - 5) / 2, ry = (gy - 5) * 0.32, rz = (gz - 5) * 0.32;
      out.push(line([x, cy - ry, cz], [x, cy, cz + rz], 'glassLine', 0.6), line([x, cy, cz + rz], [x, cy + ry, cz], 'glassLine', 0.6),
        line([x, cy + ry, cz], [x, cy, cz - rz], 'glassLine', 0.6), line([x, cy, cz - rz], [x, cy - ry, cz], 'glassLine', 0.6));
    }
    return out;
  }

  // 花罩：正厅和天井之间的木雕罩
  const HZ = 'root';
  box(-225, -205, 515, 530, 0, 380, 'wood', HZ, '花罩边柱');
  box(205, 225, 515, 530, 0, 380, 'wood', HZ, '花罩边柱');
  const hzTop = box(-205, 205, 515, 530, 290, 380, 'carve', HZ, '花罩');
  addTex(hzTop, (n) => Math.abs(n[1]) > 0.9, (p, n) => {
    const y = n[1] < 0 ? 514.99 : 530.01, out = [];
    out.push(line([-197, y, 298], [197, y, 298], 'ink', 0.7), line([-197, y, 372], [197, y, 372], 'ink', 0.7));
    for (let x = -190; x <= 190; x += 19) {
      const z0 = 300, z1 = 370, sh = (Math.round((x + 190) / 19) % 2) ? 1 : -1;
      out.push(line([x, y, z0], [x + 9.5, y, (z0 + z1) / 2 + sh * 12], 'wood2', 0.8), line([x + 9.5, y, (z0 + z1) / 2 + sh * 12], [x, y, z1], 'wood2', 0.8));
      out.push({ dot: [x + 9.5, y, (z0 + z1) / 2], r: 2.2, c: 'gold' });
    }
    return out;
  });
  // 落地罩下沿的两只挂牙
  box(-205, -165, 518, 527, 250, 290, 'carve', HZ, '挂牙');
  box(165, 205, 518, 527, 250, 290, 'carve', HZ, '挂牙');

  // 天井里：鱼缸、两盆花
  prism(ngon(0, 360, 28, 12, 0), 'z', 0, 44, 'ceramic', 'root', '鱼缸');
  addTex(SOLIDS[SOLIDS.length - 1], isTop, () => [{ dot: [0, 360, 44.01], r: 22, c: 'water' }]);
  for (const x of [-160, 160]) {
    prism(ngon(x, 480, 20, 8), 'z', 0, 34, 'pot', 'root', '花盆');
    prism(ngon(x, 480, 30, 8, 0), 'z', 34, 64, 'leaf', 'root', '盆栽');
    prism(ngon(x, 480, 18, 8), 'z', 64, 88, 'leaf2', 'root', '盆栽');
  }

  // 正厅：神台、神楼、八仙桌、两把椅子
  const st = box(-110, 110, 985, D - WT, 88, 96, 'wood', 'root', '神台面');
  box(-110, -98, 985, D - WT, 0, 88, 'wood', 'root', '神台脚');
  box(98, 110, 985, D - WT, 0, 88, 'wood', 'root', '神台脚');
  box(-98, 98, 985, 990, 60, 88, 'wood', 'root', '神台牙板');
  box(-20, 20, 1010, 1040, 96, 114, 'brass', 'root', '香炉');
  void st;
  const sl = box(-120, 120, 1015, D - WT, 250, 400, 'lacquer', 'root', '神楼');
  addTex(sl, facing(1, -1), () => [
    quad([-100, 1014.99, 268], [200, 0, 0], [0, 0, 110], 'shrineIn'),
    line([-100, 1014.98, 268], [100, 1014.98, 268], 'gold', 0.9), line([-100, 1014.98, 378], [100, 1014.98, 378], 'gold', 0.9),
    line([-100, 1014.98, 268], [-100, 1014.98, 378], 'gold', 0.9), line([100, 1014.98, 268], [100, 1014.98, 378], 'gold', 0.9),
    ...[-60, -20, 20, 60].map((x) => quad([x - 9, 1014.97, 290], [18, 0, 0], [0, 0, 42], 'tablet')),
    line([-110, 1014.98, 390], [110, 1014.98, 390], 'gold', 0.7),
  ]);
  box(-130, 130, 1005, D - WT, 400, 412, 'lacquer', 'root', '神楼檐');
  // 八仙桌
  box(-50, 50, 880, 980, 78, 86, 'wood', 'root', '八仙桌面');
  for (const [x, y] of [[-50, 880], [44, 880], [-50, 974], [44, 974]]) box(x, x + 6, y, y + 6, 0, 78, 'wood', 'root', '桌脚');
  box(-44, 44, 880, 884, 66, 78, 'wood', 'root', '桌牙');
  // 两把酸枝椅
  for (const x0 of [-122, 72]) {
    box(x0, x0 + 50, 900, 950, 44, 50, 'wood', 'root', '椅面');
    for (const [dx, dy] of [[0, 0], [45, 0], [0, 45], [45, 45]]) box(x0 + dx, x0 + dx + 5, 900 + dy, 900 + dy + 5, 0, 44, 'wood', 'root', '椅脚');
    const back = box(x0, x0 + 50, 950, 955, 44, 112, 'wood', 'root', '椅背');
    addTex(back, facing(1, -1), () => [line([x0 + 25, 949.99, 56], [x0 + 25, 949.99, 104], 'ink', 0.6), line([x0 + 8, 949.99, 104], [x0 + 42, 949.99, 104], 'ink', 0.6)]);
  }

  // 阁楼与 13 级楼梯（左边一间）
  const LOFT = { x0: -IN + 5, x1: -245, y0: 820, y1: D - WT, z: 334 };
  const loft = box(LOFT.x0, LOFT.x1, LOFT.y0, LOFT.y1, LOFT.z - 14, LOFT.z, 'wood', 'root', '阁楼板');
  addTex(loft, isTop, (p) => slices(p, AX.x, 18, { offset: LOFT.x0, c: 'faint' }));
  for (const [x, y] of [[LOFT.x0, LOFT.y0], [LOFT.x1 - 8, LOFT.y0], [LOFT.x0, LOFT.y1 - 8], [LOFT.x1 - 8, LOFT.y1 - 8]]) box(x, x + 8, y, y + 8, 0, LOFT.z - 14, 'wood', 'root', '阁楼柱');
  // 栏杆：前沿和右沿
  box(LOFT.x0 + 100, LOFT.x1, LOFT.y0, LOFT.y0 + 5, 394, 400, 'wood', 'root', '栏杆扶手');
  box(LOFT.x1 - 5, LOFT.x1, LOFT.y0 + 5, LOFT.y1, 394, 400, 'wood', 'root', '栏杆扶手');
  for (let x = LOFT.x0 + 100; x <= LOFT.x1 - 5; x += 24) box(Math.min(x, LOFT.x1 - 5), Math.min(x, LOFT.x1 - 5) + 3, LOFT.y0 + 1, LOFT.y0 + 4, LOFT.z, 394, 'wood', 'root', '栏杆');
  for (let y = LOFT.y0 + 29; y < LOFT.y1; y += 24) box(LOFT.x1 - 4, LOFT.x1 - 1, y, y + 3, LOFT.z, 394, 'wood', 'root', '栏杆');
  const STEPS = [];
  const RISE = LOFT.z / STEP_COUNT, RUN = 20;
  for (let i = 1; i <= STEP_COUNT; i++) {
    const y1 = LOFT.y0 - RUN * (STEP_COUNT - i), y0 = y1 - RUN;
    const s = box(LOFT.x0, LOFT.x0 + 92, y0, y1, 0, RISE * i, 'step', 'root', '楼梯');
    addTex(s, facing(1, -1), (p) => [line([LOFT.x0, y0 - 0.01, RISE * i - 3], [LOFT.x0 + 92, y0 - 0.01, RISE * i - 3], 'faint', 0.8)]);
    STEPS.push(s);
  }
  // 书房：靠窗一张书桌
  box(-430, -300, 330, 390, 74, 80, 'wood', 'root', '书桌面');
  for (const [x, y] of [[-430, 330], [-305, 330], [-430, 385], [-305, 385]]) box(x, x + 5, y, y + 5, 0, 74, 'wood', 'root', '书桌脚');
  box(-400, -360, 345, 375, 80, 84, 'paper2', 'root', '书');
  // 偏厅：一张矮几
  box(300, 400, 360, 440, 40, 46, 'wood', 'root', '茶几');
  for (const [x, y] of [[300, 360], [395, 360], [300, 435], [395, 435]]) box(x, x + 5, y, y + 5, 0, 40, 'wood', 'root', '茶几脚');
  box(340, 352, 392, 404, 46, 56, 'ceramic', 'root', '茶壶');

  // ---------- 拼缝：同组、同料、同一平面上相邻两块之间的边不描线 ----------
  (function markSeams() {
    const planes = [];
    for (const sd of SOLIDS) for (const f of sd.faces) {
      const pts = facePts(sd, f);
      planes.push({ sd, f, pts, d: dot(f.n, pts[0]) });
    }
    const inside = (pl, q) => {
      if (Math.abs(dot(pl.f.n, q) - pl.d) > 0.05) return false;
      const n = pl.f.n, P = pl.pts;
      for (let i = 0; i < P.length; i++) {
        const e = sub(P[(i + 1) % P.length], P[i]);
        if (dot(cross(e, sub(q, P[i])), n) < -1e-6) return false;
      }
      return true;
    };
    for (const pl of planes) {
      const P = pl.pts, c = P.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / P.length);
      // 每条边按 32 小段判断，记下要描的区间 [t0,t1]
      pl.f.draw = P.map((a, i) => {
        const b = P[(i + 1) % P.length];
        let o = norm(cross(sub(b, a), pl.f.n));
        const m0 = lerp3(a, b, 0.5);
        if (dot(o, sub(m0, c)) < 0) o = [-o[0], -o[1], -o[2]];
        const N = 32, vis = [];
        for (let k = 0; k < N; k++) {
          const m = lerp3(a, b, (k + 0.5) / N), q = [m[0] + o[0] * 0.5, m[1] + o[1] * 0.5, m[2] + o[2] * 0.5];
          vis.push(!planes.some((other) => other.sd !== pl.sd && other.sd.group === pl.sd.group && other.sd.mat === pl.sd.mat &&
            dot(other.f.n, pl.f.n) > 0.9999 && inside(other, q)));
        }
        if (vis.every(Boolean)) return null; // 整条都描
        const runs = [];
        for (let k = 0; k < N; k++) if (vis[k]) { if (runs.length && runs[runs.length - 1][1] === k / N) runs[runs.length - 1][1] = (k + 1) / N; else runs.push([k / N, (k + 1) / N]); }
        return runs;
      });
    }
  })();

  // ---------- 铰链与位姿 ----------
  const Z_HINGE_B = zbB(D + OVER);
  const GROUPS = {
    root: null,
    wallF: { parent: 'root', axis: 'x', p: [0, 0, 0], ang: (s) => 90 * seg(s, 'wallF') },
    tang: { parent: 'wallF', move: (s) => [-TANG_TRAVEL * seg(s, 'tang'), 0, 0] },
    doorL: { parent: 'wallF', axis: 'z', p: [-DOOR, WT, 0], ang: (s) => 180 * seg(s, 'doors') },
    doorR: { parent: 'wallF', axis: 'z', p: [DOOR, WT, 0], ang: (s) => -180 * seg(s, 'doors') },
    roofB: { parent: 'root', axis: 'x', p: [0, D + OVER, Z_HINGE_B], ang: (s) => -73.5 * seg(s, 'roofB') },
    roofF: { parent: 'roofB', axis: 'x', p: [0, YR, RIDGE_TOP], ang: (s) => -(180 + 2 * PITCH) * seg(s, 'roofF') },
    wallL: { parent: 'root', axis: 'y', p: [-HALF, 0, 0], ang: (s) => -90 * seg(s, 'wallL') },
    wallR: { parent: 'root', axis: 'y', p: [HALF, 0, 0], ang: (s) => 90 * seg(s, 'wallR') },
    sashL: { parent: 'root', move: (s) => [0, 0, SASH_TRAVEL * seg(s, 'sash')] },
    sashR: { parent: 'root', move: (s) => [0, 0, SASH_TRAVEL * seg(s, 'sash')] },
  };
  // 3×4 仿射矩阵 [r00 r01 r02 t0, r10 ... ]
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  function mul(A, B) {
    const o = new Array(12);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) o[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c];
      o[r * 4 + 3] = A[r * 4] * B[3] + A[r * 4 + 1] * B[7] + A[r * 4 + 2] * B[11] + A[r * 4 + 3];
    }
    return o;
  }
  function rotAbout(axis, p, deg) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    let R;
    if (axis === 'x') R = [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0];
    else if (axis === 'y') R = [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0];
    else R = [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
    const Tp = [1, 0, 0, p[0], 0, 1, 0, p[1], 0, 0, 1, p[2]], Tm = [1, 0, 0, -p[0], 0, 1, 0, -p[1], 0, 0, 1, -p[2]];
    return mul(Tp, mul(R, Tm));
  }
  function poseAt(s) {
    const M = { root: I };
    const get = (g) => {
      if (M[g]) return M[g];
      const d = GROUPS[g];
      const local = d.move ? (() => { const v = d.move(s); return [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2]]; })() : rotAbout(d.axis, d.p, d.ang(s));
      return (M[g] = mul(get(d.parent), local));
    };
    for (const g of Object.keys(GROUPS)) get(g);
    return M;
  }
  const apply = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2] + M[3], M[4] * v[0] + M[5] * v[1] + M[6] * v[2] + M[7], M[8] * v[0] + M[9] * v[1] + M[10] * v[2] + M[11]];
  const applyN = (M, n) => [M[0] * n[0] + M[1] * n[1] + M[2] * n[2], M[4] * n[0] + M[5] * n[1] + M[6] * n[2], M[8] * n[0] + M[9] * n[1] + M[10] * n[2]];

  // 某一时刻所有部件的世界坐标顶点
  function worldVerts(s, M = poseAt(s)) { return SOLIDS.map((sd) => sd.verts.map((v) => apply(M[sd.group], v))); }

  const api = {
    SOLIDS, GROUPS, TIMELINE, T, OVERSHOOT, poseAt, apply, applyN, worldVerts, seg, ease,
    dims: { E, PITCH, D, HALF, WT, IN, YR, OVER, RIDGE_TOP, THV, DOOR, DOOR_H, LINTEL, STAND, BAR_COUNT, STEP_COUNT, TANG_TRAVEL, Z_HINGE_B },
    parts: { BARS, STEPS },
    vec: { sub, dot, cross, norm },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XG = api;
})(typeof window !== 'undefined' ? window : globalThis);
