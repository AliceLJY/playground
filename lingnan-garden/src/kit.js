// 通用小件：随机数、画布纹理、按材质合批、常用形体。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
export const lerp = (a, b, t) => a + (b - a) * t;

function canvasTex(size, draw, repeat = true, hMul = 1) {
  const c = document.createElement('canvas'); c.width = size; c.height = size * hMul;
  draw(c.getContext('2d'), size, size * hMul);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function speckle(g, s, base, n, colors, r0, r1, seed) {
  const R = rng(seed); g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) { g.fillStyle = colors[(R() * colors.length) | 0]; g.globalAlpha = 0.25 + R() * 0.5; const r = lerp(r0, r1, R()); g.beginPath(); g.ellipse(R() * s, R() * s, r, r * (0.5 + R() * 0.6), R() * 3, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}
export function makeTextures() {
  const T = {};
  // 瓦面：一垄一垄的筒瓦，横向是瓦片接缝
  T.tile = canvasTex(128, (g, s) => {
    for (let x = 0; x < s; x++) { const u = (x % 32) / 32, k = Math.sin(u * Math.PI); const v = Math.round(58 + k * 62); g.fillStyle = `rgb(${v},${v + 3},${v + 10})`; g.fillRect(x, 0, 1, s); }
    g.fillStyle = 'rgba(20,22,30,.55)'; for (let x = 0; x < s; x += 32) g.fillRect(x, 0, 3, s);
    g.fillStyle = 'rgba(15,16,22,.35)'; for (let y = 0; y < s; y += 32) g.fillRect(0, y, s, 3);
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let y = 4; y < s; y += 32) g.fillRect(0, y, s, 2);
  });
  T.granite = canvasTex(256, (g, s) => speckle(g, s, '#cfcbc0', 2600, ['#b3afa5', '#e2ded2', '#a39f96', '#d6cfbd'], 0.8, 3.2, 3));
  T.grass = canvasTex(256, (g, s) => speckle(g, s, '#55793f', 3200, ['#4a6d37', '#63874a', '#50743b', '#6d9052'], 1, 5, 5));
  T.plaster = canvasTex(256, (g, s) => speckle(g, s, '#f4efe3', 500, ['#e9e2d2', '#fbf8f0', '#e3dccb'], 4, 16, 7));
  T.wood = canvasTex(128, (g, s) => { g.fillStyle = '#3a221b'; g.fillRect(0, 0, s, s); const R = rng(9); for (let i = 0; i < 90; i++) { g.fillStyle = R() < 0.5 ? 'rgba(18,8,6,.3)' : 'rgba(120,74,52,.14)'; g.fillRect(0, R() * s, s, 1 + R() * 2); } });
  T.plank = canvasTex(128, (g, s) => { g.fillStyle = '#8a5a3a'; g.fillRect(0, 0, s, s); const R = rng(11); for (let i = 0; i < 80; i++) { g.fillStyle = R() < 0.5 ? 'rgba(50,28,14,.25)' : 'rgba(200,150,100,.16)'; g.fillRect(0, R() * s, s, 1 + R() * 2); } g.fillStyle = 'rgba(40,20,10,.6)'; for (let y = 0; y < s; y += 32) g.fillRect(0, y, s, 2); });
  // 挂落与栏杆的回纹格心（透明底）
  T.lattice = canvasTex(128, (g, s) => {
    g.clearRect(0, 0, s, s); g.strokeStyle = '#231510'; g.lineWidth = 6; g.lineJoin = 'miter';
    g.strokeRect(3, 3, s - 6, s - 6);
    g.beginPath(); g.moveTo(24, 24); g.lineTo(104, 24); g.lineTo(104, 104); g.lineTo(24, 104); g.lineTo(24, 46); g.lineTo(82, 46); g.lineTo(82, 82); g.lineTo(46, 82); g.lineTo(46, 64); g.stroke();
    g.beginPath(); g.moveTo(64, 3); g.lineTo(64, 24); g.moveTo(64, 104); g.lineTo(64, 125); g.moveTo(3, 64); g.lineTo(24, 64); g.moveTo(104, 64); g.lineTo(125, 64); g.stroke();
  });
  T.rail = canvasTex(128, (g, s) => {
    g.clearRect(0, 0, s, s); g.strokeStyle = '#2a1812'; g.lineWidth = 8;
    g.strokeRect(4, 4, s - 8, s - 8);
    for (let x = 26; x < s; x += 25) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x, s - 4); g.stroke(); }
    g.beginPath(); g.moveTo(4, 40); g.lineTo(s - 4, 40); g.stroke();
  });
  T.porcelain = canvasTex(256, (g, s) => {
    g.fillStyle = '#f5f6f8'; g.fillRect(0, 0, s, s); const R = rng(13); g.strokeStyle = '#2a4fa0'; g.fillStyle = '#2f58b0';
    g.lineWidth = 5; g.beginPath(); g.moveTo(0, 26); g.lineTo(s, 26); g.moveTo(0, s - 26); g.lineTo(s, s - 26); g.stroke();
    for (let i = 0; i < 9; i++) { const x = i * s / 9 + 14, y = 70 + R() * 110; g.globalAlpha = 0.85; g.beginPath(); for (let k = 0; k < 5; k++) g.ellipse(x + Math.cos(k * 1.257) * 11, y + Math.sin(k * 1.257) * 11, 8, 5, k * 1.257, 0, 7); g.fill(); g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 14); g.quadraticCurveTo(x + 12, y + 40, x - 6, y + 60); g.stroke(); g.beginPath(); g.ellipse(x + 10, y + 42, 9, 4, 0.8, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  });
  T.bamboo = canvasTex(64, (g, s) => { g.fillStyle = '#6f963c'; g.fillRect(0, 0, s, s); g.fillStyle = '#b9c88a'; g.fillRect(0, 0, s, 4); g.fillStyle = '#466e26'; g.fillRect(0, 4, s, 3); });
  T.koi = canvasTex(64, (g, s) => { g.fillStyle = '#fbf5ea'; g.fillRect(0, 0, s, s); const R = rng(17); g.fillStyle = '#f0641e'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(R() * s, R() * s, 8 + R() * 10, 6 + R() * 8, R() * 3, 0, 7); g.fill(); } }, false);
  // 水面法线：几层正弦叠出来，四边能接上
  T.waterNormal = (() => {
    const s = 256, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'), img = g.createImageData(s, s);
    const waves = [[1, 2, 0.9, 0.3], [3, -1, 0.6, 1.7], [-2, 5, 0.35, 0.4], [6, 3, 0.22, 2.2], [-7, -4, 0.16, 5.1], [9, -8, 0.1, 3.3], [13, 5, 0.07, 0.9]];
    const h = (x, y) => { let v = 0; for (const [a, b, amp, ph] of waves) v += amp * Math.sin((a * x + b * y) * 2 * Math.PI / s + ph); return v; };
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const dx = (h(x + 1, y) - h(x - 1, y)) * 3.2, dy = (h(x, y + 1) - h(x, y - 1)) * 3.2, l = Math.hypot(dx, dy, 1), i = (y * s + x) * 4; img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  // 青砖：顺砖错缝，灰蓝色，浅灰缝
  T.brick = canvasTex(256, (g, s) => {
    const R = rng(201); g.fillStyle = '#9a9d9c'; g.fillRect(0, 0, s, s);
    const bw = 64, bh = 16;
    for (let row = 0; row < s / bh; row++) for (let col = -1; col < s / bw + 1; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh, v = 98 + R() * 34;
      g.fillStyle = `rgb(${v - 4},${v + 1},${v + 7})`; g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      if (R() < 0.3) { g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 4, y + 3, bw - 20, 3); }
    }
  });
  // 麻石条板铺地：长条石错缝，细缝
  T.paving = canvasTex(512, (g, s) => {
    const R = rng(203); g.fillStyle = '#8c8a84'; g.fillRect(0, 0, s, s);
    const rows = 8, rh = s / rows;
    for (let r = 0; r < rows; r++) { let x = -R() * 120; while (x < s) { const w = 110 + R() * 90, v = 158 + R() * 30; g.fillStyle = `rgb(${v},${v - 1},${v - 6})`; g.fillRect(x + 1.5, r * rh + 1.5, w - 3, rh - 3); for (let k = 0; k < 60; k++) { g.fillStyle = R() < 0.5 ? 'rgba(120,112,100,.16)' : 'rgba(255,255,250,.2)'; g.fillRect(x + 3 + R() * (w - 6), r * rh + 3 + R() * (rh - 6), 1.5 + R() * 2.5, 1.5 + R() * 2); } x += w; } }
  });
  // 满洲窗：深色木格为主，格里是磨砂的浅色玻璃，少量红、蓝、绿、黄小块点在交角，正中一块蓝地白花的圆心。
  // 按实拍改的（清晖园厅堂与花罩后的窗、可园连廊的窗）：木格占多、彩色只是点缀，蓝色不是大片。
  T.manchu = canvasTex(256, (g, s, sh) => {
    const W = s, H = sh, wood = '#24140f'; g.fillStyle = wood; g.fillRect(0, 0, W, H);
    const cols = 4, rows = 8, cw = (W - 20) / cols, ch = (H - 20) / rows, acc = ['#a92a20', '#2b55a4', '#2f7a4c', '#d39a34'];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = 10 + c * cw, y = 10 + r * ch, pad = 4;
      g.fillStyle = (r + c) % 2 ? '#cdd6cf' : '#dfe5dc'; g.fillRect(x + pad, y + pad, cw - pad * 2, ch - pad * 2);
      // 格心：一个斜方框，四角各压一小块彩色玻璃
      g.strokeStyle = wood; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x + cw / 2, y + pad + 5); g.lineTo(x + cw - pad - 5, y + ch / 2); g.lineTo(x + cw / 2, y + ch - pad - 5); g.lineTo(x + pad + 5, y + ch / 2); g.closePath(); g.stroke();
      g.fillStyle = acc[(r * 3 + c) % 4]; const q = 9; for (const [ax, ay] of [[x + pad, y + pad], [x + cw - pad - q, y + pad], [x + pad, y + ch - pad - q], [x + cw - pad - q, y + ch - pad - q]]) g.fillRect(ax, ay, q, q);
    }
    // 正中的圆心：蓝地、白色刻花、细金边
    const cx = W / 2, cy = H / 2; g.fillStyle = wood; g.beginPath(); g.arc(cx, cy, 58, 0, 7); g.fill();
    g.fillStyle = '#2c58a8'; g.beginPath(); g.arc(cx, cy, 51, 0, 7); g.fill(); g.strokeStyle = '#d0a548'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = '#f1f3f0'; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.ellipse(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 15, 8, a, 0, 7); g.fill(); }
    g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill(); g.fillStyle = '#a92a20'; g.beginPath(); g.arc(cx, cy, 4.5, 0, 7); g.fill();
    g.strokeStyle = wood; g.lineWidth = 12; g.strokeRect(6, 6, W - 12, H - 12);
  }, false, 2);
  // 蚝壳窗横披：小方格里一片片磨薄的蚝壳，珠白半透
  T.oyster = canvasTex(128, (g, s) => {
    const R = rng(207); g.fillStyle = '#3a2016'; g.fillRect(0, 0, s, s);
    const n = 4, c = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 226 + R() * 22; g.fillStyle = `rgb(${v},${v - 4},${v - 16})`; g.fillRect(i * c + 3, j * c + 3, c - 6, c - 6); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(i * c + c * (0.35 + R() * 0.3), j * c + c * (0.35 + R() * 0.3), c * 0.22, c * 0.12, R() * 3, 0, 7); g.fill(); g.strokeStyle = 'rgba(170,160,140,.5)'; g.lineWidth = 1; g.beginPath(); g.arc(i * c + c / 2, j * c + c * 0.9, c * 0.5, 3.6, 5.8); g.stroke(); }
  });
  // 灰塑：深灰蓝地上灰白的卷草，只在两头各点一小块彩。按实拍改的（余荫山房山墙与檐口的灰塑是灰白卷草压在深色地上）。
  T.relief = canvasTex(256, (g, s) => {
    g.fillStyle = '#4b5661'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#d9d7cd'; g.lineWidth = 5; g.strokeRect(4, 4, s - 8, s - 8);
    const curl = (cx, cy, r, dir) => { g.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40, a = dir * t * 3.6 * Math.PI, rr = r * (1 - t * 0.82); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); };
    g.strokeStyle = '#e6e4da'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(14, s * 0.7); g.bezierCurveTo(s * 0.3, s * 0.2, s * 0.62, s * 0.86, s - 14, s * 0.32); g.stroke();
    g.lineWidth = 5; curl(s * 0.2, s * 0.36, 30, 1); curl(s * 0.5, s * 0.66, 34, -1); curl(s * 0.8, s * 0.6, 28, 1); curl(s * 0.66, s * 0.26, 22, -1); curl(s * 0.33, s * 0.78, 20, 1);
    g.fillStyle = '#b5523c'; g.beginPath(); g.arc(s * 0.5, s * 0.66, 7, 0, 7); g.fill(); g.fillStyle = '#3f7d5a'; g.beginPath(); g.arc(s * 0.2, s * 0.36, 6, 0, 7); g.fill();
  });
  // 跌水：竖向的白丝
  T.fall = canvasTex(64, (g, s) => { g.clearRect(0, 0, s, s); const R = rng(211); for (let i = 0; i < 46; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + R() * 0.6})`; g.fillRect(R() * s, R() * s, 1 + R() * 2.5, 8 + R() * 26); } });
  return T;
}

export function makeMaterials(T) {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  return {
    tile: std({ map: T.tile, roughness: 0.7, side: THREE.DoubleSide }),
    ridge: std({ color: '#3f8f63', roughness: 0.45 }), ridgeDark: std({ color: '#2f6f4c', roughness: 0.5 }),
    greyTrim: std({ color: '#70747c', roughness: 0.8 }),
    wood: std({ map: T.wood, roughness: 0.6 }), woodDark: std({ color: '#3b1a15', roughness: 0.6 }), plank: std({ map: rep(T.plank, 3, 3), roughness: 0.75 }),
    plaster: std({ map: rep(T.plaster, 2, 1), roughness: 0.95 }), plasterPlain: std({ color: '#f3eee2', roughness: 0.95 }),
    granite: std({ map: T.granite, roughness: 0.95 }), graniteLight: std({ map: T.granite, color: '#c6c3ba', roughness: 0.9 }), graniteDark: std({ map: T.granite, color: '#a19d93', roughness: 0.95 }),
    taihu: std({ color: '#ffffff', roughness: 1, flatShading: true }), rock: std({ map: T.granite, color: '#ffffff', roughness: 1, flatShading: true }),
    lattice: std({ map: T.lattice, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }), rail: std({ map: T.rail, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }),
    lantern: std({ color: '#e2371f', emissive: '#c22a12', emissiveIntensity: 0.55, roughness: 0.6 }), gold: std({ color: '#d9a531', roughness: 0.4, metalness: 0.4 }),
    porcelain: std({ map: T.porcelain, roughness: 0.25 }), glazeGreen: std({ color: '#3a7257', roughness: 0.28 }), glazeBrown: std({ color: '#7a3a1c', roughness: 0.2 }), clay: std({ color: '#8a4a2c', roughness: 0.7 }),
    bark: std({ color: '#6a5d50', roughness: 1 }), barkDark: std({ color: '#51473d', roughness: 1 }), soil: std({ color: '#4a3524', roughness: 1 }),
    leaf: std({ color: '#ffffff', roughness: 0.9 }), leafSmooth: std({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide }),
    lotusLeaf: std({ color: '#ffffff', roughness: 0.75, side: THREE.DoubleSide }), petal: std({ color: '#ffffff', roughness: 0.7, side: THREE.DoubleSide }),
    bamboo: std({ map: T.bamboo, roughness: 0.5 }), white: std({ color: '#ffffff', roughness: 0.9 }), dark: std({ color: '#3a2a22', roughness: 0.9 }),
    brick: std({ map: T.brick, roughness: 0.95 }), paving: std({ map: T.paving, color: '#d2d0c8', roughness: 0.95 }),
    manchu: std({ map: T.manchu, emissive: '#ffffff', emissiveMap: T.manchu, emissiveIntensity: 0.32, roughness: 0.25, side: THREE.DoubleSide }),
    oyster: std({ map: T.oyster, emissive: '#fff6dd', emissiveMap: T.oyster, emissiveIntensity: 0.25, roughness: 0.3, side: THREE.DoubleSide }),
    relief: std({ map: T.relief, roughness: 0.9 }), lime: std({ color: '#d2d0c6', roughness: 0.95 }), limeDark: std({ color: '#8f8f8a', roughness: 0.9 }),
    ying: std({ color: '#ffffff', roughness: 1, flatShading: true }), wax: std({ color: '#a98d5c', roughness: 0.55 }),
    tileDark: std({ color: '#565b63', roughness: 0.8 }),
    koi: std({ map: T.koi, roughness: 0.4 }), teapot: std({ color: '#8a4a2e', roughness: 0.35 }), cup: std({ color: '#efe6d2', roughness: 0.4 }),
  };
}

// 按材质收集几何体，最后每种材质并成一个网格，绘制次数就少。
export class Batch {
  constructor() { this.buckets = new Map(); this.m = new THREE.Matrix4(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    this.m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
    return this.addM(geo, mat, this.m);
  }
  addM(geo, mat, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(matrix);
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g); return this;
  }
  flush(parent, { cast = true, receive = true } = {}) {
    const out = [];
    for (const [mat, list] of this.buckets) { const mesh = new THREE.Mesh(mergeGeometries(list, false), mat); mesh.castShadow = cast; mesh.receiveShadow = receive; parent.add(mesh); out.push(mesh); for (const g of list) g.dispose(); }
    this.buckets.clear(); return out;
  }
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (r0, r1, h, seg = 12) => new THREE.CylinderGeometry(r0, r1, h, seg);
export const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
export function lathe(profile, seg = 20) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
export function tube(points, r, seg = 8, tubular = 0) { const c = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))); return new THREE.TubeGeometry(c, tubular || points.length * 6, r, seg, false); }
// 一头粗一头细的枝干
export function taperTube(points, r0, r1, seg = 8) {
  const g = tube(points, 1, seg), pos = g.attributes.position, c = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const tubular = points.length * 6, p = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) { c.getPointAt(i / tubular, p); const r = lerp(r0, r1, i / tubular); for (let j = 0; j <= seg; j++) { const k = i * (seg + 1) + j; pos.setXYZ(k, p.x + (pos.getX(k) - p.x) * r, p.y + (pos.getY(k) - p.y) * r, p.z + (pos.getZ(k) - p.z) * r); } }
  g.computeVertexNormals(); return g;
}
// 不规则的石头 / 树冠团：正二十面体细分后把顶点推一推
export function blob(seed, detail = 1, jitter = 0.22, squash = 1, smooth = true, smoothDetail = 2) {
  let g = new THREE.IcosahedronGeometry(1, smooth ? smoothDetail : detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); if (smooth) g = mergeVertices(g, 1e-3);
  const pos = g.attributes.position, R = rng(seed), memo = new Map(), k1 = seed * 1.7, k2 = seed * 0.9 + 2, k3 = seed * 2.3 + 5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); let k;
    if (smooth) k = 1 + jitter * 0.9 * (Math.sin(x * 3.3 + k1) * Math.cos(y * 2.9 + k2) + Math.sin(z * 3.7 + k3) * 0.8 + Math.sin((x + y + z) * 5.1 + k1) * 0.45);   // 鼓鼓的几团，不是碎面
    else { const key = x.toFixed(3) + y.toFixed(3) + z.toFixed(3); if (!memo.has(key)) memo.set(key, 1 + (R() - 0.5) * 2 * jitter); k = memo.get(key); }
    pos.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2)); return g;
}
// 实例化网格：items = [{x,y,z,rx,ry,rz,s|sx,sy,sz,color}]
export function instanced(geo, mat, items, { cast = true, receive = true } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length), d = new THREE.Object3D(), c = new THREE.Color();
  d.rotation.order = 'YXZ';
  items.forEach((it, i) => { d.position.set(it.x, it.y, it.z); d.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0); d.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); if (it.color) mesh.setColorAt(i, c.set(it.color)); });
  mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
export const pick = (R, arr) => arr[(R() * arr.length) | 0];
