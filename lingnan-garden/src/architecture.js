// 建筑：敞厅、廊子与廊桥、八角亭、青砖墙、池岸石栏、墙外的高楼与邻屋。
import * as THREE from 'three';
import * as C from './core.js';
import { Batch, box, cyl, sph, lathe, tube, rng } from './kit.js';

const uvScale = (g, sx, sy) => { const a = g.attributes.uv.array; for (let k = 0; k < a.length; k += 2) { a[k] *= sx; a[k + 1] *= sy; } return g; };
const plane = (w, h, rx = 1, ry = 1) => uvScale(new THREE.PlaneGeometry(w, h), rx, ry);
// 砖墙用的长方体：纹理按米铺（一米大约四皮砖高）
function brickBox(w, h, d) { const g = box(w, h, d), n = g.attributes.normal.array, p = g.attributes.position.array, uv = g.attributes.uv.array; for (let i = 0; i < p.length / 3; i++) { const nx = Math.abs(n[i * 3]), ny = Math.abs(n[i * 3 + 1]); const u = nx > 0.5 ? p[i * 3 + 2] : p[i * 3], v = ny > 0.5 ? p[i * 3 + 2] : p[i * 3 + 1]; uv[i * 2] = u * 0.52; uv[i * 2 + 1] = v * 0.52; } return g; }

// 两坡瓦顶：屋脊沿 x，长 L，半宽 W，略带下垂。原点在檐口高度、平面中心。
function roofGeo(L, W, rise, sag = 1.18, N = 10) {
  const pos = [], uv = [], idx = [];
  for (const e of [-L / 2, L / 2]) for (let j = 0; j <= 2 * N; j++) { const v = -1 + j / N; pos.push(e, rise * Math.pow(1 - Math.abs(v), sag), v * W); uv.push(e * 1.25, (1 - Math.abs(v)) * W * 1.1); }
  for (let j = 0; j < 2 * N; j++) idx.push(j, j + 1, j + 2 * N + 1, j + 1, j + 2 * N + 2, j + 2 * N + 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// 山墙上半截的三角（跟着屋面曲线），厚 d
function gableGeo(W, rise, d, sag = 1.18, extra = 0.14) {
  const sh = new THREE.Shape(); sh.moveTo(-W, 0); for (let j = 0; j <= 20; j++) { const v = -1 + j / 10; sh.lineTo(v * W, rise * Math.pow(1 - Math.abs(v), sag) + extra); } sh.lineTo(W, 0); sh.lineTo(-W, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }); uvScale(g, 0.52, 0.52); g.translate(0, 0, -d / 2); g.rotateY(Math.PI / 2); return g;   // 现在三角面朝 ±x，宽度沿 z
}
// 博古脊：一条灰塑彩描的平脊，两头回纹方勾
function boguRidge(b, M, x0, x1, y, z, ry = 0) {
  const L = x1 - x0, cx = (x0 + x1) / 2, m = new THREE.Matrix4().makeRotationY(ry).setPosition(cx, y, z), put = (g, mat, lx, ly, lz = 0) => b.addM(g, mat, new THREE.Matrix4().makeTranslation(lx, ly, lz).premultiply(m));
  put(box(L, 0.16, 0.34), M.limeDark, 0, 0.08); put(box(L - 0.5, 0.4, 0.24), M.lime, 0, 0.36); put(box(L, 0.08, 0.32), M.limeDark, 0, 0.6);
  const n = Math.max(1, Math.round((L - 2.2) / 2.4));
  for (const s of [-1, 1]) put(plane(L - 2.0, 0.34, n, 1), M.relief, 0, 0.36, s * 0.123);
  for (const s of [-1, 1]) { const ex = s * (L / 2 - 0.42); put(box(0.84, 0.2, 0.3), M.lime, ex, 0.74); put(box(0.2, 0.62, 0.3), M.lime, ex + s * 0.32, 1.02); put(box(0.62, 0.18, 0.3), M.lime, ex + s * 0.11, 1.38); put(box(0.18, 0.4, 0.3), M.lime, ex - s * 0.11, 1.12); put(box(0.3, 0.14, 0.3), M.lime, ex + s * 0.02, 0.98); }
}

function manchuRow(b, M, x0, x1, y0, h, z, n, ry = 0) {
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) { const cx = x0 + w * (i + 0.5); b.add(plane(w - 0.1, h - 0.08), M.manchu, cx, y0 + h / 2, z, 0, ry, 0); for (const s of [-1, 1]) b.add(box(0.07, h, 0.1), M.woodDark, cx + s * (w / 2 - 0.035), y0 + h / 2, z); b.add(box(w, 0.07, 0.1), M.woodDark, cx, y0 + 0.035, z); b.add(box(w, 0.07, 0.1), M.woodDark, cx, y0 + h - 0.035, z); }
}

export function buildHall(scene, M) {
  const P = C.PAV, b = new Batch(), D = C.DECK_Y, H = 3.1, top = D + H, L = P.x1 - P.x0, cx = (P.x0 + P.x1) / 2;
  const zc = (P.zBack + P.zFront) / 2, W = (P.zFront - P.zBack) / 2 + 0.55, rise = 1.75, zCol = P.zFront - 0.2;
  // 台基：麻石，南沿直接做荷池的北岸
  b.add(box(L + 0.5, D + 0.9, 0.2 - P.zBack + 0.35), M.granite, cx, (D - 0.9) / 2, (P.zBack - 0.35 + 0.2) / 2);
  b.add(box(L + 0.6, 0.12, 0.2 - P.zBack + 0.45), M.graniteLight, cx, D - 0.05, (P.zBack - 0.35 + 0.2) / 2 + 0.02);
  b.add(plane(L - 0.4, P.zWall - P.zBack - 0.3, 3, 2).rotateX(-Math.PI / 2), M.plank, cx, D + 0.012, (P.zBack + P.zWall) / 2);
  // 西头下庭院的三级踏步
  for (let i = 0; i < 3; i++) { const h = D * (3 - i) / 3; b.add(box(0.42, h, 1.7), M.graniteLight, P.x0 - 0.25 - 0.21 - i * 0.4, h / 2, -1.5); }
  // 柱：前檐一排（木柱石础），正面墙上一排
  for (const x of P.cols) for (const z of [zCol, P.zWall]) { b.add(cyl(0.12, 0.135, H, 14), M.wood, x, D + H / 2, z); b.add(cyl(0.2, 0.23, 0.22, 8), M.graniteLight, x, D + 0.11, z); }
  for (const z of [zCol, P.zWall]) b.add(box(L - 0.2, 0.24, 0.16), M.wood, cx, top - 0.12, z);
  // 檐下挂落：通花木格，两端带雀替
  for (let i = 0; i < P.cols.length - 1; i++) { const w = P.cols[i + 1] - P.cols[i] - 0.24, mx = (P.cols[i] + P.cols[i + 1]) / 2; b.add(plane(w, 0.5, Math.round(w / 0.25), 2), M.lattice, mx, top - 0.5, zCol); b.add(box(w, 0.06, 0.08), M.woodDark, mx, top - 0.77, zCol); for (const s of [-1, 1]) { const br = new THREE.Shape(); br.moveTo(0, 0); br.lineTo(0.46, 0); br.quadraticCurveTo(0.1, -0.1, 0, -0.5); const bg = new THREE.ExtrudeGeometry(br, { depth: 0.05, bevelEnabled: false }); b.add(bg, M.woodDark, mx + s * (w / 2), top - 0.78, zCol + (s > 0 ? 0.025 : -0.025), 0, s > 0 ? Math.PI : 0, 0); } }
  // 正面墙：最西一间是门（敞开），其余四间各两樘满洲窗，窗上一条蚝壳横披
  const sill = 0.6, winH = 1.72, tr = 0.36;
  for (let i = 0; i < P.cols.length - 1; i++) {
    const x0 = P.cols[i] + 0.13, x1 = P.cols[i + 1] - 0.13, w = x1 - x0, mx = (x0 + x1) / 2;
    b.add(plane(w, tr, Math.round(w / 0.36), 1), M.oyster, mx, D + sill + winH + tr / 2 + 0.04, P.zWall); b.add(box(w, 0.07, 0.12), M.woodDark, mx, D + sill + winH + tr + 0.075, P.zWall);
    b.add(box(w, H - sill - winH - tr - 0.12, 0.1), M.wood, mx, top - (H - sill - winH - tr - 0.12) / 2 - 0.02, P.zWall);
    if (i === 0) { for (const [hx, ry] of [[P.door[0], 1.4], [P.door[1], Math.PI - 1.4]]) { const dw = 0.64, dh = sill + winH, m = new THREE.Matrix4().makeRotationY(ry).setPosition(hx, D, P.zWall - 0.05); b.addM(box(dw, 0.8, 0.05), M.wood, new THREE.Matrix4().makeTranslation(dw / 2, 0.4, 0).premultiply(m)); b.addM(plane(dw - 0.1, dh - 0.9), M.manchu, new THREE.Matrix4().makeTranslation(dw / 2, 0.85 + (dh - 0.9) / 2, 0).premultiply(m)); for (const lx of [0.035, dw - 0.035]) b.addM(box(0.07, dh, 0.06), M.woodDark, new THREE.Matrix4().makeTranslation(lx, dh / 2, 0).premultiply(m)); b.addM(box(dw, 0.07, 0.06), M.woodDark, new THREE.Matrix4().makeTranslation(dw / 2, dh - 0.035, 0).premultiply(m)); } continue; }
    b.add(box(w, sill, 0.14), M.wood, mx, D + sill / 2, P.zWall); b.add(box(w, 0.06, 0.2), M.woodDark, mx, D + sill, P.zWall);
    manchuRow(b, M, x0, x1, D + sill + 0.03, winH, P.zWall, 2);
  }
  // 两山墙与后墙：青砖、麻石勒脚；山墙尖上各一块灰塑
  for (const [x, s] of [[P.x0, -1], [P.x1, 1]]) {
    b.add(brickBox(0.32, H + 0.3, P.zWall - P.zBack + 0.3), M.brick, x, D + (H + 0.3) / 2 - 0.1, (P.zBack + P.zWall) / 2 - 0.02);
    b.add(box(0.38, 0.6, P.zWall - P.zBack + 0.34), M.graniteLight, x, D + 0.3, (P.zBack + P.zWall) / 2 - 0.02);
    b.add(gableGeo(W - 0.5, rise - 0.24, 0.32), M.brick, x, top + 0.1, zc);
    b.add(plane(1.3, 1.0), M.relief, x + s * 0.17, top + 0.62, zc, 0, s * Math.PI / 2, 0);
    // 垂脊：沿山墙顶走一条灰边
    const pts = []; for (let j = 0; j <= 16; j++) { const v = -1 + j / 8; pts.push([x, top + 0.1 + (rise - 0.24) * Math.pow(1 - Math.abs(v), 1.18) + 0.2, zc + v * (W - 0.45)]); } const band = tube(pts, 0.11, 6, 32); b.add(band, M.limeDark);
  }
  { const segs = [P.x0 + 0.16, -3.6, -2.5, 0.2, 1.3, P.x1 - 0.16], zb = P.zBack; for (let i = 0; i < segs.length - 1; i++) { const x0 = segs[i], x1 = segs[i + 1], w = x1 - x0, mx = (x0 + x1) / 2; if (i % 2 === 0) b.add(brickBox(w, H + 0.2, 0.3), M.brick, mx, D + (H + 0.2) / 2 - 0.1, zb); else { b.add(brickBox(w, 1.1, 0.3), M.brick, mx, D + 0.55, zb); b.add(brickBox(w, H - 2.65, 0.3), M.brick, mx, top - (H - 2.65) / 2 + 0.1, zb); manchuRow(b, M, x0, x1, D + 1.1, 1.65, zb, 1); } } b.add(box(L, 0.6, 0.36), M.graniteLight, cx, D + 0.3, zb); }
  // 屋架：岭南的屋面没有厚保温层，从地面能直接望到瓦底，所以不做天花，只放几根梁和檩
  for (const x of P.cols) { b.add(box(0.16, 0.22, 2 * W - 1.4), M.wood, x, top + 0.02, zc); b.add(box(0.14, 0.5, 0.14), M.wood, x, top + 0.38, zc - 1.2); b.add(box(0.14, 0.5, 0.14), M.wood, x, top + 0.38, zc + 1.2); b.add(box(0.14, 0.18, 2.6), M.wood, x, top + 0.7, zc); b.add(box(0.12, 0.6, 0.12), M.wood, x, top + 1.05, zc); }
  for (const dz of [-2.4, -1.2, 0, 1.2, 2.4]) b.add(cyl(0.07, 0.07, L - 0.3, 8), M.woodDark, cx, top + 0.1 + rise * Math.pow(1 - Math.abs(dz) / W, 1.18) - 0.12, zc + dz, 0, 0, Math.PI / 2);
  // 屋顶：灰瓦两坡，檐口平直；博古脊
  b.add(roofGeo(L + 0.36, W, rise), M.tile, cx, top + 0.1, zc);
  for (const s of [-1, 1]) b.add(box(L + 0.36, 0.1, 0.07), M.tileDark, cx, top + 0.06, zc + s * (W - 0.02));
  boguRidge(b, M, P.x0 - 0.1, P.x1 + 0.1, top + 0.1 + rise - 0.06, zc);
  // 屋里：一张条桌、两把椅、茶具、东墙一幅挂轴
  const tx = 0.3, tz = -4.45;
  b.add(box(1.7, 0.07, 0.8), M.wood, tx, D + 0.78, tz); for (const [a, c] of [[-0.78, -0.33], [0.78, -0.33], [-0.78, 0.33], [0.78, 0.33]]) b.add(box(0.07, 0.76, 0.07), M.woodDark, tx + a, D + 0.38, tz + c);
  for (const s of [-1, 1]) { b.add(box(0.46, 0.05, 0.44), M.wood, tx + s * 1.35, D + 0.46, tz); b.add(box(0.05, 0.9, 0.44), M.woodDark, tx + s * 1.57, D + 0.45, tz); for (const c of [-0.19, 0.19]) b.add(box(0.05, 0.46, 0.05), M.woodDark, tx + s * 1.15, D + 0.23, tz + c); }
  b.add(sph(0.11, 12, 8), M.teapot, tx, D + 0.9, tz, 0, 0, 0, 1, 0.8, 1); b.add(cyl(0.04, 0.035, 0.05, 10), M.cup, tx + 0.28, D + 0.84, tz + 0.1); b.add(cyl(0.04, 0.035, 0.05, 10), M.cup, tx - 0.26, D + 0.84, tz - 0.12);
  b.add(box(0.03, 1.5, 0.62), M.cup, P.x1 - 0.2, D + 1.75, -4.2); for (const yy of [2.52, 0.98]) b.add(box(0.04, 0.05, 0.7), M.woodDark, P.x1 - 0.2, D + yy, -4.2);
  b.flush(scene);
  const lamp = new THREE.PointLight('#ffd9a0', 5, 8, 2); lamp.position.set(cx, D + 2.4, -4.2); scene.add(lamp);
}

// 廊子（接檐廊东头）与廊桥（南北向跨水道）：石拱上盖瓦顶，中间一段升起小亭顶
export function buildCorridorBridge(scene, M) {
  const b = new Batch(), D = C.DECK_Y, N = C.CONN, B = C.BRIDGE, bx = (B.x0 + B.x1) / 2, eave = 3.2;
  // 廊子的石台与三处踏步
  b.add(box(N.x1 - N.x0 + 0.1, D + 0.9, N.z1 - N.z0 + 0.3), M.granite, (N.x0 + N.x1) / 2, (D - 0.9) / 2, (N.z0 + N.z1) / 2); b.add(box(N.x1 - N.x0 + 0.2, 0.1, N.z1 - N.z0 + 0.4), M.graniteLight, (N.x0 + N.x1) / 2, D - 0.04, (N.z0 + N.z1) / 2);
  for (let i = 0; i < 3; i++) { const h = D * (3 - i) / 3; b.add(box(1.3, h, 0.38), M.graniteLight, 4.0, h / 2, N.z0 - 0.19 - i * 0.36); b.add(box(0.38, h, 1.7), M.graniteLight, N.x1 + 0.19 + i * 0.36, h / 2, -1.5); }
  // 桥身：侧面轮廓挤出来，水道上开一个半圆拱
  const sh = new THREE.Shape(); sh.moveTo(B.z0, -1.0); sh.lineTo(B.z0, D); for (let i = 0; i <= 40; i++) { const z = B.z0 + (B.z1 - B.z0) * i / 40; sh.lineTo(z, C.bridgeY(z)); } sh.lineTo(B.z1 + 0.3, 0); sh.lineTo(B.z1 + 0.3, -1.0); sh.lineTo(B.z0, -1.0);
  const mid = (C.CHANNEL.z0 + C.CHANNEL.z1) / 2, aw = (C.CHANNEL.z1 - C.CHANNEL.z0) / 2 - 0.12, ah = B.peak - 0.36 - C.WATER_Y;
  const hole = new THREE.Path(); hole.moveTo(mid - aw, -0.95); for (let i = 0; i <= 24; i++) { const t = Math.PI * (1 - i / 24); hole.lineTo(mid + Math.cos(t) * aw, C.WATER_Y - 0.05 + Math.sin(t) * ah); } hole.lineTo(mid + aw, -0.95); sh.holes.push(hole);
  const body = new THREE.ExtrudeGeometry(sh, { depth: B.x1 - B.x0 + 0.3, bevelEnabled: false, curveSegments: 6 }); uvScale(body, 0.5, 0.5); body.rotateY(-Math.PI / 2);
  b.add(body, M.graniteLight, B.x1 + 0.15, 0, 0);
  for (let i = 0; i <= 14; i++) { const t = Math.PI * (1 - i / 14), z = mid + Math.cos(t) * (aw + 0.13), y = C.WATER_Y - 0.05 + Math.sin(t) * (ah + 0.13); for (const x of [B.x0 - 0.17, B.x1 + 0.17]) b.add(box(0.06, 0.2, 0.3), M.granite, x, y, z, t - Math.PI / 2, 0, 0); }
  // 柱、栏杆、挂落：廊子一段 + 桥上各段
  const post = (x, z, y0) => { b.add(cyl(0.085, 0.095, eave - y0 + (z > 1.2 && z < 4.0 ? 0.45 : 0), 10), M.wood, x, y0 + (eave - y0 + (z > 1.2 && z < 4.0 ? 0.45 : 0)) / 2, z); b.add(cyl(0.14, 0.16, 0.12, 8), M.graniteLight, x, y0 + 0.06, z); };
  const zs = [-0.5, 1.3, 2.6, 3.9, 5.45];
  for (const z of zs) for (const x of [B.x0 + 0.08, B.x1 - 0.08]) post(x, z, C.bridgeY(z));
  for (const x of [3.15, 4.9, 6.75]) for (const z of [N.z0 + 0.08, N.z1 - 0.08]) if (!(x > 4.8 && z > -1)) post(x, z, D);
  for (let i = 0; i < zs.length - 1; i++) for (const x of [B.x0 + 0.08, B.x1 - 0.08]) {
    const z0 = zs[i], z1 = zs[i + 1], y0 = C.bridgeY(z0), y1 = C.bridgeY(z1), len = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z1 - z0), mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
    const nb = Math.max(2, Math.round((z1 - z0) / 0.32)); for (let k = 1; k < nb; k++) { const zz = z0 + (z1 - z0) * k / nb; b.add(box(0.045, 0.56, 0.045), M.woodDark, x, C.bridgeY(zz) + 0.4, zz); }
    b.add(box(0.08, 0.06, len - 0.1), M.wood, x, my + 0.14, mz, -ang, 0, 0);
    b.add(box(0.1, 0.07, len - 0.1), M.wood, x, my + 0.72, mz, -ang, 0, 0);
    const mid2 = z0 > 1.2 && z1 < 4.0, ey = eave + (mid2 ? 0.45 : 0); b.add(plane(z1 - z0 - 0.18, 0.34, Math.round((z1 - z0) / 0.3), 1), M.lattice, x, ey - 0.3, mz, 0, Math.PI / 2, 0); b.add(box(0.1, 0.14, z1 - z0), M.wood, x, ey - 0.07, mz);
  }
  { const segs = [[3.15, 4.9, N.z0 + 0.08, true], [4.9, 6.75, N.z0 + 0.08, false], [3.15, 4.9, N.z1 - 0.08, false]]; for (const [x0, x1, z, gap] of segs) { const w = x1 - x0, mx = (x0 + x1) / 2; b.add(plane(w - 0.18, 0.34, Math.round(w / 0.3), 1), M.lattice, mx, eave - 0.3, z); b.add(box(w, 0.14, 0.1), M.wood, mx, eave - 0.07, z); if (!gap) { b.add(plane(w - 0.18, 0.56, 2, 1), M.rail, mx, D + 0.4, z); b.add(box(w - 0.1, 0.07, 0.1), M.wood, mx, D + 0.72, z); } else { b.add(plane(0.3, 0.56, 1, 1), M.rail, 3.25, D + 0.4, z); b.add(plane(0.3, 0.56, 1, 1), M.rail, 4.75, D + 0.4, z); } } }
  // 瓦顶：廊子一段（脊沿东西）、桥上南北两段（脊沿南北）、中间升起的四角攒尖小顶
  const half = 1.5, rise = 0.6;
  b.add(roofGeo(N.x1 - N.x0 + 0.5, half, rise), M.tile, (N.x0 + N.x1) / 2 + 0.2, eave, (N.z0 + N.z1) / 2); b.add(box(N.x1 - N.x0 + 0.5, 0.16, 0.2), M.limeDark, (N.x0 + N.x1) / 2 + 0.2, eave + rise + 0.05, (N.z0 + N.z1) / 2);
  for (const [z0, z1] of [[-0.6, 1.45], [3.75, 5.75]]) { b.add(roofGeo(z1 - z0, half, rise), M.tile, bx, eave, (z0 + z1) / 2, 0, Math.PI / 2, 0); b.add(box(0.2, 0.16, z1 - z0), M.limeDark, bx, eave + rise + 0.05, (z0 + z1) / 2); for (const s of [-1, 1]) b.add(box(0.07, 0.1, z1 - z0), M.tileDark, bx + s * (half - 0.02), eave - 0.04, (z0 + z1) / 2); }
  const prof = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([Math.max(0.02, 2.45 * Math.pow(t, 0.8)), 1.3 * Math.pow(1 - t, 1.5)]); }
  const top = lathe(prof, 4); top.rotateY(Math.PI / 4); uvScale(top, 8, 2.4); b.add(top, M.tile, bx, eave + 0.5, mid);
  const under = lathe(prof.map(([r, y]) => [r * 0.97, y - 0.07]), 4); under.rotateY(Math.PI / 4); b.add(under, M.woodDark, bx, eave + 0.5, mid);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; b.add(tube(prof.map(([r, y]) => [bx + Math.cos(a) * r, eave + 0.54 + y, mid + Math.sin(a) * r]), 0.06, 5), M.limeDark); }
  b.add(sph(0.17, 10, 8), M.limeDark, bx, eave + 1.9, mid); b.add(cyl(0.03, 0.08, 0.34, 8), M.limeDark, bx, eave + 2.14, mid);
  b.add(box(2 * half - 0.2, 0.05, B.z1 - B.z0), M.woodDark, bx, eave + 0.0, (B.z0 + B.z1) / 2 - 0.05);
  b.flush(scene);
}

// 八角亭：立在八角池中央的石台上，七面满洲窗，朝南开门
export function buildOctPavilion(scene, M) {
  const b = new Batch(), P = C.PAVILION, y0 = C.OCT_Y, H = 2.5, R = P.wall / Math.cos(Math.PI / 8);
  const base = cyl(P.r + 0.05, P.r + 0.2, y0 + 0.95, 8); base.rotateY(Math.PI / 8); b.add(base, M.granite, P.x, (y0 - 0.95) / 2, P.z);
  const cap = cyl(P.r + 0.14, P.r + 0.14, 0.1, 8); cap.rotateY(Math.PI / 8); b.add(cap, M.graniteLight, P.x, y0 - 0.04, P.z);
  for (let i = 0; i < 8; i++) {
    const a0 = Math.PI / 8 + i * Math.PI / 4, a1 = a0 + Math.PI / 4, px = P.x + Math.cos(a0) * R, pz = P.z + Math.sin(a0) * R, qx = P.x + Math.cos(a1) * R, qz = P.z + Math.sin(a1) * R;
    b.add(cyl(0.085, 0.095, H, 10), M.wood, px, y0 + H / 2, pz);
    const len = Math.hypot(qx - px, qz - pz), ry = Math.atan2(-(qz - pz), qx - px), mx = (px + qx) / 2, mz = (pz + qz) / 2;
    b.add(box(len, 0.14, 0.1), M.wood, mx, y0 + H - 0.07, mz, 0, ry, 0); b.add(plane(len - 0.18, 0.3, 4, 1), M.oyster, mx, y0 + H - 0.3, mz, 0, ry, 0);
    if (i === 1) continue;   // 朝南一面是门
    b.add(box(len - 0.16, 0.62, 0.1), M.wood, mx, y0 + 0.31, mz, 0, ry, 0); b.add(box(len - 0.1, 0.06, 0.16), M.woodDark, mx, y0 + 0.63, mz, 0, ry, 0);
    b.add(plane(len - 0.26, 1.34), M.manchu, mx, y0 + 0.66 + 0.69, mz, 0, ry, 0);
    for (const [ox, oz] of [[px, pz], [qx, qz]]) b.add(box(0.07, 1.4, 0.1), M.woodDark, ox + (mx - ox) * 0.1, y0 + 0.66 + 0.7, oz + (mz - oz) * 0.1, 0, ry, 0);
  }
  const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push([Math.max(0.02, (R + 0.75) * Math.pow(t, 0.8)), 1.5 * Math.pow(1 - t, 1.55)]); }
  const roof = lathe(prof, 8); roof.rotateY(Math.PI / 8); uvScale(roof, 12, 2.6); b.add(roof, M.tile, P.x, y0 + H + 0.02, P.z);
  const under = lathe(prof.map(([r, y]) => [r * 0.97, y - 0.07]), 8); under.rotateY(Math.PI / 8); b.add(under, M.woodDark, P.x, y0 + H + 0.02, P.z);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; b.add(tube(prof.map(([r, y]) => [P.x + Math.cos(a) * r, y0 + H + 0.06 + y, P.z + Math.sin(a) * r]), 0.055, 5), M.limeDark); }
  b.add(sph(0.2, 10, 8), M.limeDark, P.x, y0 + H + 1.62, P.z, 0, 0, 0, 1, 1.25, 1); b.add(cyl(0.03, 0.09, 0.4, 8), M.limeDark, P.x, y0 + H + 2.0, P.z);
  // 石板桥
  const S = C.SLAB; b.add(box(S.x1 - S.x0, 0.2, S.z1 - S.z0), M.graniteLight, (S.x0 + S.x1) / 2, y0 - 0.1, (S.z0 + S.z1) / 2); for (const z of [4.9, 5.6]) b.add(box(S.x1 - S.x0 - 0.2, 0.9, 0.3), M.granite, (S.x0 + S.x1) / 2, y0 - 0.65, z);
  b.flush(scene);
  const lamp = new THREE.PointLight('#ffe2b0', 2.5, 5, 2); lamp.position.set(P.x, y0 + 1.9, P.z); scene.add(lamp);
}

// 青砖墙：麻石勒脚、灰瓦压顶
function brickWall(b, M, ax, az, bx, bz, h = 3.4, th = 0.44) {
  const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax), cx = (ax + bx) / 2, cz = (az + bz) / 2;
  b.add(brickBox(len, h, th), M.brick, cx, h / 2 - 0.05, cz, 0, ry, 0); b.add(box(len + 0.02, 0.6, th + 0.08), M.graniteLight, cx, 0.3, cz, 0, ry, 0);
  b.add(roofGeo(len + 0.2, th / 2 + 0.2, 0.2, 1, 3), M.tile, cx, h - 0.05, cz, 0, ry, 0); b.add(cyl(0.09, 0.09, len + 0.2, 6), M.limeDark, cx, h + 0.17, cz, 0, ry, Math.PI / 2);
}
export function buildWalls(scene, M) {
  const b = new Batch(), Bn = C.BOUNDS, X0 = Bn.x0 - 0.5, X1 = Bn.x1 + 0.5, Z0 = Bn.z0 - 0.5, Z1 = Bn.z1 + 0.5, J = C.NORTH_JOG, L = C.LINK_Z, D = C.DOOR;
  // 庭院北墙：从西围墙接到敞厅西山墙，中间一个麻石门框的门，门里是窄巷
  brickWall(b, M, X0, L, D.x0 - 0.14, L); brickWall(b, M, D.x1 + 0.14, L, C.PAV.x0, L);
  { const dx = (D.x0 + D.x1) / 2, dw = D.x1 - D.x0 + 0.28; b.add(brickBox(dw, 3.4 - 2.45, 0.44), M.brick, dx, 2.45 + (3.4 - 2.45) / 2 - 0.05, L); b.add(roofGeo(dw + 0.2, 0.42, 0.2, 1, 3), M.tile, dx, 3.35, L); for (const x of [D.x0 - 0.07, D.x1 + 0.07]) b.add(box(0.2, 2.45, 0.54), M.graniteLight, x, 1.225, L); b.add(box(dw + 0.16, 0.24, 0.54), M.graniteLight, dx, 2.45, L); b.add(box(dw - 0.2, 0.1, 0.6), M.granite, dx, 0.03, L); }
  // 窄巷西墙、外圈
  brickWall(b, M, C.ALLEY_X, L, C.ALLEY_X, Z0); brickWall(b, M, X0, L, X0, Z1); brickWall(b, M, C.ALLEY_X, Z0, J.x + 0.22, Z0); brickWall(b, M, J.x + 0.22, Z0, J.x + 0.22, J.z - 0.22, 4.2); brickWall(b, M, J.x, J.z - 0.22, X1, J.z - 0.22, 4.2);
  brickWall(b, M, X1, J.z - 0.22, X1, Z1, 4.2); brickWall(b, M, X0, Z1, -0.6, Z1); brickWall(b, M, 2.6, Z1, X1, Z1);
  // 南面的园门（回头看时的对景）
  b.add(brickBox(3.6, 4.2, 0.6), M.brick, 1, 2.1, Z1); b.add(box(2.3, 3.0, 0.7), M.graniteLight, 1, 1.5, Z1); for (const s of [-1, 1]) { b.add(box(0.98, 2.7, 0.76), M.wood, 1 + s * 0.5, 1.38, Z1); b.add(sph(0.07, 8, 6), M.gold, 1 + s * 0.12, 1.45, Z1 - 0.4); }
  b.add(roofGeo(4.6, 0.95, 0.5), M.tile, 1, 4.2, Z1); b.add(box(4.6, 0.16, 0.2), M.limeDark, 1, 4.75, Z1);
  b.flush(scene);
}

// 池岸：麻石压顶；长方荷池三面石栏（望柱 + 两道横栏），八角池与水道只做矮石沿
export function buildPondEdge(scene, M) {
  const b = new Batch(), R = C.RECT, Ch = C.CHANNEL;
  const kerb = (ax, az, bx2, bz, w = 0.36, h = 0.14) => { const len = Math.hypot(bx2 - ax, bz - az), ry = Math.atan2(-(bz - az), bx2 - ax); b.add(box(len + w, h, w), M.graniteLight, (ax + bx2) / 2, h / 2 - 0.02, (az + bz) / 2, 0, ry, 0); };
  const rail = (ax, az, bx2, bz, y0 = 0) => { const len = Math.hypot(bx2 - ax, bz - az), n = Math.max(1, Math.round(len / 1.7)), ry = Math.atan2(-(bz - az), bx2 - ax); for (let i = 0; i <= n; i++) { const x = ax + (bx2 - ax) * i / n, z = az + (bz - az) * i / n; b.add(box(0.24, 0.82, 0.24), M.graniteLight, x, y0 + 0.41, z, 0, ry, 0); b.add(box(0.3, 0.07, 0.3), M.granite, x, y0 + 0.84, z, 0, ry, 0); if (i < n) { const mx = ax + (bx2 - ax) * (i + 0.5) / n, mz = az + (bz - az) * (i + 0.5) / n; b.add(box(len / n - 0.24, 0.14, 0.14), M.graniteLight, mx, y0 + 0.66, mz, 0, ry, 0); b.add(box(len / n - 0.24, 0.12, 0.12), M.graniteLight, mx, y0 + 0.32, mz, 0, ry, 0); } } };
  const o = 0.16;   // 栏杆退在岸上一点
  kerb(R.x0, R.z0, R.x0, R.z1); kerb(R.x0, R.z1, R.x1, R.z1); kerb(R.x1, Ch.z1, R.x1, R.z1); kerb(R.x1, R.z0, R.x1, Ch.z0); kerb(C.PAV.x1 + 0.3, R.z0, R.x1, R.z0);
  rail(R.x0 - o, C.PAV.zFront + 0.35, R.x0 - o, R.z1 + o); rail(R.x0 - o, R.z1 + o, R.x1 + o, R.z1 + o); rail(R.x1 + o, R.z1 + o, R.x1 + o, 5.75);
  // 敞厅檐廊临水一面的石栏，立在台基上
  rail(C.PAV.x0 + 0.1, C.PAV.zFront + 0.02, C.PAV.x1 - 0.1, C.PAV.zFront + 0.02, C.DECK_Y);
  // 水道与八角池的矮石沿
  const bx1 = C.BRIDGE.x1 + 0.2, O = C.OCT_PTS;
  kerb(bx1, Ch.z0, O[1].x, Ch.z0, 0.3, 0.18); kerb(bx1, Ch.z1, Ch.x1, Ch.z1, 0.3, 0.18); kerb(Ch.x1, Ch.z1, O[0].x, O[0].z, 0.3, 0.18);
  for (let i = 1; i < 8; i++) { const p = O[i], q = O[(i + 1) % 8]; if (i === 7) continue; kerb(p.x, p.z, q.x, q.z, 0.32, 0.18); }
  kerb(O[7].x, O[7].z, O[0].x, O[0].z, 0.32, 0.18);
  b.flush(scene);
}

// 墙外的远景：一座四层青砖高楼（示意可园邀山阁那一类可登高的楼）、一间带镬耳山墙的邻屋
export function buildFar(scene, M) {
  const b = new Batch(), tx = 15.5, tz = -12.5, w = 4.2, sh = 3.3;
  for (let i = 0; i < 4; i++) {
    const y = i * sh, ww = w - i * 0.18;
    b.add(brickBox(ww, sh, ww), M.brick, tx, y + sh / 2, tz); b.add(box(ww + 0.3, 0.2, ww + 0.3), M.graniteLight, tx, y + sh, tz);
    if (i < 3) for (const [dx, dz, ry] of [[0, 1, 0], [-1, 0, Math.PI / 2], [0, -1, 0], [1, 0, Math.PI / 2]]) for (const off of [-0.85, 0.85]) { const ox = tx + dx * (ww / 2 + 0.02) + (dx ? 0 : off), oz = tz + dz * (ww / 2 + 0.02) + (dz ? 0 : off); b.add(box(0.62, 1.2, 0.08), M.woodDark, ox, y + 1.55, oz, 0, ry, 0); const arch = cyl(0.31, 0.31, 0.08, 14, 1); arch.rotateX(Math.PI / 2); b.add(arch, M.woodDark, ox, y + 2.15, oz, 0, ry, 0); }
  }
  // 顶层：四面开敞的望台，石栏、四柱、小瓦顶
  const ty = 3 * sh, tw = w - 0.54;
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.add(box(0.3, sh, 0.3), M.brick, tx + dx * (tw / 2 - 0.15), ty + sh / 2, tz + dz * (tw / 2 - 0.15));
  const prof = []; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([Math.max(0.02, 3.6 * Math.pow(t, 0.85)), 1.5 * Math.pow(1 - t, 1.4)]); }
  const roof = lathe(prof, 4); roof.rotateY(Math.PI / 4); uvScale(roof, 8, 2.5); b.add(roof, M.tile, tx, 4 * sh + 0.2, tz); b.add(sph(0.22, 8, 6), M.limeDark, tx, 4 * sh + 1.85, tz, 0, 0, 0, 1, 1.4, 1);
  // 邻屋：一面镬耳山墙朝着园子
  const hx = 26, hz = -8.5, gw = 4.6, gh = 6.2, top = 9.2, s = new THREE.Shape();
  s.moveTo(-gw, 0); s.lineTo(-gw, gh); s.bezierCurveTo(-gw + 0.3, gh + 1.3, -gw + 1.5, gh + 1.2, -gw + 1.6, gh + 2.0); s.bezierCurveTo(-gw + 1.7, top - 0.3, -1.6, top, 0, top); s.bezierCurveTo(1.6, top, gw - 1.7, top - 0.3, gw - 1.6, gh + 2.0); s.bezierCurveTo(gw - 1.5, gh + 1.2, gw - 0.3, gh + 1.3, gw, gh); s.lineTo(gw, 0); s.lineTo(-gw, 0);
  const gg = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false, curveSegments: 16 }); uvScale(gg, 0.5, 0.5); b.add(gg, M.brick, hx, 0, hz, 0, -0.9, 0);
  b.add(brickBox(10, 6, 8), M.brick, hx + 4, 3, hz - 5.2, 0, -0.9, 0); b.add(roofGeo(10.2, 4.4, 2.2), M.tile, hx + 4, 6, hz - 5.2, 0, -0.9 + Math.PI / 2, 0);
  b.flush(scene, { cast: false });
}
