// 西关大屋 · 推开看：等距画面与交互。读 window.XG（model.js）。
(function () {
  'use strict';
  const XG = window.XG;
  const { SOLIDS, T } = XG;
  const { dot, cross, norm } = XG.vec;

  // ---------- 机位：等距正交，方位 40°、仰角 33°，全程不动 ----------
  const AZ = (40 * Math.PI) / 180, EL = (37 * Math.PI) / 180;
  const VIEW = norm([-Math.sin(AZ) * Math.cos(EL), -Math.cos(AZ) * Math.cos(EL), Math.sin(EL)]); // 指向观者
  const RIGHT = norm(cross([0, 0, 1], VIEW));
  const UP = norm(cross(VIEW, RIGHT));
  const LIGHT = norm([-0.45, -0.8, 1.25]);
  const proj0 = (p) => [dot(p, RIGHT), -dot(p, UP)];

  // 取景按整段动作的最大范围定：采样全部时刻，取并集
  const RANGE = (() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let s = 0; s <= T + 1e-9; s += 0.02) {
      for (const V of XG.worldVerts(s)) for (const p of V) {
        const [x, y] = proj0(p);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { x0, x1, y0, y1 };
  })();

  // ---------- 配色 ----------
  const PAL = {
    paper: '#efe9dc', grid: 'rgba(80,92,84,0.10)', ink: '#2c3833', faint: 'rgba(44,56,51,0.30)', tile: 'rgba(150,80,52,0.34)',
    rafter: 'rgba(92,58,36,0.55)', wood2: 'rgba(60,36,22,0.7)', gold: '#b38a3e', glassLine: 'rgba(255,255,255,0.75)',
  };
  const MAT = {
    stand: '#e6dfcf', granite: '#dcd8cc', brick: '#b7beb9', wood: '#8d5f40', door: '#6f4630', bar: '#7a4b31',
    roof: '#a3a89f', plaster: '#ece6d8', screen: '#9c6b47', carve: '#9a6a45', lacquer: '#9e3b2b', brass: '#c9a24f',
    ceramic: '#6f93a6', pot: '#b26d4b', leaf: '#7fa36f', leaf2: '#93b582', step: '#a0714d', paper2: '#efe3c4',
  };
  const TEX = {
    plaque: '#4a3022', frieze: 'rgba(255,255,255,0.35)', paper: '#e8d9a8', drain: '#8f8a7d', water: '#9cc0cc', tileEnd: '#7d837b',
    shrineIn: '#5b2219', tablet: '#d9b45a', panel: 'rgba(60,36,22,0.18)', brass: '#c9a24f', gold: '#b38a3e', stand: '#e6dfcf',
    glassBlue: '#3f74a8', glassRed: '#c2493a', glassAmber: '#e2b23e', glassGreen: '#4f8c5d', glassClear: '#f3efe2',
  };
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const shadeCache = new Map();
  function shade(mat, n) {
    const base = MAT[mat] || '#cccccc';
    const lit = Math.max(0, dot(n, LIGHT));
    const k = 0.80 + 0.26 * lit + (n[2] > 0.5 ? 0.04 : 0);
    const key = base + (k * 100 | 0);
    if (shadeCache.has(key)) return shadeCache.get(key);
    const [r, g, b] = hexRgb(base).map((c) => Math.min(255, Math.round(c * k)));
    const out = `rgb(${r},${g},${b})`;
    shadeCache.set(key, out);
    return out;
  }

  // ---------- 画布 ----------
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas');
  const bctx = bg.getContext('2d');
  let W = 0, H = 0, DPR = 1, K = 1, OX = 0, OY = 0;
  const UI_BAND = () => (W < 640 ? 132 : 104);
  function layout() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [canvas, bg]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const note = document.querySelector('.note');
    const pad = W < 640 ? 14 : 40, top = (note ? note.getBoundingClientRect().bottom : 0) + (W < 640 ? 14 : 18);
    // 底部留给按钮栏（以及带 data-reserve-bottom 的元素）：按它们实际的上沿算
    const low = [...document.querySelectorAll('.bar > *, [data-reserve-bottom]')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().top);
    const bottom = low.length ? Math.min(...low) - 14 : H - UI_BAND();
    const aw = W - 2 * pad, ah = bottom - top;
    K = Math.min(aw / (RANGE.x1 - RANGE.x0), ah / (RANGE.y1 - RANGE.y0));
    OX = pad + (aw - K * (RANGE.x1 - RANGE.x0)) / 2 - K * RANGE.x0;
    OY = top + (ah - K * (RANGE.y1 - RANGE.y0)) / 2 - K * RANGE.y0;
    drawBackground();
    dirty = true;
  }
  const P = (p) => { const [x, y] = proj0(p); return [OX + K * x, OY + K * y]; };

  function drawBackground() {
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bctx.fillStyle = PAL.paper; bctx.fillRect(0, 0, W, H);
    // 淡网格：在台面以下的地面上，每 1 米一根，按机位投影；不随动作变
    bctx.strokeStyle = PAL.grid; bctx.lineWidth = 1;
    const z = -30, R = 4200;
    bctx.beginPath();
    for (let v = -R; v <= R; v += 100) {
      let a = P([v, -R, z]), b = P([v, R, z]); bctx.moveTo(a[0], a[1]); bctx.lineTo(b[0], b[1]);
      a = P([-R, v, z]); b = P([R, v, z]); bctx.moveTo(a[0], a[1]); bctx.lineTo(b[0], b[1]);
    }
    bctx.stroke();
    // 台面下的软阴影
    const { STAND } = XG.dims;
    const c = [P([STAND.x0 - 40, STAND.y0 - 40, z]), P([STAND.x1 + 40, STAND.y0 - 40, z]), P([STAND.x1 + 40, STAND.y1 + 40, z]), P([STAND.x0 - 40, STAND.y1 + 40, z])];
    bctx.fillStyle = 'rgba(60,64,52,0.07)';
    bctx.beginPath(); c.forEach((q, i) => (i ? bctx.lineTo(q[0], q[1]) : bctx.moveTo(q[0], q[1]))); bctx.closePath(); bctx.fill();
  }

  // ---------- 一帧：变换、剔除、排序、绘制 ----------
  function buildFaces(s) {
    const M = XG.poseAt(s);
    const faces = [];
    for (const sd of SOLIDS) {
      const m = M[sd.group];
      const V = sd.verts.map((v) => XG.apply(m, v));
      for (const f of sd.faces) {
        const n = XG.applyN(m, f.n);
        if (dot(n, VIEW) <= 1e-4) continue;
        const pts = f.idx.map((i) => V[i]);
        const scr = pts.map(P);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [x, y] of scr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const c = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);
        faces.push({ sd, f, m, n, pts, scr, box: [x0, x1, y0, y1], d: dot(n, pts[0]), depth: dot(c, VIEW) });
      }
    }
    return faces;
  }
  // 两个屏幕凸多边形是否真的重叠（分离轴，留一点余量，贴边不算）
  function overlap2(a, b) {
    for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1], ny = p[0] - q[0], l = Math.hypot(nx, ny) || 1;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of a) { const d = (v[0] * nx + v[1] * ny) / l; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const v of b) { const d = (v[0] * nx + v[1] * ny) / l; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      if (Math.min(a1, b1) - Math.max(a0, b0) < 0.25) return false;
    }
    return true;
  }
  const EPS = 0.05;
  const allFront = (pts, F) => pts.every((p) => dot(F.n, p) - F.d >= -EPS);
  const allBack = (pts, F) => pts.every((p) => dot(F.n, p) - F.d <= EPS);
  // A 要先画（在 B 后面）？
  function before(A, B) {
    if (allFront(B.pts, A)) return true;   // B 整个在 A 的朝观者一侧
    if (allBack(A.pts, B)) return true;    // A 整个在 B 的背面一侧
    return false;
  }
  function sortFaces(faces) {
    const n = faces.length, out = new Array(n).fill(0).map(() => []), indeg = new Int32Array(n);
    const idx = faces.map((_, i) => i).sort((i, j) => faces[i].box[0] - faces[j].box[0]);
    for (let a = 0; a < n; a++) {
      const i = idx[a], A = faces[i];
      for (let b = a + 1; b < n; b++) {
        const j = idx[b], B = faces[j];
        if (B.box[0] >= A.box[1]) break;
        if (B.box[2] >= A.box[3] || A.box[2] >= B.box[3]) continue;
        if (A.sd === B.sd) continue;
        if (!overlap2(A.scr, B.scr)) continue;
        const ab = before(A, B), ba = before(B, A);
        let first;
        if (ab && !ba) first = i; else if (ba && !ab) first = j; else first = A.depth <= B.depth ? i : j;
        const second = first === i ? j : i;
        out[first].push(second); indeg[second]++;
      }
    }
    // Kahn：可画的里面先画最远的；有环时挑剩下最远的一个硬拆
    const done = new Uint8Array(n), order = [];
    const ready = [];
    for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
    while (order.length < n) {
      let pick = -1;
      if (ready.length) {
        let bi = 0;
        for (let k = 1; k < ready.length; k++) if (faces[ready[k]].depth < faces[ready[bi]].depth) bi = k;
        pick = ready[bi]; ready.splice(bi, 1);
      } else {
        for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || faces[i].depth < faces[pick].depth)) pick = i;
        api.cycles++;
      }
      if (done[pick]) continue;
      done[pick] = 1; order.push(faces[pick]);
      for (const k of out[pick]) if (!done[k] && --indeg[k] === 0) ready.push(k);
    }
    return order;
  }
  function path(c, pts) { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); }
  function drawFace(F) {
    path(ctx, F.scr);
    const fill = shade(F.sd.mat, F.n);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = fill; ctx.lineWidth = 0.9; ctx.lineJoin = 'round'; ctx.stroke(); // 盖住相邻两块之间的抗锯齿缝
    if (F.f.tex.length) {
      ctx.save(); path(ctx, F.scr); ctx.clip();
      for (const t of F.f.tex) {
        if (t.q) {
          path(ctx, t.q.map((p) => P(XG.apply(F.m, p))));
          ctx.fillStyle = TEX[t.c] || PAL[t.c] || '#999'; ctx.fill();
          if (t.c.startsWith('glass') || t.c === 'plaque' || t.c === 'tablet') { ctx.lineWidth = 0.7; ctx.strokeStyle = PAL.ink; ctx.stroke(); }
        } else if (t.dot) {
          const [x, y] = P(XG.apply(F.m, t.dot)); const r = Math.max(0.9, t.r * K);
          // 平放在面上的圆：按面朝向压扁
          const ax = XG.applyN(F.m, F.f.n);
          const sq = Math.max(0.25, Math.abs(dot(ax, VIEW)));
          ctx.beginPath(); ctx.ellipse(x, y, r, r * (Math.abs(ax[2]) > 0.5 ? sq : 1), 0, 0, Math.PI * 2);
          ctx.fillStyle = TEX[t.c] || '#888'; ctx.fill();
          ctx.lineWidth = 0.6; ctx.strokeStyle = PAL.ink; ctx.stroke();
        } else {
          const a = P(XG.apply(F.m, t.l[0])), b = P(XG.apply(F.m, t.l[1]));
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          ctx.strokeStyle = PAL[t.c] || TEX[t.c] || PAL.ink; ctx.lineWidth = t.w * Math.min(1.2, Math.max(0.55, K * 2.2)); ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.beginPath();
    const sc = F.scr, dr = F.f.draw;
    for (let i = 0; i < sc.length; i++) {
      const a = sc[i], b = sc[(i + 1) % sc.length], runs = dr && dr[i];
      if (!runs) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); continue; }
      for (const [t0, t1] of runs) {
        ctx.moveTo(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0); ctx.lineTo(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1);
      }
    }
    ctx.lineCap = 'round'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = Math.min(1.25, Math.max(0.7, K * 2.4)); ctx.stroke();
  }
  function render(s) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const order = sortFaces(buildFaces(s));
    for (const F of order) drawFace(F);
    api.faces = order.length;
  }

  // ---------- 交互：点屋子、按钮、空格或回车；动画期间不接新指令 ----------
  const btn = document.getElementById('toggle');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let s = 0, target = 0, anim = null, dirty = true;
  const params = new URLSearchParams(location.search);
  const view = params.get('view');
  if (view === 'open') s = target = T;
  else if (view === 'mid') s = target = +(params.get('t') || 1.9);
  function label() { btn.textContent = target >= T ? '合上' : '推开'; btn.setAttribute('aria-pressed', target >= T ? 'true' : 'false'); }
  function trigger() {
    if (anim) return false;
    const to = target >= T ? 0 : T;
    target = to;
    label();
    if (reduced) { s = to; dirty = true; return true; }
    anim = { from: s, to, t0: performance.now() };
    return true;
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); trigger(); });
  canvas.addEventListener('click', trigger);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === 'Enter') {
      if (document.activeElement === btn && e.key === 'Enter') return; // 按钮自己会响应
      e.preventDefault(); trigger();
    }
  });
  function frame(now) {
    if (anim) {
      const dt = (now - anim.t0) / 1000;
      const dir = anim.to > anim.from ? 1 : -1;
      s = anim.from + dir * Math.min(dt, Math.abs(anim.to - anim.from));
      if (dt >= Math.abs(anim.to - anim.from)) { s = anim.to; anim = null; }
      dirty = true;
    }
    if (dirty) { render(s); dirty = false; api.frames++; }
    requestAnimationFrame(frame);
  }
  const api = (window.__xiguan = {
    get s() { return s; }, get busy() { return !!anim; }, get target() { return target; }, T, cycles: 0, frames: 0, faces: 0, ready: false,
    set(t) { anim = null; s = target = t; label(); dirty = true; },
    trigger, range: RANGE, view: VIEW,
    screenBox() { // 当前姿势下整个模型的屏幕外框（CSS 像素）
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const V of XG.worldVerts(s)) for (const p of V) { const [x, y] = P(p); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { x0, x1, y0, y1 };
    },
    project: (p) => P(p),
  });
  window.addEventListener('resize', layout);
  layout(); label();
  requestAnimationFrame((t) => { frame(t); api.ready = true; });
})();
