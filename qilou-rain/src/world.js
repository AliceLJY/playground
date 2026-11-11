// 骑楼雨夜 · 把 core.js 的场地搭成 three 场景。所有形体由代码生成；招牌上的字是运行时画在画布上的。
import * as THREE from 'three';
import { worldMaterial } from './gfx.js';
import { STREET, ALLEY, PLAZA, GANG, OBST, COLUMNS, DRAINS, CRATES, VENTS, rng } from './core.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color(), _n = new THREE.Matrix3();
function prismGeo() {
  const A = [-.5, 0, -.5], B = [.5, 0, -.5], C = [0, 1, -.5], D = [-.5, 0, .5], E = [.5, 0, .5], F = [0, 1, .5];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([D, E, F, B, A, C, A, D, F, A, F, C, E, B, C, E, C, F].flat(), 3));
  g.computeVertexNormals();
  return g;
}
const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12).toNonIndexed(),
  cone: new THREE.ConeGeometry(1, 1, 12).toNonIndexed(),
  ball: new THREE.IcosahedronGeometry(1, 1),
  half: new THREE.CircleGeometry(1, 14, 0, Math.PI).toNonIndexed(),
  disk: new THREE.CircleGeometry(1, 20).toNonIndexed(),
  prism: prismGeo(),
};

// 霓虹与店面的灯：烘到顶点上的光（静态世界用），不是真光源
export const LIGHTS = [];
const GLOW_K = 0.3;
const lamp = (x, y, z, color, power, reach) => { _c.set(color); LIGHTS.push({ x, y, z, r: _c.r * power * GLOW_K, g: _c.g * power * GLOW_K, b: _c.b * power * GLOW_K, reach }); };

export class Builder {
  constructor(seed = 7) { this.p = []; this.n = []; this.c = []; this.m = []; this.mat = 0; this.r = rng(seed); }
  xf(x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); }
  add(g, m, color, jit = 0) {
    const pos = g.attributes.position, nor = g.attributes.normal;
    _c.set(color); if (jit) _c.multiplyScalar(1 + (this.r() - 0.5) * jit);
    _n.getNormalMatrix(m);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(nor, i).applyMatrix3(_n).normalize(); this.n.push(_v.x, _v.y, _v.z);
      this.c.push(_c.r, _c.g, _c.b); this.m.push(this.mat);
    }
    return this;
  }
  box(x, y0, z, sx, h, sz, color, ry = 0, jit = 0, rx = 0, rz = 0) { return this.add(UNIT.box, this.xf(x, y0 + h / 2, z, sx, h, sz, ry, rx, rz), color, jit); }
  cyl(x, y0, z, r, h, color, jit = 0, rx = 0, rz = 0) { return this.add(UNIT.cyl, this.xf(x, y0 + h / 2, z, r, h, r, 0, rx, rz), color, jit); }
  cone(x, y0, z, r, h, color, jit = 0) { return this.add(UNIT.cone, this.xf(x, y0 + h / 2, z, r, h, r), color, jit); }
  ball(x, y, z, rx, ry, rz, color, jit = 0) { return this.add(UNIT.ball, this.xf(x, y, z, rx, ry, rz), color, jit); }
  prism(x, y0, z, w, h, len, color, ry = 0, jit = 0) { return this.add(UNIT.prism, this.xf(x, y0, z, w, h, len, ry), color, jit); }
  half(x, y, z, r, color, ry = 0) { return this.add(UNIT.half, this.xf(x, y, z, r, r, 1, ry), color); }
  disk(x, y, z, r, color) { return this.add(UNIT.disk, this.xf(x, y, z, r, r, 1, 0, -Math.PI / 2), color); }
  // 面朝 ±x 或 ±z 的平面片（窗玻璃、发光面）
  quad(x, y, z, w, h, color, ry) { return this.add(QUAD, this.xf(x, y, z, w, h, 1, ry), color); }
  geometry(bake) {
    const g = new THREE.BufferGeometry(), n = this.p.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (bake) {
      g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.m, 1));
      const glow = new Float32Array(n * 3), P = this.p, N = this.n;
      for (let i = 0; i < n; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        let r = 0, gg = 0, b = 0;
        for (let k = 0; k < LIGHTS.length; k++) {
          const L = LIGHTS[k], dx = L.x - x, dy = L.y - y, dz = L.z - z, d2 = dx * dx + dy * dy + dz * dz, rr = L.reach * L.reach;
          if (d2 > rr * 9) continue;
          const d = Math.sqrt(d2) + 1e-4, nl = Math.max(0.12, (dx * N[i * 3] + dy * N[i * 3 + 1] + dz * N[i * 3 + 2]) / d);
          const f = nl / ((1 + d2 / rr) * (1 + d2 / rr));
          r += L.r * f; gg += L.g * f; b += L.b * f;
        }
        glow[i * 3] = r; glow[i * 3 + 1] = gg; glow[i * 3 + 2] = b;
      }
      g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 3));
    }
    return g;
  }
  get tris() { return this.p.length / 9; }
}
const QUAD = new THREE.PlaneGeometry(1, 1).toNonIndexed();

// 带贴图坐标的片（招牌），全部合进一张运行时画的图集
class Signs {
  constructor() { this.p = []; this.uv = []; }
  quad(x, y, z, w, h, ry, u0, v0, u1, v1) {
    const c = Math.cos(ry), s = Math.sin(ry), hx = w / 2 * c, hz = -w / 2 * s, hy = h / 2;
    const A = [x - hx, y - hy, z - hz], B = [x + hx, y - hy, z + hz], C = [x + hx, y + hy, z + hz], D = [x - hx, y + hy, z - hz];
    this.p.push(...A, ...B, ...C, ...A, ...C, ...D);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Heiti SC", sans-serif';
export const VSIGNS = [
  ['得闲茶楼', '#ff3b30'], ['廿四味凉茶', '#27e0d0'], ['陈记士多', '#ff4fc8'], ['百草药行', '#3dff8a'], ['云吞面', '#ffb020'], ['糖水铺', '#ff7ab8'],
  ['钟表行', '#5aa0ff'], ['影楼', '#c97bff'], ['烧腊', '#ff5a2a'], ['肠粉', '#ffe14a'], ['理发', '#ff3b30'], ['押', '#ff3030'],
];
export const HSIGNS = [['陈记士多', '#ff4fc8'], ['得闲茶楼', '#ffb020'], ['百草药行', '#3dff8a'], ['西关糖水', '#ff7ab8'], ['街坊大排档', '#ffcf4a'], ['渡口', '#7fd0ff'], ['长堤轮渡', '#ffe9b0'], ['靓汤肠粉', '#ffe14a']];
function drawAtlas() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#050506'; g.fillRect(0, 0, c.width, c.height);
  const tube = (draw, color) => {
    g.save(); g.shadowColor = color; g.shadowBlur = 26; g.strokeStyle = color; g.fillStyle = color; draw(); draw();
    g.shadowBlur = 0; g.globalAlpha = .75; g.strokeStyle = '#fff'; g.fillStyle = '#fff'; draw(true); g.restore();
  };
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.stroke(); };
  VSIGNS.forEach(([text, color], i) => {
    const x = i * 170 + 5, y = 4, w = 160, h = 640, n = text.length, fs = Math.min(128, (h - 70) / n - 8);
    g.lineWidth = 7; tube(core => { g.lineWidth = core ? 2 : 7; rr(x + 10, y + 10, w - 20, h - 20, 20); }, color);
    g.font = `900 ${fs}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const step = (h - 60) / n;
    tube(core => { g.globalAlpha = core ? .55 : 1; for (let k = 0; k < n; k++) g.fillText(text[k], x + w / 2, y + 30 + step * (k + .5)); }, color);
  });
  HSIGNS.forEach(([text, color], i) => {
    const x = (i % 4) * 500 + 6, y = 668 + Math.floor(i / 4) * 150, w = 480, h = 130;
    g.lineWidth = 6; tube(core => { g.lineWidth = core ? 2 : 6; rr(x + 8, y + 8, w - 16, h - 16, 14); }, color);
    g.font = `900 ${Math.min(84, (w - 60) / text.length)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    tube(core => { g.globalAlpha = core ? .55 : 1; g.fillText(text, x + w / 2, y + h / 2 + 3); }, color);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const vUV = i => [(i * 170 + 5) / 2048, 1 - 644 / 1024, (i * 170 + 165) / 2048, 1 - 4 / 1024];
const hUV = i => { const x = (i % 4) * 500 + 6, y = 668 + Math.floor(i / 4) * 150; return [x / 2048, 1 - (y + 130) / 1024, (x + 480) / 2048, 1 - y / 1024]; };

const WALLS = ['#b9a98a', '#8fa694', '#a8a39a', '#b38f7c', '#8d9bab', '#b7ad8c', '#9aa58a', '#a99a9a'];
const PANES = ['#ff5a3c', '#ffc23c', '#3cd27a', '#3ca0ff', '#ff6ab0', '#ffe9a0'];

export function buildWorld(shared, quality) {
  const B = new Builder(11), G = new Builder(5), FAR = new Builder(3), S = new Signs(), r = rng(2026);
  const group = new THREE.Group();
  const pick = a => a[Math.floor(r() * a.length)];
  let vs = 0;
  // 竖招牌：垂直于墙面挑出来，沿街两个方向都看得到
  function vsign(x, y, z, idx, h = 3.6) {
    const w = h * 0.25, [u0, v0, u1, v1] = vUV(idx);
    S.quad(x, y, z - 0.07, w, h, Math.PI, u0, v0, u1, v1);
    S.quad(x, y, z + 0.07, w, h, 0, u0, v0, u1, v1);
    B.mat = 7; B.box(x, y - h / 2 - 0.05, z, w + 0.12, h + 0.1, 0.1, '#0b0b0d');
    B.box(x + (x > 0 ? 0.5 : -0.5), y + h / 2 - 0.2, z, 0.6, 0.06, 0.06, '#222');
    B.box(x + (x > 0 ? 0.5 : -0.5), y - h / 2 + 0.3, z, 0.6, 0.06, 0.06, '#222');
    lamp(x, y, z - 1.4, VSIGNS[idx][1], 2.6, 5.5); lamp(x, y, z + 1.4, VSIGNS[idx][1], 2.6, 5.5);
    lamp(x * 0.55, 0.6, z, VSIGNS[idx][1], 1.5, 5);
  }
  function hsign(x, y, z, idx, ry, w = 2.6) { const [u0, v0, u1, v1] = hUV(idx); S.quad(x, y, z, w, w * 0.27, ry, u0, v0, u1, v1); lamp(x, y - 0.4, z, HSIGNS[idx][1], 1.1, 3.5); }
  // 满洲窗：暖光底 + 彩色玻璃格
  function manchu(x, y, z, w, h, ry, lit) {
    const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry);
    B.mat = 2; B.box(x - nx * 0.04, y - h / 2 - 0.06, z - nz * 0.04, Math.abs(tx) * (w + 0.16) + Math.abs(nx) * 0.1, h + 0.12, Math.abs(tz) * (w + 0.16) + Math.abs(nz) * 0.1, '#3a2a20');
    if (!lit) { B.mat = 7; B.quad(x + nx * 0.03, y, z + nz * 0.03, w, h, '#0c1420', ry); return; }
    G.quad(x + nx * 0.03, y, z + nz * 0.03, w, h, '#6a4216', ry);
    const cols = 3, rows = 4, cw = w / cols, ch = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if ((i + j) % 2 === 0 && r() < 0.8) continue;
      _c.set(pick(PANES)).multiplyScalar(0.9);
      G.quad(x + nx * 0.04 + tx * (i - 1) * cw, y + (j - 1.5) * ch, z + nz * 0.04 + tz * (i - 1) * cw, cw * 0.8, ch * 0.8, _c, ry);
    }
    B.mat = 2;
    for (let i = 1; i < cols; i++) B.box(x + nx * 0.05 + tx * (i - 1.5) * cw, y - h / 2, z + nz * 0.05 + tz * (i - 1.5) * cw, Math.abs(tx) * 0.05 + 0.02, h, Math.abs(tz) * 0.05 + 0.02, '#2a1c14');
    lamp(x + nx * 1.2, y, z + nz * 1.2, '#ffb060', 0.8, 3);
  }

  // ---------- 骑楼：一开间 5 米 ----------
  const AH = 4.2;
  function bay(side, zc, i, real) {
    const floors = 2 + (r() < 0.55 ? 1 : 0), fh = 3.3, top = AH + floors * fh, wall = pick(WALLS), xe = side * 5, xi = side * 9;
    B.mat = 0;
    B.box(side * 11, AH, zc, 12, top - AH, 5, wall, 0, 0.1);
    B.box(side * 7, AH - 0.02, zc, 4.4, 0.3, 5, '#6a665c');
    B.box(xe + side * 0.35, AH - 0.7, zc, 0.8, 0.7, 5, wall, 0, 0.08);
    for (let f = 0; f < floors; f++) {
      const y = AH + f * fh;
      B.mat = 0; B.box(xe - side * 0.08, y, zc, 0.3, 0.22, 5.02, '#d8d2c2', 0, 0.1);
      const nwin = 3;
      for (let k = 0; k < nwin; k++) {
        const z = zc + (k - 1) * 1.55, lit = r() < 0.5;
        manchu(xe - side * 0.02, y + 1.75, z, 1.05, 1.9, side > 0 ? -Math.PI / 2 : Math.PI / 2, lit);
        B.mat = 0; B.box(xe - side * 0.1, y + 2.75, z, 0.24, 0.16, 1.3, '#cfc8b6');
        B.box(xe - side * 0.12, y + 0.68, z, 0.3, 0.1, 1.3, '#cfc8b6');
      }
      if (f === 0 && r() < 0.4) {
        B.mat = 2; B.box(xe - side * 0.45, y + 0.2, zc, 0.8, 0.08, 4.4, '#3a3a3c');
        for (let k = -5; k <= 5; k++) B.box(xe - side * 0.82, y + 0.25, zc + k * 0.42, 0.04, 0.85, 0.04, '#222428');
        B.box(xe - side * 0.82, y + 1.1, zc, 0.06, 0.06, 4.4, '#222428');
      }
      if (r() < 0.35) { B.mat = 7; B.box(xe - side * 0.35, y + 0.9, zc + 2.1, 0.6, 0.5, 0.7, '#9aa0a4'); }
    }
    B.mat = 0; B.box(xe - side * 0.05, top, zc, 0.4, 0.9, 5.02, wall, 0, 0.08);
    B.box(xe - side * 0.1, top + 0.9, zc, 0.5, 0.12, 5.1, '#d8d2c2');
    if (r() < 0.5) {
      B.box(xe - side * 0.05, top + 1.0, zc, 0.36, 0.9, 2.4, wall);
      B.half(xe - side * 0.26, top + 1.9, zc, 1.2, '#d8d2c2', side > 0 ? -Math.PI / 2 : Math.PI / 2);
      B.ball(xe - side * 0.05, top + 3.2, zc, 0.2, 0.26, 0.2, '#d8d2c2');
    }
    B.mat = 7; B.cyl(xe - side * 0.3, AH, zc - 2.4, 0.06, top - AH, '#3c4a44');
    if (!real) return;
    // 铺面内墙与铺口
    B.mat = 0; B.box(xi + side * 0.2, 0, zc, 0.4, AH, 5, wall, 0, 0.1);
    const kind = r();
    if (kind < 0.5) {
      G.quad(xi - side * 0.02, 1.55, zc, 3.6, 2.9, kind < 0.25 ? '#8a5a24' : '#6a5a34', side > 0 ? -Math.PI / 2 : Math.PI / 2);
      B.mat = 2;
      for (let k = 0; k < 4; k++) B.box(xi - side * 0.04, 0.5 + k * 0.62, zc, 0.06, 0.05, 3.5, '#2a1a10');
      for (let k = 0; k < 14; k++) B.box(xi - side * 0.06, 0.55 + Math.floor(r() * 4) * 0.62, zc - 1.6 + r() * 3.2, 0.08, 0.22 + r() * 0.2, 0.14, pick(['#7a2a1a', '#2a5a3a', '#c8a040', '#8a8a90', '#3a4a7a']));
      B.box(xi - side * 0.7, 0, zc, 0.6, 0.95, 2.6, '#4a3222');
      lamp(xi - side * 1.6, 2.4, zc, '#ffc070', 2.2, 4.2);
      hsign(xi - side * 0.08, 3.5, zc, Math.floor(r() * 5), side > 0 ? -Math.PI / 2 : Math.PI / 2);
    } else if (kind < 0.85) {
      B.mat = 3; B.box(xi - side * 0.03, 0, zc, 0.08, 3.1, 3.6, pick(['#5a6a6c', '#6a6258', '#4c5a66']), 0, 0.1);
      B.mat = 0; B.box(xi - side * 0.06, 3.1, zc, 0.14, 0.3, 3.8, '#3a3a3a');
    } else {
      B.mat = 2; B.box(xi - side * 0.03, 0, zc - 0.9, 0.1, 2.5, 1.1, '#4a2a1c');
      manchu(xi - side * 0.02, 1.9, zc + 0.9, 1.3, 1.5, side > 0 ? -Math.PI / 2 : Math.PI / 2, true);
    }
    if (r() < 0.3) { B.mat = 7; B.cyl(xi - side * 0.8, 0, zc + 2.0, 0.24, 0.4, '#7a3a28'); B.ball(xi - side * 0.8, 0.75, zc + 2.0, 0.42, 0.42, 0.42, '#1f4a2c', 0.3); }
    if (r() < 0.5) lamp(side * 7, 3.6, zc, '#ffd9a0', 0.9, 3.2), G.ball(side * 7, 3.85, zc, 0.11, 0.11, 0.11, '#fff0c8');
    if (i % 2 === (side > 0 ? 0 : 1)) vsign(xe - side * 0.75, AH + 2.6 + r() * 1.2, zc + (r() - 0.5) * 2, (vs++) % VSIGNS.length, 3.2 + r() * 1.0);
  }
  for (let i = -3; i < 19; i++) {
    const zc = -55 + i * 5;
    for (const side of [-1, 1]) {
      if (side === 1 && Math.abs(zc) < 5.1) continue;
      bay(side, zc, i, i >= -1);
    }
  }
  B.mat = 1;
  for (const s of [-1, 1]) B.box(13, 0, s * 6.5, 8, 11, 2, '#5c5a58', 0, 0.06);
  // 柱子（位置取自碰撞表）
  B.mat = 0;
  for (const c of COLUMNS) {
    B.box(c.x, 0, c.z, 0.7, AH - 0.7, 0.7, '#b8b0a0', 0, 0.12);
    B.box(c.x, 0, c.z, 0.86, 0.5, 0.86, '#8f897c'); B.box(c.x, AH - 1.0, c.z, 0.84, 0.3, 0.84, '#cfc8b6');
  }
  for (const z of [-62.5, -67.5]) for (const s of [-1, 1]) B.box(s * 5.35, 0, z, 0.7, AH - 0.7, 0.7, '#b8b0a0');
  // 横巷：两堵高墙、后门、晾衣、尽头
  B.mat = 1;
  for (const s of [-1, 1]) {
    B.box(21.5, 0, s * 4.75, 25, 11, 1.5, '#5c5a58', 0, 0.06);
    for (let k = 0; k < 5; k++) {
      const x = 12 + k * 4.6;
      manchu(x, 5.6 + (k % 2) * 2.4, s * 4.0 - s * 0.02, 1.0, 1.5, s > 0 ? Math.PI : 0, r() < 0.5);
      B.mat = 1;
      if (k % 2 === 0) { B.mat = 2; B.box(x + 1.8, 0, s * 4.0 - s * 0.04, 1.0, 2.2, 0.1, '#3c2a22'); B.mat = 1; }
    }
    B.mat = 7; B.cyl(11, 0, s * 3.9, 0.07, 11, '#4a4a48'); B.cyl(24.5, 0, s * 3.9, 0.07, 11, '#4a4a48');
    B.mat = 1;
  }
  B.box(34.75, 0, 0, 1.5, 11, 11, '#56524e');
  manchu(33.98, 2.4, 0, 2.2, 2.0, -Math.PI / 2, true);
  hsign(33.95, 4.6, 0, 4, -Math.PI / 2, 4.4);
  for (let k = 0; k < 4; k++) {
    const x = 13 + k * 6;
    B.mat = 7; B.box(x, 6.8, 0, 0.03, 0.03, 8, '#222');
    for (let j = 0; j < 5; j++) if (r() < 0.8) B.box(x, 5.9 + r() * 0.2, -3 + j * 1.5, 0.04, 0.9, 0.7, pick(['#8a9ab0', '#b08a8a', '#c8c0a8', '#6a8a7a']));
  }
  for (let k = 0; k < 7; k++) { const x = 11 + k * 3.4, y = 3.6 + Math.abs(k - 3) * 0.12; G.ball(x, y, 0, 0.12, 0.14, 0.12, '#ffe0a0'); lamp(x, y - 0.3, 0, '#ffcf80', 1.3, 3.4); }
  // 渡口广场：两侧货栈、北侧山墙、栏杆、灯柱
  B.mat = 1;
  for (const s of [-1, 1]) {
    B.box(s * 21, 0, 51, 2, 8.5, 22, '#6a4a3c', 0, 0.06);
    B.mat = 2; for (let k = 0; k < 3; k++) B.box(s * 19.96, 0, 44.5 + k * 6.5, 0.1, 3.4, 3.6, '#3a3028');
    B.mat = 1;
    B.box(s * 15, 0, 39.2, 12, 11, 1.6, '#75706a', 0, 0.06);
    for (let k = 0; k < 3; k++) manchu(s * (11.5 + k * 3), 6.4, 40.02, 1.1, 1.8, 0, r() < 0.6);
    B.mat = 1;
  }
  B.mat = 7;
  for (const s of [-1, 1]) {
    for (let x = 2.2; x <= 20; x += 2.2) B.box(s * x, 0, 61.9, 0.12, 1.05, 0.12, '#2c2f33');
    B.box(s * 11.1, 1.0, 61.9, 18, 0.08, 0.1, '#2c2f33'); B.box(s * 11.1, 0.55, 61.9, 18, 0.05, 0.08, '#2c2f33');
    for (const z of [45, 56]) {
      B.cyl(s * 6, 0, z, 0.09, 5.2, '#23262a'); B.box(s * 6, 5.2, z, 0.9, 0.08, 0.08, '#23262a');
      G.ball(s * 6 - 0.4, 5.05, z, 0.2, 0.16, 0.2, '#ffd9a0'); G.ball(s * 6 + 0.4, 5.05, z, 0.2, 0.16, 0.2, '#ffd9a0');
      lamp(s * 6, 4.6, z, '#ffc888', 4.2, 7);
    }
  }
  hsign(0, 5.3, 61.9, 6, Math.PI, 5.4);
  B.box(-2.4, 0, 61.9, 0.16, 5.9, 0.16, '#23262a'); B.box(2.4, 0, 61.9, 0.16, 5.9, 0.16, '#23262a');
  // 跳板与渡轮
  B.mat = 2; B.box(0, -0.12, 64.8, 3.4, 0.14, 5.6, '#6a5238');
  for (const s of [-1, 1]) { B.mat = 7; for (let z = 62.4; z < 67.4; z += 1.6) B.box(s * 1.75, 0, z, 0.08, 1.0, 0.08, '#2c2f33'); B.box(s * 1.75, 0.98, 64.8, 0.06, 0.06, 5.4, '#c8b890'); }
  B.mat = 7;
  B.box(0, -2.6, 73, 30, 2.5, 10.6, '#8f918c'); B.box(0, -0.7, 67.68, 30, 0.3, 0.06, '#1e6a48'); B.box(0, -0.1, 73, 30, 0.1, 10.6, '#5a5c58');
  B.box(-8.8, 0, 74.5, 12, 2.6, 7, '#9a9890'); B.box(8.8, 0, 74.5, 12, 2.6, 7, '#9a9890'); B.box(0, 2.6, 74.5, 30.4, 0.18, 8, '#1e6a48');
  B.box(0, 2.78, 75.5, 8, 2.2, 4, '#9a9890'); B.cyl(0, 5.0, 76.5, 0.7, 2.2, '#a8321f');
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) G.quad(s * (4.0 + k * 1.75), 1.6, 70.98, 1.0, 0.8, '#8a6a34', Math.PI);
  for (let k = -1; k <= 1; k++) G.quad(k * 2.2, 4.0, 73.48, 1.4, 0.8, '#5a7a8a', Math.PI);
  lamp(0, 2.2, 68.5, '#ffd9a0', 2.6, 6); hsign(0, 3.3, 70.4, 5, Math.PI, 3.0);
  for (const s of [-1, 1]) for (const yy of [0.6, 1.0]) B.box(s * 8.5, yy, 67.8, 13.2, 0.05, 0.05, '#c8c8c0');
  // 街上的灯笼串
  for (const z of [-46, -17, 14, 33]) {
    for (let k = 0; k <= 8; k++) {
      const x = -4.6 + k * 1.15, y = 6.4 + Math.pow((k - 4) / 4, 2) * 0.9;
      G.ball(x, y, z, 0.2, 0.25, 0.2, '#ff3a22'); B.mat = 7; B.box(x, y + 0.27, z, 0.05, 0.06, 0.05, '#c8a030');
    }
    lamp(0, 5.6, z, '#ff4a2a', 2.6, 6);
    B.box(0, 7.2, z, 9.6, 0.02, 0.02, '#111');
  }
  // 沙井口的幽绿光、出虫的檐口
  for (const d of DRAINS) lamp(d.x, 0.5, d.z, '#6aff6a', 1.6, 3.4);
  for (const v of VENTS) { B.mat = 7; B.box(v.x, 3.9, v.z, 0.7, 0.3, 0.7, '#1a1c1e'); }

  // ---------- 街上的东西（位置取自碰撞表） ----------
  for (const o of OBST) {
    const { x, z } = o;
    if (o.kind === 'van') {
      B.mat = 7; B.box(x, 0.4, z, 1.9, 1.3, 4.5, '#c9cdd0'); B.box(x, 1.7, z - 0.3, 1.8, 0.5, 3.6, '#c9cdd0');
      B.box(x, 1.25, z + 1.95, 1.7, 0.6, 0.7, '#10161c'); B.box(x, 1.15, z - 0.3, 1.94, 0.5, 3.2, '#10161c');
      for (const sx of [-1, 1]) for (const sz of [-1.5, 1.5]) B.cyl(x + sx * 0.9, 0.35, z + sz, 0.36, 0.24, '#0c0c0c', 0, 0, Math.PI / 2);
      for (const sx of [-1, 1]) G.quad(x + sx * 0.75, 0.75, z - 2.27, 0.24, 0.16, '#ff2a1a', Math.PI), G.quad(x + sx * 0.7, 0.75, z + 2.27, 0.3, 0.16, '#fff2c8', 0);
      lamp(x, 0.7, z - 3, '#ff2a1a', 1.2, 3);
    } else if (o.kind === 'trike') {
      B.mat = 2; B.box(x, 0.45, z - 0.3, 1.2, 0.1, 1.6, '#5a4630'); B.box(x, 0.55, z - 0.5, 0.9, 0.6, 0.9, '#8a6a3a');
      B.mat = 7; B.cyl(x - 0.6, 0.3, z - 0.5, 0.32, 0.08, '#111', 0, 0, Math.PI / 2); B.cyl(x + 0.6, 0.3, z - 0.5, 0.32, 0.08, '#111', 0, 0, Math.PI / 2); B.cyl(x, 0.3, z + 1.0, 0.32, 0.08, '#111', 0, 0, Math.PI / 2);
      B.box(x, 0.3, z + 0.7, 0.08, 0.9, 0.08, '#2a4a8a'); B.box(x, 1.15, z + 0.75, 0.7, 0.05, 0.05, '#2a2a2a');
    } else if (o.kind === 'kiosk') {
      B.mat = 7; B.box(x, 0, z, 1.7, 2.3, 2.1, '#1f5a44'); B.box(x, 2.3, z, 2.1, 0.14, 2.6, '#17402f');
      G.quad(x + 0.86, 1.5, z, 1.6, 0.9, '#ffe2a8', Math.PI / 2);
      for (let k = 0; k < 6; k++) B.box(x + 0.9, 0.3 + (k % 2) * 0.32, z - 0.75 + Math.floor(k / 2) * 0.75, 0.05, 0.26, 0.5, pick(['#c8402a', '#e8c040', '#3a70c8', '#e8e8e0']));
      lamp(x + 2, 1.5, z, '#ffe2a8', 2.0, 3.6);
    } else if (o.kind === 'stall') {
      B.mat = 7; B.box(x, 0, z, 1.4, 0.95, 2.8, '#b8b8b4'); B.box(x - 0.55, 0.95, z, 0.06, 1.3, 0.06, '#555'); B.box(x + 0.55, 0.95, z, 0.06, 1.3, 0.06, '#555');
      B.prism(x, 2.2, z, 2.0, 0.5, 3.2, '#c8402a'); G.ball(x, 2.0, z, 0.1, 0.12, 0.1, '#fff0c8'); lamp(x - 1, 1.6, z, '#ffd090', 1.6, 3.2);
      B.cyl(x, 0.95, z - 0.8, 0.3, 0.3, '#888'); B.cyl(x, 0.95, z + 0.5, 0.24, 0.24, '#777');
    } else if (o.kind === 'bins') { B.mat = 7; B.cyl(x - 0.3, 0, z, 0.28, 0.9, '#2a6a3a'); B.cyl(x + 0.3, 0, z, 0.28, 0.9, '#3a5a8a'); }
    else if (o.kind === 'table') {
      B.mat = 2; B.cyl(x, 0.72, z, 0.75, 0.05, '#7a5a3a'); B.cyl(x, 0, z, 0.06, 0.72, '#444');
      B.mat = 7; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.6; B.cyl(x + Math.cos(a) * 1.05, 0, z + Math.sin(a) * 1.05, 0.17, 0.44, k % 2 ? '#c8302a' : '#2a5ac8'); }
      B.cyl(x + 0.2, 0.77, z, 0.12, 0.2, '#b8b8b0'); B.cyl(x - 0.25, 0.77, z + 0.2, 0.05, 0.22, '#3a7a4a');
    } else if (o.kind === 'cart') {
      B.mat = 7; B.box(x, 0.45, z, 1.2, 0.8, 2.2, '#c8c4b8'); B.cyl(x - 0.62, 0.28, z - 0.7, 0.28, 0.07, '#111', 0, 0, Math.PI / 2); B.cyl(x + 0.62, 0.28, z - 0.7, 0.28, 0.07, '#111', 0, 0, Math.PI / 2);
      B.box(x, 1.25, z, 0.05, 1.2, 0.05, '#555'); B.cone(x, 2.4, z, 1.3, 0.5, '#d84a2a');
      G.quad(x - 0.61, 0.9, z, 1.6, 0.5, '#ffe9a0', -Math.PI / 2); lamp(x - 1.6, 1.2, z, '#ffe9a0', 1.5, 3);
    } else if (o.kind === 'crates') {
      B.mat = 2;
      for (let k = 0; k < 5; k++) B.box(x + (r() - 0.5) * (o.w - 1.1), k < 3 ? 0 : 0.8, z + (r() - 0.5) * (o.d - 1.1), 1.05, 0.8, 1.05, '#7a5c3a', r() * 0.5, 0.25);
    } else if (o.kind === 'booth') {
      B.mat = 7; B.box(x, 0, z, 2.8, 2.6, 2.2, '#2a5a7a'); B.box(x, 2.6, z, 3.2, 0.14, 2.6, '#1c3e54');
      G.quad(x, 1.6, z - 1.11, 1.8, 0.9, '#fff0c0', Math.PI); lamp(x, 1.6, z - 2.4, '#fff0c0', 2.2, 4);
    } else if (o.kind === 'bollard') { B.mat = 7; B.cyl(x, 0, z, 0.2, 0.9, '#3a3d42'); B.ball(x, 0.92, z, 0.22, 0.14, 0.22, '#e8c040'); }
    else if (o.kind === 'barricade') {
      B.mat = 7;
      for (let k = -5; k <= 5; k++) { B.box(x + k * 1.6, 0, z, 1.5, 0.9, 0.5, k % 2 ? '#d8d8d2' : '#d83a22'); B.box(x + k * 1.6, 0.9, z, 1.1, 0.25, 0.3, k % 2 ? '#d8d8d2' : '#d83a22'); }
      for (const k of [-4, 0, 4]) { G.ball(x + k * 1.6, 1.35, z, 0.13, 0.13, 0.13, '#ffae20'); lamp(x + k * 1.6, 1.3, z + 1, '#ffae20', 1.4, 3.2); }
      B.box(x, 0.4, z - 4, 2.4, 2.6, 6, '#3a4a3a'); B.box(x, 0.9, z - 1.2, 2.3, 1.9, 0.1, '#10161c');
    }
  }

  // ---------- 对岸：一排楼影与小蛮腰 ----------
  for (let i = 0; i < 46; i++) {
    const x = -330 + i * 15 + r() * 6, h = 16 + r() * r() * 90, w = 9 + r() * 9, z = 300 + r() * 50;
    FAR.box(x, -2, z, w, h, 10, '#0c1018');
    const n = Math.floor(h / 4) * 2;
    for (let k = 0; k < n; k++) if (r() < 0.5) FAR.quad(x + (r() - 0.5) * (w - 2), 2 + r() * (h - 5), z - 5.1, 0.9 + r() * 1.6, 0.8, pick(['#7a6030', '#8a7040', '#5a6a80', '#806848']), Math.PI);
  }
  {
    const cx = 86, cz = 360, H = 190, N = 22;
    for (let k = 0; k < N; k++) for (const dir of [-1, 1]) {
      const a0 = k / N * Math.PI * 2, a1 = a0 + dir * 2.2, seg = 12;
      for (let j = 0; j < seg; j++) {
        const t0 = j / seg, t1 = (j + 1) / seg, rad = t => 13 - 8.5 * Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.9;
        const p0 = [cx + Math.cos(a0 + (a1 - a0) * t0) * rad(t0), t0 * H, cz + Math.sin(a0 + (a1 - a0) * t0) * rad(t0)];
        const p1 = [cx + Math.cos(a0 + (a1 - a0) * t1) * rad(t1), t1 * H, cz + Math.sin(a0 + (a1 - a0) * t1) * rad(t1)];
        _c.setHSL((0.95 - t0 * 0.75 + 1) % 1, 1, 0.5).multiplyScalar(0.75);
        const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, mz = (p0[2] + p1[2]) / 2, len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        _p.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize(); _q.setFromUnitVectors(_v.set(0, 1, 0), _p);
        FAR.add(UNIT.box, _m.compose(_v.set(mx, my, mz), _q, _s.set(0.45, len, 0.45)), _c);
      }
    }
    FAR.box(cx, H, cz, 0.8, 46, 0.8, '#c8d8ff');
  }

  // ---------- 地面：1 米一格，按区域上色 ----------
  const GR = new Builder(1);
  {
    const x0 = -26, x1 = 40, z0 = -72, z1 = 62, nx = x1 - x0, nz = z1 - z0;
    const colorAt = (x, z) => {
      const inStreet = z >= STREET.z0 - 12 && z <= STREET.z1 && Math.abs(x) <= 9;
      if (inStreet && Math.abs(x) < STREET.road) return ['#16181c', 5];
      if (inStreet) return ['#4a4844', 4];
      if (x > 9 && x <= ALLEY.x1 && Math.abs(z) <= 4) return ['#24262a', 5];
      if (z >= PLAZA.z0 && Math.abs(x) <= 20) return ['#3a3936', 6];
      return ['#0a0a0c', 5];
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i, z = z0 + j, [col, mat] = colorAt(x + 0.5, z + 0.5);
      _c.set(col);
      const q = [[x, z], [x, z + 1], [x + 1, z + 1], [x, z], [x + 1, z + 1], [x + 1, z]];
      for (const [px, pz] of q) { GR.p.push(px, 0, pz); GR.n.push(0, 1, 0); GR.c.push(_c.r, _c.g, _c.b); GR.m.push(mat); }
    }
    GR.mat = 5;
    for (let z = -58; z < 38; z += 6) GR.box(0, 0.004, z, 0.16, 0.004, 2.6, '#8a7a3a');
    for (const s of [-1, 1]) GR.box(s * 5, 0.004, -10, 0.2, 0.006, 100, '#5c5a54');
    for (const d of DRAINS) { GR.disk(d.x, 0.012, d.z, 0.95, '#3c3e40'); GR.disk(d.x, 0.016, d.z, 0.72, '#020302'); }
  }
  // 江面
  const RV = new Builder(2); RV.mat = 5;
  {
    _c.set('#0a1016');
    for (let j = 0; j < 30; j++) for (let i = 0; i < 40; i++) {
      const x = -400 + i * 20, z = 62 + j * 10;
      for (const [px, pz] of [[x, z], [x, z + 10], [x + 20, z + 10], [x, z], [x + 20, z + 10], [x + 20, z]]) { RV.p.push(px, -0.9, pz); RV.n.push(0, 1, 0); RV.c.push(_c.r, _c.g, _c.b); RV.m.push(5); }
    }
  }
  B.mat = 6; B.box(0, -3, 61.6, 44, 3, 0.8, '#2c2b28');

  const dry = worldMaterial(shared, {}), wet = worldMaterial(shared, { wet: true });
  const world = new THREE.Mesh(B.geometry(true), dry); world.castShadow = quality.shadow; world.receiveShadow = true;
  const ground = new THREE.Mesh(GR.geometry(true), wet); ground.receiveShadow = true;
  const river = new THREE.Mesh(RV.geometry(true), wet);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.25, 1.25, 1.25), side: THREE.DoubleSide });
  const glow = new THREE.Mesh(G.geometry(false), glowMat);
  const far = new THREE.Mesh(FAR.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.5, 1.5, 1.5), fog: false, side: THREE.DoubleSide }));
  const signs = new THREE.Mesh(S.geometry(), new THREE.MeshBasicMaterial({ map: drawAtlas(), color: new THREE.Color(1.7, 1.7, 1.7) }));
  group.add(world, ground, river, glow, far, signs);
  return { group, ground, river, tris: B.tris + G.tris + FAR.tris + GR.tris + RV.tris, lights: LIGHTS.length };
}
