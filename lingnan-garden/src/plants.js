// 花木、石头与摆设：木棉、荔枝、大树菠萝、竹、芭蕉、炮仗花、榔榆盆景、荷花、锦鲤、英石壁山、黄蜡石、石桌石鼓、大陶缸。
import * as THREE from 'three';
import * as C from './core.js';
import { Batch, box, cyl, sph, lathe, tube, taperTube, blob, instanced, rng, lerp, pick } from './kit.js';

const GREENS = ['#3f8f2f', '#4fa238', '#5db142', '#377f2b', '#6cbb4a', '#2f7426'];
const DEEP = ['#2f6b2a', '#377a2e', '#2a5f27', '#417f33', '#356f2c'];

// 一片叶子：菱形，中脉略折
function leafCard(len = 0.3, wid = 0.11) {
  const g = new THREE.BufferGeometry(), h = wid / 2;
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -h, -0.03, len * 0.45, 0, 0.02, len, h, -0.03, len * 0.45], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8), 2)); return g;
}
// 分层的叶簇：每一团是几片压扁的叶盘错开叠着，外面再撒一圈朝外垂的叶片，不是一个球
function foliage(parent, M, R, clusters, { palette = GREENS, leaf = 0.3, per = 34, flat = 0.4, seed = 1 } = {}) {
  const pads = [], leaves = [];
  for (const c of clusters) {
    const n = 3 + ((R() * 2) | 0);
    for (let k = 0; k < n; k++) { const a = R() * 6.28, u = R() * c.r * 0.55; pads.push({ x: c.x + Math.cos(a) * u, y: c.y + (k - (n - 1) / 2) * c.r * 0.34 + (R() - 0.5) * 0.1, z: c.z + Math.sin(a) * u, sx: c.r * (0.75 + R() * 0.4), sy: c.r * flat * (0.7 + R() * 0.4), sz: c.r * (0.75 + R() * 0.4), ry: R() * 6, color: pick(R, palette) }); }
    for (let k = 0; k < per; k++) { const a = R() * 6.28, e = (R() - 0.25) * 1.3, rr = c.r * (0.8 + R() * 0.35); leaves.push({ x: c.x + Math.cos(a) * Math.cos(e) * rr, y: c.y + Math.sin(e) * rr * 0.6, z: c.z + Math.sin(a) * Math.cos(e) * rr, ry: -a + Math.PI / 2 + (R() - 0.5) * 0.9, rx: 0.3 + R() * 0.8, rz: (R() - 0.5) * 0.6, s: 0.8 + R() * 0.6, color: pick(R, palette) }); }
  }
  parent.add(instanced(blob(seed, 1, 0.2), M.leaf, pads));
  const lm = instanced(leafCard(leaf, leaf * 0.38), M.leafSmooth, leaves, { receive: false }); parent.add(lm);
  return { pads, leaves };
}

export function buildKapok(scene, M, anim) {
  // 枝干按原来的走向排好，再整体转向、放大，挪到西墙外的窄巷里：从墙头伸进院子上空
  const g = new THREE.Group(), s = 1.45, rot = Math.PI + 0.5, bx = -4.9, bz = 14.9;
  const c = Math.cos(rot), sn = Math.sin(rot), rx = bx * c + bz * sn, rz = -bx * sn + bz * c;
  g.rotation.y = rot; g.scale.setScalar(s); g.position.set(C.KAPOK.x - rx * s, 0, C.KAPOK.z - rz * s); scene.add(g);
  const b = new Batch(), R = rng(41);
  b.add(taperTube([[-4.9, -0.2, 14.9], [-4.7, 2.2, 14.5], [-4.3, 3.8, 13.6], [-3.8, 4.9, 12.6]], 0.5, 0.26, 9), M.bark);
  const branches = [
    [[-4.3, 3.8, 13.6], [-3.6, 4.4, 12.2], [-2.8, 4.9, 11.2], [-2.0, 5.2, 10.4]], [[-3.8, 4.9, 12.6], [-3.3, 5.5, 11.0], [-2.9, 5.8, 9.8], [-2.6, 5.9, 8.6]],
    [[-3.9, 4.6, 12.9], [-5.2, 5.4, 10.8], [-6.0, 6.0, 8.8]], [[-3.6, 4.4, 12.2], [-3.8, 4.1, 11.0], [-3.5, 3.8, 10.0]], [[-2.8, 4.9, 11.2], [-2.3, 4.6, 10.4], [-1.9, 4.3, 9.8]],
    [[-3.0, 5.6, 10.6], [-3.6, 6.6, 8.8], [-3.4, 7.2, 7.2]], [[-4.6, 3.0, 14.2], [-6.4, 4.4, 13.4], [-8.0, 5.2, 12.6]], [[-2.9, 5.8, 9.8], [-3.4, 5.3, 8.4], [-3.6, 5.0, 7.4]],
    [[-4.4, 3.6, 13.8], [-3.2, 5.0, 15.2], [-2.4, 6.0, 16.4]], [[-4.0, 4.7, 12.8], [-5.6, 6.2, 12.0], [-6.6, 7.2, 11.0]],
  ];
  const tips = [];
  for (const br of branches) { b.add(taperTube(br, 0.13, 0.035, 6), M.bark); const cv = new THREE.CatmullRomCurve3(br.map(p => new THREE.Vector3(...p))); for (let i = 0; i < 34; i++) tips.push(cv.getPointAt(0.2 + 0.8 * R())); }
  b.flush(g);
  const petal = sph(1, 6, 5); petal.scale(0.11, 0.035, 0.2); petal.translate(0, 0.03, 0.17);
  const fl = new Batch(); for (let k = 0; k < 5; k++) fl.addM(petal, M.white, new THREE.Matrix4().makeRotationY(k * Math.PI * 0.4).multiply(new THREE.Matrix4().makeRotationX(-0.45)));
  const fg = fl.flush(new THREE.Group())[0].geometry;
  const flowers = tips.map(p => ({ x: p.x + (R() - 0.5) * 0.3, y: p.y + 0.06 + R() * 0.2, z: p.z + (R() - 0.5) * 0.3, rx: (R() - 0.5) * 1.6, ry: R() * 6, rz: (R() - 0.5) * 1.6, s: 0.5 + R() * 0.3, color: pick(R, ['#e3311c', '#f04a22', '#d92518', '#ee3d1e']) }));
  g.add(instanced(fg, M.petal, flowers, { receive: false }));
  g.add(instanced(sph(0.07, 6, 5), M.gold, flowers.map(f => ({ x: f.x, y: f.y + 0.03, z: f.z, s: f.s })), { cast: false, receive: false }));
  // 落花：几片花瓣慢慢飘进院子里
  const fall = Array.from({ length: 9 }, () => ({ x: -11 + R() * 4.5, z: -2 + R() * 5, ph: R() * 10, sp: 0.3 + R() * 0.3 }));
  const fm = instanced(petal, M.petal, fall.map(f => ({ x: f.x, y: 3, z: f.z, color: '#e3311c' })), { cast: false, receive: false }); scene.add(fm);
  const d = new THREE.Object3D();
  anim.push(t => { fall.forEach((f, i) => { const k = ((t * f.sp + f.ph) % 7) / 7; d.position.set(f.x + Math.sin(t * 0.8 + f.ph) * 0.5, 6.4 * (1 - k) + 0.05, f.z + Math.cos(t * 0.6 + f.ph) * 0.4); d.rotation.set(t * 1.3 + f.ph, t + f.ph, 0); d.scale.setScalar(k > 0.97 ? 0.001 : 0.32); d.updateMatrix(); fm.setMatrixAt(i, d.matrix); }); fm.instanceMatrix.needsUpdate = true; });
}

// 荔枝：庭院东南角一棵，深绿的革质叶一层层垂下来，枝头挂着成串的红果
export function buildLychee(scene, M) {
  const b = new Batch(), R = rng(43), { x, z } = C.LYCHEE;
  b.add(taperTube([[x, -0.2, z], [x + 0.12, 1.6, z - 0.05], [x - 0.1, 3.2, z + 0.1], [x + 0.05, 4.6, z]], 0.36, 0.22, 9), M.bark);
  const limbs = [[1.9, -0.9, 5.9], [-1.6, -1.4, 6.0], [0.4, -2.4, 5.6], [2.6, 0.9, 6.0], [-2.2, 0.6, 5.7], [0.2, 1.9, 6.1], [-0.4, -0.2, 7.0], [1.2, 0.4, 6.9], [2.4, -2.2, 5.3], [-1.0, 2.4, 5.6], [3.2, -0.6, 5.2], [-2.6, -2.2, 5.2]];
  const clusters = [], fruit = [];
  for (const [dx, dz, y] of limbs) {
    b.add(taperTube([[x, 4.3, z], [x + dx * 0.45, 4.6 + (y - 4.6) * 0.5, z + dz * 0.45], [x + dx, y - 0.3, z + dz]], 0.16, 0.05, 6), M.bark);
    clusters.push({ x: x + dx, y, z: z + dz, r: 0.95 + R() * 0.3 }); if (R() < 0.5) clusters.push({ x: x + dx * 0.55 + (R() - 0.5), y: y + 0.6, z: z + dz * 0.55 + (R() - 0.5), r: 0.8 + R() * 0.25 });
    for (let k = 0; k < 3; k++) { const a = R() * 6.28, cx = x + dx + Math.cos(a) * 1.0, cz = z + dz + Math.sin(a) * 1.0, cy = y - 0.75 - R() * 0.3; for (let q = 0; q < 7; q++) fruit.push({ x: cx + (R() - 0.5) * 0.2, y: cy - R() * 0.22, z: cz + (R() - 0.5) * 0.2, s: 0.045 + R() * 0.015, color: pick(R, ['#d7261c', '#e2382a', '#c21f18', '#e4543a']) }); }
  }
  b.flush(scene);
  foliage(scene, M, R, clusters, { palette: ['#3f8a34', '#4a9a3c', '#357a2e', '#58a846', '#2f6b2a'], leaf: 0.34, per: 46, flat: 0.36, seed: 45 });
  scene.add(instanced(sph(1, 7, 6), M.petal, fruit, { receive: false }));
}

// 屋后的大树菠萝（波罗蜜）：老树，树干上直接挂果
export function buildJack(scene, M) {
  const b = new Batch(), R = rng(47), { x, z } = C.JACK;
  b.add(taperTube([[x, -0.2, z], [x - 0.1, 1.8, z + 0.05], [x + 0.1, 3.6, z - 0.05], [x, 5.2, z]], 0.42, 0.26, 9), M.barkDark);
  const clusters = [];
  for (let i = 0; i < 9; i++) { const a = i * 0.72 + R() * 0.3, l = 1.6 + R() * 1.8, y = 5.4 + R() * 2.2; b.add(taperTube([[x, 4.6, z], [x + Math.cos(a) * l * 0.5, 5.2, z + Math.sin(a) * l * 0.5], [x + Math.cos(a) * l, y - 0.4, z + Math.sin(a) * l]], 0.17, 0.05, 6), M.barkDark); clusters.push({ x: x + Math.cos(a) * l, y, z: z + Math.sin(a) * l, r: 1.3 + R() * 0.4 }); }
  clusters.push({ x, y: 8.0, z, r: 1.6 });
  for (const [dy, a] of [[1.5, 0.6], [2.1, 2.6], [2.8, 4.4]]) b.add(sph(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: '#9aa63a', roughness: 0.9 }), x + Math.cos(a) * 0.42, dy, z + Math.sin(a) * 0.42, 0, 0, 0, 1, 1.5, 1);
  b.flush(scene);
  foliage(scene, M, R, clusters, { palette: DEEP, leaf: 0.36, per: 30, flat: 0.42, seed: 49 });
}

export function buildBamboo(scene, M) {
  const R = rng(51), culms = [], leaves = [];
  const leaf = new THREE.PlaneGeometry(0.11, 0.62, 1, 2); leaf.translate(0, -0.31, 0); { const p = leaf.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (y < -0.6 ? 0.05 : y < -0.3 ? 1 : 0.5)); } }
  for (const c of C.BAMBOO) {
    const n = 9 + ((R() * 6) | 0);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * c.r, h = 5.2 + R() * 3.4, lx = (R() - 0.5) * 0.16, lz = (R() - 0.5) * 0.16, bx = c.x + Math.cos(a) * r, bz = c.z + Math.sin(a) * r;
      culms.push({ x: bx + lx * h / 2, y: h / 2, z: bz + lz * h / 2, sx: 1, sy: h, sz: 1, rz: -lx, rx: lz, color: pick(R, ['#ffffff', '#e6f0c0', '#d2e6a0']) });
      for (let k = 0; k < 16; k++) { const t = 0.5 + R() * 0.5, y = h * t; leaves.push({ x: bx + lx * y + (R() - 0.5) * 1.1, y: y + (R() - 0.3) * 0.5, z: bz + lz * y + (R() - 0.5) * 1.1, rx: 0.5 + R() * 0.9, ry: R() * 6.28, rz: (R() - 0.5) * 0.8, s: 0.9 + R() * 0.8, color: pick(R, ['#5faa32', '#72bb3c', '#4d962a', '#86c94a']) }); }
    }
  }
  const cg = cyl(0.045, 0.055, 1, 7); cg.attributes.uv.array.forEach((v, k, a) => { if (k % 2 === 1) a[k] = v * 14; });
  scene.add(instanced(cg, M.bamboo, culms));
  scene.add(instanced(leaf, M.leafSmooth, leaves, { receive: false }));
}

export function buildBanana(scene, M, anim) {
  const R = rng(61);
  const leafGeo = (len, wid) => { const g = new THREE.PlaneGeometry(wid, len, 6, 16), p = g.attributes.position; g.translate(0, len / 2, 0); for (let i = 0; i < p.count; i++) { const y = Math.min(1, Math.max(0, p.getY(i) / len)), x = p.getX(i) / (wid / 2); const w = y < 0.12 ? 0.1 : Math.pow(Math.sin(Math.pow((y - 0.12) / 0.88, 0.7) * Math.PI), 0.6) * 0.95 + 0.05; p.setX(i, x * w * wid / 2); p.setZ(i, Math.abs(x) * w * wid * 0.16 + Math.pow(y, 2.2) * len * 0.5 + Math.sin(y * 11 + x * 3) * 0.01); p.setY(i, y * len * (1 - y * 0.2)); } g.computeVertexNormals(); return g; };
  for (const pl of C.BANANA) {
    const g = new THREE.Group(); g.position.set(pl.x, 0, pl.z); scene.add(g); const b = new Batch(), stem = new THREE.MeshStandardMaterial({ color: '#9bb556', roughness: 0.7 }), sheath = new THREE.MeshStandardMaterial({ color: '#7d6a3e', roughness: 0.9 });
    b.add(cyl(0.11, 0.19, 1.9, 10), stem, 0, 0.95, 0); b.add(cyl(0.2, 0.22, 0.35, 10), sheath, 0, 0.17, 0); b.add(cyl(0.165, 0.175, 0.12, 10), sheath, 0, 0.9, 0);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const young = i >= n - 2, len = young ? 1.5 : 2.0 + R() * 0.7, piv = new THREE.Group(), tilt = young ? 0.15 + R() * 0.2 : 0.75 + R() * 0.6; piv.position.set(0, 1.8, 0); piv.rotation.y = i * 6.283 / (n - 2) + R() * 0.4;
      const m = new THREE.Mesh(leafGeo(len, young ? 0.5 : 0.78 + R() * 0.22), new THREE.MeshStandardMaterial({ color: pick(R, ['#5fb23c', '#70c046', '#55a636', '#86cf55']), roughness: 0.55, side: THREE.DoubleSide })); m.rotation.x = tilt; m.castShadow = true; m.receiveShadow = true; piv.add(m); g.add(piv);
      const ph = R() * 6; anim.push(t => { m.rotation.x = tilt + Math.sin(t * 1.1 + ph) * 0.03; m.rotation.z = Math.sin(t * 0.8 + ph) * 0.025; });
    }
    b.flush(g);
  }
}

// 炮仗花：从檐廊西头的柱子爬上去，沿檐口往东垂下一片橙红
export function buildVine(scene, M) {
  const b = new Batch(), R = rng(63), P = C.PAV, x0 = P.cols[0], z0 = P.zFront - 0.2, top = C.DECK_Y + 3.1;
  const stemM = new THREE.MeshStandardMaterial({ color: '#6b5a34', roughness: 1 });
  for (let k = 0; k < 3; k++) { const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = t * 9 + k * 2.1; pts.push([x0 + Math.cos(a) * (0.17 + k * 0.02) - 0.05, 0.1 + t * (top - 0.5), z0 + Math.sin(a) * (0.17 + k * 0.02) + 0.06]); } b.add(tube(pts, 0.022, 5, 60), stemM); }
  for (let k = 0; k < 2; k++) { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([x0 + t * 2.3, top - 0.35 - Math.sin(t * 3.14) * 0.12 + k * 0.1, z0 + 0.16 + Math.sin(t * 7 + k) * 0.06]); } b.add(tube(pts, 0.018, 5, 40), stemM); }
  b.flush(scene);
  const fl = [], lv = [];
  const drop = (cx, cy, cz, n, len) => { for (let i = 0; i < n; i++) { const t = R(); fl.push({ x: cx + (R() - 0.5) * 0.28, y: cy - t * len, z: cz + (R() - 0.5) * 0.24, rx: Math.PI + (R() - 0.5) * 0.7, rz: (R() - 0.5) * 0.7, ry: R() * 6, s: 0.8 + R() * 0.5, color: pick(R, ['#f47a1c', '#ff8f24', '#ee6412', '#ffa53a']) }); } for (let i = 0; i < n * 0.45; i++) lv.push({ x: cx + (R() - 0.5) * 0.4, y: cy - R() * len * 0.9 + 0.05, z: cz + (R() - 0.5) * 0.3, ry: R() * 6, rx: 0.5 + R() * 0.8, s: 0.6 + R() * 0.5, color: pick(R, GREENS) }); };
  for (let i = 0; i < 9; i++) drop(x0 - 0.1 + i * 0.3, top - 0.25 - (i % 3) * 0.05, z0 + 0.2, 26 - i * 2, 1.25 - i * 0.1);
  for (let i = 0; i < 7; i++) drop(x0 - 0.12 + (R() - 0.5) * 0.3, 0.5 + i * 0.42, z0 + 0.18, 9, 0.3);
  const cone = new THREE.ConeGeometry(0.03, 0.13, 5); cone.translate(0, 0.065, 0);
  scene.add(instanced(cone, M.petal, fl, { receive: false })); scene.add(instanced(leafCard(0.2, 0.09), M.leafSmooth, lv, { receive: false }));
}

function pot(b, M, kind, x, y, z) {
  if (kind === 'bluewhite') { b.add(lathe([[0.02, 0], [0.4, 0], [0.5, 0.12], [0.56, 0.36], [0.6, 0.5], [0.66, 0.54], [0.66, 0.6], [0.56, 0.6], [0.54, 0.5]], 22), M.porcelain, x, y, z, 0, 0, 0, 0.72); b.add(cyl(0.39, 0.39, 0.02, 20), M.soil, x, y + 0.375, z); return 0.38; }
  if (kind === 'green') { b.add(lathe([[0.02, 0], [0.3, 0], [0.46, 0.14], [0.5, 0.32], [0.42, 0.46], [0.46, 0.52], [0.4, 0.52], [0.38, 0.44]], 22), M.glazeGreen, x, y, z, 0, 0, 0, 0.8); b.add(cyl(0.31, 0.31, 0.02, 18), M.soil, x, y + 0.36, z); return 0.37; }
  b.add(box(0.8, 0.26, 0.54), M.clay, x, y + 0.16, z); b.add(box(0.86, 0.05, 0.6), M.clay, x, y + 0.31, z); b.add(box(0.72, 0.02, 0.46), M.soil, x, y + 0.335, z); for (const [a, c] of [[-0.3, -0.19], [0.3, -0.19], [-0.3, 0.19], [0.3, 0.19]]) b.add(box(0.1, 0.05, 0.09), M.clay, x + a, y + 0.02, z + c); return 0.34;
}
// 花基（砖砌的长花台）和上面三盆榔榆盆景：枝托修成一片片云片
export function buildBonsai(scene, M) {
  const b = new Batch(), R = rng(71), pads = [], P = C.PLANTER, px = (P.x0 + P.x1) / 2, pz = (P.z0 + P.z1) / 2;
  const bw = box(P.x1 - P.x0, P.h, P.z1 - P.z0); { const p = bw.attributes.position.array, n = bw.attributes.normal.array, uv = bw.attributes.uv.array; for (let i = 0; i < p.length / 3; i++) { const u = Math.abs(n[i * 3]) > 0.5 ? p[i * 3 + 2] : p[i * 3], v = Math.abs(n[i * 3 + 1]) > 0.5 ? p[i * 3 + 2] : p[i * 3 + 1]; uv[i * 2] = u * 0.52; uv[i * 2 + 1] = v * 0.52; } }
  b.add(bw, M.brick, px, P.h / 2, pz); b.add(box(P.x1 - P.x0 + 0.12, 0.1, P.z1 - P.z0 + 0.12), M.graniteLight, px, P.h + 0.05, pz);
  C.BONSAI.forEach((bn, i) => {
    const y0 = P.h + 0.1, top = y0 + pot(b, M, bn.pot, bn.x, y0, bn.z), th = [0.9, 0.74, 0.66][i], lean = i === 1 ? -0.18 : 0.2;
    b.add(taperTube([[bn.x, top - 0.02, bn.z], [bn.x + lean * 0.9, top + th * 0.3, bn.z + 0.06], [bn.x - lean * 0.6, top + th * 0.62, bn.z - 0.05], [bn.x + lean * 0.3, top + th, bn.z]], 0.08, 0.03, 7), M.barkDark);
    // 云片：每个枝托一片扁平的叶盘，越往上越小
    const tiers = [[lean * 2.4, 0.3, 0.12, 0.28], [-lean * 2.0, 0.48, -0.08, 0.25], [lean * 1.5, 0.66, 0.05, 0.22], [-lean * 0.9, 0.84, 0.0, 0.2], [lean * 0.3, 1.04, 0, 0.21]];
    for (const [dx, t, dz, r] of tiers) { b.add(taperTube([[bn.x + (dx > 0 ? lean : -lean) * 0.3, top + th * t - 0.08, bn.z], [bn.x + dx * 0.6, top + th * t - 0.02, bn.z + dz * 0.6], [bn.x + dx, top + th * t, bn.z + dz]], 0.03, 0.012, 5), M.barkDark); for (let k = 0; k < 5; k++) pads.push({ x: bn.x + dx + (R() - 0.5) * r * 1.1, y: top + th * t + 0.04 + (R() - 0.5) * 0.03, z: bn.z + dz + (R() - 0.5) * r * 1.1, sx: r * (0.55 + R() * 0.3), sy: r * 0.2, sz: r * (0.55 + R() * 0.3), ry: R() * 6, color: pick(R, ['#4c9a3a', '#5aa944', '#417f33', '#6ab84e']) }); }
  });
  b.flush(scene);
  scene.add(instanced(blob(73, 1, 0.14), M.leaf, pads));
}

// 英石壁山：贴着北墙和东墙叠上去，石头又瘦又皱、棱角分明，没有圆孔；中间一线跌水落进八角池
export function buildYing(scene, M, T, anim) {
  const R = rng(101), rocks = [], F = C.FALL, wallZ = C.NORTH_JOG.z;
  const tone = () => pick(R, ['#6b6f73', '#7b7f83', '#5c6064', '#8a8d90', '#54585c', '#74787b']);
  for (const k of C.ROCKS) {
    const hMax = 2.4 + R() * 2.2;
    for (let i = 0; i < 9; i++) { const a = R() * 6.28, u = R() * k.r * 0.9, h = hMax * (0.35 + R() * 0.65) * (1 - u / (k.r * 1.6)), w = 0.28 + R() * 0.34; rocks.push({ x: k.x + Math.cos(a) * u, y: h * 0.48, z: k.z + Math.sin(a) * u * 0.8, sx: w, sy: h * 0.56, sz: w * (0.6 + R() * 0.5), ry: R() * 6, rx: (R() - 0.5) * 0.24, rz: (R() - 0.5) * 0.24, color: tone() }); }
    for (let i = 0; i < 5; i++) { const a = R() * 6.28; rocks.push({ x: k.x + Math.cos(a) * k.r * 0.95, y: 0.2, z: k.z + Math.sin(a) * k.r * 0.9, sx: 0.3 + R() * 0.2, sy: 0.3 + R() * 0.3, sz: 0.3 + R() * 0.2, ry: R() * 6, color: tone() }); }
  }
  // 贴墙往上再挂一层薄的：北墙一段、东墙一段
  const eastX = C.BOUNDS.x1 + 0.2;
  for (let i = 0; i < 26; i++) { const x = 11.4 + R() * 4.6, h = 2.2 + R() * 2.0; rocks.push({ x, y: h * 0.5 + R() * 0.8, z: wallZ + 0.1 + R() * 0.3, sx: 0.3 + R() * 0.3, sy: h * 0.42, sz: 0.22 + R() * 0.2, ry: R() * 6, rz: (R() - 0.5) * 0.3, color: tone() }); }
  for (let i = 0; i < 44; i++) { const z = -2.4 + R() * 12.6, h = 2.2 + R() * 2.2; rocks.push({ x: eastX - 0.1 - R() * 0.3, y: h * 0.5 + R() * 0.9, z, sx: 0.22 + R() * 0.2, sy: h * 0.42, sz: 0.3 + R() * 0.3, ry: R() * 6, rx: (R() - 0.5) * 0.3, color: tone() }); }
  // 水口两侧和落水处的几块
  const px = -F.dz, pz = F.dx;
  for (let i = 0; i < 10; i++) { const sd = i % 2 ? 0.55 : -0.55; rocks.push({ x: F.x - F.dx * 0.2 + px * sd + (R() - 0.5) * 0.3, y: 0.4 + i * 0.3, z: F.z - F.dz * 0.2 + pz * sd + (R() - 0.5) * 0.3, sx: 0.3, sy: 0.5 + R() * 0.4, sz: 0.3, ry: R() * 6, color: tone() }); }
  for (let i = 0; i < 7; i++) rocks.push({ x: F.x + F.dx * 1.0 + (R() - 0.5) * 0.6, y: C.WATER_Y + 0.1, z: F.z + (R() - 0.5) * 2.2, sx: 0.3 + R() * 0.25, sy: 0.25 + R() * 0.3, sz: 0.3 + R() * 0.2, ry: R() * 6, color: tone() });
  scene.add(instanced(blob(103, 1, 0.42, 1, false), M.ying, rocks));
  // 跌水：两片交叉的半透明薄片，纹理往下流
  const ft = T.fall.clone(); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(1, 3); ft.needsUpdate = true;
  const fm = new THREE.MeshBasicMaterial({ map: ft, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, color: '#eaf6ff' });
  const h = F.top - C.WATER_Y, pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, u = 0.1 + t * t * 1.5; pts.push(new THREE.Vector3(F.x + F.dx * u, F.top - t * h, F.z + F.dz * u)); }
  for (const w of [0.42, 0.26]) { const g = new THREE.PlaneGeometry(w, 1, 1, 10), p = g.attributes.position, off = w < 0.3 ? 0.06 : 0; for (let i = 0; i <= 10; i++) for (let j = 0; j < 2; j++) { const k = i * 2 + j, sd = j ? w / 2 : -w / 2; p.setXYZ(k, pts[i].x + px * sd + F.dx * off, pts[i].y, pts[i].z + pz * sd + F.dz * off); } g.computeVertexNormals(); scene.add(new THREE.Mesh(g, fm)); }
  const foam = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.position.set(pts[10].x, C.WATER_Y + 0.012, pts[10].z); scene.add(foam);
  anim.push(t => { ft.offset.y = t * 0.9; foam.scale.setScalar(1 + Math.sin(t * 5) * 0.08); });
  // 石缝里的小灌木
  const sh = []; for (let i = 0; i < 22; i++) { const k = pick(R, C.ROCKS); sh.push({ x: k.x + (R() - 0.5) * k.r * 1.6, y: 0.5 + R() * 2.4, z: k.z + (R() - 0.3) * 0.7, s: 0.28 + R() * 0.3, sy: 0.24, ry: R() * 6, color: pick(R, GREENS) }); }
  scene.add(instanced(blob(105, 1, 0.2), M.leaf, sh));
}

// 荷叶、荷花、锦鲤不进水面倒影：它们贴着水面，倒影在手机的低分辨率反射贴图里是一块块锯齿状的暗色重影，转视角时像拖影。
const noMirror = (m) => { m.layers.set(1); return m; };

export function buildLotus(scene, M, anim) {
  const R = rng(121), pads = [], raised = [], stems = [], petals = [], cores = [], buds = [], A = C.RECT;
  const open = (x, z) => Math.hypot(x + 1.2, z - 4.6) < 1.6 || Math.hypot(x - 2.6, z - 2.2) < 1.2 || Math.hypot(x + 4.2, z - 1.6) < 1.0;   // 留两块开阔水面给锦鲤和倒影
  let tries = 0;
  while (pads.length + raised.length < 44 && tries++ < 5000) {
    const x = lerp(A.x0 + 0.7, A.x1 - 0.7, R()), z = lerp(A.z0 + 0.7, A.z1 - 0.7, R()); if (open(x, z)) continue;
    if (R() < 0.42) pads.push({ x, y: C.WATER_Y + 0.015, z, s: 0.3 + R() * 0.32, ry: R() * 6, color: pick(R, ['#5fae3f', '#4f9d37', '#72bd49']) });
    else { const h = 0.16 + R() * 0.42, s = 0.3 + R() * 0.22; raised.push({ x, y: C.WATER_Y + h, z, s, ry: R() * 6, rx: (R() - 0.5) * 0.45, rz: (R() - 0.5) * 0.45, color: pick(R, ['#63b443', '#55a53b', '#79c44f', '#4a9434']), ph: R() * 6 }); stems.push({ x, y: C.WATER_Y + h / 2, z, sx: 1, sy: h, sz: 1 }); }
  }
  for (let i = 0; i < 7; i++) { const a = R() * 6.28, u = 2.1 + R() * 0.8; pads.push({ x: C.OCT.x + Math.cos(a) * u, y: C.WATER_Y + 0.015, z: C.OCT.z + Math.sin(a) * u, s: 0.26 + R() * 0.2, ry: R() * 6, color: '#5fae3f' }); }
  const padG = new THREE.CircleGeometry(1, 20, 0.18, Math.PI * 2 - 0.36); padG.rotateX(-Math.PI / 2);
  scene.add(noMirror(instanced(padG, M.lotusLeaf, pads, { cast: false })));
  const leafG = new THREE.ConeGeometry(1, 0.22, 18, 1, true); leafG.rotateX(Math.PI); leafG.translate(0, 0.11, 0);
  const lm = instanced(leafG, M.lotusLeaf, raised); scene.add(noMirror(lm));
  const d = new THREE.Object3D(); d.rotation.order = 'YXZ';
  anim.push(t => { raised.forEach((l, i) => { d.position.set(l.x, l.y, l.z); d.rotation.set(l.rx + Math.sin(t * 1.2 + l.ph) * 0.05, l.ry, l.rz + Math.cos(t * 0.9 + l.ph) * 0.05); d.scale.setScalar(l.s); d.updateMatrix(); lm.setMatrixAt(i, d.matrix); }); lm.instanceMatrix.needsUpdate = true; });
  const spots = []; tries = 0;
  while (spots.length < 11 && tries++ < 3000) { const x = lerp(A.x0 + 0.8, A.x1 - 0.8, R()), z = lerp(A.z0 + 0.8, A.z1 - 0.8, R()); if (open(x, z) || spots.some(s => Math.hypot(s.x - x, s.z - z) < 1.2)) continue; spots.push({ x, z }); }
  spots.forEach((s, i) => {
    const h = 0.42 + R() * 0.4, y = C.WATER_Y + h; stems.push({ x: s.x, y: C.WATER_Y + h / 2, z: s.z, sx: 1, sy: h, sz: 1 });
    if (i % 5 === 4) { buds.push({ x: s.x, y: y + 0.08, z: s.z, sx: 0.07, sy: 0.15, sz: 0.07, color: '#f783b4' }); return; }
    for (let ring = 0; ring < 3; ring++) { const n = 7 - ring, tilt = 1.15 - ring * 0.42; for (let k = 0; k < n; k++) petals.push({ x: s.x, y, z: s.z, ry: k * 6.283 / n + ring * 0.5, rx: tilt, s: 1 - ring * 0.14, color: ring === 2 ? '#ffd2e3' : pick(R, ['#f9a3c6', '#ff8fbd', '#fbb8d3']) }); }
    cores.push({ x: s.x, y: y + 0.05, z: s.z, s: 0.055, color: '#f2c531' });
  });
  const pg = sph(1, 6, 5); pg.scale(0.07, 0.02, 0.15); pg.translate(0, 0, 0.15); pg.rotateX(-Math.PI / 2);
  scene.add(noMirror(instanced(pg, M.petal, petals, { receive: false })));
  scene.add(noMirror(instanced(sph(1, 8, 6), M.petal, [...cores, ...buds], { receive: false })));
  scene.add(noMirror(instanced(cyl(0.012, 0.016, 1, 5), M.glazeGreen, stems, { cast: false, receive: false })));
}

export function buildKoi(scene, M, anim) {
  const R = rng(131), body = sph(1, 10, 6); body.scale(0.11, 0.04, 0.33);
  const tail = new THREE.ConeGeometry(0.07, 0.16, 4); tail.rotateX(Math.PI / 2); tail.scale(1.4, 0.2, 1.4); tail.translate(0, 0, -0.4);
  const b = new Batch(); b.add(body, M.koi); b.add(tail, M.koi); const geo = b.flush(new THREE.Group())[0].geometry;
  const loops = [{ x: -1.2, z: 4.6, r: 1.1 }, { x: -1.0, z: 4.5, r: 0.6 }, { x: -1.4, z: 4.8, r: 1.35 }, { x: 2.6, z: 2.2, r: 0.8 }, { x: 2.5, z: 2.3, r: 0.45 }, { x: 6.2, z: 2.75, r: 0.45 }, { x: 11.3, z: 7.7, r: 0.4 }, { x: 13.6, z: 5.2, r: 0.45 }];
  const fish = loops.map((l, i) => ({ ...l, sp: (0.35 + R() * 0.3) * (i % 2 ? -1 : 1), ph: R() * 6, s: 0.9 + R() * 0.5 }));
  const mesh = instanced(geo, M.koi, fish.map(f => ({ x: f.x, y: C.WATER_Y - 0.03, z: f.z, color: pick(R, ['#ffffff', '#ffd9c2', '#ffe9a8']) })), { cast: false, receive: false }); scene.add(noMirror(mesh));
  const d = new THREE.Object3D();
  anim.push(t => { fish.forEach((f, i) => { const a = t * f.sp + f.ph, wob = Math.sin(t * 5 + f.ph) * 0.12; d.position.set(f.x + Math.cos(a) * f.r, C.WATER_Y + 0.012, f.z + Math.sin(a) * f.r * 0.8); d.lookAt(f.x + Math.cos(a + 0.2 * Math.sign(f.sp)) * f.r, C.WATER_Y + 0.012, f.z + Math.sin(a + 0.2 * Math.sign(f.sp)) * f.r * 0.8); d.rotateY(wob); d.scale.setScalar(f.s); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); }); mesh.instanceMatrix.needsUpdate = true; });
}

export function buildProps(scene, M) {
  const b = new Batch(), T = C.TABLE;
  // 石桌石鼓
  b.add(cyl(0.72, 0.7, 0.13, 28), M.granite, T.x, 0.78, T.z); b.add(lathe([[0.02, 0], [0.42, 0], [0.44, 0.1], [0.24, 0.2], [0.2, 0.55], [0.3, 0.7], [0.02, 0.72]], 20), M.granite, T.x, 0, T.z);
  for (const [dx, dz] of [[-1.05, 0.6], [1.05, 0.75]]) { b.add(lathe([[0.02, 0], [0.24, 0], [0.3, 0.14], [0.31, 0.3], [0.3, 0.44], [0.24, 0.56], [0.02, 0.56]], 18), M.granite, T.x + dx, 0, T.z + dz); for (const yy of [0.1, 0.47]) b.add(new THREE.TorusGeometry(0.288, 0.016, 5, 22), M.graniteDark, T.x + dx, yy, T.z + dz, Math.PI / 2, 0, 0); }
  // 茶盘、茶壶、两只杯
  b.add(cyl(0.3, 0.3, 0.025, 20), M.clay, T.x + 0.05, 0.86, T.z - 0.05); b.add(sph(0.12, 14, 10), M.teapot, T.x + 0.1, 0.96, T.z - 0.08, 0, 0, 0, 1, 0.8, 1); b.add(sph(0.035, 8, 6), M.teapot, T.x + 0.1, 1.07, T.z - 0.08); b.add(cyl(0.02, 0.03, 0.14, 6), M.teapot, T.x + 0.25, 0.98, T.z - 0.08, 0, 0, -1.0); b.add(new THREE.TorusGeometry(0.06, 0.014, 5, 12), M.teapot, T.x - 0.03, 0.97, T.z - 0.08);
  for (const [dx, dz] of [[-0.12, 0.08], [-0.04, 0.16]]) b.add(cyl(0.04, 0.03, 0.045, 10), M.cup, T.x + dx, 0.895, T.z + dz);
  // 大陶缸
  const J = C.JAR; b.add(lathe([[0.02, 0], [0.42, 0], [0.62, 0.22], [0.72, 0.55], [0.68, 0.86], [0.56, 1.02], [0.6, 1.08], [0.54, 1.08], [0.5, 0.98]], 28), M.glazeBrown, J.x, 0, J.z);
  b.add(cyl(0.52, 0.52, 0.02, 24), new THREE.MeshStandardMaterial({ color: '#2f5d4c', roughness: 0.1 }), J.x, 0.98, J.z);
  b.flush(scene);
  // 黄蜡石：圆润、蜡黄，散放在池角
  const R = rng(141); scene.add(instanced(blob(143, 1, 0.14), M.wax, C.WAX.map(w => ({ x: w.x, y: w.r * 0.52, z: w.z, sx: w.r * 1.15, sy: w.r * 0.8, sz: w.r, ry: R() * 6, color: pick(R, ['#ffffff', '#fff2d8']) }))));
}

// 墙外的树顶，让墙头后面不空；屋后墙脚几丛矮灌木
export function buildOutside(scene, M) {
  const out = [], R = rng(95);
  for (let i = 0; i < 110; i++) { const a = i / 110 * 6.28 + R() * 0.05, r = 24 + R() * 16, x = 1 + Math.cos(a) * r * 1.15, z = 3 + Math.sin(a) * r; if (Math.hypot(x - 12.5, z + 17.5) < 5 || Math.hypot(x - 29, z + 17) < 9) continue; out.push({ x, y: 2.8 + R() * 2.6, z, s: 3.0 + R() * 2.2, sy: 2.4 + R() * 1.6, ry: R() * 6, color: pick(R, ['#4c9a2e', '#3f8627', '#5aa935', '#2f7426', '#6bb83f']) }); }
  scene.add(instanced(blob(97, 1, 0.2, 1, true, 1), M.leaf, out, { cast: false }));
  const sh = []; for (let i = 0; i < 22; i++) { const x = lerp(-8.6, 3.6, R()); sh.push({ x, y: 0.3, z: C.BOUNDS.z0 + 0.25 + R() * 0.4, s: 0.45 + R() * 0.35, sy: 0.4, ry: R() * 6, color: pick(R, GREENS) }); }
  scene.add(instanced(blob(85, 1, 0.2), M.leaf, sh));
}
