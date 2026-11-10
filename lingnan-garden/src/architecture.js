// 建筑：水榭、曲廊、石拱桥、镬耳墙与月洞门、围墙、假山上的六角亭。
import * as THREE from 'three';
import * as C from './core.js';
import { Batch, box, cyl, sph, lathe, tube, rng } from './kit.js';

const GLASS = ['#d8342a', '#2f66c9', '#2f9a4a', '#e7a52a'];

// 歇山顶：两坡带下垂曲线，两头下半截是斜坡、上半截是山花，四角起翘。
function hipGableRoof(b, M, { L, W, eaveY, rise, sag = 1.5, hipH = 0.42, lift = 0.5, cz = 0 }) {
  const hv = v => rise * Math.pow(1 - Math.abs(v), sag);
  const Hg = rise * hipH, vg = 1 - Math.pow(hipH, 1 / sag), ut = 1 - (1 - vg) * W / L;       // 山花底边的半宽、山花所在的 u
  const corner = (u, v) => lift * Math.pow(Math.max(0, (Math.abs(u) - 0.7) / 0.3), 2) * Math.pow(Math.max(0, (Math.abs(v) - 0.45) / 0.55), 2);
  const y = (u, v, hip) => { const h = hip ? Math.min(hv(v), rise * Math.pow(Math.min(1, (1 - Math.abs(u)) * L / W), sag)) : hv(v); return eaveY + h + corner(u, v); };
  const cols = [];
  const NU = 40, NV = 28;
  for (let i = 0; i <= 8; i++) cols.push({ u: -1 + (1 - ut) * i / 8, hip: true });
  for (let i = 0; i <= NU; i++) cols.push({ u: -ut + 2 * ut * i / NU, hip: false });
  for (let i = 0; i <= 8; i++) cols.push({ u: ut + (1 - ut) * i / 8, hip: true });
  const pos = [], uv = [], idx = [];
  cols.forEach(c => { for (let j = 0; j <= NV; j++) { const v = -1 + 2 * j / NV, x = c.u * L, z = v * W; pos.push(x, y(c.u, v, c.hip), z + cz); const onHip = c.hip && (1 - Math.abs(c.u)) * L < (1 - Math.abs(v)) * W; uv.push(onHip ? z * 1.25 : x * 1.25, onHip ? (1 - Math.abs(c.u)) * L * 0.9 : (1 - Math.abs(v)) * W * 0.9); } });
  for (let i = 0; i < cols.length - 1; i++) { if (cols[i].hip !== cols[i + 1].hip) continue; for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, c = a + NV + 1; idx.push(a, a + 1, c, a + 1, c + 1, c); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  b.add(g, M.tile);
  // 檐口一圈厚度
  const rim = []; const N = 24;
  for (let i = 0; i <= N; i++) rim.push([-1 + 2 * i / N, 1]); for (let i = 1; i <= N; i++) rim.push([1, 1 - 2 * i / N]); for (let i = 1; i <= N; i++) rim.push([1 - 2 * i / N, -1]); for (let i = 1; i <= N; i++) rim.push([-1, -1 + 2 * i / N]);
  const rp = [], ri = [];
  rim.forEach(([u, v]) => { const yy = y(u, v, true); rp.push(u * L, yy + 0.02, v * W + cz, u * L * 0.985, yy - 0.16, v * W * 0.975 + cz); });
  for (let i = 0; i < rim.length - 1; i++) { const a = i * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
  b.add(rg, M.ridgeDark);
  // 檐下望板（从廊下抬头看到的底面）
  const sof = new THREE.BufferGeometry(); const sp = [], si = [];
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 8; j++) { const u = -1 + 2 * i / 20, v = -1 + 2 * j / 8; sp.push(u * L * 0.98, y(u, v, true) - 0.07, v * W * 0.97 + cz); }
  for (let i = 0; i < 20; i++) for (let j = 0; j < 8; j++) { const a = i * 9 + j, c = a + 9; si.push(a, c, a + 1, a + 1, c, c + 1); }
  sof.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sof.setIndex(si); sof.computeVertexNormals(); b.add(sof, M.woodDark);
  // 山花（白）与博风（灰）
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape(); sh.moveTo(-vg * W, Hg); for (let k = 0; k <= 16; k++) { const v = -vg + 2 * vg * k / 16; sh.lineTo(v * W, hv(v)); } sh.lineTo(-vg * W, Hg);
    const gg = new THREE.ShapeGeometry(sh); b.add(gg, M.plasterPlain, s * (ut * L + 0.015), eaveY, cz, 0, s * Math.PI / 2, 0);
    const verge = []; for (let k = 0; k <= 16; k++) { const v = -vg + 2 * vg * k / 16; verge.push([s * (ut * L + 0.04), eaveY + hv(v) + 0.03, v * W + cz]); }
    b.add(tube(verge, 0.085, 6), M.ridge);
    // 山花上的灰塑小花
    b.add(cyl(0.22, 0.22, 0.04, 12), M.ridge, s * (ut * L + 0.04), eaveY + Hg + (rise - Hg) * 0.38, cz, 0, 0, Math.PI / 2);
    // 四条戗脊
    for (const sv of [-1, 1]) { const pts = []; for (let k = 0; k <= 10; k++) { const v = sv * (vg + (1 - vg) * k / 10), u = s * (1 - (1 - Math.abs(v)) * W / L); pts.push([u * L, y(u, v, true) + 0.05, v * W + cz]); } b.add(tube(pts, 0.08, 6), M.ridge); const e = pts[pts.length - 1]; b.add(sph(0.12, 8, 6), M.ridge, e[0], e[1] + 0.05, e[2]); }
    // 正脊两端的卷草脊饰
    const rx = s * ut * L, ry = eaveY + rise + 0.2;
    b.add(new THREE.TorusGeometry(0.3, 0.07, 6, 14, Math.PI * 1.5), M.ridge, rx + s * 0.05, ry + 0.26, cz, 0, s > 0 ? 0 : Math.PI, -0.4);
    b.add(new THREE.TorusGeometry(0.15, 0.055, 6, 12, Math.PI * 1.6), M.ridge, rx - s * 0.42, ry + 0.2, cz, 0, s > 0 ? Math.PI : 0, -0.2);
    b.add(box(0.5, 0.3, 0.16), M.ridgeDark, rx - s * 0.2, ry, cz);
  }
  b.add(box(2 * ut * L, 0.22, 0.2), M.ridge, 0, eaveY + rise + 0.1, cz);
  b.add(box(2 * ut * L, 0.07, 0.3), M.ridgeDark, 0, eaveY + rise + 0.24, cz);
  b.add(box(0.5, 0.2, 0.24), M.ridgeDark, 0, eaveY + rise + 0.36, cz); b.add(sph(0.14, 10, 8), M.ridge, 0, eaveY + rise + 0.56, cz);
  return { y };
}

// 一樘满洲窗：深色木框 + 彩色玻璃小格。发光的玻璃单独收集，屋里屋外都看得见颜色。
function manchuWindow(b, M, glass, R, x, y, z, w, h, ry = 0) {
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z), put = (geo, mat, lx, ly, lz = 0) => b.addM(geo, mat, new THREE.Matrix4().makeTranslation(lx, ly, lz).premultiply(m));
  const f = 0.07;
  put(box(w, f, 0.1), M.woodDark, 0, h / 2 - f / 2); put(box(w, f, 0.1), M.woodDark, 0, -h / 2 + f / 2); put(box(f, h, 0.1), M.woodDark, -w / 2 + f / 2, 0); put(box(f, h, 0.1), M.woodDark, w / 2 - f / 2, 0);
  const cols = 2, rows = 4, pw = (w - f * 2) / cols, ph = (h - f * 2) / rows;
  for (let i = 1; i < cols; i++) put(box(0.045, h - f * 2, 0.08), M.woodDark, -w / 2 + f + pw * i, 0);
  for (let j = 1; j < rows; j++) put(box(w - f * 2, 0.045, 0.08), M.woodDark, 0, -h / 2 + f + ph * j);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const cx = -w / 2 + f + pw * (i + 0.5), cy = -h / 2 + f + ph * (j + 0.5), col = GLASS[(R() * GLASS.length) | 0];
    // 每格中间一块色玻璃，四周一圈浅色磨砂玻璃
    glass.push({ m: new THREE.Matrix4().makeTranslation(cx, cy, 0).premultiply(m), w: pw - 0.05, h: ph - 0.05, color: '#e2c88e' });
    glass.push({ m: new THREE.Matrix4().makeTranslation(cx, cy, 0.004).premultiply(m), w: pw * 0.62, h: ph * 0.62, color: col });
    glass.push({ m: new THREE.Matrix4().makeTranslation(cx, cy, -0.004).premultiply(m), w: pw * 0.62, h: ph * 0.62, color: col });
  }
}
function glassMesh(parent, glass) {
  const geo = new THREE.PlaneGeometry(1, 1), mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, transparent: true, opacity: 0.86, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.0 });
  const mesh = new THREE.InstancedMesh(geo, mat, glass.length), c = new THREE.Color(), s = new THREE.Matrix4();
  glass.forEach((g, i) => { s.makeScale(g.w, g.h, 1).premultiply(g.m); mesh.setMatrixAt(i, s); mesh.setColorAt(i, c.set(g.color)); });
  mesh.instanceColor.needsUpdate = true; parent.add(mesh); return mesh;
}
function lantern(M) {
  const g = new THREE.Group(), b = new Batch();
  b.add(sph(0.3, 16, 12), M.lantern, 0, -0.55, 0, 0, 0, 0, 1, 0.88, 1);
  b.add(cyl(0.13, 0.15, 0.07, 12), M.gold, 0, -0.27, 0); b.add(cyl(0.15, 0.13, 0.07, 12), M.gold, 0, -0.83, 0);
  b.add(cyl(0.008, 0.008, 0.26, 4), M.dark, 0, -0.12, 0); b.add(cyl(0.05, 0.015, 0.3, 8), M.gold, 0, -1.02, 0);
  for (let i = 0; i < 8; i++) b.add(new THREE.TorusGeometry(0.3, 0.008, 4, 16, Math.PI), M.gold, 0, -0.55, 0, 0, i * Math.PI / 8, Math.PI / 2, 1, 1, 0.88);
  b.flush(g, { receive: false }); return g;
}

export function buildPavilion(scene, M, anim) {
  const P = C.PAV, g = new THREE.Group(); g.position.set(P.x, 0, P.z); g.rotation.y = P.rot; scene.add(g);
  const b = new Batch(), glass = [], R = rng(21), D = C.DECK_Y, H = 2.95, top = D + H;
  const L = P.halfL, zc = (P.zBack + P.zFront) / 2, depth = P.zFront - P.zBack;
  // 台基：屋身下是实心石台，前廊下是立在水里的石墩
  b.add(box(2 * L + 0.3, D + 0.9 - 0.18, P.zWall - P.zBack + 0.4), M.granite, 0, (D - 0.18 - 0.9) / 2, (P.zBack + P.zWall) / 2);
  b.add(box(2 * L + 0.5, 0.2, depth + 0.5), M.graniteLight, 0, D - 0.1, zc);
  for (let i = 0; i < 5; i++) { const x = -L + 0.45 + i * (2 * L - 0.9) / 4; b.add(box(0.62, D + 1.0, 0.62), M.granite, x, (D - 0.2 - 1.0) / 2, P.zFront - 0.3); b.add(box(0.74, 0.14, 0.74), M.graniteLight, x, D - 0.27, P.zFront - 0.3); }
  b.add(box(2 * L, 0.3, 0.4), M.granite, 0, D - 0.4, P.zFront - 0.3);
  b.add(box(2 * L - 0.1, 0.03, P.zWall - P.zBack - 0.1), M.plank, 0, D + 0.012, (P.zBack + P.zWall) / 2);
  // 踏步：五级，两侧垂带石
  const sx = (P.stepsX[0] + P.stepsX[1]) / 2, sw = P.stepsX[1] - P.stepsX[0], n = 5;
  for (let i = 0; i < n; i++) { const h = D * (n - i) / (n + 1); b.add(box(sw - 0.3, h, P.stepsLen / n + 0.02), M.graniteLight, sx, h / 2, P.zFront + 0.25 + (i + 0.5) * (P.stepsLen - 0.3) / n); }
  for (const s of [-1, 1]) { const cheek = new THREE.Shape(); cheek.moveTo(0, 0); cheek.lineTo(0, D + 0.08); cheek.lineTo(0.3, D + 0.08); cheek.lineTo(P.stepsLen + 0.15, 0.2); cheek.lineTo(P.stepsLen + 0.15, 0); const cg = new THREE.ExtrudeGeometry(cheek, { depth: 0.24, bevelEnabled: false }); b.add(cg, M.granite, sx + s * (sw / 2 - 0.03) + 0.12, 0, P.zFront + 0.15, 0, -Math.PI / 2, 0); }
  // 柱：前檐六根，屋身四角与正面墙上的半柱
  const CE = L - 0.18, colX = [0, 1, 2, 3, 4].map(i => -CE + i * 2 * CE / 4);
  for (const x of colX) for (const z of [P.zFront - 0.22, P.zWall]) { b.add(cyl(0.125, 0.14, H, 14), M.wood, x, D + H / 2, z); b.add(cyl(0.21, 0.24, 0.2, 14), M.graniteLight, x, D + 0.1, z); b.add(sph(0.21, 12, 8), M.graniteLight, x, D + 0.2, z, 0, 0, 0, 1, 0.45, 1); }
  // 檐枋、挂落、雀替
  for (const z of [P.zFront - 0.22, P.zWall]) { b.add(box(2 * L - 0.1, 0.24, 0.16), M.wood, 0, top - 0.12, z); b.add(box(2 * L - 0.1, 0.1, 0.12), M.woodDark, 0, top - 0.75, z); }
  for (const x of [-CE, CE]) b.add(box(0.16, 0.24, P.zFront - 0.22 - P.zBack), M.wood, x, top - 0.12, (P.zFront - 0.22 + P.zBack) / 2);
  for (let i = 0; i < colX.length - 1; i++) { const w = colX[i + 1] - colX[i] - 0.26, cx = (colX[i] + colX[i + 1]) / 2; const pl = new THREE.PlaneGeometry(w, 0.44); pl.attributes.uv.array.forEach((v, k, a) => { a[k] = k % 2 === 0 ? v * Math.round(w / 0.22) : v * 2; }); b.add(pl, M.lattice, cx, top - 0.47, P.zFront - 0.22); }
  for (const x of colX) for (const s of [-1, 1]) { if (Math.abs(x + s * 0.3) > L) continue; const br = new THREE.Shape(); br.moveTo(0, 0); br.lineTo(0.42, 0); br.quadraticCurveTo(0.1, -0.1, 0, -0.42); const bg = new THREE.ExtrudeGeometry(br, { depth: 0.06, bevelEnabled: false }); b.add(bg, M.woodDark, x + s * 0.12, top - 0.8, P.zFront - 0.25 + (s < 0 ? 0.06 : 0), 0, s < 0 ? Math.PI : 0, 0); }
  // 前廊栏杆与美人靠（踏步口留开）
  for (let i = 0; i < colX.length - 1; i++) {
    const x0 = colX[i], x1 = colX[i + 1]; if (x1 <= P.stepsX[1] + 0.2) continue;
    const a = Math.max(x0, P.stepsX[1]) + 0.13, w = x1 - 0.13 - a, cx = a + w / 2, z = P.zFront - 0.22;
    const pl = new THREE.PlaneGeometry(w, 0.62); pl.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * Math.max(1, Math.round(w / 0.75)); }); b.add(pl, M.rail, cx, D + 0.47, z);
    b.add(box(w, 0.09, 0.14), M.wood, cx, D + 0.82, z); b.add(box(w, 0.07, 0.1), M.wood, cx, D + 0.14, z); b.add(box(w, 0.06, 0.42), M.wood, cx, D + 0.46, z - 0.26);
    if (x0 < P.stepsX[1]) b.add(cyl(0.07, 0.07, 0.9, 8), M.wood, a - 0.06, D + 0.45, z);
  }
  { const z0 = P.zWall, z1 = P.zFront - 0.22, w = z1 - z0 - 0.26; const pl = new THREE.PlaneGeometry(w, 0.62); b.add(pl, M.rail, -CE, D + 0.47, (z0 + z1) / 2, 0, Math.PI / 2, 0); b.add(box(0.14, 0.09, w), M.wood, -CE, D + 0.82, (z0 + z1) / 2); b.add(box(0.1, 0.07, w), M.wood, -CE, D + 0.14, (z0 + z1) / 2); }
  // 正面墙：槛墙 + 满洲窗 + 门
  const wallBay = (x0, x1, z, ry, windows) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    b.add(box(w, 0.75, 0.14), M.wood, cx, D + 0.375, z); b.add(box(w, 0.06, 0.2), M.woodDark, cx, D + 0.76, z);
    b.add(box(w, 0.42, 0.12), M.wood, cx, top - 0.45, z);
    if (windows) { const nW = Math.max(1, Math.round(w / 0.95)), ww = w / nW; for (let i = 0; i < nW; i++) manchuWindow(b, M, glass, R, x0 + ww * (i + 0.5), D + 0.79 + (H - 0.79 - 0.66) / 2, z, ww - 0.04, H - 0.79 - 0.66, ry); }
  };
  wallBay(-CE + 0.13, P.door[0], P.zWall, 0, false);
  { const w = P.door[0] - (-CE + 0.13); b.add(box(w, H - 0.75 - 0.66, 0.12), M.wood, -CE + 0.13 + w / 2, D + 0.75 + (H - 0.75 - 0.66) / 2, P.zWall); }
  wallBay(P.door[1], colX[1] - 0.13, P.zWall, 0, false); { const w = colX[1] - 0.13 - P.door[1]; b.add(box(w, H - 0.75 - 0.66, 0.12), M.wood, P.door[1] + w / 2, D + 0.75 + (H - 0.75 - 0.66) / 2, P.zWall); }
  for (let i = 1; i < 4; i++) wallBay(colX[i] + 0.13, colX[i + 1] - 0.13, P.zWall, 0, true);
  // 门：两扇向内开着，上半是色玻璃
  b.add(box(P.door[1] - P.door[0] + 0.2, 0.5, 0.12), M.wood, (P.door[0] + P.door[1]) / 2, top - 0.49, P.zWall); b.add(box(P.door[1] - P.door[0] + 0.24, 0.1, 0.2), M.woodDark, (P.door[0] + P.door[1]) / 2, top - 0.79, P.zWall);
  for (const [hx, ry] of [[P.door[0], 1.35], [P.door[1], Math.PI - 1.35]]) {
    const dw = 0.68, dh = H - 0.84, m = new THREE.Matrix4().makeRotationY(ry).setPosition(hx, D, P.zWall - 0.05);
    const put = (geo, mat, lx, ly) => b.addM(geo, mat, new THREE.Matrix4().makeTranslation(lx, ly, 0).premultiply(m));
    put(box(dw, 0.95, 0.05), M.wood, dw / 2, 0.475); put(box(0.07, dh, 0.06), M.woodDark, 0.035, dh / 2); put(box(0.07, dh, 0.06), M.woodDark, dw - 0.035, dh / 2); put(box(dw, 0.07, 0.06), M.woodDark, dw / 2, dh - 0.035); put(box(dw, 0.05, 0.06), M.woodDark, dw / 2, 0.95);
    for (let j = 0; j < 2; j++) glass.push({ m: new THREE.Matrix4().makeTranslation(dw / 2, 0.95 + (dh - 0.95) * (j + 0.5) / 2, 0).premultiply(m), w: dw - 0.16, h: (dh - 0.95) / 2 - 0.08, color: GLASS[(j + (hx < -3 ? 0 : 2)) % 4] });
  }
  // 山墙与后墙：白灰墙，后墙开四樘窗
  for (const s of [-1, 1]) b.add(box(0.2, H, P.zWall - P.zBack), M.plaster, s * (L - 0.08), D + H / 2, (P.zBack + P.zWall) / 2);
  { const zb = P.zBack + 0.1, segs = [-4.9, -3.4, -2.2, -0.6, 0.6, 2.2, 3.4, 4.9].map(v => v * L / 5); for (let i = 0; i < segs.length - 1; i++) { const x0 = segs[i], x1 = segs[i + 1], w = x1 - x0, cx = (x0 + x1) / 2; if (i % 2 === 0) b.add(box(w, H, 0.2), M.plaster, cx, D + H / 2, zb); else { b.add(box(w, 1.0, 0.2), M.plaster, cx, D + 0.5, zb); b.add(box(w, 0.55, 0.2), M.plaster, cx, top - 0.275, zb); manchuWindow(b, M, glass, R, cx, D + 1.0 + (H - 1.55) / 2, zb, w, H - 1.55, 0); } } }
  // 天花与梁
  b.add(box(2 * L - 0.2, 0.06, depth - 0.3), M.woodDark, 0, top + 0.03, zc);
  for (const x of colX) b.add(box(0.14, 0.2, depth - 0.3), M.wood, x, top - 0.1, zc);
  // 屋里：一张八仙桌、两把椅子、茶具，西墙一幅挂轴的留白
  const tz = -1.3, tx = 1.6;
  b.add(box(1.5, 0.07, 0.8), M.wood, tx, D + 0.78, tz); for (const [a, c] of [[-0.68, -0.33], [0.68, -0.33], [-0.68, 0.33], [0.68, 0.33]]) b.add(box(0.07, 0.76, 0.07), M.woodDark, tx + a, D + 0.38, tz + c);
  for (const s of [-1, 1]) { b.add(box(0.46, 0.05, 0.44), M.wood, tx + s * 1.2, D + 0.46, tz); b.add(box(0.05, 0.9, 0.44), M.woodDark, tx + s * 1.42, D + 0.45, tz); for (const c of [-0.19, 0.19]) b.add(box(0.05, 0.46, 0.05), M.woodDark, tx + s * 1.0, D + 0.23, tz + c); }
  b.add(sph(0.11, 12, 8), M.teapot, tx, D + 0.9, tz, 0, 0, 0, 1, 0.8, 1); b.add(cyl(0.04, 0.035, 0.05, 10), M.cup, tx + 0.28, D + 0.84, tz + 0.1); b.add(cyl(0.04, 0.035, 0.05, 10), M.cup, tx - 0.26, D + 0.84, tz - 0.12);
  b.add(box(0.03, 1.5, 0.62), M.cup, -L + 0.2, D + 1.75, -1.0); b.add(box(0.04, 0.05, 0.7), M.woodDark, -L + 0.2, D + 2.52, -1.0); b.add(box(0.04, 0.05, 0.7), M.woodDark, -L + 0.2, D + 0.98, -1.0);
  // 屋顶
  hipGableRoof(b, M, { L: L + 1.05, W: depth / 2 + 1.0, eaveY: top + 0.1, rise: 1.95, cz: zc });
  b.flush(g);
  const gm = glassMesh(g, glass);
  // 红灯笼两盏，挂在前檐下
  for (const x of [(colX[1] + colX[2]) / 2, (colX[3] + colX[4]) / 2]) { const l = lantern(M); l.position.set(x, top - 0.72, P.zFront - 0.22); g.add(l); anim.push(t => { l.rotation.z = Math.sin(t * 1.3 + x) * 0.07; l.rotation.x = Math.sin(t * 0.9 + x * 2) * 0.05; }); }
  const lamp = new THREE.PointLight('#ffd9a0', 6, 7, 2); lamp.position.set(0, D + 2.3, -1.0); g.add(lamp);
  return { group: g, glass: gm };
}

// 曲廊：石墩上的廊板、红柱、挂落、矮栏、两坡瓦顶；中间落在水里的石矶上，末段是下岸的踏步
export function buildCorridor(scene, M) {
  const b = new Batch(), D = C.DECK_Y, W = C.CORRIDOR_W, H = 2.5, I = C.ISLET;
  const segs = [[C.CORRIDOR[0], C.CORRIDOR[1], 0.0, I.r - 0.15], [C.CORRIDOR[1], C.CORRIDOR[2], I.r - 0.15, 0.0]];
  segs.forEach(([a0, c0, trimA, trimC]) => {
    const ddx = c0.x - a0.x, ddz = c0.z - a0.z, full = Math.hypot(ddx, ddz), ux = ddx / full, uz = ddz / full;
    const a = { x: a0.x + ux * trimA, z: a0.z + uz * trimA }, c = { x: c0.x - ux * trimC, z: c0.z - uz * trimC };
    const len = full - trimA - trimC, ry = Math.atan2(-ddz, ddx), cx = (a.x + c.x) / 2, cz = (a.z + c.z) / 2;
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(cx, 0, cz), put = (geo, mat, lx, ly, lz) => b.addM(geo, mat, new THREE.Matrix4().makeTranslation(lx, ly, lz).premultiply(m));
    put(box(len + 0.3, 0.16, W + 0.1), M.graniteLight, 0, D - 0.08, 0);
    const nP = Math.max(2, Math.round(len / 1.7) + 1);
    for (let i = 0; i < nP; i++) { const lx = -len / 2 + 0.1 + i * (len - 0.2) / (nP - 1); for (const s of [-1, 1]) { put(cyl(0.085, 0.095, H, 10), M.wood, lx, D + H / 2, s * (W / 2 - 0.1)); put(cyl(0.14, 0.16, 0.14, 10), M.graniteLight, lx, D + 0.07, s * (W / 2 - 0.1)); put(box(0.3, D + 1.0, 0.3), M.granite, lx, (D - 0.16 - 1.0) / 2, s * (W / 2 - 0.1)); } }
    for (const s of [-1, 1]) {
      put(box(len, 0.16, 0.1), M.wood, 0, D + H - 0.08, s * (W / 2 - 0.1));
      const hang = new THREE.PlaneGeometry(len - 0.2, 0.34); hang.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * Math.max(1, Math.round(len / 0.34)); }); put(hang, M.lattice, 0, D + H - 0.34, s * (W / 2 - 0.1));
      const rl = new THREE.PlaneGeometry(len - 0.2, 0.5); rl.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * Math.max(1, Math.round(len / 0.7)); }); put(rl, M.rail, 0, D + 0.36, s * (W / 2 - 0.1)); put(box(len - 0.2, 0.07, 0.1), M.wood, 0, D + 0.64, s * (W / 2 - 0.1));
    }
    // 瓦顶：两坡，略带下垂
    const half = W / 2 + 0.45, rise = 0.62, eave = D + H + 0.02, N = 8, pos = [], uv = [], idx = [], LL = len / 2 + 0.3;
    for (const e of [-LL, LL]) for (let j = 0; j <= 2 * N; j++) { const v = -1 + j / N; pos.push(e, eave + rise * Math.pow(1 - Math.abs(v), 1.35), v * half); uv.push(e * 1.25, (1 - Math.abs(v)) * half * 1.1); }
    for (let j = 0; j < 2 * N; j++) idx.push(j, j + 1, j + 2 * N + 1, j + 1, j + 2 * N + 2, j + 2 * N + 1);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
    put(rg, M.tile, 0, 0, 0); put(box(2 * LL, 0.14, 0.16), M.ridge, 0, eave + rise + 0.04, 0);
    for (const s of [-1, 1]) put(box(2 * LL, 0.1, 0.06), M.ridgeDark, 0, eave - 0.04, s * (half - 0.01));
    put(box(2 * LL - 0.4, 0.05, W - 0.1), M.woodDark, 0, D + H + 0.02, 0);
    for (const e of [-LL, LL]) { const gs = new THREE.Shape(); gs.moveTo(-half, 0); for (let j = 0; j <= 2 * N; j++) { const v = -1 + j / N; gs.lineTo(v * half, rise * Math.pow(1 - Math.abs(v), 1.35)); } const gg = new THREE.ShapeGeometry(gs); b.addM(gg, M.plasterPlain, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(e, eave, 0).premultiply(m)); }
  });
  // 石矶上的八角平台：前廊来、曲廊去、石桥出，三路在这里碰头；上面一个小攒尖顶
  b.add(cyl(I.r + 0.12, I.r + 0.2, 0.18, 8), M.graniteLight, I.x, D - 0.09, I.z, 0, Math.PI / 8, 0);
  b.add(cyl(I.r + 0.3, I.r + 0.9, D + 0.9, 9), M.granite, I.x, (D - 0.18 - 0.9) / 2, I.z);
  const dirs = [C.CORRIDOR[0], C.CORRIDOR[2], C.BRIDGE.b].map(p => Math.atan2(p.z - I.z, p.x - I.x));
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8, px = I.x + Math.cos(a) * (I.r - 0.05), pz = I.z + Math.sin(a) * (I.r - 0.05); b.add(cyl(0.085, 0.095, H + 0.25, 10), M.wood, px, D + (H + 0.25) / 2, pz); b.add(cyl(0.14, 0.16, 0.14, 10), M.graniteLight, px, D + 0.07, pz);
    const am = i * Math.PI / 4 + Math.PI / 4, open = dirs.some(d => { let x = am - d; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return Math.abs(x) < 0.5; });
    const a2 = a + Math.PI / 4, qx = I.x + Math.cos(a2) * (I.r - 0.05), qz = I.z + Math.sin(a2) * (I.r - 0.05), len = Math.hypot(qx - px, qz - pz), ry = Math.atan2(-(qz - pz), qx - px);
    const hg = new THREE.PlaneGeometry(len - 0.16, 0.3); hg.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * 3; }); b.add(hg, M.lattice, (px + qx) / 2, D + H - 0.05, (pz + qz) / 2, 0, ry, 0); b.add(box(len, 0.12, 0.1), M.wood, (px + qx) / 2, D + H + 0.19, (pz + qz) / 2, 0, ry, 0);
    if (!open) { const rl = new THREE.PlaneGeometry(len - 0.16, 0.5); rl.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * 2; }); b.add(rl, M.rail, (px + qx) / 2, D + 0.36, (pz + qz) / 2, 0, ry, 0); b.add(box(len - 0.16, 0.07, 0.1), M.wood, (px + qx) / 2, D + 0.64, (pz + qz) / 2, 0, ry, 0); } }
  const prof = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([Math.max(0.02, (I.r + 0.7) * Math.pow(t, 0.75)), 1.15 * Math.pow(1 - t, 1.8) + (t > 0.85 ? (t - 0.85) * 0.9 : 0)]); }
  const roof = lathe(prof, 8); roof.rotateY(Math.PI / 8); roof.attributes.uv.array.forEach((v, k, arr) => { arr[k] = v * (k % 2 ? 2.2 : 12); }); b.add(roof, M.tile, I.x, D + H + 0.28, I.z);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; b.add(tube(prof.map(([r, yy]) => [I.x + Math.cos(a) * r, D + H + 0.31 + yy, I.z + Math.sin(a) * r]), 0.05, 5), M.ridge); }
  b.add(sph(0.16, 10, 8), M.ridge, I.x, D + H + 1.52, I.z); b.add(cyl(0.03, 0.07, 0.3, 8), M.ridge, I.x, D + H + 1.72, I.z);
  const under = lathe(prof.map(([r, yy]) => [r * 0.97, yy - 0.06]), 8); under.rotateY(Math.PI / 8); b.add(under, M.woodDark, I.x, D + H + 0.28, I.z);
  // 下岸的踏步：沿曲廊方向再往前四级
  const S3 = C.CORRIDOR_STEPS, n = 4, ry3 = Math.atan2(-S3.uz, S3.ux);
  for (let i = 0; i < n; i++) { const h = D * (n - i) / (n + 1), t = 0.12 + (i + 0.5) * 0.8 / n; b.add(box(S3.len * 0.8 / n + 0.03, h + 0.5, W - 0.1), M.graniteLight, S3.a.x + S3.ux * S3.len * t, (h - 0.5) / 2, S3.a.z + S3.uz * S3.len * t, 0, ry3, 0); }
  b.flush(scene);
}

export function buildBridge(scene, M) {
  const B = C.BRIDGE, dx = B.b.x - B.a.x, dz = B.b.z - B.a.z, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), b = new Batch();
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(B.a.x, 0, B.a.z), put = (geo, mat, lx, ly, lz, rz = 0) => b.addM(geo, mat, new THREE.Matrix4().makeRotationZ(rz).setPosition(lx, ly, lz).premultiply(m));
  const top = s => C.bridgeY(s / len), sh = new THREE.Shape();
  sh.moveTo(-0.2, -1.2); sh.lineTo(-0.2, top(0)); for (let i = 0; i <= 24; i++) { const s = len * i / 24; sh.lineTo(s, top(s) + 0.0); } sh.lineTo(len + 0.5, 0); sh.lineTo(len + 0.5, -1.2);
  const hole = new THREE.Path(), ax = len * 0.47, aw = len * 0.3, ah = top(ax) - 0.34 - C.WATER_Y;
  hole.moveTo(ax - aw, -1.1); for (let i = 0; i <= 20; i++) { const t = Math.PI * (1 - i / 20); hole.lineTo(ax + Math.cos(t) * aw, C.WATER_Y - 0.1 + Math.sin(t) * (ah + 0.1)); } hole.lineTo(ax + aw, -1.1); sh.holes.push(hole);
  const body = new THREE.ExtrudeGeometry(sh, { depth: B.w + 0.3, bevelEnabled: false, curveSegments: 4 });
  put(body, M.graniteLight, 0, 0, -(B.w + 0.3) / 2);
  // 拱券的券脸石
  for (let i = 0; i <= 14; i++) { const t = Math.PI * (1 - i / 14), x = ax + Math.cos(t) * (aw + 0.12), y = C.WATER_Y - 0.1 + Math.sin(t) * (ah + 0.22); for (const s of [-1, 1]) put(box(0.3, 0.2, 0.06), M.granite, x, y, s * (B.w / 2 + 0.16), t - Math.PI / 2); }
  // 望柱与栏板
  const nPost = 7;
  for (let i = 0; i < nPost; i++) {
    const s = 0.15 + (len - 0.3) * i / (nPost - 1), y = top(s);
    for (const side of [-1, 1]) {
      const z = side * (B.w / 2 + 0.02);
      put(box(0.18, 0.85, 0.18), M.white, s, y + 0.4, z); put(sph(0.12, 10, 8), M.white, s, y + 0.92, z); put(box(0.22, 0.05, 0.22), M.graniteLight, s, y + 0.82, z);
      if (i < nPost - 1) { const s2 = 0.15 + (len - 0.3) * (i + 1) / (nPost - 1), y2 = top(s2), ang = Math.atan2(y2 - y, s2 - s), l = Math.hypot(s2 - s, y2 - y); put(box(l - 0.16, 0.42, 0.1), M.white, (s + s2) / 2, (y + y2) / 2 + 0.36, z, ang); put(box(l - 0.1, 0.07, 0.14), M.graniteLight, (s + s2) / 2, (y + y2) / 2 + 0.62, z, ang); }
    }
  }
  // 桥面石板的横缝
  for (let i = 1; i < 12; i++) { const s = len * i / 12, ang = Math.atan2(top(s + 0.05) - top(s - 0.05), 0.1); put(box(0.03, 0.012, B.w - 0.2), M.granite, s, top(s) + 0.004, 0, ang); }
  b.flush(scene);
}

// 白墙：镬耳山墙 + 月洞门；其余围墙是白墙灰瓦压顶
export function buildWalls(scene, M) {
  const b = new Batch(), G = C.GATE, end = C.pavToWorld(-C.PAV.halfL, -2.35), x0 = C.BOUNDS.x0 - 0.9, x1 = end.x + 0.1, h = 3.2, gy = G.y - 0.15;
  const sh = new THREE.Shape(), wx = C.WOK.x, hw = C.WOK.half, topY = 5.9;
  sh.moveTo(x0, -0.3); sh.lineTo(x0, h);
  sh.lineTo(wx - hw, h); sh.bezierCurveTo(wx - hw + 0.15, h + 0.75, wx - hw + 0.75, h + 0.7, wx - hw + 0.8, h + 1.25);
  sh.bezierCurveTo(wx - hw + 0.85, topY - 0.2, wx - 0.9, topY, wx, topY); sh.bezierCurveTo(wx + 0.9, topY, wx + hw - 0.85, topY - 0.2, wx + hw - 0.8, h + 1.25);
  sh.bezierCurveTo(wx + hw - 0.75, h + 0.7, wx + hw - 0.15, h + 0.75, wx + hw, h);
  sh.lineTo(x1, h); sh.lineTo(x1, -0.3); sh.lineTo(x0, -0.3);
  const hole = new THREE.Path(); hole.absarc(G.x, gy, G.r, 0, Math.PI * 2, true); sh.holes.push(hole);
  const wg = new THREE.ExtrudeGeometry(sh, { depth: 0.44, bevelEnabled: false, curveSegments: 20 });
  wg.attributes.uv.array.forEach((v, k, a) => { a[k] = v * 0.18; });
  b.add(wg, M.plaster, 0, 0, C.WALL_Z - 0.22);
  // 镬耳的灰边：沿山墙轮廓走一圈
  const pts = sh.getPoints(40).filter(p => p.y > h - 0.01 && p.x >= wx - hw - 0.01 && p.x <= wx + hw + 0.01).map(p => [p.x, p.y, C.WALL_Z]);
  const band = tube(pts, 0.2, 6, 80); band.translate(0, 0, -C.WALL_Z); band.scale(1, 1, 1.7); band.translate(0, 0, C.WALL_Z); b.add(band, M.greyTrim);
  // 平段的瓦压顶
  for (const [a, c] of [[x0, wx - hw], [wx + hw, x1]]) { b.add(box(c - a, 0.14, 0.78), M.tile, (a + c) / 2, h + 0.07, C.WALL_Z, 0, 0, 0); const cap = cyl(0.2, 0.2, c - a, 8); b.add(cap, M.greyTrim, (a + c) / 2, h + 0.2, C.WALL_Z, 0, 0, Math.PI / 2); }
  // 月洞门的石圈与门槛
  const ring = new THREE.TorusGeometry(G.r + 0.02, 0.13, 8, 40); ring.scale(1, 1, 2.1); b.add(ring, M.granite, G.x, gy, C.WALL_Z);
  b.add(box(1.5, 0.16, 0.9), M.granite, G.x, 0.03, C.WALL_Z);
  // 围墙四面
  const run = (ax, az, bx, bz, hh = 3.4) => { const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax), cx = (ax + bx) / 2, cz = (az + bz) / 2; const pg = box(len, hh + 0.3, 0.4); pg.attributes.uv.array.forEach((v, k, a) => { if (k % 2 === 0) a[k] = v * len / 6; }); b.add(pg, M.plaster, cx, hh / 2 - 0.15, cz, 0, ry, 0); const tg = box(len + 0.3, 0.14, 0.8); tg.attributes.uv.array.forEach((v, k, a) => { if (k % 2 === 0) a[k] = v * len * 1.2; }); b.add(tg, M.tile, cx, hh + 0.07, cz, 0, ry, 0); b.add(cyl(0.2, 0.2, len + 0.3, 8), M.greyTrim, cx, hh + 0.2, cz, 0, ry, Math.PI / 2); b.add(box(len, 0.5, 0.46), M.graniteDark, cx, 0.2, cz, 0, ry, 0); };
  const X0 = C.BOUNDS.x0 - 0.7, X1 = C.BOUNDS.x1 + 0.7, Z0 = C.BOUNDS.z0 - 0.7, Z1 = C.BOUNDS.z1 + 0.7;
  run(X0, Z0, X0, Z1); run(X1, Z0, X1, Z1); run(X0, Z0, X1, Z0, 3.8); run(X0, Z1, -1.6, Z1); run(1.6, Z1, X1, Z1);
  // 南面的园门（回头看时的对景）：门楼 + 两扇关着的木门
  b.add(box(3.6, 4.2, 0.6), M.plaster, 0, 2.1, Z1); b.add(box(2.2, 2.9, 0.7), M.woodDark, 0, 1.45, Z1); for (const s of [-1, 1]) { b.add(box(1.0, 2.7, 0.76), M.wood, s * 0.52, 1.4, Z1); b.add(sph(0.07, 8, 6), M.gold, s * 0.12, 1.45, Z1 - 0.4); }
  b.add(box(2.6, 0.5, 0.74), M.granite, 0, 3.2, Z1); b.add(box(4.6, 0.16, 1.7), M.tile, 0, 4.3, Z1); b.add(cyl(0.16, 0.16, 4.6, 8), M.ridge, 0, 4.46, Z1, 0, 0, Math.PI / 2); b.add(box(2.6, 0.3, 1.0), M.granite, 0, 0.05, Z1 - 0.4);
  b.flush(scene);
}

// 假山顶上的六角亭
export function buildHexPavilion(parent, M, x, y, z, s = 1) {
  const b = new Batch(), R = 1.25 * s, H = 2.0 * s;
  b.add(cyl(R + 0.25 * s, R + 0.35 * s, 0.35 * s, 6), M.graniteLight, x, y + 0.17 * s, z);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6, px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R; b.add(cyl(0.07 * s, 0.08 * s, H, 8), M.wood, px, y + 0.35 * s + H / 2, pz); const a2 = a + Math.PI / 3, qx = x + Math.cos(a2) * R, qz = z + Math.sin(a2) * R, len = Math.hypot(qx - px, qz - pz), ry = Math.atan2(-(qz - pz), qx - px); if (i !== 1) { const rl = new THREE.PlaneGeometry(len - 0.1, 0.42 * s); rl.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * 2; }); b.add(rl, M.rail, (px + qx) / 2, y + 0.6 * s, (pz + qz) / 2, 0, ry, 0); } const hg = new THREE.PlaneGeometry(len - 0.1, 0.26 * s); hg.attributes.uv.array.forEach((v, k, arr) => { if (k % 2 === 0) arr[k] = v * 4; }); b.add(hg, M.lattice, (px + qx) / 2, y + 0.35 * s + H - 0.2 * s, (pz + qz) / 2, 0, ry, 0); b.add(box(len, 0.1 * s, 0.1 * s), M.wood, (px + qx) / 2, y + 0.35 * s + H - 0.04 * s, (pz + qz) / 2, 0, ry, 0); }
  const prof = []; for (let i = 0; i <= 10; i++) { const t = i / 10, r = (R + 0.75 * s) * Math.pow(t, 0.72), yy = 1.25 * s * Math.pow(1 - t, 1.9) + (t > 0.85 ? (t - 0.85) * 1.1 * s : 0); prof.push([Math.max(0.02, r), yy]); }
  const roof = lathe(prof, 6); roof.rotateY(Math.PI / 6); b.add(roof, M.ridge, x, y + 0.35 * s + H + 0.02, z);
  const under = lathe(prof.map(([r, yy]) => [r * 0.97, yy - 0.06]), 6); under.rotateY(Math.PI / 6); b.add(under, M.woodDark, x, y + 0.35 * s + H + 0.02, z);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; const pts = prof.map(([r, yy]) => [x + Math.cos(a) * r, y + 0.35 * s + H + 0.06 + yy, z + Math.sin(a) * r]); b.add(tube(pts, 0.05 * s, 5), M.ridgeDark); }
  b.add(sph(0.16 * s, 10, 8), M.ridgeDark, x, y + 0.35 * s + H + 1.38 * s, z); b.add(cyl(0.03 * s, 0.07 * s, 0.3 * s, 8), M.ridgeDark, x, y + 0.35 * s + H + 1.6 * s, z);
  b.flush(parent);
}
