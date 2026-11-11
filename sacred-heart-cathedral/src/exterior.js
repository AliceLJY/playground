// 石室圣心大教堂：外部。正立面与双塔、侧面的高窗与飞扶壁、小礼拜堂、横厅、后殿、屋面，以及院子和周边街区的大样。
import * as THREE from 'three';
import * as C from './core.js';
import { rng, canvasTex, batcher, slab, archRingGeo, patch, graniteTexture, roundTexture } from './world.js';

const STONE = '#cbb89c', LOUVER = '#6e2a26';
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// 一个大尖券里的两扇尖窗加券头的圆：fill = glass（外面看是暗的玻璃）或 louver（红色百叶）；head = quatre / clock / rose
function twoLightTexture(fill, head, asp) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#b89d74'; g.fillRect(0, 0, w, h);
    const lw = w * 0.36, top = h * 0.36, r = rng(fill.length + head.length * 7), mid = [w * 0.27, w * 0.73];
    for (const cx of mid) {
      g.save(); g.beginPath(); g.moveTo(cx - lw / 2, h); g.lineTo(cx - lw / 2, top + lw * 0.5 / asp * 1.2); g.quadraticCurveTo(cx - lw / 2, top, cx, top - lw * 0.25); g.quadraticCurveTo(cx + lw / 2, top, cx + lw / 2, top + lw * 0.5 / asp * 1.2); g.lineTo(cx + lw / 2, h); g.closePath(); g.clip();
      if (fill === 'louver') { g.fillStyle = LOUVER; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 9) { g.fillStyle = '#3d1513'; g.fillRect(0, y, w, 3); g.fillStyle = '#8a3a34'; g.fillRect(0, y + 3, w, 1.5); } g.fillStyle = '#4a1a18'; g.fillRect(cx - 1.5, 0, 3, h); }
      else { g.fillStyle = '#232a38'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 14) for (let x = 0; x < w; x += 12) { const t = r(); g.fillStyle = t < 0.2 ? '#3b3350' : t < 0.4 ? '#2c4250' : t < 0.55 ? '#4a3a3a' : t < 0.65 ? '#5a5a48' : '#262e3e'; g.fillRect(x, y, 11, 13); } }
      g.restore(); g.strokeStyle = '#d6bf98'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - lw / 2, h); g.lineTo(cx - lw / 2, top + lw * 0.5 / asp * 1.2); g.quadraticCurveTo(cx - lw / 2, top, cx, top - lw * 0.25); g.quadraticCurveTo(cx + lw / 2, top, cx + lw / 2, top + lw * 0.5 / asp * 1.2); g.lineTo(cx + lw / 2, h); g.stroke();
    }
    const cy = h * 0.2, rx = w * 0.27, ry = rx / asp;
    g.save(); g.translate(w / 2, cy); g.scale(1, ry / rx);
    g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fillStyle = head === 'clock' ? '#f1ecdc' : fill === 'louver' ? '#3a1614' : '#232a38'; g.fill(); g.lineWidth = 9; g.strokeStyle = '#d6bf98'; g.stroke();
    if (head === 'clock') { g.strokeStyle = '#2a2622'; g.lineWidth = 4; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; g.beginPath(); g.moveTo(Math.cos(a) * rx * 0.68, Math.sin(a) * rx * 0.68); g.lineTo(Math.cos(a) * rx * 0.86, Math.sin(a) * rx * 0.86); g.stroke(); } g.lineWidth = 5; g.beginPath(); g.moveTo(0, 0); g.lineTo(rx * 0.1, -rx * 0.6); g.moveTo(0, 0); g.lineTo(-rx * 0.38, rx * 0.12); g.stroke(); }
    else { g.strokeStyle = '#d6bf98'; g.lineWidth = 7; const n = head === 'rose' ? 8 : 4; for (let k = 0; k < n; k++) { const a = k * Math.PI * 2 / n + Math.PI / n; g.beginPath(); g.arc(Math.cos(a) * rx * 0.5, Math.sin(a) * rx * 0.5, rx * (n === 4 ? 0.42 : 0.24), 0, 7); g.stroke(); } if (n === 8) { g.beginPath(); g.arc(0, 0, rx * 0.22, 0, 7); g.stroke(); } }
    g.restore();
  }, { aniso: 8, wrap: false });
}
const cellTex = (draw, w = 128, h = 128) => canvasTex(w, h, draw, { aniso: 8 });
// 一排小尖券（盲券带、檐下的小券）：一格一个
const arcadeTex = dark => cellTex((g, w, h) => { g.fillStyle = '#c4a97f'; g.fillRect(0, 0, w, h); g.fillStyle = dark; g.beginPath(); g.moveTo(w * 0.2, h); g.lineTo(w * 0.2, h * 0.42); g.quadraticCurveTo(w * 0.2, h * 0.14, w * 0.5, h * 0.06); g.quadraticCurveTo(w * 0.8, h * 0.14, w * 0.8, h * 0.42); g.lineTo(w * 0.8, h); g.fill(); g.strokeStyle = '#dcc7a2'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#dcc7a2'; g.fillRect(0, 0, w * 0.08, h); g.fillRect(w * 0.92, 0, w * 0.08, h); g.fillStyle = '#00000030'; g.fillRect(0, h - 5, w, 5); }, 64, 128);
// 镂空的栏杆：一格一个四叶孔
const balTex = () => cellTex((g, w, h) => { g.fillStyle = '#cdb38a'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.arc(w / 2 + Math.cos(a) * w * 0.16, h * 0.52 + Math.sin(a) * w * 0.16, w * 0.15, 0, 7); g.fill(); } g.globalCompositeOperation = 'source-over'; g.fillStyle = '#b89c72'; g.fillRect(0, 0, w, h * 0.1); g.fillRect(0, h * 0.9, w, h * 0.1); g.fillRect(0, 0, w * 0.07, h); g.fillRect(w * 0.93, 0, w * 0.07, h); }, 96, 96);
const tileTex = () => canvasTex(256, 256, (g, w, h) => { const r = rng(4); g.fillStyle = '#7b756b'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { for (let x = 0; x < w; x += 10) { g.fillStyle = `hsl(${30 + r() * 10} ${7 + r() * 8}% ${38 + r() * 13}%)`; g.fillRect(x, y, 9, 15); } g.fillStyle = '#0000003a'; g.fillRect(0, y + 14, w, 2); } });
const paveTex = () => canvasTex(256, 256, (g, w, h) => { const r = rng(6); g.fillStyle = '#a9a59c'; g.fillRect(0, 0, w, h); for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) { g.fillStyle = `hsl(40 5% ${63 + r() * 3.5}%)`; g.fillRect(i * 128 + (j % 2) * 64 - 64 + 1, j * 64 + 1, 126, 62); g.fillRect(i * 128 + (j % 2) * 64 + 192 + 1, j * 64 + 1, 126, 62); } for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? '#00000010' : '#ffffff14'; g.fillRect(r() * w, r() * h, 1.5, 1.5); } });
const cityTex = () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { g.fillStyle = '#6d6a66'; g.fillRect(i * 21 + 6, j * 21 + 5, 10, 12); g.fillStyle = '#cfc8ba'; g.fillRect(i * 21 + 4, j * 21 + 17, 14, 2); } });
const tympTex = () => canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#bfa47a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a3026'; g.fillStyle = '#3a3026'; const c = w / 2, cy = h * 0.5; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.arc(c + Math.cos(a) * 46, cy + Math.sin(a) * 46, 15, 0, 7); g.fill(); } g.beginPath(); g.arc(c, cy, 20, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#d8c39c'; g.beginPath(); g.arc(c, cy, 72, 0, 7); g.stroke(); for (const sx of [-1, 1]) { g.fillStyle = '#3a3026'; g.beginPath(); g.arc(c + sx * 92, h * 0.86, 13, 0, 7); g.fill(); } }, { wrap: false });
const fenceTex = () => cellTex((g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#8a2a22'; for (let x = 6; x < w; x += 16) { g.fillRect(x, h * 0.08, 4, h * 0.92); g.beginPath(); g.moveTo(x - 3, h * 0.1); g.lineTo(x + 2, 0); g.lineTo(x + 7, h * 0.1); g.fill(); } g.fillRect(0, h * 0.2, w, 5); g.fillRect(0, h * 0.82, w, 5); g.strokeStyle = '#8a2a22'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h * 0.52, w * 0.2, 0, 7); g.stroke(); });

export function buildExterior({ ext, coarse }) {
  const R = rng(1888), G = C.GROUND;
  const gran = graniteTexture(STONE, 11);
  const stone = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.93, map: gran }), { world: 0.2 });
  const stone2 = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.93, map: gran, side: THREE.DoubleSide }), { world: 0.2 });
  const plain = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const roofMat = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, map: tileTex(), side: THREE.DoubleSide }), { world: 0.45 });
  const E0 = batcher(ext, plain), ES = batcher(ext, stone);
  const A = '#fff7e6', B = '#efe2c8', D = '#dccaa8', DK = '#2a2622';
  // 石色的小部件也走带石纹的材质，免得比墙面白一截
  const E = new Proxy({}, { get: (_, k) => (...args) => { const col = args.find(v => typeof v === 'string' && v[0] === '#'); return (col === A || col === B || col === D ? ES : E0)[k](...args); } });
  const add = (geo, mat, x = 0, y = 0, z = 0, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; ext.add(m); return m; };

  // 攒起来一次画的东西：玻璃面片、券边线脚、屋面
  const panes = new Map(), pane = (mat, x, y, z, w, h, ry) => (panes.get(mat) || panes.set(mat, []).get(mat)).push([x, y, z, w, h, ry]);
  const insts = new Map(), inst = (key, mk, mat, x, y, z, ry = 0, sx = 1) => { let o = insts.get(key); if (!o) insts.set(key, o = { geo: mk(), mat, list: [] }); o.list.push([x, y, z, ry, sx]); };
  const ring = (w, spring, rise, band, depth, x, y, z, ry = 0) => inst(`r${w}/${spring}/${rise}/${band}/${depth}`, () => archRingGeo(w, spring, rise, band, depth), stone, x, y, z, ry);
  const rPos = [], quad = (...p) => { for (const i of [0, 1, 2, 0, 2, 3]) rPos.push(...p[i]); }, tri = (...p) => { for (const q of p) rPos.push(...q); };
  const mkPane = (tex, alpha) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, transparent: !!alpha, alphaTest: alpha ? 0.5 : 0, side: THREE.DoubleSide });
  const bandMat = (tex, alpha) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, alphaTest: alpha ? 0.5 : 0, side: THREE.DoubleSide });
  const M = {
    glass2: mkPane(twoLightTexture('glass', 'quatre', 2.6)), louver2: mkPane(twoLightTexture('louver', 'quatre', 2.6)), belfryRose: mkPane(twoLightTexture('louver', 'rose', 2.7)), belfryClock: mkPane(twoLightTexture('louver', 'clock', 2.7)),
    rose: mkPane(roundTexture(3, 'rose', { stone: '#d6bf98', dark: true }), true), roundLouver: mkPane(canvasTex(128, 128, (g, w) => { g.clearRect(0, 0, w, w); g.beginPath(); g.arc(64, 64, 62, 0, 7); g.clip(); g.fillStyle = LOUVER; g.fillRect(0, 0, w, w); for (let y = 0; y < w; y += 9) { g.fillStyle = '#3d1513'; g.fillRect(0, y, w, 3); } }, { wrap: false }), true),
    quatre: mkPane(roundTexture(5, 'quatre', { stone: '#d6bf98', dark: true }), true), tymp: mkPane(tympTex()),
    arcade: bandMat(arcadeTex('#7d6a50')), arcadeDark: bandMat(arcadeTex('#8c775a')), bal: bandMat(balTex(), true), fence: bandMat(fenceTex(), true),
  };
  // 沿一段墙贴一条带子（盲券、栏杆、铁栅）：n 是外法线，cell 是一格多宽
  const band = (mat, a, b, y0, y1, cell, n = [0, 0], off = 0.04) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]), g = new THREE.PlaneGeometry(len, y1 - y0), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * Math.max(1, Math.round(len / cell))); const m = add(g, mat, (a[0] + b[0]) / 2 + n[0] * off, (y0 + y1) / 2, (a[1] + b[1]) / 2 + n[1] * off, Math.atan2(-(b[1] - a[1]), b[0] - a[0])); m.castShadow = false; return m; };
  // 沿墙的一段长条石（线脚、檐口）
  const course = (a, b, y, hgt, dep, n, color = B) => ES.box((a[0] + b[0]) / 2 + n[0] * dep / 2, y, (a[1] + b[1]) / 2 + n[1] * dep / 2, Math.hypot(b[0] - a[0], b[1] - a[1]) + (dep > 0.3 ? 0.2 : 0), hgt, dep + 0.3, color, Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
  // 檐口：一排小券托着挑出的檐，上面是镂空栏杆
  const eave = (a, b, y, n, bal = true) => { band(M.arcade, a, b, y - 1.0, y, 0.55, n); course(a, b, y, 0.35, 0.35, n, A); if (bal) { const o = [a[0] + n[0] * 0.3, a[1] + n[1] * 0.3], q = [b[0] + n[0] * 0.3, b[1] + n[1] * 0.3]; band(M.bal, o, q, y + 0.35, y + 1.35, 0.8); course(o, q, y + 1.35, 0.14, -0.1, n, A); } };
  // 小尖塔：方身、四面小山花、尖顶、顶上一个石球
  const pinnacle = (x, y, z, w, h, color = B) => { const sh = h * 0.42; ES.box(x, y, z, w, sh, w, color); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; E.prism(x + Math.sin(a) * w * 0.5, y + sh * 0.55, z + Math.cos(a) * w * 0.5, w * 0.9, sh * 0.62, 0.08, A, a); E.box(x + Math.sin(a) * (w * 0.5 + 0.01), y + sh * 0.12, z + Math.cos(a) * (w * 0.5 + 0.01), w * 0.34, sh * 0.5, 0.04, '#5a4a38', a); } ES.spike(x, y + sh, z, w * 0.6, h * 0.5, color); for (let k = 1; k < 4; k++) for (let c = 0; c < 4; c++) { const a = c * Math.PI / 2 + Math.PI / 4, rr = w * 0.6 * (1 - k / 4) * 1.0; E.ball(x + Math.cos(a) * rr, y + sh + h * 0.5 * k / 4, z + Math.sin(a) * rr, w * 0.13, A); } E.ball(x, y + sh + h * 0.52, z, w * 0.2, A); E.ball(x, y + sh + h * 0.57, z, w * 0.11, A); };
  // 山花斜边上的卷叶与顶上的花饰
  const crockets = (x0, y0, x1, y1, z, n, r = 0.14, axis = 'x', fixed = 0) => { for (let k = 1; k <= n; k++) { const t = k / (n + 1), u = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; axis === 'x' ? E.ball(u, y + r * 0.6, z, r, A, 1.2) : E.ball(fixed, y + r * 0.6, u, r, A, 1.2); } };
  const finial = (x, y, z, s = 1) => { E.cyl(x, y, z, 0.07 * s, 0.6 * s, A); E.ball(x, y + 0.35 * s, z, 0.2 * s, A, 0.7); E.ball(x, y + 0.72 * s, z, 0.15 * s, A); };
  const stoneCross = (x, y, z, s = 1, ry = 0) => { ES.box(x, y, z, 0.3 * s, 2.6 * s, 0.3 * s, A); ES.box(x, y + 1.55 * s, z, ry ? 0.3 * s : 1.6 * s, 0.3 * s, ry ? 1.6 * s : 0.3 * s, A); for (const [dx, dy] of [[0.8, 1.7], [-0.8, 1.7], [0, 2.6]]) E.ball(x + (ry ? 0 : dx * s), y + dy * s, z + (ry ? dx * s : 0), 0.24 * s, A); };

  // ===== 地面、院子、周边 =====
  { const g0 = add(new THREE.PlaneGeometry(2600, 2600), new THREE.MeshStandardMaterial({ color: '#86847f', roughness: 1 }), 0, G - 0.03, 0); g0.rotation.x = -Math.PI / 2; g0.castShadow = false;
    const Y = C.YARD, pm = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, map: paveTex() }), { world: 0.16 });
    const yard = add(new THREE.PlaneGeometry(Y.x1 - Y.x0, Y.z1 - Y.z0), pm, (Y.x0 + Y.x1) / 2, G, (Y.z0 + Y.z1) / 2); yard.rotation.x = -Math.PI / 2; yard.castShadow = false;
    // 教堂的石基座与门前五级台阶
    ES.box(0, G, (C.Z_FRONT + C.Z_APSE) / 2, C.CHAP * 2 + 1.4, -G, C.Z_FRONT - C.Z_APSE + 1.4, D); ES.box(0, G, (C.Z_CROSS0 + C.Z_CROSS1) / 2, C.TRANS * 2 + 1.4, -G, 12, D); ES.cyl(0, G, C.Z_APSE, C.APSE_R + 1.3, -G, D, 'oct');
    for (let k = 0; k < 5; k++) ES.box(0, G, 38.6 + C.STAIR / 2 * (5 - k) / 5 + 0.2, 31.5 - k * 0.2, -G * (k + 1) / 5, C.STAIR * (5 - k) / 5 + 0.4, k % 2 ? '#d9cfbb' : '#cfc5b0');
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) ES.box(s * (C.CHAP + 0.7 + (4 - k) * 0.22), G, C.naveMid(C.SIDE_DOOR_BAY), (4 - k) * 0.44 + 0.4, -G * (k + 1) / 4, 3.6, '#cfc5b0');
    // 一德路与铁栅、大门
    const road = add(new THREE.PlaneGeometry(700, 15), new THREE.MeshStandardMaterial({ color: '#4d4d50', roughness: 1 }), 0, G - 0.01, Y.z1 + 8.2); road.rotation.x = -Math.PI / 2; road.castShadow = false;
    for (let x = -330; x < 330; x += 9) E.box(x, G, Y.z1 + 8.2, 4, 0.02, 0.18, '#d9d6cc');
    for (const s of [-1, 1]) { band(M.fence, [s * Y.gate, Y.z1], [s > 0 ? Y.x1 : Y.x0, Y.z1], G + 0.5, G + 3.4, 1.6); E.box(s * (Y.gate + (s > 0 ? Y.x1 : -Y.x0)) / 2, G, Y.z1, (s > 0 ? Y.x1 : -Y.x0) - Y.gate, 0.5, 0.5, '#e9e6dc');
      E.box(s * Y.gate, G, Y.z1, 1.5, 5.4, 1.5, '#f1efe6'); E.box(s * Y.gate, G + 5.4, Y.z1, 1.9, 0.3, 1.9, '#e2dfd4'); E.spike(s * Y.gate, G + 5.7, Y.z1, 1.1, 0.9, '#d9d6cc'); E.ball(s * Y.gate, G + 6.75, Y.z1, 0.26, '#d9d6cc');
      for (let x = Y.gate + 9; x < (s > 0 ? Y.x1 : -Y.x0); x += 9) E.box(s * x, G, Y.z1, 0.7, 3.7, 0.7, '#f1efe6');
      band(M.fence, [s * Y.gate, Y.z1], [s * Y.gate, Y.z1 - 3.6], G + 0.1, G + 3.6, 1.6); }              // 敞开的两扇铁门
  }
  // 院里的几栋房子（示意）
  for (const b of C.BUILDINGS) { E.box(b.x, G, b.z, b.hx * 2, b.h, b.hz * 2, b.color); for (let f2 = 1; f2 * 3.6 < b.h; f2++) E.box(b.x, G + f2 * 3.6 - 0.1, b.z, b.hx * 2 + 0.15, 0.2, b.hz * 2 + 0.15, '#f6f2e6');
    const along = b.hz > b.hx, n = Math.floor((along ? b.hz : b.hx) * 2 / 2.6); for (let k = 0; k < n; k++) for (let fl = 0; fl * 3.6 + 3 < b.h; fl++) for (const sd of [-1, 1]) { const u = -((along ? b.hz : b.hx)) + 1.3 + k * 2.6; along ? E.box(b.x + sd * (b.hx + 0.02), G + 1.1 + fl * 3.6, b.z + u, 0.06, 1.7, 1.0, '#59615f') : E.box(b.x + u, G + 1.1 + fl * 3.6, b.z + sd * (b.hz + 0.02), 1.0, 1.7, 0.06, '#59615f'); }
    if (b.roof === 'tile') { const yy = G + b.h; along ? (quad([b.x - b.hx - 0.4, yy, b.z - b.hz], [b.x - b.hx - 0.4, yy, b.z + b.hz], [b.x, yy + 2.6, b.z + b.hz], [b.x, yy + 2.6, b.z - b.hz]), quad([b.x + b.hx + 0.4, yy, b.z + b.hz], [b.x + b.hx + 0.4, yy, b.z - b.hz], [b.x, yy + 2.6, b.z - b.hz], [b.x, yy + 2.6, b.z + b.hz])) : (quad([b.x - b.hx, yy, b.z + b.hz + 0.4], [b.x + b.hx, yy, b.z + b.hz + 0.4], [b.x + b.hx, yy + 2.6, b.z], [b.x - b.hx, yy + 2.6, b.z]), quad([b.x + b.hx, yy, b.z - b.hz - 0.4], [b.x - b.hx, yy, b.z - b.hz - 0.4], [b.x - b.hx, yy + 2.6, b.z], [b.x + b.hx, yy + 2.6, b.z])); }
    else { const tx = b.x - Math.sign(b.x) * (b.hx - 1.6), tz = b.z - b.hz + 1.6; E.box(b.x, G + b.h, b.z, b.hx * 2 + 0.4, 0.5, b.hz * 2 + 0.4, '#f1ead0'); E.cyl(tx, G + b.h, tz, 1.5, 2.8, '#efe6c0', 'oct'); E.ball(tx, G + b.h + 2.8, tz, 1.55, '#6f7478', 0.9); E.ball(tx, G + b.h + 4.25, tz, 0.2, '#6f7478'); } }
  // 东侧花园：草地、圆形喷水池
  { const lawn = add(new THREE.PlaneGeometry(20, 24), new THREE.MeshStandardMaterial({ color: '#5d8f45', roughness: 1 }), 31, G + 0.02, -10); lawn.rotation.x = -Math.PI / 2; lawn.castShadow = false; const F = C.FOUNTAIN;
    E.cyl(F.x, G, F.z, F.r, 0.5, '#d6d0c2'); E.cyl(F.x, G + 0.42, F.z, F.r - 0.3, 0.1, '#4f8ea6'); E.cyl(F.x, G, F.z, 0.5, 1.3, '#cfc8b8'); E.ball(F.x, G + 1.5, F.z, 0.45, '#cfc8b8'); E.cyl(F.x, G + 0.01, F.z, F.r + 2.2, 0.04, '#b9aa9a'); }
  // 树：西侧一排大树，广场东边一排小树，花园里几棵
  const trees = []; for (let z = -44; z <= 34; z += 9.5) trees.push([-27 - R() * 3, z + R() * 3, 1.5 + R() * 0.4]); for (let z = 46; z <= 76; z += 10) trees.push([24, z, 0.75]); for (const [x, z] of [[24, -22], [40, -18], [38, -2], [24, 0], [-12, -48], [10, -47], [30, -46], [-40, 30], [-40, 5], [-41, -22]]) trees.push([x, z, 1.1 + R() * 0.4]);
  for (const [x, z, s] of trees) { E.cyl(x, G, z, 0.3 * s, 4.2 * s, '#5d4a35'); const gcol = ['#35602f', '#3f6d34', '#476f36', '#2f5a2c']; for (let k = 0; k < 11; k++) { const an = R() * 6.283, d = 0.6 + R() * 2.6, hh = 5.2 + R() * 3.4 - d * 0.35; E.ball(x + Math.cos(an) * d * s, G + hh * s, z + Math.sin(an) * d * s, (1.5 + R() * 1.2) * s, gcol[Math.floor(R() * 4)], 0.8); } }
  // 院子外面的城：全是示意的方盒子，近处矮、远处高
  let cityMesh = null; const city = [], TONES = ['#d6d0c4', '#c9c3b6', '#d9d5cc', '#bfb9ac', '#d2c9b8', '#c6beb0', '#b9b3a8', '#d8cab4'], Y = C.YARD;
  for (let gx = -9; gx <= 9; gx++) for (let gz = -8; gz <= 9; gz++) { const x = gx * 34 + (R() - 0.5) * 8, z = gz * 34 + 8 + (R() - 0.5) * 8; if (x > Y.x0 - 16 && x < Y.x1 + 16 && z > Y.z0 - 16 && z < Y.z1 + 26) continue; if (Math.abs(z - (Y.z1 + 8)) < 20) continue;
    const d = Math.hypot(x, z), tall = R() < (d > 230 ? 0.3 : d > 170 ? 0.12 : 0), hgt = tall ? 55 + R() * 70 : (d < 120 ? 9 + R() * 14 : 12 + R() * 22), w = tall ? 20 + R() * 8 : 20 + R() * 12, dp = tall ? 20 + R() * 8 : 18 + R() * 12; city.push({ x, z, sx: w, sy: hgt, sz: dp, color: TONES[Math.floor(R() * TONES.length)] }); }
  for (let x = -230; x <= 230; x += 15.5) if (Math.abs(x) > 2) { const hgt = 13 + Math.floor(R() * 3) * 3.4; city.push({ x, z: Y.z1 + 23, sx: 15, sy: hgt, sz: 14, color: TONES[Math.floor(R() * TONES.length)] }); for (const o of [-5, 0, 5]) E.box(x + o, G, Y.z1 + 15.8, 0.6, 4.2, 0.6, '#d9d2c2'); E.box(x, G + 4.2, Y.z1 + 17.2, 15, hgt - 4.2, 3.4, '#e2dccf'); }      // 一德路南侧的骑楼（示意）
  { const ct = cityTex(), side = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, map: ct }), { world: 0.085 }), top = new THREE.MeshStandardMaterial({ color: '#bdb7ab', roughness: 1 }), cm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), [side, side, top, top, side, side], city.length), col = new THREE.Color();
    city.forEach((c, i) => { _m.compose(_p.set(c.x, G + c.sy / 2, c.z), _q.identity(), _s.set(c.sx, c.sy, c.sz)); cm.setMatrixAt(i, _m); cm.setColorAt(i, col.set(c.color)); }); cm.castShadow = cm.receiveShadow = true; cm.frustumCulled = false; ext.add(cm); cityMesh = cm; }

  // ===== 中殿、侧廊、小礼拜堂、飞扶壁 =====
  const bays = []; for (let k = 0; k < C.NAVE_BAYS; k++) bays.push({ z0: C.naveLine(k), len: C.NAVE_BAY, door: k === C.SIDE_DOOR_BAY }); for (let j = 0; j < C.CH_BAYS; j++) bays.push({ z0: C.chLine(j), len: C.CH_BAY });
  const XW = C.AX + 0.45, XC = C.CHAP + 0.35, EAVE = C.H.eave, RIDGE = C.H.ridge, XR = C.AX + 0.75;
  // 飞扶壁：一片上缘斜直、下缘是弧的石拱，从外侧石墩顶飞到高墙上
  const flyGeo = (() => { const s = new THREE.Shape(), x0 = XC + 1.5, x1 = XW, n = 14; s.moveTo(x0, 12.2); s.lineTo(x0, 14.6); s.lineTo(x1, 21.9); s.lineTo(x1, 19.6); for (let i = 1; i <= n; i++) { const a = Math.PI / 2 * i / n; s.lineTo(x1 + (x0 - x1) * Math.sin(a), 12.2 + 7.4 * Math.cos(a)); } s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: false }); g.translate(0, 0, -0.275); return g; })();
  for (const s of [-1, 1]) {
    const n = [s, 0];
    for (const b of bays) {
      const z1 = b.z0 - b.len, zm = b.z0 - b.len / 2, ry = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      // 高墙与高侧窗
      slab(ext, stone, { a: [s * (XW - 0.35), b.z0], b: [s * (XW - 0.35), z1], y0: 10.5, y1: EAVE, thick: 0.7, holes: [{ u: b.len / 2, y: 14.2, w: 3.0, spring: 6.4, rise: 2.7 }] });
      pane(M.glass2, s * (XW - 0.45), 14.2 + 4.55, zm, 3.05, 9.1, ry); ring(3.0, 6.4, 2.7, 0.2, 0.22, s * (XW - 0.05), 14.2, zm, ry);
      course([s * XW, b.z0], [s * XW, z1], 13.9, 0.3, 0.2, n, A);
      // 侧廊的单坡屋面
      const xa = s * XW, xb = s * (C.AISLE + 0.2); s > 0 ? quad([xa, 13.4, z1], [xa, 13.4, b.z0], [xb, 11.3, b.z0], [xb, 11.3, z1]) : quad([xa, 13.4, b.z0], [xa, 13.4, z1], [xb, 11.3, z1], [xb, 11.3, b.z0]);
      // 小礼拜堂：朝外一面小山墙，双尖窗；各自一个小两坡顶
      const wl = b.len - 1.2;
      slab(ext, stone, { a: [s * XC, b.z0 - 0.6], b: [s * XC, z1 + 0.6], y1: 7.6, gable: 2.7, thick: 0.6, holes: b.door ? [{ u: wl / 2, y: 0, w: 2.2, spring: 2.6, rise: 1.5 }] : [{ u: wl / 2, y: 2.5, w: 2.5, spring: 3.3, rise: 2.0 }] });
      if (b.door) { for (let i = 0; i < 3; i++) ring(2.2 - 0 + i * 0.5, 2.6, 1.5 + i * 0.25, 0.25, 0.22, s * (XC + 0.3 + i * 0.2), 0, zm, ry); E.box(s * (XC - 0.2), 0, zm, 0.12, 2.9, 2.2, '#6e2320'); pane(M.tymp, s * (XC - 0.15), 3.6, zm, 2.2, 1.5, ry); slab(ext, stone, { a: [s * (XC + 0.95), zm + 2.1], b: [s * (XC + 0.95), zm - 2.1], y1: 3.4, gable: 4.6, thick: 0.4, holes: [{ u: 2.1, y: 0, w: 3.2, spring: 2.6, rise: 2.1 }] }); E.hoop(s * (XC + 1.17), 6.2, zm, 0.5, A, [0, Math.PI / 2, 0]); finial(s * (XC + 0.95), 8.0, zm, 0.9); }
      else { pane(M.glass2, s * (XC - 0.12), 2.5 + 2.65, zm, 2.55, 5.3, ry); ring(2.5, 3.3, 2.0, 0.18, 0.2, s * (XC + 0.28), 2.5, zm, ry); course([s * XC, b.z0 - 0.6], [s * XC, z1 + 0.6], 2.2, 0.25, 0.25, n, A); }
      E.hoop(s * (XC + 0.32), 8.9, zm, 0.36, A, [0, Math.PI / 2, 0]); finial(s * XC, 10.25, zm, 0.7);
      const xo = s * (XC + 0.3), xi = s * (C.AISLE + 0.1); for (const e of [-1, 1]) { const ze = zm + e * wl / 2; (s * e > 0) ? quad([xo, 7.6, ze], [xi, 7.6, ze], [xi, 10.2, zm], [xo, 10.2, zm]) : quad([xi, 7.6, ze], [xo, 7.6, ze], [xo, 10.2, zm], [xi, 10.2, zm]); }
      // 高墙上每个开间之间的壁柱
      ES.box(s * (XW + 0.25), 10.5, z1, 0.6, EAVE - 10.9, 0.8, B);
    }
    // 落地的石墩、墩顶的小尖塔、飞扶壁
    for (const p of C.BUTTRESS) if (Math.sign(p.x) === s) { const x = p.x, z = p.z;
      ES.box(x, G, z, 2.3, 9 - G, 1.3, B); ES.box(x - s * 0.15, 9, z, 1.9, 4.4, 1.1, B); E.prism(x + s * 0.72, 9, z, 1.1, 1.0, 0.5, A, Math.PI / 2); ES.box(x + s * 0.1, 13.4, z, 1.5, 1.6, 1.0, A);
      for (const yy of [3.2, 9.05]) course([x + s * 1.15, z + 0.65], [x + s * 1.15, z - 0.65], yy, 0.22, 0.12, [s, 0], A);
      E.prism(x + s * 0.86, 13.4, z, 1.0, 1.9, 0.12, A, Math.PI / 2); pinnacle(x + s * 0.1, 15.0, z, 0.95, 4.6);
      inst('fly', () => flyGeo, stone2, 0, 0, z, 0, s); ES.box(s * (XW + 0.4), 10.5, z, 0.9, 11.6, 1.0, B);
      // 礼拜堂之间落水的兽头
      E.box(x + s * 1.45, 11.8, z, 0.9, 0.22, 0.22, '#b59d78'); }
    // 檐口、栏杆、每个开间一座小尖塔
    eave([s * XW, C.Z_TOWER], [s * XW, C.Z_CROSS0 + 0.3], EAVE, n); eave([s * XW, C.Z_CROSS1 - 0.3], [s * XW, C.Z_APSE], EAVE, n);
    for (const b of bays) pinnacle(s * (XW + 0.45), EAVE + 0.3, b.z0 - b.len, 0.6, 2.9);
    // 侧廊北端的墙
    slab(ext, stone, { a: [s * C.AX, C.Z_APSE - 0.3], b: [s * (XC + 0.3), C.Z_APSE - 0.3], y1: 11.5, gable: 0, thick: 0.6 });
  }
  // 屋面：中殿与横厅两条屋脊在十字交叉处相交
  { const zs = C.Z_TOWER + 0.4, zn = C.Z_APSE; quad([XR, EAVE + 0.3, zn], [XR, EAVE + 0.3, zs], [0, RIDGE, zs], [0, RIDGE, zn]); quad([-XR, EAVE + 0.3, zs], [-XR, EAVE + 0.3, zn], [0, RIDGE, zn], [0, RIDGE, zs]);
    const zc = (C.Z_CROSS0 + C.Z_CROSS1) / 2, hz = (C.Z_CROSS0 - C.Z_CROSS1) / 2 + 0.55, xe = C.TRANS + 0.2;
    for (const s of [-1, 1]) { quad([s * xe, EAVE + 0.3, zc + hz], [0, EAVE + 0.3, zc + hz], [0, RIDGE, zc], [s * xe, RIDGE, zc]); quad([0, EAVE + 0.3, zc - hz], [s * xe, EAVE + 0.3, zc - hz], [s * xe, RIDGE, zc], [0, RIDGE, zc]); }
    ES.box(0, RIDGE - 0.1, (zs + zn) / 2, 0.3, 0.3, zs - zn, '#4a443c'); ES.box(0, RIDGE - 0.1, zc, xe * 2, 0.3, 0.3, '#4a443c'); }

  // ===== 横厅两端 =====
  const zc = (C.Z_CROSS0 + C.Z_CROSS1) / 2, XT = C.TRANS + 0.43;
  for (const s of [-1, 1]) {
    const ry = s > 0 ? Math.PI / 2 : -Math.PI / 2, zA = C.Z_CROSS0 + 0.6, zB = C.Z_CROSS1 - 0.6, w = zA - zB, tr = C.WIN.transRose;
    slab(ext, stone, { a: [s * (XT - 0.35), zA], b: [s * (XT - 0.35), zB], y1: EAVE, gable: RIDGE - EAVE + 0.6, thick: 0.7, holes: [{ u: w / 2, y: tr.y, r: tr.r + 0.25 }, { u: w / 2, y: 28.4, r: 0.95 }] });
    pane(M.rose, s * (XT - 0.4), tr.y, zc, tr.r * 2 + 0.6, tr.r * 2 + 0.6, ry); pane(M.roundLouver, s * (XT - 0.4), 28.4, zc, 2.0, 2.0, ry);
    for (const [rr, tube] of [[tr.r + 0.45, 0.22], [tr.r + 0.85, 0.14]]) { const t = add(new THREE.TorusGeometry(rr, tube, 8, 48), stone, s * (XT + 0.02), tr.y, zc, ry); t.material = stone; }
    E.hoop(s * (XT + 0.03), 28.4, zc, 1.1, A, [0, Math.PI / 2, 0]);
    course([s * XT, zA], [s * XT, zB], 7.6, 0.3, 0.25, [s, 0], A); course([s * XT, zA], [s * XT, zB], 17.6, 0.3, 0.25, [s, 0], A); band(M.arcade, [s * XT, zA], [s * XT, zB], 17.9, 19.9, 0.9, [s, 0]);
    band(M.arcade, [s * XT, zA], [s * XT, zB], EAVE - 1.0, EAVE, 0.55, [s, 0]); course([s * XT, zA], [s * XT, zB], EAVE, 0.35, 0.3, [s, 0], A);
    crockets(zA, EAVE + 0.5, zc, RIDGE + 1.0, 0, 7, 0.2, 'z', s * (XT + 0.05)); crockets(zB, EAVE + 0.5, zc, RIDGE + 1.0, 0, 7, 0.2, 'z', s * (XT + 0.05)); stoneCross(s * (XT - 0.3), RIDGE + 0.8, zc, 0.8, 1);
    // 转角的扶壁与小尖塔
    for (const e of [-1, 1]) { const z = zc + e * (w / 2 - 0.1); ES.box(s * (XT + 0.7), G, z, 1.5, 12 - G, 1.3, B); ES.box(s * (XT + 0.5), 12, z, 1.1, 9, 1.1, B); E.prism(s * (XT + 0.95), 12, z, 1.1, 1.0, 0.3, A, Math.PI / 2); ES.box(s * (XT - 0.1), G, z + e * 0.9, 1.3, 21 - G, 1.4, B); ES.box(s * (XT + 0.2), 21, z, 1.0, EAVE - 21, 1.0, A); pinnacle(s * (XT + 0.1), EAVE, z, 1.0, 5.2); }
    // 横厅朝南、朝北的两面墙，各一扇高窗
    for (const e of [-1, 1]) { const z = zc + e * (C.Z_CROSS0 - C.Z_CROSS1) / 2 + e * 0.25; slab(ext, stone, { a: [s * XW, z], b: [s * XT, z], y0: 0, y1: EAVE, thick: 0.7, holes: [{ u: 6.4, y: 14.2, w: 2.6, spring: 6.4, rise: 2.4 }] }); pane(M.glass2, s * (XW + 6.4), 14.2 + 4.4, z - e * 0.1, 2.65, 8.8, e > 0 ? 0 : Math.PI); eave([s * (XW + 0.8), z + e * 0.35], [s * XT, z + e * 0.35], EAVE, [0, e]); }
  }

  // ===== 后殿 =====
  { const Ro = (C.APSE_R + 0.5) / Math.cos(Math.PI / 10), AP = []; for (let i = 0; i <= 5; i++) { const a = Math.PI * i / 5; AP.push([Ro * Math.cos(a), C.Z_APSE - Ro * Math.sin(a)]); }
    for (let i = 0; i < 5; i++) { const a = AP[i + 1], b = AP[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, nx = (mx) / Math.hypot(mx, mz - C.Z_APSE), nz = (mz - C.Z_APSE) / Math.hypot(mx, mz - C.Z_APSE), ry = Math.atan2(nx, nz);
      slab(ext, stone, { a, b, y1: EAVE, thick: 0.7, holes: [{ u: len / 2, y: 7.0, w: 2.3, spring: 11.4, rise: 2.2 }] });
      pane(M.glass2, mx - nx * 0.2, 7.0 + 6.8, mz - nz * 0.2, 2.35, 13.6, ry); ring(2.3, 11.4, 2.2, 0.18, 0.2, mx + nx * 0.3, 7.0, mz + nz * 0.3, ry);
      course(a, b, 6.6, 0.3, 0.25, [nx, nz], A); eave([a[0] + nx * 0.35, a[1] + nz * 0.35], [b[0] + nx * 0.35, b[1] + nz * 0.35], EAVE, [nx, nz]);
      tri([a[0] + nx * 0.3, EAVE + 0.3, a[1] + nz * 0.3], [b[0] + nx * 0.3, EAVE + 0.3, b[1] + nz * 0.3], [0, RIDGE, C.Z_APSE]); }
    for (const [x, z] of AP) { const d = Math.hypot(x, z - C.Z_APSE), ux = x / d, uz = (z - C.Z_APSE) / d, ry = Math.atan2(-uz, ux);
      ES.box(x + ux * 0.9, G, z + uz * 0.9, 2.2, 10 - G, 1.1, B, ry); ES.box(x + ux * 0.7, 10, z + uz * 0.7, 1.8, 8, 1.0, B, ry); ES.box(x + ux * 0.45, 18, z + uz * 0.45, 1.3, EAVE - 18, 0.9, A, ry); E.prism(x + ux * 1.75, 10, z + uz * 1.75, 1.0, 1.0, 0.3, A, ry + Math.PI / 2); E.prism(x + ux * 1.35, 18, z + uz * 1.35, 0.9, 1.0, 0.3, A, ry + Math.PI / 2);
      pinnacle(x + ux * 0.5, EAVE + 0.3, z + uz * 0.5, 0.8, 4.2); }
    stoneCross(0, RIDGE, C.Z_APSE, 0.6); }

  // ===== 正立面与双塔 =====
  const ZF = 38.6, T = C.TOWER;
  // 一座往里层层收进的尖券门：n 道券，每道往里退一步；门上一个带卷叶的尖山花
  function portal(cx, wd, sp, rise, n, gApex) {
    const bw = 0.32, step = 0.3, back = ZF - n * step, ow = wd + 2 * bw * n, oRise = rise + bw * n, doorH = sp - 0.1;
    for (let i = 0; i < n; i++) { ring(wd + 2 * bw * i, sp, rise + bw * i, bw, step + 0.02, cx, 0, back + i * step);
      for (const e of [-1, 1]) { const x = cx + e * (wd / 2 + bw * i + bw * 0.55), z = back + i * step + step; E.cyl(x, 0.5, z, 0.085, sp - 0.75, A); E.cyl(x, 0, z, 0.14, 0.5, D, 'oct'); E.ball(x, sp - 0.12, z, 0.15, A, 1.1); } }
    slab(ext, stone, { a: [cx - ow / 2 - 0.75, ZF + 0.2], b: [cx + ow / 2 + 0.75, ZF + 0.2], y1: sp + 0.8, gable: gApex - sp - 0.8, thick: 0.5, holes: [{ u: ow / 2 + 0.75, y: 0, w: ow, spring: sp, rise: oRise }] });
    const hw = ow / 2 + 0.75; crockets(cx - hw, sp + 0.9, cx, gApex + 0.1, ZF + 0.3, 8, 0.16); crockets(cx + hw, sp + 0.9, cx, gApex + 0.1, ZF + 0.3, 8, 0.16); finial(cx, gApex, ZF + 0.2, 1.3);
    const gy = (sp + oRise + gApex) / 2 - 0.3; E.hoop(cx, gy, ZF + 0.47, Math.min(0.75, (gApex - sp - oRise) * 0.2), A); E.hoop(cx, gy, ZF + 0.47, Math.min(0.75, (gApex - sp - oRise) * 0.2) * 0.45, A);
    // 门楣、门楣上的石花格、敞开的红门扇、门里的暗处
    ES.box(cx, doorH, back - 0.1, wd + 0.2, 0.3, 0.3, A); pane(M.tymp, cx, doorH + 0.3 + (sp + rise - doorH - 0.3) / 2, back - 0.12, wd + 0.1, sp + rise - doorH - 0.3, 0);
    for (const e of [-1, 1]) E.box(cx + e * (wd / 2 - 0.05), 0, back - 0.2 - wd / 4, 0.09, doorH, wd / 2, '#7a2420');
    E.box(cx, 0, back - wd / 2 - 0.6, wd + 0.8, doorH + 0.2, 0.1, '#120f0c'); E.box(cx, 0.01, back - wd / 4 - 0.3, wd, 0.02, wd / 2 + 0.6, '#3a352e');
    return { ow, oRise, sp };
  }
  const main = portal(0, 3.1, 4.6, 3.4, 5, 15.6);
  // 中间一跨：门、玫瑰窗、山花
  { const rs = C.WIN.rose; slab(ext, stone, { a: [-5.7, ZF - 0.35], b: [5.7, ZF - 0.35], y1: 25, gable: 6.9, thick: 0.7, holes: [{ u: 5.7, y: 0, w: main.ow, spring: main.sp, rise: main.oRise }, { u: 5.7, y: rs.y, r: rs.r + 0.3 }, { u: 5.7, y: 28.0, r: 1.05 }] });
    pane(M.rose, 0, rs.y, ZF - 0.5, rs.r * 2 + 0.7, rs.r * 2 + 0.7, 0); pane(M.roundLouver, 0, 28.0, ZF - 0.5, 2.2, 2.2, 0);
    for (const [rr, tube] of [[rs.r + 0.5, 0.26], [rs.r + 0.95, 0.16], [rs.r + 1.3, 0.1]]) add(new THREE.TorusGeometry(rr, tube, 8, 64), stone, 0, rs.y, ZF + 0.02);
    for (const [rr, tube] of [[1.2, 0.13], [1.5, 0.08]]) add(new THREE.TorusGeometry(rr, tube, 6, 32), stone, 0, 28.0, ZF + 0.02);
    for (const sx of [-1, 1]) { E.hoop(sx * 2.4, 26.3, ZF + 0.03, 0.42, A); E.hoop(sx * 4.2, 14.2, ZF + 0.03, 0.5, A); E.hoop(sx * 4.2, 23.4, ZF + 0.03, 0.5, A); }
    E.hoop(0, 30.2, ZF + 0.03, 0.4, A);
    for (const sx of [-1, 1]) { band(M.arcade, [sx * 5.6, ZF], [sx * 4.05, ZF], 11.0, 12.9, 0.75, [0, 1]); course([sx * 5.6, ZF], [sx * 4.2, ZF], 12.9, 0.35, 0.3, [0, 1], A); }
    band(M.arcade, [-5.6, ZF], [5.6, ZF], 23.6, 24.7, 0.6, [0, 1]); course([-5.6, ZF], [5.6, ZF], 24.7, 0.4, 0.4, [0, 1], A); band(M.bal, [-5.6, ZF + 0.3], [5.6, ZF + 0.3], 25.1, 26.0, 0.8);
    // 山花的斜边：一排齿饰加卷叶，顶上石十字架
    for (const sx of [-1, 1]) { ES.rod([sx * 5.9, 24.9, ZF + 0.1], [0, 32.1, ZF + 0.1], 0.2, A); for (let k = 1; k < 16; k++) E.box(sx * 5.9 * (1 - k / 16), 24.75 + 7.2 * k / 16 - 0.45, ZF + 0.05, 0.16, 0.3, 0.2, D); crockets(sx * 5.9, 25.2, 0, 32.3, ZF + 0.12, 9, 0.17); }
    stoneCross(0, 32.0, ZF - 0.2, 1.0); }
  const facesOf = cx => [{ n: [0, 1], ry: 0 }, { n: [Math.sign(cx), 0], ry: Math.sign(cx) * Math.PI / 2, outer: true }, { n: [0, -1], ry: Math.PI, north: true }, { n: [-Math.sign(cx), 0], ry: -Math.sign(cx) * Math.PI / 2, inner: true }];
  let spires = 0;
  for (const s of [-1, 1]) {
    const cx = s * T.cx, cz = (T.z0 + T.z1) / 2, hf = T.half, side = portal(cx, 2.1, 3.8, 2.6, 3, 12.4), clock = s < 0;
    for (const fc of facesOf(cx)) {
      const [nx, nz] = fc.n, tx = nz, tz = -nx, fx = cx + nx * hf, fz = cz + nz * hf, a = [fx - tx * hf - nx * 0.35, fz - tz * hf - nz * 0.35], b = [fx + tx * hf - nx * 0.35, fz + tz * hf - nz * 0.35], A0 = [fx - tx * hf, fz - tz * hf], B0 = [fx + tx * hf, fz + tz * hf];
      const holes = [{ u: hf, y: 29.4, w: 3.2, spring: 4.9, rise: 2.7 }];
      if (!fc.inner && !fc.north) holes.push({ u: hf, y: 14.2, w: 4.0, spring: 5.2, rise: 3.5 });
      if (fc.ry === 0) holes.push({ u: hf, y: 0, w: side.ow, spring: side.sp, rise: side.oRise });
      slab(ext, stone, { a, b, y1: T.belfry, thick: 0.7, holes });
      // 钟室：一对装红百叶的长窗，券头是钟面或石花格
      pane(clock && !fc.inner ? M.belfryClock : M.belfryRose, fx - nx * 0.45, 29.4 + 3.8, fz - nz * 0.45, 3.25, 7.6, fc.ry); ring(3.2, 4.9, 2.7, 0.22, 0.25, fx + nx * 0.02, 29.4, fz + nz * 0.02, fc.ry); ring(3.64, 4.9, 2.92, 0.14, 0.14, fx + nx * 0.27, 29.4, fz + nz * 0.27, fc.ry);
      for (const e of [-1, 1]) { E.cyl(fx + tx * e * 2.05 + nx * 0.2, 29.4, fz + tz * e * 2.05 + nz * 0.2, 0.1, 4.9, A); E.ball(fx + tx * e * 2.05 + nx * 0.2, 34.35, fz + tz * e * 1.75 + nz * 0.2, 0.17, A); }
      if (!fc.inner && !fc.north) { pane(M.louver2, fx - nx * 0.45, 14.2 + 4.35, fz - nz * 0.45, 4.05, 8.7, fc.ry); ring(4.0, 5.2, 3.5, 0.24, 0.25, fx + nx * 0.02, 14.2, fz + nz * 0.02, fc.ry); ring(4.48, 5.2, 3.74, 0.16, 0.14, fx + nx * 0.27, 14.2, fz + nz * 0.27, fc.ry);
        band(M.arcade, A0, B0, 11.0, 12.9, 0.75, fc.n); course(A0, B0, 12.9, 0.35, 0.3, fc.n, A); band(M.arcade, A0, B0, 23.6, 24.7, 0.6, fc.n);
        if (fc.outer) { course(A0, B0, 6.4, 0.3, 0.2, fc.n, A); band(M.arcadeDark, [fx - tx * 1.6, fz - tz * 1.6], [fx + tx * 1.6, fz + tz * 1.6], 2.2, 5.6, 1.05, fc.n); } }
      course(A0, B0, 24.7, 0.4, 0.4, fc.n, A);
      // 钟室下面的一排小券
      band(M.arcadeDark, A0, B0, 25.3, 28.5, 0.98, fc.n); course(A0, B0, 28.5, 0.35, 0.3, fc.n, A);
      // 钟室每面顶上的山花，冲出栏杆
      { const gb = 37.3, ga = 42.4, gx = fx + nx * 0.3, gz = fz + nz * 0.3; E.prism(gx, gb, gz, 4.3, ga - gb, 0.4, B, fc.ry);
        for (const e of [-1, 1]) for (let k = 1; k <= 6; k++) { const t = k / 7; E.ball(gx + tx * e * 2.15 * (1 - t) + nx * 0.1, gb + (ga - gb) * t + 0.12, gz + tz * e * 2.15 * (1 - t) + nz * 0.1, 0.15, A, 1.2); }
        E.hoop(gx + nx * 0.22, gb + 1.35, gz + nz * 0.22, 0.52, A, [0, fc.ry, 0]); E.hoop(gx + nx * 0.22, gb + 1.35, gz + nz * 0.22, 0.22, A, [0, fc.ry, 0]); finial(gx, ga, gz, 1.1);
        band(M.arcade, [fx - tx * hf, fz - tz * hf], [fx - tx * 2.2, fz - tz * 2.2], 37.3, 38.4, 0.55, fc.n); band(M.arcade, [fx + tx * 2.2, fz + tz * 2.2], [fx + tx * hf, fz + tz * hf], 37.3, 38.4, 0.55, fc.n); }
      course(A0, B0, 38.6, 0.4, 0.45, fc.n, A); band(M.bal, [A0[0] + nx * 0.4, A0[1] + nz * 0.4], [B0[0] + nx * 0.4, B0[1] + nz * 0.4], 39.0, 40.1, 0.8);
      // 每个转角两片扶壁，越往上越薄；正面的带一个小龛
      for (const e of [-1, 1]) { const bx = fx + tx * e * (hf - 0.55), bz = fz + tz * e * (hf - 0.55);
        if (fc.inner && true) { ES.box(bx + nx * 0.3, 25, bz + nz * 0.3, 1.2, 12, 0.7, B, fc.ry); continue; }
        const st = [[G, 12.9, 1.5, 1.5], [12.9, 24.7, 1.35, 1.1], [24.7, 33.5, 1.2, 0.75], [33.5, 37.6, 1.05, 0.45]];
        for (const [y0, y1, w, d] of st) { if (fc.north && y1 < 25) continue; ES.box(bx + nx * d / 2, y0, bz + nz * d / 2, w, y1 - y0, d + 0.2, B, fc.ry); E.prism(bx + nx * (d + 0.02), y1 - 1.5, bz + nz * (d + 0.02), w * 0.95, 1.5, 0.1, A, fc.ry); E.ball(bx + nx * (d + 0.02), y1 + 0.12, bz + nz * (d + 0.02), 0.14, A); }
        if (!fc.north) for (const [yy, dd] of [[7.4, 1.5], [18.4, 1.1]]) { E.box(bx + nx * (dd + 0.11), yy, bz + nz * (dd + 0.11), 0.6, 2.2, 0.06, '#6b5a44', fc.ry); E.prism(bx + nx * (dd + 0.14), yy + 2.2, bz + nz * (dd + 0.14), 0.95, 0.95, 0.1, A, fc.ry); E.cyl(bx + nx * (dd + 0.16), yy + 0.2, bz + nz * (dd + 0.16), 0.13, 1.3, '#d8c8a8'); E.ball(bx + nx * (dd + 0.16), yy + 1.62, bz + nz * (dd + 0.16), 0.12, '#d8c8a8'); }
        if (fc.north) continue; }
    }
    // 四角的大尖塔龛
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) { const px = cx + ex * (hf + 0.15), pz = cz + ez * (hf + 0.15); ES.cyl(px, 37.6, pz, 0.62, 1.3, B, 'oct'); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; E.cyl(px + Math.cos(a) * 0.42, 38.9, pz + Math.sin(a) * 0.42, 0.09, 1.9, A); } E.cyl(px, 38.9, pz, 0.25, 1.9, '#4a3d2e'); ES.cyl(px, 40.8, pz, 0.64, 0.25, A, 'oct'); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; E.prism(px + Math.sin(a) * 0.5, 41.0, pz + Math.cos(a) * 0.5, 0.9, 0.9, 0.08, A, a); } ES.spike(px, 41.05, pz, 0.52, 3.6, B); for (let k = 1; k < 5; k++) for (let c = 0; c < 4; c++) { const a = c * Math.PI / 2 + Math.PI / 4, rr = 0.52 * (1 - k / 5); E.ball(px + Math.cos(a) * rr, 41.05 + 3.6 * k / 5, pz + Math.sin(a) * rr, 0.1, A); } E.ball(px, 44.75, pz, 0.17, A); E.ball(px, 45.0, pz, 0.1, A); }
    // 塔基与塔顶的楼板
    ES.box(cx, 39.0, cz, hf * 2 - 0.2, 0.5, hf * 2 - 0.2, D);
    // 八角石尖顶：八条棱上排卷叶，四面开小老虎窗，顶上石球和铁十字架
    { const y0 = 39.5, y1 = T.h + G - 0.9, r0 = 3.9, r1 = 0.24, sp = add(new THREE.CylinderGeometry(r1, r0, y1 - y0, 8, 1), stone, cx, (y0 + y1) / 2, cz, Math.PI / 8); sp.material = stone; spires++;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; ES.rod([cx + Math.sin(a) * r0, y0, cz + Math.cos(a) * r0], [cx + Math.sin(a) * r1, y1, cz + Math.cos(a) * r1], 0.11, A); for (let i = 1; i < 24; i++) { const t = i / 24, rr = r0 + (r1 - r0) * t + 0.12; E.ball(cx + Math.sin(a) * rr, y0 + (y1 - y0) * t, cz + Math.cos(a) * rr, 0.13, A, 1.25); } }
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, ap = Math.cos(Math.PI / 8); for (const [yy, sc] of [[41.4, 1], [47.0, 0.55]]) { const rr = (r0 + (r1 - r0) * (yy - y0) / (y1 - y0)) * ap; E.box(cx + Math.sin(a) * (rr + 0.05), yy, cz + Math.cos(a) * (rr + 0.05), 0.8 * sc, 1.5 * sc, 0.7 * sc, B, a); E.prism(cx + Math.sin(a) * (rr + 0.25 * sc), yy + 1.5 * sc, cz + Math.cos(a) * (rr + 0.25 * sc), 1.05 * sc, 1.1 * sc, 0.5 * sc, A, a); E.box(cx + Math.sin(a) * (rr + 0.42 * sc), yy + 0.2 * sc, cz + Math.cos(a) * (rr + 0.42 * sc), 0.34 * sc, 1.0 * sc, 0.06, '#3a3026', a); }
        for (const yy of [51.2, 54.2]) { const rr = (r0 + (r1 - r0) * (yy - y0) / (y1 - y0)) * ap; E.box(cx + Math.sin(a) * rr, yy, cz + Math.cos(a) * rr, 0.12, 0.7, 0.1, '#3a3026', a); } }
      E.cyl(cx, y1 - 0.1, cz, 0.3, 0.3, A, 'oct'); E.ball(cx, y1 + 0.45, cz, 0.42, B, 1.15); E.ball(cx, y1 + 0.95, cz, 0.2, B);
      const top = T.h + G + 3.4; E.cyl(cx, y1 + 1.0, cz, 0.035, top - y1 - 1.0, DK); E.box(cx, top - 0.75, cz, 0.9, 0.05, 0.05, DK); E.hoop(cx, top - 0.75, cz, 0.24, DK); for (const [dx, dy] of [[0.45, 0], [-0.45, 0], [0, 0.6]]) E.ball(cx + dx, top - 0.73 + dy, cz, 0.05, DK); }
  }
  // 门前台阶两侧、塔与中跨之间贴地的勒脚线
  course([-14.6, ZF], [14.6, ZF], 0.9, 0.3, 0.2, [0, 1], D);

  // ===== 收尾：把攒的东西建出来 =====
  for (const [mat, arr] of panes) { const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, arr.length); arr.forEach(([x, y, z, w, h, ry], i) => { _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(w, h, 1)); mesh.setMatrixAt(i, _m); }); mesh.frustumCulled = false; mesh.receiveShadow = true; ext.add(mesh); }
  for (const o of insts.values()) { const mesh = new THREE.InstancedMesh(o.geo, o.mat, o.list.length); o.list.forEach(([x, y, z, ry, sx], i) => { _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(sx, 1, 1)); mesh.setMatrixAt(i, _m); }); mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; ext.add(mesh); }
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, roofMat); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; ext.add(m); }
  ES.build(); E0.build();
  return { city: cityMesh, counts: { spires, buttresses: C.BUTTRESS.length, cityBoxes: city.length, trees: trees.length } };
}
