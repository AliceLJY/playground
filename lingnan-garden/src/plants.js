// 花木、湖石与摆设：木棉、大榕树、竹、芭蕉、盆景、花丛、草、荷花、锦鲤、假山、石桌石鼓、大陶缸。
import * as THREE from 'three';
import * as C from './core.js';
import { Batch, box, cyl, sph, lathe, tube, taperTube, blob, instanced, rng, lerp, pick } from './kit.js';
import { buildHexPavilion } from './architecture.js';

const GREENS = ['#3f8f2f', '#4fa238', '#5db142', '#377f2b', '#6cbb4a', '#2f7426'];
const CANOPY = ['#4c9a2e', '#5aa935', '#6bb83f', '#3f8627', '#7cc448', '#356f22'];

function canopy(parent, M, R, cx, cy, cz, rx, ry, rz, n, s0, s1, colors = CANOPY, seed = 1) {
  const items = [];
  for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, u = Math.pow(R(), 0.45), e = (R() - 0.35) * 1.1; items.push({ x: cx + Math.cos(a) * u * rx, y: cy + e * ry, z: cz + Math.sin(a) * u * rz, s: lerp(s0, s1, R()), sy: lerp(s0, s1, R()) * 0.78, ry: R() * 6, color: pick(R, colors) }); }
  parent.add(instanced(blob(seed, 1, 0.16), M.leaf, items)); return items;
}

export function buildBanyan(scene, M) {
  const b = new Batch(), R = rng(31), { x, z } = C.BANYAN;
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + R(), r = 0.55 + R() * 0.5; b.add(taperTube([[x + Math.cos(a) * r * 1.5, -0.2, z + Math.sin(a) * r * 1.5], [x + Math.cos(a + 0.3) * r, 1.6, z + Math.sin(a + 0.3) * r], [x + Math.cos(a + 0.8) * r * 0.6, 3.6, z + Math.sin(a + 0.8) * r * 0.6], [x + Math.cos(a + 1.2) * r * 0.9, 5.6, z + Math.sin(a + 1.2) * r * 0.9]], 0.62, 0.34, 7), i % 2 ? M.bark : M.barkDark); }
  for (let i = 0; i < 9; i++) { const a = i * 0.7 + R() * 0.4, l = 4 + R() * 4.5; b.add(taperTube([[x, 4.6, z], [x + Math.cos(a) * l * 0.4, 6.2, z + Math.sin(a) * l * 0.4], [x + Math.cos(a) * l * 0.8, 7.2 + R(), z + Math.sin(a) * l * 0.8], [x + Math.cos(a) * l, 7.9 + R(), z + Math.sin(a) * l]], 0.36, 0.1, 6), M.bark); }
  for (let i = 0; i < 9; i++) { const a = R() * 6.28, r = 1.5 + R() * 1.3; b.add(taperTube([[x + Math.cos(a) * 0.7, 0.9, z + Math.sin(a) * 0.7], [x + Math.cos(a) * r * 0.7, 0.25, z + Math.sin(a) * r * 0.7], [x + Math.cos(a) * r, -0.1, z + Math.sin(a) * r]], 0.26, 0.08, 6), M.barkDark); }
  // 气根
  const roots = []; for (let i = 0; i < 46; i++) { const a = R() * 6.28, r = 1.6 + R() * 5.4, len = 2.2 + R() * 4.2; roots.push({ x: x + Math.cos(a) * r, y: 7.0 - len / 2, z: z + Math.sin(a) * r, sx: 1, sy: len, sz: 1, rz: (R() - 0.5) * 0.06 }); }
  scene.add(instanced(cyl(0.022, 0.03, 1, 5), M.bark, roots, { receive: false }));
  b.flush(scene);
  canopy(scene, M, R, x, 9.4, z, 8.6, 3.0, 7.4, 120, 1.3, 2.5, CANOPY, 33);
}

export function buildKapok(scene, M, anim) {
  const b = new Batch(), R = rng(41), { x, z } = C.KAPOK;
  b.add(taperTube([[-4.9, -0.2, 14.9], [-4.7, 2.2, 14.5], [-4.3, 3.8, 13.6], [-3.8, 4.9, 12.6]], 0.5, 0.26, 9), M.bark);
  const branches = [
    [[-4.3, 3.8, 13.6], [-3.6, 4.4, 12.2], [-2.8, 4.9, 11.2], [-2.0, 5.2, 10.4]],
    [[-3.8, 4.9, 12.6], [-3.3, 5.5, 11.0], [-2.9, 5.8, 9.8], [-2.6, 5.9, 8.6]],
    [[-3.9, 4.6, 12.9], [-5.2, 5.4, 10.8], [-6.0, 6.0, 8.8]],
    [[-3.6, 4.4, 12.2], [-3.8, 4.1, 11.0], [-3.5, 3.8, 10.0]],
    [[-2.8, 4.9, 11.2], [-2.3, 4.6, 10.4], [-1.9, 4.3, 9.8]],
    [[-3.0, 5.6, 10.6], [-3.6, 6.6, 8.8], [-3.4, 7.2, 7.2]],
    [[-4.6, 3.0, 14.2], [-6.4, 4.4, 13.4], [-8.0, 5.2, 12.6]],
    [[-2.9, 5.8, 9.8], [-3.4, 5.3, 8.4], [-3.6, 5.0, 7.4]],
  ];
  const tips = [];
  for (const br of branches) { b.add(taperTube(br, 0.13, 0.035, 6), M.bark); const cv = new THREE.CatmullRomCurve3(br.map(p => new THREE.Vector3(...p))); for (let i = 0; i < 22; i++) { const p = cv.getPointAt(0.25 + 0.75 * R()); tips.push(p); } }
  b.flush(scene);
  // 木棉花：五瓣厚花瓣 + 黄蕊
  const petal = sph(1, 6, 5); petal.scale(0.11, 0.035, 0.2); petal.translate(0, 0.03, 0.17);
  const fl = new Batch(); for (let k = 0; k < 5; k++) { const m = new THREE.Matrix4().makeRotationY(k * Math.PI * 0.4).multiply(new THREE.Matrix4().makeRotationX(-0.45)); fl.addM(petal, M.white, m); }
  const fg = fl.flush(new THREE.Group())[0].geometry;
  const flowers = tips.map(p => ({ x: p.x + (R() - 0.5) * 0.3, y: p.y + 0.06 + R() * 0.2, z: p.z + (R() - 0.5) * 0.3, rx: (R() - 0.5) * 1.6, ry: R() * 6, rz: (R() - 0.5) * 1.6, s: 0.5 + R() * 0.3, color: pick(R, ['#e3311c', '#f04a22', '#d92518', '#ee3d1e']) }));
  scene.add(instanced(fg, M.petal, flowers, { receive: false }));
  scene.add(instanced(sph(0.07, 6, 5), M.gold, flowers.map(f => ({ x: f.x, y: f.y + 0.03, z: f.z, s: f.s })), { cast: false, receive: false }));
  void x; void z;
  // 落花：几片花瓣慢慢飘下来
  const fall = Array.from({ length: 10 }, () => ({ x: -4 + R() * 4.6, z: 8 + R() * 5, ph: R() * 10, sp: 0.35 + R() * 0.3 }));
  const fm = instanced(petal, M.petal, fall.map(f => ({ x: f.x, y: 3, z: f.z, color: '#e3311c' })), { cast: false, receive: false }); scene.add(fm);
  const d = new THREE.Object3D();
  anim.push(t => { fall.forEach((f, i) => { const k = ((t * f.sp + f.ph) % 7) / 7; d.position.set(f.x + Math.sin(t * 0.8 + f.ph) * 0.5, 4.6 * (1 - k) + 0.05, f.z + Math.cos(t * 0.6 + f.ph) * 0.4); d.rotation.set(t * 1.3 + f.ph, t + f.ph, 0); d.scale.setScalar(k > 0.97 ? 0.001 : 0.45); d.updateMatrix(); fm.setMatrixAt(i, d.matrix); }); fm.instanceMatrix.needsUpdate = true; });
}

export function buildBamboo(scene, M, anim, extra = []) {
  const R = rng(51), culms = [], leaves = [];
  const leaf = new THREE.PlaneGeometry(0.11, 0.62, 1, 2); leaf.translate(0, -0.31, 0); { const p = leaf.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (y < -0.6 ? 0.05 : y < -0.3 ? 1 : 0.5)); } }
  for (const c of [...C.BAMBOO, ...extra]) {
    const n = 9 + ((R() * 6) | 0);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * c.r, h = 5.2 + R() * 3.4, lx = (R() - 0.5) * 0.16, lz = (R() - 0.5) * 0.16, bx = c.x + Math.cos(a) * r, bz = c.z + Math.sin(a) * r;
      culms.push({ x: bx + lx * h / 2, y: h / 2, z: bz + lz * h / 2, sx: 1, sy: h, sz: 1, rz: -lx, rx: lz, color: pick(R, ['#ffffff', '#e6f0c0', '#d2e6a0']) });
      for (let k = 0; k < 16; k++) { const t = 0.5 + R() * 0.5, y = h * t; leaves.push({ x: bx + lx * y + (R() - 0.5) * 1.1, y: y + (R() - 0.3) * 0.5, z: bz + lz * y + (R() - 0.5) * 1.1, rx: 0.5 + R() * 0.9, ry: R() * 6.28, rz: (R() - 0.5) * 0.8, s: 0.9 + R() * 0.8, color: pick(R, ['#5faa32', '#72bb3c', '#4d962a', '#86c94a']) }); }
    }
  }
  const cg = cyl(0.045, 0.055, 1, 7); cg.attributes.uv.array.forEach((v, k, a) => { if (k % 2 === 1) a[k] = v * 14; });
  scene.add(instanced(cg, M.bamboo, culms));
  const lm = instanced(leaf, M.leafSmooth, leaves, { receive: false }); scene.add(lm);
}

export function buildBanana(scene, M, anim) {
  const R = rng(61);
  // 叶片：叶柄先往上再往外拱，叶面两边略向下折，叶尖垂下去
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

function pot(b, M, kind, x, y, z) {
  if (kind === 'bluewhite') { b.add(lathe([[0.02, 0], [0.4, 0], [0.5, 0.12], [0.56, 0.36], [0.6, 0.5], [0.66, 0.54], [0.66, 0.6], [0.56, 0.6], [0.54, 0.5]], 22), M.porcelain, x, y, z); b.add(cyl(0.54, 0.54, 0.02, 20), M.soil, x, y + 0.52, z); for (let i = 0; i < 3; i++) b.add(box(0.12, 0.07, 0.12), M.white, x + Math.cos(i * 2.09) * 0.36, y - 0.02, z + Math.sin(i * 2.09) * 0.36); return 0.53; }
  if (kind === 'green') { b.add(lathe([[0.02, 0], [0.3, 0], [0.46, 0.14], [0.5, 0.32], [0.42, 0.46], [0.46, 0.52], [0.4, 0.52], [0.38, 0.44]], 22), M.glazeGreen, x, y, z); b.add(cyl(0.39, 0.39, 0.02, 18), M.soil, x, y + 0.45, z); return 0.46; }
  b.add(box(0.95, 0.3, 0.62), M.clay, x, y + 0.19, z); b.add(box(1.02, 0.06, 0.7), M.clay, x, y + 0.36, z); b.add(box(0.86, 0.02, 0.54), M.soil, x, y + 0.385, z); for (const [a, c] of [[-0.36, -0.22], [0.36, -0.22], [-0.36, 0.22], [0.36, 0.22]]) b.add(box(0.12, 0.06, 0.1), M.clay, x + a, y + 0.02, z + c); return 0.39;
}
export function buildBonsai(scene, M) {
  const b = new Batch(), R = rng(71), pads = [], blooms = [];
  C.BONSAI.forEach((bn, i) => {
    const [w, h, d] = bn.block, g = box(w, h, d, 2, 2, 2);
    b.add(g, M.granite, bn.x, h / 2, bn.z, 0, 0.2 + i * 0.5, 0);
    if (i === 0) b.add(box(1.0, 0.36, 0.9), M.granite, bn.x + 1.25, 0.18, bn.z + 0.5, 0, 0.5, 0);
    const y0 = h, top = y0 + pot(b, M, bn.pot, bn.x, y0, bn.z);
    const lean = i === 1 ? -0.25 : 0.3, th = i === 0 ? 1.15 : 0.85;
    b.add(taperTube([[bn.x, top - 0.02, bn.z], [bn.x + lean * 0.9, top + th * 0.35, bn.z + 0.08], [bn.x - lean * 0.5, top + th * 0.7, bn.z - 0.06], [bn.x + lean * 0.5, top + th, bn.z]], 0.085, 0.035, 7), M.barkDark);
    b.add(taperTube([[bn.x + lean * 0.5, top + th * 0.45, bn.z], [bn.x + lean * 1.8, top + th * 0.55, bn.z + 0.1], [bn.x + lean * 2.6, top + th * 0.5, bn.z + 0.15]], 0.045, 0.02, 6), M.barkDark);
    const centers = [[lean * 0.5, th + 0.12, 0, 0.5], [lean * 2.7, th * 0.55, 0.15, 0.36], [-lean * 1.3, th * 0.78, -0.1, 0.34], [lean * 0.2, th * 0.72, 0.3, 0.3], [-lean * 0.2, th + 0.02, -0.28, 0.3]];
    for (const [dx, dy, dz, s] of centers) for (let k = 0; k < 4; k++) { const it = { x: bn.x + dx + (R() - 0.5) * s, y: top + dy + (R() - 0.5) * 0.08, z: bn.z + dz + (R() - 0.5) * s, s: s * (0.7 + R() * 0.4), sy: s * 0.66, ry: R() * 6, color: i === 1 ? pick(R, ['#4f9a38', '#5caa40']) : pick(R, ['#45903a', '#55a242', '#62b04a']) }; pads.push(it); if (i === 1) for (let q = 0; q < 7; q++) blooms.push({ x: it.x + (R() - 0.5) * it.s * 1.7, y: it.y + it.sy * 0.8, z: it.z + (R() - 0.5) * it.s * 1.7, s: 0.03 + R() * 0.02, color: pick(R, ['#f25a9a', '#ff7fb5', '#e8438a']) }); }
  });
  b.flush(scene);
  scene.add(instanced(blob(73, 1, 0.16), M.leaf, pads));
  scene.add(instanced(sph(1, 6, 5), M.petal, blooms, { receive: false }));
}

// 花丛与草：返回的 keepOut 交给铺地时避让
export function buildFlowers(scene, M, anim, isPaved) {
  const R = rng(81), heads = [], stems = [], leaves = [], tufts = [];
  const beds = [
    { x: -3.5, z: 14.3, rx: 2.3, rz: 1.3, n: 260, colors: ['#ff6fa5', '#f7c531', '#ffffff', '#ff8fbc', '#ffd84a'] },
    { x: -5.6, z: 12.6, rx: 1.3, rz: 1.5, n: 70, colors: ['#f7c531', '#ffffff', '#ffd84a', '#ff6fa5'] },
    { x: 7.0, z: 16.2, rx: 1.7, rz: 1.5, n: 150, colors: ['#ff6fa5', '#ff8fbc', '#ffffff'] }, { x: 11.5, z: 17.5, rx: 2.4, rz: 1.6, n: 120, colors: ['#f7c531', '#ffffff', '#ff8fbc'] }, { x: -9.5, z: 17.8, rx: 3.0, rz: 1.6, n: 130, colors: ['#ffffff', '#ff6fa5', '#b98cf0'] },
    { x: 9.0, z: 12.4, rx: 1.0, rz: 1.1, n: 60, colors: ['#ff6fa5', '#ff9cc4'] },
    { x: -10.2, z: 13.6, rx: 3.0, rz: 1.6, n: 120, colors: ['#ffffff', '#f7c531', '#ff8fbc'] },
    { x: 13.9, z: 12.2, rx: 1.0, rz: 1.6, n: 46, colors: ['#ff6fa5', '#f7c531'] },
    { x: -2.0, z: -4.0, rx: 3.0, rz: 0.7, n: 70, colors: ['#ff6fa5', '#ffffff', '#b98cf0'] },
    { x: -12.0, z: 3.0, rx: 2.6, rz: 0.9, n: 80, colors: ['#ffffff', '#ff8fbc', '#f7c531'] },
    { x: 6.0, z: -2.6, rx: 1.6, rz: 0.7, n: 50, colors: ['#ff6fa5', '#f7c531'] },
    { x: 13.4, z: 9.6, rx: 0.9, rz: 1.4, n: 40, colors: ['#ffffff', '#ff6fa5'] },
  ];
  for (const bed of beds) for (let i = 0; i < bed.n; i++) {
    const a = R() * 6.28, u = Math.sqrt(R()), x = bed.x + Math.cos(a) * u * bed.rx, z = bed.z + Math.sin(a) * u * bed.rz;
    if (isPaved(x, z) || C.inPond(x, z) || C.blockedBy(x, z) === 'wall') continue;
    const h = 0.22 + R() * 0.3, s = 0.075 + R() * 0.05;
    heads.push({ x, y: h, z, rx: (R() - 0.5) * 0.7, ry: R() * 6, rz: (R() - 0.5) * 0.7, s, color: pick(R, bed.colors) });
    stems.push({ x, y: h / 2, z, sx: 1, sy: h, sz: 1 });
    if (i % 2 === 0) leaves.push({ x: x + (R() - 0.5) * 0.2, y: 0.1, z: z + (R() - 0.5) * 0.2, s: 0.16 + R() * 0.12, sy: 0.12, ry: R() * 6, color: pick(R, GREENS) });
  }
  // 花头：五片圆瓣 + 花心
  const fb = new Batch(), pg = new THREE.CircleGeometry(0.62, 7); pg.rotateX(-Math.PI / 2);
  for (let k = 0; k < 5; k++) fb.addM(pg, M.white, new THREE.Matrix4().makeRotationY(k * 1.2566).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.72)).multiply(new THREE.Matrix4().makeRotationX(0.25)));
  const head = fb.flush(new THREE.Group())[0].geometry;
  scene.add(instanced(head, M.petal, heads, { cast: false, receive: false }));
  scene.add(instanced(sph(0.42, 6, 5), M.gold, heads.map(h => ({ x: h.x, y: h.y + 0.01, z: h.z, s: h.s })), { cast: false, receive: false }));
  scene.add(instanced(cyl(0.008, 0.01, 1, 4), M.glazeGreen, stems, { cast: false, receive: false }));
  scene.add(instanced(blob(83, 0, 0.2, 1, false), M.leaf, leaves, { cast: false }));
  // 草：贴着石板缝和草地随机长
  const blade = new THREE.BufferGeometry(); { const p = []; for (let k = 0; k < 3; k++) { const a = k * 2.1, c = Math.cos(a), s = Math.sin(a); p.push(-0.018 * c, 0, -0.018 * s, 0.018 * c, 0, 0.018 * s, 0.04 * s, 0.13, 0.04 * c); } blade.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); blade.computeVertexNormals(); }
  for (let i = 0; i < 5200; i++) { const x = lerp(C.BOUNDS.x0, C.BOUNDS.x1, R()), z = lerp(C.BOUNDS.z0, C.BOUNDS.z1, R()); if (isPaved(x, z) || C.inPond(x, z) || C.groundY(x, z) > 0.01 || C.blockedBy(x, z) === 'wall') continue; tufts.push({ x, y: 0, z, ry: R() * 6, s: 0.7 + R() * 1.0, color: pick(R, ['#5c9c40', '#69a94a', '#528f38', '#76b556']) }); }
  const gm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide });
  scene.add(instanced(blade, gm, tufts, { cast: false }));
  // 矮灌木沿墙脚
  const shrubs = [];
  for (let i = 0; i < 70; i++) { const side = i % 4, t = R(); let x, z; if (side === 0) { x = C.BOUNDS.x0 + 0.3 + R() * 0.6; z = lerp(2.5, 15.5, t); } else if (side === 1) { x = lerp(-15, 15, t); z = C.BOUNDS.z1 - 0.2 - R() * 0.5; if (Math.abs(x) < 2.2) continue; } else if (side === 2) { x = C.BOUNDS.x1 - 0.3 - R() * 0.5; z = lerp(-15, 15.5, t); } else { x = lerp(-15, 15, t); z = C.BOUNDS.z0 + 0.3 + R() * 0.8; } shrubs.push({ x, y: 0.35, z, s: 0.6 + R() * 0.5, sy: 0.5 + R() * 0.3, ry: R() * 6, color: pick(R, GREENS) }); }
  for (const [x, z, s] of [[-5.5, 5.2, 0.7], [-5.9, 6.4, 0.55], [3.0, 10.75, 0.4], [8.7, 10.3, 0.5], [10.9, 8.6, 0.6], [6.4, -1.9, 0.6], [4.4, -1.5, 0.5], [-0.6, -1.4, 0.7], [2.2, -1.7, 0.6], [-7.2, 2.2, 0.6], [-11.6, 2.0, 0.7], [-14.6, 2.2, 0.7], [11.5, 2.2, 0.5], [11.4, 6.2, 0.5], [10.8, -1.2, 0.6]]) shrubs.push({ x, y: s * 0.55, z, s, sy: s * 0.8, ry: R() * 6, color: pick(R, GREENS) });
  scene.add(instanced(blob(85, 1, 0.2), M.leaf, shrubs));
}

export function buildSmallTrees(scene, M) {
  const b = new Batch(), R = rng(91);
  const spots = [[10.6, 18.8, 3.8], [-10.4, 18.4, 4.2], [-1.0, -6.5, 4.2], [-4.8, -9.0, 5.0], [1.6, -13.6, 5.5], [-12.6, 6.4, 3.6], [-13.4, 12.6, 4.4], [12.6, 13.8, 3.8]];
  for (const [x, z, h] of spots) {
    b.add(taperTube([[x, -0.1, z], [x + 0.15, h * 0.35, z - 0.1], [x - 0.1, h * 0.62, z + 0.1]], 0.2, 0.1, 7), M.bark);
    canopy(scene, M, R, x, h * 0.82, z, h * 0.42, h * 0.26, h * 0.42, 14, h * 0.2, h * 0.32, CANOPY, 93 + x);
  }
  b.flush(scene);
  // 墙外的树顶，一圈，让墙头后面不空
  const out = []; const R2 = rng(95);
  for (let i = 0; i < 90; i++) { const a = i / 90 * 6.28 + R2() * 0.05, r = 26 + R2() * 14, x = Math.cos(a) * r * 1.05, z = Math.sin(a) * r; if (z > 19 && Math.abs(x) < 6) continue; out.push({ x, y: 2.6 + R2() * 2.2, z, s: 3.0 + R2() * 2.0, sy: 2.4 + R2() * 1.6, ry: R2() * 6, color: pick(R2, ['#4c9a2e', '#3f8627', '#5aa935', '#2f7426', '#6bb83f']) }); }
  scene.add(instanced(blob(97, 1, 0.2, 1, true, 1), M.leaf, out, { cast: false }));
}

export function buildRockery(scene, M) {
  const R = rng(101), { x, z, r } = C.ROCKERY, rocks = [], holes = [];
  for (let i = 0; i < 64; i++) { const a = R() * 6.28, u = Math.pow(R(), 0.7) * r * 0.95, lvl = 1 - u / (r * 0.95), y = R() * lvl * 4.4; const s = 0.7 + R() * 0.9; rocks.push({ x: x + Math.cos(a) * u, y: y + 0.3, z: z + Math.sin(a) * u, sx: s, sy: s * (1.0 + R() * 0.8), sz: s * (0.8 + R() * 0.4), ry: R() * 6, rx: (R() - 0.5) * 0.4, color: pick(R, ['#d8d4c8', '#c6c1b4', '#e2ded2', '#b9b4a6']) }); if (i % 2 === 0) holes.push({ x: x + Math.cos(a) * (u + s * 0.55), y: y + 0.5 + R() * 0.5, z: z + Math.sin(a) * (u + s * 0.55) + 0.2, s: 0.22 + R() * 0.2, sy: 0.3 + R() * 0.3, color: '#6f6b62' }); }
  // 曲廊落脚的石矶：水里一圈湖石
  for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283 + R() * 0.3, rr = C.ISLET.r + 0.6 + R() * 0.4, s = 0.28 + R() * 0.25; rocks.push({ x: C.ISLET.x + Math.cos(a) * rr, y: C.WATER_Y + 0.15 + R() * 0.3, z: C.ISLET.z + Math.sin(a) * rr, sx: s, sy: s * (0.9 + R() * 0.7), sz: s * 0.9, ry: R() * 6, color: pick(R, ['#d8d4c8', '#c6c1b4', '#e2ded2']) }); }
  scene.add(instanced(blob(103, 1, 0.3, 1, false), M.taihu, rocks));
  scene.add(instanced(sph(1, 6, 5), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), holes, { cast: false, receive: false }));
  buildHexPavilion(scene, M, x, 4.35, z, 1.0);
  // 山石间的灌木与小花
  const sh = [], fl = []; for (let i = 0; i < 26; i++) { const a = R() * 6.28, u = R() * r * 0.9, y = (1 - u / r) * 3.6 + 0.8; sh.push({ x: x + Math.cos(a) * u, y, z: z + Math.sin(a) * u, s: 0.45 + R() * 0.5, sy: 0.4, ry: R() * 6, color: pick(R, GREENS) }); if (i % 3 === 0) for (let q = 0; q < 6; q++) fl.push({ x: x + Math.cos(a) * u + (R() - 0.5) * 0.7, y: y + 0.3, z: z + Math.sin(a) * u + (R() - 0.5) * 0.7, s: 0.08, color: pick(R, ['#ff6fa5', '#ff9cc4']) }); }
  scene.add(instanced(blob(105, 1, 0.2), M.leaf, sh)); scene.add(instanced(sph(1, 6, 5), M.petal, fl, { cast: false, receive: false }));
}

export function buildPondEdge(scene, M, outline) {
  const R = rng(111), rocks = [];
  for (const rk of C.POND_ROCKS) rocks.push({ x: rk.x, y: rk.r * 0.32, z: rk.z, sx: rk.r, sy: rk.r * 0.62, sz: rk.r * 0.85, ry: R() * 6, color: pick(R, ['#e6e2d8', '#d6d2c8', '#f0ece2']) });
  // 沿岸一圈压岸石（水榭底下那段不放）
  for (let i = 0; i < outline.length; i += 2) { const p = outline[i], l = C.worldToPav(p.x, p.z); if (Math.abs(l.x) < C.PAV.halfL + 0.3 && l.z < C.PAV.zFront + 0.2) continue; const s = 0.2 + R() * 0.22; rocks.push({ x: p.x + (R() - 0.5) * 0.15, y: 0.02, z: p.z + (R() - 0.5) * 0.15, sx: s * 1.3, sy: s * 0.7, sz: s, ry: R() * 6, color: pick(R, ['#e6e2d8', '#d6d2c8', '#f0ece2', '#c4c0b6']) }); }
  scene.add(instanced(blob(113, 1, 0.24, 1, false), M.rock, rocks));
}

export function buildLotus(scene, M, anim) {
  const R = rng(121), pads = [], raised = [], stems = [], petals = [], cores = [], buds = [];
  const clear = (x, z, m) => { for (let k = 0; k < 8; k++) if (!C.inPond(x + Math.cos(k * 0.785) * m, z + Math.sin(k * 0.785) * m)) return false; if (C.groundY(x, z) > 0) return false; const l = C.worldToPav(x, z); if (Math.abs(l.x) < C.PAV.halfL + 0.4 && l.z < C.PAV.zFront + 0.5) return false; return true; };
  let tries = 0;
  while (pads.length + raised.length < 50 && tries++ < 5000) {
    const x = lerp(-3.4, 11, R()), z = lerp(-1.2, 10.3, R()); if (!clear(x, z, 0.55)) continue;
    // 留出几块开阔水面给锦鲤和倒影
    if (Math.hypot(x - 1.6, z - 7.4) < 2.3 || Math.hypot(x - 8.6, z - 6.6) < 1.2 || Math.hypot(x - C.ISLET.x, z - C.ISLET.z) < C.ISLET.r + 1.3) continue;
    if (R() < 0.42) pads.push({ x, y: C.WATER_Y + 0.015, z, s: 0.3 + R() * 0.32, ry: R() * 6, color: pick(R, ['#5fae3f', '#4f9d37', '#72bd49']) });
    else { const h = 0.18 + R() * 0.55, s = 0.36 + R() * 0.3; raised.push({ x, y: C.WATER_Y + h, z, s, ry: R() * 6, rx: (R() - 0.5) * 0.45, rz: (R() - 0.5) * 0.45, color: pick(R, ['#63b443', '#55a53b', '#79c44f', '#4a9434']), ph: R() * 6 }); stems.push({ x, y: C.WATER_Y + h / 2, z, sx: 1, sy: h, sz: 1 }); }
  }
  const padG = new THREE.CircleGeometry(1, 20, 0.18, Math.PI * 2 - 0.36); padG.rotateX(-Math.PI / 2);
  scene.add(instanced(padG, M.lotusLeaf, pads, { cast: false }));
  const leafG = new THREE.ConeGeometry(1, 0.22, 18, 1, true); leafG.rotateX(Math.PI); leafG.translate(0, 0.11, 0);
  const lm = instanced(leafG, M.lotusLeaf, raised); scene.add(lm);
  const d = new THREE.Object3D(); d.rotation.order = 'YXZ';
  anim.push(t => { raised.forEach((l, i) => { d.position.set(l.x, l.y, l.z); d.rotation.set(l.rx + Math.sin(t * 1.2 + l.ph) * 0.05, l.ry, l.rz + Math.cos(t * 0.9 + l.ph) * 0.05); d.scale.setScalar(l.s); d.updateMatrix(); lm.setMatrixAt(i, d.matrix); }); lm.instanceMatrix.needsUpdate = true; });
  // 荷花
  const spots = []; tries = 0;
  while (spots.length < 12 && tries++ < 3000) { const x = lerp(-3.2, 10.8, R()), z = lerp(-1, 10.1, R()); if (!clear(x, z, 0.5) || Math.hypot(x - 1.6, z - 7.4) < 1.9 || spots.some(s => Math.hypot(s.x - x, s.z - z) < 1.0)) continue; spots.push({ x, z }); }
  spots.forEach((s, i) => {
    const h = 0.42 + R() * 0.4, y = C.WATER_Y + h; stems.push({ x: s.x, y: C.WATER_Y + h / 2, z: s.z, sx: 1, sy: h, sz: 1 });
    if (i % 5 === 4) { buds.push({ x: s.x, y: y + 0.08, z: s.z, sx: 0.07, sy: 0.15, sz: 0.07, color: '#f783b4' }); return; }
    for (let ring = 0; ring < 3; ring++) { const n = 7 - ring, tilt = 1.15 - ring * 0.42; for (let k = 0; k < n; k++) petals.push({ x: s.x, y, z: s.z, ry: k * 6.283 / n + ring * 0.5, rx: tilt, s: 1 - ring * 0.14, color: ring === 2 ? '#ffd2e3' : pick(R, ['#f9a3c6', '#ff8fbd', '#fbb8d3']) }); }
    cores.push({ x: s.x, y: y + 0.05, z: s.z, s: 0.055, color: '#f2c531' });
  });
  const pg = sph(1, 6, 5); pg.scale(0.07, 0.02, 0.15); pg.translate(0, 0, 0.15); pg.rotateX(-Math.PI / 2);
  const pm = new THREE.Matrix4();
  // 花瓣几何是竖着的一片，rx 让它向外倒
  scene.add(instanced(pg, M.petal, petals, { receive: false }));
  scene.add(instanced(sph(1, 8, 6), M.petal, [...cores, ...buds], { receive: false }));
  scene.add(instanced(cyl(0.012, 0.016, 1, 5), M.glazeGreen, stems, { cast: false, receive: false }));
  void pm;
}

export function buildKoi(scene, M, anim) {
  const R = rng(131), body = sph(1, 10, 6); body.scale(0.11, 0.04, 0.33);
  const tail = new THREE.ConeGeometry(0.07, 0.16, 4); tail.rotateX(Math.PI / 2); tail.scale(1.4, 0.2, 1.4); tail.translate(0, 0, -0.4);
  const b = new Batch(); b.add(body, M.koi); b.add(tail, M.koi); const geo = b.flush(new THREE.Group())[0].geometry;
  const loops = [{ x: 1.6, z: 7.4, r: 1.3 }, { x: 1.9, z: 7.2, r: 0.8 }, { x: 1.2, z: 7.7, r: 1.7 }, { x: 8.6, z: 6.6, r: 0.9 }, { x: 8.3, z: 6.8, r: 0.5 }, { x: 9.3, z: 1.4, r: 0.7 }, { x: -0.8, z: 7.6, r: 0.8 }, { x: 5.6, z: 6.0, r: 0.9 }];
  const fish = loops.map((l, i) => ({ ...l, sp: (0.35 + R() * 0.3) * (i % 2 ? -1 : 1), ph: R() * 6, s: 0.9 + R() * 0.5 }));
  const mesh = instanced(geo, M.koi, fish.map(f => ({ x: f.x, y: C.WATER_Y + 0.012, z: f.z, color: pick(R, ['#ffffff', '#ffd9c2', '#ffe9a8']) })), { cast: false, receive: false }); scene.add(mesh);
  const d = new THREE.Object3D();
  anim.push(t => { fish.forEach((f, i) => { const a = t * f.sp + f.ph, wob = Math.sin(t * 5 + f.ph) * 0.12; d.position.set(f.x + Math.cos(a) * f.r, C.WATER_Y + 0.012, f.z + Math.sin(a) * f.r * 0.8); d.rotation.set(0, -a + (f.sp > 0 ? Math.PI : 0) + wob + Math.PI / 2 * 0, 0); d.lookAt(f.x + Math.cos(a + 0.2 * Math.sign(f.sp)) * f.r, C.WATER_Y + 0.012, f.z + Math.sin(a + 0.2 * Math.sign(f.sp)) * f.r * 0.8); d.rotateY(wob); d.scale.setScalar(f.s); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); }); mesh.instanceMatrix.needsUpdate = true; });
}

export function buildProps(scene, M) {
  const b = new Batch(), T = C.TABLE;
  // 石桌石鼓
  b.add(cyl(0.72, 0.7, 0.13, 28), M.granite, T.x, 0.78, T.z); b.add(lathe([[0.02, 0], [0.42, 0], [0.44, 0.1], [0.24, 0.2], [0.2, 0.55], [0.3, 0.7], [0.02, 0.72]], 20), M.granite, T.x, 0, T.z);
  for (const [dx, dz] of [[-1.05, 0.75], [1.1, 0.9]]) { b.add(lathe([[0.02, 0], [0.24, 0], [0.3, 0.14], [0.31, 0.3], [0.3, 0.44], [0.24, 0.56], [0.02, 0.56]], 18), M.granite, T.x + dx, 0, T.z + dz); for (const yy of [0.1, 0.47]) b.add(new THREE.TorusGeometry(0.288, 0.016, 5, 22), M.graniteDark, T.x + dx, yy, T.z + dz, Math.PI / 2, 0, 0); for (let k = 0; k < 5; k++) { const a = k * 1.2566 + 0.5; b.add(sph(0.06, 8, 6), M.dark, T.x + dx + Math.cos(a) * 0.285, 0.29, T.z + dz + Math.sin(a) * 0.285, 0, -a, 0, 0.5, 1.5, 1); } }
  // 茶盘、茶壶、两只杯
  b.add(cyl(0.3, 0.3, 0.025, 20), M.clay, T.x + 0.05, 0.86, T.z - 0.05); b.add(sph(0.12, 14, 10), M.teapot, T.x + 0.1, 0.96, T.z - 0.08, 0, 0, 0, 1, 0.8, 1); b.add(sph(0.035, 8, 6), M.teapot, T.x + 0.1, 1.07, T.z - 0.08); b.add(cyl(0.02, 0.03, 0.14, 6), M.teapot, T.x + 0.25, 0.98, T.z - 0.08, 0, 0, -1.0); b.add(new THREE.TorusGeometry(0.06, 0.014, 5, 12), M.teapot, T.x - 0.03, 0.97, T.z - 0.08);
  for (const [dx, dz] of [[-0.12, 0.08], [-0.04, 0.16]]) b.add(cyl(0.04, 0.03, 0.045, 10), M.cup, T.x + dx, 0.895, T.z + dz);
  // 大陶缸，缸里养着两片睡莲
  const J = C.JAR; b.add(lathe([[0.02, 0], [0.42, 0], [0.62, 0.22], [0.72, 0.55], [0.68, 0.86], [0.56, 1.02], [0.6, 1.08], [0.54, 1.08], [0.5, 0.98]], 28), M.glazeBrown, J.x, 0, J.z);
  b.add(cyl(0.52, 0.52, 0.02, 24), new THREE.MeshStandardMaterial({ color: '#2f5d4c', roughness: 0.1 }), J.x, 0.98, J.z);
  for (const [dx, dz, s] of [[-0.18, 0.1, 0.2], [0.2, -0.12, 0.16], [0.05, 0.25, 0.12]]) { const pg = new THREE.CircleGeometry(s, 14, 0.2, 5.9); pg.rotateX(-Math.PI / 2); b.add(pg, new THREE.MeshStandardMaterial({ color: '#5fae3f', roughness: 0.7, side: THREE.DoubleSide }), J.x + dx, 0.995, J.z + dz); }
  b.flush(scene);
}
